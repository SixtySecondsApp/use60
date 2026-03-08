/**
 * Handler: generate-video-thumbnail-v2
 * Simplified video thumbnail generator using custom AWS Lambda API.
 * Full logic extracted from generate-video-thumbnail-v2/index.ts.
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.43.4';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface ThumbnailRequest {
  recording_id: string
  share_url: string
  fathom_embed_url: string
  timestamp_seconds?: number
  meeting_id?: string
}

interface CustomAPIResponse {
  message: string
  thumbnail_size: number
  s3_location: string
  http_url: string
  fathom_url: string
  video_url: string
}

function normalizeFathomShareUrl(shareUrl: string): string {
  try {
    const url = new URL(shareUrl)
    if (url.hostname === 'app.fathom.video') {
      return `https://fathom.video${url.pathname}${url.search}`
    }
    if (url.hostname === 'share.fathom.video') {
      const parts = url.pathname.split('/').filter(Boolean)
      const token = parts[parts.length - 1]
      return `https://fathom.video/share/${token}`
    }
    return shareUrl
  } catch {
    return shareUrl
  }
}

async function captureWithCustomAPI(
  shareUrl: string,
  recordingId: string
): Promise<string | null> {
  try {
    const apiUrl = Deno.env.get('CUSTOM_THUMBNAIL_API_URL') ||
      'https://pnip1dhixe.execute-api.eu-west-2.amazonaws.com/fathom-thumbnail-generator/thumbnail'
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fathom_url: shareUrl }),
      signal: AbortSignal.timeout(30000)
    })
    if (!response.ok) {
      const errorText = await response.text()
      console.error(`Thumbnail API returned ${response.status} for recording ${recordingId}:`, errorText.substring(0, 300))
      return null
    }

    const data: CustomAPIResponse = await response.json()
    if (data.http_url) {
      return data.http_url
    }
    console.warn(`Thumbnail API did not return http_url for recording ${recordingId}`, data)
    return null
  } catch (error) {
    console.error(`Thumbnail API request failed for recording ${recordingId}:`, error instanceof Error ? error.message : String(error))
    return null
  }
}

async function fetchThumbnailFromShareUrl(shareUrl: string): Promise<string | null> {
  try {
    const res = await fetch(shareUrl, {
      headers: { 'User-Agent': 'Sixty/1.0 (+thumbnail-fetcher)', 'Accept': 'text/html' },
      signal: AbortSignal.timeout(10000)
    })

    if (!res.ok) return null

    const html = await res.text()

    const patterns = [
      /<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["'][^>]*>/i,
      /<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["'][^>]*>/i,
      /<meta[^>]+name=["']twitter:image["'][^>]+content=["']([^"']+)["'][^>]*>/i,
    ]

    for (const pattern of patterns) {
      const match = html.match(pattern)
      if (match && match[1]) return match[1]
    }
    return null
  } catch (error) {
    return null
  }
}

export async function handleVideoThumbnailV2(req: Request): Promise<Response> {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { recording_id, share_url, fathom_embed_url, timestamp_seconds, meeting_id }: ThumbnailRequest = await req.json()
    if (!recording_id || !share_url) {
      throw new Error('Missing required fields: recording_id and share_url')
    }

    const normalizedShareUrl = normalizeFathomShareUrl(share_url)
    let thumbnailUrl: string | null = null

    const thumbnailsFlag = Deno.env.get('ENABLE_VIDEO_THUMBNAILS')
    const thumbnailsExplicitlyDisabled = thumbnailsFlag === 'false'
    if (!thumbnailsExplicitlyDisabled) {
      thumbnailUrl = await captureWithCustomAPI(normalizedShareUrl, recording_id)
      if (!thumbnailUrl) {
        console.warn(`Custom thumbnail API returned null for recording ${recording_id}`)
      }
    } else {
      console.log('ENABLE_VIDEO_THUMBNAILS is explicitly false; skipping custom API capture')
    }

    if (!thumbnailUrl) {
      thumbnailUrl = await fetchThumbnailFromShareUrl(normalizedShareUrl)
    }

    if (!thumbnailUrl) {
      const firstLetter = (share_url.match(/\/([A-Za-z])/)?.[1] || 'M').toUpperCase()
      thumbnailUrl = `https://dummyimage.com/640x360/1a1a1a/10b981&text=${encodeURIComponent(firstLetter)}`
    }

    let dbUpdated = false
    if (meeting_id && thumbnailUrl) {
      try {
        const supabaseUrl = Deno.env.get('SUPABASE_URL')!
        const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
        const supabase = createClient(supabaseUrl, supabaseKey)

        const { error: updateError } = await supabase
          .from('meetings')
          .update({ thumbnail_url: thumbnailUrl })
          .eq('id', meeting_id)

        if (!updateError) {
          dbUpdated = true
        } else {
          console.warn(`Failed to persist thumbnail_url for meeting ${meeting_id}:`, updateError.message)
        }
      } catch (e) {
        console.error(`Error persisting thumbnail for meeting ${meeting_id}:`, e instanceof Error ? e.message : String(e))
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        thumbnail_url: thumbnailUrl,
        recording_id,
        db_updated: dbUpdated,
        method_used: thumbnailUrl.includes('fathom-thumbnail.s3') ? 'custom_api' :
                     thumbnailUrl.includes('dummyimage.com') ? 'placeholder' : 'og_image'
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (error) {
    console.error('Unhandled error in generate-video-thumbnail-v2:', error)
    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
}
