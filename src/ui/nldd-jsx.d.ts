/**
 * Lets Preact's JSX type-check <nldd-*> elements.
 *
 * NLDD ships types for Vue only. Its components do declare themselves in
 * HTMLElementTagNameMap, so every tag and its element class are known; this
 * file maps them into Preact's IntrinsicElements. For each tag you get:
 *   - the element's own properties (camelCase), typed from its class,
 *     which win over same-named generic HTML attributes (e.g. `size`);
 *   - any kebab-case attribute, as written in the NLDD docs (`supporting-text`);
 *   - lowercase custom-event handlers (`ondismiss`, `onback`); see guide 3.5
 *     for why the lowercase matters.
 * Kebab attributes are not checked by name. That is the trade-off for not
 * hand-maintaining 110 component signatures.
 */
import type { JSX } from 'preact';

type NlddTag = Extract<keyof HTMLElementTagNameMap, `nldd-${string}`>;
type OwnProps<E> = Partial<Omit<E, keyof HTMLElement>>;
type KebabAttributes = { [attribute: `${string}-${string}`]: string | number | boolean | undefined };
type EventHandlers = { [handler: `on${string}`]: ((event: CustomEvent) => void) | undefined };

type NlddProps<E extends HTMLElement> = Omit<JSX.HTMLAttributes<E>, keyof OwnProps<E>> &
  OwnProps<E> &
  KebabAttributes &
  EventHandlers;

type NlddElements = { [K in NlddTag]: NlddProps<HTMLElementTagNameMap[K]> };

// The augmentation form Preact documents for custom elements.
declare global {
  namespace preact.JSX {
    interface IntrinsicElements extends NlddElements {}
  }
}

export {};
