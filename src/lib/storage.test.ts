import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createItem } from './gtd';
import {
  STORAGE_KEY,
  readItems,
  writeItems,
  quarantine,
  readLastExport,
  writeLastExport,
} from './storage';

/** A localStorage whose every access throws, like one blocked by browser settings. */
function blockedStorage(): Storage {
  const fail = () => {
    throw new DOMException('The operation is insecure.', 'SecurityError');
  };
  return { getItem: fail, setItem: fail, removeItem: fail, clear: fail, key: fail, length: 0 } as Storage;
}

/** A localStorage that can be read but refuses every write, like one that is full. */
function fullStorage(): Storage {
  const real = localStorage;
  return {
    getItem: (key: string) => real.getItem(key),
    setItem: () => {
      throw new DOMException('Quota exceeded', 'QuotaExceededError');
    },
    removeItem: (key: string) => real.removeItem(key),
    clear: () => real.clear(),
    key: (index: number) => real.key(index),
    get length() {
      return real.length;
    },
  } as Storage;
}

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('readItems / writeItems', () => {
  it('reports empty when nothing has been stored yet', () => {
    expect(readItems()).toEqual({ kind: 'empty' });
  });

  it('round-trips items through localStorage', () => {
    const item = createItem('Buy milk @errands');
    expect(writeItems([item])).toEqual({ ok: true });
    const result = readItems();
    expect(result.kind).toBe('ok');
    if (result.kind === 'ok') {
      expect(result.items).toEqual([item]);
      expect(result.invalid).toBe(0);
    }
  });

  it('reports malformed JSON as corrupt and keeps the raw text', () => {
    localStorage.setItem(STORAGE_KEY, '{not valid json');
    expect(readItems()).toEqual({ kind: 'corrupt', raw: '{not valid json' });
  });

  it('reports valid JSON that is not an array as corrupt', () => {
    localStorage.setItem(STORAGE_KEY, '{}');
    expect(readItems()).toEqual({ kind: 'corrupt', raw: '{}' });
  });

  it('keeps valid entries and counts the invalid ones', () => {
    const good = { id: 'x', title: 'ok', status: 'next', createdAt: 1, updatedAt: 1 };
    const bad = { id: 'y', title: 'bad', status: 'archived' };
    localStorage.setItem(STORAGE_KEY, JSON.stringify([good, bad]));
    const result = readItems();
    expect(result.kind).toBe('ok');
    if (result.kind === 'ok') {
      expect(result.items).toEqual([good]);
      expect(result.invalid).toBe(1);
    }
  });

  it('never writes, even when the data is unreadable', () => {
    localStorage.setItem(STORAGE_KEY, '{oops');
    readItems();
    expect(localStorage.length).toBe(1);
    expect(localStorage.getItem(STORAGE_KEY)).toBe('{oops');
  });

  it('reports unavailable instead of throwing when storage is blocked', () => {
    vi.stubGlobal('localStorage', blockedStorage());
    expect(readItems().kind).toBe('unavailable');
  });

  it('reports a failed write instead of throwing when storage is full', () => {
    vi.stubGlobal('localStorage', fullStorage());
    const result = writeItems([createItem('x')]);
    expect(result.ok).toBe(false);
  });
});

describe('quarantine', () => {
  it('copies the raw data under a timestamped key', () => {
    const key = quarantine('{oops');
    expect(key).toMatch(/^gtd:quarantine:\d{4}-\d{2}-\d{2}T/);
    expect(localStorage.getItem(key!)).toBe('{oops');
  });

  it('returns null when the copy cannot be written', () => {
    vi.stubGlobal('localStorage', fullStorage());
    expect(quarantine('{oops')).toBeNull();
  });
});

describe('readLastExport / writeLastExport', () => {
  it('returns null before the first export', () => {
    expect(readLastExport()).toBeNull();
  });

  it('round-trips the timestamp', () => {
    writeLastExport(1_700_000_000_000);
    expect(readLastExport()).toBe(1_700_000_000_000);
  });

  it('ignores a garbage value', () => {
    localStorage.setItem('gtd:lastExportAt', 'soon');
    expect(readLastExport()).toBeNull();
  });

  it('never throws when storage is blocked', () => {
    vi.stubGlobal('localStorage', blockedStorage());
    expect(() => writeLastExport(1)).not.toThrow();
    expect(readLastExport()).toBeNull();
  });
});
