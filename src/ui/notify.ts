/**
 * Transient messages through nldd-notification, created imperatively.
 *
 * Why not render them from Preact: a notification moves itself into a shared
 * region at the top of the page. An element that relocates itself out of the
 * parent Preact put it in breaks Preact's bookkeeping of that parent's
 * children. Owning these elements outside the component tree avoids the
 * problem entirely, and "fire a message from anywhere" is what a toast is.
 */
export interface NotifyOptions {
  variant?: 'neutral' | 'accent' | 'success' | 'warning' | 'critical';
  action?: { label: string; run: () => void };
}

export function notify(text: string, { variant = 'neutral', action }: NotifyOptions = {}): void {
  const el = document.createElement('nldd-notification');
  el.setAttribute('text', text);
  el.setAttribute('variant', variant);
  if (action) {
    const button = document.createElement('nldd-button');
    button.setAttribute('slot', 'actions');
    button.setAttribute('text', action.label);
    button.addEventListener('click', () => {
      el.remove();
      action.run();
    });
    el.appendChild(button);
  }
  el.addEventListener('dismiss', () => el.remove());
  document.body.appendChild(el);
}
