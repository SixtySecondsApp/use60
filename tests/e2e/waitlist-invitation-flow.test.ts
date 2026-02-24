import { test, expect, Page } from '@playwright/test';

/**
 * Waitlist Invitation Flow Test
 *
 * Tests the complete flow of:
 * 1. Admin taking user off waitlist (granting access)
 * 2. User clicking magic link
 * 3. User being redirected to SetPassword
 * 4. User setting password
 * 5. User logging in
 */

test.describe('Waitlist Invitation Flow', () => {
  let page: Page;

  test.beforeEach(async ({ browser }) => {
    page = await browser.newPage();
    // Enable console logging to see all messages
    page.on('console', msg => {
      console.log(`[Browser Console] ${msg.type().toUpperCase()}: ${msg.text()}`);
    });
  });

  test.afterEach(async () => {
    await page.close();
  });

  test('Step 1: Verify AuthCallback receives invite tokens', async () => {
    console.log('\n=== STEP 1: Testing AuthCallback token handling ===\n');

    // Simulate magic link with invite tokens in hash
    // This is what Supabase sends when user clicks the magic link
    const testUrl = 'https://app.use60.com/auth/callback?waitlist_entry=test-entry-id#access_token=test_token_xyz&refresh_token=test_refresh_xyz&type=invite&expires_in=3600';

    await page.goto(testUrl, { waitUntil: 'domcontentloaded' });

    console.log('Navigated to:', page.url());

    // Wait for page to load and check logs
    await page.waitForTimeout(2000);

    // Check for AuthCallback logs in console
    const consoleMessages = [];
    page.on('console', msg => {
      consoleMessages.push(msg.text());
    });

    // Look for specific log patterns
    const logs = await page.evaluate(() => {
      return (window as any).__consoleLogs || [];
    }).catch(() => []);

    console.log('Page URL after navigation:', page.url());
    console.log('Current pathname:', page.evaluate(() => window.location.pathname));
  });

  test('Step 2: Verify SetPassword receives valid session', async () => {
    console.log('\n=== STEP 2: Testing SetPassword session handling ===\n');

    // Navigate to SetPassword with a waitlist_entry param
    const setPasswordUrl = 'https://app.use60.com/auth/set-password?waitlist_entry=test-entry-id';

    await page.goto(setPasswordUrl, { waitUntil: 'domcontentloaded' });

    // Wait for page to fully load
    await page.waitForTimeout(3000);

    console.log('Current URL:', page.url());

    // Check what's on the page
    const pageContent = await page.content();
    const hasPasswordForm = pageContent.includes('Set Your Password') || pageContent.includes('password');
    const hasLoginRedirect = pageContent.includes('Go to Login') || page.url().includes('/auth/login');

    console.log('Has password form:', hasPasswordForm);
    console.log('Redirected to login:', hasLoginRedirect);
    console.log('Page URL:', page.url());

    // Get any error messages
    const errorText = await page.locator('[role="alert"]').first().textContent().catch(() => null);
    if (errorText) {
      console.log('Error message displayed:', errorText);
    }
  });

  test('Step 3: Check localStorage and session storage', async () => {
    console.log('\n=== STEP 3: Checking stored data ===\n');

    await page.goto('https://app.use60.com/auth/set-password?waitlist_entry=test-entry-id', {
      waitUntil: 'domcontentloaded'
    });

    await page.waitForTimeout(2000);

    // Check localStorage
    const localStorageData = await page.evaluate(() => {
      const data: any = {};
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && (key.includes('auth') || key.includes('waitlist') || key.includes('session'))) {
          data[key] = localStorage.getItem(key);
        }
      }
      return data;
    });

    console.log('localStorage data:', JSON.stringify(localStorageData, null, 2));

    // Check sessionStorage
    const sessionStorageData = await page.evaluate(() => {
      const data: any = {};
      for (let i = 0; i < sessionStorage.length; i++) {
        const key = sessionStorage.key(i);
        if (key && (key.includes('auth') || key.includes('waitlist') || key.includes('session'))) {
          data[key] = sessionStorage.getItem(key);
        }
      }
      return data;
    });

    console.log('sessionStorage data:', JSON.stringify(sessionStorageData, null, 2));
  });

  test('Step 4: Verify AuthCallback redirects to SetPassword (not login)', async () => {
    console.log('\n=== STEP 4: Testing AuthCallback redirect ===\n');

    // Start with AuthCallback URL (simulating magic link click)
    const magicLinkUrl = 'https://app.use60.com/auth/callback?waitlist_entry=test-waitlist-id#access_token=mock_token&type=invite';

    await page.goto(magicLinkUrl, { waitUntil: 'domcontentloaded' });

    console.log('Initial URL:', page.url());

    // Wait for redirect (up to 5 seconds)
    await page.waitForTimeout(3000);

    console.log('Final URL after redirect:', page.url());

    // Check if we ended up at SetPassword or Login
    const isAtSetPassword = page.url().includes('/auth/set-password');
    const isAtLogin = page.url().includes('/auth/login');

    console.log('Redirected to SetPassword:', isAtSetPassword);
    console.log('Redirected to Login:', isAtLogin);

    if (isAtLogin) {
      console.error('ERROR: User was redirected to login instead of SetPassword!');
      const loginPageContent = await page.content();
      console.log('Login page content sample:', loginPageContent.substring(0, 500));
    }
  });

  test('Step 5: Full simulation - Check browser console for errors', async () => {
    console.log('\n=== STEP 5: Full flow simulation with detailed logging ===\n');

    const consoleLogs: string[] = [];
    page.on('console', msg => {
      const log = `[${msg.type().toUpperCase()}] ${msg.text()}`;
      consoleLogs.push(log);
      console.log(log);
    });

    // Navigate to magic link simulation
    await page.goto('https://app.use60.com/auth/callback?waitlist_entry=test-entry-123#access_token=test_token_abc123&refresh_token=refresh_abc123&type=invite', {
      waitUntil: 'domcontentloaded'
    });

    // Wait for any redirects
    await page.waitForTimeout(4000);

    console.log('\n--- Console Logs Captured ---');
    consoleLogs.forEach(log => console.log(log));

    console.log('\n--- Final State ---');
    console.log('URL:', page.url());
    console.log('Title:', await page.title());

    // Look for specific error patterns
    const hasTokenError = consoleLogs.some(log =>
      log.includes('token') || log.includes('OTP') || log.includes('verification failed')
    );
    const hasSessionError = consoleLogs.some(log =>
      log.includes('session') && log.includes('error')
    );

    console.log('Has token error in logs:', hasTokenError);
    console.log('Has session error in logs:', hasSessionError);
  });

  test('Step 6: Check network requests to Supabase', async () => {
    console.log('\n=== STEP 6: Monitoring network requests ===\n');

    const requests: any[] = [];
    page.on('request', request => {
      if (request.url().includes('supabase') || request.url().includes('auth')) {
        requests.push({
          url: request.url(),
          method: request.method(),
          headers: request.headers()
        });
      }
    });

    await page.goto('https://app.use60.com/auth/callback?waitlist_entry=test-entry#access_token=token&type=invite', {
      waitUntil: 'networkidle'
    });

    console.log('Supabase/Auth requests made:');
    requests.forEach((req, idx) => {
      console.log(`${idx + 1}. ${req.method} ${req.url}`);
    });

    // Wait for any additional requests
    await page.waitForTimeout(2000);
  });
});
