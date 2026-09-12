import { STATUSES, type Status } from '../../domain/model.ts';
import { lists, projectViews } from '../app-state.ts';
import { copy } from '../copy.ts';
import { LIST_KEYS, PROJECTS_KEY } from '../keys.ts';
import { navigate } from '../router.ts';
import { BackupPanel } from './BackupPanel.tsx';
import { RecoveredPanel } from './RecoveredPanel.tsx';

const ICONS: Record<Status, string> = {
  inbox: 'inbox',
  next: 'arrow-right',
  waiting: 'clock',
  someday: 'lightbulb',
  done: 'check-mark-circle',
};

export function Sidebar({ current }: { current: Status | 'projects' | null }) {
  const byStatus = lists.value;
  const { active, stalled } = projectViews.value;
  return (
    <nldd-page sticky-header>
      {/* A visual title, not a heading: nldd-top-title-bar renders an h1 and
          the page title in the main pane is the h1 of this page. */}
      <nldd-title slot="header" size={4}>
        {copy.appName}
      </nldd-title>
      <nldd-simple-section>
        {/* The skip link wraps the navigation; activating it jumps past it.
            nldd-list forwards accessible-label only for type="list"; a
            navigation list takes aria-label on the element itself, or it keeps
            the component's Dutch default. */}
        <nldd-skip-link text={copy.skipToList}>
          <nldd-list type="navigation" aria-label={copy.navLabel}>
            {STATUSES.map((status) => {
              const count = byStatus[status].length;
              return (
                <nldd-list-item
                  key={status}
                  button
                  selected={status === current || undefined}
                  onClick={() => navigate({ view: 'list', status })}
                >
                  <nldd-icon-cell size="20" icon={ICONS[status]} />
                  <nldd-spacer-cell size="8" />
                  <nldd-text-cell text={copy.lists[status]} />
                  {status !== 'done' && count > 0 && (
                    <nldd-cell>
                      <nldd-badge size="sm" color={status === 'inbox' ? 'accent' : 'neutral'} number={count} />
                    </nldd-cell>
                  )}
                  <nldd-spacer-cell size="8" />
                  <nldd-cell>
                    <nldd-keyboard-shortcut size="sm" variant="simple" keys={LIST_KEYS[status]} />
                  </nldd-cell>
                </nldd-list-item>
              );
            })}
            {/* One row however many projects there are. The badge turns red
                with the count of projects nothing is moving, which is the
                thing you want to be told rather than have to go and ask. */}
            <nldd-list-item
              button
              selected={current === 'projects' || undefined}
              onClick={() => navigate({ view: 'projects' })}
            >
              <nldd-icon-cell size="20" icon="folder" />
              <nldd-spacer-cell size="8" />
              <nldd-text-cell
                text={copy.projects.title}
                supporting-text={stalled.length > 0 ? copy.projects.stalledCount(stalled.length) : undefined}
              />
              {(stalled.length > 0 || active.length > 0) && (
                <nldd-cell>
                  <nldd-badge
                    size="sm"
                    color={stalled.length > 0 ? 'critical' : 'neutral'}
                    number={stalled.length > 0 ? stalled.length : active.length}
                  />
                </nldd-cell>
              )}
              <nldd-spacer-cell size="8" />
              <nldd-cell>
                <nldd-keyboard-shortcut size="sm" variant="simple" keys={PROJECTS_KEY} />
              </nldd-cell>
            </nldd-list-item>
          </nldd-list>
        </nldd-skip-link>
        <nldd-spacer size="24" />
        <BackupPanel />
        <RecoveredPanel />
      </nldd-simple-section>
    </nldd-page>
  );
}
