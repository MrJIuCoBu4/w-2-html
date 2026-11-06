import { defineConfig, devices } from '@playwright/test'

/**
 * Functional E2E suite for the dual-pane editor.
 * Runs against the Vite dev server (same as `npm run dev`).
 */
export default defineConfig({
  testDir: './tests/e2e',
  timeout: 30_000,
  expect: { timeout: 10_000 },
  fullyParallel: true,
  retries: 0,
  workers: process.env.CI ? 2 : undefined,
  reporter: [['list']],
  use: {
    baseURL: 'http://localhost:5199',
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: {
    command: 'npm run dev -- --port 5199 --strictPort',
    url: 'http://localhost:5199',
    reuseExistingServer: true,
    timeout: 60_000,
  },
})
