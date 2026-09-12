import { test } from 'node:test';
import assert from 'node:assert/strict';
import { serializeBackup, parseBackup } from './backup.ts';

const item = { id: 'a', title: 'A', status: 'done', createdAt: 1, updatedAt: 2 } as const;

test('a round trip keeps tombstones, and carries every collection', () => {
  const items = [{ ...item, completedAt: 2 }, { id: 't', title: 'gone', status: 'inbox' as const, createdAt: 1, updatedAt: 5, deletedAt: 5 }];
  const projects = [{ id: 'p1', title: 'Kitchen painted', status: 'active' as const, createdAt: 1, updatedAt: 1 }];
  const r = parseBackup(serializeBackup({ items, projects, settings: {} }));
  assert.ok(r.ok);
  assert.deepEqual(r.ok && r.items, items);
  assert.deepEqual(r.ok && r.projects, projects, 'projects export without the backup format changing');
});

test('step-1 backup files (v1) are migrated on import', () => {
  const v1File = JSON.stringify({ format: 'personal-gtd-backup', version: 1, exportedAt: 'x', items: [item] });
  const r = parseBackup(v1File);
  assert.ok(r.ok);
  assert.equal(r.ok && r.items[0].completedAt, 2);
});

test('bare arrays and raw v2 storage values are accepted', () => {
  assert.ok(parseBackup(JSON.stringify([item])).ok);
  assert.ok(parseBackup(JSON.stringify({ schemaVersion: 2, items: [] })).ok, 'a raw storage value from an older schema');
});

test('newer, foreign and damaged files are refused with a reason', () => {
  const newerEnvelope = parseBackup(JSON.stringify({ format: 'personal-gtd-backup', version: 3 }));
  const newerSchema = parseBackup(JSON.stringify({ format: 'personal-gtd-backup', version: 2, data: { schemaVersion: 9, items: [] } }));
  assert.match(!newerEnvelope.ok ? newerEnvelope.error : '', /newer version/);
  assert.match(!newerSchema.ok ? newerSchema.error : '', /newer version/);
  assert.equal(parseBackup('{"foo":1}').ok, false);
  assert.equal(parseBackup('not json').ok, false);
  assert.equal(parseBackup(JSON.stringify({ format: 'personal-gtd-backup', version: 2, data: {} })).ok, false);
});
