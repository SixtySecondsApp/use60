/**
 * Critical Meeting Team Alert Edge Function
 *
 * Detects critical meetings from analysis results and delivers alerts to:
 * 1. Configured Slack channel (team visibility)
 * 2. Individual DMs for configured recipients (role-gated)
 * 3. Email draft for HITL approval
 * 4. In-app notifications
 * 5. Command Centre items
 *
 * Called by the post-meeting pipeline when risk flags or negative sentiment are detected.
 *
 * Stories: US-006, US-007, US-008, US-010, US-012
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.43.4';
import { getCorsHeaders, handleCorsPreflightRequest } from '../_shared/corsHelper.ts';
import {
  buildCriticalMeetingAlert,
  type CriticalMeetingAlertData,
} from '../_shared/slackBlocks.ts';
import {
  isCriticalMeeting,
  loadOrgThresholds,
  type RiskFlag,
  type Commitment,
} from '../_shared/criticalMeetingDetection.ts';
import { postToChannel } from '../_shared/slackAuth.ts';
import { sendSlackDM } from '../_shared/proactive/deliverySlack.ts';
import {
  shouldSendNotification,
  recordNotificationSent,
} from '../_shared/proactive/dedupe.ts';
import { sendEmail } from '../_shared/ses.ts';

const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const appUrl = Deno.env.get('APP_URL') || Deno.env.get('SITE_URL') || 'https://use60.com';

interface AlertRequest {
  meetingId: string;
  orgId: string;
  // Pre-computed analysis (from slack-post-meeting pipeline)
  analysis?: {
    summary: string;
    sentiment: string;
    sentimentScore: number;
    riskFlags: RiskFlag[];
    commitments: Commitment[];
    actionItems: Array<{ task: string; suggestedOwner?: string; dueInDays: number }>;
    coachingInsight: string;
    keyQuotes: string[];
    coachRating?: number;
  };
}

serve(async (req: Request) => {
  const corsHeaders = getCorsHeaders(req);

  if (req.method === 'OPTIONS') {
    return handleCorsPreflightRequest(req);
  }

  try {
    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { persistSession: false },
    });

    const body: AlertRequest = await req.json();
    const { meetingId, orgId, analysis } = body;

    if (!meetingId || !orgId) {
      return new Response(
        JSON.stringify({ success: false, error: 'meetingId and orgId required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    console.log(`[critical-meeting-alert] Processing meeting ${meetingId} for org ${orgId}`);

    // Load meeting data
    const { data: meeting, error: meetingErr } = await supabase
      .from('meetings')
      .select(`
        id, title, duration_minutes, owner_user_id, company_id, org_id,
        risk_flags, sentiment_score, sentiment_reasoning,
        meeting_attendees (name, email, is_external)
      `)
      .eq('id', meetingId)
      .single();

    if (meetingErr || !meeting) {
      return new Response(
        JSON.stringify({ success: false, error: 'Meeting not found' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    // Use pre-computed analysis or fall back to stored data
    const riskFlags: RiskFlag[] = analysis?.riskFlags || (meeting.risk_flags as RiskFlag[]) || [];
    const sentimentScore = analysis?.sentimentScore ?? ((meeting.sentiment_score ?? 0) * 50 + 50); // -1..1 to 0..100
    const summary = analysis?.summary || meeting.sentiment_reasoning || '';
    const commitments: Commitment[] = analysis?.commitments || [];
    const actionItems = analysis?.actionItems || [];

    // Load org thresholds and check if critical
    const thresholds = await loadOrgThresholds(supabase, orgId);
    const detection = isCriticalMeeting(
      { sentimentScore, riskFlags, coachRating: analysis?.coachRating },
      thresholds,
    );

    if (!detection.isCritical) {
      console.log(`[critical-meeting-alert] Meeting ${meetingId} not critical (severity: ${detection.severity})`);
      return new Response(
        JSON.stringify({ success: true, critical: false, severity: detection.severity }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    console.log(`[critical-meeting-alert] Meeting ${meetingId} is ${detection.severity}. Reasons: ${detection.reasons.join(', ')}`);

    // Check dedup — use a system-level recipient for channel alerts
    const channelDedupeId = `channel_${orgId}`;
    const canSend = await shouldSendNotification(supabase, 'critical_meeting_alert', orgId, channelDedupeId, meetingId);
    if (!canSend) {
      console.log(`[critical-meeting-alert] Deduplicated — already sent for meeting ${meetingId}`);
      return new Response(
        JSON.stringify({ success: true, critical: true, deduplicated: true }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    // Resolve meeting context
    const attendees: string[] = Array.isArray(meeting.meeting_attendees)
      ? (meeting.meeting_attendees as any[]).map((a: any) => a?.name || a?.email || 'Unknown').filter(Boolean)
      : [];

    // Look up related deal
    let dealName: string | undefined;
    let dealId: string | undefined;
    let dealStage: string | undefined;
    let companyName: string | undefined;

    if (meeting.company_id) {
      const { data: company } = await supabase
        .from('companies')
        .select('name')
        .eq('id', meeting.company_id)
        .maybeSingle();
      companyName = (company as any)?.name;

      if (companyName) {
        const { data: deals } = await supabase
          .from('deals')
          .select('id, name, stage_id')
          .ilike('company', `%${companyName}%`)
          .order('updated_at', { ascending: false })
          .limit(1);
        const d = (deals as any[])?.[0];
        if (d) {
          dealId = d.id;
          dealName = d.name;
          dealStage = d.stage_id;
        }
      }
    }

    // Build alert data
    const alertData: CriticalMeetingAlertData = {
      meetingId,
      meetingTitle: meeting.title || 'Untitled Meeting',
      attendees,
      duration: meeting.duration_minutes || 0,
      dealName,
      dealId,
      dealStage,
      companyName,
      summary,
      sentimentScore,
      riskFlags,
      actionItems,
      commitments,
      severity: detection.severity as 'critical' | 'high' | 'medium',
      reasons: detection.reasons,
      appUrl,
    };

    // =========================================================================
    // 1. Slack Channel Delivery (US-006)
    // =========================================================================
    let channelResult: { ok: boolean; ts?: string; error?: string } | null = null;

    // Get Slack config
    const { data: slackOrgSettings } = await supabase
      .from('slack_org_settings')
      .select('bot_access_token, slack_team_id')
      .eq('org_id', orgId)
      .eq('is_connected', true)
      .maybeSingle();

    const botToken = slackOrgSettings?.bot_access_token;

    if (botToken) {
      // Get configured channel for critical alerts
      const { data: alertSettings } = await supabase
        .from('slack_notification_settings')
        .select('channel_id, is_enabled, metadata')
        .eq('org_id', orgId)
        .eq('feature', 'critical_meeting_alert')
        .maybeSingle();

      const channelId = alertSettings?.channel_id;

      if (channelId && alertSettings?.is_enabled !== false) {
        // Post full-detail alert to channel (admins see the channel)
        const fullAlert = buildCriticalMeetingAlert({ ...alertData, detailLevel: 'full' });
        channelResult = await postToChannel(botToken, channelId, fullAlert);

        if (!channelResult.ok && channelResult.error === 'not_in_channel') {
          // Try to join the channel first
          await fetch('https://slack.com/api/conversations.join', {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${botToken}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ channel: channelId }),
          });
          channelResult = await postToChannel(botToken, channelId, fullAlert);
        }

        if (channelResult.ok) {
          console.log(`[critical-meeting-alert] Posted to channel ${channelId}`);
        } else {
          console.warn(`[critical-meeting-alert] Channel post failed: ${channelResult.error}`);
        }
      }

      // =========================================================================
      // 2. DM Fan-out to recipients (US-008 role-gated)
      // =========================================================================
      const alertConfig = alertSettings?.metadata as any;
      const recipientRoles = alertConfig?.recipientRoles || ['owner', 'admin'];

      // Get org members matching role filter
      const { data: orgMembers } = await supabase
        .from('organization_memberships')
        .select('user_id, role')
        .eq('org_id', orgId)
        .eq('member_status', 'active')
        .in('role', recipientRoles);

      if (orgMembers && orgMembers.length > 0) {
        for (const member of orgMembers) {
          // Get Slack user ID
          const { data: mapping } = await supabase
            .from('slack_user_mappings')
            .select('slack_user_id')
            .eq('org_id', orgId)
            .eq('sixty_user_id', member.user_id)
            .maybeSingle();

          if (mapping?.slack_user_id) {
            // Role-based detail level
            const detailLevel = (member.role === 'owner' || member.role === 'admin') ? 'full' : 'summary';
            const memberAlert = buildCriticalMeetingAlert({ ...alertData, detailLevel });

            const dmResult = await sendSlackDM({
              botToken,
              slackUserId: mapping.slack_user_id,
              blocks: memberAlert.blocks,
              text: memberAlert.text,
            });

            if (dmResult.success) {
              console.log(`[critical-meeting-alert] DM sent to ${member.user_id} (${detailLevel})`);
            }
          }
        }
      }

      // =========================================================================
      // 3. HITL Email Draft (US-007)
      // =========================================================================
      if (meeting.owner_user_id) {
        const ownerSlackMapping = await supabase
          .from('slack_user_mappings')
          .select('slack_user_id')
          .eq('org_id', orgId)
          .eq('sixty_user_id', meeting.owner_user_id)
          .maybeSingle();

        if (ownerSlackMapping?.data?.slack_user_id) {
          // Get rep's email for Reply-To
          const { data: repProfile } = await supabase
            .from('profiles')
            .select('email, full_name, first_name')
            .eq('id', meeting.owner_user_id)
            .maybeSingle();

          // Get email recipients from config
          const emailRecipients: string[] = [];
          if (alertConfig?.emailRecipients && Array.isArray(alertConfig.emailRecipients)) {
            emailRecipients.push(...alertConfig.emailRecipients);
          } else if (orgMembers) {
            // Default: email all admins/owners
            for (const m of orgMembers.filter((om: any) => om.role === 'owner' || om.role === 'admin')) {
              const { data: profile } = await supabase
                .from('profiles')
                .select('email')
                .eq('id', m.user_id)
                .maybeSingle();
              if (profile?.email) emailRecipients.push(profile.email);
            }
          }

          if (emailRecipients.length > 0) {
            // Build email content
            const riskFlagsSummary = riskFlags
              .map((f) => `• ${f.flag.replace(/_/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase())}: ${f.evidence}`)
              .join('\n');

            const commitmentsSummary = commitments
              .map((c) => `• ${c.description}${c.suggestedOwner ? ` (${c.suggestedOwner})` : ''}${c.suggestedDueDate ? ` — by ${c.suggestedDueDate}` : ''}`)
              .join('\n');

            const actionItemsSummary = actionItems
              .map((a) => `• ${a.task}${a.suggestedOwner ? ` (${a.suggestedOwner})` : ''}`)
              .join('\n');

            const emailSubject = `${detection.severity === 'critical' ? '🔴 CRITICAL' : '🟠 HIGH RISK'}: ${meeting.title || 'Meeting Alert'}`;

            const emailHtml = `
<div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="background: ${detection.severity === 'critical' ? '#fee2e2' : '#ffedd5'}; border-left: 4px solid ${detection.severity === 'critical' ? '#dc2626' : '#ea580c'}; padding: 16px; border-radius: 4px; margin-bottom: 20px;">
    <h2 style="margin: 0 0 8px 0; color: ${detection.severity === 'critical' ? '#dc2626' : '#ea580c'};">
      ${detection.severity.toUpperCase()} ALERT — ${meeting.title || 'Meeting'}
    </h2>
    <p style="margin: 0; color: #374151;">${summary}</p>
  </div>

  <div style="margin-bottom: 16px;">
    <strong>Attendees:</strong> ${attendees.join(', ') || 'N/A'}<br/>
    <strong>Duration:</strong> ${meeting.duration_minutes || 0} minutes<br/>
    ${companyName ? `<strong>Company:</strong> ${companyName}<br/>` : ''}
    ${dealName ? `<strong>Deal:</strong> ${dealName}${dealStage ? ` (${dealStage})` : ''}<br/>` : ''}
    <strong>Sentiment:</strong> ${sentimentScore}/100
  </div>

  ${riskFlags.length > 0 ? `
  <div style="margin-bottom: 16px;">
    <h3 style="margin: 0 0 8px 0;">Risk Signals</h3>
    <div style="white-space: pre-wrap;">${riskFlagsSummary}</div>
  </div>` : ''}

  ${commitments.length > 0 ? `
  <div style="margin-bottom: 16px;">
    <h3 style="margin: 0 0 8px 0;">Commitments Made</h3>
    <div style="white-space: pre-wrap;">${commitmentsSummary}</div>
  </div>` : ''}

  ${actionItems.length > 0 ? `
  <div style="margin-bottom: 16px;">
    <h3 style="margin: 0 0 8px 0;">Action Items</h3>
    <div style="white-space: pre-wrap;">${actionItemsSummary}</div>
  </div>` : ''}

  <div style="margin-top: 20px; padding-top: 16px; border-top: 1px solid #e5e7eb;">
    <a href="${appUrl}/meetings?id=${meetingId}" style="display: inline-block; background: #2563eb; color: white; padding: 10px 20px; border-radius: 6px; text-decoration: none; margin-right: 8px;">View Meeting</a>
    ${dealId ? `<a href="${appUrl}/deals?id=${dealId}" style="display: inline-block; background: #374151; color: white; padding: 10px 20px; border-radius: 6px; text-decoration: none;">View Deal</a>` : ''}
  </div>

  <p style="margin-top: 20px; font-size: 12px; color: #9ca3af;">
    Sent by 60 Critical Meeting Alerts. Detection reasons: ${detection.reasons.join(' | ')}
  </p>
</div>`;

            // Present as HITL approval to the meeting owner via Slack
            const hitlBlocks = [
              {
                type: 'section',
                text: {
                  type: 'mrkdwn',
                  text: `*Email Draft Ready*\nA team notification email has been prepared for ${emailRecipients.length} recipient(s) about the critical meeting "${meeting.title}".`,
                },
              },
              {
                type: 'context',
                elements: [{
                  type: 'mrkdwn',
                  text: `To: ${emailRecipients.join(', ')}`,
                }],
              },
              {
                type: 'actions',
                elements: [
                  {
                    type: 'button',
                    text: { type: 'plain_text', text: 'Approve & Send', emoji: true },
                    style: 'primary',
                    action_id: `critical_email_approve_${meetingId}`,
                    value: JSON.stringify({
                      meetingId,
                      to: emailRecipients,
                      subject: emailSubject,
                      replyTo: repProfile?.email,
                    }).substring(0, 2000),
                  },
                  {
                    type: 'button',
                    text: { type: 'plain_text', text: 'Dismiss', emoji: true },
                    action_id: `critical_email_dismiss_${meetingId}`,
                  },
                ],
              },
            ];

            await sendSlackDM({
              botToken,
              slackUserId: ownerSlackMapping.data.slack_user_id,
              blocks: hitlBlocks,
              text: `Email draft ready for critical meeting: ${meeting.title}`,
            });

            // Store the email draft for later sending on approval
            await supabase
              .from('command_centre_items')
              .insert({
                org_id: orgId,
                user_id: meeting.owner_user_id,
                type: 'critical_meeting_email_draft',
                title: emailSubject,
                description: `Email draft for ${emailRecipients.length} recipients`,
                urgency: 'high',
                status: 'pending_approval',
                metadata: {
                  meetingId,
                  to: emailRecipients,
                  subject: emailSubject,
                  html: emailHtml,
                  replyTo: repProfile?.email,
                },
              });
          }
        }
      }
    }

    // =========================================================================
    // 4. Create tasks for commitments (US-010)
    // =========================================================================
    if (commitments.length > 0) {
      for (const commitment of commitments) {
        // Resolve owner
        let assignedTo = meeting.owner_user_id;
        if (commitment.suggestedOwner) {
          // Try to find user by name
          const { data: userMatch } = await supabase
            .from('profiles')
            .select('id')
            .or(`full_name.ilike.%${commitment.suggestedOwner}%,first_name.ilike.%${commitment.suggestedOwner}%`)
            .limit(1)
            .maybeSingle();
          if (userMatch?.id) assignedTo = userMatch.id;
        }

        const dueDate = commitment.suggestedDueDate
          ? new Date(commitment.suggestedDueDate)
          : new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // Default: 7 days

        await supabase.from('tasks').insert({
          title: commitment.description,
          description: `Commitment from critical meeting: ${meeting.title}`,
          assigned_to: assignedTo,
          owner_id: meeting.owner_user_id,
          created_by: meeting.owner_user_id,
          org_id: orgId,
          status: 'pending',
          priority: 'high',
          due_date: dueDate.toISOString(),
          source: 'critical_meeting_alert',
          metadata: {
            meeting_id: meetingId,
            commitment: commitment,
          },
        });
      }

      console.log(`[critical-meeting-alert] Created ${commitments.length} commitment tasks`);
    }

    // =========================================================================
    // 5. In-app notifications (US-006)
    // =========================================================================
    try {
      await supabase.rpc('notify_org_members', {
        p_org_id: orgId,
        p_title: `${detection.severity === 'critical' ? '🔴' : '🟠'} Critical Meeting: ${meeting.title}`,
        p_message: summary,
        p_type: 'warning',
        p_category: 'team',
        p_role_filter: ['owner', 'admin'],
        p_action_url: `/meetings?id=${meetingId}`,
        p_metadata: { meetingId, severity: detection.severity, riskFlags },
      });
    } catch (notifErr) {
      console.warn('[critical-meeting-alert] In-app notification failed:', notifErr);
    }

    // =========================================================================
    // 6. Record notification sent (dedup)
    // =========================================================================
    await recordNotificationSent(
      supabase,
      'critical_meeting_alert',
      orgId,
      channelDedupeId,
      channelResult?.ok ? undefined : undefined,
      channelResult?.ts,
      meetingId,
    );

    // =========================================================================
    // 7. Create Command Centre item
    // =========================================================================
    try {
      await supabase.from('command_centre_items').insert({
        org_id: orgId,
        user_id: meeting.owner_user_id,
        type: 'critical_meeting_alert',
        title: `${detection.severity.toUpperCase()}: ${meeting.title}`,
        description: summary,
        urgency: detection.severity === 'critical' ? 'critical' : 'high',
        status: 'active',
        metadata: {
          meetingId,
          severity: detection.severity,
          reasons: detection.reasons,
          riskFlags,
          commitments,
          dealId,
          companyName,
        },
      });
    } catch (ccErr) {
      console.warn('[critical-meeting-alert] Command Centre write failed:', ccErr);
    }

    return new Response(
      JSON.stringify({
        success: true,
        critical: true,
        severity: detection.severity,
        reasons: detection.reasons,
        channelPosted: channelResult?.ok ?? false,
        commitmentsTracked: commitments.length,
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error('[critical-meeting-alert] Error:', msg);
    return new Response(
      JSON.stringify({ success: false, error: msg }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }
});
