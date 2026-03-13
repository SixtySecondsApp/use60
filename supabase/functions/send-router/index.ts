import { getCorsHeaders } from '../_shared/corsHelper.ts'

import { handleMeetingShareInvite } from './handlers/meeting-share-invite.ts'
import { handleOrgDeactivationEmail } from './handlers/org-deactivation-email.ts'
import { handleOrgMemberDeactivationEmail } from './handlers/org-member-deactivation-email.ts'
import { handleOrgNotificationSlack } from './handlers/org-notification-slack.ts'
import { handleOrganizationInvitation } from './handlers/organization-invitation.ts'
import { handlePasswordResetEmail } from './handlers/password-reset-email.ts'
import { handleRecordingNotification } from './handlers/recording-notification.ts'
import { handleRejoinInvitation } from './handlers/rejoin-invitation.ts'
import { handleRemovalEmail } from './handlers/removal-email.ts'
import { handleScheduledEmails } from './handlers/scheduled-emails.ts'
import { handleSlackMessage } from './handlers/slack-message.ts'
import { handleSlackNotification } from './handlers/slack-notification.ts'
import { handleSlackTaskNotification } from './handlers/slack-task-notification.ts'
import { handleWaitlistInvite } from './handlers/waitlist-invite.ts'

const HANDLERS: Record<string, (req: Request) => Promise<Response>> = {
  meeting_share_invite: handleMeetingShareInvite,
  org_deactivation_email: handleOrgDeactivationEmail,
  org_member_deactivation_email: handleOrgMemberDeactivationEmail,
  org_notification_slack: handleOrgNotificationSlack,
  organization_invitation: handleOrganizationInvitation,
  password_reset_email: handlePasswordResetEmail,
  recording_notification: handleRecordingNotification,
  rejoin_invitation: handleRejoinInvitation,
  removal_email: handleRemovalEmail,
  scheduled_emails: handleScheduledEmails,
  slack_message: handleSlackMessage,
  slack_notification: handleSlackNotification,
  slack_task_notification: handleSlackTaskNotification,
  waitlist_invite: handleWaitlistInvite,
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
    console.error('[send-router] Router error:', error)
    return new Response(JSON.stringify({ error: (error as Error).message ?? 'Internal error' }), { status: 500, headers: { ...cors, 'Content-Type': 'application/json' } })
  }
})
