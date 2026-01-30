#!/usr/bin/env tsx

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || '';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const RECORDING_ID = 'c4d8ec78-83b1-4f1f-a4f3-5c1fdf6fa2b5';

async function monitor() {
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  console.log('🔍 Monitoring Recording:', RECORDING_ID.substring(0, 8), '...');
  console.log('═'.repeat(60));
  console.log();

  for (let i = 0; i < 12; i++) {  // Monitor for 2 minutes (12 x 10 seconds)
    const { data, error } = await supabase
      .from('recordings')
      .select(`
        id,
        status,
        s3_upload_status,
        s3_upload_error_message,
        bot_deployments (
          status,
          video_url,
          audio_url,
          leave_time
        )
      `)
      .eq('id', RECORDING_ID)
      .single();

    if (error) {
      console.error('Error:', error);
      return;
    }

    const deployment = Array.isArray(data.bot_deployments)
      ? data.bot_deployments[0]
      : data.bot_deployments;

    const timestamp = new Date().toLocaleTimeString();
    console.log(`[${timestamp}] Bot: ${deployment?.status || 'unknown'} | ` +
                `URLs: ${deployment?.video_url ? '✅' : '❌'} | ` +
                `S3: ${data.s3_upload_status || 'pending'}`);

    // Check if we have URLs
    if (deployment?.video_url) {
      console.log();
      console.log('✅ Webhook received! URLs are now available.');
      console.log('   Bot Status:', deployment.status);
      console.log('   Leave Time:', deployment.leave_time);
      console.log('   Video URL:', deployment.video_url.substring(0, 80) + '...');
      console.log('   Audio URL:', deployment.audio_url?.substring(0, 80) + '...');
      console.log();
      console.log('⏳ Waiting for S3 upload cron (runs every 5 min)...');
      break;
    }

    // Wait 10 seconds
    if (i < 11) {
      await new Promise(resolve => setTimeout(resolve, 10000));
    }
  }
}

monitor().catch(console.error);
