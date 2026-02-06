#!/usr/bin/env tsx

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || '';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

const RECORDING_ID = 'c4d8ec78-83b1-4f1f-a4f3-5c1fdf6fa2b5';

async function reset() {
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  console.log('Resetting recording status to pending...');

  const { error } = await supabase
    .from('recordings')
    .update({
      s3_upload_status: 'pending',
      s3_upload_error_message: null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', RECORDING_ID);

  if (error) {
    console.error('❌ Error:', error);
  } else {
    console.log('✅ Reset to pending');
  }
}

reset().catch(console.error);
