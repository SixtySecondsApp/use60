/**
 * memory-commitment-tracker — Daily cron function that checks for overdue
 * commitments and marks them as broken, generating risk_flag events.
 *
 * Intended to run daily at 8am UTC via pg_cron or fleet orchestrator.
 * Requires service role auth — not a user-facing endpoint.
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.43.4';
import { getCorsHeaders, handleCorsPreflightRequest } from '../_shared/corsHelper.ts';
import { getOverdueCommitments, markCommitmentBroken } from '../_shared/memory/commitments.ts';

serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);
  if (req.method === 'OPTIONS') return handleCorsPreflightRequest(req);

  try {
    // Service role auth — only the cron job or fleet orchestrator may call this
    const authHeader = req.headers.get('Authorization');
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
    if (!authHeader?.includes(serviceKey)) {
      return new Response(JSON.stringify({ error: 'Service role required' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabase = createClient(Deno.env.get('SUPABASE_URL')!, serviceKey);
    const body = await req.json().catch(() => ({}));
    const { org_id } = body;

    if (!org_id) {
      // No org_id supplied — scan all orgs that have active commitment events
      const { data: orgRows } = await supabase
        .from('deal_memory_events')
        .select('org_id')
        .eq('event_type', 'commitment_made')
        .eq('is_active', true);

      const orgIds = [...new Set((orgRows || []).map((r: { org_id: string }) => r.org_id))];

      let totalProcessed = 0;
      let totalBroken = 0;

      for (const oid of orgIds) {
        const result = await processOrgCommitments(oid, supabase);
        totalProcessed += result.processed;
        totalBroken += result.broken;
      }

      return new Response(
        JSON.stringify({ orgs: orgIds.length, totalProcessed, totalBroken }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const result = await processOrgCommitments(org_id, supabase);
    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (err) {
    return new Response(
      JSON.stringify({ error: (err as Error).message }),
      {
        status: 500,
        headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' },
      },
    );
  }
});

async function processOrgCommitments(
  orgId: string,
  supabase: ReturnType<typeof createClient>,
): Promise<{ processed: number; broken: number }> {
  const overdue = await getOverdueCommitments(orgId, supabase);
  let broken = 0;

  for (const commitment of overdue) {
    const deadline = new Date(commitment.deadline!);
    const daysOverdue = Math.floor((Date.now() - deadline.getTime()) / (1000 * 60 * 60 * 24));

    const success = await markCommitmentBroken(
      commitment.event_id,
      orgId,
      commitment.deal_id,
      supabase,
      daysOverdue,
    );

    if (success) {
      broken++;
      // TODO: Send Slack notification (future story — use _shared/proactive/ delivery)
      console.log(
        `[commitment-tracker] Marked commitment ${commitment.event_id} as broken (${daysOverdue} days overdue)`,
      );
    }
  }

  return { processed: overdue.length, broken };
}
