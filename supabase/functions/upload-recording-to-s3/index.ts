// Upload recording to S3 via Lambda compression pipeline
// Triggered by poll-s3-upload-queue cron job
// Invokes Lambda asynchronously (fire-and-forget) to compress + upload video
// Lambda calls back to process-compress-callback when done

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'jsr:@supabase/supabase-js@2';
import { getCorsHeaders, handleCorsPreflightRequest } from '../_shared/corsHelper.ts';
import { getS3Bucket, generateS3Key } from '../_shared/s3Client.ts';
import { LambdaClient, InvokeCommand } from 'npm:@aws-sdk/client-lambda@3';

interface UploadRequest {
  recording_id: string;
}

serve(async (req) => {
  // Handle CORS
  const corsPreflightResponse = handleCorsPreflightRequest(req);
  if (corsPreflightResponse) return corsPreflightResponse;
  const corsHeaders = getCorsHeaders(req);

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      {
        global: {
          headers: { Authorization: req.headers.get('Authorization')! },
        },
      }
    );

    const { recording_id } = (await req.json()) as UploadRequest;

    if (!recording_id) {
      return new Response(
        JSON.stringify({ error: 'recording_id required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`[Upload] Starting Lambda invocation for recording: ${recording_id}`);

    // 1. Get recording and bot deployment details
    const { data: recording, error: recordingError } = await supabase
      .from('recordings')
      .select(
        `
        id,
        org_id,
        user_id,
        s3_upload_status,
        bot_deployments (
          video_url,
          audio_url,
          created_at
        )
      `
      )
      .eq('id', recording_id)
      .single();

    if (recordingError || !recording) {
      throw new Error(`Recording not found: ${recordingError?.message}`);
    }

    // Check if already uploaded or processing
    if (recording.s3_upload_status === 'complete') {
      console.log('[Upload] Recording already uploaded to S3');
      return new Response(
        JSON.stringify({ message: 'Already uploaded', recording_id }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (recording.s3_upload_status === 'processing') {
      console.log('[Upload] Recording already being processed by Lambda');
      return new Response(
        JSON.stringify({ message: 'Already processing', recording_id }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get MeetingBaaS URLs
    const botDeployment = Array.isArray(recording.bot_deployments)
      ? recording.bot_deployments[0]
      : recording.bot_deployments;
    if (!botDeployment || !botDeployment.video_url) {
      throw new Error('No MeetingBaaS URLs found');
    }

    // Check URL expiry (4 hours from creation)
    const createdAt = new Date(botDeployment.created_at);
    const expiryTime = new Date(createdAt.getTime() + 4 * 60 * 60 * 1000);
    const now = new Date();

    if (now > expiryTime) {
      console.error('[Upload] MeetingBaaS URLs expired');
      await supabase
        .from('recordings')
        .update({
          s3_upload_status: 'failed',
          s3_upload_error_message: 'MeetingBaaS URLs expired (> 4 hours)',
        })
        .eq('id', recording_id);

      throw new Error('MeetingBaaS URLs expired');
    }

    // 2. Fetch video quality setting
    const { data: qualitySetting } = await supabase
      .from('app_settings')
      .select('value')
      .eq('key', 'notetaker_video_quality')
      .maybeSingle();

    const videoQuality = qualitySetting?.value || '480p';
    console.log(`[Upload] Video quality setting: ${videoQuality}`);

    // 3. Build S3 keys
    const bucket = getS3Bucket();
    const videoKey = generateS3Key(recording.org_id, recording.user_id, recording_id, 'video.mp4');
    const audioKey = generateS3Key(recording.org_id, recording.user_id, recording_id, 'audio.mp3');

    // 4. Build Lambda payload
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const callbackSecret = Deno.env.get('COMPRESS_CALLBACK_SECRET');
    if (!callbackSecret) {
      throw new Error('COMPRESS_CALLBACK_SECRET not configured');
    }

    const lambdaPayload = {
      recording_id,
      video_url: botDeployment.video_url,
      audio_url: botDeployment.audio_url || null,
      s3_bucket: bucket,
      s3_video_key: videoKey,
      s3_audio_key: audioKey,
      aws_region: Deno.env.get('AWS_REGION') || 'eu-west-2',
      callback_url: `${supabaseUrl}/functions/v1/process-compress-callback`,
      callback_secret: callbackSecret,
      video_quality: videoQuality,
    };

    // 5. Invoke Lambda asynchronously (fire-and-forget)
    const lambdaArn = Deno.env.get('LAMBDA_COMPRESS_FUNCTION_ARN');
    if (!lambdaArn) {
      throw new Error('LAMBDA_COMPRESS_FUNCTION_ARN not configured');
    }

    const lambdaClient = new LambdaClient({
      region: Deno.env.get('AWS_REGION') || 'eu-west-2',
      credentials: {
        accessKeyId: Deno.env.get('AWS_ACCESS_KEY_ID')!,
        secretAccessKey: Deno.env.get('AWS_SECRET_ACCESS_KEY')!,
      },
    });

    const invokeCommand = new InvokeCommand({
      FunctionName: lambdaArn,
      InvocationType: 'Event', // Async - returns 202 immediately
      Payload: new TextEncoder().encode(JSON.stringify(lambdaPayload)),
    });

    const lambdaResponse = await lambdaClient.send(invokeCommand);

    if (lambdaResponse.StatusCode !== 202) {
      throw new Error(`Lambda invocation failed with status ${lambdaResponse.StatusCode}`);
    }

    console.log(`[Upload] Lambda invoked successfully for recording: ${recording_id}`);

    // 6. Update status to processing
    await supabase
      .from('recordings')
      .update({
        s3_upload_status: 'processing',
        s3_upload_started_at: new Date().toISOString(),
      })
      .eq('id', recording_id);

    return new Response(
      JSON.stringify({
        success: true,
        recording_id,
        message: 'Lambda compression pipeline started',
        status: 'processing',
      }),
      {
        status: 202,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  } catch (error) {
    console.error('[Upload] Error:', error);

    // Try to update recording status to failed with retry tracking
    try {
      const body = await req.clone().json();
      const recording_id = body?.recording_id;
      if (recording_id) {
        const supabase = createClient(
          Deno.env.get('SUPABASE_URL') ?? '',
          Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
        );

        // Get current retry count
        const { data: recording } = await supabase
          .from('recordings')
          .select('s3_upload_retry_count')
          .eq('id', recording_id)
          .single();

        const retryCount = (recording?.s3_upload_retry_count || 0) + 1;

        await supabase
          .from('recordings')
          .update({
            s3_upload_status: 'failed',
            s3_upload_error_message: error.message,
            s3_upload_retry_count: retryCount,
            s3_upload_last_retry_at: new Date().toISOString(),
          })
          .eq('id', recording_id);

        console.log(`[Upload] Marked as failed, retry count: ${retryCount}`);
      }
    } catch (updateError) {
      console.error('[Upload] Failed to update recording status:', updateError);
    }

    return new Response(
      JSON.stringify({
        error: error.message,
        details: error.stack,
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});
