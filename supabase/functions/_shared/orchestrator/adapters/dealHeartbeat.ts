/**
 * Deal Heartbeat Scan Adapter (PST-005)
 *
 * Orchestrator adapter that triggers the proactive-deal-heartbeat edge function
 * for a specific deal after a meeting ends. Fires as the final wave step in
 * the meeting_ended sequence.
 *
 * This adapter is lightweight — the heavy lifting is done by the heartbeat
 * edge function itself.
 */

import type { SkillAdapter, StepResult, ExecutionContext } from '../types.ts';

export const dealHeartbeatScanAdapter: SkillAdapter = {
  name: 'deal-heartbeat-scan',

  async execute(context: ExecutionContext): Promise<StepResult> {
    const startMs = Date.now();
    const dealId = context.tier2?.deal?.id || context.tier1?.dealId;
    const orgId = context.tier1?.orgId;

    if (!dealId || !orgId) {
      return {
        success: true,
        output: { skipped: true, reason: 'No deal_id or org_id in context' },
        duration_ms: Date.now() - startMs,
      };
    }

    try {
      const supabaseUrl = Deno.env.get('SUPABASE_URL');
      const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

      if (!supabaseUrl || !serviceRoleKey) {
        return {
          success: true,
          output: { skipped: true, reason: 'Missing SUPABASE_URL or SERVICE_ROLE_KEY' },
          duration_ms: Date.now() - startMs,
        };
      }

      // Fire-and-forget call to proactive-deal-heartbeat
      const response = await fetch(
        `${supabaseUrl}/functions/v1/proactive-deal-heartbeat`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${serviceRoleKey}`,
          },
          body: JSON.stringify({
            deal_id: dealId,
            org_id: orgId,
            trigger_type: 'meeting_ended',
          }),
        }
      );

      const result = await response.json();

      return {
        success: response.ok,
        output: {
          trigger_type: 'meeting_ended',
          deal_id: dealId,
          observations_created: result.observations_created ?? 0,
          deals_scanned: result.deals_scanned ?? 0,
        },
        duration_ms: Date.now() - startMs,
      };
    } catch (err) {
      console.error('[deal-heartbeat-scan] Error:', err);
      return {
        success: false,
        output: { error: (err as Error).message },
        duration_ms: Date.now() - startMs,
      };
    }
  },
};
