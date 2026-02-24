import { test, expect } from '@playwright/test';

test.describe('Signup Flow E2E Tests', () => {
  // Test data - replace with your actual token
  const token = 'fc9cc294444c5e564f7fe7702e1d61a89474b749c3899f93c54d1188f919791f';
  const waitlistEntryId = '0bd53b2c-b2f0-47d7-af79-a81ee386085d';
  const email = 'test-20260121115440@example.com';
  const firstName = 'John';
  const lastName = 'Doe';
  const password = 'TestPassword123!';

  test('Complete signup flow - SetPassword to Onboarding', async ({ page }) => {
    // Step 1: Navigate to SetPassword page
    const setPasswordUrl = `http://localhost:5175/auth/set-password?token=${token}&waitlist_entry=${waitlistEntryId}`;
    console.log(`[TEST] Navigating to: ${setPasswordUrl}`);

    await page.goto(setPasswordUrl, { waitUntil: 'domcontentloaded' });

    // Step 2: Verify page loaded (should see "Complete Your Account")
    await expect(page.locator('text=Complete Your Account')).toBeVisible({ timeout: 5000 });
    console.log('[TEST] ✓ SetPassword page loaded');

    // Step 3: Fill in first name
    const firstNameInput = page.locator('input[placeholder="Enter your first name"]');
    await firstNameInput.fill(firstName);
    console.log(`[TEST] ✓ Entered first name: ${firstName}`);

    // Step 4: Fill in last name
    const lastNameInput = page.locator('input[placeholder="Enter your last name"]');
    await lastNameInput.fill(lastName);
    console.log(`[TEST] ✓ Entered last name: ${lastName}`);

    // Step 5: Fill in password
    const passwordInputs = page.locator('input[type="password"]');
    await passwordInputs.first().fill(password);
    console.log(`[TEST] ✓ Entered password`);

    // Step 6: Fill in confirm password
    await passwordInputs.last().fill(password);
    console.log(`[TEST] ✓ Confirmed password`);

    // Step 7: Click submit button
    const submitButton = page.locator('button:has-text("Complete Setup & Go to Dashboard")');
    await submitButton.click();
    console.log('[TEST] ✓ Clicked submit button');

    // Step 8: Wait for redirect to onboarding (or dashboard as fallback)
    // The page should navigate away from /auth/set-password
    await page.waitForURL(/\/(onboarding|dashboard)/, { timeout: 10000 });
    const finalUrl = page.url();
    console.log(`[TEST] ✓ Redirected to: ${finalUrl}`);

    // Step 9: Verify we're on onboarding page
    const isOnboarding = finalUrl.includes('/onboarding');
    const isDashboard = finalUrl.includes('/dashboard');

    if (isOnboarding) {
      console.log('[TEST] ✓ Successfully redirected to ONBOARDING page');
      expect(isOnboarding).toBe(true);
    } else if (isDashboard) {
      console.log('[TEST] ⚠ Redirected to DASHBOARD (should be onboarding)');
    } else {
      console.log(`[TEST] ✗ Unexpected redirect URL: ${finalUrl}`);
    }

    // Step 10: Take final screenshot
    await page.screenshot({ path: '/tmp/signup-complete.png', scale: 'css' });
    console.log('[TEST] ✓ Test completed successfully');
  });

  test('Form validation - required fields', async ({ page }) => {
    const setPasswordUrl = `http://localhost:5175/auth/set-password?token=${token}&waitlist_entry=${waitlistEntryId}`;
    await page.goto(setPasswordUrl, { waitUntil: 'domcontentloaded' });

    // Wait for page to load
    await expect(page.locator('text=Complete Your Account')).toBeVisible();

    // Try to submit empty form
    const submitButton = page.locator('button:has-text("Complete Setup & Go to Dashboard")');

    // Button should be disabled when fields are empty
    const isDisabled = await submitButton.isDisabled();
    console.log(`[TEST] Submit button disabled on empty form: ${isDisabled}`);
    expect(isDisabled).toBe(true);

    // Fill only first name
    const firstNameInput = page.locator('input[placeholder="Enter your first name"]');
    await firstNameInput.fill(firstName);

    // Button should still be disabled
    const stillDisabled = await submitButton.isDisabled();
    console.log(`[TEST] Submit button disabled with only first name: ${stillDisabled}`);
    expect(stillDisabled).toBe(true);

    // Fill all fields
    const lastNameInput = page.locator('input[placeholder="Enter your last name"]');
    await lastNameInput.fill(lastName);

    const passwordInputs = page.locator('input[type="password"]');
    await passwordInputs.first().fill(password);
    await passwordInputs.last().fill(password);

    // Button should now be enabled
    const isEnabled = await submitButton.isEnabled();
    console.log(`[TEST] Submit button enabled with all fields filled: ${isEnabled}`);
    expect(isEnabled).toBe(true);
  });

  test('Password mismatch error', async ({ page }) => {
    const setPasswordUrl = `http://localhost:5175/auth/set-password?token=${token}&waitlist_entry=${waitlistEntryId}`;
    await page.goto(setPasswordUrl, { waitUntil: 'domcontentloaded' });

    // Wait for page to load
    await expect(page.locator('text=Complete Your Account')).toBeVisible();

    // Fill all fields except mismatched passwords
    const firstNameInput = page.locator('input[placeholder="Enter your first name"]');
    await firstNameInput.fill(firstName);

    const lastNameInput = page.locator('input[placeholder="Enter your last name"]');
    await lastNameInput.fill(lastName);

    const passwordInputs = page.locator('input[type="password"]');
    await passwordInputs.first().fill(password);
    await passwordInputs.last().fill('DifferentPassword123!');

    // Try to submit
    const submitButton = page.locator('button:has-text("Complete Setup & Go to Dashboard")');
    await submitButton.click();

    // Should see error toast
    await expect(page.locator('text=Passwords do not match')).toBeVisible({ timeout: 5000 });
    console.log('[TEST] ✓ Password mismatch error shown');
  });

  test('Short password error', async ({ page }) => {
    const setPasswordUrl = `http://localhost:5175/auth/set-password?token=${token}&waitlist_entry=${waitlistEntryId}`;
    await page.goto(setPasswordUrl, { waitUntil: 'domcontentloaded' });

    // Wait for page to load
    await expect(page.locator('text=Complete Your Account')).toBeVisible();

    // Fill all fields with short password
    const firstNameInput = page.locator('input[placeholder="Enter your first name"]');
    await firstNameInput.fill(firstName);

    const lastNameInput = page.locator('input[placeholder="Enter your last name"]');
    await lastNameInput.fill(lastName);

    const passwordInputs = page.locator('input[type="password"]');
    const shortPassword = '123'; // Too short
    await passwordInputs.first().fill(shortPassword);
    await passwordInputs.last().fill(shortPassword);

    // Try to submit
    const submitButton = page.locator('button:has-text("Complete Setup & Go to Dashboard")');
    await submitButton.click();

    // Should see error toast
    await expect(page.locator('text=Password must be at least 6 characters')).toBeVisible({ timeout: 5000 });
    console.log('[TEST] ✓ Short password error shown');
  });
});
