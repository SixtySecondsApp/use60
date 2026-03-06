import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { getCorsHeaders, handleCorsPreflightRequest } from '../_shared/corsHelper.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.43.4'

import { handleRefresh as googleRefresh } from './providers/google.ts'
import { handleRefresh as hubspotRefresh } from './providers/hubspot.ts'
import { handleRefresh as fathomRefresh } from './providers/fathom.ts'
import { handleRefresh as attioRefresh } from './providers/attio.ts'
import { handleRefresh as bullhornRefresh } from './providers/bullhorn.ts'

const providerHandlers: Record<string, (req: Request) => Promise<Response>> = {
  google: googleRefresh,
  hubspot: hubspotRefresh,
  fathom: fathomRefresh,
  attio: attioRefresh,
  bullhorn: bullhornRefresh,
}

serve(async (req) => {
  const corsPreflightResponse = handleCorsPreflightRequest(req);
  if (corsPreflightResponse) return corsPreflightResponse;
  const corsHeaders = getCorsHeaders(req);

  try {
    const url = new URL(req.url)

    // Extract provider from path or query param
    // /oauth-token-refresh/google or ?provider=google
    const pathSegments = url.pathname.split('/').filter(s =>
      s && s !== 'functions' && s !== 'v1' && s !== 'oauth-token-refresh'
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
    console.error('oauth-token-refresh router error:', error)
    return new Response(
      JSON.stringify({ error: error.message || 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
