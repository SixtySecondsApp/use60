import { test as setup, expect } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';

const authFile = 'playwright/.auth/user.json';

setup('authenticate via magic link', async ({ page }) => {
  const supabaseUrl = process.env.VITE_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const testEmail = process.env.TEST_USER_EMAIL || 'playwright@test.com';
  const baseUrl = process.env.BASE_URL || 'http://127.0.0.1:5175';

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error(
      'Missing VITE_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY — cannot generate magic link'
    );
  }

  // Create admin client with service role key
  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // Generate a one-time magic link (no email sent)
  const { data, error } = await supabase.auth.admin.generateLink({
    type: 'magiclink',
    email: testEmail,
    options: { redirectTo: `${baseUrl}/auth/callback` },
  });

  if (error || !data?.properties?.action_link) {
    throw new Error(
      `Failed to generate magic link: ${error?.message || 'No action_link returned'}`
    );
  }

  // Navigate to the magic link — Supabase verifies token and redirects to app
  await page.goto(data.properties.action_link);

  // Wait for auth callback to complete and redirect to dashboard
  await page.waitForURL('**/dashboard**', { timeout: 30000 });

  // Verify we're logged in
  await expect(
    page.locator('[data-testid="user-menu"], .user-avatar, text=Dashboard')
  ).toBeVisible();

  // Save authentication state — magic link is already consumed (single-use)
  await page.context().storageState({ path: authFile });
});