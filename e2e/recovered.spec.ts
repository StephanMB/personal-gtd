import { expect, test } from '@playwright/test';

/**
 * The loop the safety mechanism opens: data set aside because it could not be
 * read has to be reachable from the app, not only from the browser console.
 */
test('data set aside can be downloaded, cleared, and brought back', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => localStorage.setItem('gtd:quarantine:2026-09-10T09:15:00.000Z', '{oops'));
  await page.reload();

  const row = page.getByRole('listitem').filter({ hasText: 'Set aside' });
  await expect(row).toBeVisible();

  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: /^Download the copy/ }).click(),
  ]);
  expect(download.suggestedFilename()).toMatch(/^gtd-recovered-/);

  await page.getByRole('button', { name: /^Delete the copy/ }).click();
  await expect(page.getByText('Recovered copy deleted.')).toBeVisible();
  await expect(row).toBeHidden();

  await page.getByRole('button', { name: 'Undo' }).click();
  await expect(row).toBeVisible();
});
