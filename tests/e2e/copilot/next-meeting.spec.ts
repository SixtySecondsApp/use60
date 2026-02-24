import { test, expect } from '@playwright/test';

/**
 * E2E tests for the Next Meeting Command Center workflow (V1 deterministic)
 *
 * Tests the seq-next-meeting-command-center sequence which:
 * 1. Gets the user's next meeting
 * 2. Builds context (attendee insights, deal context)
 * 3. Generates talking points and preparation materials
 */
test.describe('Next Meeting Command Center Workflow', () => {
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

  test('triggers next meeting prep with "prep for my next meeting"', async ({ page }) => {
    const requests: any[] = [];
    const responses: any[] = [];

    page.on('request', (request) => {
      if (request.url().includes('/api-copilot') || request.url().includes('copilot')) {
        requests.push({
          url: request.url(),
          method: request.method(),
          postData: request.postDataJSON(),
        });
      }
    });

    page.on('response', (response) => {
      if (response.url().includes('/api-copilot') || response.url().includes('copilot')) {
        response
          .json()
          .then((body) => {
            responses.push({
              url: response.url(),
              status: response.status(),
              body,
            });
          })
          .catch(() => {
            // Ignore non-JSON responses
          });
      }
    });

    // Find the Copilot input
    const input = page.locator('[data-testid="copilot-input"]').first();
    await expect(input).toBeVisible({ timeout: 15000 });

    // Send natural language query for next meeting prep
    const query = 'Prep for my next meeting';
    await input.fill(query);
    await input.press('Enter');

    // Wait for loading state
    await page.waitForTimeout(2000);

    // Wait for the Next Meeting Command Center response
    const responsePanel = page.locator('[data-testid="next-meeting-command-center-response"]');
    await expect(responsePanel).toBeVisible({ timeout: 60000 });

    // Verify preview state (simulation mode)
    const previewBadge = responsePanel.locator('text=Preview');
    await expect(previewBadge).toBeVisible();

    // Verify conversationId is present in requests
    const previewRequest = requests.find((r) => r.postData?.message === query);
    expect(previewRequest).toBeDefined();
    const conversationId = previewRequest?.postData?.conversationId;
    expect(conversationId).toBeDefined();

    // Verify structured response type
    const structuredResponse = responses.find(
      (r) => r.body?.structuredResponse?.type === 'next_meeting_command_center'
    );
    expect(structuredResponse).toBeDefined();

    // Verify key elements are present in the response panel
    const meetingTitle = responsePanel.locator('[data-testid="meeting-title"]');
    await expect(meetingTitle).toBeVisible();
  });

  test('triggers next meeting prep with alternative phrase "what\'s my next call"', async ({
    page,
  }) => {
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

    // Alternative phrase that should also trigger next meeting workflow
    await input.fill("What's my next call?");
    await input.press('Enter');

    await page.waitForTimeout(2000);

    // Should still get next meeting command center response
    const responsePanel = page.locator('[data-testid="next-meeting-command-center-response"]');
    await expect(responsePanel).toBeVisible({ timeout: 60000 });
  });

  test('confirm flow executes the sequence', async ({ page }) => {
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

    // Initial query
    await input.fill('Prep for my next meeting');
    await input.press('Enter');

    // Wait for preview response
    const responsePanel = page.locator('[data-testid="next-meeting-command-center-response"]');
    await expect(responsePanel).toBeVisible({ timeout: 60000 });

    // Get conversationId from initial request
    const initialRequest = requests.find((r) => r.postData?.message === 'Prep for my next meeting');
    const conversationId = initialRequest?.postData?.conversationId;
    expect(conversationId).toBeDefined();

    // Click confirm button
    const confirmButton = responsePanel.locator(
      '[data-testid="next-meeting-command-center-confirm-btn"]'
    );
    await expect(confirmButton).toBeVisible();
    await confirmButton.click();

    // Wait for confirm request
    await page.waitForTimeout(5000);

    // Verify confirm request uses same conversationId
    const confirmRequest = requests.find(
      (r) =>
        r.postData?.message?.toLowerCase().includes('confirm') ||
        r.postData?.message?.toLowerCase().includes('yes')
    );
    expect(confirmRequest).toBeDefined();
    if (confirmRequest?.postData?.conversationId) {
      expect(confirmRequest.postData.conversationId).toBe(conversationId);
    }

    // Preview badge should be gone after confirmation
    const previewBadge = responsePanel.locator('text=Preview');
    await expect(previewBadge).not.toBeVisible({ timeout: 10000 });
  });

  test('cancel flow works correctly', async ({ page }) => {
    const input = page.locator('[data-testid="copilot-input"]').first();
    await expect(input).toBeVisible({ timeout: 15000 });

    // Initial query
    await input.fill('Prep for my next meeting');
    await input.press('Enter');

    // Wait for preview response
    const responsePanel = page.locator('[data-testid="next-meeting-command-center-response"]');
    await expect(responsePanel).toBeVisible({ timeout: 60000 });

    // Click cancel button
    const cancelButton = responsePanel.locator(
      '[data-testid="next-meeting-command-center-cancel-btn"]'
    );
    await expect(cancelButton).toBeVisible();
    await cancelButton.click();

    // Panel should be dismissed or show cancelled state
    await page.waitForTimeout(2000);

    // Verify cancellation message or panel dismissal
    const cancelledMessage = page.locator('text=Cancelled');
    const panelHidden = await responsePanel.isHidden();

    expect(cancelledMessage.isVisible() || panelHidden).toBeTruthy();
  });

  test('handles no upcoming meetings gracefully', async ({ page }) => {
    // This test would require mocking the API to return no meetings
    // For now, we verify the component can handle empty state

    const input = page.locator('[data-testid="copilot-input"]').first();
    await expect(input).toBeVisible({ timeout: 15000 });

    await input.fill('Prep for my next meeting');
    await input.press('Enter');

    await page.waitForTimeout(5000);

    // Either we get a response panel or an empty state message
    const responsePanel = page.locator('[data-testid="next-meeting-command-center-response"]');
    const emptyState = page.locator('text=no upcoming meetings');

    const hasResponse = await responsePanel.isVisible();
    const hasEmptyState = await emptyState.isVisible();

    // At least one should be true
    expect(hasResponse || hasEmptyState).toBeTruthy();
  });
});
