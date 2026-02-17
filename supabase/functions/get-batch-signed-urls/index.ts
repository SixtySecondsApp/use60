/**
 * Get Batch Signed URLs Edge Function
 *
 * Generates fresh signed S3 URLs for multiple recordings in a single request.
 * Returns video URLs (from recording_s3_key) and thumbnail URLs (from thumbnail_s3_key).
 * Used by the recordings list to display video thumbnails without N+1 API calls.
 *
 * Endpoint: POST /functions/v1/get-batch-signed-urls
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { S3Client, GetObjectCommand } from 'npm:@aws-sdk/client-s3@3';
import { getSignedUrl } from 'npm:@aws-sdk/s3-request-presigner@3';
import {
  handleCorsPreflightRequest,
  jsonResponse,
  errorResponse,
} from '../_shared/corsHelper.ts';

// URL expiry time: 7 days in seconds
const URL_EXPIRY_SECONDS = 60 * 60 * 24 * 7;
const MAX_BATCH_SIZE = 50;

interface BatchRequest {
  recording_ids: string[];
}

interface SignedUrlEntry {
  video_url: string;
  thumbnail_url?: string;
}

serve(async (req) => {
  // Handle CORS preflight
  const preflightResponse = handleCorsPreflightRequest(req);
  if (preflightResponse) {
    return preflightResponse;
  }

  if (req.method !== 'POST') {
    return errorResponse('Method not allowed', req, 405);
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return errorResponse('Missing authorization header', req, 401);
    }

    // Parse request body
    const body: BatchRequest = await req.json();
    const { recording_ids } = body;

    if (!recording_ids || !Array.isArray(recording_ids) || recording_ids.length === 0) {
      return errorResponse('recording_ids array is required', req, 400);
    }

    if (recording_ids.length > MAX_BATCH_SIZE) {
      return errorResponse(`Maximum ${MAX_BATCH_SIZE} recordings per batch`, req, 400);
    }

    // Create Supabase client with user's JWT for RLS
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      {
        global: {
          headers: { Authorization: authHeader },
        },
      }
    );

    // Verify user is authenticated
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      return errorResponse('Unauthorized', req, 401);
    }

    // Fetch recordings (RLS enforces access)
    const { data: recordings, error: queryError } = await supabase
      .from('recordings')
      .select('id, recording_s3_key, thumbnail_s3_key, status')
      .in('id', recording_ids);

    if (queryError) {
      console.error('[GetBatchSignedUrls] Query error:', queryError);
      return errorResponse('Failed to fetch recordings', req, 500);
    }

    if (!recordings || recordings.length === 0) {
      return jsonResponse({ urls: {} }, req);
    }

    // Initialize S3 client
    const s3Client = new S3Client({
      region: Deno.env.get('AWS_REGION') || 'eu-west-2',
      credentials: {
        accessKeyId: Deno.env.get('AWS_ACCESS_KEY_ID')!,
        secretAccessKey: Deno.env.get('AWS_SECRET_ACCESS_KEY')!,
      },
    });

    const bucketName = Deno.env.get('AWS_S3_BUCKET') || 'use60-application';

    // Generate signed URLs for each recording
    const urls: Record<string, SignedUrlEntry> = {};

    await Promise.all(
      recordings.map(async (recording) => {
        if (recording.status !== 'ready' || !recording.recording_s3_key) {
          return;
        }

        try {
          // Generate video signed URL
          const videoSignedUrl = await getSignedUrl(
            s3Client,
            new GetObjectCommand({
              Bucket: bucketName,
              Key: recording.recording_s3_key,
            }),
            { expiresIn: URL_EXPIRY_SECONDS }
          );

          const entry: SignedUrlEntry = { video_url: videoSignedUrl };

          // Generate thumbnail signed URL if key exists
          if (recording.thumbnail_s3_key) {
            try {
              entry.thumbnail_url = await getSignedUrl(
                s3Client,
                new GetObjectCommand({
                  Bucket: bucketName,
                  Key: recording.thumbnail_s3_key,
                }),
                { expiresIn: URL_EXPIRY_SECONDS }
              );
            } catch (err) {
              console.warn(`[GetBatchSignedUrls] Thumbnail URL failed for ${recording.id}:`, err);
            }
          }

          urls[recording.id] = entry;
        } catch (err) {
          console.warn(`[GetBatchSignedUrls] Video URL failed for ${recording.id}:`, err);
        }
      })
    );

    console.log(`[GetBatchSignedUrls] Generated URLs for ${Object.keys(urls).length}/${recordings.length} recordings`);

    return jsonResponse({ urls }, req);
  } catch (error) {
    console.error('[GetBatchSignedUrls] Error:', error);
    return errorResponse(
      error instanceof Error ? error.message : 'Internal server error',
      req,
      500
    );
  }
});
