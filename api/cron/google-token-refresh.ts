/**
 * Vercel API Route: Google Token Refresh Cron Job
 *
 * Called every 4 hours by Vercel cron to proactively refresh all Google OAuth tokens.
 * This prevents token expiration and detects revoked tokens early.
 *
 * Why this matters:
 * - Google access tokens expire after 1 hour
 * - Refresh tokens can be revoked by users or become invalid
 * - By checking regularly, we ensure tokens stay valid
 * - Users get early notification if they need to reconnect
 */

export default async function handler(req: any, res: any) {
  // Only allow GET/POST requests (Vercel cron jobs use GET by default)
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Verify cron secret or Vercel cron header
  const cronSecret = process.env.CRON_SECRET;
  const providedSecret = req.headers['x-cron-secret'] || (req.query?.secret as string);

  if (cronSecret && providedSecret !== cronSecret) {
    // Also check for Vercel cron header
    const cronHeader = req.headers['x-vercel-cron'];
    if (!cronHeader) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
  }

  try {
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl) {
      throw new Error('Missing SUPABASE_URL environment variable');
    }

    if (!supabaseServiceKey) {
      throw new Error('Missing SUPABASE_SERVICE_ROLE_KEY - required for token refresh');
    }

    // Call Supabase Edge Function
    const edgeFunctionUrl = `${supabaseUrl}/functions/v1/google-token-refresh`;

    console.log('[google-token-refresh] Calling edge function...');

    const response = await fetch(edgeFunctionUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${supabaseServiceKey}`,
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Edge function error: ${response.status} - ${errorText}`);
    }

    const data = await response.json() as Record<string, unknown>;

    // Log summary for monitoring
    const summary = data.summary as Record<string, unknown> | undefined;
    if (summary) {
      console.log(
        `[google-token-refresh] Summary: ${summary.refreshed} refreshed, ${summary.skipped} skipped, ${summary.failed} failed, ${summary.needs_reconnect} need reconnect`
      );
    }

    return res.status(200).json({
      success: true,
      ...(typeof data === 'object' && data !== null ? data : {}),
      triggeredBy: 'vercel-cron',
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    console.error('Google token refresh cron error:', error);
    return res.status(500).json({
      success: false,
      error: error.message || 'Unknown error',
      timestamp: new Date().toISOString(),
    });
  }
}
