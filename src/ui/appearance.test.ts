import { test } from 'node:test';
import assert from 'node:assert/strict';
import { colorSchemeFor, THEMES } from './appearance.ts';
import { en } from './copy-en.ts';
import { nl } from './copy-nl.ts';

test('system means "let the operating system pick", not a third palette', () => {
  assert.equal(colorSchemeFor('system'), 'light dark');
  assert.equal(colorSchemeFor('light'), 'light');
  assert.equal(colorSchemeFor('dark'), 'dark');
  assert.deepEqual([...THEMES], ['system', 'light', 'dark']);
});

/** Types already enforce the shape; this says the same thing out loud. */
function shape(value: unknown): unknown {
  if (typeof value === 'function') return 'fn';
  if (value === null || typeof value !== 'object') return typeof value;
  return Object.fromEntries(
    Object.entries(value)
      .map(([key, nested]) => [key, shape(nested)])
      .sort(([a], [b]) => String(a).localeCompare(String(b))),
  );
}

test('every string has a Dutch counterpart, and nothing extra', () => {
  assert.deepEqual(shape(nl), shape(en));
});

test('the Dutch dictionary is actually translated', () => {
  // A handful of anchors: these would be the first to be forgotten.
  assert.equal(nl.lists.next, 'Eerstvolgende acties');
  assert.equal(nl.clarify.title, 'Verhelderen');
  assert.equal(nl.projects.stalled, 'Geen eerstvolgende actie');
  assert.match(nl.backup.last(3), /3 dagen geleden/);
  assert.match(nl.clarify.start(1), /^1 item verhelderen/);
  assert.match(nl.clarify.start(2), /^2 items verhelderen/);
});
