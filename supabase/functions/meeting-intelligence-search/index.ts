/**
 * @deprecated This edge function is DEPRECATED. Use `meeting-analytics/api/search/ask` instead.
 *
 * V1 Meeting Intelligence Search — Google Gemini File Search + Claude query parsing.
 * Replaced by the Railway-backed meeting-analytics system (pgvector + OpenAI embeddings + GPT-4o-mini).
 *
 * All new search integrations should call `meeting-analytics/api/search/ask`.
 * Frontend hooks have been migrated to use `meetingAnalyticsService.askMeeting()`.
 *
 * This function is kept for backwards compatibility but will be removed in a future release.
 * Last active callers migrated: 2026-02-25
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.43.4'
import { getCorsHeaders, handleCorsPreflightRequest } from '../_shared/corsHelper.ts';
import { logAICostEvent, checkCreditBalance } from '../_shared/costTracking.ts';

const GEMINI_API_BASE = 'https://generativelanguage.googleapis.com/v1beta'
const ANTHROPIC_API_BASE = 'https://api.anthropic.com/v1'

/**
 * Get user's organization ID
 */
async function getUserOrgId(userId: string, supabase: any): Promise<string | null> {
  const { data } = await supabase
    .from('organization_memberships')
    .select('org_id')
    .eq('user_id', userId)
    .order('created_at', { ascending: true })
    .limit(1)
    .single()

  return data?.org_id || null
}

interface SearchRequest {
  query: string
  filters?: {
    sentiment?: 'positive' | 'negative' | 'neutral'
    date_from?: string
    date_to?: string
    company_id?: string
    contact_id?: string
    has_action_items?: boolean
    owner_user_id?: string | null // null = all team, undefined = current user, string = specific user
  }
}

interface ParsedQuery {
  semantic_query: string | null
  structured_filters: {
    sentiment?: 'positive' | 'negative' | 'neutral'
    date_from?: string
    date_to?: string
    company_name?: string
    contact_name?: string
    has_action_items?: boolean
  }
  inputTokens?: number
  outputTokens?: number
}

interface SearchResult {
  answer: string
  sources: Array<{
    source_type: 'meeting' | 'call'
    source_id: string
    title: string
    date: string
    company_name: string | null
    owner_name?: string | null
    relevance_snippet: string
    sentiment_score?: number | null
    speaker_name?: string | null
    fathom_share_url?: string | null
    timestamp_seconds?: number | null
  }>
  query_metadata: {
    semantic_query: string | null
    filters_applied: object
    meetings_searched: number
    response_time_ms: number
  }
}

/**
 * Extract speaker name from transcript snippet
 * Transcript format: "Speaker Name: text content here"
 */
function extractSpeakerFromSnippet(snippet: string): { speaker: string | null; text: string } {
  if (!snippet) return { speaker: null, text: snippet }

  // Match "Speaker Name: text" pattern (first line only)
  const firstLine = snippet.split('\n')[0]
  const match = firstLine.match(/^([^:]{2,50}):\s*(.+)$/s)

  if (match) {
    const speaker = match[1].trim()
    // Avoid false positives like "Note:" or "Summary:"
    const excludePatterns = /^(note|summary|action|item|key|point|next|step|follow)s?$/i
    if (!excludePatterns.test(speaker)) {
      return { speaker, text: match[2].trim() + (snippet.includes('\n') ? '...' : '') }
    }
  }

  return { speaker: null, text: snippet }
}

/**
 * Parse user query to extract semantic intent and structured filters
 * Uses Claude for intelligent query understanding
 */
