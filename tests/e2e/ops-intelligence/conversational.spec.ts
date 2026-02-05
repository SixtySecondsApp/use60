/**
 * OI-029: E2E Tests for Layer 5 — Conversational Context
 */

import { test, expect } from '@playwright/test';

test.describe('Conversational Context', () => {
  test('should maintain context across multi-turn queries', async ({ page }) => {
    await page.goto('/ops/test-table-id');

    // First query
    await page.fill('[data-testid="ai-query-input"]', 'Show me all law firm contacts');
    await page.press('[data-testid="ai-query-input"]', 'Enter');
    await expect(page.locator('[data-testid="active-filter"]')).toContainText('law firm');

    // Follow-up query (uses context)
    await page.fill('[data-testid="ai-query-input"]', 'Just the senior ones');
    await page.press('[data-testid="ai-query-input"]', 'Enter');

    // Verify filter refined (not replaced)
    await expect(page.locator('[data-testid="active-filter"]')).toHaveCount(2);
  });

  test('should expand chat thread to show history', async ({ page }) => {
    await page.goto('/ops/test-table-id');

    // Execute 3 queries to build history
    for (const query of ['Show all contacts', 'Just directors', 'How many total?']) {
      await page.fill('[data-testid="ai-query-input"]', query);
      await page.press('[data-testid="ai-query-input"]', 'Enter');
      await page.waitForTimeout(500);
    }

    // Expand thread
    await page.click('[data-testid="expand-chat-thread"]');

    // Verify all 3 messages shown
    await expect(page.locator('[data-testid="chat-message"]')).toHaveCount(6); // 3 user + 3 AI
  });

  test('should reset context with New Session button', async ({ page }) => {
    await page.goto('/ops/test-table-id');

    // Build some context
    await page.fill('[data-testid="ai-query-input"]', 'Show law firms');
    await page.press('[data-testid="ai-query-input"]', 'Enter');

    // New session
    await page.click('[data-testid="new-chat-session"]');

    // Verify context cleared
    await expect(page.locator('[data-testid="chat-message"]')).toHaveCount(0);
    await expect(page.locator('[data-testid="active-filter"]')).toHaveCount(0);
  });

  test('should show session message count in collapsed state', async ({ page }) => {
    await page.goto('/ops/test-table-id');

    // Execute 2 queries
    await page.fill('[data-testid="ai-query-input"]', 'Filter by status');
    await page.press('[data-testid="ai-query-input"]', 'Enter');
    await page.fill('[data-testid="ai-query-input"]', 'Sort by score');
    await page.press('[data-testid="ai-query-input"]', 'Enter');

    // Verify badge shows count
    await expect(page.locator('[data-testid="session-count"]')).toContainText('4 messages');
  });
});
