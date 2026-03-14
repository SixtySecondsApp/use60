/**
 * check-commitment-deadlines — BA-004a
 *
 * Cron-triggered edge function that scans for overdue and approaching
 * commitments in deal_memory_events. Groups results by org, respecting
 * each org's proactive agent preferences (TRINITY-007 gate).
 *
 * This function is the scanner only — it does NOT send alerts (BA-004b).
 *
 * Requires service role auth (called by cron / fleet orchestrator).
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.43.4';
import {
  handleCorsPreflightRequest,
  jsonResponse,
  errorResponse,
} from '../_shared/corsHelper.ts';
import { isServiceRoleAuth } from '../_shared/edgeAuth.ts';
import { isAbilityEnabledForOrg } from '../_shared/proactive/cronPreferenceGate.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface CommitmentRow {
  id: string;
  org_id: string;
  deal_id: string;
  summary: string;
  detail: Record<string, unknown>;
  source_timestamp: string;
}

interface OrgResult {
  org_id: string;
  overdue: CommitmentRow[];
  approaching: CommitmentRow[];
}

// ---------------------------------------------------------------------------
// Main handler
// ---------------------------------------------------------------------------

serve(async (req: Request) => {
  const preflight = handleCorsPreflightRequest(req);
  if (preflight) return preflight;

  if (req.method !== 'POST') {
    return errorResponse('Method not allowed', req, 405);
  }

  // Auth: service role only (cron-triggered)
  const authHeader = req.headers.get('Authorization');
  if (!isServiceRoleAuth(authHeader, SUPABASE_SERVICE_ROLE_KEY)) {
    return errorResponse('Unauthorized — service role required', req, 401);
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  try {
    const now = new Date();
    const in48h = new Date(now.getTime() + 48 * 60 * 60 * 1000);

    // -----------------------------------------------------------------------
    // 1. Fetch all active pending commitments that have a deadline
    // -----------------------------------------------------------------------

    const { data: commitments, error: fetchError } = await supabase
      .from('deal_memory_events')
      .select('id, org_id, deal_id, summary, detail, source_timestamp')
      .eq('event_type', 'commitment_made')
      .eq('is_active', true)
      .filter('detail->>status', 'eq', 'pending')
      .not('detail->>deadline', 'is', null);

    if (fetchError) {
      console.error('[check-commitment-deadlines] Query error:', fetchError.message);
      return errorResponse(fetchError.message, req, 500);
    }

    if (!commitments || commitments.length === 0) {
      console.log('[check-commitment-deadlines] No pending commitments with deadlines found');
      return jsonResponse({ orgs_processed: 0, overdue: 0, approaching: 0 }, req);
    }

    console.log(`[check-commitment-deadlines] Found ${commitments.length} pending commitments with deadlines`);

    // -----------------------------------------------------------------------
    // 2. Bucket into overdue / approaching and group by org_id
    // -----------------------------------------------------------------------

    const orgMap = new Map<string, OrgResult>();

    for (const row of commitments as CommitmentRow[]) {
      const deadline = row.detail?.deadline as string | undefined;
      if (!deadline) continue;

      const deadlineDate = new Date(deadline);
      if (isNaN(deadlineDate.getTime())) {
        console.warn(`[check-commitment-deadlines] Invalid deadline for event ${row.id}: ${deadline}`);
        continue;
      }

      let bucket: 'overdue' | 'approaching' | null = null;

      if (deadlineDate.getTime() < now.getTime()) {
        bucket = 'overdue';
      } else if (deadlineDate.getTime() < in48h.getTime()) {
        bucket = 'approaching';
      }

      if (!bucket) continue;

      if (!orgMap.has(row.org_id)) {
        orgMap.set(row.org_id, { org_id: row.org_id, overdue: [], approaching: [] });
      }

      orgMap.get(row.org_id)![bucket].push(row);
    }

    // -----------------------------------------------------------------------
    // 3. Process each org — preference gate before counting
    // -----------------------------------------------------------------------

    let orgsProcessed = 0;
    let totalOverdue = 0;
    let totalApproaching = 0;

    for (const [orgId, orgResult] of orgMap) {
      // TRINITY-007: Check org preference gate before processing
      const gate = await isAbilityEnabledForOrg(supabase, orgId, 'commitment_deadline_scan');
      if (!gate.allowed) {
        console.log(`[check-commitment-deadlines] ${gate.reason} — skipping`);
        continue;
      }

      orgsProcessed++;
      totalOverdue += orgResult.overdue.length;
      totalApproaching += orgResult.approaching.length;

      console.log(
        `[check-commitment-deadlines] Org ${orgId}: ${orgResult.overdue.length} overdue, ${orgResult.approaching.length} approaching`,
      );
    }

    const result = {
      orgs_processed: orgsProcessed,
      overdue: totalOverdue,
      approaching: totalApproaching,
    };

    console.log(
      `[check-commitment-deadlines] Complete: ${orgsProcessed} orgs processed, ${totalOverdue} overdue, ${totalApproaching} approaching`,
    );

    return jsonResponse(result, req);
  } catch (error) {
    console.error('[check-commitment-deadlines] Unexpected error:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return errorResponse(message, req, 500);
  }
});
