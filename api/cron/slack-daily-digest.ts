/**
 * Vercel API Route: Slack Daily Digest Cron Job
 *
 * Called by Vercel cron jobs to trigger the Supabase Edge Function `slack-daily-digest`.
 * The edge function fans out to all orgs with `slack_notification_settings.feature = 'daily_digest'`
 * and `is_enabled = true`.
 */
 
export default async function handler(req: any, res: any) {
  // Allow GET/POST (Vercel cron uses GET by default)
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
 
  // Verify cron secret
  const cronSecret = process.env.CRON_SECRET;
  const providedSecret = req.headers['x-cron-secret'] || (req.query?.secret as string);
 
  if (cronSecret && providedSecret !== cronSecret) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
 
  // Verify this is a Vercel cron job
  const cronHeader = req.headers['x-vercel-cron'];
  if (!cronHeader && !providedSecret) {
    return res.status(401).json({ error: 'Unauthorized: Must be called by Vercel cron or with secret' });
  }
 
  try {
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
 
    if (!supabaseUrl) throw new Error('Missing SUPABASE_URL environment variable');
    if (!supabaseServiceKey) throw new Error('Missing SUPABASE_SERVICE_ROLE_KEY');
 
    const edgeFunctionUrl = `${supabaseUrl}/functions/v1/slack-daily-digest`;
 
    const response = await fetch(edgeFunctionUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${supabaseServiceKey}`,
        'x-cron-secret': cronSecret || '',
      },
      body: JSON.stringify({ triggeredBy: 'vercel-cron' }),
    });
 
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Edge function error: ${response.status} - ${errorText}`);
    }
 
    const data = await response.json() as Record<string, unknown>;

    return res.status(200).json({
      success: true,
      ...(typeof data === 'object' && data !== null ? data : {}),
      triggeredBy: 'vercel-cron',
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    console.error('Slack daily digest cron error:', error);
    return res.status(500).json({
      success: false,
      error: error.message || 'Unknown error',
      timestamp: new Date().toISOString(),
    });
  }
}

