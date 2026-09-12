import { expect, test } from '@playwright/test';
import { capture, heading, openList, row } from './helpers.ts';

test.beforeEach(async ({ page }) => {
  await page.goto('/');
});

test('clarify, complete, and undo with the keyboard', async ({ page }) => {
  await capture(page, 'Call dentist');
  await page.getByRole('button', { name: 'Next: Call dentist' }).click();
  await expect(row(page, 'Call dentist')).toBeHidden();

  await openList(page, 'Next actions').click();
  await expect(heading(page, 'Next actions')).toBeVisible();
  await page.getByRole('button', { name: 'Done: Call dentist' }).click();

  await page.keyboard.press('5');
  await expect(page).toHaveURL(/\/done$/);
  await expect(row(page, 'Call dentist')).toBeVisible();

  await page.keyboard.press('ControlOrMeta+z');
  await expect(row(page, 'Call dentist')).toBeHidden();
  await page.keyboard.press('2');
  await expect(row(page, 'Call dentist')).toBeVisible();
});

test('delete, then undo from the notification', async ({ page }) => {
  await capture(page, 'Oops');
  await page.getByRole('button', { name: 'Delete "Oops"' }).click();
  await expect(row(page, 'Oops')).toBeHidden();
  await page.getByRole('button', { name: 'Undo' }).click();
  await expect(row(page, 'Oops')).toBeVisible();
});

test('the URL is the source of truth for the view', async ({ page }) => {
  await page.goto('/waiting');
  await expect(heading(page, 'Waiting for')).toBeVisible();

  await page.goto('/does-not-exist');
  await expect(page).toHaveURL(/\/inbox$/);

  await openList(page, 'Someday / maybe').click();
  await page.goBack();
  await expect(heading(page, 'Inbox')).toBeVisible();
});
