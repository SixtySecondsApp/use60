/**
 * Handler: generate-s3-video-thumbnail
 * Generates thumbnails for video recordings stored in S3 via AWS Lambda + ffmpeg.
 * Full logic extracted from generate-s3-video-thumbnail/index.ts.
 */

import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.43.4';
import { S3Client, PutObjectCommand, GetObjectCommand } from 'npm:@aws-sdk/client-s3@3';
import { getSignedUrl } from 'npm:@aws-sdk/s3-request-presigner@3';
import { corsHeaders, handleCorsPreflightWithResponse } from '../../_shared/corsHelper.ts';

// =============================================================================
// Types
// =============================================================================

interface GenerateThumbnailRequest {
  recording_id?: string;
  meeting_id?: string;
  bot_id?: string;
  timestamp?: number;
}

interface ThumbnailResult {
  success: boolean;
  thumbnail_url?: string;
  thumbnail_s3_key?: string;
  error?: string;
}

// =============================================================================
// Lambda Integration
// =============================================================================

async function generatePresignedVideoUrl(s3Key: string): Promise<string | null> {
  try {
    const s3Client = new S3Client({
      region: Deno.env.get('AWS_REGION') || 'eu-west-2',
      credentials: {
        accessKeyId: Deno.env.get('AWS_ACCESS_KEY_ID')!,
        secretAccessKey: Deno.env.get('AWS_SECRET_ACCESS_KEY')!,
      },
    });

    const bucketName = Deno.env.get('AWS_S3_BUCKET') || 'use60-application';

    const signedUrl = await getSignedUrl(
      s3Client,
      new GetObjectCommand({ Bucket: bucketName, Key: s3Key }),
      { expiresIn: 60 * 15 }
    );

    console.log(`[Thumbnail] Generated presigned URL for ${s3Key}`);
    return signedUrl;
  } catch (error) {
    console.error('[Thumbnail] Failed to generate presigned URL:', error);
    return null;
  }
}

async function callLambdaThumbnailGenerator(
  s3Key: string,
  timestampSeconds: number = 30
): Promise<ThumbnailResult> {
  const lambdaUrl = Deno.env.get('AWS_LAMBDA_THUMBNAIL_URL') ||
    Deno.env.get('CUSTOM_THUMBNAIL_API_URL') ||
    'https://pnip1dhixe.execute-api.eu-west-2.amazonaws.com/fathom-thumbnail-generator/thumbnail';

  const lambdaApiKey = Deno.env.get('AWS_LAMBDA_API_KEY');

  try {
    const videoUrl = await generatePresignedVideoUrl(s3Key);
    if (!videoUrl) {
      return { success: false, error: 'Failed to generate presigned URL for video' };
    }

    console.log(`[Thumbnail] Calling Lambda for ${s3Key} at ${timestampSeconds}s`);

    const requestBody = {
      fathom_url: videoUrl,
      timestamp_seconds: timestampSeconds,
    };

    const response = await fetch(lambdaUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(lambdaApiKey && { 'x-api-key': lambdaApiKey }),
      },
      body: JSON.stringify(requestBody),
      signal: AbortSignal.timeout(90000),
    });

    const responseText = await response.text();
    console.log(`[Thumbnail] Lambda response status: ${response.status}`);

    if (!response.ok) {
      throw new Error(`Lambda error: ${response.status} - ${responseText}`);
    }

    let result;
    try {
      result = JSON.parse(responseText);
    } catch (parseError) {
      throw new Error(`Lambda returned invalid JSON: ${responseText.substring(0, 200)}`);
    }

    if (result.http_url || result.thumbnail_url) {
      const thumbnailUrl = result.http_url || result.thumbnail_url;
      const thumbnailS3Key = result.s3_location || result.thumbnail_s3_key;

      console.log(`[Thumbnail] Lambda success: ${thumbnailUrl}`);
      return { success: true, thumbnail_s3_key: thumbnailS3Key, thumbnail_url: thumbnailUrl };
    }

    return { success: false, error: result.error || 'Unknown Lambda error' };
  } catch (error) {
    console.error('[Thumbnail] Lambda call failed:', error);
    return { success: false, error: error instanceof Error ? error.message : 'Lambda call failed' };
  }
}

