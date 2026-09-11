import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { loadItems, saveItems, createItem, newId, parseCapture, actionButtons, type Item } from './gtd';

beforeEach(() => {
  localStorage.clear();
});

describe('parseCapture', () => {
  it('splits a trailing @context off the title', () => {
    expect(parseCapture('Buy milk @errands')).toEqual({ title: 'Buy milk', context: 'errands' });
  });

  it('leaves context undefined when there is no @', () => {
    expect(parseCapture('Call the dentist')).toEqual({ title: 'Call the dentist' });
  });

  it('trims surrounding whitespace', () => {
    expect(parseCapture('  Buy milk   @errands  ')).toEqual({
      title: 'Buy milk',
      context: 'errands',
    });
  });

  it('does not split an @ in the middle of a word', () => {
    expect(parseCapture('Email jan@minbzk.nl')).toEqual({ title: 'Email jan@minbzk.nl' });
  });

  it('keeps the whole input when stripping the context would leave an empty title', () => {
    expect(parseCapture('@errands')).toEqual({ title: '@errands' });
  });

  it('only takes the last context', () => {
    expect(parseCapture('Fix bike @home @weekend')).toEqual({
      title: 'Fix bike @home',
      context: 'weekend',
    });
  });
});

describe('newId', () => {
  const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('returns a v4 UUID', () => {
    expect(newId()).toMatch(UUID_V4);
  });

  it('falls back to getRandomValues when randomUUID is missing (insecure context)', () => {
    const real = globalThis.crypto;
    vi.stubGlobal('crypto', { getRandomValues: real.getRandomValues.bind(real) });
    const a = newId();
    const b = newId();
    expect(a).toMatch(UUID_V4);
    expect(b).toMatch(UUID_V4);
    expect(a).not.toBe(b);
  });
});

describe('createItem', () => {
  it('starts new items in the inbox with a fresh id and timestamps', () => {
    const item = createItem('Buy milk @errands');
    expect(item.status).toBe('inbox');
    expect(item.title).toBe('Buy milk');
    expect(item.context).toBe('errands');
    expect(item.id).toBeTruthy();
    expect(item.createdAt).toBe(item.updatedAt);
  });

  it('gives two items distinct ids', () => {
    const a = createItem('First');
    const b = createItem('Second');
    expect(a.id).not.toBe(b.id);
  });
});

describe('loadItems / saveItems', () => {
  it('round-trips items through localStorage', () => {
    const item = createItem('Buy milk @errands');
    saveItems([item]);
    expect(loadItems()).toEqual([item]);
  });

  it('returns [] when nothing has been stored yet', () => {
    expect(loadItems()).toEqual([]);
  });

  it('returns [] on malformed JSON instead of throwing', () => {
    localStorage.setItem('gtd:items', '{not valid json');
    expect(loadItems()).toEqual([]);
  });

  it('returns [] when the stored value is valid JSON but not an array', () => {
    localStorage.setItem('gtd:items', JSON.stringify({ oops: 'not a list' }));
    expect(loadItems()).toEqual([]);
  });
});

describe('actionButtons', () => {
  const withStatus = (status: Item['status']): Item => ({
    id: '1',
    title: 'x',
    status,
    createdAt: 0,
    updatedAt: 0,
  });

  it('offers the three clarify targets from inbox', () => {
    const statuses = actionButtons(withStatus('inbox')).map((a) => a.status);
    expect(statuses).toEqual(['next', 'waiting', 'someday']);
  });

  it('offers done from next and waiting', () => {
    expect(actionButtons(withStatus('next')).map((a) => a.status)).toContain('done');
    expect(actionButtons(withStatus('waiting')).map((a) => a.status)).toContain('done');
  });

  it('does not offer done directly from someday', () => {
    const statuses = actionButtons(withStatus('someday')).map((a) => a.status);
    expect(statuses).not.toContain('done');
  });

  it('only offers reopening a done item', () => {
    const actions = actionButtons(withStatus('done'));
    expect(actions).toEqual([{ label: '↺ Reopen', status: 'next' }]);
  });
});
