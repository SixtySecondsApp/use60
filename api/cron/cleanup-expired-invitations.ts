import type { VercelRequest, VercelResponse } from '@vercel/node';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Verify cron secret
  const authHeader = req.headers.authorization;
  const cronSecret = process.env.CRON_SECRET;

  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const supabaseUrl = process.env.SUPABASE_URL?.trim();
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();

    if (!supabaseUrl || !serviceKey) {
      return res.status(500).json({ error: 'Server configuration missing' });
    }

    // Call the Supabase edge function
    const response = await fetch(`${supabaseUrl}/functions/v1/cleanup-expired-invitations`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${serviceKey}`,
        'Content-Type': 'application/json',
      },
    });

    const data = await response.json();

    if (!response.ok) {
      console.error('[cleanup-cron] Edge function error:', data);
      return res.status(response.status).json(data);
    }

    console.log('[cleanup-cron] Success:', data);
    return res.status(200).json(data);

  } catch (error: any) {
    console.error('[cleanup-cron] Fatal error:', error);
    return res.status(500).json({ error: error.message });
  }
}
