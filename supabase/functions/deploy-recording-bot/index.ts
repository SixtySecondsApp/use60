/**
 * Deploy Recording Bot Edge Function
 *
 * Deploys a MeetingBaaS bot to join and record a meeting.
 * Handles quota checking, recording creation, and bot deployment.
 *
 * Endpoint: POST /functions/v1/deploy-recording-bot
 *
 * @see supabase/migrations/20260104100000_meetingbaas_core_tables.sql
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { getCorsHeaders, handleCorsPreflightRequest } from '../_shared/corsHelper.ts';
import { logFlatRateCostEvent } from '../_shared/costTracking.ts';
import {
  createMeetingBaaSClient,
  MeetingBaaSClient,
  detectMeetingPlatform,
  isValidMeetingUrl,
  formatEntryMessage,
  checkRecordingQuota,
  getPlatformDefaultBotImage,
  getPlatformDefaultRecordingLimit,
  DEFAULT_BOT_NAME,
  DEFAULT_BOT_IMAGE,
  DEFAULT_ENTRY_MESSAGE,
  ERROR_CODES,
  ERROR_MESSAGES,
  type MeetingBaaSBotConfig,
  type RecordingSettings,
} from '../_shared/meetingbaas.ts';

// =============================================================================
// Types
// =============================================================================

interface DeployBotRequest {
  meeting_url: string;
  meeting_title?: string;
  calendar_event_id?: string;
  attendees?: Array<{
    email: string;
    name?: string;
  }>;
  scheduled_time?: string; // ISO timestamp for scheduled meetings
}

interface DeployBotResponse {
  success: boolean;
  recording_id?: string;
  bot_id?: string;
  error?: string;
  error_code?: string;
}

interface RecordingInsert {
  org_id: string;
  user_id: string;
  meeting_platform: string;
  meeting_url: string;
  meeting_title: string | null;
  calendar_event_id: string | null;
  attendees: Array<{ email: string; name?: string }> | null;
  status: string;
}

interface MeetingInsert {
  source_type: '60_notetaker';
  provider: '60_notetaker';
  org_id: string;
  owner_user_id: string;
  title: string | null;
  meeting_platform: string;
  meeting_url: string;
  processing_status: string;
  recording_id?: string;
  bot_id?: string;
  meeting_start?: string;
}

interface BotDeploymentInsert {
  org_id: string;
  recording_id: string;
  bot_id: string;
  status: string;
  status_history: Array<{ status: string; timestamp: string }>;
  meeting_url: string;
  scheduled_join_time: string | null;
  bot_name: string | null;
  bot_image_url: string | null;
  entry_message: string | null;
}

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Get recording settings for an organization
 */
async function getRecordingSettings(
  supabase: SupabaseClient,
  orgId: string
): Promise<RecordingSettings | null> {
  const { data } = await supabase
    .from('organizations')
    .select('recording_settings')
    .eq('id', orgId)
    .single();

  return data?.recording_settings || null;
}

/**
 * Get user profile for entry message formatting
 */
async function getUserProfile(
  supabase: SupabaseClient,
  userId: string
): Promise<{ full_name?: string; email?: string } | null> {
  const { data } = await supabase
    .from('profiles')
    .select('full_name, email')
    .eq('id', userId)
    .single();

  return data;
}

/**
 * Get organization name for entry message
 */
async function getOrgName(
  supabase: SupabaseClient,
  orgId: string
): Promise<string | null> {
  const { data } = await supabase
    .from('organizations')
    .select('name')
    .eq('id', orgId)
    .single();

  return data?.name || null;
}

/**
 * Increment recording usage count
 */
async function incrementUsageCount(
  supabase: SupabaseClient,
  orgId: string
): Promise<void> {
  const periodStart = new Date();
  periodStart.setDate(1);
  periodStart.setHours(0, 0, 0, 0);

  const periodEnd = new Date(periodStart.getFullYear(), periodStart.getMonth() + 1, 0);

  // Try to update existing record
  const { data: existing } = await supabase
    .from('recording_usage')
    .select('id, recordings_count')
    .eq('org_id', orgId)
    .eq('period_start', periodStart.toISOString().split('T')[0])
    .maybeSingle();

  if (existing) {
    await supabase
      .from('recording_usage')
      .update({
        recordings_count: existing.recordings_count + 1,
        updated_at: new Date().toISOString(),
      })
      .eq('id', existing.id);
  } else {
    // Create new usage record using platform default limit
    const defaultLimit = await getPlatformDefaultRecordingLimit(supabase);
    await supabase.from('recording_usage').insert({
      org_id: orgId,
      period_start: periodStart.toISOString().split('T')[0],
      period_end: periodEnd.toISOString().split('T')[0],
      recordings_count: 1,
      recordings_limit: defaultLimit,
      total_duration_seconds: 0,
      storage_used_bytes: 0,
    });
  }
}

