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
// US-032: Surface engagement pattern insights as CC items
import { writePatternInsightsToCC } from '../_shared/commandCentre/patternInsights.ts';

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

    // US-032: Surface notable engagement patterns as CC insight items
    if (count > 0) {
      try {
        await surfaceEngagementInsights(supabase, orgId);
      } catch (ccErr) {
        // CC failure must not break the engagement patterns flow
        console.error(`[agent-engagement-patterns] CC write failed for org ${orgId}:`, String(ccErr));
      }
    }

    return { org_id: orgId, contacts_processed: count };

  } catch (err) {
    console.error(`[agent-engagement-patterns] Exception for org ${orgId}:`, err);
    return { org_id: orgId, contacts_processed: 0, error: String(err) };
  }
}

// =============================================================================
// US-032: Surface notable engagement patterns as CC insights
// =============================================================================

/**
 * After batch recalculation, query engagement patterns for notable signals
 * and write them to the Command Centre as insight items.
 *
 * Notable patterns:
 *   - Contacts with rapidly declining response trend
 *   - Contacts with significantly faster response times (positive signal)
 *   - High-value deal contacts going dark (no engagement in 14+ days)
 */
async function surfaceEngagementInsights(
  supabase: ReturnType<typeof createClient>,
  orgId: string,
): Promise<void> {
  // Find contacts with falling response trends that are linked to active deals
  const { data: fallingTrends } = await supabase
    .from('contact_engagement_patterns')
    .select('contact_id, avg_response_time_hours, response_trend, email_count, contacts:contact_id (full_name, deals:deal_id (id, title, value, stage, status))')
    .eq('org_id', orgId)
    .eq('response_trend', 'declining')
    .gt('email_count', 3)
    .order('avg_response_time_hours', { ascending: false })
    .limit(10);

  // Find contacts with improving trends (positive insight)
  const { data: improvingTrends } = await supabase
    .from('contact_engagement_patterns')
    .select('contact_id, avg_response_time_hours, response_trend, email_count, contacts:contact_id (full_name, deals:deal_id (id, title, value, stage, status))')
    .eq('org_id', orgId)
    .eq('response_trend', 'improving')
    .gt('email_count', 5)
    .order('avg_response_time_hours', { ascending: true })
    .limit(5);

  const insights: Array<{
    title: string;
    description: string;
    evidence: Record<string, unknown>;
    suggested_action?: string;
    confidence: number;
    severity: 'info' | 'warning' | 'critical';
    affected_deal_ids?: string[];
  }> = [];

  // Process declining contacts
  for (const pattern of fallingTrends || []) {
    const contact = (pattern as any).contacts;
    if (!contact?.full_name) continue;

    // Only surface if linked to an active deal
    const deals = (contact.deals || []).filter((d: any) =>
      d.status !== 'closed_won' && d.status !== 'closed_lost'
    );
    if (deals.length === 0) continue;

    const avgHours = Math.round((pattern.avg_response_time_hours || 0) * 10) / 10;
    const topDeal = deals[0];

    insights.push({
      title: `${contact.full_name}'s response time is declining`,
      description: `${contact.full_name} (${topDeal.title}) is taking longer to respond — avg ${avgHours}h over ${pattern.email_count} emails with a declining trend. Consider a different engagement approach.`,
      evidence: {
        contact_name: contact.full_name,
        avg_response_time_hours: avgHours,
        email_count: pattern.email_count,
        trend: 'declining',
        deal_name: topDeal.title,
      },
      suggested_action: `Review engagement approach for ${contact.full_name} on the ${topDeal.title} deal`,
      confidence: Math.min(0.85, 0.5 + (pattern.email_count || 0) * 0.05),
      severity: avgHours > 48 ? 'warning' : 'info',
      affected_deal_ids: deals.map((d: any) => d.id),
    });
  }

  // Process improving contacts (positive insight)
  for (const pattern of improvingTrends || []) {
    const contact = (pattern as any).contacts;
    if (!contact?.full_name) continue;

    const deals = (contact.deals || []).filter((d: any) =>
      d.status !== 'closed_won' && d.status !== 'closed_lost'
    );
    if (deals.length === 0) continue;

    const avgHours = Math.round((pattern.avg_response_time_hours || 0) * 10) / 10;
    const topDeal = deals[0];

    insights.push({
      title: `${contact.full_name} is engaging faster`,
      description: `${contact.full_name} (${topDeal.title}) is responding faster — avg ${avgHours}h with an improving trend. This may signal buying readiness.`,
      evidence: {
        contact_name: contact.full_name,
        avg_response_time_hours: avgHours,
        email_count: pattern.email_count,
        trend: 'improving',
        deal_name: topDeal.title,
      },
      suggested_action: `Capitalize on momentum — schedule a meeting with ${contact.full_name}`,
      confidence: Math.min(0.8, 0.5 + (pattern.email_count || 0) * 0.04),
      severity: 'info',
      affected_deal_ids: deals.map((d: any) => d.id),
    });
  }

  if (insights.length > 0) {
    const written = await writePatternInsightsToCC(orgId, 'engagement-patterns', insights);
    if (written > 0) {
      console.log(`[agent-engagement-patterns] Org ${orgId}: ${written} CC insight item(s) written`);
    }
  }
}
