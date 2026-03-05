import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { getCorsHeaders, handleCorsPreflightRequest } from '../_shared/corsHelper.ts';

import { handlePoll as stuckBots } from './handlers/stuck-bots.ts'
import { handlePoll as transcriptionQueue } from './handlers/transcription-queue.ts'
import { handlePoll as gladiaJobs } from './handlers/gladia-jobs.ts'
import { handlePoll as s3UploadQueue } from './handlers/s3-upload-queue.ts'
import { handlePoll as voiceTranscribe } from './handlers/voice-transcribe.ts'
import { handlePoll as slackSnooze } from './handlers/slack-snooze.ts'

const pollHandlers: Record<string, (req: Request) => Promise<Response>> = {
  'stuck-bots': stuckBots,
  'transcription-queue': transcriptionQueue,
  'gladia-jobs': gladiaJobs,
  's3-upload-queue': s3UploadQueue,
  'voice-transcribe': voiceTranscribe,
  'slack-snooze': slackSnooze,
}

serve(async (req) => {
  const corsPreflightResponse = handleCorsPreflightRequest(req);
  if (corsPreflightResponse) return corsPreflightResponse;
  const corsHeaders = getCorsHeaders(req);

  try {
    const url = new URL(req.url)
    const pathSegments = url.pathname.split('/').filter(s =>
      s && s !== 'functions' && s !== 'v1' && s !== 'poll-scheduler'
    )
    const pollType = pathSegments[0] || url.searchParams.get('type')

    if (!pollType || !pollHandlers[pollType]) {
      return new Response(
        JSON.stringify({
          error: `Invalid poll type "${pollType}". Valid types: ${Object.keys(pollHandlers).join(', ')}`
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    return await pollHandlers[pollType](req)
  } catch (error) {
    console.error('poll-scheduler router error:', error)
    return new Response(
      JSON.stringify({ error: error.message || 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
