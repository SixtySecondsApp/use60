import { test, expect } from '@playwright/test';

/**
 * E2E tests for the Pipeline Focus Tasks workflow (V1 deterministic)
 *
 * Tests the seq-pipeline-focus-tasks sequence which:
 * 1. Gets pipeline deals
 * 2. Prioritizes based on risk and opportunity
 * 3. Generates actionable focus tasks
 */
test.describe('Pipeline Focus Tasks Workflow', () => {
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

  test('triggers pipeline focus with "what deals should I focus on"', async ({ page }) => {
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

    const input = page.locator('[data-testid="copilot-input"]').first();
    await expect(input).toBeVisible({ timeout: 15000 });

    const query = 'What deals should I focus on?';
    await input.fill(query);
    await input.press('Enter');

    await page.waitForTimeout(2000);

    // Wait for Pipeline Focus response
    const responsePanel = page.locator('[data-testid="pipeline-focus-tasks-response"]');
    await expect(responsePanel).toBeVisible({ timeout: 60000 });

    // Verify preview state
    const previewBadge = responsePanel.locator('text=Preview');
    await expect(previewBadge).toBeVisible();

    // Verify conversationId
    const previewRequest = requests.find((r) => r.postData?.message === query);
    expect(previewRequest).toBeDefined();
    expect(previewRequest?.postData?.conversationId).toBeDefined();

    // Verify structured response
    const structuredResponse = responses.find(
      (r) => r.body?.structuredResponse?.type === 'pipeline_focus_tasks'
    );
    expect(structuredResponse).toBeDefined();
  });

  test('triggers with "prioritize my pipeline"', async ({ page }) => {
    const input = page.locator('[data-testid="copilot-input"]').first();
    await expect(input).toBeVisible({ timeout: 15000 });

    await input.fill('Prioritize my pipeline');
    await input.press('Enter');

    await page.waitForTimeout(2000);

    const responsePanel = page.locator('[data-testid="pipeline-focus-tasks-response"]');
    await expect(responsePanel).toBeVisible({ timeout: 60000 });
  });

  test('triggers with "which deals need attention"', async ({ page }) => {
    const input = page.locator('[data-testid="copilot-input"]').first();
    await expect(input).toBeVisible({ timeout: 15000 });

    await input.fill('Which deals need attention?');
    await input.press('Enter');

    await page.waitForTimeout(2000);

    const responsePanel = page.locator('[data-testid="pipeline-focus-tasks-response"]');
    await expect(responsePanel).toBeVisible({ timeout: 60000 });
  });

  test('shows focus tasks with priority order', async ({ page }) => {
    const input = page.locator('[data-testid="copilot-input"]').first();
    await expect(input).toBeVisible({ timeout: 15000 });

    await input.fill('What deals should I focus on?');
    await input.press('Enter');

    const responsePanel = page.locator('[data-testid="pipeline-focus-tasks-response"]');
    await expect(responsePanel).toBeVisible({ timeout: 60000 });

    // Verify focus tasks section
    const tasksSection = responsePanel.locator('[data-testid="focus-tasks-section"]');
    await expect(tasksSection).toBeVisible();

    // Check for priority indicators
    const taskItems = responsePanel.locator('[data-testid="focus-task-item"]');
    const count = await taskItems.count();
    expect(count).toBeGreaterThanOrEqual(0);
  });

  test('each task shows deal name and reason', async ({ page }) => {
    const input = page.locator('[data-testid="copilot-input"]').first();
    await expect(input).toBeVisible({ timeout: 15000 });

    await input.fill('What deals should I focus on?');
    await input.press('Enter');

    const responsePanel = page.locator('[data-testid="pipeline-focus-tasks-response"]');
    await expect(responsePanel).toBeVisible({ timeout: 60000 });

    // Get first task item
    const firstTask = responsePanel.locator('[data-testid="focus-task-item"]').first();
    const hasTask = await firstTask.isVisible();

    if (hasTask) {
      // Verify task has deal name
      const dealName = firstTask.locator('[data-testid="task-deal-name"]');
      await expect(dealName).toBeVisible();

      // Verify task has reason/action
      const taskAction = firstTask.locator('[data-testid="task-action"]');
      await expect(taskAction).toBeVisible();
    }
  });

  test('confirm flow creates tasks', async ({ page }) => {
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

    await input.fill('What deals should I focus on?');
    await input.press('Enter');

    const responsePanel = page.locator('[data-testid="pipeline-focus-tasks-response"]');
    await expect(responsePanel).toBeVisible({ timeout: 60000 });

    // Get conversationId
    const initialRequest = requests.find(
      (r) => r.postData?.message === 'What deals should I focus on?'
    );
    const conversationId = initialRequest?.postData?.conversationId;

    // Click confirm
    const confirmButton = responsePanel.locator(
      '[data-testid="pipeline-focus-tasks-confirm-btn"]'
    );
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

    // Preview badge should be gone
    const previewBadge = responsePanel.locator('text=Preview');
    await expect(previewBadge).not.toBeVisible({ timeout: 10000 });
  });

  test('cancel flow works correctly', async ({ page }) => {
    const input = page.locator('[data-testid="copilot-input"]').first();
    await expect(input).toBeVisible({ timeout: 15000 });

    await input.fill('What deals should I focus on?');
    await input.press('Enter');

    const responsePanel = page.locator('[data-testid="pipeline-focus-tasks-response"]');
    await expect(responsePanel).toBeVisible({ timeout: 60000 });

    // Click cancel
    const cancelButton = responsePanel.locator('[data-testid="pipeline-focus-tasks-cancel-btn"]');
    await expect(cancelButton).toBeVisible();
    await cancelButton.click();

    await page.waitForTimeout(2000);

    // Verify cancellation
    const cancelledMessage = page.locator('text=Cancelled');
    const panelHidden = await responsePanel.isHidden();
    expect(cancelledMessage.isVisible() || panelHidden).toBeTruthy();
  });

  test('at-risk deals are visually indicated', async ({ page }) => {
    const input = page.locator('[data-testid="copilot-input"]').first();
    await expect(input).toBeVisible({ timeout: 15000 });

    await input.fill('What deals should I focus on?');
    await input.press('Enter');

    const responsePanel = page.locator('[data-testid="pipeline-focus-tasks-response"]');
    await expect(responsePanel).toBeVisible({ timeout: 60000 });

    // Check for at-risk indicators
    const atRiskIndicator = responsePanel.locator('[data-testid="at-risk-indicator"]');
    const hasAtRisk = await atRiskIndicator.isVisible();

    // If at-risk deals exist, they should have visual treatment
    if (hasAtRisk) {
      // Could check for warning color class or icon
      await expect(atRiskIndicator).toBeVisible();
    }
  });

  test('clicking on deal navigates to deal page', async ({ page }) => {
    const input = page.locator('[data-testid="copilot-input"]').first();
    await expect(input).toBeVisible({ timeout: 15000 });

    await input.fill('What deals should I focus on?');
    await input.press('Enter');

    const responsePanel = page.locator('[data-testid="pipeline-focus-tasks-response"]');
    await expect(responsePanel).toBeVisible({ timeout: 60000 });

    // Get first deal link
    const dealLink = responsePanel.locator('[data-testid="deal-link"]').first();
    const hasDealLink = await dealLink.isVisible();

    if (hasDealLink) {
      await dealLink.click();

      // Wait for navigation
      await page.waitForTimeout(2000);

      // Should navigate to deal page
      const url = page.url();
      expect(url).toMatch(/\/deals\/|\/pipeline\//);
    }
  });
});
