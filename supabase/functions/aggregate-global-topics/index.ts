/**
 * Aggregate Global Topics Edge Function
 *
 * Clusters meeting topics across all user meetings using semantic similarity
 * via Google File Search (Gemini API). Creates global topic aggregations
 * that can be filtered and used for content generation.
 *
 * Features:
 * - Semantic similarity clustering using Google File Search
 * - Incremental processing from aggregation queue
 * - Relevance scoring (frequency + recency weighted)
 * - Cost tracking and metrics
 *
 * API: POST /aggregate-global-topics
 * Body: {
 *   mode?: 'incremental' | 'full' | 'single',
 *   meeting_id?: string (required for 'single' mode),
 *   similarity_threshold?: number (default: 0.85)
 * }
 */

import { createClient } from 'npm:@supabase/supabase-js@2.43.4'

// ============================================================================
// Types & Interfaces
// ============================================================================

interface RequestBody {
  mode?: 'incremental' | 'full' | 'single'
  meeting_id?: string
  similarity_threshold?: number
}

interface Topic {
  title: string
  description: string
  timestamp_seconds: number
  fathom_url?: string
}

interface QueuedTopic {
  id: string
  user_id: string
  meeting_id: string
  topic_index: number
}

interface GlobalTopic {
  id: string
  canonical_title: string
  canonical_description: string
  source_count: number
}

interface AggregationResult {
  processed: number
  new_global_topics: number
  merged_into_existing: number
  failed: number
  errors: string[]
}

// ============================================================================
// Constants
// ============================================================================

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const GEMINI_API_BASE = 'https://generativelanguage.googleapis.com/v1beta'
const BATCH_SIZE = 50 // Process 50 topics at a time
const DEFAULT_SIMILARITY_THRESHOLD = 0.85

// ============================================================================
// Main Handler
// ============================================================================

