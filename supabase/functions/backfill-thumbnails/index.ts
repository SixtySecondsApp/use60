import { serve } from "https://deno.land/std@0.190.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.43.4"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface BackfillProgress {
  total: number
  processed: number
  successful: number
  failed: number
  errors: Array<{ id: string; error: string }>
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { batchSize = 10, dryRun = false, includePending = false, org_id: requestedOrgId } = await req.json().catch(() => ({}))

    // Initialize Supabase clients
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabaseAnon = Deno.env.get('SUPABASE_ANON_KEY')!

    // Verify user authentication
    const authHeader = req.headers.get('Authorization') || ''
    const anonClient = createClient(supabaseUrl, supabaseAnon, {
      global: { headers: { Authorization: authHeader } }
    })

    const { data: { user }, error: authError } = await anonClient.auth.getUser()
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    const supabase = createClient(supabaseUrl, supabaseKey)

    // Use requested org_id if provided, otherwise fall back to first membership
    let orgId = requestedOrgId
    if (!orgId) {
      const { data: membership } = await supabase
        .from('organization_memberships')
        .select('org_id')
        .eq('user_id', user.id)
        .limit(1)
        .maybeSingle()

      if (!membership) {
        return new Response(JSON.stringify({ error: 'User is not a member of any organization' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        })
      }
      orgId = membership.org_id
    }

    // Verify user has access to this org
    const { data: membership } = await supabase
      .from('organization_memberships')
      .select('org_id')
      .eq('user_id', user.id)
      .eq('org_id', orgId)
      .maybeSingle()

    if (!membership) {
      return new Response(JSON.stringify({ error: 'User is not a member of this organization' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    // Query meetings without proper thumbnails for this org
    // If includePending is true, also include meetings with pending status or placeholder URLs
    let query = supabase
      .from('meetings')
      .select('id, fathom_recording_id, share_url, title, duration_minutes, thumbnail_url, thumbnail_status')
      .eq('org_id', orgId)
      .not('fathom_recording_id', 'is', null)
      .limit(batchSize)

    if (includePending) {
      // Include: null thumbnails, pending status, or placeholder URLs
      query = query.or('thumbnail_url.is.null,thumbnail_status.eq.pending,thumbnail_url.like.%dummyimage.com%')
    } else {
      query = query.is('thumbnail_url', null)
    }

    const { data: meetings, error: queryError } = await query

    if (queryError) {
      throw new Error(`Failed to query meetings: ${queryError.message}`)
    }

    if (!meetings || meetings.length === 0) {
      return new Response(
        JSON.stringify({
          success: true,
          message: 'No meetings require thumbnail generation',
          progress: {
            total: 0,
            processed: 0,
            successful: 0,
            failed: 0,
            errors: []
          }
        }),
        {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      )
    }
    const progress: BackfillProgress = {
      total: meetings.length,
      processed: 0,
      successful: 0,
      failed: 0,
      errors: []
    }

    // Helper: Build embed URL from share_url or recording_id
    function buildEmbedUrl(shareUrl?: string | null, recordingId?: string | null): string | null {
      try {
        if (recordingId) {
          return `https://app.fathom.video/recording/${recordingId}`
        }
        if (!shareUrl) return null
        const u = new URL(shareUrl)
        const parts = u.pathname.split('/').filter(Boolean)
        const token = parts.pop()
        if (!token) return null
        return `https://fathom.video/embed/${token}`
      } catch {
        return null
      }
    }


    // Process each meeting
    for (const meeting of meetings) {
      try {
        const embedUrl = buildEmbedUrl(meeting.share_url, meeting.fathom_recording_id)
        if (!embedUrl) {
        }

        if (dryRun) {
          progress.processed++
          progress.successful++
          continue
        }

        // Only use thumbnail service - direct endpoints don't work
        let thumbnailUrl: string | null = null

        // Generate via thumbnail service
        if (embedUrl) {
          // Choose a representative timestamp: midpoint, clamped to >=5s
          const midpointSeconds = Math.max(5, Math.floor(((meeting as any).duration_minutes || 0) * 60 / 2))
          const thumbnailResponse = await fetch(
            `${supabaseUrl}/functions/v1/generate-video-thumbnail-v2`,
            {
              method: 'POST',
              headers: {
                'Authorization': `Bearer ${supabaseKey}`,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                recording_id: meeting.fathom_recording_id,
                share_url: meeting.share_url,
                fathom_embed_url: embedUrl,
                timestamp_seconds: midpointSeconds,
              }),
            }
          )
          if (thumbnailResponse.ok) {
            const thumbnailData = await thumbnailResponse.json().catch(() => null)
            if (thumbnailData?.success && thumbnailData.thumbnail_url) {
              thumbnailUrl = thumbnailData.thumbnail_url
            }
          } else {
            const errText = await thumbnailResponse.text().catch(() => '')
          }
        }

        // Fallback to placeholder if thumbnail service failed
        if (!thumbnailUrl) {
          const firstLetter = (meeting.title || 'M')[0].toUpperCase()
          thumbnailUrl = `https://dummyimage.com/640x360/1a1a1a/10b981&text=${encodeURIComponent(firstLetter)}`
        }

        // Update meeting with thumbnail URL and status
        const { error: updateError } = await supabase
          .from('meetings')
          .update({ thumbnail_url: thumbnailUrl, thumbnail_status: 'complete' })
          .eq('id', meeting.id)

        if (updateError) {
          throw new Error(`Failed to update meeting: ${updateError.message}`)
        }
        progress.successful++

        // Rate limiting: wait 1 second between requests to avoid overwhelming Microlink free tier
        if (progress.processed < meetings.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 1000))
        }

      } catch (error) {
        progress.failed++
        progress.errors.push({
          id: meeting.id,
          error: error instanceof Error ? error.message : 'Unknown error'
        })
      }

      progress.processed++
    }
    return new Response(
      JSON.stringify({
        success: true,
        message: `Processed ${progress.processed} meetings`,
        progress,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    )

  } catch (error) {
    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    )
  }
})
