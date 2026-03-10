import { getCorsHeaders } from '../_shared/corsHelper.ts'
import { handleCampaignAlerts } from './handlers/campaign-alerts.ts'
import { handleCopilot } from './handlers/copilot.ts'
import { handleCopilotActions } from './handlers/copilot-actions.ts'
import { handleDailyDigest } from './handlers/daily-digest.ts'
import { handleDealMomentum } from './handlers/deal-momentum.ts'
import { handleDealRiskAlert } from './handlers/deal-risk-alert.ts'
import { handleDealRoom } from './handlers/deal-room.ts'
import { handleDealRoomArchive } from './handlers/deal-room-archive.ts'
import { handleDealRoomUpdate } from './handlers/deal-room-update.ts'
import { handleEmailReplyAlert } from './handlers/email-reply-alert.ts'
import { handleExpireActions } from './handlers/expire-actions.ts'
import { handleHitlNotification } from './handlers/hitl-notification.ts'
import { handleJoinChannel } from './handlers/join-channel.ts'
import { handleListChannels } from './handlers/list-channels.ts'
import { handleMeetingPrep } from './handlers/meeting-prep.ts'
import { handleMorningBrief } from './handlers/morning-brief.ts'
import { handlePostMeeting } from './handlers/post-meeting.ts'
import { handleRefreshUserChannels } from './handlers/refresh-user-channels.ts'
import { handleSalesAssistant } from './handlers/sales-assistant.ts'
import { handleSelfMap } from './handlers/self-map.ts'
import { handleStaleDeals } from './handlers/stale-deals.ts'
import { handleTaskReminders } from './handlers/task-reminders.ts'

const HANDLERS: Record<string, (req: Request) => Promise<Response>> = {
  campaign_alerts: handleCampaignAlerts,
  copilot: handleCopilot,
  copilot_actions: handleCopilotActions,
  daily_digest: handleDailyDigest,
  deal_momentum: handleDealMomentum,
  deal_risk_alert: handleDealRiskAlert,
  deal_room: handleDealRoom,
  deal_room_archive: handleDealRoomArchive,
  deal_room_update: handleDealRoomUpdate,
  email_reply_alert: handleEmailReplyAlert,
  expire_actions: handleExpireActions,
  hitl_notification: handleHitlNotification,
  join_channel: handleJoinChannel,
  list_channels: handleListChannels,
  meeting_prep: handleMeetingPrep,
  morning_brief: handleMorningBrief,
  post_meeting: handlePostMeeting,
  refresh_user_channels: handleRefreshUserChannels,
  sales_assistant: handleSalesAssistant,
  self_map: handleSelfMap,
  stale_deals: handleStaleDeals,
  task_reminders: handleTaskReminders,
}

Deno.serve(async (req: Request) => {
  const cors = getCorsHeaders(req)
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  try {
    const bodyText = await req.text()
    let body: Record<string, unknown>
    try { body = JSON.parse(bodyText) } catch {
      return new Response(JSON.stringify({ error: 'Invalid JSON body' }), { status: 400, headers: { ...cors, 'Content-Type': 'application/json' } })
    }
    const action = body.action as string
    if (!action || !HANDLERS[action]) {
      return new Response(JSON.stringify({ error: `Invalid or missing action. Must be one of: ${Object.keys(HANDLERS).join(', ')}`, received: action ?? null }), { status: 400, headers: { ...cors, 'Content-Type': 'application/json' } })
    }
    const handlerReq = new Request(req.url, { method: req.method, headers: req.headers, body: bodyText })
    return await HANDLERS[action](handlerReq)
  } catch (error: unknown) {
    console.error('[slack-ops-router] Router error:', error)
    return new Response(JSON.stringify({ error: (error as Error).message ?? 'Internal error' }), { status: 500, headers: { ...cors, 'Content-Type': 'application/json' } })
  }
})
