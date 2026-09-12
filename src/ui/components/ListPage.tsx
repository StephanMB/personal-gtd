import type { Status } from '../../domain/model.ts';
import { appState, lists } from '../app-state.ts';
import { copy } from '../copy.ts';
import { navigate } from '../router.ts';
import { CaptureForm } from './CaptureForm.tsx';
import { Hint } from './Hint.tsx';
import { ItemRow } from './ItemRow.tsx';
import { ProblemBanner } from './ProblemBanner.tsx';

export function ListPage({ status }: { status: Status }) {
  const items = lists.value[status];
  const { problem } = appState.value;
  return (
    <nldd-page sticky-header>
      <nldd-top-title-bar slot="header" text={copy.lists[status]} />
      <nldd-simple-section>
        {problem && <ProblemBanner problem={problem} />}
        <Hint id="capture-context">
          <CaptureForm announceInbox={status !== 'inbox'} />
        </Hint>
        {status === 'inbox' && items.length > 0 && (
          <>
            <nldd-spacer size="16" />
            <Hint id="clarify-inbox">
              <nldd-button
                variant="secondary"
                text={copy.clarify.start(items.length)}
                onClick={() => navigate({ view: 'clarify' })}
              />
            </Hint>
          </>
        )}
        <nldd-spacer size="16" />
        <nldd-list accessible-label={copy.lists[status]}>
          {/* The list's own empty slot: a row would be announced as an item. */}
          <nldd-inline-dialog slot="empty" text={copy.empty[status]} />
          {items.map((item) => (
            <ItemRow key={item.id} item={item} />
          ))}
        </nldd-list>
      </nldd-simple-section>
    </nldd-page>
  );
}
