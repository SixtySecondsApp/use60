import { createClient } from 'npm:@supabase/supabase-js@2.43.4'

// ============================================================================
// Types & Interfaces
// ============================================================================

interface RequestBody {
  filters?: {
    date_range?: { start: string; end: string }
    company_ids?: string[]
    contact_ids?: string[]
    meeting_types?: string[]
    custom_tags?: string[]
    search_query?: string
  }
  sort_by?: 'frequency' | 'recency' | 'relevance'
  page?: number
  page_size?: number
  include_sources?: boolean
}

interface GlobalTopicResponse {
  id: string
  canonical_title: string
  canonical_description: string | null
  source_count: number
  first_seen_at: string
  last_seen_at: string
  frequency_score: number
  recency_score: number
  relevance_score: number
  companies: string[]
  contacts: string[]
  meeting_count: number
  sources?: SourceMeeting[]
}

interface SourceMeeting {
  meeting_id: string
  meeting_title: string
  meeting_date: string
  company_name: string | null
  contact_name: string | null
  topic_title: string
  topic_description: string
  timestamp_seconds: number | null
  fathom_url: string | null
  similarity_score: number
}

interface PaginationInfo {
  page: number
  page_size: number
  total_count: number
  total_pages: number
  has_next: boolean
  has_prev: boolean
}

// ============================================================================
// Constants
// ============================================================================

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const DEFAULT_PAGE_SIZE = 20
const MAX_PAGE_SIZE = 100

// ============================================================================
// Helper Functions
// ============================================================================

function localJsonResponse<T>(data: T, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      ...CORS_HEADERS,
      'Content-Type': 'application/json',
    },
  })
}

// ============================================================================
// Main Handler
// ============================================================================

