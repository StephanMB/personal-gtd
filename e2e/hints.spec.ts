import { expect, test } from '@playwright/test';
import { capture } from './helpers.ts';

/**
 * Explanation instead of training: one sentence, attached to the control it is
 * about, only when the situation it explains is true, and never twice.
 */
test('an explanation appears where it applies, and retires once you act on it', async ({ page }) => {
  await page.goto('/');
  await capture(page, 'Ring the dentist');
  await capture(page, 'Book the ferry');
  await capture(page, 'Sort the bike lights');

  // One at a time, and it is the one about what you are about to do.
  await expect(page.getByText('Decide once per item').first()).toBeVisible();
  await expect(page.getByText('Tag where it happens').first()).toBeHidden();

  await page.getByRole('button', { name: 'Clarify 3 items' }).click();
  await expect(page.getByText('One key per decision').first()).toBeVisible();

  await page.getByRole('navigation').getByRole('listitem').filter({ hasText: 'Inbox' }).getByRole('button').first().click();

  // Used, so it does not ask again; the next thing worth saying takes its turn.
  await expect(page.getByText('Decide once per item').first()).toBeHidden();
  await expect(page.getByText('Tag where it happens').first()).toBeVisible();

  // Remembered in the document, so it survives a reload and reaches a backup.
  await page.reload();
  await expect(page.getByText('Decide once per item').first()).toBeHidden();
  const dismissed = await page.evaluate(() => JSON.parse(localStorage.getItem('gtd:data')!).settings.dismissedHints);
  expect(dismissed).toContain('clarify-inbox');
});
