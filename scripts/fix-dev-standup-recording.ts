#!/usr/bin/env tsx

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || '';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

const BOT_ID = '23a2bde4-15a0-4035-ae70-5a891b2d4b12';
const VIDEO_URL = 'https://meeting-baas-v2-artifacts.s3.fr-par.scw.cloud/23a2bde4-15a0-4035-ae70-5a891b2d4b12/output.mp4?X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Content-Sha256=UNSIGNED-PAYLOAD&X-Amz-Credential=SCW1ZM6P0A83KVXXS1BE%2F20260127%2Ffr-par%2Fs3%2Faws4_request&X-Amz-Date=20260127T114234Z&X-Amz-Expires=14400&X-Amz-Signature=04b8c1e088ff5a535bc2fa4a67a4514457714236dc18809ef5884b8775fc2214&X-Amz-SignedHeaders=host&x-amz-checksum-mode=ENABLED&x-id=GetObject';
const AUDIO_URL = 'https://meeting-baas-v2-artifacts.s3.fr-par.scw.cloud/23a2bde4-15a0-4035-ae70-5a891b2d4b12/output.flac?X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Content-Sha256=UNSIGNED-PAYLOAD&X-Amz-Credential=SCW1ZM6P0A83KVXXS1BE%2F20260127%2Ffr-par%2Fs3%2Faws4_request&X-Amz-Date=20260127T114234Z&X-Amz-Expires=14400&X-Amz-Signature=3c3d68d0e9ec19380263f9ede2a6d6eb9c83c6bef8699ddd2aa9be7ce1a90d8d&X-Amz-SignedHeaders=host&x-amz-checksum-mode=ENABLED&x-id=GetObject';

async function fix() {
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  console.log('🔧 Fixing Dev Standup Recording');
  console.log('═'.repeat(60));
  console.log();

  // Step 1: Update bot_deployments with URLs
  console.log('Step 1: Updating bot_deployments with URLs...');
  const { error: updateError } = await supabase
    .from('bot_deployments')
    .update({
      video_url: VIDEO_URL,
      audio_url: AUDIO_URL,
      updated_at: new Date().toISOString(),
    })
    .eq('bot_id', BOT_ID);

  if (updateError) {
    console.error('❌ Failed to update bot_deployments:', updateError);
    return;
  }
  console.log('✅ bot_deployments updated');

  // Step 2: Reset s3_upload_status to pending (in case it was in failed state)
  console.log('Step 2: Resetting recording s3_upload_status...');
  const { data: recording, error: findError } = await supabase
    .from('recordings')
    .select('id')
    .eq('bot_id', BOT_ID)
    .single();

  if (findError || !recording) {
    console.error('❌ Failed to find recording:', findError);
    return;
  }

  const { error: resetError } = await supabase
    .from('recordings')
    .update({
      s3_upload_status: 'pending',
      s3_upload_error_message: null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', recording.id);

  if (resetError) {
    console.error('❌ Failed to reset recording:', resetError);
    return;
  }
  console.log('✅ Recording status reset to pending');
  console.log('   Recording ID:', recording.id);

  // Step 3: Trigger S3 upload
  console.log();
  console.log('Step 3: Triggering S3 upload...');

  const response = await fetch(`${SUPABASE_URL}/functions/v1/upload-recording-to-s3`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ recording_id: recording.id }),
  });

  const result = await response.json();
  console.log('Response:', response.status, response.statusText);
  console.log(JSON.stringify(result, null, 2));

  if (response.ok) {
    console.log();
    console.log('✅ S3 upload triggered successfully!');
  } else {
    console.log();
    console.log('❌ S3 upload failed');
  }
}

fix().catch(console.error);
