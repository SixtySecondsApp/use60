/**
 * Cross-Deal Conflict Detector (PST-012)
 *
 * Detects conflicts across deals within an org:
 *   1. Contact overlap — same contact linked to 2+ active deals
 *   2. Company overlap — same company with deals from different reps
 *
 * Called once per org after individual deal scans complete in the heartbeat.
 * Inserts/updates deal_observations with category='cross_deal_conflict'.
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.43.4';

// =============================================================================
// Types
// =============================================================================

type Severity = 'high' | 'medium' | 'low';

interface Observation {
  deal_id: string;
  user_id: string;
  org_id: string;
  category: 'cross_deal_conflict';
  severity: Severity;
  title: string;
  description: string;
  affected_contacts: string[];
  proposed_action: Record<string, unknown> | null;
}

interface ConflictResult {
  observationsCreated: number;
  errors: string[];
}

// =============================================================================
// Main Export
// =============================================================================

export async function detectCrossDealConflicts(
  supabase: ReturnType<typeof createClient>,
  orgId: string
): Promise<ConflictResult> {
  const errors: string[] = [];
  let observationsCreated = 0;

  // Fetch closed stage IDs so we only consider active deals
  const { data: stages } = await supabase
    .from('deal_stages')
    .select('id, name')
    .eq('org_id', orgId);

  const closedStageIds = new Set(
    (stages || [])
      .filter((s: { name: string }) => /closed/i.test(s.name))
      .map((s: { id: string }) => s.id)
  );

  // Run both detections in parallel
  const [contactResults, companyResults] = await Promise.all([
    detectContactOverlap(supabase, orgId, closedStageIds).catch((err) => {
      errors.push(`contact_overlap: ${(err as Error).message}`);
      return [] as Observation[];
    }),
    detectCompanyOverlap(supabase, orgId, closedStageIds).catch((err) => {
      errors.push(`company_overlap: ${(err as Error).message}`);
      return [] as Observation[];
    }),
  ]);

  const allObservations = [...contactResults, ...companyResults];

  // Upsert each observation with dedup
  for (const obs of allObservations) {
    try {
      const saved = await upsertConflictObservation(supabase, obs);
      if (saved) observationsCreated++;
    } catch (err) {
      errors.push(`upsert cross_deal_conflict for ${obs.deal_id}: ${(err as Error).message}`);
    }
  }

  if (allObservations.length > 0) {
    console.log(
      `[cross-deal-conflict] org=${orgId} contact_overlaps=${contactResults.length} company_overlaps=${companyResults.length} created=${observationsCreated}`
    );
  }

  return { observationsCreated, errors };
}

// =============================================================================
// Contact Overlap Detection
// =============================================================================

async function detectContactOverlap(
  supabase: ReturnType<typeof createClient>,
  orgId: string,
  closedStageIds: Set<string>
): Promise<Observation[]> {
  // Fetch all deal_contacts for active deals in this org.
  // Join through deals to scope by org and exclude closed stages.
  const { data: rows, error } = await supabase
    .from('deal_contacts')
    .select(`
      contact_id,
      deal_id,
      deals!inner ( id, name, owner_id, org_id, stage_id ),
      contacts!inner ( id, full_name, email )
    `)
    .eq('deals.org_id', orgId);

  if (error) throw new Error(`deal_contacts query failed: ${error.message}`);
  if (!rows?.length) return [];

  // Filter out closed deals client-side (PostgREST can't do NOT IN on joined column)
  const activeRows = (rows as any[]).filter(
    (r) => r.deals?.stage_id && !closedStageIds.has(r.deals.stage_id)
  );

  // Group by contact_id
  const contactDeals = new Map<
    string,
    { contactName: string; contactEmail: string; deals: Array<{ id: string; name: string; ownerId: string }> }
  >();

  for (const row of activeRows) {
    const contactId = row.contact_id;
    const existing = contactDeals.get(contactId);
    const dealEntry = {
      id: row.deals.id,
      name: row.deals.name,
      ownerId: row.deals.owner_id,
    };

    if (existing) {
      // Avoid duplicate deal entries (shouldn't happen but defensive)
      if (!existing.deals.some((d) => d.id === dealEntry.id)) {
        existing.deals.push(dealEntry);
      }
    } else {
      contactDeals.set(contactId, {
        contactName: row.contacts?.full_name || row.contacts?.email || 'Unknown',
        contactEmail: row.contacts?.email || '',
        deals: [dealEntry],
      });
    }
  }

  // Find contacts appearing in 2+ deals
  const observations: Observation[] = [];

  for (const [contactId, info] of contactDeals) {
    if (info.deals.length < 2) continue;

    // Determine severity based on deal activity recency.
    // Fetch health scores for the overlapping deals to check recent activity.
    const overlappingDealIds = info.deals.map((d) => d.id);
    const severity = await determineContactOverlapSeverity(supabase, overlappingDealIds);

    const otherDealNames = info.deals.map((d) => d.name);

    // Create one observation per deal involved (each deal owner should see the conflict)
    for (const deal of info.deals) {
      const otherDeals = info.deals.filter((d) => d.id !== deal.id);
      const otherDealList = otherDeals.map((d) => d.name).join(', ');

      observations.push({
        deal_id: deal.id,
        user_id: deal.ownerId,
        org_id: orgId,
        category: 'cross_deal_conflict',
        severity,
        title: `${info.contactName} is linked to ${info.deals.length} active deals`,
        description: `Contact "${info.contactName}" (${info.contactEmail}) also appears in: ${otherDealList}. Coordinate outreach to avoid conflicting messages.`,
        affected_contacts: [contactId],
        proposed_action: {
          type: 'contact_overlap',
          contact_id: contactId,
          contact_name: info.contactName,
          overlapping_deal_ids: overlappingDealIds,
          overlapping_deal_names: otherDealNames,
        },
      });
    }
  }

  return observations;
}

// =============================================================================
// Company Overlap Detection
// =============================================================================

async function detectCompanyOverlap(
  supabase: ReturnType<typeof createClient>,
  orgId: string,
  closedStageIds: Set<string>
): Promise<Observation[]> {
  // Fetch all active deals with a company set
  const { data: deals, error } = await supabase
    .from('deals')
    .select('id, name, company, owner_id, stage_id')
    .eq('org_id', orgId)
    .not('company', 'is', null);

  if (error) throw new Error(`deals query failed: ${error.message}`);
  if (!deals?.length) return [];

  // Filter to active deals only
  const activeDeals = (deals as any[]).filter(
    (d) => d.stage_id && !closedStageIds.has(d.stage_id)
  );

  // Group by normalized company name (lowercase trimmed)
  const companyDeals = new Map<
    string,
    { rawCompany: string; deals: Array<{ id: string; name: string; ownerId: string }> }
  >();

  for (const deal of activeDeals) {
    const normalizedCompany = (deal.company as string).toLowerCase().trim();
    const existing = companyDeals.get(normalizedCompany);
    const dealEntry = { id: deal.id, name: deal.name, ownerId: deal.owner_id };

    if (existing) {
      existing.deals.push(dealEntry);
    } else {
      companyDeals.set(normalizedCompany, {
        rawCompany: deal.company,
        deals: [dealEntry],
      });
    }
  }

  const observations: Observation[] = [];

  for (const [, info] of companyDeals) {
    if (info.deals.length < 2) continue;

    // Only flag if different reps own the deals
    const uniqueOwners = new Set(info.deals.map((d) => d.ownerId));
    if (uniqueOwners.size < 2) continue;

    // Create one observation per deal involved
    for (const deal of info.deals) {
      const otherDeals = info.deals.filter((d) => d.id !== deal.id);
      const otherDealList = otherDeals
        .map((d) => `${d.name} (owned by different rep)`)
        .join(', ');

      observations.push({
        deal_id: deal.id,
        user_id: deal.ownerId,
        org_id: orgId,
        category: 'cross_deal_conflict',
        severity: 'medium',
        title: `Multiple reps working "${info.rawCompany}"`,
        description: `Deal "${deal.name}" shares company "${info.rawCompany}" with: ${otherDealList}. Different reps are pursuing the same account — coordinate to avoid stepping on each other.`,
        affected_contacts: [],
        proposed_action: {
          type: 'company_overlap',
          company: info.rawCompany,
          overlapping_deal_ids: info.deals.map((d) => d.id),
          overlapping_deal_names: info.deals.map((d) => d.name),
          owner_ids: [...uniqueOwners],
        },
      });
    }
  }

  return observations;
}

// =============================================================================
// Severity Helpers
// =============================================================================

/**
 * HIGH if both deals had activity in last 7 days (active overlap risk).
 * MEDIUM otherwise.
 */
