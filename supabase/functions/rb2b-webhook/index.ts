// supabase/functions/rb2b-webhook/index.ts
// Receives RB2B person-level identification webhooks.
// Matches to existing website_visitors, creates/updates contact, creates lead.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.43.4';

serve(async (req) => {
  // CORS for webhook — accept from any origin
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Content-Type': 'application/json',
  };

  if (req.method === 'OPTIONS') {
    return new Response('ok', { status: 200, headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405, headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  try {
    // Token from query param
    const url = new URL(req.url);
    const token = url.searchParams.get('token');

    if (!token) {
      return new Response(JSON.stringify({ error: 'Missing token' }), { status: 400, headers: corsHeaders });
    }

    // Validate token
    const { data: config, error: configError } = await supabase
      .from('visitor_snippet_configs')
      .select('org_id, is_active, rb2b_enabled, auto_create_lead')
      .eq('snippet_token', token)
      .eq('is_active', true)
      .maybeSingle();

    if (configError || !config) {
      return new Response(JSON.stringify({ error: 'Invalid token' }), { status: 403, headers: corsHeaders });
    }

    if (!config.rb2b_enabled) {
      return new Response(JSON.stringify({ error: 'RB2B not enabled for this org' }), { status: 403, headers: corsHeaders });
    }

    const body = await req.json();

    // Parse RB2B webhook payload
    const rb2bData = {
      linkedin_url: body.linkedin_url || body.LinkedInUrl || null,
      first_name: body.first_name || body.FirstName || null,
      last_name: body.last_name || body.LastName || null,
      title: body.title || body.Title || null,
      company_name: body.company_name || body.CompanyName || null,
      business_email: body.business_email || body.BusinessEmail || body.email || null,
      website: body.website || body.Website || null,
      industry: body.industry || body.Industry || null,
      employee_count: body.employee_count || body.EmployeeCount || null,
      estimated_revenue: body.estimated_revenue || body.EstimatedRevenue || null,
      city: body.city || body.City || null,
      state: body.state || body.State || null,
      zipcode: body.zipcode || body.Zipcode || null,
      captured_url: body.captured_url || body.CapturedUrl || body.seen_at_url || null,
      referrer: body.referrer || body.Referrer || null,
      tags: body.tags || body.Tags || [],
      seen_at: body.seen_at || body.SeenAt || new Date().toISOString(),
      ip_address: body.ip_address || body.IpAddress || null,
    };

    const orgId = config.org_id;

    // Try to match to an existing website_visitors record (same IP within 5 min window)
    let visitorId: string | null = null;

    if (rb2bData.ip_address) {
      const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
      const { data: matchedVisitor } = await supabase
        .from('website_visitors')
        .select('id')
        .eq('org_id', orgId)
        .eq('visitor_ip', rb2bData.ip_address)
        .gte('visited_at', fiveMinAgo)
        .order('visited_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (matchedVisitor) {
        visitorId = matchedVisitor.id;
      }
    }

    // If no match found, create a new visitor record
    if (!visitorId) {
      const { data: newVisitor, error: insertErr } = await supabase
        .from('website_visitors')
        .insert({
          org_id: orgId,
          visitor_ip: rb2bData.ip_address || 'rb2b-webhook',
          page_url: rb2bData.captured_url,
          referrer: rb2bData.referrer,
          visited_at: rb2bData.seen_at,
          resolved_company_name: rb2bData.company_name,
          resolved_company_domain: rb2bData.website?.replace(/^https?:\/\//, '').replace(/\/$/, '') || null,
          resolution_provider: 'rb2b',
          resolution_status: 'resolved',
          rb2b_person_data: rb2bData,
          rb2b_identified: true,
          enrichment_status: 'pending',
        })
        .select('id')
        .single();

      if (insertErr) {
        console.error('[rb2b-webhook] Insert error:', insertErr);
        return new Response(JSON.stringify({ error: 'Failed to create visitor' }), { status: 500, headers: corsHeaders });
      }
      visitorId = newVisitor.id;
    } else {
      // Update existing visitor with RB2B data
      await supabase
        .from('website_visitors')
        .update({
          rb2b_person_data: rb2bData,
          rb2b_identified: true,
          resolved_company_name: rb2bData.company_name || undefined,
          resolved_company_domain: rb2bData.website?.replace(/^https?:\/\//, '').replace(/\/$/, '') || undefined,
          resolution_status: 'resolved',
          resolution_provider: 'rb2b',
        })
        .eq('id', visitorId);
    }

    // Create or match contact with RB2B data (higher confidence than Apollo)
    let contactId: string | null = null;

    if (rb2bData.business_email) {
      // Check existing contact by email
      const { data: existing } = await supabase
        .from('contacts')
        .select('id')
        .eq('org_id', orgId)
        .eq('email', rb2bData.business_email)
        .maybeSingle();

      if (existing) {
        contactId = existing.id;
        // Update with RB2B data (higher confidence)
        await supabase
          .from('contacts')
          .update({
            first_name: rb2bData.first_name || undefined,
            last_name: rb2bData.last_name || undefined,
            title: rb2bData.title || undefined,
            linkedin_url: rb2bData.linkedin_url || undefined,
            company: rb2bData.company_name || undefined,
          })
          .eq('id', contactId);
      }
    }

    if (!contactId && rb2bData.linkedin_url) {
      const { data: existing } = await supabase
        .from('contacts')
        .select('id')
        .eq('org_id', orgId)
        .eq('linkedin_url', rb2bData.linkedin_url)
        .maybeSingle();

      if (existing) contactId = existing.id;
    }

    if (!contactId && (rb2bData.business_email || rb2bData.first_name)) {
      // Get default owner
      const { data: orgMember } = await supabase
        .from('organization_members')
        .select('user_id')
        .eq('org_id', orgId)
        .limit(1)
        .single();

      const { data: newContact } = await supabase
        .from('contacts')
        .insert({
          org_id: orgId,
          owner_id: orgMember?.user_id,
          first_name: rb2bData.first_name,
          last_name: rb2bData.last_name,
          email: rb2bData.business_email || null,
          title: rb2bData.title || null,
          linkedin_url: rb2bData.linkedin_url || null,
          company: rb2bData.company_name || null,
          source: 'rb2b',
        })
        .select('id')
        .single();

      if (newContact) contactId = newContact.id;
    }

    // Update visitor with contact link
    if (contactId) {
      await supabase
        .from('website_visitors')
        .update({
          matched_contact_id: contactId,
          enrichment_status: 'enriched',
        })
        .eq('id', visitorId);
    }

    // Create lead if configured
    if (config.auto_create_lead && contactId) {
      const { data: existingLead } = await supabase
        .from('leads')
        .select('id')
        .eq('org_id', orgId)
        .eq('contact_id', contactId)
        .maybeSingle();

      if (existingLead) {
        await supabase
          .from('leads')
          .update({ last_interaction_at: new Date().toISOString() })
          .eq('id', existingLead.id);

        await supabase
          .from('website_visitors')
          .update({ lead_id: existingLead.id })
          .eq('id', visitorId);
      } else {
        const { data: newLead } = await supabase
          .from('leads')
          .insert({
            org_id: orgId,
            contact_id: contactId,
            external_source: 'rb2b',
            enrichment_status: 'enriched',
            enrichment_provider: 'rb2b',
            company_name: rb2bData.company_name || null,
            metadata: {
              pages_visited: [{ url: rb2bData.captured_url, visited_at: rb2bData.seen_at }],
              rb2b_identified: true,
              first_seen_at: rb2bData.seen_at,
            },
          })
          .select('id')
          .single();

        if (newLead) {
          await supabase
            .from('website_visitors')
            .update({ lead_id: newLead.id })
            .eq('id', visitorId);
        }
      }
    }

    // Trigger Slack notification (non-blocking)
    const supabaseUrlEnv = Deno.env.get('SUPABASE_URL')!;
    fetch(`${supabaseUrlEnv}/functions/v1/visitor-slack-notify`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${supabaseServiceKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ orgId, visitorId }),
    }).catch(err => console.error('[rb2b-webhook] Slack notify failed:', err));

    return new Response(JSON.stringify({ ok: true, visitorId, contactId }), { status: 200, headers: corsHeaders });
  } catch (error) {
    console.error('[rb2b-webhook] Error:', error);
    return new Response(JSON.stringify({ error: 'Internal server error' }), { status: 500, headers: corsHeaders });
  }
});
