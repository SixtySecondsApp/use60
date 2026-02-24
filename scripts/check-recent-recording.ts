import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

// Load environment variables
dotenv.config();

const supabaseUrl = process.env.VITE_SUPABASE_URL!;
const supabaseKey = process.env.VITE_SUPABASE_SERVICE_ROLE_KEY!; // Use service role to bypass RLS

const supabase = createClient(supabaseUrl, supabaseKey);

async function checkRecentRecording() {
  // Get MeetingBaas recordings from the last 60 minutes
  const sixtyMinutesAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();

  const { data, error } = await supabase
    .from('recordings')
    .select('*')
    .gte('created_at', sixtyMinutesAgo)
    .order('created_at', { ascending: false })
    .limit(20);

  if (error) {
    console.error('Error fetching recordings:', error);
    return;
  }

  if (!data || data.length === 0) {
    console.log('❌ No MeetingBaas recordings found in the last 60 minutes');
    console.log('\nLet me check all recent recordings...\n');

    // Check last 10 recordings regardless of time
    const { data: allRecent, error: allError } = await supabase
      .from('recordings')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(10);

    if (allError) {
      console.error('Error:', allError);
      return;
    }

    if (allRecent && allRecent.length > 0) {
      console.log(`Found ${allRecent.length} recent MeetingBaas recordings:\n`);
      allRecent.forEach((rec, idx) => {
        console.log(`${idx + 1}. ${rec.meeting_title || 'Untitled Meeting'}`);
        console.log(`   ID: ${rec.id}`);
        console.log(`   Status: ${rec.status}`);
        console.log(`   Created: ${new Date(rec.created_at).toLocaleString()}`);
        console.log(`   Platform: ${rec.platform}`);
        console.log(`   Bot ID: ${rec.bot_id || 'N/A'}`);
        if (rec.meeting_start_time) {
          console.log(`   Meeting Start: ${new Date(rec.meeting_start_time).toLocaleString()}`);
        }
        console.log('');
      });
    } else {
      console.log('❌ No MeetingBaas recordings found in database');
    }
    return;
  }

  console.log(`✅ Found ${data.length} MeetingBaas recording(s) in the last 60 minutes:\n`);

  data.forEach((recording, idx) => {
    const createdMinutesAgo = Math.round((Date.now() - new Date(recording.created_at).getTime()) / 60000);

    console.log(`${idx + 1}. ${recording.meeting_title || 'Untitled Meeting'}`);
    console.log(`   ID: ${recording.id}`);
    console.log(`   Status: ${recording.status}`);
    console.log(`   Created: ${createdMinutesAgo} minute(s) ago`);
    console.log(`   Platform: ${recording.platform}`);
    console.log(`   Meeting URL: ${recording.meeting_url}`);
    console.log(`   Bot ID: ${recording.bot_id || 'N/A'}`);

    if (recording.meeting_start_time) {
      console.log(`   Meeting Start: ${new Date(recording.meeting_start_time).toLocaleString()}`);
    }
    if (recording.meeting_end_time) {
      console.log(`   Meeting End: ${new Date(recording.meeting_end_time).toLocaleString()}`);
    }

    // Status-specific messages
    if (recording.status === 'pending') {
      console.log(`   ⏳ Waiting to join meeting...`);
    } else if (recording.status === 'bot_joining') {
      console.log(`   🤖 Bot joining meeting...`);
    } else if (recording.status === 'recording') {
      console.log(`   🎙️ Currently recording!`);
    } else if (recording.status === 'processing') {
      console.log(`   🔄 Processing recording...`);
    } else if (recording.status === 'completed') {
      console.log(`   ✅ Fully processed!`);
      if (recording.transcript_text) {
        console.log(`   📝 Transcript available (${recording.transcript_text.length} chars)`);
      }
      if (recording.recording_s3_url) {
        console.log(`   🎥 Video URL available`);
      }
    } else if (recording.status === 'failed') {
      console.log(`   ❌ Recording failed: ${recording.error_message || 'Unknown error'}`);
    }

    if (recording.hitl_required) {
      console.log(`   🙋 HITL (Human-in-the-loop) action required`);
    }

    console.log('');
  });
}

checkRecentRecording();
