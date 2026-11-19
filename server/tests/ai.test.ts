import { describe, expect, it } from "vitest";
import { getCourse, type Card, type Course } from "@stemcharades/shared";
import { AiService, PermanentAiError, aiConfigFromEnv, type CardWriter, type WriteRequest } from "../src/ai/aiService.js";
import { CardBank, FLAGS_TO_RETIRE } from "../src/ai/cardBank.js";
import { aiCardId, toCard, type Candidate } from "../src/ai/cardRules.js";
import { dbStore } from "../src/ai/store.js";
import { testDb } from "./helpers/testDb.js";

const WAVES = "secondary-physics/Waves";
const physics = getCourse("secondary-physics")!;
const science = getCourse("primary-science")!;

const candidate = (over: Partial<Candidate> = {}): Candidate => ({
  type: "term",
  subject: "Physics",
  prompt: "Wavelength",
  latex: "",
  answers: ["wavelength"],
  forbidden: ["distance", "crest", "peak", "wave"],
  explanation: "The distance between two matching points on neighbouring waves, such as two crests.",
  ...over,
});

const library: Card[] = [
  {
    id: "phy-0001",
    type: "term",
    subject: "Physics",
    course: "secondary-physics",
    topic: "Waves",
    level: 2,
    prompt: "Frequency",
    answers: ["frequency"],
    forbidden: ["hertz", "waves", "second", "per"],
    explanation: "The number of waves passing a point each second, measured in hertz.",
    status: "reviewed",
  },
];

const accept = (c: Candidate, course: Course = physics, topic = "Waves") => {
  const r = toCard(c, course, topic);
  if (!r.ok) throw new Error(r.reason);
  return r.card;
};

describe("checking what the AI writes", () => {
  it("turns a good candidate into a generated card placed in the curriculum", () => {
    const card = accept(candidate());
    expect(card).toMatchObject({ course: "secondary-physics", topic: "Waves", level: 2, status: "generated", subject: "Physics" });
    expect(card.id).toBe(aiCardId("secondary-physics", "Waves", "Wavelength"));
    expect(card.id).toMatch(/^ai-[0-9a-f]{12}$/);
  });

  it("always accepts the prompt itself as an answer on term and formula cards, and tidies the lists", () => {
    const card = accept(candidate({ answers: ["lambda", "  Wavelength ", "wavelength"], forbidden: ["distance", "Wavelength", "crest", "crest", "peak"] }));
    expect(card.answers).toEqual(["lambda", "Wavelength"]);
    expect(card.forbidden).toEqual(["distance", "crest", "peak"]); // the answer and the repeat are dropped
  });

  it("rejects anything that breaks the library's own rules or the safety rules", () => {
    const cases: [Partial<Candidate>, RegExp][] = [
      [{ forbidden: ["one", "two"] }, /invalid/], // too few forbidden words
      [{ type: "formula" }, /formula cards need latex/],
      [{ explanation: "Too short." }, /invalid/],
      [{ prompt: "x".repeat(250) }, /invalid/],
      [{ explanation: "A wave is a shit way to move energy from one place to another." }, /blocked/],
      [{ explanation: "See https://example.com for the distance between two matching points on waves." }, /link/],
      [{ subject: "Biology" }, /subject outside/], // a single-subject course corrects it... see below
    ];
    for (const [over, reason] of cases.slice(0, -1)) {
      const r = toCard(candidate(over), physics, "Waves");
      expect(r.ok, JSON.stringify(over)).toBe(false);
      if (!r.ok) expect(r.reason).toMatch(reason);
    }
    // In a one-discipline course the subject is simply corrected; in Primary Science it must be one of three.
    expect(accept(candidate({ subject: "Biology" })).subject).toBe("Physics");
    const r = toCard(candidate({ subject: "Computing" }), science, "Forces");
    expect(r.ok).toBe(false);
    expect(toCard({ nonsense: true }, physics, "Waves")).toEqual({ ok: false, reason: "malformed" });
  });

  it("rejects a question that gives away its own answer", () => {
    const r = toCard(candidate({ type: "question", prompt: "What is the wavelength of a wave called?", answers: ["wavelength"] }), physics, "Waves");
    expect(r).toEqual({ ok: false, reason: "question gives away its answer" });
    expect(toCard(candidate({ type: "question", prompt: "What is measured from crest to crest?", answers: ["wavelength"] }), physics, "Waves").ok).toBe(true);
  });

  it("rejects a topic that is not in the course", () => {
    expect(toCard(candidate(), physics, "Knitting").ok).toBe(false);
  });
});

