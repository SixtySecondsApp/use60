import { test, expect } from '@playwright/test';

test.describe('Copilot Everyday Workflows', () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to the application (use port 5175 for main app)
    await page.goto('http://localhost:5175/');
    
    // Wait for the page to load completely
    await page.waitForLoadState('networkidle');
    
    // Navigate to Copilot
    await page.goto('http://localhost:5175/copilot');
    await page.waitForLoadState('networkidle');
    
    // Wait for Copilot to be ready
    await page.waitForSelector('[data-testid="copilot-input"]', { timeout: 15000 }).catch(() => {
      // Fallback: look for any textarea in the copilot area
      return page.waitForSelector('textarea', { timeout: 15000 });
    });
  });

  test('Daily Focus Plan workflow - preview and confirm', async ({ page }) => {
    // Capture network requests
    const requests: any[] = [];
    const responses: any[] = [];
    
    page.on('request', request => {
      if (request.url().includes('/api-copilot') || request.url().includes('copilot')) {
        requests.push({
          url: request.url(),
          method: request.method(),
          postData: request.postDataJSON(),
        });
      }
    });
    
    page.on('response', response => {
      if (response.url().includes('/api-copilot') || response.url().includes('copilot')) {
        response.json().then(body => {
          responses.push({
            url: response.url(),
            status: response.status(),
            body,
          });
        }).catch(() => {
          // Ignore non-JSON responses
        });
      }
    });

    // Find the Copilot input
    const input = page.locator('[data-testid="copilot-input"]').first();
    await expect(input).toBeVisible({ timeout: 15000 });

    // Send natural language query
    const query = 'What should I do today?';
    await input.fill(query);
    await input.press('Enter');

    // Wait for response - check for loading state first
    await page.waitForTimeout(2000);
    
    // Wait for structured response panel to appear
    const dailyFocusPanel = page.locator('[data-testid="daily-focus-plan-response"]');
    await expect(dailyFocusPanel).toBeVisible({ timeout: 60000 });

    // Verify preview state
    const previewBadge = dailyFocusPanel.locator('text=Preview');
    await expect(previewBadge).toBeVisible();

    // Verify conversationId is present in requests
    const previewRequest = requests.find(r => r.postData?.message === query);
    expect(previewRequest).toBeDefined();
    const conversationId = previewRequest?.postData?.conversationId;
    expect(conversationId).toBeDefined();

    // Click confirm button
    const confirmButton = dailyFocusPanel.locator('[data-testid="daily-focus-plan-confirm-btn"]');
    await expect(confirmButton).toBeVisible();
    await confirmButton.click();

    // Wait for confirm response
    await page.waitForTimeout(5000);

    // Verify confirm request includes same conversationId
    const confirmRequest = requests.find(r => 
      r.postData?.message?.toLowerCase().includes('confirm') || 
      r.postData?.message?.toLowerCase().includes('yes')
    );
    expect(confirmRequest).toBeDefined();
    if (confirmRequest?.postData?.conversationId) {
      expect(confirmRequest.postData.conversationId).toBe(conversationId);
    }

    // Verify structured response type in responses
    const structuredResponse = responses.find(r => 
      r.body?.structuredResponse?.type === 'daily_focus_plan'
    );
    expect(structuredResponse).toBeDefined();
  });

  test('Follow-Up Zero Inbox workflow - preview and confirm', async ({ page }) => {
    // Capture network requests
    const requests: any[] = [];
    const responses: any[] = [];
    
    page.on('request', request => {
      if (request.url().includes('/api-copilot') || request.url().includes('copilot')) {
        requests.push({
          url: request.url(),
          method: request.method(),
          postData: request.postDataJSON(),
        });
      }
    });
    
    page.on('response', response => {
      if (response.url().includes('/api-copilot') || response.url().includes('copilot')) {
        response.json().then(body => {
          responses.push({
            url: response.url(),
            status: response.status(),
            body,
          });
        }).catch(() => {
          // Ignore non-JSON responses
        });
      }
    });

    // Find the Copilot input
    const input = page.locator('[data-testid="copilot-input"]').first();
    await expect(input).toBeVisible({ timeout: 15000 });

    // Send natural language query
    const query = 'What follow-ups am I missing?';
    await input.fill(query);
    await input.press('Enter');

    // Wait for response
    await page.waitForTimeout(2000);
    
    // Check for structured response panel
    const followupPanel = page.locator('[data-testid="followup-zero-inbox-response"]');
    await expect(followupPanel).toBeVisible({ timeout: 60000 });

    // Verify preview state
    const previewBadge = followupPanel.locator('text=Preview');
    await expect(previewBadge).toBeVisible();

    // Verify conversationId is present
    const previewRequest = requests.find(r => r.postData?.message === query);
    expect(previewRequest).toBeDefined();
    const conversationId = previewRequest?.postData?.conversationId;
    expect(conversationId).toBeDefined();

    // Click confirm button
    const confirmButton = followupPanel.locator('[data-testid="followup-zero-inbox-confirm-btn"]');
    await expect(confirmButton).toBeVisible();
    await confirmButton.click();

    // Wait for confirm response
    await page.waitForTimeout(5000);

    // Verify confirm request includes same conversationId
    const confirmRequest = requests.find(r => 
      r.postData?.message?.toLowerCase().includes('confirm') || 
      r.postData?.message?.toLowerCase().includes('yes')
    );
    expect(confirmRequest).toBeDefined();
    if (confirmRequest?.postData?.conversationId) {
      expect(confirmRequest.postData.conversationId).toBe(conversationId);
    }

    // Verify structured response type
    const structuredResponse = responses.find(r => 
      r.body?.structuredResponse?.type === 'followup_zero_inbox'
    );
    expect(structuredResponse).toBeDefined();
  });

  test('Deal Slippage Guardrails workflow - preview and confirm', async ({ page }) => {
    // Capture network requests
    const requests: any[] = [];
    const responses: any[] = [];
    
    page.on('request', request => {
      if (request.url().includes('/api-copilot') || request.url().includes('copilot')) {
        requests.push({
          url: request.url(),
          method: request.method(),
          postData: request.postDataJSON(),
        });
      }
    });
    
    page.on('response', response => {
      if (response.url().includes('/api-copilot') || response.url().includes('copilot')) {
        response.json().then(body => {
          responses.push({
            url: response.url(),
            status: response.status(),
            body,
          });
        }).catch(() => {
          // Ignore non-JSON responses
        });
      }
    });

    // Find the Copilot input
    const input = page.locator('[data-testid="copilot-input"]').first();
    await expect(input).toBeVisible({ timeout: 15000 });

    // Send natural language query
    const query = 'What deals are at risk?';
    await input.fill(query);
    await input.press('Enter');

    // Wait for response
    await page.waitForTimeout(2000);
    
    // Check for structured response panel
    const slippagePanel = page.locator('[data-testid="deal-slippage-guardrails-response"]');
    await expect(slippagePanel).toBeVisible({ timeout: 60000 });

    // Verify preview state
    const previewBadge = slippagePanel.locator('text=Preview');
    await expect(previewBadge).toBeVisible();

    // Verify conversationId is present
    const previewRequest = requests.find(r => r.postData?.message === query);
    expect(previewRequest).toBeDefined();
    const conversationId = previewRequest?.postData?.conversationId;
    expect(conversationId).toBeDefined();

    // Click confirm button
    const confirmButton = slippagePanel.locator('[data-testid="deal-slippage-guardrails-confirm-btn"]');
    await expect(confirmButton).toBeVisible();
    await confirmButton.click();

    // Wait for confirm response
    await page.waitForTimeout(5000);

    // Verify confirm request includes same conversationId
    const confirmRequest = requests.find(r => 
      r.postData?.message?.toLowerCase().includes('confirm') || 
      r.postData?.message?.toLowerCase().includes('yes')
    );
    expect(confirmRequest).toBeDefined();
    if (confirmRequest?.postData?.conversationId) {
      expect(confirmRequest.postData.conversationId).toBe(conversationId);
    }

    // Verify structured response type
    const structuredResponse = responses.find(r => 
      r.body?.structuredResponse?.type === 'deal_slippage_guardrails'
    );
    expect(structuredResponse).toBeDefined();
  });
});
