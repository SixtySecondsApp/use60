#!/usr/bin/env -S deno run --allow-net --allow-env --allow-read

import { createClient } from 'npm:@supabase/supabase-js@2';

// Load environment
const envFile = await Deno.readTextFile('.env.staging');
const env = Object.fromEntries(
  envFile.split('\n')
    .filter(line => line && !line.startsWith('#') && line.includes('='))
    .map(line => {
      const [key, ...valueParts] = line.split('=');
      return [key, valueParts.join('=')];
    })
);

const supabaseUrl = env.SUPABASE_URL;
const supabaseKey = env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);

console.log('🔧 Applying transcribing status migration...\n');

// Drop existing constraint
console.log('1. Dropping old constraint...');
const { error: dropError } = await supabase.rpc('exec_sql', {
  query: `ALTER TABLE recordings DROP CONSTRAINT IF EXISTS recordings_status_check`
});

if (dropError) {
  console.error('❌ Error dropping constraint:', dropError);
  Deno.exit(1);
}
console.log('✅ Old constraint dropped\n');

// Add new constraint with 'transcribing'
console.log('2. Adding new constraint with "transcribing" status...');
const { error: addError } = await supabase.rpc('exec_sql', {
  query: `ALTER TABLE recordings
ADD CONSTRAINT recordings_status_check
CHECK (status = ANY (ARRAY['pending', 'bot_joining', 'recording', 'processing', 'transcribing', 'ready', 'failed']))`
});

if (addError) {
  console.error('❌ Error adding constraint:', addError);
  Deno.exit(1);
}
console.log('✅ New constraint added\n');

console.log('✨ Migration complete!');
console.log('\nRecording statuses now allowed:');
console.log('  - pending');
console.log('  - bot_joining');
console.log('  - recording');
console.log('  - processing');
console.log('  - transcribing ← NEW');
console.log('  - ready');
console.log('  - failed');
