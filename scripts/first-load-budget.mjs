import { readFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';

/**
 * First-load budget.
 *
 * This is one page: everything index.html references is downloaded before the
 * app can be used, and the design system is most of it. A careless import (the
 * package root registers ~110 components instead of the 23 used) or a heavy
 * dependency would otherwise show up as a vague feeling that the app got slow.
 * Here it is a failing build instead, which is the only form of restraint that
 * survives a late evening.
 *
 * Sizes are gzipped, because that is what nginx serves.
 *
 * Raise the budget deliberately, with a reason in the commit message, or not
 * at all. At the time of writing the first load is about 147 kB.
 */
const BUDGET_KB = 175;

const kb = (bytes) => bytes / 1024;

let html;
try {
  html = readFileSync('dist/index.html', 'utf8');
} catch {
  console.error('No dist/index.html. Run `npm run build` first.');
  process.exit(1);
}

const referenced = [...html.matchAll(/(?:src|href)="\/([^"]+)"/g)].map((match) => match[1]);
let total = gzipSync(Buffer.from(html)).length;

for (const path of referenced) {
  let bytes;
  try {
    bytes = readFileSync(`dist/${path}`);
  } catch {
    console.error(`index.html references dist/${path}, which is not there.`);
    process.exit(1);
  }
  const gzipped = gzipSync(bytes).length;
  total += gzipped;
  console.log(`  ${path.padEnd(38)} ${kb(gzipped).toFixed(1).padStart(7)} kB gz`);
}

const totalKb = kb(total);
const verdict = `first load ${totalKb.toFixed(1)} kB gz of ${BUDGET_KB} kB budget`;

if (totalKb > BUDGET_KB) {
  console.error(`\nOver budget: ${verdict}.`);
  console.error('Either make it smaller, or raise BUDGET_KB in scripts/first-load-budget.mjs on purpose.');
  process.exit(1);
}

console.log(`\nWithin budget: ${verdict}.`);
