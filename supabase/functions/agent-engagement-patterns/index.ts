/**
 * agent-engagement-patterns (SIG-004)
 *
 * Calculates and stores per-contact email engagement patterns for signal
 * intelligence. Supports two execution modes:
 *
 *   batch       — Weekly cron (Sunday 2am UTC). Calls batch_recalculate_engagement_patterns
 *                 for every org that has not disabled the engagement-patterns agent.
 *
 *   incremental — Called by the fleet orchestrator after an email_received event.
 *                 Recalculates a single contact via calculate_contact_engagement_patterns.
 *                 Requires { org_id, contact_id } in the request body.
 *
 * Auth: accepts CRON_SECRET (x-cron-secret header) or service-role Bearer token.
 * Deploy: npx supabase functions deploy agent-engagement-patterns --project-ref <ref> --no-verify-jwt
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.43.4';
import { verifyCronSecret, isServiceRoleAuth } from '../_shared/edgeAuth.ts';
import {
  handleCorsPreflightRequest,
  errorResponse,
  jsonResponse,
} from '../_shared/corsHelper.ts';

// =============================================================================
// Config
// =============================================================================

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

// =============================================================================
// Types
// =============================================================================

interface OrgBatchResult {
  org_id: string;
  contacts_processed: number;
  error?: string;
}

interface BatchResult {
  mode: 'batch';
  orgs_processed: number;
  orgs_errored: number;
  total_contacts_processed: number;
  results: OrgBatchResult[];
}

interface IncrementalResult {
  mode: 'incremental';
  org_id: string;
  contact_id: string;
  pattern_id: string;
}

// =============================================================================
// Main handler
// =============================================================================

serve(async (req) => {
  const preflightResponse = handleCorsPreflightRequest(req);
  if (preflightResponse) return preflightResponse;

  if (req.method !== 'POST') {
    return errorResponse('Method not allowed', req, 405);
  }

  try {
    const cronSecret = Deno.env.get('CRON_SECRET');
    const authHeader = req.headers.get('Authorization');

    if (
      !verifyCronSecret(req, cronSecret) &&
      !isServiceRoleAuth(authHeader, SUPABASE_SERVICE_ROLE_KEY)
    ) {
      return errorResponse('Unauthorized', req, 401);
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const body = await req.json().catch(() => ({}));

    // -------------------------------------------------------------------------
    // Route: incremental (single contact recalc)
    // -------------------------------------------------------------------------
    if (body.mode === 'incremental') {
      const { org_id, contact_id } = body as { org_id?: string; contact_id?: string };

      if (!org_id || !contact_id) {
        return errorResponse('incremental mode requires org_id and contact_id', req, 400);
      }

      console.log(`[agent-engagement-patterns] Incremental recalc for contact ${contact_id} org ${org_id}`);

      const { data: patternId, error } = await supabase.rpc(
        'calculate_contact_engagement_patterns',
        { p_org_id: org_id, p_contact_id: contact_id }
      );

      if (error) {
        console.error('[agent-engagement-patterns] RPC error:', error.message);
        return errorResponse(error.message, req, 500);
      }

      const result: IncrementalResult = {
        mode: 'incremental',
        org_id,
        contact_id,
        pattern_id: patternId as string,
      };

      console.log(`[agent-engagement-patterns] Incremental complete, pattern_id=${patternId}`);
      return jsonResponse(result, req);
    }

    // -------------------------------------------------------------------------
    // Route: batch (weekly full recalc across all enabled orgs)
    // -------------------------------------------------------------------------
    const singleOrgId: string | undefined = body.org_id;

    console.log('[agent-engagement-patterns] Starting batch engagement pattern recalculation...');

    let orgIds: string[];

    if (singleOrgId) {
      orgIds = [singleOrgId];
    } else {
      orgIds = await getEnabledOrgIds(supabase);
    }

    console.log(`[agent-engagement-patterns] Processing ${orgIds.length} org(s)`);

    const batchResult: BatchResult = {
      mode: 'batch',
      orgs_processed: 0,
      orgs_errored: 0,
      total_contacts_processed: 0,
      results: [],
    };

    for (const orgId of orgIds) {
      batchResult.orgs_processed++;
      const orgResult = await recalculateOrgPatterns(supabase, orgId);
      batchResult.results.push(orgResult);

      if (orgResult.error) {
        batchResult.orgs_errored++;
      } else {
        batchResult.total_contacts_processed += orgResult.contacts_processed;
      }
    }

    console.log(
      `[agent-engagement-patterns] Batch complete: ${batchResult.orgs_processed} orgs, ` +
      `${batchResult.total_contacts_processed} contacts, ${batchResult.orgs_errored} errors`
    );

    return jsonResponse(batchResult, req);

  } catch (error) {
    console.error('[agent-engagement-patterns] Fatal error:', error);
    return errorResponse((error as Error).message, req, 500);
  }
});

// =============================================================================
// Helpers
// =============================================================================

/**
 * Return org IDs where the engagement-patterns agent is enabled.
 * Checks agent_config_overrides for explicit disablement; all other orgs
 * are treated as enabled by default.
 */
async function getEnabledOrgIds(
  supabase: ReturnType<typeof createClient>
): Promise<string[]> {
  // Get all distinct org IDs
  const { data: orgs, error } = await supabase
    .from('organization_memberships')
    .select('org_id')
    .limit(500);

  if (error) {
    console.error('[agent-engagement-patterns] Failed to fetch orgs:', error.message);
    return [];
  }

  const allOrgIds = [...new Set((orgs || []).map((r: { org_id: string }) => r.org_id))];

  if (allOrgIds.length === 0) return [];

  // Check for org-level overrides that explicitly disable this agent
  const { data: disabledOverrides } = await supabase
    .from('agent_config_overrides')
    .select('org_id')
    .eq('agent_type', 'engagement_patterns')
    .eq('config_key', 'engagement_patterns_enabled')
    .eq('config_value', 'false')
    .in('org_id', allOrgIds);

  const disabledOrgIds = new Set((disabledOverrides || []).map((r: { org_id: string }) => r.org_id));

  return allOrgIds.filter((id) => !disabledOrgIds.has(id));
}

/**
 * Call batch_recalculate_engagement_patterns for a single org.
 * Returns how many contacts were processed.
 */
async function recalculateOrgPatterns(
  supabase: ReturnType<typeof createClient>,
  orgId: string
): Promise<OrgBatchResult> {
  try {
    const { data: contactCount, error } = await supabase.rpc(
      'batch_recalculate_engagement_patterns',
      { p_org_id: orgId }
    );

    if (error) {
      console.error(`[agent-engagement-patterns] RPC error for org ${orgId}:`, error.message);
      return { org_id: orgId, contacts_processed: 0, error: error.message };
    }

    const count = (contactCount as number) ?? 0;
    console.log(`[agent-engagement-patterns] Org ${orgId}: ${count} contacts recalculated`);

    return { org_id: orgId, contacts_processed: count };

  } catch (err) {
    console.error(`[agent-engagement-patterns] Exception for org ${orgId}:`, err);
    return { org_id: orgId, contacts_processed: 0, error: String(err) };
  }
}
