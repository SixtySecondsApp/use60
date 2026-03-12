import dotenv from 'dotenv';
import { defineConfig, devices } from '@playwright/test';

// Load test environment variables
dotenv.config({ path: '.env.test' });

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: [
    ['html'],
    ['json', { outputFile: 'test-results.json' }],
    ...(process.env.CI ? [['junit' as const, { outputFile: 'test-results-e2e.xml' }]] : []),
  ],
  use: {
    baseURL: process.env.BASE_URL || 'http://127.0.0.1:5175',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    actionTimeout: 10000,
    navigationTimeout: 30000,
  },
  projects: [
    // Auth setup project — runs first to create shared auth state
    {
      name: 'setup',
      testMatch: /auth\.setup\.ts/,
      testDir: './tests/fixtures',
    },
    // Main tests — use authenticated state from setup
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        storageState: 'playwright/.auth/user.json',
      },
      dependencies: ['setup'],
    },
  ],
  webServer: process.env.CI
    ? undefined  // CI provides its own server
    : {
        command: 'npm run dev',
        url: 'http://127.0.0.1:5175',
        reuseExistingServer: true,
        timeout: 120 * 1000,
      },
});