/**
 * Build webhook URL for bot callbacks
 * Note: The webhook handler now identifies orgs via bot_id lookup,
 * so the token is optional but included for backward compatibility
 */
function buildWebhookUrl(webhookToken?: string): string {
  const baseUrl = Deno.env.get('SUPABASE_URL');
  // Token is optional - webhook handler can identify org from bot_id
  if (webhookToken) {
    return `${baseUrl}/functions/v1/meetingbaas-webhook?token=${webhookToken}`;
  }
  return `${baseUrl}/functions/v1/meetingbaas-webhook`;
}

/**
 * Ensure org has a webhook token, generating one if needed
 */
async function ensureWebhookToken(
  supabase: SupabaseClient,
  orgId: string,
  currentSettings: RecordingSettings | null
): Promise<string> {
  // Return existing token if available
  if (currentSettings?.webhook_token) {
    return currentSettings.webhook_token;
  }

  // Generate a new token
  const newToken = crypto.randomUUID();

  // Update org settings with new token
  const updatedSettings = {
    ...(currentSettings || {}),
    webhook_token: newToken,
    meetingbaas_enabled: true,
  };

  await supabase
    .from('organizations')
    .update({ recording_settings: updatedSettings })
    .eq('id', orgId);

  console.log(`[DeployBot] Generated webhook token for org: ${orgId}`);

  return newToken;
}

// =============================================================================
// Main Handler
// =============================================================================

