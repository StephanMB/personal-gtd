import { describe, it, expect } from 'vitest';
import { createItem, type Item } from './gtd';
import { serializeBackup, backupFilename, parseBackup, mergeItems } from './backup';

const NOW = new Date('2026-09-11T18:00:00.000Z');

const item = (id: string, updatedAt: number, title = id): Item => ({
  id,
  title,
  status: 'inbox',
  createdAt: 1,
  updatedAt,
});

describe('serializeBackup', () => {
  it('wraps the items in a versioned envelope', () => {
    const created = createItem('Buy milk @errands');
    expect(JSON.parse(serializeBackup([created], NOW))).toEqual({
      format: 'personal-gtd-backup',
      version: 1,
      exportedAt: '2026-09-11T18:00:00.000Z',
      items: [created],
    });
  });
});

describe('backupFilename', () => {
  it('names the file after the export date', () => {
    expect(backupFilename(NOW)).toBe('gtd-backup-2026-09-11.json');
  });
});

describe('parseBackup', () => {
  it('reads what serializeBackup writes', () => {
    const items = [item('a', 1), item('b', 2)];
    expect(parseBackup(serializeBackup(items, NOW))).toEqual({ ok: true, items, invalid: 0 });
  });

  it('accepts a bare array, such as a raw localStorage dump', () => {
    const items = [item('a', 1)];
    expect(parseBackup(JSON.stringify(items))).toEqual({ ok: true, items, invalid: 0 });
  });

  it('skips and counts invalid entries', () => {
    const text = JSON.stringify([item('a', 1), { id: 'y', status: 'archived' }, 'junk']);
    expect(parseBackup(text)).toEqual({ ok: true, items: [item('a', 1)], invalid: 2 });
  });

  it('rejects text that is not JSON', () => {
    expect(parseBackup('{oops')).toEqual({ ok: false, error: 'The file is not valid JSON.' });
  });

  it('rejects unrelated JSON', () => {
    expect(parseBackup('{"name":"package.json"}')).toEqual({
      ok: false,
      error: 'This does not look like a Personal GTD backup.',
    });
  });

  it('rejects an unsupported version', () => {
    const text = JSON.stringify({ format: 'personal-gtd-backup', version: 2, items: [] });
    expect(parseBackup(text)).toEqual({ ok: false, error: 'Unsupported backup version: 2.' });
  });

  it('rejects a backup without an item list', () => {
    const text = JSON.stringify({ format: 'personal-gtd-backup', version: 1 });
    expect(parseBackup(text)).toEqual({ ok: false, error: 'The backup has no item list.' });
  });
});

describe('mergeItems', () => {
  it('adds items with new ids', () => {
    const result = mergeItems([item('a', 1)], [item('b', 1)]);
    expect(result.items.map((i) => i.id)).toEqual(['a', 'b']);
    expect(result).toMatchObject({ added: 1, updated: 0 });
  });

  it('is a no-op when the same items are imported again', () => {
    const current = [item('a', 1), item('b', 2)];
    const result = mergeItems(current, current);
    expect(result.items).toEqual(current);
    expect(result).toMatchObject({ added: 0, updated: 0 });
  });

  it('keeps the current version when the incoming one is older', () => {
    const result = mergeItems([item('a', 5, 'new')], [item('a', 3, 'old')]);
    expect(result.items).toEqual([item('a', 5, 'new')]);
    expect(result).toMatchObject({ added: 0, updated: 0 });
  });

  it('takes the incoming version when it is newer', () => {
    const result = mergeItems([item('a', 3, 'old')], [item('a', 5, 'new')]);
    expect(result.items).toEqual([item('a', 5, 'new')]);
    expect(result).toMatchObject({ added: 0, updated: 1 });
  });

  it('never removes items that are not in the import', () => {
    const result = mergeItems([item('a', 1), item('b', 1)], []);
    expect(result.items.map((i) => i.id)).toEqual(['a', 'b']);
  });
});
