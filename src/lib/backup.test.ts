import { describe, it, expect } from 'vitest';
import { createItem } from './gtd';
import { serializeBackup, backupFilename } from './backup';

const NOW = new Date('2026-09-11T18:00:00.000Z');

describe('serializeBackup', () => {
  it('wraps the items in a versioned envelope', () => {
    const item = createItem('Buy milk @errands');
    expect(JSON.parse(serializeBackup([item], NOW))).toEqual({
      format: 'personal-gtd-backup',
      version: 1,
      exportedAt: '2026-09-11T18:00:00.000Z',
      items: [item],
    });
  });
});

describe('backupFilename', () => {
  it('names the file after the export date', () => {
    expect(backupFilename(NOW)).toBe('gtd-backup-2026-09-11.json');
  });
});