serve(async (req) => {
  // Handle CORS preflight
  const preflightResponse = handleCorsPreflightRequest(req);
  if (preflightResponse) {
    return preflightResponse;
  }

  // Build CORS headers from the actual request origin
  const corsHeaders = getCorsHeaders(req);

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  try {
    // Get auth header
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Missing authorization header' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    const isServiceRole = authHeader === `Bearer ${serviceRoleKey}`;
    const serviceRoleUserId = req.headers.get('x-user-id');

    let supabase: SupabaseClient;
    let userId: string;

    if (isServiceRole && serviceRoleUserId) {
      // Service role call (from auto-join scheduler)
      // Use admin client and get user from header
      supabase = createClient(
        Deno.env.get('SUPABASE_URL')!,
        serviceRoleKey,
        {
          auth: { persistSession: false, autoRefreshToken: false },
        }
      );
      userId = serviceRoleUserId;
      console.log(`[DeployBot] Service role call for user: ${userId}`);
    } else {
      // Regular user JWT call
      const jwt = authHeader.replace('Bearer ', '');

      // Log JWT info for debugging (just the header, not the full token)
      const jwtParts = jwt.split('.');
      console.log(`[DeployBot] JWT received - parts: ${jwtParts.length}, header length: ${jwtParts[0]?.length || 0}`);

      supabase = createClient(
        Deno.env.get('SUPABASE_URL')!,
        Deno.env.get('SUPABASE_ANON_KEY')!,
        {
          global: {
            headers: { Authorization: authHeader },
          },
          auth: {
            persistSession: false,
            autoRefreshToken: false,
          },
        }
      );

      // Get user info from JWT - pass token explicitly like api-copilot does
      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser(jwt);

      if (userError || !user) {
        console.error('[DeployBot] Auth error:', userError?.message, 'code:', userError?.code, 'status:', userError?.status);
        return new Response(JSON.stringify({
          error: 'Unauthorized',
          details: userError?.message,
          code: userError?.code,
        }), {
          status: 401,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      userId = user.id;
      console.log(`[DeployBot] User authenticated: ${userId}`);
    }

    // Parse request body
    const body: DeployBotRequest = await req.json();

    // Validate meeting URL
    if (!body.meeting_url) {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Meeting URL is required',
          error_code: ERROR_CODES.INVALID_MEETING_URL,
        }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    if (!isValidMeetingUrl(body.meeting_url)) {
      return new Response(
        JSON.stringify({
          success: false,
          error: ERROR_MESSAGES.INVALID_MEETING_URL,
          error_code: ERROR_CODES.INVALID_MEETING_URL,
        }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    // Get user's organization from membership
    const { data: membership } = await supabase
      .from('organization_memberships')
      .select('org_id')
      .eq('user_id', userId)
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle();

    const orgId = membership?.org_id;
    if (!orgId) {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'No active organization',
        }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    // Check quota
    const quota = await checkRecordingQuota(supabase, orgId);
    if (!quota.allowed) {
      return new Response(
        JSON.stringify({
          success: false,
          error: ERROR_MESSAGES.LIMIT_REACHED,
          error_code: ERROR_CODES.LIMIT_REACHED,
          remaining: quota.remaining,
          limit: quota.limit,
        }),
        {
          status: 403,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    // Get recording settings
    const settings = await getRecordingSettings(supabase, orgId);
    console.log('[DeployBot] Org settings fetched:', {
      orgId,
      hasSettings: !!settings,
      settings: settings ? JSON.stringify(settings) : null,
    });

    // Get bot image URL: org override > platform default > code fallback
    const platformDefaultBotImage = await getPlatformDefaultBotImage(supabase);
    const botImageUrl = settings?.bot_image_url || platformDefaultBotImage || DEFAULT_BOT_IMAGE;

    const botName = settings?.bot_name || DEFAULT_BOT_NAME;
    const entryMessageEnabled = settings?.entry_message_enabled ?? true;

    console.log('[DeployBot] Bot config values:', {
      botName,
      botImageUrl,
      entryMessageEnabled,
      hasEntryMessage: !!settings?.entry_message,
    });

    // Format entry message
    let entryMessage: string | undefined;
    if (entryMessageEnabled) {
      const userProfile = await getUserProfile(supabase, userId);
      const orgName = await getOrgName(supabase, orgId);

      const messageTemplate = settings?.entry_message || DEFAULT_ENTRY_MESSAGE;
      entryMessage = formatEntryMessage(messageTemplate, {
        rep_name: userProfile?.full_name || 'your rep',
        company_name: orgName || undefined,
        meeting_title: body.meeting_title || undefined,
      });
    }

    // Detect platform
    const platform = detectMeetingPlatform(body.meeting_url);
    if (!platform) {
      return new Response(
        JSON.stringify({
          success: false,
          error: ERROR_MESSAGES.INVALID_MEETING_URL,
          error_code: ERROR_CODES.INVALID_MEETING_URL,
        }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    // Resolve attendees: from request body, or from calendar event
    let resolvedAttendees: Array<{ email: string; name?: string }> | null = body.attendees || null;

    if (!resolvedAttendees && body.calendar_event_id) {
      try {
        const { data: calendarEvent } = await supabase
          .from('calendar_events')
          .select('attendees')
          .eq('id', body.calendar_event_id)
          .maybeSingle();

        if (calendarEvent?.attendees && Array.isArray(calendarEvent.attendees)) {
          resolvedAttendees = calendarEvent.attendees;
          console.log(`[DeployBot] Resolved ${resolvedAttendees.length} attendees from calendar event`);
        }
      } catch (e) {
        console.warn('[DeployBot] Failed to fetch calendar event attendees:', e);
      }
    }

    // Create recording record
    const recordingData: RecordingInsert = {
      org_id: orgId,
      user_id: userId,
      meeting_platform: platform,
      meeting_url: body.meeting_url,
      meeting_title: body.meeting_title || null,
      calendar_event_id: body.calendar_event_id || null,
      attendees: resolvedAttendees,
      status: 'pending',
    };

    const { data: recording, error: recordingError } = await supabase
      .from('recordings')
      .insert(recordingData)
      .select('id')
      .single();

    if (recordingError) {
      console.error('[DeployBot] Failed to create recording:', recordingError);
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Failed to create recording record',
        }),
        {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    // Ensure org has a webhook token (auto-generate if needed)
    const webhookToken = await ensureWebhookToken(supabase, orgId, settings);

    // Build bot configuration
    const botConfig: MeetingBaaSBotConfig = {
      meeting_url: body.meeting_url,
      bot_name: botName,
      bot_image: botImageUrl || undefined,
      entry_message: entryMessage,
      recording_mode: 'speaker_view',
      webhook_url: buildWebhookUrl(webhookToken),
      deduplication_key: recording.id,
      // Enable MeetingBaaS transcription so we get transcript.ready webhook
      speech_to_text: {
        provider: 'Default',
      },
    };

    // If scheduled, set reserved flag
    if (body.scheduled_time) {
      botConfig.reserved = true;
    }

    console.log('[DeployBot] Final bot config being sent to MeetingBaaS:', {
      bot_name: botConfig.bot_name,
      bot_image: botConfig.bot_image,
      entry_message: botConfig.entry_message,
      recording_mode: botConfig.recording_mode,
      webhook_url: botConfig.webhook_url ? '[set]' : '[not set]',
    });

    // Deploy bot to MeetingBaaS
    let meetingBaaSClient: MeetingBaaSClient;
    try {
      meetingBaaSClient = createMeetingBaaSClient();
    } catch (error) {
      console.error('[DeployBot] MeetingBaaS client error:', error);
      // Clean up recording record
      await supabase.from('recordings').delete().eq('id', recording.id);
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Recording service not configured',
        }),
        {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    const { data: botResponse, error: botError } = await meetingBaaSClient.deployBot(botConfig);

    if (botError || !botResponse) {
      console.error('[DeployBot] MeetingBaaS API error:', botError);
      // Update recording status to failed
      await supabase
        .from('recordings')
        .update({
          status: 'failed',
          error_message: botError?.message || 'Failed to deploy bot',
        })
        .eq('id', recording.id);

      return new Response(
        JSON.stringify({
          success: false,
          error: ERROR_MESSAGES.BOT_JOIN_FAILED,
          error_code: ERROR_CODES.BOT_JOIN_FAILED,
        }),
        {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    // Update recording with bot ID
    await supabase
      .from('recordings')
      .update({
        bot_id: botResponse.id,
        status: 'bot_joining',
      })
      .eq('id', recording.id);

    // Create unified meeting record for 60 Notetaker recordings
    const meetingData: MeetingInsert = {
      source_type: '60_notetaker',
      provider: '60_notetaker',
      org_id: orgId,
      owner_user_id: userId,
      title: body.meeting_title || null,
      meeting_platform: platform,
      meeting_url: body.meeting_url,
      processing_status: 'bot_joining',
      recording_id: recording.id,
      bot_id: botResponse.id,
      meeting_start: body.scheduled_time || new Date().toISOString(),
    };

    const { error: meetingError } = await supabase
      .from('meetings')
      .insert(meetingData);

    if (meetingError) {
      // Log but don't fail - the trigger will sync on completion
      console.warn('[DeployBot] Failed to create meeting record (non-fatal):', meetingError.message);
    } else {
      console.log('[DeployBot] Created unified meeting record for 60 Notetaker');
    }

    // Create bot deployment record
    const deploymentData: BotDeploymentInsert = {
      org_id: orgId,
      recording_id: recording.id,
      bot_id: botResponse.id,
      status: 'joining',
      status_history: [
        {
          status: 'joining',
          timestamp: new Date().toISOString(),
        },
      ],
      meeting_url: body.meeting_url,
      scheduled_join_time: body.scheduled_time || null,
      bot_name: botName,
      bot_image_url: botImageUrl,
      entry_message: entryMessage || null,
    };

    await supabase.from('bot_deployments').insert(deploymentData);

    // Increment usage count
    await incrementUsageCount(supabase, orgId);

    // Deduct credits for notetaker bot (non-blocking — bot deployment is not gated on credits)
    try {
      const serviceClient = createClient(
        Deno.env.get('SUPABASE_URL') ?? '',
        Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
      );
      const { data: menuEntry } = await serviceClient
        .from('credit_menu')
        .select('cost_low, cost_medium, cost_high, is_active, free_with_sub')
        .eq('action_id', 'notetaker_bot')
        .maybeSingle();

      if (menuEntry?.is_active && !menuEntry.free_with_sub) {
        const cost = (menuEntry.cost_medium as number) ?? 2.0;
        await logFlatRateCostEvent(
          serviceClient,
          userId,
          orgId,
          'meetingbaas',
          'notetaker-bot-deployment',
          cost,
          'notetaker_bot',
        );
      }
    } catch (creditErr) {
      console.error('[DeployBot] Credit deduction failed (non-blocking):', creditErr);
    }

    console.log('[DeployBot] Bot deployed successfully:', {
      recordingId: recording.id,
      botId: botResponse.id,
      platform,
    });

    return new Response(
      JSON.stringify({
        success: true,
        recording_id: recording.id,
        bot_id: botResponse.id,
      } as DeployBotResponse),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  } catch (error) {
    console.error('[DeployBot] Error:', error);
    return new Response(
      JSON.stringify({
        success: false,
        error: 'Internal server error',
        message: error instanceof Error ? error.message : 'Unknown error',
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});
