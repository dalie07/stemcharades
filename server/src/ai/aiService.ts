import { getCourse, selectedTopicKeys, splitTopicKey, type Card, type Course, type Selection } from "@stemcharades/shared";
import type { CardBank } from "./cardBank.js";
import { toCard } from "./cardRules.js";

export interface WriteRequest {
  course: Course;
  topic: string;
  count: number;
  /** Prompts already in the game for this topic, so the writer does not repeat them. */
  avoid: readonly string[];
}
/** Whatever writes candidate cards: the Claude API in production, a stub in tests. */
export type CardWriter = (request: WriteRequest) => Promise<unknown[]>;

/** A failure that retrying will not fix, such as a rejected API key. The AI switches itself off. */
export class PermanentAiError extends Error {}

export interface AiConfig {
  /** Hard ceiling on API calls per UTC day: the cost cap. */
  dailyRequests: number;
  /** Cards asked for per call. */
  batchSize: number;
  /** Below this many playable cards a topic is topped up whenever it is chosen. */
  minPerTopic: number;
  /** A topic stops growing once the AI has written this many live cards for it. */
  maxPerTopic: number;
  /** Once a topic's AI cards have each been dealt this often on average, it gets fresh ones. */
  refreshAfterServes: number;
  /** Consecutive failures that open the circuit breaker, and how long it stays open. */
  failureLimit: number;
  cooldownMs: number;
  /** A call that takes longer than this is abandoned. */
  timeoutMs: number;
  /** A topic that yields no new cards (everything was a repeat) is left alone this long. */
  barrenMs: number;
  /** At most this many topics are queued from one broad choice such as General. */
  topicsPerWarm: number;
}

export const DEFAULT_AI_CONFIG: AiConfig = {
  dailyRequests: 50,
  batchSize: 6,
  minPerTopic: 12,
  maxPerTopic: 200,
  refreshAfterServes: 2,
  failureLimit: 3,
  cooldownMs: 10 * 60_000,
  timeoutMs: 120_000,
  barrenMs: 60 * 60_000,
  topicsPerWarm: 4,
};

export interface AiStatus {
  enabled: boolean;
  disabledReason: string | null;
  requestsToday: number;
  dailyRequests: number;
  queued: number;
  busy: boolean;
  pausedUntil: number | null;
  written: number;
}

/**
 * Keeps the AI writing cards for whatever people are choosing to play, without ever standing between a
 * player and a game:
 *
 * - Games only ever draw from cards that already exist. Writing happens in the background, one call at a
 *   time, so a slow or failing API never delays a round.
 * - Every candidate passes `toCard` (the library's own checks plus safety checks) and the bank's clash
 *   check before it can be dealt.
 * - Spend is capped per day; repeated failures pause it; a rejected key switches it off.
 */
export class AiService {
  private config: AiConfig;
  private now: () => number;
  private queue: string[] = [];
  private busy = false;
  private inFlight: string | null = null;
  private day = "";
  private requestsToday = 0;
  private failures = 0;
  private pausedUntil = 0;
  private disabledReason: string | null = null;
  private barrenUntil = new Map<string, number>();
  private written = 0;

  constructor(
    private bank: CardBank,
    private writer: CardWriter,
    private opts: {
      now?: () => number;
      config?: Partial<AiConfig>;
      /** Called with every batch of accepted cards, e.g. to save them. */
      onAdded?: (cards: Card[]) => void;
      log?: (message: string) => void;
    } = {},
  ) {
    this.config = { ...DEFAULT_AI_CONFIG, ...opts.config };
    this.now = opts.now ?? Date.now;
  }

  private log(message: string) {
    (this.opts.log ?? console.log)(`[ai] ${message}`);
  }

  private rollDay() {
    const today = new Date(this.now()).toISOString().slice(0, 10);
    if (today !== this.day) {
      this.day = today;
      this.requestsToday = 0;
    }
  }

  /** Whether a call could be made right now. */
  usable(): boolean {
    this.rollDay();
    return !this.disabledReason && this.now() >= this.pausedUntil && this.requestsToday < this.config.dailyRequests;
  }

