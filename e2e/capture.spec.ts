import { expect, test } from '@playwright/test';
import { capture, captureField, row, storedItems } from './helpers.ts';

test.beforeEach(async ({ page }) => {
  await page.goto('/');
});

test('captures into the inbox, with a context tag @phone', async ({ page }) => {
  await capture(page, 'Buy milk @errands');
  await expect(row(page, 'Buy milk').getByText('@errands')).toBeVisible();
  await expect(captureField(page)).toHaveValue('');
});

test('the Add button submits too @phone', async ({ page }) => {
  await captureField(page).fill('Tapped');
  await page.getByRole('button', { name: 'Add' }).click();
  await expect(row(page, 'Tapped')).toBeVisible();
});

test('never splits an email address into a context', async ({ page }) => {
  await capture(page, 'Email jan@minbzk.nl');
  expect((await storedItems(page))[0].title).toBe('Email jan@minbzk.nl');
});

test('c focuses the capture field from anywhere', async ({ page }) => {
  await page.getByRole('heading', { level: 1, name: 'Inbox' }).click();
  await page.keyboard.press('c');
  await page.keyboard.type('Typed after pressing c');
  await page.keyboard.press('Enter');
  await expect(row(page, 'Typed after pressing c')).toBeVisible();
});
