import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { buildMeetingPrepMessage, buildWeeklyCoachingDigestMessage, buildCoachingMicroFeedbackMessage, buildMeetingDebriefMessage, buildCampaignReportMessage } from '../_shared/slackBlocks.ts';
import type { MeetingPrepData, WeeklyCoachingDigestData, CoachingMicroFeedbackData, MeetingDebriefData, CampaignReportData } from '../_shared/slackBlocks.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  // Handle CORS
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // Get the authorization header
    const authHeader = req.headers.get('Authorization')?.replace('Bearer ', '');
    if (!authHeader) {
      throw new Error('No authorization provided');
    }

    // Initialize Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const body = await req.json();
    const {
      channel,
      message,
      blocks,
      attachments,
      team_id,
      user_id: bodyUserId,
      org_id: bodyOrgId,
    } = body;

    // Support service role auth (orchestrator inter-function calls)
    // Handle both legacy JWT service role keys and new sb_secret_ format
    const legacyServiceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY_LEGACY');
    const isServiceRole = authHeader === supabaseServiceKey
      || (legacyServiceRoleKey && authHeader === legacyServiceRoleKey)
      || (authHeader.length > 100 && authHeader.includes('"role":"service_role"') === false && (() => {
        // Decode JWT payload to check if it's a service_role token
        try {
          const payload = JSON.parse(atob(authHeader.split('.')[1]));
          return payload.role === 'service_role';
        } catch { return false; }
      })());
    let userId: string;

    if (isServiceRole) {
      if (!bodyUserId) {
        throw new Error('Service role calls must include user_id');
      }
      userId = bodyUserId;
    } else {
      const { data: { user }, error: authError } = await supabase.auth.getUser(authHeader);
      if (authError || !user) {
        throw new Error('Unauthorized');
      }
      userId = user.id;
    }

    // Get the user's Slack integration (needed early for DM fallback)
    let { data: integration, error: integrationError } = await supabase
      .from('slack_integrations')
      .select('id, user_id, team_id, team_name, access_token, bot_user_id, authed_user, scope, is_active')
      .eq('user_id', userId)
      .eq('team_id', team_id || '')
      .eq('is_active', true)
      .maybeSingle();

    if (integrationError || !integration) {
      // If no team_id provided, try to get the first active integration
      const { data: firstIntegration, error: firstError } = await supabase
        .from('slack_integrations')
        .select('id, user_id, team_id, team_name, access_token, bot_user_id, authed_user, scope, is_active')
        .eq('user_id', userId)
        .eq('is_active', true)
        .limit(1)
        .maybeSingle();

      if (firstError || !firstIntegration) {
        throw new Error('No active Slack integration found. Please connect Slack first.');
      }

      integration = firstIntegration;
    }

    // Support orchestrator-style calls with message_type + data (no explicit channel)
    let resolvedChannel = channel;
    let resolvedMessage = message;
    let resolvedBlocks = blocks;

    if (!channel && body.message_type) {
      // Look up org's default Slack channel
      if (!bodyOrgId) {
        throw new Error('org_id required for message_type calls');
      }
      const { data: orgSettings } = await supabase
        .from('organization_settings')
        .select('slack_default_channel_id')
        .eq('organization_id', bodyOrgId)
        .maybeSingle();

      resolvedChannel = orgSettings?.slack_default_channel_id;

      if (!resolvedChannel) {
        // Fallback: DM the user directly via Slack
        console.log('[send-slack-message] No default channel for org, falling back to user DM');

        // Try to get user's Slack user ID from profiles
        const { data: profile } = await supabase
          .from('profiles')
          .select('slack_user_id')
          .eq('id', userId)
          .maybeSingle();

        let slackUserId = profile?.slack_user_id;

        // Fallback: try authed_user from the OAuth integration
        if (!slackUserId && integration.authed_user) {
          const authedUser = typeof integration.authed_user === 'string'
            ? JSON.parse(integration.authed_user)
            : integration.authed_user;
          slackUserId = authedUser?.id;
        }

        if (slackUserId) {
          // Open a DM channel with the user
          const dmResponse = await fetch('https://slack.com/api/conversations.open', {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${integration.access_token}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ users: slackUserId }),
          });
          const dmData = await dmResponse.json();
          if (dmData.ok && dmData.channel?.id) {
            resolvedChannel = dmData.channel.id;
            console.log(`[send-slack-message] Opened DM channel: ${resolvedChannel}`);
          }
        }
      }

      // Format message based on message_type
      const data = body.data || {};
      switch (body.message_type) {
        case 'coaching_digest': {
          const appUrl = Deno.env.get('APP_URL') || 'https://app.use60.com';

          // Per-meeting micro-feedback (has analysis_id + meeting_title)
          if (data.meeting_title && data.analysis_id) {
            const microData: CoachingMicroFeedbackData = {
              analysisId: data.analysis_id || data.id || '',
              meetingTitle: data.meeting_title || 'Meeting',
              talkRatio: data.talk_ratio ?? 50,
              questionQualityScore: data.question_quality_score ?? 0,
              objectionHandlingScore: data.objection_handling_score ?? 0,
              discoveryDepthScore: data.discovery_depth_score,
              overallScore: data.overall_score,
              insights: (data.insights || []).map((i: any) => ({
                category: i.category || 'general',
                text: typeof i === 'string' ? i : i.text || String(i),
                severity: i.severity || 'neutral',
              })),
              recommendations: data.recommendations,
              appUrl,
            };
            const microMsg = buildCoachingMicroFeedbackMessage(microData);
            resolvedMessage = microMsg.text;
            resolvedBlocks = microMsg.blocks;
          } else {
            // Weekly digest (has meetings_analyzed or avg scores)
            const digestData: WeeklyCoachingDigestData = {
              userName: data.user_name || 'Rep',
              slackUserId: data.slack_user_id,
              meetingsAnalyzed: data.meetings_analyzed ?? 0,
              avgTalkRatio: data.avg_talk_ratio ?? data.talk_ratio ?? 50,
              avgQuestionScore: data.avg_question_score ?? data.question_quality_score ?? 0,
              avgObjectionScore: data.avg_objection_score ?? data.objection_handling_score ?? 0,
              avgDiscoveryDepthScore: data.avg_discovery_depth_score ?? data.discovery_depth_score,
              overallScore: data.overall_score,
              improvingAreas: data.improving_areas || [],
              focusAreas: data.focus_areas || [],
              winningPatterns: data.winning_patterns || [],
              weekOverWeek: {
                talkRatioChange: data.week_over_week?.talk_ratio_change ?? 0,
                questionScoreChange: data.week_over_week?.question_score_change ?? 0,
                objectionScoreChange: data.week_over_week?.objection_score_change,
              },
              topMoment: data.top_moment || data.best_moment,
              weeklyChallenge: data.weekly_challenge,
              recommendations: data.recommendations,
              appUrl,
            };
            const digestMsg = buildWeeklyCoachingDigestMessage(digestData);
            resolvedMessage = digestMsg.text;
            resolvedBlocks = digestMsg.blocks;
          }
          break;
        }
        case 'campaign_report': {
          // Build structured campaign report message
          const campaignData: CampaignReportData = {
            campaign_name: data.campaign_name || 'Campaign',
            campaign_id: data.campaign_id || '',
            sent: data.sent || 0,
            opened: data.opened || 0,
            clicked: data.clicked || 0,
            replied: data.replied || 0,
            open_rate: data.open_rate || 0,
            click_rate: data.click_rate || 0,
            reply_rate: data.reply_rate || 0,
            status: data.status || 'healthy',
            replies: data.replies || [],
            suggestions: data.suggestions || [],
          };
          const campaignMsg = buildCampaignReportMessage(campaignData);
          resolvedMessage = campaignMsg.text;
          resolvedBlocks = campaignMsg.blocks;
          break;
        }
        case 'meeting_debrief': {
          const appUrl = Deno.env.get('APP_URL') || 'https://app.use60.com';
          const debriefData: MeetingDebriefData = {
            meetingTitle: data.meeting_title || 'Meeting',
            meetingId: data.meeting_id || '',
            attendees: data.attendees || [],
            duration: data.duration || 30,
            dealName: data.deal_name,
            dealId: data.deal_id,
            dealStage: data.deal_stage,
            summary: data.summary || '',
            sentiment: data.sentiment || 'neutral',
            sentimentScore: data.sentiment_score ?? 50,
            talkTimeRep: data.talk_time_rep ?? 50,
            talkTimeCustomer: data.talk_time_customer ?? 50,
            actionItems: (data.action_items || []).map((item: any) => ({
              task: item.task || item.title || 'Task',
              suggestedOwner: item.suggestedOwner || item.assignee_name,
              dueInDays: item.dueInDays || 3,
            })),
            coachingInsight: data.coaching_insight || '',
            keyQuotes: data.key_quotes || [],
            appUrl,
          };
          const debriefMsg = buildMeetingDebriefMessage(debriefData);
          resolvedMessage = debriefMsg.text;
          resolvedBlocks = debriefMsg.blocks;
          break;
        }
        case 'meeting_briefing': {
          // Rich Block Kit meeting briefing via buildMeetingPrepMessage
          const briefing = data.briefing || {};
          const meetingPrepData: MeetingPrepData = {
            meetingTitle: data.meeting_title || 'Upcoming Meeting',
            meetingId: data.meeting_id || '',
            meetingStartTime: data.meeting_start,
            userName: data.user_name || 'Rep',
            slackUserId: data.slack_user_id,
            attendees: (data.attendees || []).map((a: any) => ({
              name: a.name,
              title: a.title,
              isDecisionMaker: false,
              isFirstMeeting: !a.is_known_contact,
            })),
            company: {
              id: data.company?.id,
              name: data.company?.name || data.company?.domain || 'Unknown',
              domain: data.company?.domain,
              industry: data.company?.industry,
              size: data.company?.size,
              stage: data.classification?.relationship,
            },
            deal: data.deal ? {
              name: data.deal.name,
              id: data.deal.id,
              value: data.deal.value || 0,
              stage: data.deal.stage || 'Unknown',
            } : undefined,
            talkingPoints: briefing.talking_points || [],
            appUrl: Deno.env.get('APP_URL') || 'https://app.use60.com',
            riskSignals: (briefing.risk_signals || []).map((r: any) => ({
              type: typeof r === 'string' ? 'risk' : r.type || 'risk',
              severity: typeof r === 'string' ? 'medium' as const : r.severity || 'medium',
              description: typeof r === 'string' ? r : r.description || r.title || String(r),
            })),
            previousObjections: (briefing.action_item_followups || []).map((a: any) => ({
              objection: typeof a === 'string' ? a : a.title || String(a),
              resolved: false,
            })),
            stageQuestions: briefing.questions_to_ask || [],
            leadProfile: (data.lead_profile || briefing.attendee_deep_profile) ? {
              name: data.lead_profile?.name || briefing.attendee_deep_profile?.name,
              title: data.lead_profile?.title || briefing.attendee_deep_profile?.title,
              linkedin_url: data.lead_profile?.linkedin_url || briefing.attendee_deep_profile?.linkedin_url,
              role_seniority: data.lead_profile?.role_seniority || briefing.attendee_deep_profile?.seniority,
              decision_authority: data.lead_profile?.decision_authority || briefing.attendee_deep_profile?.decision_authority,
              background: data.lead_profile?.background || briefing.attendee_deep_profile?.background,
              content_topics: data.lead_profile?.content_topics || briefing.personalization_hooks,
              connection_points: data.lead_profile?.connection_points || briefing.connection_points,
            } : undefined,
          };
          const slackMsg = buildMeetingPrepMessage(meetingPrepData);
          resolvedMessage = slackMsg.text;
          resolvedBlocks = slackMsg.blocks;
          break;
        }
        default:
          resolvedMessage = `*${body.message_type}*\n${JSON.stringify(data).substring(0, 500)}`;
      }
    }

    if (!resolvedChannel || !resolvedMessage) {
      throw new Error('Channel and message are required');
    }

    // Prepare the Slack message
    const slackMessage: any = {
      channel: resolvedChannel,
      text: resolvedMessage,
    };

    if (resolvedBlocks) {
      slackMessage.blocks = resolvedBlocks;
    }

    if (attachments) {
      slackMessage.attachments = attachments;
    }

    // Send message to Slack using Web API
    const slackResponse = await fetch('https://slack.com/api/chat.postMessage', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${integration.access_token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(slackMessage),
    });

    const slackData = await slackResponse.json();

    if (!slackData.ok) {
      // Handle specific Slack errors
      if (slackData.error === 'not_in_channel') {
        // Try to join the channel first
        const joinResponse = await fetch('https://slack.com/api/conversations.join', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${integration.access_token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ channel: resolvedChannel }),
        });

        const joinData = await joinResponse.json();
        
        if (joinData.ok) {
          // Retry sending the message
          const retryResponse = await fetch('https://slack.com/api/chat.postMessage', {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${integration.access_token}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify(slackMessage),
          });

          const retryData = await retryResponse.json();
          
          if (!retryData.ok) {
            throw new Error(`Slack API error: ${retryData.error}`);
          }

          return new Response(
            JSON.stringify({ 
              success: true, 
              message: 'Message sent after joining channel',
              ts: retryData.ts,
              channel: retryData.channel 
            }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
          );
        }
      }

      throw new Error(`Slack API error: ${slackData.error}`);
    }

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: 'Message sent to Slack',
        ts: slackData.ts,
        channel: slackData.channel 
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
    );

  } catch (error) {
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
    );
  }
});