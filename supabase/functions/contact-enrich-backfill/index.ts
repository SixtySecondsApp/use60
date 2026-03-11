/**
 * contact-enrich-backfill
 *
 * Backfills contacts missing company data by extracting domain from email.
 * Also infers contact category from deal relationships.
 *
 * Uses batch/in-memory matching to stay well within edge function time limits.
 *
 * POST body:
 *   { org_id: string }
 *
 * Returns:
 *   {
 *     total_processed: number,
 *     companies_linked: number,
 *     companies_created: number,
 *     categories_updated: number,
 *     personal_emails_skipped: number,
 *   }
 *
 * Deploy with --no-verify-jwt (staging ES256 JWT issue).
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.43.4';
import {
  handleCorsPreflightRequest,
  errorResponse,
  jsonResponse,
} from '../_shared/corsHelper.ts';
import { extractBusinessDomain } from '../_shared/companyMatching.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

// Personal email domains — contacts with these get skipped
const PERSONAL_DOMAINS = new Set([
  'gmail.com', 'yahoo.com', 'hotmail.com', 'outlook.com', 'icloud.com',
  'me.com', 'aol.com', 'live.com', 'msn.com', 'protonmail.com',
  'mail.com', 'yandex.com', 'zoho.com', 'gmx.com', 'fastmail.com',
  'yahoo.co.uk', 'hotmail.co.uk', 'btinternet.com', 'sky.com',
  'virginmedia.com', 'talktalk.net', 'googlemail.com',
]);

interface Contact {
  id: string;
  email: string;
  owner_id: string;
  company_id: string | null;
  category: string | null;
}

interface Company {
  id: string;
  name: string;
  domain: string | null;
  owner_id: string;
}

/** Derive a display name from domain: "acme.co.uk" → "Acme" */
function nameFromDomain(domain: string): string {
  const stripped = domain
    .replace(/\.(com|org|net|co\.uk|co|io|ai|tech|app|dev|biz|info|uk|us|de|fr|es|it|nl|be|au|ca|nz)$/i, '')
    .replace(/^www\./, '');
  return stripped
    .split(/[.\-_]/)
    .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
    .join(' ');
}

