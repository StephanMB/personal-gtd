import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * theme.css repoints every --primitives-color-accent-* step at another palette
 * by hand (step 3, section 3.4). Two ways that breaks silently on an upgrade:
 * a step the design system adds or renames is not overridden and quietly falls
 * back to lintblauw, and a palette that is renamed leaves the overrides
 * pointing at variables nothing defines. Neither raises an error in a browser;
 * both fail here, on the upgrade that causes them.
 */
const CSS = fileURLToPath(new URL('../../node_modules/@nldd/design-system/dist/css/', import.meta.url));
const THEME = fileURLToPath(new URL('./theme.css', import.meta.url));

/** Left-hand sides: custom properties this stylesheet defines. */
function declared(text: string): Set<string> {
  return new Set([...text.matchAll(/(--primitives-color-[a-z]+-\d+)\s*:/g)].map((m) => m[1]));
}

test(
  'theme.css overrides exactly the accent steps, with a palette that exists',
  { skip: !existsSync(CSS) && 'run npm install first' },
  () => {
    const system = declared(
      readFileSync(join(CSS, 'variables.css'), 'utf8') + readFileSync(join(CSS, 'colors.generated.css'), 'utf8'),
    );
    const theme = readFileSync(THEME, 'utf8');

    const accent = [...system].filter((name) => name.startsWith('--primitives-color-accent-')).sort();
    assert.ok(accent.length > 0, 'no accent steps found: did the variable naming change?');
    assert.deepEqual([...declared(theme)].sort(), accent, 'theme.css must override every accent step, and nothing else');

    const referenced = [...theme.matchAll(/var\((--primitives-color-[a-z]+-\d+)\)/g)].map((m) => m[1]);
    assert.ok(referenced.length > 0);
    assert.deepEqual(
      [...new Set(referenced.filter((name) => !system.has(name)))],
      [],
      'theme.css points at colour variables the design system does not define',
    );
  },
);
