import { serve } from 'https://deno.land/std@0.190.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.43.4'
import { handleCorsPreflightRequest, jsonResponse, errorResponse } from '../_shared/corsHelper.ts'
import { createMeetingBaaSClient } from '../_shared/meetingbaas.ts'

serve(async (req) => {
  const preflight = handleCorsPreflightRequest(req)
  if (preflight) return preflight

  if (req.method !== 'POST') {
    return errorResponse('Method not allowed', req, 405)
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  if (!supabaseUrl || !serviceRoleKey) {
    return errorResponse('Server misconfigured', req, 500)
  }

  const anonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? ''
  const userToken = req.headers.get('Authorization')?.replace('Bearer ', '') || ''

  if (!anonKey || !userToken) {
    return errorResponse('Unauthorized', req, 401)
  }

  // Authenticate user
  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: `Bearer ${userToken}` } },
  })
  const {
    data: { user },
    error: userError,
  } = await userClient.auth.getUser()

  if (!user) {
    return errorResponse(userError?.message || 'Unauthorized', req, 401)
  }

  const svc = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  try {
    // 1. Find the user's MeetingBaaS calendar (active first, then inactive for cleanup/recovery)
    const { data: calendars, error: calendarError } = await svc
      .from('meetingbaas_calendars')
      .select('id, meetingbaas_calendar_id, user_id, org_id, is_active')
      .eq('user_id', user.id)
      .not('meetingbaas_calendar_id', 'is', null)
      .order('is_active', { ascending: false })

    if (calendarError) {
      console.error('[meetingbaas-disconnect] Calendar lookup error:', calendarError)
      return errorResponse(`Database error: ${calendarError.message}`, req, 500)
    }

    const calendar = calendars?.[0]
    if (!calendar) {
      return errorResponse('No MeetingBaaS calendar found', req, 404)
    }

    console.log('[meetingbaas-disconnect] Disconnecting calendar:', calendar.id, 'MeetingBaaS ID:', calendar.meetingbaas_calendar_id)

    // 2. Best-effort: Delete calendar from MeetingBaaS API (stops bot scheduling)
    let meetingbaasDeleted = false
    if (calendar.meetingbaas_calendar_id) {
      try {
        const client = createMeetingBaaSClient()
        const { error: deleteError } = await client.deleteCalendar(calendar.meetingbaas_calendar_id)
        if (deleteError) {
          console.warn('[meetingbaas-disconnect] MeetingBaaS API deletion failed (non-fatal):', deleteError.message)
        } else {
          meetingbaasDeleted = true
          console.log('[meetingbaas-disconnect] MeetingBaaS calendar deleted:', calendar.meetingbaas_calendar_id)
        }
      } catch (apiErr: any) {
        console.warn('[meetingbaas-disconnect] MeetingBaaS API call failed (non-fatal):', apiErr.message)
      }
    }

    // 3. Critical: Mark calendar as inactive and disable bot scheduling
    const { error: updateError } = await svc
      .from('meetingbaas_calendars')
      .update({
        is_active: false,
        bot_scheduling_enabled: false,
        updated_at: new Date().toISOString(),
      })
      .eq('id', calendar.id)

    if (updateError) {
      console.error('[meetingbaas-disconnect] Calendar update error:', updateError)
      return errorResponse(`Failed to disconnect: ${updateError.message}`, req, 500)
    }

    // 4. Best-effort: Deactivate Google Calendar webhook channels
    let webhooksCleaned = 0
    try {
      const { data: channels, error: channelsError } = await svc
        .from('google_calendar_channels')
        .select('id, channel_id')
        .eq('user_id', user.id)
        .eq('is_active', true)

      if (!channelsError && channels && channels.length > 0) {
        for (const channel of channels) {
          const { error: chUpdateError } = await svc
            .from('google_calendar_channels')
            .update({ is_active: false, updated_at: new Date().toISOString() })
            .eq('id', channel.id)

          if (!chUpdateError) {
            webhooksCleaned++
          }
        }
        console.log(`[meetingbaas-disconnect] Deactivated ${webhooksCleaned} webhook channel(s)`)
      }
    } catch (webhookErr: any) {
      console.warn('[meetingbaas-disconnect] Webhook cleanup failed (non-fatal):', webhookErr.message)
    }

    // 5. Best-effort: Disable notetaker for this user
    let notetakerReset = false
    try {
      const { error: notetakerError } = await svc
        .from('notetaker_user_settings')
        .update({
          is_enabled: false,
          updated_at: new Date().toISOString(),
        })
        .eq('user_id', user.id)

      if (!notetakerError) {
        notetakerReset = true
        console.log('[meetingbaas-disconnect] Notetaker user settings disabled')
      } else {
        console.warn('[meetingbaas-disconnect] Notetaker reset failed (non-fatal):', notetakerError.message)
      }
    } catch (notetakerErr: any) {
      console.warn('[meetingbaas-disconnect] Notetaker reset failed (non-fatal):', notetakerErr.message)
    }

    return jsonResponse({
      success: true,
      meetingbaas_deleted: meetingbaasDeleted,
      webhooks_cleaned: webhooksCleaned,
      notetaker_reset: notetakerReset,
    }, req)
  } catch (e: any) {
    console.error('[meetingbaas-disconnect] Disconnect error:', e)
    return errorResponse(e.message || 'Unknown error', req, 500)
  }
})