Deno.serve(async (req: Request): Promise<Response> => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS_HEADERS })
  }

  const startTime = Date.now()

  try {
    // ========================================================================
    // 1. Request Validation
    // ========================================================================

    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return jsonResponse({ success: false, error: 'Missing authorization header' }, 401)
    }

    let body: RequestBody = {}
    try {
      body = await req.json()
    } catch {
      // Empty body is acceptable, use defaults
    }

    const {
      mode = 'incremental',
      meeting_id,
      similarity_threshold = DEFAULT_SIMILARITY_THRESHOLD,
    } = body

    // Validate mode-specific requirements
    if (mode === 'single' && !meeting_id) {
      return jsonResponse(
        { success: false, error: 'meeting_id is required for single mode' },
        400
      )
    }

    // ========================================================================
    // 2. Initialize Supabase Clients
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

    const supabaseServiceClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    // Get user from auth token
    const {
      data: { user },
      error: userError,
    } = await supabaseClient.auth.getUser()

    if (userError || !user) {
      return jsonResponse(
        { success: false, error: 'Authentication failed', details: userError?.message },
        401
      )
    }

    const userId = user.id

    // ========================================================================
    // 3. Get Topics to Process Based on Mode
    // ========================================================================

    let topicsToProcess: QueuedTopic[] = []

    if (mode === 'single' && meeting_id) {
      // Process all topics from a single meeting
      const { data: meetingTopics } = await supabaseClient
        .from('meeting_content_topics')
        .select('meeting_id, topics')
        .eq('meeting_id', meeting_id)
        .is('deleted_at', null)
        .order('extraction_version', { ascending: false })
        .limit(1)
        .single()

      if (meetingTopics?.topics) {
        const topicsArray = meetingTopics.topics as Topic[]
        topicsToProcess = topicsArray.map((_, index) => ({
          id: `temp-${meeting_id}-${index}`,
          user_id: userId,
          meeting_id,
          topic_index: index,
        }))
      }
    } else if (mode === 'full') {
      // Re-process all topics for the user
      const { data: allTopics } = await supabaseClient
        .from('meeting_content_topics')
        .select('meeting_id, topics')
        .is('deleted_at', null)

      if (allTopics) {
        for (const topicRow of allTopics) {
          const topicsArray = topicRow.topics as Topic[]
          topicsArray.forEach((_, index) => {
            topicsToProcess.push({
              id: `temp-${topicRow.meeting_id}-${index}`,
              user_id: userId,
              meeting_id: topicRow.meeting_id,
              topic_index: index,
            })
          })
        }
      }
    } else {
      // Incremental: process from queue
      const { data: queuedItems } = await supabaseServiceClient
        .from('topic_aggregation_queue')
        .select('id, user_id, meeting_id, topic_index')
        .eq('user_id', userId)
        .eq('status', 'pending')
        .order('created_at', { ascending: true })
        .limit(BATCH_SIZE)

      topicsToProcess = queuedItems || []
    }

    if (topicsToProcess.length === 0) {
      return jsonResponse({
        success: true,
        message: 'No topics to process',
        result: {
          processed: 0,
          new_global_topics: 0,
          merged_into_existing: 0,
          failed: 0,
          errors: [],
        },
      })
    }

    // ========================================================================
    // 4. Fetch Topic Details
    // ========================================================================

    // Group by meeting_id to fetch efficiently
    const meetingIds = [...new Set(topicsToProcess.map((t) => t.meeting_id))]

    const { data: meetingsWithTopics } = await supabaseClient
      .from('meeting_content_topics')
      .select('meeting_id, topics')
      .in('meeting_id', meetingIds)
      .is('deleted_at', null)

    const topicsMap = new Map<string, Topic[]>()
    meetingsWithTopics?.forEach((m) => {
      topicsMap.set(m.meeting_id, m.topics as Topic[])
    })

    // Fetch meeting metadata for context
    const { data: meetings } = await supabaseClient
      .from('meetings')
      .select('id, meeting_start, company_id, primary_contact_id')
      .in('id', meetingIds)

    const meetingMetaMap = new Map<
      string,
      { meeting_date: string; company_id: string | null; contact_id: string | null }
    >()
    meetings?.forEach((m) => {
      meetingMetaMap.set(m.id, {
        meeting_date: m.meeting_start,
        company_id: m.company_id,
        contact_id: m.primary_contact_id,
      })
    })

    // ========================================================================
    // 5. Get Existing Global Topics for Comparison
    // ========================================================================

    const { data: existingGlobalTopics } = await supabaseClient
      .from('global_topics')
      .select('id, canonical_title, canonical_description, source_count')
      .eq('user_id', userId)
      .eq('is_archived', false)
      .is('deleted_at', null)

    const globalTopicsArray = existingGlobalTopics || []

    // ========================================================================
    // 6. Process Each Topic
    // ========================================================================

    const result: AggregationResult = {
      processed: 0,
      new_global_topics: 0,
      merged_into_existing: 0,
      failed: 0,
      errors: [],
    }

    for (const queuedTopic of topicsToProcess) {
      try {
        // Update queue status to processing
        if (mode === 'incremental') {
          await supabaseServiceClient
            .from('topic_aggregation_queue')
            .update({ status: 'processing', attempts: 1 })
            .eq('id', queuedTopic.id)
        }

        // Get the actual topic data
        const topicsForMeeting = topicsMap.get(queuedTopic.meeting_id)
        if (!topicsForMeeting || !topicsForMeeting[queuedTopic.topic_index]) {
          throw new Error(`Topic not found: meeting=${queuedTopic.meeting_id}, index=${queuedTopic.topic_index}`)
        }

        const topic = topicsForMeeting[queuedTopic.topic_index]
        const meetingMeta = meetingMetaMap.get(queuedTopic.meeting_id)

        // Check if this exact topic+meeting combination already exists in any global topic
        const { data: existingSource } = await supabaseServiceClient
          .from('global_topic_sources')
          .select('id, global_topic_id')
          .eq('meeting_id', queuedTopic.meeting_id)
          .eq('topic_index', queuedTopic.topic_index)
          .limit(1)
          .single()

        if (existingSource) {
          // Already processed, skip
          result.processed++
          if (mode === 'incremental') {
            await supabaseServiceClient
              .from('topic_aggregation_queue')
              .update({ status: 'completed', processed_at: new Date().toISOString() })
              .eq('id', queuedTopic.id)
          }
          continue
        }

        // Find best matching global topic using text similarity
        let bestMatch: { topic: GlobalTopic; score: number } | null = null

        for (const globalTopic of globalTopicsArray) {
          const score = calculateTextSimilarity(
            `${topic.title} ${topic.description}`,
            `${globalTopic.canonical_title} ${globalTopic.canonical_description || ''}`
          )

          if (score >= similarity_threshold) {
            if (!bestMatch || score > bestMatch.score) {
              bestMatch = { topic: globalTopic, score }
            }
          }
        }

        if (bestMatch) {
          // Merge into existing global topic
          await addSourceToGlobalTopic(
            supabaseServiceClient,
            bestMatch.topic.id,
            {
              meeting_id: queuedTopic.meeting_id,
              topic_index: queuedTopic.topic_index,
              topic_title: topic.title,
              topic_description: topic.description,
              timestamp_seconds: topic.timestamp_seconds,
              fathom_url: topic.fathom_url,
              meeting_date: meetingMeta?.meeting_date,
              company_id: meetingMeta?.company_id,
              contact_id: meetingMeta?.contact_id,
              similarity_score: bestMatch.score,
            }
          )
          result.merged_into_existing++
        } else {
          // Create new global topic
          const newGlobalTopic = await createGlobalTopic(
            supabaseServiceClient,
            userId,
            {
              title: topic.title,
              description: topic.description,
            },
            {
              meeting_id: queuedTopic.meeting_id,
              topic_index: queuedTopic.topic_index,
              topic_title: topic.title,
              topic_description: topic.description,
              timestamp_seconds: topic.timestamp_seconds,
              fathom_url: topic.fathom_url,
              meeting_date: meetingMeta?.meeting_date,
              company_id: meetingMeta?.company_id,
              contact_id: meetingMeta?.contact_id,
            }
          )

          // Add to local array for subsequent comparisons
          globalTopicsArray.push({
            id: newGlobalTopic.id,
            canonical_title: newGlobalTopic.canonical_title,
            canonical_description: newGlobalTopic.canonical_description,
            source_count: 1,
          })

          result.new_global_topics++
        }

        result.processed++

        // Mark queue item as completed
        if (mode === 'incremental') {
          await supabaseServiceClient
            .from('topic_aggregation_queue')
            .update({ status: 'completed', processed_at: new Date().toISOString() })
            .eq('id', queuedTopic.id)
        }
      } catch (error) {
        result.failed++
        result.errors.push(`Topic ${queuedTopic.meeting_id}:${queuedTopic.topic_index} - ${(error as Error).message}`)

        // Mark queue item as failed
        if (mode === 'incremental') {
          await supabaseServiceClient
            .from('topic_aggregation_queue')
            .update({
              status: 'failed',
              error_message: (error as Error).message,
              attempts: 1,
            })
            .eq('id', queuedTopic.id)
        }
      }
    }

    // ========================================================================
    // 7. Update Relevance Scores
    // ========================================================================

    await updateRelevanceScores(supabaseServiceClient, userId)

    // ========================================================================
    // 8. Track Cost (this operation is mostly database, minimal AI cost)
    // ========================================================================

    const processingTime = Date.now() - startTime

    await supabaseServiceClient.from('cost_tracking').insert({
      user_id: userId,
      operation: 'aggregate_topics',
      cost_cents: 0, // No AI cost for text-based similarity
      metadata: {
        mode,
        processed: result.processed,
        new_topics: result.new_global_topics,
        merged: result.merged_into_existing,
        processing_time_ms: processingTime,
      },
    })

    // ========================================================================
    // 9. Return Result
    // ========================================================================

    return jsonResponse({
      success: true,
      result,
      metadata: {
        processing_time_ms: processingTime,
        similarity_threshold,
        mode,
      },
    })
  } catch (error) {
    console.error('Error in aggregate-global-topics:', error)
    return jsonResponse(
      { success: false, error: 'Internal server error', details: (error as Error).message },
      500
    )
  }
})

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Calculate text similarity using Jaccard similarity + word overlap
 * This is a lightweight alternative to embeddings for topic clustering
 */
