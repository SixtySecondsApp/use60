#!/usr/bin/env tsx
/**
 * Add Package Profiles - One-off browser automation
 * Prerequisites: App running on localhost:5175. Uses fresh browser (login required).
 * If login blocks: reports the screen shown.
 */

import { chromium } from '@playwright/test';

const BASE_URL = process.env.PLAYWRIGHT_TEST_BASE_URL || process.env.VITE_BASE_URL || 'http://localhost:5175';

const EXPECTED_PROFILES = [
  'Managed Service Email Outreach',
  'Multi Channel Outreach and Advertising',
  'Video Creation',
  'AI Consult and Build',
];

async function main() {
  const browser = await chromium.launch({
    headless: false,
    channel: 'chrome', // Use system Chrome if Playwright browsers not installed
  });
  const context = await browser.newContext();
  const page = await context.newPage();

  try {
    await page.goto(`${BASE_URL}/profiles`, { waitUntil: 'domcontentloaded', timeout: 15000 });

    const hasLoginForm = await page.locator('input[type="email"], input[name="email"]').isVisible().catch(() => false);
    const onAuthPage = page.url().includes('/auth') || page.url().includes('/login');

    if (hasLoginForm || onAuthPage) {
      const title = await page.title();
      const signInText = await page.locator('body').innerText().catch(() => '');
      console.error('\n--- AUTHENTICATION BLOCKED ---');
      console.error('Screen:', title);
      console.error('URL:', page.url());
      console.error('Page snippet:', signInText.slice(0, 500));
      console.error('Cannot complete automatically. Log in at', BASE_URL, 'and re-run.');
      await browser.close();
      process.exit(1);
    }

    const url = new URL(page.url());
    if (url.searchParams.get('tab') !== 'business' && url.pathname.includes('/profiles')) {
      await page.getByRole('button', { name: /your business/i }).click();
      await page.waitForTimeout(500);
    }

    const addPackageBtn = page.getByRole('button', { name: /add package profiles/i });
    const addPackageVisible = await addPackageBtn.isVisible().catch(() => false);

    if (!addPackageVisible) {
      const noOrgMsg = await page.getByText(/set up your business profile/i).isVisible().catch(() => false);
      if (noOrgMsg) {
        console.error('\n--- NO BUSINESS PROFILE ---');
        console.error('Create a business profile first.');
        process.exit(1);
      }
      console.error('\n--- ADD PACKAGE PROFILES NOT FOUND ---');
      console.error('Ensure you are on the Your Business tab with an org profile.');
      process.exit(1);
    }

    await addPackageBtn.click();
    await page.waitForTimeout(2000);

    const pageText = (await page.locator('body').textContent()) || '';
    const present: string[] = [];
    const missing: string[] = [];
    for (const name of EXPECTED_PROFILES) {
      if (pageText.includes(name)) present.push(name);
      else missing.push(name);
    }

    if (missing.length > 0) {
      console.error('\n--- VERIFICATION FAILED ---');
      console.error('Present:', present.join(', '));
      console.error('Missing:', missing.join(', '));
      process.exit(1);
    }

    console.log('\n--- SUCCESS ---');
    console.log('All 4 package profiles are present:', present.join(', '));
  } finally {
    await browser.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
