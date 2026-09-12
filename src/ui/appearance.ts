import type { Settings } from '../persistence/schema.ts';

export type Theme = NonNullable<Settings['theme']>;

export const THEMES: readonly Theme[] = ['system', 'light', 'dark'];

/**
 * `color-scheme` is the only lever needed: the design system's palette is
 * built on light-dark(), so every token switches from this one property.
 * "system" means declaring both and letting the operating system pick.
 */
export function colorSchemeFor(theme: Theme): string {
  return theme === 'system' ? 'light dark' : theme;
}

/** The two things about the document that are not rendered by a component. */
export function applyAppearance(theme: Theme, language: string): void {
  const root = document.documentElement;
  root.style.colorScheme = colorSchemeFor(theme);
  root.lang = language;
}
