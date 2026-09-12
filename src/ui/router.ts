import { computed, signal } from '@preact/signals';
import { HOME, parseRoute, pathFor, type Route } from './routes.ts';

/**
 * A 20-line router on the History API. Why not a routing library: the app
 * has one route shape, and NLDD list rows are buttons in a shadow root, so a
 * router that intercepts <a> clicks would not see them anyway.
 * nginx and the Vite dev server serve index.html for every path (SPA fallback).
 */
const path = signal(window.location.pathname);

window.addEventListener('popstate', () => {
  path.value = window.location.pathname;
});

export const route = computed<Route | null>(() => parseRoute(path.value));

export function navigate(to: Route, { replace = false } = {}): void {
  const target = pathFor(to);
  if (target === path.value) return;
  window.history[replace ? 'replaceState' : 'pushState'](null, '', target);
  path.value = target;
}

export function goHome(): void {
  navigate(HOME, { replace: true });
}
