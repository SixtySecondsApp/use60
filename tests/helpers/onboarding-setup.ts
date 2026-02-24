/**
 * Onboarding E2E Test Helpers
 *
 * Utilities for setting up test accounts and completing onboarding flows
 * for automated testing of the V2 onboarding pipeline.
 */

import { Page, expect } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';

// Initialize Supabase client for test setup
const supabaseUrl = process.env.VITE_SUPABASE_URL || 'http://localhost:54321';
const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY || '';

const supabase = createClient(supabaseUrl, supabaseAnonKey);

export interface TestAccount {
  email: string;
  token: string;
  waitlistEntryId: string;
  firstName: string;
  lastName: string;
  password: string;
}

/**
 * Creates a test account and waitlist entry for onboarding testing
 */
export async function createTestWaitlistEntry(): Promise<TestAccount> {
  const timestamp = new Date().toISOString().replace(/[-:.TZ]/g, '');
  const token = crypto.getRandomValues(new Uint8Array(32))
    .reduce((acc, val) => acc + val.toString(16).padStart(2, '0'), '');

  const testAccount: TestAccount = {
    email: `test-onboarding-${timestamp}@test.example.com`,
    token,
    waitlistEntryId: '',
    firstName: 'Test',
    lastName: 'Onboarding',
    password: 'TestPassword123!',
  };

  try {
    // Create waitlist entry
    const { data: entry, error: entryError } = await supabase
      .from('meetings_waitlist')
      .insert({
        email: testAccount.email,
        full_name: `${testAccount.firstName} ${testAccount.lastName}`,
        company_name: 'Test Company Ltd',
        referral_code: `TEST${timestamp.slice(0, 12)}`,
        status: 'released',
      })
      .select('id')
      .single();

    if (entryError || !entry) {
      throw new Error(`Failed to create waitlist entry: ${entryError?.message || 'Unknown error'}`);
    }

    testAccount.waitlistEntryId = entry.id;

    // Create magic token for password setup
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 1);

    const { error: tokenError } = await supabase
      .from('waitlist_magic_tokens')
      .insert({
        token: testAccount.token,
        waitlist_entry_id: entry.id,
        email: testAccount.email,
        expires_at: expiresAt.toISOString(),
      });

    if (tokenError) {
      throw new Error(`Failed to create magic token: ${tokenError.message}`);
    }

    console.log(`✅ Created test account: ${testAccount.email}`);
    return testAccount;
  } catch (error) {
    console.error('❌ Error creating test account:', error);
    throw error;
  }
}

/**
 * Cleans up test account and related data
 */
export async function cleanupTestAccount(email: string) {
  try {
    // Delete in order of dependencies
    await supabase.from('waitlist_magic_tokens').delete().eq('email', email);
    await supabase.from('meetings_waitlist').delete().eq('email', email);
    console.log(`✅ Cleaned up test account: ${email}`);
  } catch (error) {
    console.error('❌ Error cleaning up test account:', error);
    // Don't throw - cleanup should be best-effort
  }
}

/**
 * Completes the password setup step during signup
 */
export async function completePasswordSetup(page: Page, account: TestAccount) {
  const baseUrl = process.env.E2E_BASE_URL || 'http://localhost:5175';

  // Navigate to set password page
  await page.goto(
    `${baseUrl}/auth/set-password?token=${account.token}&waitlist_entry=${account.waitlistEntryId}`,
    { waitUntil: 'domcontentloaded' }
  );

  // Wait for form to be visible
  await expect(page.locator('input')).first().toBeVisible({ timeout: 5000 });

  // Fill form fields
  const firstNameInput = page.locator('input[id*="firstName"], input[placeholder*="First"]').first();
  const lastNameInput = page.locator('input[id*="lastName"], input[placeholder*="Last"]').first();
  const passwordInput = page.locator('input[id*="password"], input[type="password"]').first();
  const confirmInput = page.locator('input[id*="confirm"], input[type="password"]').last();

  await firstNameInput.fill(account.firstName);
  await lastNameInput.fill(account.lastName);
  await passwordInput.fill(account.password);
  await confirmInput.fill(account.password);

  // Submit form
  const submitButton = page.locator('button[type="submit"], button:has-text("Continue"), button:has-text("Create Account")').first();
  await submitButton.click();

  // Wait for redirect to onboarding
  await page.waitForURL(/.*onboarding.*/, { timeout: 10000 });

  console.log(`✅ Password setup completed for ${account.email}`);
}

/**
 * Navigates to a specific onboarding step
 */
export async function goToOnboardingStep(page: Page, step: string) {
  const baseUrl = process.env.E2E_BASE_URL || 'http://localhost:5175';
  await page.goto(`${baseUrl}/onboarding?step=${step}`, { waitUntil: 'domcontentloaded' });
  console.log(`✅ Navigated to onboarding step: ${step}`);
}

/**
 * Enters a company website in the website_input step
 */
