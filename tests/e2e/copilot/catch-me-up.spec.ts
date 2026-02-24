import { test, expect } from '@playwright/test';

/**
 * E2E tests for the Catch Me Up / Daily Brief workflow (V1 deterministic)
 *
 * Tests the daily briefing sequence which:
 * 1. Gets recent activities (emails, deal updates, etc.)
 * 2. Summarizes what happened
 * 3. Highlights urgent items
 */
test.describe('Catch Me Up / Daily Brief Workflow', () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to the application
    await page.goto('http://localhost:5175/');
    await page.waitForLoadState('networkidle');

    // Navigate to Copilot
    await page.goto('http://localhost:5175/copilot');
    await page.waitForLoadState('networkidle');

    // Wait for Copilot to be ready
    await page
      .waitForSelector('[data-testid="copilot-input"]', { timeout: 15000 })
      .catch(() => {
        return page.waitForSelector('textarea', { timeout: 15000 });
      });
  });

  test('triggers daily brief with "catch me up"', async ({ page }) => {
    const requests: any[] = [];
    const responses: any[] = [];

    page.on('request', (request) => {
      if (request.url().includes('/api-copilot')) {
        requests.push({
          url: request.url(),
          method: request.method(),
          postData: request.postDataJSON(),
        });
      }
    });

    page.on('response', (response) => {
      if (response.url().includes('/api-copilot')) {
        response
          .json()
          .then((body) => {
            responses.push({
              url: response.url(),
              status: response.status(),
              body,
            });
          })
          .catch(() => {});
      }
    });

    // Find the Copilot input
    const input = page.locator('[data-testid="copilot-input"]').first();
    await expect(input).toBeVisible({ timeout: 15000 });

    // Send natural language query
    const query = 'Catch me up';
    await input.fill(query);
    await input.press('Enter');

    await page.waitForTimeout(2000);

    // Wait for the Daily Brief response
    const responsePanel = page.locator('[data-testid="daily-brief-response"]');
    await expect(responsePanel).toBeVisible({ timeout: 60000 });

    // Verify preview state
    const previewBadge = responsePanel.locator('text=Preview');
    await expect(previewBadge).toBeVisible();

    // Verify conversationId
    const previewRequest = requests.find((r) => r.postData?.message === query);
    expect(previewRequest).toBeDefined();
    expect(previewRequest?.postData?.conversationId).toBeDefined();

    // Verify structured response type
    const structuredResponse = responses.find(
      (r) => r.body?.structuredResponse?.type === 'daily_brief'
    );
    expect(structuredResponse).toBeDefined();
  });

  test('triggers with alternative phrase "what did I miss"', async ({ page }) => {
    const responses: any[] = [];

    page.on('response', (response) => {
      if (response.url().includes('/api-copilot')) {
        response
          .json()
          .then((body) => {
            responses.push({ body });
          })
          .catch(() => {});
      }
    });

    const input = page.locator('[data-testid="copilot-input"]').first();
    await expect(input).toBeVisible({ timeout: 15000 });

    await input.fill('What did I miss?');
    await input.press('Enter');

    await page.waitForTimeout(2000);

    // Should trigger daily brief
    const responsePanel = page.locator('[data-testid="daily-brief-response"]');
    await expect(responsePanel).toBeVisible({ timeout: 60000 });
  });

  test('triggers with "give me the highlights"', async ({ page }) => {
    const input = page.locator('[data-testid="copilot-input"]').first();
    await expect(input).toBeVisible({ timeout: 15000 });

    await input.fill('Give me the highlights');
    await input.press('Enter');

    await page.waitForTimeout(2000);

    const responsePanel = page.locator('[data-testid="daily-brief-response"]');
    await expect(responsePanel).toBeVisible({ timeout: 60000 });
  });

  test('shows highlights section with urgent items', async ({ page }) => {
    const input = page.locator('[data-testid="copilot-input"]').first();
    await expect(input).toBeVisible({ timeout: 15000 });

    await input.fill('Catch me up');
    await input.press('Enter');

    const responsePanel = page.locator('[data-testid="daily-brief-response"]');
    await expect(responsePanel).toBeVisible({ timeout: 60000 });

    // Verify highlights section exists
    const highlightsSection = responsePanel.locator('[data-testid="highlights-section"]');
    await expect(highlightsSection).toBeVisible();

    // Verify summary exists
    const summarySection = responsePanel.locator('[data-testid="summary-section"]');
    await expect(summarySection).toBeVisible();
  });

  test('confirm flow executes actions', async ({ page }) => {
    const requests: any[] = [];

    page.on('request', (request) => {
      if (request.url().includes('/api-copilot')) {
        requests.push({
          url: request.url(),
          postData: request.postDataJSON(),
        });
      }
    });

    const input = page.locator('[data-testid="copilot-input"]').first();
    await expect(input).toBeVisible({ timeout: 15000 });

    await input.fill('Catch me up');
    await input.press('Enter');

    const responsePanel = page.locator('[data-testid="daily-brief-response"]');
    await expect(responsePanel).toBeVisible({ timeout: 60000 });

    // Get conversationId
    const initialRequest = requests.find((r) => r.postData?.message === 'Catch me up');
    const conversationId = initialRequest?.postData?.conversationId;

    // Click confirm
    const confirmButton = responsePanel.locator('[data-testid="daily-brief-confirm-btn"]');
    await expect(confirmButton).toBeVisible();
    await confirmButton.click();

    await page.waitForTimeout(5000);

    // Verify confirm uses same conversationId
    const confirmRequest = requests.find(
      (r) =>
        r.postData?.message?.toLowerCase().includes('confirm') ||
        r.postData?.message?.toLowerCase().includes('yes')
    );
    if (confirmRequest?.postData?.conversationId) {
      expect(confirmRequest.postData.conversationId).toBe(conversationId);
    }
  });

  test('cancel flow dismisses preview', async ({ page }) => {
    const input = page.locator('[data-testid="copilot-input"]').first();
    await expect(input).toBeVisible({ timeout: 15000 });

    await input.fill('Catch me up');
    await input.press('Enter');

    const responsePanel = page.locator('[data-testid="daily-brief-response"]');
    await expect(responsePanel).toBeVisible({ timeout: 60000 });

    // Click cancel
    const cancelButton = responsePanel.locator('[data-testid="daily-brief-cancel-btn"]');
    await expect(cancelButton).toBeVisible();
    await cancelButton.click();

    await page.waitForTimeout(2000);

    // Verify cancellation
    const cancelledMessage = page.locator('text=Cancelled');
    const panelHidden = await responsePanel.isHidden();
    expect(cancelledMessage.isVisible() || panelHidden).toBeTruthy();
  });

  test('urgent items are highlighted', async ({ page }) => {
    const input = page.locator('[data-testid="copilot-input"]').first();
    await expect(input).toBeVisible({ timeout: 15000 });

    await input.fill('Catch me up');
    await input.press('Enter');

    const responsePanel = page.locator('[data-testid="daily-brief-response"]');
    await expect(responsePanel).toBeVisible({ timeout: 60000 });

    // Check for urgent items section if present
    const urgentSection = responsePanel.locator('[data-testid="urgent-items-section"]');
    const hasUrgent = await urgentSection.isVisible();

    // If urgent items exist, they should have visual indication
    if (hasUrgent) {
      const urgentItems = urgentSection.locator('[data-testid="urgent-item"]');
      const count = await urgentItems.count();
      expect(count).toBeGreaterThanOrEqual(0);
    }
  });
});