  /** Whether a topic should get more cards. */
  needs(key: string): boolean {
    if ((this.barrenUntil.get(key) ?? 0) > this.now()) return false;
    const { count, avgServed } = this.bank.aiStats(key);
    if (count >= this.config.maxPerTopic) return false;
    return this.bank.countIn(key) < this.config.minPerTopic || (count > 0 && avgServed >= this.config.refreshAfterServes);
  }

  /**
   * Someone chose (or is about to play) this selection: queue its thinnest topics, ahead of older requests.
   * True when cards for it are on their way, so an empty choice can say "being written" instead of "none".
   */
  warm(selection: Selection): boolean {
    if (!this.usable()) return false;
    const wanted = selectedTopicKeys(selection)
      .filter((key) => this.needs(key))
      .sort((a, b) => this.bank.countIn(a) - this.bank.countIn(b))
      .slice(0, this.config.topicsPerWarm);
    this.queue = [...wanted, ...this.queue.filter((key) => !wanted.includes(key))];
    return wanted.length > 0 || (this.busy && this.inFlight !== null && selectedTopicKeys(selection).includes(this.inFlight));
  }

  /** Write one queued topic, if allowed. Call it on a timer; it never runs two calls at once and never throws. */
  async pump(): Promise<void> {
    if (this.busy || !this.queue.length || !this.usable()) return;
    const key = this.queue.shift()!;
    if (!this.needs(key)) return;
    const { courseId, topic } = splitTopicKey(key);
    const course = getCourse(courseId);
    if (!course) return;

    this.busy = true;
    this.inFlight = key;
    this.requestsToday++; // counted before the call, so a hanging call still uses up budget
    let timer: NodeJS.Timeout | undefined;
    try {
      const raw = await Promise.race([
        this.writer({ course, topic, count: this.config.batchSize, avoid: this.bank.promptsIn(key).slice(-150) }),
        new Promise<never>((_, reject) => {
          timer = setTimeout(() => reject(new Error("timed out")), this.config.timeoutMs);
        }),
      ]);
      this.failures = 0;
      const checked = raw.map((r) => toCard(r, course, topic));
      const good = checked.flatMap((c) => (c.ok ? [c.card] : []));
      const { added, rejected } = this.bank.add(good);
      this.written += added.length;
      const dropped = checked.length - good.length + rejected.length;
      this.log(`${key}: ${added.length} added, ${dropped} rejected`);
      if (added.length === 0) this.barrenUntil.set(key, this.now() + this.config.barrenMs);
      if (added.length) this.opts.onAdded?.(added);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (err instanceof PermanentAiError) {
        this.disabledReason = message;
        this.log(`switched off: ${message}`);
      } else if (++this.failures >= this.config.failureLimit) {
        this.failures = 0;
        this.pausedUntil = this.now() + this.config.cooldownMs;
        this.log(`paused for ${Math.round(this.config.cooldownMs / 60_000)} min after repeated failures (last: ${message})`);
      } else {
        this.log(`${key}: failed (${message})`);
      }
    } finally {
      clearTimeout(timer);
      this.busy = false;
      this.inFlight = null;
    }
  }

  status(): AiStatus {
    this.rollDay();
    return {
      enabled: !this.disabledReason,
      disabledReason: this.disabledReason,
      requestsToday: this.requestsToday,
      dailyRequests: this.config.dailyRequests,
      queued: this.queue.length,
      busy: this.busy,
      pausedUntil: this.pausedUntil > this.now() ? this.pausedUntil : null,
      written: this.written,
    };
  }
}

/** Read the limits from the environment; anything missing or nonsensical keeps its default. */
export function aiConfigFromEnv(env: NodeJS.ProcessEnv): Partial<AiConfig> {
  const num = (name: string) => {
    const n = Number(env[name]);
    return Number.isFinite(n) && n > 0 ? n : undefined;
  };
  const out: Partial<AiConfig> = {};
  const daily = num("AI_DAILY_REQUESTS");
  const perTopic = num("AI_MAX_CARDS_PER_TOPIC");
  if (daily) out.dailyRequests = Math.floor(daily);
  if (perTopic) out.maxPerTopic = Math.floor(perTopic);
  return out;
}
