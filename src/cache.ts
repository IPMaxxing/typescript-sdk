interface Entry<V> {
  value: V;
  expiresAt: number;
}

export class LruCache<V> {
  readonly #entries = new Map<string, Entry<V>>();
  readonly #capacity: number;
  readonly #ttl: number;

  constructor(capacity: number, ttl: number) {
    this.#capacity = capacity;
    this.#ttl = ttl;
  }

  get(key: string): V | undefined {
    const entry = this.#entries.get(key);
    if (entry === undefined) return undefined;
    this.#entries.delete(key);
    if (entry.expiresAt <= performance.now()) return undefined;
    this.#entries.set(key, entry);
    return entry.value;
  }

  set(key: string, value: V): void {
    if (this.#capacity <= 0) return;
    this.#entries.delete(key);
    this.#entries.set(key, { value, expiresAt: performance.now() + this.#ttl });
    for (const oldest of this.#entries.keys()) {
      if (this.#entries.size <= this.#capacity) break;
      this.#entries.delete(oldest);
    }
  }
}
