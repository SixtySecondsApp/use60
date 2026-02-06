/**
 * Vercel API Route: Fathom Sync Cron Job
 *
 * Called by Vercel cron jobs every 15 minutes to sync meetings from Fathom.
 * Acts as a backup to the real-time webhook to ensure no meetings are missed.
 * Proxies request to Supabase Edge Function (fathom-cron-sync).
 */

export default async function handler(req: any, res: any) {
  // Only allow GET/POST requests (Vercel cron jobs use GET by default)
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Verify cron secret OR allow Vercel Cron header.
  // IMPORTANT: Vercel Cron calls do NOT include our custom x-cron-secret header.
  // If CRON_SECRET is set and we require it unconditionally, the cron job will 401
  // and background meeting sync will silently stop.
  const cronSecret = process.env.CRON_SECRET;
  const providedSecret = req.headers['x-cron-secret'] || (req.query?.secret as string);

  const cronHeader = req.headers['x-vercel-cron'];

  // If a CRON_SECRET is configured, require either:
  // - matching secret (manual trigger), OR
  // - Vercel Cron header (scheduled trigger)
  if (cronSecret && providedSecret !== cronSecret) {
    if (!cronHeader) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
  }

  // If no CRON_SECRET is configured, still require *some* auth signal:
  // - Vercel Cron header, OR
  // - a provided secret (useful for local/manual testing)
  if (!cronHeader && !providedSecret) {
    return res.status(401).json({
      error: 'Unauthorized: Must be called by Vercel cron or with secret',
    });
  }

  try {
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl) {
      throw new Error('Missing SUPABASE_URL environment variable');
    }

    if (!supabaseServiceKey) {
      throw new Error('Missing SUPABASE_SERVICE_ROLE_KEY - required for fathom-cron-sync');
    }

    // Call Supabase Edge Function (fathom-cron-sync)
    // This function loops through all active Fathom integrations and syncs each user
    const edgeFunctionUrl = `${supabaseUrl}/functions/v1/fathom-cron-sync`;

    const response = await fetch(edgeFunctionUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${supabaseServiceKey}`,
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      // Help debugging env mismatches without exposing secrets.
      // Common root cause: Vercel SUPABASE_SERVICE_ROLE_KEY doesn't match the Supabase project at SUPABASE_URL.
      const supabaseHost = (() => {
        try {
          return new URL(supabaseUrl).host;
        } catch {
          return supabaseUrl;
        }
      })();
      throw new Error(
        `Edge function error: ${response.status} - ${errorText} (supabase_host=${supabaseHost})`
      );
    }

    const data = await response.json() as Record<string, unknown>;

    return res.status(200).json({
      success: true,
      ...(typeof data === 'object' && data !== null ? data : {}),
      triggeredBy: 'vercel-cron',
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    console.error('Fathom sync cron error:', error);
    return res.status(500).json({
      success: false,
      error: error.message || 'Unknown error',
      timestamp: new Date().toISOString(),
    });
  }
}
