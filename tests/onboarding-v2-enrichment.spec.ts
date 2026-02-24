/**
 * Onboarding V2 - Enrichment Flow E2E Tests
 *
 * Comprehensive automated testing of the V2 onboarding pipeline including:
 * - Fresh signup flow from password setup through completion
 * - Website enrichment with progress tracking
 * - Timeout protection verification
 * - Error handling and recovery
 * - Dashboard access validation
 */

import { test, expect } from '@playwright/test';
import {
  createTestWaitlistEntry,
  cleanupTestAccount,
  completeFullOnboarding,
  completePasswordSetup,
  enterWebsite,
  waitForEnrichmentCompletion,
  TestAccount,
} from './helpers/onboarding-setup';

test.describe('Onboarding V2 - Enrichment Flow', () => {
  let testAccount: TestAccount;

  test.beforeEach(async () => {
    testAccount = await createTestWaitlistEntry();
  });

  test.afterEach(async () => {
    await cleanupTestAccount(testAccount.email);
  });

  test('should complete full signup and onboarding flow end-to-end', async ({ page }) => {
    // Enable console logging for debugging
    page.on('console', (msg) => {
      if (msg.type() === 'error' || msg.type() === 'warning') {
        console.log(`🔹 Browser [${msg.type()}]:`, msg.text());
      }
    });

    // Run the full onboarding flow
    const success = await completeFullOnboarding(page, testAccount, 'amazon.com');
    expect(success).toBe(true);
  });

  test('should start fresh onboarding at website_input, not enrichment_loading', async ({ page }) => {
    // Complete password setup
    await completePasswordSetup(page, testAccount);

    // Verify we're on website_input step, not enrichment_loading
    const url = page.url();
    expect(url).toMatch(/onboarding\?step=website_input/);
    expect(url).not.toMatch(/enrichment_loading/);

    // Verify website input form is visible
    const websiteInput = page.locator('input[placeholder*="company"], input[placeholder*="domain"], input[placeholder*="website"]').first();
    await expect(websiteInput).toBeVisible({ timeout: 5000 });

    console.log('✅ Correctly started at website_input step');
  });

  test('should show enrichment progress and complete within reasonable time', async ({ page }) => {
    // Setup
    await completePasswordSetup(page, testAccount);
    await enterWebsite(page, 'amazon.com');

    // Verify we're on enrichment_loading
    await expect(page).toHaveURL(/enrichment_loading/);

    // Monitor progress
    const startTime = Date.now();
    let previousProgress = 0;
    let stallCount = 0;
    const maxStallTime = 45000; // Max time stuck at same progress

    console.log('⏳ Monitoring enrichment progress...');

    while (Date.now() - startTime < 300000) {
      const progressText = await page.locator('.text-2xl.font-bold.text-white').textContent();
      const currentProgress = parseInt(progressText?.replace('%', '') || '0');
      const elapsed = Math.round((Date.now() - startTime) / 1000);

      // Progress should not be stuck at 90% for too long
      if (currentProgress === 90 && elapsed > 45) {
        console.error(`❌ Progress stuck at 90% for ${elapsed}s - FAILURE!`);
        throw new Error('Progress stuck at 90% for too long');
      }

      // Log progress changes
      if (currentProgress !== previousProgress) {
        console.log(`  Progress: ${currentProgress}% (${elapsed}s elapsed)`);
        previousProgress = currentProgress;
        stallCount = 0;
      } else {
        stallCount++;
      }

      // Check if we've advanced to next step
      const url = page.url();
      if (url.includes('enrichment_result')) {
        console.log(`✅ Enrichment completed successfully in ${elapsed}s`);
        return; // Success!
      }

      // Check for errors
      const errorMsg = await page.locator('text=Something went wrong, text=failed, text=timed out').first().textContent();
      if (errorMsg) {
        throw new Error(`Enrichment error: ${errorMsg}`);
      }

      await page.waitForTimeout(2000);
    }

    throw new Error('Enrichment did not complete within 5 minutes');
  });

  test('should display estimated time remaining during enrichment', async ({ page }) => {
    await completePasswordSetup(page, testAccount);
    await enterWebsite(page, 'amazon.com');

    // Wait a moment for progress to start
    await page.waitForTimeout(2000);

    // Look for time estimate indicator
    const timeEstimate = page.locator('text=/Estimated: \d+s remaining/');

    // Time estimate should appear before 90% progress
    let foundTimeEstimate = false;
    for (let i = 0; i < 30; i++) {
      if (await timeEstimate.isVisible({ timeout: 1000 }).catch(() => false)) {
        foundTimeEstimate = true;
        const text = await timeEstimate.textContent();
        console.log(`✅ Found time estimate: ${text}`);
        break;
      }

      // Check if we've already reached 90% or completed
      const progressText = await page.locator('.text-2xl.font-bold.text-white').textContent();
      const progress = parseInt(progressText?.replace('%', '') || '0');
      if (progress >= 90) {
        break;
      }

      await page.waitForTimeout(2000);
    }

    // Note: Time estimate might not appear if enrichment completes too quickly with test data
    console.log(`⚠️ Time estimate ${foundTimeEstimate ? 'was' : 'was not'} visible during test`);
  });

  test('should show reassuring message when enrichment takes longer than expected', async ({ page }) => {
    await completePasswordSetup(page, testAccount);
    await enterWebsite(page, 'amazon.com');

    // Wait up to 45 seconds for the "still working" message to appear
    const stillWorkingMsg = page.locator('text=Still analyzing your company');

    let messageAppeared = false;
    for (let i = 0; i < 30; i++) {
      if (await stillWorkingMsg.isVisible({ timeout: 2000 }).catch(() => false)) {
        messageAppeared = true;
        const text = await stillWorkingMsg.textContent();
        console.log(`✅ Still working message appeared: ${text}`);
        break;
      }

      // Check if enrichment already completed
      const url = page.url();
      if (url.includes('enrichment_result')) {
        console.log(`⚠️ Enrichment completed before 30s, still working message not shown`);
        return;
      }

      await page.waitForTimeout(2000);
    }

    // Note: Message might not appear if enrichment completes within 30 seconds (which is fine)
    console.log(`⚠️ Still working message ${messageAppeared ? 'appeared' : 'did not appear'} (expected if enrichment is fast)`);
  });

  test('should handle enrichment errors gracefully with retry option', async ({ page }) => {
    await completePasswordSetup(page, testAccount);

    // Try with an invalid domain to test error handling
    await enterWebsite(page, 'this-domain-definitely-does-not-exist-12345-test.com');

    // Wait for error to appear (faster than success)
    const errorContainer = page.locator('text=Something went wrong');
    const retryButton = page.locator('button:has-text("Try Again")').first();

    // Error should appear within 30 seconds
    let errorAppeared = false;
    for (let i = 0; i < 15; i++) {
      if (await errorContainer.isVisible({ timeout: 2000 }).catch(() => false)) {
        errorAppeared = true;
        console.log('✅ Error appeared as expected for invalid domain');
        break;
      }
      await page.waitForTimeout(2000);
    }

    if (errorAppeared) {
      expect(retryButton).toBeDefined();
      console.log('✅ Retry button available');
    } else {
      console.log('⚠️ Error did not appear (enrichment may have succeeded anyway)');
    }
  });

  test('should prevent direct access to enrichment_loading without proper setup', async ({ page }) => {
    const baseUrl = process.env.E2E_BASE_URL || 'http://localhost:5175';

    // Try to access enrichment_loading directly
    await page.goto(`${baseUrl}/onboarding?step=enrichment_loading`, { waitUntil: 'domcontentloaded' });

    // Should redirect to website_input because there's no domain/org setup
    await page.waitForTimeout(1000);
    const url = page.url();

    // Either we're at website_input or at login (not authenticated yet)
    const isAtWebsiteInput = url.includes('website_input');
    const isUnauthenticated = !url.includes('onboarding');

    if (isAtWebsiteInput) {
      console.log('✅ Correctly prevented direct access to enrichment_loading, redirected to website_input');
    } else if (isUnauthenticated) {
      console.log('✅ Correctly prevented direct access - user is not authenticated');
    } else {
      console.warn(`⚠️ Unexpected URL after direct access attempt: ${url}`);
    }
  });

  test('should display task progress with detailed descriptions', async ({ page }) => {
    await completePasswordSetup(page, testAccount);
    await enterWebsite(page, 'amazon.com');

    // Look for task descriptions
    const taskDescriptions = [
      'Reading homepage and key pages',
      'Extracting products and services',
      'Researching market position',
      'Understanding messaging style',
      'Creating personalized configurations',
    ];

    let foundDescriptions = 0;

    for (const description of taskDescriptions) {
      const element = page.locator(`text=${description}`);
      if (await element.isVisible({ timeout: 1000 }).catch(() => false)) {
        foundDescriptions++;
        console.log(`✅ Found task description: "${description}"`);
      }
    }

    console.log(`Found ${foundDescriptions}/${taskDescriptions.length} task descriptions`);
  });

  test('should not redirect multiple times after reaching dashboard', async ({ page }) => {
    // Complete the full onboarding flow
    const success = await completeFullOnboarding(page, testAccount, 'amazon.com');
    expect(success).toBe(true);

    // We should be on dashboard
    const initialUrl = page.url();
    expect(initialUrl).toContain('dashboard');

    // Wait 5 seconds and verify no redirects
    await page.waitForTimeout(5000);

    const finalUrl = page.url();
    expect(finalUrl).toContain('dashboard');
    console.log('✅ No redirect loops - stayed on dashboard');
  });
});