export async function handleAggregatedTopics(req: Request): Promise<Response> {
  const startTime = Date.now()

  try {
    // ========================================================================
    // 1. Request Validation
    // ========================================================================

    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return localJsonResponse({ success: false, error: 'Missing authorization header' }, 401)
    }

    let body: RequestBody = {}
    try {
      body = await req.json()
    } catch {
      // Empty body is acceptable, use defaults
    }

    const {
      filters = {},
      sort_by = 'relevance',
      page = 1,
      page_size = DEFAULT_PAGE_SIZE,
      include_sources = false,
    } = body

    // Validate pagination
    const validatedPageSize = Math.min(Math.max(1, page_size), MAX_PAGE_SIZE)
    const validatedPage = Math.max(1, page)
    const offset = (validatedPage - 1) * validatedPageSize

    // ========================================================================
    // 2. Initialize Supabase Client
    // ========================================================================

    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      {
        global: {
          headers: { Authorization: authHeader },
        },
      }
    )

    // Get user from auth token
    const {
      data: { user },
      error: userError,
    } = await supabaseClient.auth.getUser()

    if (userError || !user) {
      return localJsonResponse(
        { success: false, error: 'Authentication failed', details: userError?.message },
        401
      )
    }

    const userId = user.id

    // ========================================================================
    // 3. Build and Execute Query
    // ========================================================================

    let topicsQuery = supabaseClient
      .from('global_topics')
      .select('*', { count: 'exact' })
      .eq('user_id', userId)
      .eq('is_archived', false)
      .is('deleted_at', null)

    if (filters.search_query) {
      topicsQuery = topicsQuery.or(
        `canonical_title.ilike.%${filters.search_query}%,canonical_description.ilike.%${filters.search_query}%`
      )
    }

    switch (sort_by) {
      case 'frequency':
        topicsQuery = topicsQuery.order('source_count', { ascending: false })
        break
      case 'recency':
        topicsQuery = topicsQuery.order('last_seen_at', { ascending: false })
        break
      case 'relevance':
      default:
        topicsQuery = topicsQuery.order('relevance_score', { ascending: false })
        break
    }

    topicsQuery = topicsQuery.range(offset, offset + validatedPageSize - 1)

    const { data: globalTopics, error: topicsError, count: totalCount } = await topicsQuery

    if (topicsError) {
      return localJsonResponse(
        { success: false, error: 'Failed to fetch topics', details: topicsError.message },
        500
      )
    }

    // ========================================================================
    // 4. Apply Source-Level Filters and Enrich Data
    // ========================================================================

    const enrichedTopics: GlobalTopicResponse[] = []

    for (const topic of globalTopics || []) {
      let sourcesQuery = supabaseClient
        .from('global_topic_sources')
        .select(`
          meeting_id,
          topic_title,
          topic_description,
          timestamp_seconds,
          fathom_url,
          similarity_score,
          meeting_date,
          company_id,
          contact_id
        `)
        .eq('global_topic_id', topic.id)

      if (filters.date_range?.start) {
        sourcesQuery = sourcesQuery.gte('meeting_date', filters.date_range.start)
      }
      if (filters.date_range?.end) {
        sourcesQuery = sourcesQuery.lte('meeting_date', filters.date_range.end + 'T23:59:59')
      }

      if (filters.company_ids && filters.company_ids.length > 0) {
        sourcesQuery = sourcesQuery.in('company_id', filters.company_ids)
      }

      if (filters.contact_ids && filters.contact_ids.length > 0) {
        sourcesQuery = sourcesQuery.in('contact_id', filters.contact_ids)
      }

      const { data: sources } = await sourcesQuery

      if (!sources || sources.length === 0) {
        continue
      }

      const companyIds = [...new Set(sources.filter((s) => s.company_id).map((s) => s.company_id!))]
      const contactIds = [...new Set(sources.filter((s) => s.contact_id).map((s) => s.contact_id!))]
      const meetingIds = [...new Set(sources.map((s) => s.meeting_id))]

      let companyNames: string[] = []
      if (companyIds.length > 0) {
        const { data: companies } = await supabaseClient
          .from('companies')
          .select('name')
          .in('id', companyIds)

        companyNames = companies?.map((c) => c.name).filter(Boolean) || []
      }

      let contactNames: string[] = []
      if (contactIds.length > 0) {
        const { data: contacts } = await supabaseClient
          .from('contacts')
          .select('name')
          .in('id', contactIds)

        contactNames = contacts?.map((c) => c.name).filter(Boolean) || []
      }

      const enrichedTopic: GlobalTopicResponse = {
        id: topic.id,
        canonical_title: topic.canonical_title,
        canonical_description: topic.canonical_description,
        source_count: sources.length,
        first_seen_at: topic.first_seen_at,
        last_seen_at: topic.last_seen_at,
        frequency_score: topic.frequency_score,
        recency_score: topic.recency_score,
        relevance_score: topic.relevance_score,
        companies: companyNames,
        contacts: contactNames,
        meeting_count: meetingIds.length,
      }

      if (include_sources) {
        const { data: meetings } = await supabaseClient
          .from('meetings')
          .select('id, title')
          .in('id', meetingIds)

        const meetingTitleMap = new Map(meetings?.map((m) => [m.id, m.title]) || [])

        const companyNameMap = new Map<string, string>()
        const contactNameMap = new Map<string, string>()

        if (companyIds.length > 0) {
          const { data: companies } = await supabaseClient
            .from('companies')
            .select('id, name')
            .in('id', companyIds)

          companies?.forEach((c) => companyNameMap.set(c.id, c.name))
        }

        if (contactIds.length > 0) {
          const { data: contacts } = await supabaseClient
            .from('contacts')
            .select('id, name')
            .in('id', contactIds)

          contacts?.forEach((c) => contactNameMap.set(c.id, c.name))
        }

        enrichedTopic.sources = sources.map((s) => ({
          meeting_id: s.meeting_id,
          meeting_title: meetingTitleMap.get(s.meeting_id) || 'Untitled Meeting',
          meeting_date: s.meeting_date,
          company_name: s.company_id ? companyNameMap.get(s.company_id) || null : null,
          contact_name: s.contact_id ? contactNameMap.get(s.contact_id) || null : null,
          topic_title: s.topic_title,
          topic_description: s.topic_description,
          timestamp_seconds: s.timestamp_seconds,
          fathom_url: s.fathom_url,
          similarity_score: s.similarity_score,
        }))
      }

      enrichedTopics.push(enrichedTopic)
    }

    // ========================================================================
    // 5. Build Pagination Info
    // ========================================================================

    const pagination: PaginationInfo = {
      page: validatedPage,
      page_size: validatedPageSize,
      total_count: totalCount || 0,
      total_pages: Math.ceil((totalCount || 0) / validatedPageSize),
      has_next: offset + validatedPageSize < (totalCount || 0),
      has_prev: validatedPage > 1,
    }

    // ========================================================================
    // 6. Get Summary Statistics
    // ========================================================================

    const { data: statsData } = await supabaseClient.rpc('get_global_topics_stats', {
      p_user_id: userId,
    })

    const stats = statsData || {
      total_topics: totalCount || 0,
      total_meetings: 0,
      total_companies: 0,
      total_contacts: 0,
    }

    // ========================================================================
    // 7. Return Response
    // ========================================================================

    const responseTime = Date.now() - startTime

    return localJsonResponse({
      success: true,
      topics: enrichedTopics,
      pagination,
      stats: {
        total_topics: totalCount || 0,
        displayed_topics: enrichedTopics.length,
        ...stats,
      },
      metadata: {
        filters_applied: Object.keys(filters).filter((k) => filters[k as keyof typeof filters]),
        sort_by,
        response_time_ms: responseTime,
      },
    })
  } catch (error) {
    console.error('Error in get-aggregated-topics:', error)
    return localJsonResponse(
      { success: false, error: 'Internal server error', details: (error as Error).message },
      500
    )
  }
}