async function parseQueryWithClaude(
  query: string,
  anthropicApiKey: string
): Promise<ParsedQuery> {
  const systemPrompt = `You are a query parser for a meeting search system. Analyze the user's query and extract:

1. SEMANTIC_QUERY: The content/topic to search for semantically (what they want to find in meeting transcripts)
2. STRUCTURED_FILTERS: A JSON object with any of these if explicitly mentioned:
   - sentiment: "positive" | "negative" | "neutral" (only if user mentions mood/sentiment)
   - date_from: ISO date string (if they mention time range like "last week", "past month")
   - date_to: ISO date string (for time ranges)
   - company_name: string (if they mention a specific company by name)
   - contact_name: string (if they mention a specific person)
   - has_action_items: boolean (if they mention action items/todos/tasks)

IMPORTANT RULES:
- For date calculations, today is ${new Date().toISOString().split('T')[0]}
- "last week" means date_from is 7 days ago, date_to is today
- "last month" means date_from is 30 days ago
- If the query is just about topics/content, structured_filters should be empty {}
- Extract company/contact names only if explicitly mentioned
- Return valid JSON only, no markdown`

  const userPrompt = `Parse this meeting search query:
"${query}"

Respond with JSON only:
{
  "semantic_query": "topic or null if pure filter query",
  "structured_filters": { /* only include filters if mentioned */ }
}`

  try {
    const response = await fetch(`${ANTHROPIC_API_BASE}/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': anthropicApiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 500,
        messages: [
          { role: 'user', content: userPrompt }
        ],
        system: systemPrompt
      })
    })

    if (!response.ok) {
      console.error('Claude API error:', await response.text())
      // Fallback: treat entire query as semantic
      return {
        semantic_query: query,
        structured_filters: {}
      }
    }

    const data = await response.json()
    const content = data.content?.[0]?.text || '{}'

    // Parse the JSON response
    const parsed = JSON.parse(content.replace(/```json\n?|\n?```/g, ''))
    return {
      semantic_query: parsed.semantic_query || query,
      structured_filters: parsed.structured_filters || {},
      inputTokens: data.usage?.input_tokens || 0,
      outputTokens: data.usage?.output_tokens || 0,
    }
  } catch (error) {
    console.error('Query parsing error:', error)
    // Fallback: treat entire query as semantic
    return {
      semantic_query: query,
      structured_filters: {},
      inputTokens: 0,
      outputTokens: 0,
    }
  }
}

/**
 * Build metadata filter string for Google File Search
 */
function buildMetadataFilter(
  filters: ParsedQuery['structured_filters'],
  explicitFilters?: SearchRequest['filters']
): string | null {
  const conditions: string[] = []
  const mergedFilters = { ...filters, ...explicitFilters }

  if (mergedFilters.sentiment) {
    conditions.push(`sentiment_label = "${mergedFilters.sentiment}"`)
  }

  if (mergedFilters.has_action_items !== undefined) {
    conditions.push(`has_action_items = "${mergedFilters.has_action_items}"`)
  }

  // Date filters would need to be handled differently
  // Google File Search metadata doesn't support range queries well
  // We'll apply date filtering post-search via PostgreSQL

  if (conditions.length === 0) return null
  return conditions.join(' AND ')
}

/**
 * Search meetings using Google File Search
 */
async function searchWithFileSearch(
  storeName: string,
  semanticQuery: string,
  metadataFilter: string | null,
  geminiApiKey: string
): Promise<{
  answer: string
  groundingChunks: Array<{
    fileChunk?: {
      fileName: string
      content: string
    }
  }>
}> {
  const requestBody: any = {
    contents: [{ parts: [{ text: semanticQuery }] }],
    tools: [{
      fileSearch: {
        fileSearchStoreNames: [storeName]
      }
    }],
    systemInstruction: {
      parts: [{
        text: `You are a meeting intelligence assistant helping users find information across their sales meetings.

When answering:
1. Be concise but comprehensive
2. Always cite specific meetings by title and date
3. Quote relevant passages when helpful
4. If you can't find relevant information, say so clearly
5. Format your response with clear structure (use bullet points, headers as needed)
6. Focus on actionable insights from the meetings`
      }]
    },
    generationConfig: {
      temperature: 0.3,
      maxOutputTokens: 2048
    }
  }

  // Add metadata filter if present
  if (metadataFilter) {
    requestBody.tools[0].fileSearch.metadataFilter = metadataFilter
  }

  const response = await fetch(
    `${GEMINI_API_BASE}/models/gemini-2.5-flash:generateContent?key=${geminiApiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestBody)
    }
  )

  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(`File Search failed: ${errorText}`)
  }

  const data = await response.json()

  // Extract the answer and grounding chunks
  const answer = data.candidates?.[0]?.content?.parts?.[0]?.text || 'No relevant information found.'
  const groundingChunks = data.candidates?.[0]?.groundingMetadata?.groundingChunks || []

  return { answer, groundingChunks }
}

/**
 * Enrich search results with meeting metadata from PostgreSQL
 * Supports team-wide search when ownerUserId is null
 */
