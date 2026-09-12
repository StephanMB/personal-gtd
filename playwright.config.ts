import { defineConfig, devices } from '@playwright/test';

/**
 * End-to-end tests against the PRODUCTION build (vite build + preview):
 * that is what nginx serves, and it is where a missing design-system import
 * or a CSS-lowering problem would show up.
 *
 * Every test gets a fresh browser context, so a fresh localStorage.
 * Waits are conditions (expect(...).toBeVisible()), never fixed timeouts.
 */
export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: 'http://localhost:4173',
    trace: 'retain-on-failure',
  },
  webServer: {
    command: 'npm run build && npm run preview -- --port 4173 --strictPort',
    url: 'http://localhost:4173',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
  projects: [
    // Desktop first: the full suite.
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
    // Phone in mind: only tests tagged @phone, at phone size with touch.
    { name: 'phone', use: { ...devices['Pixel 7'] }, grep: /@phone/ },
  ],
});
