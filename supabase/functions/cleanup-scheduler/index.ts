import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { getCorsHeaders, handleCorsPreflightRequest } from '../_shared/corsHelper.ts';

import { handleCleanup as logsCleanup } from './handlers/logs.ts'
import { handleCleanup as ccDailyCleanup } from './handlers/cc-daily.ts'
import { handleCleanup as expiredInvitations } from './handlers/expired-invitations.ts'
import { handleCleanup as incompleteOnboarding } from './handlers/incomplete-onboarding.ts'

const cleanupHandlers: Record<string, (req: Request) => Promise<Response>> = {
  'logs': logsCleanup,
  'cc-daily': ccDailyCleanup,
  'expired-invitations': expiredInvitations,
  'incomplete-onboarding': incompleteOnboarding,
}

serve(async (req) => {
  const corsPreflightResponse = handleCorsPreflightRequest(req);
  if (corsPreflightResponse) return corsPreflightResponse;
  const corsHeaders = getCorsHeaders(req);

  try {
    const url = new URL(req.url)
    const pathSegments = url.pathname.split('/').filter(s =>
      s && s !== 'functions' && s !== 'v1' && s !== 'cleanup-scheduler'
    )
    const task = pathSegments[0] || url.searchParams.get('task')

    // If no specific task, run all cleanup tasks in sequence
    if (!task) {
      const results: Record<string, any> = {}
      for (const [name, handler] of Object.entries(cleanupHandlers)) {
        try {
          const resp = await handler(req)
          results[name] = { status: resp.status, ok: resp.ok }
        } catch (err) {
          results[name] = { status: 500, error: err.message }
        }
      }
      return new Response(
        JSON.stringify({ message: 'All cleanup tasks executed', results }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    if (!cleanupHandlers[task]) {
      return new Response(
        JSON.stringify({
          error: `Invalid task "${task}". Valid tasks: ${Object.keys(cleanupHandlers).join(', ')}`
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    return await cleanupHandlers[task](req)
  } catch (error) {
    console.error('cleanup-scheduler router error:', error)
    return new Response(
      JSON.stringify({ error: error.message || 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
