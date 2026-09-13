import { contextsInUse, inContext } from '../../domain/contexts.ts';
import type { Status } from '../../domain/model.ts';
import { appState, lists } from '../app-state.ts';
import { copy } from '../copy.ts';
import { navigate } from '../router.ts';
import { CaptureForm } from './CaptureForm.tsx';
import { ContextFilter } from './ContextFilter.tsx';
import { Hint } from './Hint.tsx';
import { ItemRow } from './ItemRow.tsx';
import { ProblemBanner } from './ProblemBanner.tsx';

export function ListPage({ status, context }: { status: Status; context?: string }) {
  const all = lists.value[status];
  const contexts = contextsInUse(all);
  const items = context === undefined ? all : inContext(all, context);
  const { problem } = appState.value;
  // The way the context is written, not the way it is compared, so an empty
  // filtered list says @Home back to you if that is how you typed it.
  const label = contexts.find((candidate) => candidate.key === context)?.label ?? context;
  return (
    <nldd-page sticky-header>
      <nldd-top-title-bar slot="header" text={copy.lists[status]} />
      <nldd-simple-section>
        {problem && <ProblemBanner problem={problem} />}
        <Hint id="capture-context">
          <CaptureForm announceInbox={status !== 'inbox'} />
        </Hint>
        {status === 'inbox' && all.length > 0 && (
          <>
            <nldd-spacer size="16" />
            <Hint id="clarify-inbox">
              <nldd-button
                variant="secondary"
                text={copy.clarify.start(all.length)}
                onClick={() => navigate({ view: 'clarify' })}
              />
            </Hint>
          </>
        )}
        <nldd-spacer size="16" />
        <ContextFilter
          contexts={contexts}
          selected={context}
          onSelect={(chosen) => navigate({ view: 'list', status, context: chosen }, { replace: true })}
        />
        <nldd-list accessible-label={copy.lists[status]}>
          {/* The list's own empty slot: a row would be announced as an item. */}
          <nldd-inline-dialog
            slot="empty"
            text={label === undefined ? copy.empty[status] : copy.filter.empty(label)}
          />
          {items.map((item) => (
            <ItemRow key={item.id} item={item} />
          ))}
        </nldd-list>
      </nldd-simple-section>
    </nldd-page>
  );
}
