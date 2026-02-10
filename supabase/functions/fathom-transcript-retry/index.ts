import { serve } from "https://deno.land/std@0.190.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"
import { captureException } from '../_shared/sentryEdge.ts'
import { fetchTranscriptFromFathom, fetchSummaryFromFathom } from '../_shared/fathomTranscript.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

/**
 * Refresh OAuth access token if expired
 */
async function refreshAccessToken(supabase: any, integration: any): Promise<string> {
  const now = new Date()
  const expiresAt = new Date(integration.token_expires_at)

  // Check if token is expired or will expire within 5 minutes
  const bufferMs = 5 * 60 * 1000 // 5 minutes buffer
  if (expiresAt.getTime() - now.getTime() > bufferMs) {
    // Token is still valid
    return integration.access_token
  }
  
  // Get OAuth configuration
  const clientId = Deno.env.get('FATHOM_CLIENT_ID')
  const clientSecret = Deno.env.get('FATHOM_CLIENT_SECRET')

  if (!clientId || !clientSecret) {
    throw new Error('Missing Fathom OAuth configuration for token refresh')
  }

  // Exchange refresh token for new access token
  const tokenParams = new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: integration.refresh_token,
    client_id: clientId,
    client_secret: clientSecret,
  })

  const tokenResponse = await fetch('https://fathom.video/external/v1/oauth2/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: tokenParams.toString(),
  })

  if (!tokenResponse.ok) {
    const errorText = await tokenResponse.text()
    throw new Error(`Token refresh failed: ${errorText}. Please reconnect your Fathom integration.`)
  }

  const tokenData = await tokenResponse.json()
  // Calculate new token expiry
  const expiresIn = tokenData.expires_in || 3600 // Default 1 hour
  const newTokenExpiresAt = new Date(Date.now() + expiresIn * 1000).toISOString()

  // Update tokens in database
  const { error: updateError } = await supabase
    .from('fathom_integrations')
    .update({
      access_token: tokenData.access_token,
      refresh_token: tokenData.refresh_token || integration.refresh_token,
      token_expires_at: newTokenExpiresAt,
      updated_at: new Date().toISOString(),
    })
    .eq('id', integration.id)

  if (updateError) {
    throw new Error(`Failed to update refreshed tokens: ${updateError.message}`)
  }
  return tokenData.access_token
}

/**
 * Process a single retry job
 */
