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
  assert.equal(matchShortcut(key('6'), false), null);
  assert.equal(matchShortcut(key('C', { shiftKey: true }), false), null);
});

test('undo works with Ctrl and with Cmd, but not with Shift (that is redo)', () => {
  assert.deepEqual(matchShortcut(key('z', { ctrlKey: true }), false), { type: 'undo' });
  assert.deepEqual(matchShortcut(key('z', { metaKey: true }), false), { type: 'undo' });
  assert.equal(matchShortcut(key('z', { ctrlKey: true, shiftKey: true }), false), null);
  assert.equal(matchShortcut(key('c', { ctrlKey: true }), false), null, 'Ctrl+C stays copy');
});

test('nothing fires while typing', () => {
  for (const k of [key('c'), key('1'), key('z', { ctrlKey: true })]) assert.equal(matchShortcut(k, true), null);
  assert.ok(isTypingTarget({ tagName: 'INPUT' }));
  assert.ok(isTypingTarget({ tagName: 'DIV', isContentEditable: true }));
  assert.ok(!isTypingTarget({ tagName: 'BUTTON' }));
  assert.ok(!isTypingTarget(null));
});
