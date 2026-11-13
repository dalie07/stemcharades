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
    join: new RateLimiter(10, 10 / 60, now), // 10 attempts, then 10 a minute
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
