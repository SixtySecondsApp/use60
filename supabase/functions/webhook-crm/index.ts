import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { getCorsHeaders, handleCorsPreflightRequest } from '../_shared/corsHelper.ts';

import { handleWebhook as hubspotWebhook } from './handlers/hubspot.ts'
import { handleWebhook as attioWebhook } from './handlers/attio.ts'
import { handleWebhook as bullhornWebhook } from './handlers/bullhorn.ts'

const providerHandlers: Record<string, (req: Request) => Promise<Response>> = {
  hubspot: hubspotWebhook,
  attio: attioWebhook,
  bullhorn: bullhornWebhook,
}

serve(async (req) => {
  const corsPreflightResponse = handleCorsPreflightRequest(req);
  if (corsPreflightResponse) return corsPreflightResponse;
  const corsHeaders = getCorsHeaders(req);

  try {
    const url = new URL(req.url)
    const pathSegments = url.pathname.split('/').filter(s =>
      s && s !== 'functions' && s !== 'v1' && s !== 'webhook-crm'
    )
    const provider = pathSegments[0] || url.searchParams.get('provider')

    if (!provider || !providerHandlers[provider]) {
      return new Response(
        JSON.stringify({
          error: `Invalid CRM provider "${provider}". Valid: ${Object.keys(providerHandlers).join(', ')}`
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    return await providerHandlers[provider](req)
  } catch (error) {
    console.error('webhook-crm router error:', error)
    return new Response(
      JSON.stringify({ error: error.message || 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
