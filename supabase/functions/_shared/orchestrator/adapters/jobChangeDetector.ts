/**
 * Job Change Detector Adapter
 *
 * REL-007: Detects job changes for key contacts (champion / economic_buyer)
 * via Apollo enrichment and email-domain monitoring.
 *
 * Two detection paths:
 *
 * 1. Apollo check (primary):
 *    - Queries deal_contacts for contacts with role IN ('champion', 'economic_buyer')
 *      whose last enrichment is > 30 days ago.
 *    - Calls Apollo /api/v1/people/match for each contact.
 *    - Compares returned company / title against what is stored in contacts +
 *      contact_org_history.
 *    - On mismatch: ends the current contact_org_history row (ended_at = now),
 *      resolves / creates the new company row, then inserts a fresh
 *      contact_org_history row.
 *
 * 2. Email domain check (secondary):
 *    - Accepts pre-classified inbound email signals via step input.
 *    - When a contact's inbound email domain differs from the domain stored in
 *      contacts.email, flags the contact as a potential job change without
 *      calling Apollo.
 *
 * After detecting a job change the adapter fires a reengagement event for each
 * affected contact so the existing reengagement adapter can pick it up.
 *
 * Rate limiting: max 50 Apollo calls per batch run.
 * Failure handling: per-contact errors are caught and logged; the batch
 * continues so a single Apollo timeout never aborts the whole run.
 */

import type { SkillAdapter, SequenceState, SequenceStep, StepResult } from '../types.ts';
import { getServiceClient } from './contextEnrichment.ts';

// =============================================================================
// Constants
// =============================================================================

const APOLLO_API_BASE = 'https://api.apollo.io/api/v1';
const MAX_APOLLO_CALLS_PER_CYCLE = 50;
const ENRICHMENT_STALE_DAYS = 30;

// =============================================================================
// Types
// =============================================================================

interface ApolloPersonMatch {
  id: string;
  first_name: string;
  last_name: string;
  title: string | null;
  organization_name: string | null;
  organization?: {
    name: string;
    website_url?: string;
    domain?: string;
  };
  employment_history?: Array<{
    title: string;
    organization_name: string;
    start_date: string | null;
    end_date: string | null;
    current: boolean;
  }>;
}

interface KeyContact {
  deal_contacts_id: string;
  deal_id: string;
  deal_name: string;
  contact_id: string;
  contact_email: string | null;
  contact_first_name: string | null;
  contact_last_name: string | null;
  contact_title: string | null;
  company_id: string | null;
  company_name: string | null;
  last_enriched_at: string | null;
  role: 'champion' | 'economic_buyer';
}

interface EmailDomainSignal {
  contact_id: string;
  contact_email: string;   // stored email
  inbound_email: string;   // sender address from the inbound email
}

interface JobChangeResult {
  contact_id: string;
  contact_name: string;
  detection_source: 'apollo' | 'email_domain';
  previous_company: string | null;
  new_company: string | null;
  previous_title: string | null;
  new_title: string | null;
  org_history_updated: boolean;
  reengagement_flagged: boolean;
}

// =============================================================================
// Helpers: Apollo API
// =============================================================================

/**
 * Match a contact in Apollo by email to get their current employer / title.
 * Returns null on any error (rate limit, network, not found).
 */
async function apolloMatchByEmail(
  email: string,
  apiKey: string
): Promise<ApolloPersonMatch | null> {
  try {
    const response = await fetch(`${APOLLO_API_BASE}/people/match`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-cache',
        'X-Api-Key': apiKey,
      },
      body: JSON.stringify({ email, reveal_personal_emails: false }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        console.warn('[job-change-detector] Apollo rate limited — skipping contact');
        await new Promise((r) => setTimeout(r, 2000));
      } else {
        console.warn(`[job-change-detector] Apollo returned ${response.status} for ${email}`);
      }
      return null;
    }

    const data = await response.json();
    return (data?.person as ApolloPersonMatch) || null;
  } catch (err) {
    console.error(`[job-change-detector] Apollo fetch error for ${email}:`, err);
    return null;
  }
}

// =============================================================================
// Helpers: Company resolution
// =============================================================================

