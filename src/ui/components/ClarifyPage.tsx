import { useEffect, useRef, useState } from 'preact/hooks';
import { lists } from '../app-state.ts';
import { completeItem, deleteItem, dismissHint, promoteItem, renameItem, run } from '../commands.ts';
import { copy } from '../copy.ts';
import type { Decision } from '../keys.ts';
import { navigate } from '../router.ts';
import { HOME } from '../routes.ts';
import { registerClarifyKeys } from '../shortcuts.ts';
import { Hint } from './Hint.tsx';

/**
 * Clarifying: one item, one decision, one keystroke.
 *
 * Where you are in the flow is not stored anywhere. The item in front of you
 * is always the first inbox item, so nothing can point at something another
 * tab deleted, and leaving and coming back simply continues where the inbox
 * now starts. The counter is the only bit of memory, and it is per visit.
 */
const DECISIONS: { decision: Decision; key: string }[] = [
  { decision: 'next', key: 'n' },
  { decision: 'waiting', key: 'w' },
  { decision: 'someday', key: 's' },
  { decision: 'done', key: 'd' },
  { decision: 'trash', key: 't' },
  { decision: 'project', key: 'p' },
];

export function ClarifyPage() {
  const inbox = lists.value.inbox;
  const item = inbox[0];
  const [startedWith, setStartedWith] = useState(inbox.length);
  const [editing, setEditing] = useState(false);
  const field = useRef<HTMLElementTagNameMap['nldd-text-field']>(null);

  async function decide(decision: Decision): Promise<void> {
    if (!item) return;
    setEditing(false);
    // Making a decision is the interaction the explanation is about.
    void dismissHint('clarify-keys');
    if (decision === 'trash') await deleteItem(item);
    else if (decision === 'done') await completeItem(item);
    else if (decision === 'project') await promoteItem(item);
    else await run({ type: 'move', id: item.id, to: decision });
  }

  // No dependency list on purpose: the handler must see the item currently
  // on screen, and re-registering is a variable assignment.
  useEffect(() => {
    registerClarifyKeys((action) => {
      if (action.type === 'leave') {
        navigate(HOME);
        return;
      }
      if (!item) return;
      if (action.type === 'edit') setEditing(true);
      else if (action.type === 'decide') void decide(action.decision);
    });
    return () => registerClarifyKeys(null);
  });

  useEffect(() => {
    if (editing) field.current?.focus();
  }, [editing, item?.id]);

  // Capturing while clarifying makes the batch bigger; say so rather than lie.
  useEffect(() => {
    if (inbox.length > startedWith) setStartedWith(inbox.length);
  }, [inbox.length, startedWith]);

  if (!item) {
    return (
      <nldd-page sticky-header>
        <nldd-top-title-bar slot="header" text={copy.clarify.title} />
        <nldd-simple-section>
          <nldd-inline-dialog variant="success" text={copy.clarify.empty}>
            <nldd-button-group slot="actions" size="sm">
              <nldd-button size="sm" text={copy.clarify.backToInbox} onClick={() => navigate(HOME)} />
            </nldd-button-group>
          </nldd-inline-dialog>
        </nldd-simple-section>
      </nldd-page>
    );
  }

  const position = Math.min(startedWith - inbox.length + 1, startedWith);

  async function save(): Promise<void> {
    const value = field.current?.value ?? '';
    if (item && (await renameItem(item, value))) setEditing(false);
  }

  return (
    <nldd-page sticky-header>
      <nldd-top-title-bar slot="header" text={copy.clarify.title} />
      <nldd-simple-section>
        <p class="clarify-progress">{copy.clarify.progress(position, startedWith)}</p>

        {editing ? (
          <form
            class="capture"
            onSubmit={(event) => {
              event.preventDefault();
              void save();
            }}
          >
            <nldd-text-field
              ref={field}
              name="title"
              accessible-label={copy.clarify.edit}
              value={item.title}
              enter-key="done"
              onKeyDown={(event: Event) => {
                // The JSX layer types custom-element handlers as CustomEvent,
                // so this arrives as Event and is narrowed here.
                if ((event as KeyboardEvent).key === 'Escape') {
                  event.preventDefault();
                  setEditing(false);
                }
              }}
            />
            <nldd-button type="submit" variant="accent-filled" text={copy.clarify.save} />
          </form>
        ) : (
          <nldd-title size={3}>{item.title}</nldd-title>
        )}

        {item.context && <nldd-tag size="sm" text={`@${item.context}`} />}

        <nldd-spacer size="16" />
        <p class="clarify-question">{copy.clarify.question}</p>

        <Hint id="clarify-keys" dismissable={false}>
          <nldd-button-bar size="sm">
            {DECISIONS.map(({ decision, key }) => (
              <nldd-button
                key={decision}
                text={`${copy.clarify.decisions[decision]} (${key})`}
                accessible-label={copy.clarify.decisions[decision]}
                onClick={() => void decide(decision)}
              />
            ))}
          </nldd-button-bar>
        </Hint>

        <p class="clarify-hint">{copy.clarify.twoMinuteRule}</p>
        <nldd-spacer size="16" />
        <nldd-button
          size="sm"
          variant="neutral-transparent"
          text={copy.clarify.leave}
          onClick={() => navigate(HOME)}
        />
      </nldd-simple-section>
    </nldd-page>
  );
}
