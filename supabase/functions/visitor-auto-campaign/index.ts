// supabase/functions/visitor-auto-campaign/index.ts
// Auto-enrolls identified website visitors into outreach campaigns when they match ICP criteria.
// Implements HITL gate: first 10 enrollments require approval, then autonomous.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.43.4';
import { getCorsHeaders, handleCorsPreflightRequest, jsonResponse, errorResponse } from '../_shared/corsHelper.ts';

interface ICPCriteria {
  company_size_min?: number;
  company_size_max?: number;
  industries?: string[];
  title_keywords?: string[];
  seniority_levels?: string[];
}

interface AutoCampaignConfig {
  id: string;
  org_id: string;
  is_enabled: boolean;
  icp_criteria: ICPCriteria;
  campaign_provider: 'instantly' | 'heyreach';
  campaign_id: string;
  hitl_required: boolean;
  auto_enrolled_count: number;
  approved_count: number;
  daily_limit: number;
  daily_enrolled_today: number;
}

serve(async (req) => {
  const preflightResponse = handleCorsPreflightRequest(req);
  if (preflightResponse) return preflightResponse;

  if (req.method !== 'POST') return errorResponse('Method not allowed', req, 405);

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  try {
    const { visitorId, orgId } = await req.json();
    if (!visitorId || !orgId) return errorResponse('Missing visitorId or orgId', req);

    // Get visitor + contact data
    const { data: visitor } = await supabase
      .from('website_visitors')
      .select('id, matched_contact_id, resolved_company_data, resolved_company_name, resolution_status, enrichment_status')
      .eq('id', visitorId)
      .single();

    if (!visitor || visitor.resolution_status !== 'resolved' || !visitor.matched_contact_id) {
      return jsonResponse({ ok: true, skipped: 'not_resolved_or_no_contact' }, req);
    }

    // Get contact details for ICP matching
    const { data: contact } = await supabase
      .from('contacts')
      .select('id, title, company, email')
      .eq('id', visitor.matched_contact_id)
      .single();

    if (!contact?.email) {
      return jsonResponse({ ok: true, skipped: 'no_email' }, req);
    }

    // Get org's auto-campaign rules (stored in org settings or a dedicated table)
    // For now, use a simple check against visitor_snippet_configs metadata
    const companyData = visitor.resolved_company_data as Record<string, any> | null;
    const employeeCount = companyData?.employee_count || companyData?.size || 0;
    const industry = companyData?.industry || '';
    const contactTitle = contact.title || '';

    // Default ICP criteria (can be made configurable per org later)
    const icpMatch = matchesICP({
      employeeCount: typeof employeeCount === 'number' ? employeeCount : 0,
      industry,
      title: contactTitle,
    });

    if (!icpMatch) {
      return jsonResponse({ ok: true, skipped: 'icp_mismatch' }, req);
    }

    // Check daily limit (50 per org per day)
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const { count: todayCount } = await supabase
      .from('usage_events')
      .select('id', { count: 'exact', head: true })
      .eq('org_id', orgId)
      .eq('event_type', 'visitor_auto_campaign')
      .gte('created_at', todayStart.toISOString());

    if ((todayCount || 0) >= 50) {
      return jsonResponse({ ok: true, skipped: 'daily_limit_reached' }, req);
    }

    // HITL gate: check if first 10 auto-enrollments need approval
    const { count: totalAutoEnrolled } = await supabase
      .from('usage_events')
      .select('id', { count: 'exact', head: true })
      .eq('org_id', orgId)
      .eq('event_type', 'visitor_auto_campaign')
      .eq('event_subtype', 'enrolled');

    const needsApproval = (totalAutoEnrolled || 0) < 10;

    if (needsApproval) {
      // Queue for approval in crm_approval_queue
      await supabase
        .from('crm_approval_queue')
        .insert({
          org_id: orgId,
          action_type: 'campaign_enrollment',
          status: 'pending_approval',
          content: JSON.stringify({
            contact_name: contact.title ? `${contact.company} - ${contact.title}` : contact.company,
            contact_email: contact.email,
            company: visitor.resolved_company_name,
            visitor_id: visitorId,
          }),
          metadata: {
            visitor_id: visitorId,
            contact_id: visitor.matched_contact_id,
            icp_match: true,
          },
        });

      // Log usage event
      await supabase.from('usage_events').insert({
        org_id: orgId,
        event_type: 'visitor_auto_campaign',
        event_subtype: 'queued_approval',
        quantity: 1,
        metadata: { visitor_id: visitorId, contact_id: visitor.matched_contact_id },
      });

      return jsonResponse({ ok: true, action: 'queued_for_approval' }, req);
    }

    // Auto-enroll: push to Instantly campaign
    try {
      await fetch(`${supabaseUrl}/functions/v1/push-to-instantly`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${supabaseServiceKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          org_id: orgId,
          contacts: [{
            email: contact.email,
            first_name: contact.company, // Will be enriched by Instantly
            custom_variables: {
              source: 'website_visitor',
              company: visitor.resolved_company_name,
              visitor_page: visitor.resolved_company_name,
            },
          }],
        }),
      });
    } catch (pushErr) {
      console.error('[visitor-auto-campaign] Instantly push failed:', pushErr);
      return jsonResponse({ ok: true, skipped: 'push_failed' }, req);
    }

    // Log usage event
    await supabase.from('usage_events').insert({
      org_id: orgId,
      event_type: 'visitor_auto_campaign',
      event_subtype: 'enrolled',
      quantity: 1,
      metadata: { visitor_id: visitorId, contact_id: visitor.matched_contact_id },
    });

    return jsonResponse({ ok: true, action: 'auto_enrolled' }, req);
  } catch (error) {
    console.error('[visitor-auto-campaign] Error:', error);
    return errorResponse(error.message || 'Internal error', req, 500);
  }
});

/**
 * Simple ICP matching. Returns true if the visitor matches basic ICP criteria.
 * Can be extended with org-specific criteria later.
 */
function matchesICP(data: {
  employeeCount: number;
  industry: string;
  title: string;
}): boolean {
  // Skip very small companies (likely personal/freelancer)
  if (data.employeeCount > 0 && data.employeeCount < 5) return false;

  // Match on seniority (title contains senior keywords)
  const seniorKeywords = ['vp', 'vice president', 'director', 'head of', 'chief', 'ceo', 'cto', 'cfo', 'coo', 'founder', 'owner', 'partner', 'president', 'svp', 'evp', 'managing'];
  const titleLower = data.title.toLowerCase();
  const hasSeniorTitle = seniorKeywords.some(kw => titleLower.includes(kw));

  // If we have a title and it's not senior, skip
  if (data.title && !hasSeniorTitle) return false;

  return true;
}
