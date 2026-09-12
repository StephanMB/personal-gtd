import type { Status } from '../../domain/model.ts';
import { appState, lists } from '../app-state.ts';
import { copy } from '../copy.ts';
import { CaptureForm } from './CaptureForm.tsx';
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
        <CaptureForm announceInbox={status !== 'inbox'} />
        <nldd-spacer size="16" />
        <nldd-list accessible-label={copy.lists[status]}>
          {items.length === 0 ? (
            <nldd-list-item>
              <nldd-text-cell text={copy.empty[status]} />
            </nldd-list-item>
          ) : (
            items.map((item) => <ItemRow key={item.id} item={item} />)
          )}
        </nldd-list>
      </nldd-simple-section>
    </nldd-page>
  );
}
