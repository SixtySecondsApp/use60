// supabase/functions/visitor-enrich-contact/index.ts
// Triggered after successful IP-to-company resolution.
// Finds the best-fit contact at the resolved company via Apollo,
// creates/matches contact, optionally creates a lead, sends Slack notification.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.43.4';
import { getCorsHeaders, handleCorsPreflightRequest, jsonResponse, errorResponse } from '../_shared/corsHelper.ts';

serve(async (req) => {
  const preflightResponse = handleCorsPreflightRequest(req);
  if (preflightResponse) return preflightResponse;

  if (req.method !== 'POST') {
    return errorResponse('Method not allowed', req, 405);
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  try {
    const { visitorId, orgId, companyDomain, companyName, autoCreateLead } = await req.json();

    if (!visitorId || !orgId || !companyDomain) {
      return errorResponse('Missing required fields: visitorId, orgId, companyDomain', req);
    }

    // Get Apollo API key for this org (check org settings, then user_settings, then env)
    const apolloApiKey = await getApolloApiKey(supabase, orgId);
    if (!apolloApiKey) {
      console.warn('[visitor-enrich-contact] No Apollo API key available for org:', orgId);
      await supabase
        .from('website_visitors')
        .update({ enrichment_status: 'skipped' })
        .eq('id', visitorId);
      return jsonResponse({ ok: true, skipped: 'no_apollo_key' }, req);
    }

    // Search Apollo for best-fit contact at this company
    const contact = await findBestFitContact(apolloApiKey, companyDomain, companyName);
    if (!contact) {
      await supabase
        .from('website_visitors')
        .update({ enrichment_status: 'skipped' })
        .eq('id', visitorId);
      return jsonResponse({ ok: true, skipped: 'no_contact_found' }, req);
    }

    // Find or create contact in 60
    const contactId = await findOrCreateContact(supabase, orgId, contact);

    // Update visitor with matched contact
    await supabase
      .from('website_visitors')
      .update({
        matched_contact_id: contactId,
        enrichment_status: 'enriched',
      })
      .eq('id', visitorId);

    // Create lead if configured
    let leadId = null;
    if (autoCreateLead) {
      leadId = await createLeadFromVisitor(supabase, orgId, visitorId, contactId);
    }

    // Fire Slack notification (non-blocking)
    notifySlack(supabaseUrl, supabaseServiceKey, orgId, visitorId).catch(err =>
      console.error('[visitor-enrich-contact] Slack notify error:', err)
    );

    return jsonResponse({ ok: true, contactId, leadId }, req);
  } catch (error) {
    console.error('[visitor-enrich-contact] Error:', error);
    return errorResponse(error.message || 'Internal error', req, 500);
  }
});

async function getApolloApiKey(supabase: any, orgId: string): Promise<string | null> {
  // Check organization-level integration credentials first
  const { data: orgCreds } = await supabase
    .from('integration_credentials')
    .select('credentials')
    .eq('org_id', orgId)
    .eq('provider', 'apollo')
    .eq('is_active', true)
    .maybeSingle();

  if (orgCreds?.credentials?.api_key) return orgCreds.credentials.api_key;

  // Check any org member's user_settings for Apollo key
  const { data: members } = await supabase
    .from('organization_members')
    .select('user_id')
    .eq('org_id', orgId)
    .limit(5);

  if (members) {
    for (const member of members) {
      const { data: settings } = await supabase
        .from('user_settings')
        .select('ai_provider_keys')
        .eq('user_id', member.user_id)
        .maybeSingle();

      if (settings?.ai_provider_keys?.apollo) return settings.ai_provider_keys.apollo;
    }
  }

  // Fallback to env var
  return Deno.env.get('APOLLO_API_KEY') || null;
}

interface ApolloContact {
  name: string;
  first_name: string;
  last_name: string;
  title: string;
  email: string;
  phone?: string;
  linkedin_url?: string;
  organization_name?: string;
}

async function findBestFitContact(
  apiKey: string,
  companyDomain: string,
  companyName: string
): Promise<ApolloContact | null> {
  // Search Apollo for senior contacts at this company
  const searchUrl = 'https://api.apollo.io/v1/mixed_people/search';
  const resp = await fetch(searchUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-cache',
      'X-Api-Key': apiKey,
    },
    body: JSON.stringify({
      q_organization_domains: companyDomain,
      person_seniorities: ['vp', 'director', 'c_suite', 'founder', 'owner', 'partner'],
      page: 1,
      per_page: 3,
    }),
  });

  if (!resp.ok) {
    console.warn(`[visitor-enrich-contact] Apollo search failed: ${resp.status}`);
    return null;
  }

  const data = await resp.json();
  const people = data.people || [];

  if (people.length === 0) return null;

  // Return the top match
  const p = people[0];
  return {
    name: p.name || `${p.first_name || ''} ${p.last_name || ''}`.trim(),
    first_name: p.first_name || '',
    last_name: p.last_name || '',
    title: p.title || '',
    email: p.email || '',
    phone: p.phone_numbers?.[0]?.sanitized_number || p.organization_phone || '',
    linkedin_url: p.linkedin_url || '',
    organization_name: p.organization?.name || companyName,
  };
}

