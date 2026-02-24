import { serve } from "https://deno.land/std@0.190.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.43.4"
import { analyzeTranscriptWithClaude, deduplicateActionItems, type TranscriptAnalysis } from '../fathom-sync/aiAnalysis.ts'
import { captureException } from '../_shared/sentryEdge.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

/**
 * Batch Reprocess Meetings with Claude Haiku 4.5
 *
 * Purpose: Re-analyze meeting transcripts using Claude AI to extract action items
 * - Fetches all meetings with transcripts
 * - Re-runs Claude AI analysis on each transcript
 * - Stores action items WITHOUT automatically creating tasks
 * - Allows manual task selection via UI
 */

interface ReprocessRequest {
  user_id?: string // Optional: process meetings for specific user
  meeting_ids?: string[] // Optional: process specific meetings
  limit?: number // Optional: limit number of meetings to process
  force?: boolean // Optional: force reprocessing even if action items exist
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  const requestId = crypto.randomUUID().substring(0, 8)
  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      {
        auth: {
          persistSession: false,
          autoRefreshToken: false,
        }
      }
    )

    // Parse request body
    const body: ReprocessRequest = await req.json()
    const { user_id, meeting_ids, limit, force = false } = body
    // Build query for meetings with transcripts
    let query = supabase
      .from('meetings')
      .select('id, title, meeting_start, transcript_text, fathom_recording_id, owner_user_id')
      .not('transcript_text', 'is', null)
      .order('meeting_start', { ascending: false })

    // Only process meetings without ANY AI analysis (check sentiment_score which both old and new pipelines set)
    if (!force) {
      query = query.is('sentiment_score', null)
    }

    // Apply filters
    if (user_id) {
      query = query.eq('owner_user_id', user_id)
    }

    if (meeting_ids && meeting_ids.length > 0) {
      query = query.in('id', meeting_ids)
    }

    if (limit) {
      query = query.limit(limit)
    }

    const { data: meetings, error: meetingsError } = await query

    if (meetingsError) {
      throw new Error(`Failed to fetch meetings: ${meetingsError.message}`)
    }

    if (!meetings || meetings.length === 0) {
      return new Response(
        JSON.stringify({
          success: true,
          message: 'No meetings found with transcripts',
          meetings_processed: 0,
          meetings_skipped: 0,
          action_items_created: 0,
        }),
        {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      )
    }
    let processedCount = 0
    let skippedCount = 0
    let totalActionItems = 0
    const errors: Array<{ meeting_id: string; title: string; error: string }> = []

    // Process each meeting
    for (const meeting of meetings) {
      try {
        // Check if action items already exist
        const { data: existingActionItems, error: checkError } = await supabase
          .from('meeting_action_items')
          .select('id')
          .eq('meeting_id', meeting.id)
          .limit(1)

        if (checkError) {
          console.warn(`Could not check action items for meeting ${meeting.id}:`, checkError.message)
        }

        const hasExistingActionItems = existingActionItems && existingActionItems.length > 0

        // Force mode: delete existing action items first
        if (force && hasExistingActionItems) {
          const { error: deleteError } = await supabase
            .from('meeting_action_items')
            .delete()
            .eq('meeting_id', meeting.id)

          if (deleteError) {
            console.warn(`Failed to delete action items for meeting ${meeting.id}:`, deleteError.message)
          }
        }

        // Analyze transcript with Claude (with extraction rules - Phase 6.3)
        // ALWAYS run AI analysis to update meeting metrics (coach_rating, sentiment, etc.)
        const analysis: TranscriptAnalysis = await analyzeTranscriptWithClaude(
          meeting.transcript_text,
          {
            id: meeting.id,
            title: meeting.title,
            meeting_start: meeting.meeting_start,
            owner_email: null, // Not needed for analysis
          },
          supabase,
          meeting.owner_user_id
        )
        // Build update object with ALL AI metrics including coaching insights
        const updateData: Record<string, any> = {
          talk_time_rep_pct: analysis.talkTime.repPct,
          talk_time_customer_pct: analysis.talkTime.customerPct,
          talk_time_judgement: analysis.talkTime.assessment,
          sentiment_score: analysis.sentiment.score,
          sentiment_reasoning: analysis.sentiment.reasoning,
          // Add coaching fields that were missing!
          coach_rating: analysis.coaching.rating,
          coach_summary: JSON.stringify({
            summary: analysis.coaching.summary,
            strengths: analysis.coaching.strengths,
            improvements: analysis.coaching.improvements,
            evaluationBreakdown: analysis.coaching.evaluationBreakdown,
          }),
        }

        // Add call type classification if available
        if (analysis.callType) {
          updateData.call_type_id = analysis.callType.callTypeId
          updateData.call_type_confidence = analysis.callType.confidence
          updateData.call_type_reasoning = analysis.callType.reasoning
        }

        // Update meeting with AI metrics
        const { error: updateError } = await supabase
          .from('meetings')
          .update(updateData)
          .eq('id', meeting.id)

        if (updateError) {
          console.error(`❌ Failed to update meeting ${meeting.id}:`, updateError.message)
        }

        // Store action items WITHOUT automatic task creation
        // Only create action items if they don't already exist (or if force mode deleted them)
        const shouldCreateActionItems = !hasExistingActionItems || force

        if (shouldCreateActionItems && analysis.actionItems.length > 0) {
          for (const item of analysis.actionItems) {
            const { error: insertError } = await supabase
              .from('meeting_action_items')
              .insert({
                meeting_id: meeting.id,
                title: item.title,
                description: item.title,
                priority: item.priority,
                category: item.category,
                assignee_name: item.assignedTo || null,
                assignee_email: item.assignedToEmail || null,
                deadline_at: item.deadline ? new Date(item.deadline).toISOString() : null,
                ai_generated: true,
                ai_confidence: item.confidence,
                needs_review: item.confidence < 0.8,
                completed: false,
                synced_to_task: false,
                task_id: null,
                timestamp_seconds: null,
                playback_url: null,
              })

            if (insertError) {
              console.warn(`Failed to insert action item for meeting ${meeting.id}:`, insertError.message)
            } else {
              totalActionItems++
            }
          }
        } else if (hasExistingActionItems && !force) {
          // Meeting had existing action items, just increment skip count for reporting
          skippedCount++
        }

        processedCount++

      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error'
        errors.push({
          meeting_id: meeting.id,
          title: meeting.title,
          error: errorMessage,
        })
      }
    }

    // Summary
    return new Response(
      JSON.stringify({
        success: true,
        request_id: requestId,
        meetings_processed: processedCount,
        meetings_skipped: skippedCount,
        action_items_created: totalActionItems,
        errors: errors.length > 0 ? errors : undefined,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    )

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    await captureException(error, {
      tags: {
        function: 'reprocess-meetings-ai',
        integration: 'anthropic',
      },
    });
    return new Response(
      JSON.stringify({
        success: false,
        error: errorMessage,
        request_id: requestId,
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    )
  }
})
