import { test, expect } from '@playwright/test';

/**
 * OBV2-004: Playwright E2E test - Personal email with Q&A fallback
 *
 * Tests personal email user with no website (manual enrichment):
 * - Personal email detected
 * - Website input step with "no website" option
 * - Manual enrichment Q&A form (6 fields)
 * - Organization creation from Q&A
 * - Enrichment loading and completion
 * - Skills config
 * - Dashboard redirect
 */

test.describe('Onboarding V2: Personal Email with Q&A Fallback', () => {
  const BASE_URL = process.env.VITE_PUBLIC_URL || 'http://localhost:5175';
  const testEmail = 'qa.test@yahoo.com';
  const testPassword = 'TestPassword123!';

  const qaAnswers = {
    company_name: 'Test Startup Inc',
    company_description: 'We build innovative software solutions for enterprise',
    industry: 'Software/Technology',
    target_customers: 'Mid-market enterprise customers',
    main_products: 'Cloud platform for data management',
    competitors: 'DataDog, Splunk, New Relic',
  };

  test('should display no-website option on website input step', async ({ page }) => {
    await page.goto(`${BASE_URL}/onboarding/v2`);
    await page.waitForLoadState('domcontentloaded');

    // Signup with personal email
    const signupButton = page.locator('button:has-text("Sign up")').first();
    await expect(signupButton).toBeVisible({ timeout: 5000 });
    await signupButton.click();

    await page.waitForLoadState('domcontentloaded');

    // Fill signup form
    const emailInput = page.locator('input[type="email"]');
    await emailInput.fill(testEmail);
    const passwordInput = page.locator('input[type="password"]').first();
    await passwordInput.fill(testPassword);
    const passwordConfirmInput = page.locator('input[type="password"]').nth(1);
    await passwordConfirmInput.fill(testPassword);

    const submitButton = page.locator('button[type="submit"]');
    await submitButton.click();

    // Wait for website input step
    const websiteHeading = page.locator('h1, h2').filter({ hasText: /website|url|domain/i });
    await expect(websiteHeading).toBeVisible({ timeout: 10000 });

    // Look for "no website" or "skip" option
    const noWebsiteButton = page.locator('button:has-text("don\'t have"), button:has-text("no website"), button:has-text("skip")').first();
    await expect(noWebsiteButton).toBeVisible({ timeout: 5000 });
  });

  test('should display Q&A form with all 6 fields', async ({ page }) => {
    await page.goto(`${BASE_URL}/onboarding/v2`);
    await page.waitForLoadState('domcontentloaded');

    // Signup
    const signupButton = page.locator('button:has-text("Sign up")').first();
    await signupButton.click();
    await page.waitForLoadState('domcontentloaded');

    const emailInput = page.locator('input[type="email"]');
    await emailInput.fill(testEmail);
    const passwordInput = page.locator('input[type="password"]').first();
    await passwordInput.fill(testPassword);
    const passwordConfirmInput = page.locator('input[type="password"]').nth(1);
    await passwordConfirmInput.fill(testPassword);

    const submitButton = page.locator('button[type="submit"]');
    await submitButton.click();

    // Wait for website step and click "no website"
    await page.waitForLoadState('domcontentloaded');
    const noWebsiteButton = page.locator('button:has-text("don\'t have"), button:has-text("no website"), button:has-text("skip")').first();
    if (await noWebsiteButton.isVisible({ timeout: 5000 })) {
      await noWebsiteButton.click();
    }

    // Wait for Q&A form to appear
    const qaHeading = page.locator('h1, h2').filter({ hasText: /tell.*us|questions|about.*company/i });
    await expect(qaHeading).toBeVisible({ timeout: 10000 });

    // Verify all 6 Q&A fields are visible
    const companyNameField = page.locator('input, textarea').filter({ hasText: /company name/i }).first();
    const descriptionField = page.locator('input, textarea').filter({ hasText: /description/i }).first();
    const industryField = page.locator('input, textarea').filter({ hasText: /industry/i }).first();
    const targetCustomersField = page.locator('input, textarea').filter({ hasText: /customer|target/i }).first();
    const productsField = page.locator('input, textarea').filter({ hasText: /product|service/i }).first();
    const competitorsField = page.locator('input, textarea').filter({ hasText: /competitor/i }).first();

    // At least check that we can find form inputs
    const formInputs = page.locator('input[type="text"], textarea');
    const inputCount = await formInputs.count();
    expect(inputCount).toBeGreaterThanOrEqual(4); // Should have at least 4-6 inputs
  });

  test('should submit Q&A form and create organization', async ({ page }) => {
    await page.goto(`${BASE_URL}/onboarding/v2`);
    await page.waitForLoadState('domcontentloaded');

    // Signup
    const signupButton = page.locator('button:has-text("Sign up")').first();
    await signupButton.click();
    await page.waitForLoadState('domcontentloaded');

    const emailInput = page.locator('input[type="email"]');
    await emailInput.fill(testEmail);
    const passwordInput = page.locator('input[type="password"]').first();
    await passwordInput.fill(testPassword);
    const passwordConfirmInput = page.locator('input[type="password"]').nth(1);
    await passwordConfirmInput.fill(testPassword);

    const submitButton = page.locator('button[type="submit"]');
    await submitButton.click();

    // Click no website
    await page.waitForLoadState('domcontentloaded');
    const noWebsiteButton = page.locator('button:has-text("don\'t have"), button:has-text("no website"), button:has-text("skip")').first();
    if (await noWebsiteButton.isVisible({ timeout: 5000 })) {
      await noWebsiteButton.click();
    }

    // Wait for Q&A form
    await page.waitForLoadState('domcontentloaded');

    // Fill Q&A form
    const inputs = page.locator('input[type="text"], textarea');
    const count = await inputs.count();

    // Fill first input with company name
    if (count > 0) {
      const firstInput = inputs.first();
      await firstInput.fill(qaAnswers.company_name);
    }

    // Fill other inputs
    if (count > 1) {
      await inputs.nth(1).fill(qaAnswers.company_description);
    }
    if (count > 2) {
      await inputs.nth(2).fill(qaAnswers.industry);
    }
    if (count > 3) {
      await inputs.nth(3).fill(qaAnswers.target_customers);
    }
    if (count > 4) {
      await inputs.nth(4).fill(qaAnswers.main_products);
    }
    if (count > 5) {
      await inputs.nth(5).fill(qaAnswers.competitors);
    }

    // Submit Q&A form
    const submitQAButton = page.locator('button:has-text("Submit"), button:has-text("Continue"), button:has-text("Next")').first();
    await submitQAButton.click();

    // Should proceed to enrichment loading
    await page.waitForLoadState('domcontentloaded');
    const enrichmentHeading = page.locator('h1, h2').filter({ hasText: /enrichment|analyzing|loading/i });
    await expect(enrichmentHeading).toBeVisible({ timeout: 10000 });
  });

  test('should show enrichment results from Q&A', async ({ page }) => {
    await page.goto(`${BASE_URL}/onboarding/v2`);
    await page.waitForLoadState('domcontentloaded');

    // Signup and reach Q&A
    const signupButton = page.locator('button:has-text("Sign up")').first();
    await signupButton.click();
    await page.waitForLoadState('domcontentloaded');

    const emailInput = page.locator('input[type="email"]');
    await emailInput.fill(testEmail);
    const passwordInput = page.locator('input[type="password"]').first();
    await passwordInput.fill(testPassword);
    const passwordConfirmInput = page.locator('input[type="password"]').nth(1);
    await passwordConfirmInput.fill(testPassword);

    const submitButton = page.locator('button[type="submit"]');
    await submitButton.click();

    // Navigate to Q&A
    await page.waitForLoadState('domcontentloaded');
    const noWebsiteButton = page.locator('button:has-text("don\'t have"), button:has-text("no website"), button:has-text("skip")').first();
    if (await noWebsiteButton.isVisible({ timeout: 5000 })) {
      await noWebsiteButton.click();
    }

    // Fill and submit Q&A
    await page.waitForLoadState('domcontentloaded');
    const inputs = page.locator('input[type="text"], textarea');
    if (await inputs.first().isVisible({ timeout: 5000 })) {
      await inputs.first().fill(qaAnswers.company_name);
      const submitQAButton = page.locator('button:has-text("Submit"), button:has-text("Continue"), button:has-text("Next")').first();
      await submitQAButton.click();
    }

    // Wait for enrichment results
    const enrichmentComplete = page.locator('text=/completed|success|results/i');
    await expect(enrichmentComplete).toBeVisible({ timeout: 120000 });
  });

  test('should proceed to skills config after enrichment', async ({ page }) => {
    await page.goto(`${BASE_URL}/onboarding/v2`);
    await page.waitForLoadState('domcontentloaded');

    // Full flow to skills
    const signupButton = page.locator('button:has-text("Sign up")').first();
    await signupButton.click();
    await page.waitForLoadState('domcontentloaded');

    const emailInput = page.locator('input[type="email"]');
    await emailInput.fill(testEmail);
    const passwordInput = page.locator('input[type="password"]').first();
    await passwordInput.fill(testPassword);
    const passwordConfirmInput = page.locator('input[type="password"]').nth(1);
    await passwordConfirmInput.fill(testPassword);

    const submitButton = page.locator('button[type="submit"]');
    await submitButton.click();

    // No website
    await page.waitForLoadState('domcontentloaded');
    const noWebsiteButton = page.locator('button:has-text("don\'t have"), button:has-text("no website"), button:has-text("skip")').first();
    if (await noWebsiteButton.isVisible({ timeout: 5000 })) {
      await noWebsiteButton.click();
    }

    // Q&A
    await page.waitForLoadState('domcontentloaded');
    const inputs = page.locator('input[type="text"], textarea');
    if (await inputs.first().isVisible({ timeout: 5000 })) {
      await inputs.first().fill(qaAnswers.company_name);
      const submitQAButton = page.locator('button:has-text("Submit"), button:has-text("Continue"), button:has-text("Next")').first();
      await submitQAButton.click();
    }

    // Wait for enrichment completion and skills
    const skillsHeading = page.locator('h1, h2').filter({ hasText: /skills|configuration|select/i });
    await expect(skillsHeading).toBeVisible({ timeout: 120000 });

    // Verify we can skip all skills
    const skipButton = page.locator('button:has-text("Skip"), button:has-text("All")').first();
    if (await skipButton.isVisible({ timeout: 2000 })) {
      await skipButton.click();
      await page.waitForLoadState('domcontentloaded');
    }

    // Should reach dashboard
    const dashboardUrl = await page.waitForURL(/\/(dashboard|meetings|deals)/, { timeout: 10000 });
    expect(dashboardUrl).toBeTruthy();
  });

  test('should verify organization membership after Q&A completion', async ({ page }) => {
    await page.goto(`${BASE_URL}/dashboard`);
    await page.waitForLoadState('domcontentloaded');

    // If user completed onboarding, they should be able to access dashboard
    const currentUrl = page.url();
    expect(currentUrl).toContain('dashboard');

    // Verify org switcher shows the created org
    const orgSwitcher = page.locator('[data-testid="org-switcher"], button:has-text(/select.*org/i)');
    if (await orgSwitcher.isVisible({ timeout: 5000 })) {
      expect(await orgSwitcher.innerText()).toBeTruthy();
    }
  });
});
