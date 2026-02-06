/**
 * Vercel API Route: Fathom Token Refresh Cron Job
 *
 * Called daily by Vercel cron to proactively refresh all Fathom OAuth tokens.
 * This prevents token expiration by keeping the refresh token chain alive.
 *
 * Why this matters:
 * - Refresh tokens expire after ~30 days of non-use
 * - By refreshing daily, we ensure tokens never expire
 * - Users won't need to manually reconnect their Fathom accounts
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
    const edgeFunctionUrl = `${supabaseUrl}/functions/v1/fathom-token-refresh`;

    console.log('[fathom-token-refresh] Calling edge function...');

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
      console.log(`[fathom-token-refresh] Summary: ${summary.refreshed} refreshed, ${summary.failed} failed, ${summary.needs_reconnect} need reconnect`);
    }

    return res.status(200).json({
      success: true,
      ...(typeof data === 'object' && data !== null ? data : {}),
      triggeredBy: 'vercel-cron',
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    console.error('Fathom token refresh cron error:', error);
    return res.status(500).json({
      success: false,
      error: error.message || 'Unknown error',
      timestamp: new Date().toISOString(),
    });
  }
}
