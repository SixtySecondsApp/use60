/**
 * sandbox-lead-alert
 *
 * Webhook-triggered function that sends rich Block Kit Slack alerts when a
 * sandbox visitor reaches an engagement score threshold. Called from a
 * Supabase database trigger on campaign_visitors updates.
 *
 * LDI-002: Rich Block Kit alerts with score badge, source tag, action buttons.
 *          Threshold lowered from 60 to 40 (High tier).
 * LDI-005: Auto-create contact + deal in 60 app when score hits Hot (51+)
 *          and visitor has a signup_email. Deduplicates by email.
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.43.4';
import { getCorsHeaders, handleCorsPreflightRequest, jsonResponse, errorResponse } from '../_shared/corsHelper.ts';

interface WebhookPayload {
  type: 'UPDATE';
  table: 'campaign_visitors';
  record: {
    id: string;
    campaign_link_id: string;
    session_id: string;
    sandbox_interactions: number;
    time_spent_seconds: number;
    views_navigated: string[];
    engagement_score: number;
    signup_email: string | null;
    feature_interests: string[];
    created_at: string;
    updated_at: string;
  };
  old_record: {
    engagement_score: number;
  };
}

// Score tiers
const THRESHOLD_HIGH = 40;
const THRESHOLD_HOT = 51;

function getScoreTier(score: number): { label: string; color: string } {
  if (score >= 80) return { label: 'Very Hot', color: '#e01e5a' };
  if (score >= THRESHOLD_HOT) return { label: 'Hot', color: '#ff6b00' };
  return { label: 'High', color: '#f2c744' };
}

function formatTimeSpent(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  if (mins === 0) return `${secs}s`;
  return `${mins}m ${secs}s`;
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return handleCorsPreflightRequest(req);
  }

  try {
    const payload: WebhookPayload = await req.json();
    const visitor = payload.record;

    // Only alert on score crossing the High threshold (40)
    const oldScore = payload.old_record?.engagement_score ?? 0;
    if (visitor.engagement_score < THRESHOLD_HIGH || oldScore >= THRESHOLD_HIGH) {
      return jsonResponse({ skipped: true, reason: 'Score below threshold or already alerted' }, req);
    }

    // Admin client for all DB operations (service role)
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    // Look up campaign link details
    const { data: link } = await supabase
      .from('campaign_links')
      .select('code, visitor_first_name, visitor_last_name, visitor_company, visitor_email, visitor_title, campaign_name, campaign_source, created_by')
      .eq('id', visitor.campaign_link_id)
      .maybeSingle();

    if (!link) {
      return jsonResponse({ skipped: true, reason: 'Campaign link not found' }, req);
    }

    // --- LDI-002: Rich Block Kit Slack Alert ---

    const slackWebhookUrl = Deno.env.get('SANDBOX_SLACK_WEBHOOK_URL');
    if (!slackWebhookUrl) {
      console.warn('[sandbox-lead-alert] No SANDBOX_SLACK_WEBHOOK_URL configured');
      return jsonResponse({ skipped: true, reason: 'No Slack webhook configured' }, req);
    }

    const visitorName = [link.visitor_first_name, link.visitor_last_name].filter(Boolean).join(' ') || 'Unknown';
    const tier = getScoreTier(visitor.engagement_score);
    const timeFormatted = formatTimeSpent(visitor.time_spent_seconds);
    const viewsNavigated = visitor.views_navigated || [];
    const totalPanels = 5; // sandbox has 5 demo panels
    const panelsViewed = viewsNavigated.length;
    const featureInterests = (visitor.feature_interests || []).join(', ') || 'None tracked';
    const sourceTag = link.campaign_source
      ? `${link.campaign_source}${link.code ? ' /t/' : ''}`
      : 'Direct';
    const campaignContext = link.campaign_name
      ? `Campaign: *${link.campaign_name}*`
      : '';

    const contactEmail = visitor.signup_email || link.visitor_email || '';

    const slackMessage = {
      blocks: [
        {
          type: 'header',
          text: {
            type: 'plain_text',
            text: `${tier.label} Lead - ${visitorName} from ${link.visitor_company}`,
            emoji: true,
          },
        },
        {
          type: 'section',
          fields: [
            { type: 'mrkdwn', text: `*Score:* ${visitor.engagement_score} (${tier.label})` },
            { type: 'mrkdwn', text: `*Source:* ${sourceTag}` },
            { type: 'mrkdwn', text: `*Time on site:* ${timeFormatted}` },
            { type: 'mrkdwn', text: `*Demo:* ${panelsViewed}/${totalPanels} panels viewed` },
          ],
        },
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `*Top interests:* ${featureInterests}`,
          },
        },
        {
          type: 'section',
          fields: [
            { type: 'mrkdwn', text: `*Email:* ${contactEmail || 'Not provided'}` },
            { type: 'mrkdwn', text: `*Title:* ${link.visitor_title || 'Unknown'}` },
          ],
        },
        ...(campaignContext
          ? [
              {
                type: 'context',
                elements: [
                  {
                    type: 'mrkdwn',
                    text: `${campaignContext} | Link: \`/t/${link.code}\``,
                  },
                ],
              },
            ]
          : []),
        {
          type: 'actions',
          elements: [
            {
              type: 'button',
              text: { type: 'plain_text', text: 'View in 60', emoji: true },
              url: `https://app.use60.com/contacts?search=${encodeURIComponent(contactEmail || link.visitor_company)}`,
              style: 'primary',
            },
            {
              type: 'button',
              text: { type: 'plain_text', text: 'Send follow-up', emoji: true },
              url: `https://app.use60.com/copilot?prompt=${encodeURIComponent(`follow-up ${link.visitor_company}`)}`,
            },
            {
              type: 'button',
              text: { type: 'plain_text', text: 'Assign to rep', emoji: true },
              url: `https://app.use60.com/contacts?search=${encodeURIComponent(contactEmail || link.visitor_company)}&action=assign`,
            },
          ],
        },
      ],
    };

    const slackRes = await fetch(slackWebhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(slackMessage),
    });

    if (!slackRes.ok) {
      console.error('[sandbox-lead-alert] Slack error:', await slackRes.text());
    }

    // --- LDI-005: Auto-create contact + deal for Hot (51+) visitors with email ---

    let leadCreated = false;

    if (visitor.engagement_score >= THRESHOLD_HOT && visitor.signup_email) {
      try {
        // Deduplication: check if contact already exists by email
        const { data: existingContact } = await supabase
          .from('contacts')
          .select('id, email')
          .eq('email', visitor.signup_email)
          .maybeSingle();

        if (!existingContact) {
          const ownerId = link.created_by;

          if (ownerId) {
            // Create contact
            const { data: newContact, error: contactError } = await supabase
              .from('contacts')
              .insert({
                email: visitor.signup_email,
                first_name: link.visitor_first_name || null,
                last_name: link.visitor_last_name || null,
                company: link.visitor_company,
                title: link.visitor_title || null,
                owner_id: ownerId,
                source: 'campaign',
              })
              .select('id')
              .single();

            if (contactError) {
              console.error('[sandbox-lead-alert] Contact insert error:', contactError.message);
            } else {
              console.log('[sandbox-lead-alert] Created contact:', newContact.id);

              // Look up the Lead stage
              const { data: leadStage } = await supabase
                .from('deal_stages')
                .select('id')
                .eq('name', 'Lead')
                .maybeSingle();

              if (leadStage) {
                // Create deal
                const dealName = `${link.visitor_company} - Campaign Lead`;
                const { data: newDeal, error: dealError } = await supabase
                  .from('deals')
                  .insert({
                    name: dealName,
                    company: link.visitor_company,
                    contact_name: visitorName !== 'Unknown' ? visitorName : null,
                    contact_email: visitor.signup_email,
                    value: 0,
                    stage_id: leadStage.id,
                    owner_id: ownerId,
                    primary_contact_id: newContact.id,
                    lead_source_type: 'inbound',
                    lead_source_channel: 'campaign',
                    status: 'active',
                  })
                  .select('id')
                  .single();

                if (dealError) {
                  console.error('[sandbox-lead-alert] Deal insert error:', dealError.message);
                } else {
                  console.log('[sandbox-lead-alert] Created deal:', newDeal.id);

                  // Log activity
                  const { error: activityError } = await supabase
                    .from('activities')
                    .insert({
                      user_id: ownerId,
                      type: 'outbound',
                      status: 'completed',
                      priority: 'medium',
                      client_name: link.visitor_company,
                      sales_rep: 'System',
                      subject: 'Lead from sandbox campaign',
                      details: `Auto-created from campaign visitor. Score: ${visitor.engagement_score}. Source: ${link.campaign_source || 'direct'}. Campaign: ${link.campaign_name || 'N/A'}.`,
                      deal_id: newDeal.id,
                      contact_id: newContact.id,
                      contact_identifier: visitor.signup_email,
                      contact_identifier_type: 'email',
                    });

                  if (activityError) {
                    console.error('[sandbox-lead-alert] Activity insert error:', activityError.message);
                  }
                }
              } else {
                console.warn('[sandbox-lead-alert] No "Lead" stage found in deal_stages');
              }

              leadCreated = true;
            }
          } else {
            console.warn('[sandbox-lead-alert] No created_by on campaign link, skipping lead creation');
          }
        } else {
          console.log('[sandbox-lead-alert] Contact already exists:', existingContact.email);
        }
      } catch (leadErr) {
        console.error('[sandbox-lead-alert] Lead creation error:', leadErr);
      }
    }

    return jsonResponse({
      success: true,
      alerted: true,
      score: visitor.engagement_score,
      tier: tier.label,
      lead_created: leadCreated,
    }, req);
  } catch (err) {
    console.error('[sandbox-lead-alert] Error:', err);
    return errorResponse(
      err instanceof Error ? err.message : 'Internal error',
      500,
      req
    );
  }
});
