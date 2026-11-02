/** Small least-recently-used cache built on Map insertion order. */
export class LruCache<K, V> {
  readonly #capacity: number;
  readonly #entries = new Map<K, V>();

  constructor(capacity: number) {
    this.#capacity = capacity;
  }

  get(key: K): V | undefined {
    const value = this.#entries.get(key);
    if (value !== undefined) {
      this.#entries.delete(key);
      this.#entries.set(key, value);
    }
    return value;
  }

  set(key: K, value: V): void {
    this.#entries.delete(key);
    this.#entries.set(key, value);
    if (this.#entries.size > this.#capacity) {
      for (const oldest of this.#entries.keys()) {
        this.#entries.delete(oldest);
        break;
      }
    }
  }
}
