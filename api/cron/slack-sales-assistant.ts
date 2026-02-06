/**
 * Vercel API Route: Slack Sales Assistant Cron Job
 *
 * Called by Vercel cron jobs every 15 minutes (after google-context-sync).
 * Sends DM notifications to sales reps with actionable follow-up prompts.
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

    if (!supabaseUrl) {
      throw new Error('Missing SUPABASE_URL environment variable');
    }

    if (!supabaseServiceKey) {
      throw new Error('Missing SUPABASE_SERVICE_ROLE_KEY');
    }

    // Call Supabase Edge Function
    const edgeFunctionUrl = `${supabaseUrl}/functions/v1/slack-sales-assistant`;

    const response = await fetch(edgeFunctionUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${supabaseServiceKey}`,
        'x-cron-secret': cronSecret || '',
      },
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
    console.error('Slack sales assistant cron error:', error);
    return res.status(500).json({
      success: false,
      error: error.message || 'Unknown error',
      timestamp: new Date().toISOString(),
    });
  }
}

