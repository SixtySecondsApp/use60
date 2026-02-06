/**
 * OI-006: E2E Tests for Layer 1 — Chained Workflows
 */

import { test, expect } from '@playwright/test';

test.describe('Ops Workflows', () => {
  test('should create and save a workflow from natural language', async ({ page }) => {
    // Navigate to ops table
    await page.goto('/ops/test-table-id');

    // Open workflow builder
    await page.click('[data-testid="workflows-button"]');
    await page.click('[data-testid="create-workflow"]');

    // Enter workflow description
    await page.fill('[data-testid="workflow-description"]',
      'Every time a new contact syncs, enrich via Apollo and assign by territory'
    );

    // Parse workflow
    await page.click('[data-testid="parse-workflow"]');

    // Verify steps appear
    await expect(page.locator('[data-testid="workflow-step"]')).toHaveCount(2);

    // Save workflow
    await page.fill('[data-testid="workflow-name"]', 'Auto-enrich and assign');
    await page.click('[data-testid="save-workflow"]');

    // Verify appears in list
    await expect(page.locator('text=Auto-enrich and assign')).toBeVisible();
  });

  test('should execute workflow manually', async ({ page }) => {
    await page.goto('/ops/test-table-id');

    // Find workflow and click Run Now
    await page.click('[data-testid="workflow-run-test-workflow-id"]');

    // Verify execution starts
    await expect(page.locator('text=Workflow executed')).toBeVisible();
  });

  test('should toggle workflow on/off', async ({ page }) => {
    await page.goto('/ops/test-table-id');

    // Toggle workflow
    await page.click('[data-testid="workflow-toggle-test-workflow-id"]');

    // Verify status changed
    await expect(page.locator('[data-testid="workflow-status-test-workflow-id"]'))
      .toHaveAttribute('data-active', 'false');
  });
});
