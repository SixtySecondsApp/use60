/**
 * Vercel API Route: Email Sync Cron Job
 * 
 * Called by Vercel cron jobs to sync emails for active users.
 * Proxies request to Supabase Edge Function.
 */

export default async function handler(req: any, res: any) {
  // Only allow GET/POST requests (Vercel cron jobs use GET by default)
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
    // Note: Vercel serverless functions don't have access to VITE_ prefixed vars
    // Use SUPABASE_URL (set in Vercel environment variables) - NOT VITE_SUPABASE_URL
    // VITE_ prefixed vars are exposed to browser and should never contain sensitive keys
    // Supabase uses "Publishable key" (frontend-safe) and "Secret keys" (server-side only)
    const supabaseUrl = process.env.SUPABASE_URL;
    // Use publishable key for edge function calls (edge functions validate internally)
    // Try SUPABASE_ANON_KEY first (for serverless functions), then fallback to VITE_ version
    const supabasePublishableKey = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;
    
    if (!supabasePublishableKey) {
      throw new Error('Missing SUPABASE_ANON_KEY or VITE_SUPABASE_ANON_KEY - required for edge function authentication');
    }

    if (!supabaseUrl || !supabasePublishableKey) {
      throw new Error('Missing Supabase configuration');
    }

    // Call Supabase Edge Function
    // Edge functions require Authorization header with publishable key or user JWT
    // The edge function authenticates using cron secret AND uses its own SUPABASE_SERVICE_ROLE_KEY for DB operations
    const edgeFunctionUrl = `${supabaseUrl}/functions/v1/scheduled-email-sync`;
    
    const response = await fetch(edgeFunctionUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${supabasePublishableKey}`, // Publishable key for edge function auth
        'apikey': supabasePublishableKey, // Also include as apikey header
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
    });
  } catch (error: any) {
    console.error('Email sync cron error:', error);
    return res.status(500).json({
      success: false,
      error: error.message || 'Unknown error',
    });
  }
}

