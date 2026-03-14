import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { getCorsHeaders, handleCorsPreflightRequest } from '../_shared/corsHelper.ts';

import { handleWebhook as apifyWebhook } from './handlers/apify.ts'
import { handleWebhook as fathomWebhook } from './handlers/fathom.ts'
import { handleWebhook as stripeWebhook } from './handlers/stripe.ts'
import { handleWebhook as sentryWebhook } from './handlers/sentry.ts'
import { handleWebhook as justcallWebhook } from './handlers/justcall.ts'
import { handleWebhook as bettercontactWebhook } from './handlers/bettercontact.ts'

const providerHandlers: Record<string, (req: Request) => Promise<Response>> = {
  apify: apifyWebhook,
  fathom: fathomWebhook,
  stripe: stripeWebhook,
  sentry: sentryWebhook,
  justcall: justcallWebhook,
  bettercontact: bettercontactWebhook,
}

serve(async (req) => {
  const corsPreflightResponse = handleCorsPreflightRequest(req);
  if (corsPreflightResponse) return corsPreflightResponse;
  const corsHeaders = getCorsHeaders(req);

  try {
    const url = new URL(req.url)
    const pathSegments = url.pathname.split('/').filter(s =>
      s && s !== 'functions' && s !== 'v1' && s !== 'webhook-integrations'
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
    console.error('webhook-integrations router error:', error)
    return new Response(
      JSON.stringify({ error: error.message || 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
