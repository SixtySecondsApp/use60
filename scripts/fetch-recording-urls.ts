#!/usr/bin/env tsx

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || '';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const MEETINGBAAS_API_KEY = process.env.MEETINGBAAS_API_KEY || '';
const BOT_ID = '23a2bde4-15a0-4035-ae70-5a891b2d4b12'; // Dev standup (quick) bot

async function fetchRecordingUrls() {
  if (!MEETINGBAAS_API_KEY) {
    console.error('MEETINGBAAS_API_KEY not set');
    return;
  }

  console.log('🔍 Fetching recording from MeetingBaaS API');
  console.log('═'.repeat(60));
  console.log('Bot ID:', BOT_ID);
  console.log();

  // Call MeetingBaaS API to get recording
  const response = await fetch(`https://api.meetingbaas.com/v2/bots/${BOT_ID}/recording`, {
    method: 'GET',
    headers: {
      'x-meeting-baas-api-key': MEETINGBAAS_API_KEY,
      'Content-Type': 'application/json',
    },
  });

  const data = await response.json();
  console.log('Response status:', response.status, response.statusText);
  console.log('Response:', JSON.stringify(data, null, 2));

  if (!response.ok) {
    console.error('❌ API error');
    return;
  }

  // Extract URLs
  const recordingData = data.data || data;
  const videoUrl = recordingData.video || recordingData.video_url;
  const audioUrl = recordingData.audio || recordingData.audio_url;

  if (videoUrl) {
    console.log();
    console.log('✅ URLs found! Updating database...');

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Update bot_deployments with URLs
    const { error } = await supabase
      .from('bot_deployments')
      .update({
        video_url: videoUrl,
        audio_url: audioUrl || null,
        updated_at: new Date().toISOString(),
      })
      .eq('bot_id', BOT_ID);

    if (error) {
      console.error('❌ Database update failed:', error);
    } else {
      console.log('✅ Database updated successfully');
      console.log('   Video URL:', videoUrl.substring(0, 80) + '...');
      console.log('   Audio URL:', audioUrl ? audioUrl.substring(0, 80) + '...' : 'N/A');
    }
  } else {
    console.log('❌ No video URL in response');
  }
}

fetchRecordingUrls().catch(console.error);
