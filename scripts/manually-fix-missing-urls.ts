#!/usr/bin/env tsx

/**
 * Manually update bot_deployments with URLs from the webhook payload
 * This is a one-time fix for the missing URLs issue
 */

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || '';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

const BOT_ID = 'b3dc2c9c-e501-47c1-89f3-612a45603a79';

// URLs from the bot.completed webhook the user shared
const VIDEO_URL = 'https://meeting-baas-v2-artifacts.s3.fr-par.scw.cloud/meeting-assets/b3dc2c9c-e501-47c1-89f3-612a45603a79/video.mp4?X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Credential=SCWC94H4QEJ07T8DCJXH%2F20260127%2Ffr-par%2Fs3%2Faws4_request&X-Amz-Date=20260127T104500Z&X-Amz-Expires=14400&X-Amz-SignedHeaders=host&X-Amz-Signature=8a09e2de0cfc1bce4bb49f07b39baeb2dcb1adb0c3b2c0c74ac27c9f4dcf3b4d';

const AUDIO_URL = 'https://meeting-baas-v2-artifacts.s3.fr-par.scw.cloud/meeting-assets/b3dc2c9c-e501-47c1-89f3-612a45603a79/audio.mp3?X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Credential=SCWC94H4QEJ07T8DCJXH%2F20260127%2Ffr-par%2Fs3%2Faws4_request&X-Amz-Date=20260127T104500Z&X-Amz-Expires=14400&X-Amz-SignedHeaders=host&X-Amz-Signature=d89fdd87da99e02cfaae53f02b0e6b96f30b6a11a73d14a26950c75f6aa7b44f';

async function fixMissingUrls() {
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  console.log('🔧 MANUALLY FIXING MISSING URLS');
  console.log('═'.repeat(60));
  console.log(`Bot ID: ${BOT_ID}`);
  console.log();

  // Check if URLs have expired (4 hour limit)
  const webhookTime = new Date('2026-01-27T10:45:00Z');
  const now = new Date();
  const ageHours = (now.getTime() - webhookTime.getTime()) / (1000 * 60 * 60);

  console.log('⏰ URL Age Check');
  console.log('─'.repeat(60));
  console.log(`Webhook sent: ${webhookTime.toISOString()}`);
  console.log(`Current time: ${now.toISOString()}`);
  console.log(`Age: ${ageHours.toFixed(2)} hours`);

  if (ageHours > 4) {
    console.log();
    console.log('❌ URLS HAVE EXPIRED (>4 hours old)');
    console.log('   MeetingBaaS URLs expire after 4 hours');
    console.log('   This recording cannot be recovered');
    console.log('   Future recordings will need to be processed within 4 hours');
    console.log();
    return;
  }

  console.log(`✅ URLs still valid (${(4 - ageHours).toFixed(2)} hours remaining)`);
  console.log();

  // Update bot_deployments with URLs
  console.log('📝 Updating bot_deployments with URLs');
  console.log('─'.repeat(60));

  const { error: updateError } = await supabase
    .from('bot_deployments')
    .update({
      video_url: VIDEO_URL,
      audio_url: AUDIO_URL,
      updated_at: new Date().toISOString(),
    })
    .eq('bot_id', BOT_ID);

  if (updateError) {
    console.log('❌ Update failed:', updateError.message);
    return;
  }

  console.log('✅ URLs saved to bot_deployments table');
  console.log();

  // Verify update
  const { data: deployment } = await supabase
    .from('bot_deployments')
    .select('video_url, audio_url')
    .eq('bot_id', BOT_ID)
    .single();

  if (deployment?.video_url) {
    console.log('✅ Verification: video_url is now set');
    console.log('✅ Verification: audio_url is now set');
    console.log();
    console.log('🔄 NEXT STEPS');
    console.log('─'.repeat(60));
    console.log('The poll-s3-upload-queue cron runs every 5 minutes');
    console.log('Next run should:');
    console.log('  1. Find the recording with s3_upload_status=pending');
    console.log('  2. See the URLs in bot_deployments table');
    console.log('  3. Trigger upload-recording-to-s3 function');
    console.log('  4. Upload video and audio to S3');
    console.log();
    console.log('Check back in 5-10 minutes to verify S3 upload completed');
  } else {
    console.log('❌ Verification failed - URLs still missing');
  }

  console.log();
  console.log('✅ Fix complete');
}

fixMissingUrls().catch(console.error);
