import { expect, test } from '@playwright/test';
import { capture, row } from './helpers.ts';

/**
 * "At my laptop with twenty minutes, show me only what I can do here."
 *
 * The filter is in the URL rather than in memory, so this checks the part that
 * only a browser can: that a filtered list is still filtered after a reload.
 */
test('a list filters by context, and the filter survives a reload', async ({ page }) => {
  await page.goto('/');
  await capture(page, 'Ring the dentist @calls');
  await capture(page, 'Buy milk @errands');
  // Typed with a capital, which is the same context as the one above.
  await capture(page, 'Ring the vet @Calls');

  await page.getByRole('radio', { name: '@Calls' }).click();
  await expect(page).toHaveURL(/\?context=calls$/);
  await expect(row(page, 'Ring the dentist')).toBeVisible();
  await expect(row(page, 'Ring the vet')).toBeVisible();
  await expect(row(page, 'Buy milk')).toBeHidden();

  await page.reload();
  await expect(row(page, 'Buy milk')).toBeHidden();
  await expect(row(page, 'Ring the vet')).toBeVisible();

  await page.getByRole('radio', { name: 'All', exact: true }).click();
  await expect(page).toHaveURL(/\/inbox$/);
  await expect(row(page, 'Buy milk')).toBeVisible();
});

test('a filter with one option is not offered, because it could change nothing', async ({ page }) => {
  await page.goto('/');
  await capture(page, 'Buy milk @errands');
  await expect(page.getByRole('radio', { name: 'All', exact: true })).toBeHidden();

  await capture(page, 'Ring the vet @calls');
  await expect(page.getByRole('radio', { name: 'All', exact: true })).toBeVisible();
});