describe("the card bank", () => {
  it("serves the library plus accepted AI cards, and never repeats a prompt or shares an answer", () => {
    const bank = new CardBank(library);
    const fresh = accept(candidate());
    expect(bank.add([fresh]).added).toEqual([fresh]);
    expect(bank.all().map((c) => c.id)).toEqual(["phy-0001", fresh.id]);

    const again = bank.add([fresh, accept(candidate({ prompt: "Frequency of a wave", answers: ["frequency"] }))]);
    expect(again.added).toEqual([]);
    expect(again.rejected.map((r) => r.reason)).toEqual(["duplicate id", 'answer "frequency" belongs to phy-0001']);
    expect(bank.countIn(WAVES)).toBe(2);
    expect(bank.promptsIn(WAVES)).toEqual(["Frequency", "Wavelength"]);
  });

  it("retires an AI card after reports from two different people, but still finds it for a round in progress", () => {
    const bank = new CardBank(library);
    const card = accept(candidate());
    bank.add([card]);
    expect(bank.flag(card.id, "person-a")).toEqual({ retired: false });
    expect(bank.flag(card.id, "person-a")).toEqual({ retired: false }); // the same person twice counts once
    expect(bank.flag(card.id, "person-b")).toEqual({ retired: true });
    expect(FLAGS_TO_RETIRE).toBe(2);
    expect(bank.all().map((c) => c.id)).toEqual(["phy-0001"]);
    expect(bank.get(card.id)).toEqual(card);
    expect(bank.flag("phy-0001", "person-a")).toBeNull(); // library cards are corrected by people
  });

  it("counts how often AI cards are dealt and reports what changed", () => {
    const bank = new CardBank(library);
    const card = accept(candidate());
    bank.add([card]);
    bank.served(card.id);
    bank.served(card.id);
    bank.served("phy-0001");
    expect(bank.aiStats(WAVES)).toEqual({ count: 1, avgServed: 2 });
    expect(bank.drainChanged()).toEqual([{ id: card.id, served: 2, reporters: [], retired: false }]);
    expect(bank.drainChanged()).toEqual([]);
  });
});

/** A writer that returns distinct, valid candidates and records what it was asked. */
function fakeWriter() {
  const calls: WriteRequest[] = [];
  let n = 0;
  const words = ["Amplitude", "Crest", "Trough", "Refraction", "Reflection", "Echo", "Ultrasound", "Infrasound", "Pitch", "Loudness", "Medium", "Vacuum", "Spectrum", "Microwave", "Radio wave", "X-ray", "Ray diagram", "Normal line"];
  const writer: CardWriter = async (req) => {
    calls.push(req);
    return Array.from({ length: req.count }, () => {
      const w = words[n++ % words.length]!;
      return candidate({ prompt: `${w} ${Math.floor(n / words.length) || ""}`.trim(), answers: [], forbidden: ["alpha", "beta", "gamma"] });
    });
  };
  return { writer, calls };
}

