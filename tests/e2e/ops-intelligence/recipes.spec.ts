/**
 * OI-018: E2E Tests for Layer 4 — Recipes
 */

import { test, expect } from '@playwright/test';

test.describe('Ops Recipes', () => {
  test('should save query as recipe', async ({ page }) => {
    await page.goto('/ops/test-table-id');

    // Execute a query
    await page.fill('[data-testid="ai-query-input"]', 'Show me all law firm contacts');
    await page.click('[data-testid="execute-query"]');

    // Wait for results
    await expect(page.locator('[data-testid="query-result"]')).toBeVisible();

    // Click save as recipe
    await page.click('[data-testid="save-recipe"]');
    await page.fill('[data-testid="recipe-name"]', 'Law firm filter');
    await page.click('[data-testid="confirm-save-recipe"]');

    // Verify saved
    await expect(page.locator('text=Recipe saved')).toBeVisible();
  });

  test('should run saved recipe from library', async ({ page }) => {
    await page.goto('/ops/test-table-id');

    // Open recipe library
    await page.click('[data-testid="recipe-library"]');

    // Find and run recipe
    await page.click('[data-testid="recipe-run-test-recipe-id"]');

    // Verify execution
    await expect(page.locator('[data-testid="query-result"]')).toBeVisible();
    await expect(page.locator('[data-testid="recipe-library"]')).not.toBeVisible(); // Library closes
  });

  test('should share recipe with team', async ({ page }) => {
    await page.goto('/ops/test-table-id');

    await page.click('[data-testid="recipe-library"]');
    await page.click('[data-testid="recipe-share-test-recipe-id"]');

    // Verify appears in Shared tab
    await page.click('[data-testid="recipes-tab-shared"]');
    await expect(page.locator('[data-testid="recipe-test-recipe-id"]')).toBeVisible();
  });

  test('should delete recipe with confirmation', async ({ page }) => {
    await page.goto('/ops/test-table-id');

    await page.click('[data-testid="recipe-library"]');

    page.on('dialog', dialog => dialog.accept());
    await page.click('[data-testid="recipe-delete-test-recipe-id"]');

    await expect(page.locator('[data-testid="recipe-test-recipe-id"]')).not.toBeVisible();
  });
});
