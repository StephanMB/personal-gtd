import { expect, type Page } from '@playwright/test';

/**
 * Locators go by role and accessible name, the way a user (or a screen
 * reader) finds things. Playwright pierces open shadow roots, so this works
 * through NLDD's components without reaching into their internals.
 */
export const captureField = (page: Page) => page.getByRole('textbox', { name: 'Capture' });

export async function capture(page: Page, text: string): Promise<void> {
  await captureField(page).fill(text);
  await captureField(page).press('Enter');
  await expect(row(page, text.replace(/\s@\S+$/, ''))).toBeVisible();
}

/** The row of an item in the list on screen. */
export const row = (page: Page, title: string) => page.getByRole('listitem').filter({ hasText: title });

export const heading = (page: Page, text: string) => page.getByRole('heading', { name: text, level: 1 });

export const openList = (page: Page, name: string) => page.getByRole('navigation').getByRole('button', { name });

/** Raw app data, straight from localStorage. */
export const storedItems = (page: Page) =>
  page.evaluate(() => (JSON.parse(localStorage.getItem('gtd:data') ?? '{"items":[]}') as { items: { title: string; deletedAt?: number }[] }).items);
