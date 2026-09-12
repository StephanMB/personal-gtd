import { STATUSES, type Status } from '../../domain/model.ts';
import { lists } from '../app-state.ts';
import { copy } from '../copy.ts';
import { LIST_KEYS } from '../keys.ts';
import { navigate } from '../router.ts';
import { BackupPanel } from './BackupPanel.tsx';

const ICONS: Record<Status, string> = {
  inbox: 'inbox',
  next: 'arrow-right',
  waiting: 'clock',
  someday: 'lightbulb',
  done: 'check-mark-circle',
};

export function Sidebar({ current }: { current: Status }) {
  const byStatus = lists.value;
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
          </nldd-list>
        </nldd-skip-link>
        <nldd-spacer size="24" />
        <BackupPanel />
      </nldd-simple-section>
    </nldd-page>
  );
}
