import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { migrate, detectVersion, SCHEMA_VERSION } from './schema.ts';

const v1Sample: unknown = JSON.parse(readFileSync(new URL('./fixtures/v1-sample.json', import.meta.url), 'utf8'));

test('detectVersion', () => {
  assert.equal(detectVersion([]), 1);
  assert.equal(detectVersion({ schemaVersion: 2, items: [] }), 2);
  assert.equal(detectVersion({ schemaVersion: 7 }), 7);
  for (const bad of [null, 'x', {}, { schemaVersion: '2' }, { schemaVersion: 1.5 }]) assert.equal(detectVersion(bad), null);
});

test('v1 fixture migrates to the current schema', () => {
  const r = migrate(v1Sample);
  assert.equal(r.kind, 'ok');
  if (r.kind !== 'ok') return;
  assert.equal(r.from, 1);
  assert.equal(r.doc.schemaVersion, SCHEMA_VERSION);
  assert.equal(r.invalid, 1, 'the "archived" entry is dropped and counted');
  assert.deepEqual(r.doc.items.map((i) => i.id), ['a1', 'a2', 'a3']);
  const done = r.doc.items.find((i) => i.id === 'a3');
  assert.equal(done?.completedAt, 3000, 'completedAt backfilled from updatedAt');
  assert.equal(r.doc.items.find((i) => i.id === 'a2')?.completedAt, undefined);
});

test('current-version documents pass through unchanged', () => {
  const doc = { schemaVersion: SCHEMA_VERSION, items: [{ id: 'x', title: 't', status: 'inbox', createdAt: 1, updatedAt: 1 }] };
  const r = migrate(doc);
  assert.ok(r.kind === 'ok' && r.from === SCHEMA_VERSION && r.invalid === 0);
  assert.deepEqual(r.kind === 'ok' && r.doc, doc);
});

test('migrating is idempotent: migrate(migrate(x).doc) === migrate(x).doc', () => {
  const first = migrate(v1Sample);
  assert.ok(first.kind === 'ok');
  const second = migrate(first.kind === 'ok' ? first.doc : null);
  assert.deepEqual(second.kind === 'ok' && second.doc, first.doc);
});

test('documents from a newer version are refused, not guessed at', () => {
  assert.deepEqual(migrate({ schemaVersion: SCHEMA_VERSION + 1, items: [] }), { kind: 'newer', version: SCHEMA_VERSION + 1 });
});

test('unrecognisable shapes are corrupt', () => {
  for (const bad of [null, {}, { schemaVersion: 2 }, { schemaVersion: 2, items: 'nope' }]) {
    assert.equal(migrate(bad).kind, 'corrupt', JSON.stringify(bad));
  }
});
