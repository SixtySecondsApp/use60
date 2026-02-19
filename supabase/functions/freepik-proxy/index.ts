import { serve } from 'https://deno.land/std@0.224.0/http/server.ts'
import { getCorsHeaders, handleCorsPreflightRequest } from '../_shared/corsHelper.ts';

const FREEPIK_API_BASE = 'https://api.freepik.com/v1/ai'

type SupportedMethod = 'GET' | 'POST'

interface ProxyRequestBody {
  endpoint?: string
  method?: SupportedMethod
  payload?: Record<string, unknown> | null
}

async function forwardRequest(endpoint: string, method: SupportedMethod, payload: any, apiKey: string) {
  const url = `${FREEPIK_API_BASE}${endpoint}`
  
  console.log(`[freepik-proxy] Forwarding request`, {
    method,
    endpoint,
    url,
    hasPayload: !!payload
  })

  const fetchInit: RequestInit = {
    method,
    headers: {
      'Accept': 'application/json',
      'Content-Type': 'application/json',
      'x-freepik-api-key': apiKey
    }
  }

  if (method !== 'GET') {
    fetchInit.body = JSON.stringify(payload ?? {})
  }

  const response = await fetch(url, fetchInit)
  const responseText = await response.text()

  let parsedBody: unknown = null
  if (responseText) {
    try {
      parsedBody = JSON.parse(responseText)
    } catch {
      parsedBody = { raw: responseText }
    }
  }

  console.log(`[freepik-proxy] Response received`, {
    method,
    endpoint,
    status: response.status,
    ok: response.ok,
    hasBody: !!parsedBody,
    bodyKeys: parsedBody && typeof parsedBody === 'object' ? Object.keys(parsedBody) : []
  })

  return { response, parsedBody }
}

serve(async (req) => {
  const corsPreflightResponse = handleCorsPreflightRequest(req);
  if (corsPreflightResponse) return corsPreflightResponse;
  const corsHeaders = getCorsHeaders(req);

  if (req.method !== 'POST') {
    return new Response(
      JSON.stringify({ error: 'Method not allowed' }),
      { status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }

  try {
    const apiKey = Deno.env.get('FREEPIK_API_KEY')
    if (!apiKey) {
      return new Response(
        JSON.stringify({ error: 'Freepik API key is not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const body: ProxyRequestBody = await req.json().catch(() => ({}))
    const endpoint = body.endpoint
    const method = (body.method || 'POST').toUpperCase() as SupportedMethod

    if (!endpoint || typeof endpoint !== 'string' || !endpoint.startsWith('/')) {
      return new Response(
        JSON.stringify({ error: 'A valid Freepik endpoint path is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    if (method !== 'GET' && method !== 'POST') {
      return new Response(
        JSON.stringify({ error: `Unsupported method ${method}` }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const { response, parsedBody } = await forwardRequest(endpoint, method, body.payload, apiKey)
    const headers = { ...corsHeaders, 'Content-Type': 'application/json' }

    if (!response.ok) {
      console.error(`[freepik-proxy] API error`, {
        endpoint,
        method,
        status: response.status,
        error: parsedBody
      })
      return new Response(
        JSON.stringify({
          error: parsedBody && typeof parsedBody === 'object' && 'message' in parsedBody
            ? (parsedBody as { message?: string }).message
            : 'Freepik API error',
          status: response.status,
          details: parsedBody
        }),
        { status: response.status, headers }
      )
    }

    return new Response(
      JSON.stringify(parsedBody ?? {}),
      { status: response.status, headers }
    )
  } catch (error) {
    console.error('[freepik-proxy] unexpected error', error)
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unexpected server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})

