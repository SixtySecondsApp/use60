/**
 * Vercel API Route: Attio Token Refresh Cron Job
 *
 * Called periodically by Vercel cron to proactively refresh all Attio OAuth tokens
 * that are expiring within 10 minutes.
 */

export default async function handler(req: any, res: any) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Verify cron secret or Vercel cron header
  const cronSecret = process.env.CRON_SECRET;
  const providedSecret = req.headers['x-cron-secret'] || (req.query?.secret as string);

  if (cronSecret && providedSecret !== cronSecret) {
    const cronHeader = req.headers['x-vercel-cron'];
    if (!cronHeader) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
  }

  try {
    // Refresh tokens for both production and staging environments
    const environments = [
      {
        name: 'production',
        url: process.env.SUPABASE_URL,
        key: process.env.SUPABASE_SERVICE_ROLE_KEY,
      },
      {
        name: 'staging',
        url: process.env.SUPABASE_STAGING_URL || 'https://caerqjzvuerejfrdtygb.supabase.co',
        key: process.env.SUPABASE_STAGING_SERVICE_ROLE_KEY,
      },
    ];

    const results: Record<string, any> = {};

    for (const env of environments) {
      if (!env.url || !env.key) {
        results[env.name] = { skipped: true, reason: 'Missing URL or service key' };
        continue;
      }

      try {
        const edgeFunctionUrl = `${env.url}/functions/v1/attio-token-refresh`;
        const response = await fetch(edgeFunctionUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${env.key}`,
          },
        });

        if (!response.ok) {
          const errorText = await response.text();
          results[env.name] = { success: false, error: `${response.status} - ${errorText}` };
        } else {
          const data = await response.json();
          results[env.name] = { success: true, ...data };
        }
      } catch (envError: any) {
        results[env.name] = { success: false, error: envError.message };
      }
    }

    return res.status(200).json({
      success: true,
      results,
      triggeredBy: 'vercel-cron',
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    console.error('Attio token refresh cron error:', error);
    return res.status(500).json({
      success: false,
      error: error.message || 'Unknown error',
      timestamp: new Date().toISOString(),
    });
  }
}