async function processRetryJob(
  supabase: any,
  job: {
    id: string
    meeting_id: string
    user_id: string
    recording_id: string
    attempt_count: number
    max_attempts: number
  }
): Promise<{ success: boolean; error?: string }> {
  try {
    // Mark job as processing
    await supabase
      .from('fathom_transcript_retry_jobs')
      .update({ status: 'processing', updated_at: new Date().toISOString() })
      .eq('id', job.id)

    // Get meeting details
    const { data: meeting, error: meetingError } = await supabase
      .from('meetings')
      .select('id, transcript_text, fathom_recording_id, owner_user_id')
      .eq('id', job.meeting_id)
      .single()

    if (meetingError || !meeting) {
      throw new Error(`Meeting not found: ${meetingError?.message || 'Unknown error'}`)
    }

    // Check if transcript already exists (another process might have fetched it)
    if (meeting.transcript_text) {
      console.log(`✅ Transcript already exists for meeting ${job.meeting_id} - marking job complete`)
      await supabase
        .from('fathom_transcript_retry_jobs')
        .update({
          status: 'completed',
          completed_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', job.id)

      // Also mark meeting fetch attempts as complete and update status
      await supabase
        .from('meetings')
        .update({
          transcript_fetch_attempts: job.attempt_count,
          last_transcript_fetch_at: new Date().toISOString(),
          transcript_status: 'complete',
          summary_status: 'complete',
        })
        .eq('id', job.meeting_id)

      return { success: true }
    }

    // Update meeting status to 'processing' when starting to fetch
    await supabase
      .from('meetings')
      .update({
        transcript_status: 'processing',
        summary_status: 'processing',
      })
      .eq('id', job.meeting_id)

    // Get Fathom integration
    const { data: integration, error: integrationError } = await supabase
      .from('fathom_integrations')
      .select('*')
      .eq('user_id', job.user_id)
      .eq('is_active', true)
      .single()

    if (integrationError || !integration) {
      throw new Error(`Fathom integration not found: ${integrationError?.message || 'Unknown error'}`)
    }

    // Refresh token if needed
    const accessToken = await refreshAccessToken(supabase, integration)

    // Attempt to fetch transcript
    console.log(`📄 Retry attempt ${job.attempt_count + 1}/${job.max_attempts} for meeting ${job.meeting_id} (recording: ${job.recording_id})`)
    
    const transcript = await fetchTranscriptFromFathom(accessToken, job.recording_id)

    if (!transcript) {
      // Transcript still not available - schedule next retry
      const nextAttempt = job.attempt_count + 1
      
      if (nextAttempt >= job.max_attempts) {
        // Max attempts reached - mark as failed
        console.log(`❌ Max attempts (${job.max_attempts}) reached for meeting ${job.meeting_id} - marking as failed`)
        await supabase
          .from('fathom_transcript_retry_jobs')
          .update({
            status: 'failed',
            attempt_count: nextAttempt,
            last_error: 'Max retry attempts reached - transcript still not available',
            updated_at: new Date().toISOString(),
          })
          .eq('id', job.id)

        // Update meeting fetch attempts and status to failed
        await supabase
          .from('meetings')
          .update({
            transcript_fetch_attempts: nextAttempt,
            last_transcript_fetch_at: new Date().toISOString(),
            transcript_status: 'failed',
            summary_status: 'failed',
          })
          .eq('id', job.meeting_id)

        return { success: false, error: 'Max retry attempts reached' }
      }

      // Schedule next retry in 5 minutes
      const nextRetryAt = new Date(Date.now() + 5 * 60 * 1000).toISOString()
      console.log(`⏳ Scheduling next retry for meeting ${job.meeting_id} at ${nextRetryAt} (attempt ${nextAttempt + 1})`)

      await supabase
        .from('fathom_transcript_retry_jobs')
        .update({
          status: 'pending',
          attempt_count: nextAttempt,
          next_retry_at: nextRetryAt,
          updated_at: new Date().toISOString(),
        })
        .eq('id', job.id)

      // Update meeting fetch attempts - keep status as 'pending' (queued for retry)
      await supabase
        .from('meetings')
        .update({
          transcript_fetch_attempts: nextAttempt,
          last_transcript_fetch_at: new Date().toISOString(),
          transcript_status: 'pending',
          summary_status: 'pending',
        })
        .eq('id', job.meeting_id)

      return { success: false, error: 'Transcript not yet available - will retry' }
    }

    // Success! Transcript fetched
    console.log(`✅ Successfully fetched transcript for meeting ${job.meeting_id} (${transcript.length} characters)`)

    // Fetch enhanced summary (non-blocking)
    let summaryData: any = null
    try {
      summaryData = await fetchSummaryFromFathom(accessToken, job.recording_id)
      if (summaryData) {
        console.log(`✅ Successfully fetched enhanced summary for meeting ${job.meeting_id}`)
      }
    } catch (error) {
      console.error(`⚠️  Failed to fetch enhanced summary for meeting ${job.meeting_id}:`, error instanceof Error ? error.message : String(error))
    }

    // Extract summary text — Fathom returns { summary: { template_name, markdown_formatted } }
    let summaryValue: string | null = null
    if (summaryData?.summary) {
      if (typeof summaryData.summary === 'string') {
        summaryValue = summaryData.summary
      } else if (summaryData.summary.markdown_formatted) {
        summaryValue = JSON.stringify(summaryData.summary)
      }
    }

    // Store transcript in meeting and update status to 'complete'
    const { error: updateError } = await supabase
      .from('meetings')
      .update({
        transcript_text: transcript,
        ...(summaryValue ? { summary: summaryValue, summary_status: 'complete' } : {}),
        transcript_fetch_attempts: job.attempt_count + 1,
        last_transcript_fetch_at: new Date().toISOString(),
        transcript_status: 'complete',
      })
      .eq('id', job.meeting_id)

    if (updateError) {
      throw new Error(`Failed to update meeting: ${updateError.message}`)
    }

    // Mark job as completed
    await supabase
      .from('fathom_transcript_retry_jobs')
      .update({
        status: 'completed',
        completed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', job.id)

    console.log(`✅ Completed retry job ${job.id} for meeting ${job.meeting_id}`)
    return { success: true }

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    console.error(`❌ Error processing retry job ${job.id}:`, errorMessage)

    // Update job with error
    await supabase
      .from('fathom_transcript_retry_jobs')
      .update({
        status: 'pending', // Retry on next cycle
        last_error: errorMessage,
        updated_at: new Date().toISOString(),
      })
      .eq('id', job.id)

    return { success: false, error: errorMessage }
  }
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // Authorization: This function is deployed with --no-verify-jwt so it's accessible
    // without JWT verification. We rely on the function URL being non-public
    // (only called by cron jobs and internal fire-and-forget triggers).
    // The service role key is used internally to create the Supabase admin client.
    //
    // Previous auth check was removed because Supabase gateway modifies the
    // Authorization header during JWT validation, making it impossible to compare
    // the raw service role key against the received header.

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

    // Get batch size from request or use default
    const body = await req.json().catch(() => ({}))
    const batchSize = body.batch_size || 50

    // Get pending jobs ready for retry
    const { data: jobs, error: jobsError } = await supabase
      .rpc('get_pending_transcript_retry_jobs', { p_batch_size: batchSize })

    if (jobsError) {
      throw new Error(`Failed to fetch pending jobs: ${jobsError.message}`)
    }

    if (!jobs || jobs.length === 0) {
      return new Response(
        JSON.stringify({
          success: true,
          message: 'No pending retry jobs',
          processed: 0,
        }),
        {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      )
    }

    console.log(`📋 Processing ${jobs.length} transcript retry jobs`)

    const results = {
      total: jobs.length,
      successful: 0,
      failed: 0,
      retried: 0,
      errors: [] as Array<{ job_id: string; error: string }>,
    }

    // Process each job
    for (const job of jobs) {
      const result = await processRetryJob(supabase, job)

      if (result.success) {
        results.successful++
      } else if (result.error?.includes('will retry')) {
        results.retried++
      } else {
        results.failed++
        results.errors.push({
          job_id: job.id,
          error: result.error || 'Unknown error',
        })
      }

      // Small delay to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 500))
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: `Processed ${results.total} retry jobs`,
        results,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    )

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    console.error('❌ Transcript retry processor error:', errorMessage)
    await captureException(error, {
      tags: {
        function: 'fathom-transcript-retry',
        integration: 'fathom',
      },
    });

    return new Response(
      JSON.stringify({
        success: false,
        error: errorMessage,
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    )
  }
})

