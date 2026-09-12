import type { Item, Project } from '../domain/model.ts';
import { migrate, SCHEMA_VERSION, type DocContents, type StoredDoc } from './schema.ts';

export const DATA_KEY = 'gtd:data';
/** Step 0/1 storage. Read once for migration, then left untouched as a rollback copy. */
export const LEGACY_KEY = 'gtd:items';

/** Prefixes under which data that could not be read is set aside. */
export const QUARANTINE_PREFIX = 'gtd:quarantine:';
export const PRE_MIGRATION_PREFIX = 'gtd:pre-migration:';

export type LoadResult =
  | { kind: 'empty' }
  | {
      kind: 'ok';
      items: Item[];
      projects: Project[];
      invalid: number;
      raw: string;
      /** Version the data was stored in; < SCHEMA_VERSION means it was migrated in memory. */
      from: number;
      source: typeof DATA_KEY | typeof LEGACY_KEY;
    }
  | { kind: 'corrupt'; raw: string; source: typeof DATA_KEY | typeof LEGACY_KEY }
  | { kind: 'newer'; version: number }
  | { kind: 'unavailable'; error: unknown };

/** `raw` is what was written: the caller can compare it with a later read. */
export type WriteResult = { ok: true; raw: string } | { ok: false; error: unknown };

/** One copy of data that could not be read, kept so nothing is ever lost. */
export interface StashedCopy {
  key: string;
  /** When it was set aside, read from the key; null if the key carries no timestamp. */
  savedAt: Date | null;
  /** Characters, so the UI can say how much is in there. */
  size: number;
  reason: 'unreadable' | 'pre-migration';
}

/**
 * The seam between the app and where data lives. Today: localStorage.
 * Later: IndexedDB or a sync backend, behind the same interface
 * (which will then become async; see the step 2 guide, section 2.6).
 */
export interface Repository {
  /** Pure read: never writes, never throws. */
  load(): LoadResult;
  /** Writes the whole document. Never throws. */
  save(contents: DocContents): WriteResult;
  /** Copy a raw value aside under `<prefix><timestamp>`. Returns the key, or null. */
  stash(prefix: string, raw: string): string | null;
  /** Called when ANOTHER tab changes the data. Returns an unsubscribe function. */
  subscribe(callback: () => void): () => void;
  /** Every copy set aside so far, newest first. Never throws. */
  listStashed(): StashedCopy[];
  readStashed(key: string): string | null;
  /** Put a copy back under an exact key, so deleting one can be undone. */
  writeStashed(key: string, raw: string): boolean;
  deleteStashed(key: string): void;
}

/** The subset of the Web Storage API we use; lets tests pass an in-memory fake. */
export interface KeyValueStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
  key(index: number): string | null;
  readonly length: number;
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
      return {
        kind: 'ok',
        items: result.doc.items,
        projects: result.doc.projects,
        invalid: result.invalid,
        raw,
        from: result.from,
        source,
      };
    case 'newer':
      return { kind: 'newer', version: result.version };
    case 'corrupt':
      return { kind: 'corrupt', raw, source };
  }
}

/** The ISO timestamp a stash key ends with, e.g. gtd:quarantine:2026-09-12T08:16:57.961Z. */
function savedAtFrom(key: string): Date | null {
  const match = key.match(/(\d{4}-\d{2}-\d{2}T[\d:.]+Z)$/);
  if (!match) return null;
  const date = new Date(match[1]);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function createLocalStorageRepository(
  getStore: () => KeyValueStore = () => window.localStorage,
  events: Pick<Window, 'addEventListener' | 'removeEventListener'> | null = typeof window === 'undefined' ? null : window,
): Repository {
  function writeStashed(key: string, raw: string): boolean {
    try {
      getStore().setItem(key, raw);
      return true;
    } catch {
      return false;
    }
  }

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

    save(contents) {
      const doc: StoredDoc = { schemaVersion: SCHEMA_VERSION, ...contents };
      const raw = JSON.stringify(doc);
      try {
        getStore().setItem(DATA_KEY, raw);
        return { ok: true, raw };
      } catch (error) {
        return { ok: false, error };
      }
    },

    stash(prefix, raw) {
      const key = `${prefix}${new Date().toISOString()}`;
      return writeStashed(key, raw) ? key : null;
    },

    writeStashed,

    listStashed() {
      const copies: StashedCopy[] = [];
      try {
        const store = getStore();
        for (let i = 0; i < store.length; i++) {
          const key = store.key(i);
          if (key === null) continue;
          const unreadable = key.startsWith(QUARANTINE_PREFIX);
          if (!unreadable && !key.startsWith(PRE_MIGRATION_PREFIX)) continue;
          copies.push({
            key,
            savedAt: savedAtFrom(key),
            size: store.getItem(key)?.length ?? 0,
            reason: unreadable ? 'unreadable' : 'pre-migration',
          });
        }
      } catch {
        return [];
      }
      return copies.sort((a, b) => (b.savedAt?.getTime() ?? 0) - (a.savedAt?.getTime() ?? 0));
    },

    readStashed(key) {
      try {
        return getStore().getItem(key);
      } catch {
        return null;
      }
    },

    deleteStashed(key) {
      try {
        getStore().removeItem(key);
      } catch {
        // The copy stays, which is the safe direction.
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
