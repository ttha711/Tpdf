import type { Tile } from "./tiles.js";

type Entry = { key: string; url: string; priority: number };
type Job = { controller: AbortController; entry: Entry };
export class TileScheduler {
  private cache = new Map<string, string>();
  private failures = new Map<string, number>();
  private wanted = new Map<string, Entry>();
  private pending = new Map<string, Job>();
  private listeners = new Set<() => void>();
  private stopped = false;
  readonly limit = 8;
  start() { this.stopped = false; }
  readonly cacheLimit = 256;
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  };
  get active() { return this.pending.size; }
  get cacheSize() { return this.cache.size; }
  get(key: string): string | undefined {
    const url = this.cache.get(key);
    if (url) { this.cache.delete(key); this.cache.set(key, url); }
    return url;
  }
  private notify() { this.listeners.forEach((listener) => listener()); }
  setWanted(tiles: Tile[]) {
    if (this.stopped) return;
    this.wanted = new Map(tiles.map((t) => [t.key, { key: t.key, url: t.url, priority: t.priority }]));
    for (const [key, job] of this.pending) {
      if (!this.wanted.has(key)) { this.pending.delete(key); job.controller.abort(); }
    }
    this.pump();
  }
  private pump() {
    if (this.stopped) return;
    const queue = Array.from(this.wanted.values())
      .filter((t) => !this.cache.has(t.key) && !this.pending.has(t.key) &&
        (!this.failures.has(t.key) || Date.now() - this.failures.get(t.key)! > 3000))
      .sort((a, b) => a.priority - b.priority);
    while (this.pending.size < this.limit && queue.length) {
      const entry = queue.shift()!;
      const controller = new AbortController();
      const job = { controller, entry };
      this.pending.set(entry.key, job);
      void fetch(entry.url, { signal: controller.signal }).then((response) => {
        if (!response.ok) throw Error("Tile HTTP " + response.status);
        return response.blob();
      }).then((blob) => {
        if (this.stopped || controller.signal.aborted || !this.wanted.has(entry.key)) return;
        const url = URL.createObjectURL(blob);
        const old = this.cache.get(entry.key);
        if (old) URL.revokeObjectURL(old);
        this.cache.delete(entry.key); this.cache.set(entry.key, url);
        while (this.cache.size > this.cacheLimit) {
          const oldKey = Array.from(this.cache.keys()).find((key) => !this.wanted.has(key));
          if (!oldKey) break;
          URL.revokeObjectURL(this.cache.get(oldKey)!); this.cache.delete(oldKey);
        }
        this.failures.delete(entry.key);
        this.notify();
      }).catch((error: unknown) => {
        if (!controller.signal.aborted) {
          this.failures.set(entry.key, Date.now());
          console.warn("PDF tile request failed", error);
        }
      }).finally(() => {
        if (this.pending.get(entry.key) === job) this.pending.delete(entry.key);
        if (!this.stopped) { this.notify(); this.pump(); }
      });
    }
    this.notify();
  }
  dispose() {
    this.stopped = true;
    for (const job of this.pending.values()) job.controller.abort();
    this.pending.clear(); this.wanted.clear(); this.listeners.clear(); this.failures.clear();
    for (const url of this.cache.values()) URL.revokeObjectURL(url);
    this.cache.clear();
  }
}
