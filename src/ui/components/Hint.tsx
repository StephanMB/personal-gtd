import type { ComponentChildren } from 'preact';
import { useEffect, useRef } from 'preact/hooks';
import { hintContext, hintHere, hintsOnScreen } from '../app-state.ts';
import { dismissHint } from '../commands.ts';
import { copy } from '../copy.ts';
import { firstActiveHint, retiresOnUse, type HintContext, type HintId } from '../hints.ts';

/**
 * Wraps the control an explanation is about, and says its piece only when the
 * situation it explains is true.
 *
 * The design system distinguishes three ways a coach mark closes, and they
 * mean different things here: you did the thing it suggested (completed) or
 * you waved it away (dismissed), and either way it has done its job and never
 * returns. Clicking elsewhere (ignored) is not an answer, so it comes back
 * next time — which is what keeps this from being a tutorial you have to sit
 * through before you can start.
 */
export function Hint({
  id,
  here,
  dismissable = true,
  children,
}: {
  id: HintId;
  here?: HintContext['here'];
  /**
   * A dismissable coach mark closes on any key press outside it, which would
   * eat the first keystroke on a keyboard-driven screen. Those pass false and
   * retire the hint themselves when the interaction actually happens.
   */
  dismissable?: boolean;
  children: ComponentChildren;
}) {
  const element = useRef<HTMLElementTagNameMap['nldd-just-in-time-education']>(null);

  // Register while mounted, so the arbitration only ever picks a hint that is
  // actually on screen.
  useEffect(() => {
    hintsOnScreen.value = [...hintsOnScreen.value, id];
    if (here !== undefined) hintHere.value = here;
    return () => {
      hintsOnScreen.value = hintsOnScreen.value.filter((candidate) => candidate !== id);
      if (here !== undefined) hintHere.value = undefined;
    };
  }, [id, here?.projectActions]);

  const active = firstActiveHint(hintContext.value, hintsOnScreen.value) === id;

  useEffect(() => {
    const node = element.current;
    if (!node) return;
    const onClose = (event: Event) => {
      const reason = (event as CustomEvent<{ reason?: string }>).detail?.reason;
      if (reason === 'completed' || reason === 'dismissed') void dismissHint(id);
    };
    // Using the control is an answer too, and a control that navigates away
    // unmounts before the component's own close event can land.
    const onUse = () => {
      if (retiresOnUse(id)) void dismissHint(id);
    };
    node.addEventListener('nldd-close', onClose);
    node.addEventListener('click', onUse);
    return () => {
      node.removeEventListener('nldd-close', onClose);
      node.removeEventListener('click', onUse);
    };
  }, [id]);

  return (
    <nldd-just-in-time-education
      ref={element}
      active={active || undefined}
      dismissable={dismissable || undefined}
      text={copy.hints[id].text}
      supporting-text={copy.hints[id].supporting}
    >
      {children}
    </nldd-just-in-time-education>
  );
}
