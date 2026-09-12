import { expect, test } from '@playwright/test';
import { capture, row, storedItems } from './helpers.ts';

test('items survive a reload', async ({ page }) => {
  await page.goto('/');
  await capture(page, 'Still here');
  await page.reload();
  await expect(row(page, 'Still here')).toBeVisible();
});

test('step-1 data is upgraded on first load', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => {
    localStorage.clear();
    localStorage.setItem('gtd:items', JSON.stringify([{ id: 'a', title: 'From step 1', status: 'inbox', createdAt: 1, updatedAt: 1 }]));
  });
  await page.reload();
  await expect(row(page, 'From step 1')).toBeVisible();
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('gtd:data')!).schemaVersion)).toBe(2);
});

test('a second tab sees captures from the first', async ({ page, context }) => {
  await page.goto('/');
  const other = await context.newPage();
  await other.goto('/');
  await capture(page, 'From tab A');
  await expect(row(other, 'From tab A')).toBeVisible();
});

test('data from a newer version makes the app read-only', async ({ page }) => {
  await page.goto('/');
  const newer = JSON.stringify({ schemaVersion: 99, items: [] });
  await page.evaluate((value) => localStorage.setItem('gtd:data', value), newer);
  await page.reload();
  await expect(page.getByText(/saved by a newer version/)).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem('gtd:data'))).toBe(newer);
});

test('unreadable data is set aside, and the app keeps working', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => localStorage.setItem('gtd:data', '{oops'));
  await page.reload();
  await expect(page.getByText('Your saved data could not be read.')).toBeVisible();
  await capture(page, 'After the damage');
  expect((await storedItems(page)).map((i) => i.title)).toEqual(['After the damage']);
});
