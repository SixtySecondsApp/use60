/**
 * OI-012: E2E Tests for Layer 2 — Proactive Intelligence
 */

import { test, expect } from '@playwright/test';

test.describe('Ops Insights', () => {
  test('should display insights banner with conversational text', async ({ page }) => {
    await page.goto('/ops/test-table-id');

    // Verify insights banner renders
    await expect(page.locator('[data-testid="insights-banner"]')).toBeVisible();

    // Verify conversational text with specific counts
    await expect(page.locator('text=/\\d+ contacts appeared at/')).toBeVisible();
  });

  test('should dismiss insight card', async ({ page }) => {
    await page.goto('/ops/test-table-id');

    const insight = page.locator('[data-testid="insight-card"]').first();
    await insight.locator('[data-testid="dismiss-insight"]').click();

    // Verify removed with animation
    await expect(insight).not.toBeVisible();
  });

  test('should execute insight action button', async ({ page }) => {
    await page.goto('/ops/test-table-id');

    // Click action button
    await page.click('[data-testid="insight-action-0"]');

    // Verify filter applied or action executed
    await expect(page.locator('[data-testid="active-filter"]')).toBeVisible();
  });

  test('should collapse/expand when >3 insights', async ({ page }) => {
    // Seed test data with 5 insights
    await page.goto('/ops/test-table-id');

    // Initially collapsed
    await expect(page.locator('[data-testid="insight-card"]')).toHaveCount(1);

    // Expand
    await page.click('[data-testid="expand-insights"]');
    await expect(page.locator('[data-testid="insight-card"]')).toHaveCount(5);
  });
});
