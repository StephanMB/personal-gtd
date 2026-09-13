import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isTypingTarget, matchShortcut, type KeyPress } from './keys.ts';

const key = (k: string, mods: Partial<KeyPress> = {}): KeyPress => ({
  key: k, ctrlKey: false, metaKey: false, altKey: false, shiftKey: false, ...mods,
});

test('single keys map to actions', () => {
  assert.deepEqual(matchShortcut(key('c'), false), { type: 'focus-capture' });
  assert.deepEqual(matchShortcut(key('1'), false), { type: 'go', status: 'inbox' });
  assert.deepEqual(matchShortcut(key('5'), false), { type: 'go', status: 'done' });
  assert.equal(matchShortcut(key('8'), false), null, 'and nothing beyond the views that exist');
  assert.equal(matchShortcut(key('C', { shiftKey: true }), false), null);
});

test('slash searches even where the layout needs Shift to type it', () => {
  assert.deepEqual(matchShortcut(key('/', { shiftKey: true }), false), { type: 'search' });
  assert.equal(matchShortcut(key('/', { ctrlKey: true }), false), null, 'Ctrl+/ belongs to the browser');
  assert.equal(matchShortcut(key('/'), true), null, 'and never while typing');
});

test('undo works with Ctrl and with Cmd, but not with Shift (that is redo)', () => {
  assert.deepEqual(matchShortcut(key('z', { ctrlKey: true }), false), { type: 'undo' });
  assert.deepEqual(matchShortcut(key('z', { metaKey: true }), false), { type: 'undo' });
  assert.equal(matchShortcut(key('z', { ctrlKey: true, shiftKey: true }), false), null);
  assert.equal(matchShortcut(key('c', { ctrlKey: true }), false), null, 'Ctrl+C stays copy');
});

test('p starts clarifying, and decision keys only work inside the flow', () => {
  assert.deepEqual(matchShortcut(key('p'), false), { type: 'clarify' });
  for (const k of ['n', 'w', 's', 'd', 't', 'e']) {
    assert.equal(matchShortcut(key(k), false), null, `${k} does nothing outside the flow`);
  }
  assert.deepEqual(matchShortcut(key('n'), false, 'clarify'), { type: 'decide', decision: 'next' });
  assert.deepEqual(matchShortcut(key('t'), false, 'clarify'), { type: 'decide', decision: 'trash' });
  assert.deepEqual(matchShortcut(key('d'), false, 'clarify'), { type: 'decide', decision: 'done' });
  assert.deepEqual(matchShortcut(key('e'), false, 'clarify'), { type: 'edit' });
  assert.deepEqual(matchShortcut(key('p'), false, 'clarify'), { type: 'decide', decision: 'project' });
  assert.deepEqual(matchShortcut(key('6'), false), { type: 'go-projects' });
  assert.deepEqual(matchShortcut(key('7'), false), { type: 'go-review' });
  assert.deepEqual(matchShortcut(key('0'), false), { type: 'go-settings' });
  assert.deepEqual(matchShortcut(key('/'), false), { type: 'search' });
  assert.deepEqual(matchShortcut(key('Escape'), false, 'clarify'), { type: 'leave' });
  assert.deepEqual(matchShortcut(key('2'), false, 'clarify'), { type: 'go', status: 'next' }, 'a way out stays');
});

test('nothing fires while typing', () => {
  for (const k of [key('c'), key('1'), key('z', { ctrlKey: true })]) assert.equal(matchShortcut(k, true), null);
  for (const k of [key('n'), key('t'), key('e')]) assert.equal(matchShortcut(k, true, 'clarify'), null);
  assert.ok(isTypingTarget({ tagName: 'INPUT' }));
  assert.ok(isTypingTarget({ tagName: 'DIV', isContentEditable: true }));
  assert.ok(!isTypingTarget({ tagName: 'BUTTON' }));
  assert.ok(!isTypingTarget(null));
});
