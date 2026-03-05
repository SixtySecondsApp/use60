import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { getCorsHeaders, handleCorsPreflightRequest } from '../_shared/corsHelper.ts';

import { handleBackfill as transcripts } from './handlers/transcripts.ts'
import { handleBackfill as thumbnails } from './handlers/thumbnails.ts'
import { handleBackfill as standardOpsTables } from './handlers/standard-ops-tables.ts'
import { handleBackfill as notetakerTranscripts } from './handlers/notetaker-transcripts.ts'
import { handleBackfill as leadSources } from './handlers/lead-sources.ts'
import { handleBackfill as memory } from './handlers/memory.ts'
import { handleBackfill as autopilot } from './handlers/autopilot.ts'
import { handleBackfill as fathomCompanies } from './handlers/fathom-companies.ts'
import { handleBackfill as warmth } from './handlers/warmth.ts'

const backfillHandlers: Record<string, (req: Request) => Promise<Response>> = {
  'transcripts': transcripts,
  'thumbnails': thumbnails,
  'standard-ops-tables': standardOpsTables,
  'notetaker-transcripts': notetakerTranscripts,
  'lead-sources': leadSources,
  'memory': memory,
  'autopilot': autopilot,
  'fathom-companies': fathomCompanies,
  'warmth': warmth,
}

serve(async (req) => {
  const corsPreflightResponse = handleCorsPreflightRequest(req);
  if (corsPreflightResponse) return corsPreflightResponse;
  const corsHeaders = getCorsHeaders(req);

  try {
    const url = new URL(req.url)
    const pathSegments = url.pathname.split('/').filter(s =>
      s && s !== 'functions' && s !== 'v1' && s !== 'backfill-runner'
    )
    const backfillType = pathSegments[0] || url.searchParams.get('type')

    if (!backfillType || !backfillHandlers[backfillType]) {
      return new Response(
        JSON.stringify({
          error: `Invalid backfill type "${backfillType}". Valid types: ${Object.keys(backfillHandlers).join(', ')}`
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    return await backfillHandlers[backfillType](req)
  } catch (error) {
    console.error('backfill-runner router error:', error)
    return new Response(
      JSON.stringify({ error: error.message || 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
