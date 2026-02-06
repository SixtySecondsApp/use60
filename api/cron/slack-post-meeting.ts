/**
 * Vercel Cron API Route: Slack Post-Meeting Debrief
 *
 * Triggers the `slack-post-meeting` edge function frequently so it can scan for
 * meetings with transcripts/summaries ready and post debriefs (plus HITL follow-up).
 */
import type { VercelRequest, VercelResponse } from '@vercel/node';

const SUPABASE_URL = process.env.SUPABASE_URL!;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY!;
const CRON_SECRET = process.env.CRON_SECRET;

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const providedSecret = req.headers['x-cron-secret'];
  if (!CRON_SECRET || providedSecret !== CRON_SECRET) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const response = await fetch(`${SUPABASE_URL}/functions/v1/slack-post-meeting`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
        'Content-Type': 'application/json',
        'x-cron-secret': CRON_SECRET,
      },
      body: JSON.stringify({}),
    });

    const data = await response.json() as Record<string, unknown>;

    if (!response.ok) {
      return res.status(response.status).json(data);
    }

    return res.status(200).json({
      success: true,
      ...(typeof data === 'object' && data !== null ? data : {}),
    });
  } catch (error) {
    console.error('[cron/slack-post-meeting] Error:', error);
    return res.status(500).json({
      error: error instanceof Error ? error.message : 'Internal server error',
    });
  }
}