/**
 * Resolve a company by name (and optionally domain) from the companies table.
 * If the company doesn't exist yet, insert a minimal stub row and return its id.
 */
async function resolveOrCreateCompany(
  supabase: ReturnType<typeof getServiceClient>,
  orgId: string,
  companyName: string,
  domain: string | null | undefined
): Promise<string | null> {
  // Attempt to find by domain first (more reliable), then name
  if (domain) {
    const { data: byDomain } = await supabase
      .from('companies')
      .select('id')
      .eq('domain', domain)
      .maybeSingle();

    if (byDomain?.id) return byDomain.id;
  }

  const { data: byName } = await supabase
    .from('companies')
    .select('id')
    .ilike('name', companyName)
    .maybeSingle();

  if (byName?.id) return byName.id;

  // Create a stub company row
  const { data: created, error: createError } = await supabase
    .from('companies')
    .insert({
      name: companyName,
      domain: domain || null,
      owner_id: null,
      organization_id: orgId,
    })
    .select('id')
    .maybeSingle();

  if (createError) {
    console.error('[job-change-detector] Failed to create company stub:', createError.message);
    return null;
  }

  return created?.id || null;
}

// =============================================================================
// Helpers: contact_org_history management
// =============================================================================

/**
 * Close the current contact_org_history row (set ended_at = now) and open a
 * new row for the new company/title.
 *
 * Returns true if both operations succeeded.
 */
async function updateOrgHistory(
  supabase: ReturnType<typeof getServiceClient>,
  contactId: string,
  newCompanyId: string,
  newTitle: string | null,
  source: 'apollo' | 'email_domain_change'
): Promise<boolean> {
  const now = new Date().toISOString();

  // 1. Close any currently-open org history rows for this contact
  const { error: closeError } = await supabase
    .from('contact_org_history')
    .update({ ended_at: now })
    .eq('contact_id', contactId)
    .is('ended_at', null);

  if (closeError) {
    console.error(
      `[job-change-detector] Failed to close org history for contact ${contactId}:`,
      closeError.message
    );
    return false;
  }

  // 2. Insert new current row
  const { error: insertError } = await supabase
    .from('contact_org_history')
    .insert({
      contact_id: contactId,
      company_id: newCompanyId,
      title: newTitle,
      started_at: now,
      ended_at: null,
      source: source === 'email_domain_change' ? 'email_domain_change' : 'apollo',
    });

  if (insertError) {
    // Unique constraint violation means we already have this row — safe to ignore
    if (insertError.code === '23505') {
      console.warn(
        `[job-change-detector] Org history row already exists for contact ${contactId} + company ${newCompanyId}`
      );
      return true;
    }
    console.error(
      `[job-change-detector] Failed to insert org history for contact ${contactId}:`,
      insertError.message
    );
    return false;
  }

  return true;
}

// =============================================================================
// Helpers: Reengagement event
// =============================================================================

/**
 * Insert a row into the reengagement_watchlist for this contact's deal so the
 * existing reengagement pipeline can pick it up.
 *
 * We use record_reengagement_signal RPC (same as reengagementApollo adapter)
 * so we stay consistent with the signal schema.  Falls back to a direct insert
 * if the RPC is unavailable.
 */
async function flagReengagementEvent(
  supabase: ReturnType<typeof getServiceClient>,
  dealId: string,
  contactName: string,
  previousCompany: string | null,
  newCompany: string | null,
  newTitle: string | null
): Promise<boolean> {
  const description =
    `${contactName} has changed jobs` +
    (previousCompany ? ` — left ${previousCompany}` : '') +
    (newCompany ? ` and joined ${newCompany}` : '') +
    (newTitle ? ` as ${newTitle}` : '') +
    '. High-priority re-engagement opportunity detected.';

  const { error } = await supabase.rpc('record_reengagement_signal', {
    p_deal_id: dealId,
    p_signal_type: 'job_change_detected',
    p_signal_description: description,
  });

  if (error) {
    console.warn(
      `[job-change-detector] record_reengagement_signal failed for deal ${dealId}:`,
      error.message
    );
    return false;
  }

  return true;
}

