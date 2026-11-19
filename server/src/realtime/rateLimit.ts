/** A token bucket per key: `capacity` events in a burst, refilled at `refillPerSec`. */
export class RateLimiter {
  private buckets = new Map<string, { tokens: number; at: number }>();

  constructor(
    private capacity: number,
    private refillPerSec: number,
    private now: () => number = Date.now,
  ) {}

  /** True if the event is allowed (and consumes a token). */
  take(key: string): boolean {
    const t = this.now();
    const b = this.buckets.get(key) ?? { tokens: this.capacity, at: t };
    b.tokens = Math.min(this.capacity, b.tokens + ((t - b.at) / 1000) * this.refillPerSec);
    b.at = t;
    const allowed = b.tokens >= 1;
    if (allowed) b.tokens -= 1;
    this.buckets.set(key, b);
    return allowed;
  }

  forget(key: string): void {
    this.buckets.delete(key);
  }

  /** Drop buckets that have fully refilled, so idle keys do not accumulate in memory. */
  sweep(): void {
    const t = this.now();
    for (const [key, b] of this.buckets) {
      if (b.tokens + ((t - b.at) / 1000) * this.refillPerSec >= this.capacity) this.buckets.delete(key);
    }
  }

  get size(): number {
    return this.buckets.size;
  }
}

export interface Limits {
  /** Per connection. */
  guess: RateLimiter;
  clue: RateLimiter;
  /** Any other socket event, per connection. */
  event: RateLimiter;
  /** Per IP address. */
  join: RateLimiter;
  create: RateLimiter;
  probe: RateLimiter;
}

export function createLimits(now: () => number = Date.now): Limits {
  return {
    guess: new RateLimiter(5, 3, now), // a burst of 5, then 3 a second
    clue: new RateLimiter(5, 3, now),
    event: new RateLimiter(30, 15, now),
    // A whole class on school Wi-Fi shares one public address and joins at once, so the burst is a classroom.
    join: new RateLimiter(40, 20 / 60, now),
    create: new RateLimiter(5, 5 / 60, now), // 5 rooms, then 5 a minute
    probe: new RateLimiter(30, 30 / 60, now), // room-code lookups
  };
}

export function sweepLimits(l: Limits): void {
  for (const limiter of Object.values(l)) limiter.sweep();
}

/**
 * The caller's IP. Behind Render's proxy the right-most X-Forwarded-For entry is the one the proxy added,
 * which a client cannot forge. Only trusted when TRUST_PROXY=1; otherwise use the socket's own address.
 */
export function clientIp(headers: Record<string, string | string[] | undefined>, address: string, trustProxy: boolean): string {
  if (trustProxy) {
    const raw = headers["x-forwarded-for"];
    const value = Array.isArray(raw) ? raw.join(",") : raw;
    const last = value?.split(",").pop()?.trim();
    if (last) return last;
  }
  return address;
}

/**
 * The key per-address limits are counted under. One IPv6 subscriber is usually handed a whole /64, so
 * counting single IPv6 addresses would let one person rotate through billions of them: the /64 is the unit.
 * IPv4 (including IPv4-mapped IPv6 such as ::ffff:1.2.3.4) is used as it is.
 */
export function limitKey(ip: string | undefined): string {
  if (!ip) return "unknown";
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/i.exec(ip);
  if (mapped) return mapped[1]!;
  if (!ip.includes(":")) return ip;
  const [head = "", tail = ""] = ip.split("%")[0]!.toLowerCase().split("::");
  const left = head ? head.split(":") : [];
  const right = tail ? tail.split(":") : [];
  const groups = ip.includes("::") ? [...left, ...Array<string>(Math.max(0, 8 - left.length - right.length)).fill("0"), ...right] : left;
  return `${groups.slice(0, 4).map((g) => g.replace(/^0+(?=.)/, "")).join(":")}::/64`;
}
