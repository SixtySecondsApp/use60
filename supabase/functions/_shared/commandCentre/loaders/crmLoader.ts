/**
 * CRM Context Loader
 *
 * Loads deal, contact, and recent activity data for Command Centre enrichment.
 * Used by cc-enrich to populate enrichment_context.crm for a given item.
 *
 * Column notes (critical — differs per table):
 *   - deals:    owner_id   (NOT user_id)
 *   - contacts: owner_id   (NOT user_id)
 *   - activities: user_id  (standard)
 *
 * Story: CC10-002
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.43.4';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface DealEnrichment {
  id: string;
  name: string;
  company: string;
  stage_name: string | null;
  stage_order: number | null;
  amount: number | null;
  close_date: string | null;
  expected_close_date: string | null;
  owner_id: string;
  status: string | null;
  priority: string | null;
  health_score: number | null;
  risk_level: string | null;
  momentum_score: number | null;
  probability: number | null;
  next_steps: string | null;
  stage_changed_at: string | null;
}

export interface ContactEnrichment {
  id: string;
  full_name: string | null;
  first_name: string | null;
  last_name: string | null;
  email: string;
  title: string | null;
  company: string | null;
  linkedin_url: string | null;
  last_interaction_at: string | null;
  total_meetings_count: number | null;
  health_score: number | null;
  engagement_level: string | null;
}

export interface ActivitySummary {
  id: string;
  type: string;
  status: string;
  client_name: string;
  details: string | null;
  subject: string | null;
  date: string;
  created_at: string | null;
}

export interface CRMEnrichment {
  deal: DealEnrichment | null;
  contact: ContactEnrichment | null;
  recent_activities: ActivitySummary[];
}

// ---------------------------------------------------------------------------
// Main loader
// ---------------------------------------------------------------------------

/**
 * Load CRM context for a command centre item.
 *
 * @param supabase  Service-role client (passed from cc-enrich orchestrator)
 * @param dealId    Optional deal UUID from command_centre_items.deal_id
 * @param contactId Optional contact UUID from command_centre_items.contact_id
 * @param orgId     Optional org UUID for scoping (not used for RLS — service role bypasses it)
 */
export async function loadCRMContext(
  supabase: ReturnType<typeof createClient>,
  dealId?: string | null,
  contactId?: string | null,
  _orgId?: string | null,
): Promise<CRMEnrichment> {
  const result: CRMEnrichment = {
    deal: null,
    contact: null,
    recent_activities: [],
  };

  // Run deal and contact fetches in parallel — they are independent
  await Promise.all([
    dealId ? fetchDeal(supabase, dealId, result) : Promise.resolve(),
    contactId ? fetchContact(supabase, contactId, result) : Promise.resolve(),
  ]);

  // Fetch recent activities scoped to the deal (if available) or contact
  if (dealId || contactId) {
    await fetchRecentActivities(supabase, dealId, contactId, result);
  }

  return result;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

async function fetchDeal(
  supabase: ReturnType<typeof createClient>,
  dealId: string,
  result: CRMEnrichment,
): Promise<void> {
  try {
    const { data, error } = await supabase
      .from('deals')
      .select(
        `id,
         name,
         company,
         value,
         close_date,
         expected_close_date,
         owner_id,
         status,
         priority,
         health_score,
         risk_level,
         momentum_score,
         probability,
         next_steps,
         stage_changed_at,
         deal_stages!stage_id (
           name,
           order_position
         )`,
      )
      .eq('id', dealId)
      .maybeSingle();

    if (error) {
      console.error('[cc-loader:crm] fetchDeal error:', error.message, { dealId });
      return;
    }

    if (!data) {
      console.warn('[cc-loader:crm] fetchDeal: no deal found', { dealId });
      return;
    }

    const stage = data.deal_stages as { name: string; order_position: number } | null;

    result.deal = {
      id: data.id,
      name: data.name,
      company: data.company,
      stage_name: stage?.name ?? null,
      stage_order: stage?.order_position ?? null,
      amount: data.value ?? null,
      close_date: data.close_date ?? null,
      expected_close_date: data.expected_close_date ?? null,
      owner_id: data.owner_id,
      status: data.status ?? null,
      priority: data.priority ?? null,
      health_score: data.health_score ?? null,
      risk_level: data.risk_level ?? null,
      momentum_score: data.momentum_score ?? null,
      probability: data.probability ?? null,
      next_steps: data.next_steps ?? null,
      stage_changed_at: data.stage_changed_at ?? null,
    };
  } catch (err) {
    console.error('[cc-loader:crm] fetchDeal unexpected error:', String(err), { dealId });
  }
}

async function fetchContact(
  supabase: ReturnType<typeof createClient>,
  contactId: string,
  result: CRMEnrichment,
): Promise<void> {
  try {
    const { data, error } = await supabase
      .from('contacts')
      .select(
        `id,
         full_name,
         first_name,
         last_name,
         email,
         title,
         company,
         linkedin_url,
         last_interaction_at,
         total_meetings_count,
         health_score,
         engagement_level`,
      )
      .eq('id', contactId)
      .maybeSingle();

    if (error) {
      console.error('[cc-loader:crm] fetchContact error:', error.message, { contactId });
      return;
    }

    if (!data) {
      console.warn('[cc-loader:crm] fetchContact: no contact found', { contactId });
      return;
    }

    result.contact = {
      id: data.id,
      full_name: data.full_name ?? null,
      first_name: data.first_name ?? null,
      last_name: data.last_name ?? null,
      email: data.email,
      title: data.title ?? null,
      company: data.company ?? null,
      linkedin_url: data.linkedin_url ?? null,
      last_interaction_at: data.last_interaction_at ?? null,
      total_meetings_count: data.total_meetings_count ?? null,
      health_score: data.health_score ?? null,
      engagement_level: data.engagement_level ?? null,
    };
  } catch (err) {
    console.error('[cc-loader:crm] fetchContact unexpected error:', String(err), { contactId });
  }
}

async function fetchRecentActivities(
  supabase: ReturnType<typeof createClient>,
  dealId: string | null | undefined,
  contactId: string | null | undefined,
  result: CRMEnrichment,
): Promise<void> {
  try {
    // Prefer deal-scoped query; fall back to contact-scoped
    let query = supabase
      .from('activities')
      .select(
        `id,
         type,
         status,
         client_name,
         details,
         subject,
         date,
         created_at`,
      )
      .order('created_at', { ascending: false })
      .limit(5);

    if (dealId) {
      query = query.eq('deal_id', dealId);
    } else if (contactId) {
      query = query.eq('contact_id', contactId);
    } else {
      return;
    }

    const { data, error } = await query;

    if (error) {
      console.error('[cc-loader:crm] fetchRecentActivities error:', error.message, { dealId, contactId });
      return;
    }

    result.recent_activities = (data ?? []).map((a) => ({
      id: a.id,
      type: a.type,
      status: a.status,
      client_name: a.client_name,
      details: a.details ?? null,
      subject: a.subject ?? null,
      date: a.date,
      created_at: a.created_at ?? null,
    }));
  } catch (err) {
    console.error('[cc-loader:crm] fetchRecentActivities unexpected error:', String(err), { dealId, contactId });
  }
}
