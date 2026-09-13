import { STATUSES, type Status } from '../domain/model.ts';

/**
 * The URL scheme, as pure functions (tested without a browser).
 *
 * A filter is part of the view, not state beside it, so it lives in the URL:
 * a filtered list can be bookmarked, survives a reload, and is the same thing
 * in a second tab. It is also what makes a saved view a name plus a URL rather
 * than a second filtering mechanism, if that is ever missed.
 */
export type Route =
  | { view: 'list'; status: Status; context?: string }
  | { view: 'clarify' }
  | { view: 'review' }
  | { view: 'settings' }
  | { view: 'search'; query: string }
  | { view: 'projects' }
  | { view: 'project'; id: string };

export const HOME: Route = { view: 'list', status: 'inbox' };

/** The query parameters this app gives meaning to. */
export const CONTEXT_PARAM = 'context';
export const QUERY_PARAM = 'q';

function withParams(path: string, params: Record<string, string | undefined>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== '') search.set(key, value);
  }
  const encoded = search.toString();
  return encoded === '' ? path : `${path}?${encoded}`;
}

export function pathFor(route: Route): string {
  switch (route.view) {
    case 'clarify':
      return '/clarify';
    case 'review':
      return '/review';
    case 'settings':
      return '/settings';
    case 'search':
      return withParams('/search', { [QUERY_PARAM]: route.query });
    case 'projects':
      return '/projects';
    case 'project':
      return `/projects/${route.id}`;
    case 'list':
      return withParams(`/${route.status}`, { [CONTEXT_PARAM]: route.context });
  }
}

/** null means "no such page": the app redirects home. */
export function parseRoute(pathname: string, search = ''): Route | null {
  const segments = pathname.split('/').filter(Boolean);
  const params = new URLSearchParams(search);
  if (segments.length === 0) return HOME;
  if (segments.length === 1) {
    if (segments[0] === 'clarify') return { view: 'clarify' };
    if (segments[0] === 'review') return { view: 'review' };
    if (segments[0] === 'settings') return { view: 'settings' };
    if (segments[0] === 'search') return { view: 'search', query: params.get(QUERY_PARAM) ?? '' };
    if (segments[0] === 'projects') return { view: 'projects' };
    if ((STATUSES as readonly string[]).includes(segments[0])) {
      const status = segments[0] as Status;
      // An empty or absent filter is the unfiltered list, not a filter that
      // matches nothing: a stray "?context=" should never hide everything.
      const context = params.get(CONTEXT_PARAM);
      return context === null || context === '' ? { view: 'list', status } : { view: 'list', status, context };
    }
  }
  if (segments.length === 2 && segments[0] === 'projects') return { view: 'project', id: segments[1] };
  return null;
}
