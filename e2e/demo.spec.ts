import { expect, test } from '@playwright/test';
import { capture, row } from './helpers.ts';

/**
 * A demo you cannot tell apart from your own data would be worse than no demo,
 * so this checks both halves: that it is full enough to be worth looking at,
 * and that your own document is not touched while it runs.
 */
test('the demo is a sandbox: a full system to look at, your own lists untouched', async ({ page }) => {
  await page.goto('/');
  await capture(page, 'My own real item');

  await page.getByRole('button', { name: 'Try a demo' }).click();
  await expect(page).toHaveURL(/\?demo$/);
  await expect(page.getByText('Demo data').first()).toBeVisible();

  // Full enough that the things which are otherwise hard to see are on screen.
  const nav = page.getByRole('navigation');
  await expect(nav).toContainText('1 project with no next action');
  await expect(nav).toContainText('Reviewed 9 days ago');

  const real = await page.evaluate(() =>
    (JSON.parse(localStorage.getItem('gtd:data')!).items as { title: string }[]).map((item) => item.title),
  );
  expect(real).toEqual(['My own real item']);

  await page.getByRole('button', { name: 'Leave the demo' }).click();
  await expect(page).toHaveURL(/\/inbox$/);
  // A capture lands in the inbox, which is where leaving the demo puts us.
  await expect(row(page, 'My own real item')).toBeVisible();
  await expect(nav).not.toContainText('1 project with no next action');
});
