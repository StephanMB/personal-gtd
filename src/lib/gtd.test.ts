import { describe, it, expect, beforeEach } from 'vitest';
import { loadItems, saveItems, createItem, parseCapture, actionButtons, type Item } from './gtd';

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
