/**
 * Generate Router
 *
 * Consolidates 13 generate-* edge functions into a single router.
 * Dispatches based on `action` field in the JSON body.
 *
 * Actions:
 *   email_sequence, embedding, follow_up, icp_profiles, magic_link,
 *   marketing_content, more_actions, s3_video_thumbnail, svg,
 *   test_user_link, video_thumbnail, video_thumbnail_v2, waitlist_token
 */

import { getCorsHeaders } from '../_shared/corsHelper.ts'
import { handleEmailSequence } from './handlers/email-sequence.ts'
import { handleEmbedding } from './handlers/embedding.ts'
import { handleFollowUp } from './handlers/follow-up.ts'
import { handleIcpProfiles } from './handlers/icp-profiles.ts'
import { handleMagicLink } from './handlers/magic-link.ts'
import { handleMarketingContent } from './handlers/marketing-content.ts'
import { handleMoreActions } from './handlers/more-actions.ts'
import { handleS3VideoThumbnail } from './handlers/s3-video-thumbnail.ts'
import { handleSvg } from './handlers/svg.ts'
import { handleTestUserLink } from './handlers/test-user-link.ts'
import { handleVideoThumbnail } from './handlers/video-thumbnail.ts'
import { handleVideoThumbnailV2 } from './handlers/video-thumbnail-v2.ts'
import { handleWaitlistToken } from './handlers/waitlist-token.ts'

const HANDLERS: Record<string, (req: Request) => Promise<Response>> = {
  email_sequence: handleEmailSequence,
  embedding: handleEmbedding,
  follow_up: handleFollowUp,
  icp_profiles: handleIcpProfiles,
  magic_link: handleMagicLink,
  marketing_content: handleMarketingContent,
  more_actions: handleMoreActions,
  s3_video_thumbnail: handleS3VideoThumbnail,
  svg: handleSvg,
  test_user_link: handleTestUserLink,
  video_thumbnail: handleVideoThumbnail,
  video_thumbnail_v2: handleVideoThumbnailV2,
  waitlist_token: handleWaitlistToken,
}

Deno.serve(async (req: Request) => {
  const cors = getCorsHeaders(req)
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: cors })
  }
  try {
    const bodyText = await req.text()
    let body: Record<string, unknown>
    try {
      body = JSON.parse(bodyText)
    } catch {
      return new Response(JSON.stringify({ error: 'Invalid JSON body' }), { status: 400, headers: { ...cors, 'Content-Type': 'application/json' } })
    }
    const action = body.action as string
    if (!action || !HANDLERS[action]) {
      return new Response(JSON.stringify({ error: `Invalid or missing action. Must be one of: ${Object.keys(HANDLERS).join(', ')}`, received: action ?? null }), { status: 400, headers: { ...cors, 'Content-Type': 'application/json' } })
    }
    const handlerReq = new Request(req.url, { method: req.method, headers: req.headers, body: bodyText })
    return await HANDLERS[action](handlerReq)
  } catch (error: unknown) {
    console.error('[generate-router] Router error:', error)
    return new Response(JSON.stringify({ error: (error as Error).message ?? 'Internal error' }), { status: 500, headers: { ...cors, 'Content-Type': 'application/json' } })
  }
})
