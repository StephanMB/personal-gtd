import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * A <nldd-*> tag whose component was never imported renders as an unknown
 * element: no error, just an empty box. This test makes that a red build,
 * like regelrecht's check-nldd-imports script, and also flags imports that
 * are no longer used (they only cost bundle size).
 */
const UI = fileURLToPath(new URL('.', import.meta.url));
const PKG = fileURLToPath(new URL('../../node_modules/@nldd/design-system/package.json', import.meta.url));

function uiSources(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const path = join(dir, e.name);
    if (e.isDirectory()) return uiSources(path);
    return /\.tsx?$/.test(e.name) && !/(\.test\.ts|\.d\.ts|nldd\.ts)$/.test(e.name) ? [path] : [];
  });
}

test('every nldd-* tag used in src/ui is imported in nldd.ts, and nothing more', { skip: !existsSync(PKG) && 'run npm install first' }, () => {
  const pkg = JSON.parse(readFileSync(PKG, 'utf8')) as { exports: Record<string, unknown> };
  const entries = Object.keys(pkg.exports)
    .filter((k) => k.startsWith('./'))
    .map((k) => k.slice(2))
    .filter((k) => !k.startsWith('styles') && !['bundle', 'breakpoints', 'vue'].includes(k) && !k.includes('.'));

  // Sub-components ship with their parent (nldd-menu-item lives in ./menu):
  // a tag maps to the longest entry that is a prefix of it.
  const entryFor = (tag: string) =>
    entries.filter((e) => tag === e || tag.startsWith(`${e}-`)).sort((a, b) => b.length - a.length)[0];

  const used = new Set<string>();
  for (const file of uiSources(UI)) {
    const text = readFileSync(file, 'utf8');
    for (const [, tag] of text.matchAll(/<nldd-([a-z0-9-]+)/g)) used.add(tag);
    // createElement('nldd-…') only: a bare 'nldd-…' string can be an event
    // name (nldd-close), which is not a tag and has nothing to import.
    for (const [, tag] of text.matchAll(/createElement\(['"]nldd-([a-z0-9-]+)['"]/g)) used.add(tag);
  }
  const unknown = [...used].filter((tag) => !entryFor(tag));
  assert.deepEqual(unknown, [], 'tags that no design-system entry defines (typo?)');

  const needed = new Set([...used].map((tag) => entryFor(tag)!));
  const imported = new Set(
    [...readFileSync(join(UI, 'nldd.ts'), 'utf8').matchAll(/@nldd\/design-system\/([a-z0-9-]+)'/g)].map((m) => m[1]),
  );
  assert.deepEqual([...needed].filter((e) => !imported.has(e)).sort(), [], 'used but not imported in nldd.ts');
  assert.deepEqual([...imported].filter((e) => !needed.has(e)).sort(), [], 'imported in nldd.ts but unused');
});
