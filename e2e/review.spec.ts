import { expect, test } from '@playwright/test';
import { capture } from './helpers.ts';

/**
 * The review is what makes the rest trustworthy, so the pass itself is tested:
 * it finds you when overdue, walks the steps, and records that you did it.
 */
test('the weekly review walks the pass and records it', async ({ page }) => {
  await page.goto('/');
  await capture(page, 'Unprocessed thing');

  const review = page.getByRole('navigation').getByRole('listitem').filter({ hasText: 'Weekly review' });
  await expect(review).toContainText('Never reviewed');

  await review.getByRole('button').first().click();
  await expect(page).toHaveURL(/\/review$/);
  await expect(page.getByText('1. Empty the inbox')).toBeVisible();
  await expect(page.getByText('5. What you finished this week')).toBeVisible();

  // Exporting is the closing step, and it is recorded in the document itself.
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Export now' }).click(),
  ]);
  expect(download.suggestedFilename()).toMatch(/^gtd-backup-/);

  await page.getByRole('button', { name: 'Finish review' }).click();
  await expect(page).toHaveURL(/\/inbox$/);
  await expect(review).toContainText('Reviewed today');

  const settings = await page.evaluate(() => JSON.parse(localStorage.getItem('gtd:data')!).settings);
  expect(settings.lastReviewedAt).toBeGreaterThan(0);
  expect(settings.lastExportAt).toBeGreaterThan(0);
});
