#!/usr/bin/env tsx

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || '';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const RECORDING_ID = '17d7ed3d-24c1-4e80-a3ee-bddb409e40a4';

async function debugJoin() {
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  console.log('🔍 Debugging bot_deployments join');
  console.log('═'.repeat(60));
  console.log();

  // Try the exact query from the function
  const { data, error } = await supabase
    .from('recordings')
    .select(
      `
      id,
      org_id,
      user_id,
      bot_id,
      s3_upload_status,
      bot_deployments (
        video_url,
        audio_url,
        created_at
      )
    `
    )
    .eq('id', RECORDING_ID)
    .single();

  console.log('Data:', JSON.stringify(data, null, 2));
  console.log();
  console.log('Error:', error);
  console.log();

  if (data) {
    console.log('Type of bot_deployments:', typeof data.bot_deployments);
    console.log('Is array?', Array.isArray(data.bot_deployments));
    console.log('Has video_url?', data.bot_deployments?.video_url !== undefined);
  }
}

debugJoin().catch(console.error);
