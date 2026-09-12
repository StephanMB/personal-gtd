import { readFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';
import { capture, row } from './helpers.ts';

test('export, wipe, import: everything comes back, and import is undoable', async ({ page }) => {
  await page.goto('/');
  await capture(page, 'Worth keeping');

  const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Export' }).click()]);
  expect(download.suggestedFilename()).toMatch(/^gtd-backup-\d{4}-\d{2}-\d{2}\.json$/);
  const path = await download.path();
  const file = JSON.parse(await readFile(path, 'utf8'));
  expect(file.version).toBe(2);
  await expect(page.getByText('Last export: today.')).toBeVisible();

  await page.evaluate(() => localStorage.removeItem('gtd:data'));
  await page.reload();
  await expect(row(page, 'Worth keeping')).toBeHidden();

  await page.getByTestId('import-file').setInputFiles(path);
  await expect(page.getByText('Imported: 1 new, 0 updated, 0 deleted.')).toBeVisible();
  await expect(row(page, 'Worth keeping')).toBeVisible();

  await page.getByRole('button', { name: 'Undo' }).click();
  await expect(row(page, 'Worth keeping')).toBeHidden();
});

test('a file that is not a backup is refused with a reason', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('import-file').setInputFiles({ name: 'x.json', mimeType: 'application/json', buffer: Buffer.from('{"foo":1}') });
  await expect(page.getByText(/does not look like a Personal GTD backup/)).toBeVisible();
});
