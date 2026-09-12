import { isTypingTarget, matchShortcut, type Scope, type ShortcutAction } from './keys.ts';
import { navigate, route } from './router.ts';
import { HOME } from './routes.ts';
import { undoLast } from './commands.ts';

/** The capture field registers itself here so `c` can focus it. */
let focusCapture: (() => void) | null = null;
export function registerCaptureFocus(fn: (() => void) | null): void {
  focusCapture = fn;
}

/**
 * The clarify flow registers itself here while it is on screen. Its keys are
 * about the item in front of you, which only that page knows.
 */
let clarifyKeys: ((action: ShortcutAction) => void) | null = null;
export function registerClarifyKeys(fn: ((action: ShortcutAction) => void) | null): void {
  clarifyKeys = fn;
}

export function installShortcuts(): void {
  window.addEventListener('keydown', (event) => {
    if (event.defaultPrevented || event.isComposing) return;
    // Focus inside an NLDD field sits in its shadow root; composedPath()[0]
    // is the real <input>, where event.target would be the host element.
    const typing = isTypingTarget(event.composedPath()[0] as Element | undefined);
    const scope: Scope = route.value?.view === 'clarify' ? 'clarify' : 'global';
    const action = matchShortcut(event, typing, scope);
    if (!action) return;
    event.preventDefault();
    switch (action.type) {
      case 'focus-capture':
        focusCapture?.();
        break;
      case 'clarify':
        navigate({ view: 'clarify' });
        break;
      case 'go':
        navigate({ view: 'list', status: action.status });
        break;
      case 'go-projects':
        navigate({ view: 'projects' });
        break;
      case 'go-review':
        navigate({ view: 'review' });
        break;
      case 'undo':
        void undoLast();
        break;
      case 'leave':
        if (clarifyKeys) clarifyKeys(action);
        else navigate(HOME);
        break;
      default:
        clarifyKeys?.(action);
    }
  });
}
