// supabase/functions/visitor-slack-notify/index.ts
// Sends Slack DM when a website visitor is identified.
// Called internally by visitor-enrich-contact and rb2b-webhook.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.43.4';
import { getCorsHeaders, handleCorsPreflightRequest, jsonResponse, errorResponse } from '../_shared/corsHelper.ts';

// Simple throttle: track notification counts per org per hour
const throttleMap = new Map<string, { count: number; windowStart: number }>();
const MAX_PER_ORG_PER_HOUR = 10;

function isThrottled(orgId: string): boolean {
  const now = Date.now();
  const entry = throttleMap.get(orgId);
  if (!entry || now - entry.windowStart > 60 * 60 * 1000) {
    throttleMap.set(orgId, { count: 1, windowStart: now });
    return false;
  }
  entry.count++;
  return entry.count > MAX_PER_ORG_PER_HOUR;
}

serve(async (req) => {
  const preflightResponse = handleCorsPreflightRequest(req);
  if (preflightResponse) return preflightResponse;

  if (req.method !== 'POST') return errorResponse('Method not allowed', req, 405);

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  try {
    const { orgId, visitorId } = await req.json();
    if (!orgId || !visitorId) return errorResponse('Missing orgId or visitorId', req);

    // Throttle check
    if (isThrottled(orgId)) {
      return jsonResponse({ ok: true, throttled: true }, req);
    }

    // Get Slack integration for this org
    const { data: slackIntegration } = await supabase
      .from('slack_integrations')
      .select('bot_token, channel_id')
      .eq('org_id', orgId)
      .eq('is_active', true)
      .maybeSingle();

    if (!slackIntegration?.bot_token) {
      return jsonResponse({ ok: true, skipped: 'no_slack' }, req);
    }

    // Get visitor details
    const { data: visitor } = await supabase
      .from('website_visitors')
      .select('resolved_company_name, resolved_company_domain, page_url, page_title, visited_at, rb2b_identified, rb2b_person_data, matched_contact_id, resolution_provider')
      .eq('id', visitorId)
      .single();

    if (!visitor) return errorResponse('Visitor not found', req, 404);

    // Get matched contact details
    let contactName = 'Unknown';
    let contactTitle = '';
    let contactEmail = '';

    if (visitor.matched_contact_id) {
      const { data: contact } = await supabase
        .from('contacts')
        .select('first_name, last_name, title, email, owner_id')
        .eq('id', visitor.matched_contact_id)
        .single();

      if (contact) {
        contactName = `${contact.first_name || ''} ${contact.last_name || ''}`.trim() || 'Unknown';
        contactTitle = contact.title || '';
        contactEmail = contact.email || '';
      }
    }

    // Determine confidence level
    const confidence = visitor.rb2b_identified ? 'Person confirmed (RB2B)' : 'Best-fit match (Apollo)';
    const confidenceEmoji = visitor.rb2b_identified ? ':bust_in_silhouette:' : ':office:';

    // Build Slack Block Kit message
    const blocks = [
      {
        type: 'header',
        text: { type: 'plain_text', text: `${visitor.resolved_company_name || 'Unknown Company'} visited your site`, emoji: true },
      },
      {
        type: 'section',
        fields: [
          { type: 'mrkdwn', text: `*Contact:*\n${contactName}` },
          { type: 'mrkdwn', text: `*Title:*\n${contactTitle || 'N/A'}` },
          { type: 'mrkdwn', text: `*Page:*\n${visitor.page_title || visitor.page_url || 'N/A'}` },
          { type: 'mrkdwn', text: `*Confidence:*\n${confidenceEmoji} ${confidence}` },
        ],
      },
    ];

    if (visitor.page_url) {
      blocks.push({
        type: 'context',
        elements: [{ type: 'mrkdwn', text: `Visited: <${visitor.page_url}|${visitor.page_title || visitor.page_url}> at ${new Date(visitor.visited_at).toLocaleTimeString()}` }],
      } as any);
    }

    blocks.push({
      type: 'actions',
      elements: [
        {
          type: 'button',
          text: { type: 'plain_text', text: 'View Contact', emoji: true },
          action_id: 'visitor_view_contact',
          value: JSON.stringify({ contactId: visitor.matched_contact_id, visitorId }),
        },
        {
          type: 'button',
          text: { type: 'plain_text', text: 'Draft Outreach', emoji: true },
          action_id: 'visitor_draft_outreach',
          value: JSON.stringify({ visitorId, orgId }),
          style: 'primary',
        },
        {
          type: 'button',
          text: { type: 'plain_text', text: 'Dismiss', emoji: true },
          action_id: 'visitor_dismiss',
          value: JSON.stringify({ visitorId }),
        },
      ],
    } as any);

    // Find the right user to DM (contact owner or first org member)
    let targetUserId: string | null = null;

    if (visitor.matched_contact_id) {
      const { data: contact } = await supabase
        .from('contacts')
        .select('owner_id')
        .eq('id', visitor.matched_contact_id)
        .single();
      targetUserId = contact?.owner_id || null;
    }

    if (!targetUserId) {
      const { data: member } = await supabase
        .from('organization_members')
        .select('user_id')
        .eq('org_id', orgId)
        .limit(1)
        .single();
      targetUserId = member?.user_id || null;
    }

    if (!targetUserId) {
      return jsonResponse({ ok: true, skipped: 'no_target_user' }, req);
    }

    // Get Slack user ID for this user
    const { data: slackUser } = await supabase
      .from('slack_integrations')
      .select('slack_user_id')
      .eq('user_id', targetUserId)
      .maybeSingle();

    if (!slackUser?.slack_user_id) {
      return jsonResponse({ ok: true, skipped: 'no_slack_user' }, req);
    }

    // Send Slack DM
    const slackResp = await fetch('https://slack.com/api/chat.postMessage', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${slackIntegration.bot_token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        channel: slackUser.slack_user_id,
        text: `${visitor.resolved_company_name || 'A company'} visited your website`,
        blocks,
      }),
    });

    const slackResult = await slackResp.json();
    if (!slackResult.ok) {
      console.warn('[visitor-slack-notify] Slack API error:', slackResult.error);
    }

    return jsonResponse({ ok: true, sent: slackResult.ok }, req);
  } catch (error) {
    console.error('[visitor-slack-notify] Error:', error);
    return errorResponse(error.message || 'Internal error', req, 500);
  }
});
