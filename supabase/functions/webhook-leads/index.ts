import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { getCorsHeaders, handleCorsPreflightRequest } from '../_shared/corsHelper.ts';

import { handleWebhook as facebookWebhook } from './handlers/facebook.ts'
import { handleWebhook as savvycalWebhook } from './handlers/savvycal.ts'
import { handleWebhook as opsTableInboundWebhook } from './handlers/ops-table-inbound.ts'

const providerHandlers: Record<string, (req: Request) => Promise<Response>> = {
  facebook: facebookWebhook,
  savvycal: savvycalWebhook,
  'ops-table-inbound': opsTableInboundWebhook,
}

serve(async (req) => {
  const corsPreflightResponse = handleCorsPreflightRequest(req);
  if (corsPreflightResponse) return corsPreflightResponse;
  const corsHeaders = getCorsHeaders(req);

  try {
    const url = new URL(req.url)
    const pathSegments = url.pathname.split('/').filter(s =>
      s && s !== 'functions' && s !== 'v1' && s !== 'webhook-leads'
    )
    const provider = pathSegments[0] || url.searchParams.get('provider')

    if (!provider || !providerHandlers[provider]) {
      return new Response(
        JSON.stringify({
          error: `Invalid provider "${provider}". Valid: ${Object.keys(providerHandlers).join(', ')}`
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    return await providerHandlers[provider](req)
  } catch (error) {
    console.error('webhook-leads router error:', error)
    return new Response(
      JSON.stringify({ error: error.message || 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
