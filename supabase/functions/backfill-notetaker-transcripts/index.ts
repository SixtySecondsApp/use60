/**
 * Backfill 60 Notetaker Transcripts
 *
 * One-time backfill to reformat existing 60 Notetaker transcript_text
 * from raw paragraph text to the standard [HH:MM:SS] Speaker: text format.
 *
 * Reads transcript_json.utterances and speakers array from recordings,
 * formats using the shared transcriptFormatter utility, and updates
 * both recordings and meetings tables.
 *
 * Endpoint: POST /functions/v1/backfill-notetaker-transcripts
 * Auth: Service role key required
 *
 * Body params:
 * - dry_run: boolean (default: false) — preview changes without writing
 * - limit: number (default: 50) — max recordings to process per invocation
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { legacyCorsHeaders as corsHeaders } from '../_shared/corsHelper.ts'
import { formatUtterancesToTranscriptText, type SpeakerNameMap } from '../_shared/transcriptFormatter.ts'

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  )

  try {
    const body = await req.json().catch(() => ({}))
    const dryRun = body.dry_run === true
    const limit = body.limit || 50

    console.log(`[backfill-notetaker-transcripts] Starting (dry_run=${dryRun}, limit=${limit})`)

    // Find 60 Notetaker recordings with transcript_json but unformatted transcript_text
    const { data: recordings, error: queryError } = await supabase
      .from('recordings')
      .select('id, bot_id, transcript_json, transcript_text, speakers')
      .not('transcript_json', 'is', null)
      .order('created_at', { ascending: false })
      .limit(limit)

    if (queryError) {
      throw new Error(`Query failed: ${queryError.message}`)
    }

    if (!recordings || recordings.length === 0) {
      return new Response(JSON.stringify({
        success: true,
        message: 'No recordings to backfill',
        processed: 0,
      }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    let processed = 0
    let skipped = 0
    let errors = 0

    for (const recording of recordings) {
      try {
        const transcriptJson = recording.transcript_json as any
        const utterances = transcriptJson?.utterances

        if (!utterances || !Array.isArray(utterances) || utterances.length === 0) {
          skipped++
          continue
        }

        // Check if already formatted (starts with [HH:MM:SS])
        const currentText = recording.transcript_text || ''
        if (currentText.match(/^\[\d{2}:\d{2}:\d{2}\]/)) {
          skipped++
          continue
        }

        // Build speaker name map from stored speakers array
        const speakerNames: SpeakerNameMap = {}
        if (recording.speakers && Array.isArray(recording.speakers)) {
          for (const s of recording.speakers as any[]) {
            if (s.speaker_id !== undefined) {
              speakerNames[s.speaker_id] = s.name || `Speaker ${s.speaker_id + 1}`
            }
          }
        }

        const formatted = formatUtterancesToTranscriptText(utterances, speakerNames)
        if (!formatted) {
          skipped++
          continue
        }

        if (dryRun) {
          console.log(`[backfill] DRY RUN recording ${recording.id}: ${formatted.substring(0, 200)}...`)
          processed++
          continue
        }

        // Update recordings table
        const { error: recError } = await supabase
          .from('recordings')
          .update({ transcript_text: formatted })
          .eq('id', recording.id)

        if (recError) {
          console.error(`[backfill] Failed to update recording ${recording.id}:`, recError.message)
          errors++
          continue
        }

        // Update meetings table (matched by bot_id)
        if (recording.bot_id) {
          const { error: meetError } = await supabase
            .from('meetings')
            .update({ transcript_text: formatted })
            .eq('bot_id', recording.bot_id)
            .eq('source_type', '60_notetaker')

          if (meetError) {
            console.warn(`[backfill] Failed to update meeting for bot ${recording.bot_id}:`, meetError.message)
          }
        }

        processed++
        console.log(`[backfill] Updated recording ${recording.id} (${formatted.length} chars)`)
      } catch (err) {
        console.error(`[backfill] Error processing recording ${recording.id}:`,
          err instanceof Error ? err.message : String(err))
        errors++
      }
    }

    const result = {
      success: true,
      dry_run: dryRun,
      total_found: recordings.length,
      processed,
      skipped,
      errors,
    }

    console.log(`[backfill-notetaker-transcripts] Complete:`, result)

    return new Response(JSON.stringify(result), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (error) {
    console.error('[backfill-notetaker-transcripts] Error:', error)
    return new Response(JSON.stringify({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
