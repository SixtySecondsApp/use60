// supabase/functions/run-skill/index.ts
// Lightweight skill executor for frontend UI components.
// Authenticates the user JWT, resolves org context, then dispatches
// directly to the target edge function — no AdapterRegistry overhead.
//
// POST /run-skill
// {
//   skill_key: 'generate-proposal-v2',
//   context: { deal_id, meeting_id, proposal_id, ... }
// }
//
// Auth: User JWT required (extracts user_id from token, org_id from context or profile).

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.43.4'
import {
  getCorsHeaders,
  handleCorsPreflightRequest,
  errorResponse,
} from '../_shared/corsHelper.ts'

const LOG_PREFIX = '[run-skill]'

serve(async (req: Request) => {
  const preflight = handleCorsPreflightRequest(req)
  if (preflight) return preflight

  if (req.method !== 'POST') {
    return errorResponse('Method not allowed', req, 405)
  }

  try {
    // ---------------------------------------------------------------
    // Auth — extract user from JWT
    // ---------------------------------------------------------------
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return errorResponse('Authorization header required', req, 401)
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!

    const token = authHeader.replace('Bearer ', '')
    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: `Bearer ${token}` } },
    })

    const { data: { user }, error: authError } = await userClient.auth.getUser()
    if (authError || !user) {
      console.error(`${LOG_PREFIX} Auth failed:`, authError?.message)
      return errorResponse('Invalid or expired token', req, 401)
    }

    // Service-role client for DB lookups
    const serviceClient = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { persistSession: false },
    })

    // ---------------------------------------------------------------
    // Parse request
    // ---------------------------------------------------------------
    const body = await req.json()
    const { skill_key, context = {} } = body as {
      skill_key?: string
      context?: Record<string, unknown>
    }

    if (!skill_key) {
      return errorResponse('skill_key is required', req, 400)
    }

    // Resolve org_id from context or user's profile
    let orgId: string | null = (context.org_id as string) ?? null

    if (!orgId) {
      const { data: profile } = await serviceClient
        .from('profiles')
        .select('org_id')
        .eq('id', user.id)
        .maybeSingle()

      orgId = (profile?.org_id as string) ?? null
    }

    console.log(
      `${LOG_PREFIX} skill=${skill_key} user=${user.id} org=${orgId}`,
    )

    // ---------------------------------------------------------------
    // Dispatch — route skill_key to its target edge function
    // ---------------------------------------------------------------
    if (skill_key === 'generate-proposal-v2') {
      const pipelineBody = {
        proposal_id: context.proposal_id ?? undefined,
        deal_id: context.deal_id ?? undefined,
        meeting_id: context.meeting_id ?? undefined,
        contact_id: context.contact_id ?? undefined,
        trigger_type: context.trigger_type ?? 'manual_button',
        user_id: user.id,
        org_id: orgId,
      }

      console.log(`${LOG_PREFIX} Dispatching to proposal-pipeline-v2`, JSON.stringify(pipelineBody))

      const pipelineResp = await fetch(
        `${supabaseUrl}/functions/v1/proposal-pipeline-v2`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${supabaseServiceKey}`,
          },
          body: JSON.stringify(pipelineBody),
        },
      )

      const pipelineData = pipelineResp.ok
        ? await pipelineResp.json().catch(() => ({}))
        : { error: await pipelineResp.text().catch(() => `HTTP ${pipelineResp.status}`) }

      console.log(
        `${LOG_PREFIX} Pipeline response: status=${pipelineResp.status}`,
        pipelineResp.ok ? 'ok' : pipelineData.error,
      )

      const corsHeaders = getCorsHeaders(req)
      return new Response(
        JSON.stringify({
          success: pipelineResp.ok,
          data: pipelineResp.ok ? pipelineData : null,
          error: pipelineResp.ok ? null : (pipelineData.error || `Pipeline returned ${pipelineResp.status}`),
        }),
        {
          status: pipelineResp.ok ? 200 : 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        },
      )
    }

    // ---------------------------------------------------------------
    // Unknown skill — return error
    // ---------------------------------------------------------------
    console.warn(`${LOG_PREFIX} Unknown skill_key: ${skill_key}`)
    const corsHeaders = getCorsHeaders(req)
    return new Response(
      JSON.stringify({
        success: false,
        data: null,
        error: `Unknown skill: ${skill_key}. Only generate-proposal-v2 is supported via run-skill.`,
      }),
      {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      },
    )
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error(`${LOG_PREFIX} Error:`, message)
    return errorResponse(message, req, 500)
  }
})