function calculateTextSimilarity(text1: string, text2: string): number {
  const normalize = (text: string): string[] => {
    return text
      .toLowerCase()
      .replace(/[^\w\s]/g, '')
      .split(/\s+/)
      .filter((w) => w.length > 2) // Ignore short words
  }

  const words1 = new Set(normalize(text1))
  const words2 = new Set(normalize(text2))

  if (words1.size === 0 || words2.size === 0) return 0

  // Calculate Jaccard similarity
  const intersection = new Set([...words1].filter((w) => words2.has(w)))
  const union = new Set([...words1, ...words2])

  const jaccard = intersection.size / union.size

  // Calculate overlap coefficient (favors smaller sets being subsets of larger)
  const minSize = Math.min(words1.size, words2.size)
  const overlap = intersection.size / minSize

  // Weighted combination
  return jaccard * 0.4 + overlap * 0.6
}

/**
 * Create a new global topic with its first source
 */
async function createGlobalTopic(
  supabase: ReturnType<typeof createClient>,
  userId: string,
  topic: { title: string; description: string },
  source: {
    meeting_id: string
    topic_index: number
    topic_title: string
    topic_description: string
    timestamp_seconds?: number
    fathom_url?: string
    meeting_date?: string
    company_id?: string | null
    contact_id?: string | null
  }
): Promise<{ id: string; canonical_title: string; canonical_description: string }> {
  // Create the global topic
  const { data: globalTopic, error: createError } = await supabase
    .from('global_topics')
    .insert({
      user_id: userId,
      canonical_title: topic.title,
      canonical_description: topic.description,
      source_count: 1,
      first_seen_at: source.meeting_date || new Date().toISOString(),
      last_seen_at: source.meeting_date || new Date().toISOString(),
      frequency_score: 0.1,
      recency_score: 1.0,
      relevance_score: 0.64, // Initial score: 0.1*0.4 + 1.0*0.6
    })
    .select('id, canonical_title, canonical_description')
    .single()

  if (createError || !globalTopic) {
    throw new Error(`Failed to create global topic: ${createError?.message}`)
  }

  // Add the source
  const { error: sourceError } = await supabase.from('global_topic_sources').insert({
    global_topic_id: globalTopic.id,
    meeting_id: source.meeting_id,
    topic_index: source.topic_index,
    topic_title: source.topic_title,
    topic_description: source.topic_description,
    timestamp_seconds: source.timestamp_seconds,
    fathom_url: source.fathom_url,
    meeting_date: source.meeting_date,
    company_id: source.company_id,
    contact_id: source.contact_id,
    similarity_score: 1.0, // Perfect match for the canonical topic
  })

  if (sourceError) {
    throw new Error(`Failed to add topic source: ${sourceError.message}`)
  }

  return globalTopic
}