describe("the AI service", () => {
  const setup = (config = {}, writer?: CardWriter) => {
    let now = Date.UTC(2026, 10, 19, 12);
    const bank = new CardBank(library);
    const fake = fakeWriter();
    const logs: string[] = [];
    const ai = new AiService(bank, writer ?? fake.writer, { now: () => now, config: { batchSize: 3, ...config }, log: (m) => logs.push(m) });
    return { ai, bank, fake, logs, advance: (ms: number) => (now += ms) };
  };

  it("writes cards for a chosen topic in the background, then stops once the topic is full enough", async () => {
    const { ai, bank, fake } = setup({ minPerTopic: 5 });
    expect(ai.warm({ levels: [], courses: [], topics: [WAVES] })).toBe(true);
    await ai.pump();
    expect(fake.calls[0]).toMatchObject({ topic: "Waves", count: 3, avoid: ["Frequency"] });
    expect(bank.countIn(WAVES)).toBe(4);
    ai.warm({ levels: [], courses: [], topics: [WAVES] });
    await ai.pump();
    expect(bank.countIn(WAVES)).toBe(7);
    expect(ai.warm({ levels: [], courses: [], topics: [WAVES] })).toBe(false); // 7 >= 5: nothing more to write
    expect(fake.calls.length).toBe(2);
  });

  it("queues only a few of the thinnest topics for a broad choice like General", async () => {
    const { ai, fake } = setup({ topicsPerWarm: 2 });
    ai.warm({ levels: [], courses: [], topics: [] });
    await ai.pump();
    await ai.pump();
    await ai.pump();
    expect(fake.calls.length).toBe(2);
  });

  it("refreshes a topic whose AI cards have each been played a couple of times", async () => {
    const { ai, bank } = setup({ minPerTopic: 1 });
    ai.warm({ levels: [], courses: [], topics: [WAVES] });
    expect(ai.needs(WAVES)).toBe(false); // the library card alone meets the minimum
    const card = accept(candidate());
    bank.add([card]);
    bank.served(card.id);
    bank.served(card.id);
    expect(ai.needs(WAVES)).toBe(true);
  });

  it("never spends more than the daily cap, and starts again the next day", async () => {
    const { ai, advance } = setup({ dailyRequests: 2, minPerTopic: 999 });
    const pick = { levels: [], courses: [], topics: [WAVES] } as const;
    for (let i = 0; i < 5; i++) {
      ai.warm(pick);
      await ai.pump();
    }
    expect(ai.status()).toMatchObject({ requestsToday: 2, dailyRequests: 2 });
    expect(ai.warm(pick)).toBe(false);
    advance(24 * 3600_000);
    expect(ai.warm(pick)).toBe(true);
  });

  it("pauses after repeated failures and switches off for good on a permanent one", async () => {
    let fail: Error = new Error("overloaded");
    const writer: CardWriter = async () => {
      throw fail;
    };
    const { ai, logs, advance } = setup({ failureLimit: 2, cooldownMs: 60_000, minPerTopic: 999 }, writer);
    const pick = { levels: [], courses: [], topics: [WAVES] } as const;
    for (let i = 0; i < 2; i++) {
      ai.warm(pick);
      await ai.pump();
    }
    expect(ai.status().pausedUntil).not.toBeNull();
    expect(ai.warm(pick)).toBe(false);
    advance(61_000);
    expect(ai.usable()).toBe(true);
    fail = new PermanentAiError("invalid API key");
    ai.warm(pick);
    await ai.pump();
    expect(ai.status()).toMatchObject({ enabled: false, disabledReason: "invalid API key" });
    expect(logs.some((l) => l.includes("switched off"))).toBe(true);
  });

  it("gives up on a call that hangs, and leaves a topic alone when it only yields repeats", async () => {
    const hang: CardWriter = () => new Promise(() => undefined);
    const { ai } = setup({ timeoutMs: 20, minPerTopic: 999 }, hang);
    ai.warm({ levels: [], courses: [], topics: [WAVES] });
    await ai.pump();
    expect(ai.status().busy).toBe(false);

    const repeats: CardWriter = async () => [candidate({ prompt: "Frequency", answers: ["frequency"] })];
    const r = setup({ minPerTopic: 999 }, repeats);
    r.ai.warm({ levels: [], courses: [], topics: [WAVES] });
    await r.ai.pump();
    expect(r.ai.needs(WAVES)).toBe(false); // barren for a while
    r.advance(61 * 60_000);
    expect(r.ai.needs(WAVES)).toBe(true);
  });

  it("reads its limits from the environment, ignoring nonsense", () => {
    expect(aiConfigFromEnv({ AI_DAILY_REQUESTS: "20", AI_MAX_CARDS_PER_TOPIC: "50" })).toEqual({ dailyRequests: 20, maxPerTopic: 50 });
    expect(aiConfigFromEnv({ AI_DAILY_REQUESTS: "lots", AI_MAX_CARDS_PER_TOPIC: "-1" })).toEqual({});
  });
});

describe("saving AI cards", () => {
  it("restores the bank after a restart, retired cards included so they are never rewritten", { timeout: 60_000 }, async () => {
    const { db, close } = await testDb();
    try {
      const store = dbStore(db);
      const bank = new CardBank(library);
      const keep = accept(candidate());
      const bad = accept(candidate({ prompt: "Amplitude", answers: [] }));
      bank.add([keep, bad]);
      await store.save([keep, bad]);
      await store.save([keep]); // saving twice is harmless
      bank.served(keep.id);
      bank.flag(bad.id, "a");
      bank.flag(bad.id, "b");
      await store.flush(bank);

      const restarted = new CardBank(library);
      expect(await store.restore(restarted)).toBe(2);
      expect(restarted.all().map((c) => c.id)).toEqual(["phy-0001", keep.id]);
      expect(restarted.clash(bad)).toBe("duplicate id");
      expect(restarted.aiStats(WAVES)).toEqual({ count: 1, avgServed: 1 });
    } finally {
      await close();
    }
  });
});
