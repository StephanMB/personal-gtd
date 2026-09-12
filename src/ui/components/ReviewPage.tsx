import type { ComponentChildren } from 'preact';
import { completedBetween, staleWaiting, untouchedSomeday } from '../../domain/queries.ts';
import { appState, lists, projectViews } from '../app-state.ts';
import { exportData, finishReview } from '../commands.ts';
import { copy } from '../copy.ts';
import { navigate } from '../router.ts';
import { HOME } from '../routes.ts';
import { ItemRow } from './ItemRow.tsx';

/**
 * The weekly review: the screen that makes the rest of the system worth
 * trusting, and almost free to build. No new data and no migration — every
 * step is a query over what is already there, which is the clearest evidence
 * that "views are queries over one data set" was the right call.
 */
const WEEK = 7 * 24 * 60 * 60 * 1000;

function Step({
  number,
  title,
  clear,
  summary,
  children,
}: {
  number: number;
  title: string;
  clear: boolean;
  summary: string;
  children?: ComponentChildren;
}) {
  return (
    <>
      <nldd-title size={5}>{`${number}. ${title}`}</nldd-title>
      <div class="review-step">
        <nldd-badge size="sm" color={clear ? 'success' : 'warning'} text={clear ? copy.review.clear : summary} />
        {children}
      </div>
      <nldd-spacer size="16" />
    </>
  );
}

export function ReviewPage() {
  const { items, settings } = appState.value;
  const now = Date.now();
  const all = [...items];

  const inbox = lists.value.inbox;
  const stalled = projectViews.value.stalled;
  const waiting = staleWaiting(all, now);
  const someday = untouchedSomeday(all, now);
  const finished = completedBetween(all, now - WEEK, now);
  const exportedThisWeek = settings.lastExportAt !== undefined && now - settings.lastExportAt < WEEK;

  return (
    <nldd-page sticky-header>
      <nldd-top-title-bar slot="header" text={copy.review.title} />
      <nldd-simple-section>
        <p class="review-intro">{copy.review.intro}</p>
        <nldd-spacer size="16" />

        <Step number={1} title={copy.review.steps.inbox} clear={inbox.length === 0} summary={copy.review.clarify(inbox.length)}>
          {inbox.length > 0 && (
            <nldd-button size="sm" text={copy.review.clarify(inbox.length)} onClick={() => navigate({ view: 'clarify' })} />
          )}
        </Step>

        <Step
          number={2}
          title={copy.review.steps.projects}
          clear={stalled.length === 0}
          summary={copy.projects.stalledCount(stalled.length)}
        >
          {stalled.length > 0 && (
            <nldd-list accessible-label={copy.review.steps.projects}>
              {stalled.map((project) => (
                <nldd-list-item key={project.id} button onClick={() => navigate({ view: 'project', id: project.id })}>
                  <nldd-text-cell text={project.title} />
                </nldd-list-item>
              ))}
            </nldd-list>
          )}
        </Step>

        <Step
          number={3}
          title={copy.review.steps.waiting}
          clear={waiting.length === 0}
          summary={copy.review.toChase(waiting.length)}
        >
          {waiting.length > 0 && (
            <nldd-list accessible-label={copy.review.steps.waiting}>
              {waiting.map((item) => (
                <ItemRow key={item.id} item={item} />
              ))}
            </nldd-list>
          )}
        </Step>

        <Step
          number={4}
          title={copy.review.steps.someday}
          clear={someday.length === 0}
          summary={copy.review.toRevisit(someday.length)}
        >
          {someday.length > 0 && (
            <nldd-list accessible-label={copy.review.steps.someday}>
              {someday.map((item) => (
                <ItemRow key={item.id} item={item} />
              ))}
            </nldd-list>
          )}
        </Step>

        {/* Not a chore but the payoff: the step that makes a review feel worth doing. */}
        <Step
          number={5}
          title={copy.review.steps.completed}
          clear={finished.length > 0}
          summary={copy.review.completedCount(finished.length)}
        >
          {finished.length > 0 && (
            <nldd-list accessible-label={copy.review.steps.completed}>
              {finished.map((item) => (
                <nldd-list-item key={item.id}>
                  <nldd-text-cell text={item.title} />
                </nldd-list-item>
              ))}
            </nldd-list>
          )}
        </Step>

        <Step
          number={6}
          title={copy.review.steps.backup}
          clear={exportedThisWeek}
          summary={
            settings.lastExportAt === undefined
              ? copy.backup.never
              : copy.backup.last(Math.floor((now - settings.lastExportAt) / 86_400_000))
          }
        >
          <nldd-button size="sm" text={copy.review.exportNow} start-icon="export" onClick={exportData} />
        </Step>

        <nldd-button
          variant="accent-filled"
          text={copy.review.finish}
          onClick={() => {
            void finishReview();
            navigate(HOME);
          }}
        />
        <nldd-spacer size="16" />
        <p class="review-intro">
          {settings.lastReviewedAt === undefined
            ? copy.review.never
            : copy.review.sinceReview(Math.floor((now - settings.lastReviewedAt) / 86_400_000))}
        </p>
      </nldd-simple-section>
    </nldd-page>
  );
}
