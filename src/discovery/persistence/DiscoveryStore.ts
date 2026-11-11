export const STORAGE_KEY = 'abyss.discovered.v1';

/** The slice of the Web Storage API the store needs (so tests can pass a fake). */
export type KeyValueStorage = Pick<Storage, 'getItem' | 'setItem'>;

type Listener = (id: string) => void;

/** `localStorage` when the browser allows it; access itself throws in some privacy modes. */
function defaultStorage(): KeyValueStorage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

/**
 * Which species the viewer has discovered. Persisted to storage when it is available; every
 * read and write is guarded, so blocked, full or corrupt storage only costs persistence
 * (discoveries still count for the session) and never breaks the dive.
 */
export class DiscoveryStore {
  private readonly ids = new Set<string>();
  private readonly listeners = new Set<Listener>();

  constructor(private readonly storage: KeyValueStorage | null = defaultStorage()) {
    try {
      const raw = this.storage?.getItem(STORAGE_KEY);
      const parsed: unknown = raw ? JSON.parse(raw) : [];
      if (Array.isArray(parsed)) for (const id of parsed) if (typeof id === 'string') this.ids.add(id);
    } catch {
      // Unreadable or corrupt: start empty.
    }
  }

  has(id: string): boolean {
    return this.ids.has(id);
  }

  get size(): number {
    return this.ids.size;
  }

  /** Marks a species discovered. Returns true only the first time. */
  add(id: string): boolean {
    if (this.ids.has(id)) return false;
    this.ids.add(id);
    try {
      this.storage?.setItem(STORAGE_KEY, JSON.stringify([...this.ids]));
    } catch {
      // Quota or privacy mode: keep the in-memory state.
    }
    for (const l of this.listeners) l(id);
    return true;
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
}
