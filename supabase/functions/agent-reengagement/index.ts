/**
 * agent-reengagement (REN-007)
 *
 * Cron-triggered edge function (daily at 06:00 UTC) that orchestrates the
 * full re-engagement signal pipeline across all orgs that have the
 * reengagement agent enabled.
 *
 * Pipeline steps (per org):
 *   1. apollo-signal-scan      — enrich contacts/companies via Apollo API
 *   2. apify-news-scan         — scrape company news via Apify
 *   3. score-reengagement-signals — score, rank, and apply cooldown gates
 *   4. analyse-stall-reason    — diagnose why each deal stalled
 *   5. draft-reengagement      — generate personalised re-engagement emails
 *   6. deliver-reengagement-slack — send HITL approval DMs to deal owners
 *
 * Auth: accepts CRON_SECRET (x-cron-secret header) or service-role Bearer token.
 * Deploy: npx supabase functions deploy agent-reengagement --project-ref <ref> --no-verify-jwt
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

// Fleet orchestrator endpoint (internal call)
const FLEET_ORCHESTRATOR_URL = `${SUPABASE_URL}/functions/v1/agent-orchestrator`;

// =============================================================================
// Types
// =============================================================================

interface OrgResult {
  org_id: string;
  dispatched: boolean;
  job_id?: string;
  error?: string;
}

interface BatchResult {
  orgs_processed: number;
  orgs_dispatched: number;
  orgs_skipped: number;
  orgs_errored: number;
  results: OrgResult[];
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

    // Optional: single-org override from request body (for on-demand / testing)
    const body = await req.json().catch(() => ({}));
    const singleOrgId: string | undefined = body.org_id;

    console.log('[agent-reengagement] Starting daily re-engagement scan...');

    const result: BatchResult = {
      orgs_processed: 0,
      orgs_dispatched: 0,
      orgs_skipped: 0,
      orgs_errored: 0,
      results: [],
    };

    // -------------------------------------------------------------------------
    // 1. Resolve orgs to process
    // -------------------------------------------------------------------------
    let orgIds: string[];

    if (singleOrgId) {
      orgIds = [singleOrgId];
    } else {
      orgIds = await getEnabledOrgIds(supabase);
    }

    console.log(`[agent-reengagement] Processing ${orgIds.length} org(s)`);

    // -------------------------------------------------------------------------
    // 2. Dispatch reengagement_scoring fleet sequence per org
    // -------------------------------------------------------------------------
    for (const orgId of orgIds) {
      result.orgs_processed++;
      const orgResult = await dispatchReengagementScan(orgId);
      result.results.push(orgResult);

      if (orgResult.dispatched) {
        result.orgs_dispatched++;
      } else if (orgResult.error) {
        result.orgs_errored++;
      } else {
        result.orgs_skipped++;
      }
    }

    console.log(
      `[agent-reengagement] Complete: ${result.orgs_dispatched} dispatched, ` +
      `${result.orgs_skipped} skipped, ${result.orgs_errored} errored`
    );

    return jsonResponse(result, req);

  } catch (error) {
    console.error('[agent-reengagement] Fatal error:', error);
    return errorResponse((error as Error).message, req, 500);
  }
});

// =============================================================================
// Helpers
// =============================================================================

/**
 * Return org IDs where the reengagement agent is enabled.
 * Checks agent_config_overrides first (org-level), then falls back
 * to agent_config_defaults platform default (enabled = true by default).
 */
async function getEnabledOrgIds(
  supabase: ReturnType<typeof createClient>
): Promise<string[]> {
  // Get distinct org IDs from organization_memberships (all orgs that exist)
  const { data: orgs, error } = await supabase
    .from('organization_memberships')
    .select('org_id')
    .limit(500);

  if (error) {
    console.error('[agent-reengagement] Failed to fetch orgs:', error.message);
    return [];
  }

  const allOrgIds = [...new Set((orgs || []).map((r) => r.org_id))];

  if (allOrgIds.length === 0) return [];

  // Check for org-level overrides that disable re-engagement
  const { data: disabledOverrides } = await supabase
    .from('agent_config_overrides')
    .select('org_id')
    .eq('agent_type', 'reengagement')
    .eq('config_key', 'reengagement_enabled')
    .eq('config_value', 'false')
    .in('org_id', allOrgIds);

  const disabledOrgIds = new Set((disabledOverrides || []).map((r) => r.org_id));

  return allOrgIds.filter((id) => !disabledOrgIds.has(id));
}

/**
 * Dispatch the reengagement_scoring fleet sequence for a single org.
 * Posts a fleet event to the agent-orchestrator which routes it to
 * the reengagement_scoring sequence definition.
 */
async function dispatchReengagementScan(orgId: string): Promise<OrgResult> {
  try {
    const payload = {
      event_type: 'cron.reengagement_scan',
      org_id: orgId,
      context: {
        org_id: orgId,
        triggered_by: 'cron',
        triggered_at: new Date().toISOString(),
      },
    };

    const resp = await fetch(FLEET_ORCHESTRATOR_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      },
      body: JSON.stringify(payload),
    });

    if (!resp.ok) {
      const text = await resp.text().catch(() => '');
      console.warn(
        `[agent-reengagement] Orchestrator returned ${resp.status} for org ${orgId}: ${text}`
      );
      return { org_id: orgId, dispatched: false, error: `orchestrator_${resp.status}` };
    }

    const data = await resp.json().catch(() => ({}));
    const jobId: string | undefined = data?.job_id ?? data?.id;

    console.log(`[agent-reengagement] Dispatched for org ${orgId}, job_id=${jobId ?? 'unknown'}`);

    return { org_id: orgId, dispatched: true, job_id: jobId };

  } catch (err) {
    console.error(`[agent-reengagement] Error dispatching for org ${orgId}:`, err);
    return { org_id: orgId, dispatched: false, error: String(err) };
  }
}
