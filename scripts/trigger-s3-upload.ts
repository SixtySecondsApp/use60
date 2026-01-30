#!/usr/bin/env tsx

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || '';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const RECORDING_ID = '17d7ed3d-24c1-4e80-a3ee-bddb409e40a4';

async function triggerUpload() {
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  console.log('🚀 Manually triggering S3 upload');
  console.log('Recording ID:', RECORDING_ID);
  console.log();

  const { data, error } = await supabase.functions.invoke('upload-recording-to-s3', {
    body: { recording_id: RECORDING_ID },
  });

  if (error) {
    console.log('❌ Error:', error.message);
    console.log('Details:', JSON.stringify(error, null, 2));
  } else {
    console.log('✅ Success:', JSON.stringify(data, null, 2));
  }
}

triggerUpload().catch(console.error);
