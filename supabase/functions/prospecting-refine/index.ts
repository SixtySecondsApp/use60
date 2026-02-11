import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.43.4'
import Anthropic from 'https://esm.sh/@anthropic-ai/sdk@0.32.1'
import { getCorsHeaders, handleCorsPreflightRequest } from '../_shared/corsHelper.ts'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface RefinementRequest {
  results_sample: Record<string, unknown>[]
  current_criteria: Record<string, unknown>
  provider?: 'apollo' | 'ai_ark'
  action?: 'people_search' | 'company_search'
}

interface Suggestion {
  type: 'add_filter' | 'narrow_filter' | 'broaden_filter' | 'remove_filter'
  description: string
  filter_change: Record<string, unknown>
  estimated_impact: string
}

// ---------------------------------------------------------------------------
// Edge function
// ---------------------------------------------------------------------------

serve(async (req) => {
  // Handle CORS preflight
  const preflightResponse = handleCorsPreflightRequest(req)
  if (preflightResponse) return preflightResponse

  const cors = getCorsHeaders(req)
  const json = (data: unknown, status = 200) =>
    new Response(JSON.stringify(data), {
      status,
      headers: { ...cors, 'Content-Type': 'application/json' },
    })

  try {
    // ------------------------------------------------------------------
    // 1. Auth: validate JWT
    // ------------------------------------------------------------------
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return json({ error: 'Missing authorization', code: 'UNAUTHORIZED' }, 401)
    }

    const anonClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: authHeader } } }
    )

    const { data: { user }, error: authError } = await anonClient.auth.getUser()
    if (authError || !user) {
      return json({ error: 'Unauthorized', code: 'UNAUTHORIZED' }, 401)
    }

    // ------------------------------------------------------------------
    // 2. Org: look up user's organization
    // ------------------------------------------------------------------
    const { data: membership } = await anonClient
      .from('organization_memberships')
      .select('org_id, role')
      .eq('user_id', user.id)
      .limit(1)
      .maybeSingle()

    if (!membership) {
      return json({ error: 'No organization found', code: 'NO_ORG' }, 403)
    }

    // ------------------------------------------------------------------
    // 3. Parse request body
    // ------------------------------------------------------------------
    const body = (await req.json()) as RefinementRequest
    const { results_sample, current_criteria, provider, action } = body

    if (!results_sample || !Array.isArray(results_sample) || results_sample.length === 0) {
      return json({ error: 'results_sample must be a non-empty array', code: 'INVALID_PARAMS' }, 400)
    }
    if (!current_criteria || typeof current_criteria !== 'object') {
      return json({ error: 'current_criteria is required', code: 'INVALID_PARAMS' }, 400)
    }

    // Limit sample size to 50 to keep prompt small
    const sample = results_sample.slice(0, 50)

    // ------------------------------------------------------------------
    // 4. Call Claude Haiku for analysis
    // ------------------------------------------------------------------
    const anthropicKey = Deno.env.get('ANTHROPIC_API_KEY')
    if (!anthropicKey) {
      return json({ error: 'AI provider not configured', code: 'AI_NOT_CONFIGURED' }, 500)
    }

    const providerLabel = provider === 'ai_ark' ? 'AI Ark' : provider === 'apollo' ? 'Apollo.io' : 'the data provider'
    const actionLabel = action === 'company_search' ? 'company search' : 'people search'

    const systemPrompt = `You are an ICP (Ideal Customer Profile) optimization assistant. Analyze search results from ${providerLabel} (${actionLabel}) and suggest refinements to improve lead quality.

Return a JSON object with a "suggestions" array of 3-5 items. Each suggestion must have:
- type: one of "add_filter", "narrow_filter", "broaden_filter", "remove_filter"
- description: human-readable explanation (e.g. "Add VP seniority — 60% of top results are VP+")
- filter_change: the criteria field and new value to apply
- estimated_impact: brief impact estimate (e.g. "+30% relevance", "-20% volume")

Analyze patterns like:
- Common seniority levels, departments, titles in results
- Geographic clustering
- Company size distribution
- Industry concentrations
- Missing filters that could improve targeting
- Filters that appear too broad or too narrow given the results

Return ONLY valid JSON: { "suggestions": [...] }`

    const userPrompt = `Current ICP criteria:
${JSON.stringify(current_criteria, null, 2)}

Search results sample (${sample.length} records):
${JSON.stringify(sample, null, 2)}

Analyze the results and suggest 3-5 filter refinements to improve targeting quality.`

    const anthropic = new Anthropic({ apiKey: anthropicKey })

    const message = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1024,
      system: systemPrompt,
      messages: [{ role: 'user', content: userPrompt }],
    })

    // ------------------------------------------------------------------
    // 5. Parse response
    // ------------------------------------------------------------------
    const responseText = message.content
      .filter((block: { type: string }) => block.type === 'text')
      .map((block: { text: string }) => block.text)
      .join('')

    const validTypes = ['add_filter', 'narrow_filter', 'broaden_filter', 'remove_filter']
    let suggestions: Suggestion[] = []

    try {
      const parsed = JSON.parse(responseText)
      // Handle both { suggestions: [...] } and raw array
      const raw = Array.isArray(parsed) ? parsed : (parsed.suggestions ?? [])
      suggestions = raw
        .filter((s: Suggestion) => validTypes.includes(s.type) && s.description && s.filter_change)
        .slice(0, 5)
    } catch {
      // Try to extract JSON from markdown code block
      const jsonMatch = responseText.match(/```(?:json)?\s*([\s\S]*?)```/)
      if (jsonMatch) {
        try {
          const parsed = JSON.parse(jsonMatch[1])
          const raw = Array.isArray(parsed) ? parsed : (parsed.suggestions ?? [])
          suggestions = raw
            .filter((s: Suggestion) => validTypes.includes(s.type) && s.description && s.filter_change)
            .slice(0, 5)
        } catch {
          console.warn('[prospecting-refine] Failed to parse AI response:', responseText)
        }
      }
    }

    // ------------------------------------------------------------------
    // 6. Return suggestions
    // ------------------------------------------------------------------
    return json({
      suggestions,
      sample_size: sample.length,
      provider: provider ?? null,
      action: action ?? null,
      usage: {
        input_tokens: message.usage?.input_tokens ?? 0,
        output_tokens: message.usage?.output_tokens ?? 0,
      },
    })
  } catch (err) {
    console.error('[prospecting-refine] Unexpected error:', err)
    return json({
      error: (err as Error).message || 'Internal server error',
      code: 'INTERNAL_ERROR',
    }, 500)
  }
})
