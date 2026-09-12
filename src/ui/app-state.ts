import { computed, signal } from '@preact/signals';
import { STATUSES, type Status } from '../domain/model.ts';
import { itemsInStatus } from '../domain/queries.ts';
import { createLocalStorageRepository } from '../persistence/repository.ts';
import { createStore } from '../store/store.ts';

/**
 * Wiring: the one store instance, booted before the first render, and a
 * signal bridge. This file is the ONLY place the UI touches the store's
 * subscribe(); components read signals, and Preact re-renders exactly the
 * components that read a signal that changed.
 */
/** One repository, shared by the store and by the recovered-data surface. */
export const repository = createLocalStorageRepository();

export const store = createStore({ repository });
store.boot();

export const appState = signal(store.getState());
store.subscribe((state) => {
  appState.value = state;
});

/** Items per list, recomputed only when the item array changes. */
export const lists = computed(() => {
  const items = [...appState.value.items];
  return Object.fromEntries(STATUSES.map((status) => [status, itemsInStatus(items, status)])) as Record<Status, ReturnType<typeof itemsInStatus>>;
});

// Closing the tab with changes that exist only in memory asks first.
window.addEventListener('beforeunload', (event) => {
  if (appState.value.unsaved) event.preventDefault();
});
