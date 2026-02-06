/**
 * OI-024: E2E Tests for Layer 3 — Cross-Table Intelligence
 */

import { test, expect } from '@playwright/test';

test.describe('Cross-Table Queries', () => {
  test('should execute cross-table query and show enriched columns', async ({ page }) => {
    await page.goto('/ops/test-table-id');

    // Execute cross-table query
    await page.fill('[data-testid="ai-query-input"]',
      'Cross-reference with contacts table — show emails and companies'
    );
    await page.click('[data-testid="execute-query"]');

    // Verify enriched columns appear with blue highlight
    await expect(page.locator('[data-testid="enriched-column"]')).toHaveCount(2);
    await expect(page.locator('[data-testid="enriched-column"]').first())
      .toHaveClass(/bg-blue-/);
  });

  test('should persist enriched column with Keep button', async ({ page }) => {
    await page.goto('/ops/test-table-id');

    // Execute query (assume enriched columns already shown)
    await page.click('[data-testid="keep-enriched-column-email"]');

    // Verify column persists (no longer highlighted)
    await expect(page.locator('[data-testid="column-header-email"]')).toBeVisible();
    await expect(page.locator('[data-testid="enriched-column"]')).toHaveCount(1); // One less
  });

  test('should show comparison breakdown for net-new query', async ({ page }) => {
    await page.goto('/ops/test-table-id');

    await page.fill('[data-testid="ai-query-input"]',
      'Compare against outreach table — show net-new only'
    );
    await page.click('[data-testid="execute-query"]');

    // Verify comparison panel
    await expect(page.locator('[data-testid="comparison-matched"]')).toBeVisible();
    await expect(page.locator('[data-testid="comparison-net-new"]')).toBeVisible();
  });

  test('should render meeting references with expandable transcripts', async ({ page }) => {
    await page.goto('/ops/test-table-id');

    await page.fill('[data-testid="ai-query-input"]',
      'Pull Fathom meeting notes for contacts in this table'
    );
    await page.click('[data-testid="execute-query"]');

    // Verify meeting cards
    const meeting = page.locator('[data-testid="meeting-ref"]').first();
    await expect(meeting).toBeVisible();

    // Expand transcript
    await meeting.locator('[data-testid="show-transcript"]').click();
    await expect(meeting.locator('[data-testid="transcript-content"]')).toBeVisible();
  });
});
