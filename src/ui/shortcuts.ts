import { isTypingTarget, matchShortcut } from './keys.ts';
import { navigate } from './router.ts';
import { undoLast } from './commands.ts';

/** The capture field registers itself here so `c` can focus it. */
let focusCapture: (() => void) | null = null;
export function registerCaptureFocus(fn: (() => void) | null): void {
  focusCapture = fn;
}

export function installShortcuts(): void {
  window.addEventListener('keydown', (event) => {
    if (event.defaultPrevented || event.isComposing) return;
    // Focus inside an NLDD field sits in its shadow root; composedPath()[0]
    // is the real <input>, where event.target would be the host element.
    const typing = isTypingTarget(event.composedPath()[0] as Element | undefined);
    const action = matchShortcut(event, typing);
    if (!action) return;
    event.preventDefault();
    if (action.type === 'focus-capture') focusCapture?.();
    else if (action.type === 'go') navigate({ view: 'list', status: action.status });
    else void undoLast();
  });
}
