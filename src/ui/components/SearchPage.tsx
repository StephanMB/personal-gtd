import { useEffect, useRef } from 'preact/hooks';
import { actionsInProject } from '../../domain/queries.ts';
import { parseQuery, searchItems, searchProjects } from '../../domain/search.ts';
import { appState } from '../app-state.ts';
import { copy, language } from '../copy.ts';
import { navigate } from '../router.ts';

/**
 * One word you half remember, and the thing it belongs to.
 *
 * A page rather than an overlay, because in this app the URL is the view: a
 * search can be linked, reloaded and stepped back out of, and there is no
 * second place for "what is on screen" to be remembered. Typing REPLACES the
 * history entry rather than adding one, so Back leaves the search instead of
 * walking your keystrokes backwards.
 *
 * A hit is a way in, not a destination: following one lands on the list the
 * thing is actually on, which is where you would have acted on it anyway.
 */
export function SearchPage({ query }: { query: string }) {
  const field = useRef<HTMLElementTagNameMap['nldd-search-field']>(null);
  const { items, projects } = appState.value;

  const parsed = parseQuery(query);
  const hits = searchItems(items, parsed);
  const projectHits = searchProjects(projects, parsed);

  useEffect(() => {
    field.current?.focus();
  }, []);

  const go = (to: string) => navigate({ view: 'search', query: to }, { replace: true });

  useEffect(() => {
    const node = field.current;
    if (!node) return;
    const onInput = (event: Event) => go((event as CustomEvent<{ value?: string }>).detail?.value ?? '');
    // Enter: take the best match, which is the one you were typing towards.
    const onSearch = () => {
      if (hits.length > 0) navigate({ view: 'list', status: hits[0].status });
      else if (projectHits.length > 0) navigate({ view: 'project', id: projectHits[0].id });
    };
    node.addEventListener('input', onInput);
    node.addEventListener('search', onSearch);
    return () => {
      node.removeEventListener('input', onInput);
      node.removeEventListener('search', onSearch);
    };
  }, [hits, projectHits]);

  const found = hits.length + projectHits.length;

  return (
    <nldd-page sticky-header>
      <nldd-top-title-bar slot="header" text={copy.search.title} />
      <nldd-simple-section>
        <nldd-search-field
          // Its clear and search buttons are announced in Dutch unless the
          // translations are given, and it reads them once, when it is made.
          key={language.value}
          ref={field}
          value={query}
          accessible-label={copy.search.label}
          placeholder={copy.search.placeholder}
          no-spellcheck
          translations={{
            'components.search-field.clear-action': copy.search.clear,
            'components.search-field.search-action': copy.search.submit,
          }}
        />
        <nldd-spacer size="16" />

        {query.trim() === '' ? (
          <nldd-inline-dialog text={copy.search.prompt} />
        ) : found === 0 ? (
          <nldd-inline-dialog text={copy.search.nothing(query.trim())} />
        ) : (
          <>
            {hits.length > 0 && (
              <>
                <nldd-title size={5}>{copy.search.actions}</nldd-title>
                <nldd-list accessible-label={copy.search.actions}>
                  {hits.map((item) => (
                    <nldd-list-item key={item.id} button onClick={() => navigate({ view: 'list', status: item.status })}>
                      <nldd-text-cell
                        text={item.title}
                        supporting-text={copy.search.where(copy.lists[item.status], item.context)}
                      />
                    </nldd-list-item>
                  ))}
                </nldd-list>
              </>
            )}
            {projectHits.length > 0 && (
              <>
                <nldd-spacer size="24" />
                <nldd-title size={5}>{copy.search.projects}</nldd-title>
                <nldd-list accessible-label={copy.search.projects}>
                  {projectHits.map((project) => {
                    const open = actionsInProject(items, project.id).filter((item) => item.status !== 'done').length;
                    return (
                      <nldd-list-item key={project.id} button onClick={() => navigate({ view: 'project', id: project.id })}>
                        <nldd-text-cell text={project.title} supporting-text={copy.search.projectWhere(open)} />
                      </nldd-list-item>
                    );
                  })}
                </nldd-list>
              </>
            )}
          </>
        )}
      </nldd-simple-section>
    </nldd-page>
  );
}