serve(async (req) => {
  const corsRes = handleCorsPreflightRequest(req);
  if (corsRes) return corsRes;

  try {
    const body = await req.json();
    const { org_id } = body as { org_id: string };
    console.log('[contact-enrich-backfill] Received org_id:', org_id, 'body:', JSON.stringify(body));
    if (!org_id) {
      return errorResponse('org_id is required', req, 400);
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // ── 1. Get org member user IDs ──
    const { data: members, error: memberErr } = await supabase
      .from('organization_memberships')
      .select('user_id')
      .eq('org_id', org_id);

    if (memberErr) throw memberErr;
    const userIds = (members ?? []).map((m: { user_id: string }) => m.user_id);
    console.log('[contact-enrich-backfill] Found', userIds.length, 'org members:', userIds);
    if (userIds.length === 0) {
      return jsonResponse({ total_processed: 0, companies_linked: 0, companies_created: 0, categories_updated: 0, personal_emails_skipped: 0 }, req);
    }

    // ── 2. Fetch contacts missing company_id (batch) ──
    const { data: rawContacts, error: contactErr } = await supabase
      .from('contacts')
      .select('id, email, owner_id, company_id, category')
      .in('owner_id', userIds)
      .is('company_id', null)
      .not('email', 'is', null)
      .limit(200);

    if (contactErr) {
      console.error('[contact-enrich-backfill] Contact query error:', contactErr);
      throw contactErr;
    }
    const contacts = (rawContacts ?? []) as Contact[];
    console.log('[contact-enrich-backfill] Found', contacts.length, 'contacts missing company_id');

    if (contacts.length === 0) {
      return jsonResponse({ total_processed: 0, companies_linked: 0, companies_created: 0, categories_updated: 0, personal_emails_skipped: 0 }, req);
    }

    // ── 3. Load ALL existing companies for this org (single query) ──
    const { data: rawCompanies } = await supabase
      .from('companies')
      .select('id, name, domain, owner_id')
      .in('owner_id', userIds);

    const existingCompanies = (rawCompanies ?? []) as Company[];

    // Build domain → company lookup (lowercase)
    const domainMap = new Map<string, Company>();
    for (const co of existingCompanies) {
      if (co.domain) {
        domainMap.set(co.domain.toLowerCase(), co);
      }
    }

    // ── 4. Match contacts to companies in-memory ──
    let companiesLinked = 0;
    let companiesCreated = 0;
    let personalSkipped = 0;

    // Group contacts by domain for batch processing
    const domainContacts = new Map<string, Contact[]>();

    for (const contact of contacts) {
      const domain = extractBusinessDomain(contact.email);
      if (!domain) {
        personalSkipped++;
        continue;
      }
      const existing = domainContacts.get(domain) ?? [];
      existing.push(contact);
      domainContacts.set(domain, existing);
    }

    // Process each unique domain once
    const contactUpdates: { id: string; company_id: string }[] = [];

    for (const [domain, domContacts] of domainContacts) {
      let company = domainMap.get(domain);

      if (!company) {
        // Also try without subdomain: "mail.acme.com" → "acme.com"
        const parts = domain.split('.');
        if (parts.length > 2) {
          const parentDomain = parts.slice(-2).join('.');
          company = domainMap.get(parentDomain);
        }
      }

      if (!company) {
        // Create a new company for this domain
        const companyName = nameFromDomain(domain);
        const ownerId = domContacts[0].owner_id;

        try {
          const { data: newCo, error: createErr } = await supabase
            .from('companies')
            .insert({
              name: companyName,
              domain: domain.toLowerCase(),
              website: `https://${domain}`,
              owner_id: ownerId,
              source: 'contact_enrich_backfill',
              first_seen_at: new Date().toISOString(),
            })
            .select('id, name, domain, owner_id')
            .single();

          if (createErr) {
            console.warn(`[contact-enrich-backfill] Create company failed for ${domain}:`, createErr.message);
            // Duplicate — try to fetch existing
            const { data: existing } = await supabase
              .from('companies')
              .select('id, name, domain, owner_id')
              .ilike('domain', domain.toLowerCase())
              .in('owner_id', userIds)
              .maybeSingle();
            if (existing) {
              company = existing as Company;
              domainMap.set(domain, company);
            }
            if (!company) continue;
          } else {
            company = newCo as Company;
            companiesCreated++;
            domainMap.set(domain, company);
          }
        } catch (createEx) {
          console.error(`[contact-enrich-backfill] Exception creating company for ${domain}:`, createEx);
          continue;
        }
      }

      // Queue updates for all contacts with this domain
      for (const contact of domContacts) {
        contactUpdates.push({ id: contact.id, company_id: company.id });
      }
    }

    // ── 5. Batch-update contacts with company_id (chunks of 50) ──
    for (let i = 0; i < contactUpdates.length; i += 50) {
      const chunk = contactUpdates.slice(i, i + 50);
      // Group by company_id for efficient updates
      const byCompany = new Map<string, string[]>();
      for (const { id, company_id } of chunk) {
        const ids = byCompany.get(company_id) ?? [];
        ids.push(id);
        byCompany.set(company_id, ids);
      }

      for (const [companyId, contactIds] of byCompany) {
        const { error } = await supabase
          .from('contacts')
          .update({ company_id: companyId })
          .in('id', contactIds);

        if (!error) companiesLinked += contactIds.length;
      }
    }

    // ── 6. Category inference (bulk queries, no per-contact loops) ──
    let categoriesUpdated = 0;

    // 6a: Won deals → mark primary contacts as 'client'
    const { data: wonDealContacts } = await supabase
      .from('deals')
      .select('primary_contact_id')
      .in('owner_id', userIds)
      .eq('status', 'won')
      .not('primary_contact_id', 'is', null);

    if (wonDealContacts && wonDealContacts.length > 0) {
      const clientIds = [...new Set(wonDealContacts.map((d: { primary_contact_id: string }) => d.primary_contact_id))];
      // Batch in chunks of 50 for the .in() filter
      for (let i = 0; i < clientIds.length; i += 50) {
        const chunk = clientIds.slice(i, i + 50);
        const { count } = await supabase
          .from('contacts')
          .update({ category: 'client' })
          .in('id', chunk)
          .eq('category', 'prospect')
          .select('id', { count: 'exact', head: true });
        categoriesUpdated += count ?? 0;
      }
    }

    // 6b: Mark org member emails as 'employee'
    // Use the user_id emails from org members — query auth.users via service role
    try {
      for (const uid of userIds) {
        const { data: authUser } = await supabase.auth.admin.getUserById(uid);
        if (authUser?.user?.email) {
          const { count } = await supabase
            .from('contacts')
            .update({ category: 'employee' })
            .ilike('email', authUser.user.email.toLowerCase())
            .in('owner_id', userIds)
            .eq('category', 'prospect')
            .select('id', { count: 'exact', head: true });
          categoriesUpdated += count ?? 0;
        }
      }
    } catch (empErr) {
      console.warn('[contact-enrich-backfill] Employee detection failed (non-fatal):', empErr);
    }

    return jsonResponse({
      total_processed: contacts.length,
      companies_linked: companiesLinked,
      companies_created: companiesCreated,
      categories_updated: categoriesUpdated,
      personal_emails_skipped: personalSkipped,
    }, req);
  } catch (err) {
    console.error('[contact-enrich-backfill] Error:', err);
    return errorResponse(
      err instanceof Error ? err.message : 'Internal error',
      req,
      500
    );
  }
});