async function generatePlaceholderThumbnail(
  meetingTitle: string,
  orgId: string,
  recordingId: string
): Promise<ThumbnailResult> {
  const s3Client = new S3Client({
    region: Deno.env.get('AWS_REGION') || 'eu-west-2',
    credentials: {
      accessKeyId: Deno.env.get('AWS_ACCESS_KEY_ID')!,
      secretAccessKey: Deno.env.get('AWS_SECRET_ACCESS_KEY')!,
    },
  });

  const bucketName = Deno.env.get('AWS_S3_BUCKET') || 'use60-application';
  const initial = (meetingTitle || 'M')[0].toUpperCase();
  const colors = ['#4F46E5', '#7C3AED', '#2563EB', '#0891B2', '#059669'];
  const color = colors[initial.charCodeAt(0) % colors.length];
  const truncatedTitle = (meetingTitle || 'Recording').substring(0, 40);

  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="480" height="270" viewBox="0 0 480 270">
      <defs>
        <linearGradient id="bgGrad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" style="stop-color:${color};stop-opacity:1" />
          <stop offset="100%" style="stop-color:#1E1E2E;stop-opacity:1" />
        </linearGradient>
      </defs>
      <rect width="480" height="270" fill="url(#bgGrad)"/>
      <circle cx="240" cy="120" r="40" fill="rgba(255,255,255,0.2)"/>
      <polygon points="230,100 260,120 230,140" fill="white"/>
      <text x="240" y="190" font-family="Arial, sans-serif" font-size="14" fill="white" text-anchor="middle" font-weight="bold">${truncatedTitle}</text>
      <text x="240" y="215" font-family="Arial, sans-serif" font-size="12" fill="rgba(255,255,255,0.7)" text-anchor="middle">60 Notetaker Recording</text>
      <circle cx="420" cy="40" r="25" fill="rgba(255,255,255,0.3)"/>
      <text x="420" y="47" font-family="Arial, sans-serif" font-size="20" fill="white" text-anchor="middle" dominant-baseline="middle" font-weight="bold">${initial}</text>
    </svg>
  `;

  try {
    const s3Key = `meeting-thumbnails/${orgId}/${recordingId}/placeholder.svg`;

    await s3Client.send(
      new PutObjectCommand({
        Bucket: bucketName, Key: s3Key,
        Body: new TextEncoder().encode(svg), ContentType: 'image/svg+xml',
        Metadata: { 'is-placeholder': 'true', 'meeting-title': meetingTitle.substring(0, 100) },
      })
    );

    const signedUrl = await getSignedUrl(
      s3Client,
      new GetObjectCommand({ Bucket: bucketName, Key: s3Key }),
      { expiresIn: 60 * 60 * 24 * 7 }
    );

    console.log(`[Thumbnail] Created placeholder: ${s3Key}`);
    return { success: true, thumbnail_s3_key: s3Key, thumbnail_url: signedUrl };
  } catch (error) {
    console.error('[Thumbnail] Placeholder generation failed:', error);
    return { success: false, error: error instanceof Error ? error.message : 'Placeholder generation failed' };
  }
}

// =============================================================================
// Main Generation Logic
// =============================================================================

async function generateThumbnail(
  supabase: SupabaseClient,
  request: GenerateThumbnailRequest
): Promise<ThumbnailResult> {
  const { recording_id, meeting_id, bot_id, timestamp = 30 } = request;

  console.log('[Thumbnail] Starting generation:', { recording_id, meeting_id, bot_id, timestamp });

  let recording: Record<string, unknown> | null = null;
  let targetTable: 'recordings' | 'meetings' = 'recordings';
  let targetId: string | null = null;

  if (recording_id) {
    const { data, error } = await supabase
      .from('recordings')
      .select('id, org_id, user_id, recording_s3_key, meeting_title')
      .eq('id', recording_id)
      .single();

    if (error || !data) return { success: false, error: 'Recording not found' };
    recording = data;
    targetTable = 'recordings';
    targetId = recording_id;
  } else if (meeting_id || bot_id) {
    let query = supabase.from('meetings').select('id, org_id, owner_user_id, recording_s3_key, title');
    if (meeting_id) query = query.eq('id', meeting_id);
    else if (bot_id) query = query.eq('bot_id', bot_id);

    const { data, error } = await query.single();
    if (error || !data) return { success: false, error: 'Meeting not found' };
    recording = data;
    targetTable = 'meetings';
    targetId = data.id as string;
  } else {
    return { success: false, error: 'recording_id, meeting_id, or bot_id required' };
  }

  const s3Key = recording.recording_s3_key as string;
  const orgId = (recording.org_id || recording.owner_user_id) as string;
  const title = (recording.meeting_title || recording.title || 'Meeting') as string;

  if (!s3Key) {
    console.warn('[Thumbnail] No S3 key found, generating placeholder');
    return await generatePlaceholderThumbnail(title, orgId, targetId!);
  }

  const timestamps = [timestamp, Math.max(timestamp - 20, 0), 0];

  for (const ts of timestamps) {
    const result = await callLambdaThumbnailGenerator(s3Key, ts);
    if (result.success) {
      const updateFields = {
        thumbnail_s3_key: result.thumbnail_s3_key,
        thumbnail_url: result.thumbnail_url,
        updated_at: new Date().toISOString(),
      };

      if (targetTable === 'recordings') {
        await supabase.from('recordings').update(updateFields).eq('id', targetId);
      } else {
        await supabase.from('meetings').update(updateFields).eq('id', targetId);
      }

      if (targetTable === 'recordings' && bot_id) {
        await supabase.from('meetings').update(updateFields).eq('bot_id', bot_id).eq('source_type', '60_notetaker');
      }

      console.log(`[Thumbnail] Successfully generated at ${ts}s`);
      return result;
    }

    console.warn(`[Thumbnail] Lambda failed at ${ts}s, trying next timestamp`);
  }

  console.warn('[Thumbnail] All Lambda attempts failed, using placeholder');
  const placeholderResult = await generatePlaceholderThumbnail(title, orgId, targetId!);

  if (placeholderResult.success) {
    const updateFields = {
      thumbnail_s3_key: placeholderResult.thumbnail_s3_key,
      thumbnail_url: placeholderResult.thumbnail_url,
      updated_at: new Date().toISOString(),
    };

    if (targetTable === 'recordings') {
      await supabase.from('recordings').update(updateFields).eq('id', targetId);
    } else {
      await supabase.from('meetings').update(updateFields).eq('id', targetId);
    }

    if (targetTable === 'recordings' && bot_id) {
      await supabase.from('meetings').update(updateFields).eq('bot_id', bot_id).eq('source_type', '60_notetaker');
    }
  }

  return placeholderResult;
}

// =============================================================================
// Export Handler
// =============================================================================

export async function handleS3VideoThumbnail(req: Request): Promise<Response> {
  if (req.method === 'OPTIONS') {
    return handleCorsPreflightWithResponse();
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  try {
    const authHeader = req.headers.get('Authorization');

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || Deno.env.get('SUPABASE_ANON_KEY')!,
      authHeader ? { global: { headers: { Authorization: authHeader } } } : undefined
    );

    const body: GenerateThumbnailRequest = await req.json();
    const result = await generateThumbnail(supabase, body);

    return new Response(JSON.stringify(result), {
      status: result.success ? 200 : 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('[Thumbnail] Error:', error);
    return new Response(
      JSON.stringify({
        success: false, error: 'Internal server error',
        message: error instanceof Error ? error.message : 'Unknown error',
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
}
