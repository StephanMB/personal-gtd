import { computed, signal } from '@preact/signals';
import { DEMO_PARAM } from './demo.ts';
import { HOME, parseRoute, pathFor, type Route } from './routes.ts';

/**
 * A small router on the History API. Why not a routing library: the app
 * has one route shape, and NLDD list rows are buttons in a shadow root, so a
 * router that intercepts <a> clicks would not see them anyway.
 * nginx and the Vite dev server serve index.html for every path (SPA fallback).
 */
const url = signal(window.location.pathname + window.location.search);

window.addEventListener('popstate', () => {
  url.value = window.location.pathname + window.location.search;
});

export const route = computed<Route | null>(() => {
  const [pathname, search = ''] = url.value.split('?');
  return parseRoute(pathname, search);
});

/**
 * The demo flag is in the query string, and filters are now too, so every
 * navigation has to carry it forward. Without this, moving between lists
 * quietly dropped it and a reload put you back in your own data — which is
 * the one thing a sandbox must never do by surprise.
 */
function keepingDemo(target: string): string {
  if (!new URLSearchParams(window.location.search).has(DEMO_PARAM)) return target;
  return target.includes('?') ? `${target}&${DEMO_PARAM}` : `${target}?${DEMO_PARAM}`;
}

export function navigate(to: Route, { replace = false } = {}): void {
  const target = keepingDemo(pathFor(to));
  if (target === url.value) return;
  window.history[replace ? 'replaceState' : 'pushState'](null, '', target);
  url.value = target;
}

export function goHome(): void {
  navigate(HOME, { replace: true });
}
