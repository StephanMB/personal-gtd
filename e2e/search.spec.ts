import { expect, test } from '@playwright/test';
import { capture, heading, row } from './helpers.ts';

const field = (page: import('@playwright/test').Page) => page.getByRole('searchbox');

test('search finds a half-remembered word and lands you where it lives', async ({ page }) => {
  await page.goto('/');
  // Before anything is focused, so the single key is not typed into a field.
  await page.keyboard.press('/');
  await expect(heading(page, 'Search')).toBeVisible();
  await expect(field(page)).toBeFocused();

  await page.goto('/');
  await capture(page, 'Something Ruud said about the roof @home');
  await capture(page, 'Ring the dentist @calls');

  await page.getByRole('navigation').getByRole('button', { name: 'Search' }).click();
  await field(page).fill('roof');
  await expect(page).toHaveURL(/\/search\?q=roof$/);
  await expect(page.getByText('Something Ruud said about the roof')).toBeVisible();
  await expect(page.getByText('Ring the dentist')).toBeHidden();

  // An @tag searches across every list, not just the one you are on.
  await field(page).fill('@calls');
  await expect(page.getByText('Ring the dentist')).toBeVisible();
  await expect(page.getByText('Something Ruud said about the roof')).toBeHidden();

  // Enter takes the best match, which means the list it is actually on.
  await field(page).press('Enter');
  await expect(page).toHaveURL(/\/inbox$/);
  await expect(row(page, 'Ring the dentist')).toBeVisible();
});

test('a search that finds nothing says so, and says what it looked for', async ({ page }) => {
  await page.goto('/search?q=herring');
  await expect(page.getByText(/Nothing matches .herring./)).toBeVisible();
});