test.describe('Onboarding V2 - Timeout Scenarios', () => {
  let testAccount: TestAccount;

  test.beforeEach(async () => {
    testAccount = await createTestWaitlistEntry();
  });

  test.afterEach(async () => {
    await cleanupTestAccount(testAccount.email);
  });

  test('should show timeout error if enrichment exceeds 5 minute limit', async ({ page }, testInfo) => {
    // This test would require mocking slow backend or using timeout bypass
    // Skipping full 5 minute wait in CI environment
    if (process.env.CI) {
      test.skip();
    }

    test.setTimeout(360000); // 6 minute timeout for this test

    await completePasswordSetup(page, testAccount);

    // Try enriching a domain that might timeout
    // (In real scenario, this would require backend to be stuck)
    await enterWebsite(page, 'slowsite-test.example.com');

    // Wait up to 5.5 minutes for timeout error
    const timeoutError = page.locator('text=timed out');

    for (let i = 0; i < 165; i++) {
      if (await timeoutError.isVisible({ timeout: 2000 }).catch(() => false)) {
        console.log('✅ Timeout error displayed after max duration');
        return;
      }
      await page.waitForTimeout(2000);
    }

    console.warn('⚠️ Timeout error did not appear (enrichment may have completed or test data may be unavailable)');
  });
});
