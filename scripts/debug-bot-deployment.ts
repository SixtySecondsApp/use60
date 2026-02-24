#!/usr/bin/env tsx

/**
 * Debug bot deployment failure for bot_id: 6da9efca-701b-4826-94a9-ef3f1e3e67d9
 *
 * This script investigates why the bot didn't join the meeting and what caused
 * the TIMEOUT_WAITING_TO_START error.
 */

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || '';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

const BOT_ID = '6da9efca-701b-4826-94a9-ef3f1e3e67d9';

async function debugBotDeployment() {
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  console.log('🔍 Investigating bot deployment failure...\n');
  console.log(`Bot ID: ${BOT_ID}\n`);

  // Step 1: Get bot deployment details
  console.log('📋 Step 1: Bot Deployment Details');
  const { data: deployment, error: deploymentError } = await supabase
    .from('bot_deployments')
    .select('*')
    .eq('bot_id', BOT_ID)
    .single();

  if (deploymentError) {
    console.error('❌ Error fetching deployment:', deploymentError);
    return;
  }

  console.log('Deployment Status:', deployment.status);
  console.log('Scheduled Join Time:', deployment.scheduled_join_time);
  console.log('Created At:', deployment.created_at);
  console.log('Error Code:', deployment.error_code);
  console.log('Error Message:', deployment.error_message);
  console.log('Calendar Event ID:', deployment.calendar_event_id);
  console.log();

  // Step 2: Get associated meeting
  console.log('📅 Step 2: Associated Meeting');
  const { data: meeting, error: meetingError } = await supabase
    .from('meetings')
    .select('*')
    .eq('bot_id', BOT_ID)
    .maybeSingle();

  if (meetingError) {
    console.error('❌ Error fetching meeting:', meetingError);
  } else if (meeting) {
    console.log('Meeting ID:', meeting.id);
    console.log('Title:', meeting.title);
    console.log('Meeting Start:', meeting.meeting_start);
    console.log('Source Type:', meeting.source_type);
    console.log('Status:', meeting.status);
    console.log();
  } else {
    console.log('⚠️  No meeting record found for this bot');
    console.log();
  }

  // Step 3: Get calendar event
  if (deployment.calendar_event_id) {
    console.log('📆 Step 3: Calendar Event Details');
    const { data: calendarEvent, error: eventError } = await supabase
      .from('calendar_events')
      .select('*')
      .eq('id', deployment.calendar_event_id)
      .single();

    if (eventError) {
      console.error('❌ Error fetching calendar event:', eventError);
    } else {
      console.log('Event ID:', calendarEvent.id);
      console.log('Summary:', calendarEvent.summary);
      console.log('Start Time:', calendarEvent.start_time);
      console.log('Auto Join Enabled:', calendarEvent.auto_join_enabled);
      console.log('Meeting URL:', calendarEvent.meeting_url);
      console.log('Attendees Count:', calendarEvent.attendees_count);
      console.log();
    }
  } else {
    console.log('⚠️  No calendar event associated with deployment');
    console.log();
  }

  // Step 4: Get recording details
  console.log('🎥 Step 4: Recording Details');
  const { data: recording, error: recordingError } = await supabase
    .from('recordings')
    .select('*')
    .eq('bot_id', BOT_ID)
    .maybeSingle();

  if (recordingError) {
    console.error('❌ Error fetching recording:', recordingError);
  } else if (recording) {
    console.log('Recording ID:', recording.id);
    console.log('Status:', recording.status);
    console.log('Recording URL:', recording.recording_url || 'None');
    console.log('Transcript URL:', recording.transcript_url || 'None');
    console.log('S3 Upload Status:', recording.s3_upload_status || 'N/A');
    console.log();
  } else {
    console.log('⚠️  No recording record found for this bot');
    console.log();
  }

  // Step 5: Analysis and recommendations
  console.log('🔬 Step 5: Analysis');
  console.log('─'.repeat(60));

  if (deployment.error_code === 'TIMEOUT_WAITING_TO_START') {
    console.log('\n📊 Error Analysis: TIMEOUT_WAITING_TO_START');
    console.log('This error means the bot successfully joined the meeting platform');
    console.log('but could not start the recording within the timeout period.');
    console.log();
    console.log('Common Causes:');
    console.log('  1. Meeting ended before bot could start recording');
    console.log('  2. Bot was stuck in waiting room');
    console.log('  3. Permission issues on the meeting platform');
    console.log('  4. Meeting hadn\'t actually started yet');
    console.log('  5. Network connectivity issues');
    console.log();
  }

  // Check timing
  if (deployment.scheduled_join_time && deployment.calendar_event_id) {
    const { data: event } = await supabase
      .from('calendar_events')
      .select('start_time')
      .eq('id', deployment.calendar_event_id)
      .single();

    if (event) {
      const scheduledTime = new Date(deployment.scheduled_join_time);
      const eventStartTime = new Date(event.start_time);
      const minutesBefore = (eventStartTime.getTime() - scheduledTime.getTime()) / 1000 / 60;

      console.log('⏰ Timing Analysis:');
      console.log(`  Event Start: ${eventStartTime.toISOString()}`);
      console.log(`  Scheduled Join: ${scheduledTime.toISOString()}`);
      console.log(`  Bot scheduled to join: ${minutesBefore.toFixed(1)} minutes before meeting`);
      console.log();

      if (minutesBefore < 2) {
        console.log('⚠️  WARNING: Bot scheduled less than 2 minutes before meeting!');
        console.log('   Recommendation: Increase lead time for bot deployment');
        console.log();
      }
    }
  }

  console.log('✅ Investigation Complete');
}

debugBotDeployment().catch(console.error);
