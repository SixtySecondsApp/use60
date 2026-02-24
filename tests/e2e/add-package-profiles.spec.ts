/**
 * Add Package Profiles E2E - One-off automation
 * Uses Playwriter to connect to your Chrome session (must be logged in).
 * Prerequisites: Chrome with Playwriter extension connected, app on localhost:5175, logged in.
 */

import { describe, test, expect as vitestExpect, beforeAll, afterAll } from 'vitest';
import { setupPlaywriter, teardownPlaywriter } from '../fixtures/playwriter-setup';
import type { Page } from 'playwright-core';

const BASE_URL = process.env.PLAYWRIGHT_TEST_BASE_URL || process.env.VITE_BASE_URL || 'http://localhost:5175';

const EXPECTED_PROFILES = [
  'Managed Service Email Outreach',
  'Multi Channel Outreach and Advertising',
  'Video Creation',
  'AI Consult and Build',
];

describe('Add Package Profiles (manual run)', () => {
  let page: Page;

  beforeAll(async () => {
    const setup = await setupPlaywriter();
    page = setup.page;
  });

  afterAll(async () => {
    await teardownPlaywriter();
  });

  test('add package profiles and verify all four exist', async () => {
    // 1. Navigate to profiles page
    await page.goto(`${BASE_URL}/profiles`, { waitUntil: 'networkidle' });

    // 2. Check for login block (email/password form or auth redirect)
    const hasLoginForm = await page.locator('input[type="email"], input[name="email"]').isVisible().catch(() => false);
    const onAuthPage = page.url().includes('/auth') || page.url().includes('/login');
    if (hasLoginForm || onAuthPage) {
      const title = await page.title();
      const bodyText = await page.locator('body').textContent();
      throw new Error(
        `Authentication required. Screen: ${title}. URL: ${page.url()}. ` +
        `Page contains login/auth flow - please log in manually in this browser first, then re-run.`
      );
    }

    // 3. Ensure on "Your Business" tab (default when ?tab=business or no tab)
    const url = new URL(page.url());
    if (url.searchParams.get('tab') !== 'business' && url.pathname.includes('/profiles')) {
      await page.getByRole('button', { name: /your business/i }).click();
      await page.waitForLoadState('networkidle');
    }

    // 4. Check if we have org profile (required for Products & Services section)
    const addPackageBtn = page.getByRole('button', { name: /add package profiles/i });
    const addPackageVisible = await addPackageBtn.isVisible().catch(() => false);

    if (!addPackageVisible) {
      const noOrgMsg = await page.getByText(/set up your business profile/i).isVisible().catch(() => false);
      if (noOrgMsg) {
        throw new Error(
          'No business profile exists. Create a business profile first from the "Create Business Profile" button.'
        );
      }
      throw new Error('Add Package Profiles button not found. Ensure you are on the Your Business tab with an org profile.');
    }

    // 5. Click "Add Package Profiles"
    await addPackageBtn.click();
    await page.waitForTimeout(1500); // allow mutations/toasts to settle

    // 6. Collect visible product profile names (cards or list)
    const cards = page.locator('[data-testid="product-profile-card"], [class*="ProductProfileCard"], [class*="product-profile"]');
    const cardCount = await cards.count();
    const namesFromCards: string[] = [];
    for (let i = 0; i < cardCount; i++) {
      const text = await cards.nth(i).textContent();
      if (text) namesFromCards.push(text);
    }

    // Also check any element containing the profile names (fallback)
    const pageText = await page.locator('body').textContent();
    const foundInPage: string[] = [];
    for (const name of EXPECTED_PROFILES) {
      if (pageText?.includes(name)) foundInPage.push(name);
    }

    // Use names from cards if we got any; otherwise use page text
    const allNames = namesFromCards.length > 0
      ? namesFromCards.join(' ')
      : (pageText || '');

    const present: string[] = [];
    const missing: string[] = [];
    for (const name of EXPECTED_PROFILES) {
      if (allNames.includes(name) || foundInPage.includes(name)) {
        present.push(name);
      } else {
        missing.push(name);
      }
    }

    if (missing.length > 0) {
      throw new Error(
        `Expected all 4 package profiles. Present: ${present.join(', ')}. Missing: ${missing.join(', ')}. ` +
        `(Toast may have said "All package profiles are already added" - if so, all four should exist.)`
      );
    }

    vitestExpect(present).toHaveLength(4);
  });
});
