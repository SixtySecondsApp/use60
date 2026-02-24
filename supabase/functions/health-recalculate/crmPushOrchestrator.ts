// supabase/functions/health-recalculate/crmPushOrchestrator.ts
// Thin orchestrator that detects CRM integrations and pushes health scores with delta detection

import { syncHealthScoresToHubSpot } from './hubspotSync.ts';
import { syncHealthScoresToAttio } from './attioSync.ts';

// =============================================================================
// Types
// =============================================================================

export interface CRMPushSummary {
  hubspot: {
    pushed: number;
    skipped: number;
    error?: string;
  };
  attio: {
    pushed: number;
    skipped: number;
    error?: string;
  };
}

export interface DeltaDetectionResult {
  dealId: string;
  healthScoreChanged: boolean;
  oldScore: number | null;
  newScore: number | null;
}

// =============================================================================
// Delta Detection
// =============================================================================

/**
 * Detect which deals have actual health score changes (delta detection)
 * Only push deals whose health scores actually changed
 */
async function detectHealthScoreDeltas(
  supabase: any,
  dealIds: string[]
): Promise<Map<string, boolean>> {
  const changedDeals = new Map<string, boolean>();

  // Fetch current health scores
  const { data: currentScores, error: currentError } = await supabase
    .from('deal_health_scores')
    .select('deal_id, overall_health_score')
    .in('deal_id', dealIds);

  if (currentError || !currentScores) {
    console.error('[crmPushOrchestrator] Error fetching current health scores:', currentError);
    // If we can't detect deltas, mark all as changed (safe fallback)
    dealIds.forEach(id => changedDeals.set(id, true));
    return changedDeals;
  }

  // Fetch previous health scores from history (most recent snapshot before now)
  const { data: historyScores, error: historyError } = await supabase
    .from('deal_health_history')
    .select('deal_id, overall_health_score, created_at')
    .in('deal_id', dealIds)
    .order('created_at', { ascending: false });

  if (historyError || !historyScores) {
    console.error('[crmPushOrchestrator] Error fetching health score history:', historyError);
    // If we can't detect deltas, mark all as changed (safe fallback)
    dealIds.forEach(id => changedDeals.set(id, true));
    return changedDeals;
  }

  // Build map of most recent historical score per deal
  const previousScores = new Map<string, number>();
  for (const hist of historyScores) {
    if (!previousScores.has(hist.deal_id)) {
      previousScores.set(hist.deal_id, hist.overall_health_score);
    }
  }

  // Compare current vs previous scores
  for (const current of currentScores) {
    const dealId = current.deal_id;
    const newScore = current.overall_health_score;
    const oldScore = previousScores.get(dealId);

    // Mark as changed if:
    // 1. No previous score (first time)
    // 2. Score changed by more than 1 point (avoid noise from rounding)
    const hasChanged = oldScore === undefined || Math.abs(newScore - oldScore) > 1;
    changedDeals.set(dealId, hasChanged);
  }

  return changedDeals;
}

// =============================================================================
// CRM Push Orchestrator
// =============================================================================

/**
 * Orchestrate CRM push for health scores
 * - Detects HubSpot and Attio integrations
 * - Applies delta detection (only push changed deals)
 * - Runs async (non-blocking)
 * - Returns summary of pushed/skipped counts
 */
export async function pushHealthScoresToCRMs(
  supabase: any,
  dealIds: string[],
  clerkOrgId: string
): Promise<CRMPushSummary> {
  const summary: CRMPushSummary = {
    hubspot: { pushed: 0, skipped: 0 },
    attio: { pushed: 0, skipped: 0 },
  };

  if (dealIds.length === 0) {
    return summary;
  }

  // Step 1: Delta detection — which deals actually changed?
  const changedDeals = await detectHealthScoreDeltas(supabase, dealIds);
  const dealsToSync = dealIds.filter(id => changedDeals.get(id) === true);
  const skippedCount = dealIds.length - dealsToSync.length;

  console.log(`[crmPushOrchestrator] Delta detection: ${dealsToSync.length} changed, ${skippedCount} unchanged (skipped)`);

  if (dealsToSync.length === 0) {
    // No changes, skip all CRM syncs
    summary.hubspot.skipped = dealIds.length;
    summary.attio.skipped = dealIds.length;
    return summary;
  }

  // Step 2: Detect HubSpot integration
  const { data: hubspotIntegration } = await supabase
    .from('hubspot_org_integrations')
    .select('id, clerk_org_id')
    .eq('clerk_org_id', clerkOrgId)
    .eq('is_active', true)
    .maybeSingle();

  const hasHubSpot = !!hubspotIntegration;

  // Step 3: Detect Attio integration
  const { data: attioIntegration } = await supabase
    .from('attio_org_integrations')
    .select('id, clerk_org_id')
    .eq('clerk_org_id', clerkOrgId)
    .eq('is_active', true)
    .maybeSingle();

  const hasAttio = !!attioIntegration;

  console.log(`[crmPushOrchestrator] CRM detection: HubSpot=${hasHubSpot}, Attio=${hasAttio}`);

  // Step 4: Push to HubSpot (if connected)
  if (hasHubSpot) {
    try {
      const result = await syncHealthScoresToHubSpot(supabase, dealsToSync, clerkOrgId);
      if (result.success) {
        summary.hubspot.pushed = result.pushedCount;
        summary.hubspot.skipped = skippedCount;
        console.log(`[crmPushOrchestrator] HubSpot sync: ${result.pushedCount} pushed, ${skippedCount} skipped`);
      } else {
        summary.hubspot.error = result.error || 'Unknown error';
        summary.hubspot.skipped = dealIds.length;
        console.error(`[crmPushOrchestrator] HubSpot sync failed:`, result.error);
      }
    } catch (error) {
      summary.hubspot.error = error instanceof Error ? error.message : 'Unknown error';
      summary.hubspot.skipped = dealIds.length;
      console.error(`[crmPushOrchestrator] HubSpot sync exception:`, error);
    }
  } else {
    summary.hubspot.skipped = dealIds.length;
  }

  // Step 5: Push to Attio (if connected)
  if (hasAttio) {
    try {
      const result = await syncHealthScoresToAttio(supabase, dealsToSync, clerkOrgId);
      if (result.success) {
        summary.attio.pushed = result.pushedCount;
        summary.attio.skipped = skippedCount;
        console.log(`[crmPushOrchestrator] Attio sync: ${result.pushedCount} pushed, ${skippedCount} skipped`);
      } else {
        summary.attio.error = result.error || 'Unknown error';
        summary.attio.skipped = dealIds.length;
        console.error(`[crmPushOrchestrator] Attio sync failed:`, result.error);
      }
    } catch (error) {
      summary.attio.error = error instanceof Error ? error.message : 'Unknown error';
      summary.attio.skipped = dealIds.length;
      console.error(`[crmPushOrchestrator] Attio sync exception:`, error);
    }
  } else {
    summary.attio.skipped = dealIds.length;
  }

  return summary;
}