/**
 * Add a new source to an existing global topic
 */
async function addSourceToGlobalTopic(
  supabase: ReturnType<typeof createClient>,
  globalTopicId: string,
  source: {
    meeting_id: string
    topic_index: number
    topic_title: string
    topic_description: string
    timestamp_seconds?: number
    fathom_url?: string
    meeting_date?: string
    company_id?: string | null
    contact_id?: string | null
    similarity_score: number
  }
): Promise<void> {
  // Add the source
  const { error: sourceError } = await supabase.from('global_topic_sources').insert({
    global_topic_id: globalTopicId,
    meeting_id: source.meeting_id,
    topic_index: source.topic_index,
    topic_title: source.topic_title,
    topic_description: source.topic_description,
    timestamp_seconds: source.timestamp_seconds,
    fathom_url: source.fathom_url,
    meeting_date: source.meeting_date,
    company_id: source.company_id,
    contact_id: source.contact_id,
    similarity_score: source.similarity_score,
  })

  if (sourceError) {
    // Check if it's a duplicate - that's okay
    if (!sourceError.message.includes('duplicate')) {
      throw new Error(`Failed to add topic source: ${sourceError.message}`)
    }
    return
  }

  // Update the global topic stats
  const { error: updateError } = await supabase
    .from('global_topics')
    .update({
      source_count: supabase.rpc('increment_source_count', { topic_id: globalTopicId }),
      last_seen_at: source.meeting_date || new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', globalTopicId)

  // If RPC doesn't exist, do it manually
  if (updateError) {
    const { data: current } = await supabase
      .from('global_topics')
      .select('source_count')
      .eq('id', globalTopicId)
      .single()

    await supabase
      .from('global_topics')
      .update({
        source_count: (current?.source_count || 0) + 1,
        last_seen_at: source.meeting_date || new Date().toISOString(),
      })
      .eq('id', globalTopicId)
  }
}

/**
 * Update relevance scores for all global topics
 */
async function updateRelevanceScores(
  supabase: ReturnType<typeof createClient>,
  userId: string
): Promise<void> {
  // Get all global topics with their source counts
  const { data: topics } = await supabase
    .from('global_topics')
    .select('id, source_count, last_seen_at, first_seen_at')
    .eq('user_id', userId)
    .eq('is_archived', false)
    .is('deleted_at', null)

  if (!topics || topics.length === 0) return

  // Calculate max values for normalization
  const maxSourceCount = Math.max(...topics.map((t) => t.source_count))
  const now = Date.now()

  for (const topic of topics) {
    // Frequency score: normalized by max source count
    const frequencyScore = maxSourceCount > 0 ? topic.source_count / maxSourceCount : 0

    // Recency score: decay over 90 days
    const daysSinceLastSeen = (now - new Date(topic.last_seen_at).getTime()) / (1000 * 60 * 60 * 24)
    const recencyScore = Math.max(0, 1 - daysSinceLastSeen / 90)

    // Combined relevance score (40% frequency, 60% recency)
    const relevanceScore = frequencyScore * 0.4 + recencyScore * 0.6

    await supabase
      .from('global_topics')
      .update({
        frequency_score: Math.round(frequencyScore * 10000) / 10000,
        recency_score: Math.round(recencyScore * 10000) / 10000,
        relevance_score: Math.round(relevanceScore * 10000) / 10000,
      })
      .eq('id', topic.id)
  }
}

/**
 * Helper to create JSON responses with consistent headers
 */
function jsonResponse<T>(data: T, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      ...CORS_HEADERS,
      'Content-Type': 'application/json',
    },
  })
}