export async function enterWebsite(page: Page, domain: string) {
  // Wait for input field to be visible
  const websiteInput = page.locator('input[placeholder*="company"], input[placeholder*="domain"], input[placeholder*="website"]').first();
  await expect(websiteInput).toBeVisible({ timeout: 5000 });

  // Clear and fill input
  await websiteInput.fill(domain);

  // Find and click Continue button
  const continueButton = page.locator('button:has-text("Continue"), button:has-text("Next")').first();
  await expect(continueButton).toBeVisible({ timeout: 2000 });
  await continueButton.click();

  console.log(`✅ Entered website: ${domain}`);
}

/**
 * Waits for enrichment to complete with timeout protection
 * Returns true if enrichment completed, false if timeout occurred
 */
export async function waitForEnrichmentCompletion(page: Page, timeout: number = 300000): Promise<boolean> {
  const startTime = Date.now();
  let lastProgress = 0;
  let progressCheckCount = 0;

  console.log('⏳ Waiting for enrichment to complete (max', Math.round(timeout / 1000), 'seconds)...');

  while (Date.now() - startTime < timeout) {
    // Check current progress
    const progressText = await page.locator('.text-2xl.font-bold.text-white, text=/\d+%/').first().textContent();
    const currentProgress = parseInt(progressText?.replace('%', '') || '0');

    progressCheckCount++;
    if (progressCheckCount % 5 === 0) {
      // Log every 5th check to avoid spam
      console.log(`  Progress: ${currentProgress}% (elapsed: ${Math.round((Date.now() - startTime) / 1000)}s)`);
    }

    // Check if we've advanced to next step (auto-advance on completion)
    const url = page.url();
    if (url.includes('enrichment_result')) {
      const elapsedSeconds = Math.round((Date.now() - startTime) / 1000);
      console.log(`✅ Enrichment completed in ${elapsedSeconds}s`);
      return true;
    }

    // Also check if there's an error message
    const errorElement = page.locator('text=Something went wrong, text=timed out, text=failed').first();
    if (await errorElement.isVisible({ timeout: 1000 }).catch(() => false)) {
      const errorText = await errorElement.textContent();
      console.error(`❌ Enrichment error: ${errorText}`);
      return false;
    }

    // Wait a bit before checking again
    await page.waitForTimeout(2000);
    lastProgress = currentProgress;
  }

  console.error(`❌ Enrichment timeout: Did not complete within ${Math.round(timeout / 1000)}s`);
  return false;
}

/**
 * Skips through skill configuration steps
 */
export async function skipSkillConfiguration(page: Page) {
  // Keep clicking through until we reach completion step
  let stepCount = 0;
  const maxSteps = 10; // Safety limit

  while (stepCount < maxSteps) {
    const url = page.url();

    if (url.includes('complete')) {
      console.log(`✅ Reached completion step after ${stepCount} steps`);
      return;
    }

    // Find continue/next button
    const continueButton = page.locator(
      'button:has-text("Continue"), button:has-text("Next"), button:has-text("Skip")'
    ).first();

    if (await continueButton.isVisible({ timeout: 2000 }).catch(() => false)) {
      await continueButton.click();
      stepCount++;
      await page.waitForTimeout(1000); // Wait for step transition
    } else {
      console.warn('Could not find Continue button, checking if we\'re at completion...');
      if (url.includes('complete')) {
        console.log(`✅ Reached completion step`);
        return;
      }
      break;
    }
  }

  throw new Error(`Could not skip through skill configuration after ${stepCount} steps`);
}

/**
 * Completes the full onboarding flow from password setup through completion
 */
export async function completeFullOnboarding(page: Page, account: TestAccount, domain: string = 'amazon.com'): Promise<boolean> {
  try {
    console.log(`\n🚀 Starting full onboarding flow for ${account.email}`);

    // Step 1: Complete password setup
    console.log('Step 1: Completing password setup...');
    await completePasswordSetup(page, account);

    // Step 2: Verify we're on website_input
    console.log('Step 2: Verifying website_input step...');
    const url = page.url();
    if (!url.includes('website_input')) {
      console.warn(`⚠️ Expected website_input step, but URL is: ${url}`);
    }

    // Step 3: Enter website
    console.log('Step 3: Entering website...');
    await enterWebsite(page, domain);

    // Step 4: Wait for enrichment
    console.log('Step 4: Waiting for enrichment completion...');
    const enrichmentCompleted = await waitForEnrichmentCompletion(page);
    if (!enrichmentCompleted) {
      console.error('❌ Enrichment did not complete successfully');
      return false;
    }

    // Step 5: Skip skill configuration
    console.log('Step 5: Skipping skill configuration...');
    await skipSkillConfiguration(page);

    // Step 6: Verify we reached dashboard
    console.log('Step 6: Verifying completion and dashboard access...');
    await expect(page).toHaveURL(/.*dashboard.*/, { timeout: 10000 });

    // Wait a bit to verify no redirect loops
    await page.waitForTimeout(3000);
    const finalUrl = page.url();
    if (!finalUrl.includes('dashboard')) {
      console.error(`❌ Final URL is not dashboard: ${finalUrl}`);
      return false;
    }

    console.log(`✅ Full onboarding completed successfully!`);
    return true;
  } catch (error) {
    console.error('❌ Error during full onboarding:', error);
    return false;
  }
}
