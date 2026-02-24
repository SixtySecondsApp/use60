#!/usr/bin/env tsx

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || '';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const BOT_ID = 'b3dc2c9c-e501-47c1-89f3-612a45603a79';

async function inspect() {
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  // Get deployment
  const { data: deployment } = await supabase
    .from('bot_deployments')
    .select('*')
    .eq('bot_id', BOT_ID)
    .single();

  console.log('BOT DEPLOYMENT:');
  console.log(JSON.stringify(deployment, null, 2));
  console.log('\n');

  // Get recording
  if (deployment?.recording_id) {
    const { data: recording } = await supabase
      .from('recordings')
      .select('*')
      .eq('id', deployment.recording_id)
      .single();

    console.log('RECORDING:');
    console.log(JSON.stringify(recording, null, 2));
  }
}

inspect().catch(console.error);
