/**
 * OI-035: E2E Tests for Layer 6 — Predictive Actions
 */

import { test, expect } from '@playwright/test';

test.describe('Predictions', () => {
  test('should display prediction cards with confidence badges', async ({ page }) => {
    await page.goto('/ops/test-table-id');

    // Verify prediction cards render
    const prediction = page.locator('[data-testid="prediction-card"]').first();
    await expect(prediction).toBeVisible();

    // Verify confidence badge
    await expect(prediction.locator('[data-testid="confidence-badge"]')).toBeVisible();
  });

  test('should show correct confidence colors', async ({ page }) => {
    await page.goto('/ops/test-table-id');

    // High confidence (>80%) = green
    const highConf = page.locator('[data-testid="prediction-card"][data-confidence="85"]');
    await expect(highConf.locator('[data-testid="confidence-badge"]'))
      .toHaveClass(/text-green-/);

    // Medium confidence (50-80%) = yellow
    const medConf = page.locator('[data-testid="prediction-card"][data-confidence="65"]');
    await expect(medConf.locator('[data-testid="confidence-badge"]'))
      .toHaveClass(/text-yellow-/);
  });

  test('should expand prediction to show reasoning text', async ({ page }) => {
    await page.goto('/ops/test-table-id');

    const prediction = page.locator('[data-testid="prediction-card"]').first();

    // Initially collapsed
    await expect(prediction.locator('[data-testid="reasoning"]')).not.toBeVisible();

    // Expand
    await prediction.locator('[data-testid="expand-prediction"]').click();
    await expect(prediction.locator('[data-testid="reasoning"]')).toBeVisible();
    await expect(prediction.locator('[data-testid="reasoning"]')).toContainText('Based on');
  });

  test('should execute suggested action', async ({ page }) => {
    await page.goto('/ops/test-table-id');

    const prediction = page.locator('[data-testid="prediction-card"]').first();
    await prediction.locator('[data-testid="suggestion-action-0"]').click();

    // Verify action executed (e.g., filter applied)
    await expect(page.locator('[data-testid="active-filter"]')).toBeVisible();
  });

  test('should dismiss prediction card', async ({ page }) => {
    await page.goto('/ops/test-table-id');

    const prediction = page.locator('[data-testid="prediction-card"]').first();
    await prediction.locator('[data-testid="dismiss-prediction"]').click();

    await expect(prediction).not.toBeVisible();
  });

  test('should show team behavior predictions with org-wide context', async ({ page }) => {
    await page.goto('/ops/test-table-id');

    // Find team behavior prediction
    const teamPrediction = page.locator('[data-testid="prediction-type-team_behavior"]').first();

    // Verify contains org-wide language
    await expect(teamPrediction).toContainText(/Reps who.*convert.*more/);

    // Verify shows sample size
    await expect(teamPrediction.locator('[data-testid="sample-size"]')).toBeVisible();
  });
});
