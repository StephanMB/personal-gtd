import { signal } from '@preact/signals';
import type { Settings } from '../persistence/schema.ts';
import { en, type Dictionary } from './copy-en.ts';
import { nl } from './copy-nl.ts';

export type Language = NonNullable<Settings['language']>;

export const LANGUAGES: readonly Language[] = ['en', 'nl'];

const DICTIONARIES: Record<Language, Dictionary> = { en, nl };

/** Which language the app speaks. Set from the stored settings at boot. */
export const language = signal<Language>('en');

/**
 * Every string, in the language currently chosen.
 *
 * A proxy rather than `dictionary[language].x` at every call site: reading any
 * key reads the language signal, so a component that renders a string
 * re-renders when the language changes, and no component had to learn that
 * languages exist at all.
 */
export const copy: Dictionary = new Proxy({} as Dictionary, {
  get: (_target, key) => DICTIONARIES[language.value][key as keyof Dictionary],
});
