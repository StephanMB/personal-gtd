import type { Item } from '../domain/model.ts';
import { migrate, SCHEMA_VERSION, type StoredDoc } from './schema.ts';

export const DATA_KEY = 'gtd:data';
/** Step 0/1 storage. Read once for migration, then left untouched as a rollback copy. */
export const LEGACY_KEY = 'gtd:items';

export type LoadResult =
  | { kind: 'empty' }
  | {
      kind: 'ok';
      items: Item[];
      invalid: number;
      raw: string;
      /** Version the data was stored in; < SCHEMA_VERSION means it was migrated in memory. */
      from: number;
      source: typeof DATA_KEY | typeof LEGACY_KEY;
    }
  | { kind: 'corrupt'; raw: string; source: typeof DATA_KEY | typeof LEGACY_KEY }
  | { kind: 'newer'; version: number }
  | { kind: 'unavailable'; error: unknown };

export type WriteResult = { ok: true } | { ok: false; error: unknown };

/**
 * The seam between the app and where data lives. Today: localStorage.
 * Later: IndexedDB or a sync backend, behind the same interface
 * (which will then become async; see the step 2 guide, section 2.6).
 */
export interface Repository {
  /** Pure read: never writes, never throws. */
  load(): LoadResult;
  /** Never throws. */
  save(items: Item[]): WriteResult;
  /** Copy a raw value aside under `<prefix><timestamp>`. Returns the key, or null. */
  stash(prefix: string, raw: string): string | null;
  /** Called when ANOTHER tab changes the data. Returns an unsubscribe function. */
  subscribe(callback: () => void): () => void;
}

/** The subset of the Web Storage API we use; lets tests pass an in-memory fake. */
export interface KeyValueStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

function parse(raw: string, source: typeof DATA_KEY | typeof LEGACY_KEY): LoadResult {
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return { kind: 'corrupt', raw, source };
  }
  const result = migrate(data);
  switch (result.kind) {
    case 'ok':
      return { kind: 'ok', items: result.doc.items, invalid: result.invalid, raw, from: result.from, source };
    case 'newer':
      return { kind: 'newer', version: result.version };
    case 'corrupt':
      return { kind: 'corrupt', raw, source };
  }
}

export function createLocalStorageRepository(
  getStore: () => KeyValueStore = () => window.localStorage,
  events: Pick<Window, 'addEventListener' | 'removeEventListener'> | null = typeof window === 'undefined' ? null : window,
): Repository {
  return {
    load() {
      let raw: string | null;
      let legacy: string | null = null;
      try {
        const store = getStore();
        raw = store.getItem(DATA_KEY);
        if (raw === null) legacy = store.getItem(LEGACY_KEY);
      } catch (error) {
        return { kind: 'unavailable', error };
      }
      if (raw !== null) return parse(raw, DATA_KEY);
      if (legacy !== null) return parse(legacy, LEGACY_KEY);
      return { kind: 'empty' };
    },

    save(items) {
      const doc: StoredDoc = { schemaVersion: SCHEMA_VERSION, items };
      try {
        getStore().setItem(DATA_KEY, JSON.stringify(doc));
        return { ok: true };
      } catch (error) {
        return { ok: false, error };
      }
    },

    stash(prefix, raw) {
      const key = `${prefix}${new Date().toISOString()}`;
      try {
        getStore().setItem(key, raw);
        return key;
      } catch {
        return null;
      }
    },

    subscribe(callback) {
      if (!events) return () => {};
      const listener = (event: Event) => {
        const key = (event as StorageEvent).key;
        if (key === DATA_KEY || key === null) callback();
      };
      events.addEventListener('storage', listener);
      return () => events.removeEventListener('storage', listener);
    },
  };
}