async function determineContactOverlapSeverity(
  supabase: ReturnType<typeof createClient>,
  dealIds: string[]
): Promise<Severity> {
  if (dealIds.length < 2) return 'medium';

  const { data: healthRows } = await supabase
    .from('deal_health_scores')
    .select('deal_id, days_since_last_activity')
    .in('deal_id', dealIds);

  if (!healthRows?.length) return 'medium';

  // Count how many of the overlapping deals had activity in the last 7 days
  const recentlyActiveCount = healthRows.filter(
    (r: { days_since_last_activity: number | null }) =>
      r.days_since_last_activity !== null && r.days_since_last_activity <= 7
  ).length;

  // HIGH if 2+ deals are actively being worked (same-day overlap risk)
  return recentlyActiveCount >= 2 ? 'high' : 'medium';
}

// =============================================================================
// Observation Persistence (dedup pattern from heartbeat)
// =============================================================================

async function upsertConflictObservation(
  supabase: ReturnType<typeof createClient>,
  obs: Observation
): Promise<boolean> {
  // Check for existing open observation on same deal + category
  const { data: existing } = await supabase
    .from('deal_observations')
    .select('id, last_observed_at')
    .eq('org_id', obs.org_id)
    .eq('deal_id', obs.deal_id)
    .eq('category', obs.category)
    .eq('status', 'open')
    .maybeSingle();

  if (existing) {
    // Refresh the timestamp and severity — conflict still active
    await supabase
      .from('deal_observations')
      .update({
        last_observed_at: new Date().toISOString(),
        severity: obs.severity,
        title: obs.title,
        description: obs.description,
        affected_contacts: obs.affected_contacts,
        proposed_action: obs.proposed_action,
      })
      .eq('id', existing.id);
    return false; // Not a new observation
  }

  // Skip if snoozed and not yet expired
  const { data: snoozed } = await supabase
    .from('deal_observations')
    .select('id')
    .eq('org_id', obs.org_id)
    .eq('deal_id', obs.deal_id)
    .eq('category', obs.category)
    .eq('status', 'snoozed')
    .gt('snooze_until', new Date().toISOString())
    .maybeSingle();

  if (snoozed) return false;

  // Insert new observation
  const { error } = await supabase.from('deal_observations').insert({
    org_id: obs.org_id,
    user_id: obs.user_id,
    deal_id: obs.deal_id,
    category: obs.category,
    severity: obs.severity,
    title: obs.title,
    description: obs.description,
    affected_contacts: obs.affected_contacts,
    proposed_action: obs.proposed_action,
    status: 'open',
    first_observed_at: new Date().toISOString(),
    last_observed_at: new Date().toISOString(),
  });

  if (error) {
    // Unique constraint violation = race condition, not a real error
    if (error.code === '23505') return false;
    throw error;
  }

  return true;
}
