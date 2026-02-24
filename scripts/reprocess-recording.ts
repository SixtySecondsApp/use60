/**
 * Manually reprocess a 60 Notetaker recording
 *
 * Usage:
 *   deno run --allow-net --allow-env scripts/reprocess-recording.ts <bot_id> [video_url] [audio_url]
 *
 * Examples:
 *   # Basic usage (will try to fetch from MeetingBaaS API)
 *   deno run --allow-net --allow-env scripts/reprocess-recording.ts 28609cd5-feee-4d32-ba27-bc1f21b0cae5
 *
 *   # With video URL (recommended if MeetingBaaS recording expired)
 *   deno run --allow-net --allow-env scripts/reprocess-recording.ts 28609cd5... "https://..."
 *
 *   # With both video and audio URLs
 *   deno run --allow-net --allow-env scripts/reprocess-recording.ts 28609cd5... "https://video.mp4" "https://audio.flac"
 */

const BOT_ID = Deno.args[0];
const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || 'https://caerqjzvuerejfrdtygb.supabase.co';
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

if (!BOT_ID) {
  console.error('❌ Usage: deno run --allow-net --allow-env scripts/reprocess-recording.ts <bot_id>');
  Deno.exit(1);
}

if (!SUPABASE_SERVICE_ROLE_KEY) {
  console.error('❌ SUPABASE_SERVICE_ROLE_KEY environment variable not set');
  console.error('   Set it in .env.staging and run: source .env.staging');
  Deno.exit(1);
}

console.log(`🔍 Looking up recording for bot_id: ${BOT_ID}...`);

// Step 1: Find the recording
const findRecordingResponse = await fetch(`${SUPABASE_URL}/rest/v1/bot_deployments?bot_id=eq.${BOT_ID}&select=recording_id`, {
  headers: {
    'apikey': SUPABASE_SERVICE_ROLE_KEY,
    'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
  },
});

if (!findRecordingResponse.ok) {
  console.error('❌ Failed to find bot deployment:', await findRecordingResponse.text());
  Deno.exit(1);
}

const deployments = await findRecordingResponse.json();

if (deployments.length === 0) {
  console.error('❌ No bot deployment found for bot_id:', BOT_ID);
  Deno.exit(1);
}

const recording_id = deployments[0].recording_id;

if (!recording_id) {
  console.error('❌ Bot deployment has no recording_id');
  Deno.exit(1);
}

console.log(`✅ Found recording: ${recording_id}`);

// Step 2: Check current recording status
const statusResponse = await fetch(`${SUPABASE_URL}/rest/v1/recordings?id=eq.${recording_id}&select=status,transcript_text,summary`, {
  headers: {
    'apikey': SUPABASE_SERVICE_ROLE_KEY,
    'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
  },
});

const recordings = await statusResponse.json();
const recording = recordings[0];

console.log('\n📊 Current Status:');
console.log(`   Status: ${recording.status}`);
console.log(`   Has transcript: ${recording.transcript_text ? 'Yes' : 'No'}`);
console.log(`   Has summary: ${recording.summary ? 'Yes' : 'No'}`);

// Step 3: Get video/audio URLs from command line args (optional)
const VIDEO_URL = Deno.args[1];
const AUDIO_URL = Deno.args[2];

console.log('\n🚀 Triggering process-recording...');
if (VIDEO_URL || AUDIO_URL) {
  console.log(`   Using provided URLs:`);
  if (VIDEO_URL) console.log(`   Video: ${VIDEO_URL.substring(0, 80)}...`);
  if (AUDIO_URL) console.log(`   Audio: ${AUDIO_URL.substring(0, 80)}...`);
}

const processResponse = await fetch(`${SUPABASE_URL}/functions/v1/process-recording`, {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    recording_id: recording_id,
    bot_id: BOT_ID,
    ...(VIDEO_URL && { video_url: VIDEO_URL }),
    ...(AUDIO_URL && { audio_url: AUDIO_URL }),
  }),
});

if (!processResponse.ok) {
  const errorText = await processResponse.text();
  console.error('❌ process-recording failed:', processResponse.status, errorText);
  Deno.exit(1);
}

const result = await processResponse.json();

if (result.success) {
  console.log('✅ Recording processed successfully!');
  console.log('\n📝 Next steps:');
  console.log('   1. Check the recording in the dashboard');
  console.log('   2. Verify transcript and summary were generated');
  console.log('   3. Check the meetings table for the synced record');
} else {
  console.error('❌ Processing failed:', result.error);
  Deno.exit(1);
}
