import { Injectable } from '@nestjs/common';

const WINDOW_MS = 60 * 1000;
const MAX_FAILS = 5; // per IP per minute
// X-Forwarded-For is whatever the caller sends, so also cap failed tries across all IPs.
const MAX_FAILS_GLOBAL = 30;
const MAX_KEYS = 5000;

/** In-memory failed-login counter: 5 wrong tries per IP per minute, then 429. */
@Injectable()
export class LoginLimit {
  private readonly fails = new Map<string, number[]>();
  private globalFails: number[] = [];

  limited(ip: string): boolean {
    const now = Date.now();
    this.globalFails = this.globalFails.filter((t) => now - t < WINDOW_MS);
    const recent = (this.fails.get(ip) ?? []).filter((t) => now - t < WINDOW_MS);
    return this.globalFails.length >= MAX_FAILS_GLOBAL || recent.length >= MAX_FAILS;
  }

  recordFail(ip: string) {
    const now = Date.now();
    this.globalFails.push(now);
    const recent = (this.fails.get(ip) ?? []).filter((t) => now - t < WINDOW_MS);
    // Drop IPs whose tries are all outside the window, then cap the map (Map keeps insertion order: oldest first).
    for (const [k, ts] of this.fails) if (now - ts[ts.length - 1] >= WINDOW_MS) this.fails.delete(k);
    this.fails.delete(ip);
    this.fails.set(ip, [...recent, now]);
    for (const k of this.fails.keys()) {
      if (this.fails.size <= MAX_KEYS) break;
      this.fails.delete(k);
    }
  }
}
