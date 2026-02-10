import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.43.4'
import {
  getCorsHeaders,
  handleCorsPreflightRequest,
  jsonResponse,
  errorResponse,
} from '../_shared/corsHelper.ts'

const APIFY_API_BASE = 'https://api.apify.com/v2'
const CACHE_TTL_MS = 24 * 60 * 60 * 1000 // 24 hours

interface IntrospectRequest {
  actor_id: string
}

serve(async (req) => {
  // Handle CORS preflight
  const preflightResponse = handleCorsPreflightRequest(req)
  if (preflightResponse) return preflightResponse

  try {
    const body = (await req.json()) as IntrospectRequest
    const { actor_id } = body

    if (!actor_id) {
      return errorResponse('Missing "actor_id" field', req, 400)
    }

    // --- Auth: JWT -> user -> org membership ---
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return errorResponse('Missing authorization', req, 401)
    }

    const userClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: authHeader } } }
    )

    const {
      data: { user },
      error: authError,
    } = await userClient.auth.getUser()
    if (authError || !user) {
      return errorResponse('Unauthorized', req, 401)
    }

    const { data: membership } = await userClient
      .from('organization_memberships')
      .select('org_id')
      .eq('user_id', user.id)
      .limit(1)
      .maybeSingle()

    if (!membership) {
      return errorResponse('No organization found', req, 400)
    }

    const orgId = membership.org_id

    // Service role client for cache + credential reads
    const svc = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      { auth: { persistSession: false, autoRefreshToken: false } }
    )

    // --- Check cache ---
    const { data: cached } = await svc
      .from('actor_schema_cache')
      .select('input_schema, actor_name, actor_description, default_input, fetched_at')
      .eq('org_id', orgId)
      .eq('actor_id', actor_id)
      .maybeSingle()

    if (cached) {
      const fetchedAt = new Date(cached.fetched_at).getTime()
      const age = Date.now() - fetchedAt
      if (age < CACHE_TTL_MS) {
        return jsonResponse(
          {
            actor_id,
            name: cached.actor_name,
            description: cached.actor_description,
            input_schema: cached.input_schema,
            default_input: cached.default_input,
            cached: true,
            fetched_at: cached.fetched_at,
          },
          req
        )
      }
    }

    // --- Fetch from Apify ---
    const { data: creds } = await svc
      .from('integration_credentials')
      .select('credentials')
      .eq('organization_id', orgId)
      .eq('provider', 'apify')
      .maybeSingle()

    const apiToken = (creds?.credentials as Record<string, string>)?.api_token
    if (!apiToken) {
      return errorResponse(
        'Apify not configured. Please connect Apify in Settings > Integrations.',
        req,
        400
      )
    }

    // Apify actor ID can be "username/actor-name" — encode the slash
    const encodedActorId = encodeURIComponent(actor_id)
    const apifyRes = await fetch(
      `${APIFY_API_BASE}/acts/${encodedActorId}?token=${encodeURIComponent(apiToken)}`
    )

    if (!apifyRes.ok) {
      const errText = await apifyRes.text()
      console.error('[apify-actor-introspect] Apify error:', apifyRes.status, errText)

      if (apifyRes.status === 404) {
        return errorResponse(`Actor "${actor_id}" not found`, req, 404)
      }
      if (apifyRes.status === 401) {
        return errorResponse('Invalid Apify token', req, 401)
      }
      if (apifyRes.status === 403) {
        return errorResponse(`No access to actor "${actor_id}"`, req, 403)
      }
      return errorResponse(`Apify API error: ${apifyRes.status}`, req, 400)
    }

    const apifyData = await apifyRes.json() as Record<string, unknown>
    const actorData = (apifyData.data || apifyData) as Record<string, unknown>

    const inputSchema = actorData.defaultRunOptions
      ? (actorData as Record<string, unknown>).defaultRunInput
      : null

    // Try to get the actor's input schema from the /input-schema endpoint or build section
    // The input schema is typically in actorData.defaultRunInput?.inputSchema or from builds
    let schema = inputSchema
    const versions = (actorData.versions || []) as Array<Record<string, unknown>>
    const latestVersion = versions.find((v) => v.versionNumber === actorData.defaultRunOptions)
      || versions[versions.length - 1]

    if (latestVersion?.buildTag) {
      // Fetch input schema from the latest build
      const buildId = latestVersion.buildTag
      const buildRes = await fetch(
        `${APIFY_API_BASE}/acts/${encodedActorId}/builds/${buildId}?token=${encodeURIComponent(apiToken)}`
      )
      if (buildRes.ok) {
        const buildData = await buildRes.json() as Record<string, unknown>
        const build = (buildData.data || buildData) as Record<string, unknown>
        if (build.inputSchema) {
          // inputSchema can be a JSON string or object
          schema = typeof build.inputSchema === 'string'
            ? JSON.parse(build.inputSchema)
            : build.inputSchema
        }
      }
    }

    // If still no schema, try the actor's default run input
    if (!schema && actorData.defaultRunInput) {
      const defaultInput = actorData.defaultRunInput as Record<string, unknown>
      if (defaultInput.inputSchema) {
        schema = typeof defaultInput.inputSchema === 'string'
          ? JSON.parse(defaultInput.inputSchema as string)
          : defaultInput.inputSchema
      }
    }

    const actorName = (actorData.name as string) || actor_id
    const actorDescription = (actorData.description as string)
      || (actorData.title as string)
      || null
    const defaultInput = (actorData.exampleRunInput as Record<string, unknown>)?.body
      || null

    // --- Upsert cache ---
    const { error: cacheError } = await svc
      .from('actor_schema_cache')
      .upsert(
        {
          org_id: orgId,
          actor_id,
          input_schema: schema,
          actor_name: actorName,
          actor_description: actorDescription,
          default_input: defaultInput,
          fetched_at: new Date().toISOString(),
        },
        { onConflict: 'org_id,actor_id' }
      )

    if (cacheError) {
      console.error('[apify-actor-introspect] Cache upsert error:', cacheError)
      // Non-fatal — still return the data
    }

    return jsonResponse(
      {
        actor_id,
        name: actorName,
        description: actorDescription,
        input_schema: schema,
        default_input: defaultInput,
        cached: false,
        fetched_at: new Date().toISOString(),
      },
      req
    )
  } catch (error) {
    console.error('[apify-actor-introspect] Error:', error)
    return errorResponse((error as Error).message, req, 500)
  }
})
