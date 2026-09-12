import { computed, signal } from '@preact/signals';
import type { HintContext, HintId } from './hints.ts';
import { STATUSES, type Status } from '../domain/model.ts';
import { activeProjects, itemsInStatus, stalledProjects } from '../domain/queries.ts';
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

/**
 * Projects, and the one query that makes them worth having: which of them
 * nothing is going to move. Recomputed only when the collections change.
 */
export const projectViews = computed(() => {
  const { items, projects } = appState.value;
  const stalled = stalledProjects(projects, items);
  return {
    active: activeProjects(projects),
    stalled,
    stalledIds: new Set(stalled.map((project) => project.id)),
    byId: new Map(projects.map((project) => [project.id, project])),
  };
});

/**
 * What the screen a hint sits on knows that the data does not, and which
 * hints that screen actually shows. Both are global so the arbitration picks
 * one explanation across the whole app rather than one per surface.
 */
export const hintHere = signal<HintContext['here']>(undefined);
export const hintsOnScreen = signal<readonly HintId[]>([]);

export const hintContext = computed<HintContext>(() => ({
  items: appState.value.items,
  projects: appState.value.projects,
  settings: appState.value.settings,
  here: hintHere.value,
}));
