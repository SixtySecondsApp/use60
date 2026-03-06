import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { getCorsHeaders, handleCorsPreflightRequest } from '../_shared/corsHelper.ts';

import { handleInitiate as googleInitiate } from './providers/google.ts'
import { handleInitiate as hubspotInitiate } from './providers/hubspot.ts'
import { handleInitiate as fathomInitiate } from './providers/fathom.ts'
import { handleInitiate as attioInitiate } from './providers/attio.ts'
import { handleInitiate as bullhornInitiate } from './providers/bullhorn.ts'

const providerHandlers: Record<string, (req: Request) => Promise<Response>> = {
  google: googleInitiate,
  hubspot: hubspotInitiate,
  fathom: fathomInitiate,
  attio: attioInitiate,
  bullhorn: bullhornInitiate,
}

serve(async (req) => {
  const corsPreflightResponse = handleCorsPreflightRequest(req);
  if (corsPreflightResponse) return corsPreflightResponse;
  const corsHeaders = getCorsHeaders(req);

  try {
    const url = new URL(req.url)

    // Extract provider from path or query param
    // /oauth-initiate/google or ?provider=google
    const pathSegments = url.pathname.split('/').filter(s =>
      s && s !== 'functions' && s !== 'v1' && s !== 'oauth-initiate'
    )
    const provider = pathSegments[0] || url.searchParams.get('provider')

    if (!provider || !providerHandlers[provider]) {
      return new Response(
        JSON.stringify({
          error: `Invalid provider "${provider}". Valid providers: ${Object.keys(providerHandlers).join(', ')}`
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    return await providerHandlers[provider](req)

  } catch (error) {
    console.error('oauth-initiate router error:', error)
    return new Response(
      JSON.stringify({ error: error.message || 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
