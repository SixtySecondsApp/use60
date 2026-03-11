// @ts-nocheck — Deno edge function
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { getCorsHeaders, handleCorsPreflightRequest } from '../_shared/corsHelper.ts'

/**
 * encode-tags — Proxy to the tag encoding API (avoids CORS issues in browser).
 *
 * POST body: { tags: string[] }
 * Response:  { encoded: string[] }
 */

serve(async (req: Request) => {
  const preflight = handleCorsPreflightRequest(req)
  if (preflight) return preflight

  const cors = getCorsHeaders(req)
  const JSON_HEADERS = { ...cors, 'Content-Type': 'application/json' }

  try {
    const { tags } = await req.json()
    if (!Array.isArray(tags) || tags.length === 0) {
      return new Response(JSON.stringify({ error: 'tags[] required' }), { status: 400, headers: JSON_HEADERS })
    }

    // Encode all tags in parallel
    const encoded = await Promise.all(
      tags.map(async (rawTag: string) => {
        try {
          const resp = await fetch(
            'https://d1sscslwml.execute-api.eu-west-2.amazonaws.com/Production',
            {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ rawurl: rawTag }),
            }
          )
          if (!resp.ok) return ''
          const data = await resp.json()
          return data.body ?? ''
        } catch {
          return ''
        }
      })
    )

    return new Response(JSON.stringify({ encoded }), { status: 200, headers: JSON_HEADERS })
  } catch (err: any) {
    console.error('[encode-tags] Error:', err)
    return new Response(JSON.stringify({ error: err.message ?? 'Internal error' }), { status: 500, headers: JSON_HEADERS })
  }
})
