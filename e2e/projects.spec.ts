import { expect, test } from '@playwright/test';
import { capture, row } from './helpers.ts';

/**
 * The reason projects are worth an entity: a plain list can never tell you
 * which outcomes have stopped moving.
 */
test('a capture becomes a project, and says so while it has no next action', async ({ page }) => {
  await page.goto('/');
  await capture(page, 'Mom birthday celebrated');

  await page.getByRole('button', { name: 'Clarify 1 item' }).click();
  await page.keyboard.press('p');
  await expect(page.getByText('Inbox zero. Nothing left to clarify.')).toBeVisible();

  // The sidebar keeps one row however many projects there are, and says in red
  // how many of them nothing is moving.
  // The row itself carries the text; its inner button is in a shadow root and
  // reads as empty, so assert on the row and click the button inside it.
  const projects = page.getByRole('navigation').getByRole('listitem').filter({ hasText: 'Projects' });
  await expect(projects).toContainText('1 project with no next action');

  await projects.getByRole('button').first().click();
  await expect(page).toHaveURL(/\/projects$/);
  const projectRow = page.getByRole('listitem').filter({ hasText: 'Mom birthday celebrated' });
  await expect(projectRow).toContainText('No next action');

  await projectRow.getByRole('button').first().click();
  await expect(page).toHaveURL(/\/projects\/.+/);

  // What you add here is already clarified, so it becomes a next action.
  const field = page.getByRole('textbox', { name: 'Add the next action' });
  await field.fill('Ring the bakery');
  await field.press('Enter');
  await expect(row(page, 'Ring the bakery')).toBeVisible();
  await expect(projects).not.toContainText('no next action');

  // Focus is still in the field after Enter, where single-key shortcuts are
  // deliberately dead, so leave the way a user would.
  await page.getByRole('navigation').getByRole('listitem').filter({ hasText: 'Next actions' }).getByRole('button').first().click();
  // The tag renders its text inside a shadow root, which getByText sees and
  // the row's own textContent does not.
  await expect(row(page, 'Ring the bakery').getByText('Mom birthday celebrated')).toBeVisible();

  // Finishing the last action stalls it again: the nudge the method depends on.
  await page.getByRole('button', { name: 'Done: Ring the bakery' }).click();
  await expect(projects).toContainText('1 project with no next action');
});