async function enrichResultsWithMetadata(
  groundingChunks: any[],
  currentUserId: string,
  ownerUserId: string | null | undefined, // null = all team, undefined = current user, string = specific user
  supabase: any,
  dateFilters?: { date_from?: string; date_to?: string }
): Promise<Array<{
  source_type: 'meeting' | 'call'
  source_id: string
  title: string
  date: string
  company_name: string | null
  owner_name: string | null
  relevance_snippet: string
}>> {
  // Extract meeting + call IDs from grounding chunks
  const meetingIds: Set<string> = new Set()
  const callIds: Set<string> = new Set()
  const snippetMap: Map<string, string> = new Map()

  for (const chunk of groundingChunks) {
    if (chunk.fileChunk?.fileName) {
      const fileName = String(chunk.fileChunk.fileName)
      const meetingMatch = fileName.match(/meeting-([a-f0-9-]+)/i)
      const callMatch = fileName.match(/call-([a-f0-9-]+)/i)

      if (meetingMatch) {
        const id = meetingMatch[1]
        meetingIds.add(id)
        if (chunk.fileChunk.content && !snippetMap.has(`meeting:${id}`)) {
          snippetMap.set(`meeting:${id}`, chunk.fileChunk.content.substring(0, 200) + '...')
        }
      } else if (callMatch) {
        const id = callMatch[1]
        callIds.add(id)
        if (chunk.fileChunk.content && !snippetMap.has(`call:${id}`)) {
          snippetMap.set(`call:${id}`, chunk.fileChunk.content.substring(0, 200) + '...')
        }
      }
    }
  }

  if (meetingIds.size === 0 && callIds.size === 0) {
    return []
  }

  // Determine the effective owner filter
  const effectiveOwnerUserId = ownerUserId === undefined ? currentUserId : ownerUserId

  // Fetch meeting metadata (if any)
  let meetings: any[] = []
  if (meetingIds.size > 0) {
    let query = supabase
      .from('meetings')
      .select(`
        id,
        title,
        meeting_start,
        owner_user_id,
        company_id,
        sentiment_score,
        share_url
      `)
      .in('id', Array.from(meetingIds))

    if (effectiveOwnerUserId !== null) {
      query = query.eq('owner_user_id', effectiveOwnerUserId)
    }
    if (dateFilters?.date_from) {
      query = query.gte('meeting_start', dateFilters.date_from)
    }
    if (dateFilters?.date_to) {
      query = query.lte('meeting_start', dateFilters.date_to + 'T23:59:59')
    }

    const { data: m, error } = await query
    if (error) {
      console.error('Failed to fetch meeting metadata:', error)
    } else {
      meetings = m || []
    }
  }

  // Fetch call metadata (if any)
  let calls: any[] = []
  if (callIds.size > 0) {
    let query = supabase
      .from('calls')
      .select(`
        id,
        direction,
        started_at,
        owner_user_id,
        owner_email,
        company_id,
        from_number,
        to_number
      `)
      .in('id', Array.from(callIds))

    if (effectiveOwnerUserId !== null) {
      query = query.eq('owner_user_id', effectiveOwnerUserId)
    }
    if (dateFilters?.date_from) {
      query = query.gte('started_at', dateFilters.date_from)
    }
    if (dateFilters?.date_to) {
      query = query.lte('started_at', dateFilters.date_to + 'T23:59:59')
    }

    const { data: c, error } = await query
    if (error) {
      console.error('Failed to fetch call metadata:', error)
    } else {
      calls = c || []
    }
  }

  // Fetch company names separately to avoid FK ambiguity
  const companyIds = [...new Set([
    ...meetings.map((m: any) => m.company_id).filter(Boolean),
    ...calls.map((c: any) => c.company_id).filter(Boolean)
  ])]
  let companyNames: Map<string, string> = new Map()
  if (companyIds.length > 0) {
    const { data: companies } = await supabase
      .from('companies')
      .select('id, name')
      .in('id', companyIds)

    if (companies) {
      companies.forEach((c: any) => companyNames.set(c.id, c.name))
    }
  }

  // If team-wide search, we need owner names
  let ownerNames: Map<string, string> = new Map()
  if (effectiveOwnerUserId === null && meetings.length > 0) {
    // Get unique owner IDs
    const ownerIds = [...new Set(meetings.map((m: any) => m.owner_user_id))]

    // Fetch owner details from fathom_integrations (which has email info)
    const { data: ownerData } = await supabase
      .from('fathom_integrations')
      .select('user_id, fathom_user_email')
      .in('user_id', ownerIds)
      .eq('is_active', true)

    if (ownerData) {
      ownerData.forEach((o: any) => {
        const name = o.fathom_user_email?.split('@')[0] || 'Team Member'
        ownerNames.set(o.user_id, o.user_id === currentUserId ? 'Me' : name)
      })
    }
  }

  const meetingSources = meetings.map((m: any) => {
    const rawSnippet = snippetMap.get(`meeting:${m.id}`) || ''
    const { speaker, text } = extractSpeakerFromSnippet(rawSnippet)

    return {
      source_type: 'meeting' as const,
      source_id: m.id,
      title: m.title || 'Untitled Meeting',
      date: m.meeting_start ? new Date(m.meeting_start).toISOString().split('T')[0] : '',
      company_name: m.company_id ? (companyNames.get(m.company_id) || null) : null,
      owner_name: effectiveOwnerUserId === null
        ? (ownerNames.get(m.owner_user_id) || 'Team Member')
        : null,
      relevance_snippet: text,
      sentiment_score: m.sentiment_score ?? null,
      speaker_name: speaker,
      fathom_share_url: m.share_url || null,
      timestamp_seconds: null, // TODO: Extract from Gemini grounding chunks if available
    }
  })

  const callSources = calls.map((c: any) => {
    const dir = String(c.direction || 'call')
    const label = dir === 'inbound'
      ? `Inbound call`
      : dir === 'outbound'
        ? `Outbound call`
        : 'Call'

    const title = c.company_id
      ? `${label} · ${companyNames.get(c.company_id) || 'Company'}`
      : label

    const ownerLabel = (c.owner_email && typeof c.owner_email === 'string')
      ? (c.owner_user_id === currentUserId ? 'Me' : (c.owner_email.split('@')[0] || 'Team Member'))
      : (c.owner_user_id === currentUserId ? 'Me' : null)

    const rawSnippet = snippetMap.get(`call:${c.id}`) || ''
    const { speaker, text } = extractSpeakerFromSnippet(rawSnippet)

    return {
      source_type: 'call' as const,
      source_id: c.id,
      title,
      date: c.started_at ? new Date(c.started_at).toISOString().split('T')[0] : '',
      company_name: c.company_id ? (companyNames.get(c.company_id) || null) : null,
      owner_name: effectiveOwnerUserId === null ? (ownerLabel || 'Team Member') : null,
      relevance_snippet: text,
      sentiment_score: null, // Calls don't have sentiment scores yet
      speaker_name: speaker,
      fathom_share_url: null, // Calls don't have Fathom URLs
      timestamp_seconds: null,
    }
  })

  return [...meetingSources, ...callSources]
}

