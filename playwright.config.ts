// NOTE: This config file is deprecated - we now use playwriter MCP with vitest
// Kept for reference only. Tests are now run via vitest with playwriter setup.
// See tests/fixtures/playwriter-setup.ts for the new setup

import dotenv from 'dotenv';
import { devices } from '@playwright/test';

// Load test environment variables
dotenv.config({ path: '.env.test' });

/**
 * @deprecated - Use vitest with playwriter instead
 * @see tests/fixtures/playwriter-setup.ts for new setup
 */
export default {
  testDir: './tests/e2e',
  /* Run tests in files in parallel */
  fullyParallel: true,
  /* Fail the build on CI if you accidentally left test.only in the source code. */
  forbidOnly: !!process.env.CI,
  /* Retry on CI only */
  retries: process.env.CI ? 2 : 0,
  /* Opt out of parallel tests on CI. */
  workers: process.env.CI ? 1 : undefined,
  /* Reporter to use. See https://playwright.dev/docs/test-reporters */
  reporter: [
    ['html'],
    ['json', { outputFile: 'test-results.json' }],
    ['junit', { outputFile: 'test-results.xml' }]
  ],
  /* Shared settings for all the projects below. See https://playwright.dev/docs/api/class-testoptions. */
  use: {
    /* Base URL to use in actions like `await page.goto('/')`. */
    baseURL: 'http://127.0.0.1:5173',

    /* Collect trace when retrying the failed test. See https://playwright.dev/docs/trace-viewer */
    trace: 'on-first-retry',

    /* Take screenshot on failure */
    screenshot: 'only-on-failure',

    /* Video recording on failure */
    video: 'retain-on-failure',

    /* Global timeout for all tests */
    actionTimeout: 10000,
    navigationTimeout: 30000,
  },

  /* Configure projects for major browsers */
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },

    // Enrichment tests require longer timeouts for full flow testing
    {
      name: 'enrichment-tests',
      testMatch: '**/onboarding-v2-enrichment.spec.ts',
      timeout: 360000, // 6 minutes - allows for full enrichment process (up to 5 min) + buffer
      use: {
        ...devices['Desktop Chrome'],
        trace: 'on', // Always capture trace for debugging
        video: 'on', // Always record video for enrichment tests
        screenshot: 'on', // Capture screenshots for visual debugging
        actionTimeout: 30000, // 30s for individual actions
        navigationTimeout: 60000, // 60s for navigation
      },
    },

    // Disable other browsers for now to speed up testing
    // {
    //   name: 'firefox',
    //   use: { ...devices['Desktop Firefox'] },
    // },

    // {
    //   name: 'webkit',
    //   use: { ...devices['Desktop Safari'] },
    // },
  ],

  /* Run your local dev server before starting the tests */
  webServer: {
    command: 'npm run dev',
    url: 'http://127.0.0.1:5173',
    reuseExistingServer: !process.env.CI,
    timeout: 120 * 1000,
  },
});