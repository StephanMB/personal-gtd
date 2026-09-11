import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseCapture, createItem } from './capture.ts';
import { isItem } from './model.ts';

const cases: [input: string, expected: ReturnType<typeof parseCapture>][] = [
  ['Buy milk @errands', { title: 'Buy milk', context: 'errands' }],
  ['Email jan@minbzk.nl', { title: 'Email jan@minbzk.nl' }],
  ['@errands', { title: '@errands' }],
  ['Call @bob about taxes', { title: 'Call @bob about taxes' }],
  ['Fix bike @home @weekend', { title: 'Fix bike @home', context: 'weekend' }],
  ['  spaced   @home  ', { title: 'spaced', context: 'home' }],
  ['trailing @', { title: 'trailing @' }],
];

for (const [input, expected] of cases) {
  test(`parseCapture(${JSON.stringify(input)})`, () => {
    assert.deepEqual(parseCapture(input), expected);
  });
}

test('parseCapture never drops non-whitespace characters', () => {
  for (const [input] of cases) {
    const { title, context } = parseCapture(input);
    const kept = (title + (context ?? '')).replace(/[\s@]/g, '');
    assert.equal(kept, input.replace(/[\s@]/g, ''), input);
  }
});

test('createItem produces a valid inbox item with the given id and time', () => {
  const item = createItem('Buy milk @errands', 'id-1', 5000);
  assert.deepEqual(item, { id: 'id-1', title: 'Buy milk', context: 'errands', status: 'inbox', createdAt: 5000, updatedAt: 5000 });
  assert.ok(isItem(item));
  assert.ok(!('context' in createItem('No context', 'id-2', 1)), 'no undefined context key');
});
