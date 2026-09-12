import { STATUSES, type Status } from '../../domain/model.ts';
import { appState, lists, projectViews } from '../app-state.ts';
import { copy, language } from '../copy.ts';
import { LIST_KEYS, PROJECTS_KEY, REVIEW_KEY } from '../keys.ts';
import { navigate } from '../router.ts';
import { BackupPanel } from './BackupPanel.tsx';
import { AppearancePanel } from './AppearancePanel.tsx';
import { RecoveredPanel } from './RecoveredPanel.tsx';

const ICONS: Record<Status, string> = {
  inbox: 'inbox',
  next: 'arrow-right',
  waiting: 'clock',
  someday: 'lightbulb',
  done: 'check-mark-circle',
};

export function Sidebar({ current }: { current: Status | 'projects' | 'review' | null }) {
  const byStatus = lists.value;
  const { active, stalled } = projectViews.value;
  const lastReviewed = appState.value.settings.lastReviewedAt;
  const daysSinceReview = lastReviewed === undefined ? null : Math.floor((Date.now() - lastReviewed) / 86_400_000);
  // A week is the point of a weekly review; never reviewed counts as overdue.
  const reviewOverdue = daysSinceReview === null || daysSinceReview >= 7;
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
          {/* Keyed on the language: the design system reads `translations` when
              the element is created and not again, so switching language has to
              give it a new element or its screen-reader hint stays behind. */}
          <nldd-list
            key={language.value}
            type="navigation"
            aria-label={copy.navLabel}
            translations={{ 'components.list.arrow-navigation-description-text': copy.appearance.listArrowHint }}
          >
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

            <nldd-list-item
              button
              selected={current === 'review' || undefined}
              onClick={() => navigate({ view: 'review' })}
            >
              <nldd-icon-cell size="20" icon="check-list" />
              <nldd-spacer-cell size="8" />
              <nldd-text-cell
                text={copy.review.title}
                supporting-text={
                  daysSinceReview === null ? copy.review.never : copy.review.sinceReview(daysSinceReview)
                }
              />
              {reviewOverdue && (
                <nldd-cell>
                  <nldd-badge size="sm" color="warning" text={daysSinceReview === null ? '!' : `${daysSinceReview}d`} />
                </nldd-cell>
              )}
              <nldd-spacer-cell size="8" />
              <nldd-cell>
                <nldd-keyboard-shortcut size="sm" variant="simple" keys={REVIEW_KEY} />
              </nldd-cell>
            </nldd-list-item>
          </nldd-list>
        </nldd-skip-link>
        <nldd-spacer size="24" />
        <BackupPanel />
        <RecoveredPanel />
        <AppearancePanel />
      </nldd-simple-section>
    </nldd-page>
  );
}
