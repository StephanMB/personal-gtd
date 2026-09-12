import { useEffect, useRef } from 'preact/hooks';
import type { Status } from '../../domain/model.ts';
import { requestPersistence, run } from '../commands.ts';
import { copy } from '../copy.ts';
import { notify } from '../notify.ts';
import { registerCaptureFocus } from '../shortcuts.ts';

/**
 * Quick capture. A plain <form>: nldd-text-field and nldd-button are
 * form-associated (NLDD ≥ 0.8.81), so Enter in the field and a click on the
 * button both submit it. The field is uncontrolled: we read `.value` on
 * submit, which avoids re-rendering on every keystroke.
 */
export function CaptureForm({
  announceInbox,
  projectId,
  status,
  label = copy.capture.label,
  placeholder = copy.capture.placeholder,
}: {
  announceInbox: boolean;
  projectId?: string;
  status?: Status;
  label?: string;
  placeholder?: string;
}) {
  const field = useRef<HTMLElementTagNameMap['nldd-text-field']>(null);

  useEffect(() => {
    registerCaptureFocus(() => field.current?.focus());
    return () => registerCaptureFocus(null);
  }, []);

  async function onSubmit(event: Event) {
    event.preventDefault();
    const el = field.current;
    const value = el?.value.trim();
    if (!el || !value) return;
    const result = await run({ type: 'capture', input: value, projectId, status });
    if (!result.ok) return;
    el.value = '';
    if (announceInbox) notify(copy.capture.addedElsewhere, { variant: 'success' });
    void requestPersistence();
  }

  return (
    <form class="capture" onSubmit={onSubmit}>
      <nldd-text-field
        ref={field}
        name="capture"
        accessible-label={label}
        placeholder={placeholder}
        autocomplete="off"
        enter-key="done"
      />
      <nldd-button type="submit" variant="accent-filled" start-icon="plus" text={copy.capture.submit} />
    </form>
  );
}