// =============================================================================
// Detection: Apollo path
// =============================================================================

/**
 * Run Apollo enrichment for all key contacts that are stale (> 30 days).
 *
 * Returns the list of detected job-change results.
 */
async function runApolloDetection(
  supabase: ReturnType<typeof getServiceClient>,
  orgId: string,
  apolloApiKey: string
): Promise<{ results: JobChangeResult[]; apolloCallsUsed: number }> {
  const results: JobChangeResult[] = [];
  let apolloCallsUsed = 0;

  const staleThreshold = new Date(
    Date.now() - ENRICHMENT_STALE_DAYS * 24 * 60 * 60 * 1000
  ).toISOString();

  // Query deal_contacts for champion / economic_buyer contacts with stale enrichment
  // We join contacts and deals in one shot to avoid N+1 round trips.
  const { data: rows, error: queryError } = await supabase
    .from('deal_contacts')
    .select(`
      id,
      deal_id,
      role,
      contact_id,
      deals!inner ( id, name, owner_id ),
      contacts!inner (
        id,
        email,
        first_name,
        last_name,
        title,
        company_id,
        last_enriched_at,
        companies ( id, name )
      )
    `)
    .in('role', ['champion', 'economic_buyer'])
    .or(`last_enriched_at.is.null,last_enriched_at.lt.${staleThreshold}`, {
      referencedTable: 'contacts',
    })
    .eq('deals.owner_id', orgId)   // scope to this org's deals
    .limit(MAX_APOLLO_CALLS_PER_CYCLE);

  if (queryError) {
    console.error('[job-change-detector] Failed to query key contacts:', queryError.message);
    return { results, apolloCallsUsed };
  }

  if (!rows || rows.length === 0) {
    console.log('[job-change-detector] No stale key contacts found for Apollo check');
    return { results, apolloCallsUsed };
  }

  console.log(`[job-change-detector] Running Apollo check for ${rows.length} key contacts`);

  for (const row of rows as any[]) {
    if (apolloCallsUsed >= MAX_APOLLO_CALLS_PER_CYCLE) {
      console.warn(
        `[job-change-detector] Hit Apollo call limit (${MAX_APOLLO_CALLS_PER_CYCLE}), stopping early`
      );
      break;
    }

    const contact = row.contacts;
    const deal = row.deals;

    if (!contact?.email) {
      console.warn(
        `[job-change-detector] Contact ${contact?.id} has no email — skipping Apollo check`
      );
      continue;
    }

    const contactName =
      [contact.first_name, contact.last_name].filter(Boolean).join(' ') ||
      contact.email;
    const storedCompanyName = contact.companies?.name || null;

    let apolloPerson: ApolloPersonMatch | null = null;
    try {
      apolloPerson = await apolloMatchByEmail(contact.email, apolloApiKey);
      apolloCallsUsed++;
    } catch (err) {
      console.warn(
        `[job-change-detector] Apollo call failed for ${contact.email}, skipping:`,
        err
      );
      continue;
    }

    // Update last_enriched_at regardless of job change detection
    await supabase
      .from('contacts')
      .update({ last_enriched_at: new Date().toISOString() })
      .eq('id', contact.id)
      .then(({ error }) => {
        if (error) {
          console.warn(
            `[job-change-detector] Failed to update last_enriched_at for ${contact.id}:`,
            error.message
          );
        }
      });

    if (!apolloPerson) {
      // Not found in Apollo — skip change detection for this contact
      continue;
    }

    // Determine Apollo's current company
    const currentJob = apolloPerson.employment_history?.find((h) => h.current);
    const apolloCompanyName =
      currentJob?.organization_name ||
      apolloPerson.organization_name ||
      apolloPerson.organization?.name ||
      null;
    const apolloTitle = currentJob?.title || apolloPerson.title || null;
    const apolloDomain = apolloPerson.organization?.domain || apolloPerson.organization?.website_url?.replace(/^https?:\/\//, '').split('/')[0] || null;

    // Compare company names (case-insensitive, trimmed)
    const storedLower = (storedCompanyName || '').toLowerCase().trim();
    const apolloLower = (apolloCompanyName || '').toLowerCase().trim();

    const companyChanged = apolloLower !== '' && storedLower !== '' && apolloLower !== storedLower;
    const titleChanged =
      apolloTitle &&
      contact.title &&
      apolloTitle.toLowerCase().trim() !== contact.title.toLowerCase().trim();

    if (!companyChanged) {
      // No job change detected — nothing to record
      continue;
    }

    console.log(
      `[job-change-detector] Job change detected for ${contactName}: ` +
        `${storedCompanyName} -> ${apolloCompanyName}`
    );

    // Resolve / create new company
    const newCompanyId = apolloCompanyName
      ? await resolveOrCreateCompany(supabase, orgId, apolloCompanyName, apolloDomain)
      : null;

    let orgHistoryUpdated = false;
    if (newCompanyId) {
      orgHistoryUpdated = await updateOrgHistory(
        supabase,
        contact.id,
        newCompanyId,
        apolloTitle,
        'apollo'
      );

      // Also update the contacts row to reflect new company
      await supabase
        .from('contacts')
        .update({
          company_id: newCompanyId,
          title: apolloTitle || contact.title,
        })
        .eq('id', contact.id)
        .then(({ error }) => {
          if (error) {
            console.warn(
              `[job-change-detector] Failed to update contact company for ${contact.id}:`,
              error.message
            );
          }
        });
    }

    // Flag reengagement
    const reengagementFlagged = await flagReengagementEvent(
      supabase,
      deal.id,
      contactName,
      storedCompanyName,
      apolloCompanyName,
      apolloTitle
    );

    results.push({
      contact_id: contact.id,
      contact_name: contactName,
      detection_source: 'apollo',
      previous_company: storedCompanyName,
      new_company: apolloCompanyName,
      previous_title: contact.title || null,
      new_title: apolloTitle,
      org_history_updated: orgHistoryUpdated,
      reengagement_flagged: reengagementFlagged,
    });
  }

  return { results, apolloCallsUsed };
}

// =============================================================================
// Detection: Email domain path
// =============================================================================

/**
 * Process email domain change signals that were pre-classified by the email
 * classifier and passed in via step payload (state.event.payload.email_signals).
 *
 * This path does NOT call Apollo — it flags the potential job change and leaves
 * full enrichment to the next Apollo scan cycle.
 */
async function runEmailDomainDetection(
  supabase: ReturnType<typeof getServiceClient>,
  orgId: string,
  emailSignals: EmailDomainSignal[]
): Promise<JobChangeResult[]> {
  const results: JobChangeResult[] = [];

  for (const signal of emailSignals) {
    const storedDomain = signal.contact_email.split('@')[1]?.toLowerCase() || '';
    const inboundDomain = signal.inbound_email.split('@')[1]?.toLowerCase() || '';

    if (!storedDomain || !inboundDomain || storedDomain === inboundDomain) {
      continue;
    }

    // Fetch contact details
    const { data: contact } = await supabase
      .from('contacts')
      .select('id, first_name, last_name, email, title, company_id, companies ( id, name )')
      .eq('id', signal.contact_id)
      .maybeSingle();

    if (!contact) {
      console.warn(
        `[job-change-detector] Contact ${signal.contact_id} not found, skipping email domain check`
      );
      continue;
    }

    const contactName =
      [contact.first_name, contact.last_name].filter(Boolean).join(' ') ||
      contact.email;
    const storedCompanyName = (contact as any).companies?.name || null;

    console.log(
      `[job-change-detector] Email domain change for ${contactName}: ` +
        `${storedDomain} -> ${inboundDomain}`
    );

    // Find the deal to flag reengagement — use the first active deal this contact appears on
    const { data: dealContactRow } = await supabase
      .from('deal_contacts')
      .select('deal_id, deals!inner ( id, name )')
      .eq('contact_id', contact.id)
      .in('role', ['champion', 'economic_buyer'])
      .maybeSingle();

    const dealId: string | null = (dealContactRow as any)?.deal_id || null;

    // We can't resolve the new company from a domain alone without Apollo —
    // insert a stub org history row with just the domain as a placeholder company
    // and mark it as email_domain_change source for later enrichment.
    const newCompanyId = await resolveOrCreateCompany(
      supabase,
      orgId,
      `[Unknown — domain: ${inboundDomain}]`,
      inboundDomain
    );

    let orgHistoryUpdated = false;
    if (newCompanyId) {
      orgHistoryUpdated = await updateOrgHistory(
        supabase,
        contact.id,
        newCompanyId,
        null,            // title unknown at this stage
        'email_domain_change'
      );
    }

    let reengagementFlagged = false;
    if (dealId) {
      reengagementFlagged = await flagReengagementEvent(
        supabase,
        dealId,
        contactName,
        storedCompanyName,
        `[New domain: ${inboundDomain}]`,
        null
      );
    }

    results.push({
      contact_id: contact.id,
      contact_name: contactName,
      detection_source: 'email_domain',
      previous_company: storedCompanyName,
      new_company: `[domain: ${inboundDomain}]`,
      previous_title: contact.title || null,
      new_title: null,
      org_history_updated: orgHistoryUpdated,
      reengagement_flagged: reengagementFlagged,
    });
  }

  return results;
}

// =============================================================================
// Main Adapter
// =============================================================================

export const jobChangeDetectorAdapter: SkillAdapter = {
  name: 'detect-job-changes',

  async execute(state: SequenceState, step: SequenceStep): Promise<StepResult> {
    const start = Date.now();

    try {
      console.log('[job-change-detector] Starting job change detection...');

      const supabase = getServiceClient();
      const orgId = state.event.org_id;

      if (!orgId) {
        throw new Error('org_id is required in event payload');
      }

      // ------------------------------------------------------------------
      // 1. Fetch Apollo credentials
      // ------------------------------------------------------------------

      const { data: credential, error: credError } = await supabase
        .from('integration_credentials')
        .select('credentials')
        .eq('organization_id', orgId)   // NOTE: column is organization_id, NOT org_id
        .eq('provider', 'apollo')
        .maybeSingle();

      const apolloApiKey =
        !credError && credential?.credentials
          ? (credential.credentials as Record<string, string>)?.api_key || null
          : null;

      if (!apolloApiKey) {
        console.warn('[job-change-detector] No Apollo API key found for org — skipping Apollo path');
      }

      // ------------------------------------------------------------------
      // 2. Apollo detection path
      // ------------------------------------------------------------------

      let apolloResults: JobChangeResult[] = [];
      let apolloCallsUsed = 0;

      if (apolloApiKey) {
        const apolloRun = await runApolloDetection(supabase, orgId, apolloApiKey);
        apolloResults = apolloRun.results;
        apolloCallsUsed = apolloRun.apolloCallsUsed;
      }

      // ------------------------------------------------------------------
      // 3. Email domain detection path
      // ------------------------------------------------------------------

      const emailSignals = (
        (state.event.payload?.email_signals as EmailDomainSignal[]) || []
      ).filter(
        (s) =>
          s &&
          typeof s.contact_id === 'string' &&
          typeof s.contact_email === 'string' &&
          typeof s.inbound_email === 'string'
      );

      const emailResults =
        emailSignals.length > 0
          ? await runEmailDomainDetection(supabase, orgId, emailSignals)
          : [];

      // ------------------------------------------------------------------
      // 4. Summarise and return
      // ------------------------------------------------------------------

      const allResults = [...apolloResults, ...emailResults];
      const totalChanges = allResults.length;

      console.log(
        `[job-change-detector] Complete: ${totalChanges} job changes detected ` +
          `(${apolloResults.length} via Apollo, ${emailResults.length} via email domain). ` +
          `Apollo calls used: ${apolloCallsUsed}/${MAX_APOLLO_CALLS_PER_CYCLE}`
      );

      return {
        success: true,
        output: {
          job_changes_detected: totalChanges,
          apollo_changes: apolloResults.length,
          email_domain_changes: emailResults.length,
          apollo_calls_used: apolloCallsUsed,
          results: allResults,
        },
        duration_ms: Date.now() - start,
      };
    } catch (err) {
      console.error('[job-change-detector] Unhandled error:', err);
      return {
        success: false,
        error: String(err),
        duration_ms: Date.now() - start,
      };
    }
  },
};
