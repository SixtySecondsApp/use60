import { supabase } from '@/lib/supabase/clientV2';
import type { Database } from '@/lib/database.types';

export type LeadRecord = Database['public']['Tables']['leads']['Row'];
export type LeadPrepNote = Database['public']['Tables']['lead_prep_notes']['Row'];

export type LeadWithPrep = LeadRecord & {
  lead_prep_notes: LeadPrepNote[];
};

export async function fetchLeads(): Promise<LeadWithPrep[]> {
  // Supabase PostgREST has a max-rows limit of 1000 by default
  // We need to fetch in batches using .range() to get all leads
  const PAGE_SIZE = 1000;
  let allLeads: LeadWithPrep[] = [];
  let page = 0;
  let hasMore = true;

  while (hasMore) {
    const from = page * PAGE_SIZE;
    const to = from + PAGE_SIZE - 1;

    const { data, error } = await supabase
      .from('leads')
      .select(`
        *,
        lead_prep_notes(*),
        owner:profiles!leads_owner_id_fkey(id, first_name, last_name, email),
        source:lead_sources!leads_source_id_fkey(id, name, source_key, channel),
        contact:contacts!leads_contact_id_fkey(id, title, first_name, last_name, email),
        company:companies!leads_company_id_fkey(id, name, domain, industry, size, enrichment_data),
        converted_deal:deals!leads_converted_deal_id_fkey(
          id,
          name,
          stage:deal_stages!deals_stage_id_fkey(id, name)
        )
      `)
      .order('created_at', { ascending: false })
      .range(from, to);

    if (error) throw error;

    const pageData = (data ?? []).map((lead) => ({
      ...lead,
      lead_prep_notes: lead.lead_prep_notes ?? [],
    })) as LeadWithPrep[];

    allLeads = [...allLeads, ...pageData];

    // If we got fewer than PAGE_SIZE results, we've reached the end
    hasMore = pageData.length === PAGE_SIZE;
    page++;

    // Safety limit to prevent infinite loops (max 10 pages = 10,000 leads)
    if (page >= 10) break;
  }

  return allLeads;
}

export async function triggerLeadPrep(): Promise<{ processed: number }> {
  const { data, error } = await supabase.functions.invoke('process-lead-prep', {
    method: 'POST',
    body: {},
  });

  if (error) {
    throw new Error(error.message || 'Failed to trigger lead prep');
  }

  return { processed: data?.processed ?? 0 };
}

export async function refreshLeads(): Promise<void> {
  await triggerLeadPrep();
}

export async function reprocessLead(leadId: string): Promise<Record<string, unknown>> {
  const { data, error } = await supabase.functions.invoke('reprocess-lead-prep', {
    method: 'POST',
    body: { lead_id: leadId },
  });

  if (error) {
    throw new Error(error.message || 'Failed to reprocess lead');
  }

  if (!data || (data as { success?: boolean }).success === false) {
    const message = (data as { error?: string })?.error || 'Failed to reprocess lead';
    throw new Error(message);
  }

  return data as Record<string, unknown>;
}