/**
 * Fallback search when File Search store doesn't exist
 * Uses direct PostgreSQL full-text search
 * Supports team-wide search when ownerUserId is null
 */
async function fallbackSearch(
  query: string,
  currentUserId: string,
  filters: SearchRequest['filters'],
  parsedFilters: ParsedQuery['structured_filters'],
  supabase: any
): Promise<SearchResult> {
  const startTime = Date.now()
  const mergedFilters = { ...parsedFilters, ...filters }

  // Determine the effective owner filter
  const ownerUserId = filters?.owner_user_id
  const effectiveOwnerUserId = ownerUserId === undefined ? currentUserId : ownerUserId

  // Build query with filters - include owner_user_id for team searches
  // Note: Fetch company separately to avoid FK ambiguity error
  let dbQuery = supabase
    .from('meetings')
    .select(`
      id,
      title,
      meeting_start,
      summary,
      transcript_text,
      sentiment_score,
      share_url,
      owner_user_id,
      company_id,
      primary_contact_id
    `)
    .not('transcript_text', 'is', null)
    .limit(20)

  // Apply owner filter only if not searching all team (null means all team)
  if (effectiveOwnerUserId !== null) {
    dbQuery = dbQuery.eq('owner_user_id', effectiveOwnerUserId)
  }

  // Apply filters
  if (mergedFilters.sentiment) {
    if (mergedFilters.sentiment === 'positive') {
      dbQuery = dbQuery.gt('sentiment_score', 0.25)
    } else if (mergedFilters.sentiment === 'negative') {
      dbQuery = dbQuery.lt('sentiment_score', -0.25)
    } else {
      dbQuery = dbQuery.gte('sentiment_score', -0.25).lte('sentiment_score', 0.25)
    }
  }

  if (mergedFilters.date_from) {
    dbQuery = dbQuery.gte('meeting_start', mergedFilters.date_from)
  }
  if (mergedFilters.date_to) {
    dbQuery = dbQuery.lte('meeting_start', mergedFilters.date_to + 'T23:59:59')
  }

  if (mergedFilters.company_name || filters?.company_id) {
    if (filters?.company_id) {
      dbQuery = dbQuery.eq('company_id', filters.company_id)
    }
    // Company name filter would need a join lookup
  }

  // Execute meeting query
  const { data: meetings, error } = await dbQuery.order('meeting_start', { ascending: false })

  if (error) {
    throw new Error(`Database query failed: ${error.message}`)
  }

  // Also fetch calls (basic keyword match)
  let callsQuery = supabase
    .from('calls')
    .select(`
      id,
      direction,
      started_at,
      transcript_text,
      summary,
      owner_user_id,
      owner_email,
      company_id
    `)
    .not('transcript_text', 'is', null)
    .limit(20)

  if (effectiveOwnerUserId !== null) {
    callsQuery = callsQuery.eq('owner_user_id', effectiveOwnerUserId)
  }
  if (mergedFilters.date_from) {
    callsQuery = callsQuery.gte('started_at', mergedFilters.date_from)
  }
  if (mergedFilters.date_to) {
    callsQuery = callsQuery.lte('started_at', mergedFilters.date_to + 'T23:59:59')
  }
  if (filters?.company_id) {
    callsQuery = callsQuery.eq('company_id', filters.company_id)
  }

  const { data: calls, error: callsError } = await callsQuery.order('started_at', { ascending: false })
  if (callsError) {
    throw new Error(`Calls query failed: ${callsError.message}`)
  }

  // Simple keyword matching for basic relevance
  const queryTerms = query.toLowerCase().split(/\s+/)
  const relevantMeetings = meetings?.filter((m: any) => {
    const text = `${m.title || ''} ${m.summary || ''} ${m.transcript_text || ''}`.toLowerCase()
    return queryTerms.some(term => text.includes(term))
  }) || []

  const relevantCalls = calls?.filter((c: any) => {
    const text = `${c.summary || ''} ${c.transcript_text || ''}`.toLowerCase()
    return queryTerms.some(term => text.includes(term))
  }) || []

  // Fetch company names separately
  const companyIds = [...new Set([
    ...relevantMeetings.map((m: any) => m.company_id).filter(Boolean),
    ...relevantCalls.map((c: any) => c.company_id).filter(Boolean),
  ])]
  let companyNames: Map<string, string> = new Map()
  if (companyIds.length > 0) {
    const { data: companies } = await supabase
      .from('companies')
      .select('id, name')
      .in('id', companyIds)

    if (companies) {
      companies.forEach((c: any) => companyNames.set(c.id, c.name))
    }
  }

  // Get owner names for team-wide searches (meetings)
  let ownerNames: Map<string, string> = new Map()
  if (effectiveOwnerUserId === null && relevantMeetings.length > 0) {
    const ownerIds = [...new Set(relevantMeetings.map((m: any) => m.owner_user_id))]

    const { data: ownerData } = await supabase
      .from('fathom_integrations')
      .select('user_id, fathom_user_email')
      .in('user_id', ownerIds)
      .eq('is_active', true)

    if (ownerData) {
      ownerData.forEach((o: any) => {
        const name = o.fathom_user_email?.split('@')[0] || 'Team Member'
        ownerNames.set(o.user_id, o.user_id === currentUserId ? 'Me' : name)
      })
    }
  }

  const meetingSources = relevantMeetings.slice(0, 5).map((m: any) => {
    const rawSnippet = m.summary?.substring(0, 200) || m.transcript_text?.substring(0, 200) || ''
    const { speaker, text } = extractSpeakerFromSnippet(rawSnippet)
    return {
      source_type: 'meeting' as const,
      source_id: m.id,
      title: m.title || 'Untitled Meeting',
      date: m.meeting_start ? new Date(m.meeting_start).toISOString().split('T')[0] : '',
      company_name: m.company_id ? (companyNames.get(m.company_id) || null) : null,
      owner_name: effectiveOwnerUserId === null
        ? (ownerNames.get(m.owner_user_id) || 'Team Member')
        : null,
      relevance_snippet: text,
      sentiment_score: m.sentiment_score ?? null,
      speaker_name: speaker,
      fathom_share_url: m.share_url || null,
      timestamp_seconds: null,
    }
  })

  const callSources = relevantCalls.slice(0, 5).map((c: any) => {
    const dir = String(c.direction || 'call')
    const label = dir === 'inbound' ? 'Inbound call' : dir === 'outbound' ? 'Outbound call' : 'Call'
    const title = c.company_id ? `${label} · ${companyNames.get(c.company_id) || 'Company'}` : label
    const ownerLabel = (c.owner_email && typeof c.owner_email === 'string')
      ? (c.owner_user_id === currentUserId ? 'Me' : (c.owner_email.split('@')[0] || 'Team Member'))
      : (c.owner_user_id === currentUserId ? 'Me' : null)

    const rawSnippet = c.summary?.substring(0, 200) || c.transcript_text?.substring(0, 200) || ''
    const { speaker, text } = extractSpeakerFromSnippet(rawSnippet)

    return {
      source_type: 'call' as const,
      source_id: c.id,
      title,
      date: c.started_at ? new Date(c.started_at).toISOString().split('T')[0] : '',
      company_name: c.company_id ? (companyNames.get(c.company_id) || null) : null,
      owner_name: effectiveOwnerUserId === null ? (ownerLabel || 'Team Member') : null,
      relevance_snippet: text,
      sentiment_score: null, // Calls don't have sentiment scores
      speaker_name: speaker,
      fathom_share_url: null, // Calls don't have Fathom links
      timestamp_seconds: null,
    }
  })

  const sources = [...meetingSources, ...callSources]

  const scopeLabel = effectiveOwnerUserId === null
    ? 'team'
    : (effectiveOwnerUserId === currentUserId ? 'your' : 'filtered')

  return {
    answer: (relevantMeetings.length + relevantCalls.length) > 0
      ? `Found ${relevantMeetings.length + relevantCalls.length} potentially relevant ${scopeLabel} conversations (meetings + calls). Note: Full semantic search is not available - showing basic keyword matches. To enable AI-powered search, please build the search index.`
      : `No ${scopeLabel} conversations found matching your query. Try different search terms or check that conversations have been indexed.`,
    sources,
    query_metadata: {
      semantic_query: query,
      filters_applied: mergedFilters,
      meetings_searched: (meetings?.length || 0) + (calls?.length || 0),
      response_time_ms: Date.now() - startTime
    }
  }
}

