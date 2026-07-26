/** Anything a `Registry` can hold: an entry that knows its own id. */
export interface Identified {
  id: string;
}

/**
 * An id-keyed collection of pluggable entries, preserving registration
 * order. Backs both the project-type registry (`acli create`'s scaffold
 * strategies) and the import-source registry (`acli import`'s sources) —
 * adding a new project type or import source is one `register()` call
 * rather than another branch in a shared if-chain.
 *
 * Registration order is meaningful: `find()` returns the *first* matching
 * entry, which is what lets a registry declare a catch-all fallback by
 * registering it last.
 */
export class Registry<T extends Identified> {
  #entries: T[] = [];
  #label: string;

  /** @param label What this registry holds, used in error messages (e.g. "project type", "import source"). */
  constructor(label: string) {
    this.#label = label;
  }

  register(entry: T): void {
    if (this.#entries.some((existing) => existing.id === entry.id)) {
      const article = /^[aeiou]/i.test(this.#label) ? "An" : "A";
      throw new Error(`${article} ${this.#label} with id "${entry.id}" is already registered.`);
    }
    this.#entries.push(entry);
  }

  /** Looks an entry up by exact id, throwing with the available ids when there is no match. */
  get(id: string): T {
    const entry = this.#entries.find((candidate) => candidate.id === id);
    if (!entry) throw new Error(`Unknown ${this.#label} "${id}". Available: ${this.#entries.map((candidate) => candidate.id).join(", ")}.`);
    return entry;
  }

  /** The first entry satisfying `predicate`, in registration order, or undefined. */
  find(predicate: (entry: T) => boolean): T | undefined {
    return this.#entries.find(predicate);
  }

  list(): T[] {
    return [...this.#entries];
  }
}
