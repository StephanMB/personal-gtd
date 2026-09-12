import { expect, test } from '@playwright/test';
import { capture, row } from './helpers.ts';

/**
 * The flow is the difference between a list and a method, and it is meant to
 * be done entirely from the keyboard, so that is how it is tested.
 */
test('clarify three items with the keyboard, and undo a wrong decision', async ({ page }) => {
  await page.goto('/');
  await capture(page, "Mom's birthday");
  await capture(page, 'Reply to Jan');
  await capture(page, 'Buy stamps');

  await page.getByRole('button', { name: 'Clarify 3 items' }).click();
  await expect(page).toHaveURL(/\/clarify$/);
  await expect(page.getByText('Item 1 of 3')).toBeVisible();

  // Rewrite the capture into the next physical action, then file it.
  await page.keyboard.press('e');
  const title = page.getByRole('textbox', { name: 'Edit the title' });
  await title.fill('Call the bakery about a cake');
  await title.press('Enter');
  await expect(page.getByText('Call the bakery about a cake')).toBeVisible();
  await page.keyboard.press('n');

  // Under two minutes: done straight from the inbox.
  await expect(page.getByText('Item 2 of 3')).toBeVisible();
  await page.keyboard.press('d');

  await expect(page.getByText('Item 3 of 3')).toBeVisible();
  await page.keyboard.press('t');
  await expect(page.getByText('Inbox zero. Nothing left to clarify.')).toBeVisible();

  // A wrong decision costs one keystroke to take back.
  await page.keyboard.press('ControlOrMeta+z');
  await expect(page.getByText('Item 3 of 3')).toBeVisible();

  await page.keyboard.press('Escape');
  await expect(page).toHaveURL(/\/inbox$/);

  await page.keyboard.press('2');
  await expect(row(page, 'Call the bakery about a cake')).toBeVisible();
  await page.keyboard.press('5');
  await expect(row(page, 'Reply to Jan')).toBeVisible();
});