async function findOrCreateContact(supabase: any, orgId: string, contact: ApolloContact): Promise<string> {
  // Try to find existing contact by email
  if (contact.email) {
    const { data: existing } = await supabase
      .from('contacts')
      .select('id')
      .eq('org_id', orgId)
      .eq('email', contact.email)
      .maybeSingle();

    if (existing) return existing.id;
  }

  // Try by LinkedIn URL
  if (contact.linkedin_url) {
    const { data: existing } = await supabase
      .from('contacts')
      .select('id')
      .eq('org_id', orgId)
      .eq('linkedin_url', contact.linkedin_url)
      .maybeSingle();

    if (existing) return existing.id;
  }

  // Get a default owner for this org
  const { data: orgMember } = await supabase
    .from('organization_members')
    .select('user_id')
    .eq('org_id', orgId)
    .limit(1)
    .single();

  // Create new contact
  const { data: newContact, error } = await supabase
    .from('contacts')
    .insert({
      org_id: orgId,
      owner_id: orgMember?.user_id,
      first_name: contact.first_name,
      last_name: contact.last_name,
      email: contact.email || null,
      phone: contact.phone || null,
      title: contact.title || null,
      linkedin_url: contact.linkedin_url || null,
      company: contact.organization_name || null,
      source: 'website_visitor',
    })
    .select('id')
    .single();

  if (error) {
    console.error('[visitor-enrich-contact] Contact creation error:', error);
    throw new Error('Failed to create contact');
  }

  return newContact.id;
}

async function createLeadFromVisitor(
  supabase: any,
  orgId: string,
  visitorId: string,
  contactId: string
): Promise<string | null> {
  // Get visitor details for lead metadata
  const { data: visitor } = await supabase
    .from('website_visitors')
    .select('page_url, page_title, visited_at, resolved_company_name')
    .eq('id', visitorId)
    .single();

  // Check for existing lead with this contact
  const { data: existingLead } = await supabase
    .from('leads')
    .select('id')
    .eq('org_id', orgId)
    .eq('contact_id', contactId)
    .maybeSingle();

  if (existingLead) {
    // Update last interaction
    await supabase
      .from('leads')
      .update({
        last_interaction_at: new Date().toISOString(),
        metadata: supabase.rpc ? undefined : {
          last_page_visited: visitor?.page_url,
          last_visit_at: visitor?.visited_at,
        },
      })
      .eq('id', existingLead.id);

    // Link visitor to existing lead
    await supabase
      .from('website_visitors')
      .update({ lead_id: existingLead.id })
      .eq('id', visitorId);

    return existingLead.id;
  }

  // Create new lead
  const { data: newLead, error } = await supabase
    .from('leads')
    .insert({
      org_id: orgId,
      contact_id: contactId,
      external_source: 'website_visitor',
      enrichment_status: 'enriched',
      enrichment_provider: 'apollo',
      company_name: visitor?.resolved_company_name || null,
      metadata: {
        pages_visited: [{ url: visitor?.page_url, title: visitor?.page_title, visited_at: visitor?.visited_at }],
        first_seen_at: visitor?.visited_at,
        total_visits: 1,
      },
    })
    .select('id')
    .single();

  if (error) {
    console.error('[visitor-enrich-contact] Lead creation error:', error);
    return null;
  }

  // Link visitor to new lead
  await supabase
    .from('website_visitors')
    .update({ lead_id: newLead.id })
    .eq('id', visitorId);

  return newLead.id;
}

async function notifySlack(
  supabaseUrl: string,
  serviceKey: string,
  orgId: string,
  visitorId: string
): Promise<void> {
  // Call Slack notification endpoint (non-blocking, best-effort)
  await fetch(`${supabaseUrl}/functions/v1/visitor-slack-notify`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${serviceKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ orgId, visitorId }),
  });
}
