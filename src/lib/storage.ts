import { isItem, type Item } from './gtd';

export const STORAGE_KEY = 'gtd:items';
const QUARANTINE_PREFIX = 'gtd:quarantine:';

export type ReadResult =
  | { kind: 'empty' }
  | { kind: 'ok'; items: Item[]; invalid: number; raw: string }
  | { kind: 'corrupt'; raw: string }
  | { kind: 'unavailable'; error: unknown };

/** Pure read: never writes, never throws. */
export function readItems(): ReadResult {
  let raw: string | null;
  try {
    raw = localStorage.getItem(STORAGE_KEY);
  } catch (error) {
    return { kind: 'unavailable', error };
  }
  if (raw === null) return { kind: 'empty' };

  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return { kind: 'corrupt', raw };
  }
  if (!Array.isArray(data)) return { kind: 'corrupt', raw };

  const items = data.filter(isItem);
  return { kind: 'ok', items, invalid: data.length - items.length, raw };
}

export type WriteResult = { ok: true } | { ok: false; error: unknown };

/** Never throws; the caller decides how to tell the user. */
export function writeItems(items: Item[]): WriteResult {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
    return { ok: true };
  } catch (error) {
    return { ok: false, error };
  }
}

/** Copy unreadable data aside before anything can overwrite it. Returns the key, or null if that failed too. */
export function quarantine(raw: string): string | null {
  const key = `${QUARANTINE_PREFIX}${new Date().toISOString()}`;
  try {
    localStorage.setItem(key, raw);
    return key;
  } catch {
    return null;
  }
}

/** Fires when ANOTHER tab changes our key (or clears storage). */
export function onExternalChange(callback: () => void): void {
  window.addEventListener('storage', (event) => {
    if (event.key === STORAGE_KEY || event.key === null) callback();
  });
}

/** Ask the browser not to evict our storage under disk pressure. Best effort. */
export async function requestPersistence(): Promise<boolean> {
  try {
    // navigator.storage only exists in secure contexts.
    if (!navigator.storage?.persist) return false;
    if (await navigator.storage.persisted()) return true;
    return await navigator.storage.persist();
  } catch {
    return false;
  }
}

const LAST_EXPORT_KEY = 'gtd:lastExportAt';

export function readLastExport(): number | null {
  try {
    const value = Number(localStorage.getItem(LAST_EXPORT_KEY));
    return Number.isFinite(value) && value > 0 ? value : null;
  } catch {
    return null;
  }
}

export function writeLastExport(timestamp: number): void {
  try {
    localStorage.setItem(LAST_EXPORT_KEY, String(timestamp));
  } catch {
    // Not critical: the export itself already succeeded.
  }
}