/**
 * Log query for analytics
 */
async function logQuery(
  supabase: any,
  userId: string,
  queryText: string,
  parsedQuery: ParsedQuery,
  resultsCount: number,
  responseTimeMs: number
): Promise<void> {
  try {
    await supabase
      .from('meeting_intelligence_queries')
      .insert({
        user_id: userId,
        query_text: queryText,
        parsed_semantic_query: parsedQuery.semantic_query,
        parsed_filters: parsedQuery.structured_filters,
        results_count: resultsCount,
        response_time_ms: responseTimeMs
      })
  } catch (error) {
    // Don't fail the request if logging fails
    console.error('Failed to log query:', error)
  }
}

serve(async (req) => {
  // Handle CORS preflight
  const corsPreflightResponse = handleCorsPreflightRequest(req);
  if (corsPreflightResponse) return corsPreflightResponse;
  const corsHeaders = getCorsHeaders(req);

  const startTime = Date.now()

  try {
    // Get API keys
    const geminiApiKey = Deno.env.get('GEMINI_API_KEY')
    const anthropicApiKey = Deno.env.get('ANTHROPIC_API_KEY')

    if (!geminiApiKey) {
      return new Response(
        JSON.stringify({ error: 'GEMINI_API_KEY not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Parse request
    const { query, filters }: SearchRequest = await req.json()

    if (!query || typeof query !== 'string' || query.trim().length === 0) {
      return new Response(
        JSON.stringify({ error: 'Query is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Get authorization
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Missing authorization header' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Initialize Supabase client
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      {
        global: {
          headers: { Authorization: authHeader },
        },
      }
    )

    // Get current user
    const { data: { user }, error: userError } = await supabaseClient.auth.getUser()
    if (userError || !user) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Parse the query with Claude (if API key available)
    let parsedQuery: ParsedQuery
    if (anthropicApiKey) {
      parsedQuery = await parseQueryWithClaude(query, anthropicApiKey)
      // Log AI cost event for Claude query parsing
      if (parsedQuery.inputTokens || parsedQuery.outputTokens) {
        await logAICostEvent(
          adminClient,
          user.id,
          orgId,
          'anthropic',
          'claude-sonnet-4-20250514',
          parsedQuery.inputTokens || 0,
          parsedQuery.outputTokens || 0,
          'meeting_summary',
        )
      }
    } else {
      // Simple fallback parsing
      parsedQuery = {
        semantic_query: query,
        structured_filters: {}
      }
    }

    // Get user's organization
    const orgId = await getUserOrgId(user.id, supabaseClient)
    if (!orgId) {
      return new Response(
        JSON.stringify({ error: 'User is not a member of any organization' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Create admin client for credit tracking (anon client respects RLS)
    const adminClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    )

    // Credit balance check before AI call
    const balanceCheck = await checkCreditBalance(adminClient, orgId)
    if (!balanceCheck.allowed) {
      return new Response(
        JSON.stringify({ error: 'Insufficient credits' }),
        { status: 402, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Check if organization has a File Search store
    const { data: storeData } = await supabaseClient
      .from('org_file_search_stores')
      .select('store_name, status, total_files')
      .eq('org_id', orgId)
      .single()

    // If no store or no files indexed, use fallback search
    if (!storeData?.store_name || storeData.total_files === 0) {
      const result = await fallbackSearch(
        query,
        user.id,
        filters,
        parsedQuery.structured_filters,
        supabaseClient
      )

      // Log query
      await logQuery(
        supabaseClient,
        user.id,
        query,
        parsedQuery,
        result.sources.length,
        Date.now() - startTime
      )

      return new Response(
        JSON.stringify(result),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Build metadata filter
    const metadataFilter = buildMetadataFilter(parsedQuery.structured_filters, filters)

    // Use semantic query or original query
    const searchQuery = parsedQuery.semantic_query || query

    // Search with File Search
    const { answer, groundingChunks } = await searchWithFileSearch(
      storeData.store_name,
      searchQuery,
      metadataFilter,
      geminiApiKey
    )

    // Enrich results with meeting metadata
    const dateFilters = {
      date_from: parsedQuery.structured_filters.date_from || filters?.date_from,
      date_to: parsedQuery.structured_filters.date_to || filters?.date_to
    }

    const sources = await enrichResultsWithMetadata(
      groundingChunks,
      user.id,
      filters?.owner_user_id, // null = all team, undefined = current user, string = specific user
      supabaseClient,
      dateFilters
    )

    // Get total meeting count for metadata based on scope
    const ownerUserId = filters?.owner_user_id
    const effectiveOwnerUserId = ownerUserId === undefined ? user.id : ownerUserId

    let meetingCountQuery = supabaseClient
      .from('meeting_file_search_index')
      .select('id', { count: 'exact', head: true })
      .eq('org_id', orgId)
      .eq('status', 'indexed')

    if (effectiveOwnerUserId !== null) {
      meetingCountQuery = meetingCountQuery.eq('user_id', effectiveOwnerUserId)
    }

    const { count: totalMeetings } = await meetingCountQuery

    const responseTimeMs = Date.now() - startTime

    // Log query
    await logQuery(
      supabaseClient,
      user.id,
      query,
      parsedQuery,
      sources.length,
      responseTimeMs
    )

    const result: SearchResult = {
      answer,
      sources,
      query_metadata: {
        semantic_query: parsedQuery.semantic_query,
        filters_applied: { ...parsedQuery.structured_filters, ...filters },
        meetings_searched: totalMeetings || 0,
        response_time_ms: responseTimeMs
      }
    }

    return new Response(
      JSON.stringify(result),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    console.error('Error in meeting-intelligence-search:', error)
    return new Response(
      JSON.stringify({
        error: 'Search failed',
        details: error.message
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
