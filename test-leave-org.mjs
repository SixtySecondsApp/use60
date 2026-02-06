#!/usr/bin/env node

import { chromium } from '@playwright/test';

// Use staging URL from .env.staging if available
const USE_LOCAL = process.env.USE_LOCAL === 'true';
const BASE_URL = USE_LOCAL ? 'http://localhost:5175' : 'https://staging.use60.com';
const TEST_EMAIL = 'max.parish501@gmail.com';
const TEST_PASSWORD = 'NotTesting@1';

async function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

async function runTest() {
  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext();
  const page = await context.newPage();

  try {
    console.log('\n🧪 TESTING: Leave Organization Flow\n');
    console.log('━'.repeat(60));

    // Step 0: Login
    console.log('📍 Step 0: Login to the app');
    await page.goto(`${BASE_URL}/auth/login`, { waitUntil: 'domcontentloaded' });
    await sleep(2000);

    // Fill email
    const emailInput = page.locator('input[type="email"], input[name="email"]').first();
    if (await emailInput.count() > 0) {
      await emailInput.fill(TEST_EMAIL);
      console.log('✓ Entered email');
    }

    // Fill password
    const passwordInput = page.locator('input[type="password"]').first();
    if (await passwordInput.count() > 0) {
      await passwordInput.fill(TEST_PASSWORD);
      console.log('✓ Entered password');
    }

    // Click login button
    const loginButton = page.locator('button:has-text("Sign In"), button:has-text("Login"), button[type="submit"]').first();
    if (await loginButton.count() > 0) {
      await loginButton.click();
      await page.waitForNavigation({ waitUntil: 'networkidle' }).catch(() => {});
      await sleep(3000);
      console.log('✓ Logged in');
    }

    // Step 1: Navigate to dashboard
    console.log('\n📍 Step 1: Navigate to dashboard');
    await page.goto(`${BASE_URL}/meetings`, { waitUntil: 'domcontentloaded' });
    await sleep(2000);
    console.log('✓ Dashboard loaded');

    // Step 2: Open organization settings
    console.log('\n📍 Step 2: Open organization settings');

    console.log('Page title:', await page.title());

    // Try to find and click organization settings
    // Look for settings links in the navigation
    const settingsLink = page.locator('a[href*="settings"], a[href*="organization"], button:has-text("Settings")').first();

    // Check if settings link exists
    let settingsCount = await settingsLink.count();
    console.log(`Found ${settingsCount} settings-related elements`);

    if (settingsCount > 0) {
      await settingsLink.click();
      await sleep(2000);
      console.log('✓ Clicked settings link');
    } else {
      console.log('⚠ Could not find settings link in nav, trying profile menu');
      // Try clicking through the profile/account menu
      const profileButton = page.locator('button[aria-label*="Account"], button[aria-label*="Profile"], button:has-text("Account")').first();
      if (await profileButton.count() > 0) {
        await profileButton.click();
        await sleep(1500);

        // Now look for settings in the menu
        const settingsInMenu = page.locator('button:has-text("Settings"), a:has-text("Settings"), a[href*="settings"]').first();
        if (await settingsInMenu.count() > 0) {
          await settingsInMenu.click();
          await sleep(2000);
          console.log('✓ Clicked settings from menu');
        }
      }
    }

    // Step 3: Look for organization management page
    console.log('\n📍 Step 3: Look for organization management');

    // Try navigating directly to organization settings
    const orgSettingsUrl = `${BASE_URL}/settings/organization-management`;
    console.log('Trying to navigate to:', orgSettingsUrl);
    await page.goto(orgSettingsUrl, { waitUntil: 'domcontentloaded' });
    await sleep(2000);

    console.log('Current URL:', page.url());

    // Step 4: Find and click "Leave Team" button
    console.log('\n📍 Step 4: Looking for "Leave Team" button');

    const leaveButton = page.locator('button:has-text("Leave"), button:has-text("Leave Team"), button:has-text("Leave Organization")').first();
    const leaveCount = await leaveButton.count();

    console.log(`Found ${leaveCount} leave-related buttons`);

    if (leaveCount > 0) {
      console.log('✓ Found "Leave" button');
      await leaveButton.click();
      await sleep(2000);
      console.log('✓ Clicked "Leave" button');

      // Check for confirmation dialogs
      const confirmButton = page.locator('button:has-text("Confirm"), button:has-text("Leave"), button[role="button"]').first();
      if (await confirmButton.count() > 0) {
        console.log('Found confirmation dialog, clicking confirm with force...');
        try {
          await confirmButton.click({ force: true });
          await sleep(3000);
        } catch (err) {
          console.log('Force click failed, trying alternative approach...');
          // Try using evaluate to click
          await page.evaluate(() => {
            const buttons = document.querySelectorAll('button');
            for (let btn of buttons) {
              if (btn.textContent.includes('Confirm') || btn.textContent.includes('Leave')) {
                btn.click();
                break;
              }
            }
          });
          await sleep(3000);
        }
      }

      // Wait for any redirects
      await page.waitForNavigation({ waitUntil: 'domcontentloaded' }).catch(() => {});
      await sleep(2000);

      // Step 5: Check for removed user page or onboarding redirect
      console.log('\n📍 Step 5: Checking redirect after leaving');
      const currentUrl = page.url();
      console.log('Current URL:', currentUrl);

      // Get page content to debug
      const pageText = await page.innerText('body').catch(() => '');
      console.log('Page content snippet:', pageText.substring(0, 300));

      // Check for any error messages
      const errors = await page.locator('[class*="error"], [class*="alert"]').count();
      console.log('Error/alert elements found:', errors);

      if (currentUrl.includes('removed-user')) {
        console.log('✓ Redirected to removed-user page');

        // Step 6: Click "Choose Different Organization"
        console.log('\n📍 Step 6: Click "Choose Different Organization"');
        const chooseOrgButton = page.locator('button:has-text("Choose Different"), button:has-text("Choose Organization")').first();

        if (await chooseOrgButton.count() > 0) {
          await chooseOrgButton.click();
          await sleep(3000);

          const newUrl = page.url();
          console.log('URL after choosing org:', newUrl);

          if (newUrl.includes('organization_selection')) {
            console.log('✓ Redirected to organization_selection');

            // Step 7: Check if organization search page loads (not infinite spinner)
            console.log('\n📍 Step 7: Checking organization selection page loads');

            const spinner = page.locator('.animate-spin, [role="progressbar"], .loading').first();
            const spinnerCount = await spinner.count();

            if (spinnerCount > 0) {
              // Wait a bit more to see if it loads
              await sleep(3000);
              const spinnerCount2 = await spinner.count();

              if (spinnerCount2 > 0) {
                console.log('❌ Page still spinning after 3 seconds (infinite loading!)');
              } else {
                console.log('✓ Page loaded successfully');
              }
            } else {
              console.log('✓ No infinite spinner detected');
            }

            // Get page content
            const pageText = await page.innerText('body');
            if (pageText.includes('Search') || pageText.includes('organization') || pageText.includes('create')) {
              console.log('✓ Organization selection interface visible');
            }
          } else {
            console.log('❌ Not redirected to organization_selection');
          }
        }
      } else if (currentUrl.includes('login')) {
        console.log('❌ Unexpectedly redirected to login page');
      } else {
        console.log('✓ Redirected to:', currentUrl);
      }
    } else {
      console.log('⚠ Could not find "Leave Team" button on this page');
      console.log('Page content preview:');
      const pageText = await page.innerText('body');
      console.log(pageText.substring(0, 500));
    }

    console.log('\n' + '━'.repeat(60));
    console.log('🎉 Test completed!\n');

  } catch (error) {
    console.error('\n❌ Test failed with error:');
    console.error(error.message);
    console.error('\nStackTrace:', error.stack);
  } finally {
    // Keep browser open for inspection (comment out to auto-close)
    console.log('Keeping browser open for 10 seconds for inspection...');
    await sleep(10000);
    await browser.close();
  }
}

runTest().catch(console.error);
