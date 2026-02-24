// supabase/functions/_shared/classifyLeadStatus.ts
// Shared utility for classifying leads as net_new, uncontacted, contacted_no_deal, or existing_with_deal

import { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

export type LeadClassification = 'net_new' | 'uncontacted' | 'contacted_no_deal' | 'existing_with_deal';

export interface ClassifiedLead {
  email: string;
  company_domain?: string;
  classification: LeadClassification;
  contact_id?: string;
  has_active_deal: boolean;
  last_interaction_at?: string;
  total_meetings?: number;
}

interface LeadInput {
  email: string;
  company_domain?: string;
}

/**
 * Classify leads based on their presence in contacts/companies tables and deal status
 *
 * Classification rules:
 * - net_new: Email/domain not found in contacts or companies
 * - uncontacted: Contact exists but no interactions (last_interaction_at IS NULL AND total_meetings_count = 0)
 * - contacted_no_deal: Has interactions but no active deals
 * - existing_with_deal: Has associated active deal
 *
 * Uses batched queries for performance (3 queries for N leads)
 */
export async function classifyLeads(
  supabase: SupabaseClient,
  orgId: string,
  leads: LeadInput[]
): Promise<Map<string, ClassifiedLead>> {
  const result = new Map<string, ClassifiedLead>();

  if (leads.length === 0) return result;

  // Normalize emails to lowercase for matching
  const emailMap = new Map<string, string>(); // lowercase -> original
  const emails = leads.map(lead => {
    const normalized = lead.email.toLowerCase();
    emailMap.set(normalized, lead.email);
    return normalized;
  });

  const domains = leads
    .map(lead => lead.company_domain?.toLowerCase())
    .filter((d): d is string => !!d);

  try {
    // Batch query 1: Get all matching contacts by email
    const { data: contacts, error: contactsError } = await supabase
      .from('contacts')
      .select('id, email, last_interaction_at, total_meetings_count, company')
      .eq('owner_id', orgId)
      .in('email', emails);

    if (contactsError) {
      console.error('[classifyLeads] Error fetching contacts:', contactsError);
    }

    // Batch query 2: Get all matching companies by domain
    const { data: companies, error: companiesError } = domains.length > 0
      ? await supabase
          .from('companies')
          .select('id, domain')
          .eq('organization_id', orgId)
          .in('domain', domains)
      : { data: [], error: null };

    if (companiesError) {
      console.error('[classifyLeads] Error fetching companies:', companiesError);
    }

    // Build lookup sets
    const contactsByEmail = new Map(
      (contacts || []).map(c => [c.email.toLowerCase(), c])
    );
    const companyDomains = new Set(
      (companies || []).map(c => c.domain?.toLowerCase()).filter(Boolean)
    );

    // Batch query 3: Get active deals for found contacts
    const contactEmails = Array.from(contactsByEmail.keys());
    const { data: deals, error: dealsError } = contactEmails.length > 0
      ? await supabase
          .from('deals')
          .select('contact_email, status')
          .eq('owner_id', orgId)
          .eq('status', 'active')
          .in('contact_email', contactEmails)
      : { data: [], error: null };

    if (dealsError) {
      console.error('[classifyLeads] Error fetching deals:', dealsError);
    }

    // Build deal lookup
    const activeDealsByEmail = new Set(
      (deals || []).map(d => d.contact_email?.toLowerCase()).filter(Boolean)
    );

    // Classify each lead
    for (const lead of leads) {
      const normalizedEmail = lead.email.toLowerCase();
      const normalizedDomain = lead.company_domain?.toLowerCase();

      const contact = contactsByEmail.get(normalizedEmail);
      const hasCompany = normalizedDomain ? companyDomains.has(normalizedDomain) : false;
      const hasActiveDeal = activeDealsByEmail.has(normalizedEmail);

      let classification: LeadClassification;

      if (!contact && !hasCompany) {
        // Not found in either contacts or companies
        classification = 'net_new';
      } else if (contact) {
        // Contact exists - check interaction status
        const hasInteractions =
          contact.last_interaction_at !== null ||
          (contact.total_meetings_count && contact.total_meetings_count > 0);

        if (hasActiveDeal) {
          classification = 'existing_with_deal';
        } else if (hasInteractions) {
          classification = 'contacted_no_deal';
        } else {
          classification = 'uncontacted';
        }
      } else {
        // Company exists but no contact - treat as uncontacted
        classification = 'uncontacted';
      }

      result.set(lead.email, {
        email: lead.email,
        company_domain: lead.company_domain,
        classification,
        contact_id: contact?.id,
        has_active_deal: hasActiveDeal,
        last_interaction_at: contact?.last_interaction_at || undefined,
        total_meetings: contact?.total_meetings_count || undefined,
      });
    }

    return result;
  } catch (error) {
    console.error('[classifyLeads] Unexpected error:', error);

    // Return all leads as net_new on error (fail-safe)
    for (const lead of leads) {
      result.set(lead.email, {
        email: lead.email,
        company_domain: lead.company_domain,
        classification: 'net_new',
        has_active_deal: false,
      });
    }

    return result;
  }
}

/**
 * Extract domain from email address
 */
export function extractDomainFromEmail(email: string): string | undefined {
  const match = email.match(/@(.+)$/);
  return match?.[1]?.toLowerCase();
}
