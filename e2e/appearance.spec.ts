import { expect, test } from '@playwright/test';
import { openList, openSettings } from './helpers.ts';

/**
 * Both choices live in the document rather than in this browser, so they
 * survive a reload, travel with a backup and are the same in every tab.
 */
test('appearance and language are chosen once and remembered', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('navigation')).toContainText('Next actions');
  await openSettings(page);

  await page.getByRole('radio', { name: 'Dark' }).click();
  await expect
    .poll(() => page.evaluate(() => document.documentElement.style.colorScheme))
    .toBe('dark');

  await page.getByRole('radio', { name: 'Nederlands' }).click();
  await expect(page.getByRole('navigation')).toContainText('Eerstvolgende acties');
  await expect(page.getByRole('navigation')).toContainText('Wekelijkse review');

  await page.reload();
  await expect(page.getByRole('navigation')).toContainText('Eerstvolgende acties');
  // The choice is remembered, so the page it was made on is beside the point.
  await openList(page, 'Instellingen').click();
  expect(await page.evaluate(() => document.documentElement.style.colorScheme)).toBe('dark');
  expect(await page.evaluate(() => document.documentElement.lang)).toBe('nl');

  const settings = await page.evaluate(() => JSON.parse(localStorage.getItem('gtd:data')!).settings);
  expect(settings).toMatchObject({ theme: 'dark', language: 'nl' });

  // And back, without a reload in between.
  await page.getByRole('radio', { name: 'Systeem' }).click();
  await expect
    .poll(() => page.evaluate(() => document.documentElement.style.colorScheme))
    .toBe('light dark');
});
