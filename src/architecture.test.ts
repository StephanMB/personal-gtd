import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Guards the layering: domain <- persistence <- ui.
 * Cheap to keep, and it stops the structure from eroding one import at a time.
 */
const SRC = fileURLToPath(new URL('.', import.meta.url));

function sourceFiles(dir: string): string[] {
  return readdirSync(join(SRC, dir), { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? sourceFiles(join(dir, e.name)) : e.name.endsWith('.ts') ? [join(dir, e.name)] : [],
  );
}

function imports(file: string): string[] {
  const text = readFileSync(join(SRC, file), 'utf8');
  return [...text.matchAll(/^\s*import\s[^'"]*['"]([^'"]+)['"]/gm)].map((m) => m[1]);
}

const RULES: Record<string, { mayImport: string[]; forbiddenGlobals: RegExp | null }> = {
  domain: { mayImport: ['domain'], forbiddenGlobals: /\b(window|document|localStorage|sessionStorage|navigator)\b/ },
  persistence: { mayImport: ['domain', 'persistence'], forbiddenGlobals: /\b(document|navigator)\b/ },
};

for (const [layer, rule] of Object.entries(RULES)) {
  test(`${layer}/ only depends on: ${rule.mayImport.join(', ')}`, () => {
    for (const file of sourceFiles(layer)) {
      for (const spec of imports(file)) {
        if (spec.startsWith('node:')) {
          assert.ok(file.endsWith('.test.ts'), `${file}: node built-ins only in tests`);
          continue;
        }
        assert.ok(spec.startsWith('.'), `${file}: unexpected package import "${spec}"`);
        const target = join(file, '..', spec).split(/[\\/]/)[0];
        assert.ok(rule.mayImport.includes(target), `${file} imports ${spec} (layer "${target}")`);
      }
      if (rule.forbiddenGlobals && !file.endsWith('.test.ts')) {
        const code = readFileSync(join(SRC, file), 'utf8').replace(/\/\/.*$|\/\*[\s\S]*?\*\//gm, '');
        assert.doesNotMatch(code, rule.forbiddenGlobals, `${file} uses a browser global`);
      }
    }
  });
}
