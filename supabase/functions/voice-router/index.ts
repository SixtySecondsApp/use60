import { getCorsHeaders } from '../_shared/corsHelper.ts'
import { handleAudioUrl } from './handlers/audio-url.ts'
import { handlePresignedUrl } from './handlers/presigned-url.ts'
import { handleShare } from './handlers/share.ts'
import { handleSharePlayback } from './handlers/share-playback.ts'
import { handleTranscribe } from './handlers/transcribe.ts'
import { handleUpload } from './handlers/upload.ts'

const HANDLERS: Record<string, (req: Request) => Promise<Response>> = {
  audio_url: handleAudioUrl,
  presigned_url: handlePresignedUrl,
  share: handleShare,
  share_playback: handleSharePlayback,
  transcribe: handleTranscribe,
  upload: handleUpload,
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
    console.error('[voice-router] Router error:', error)
    return new Response(JSON.stringify({ error: (error as Error).message ?? 'Internal error' }), { status: 500, headers: { ...cors, 'Content-Type': 'application/json' } })
  }
})
