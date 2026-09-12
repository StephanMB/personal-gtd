import { createLocalStorageRepository, type KeyValueStore } from '../persistence/repository.ts';
import { createStore, type StoreOptions } from './store.ts';

/** In-memory Web Storage stand-in. Several stores sharing one = several tabs. */
export class MemoryStore implements KeyValueStore {
  data = new Map<string, string>();
  failWrites = false;
  getItem(key: string) {
    return this.data.get(key) ?? null;
  }
  setItem(key: string, value: string) {
    if (this.failWrites) throw new DOMException('full', 'QuotaExceededError');
    this.data.set(key, value);
  }
  removeItem(key: string) {
    this.data.delete(key);
  }
  key(index: number) {
    return [...this.data.keys()][index] ?? null;
  }
  get length() {
    return this.data.size;
  }
}

/** A booted store over `storage`, with a deterministic clock and ids. */
export function openTab(storage: MemoryStore, options: Partial<StoreOptions> = {}) {
  let t = 1_000_000;
  let n = 0;
  const store = createStore({
    repository: createLocalStorageRepository(() => storage, null),
    now: () => ++t,
    newId: () => `id-${++n}-${Math.random().toString(36).slice(2, 6)}`,
    ...options,
  });
  store.boot();
  return store;
}
