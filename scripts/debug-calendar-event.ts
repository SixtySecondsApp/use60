#!/usr/bin/env tsx

/**
 * Debug calendar event and auto-join scheduling
 *
 * Event ID: 8883f296-57d6-4869-a2e7-4c9ccc6aea2f
 * Meeting: Test meeting at 10:00 on 2026-01-27
 */

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || '';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

const EVENT_ID = '8883f296-57d6-4869-a2e7-4c9ccc6aea2f';
const BOT_ID = '6da9efca-701b-4826-94a9-ef3f1e3e67d9';

async function debugCalendarEvent() {
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  console.log('🔍 Investigating calendar event and auto-join scheduling...\n');

  // Step 1: Check if calendar event exists
  console.log('📅 Step 1: Calendar Event Details');
  const { data: calendarEvent, error: eventError } = await supabase
    .from('calendar_events')
    .select('*')
    .eq('id', EVENT_ID)
    .maybeSingle();

  if (eventError) {
    console.error('❌ Error fetching calendar event:', eventError);
  } else if (calendarEvent) {
    console.log('Event ID:', calendarEvent.id);
    console.log('Summary:', calendarEvent.summary);
    console.log('Start Time:', calendarEvent.start_time);
    console.log('Meeting URL:', calendarEvent.meeting_url);
    console.log('Meeting Platform:', calendarEvent.meeting_platform);
    console.log('Auto Join Enabled:', calendarEvent.auto_join_enabled);
    console.log('Attendees Count:', calendarEvent.attendees_count);
    console.log('Created At:', calendarEvent.created_at);
    console.log();
  } else {
    console.log('⚠️  Calendar event not found in database!');
    console.log('This suggests the calendar sync webhook was received but not processed.');
    console.log();
  }

  // Step 2: Check for any bot deployments linked to this event
  console.log('🤖 Step 2: Bot Deployments for This Event');
  const { data: deployments, error: deploymentsError } = await supabase
    .from('bot_deployments')
    .select('*')
    .eq('calendar_event_id', EVENT_ID);

  if (deploymentsError) {
    console.error('❌ Error fetching deployments:', deploymentsError);
  } else if (deployments && deployments.length > 0) {
    console.log(`Found ${deployments.length} deployment(s):`);
    deployments.forEach((d, i) => {
      console.log(`\nDeployment ${i + 1}:`);
      console.log('  Bot ID:', d.bot_id);
      console.log('  Status:', d.status);
      console.log('  Scheduled Join:', d.scheduled_join_time);
      console.log('  Created:', d.created_at);
    });
    console.log();
  } else {
    console.log('⚠️  No deployments found for this calendar event');
    console.log('This is the problem! The auto-join-scheduler didn\'t create a deployment.');
    console.log();
  }

  // Step 3: Check the orphaned bot deployment
  console.log('🔬 Step 3: The Orphaned Bot Deployment');
  const { data: orphanedBot, error: botError } = await supabase
    .from('bot_deployments')
    .select('*')
    .eq('bot_id', BOT_ID)
    .single();

  if (botError) {
    console.error('❌ Error fetching bot:', botError);
  } else {
    console.log('Bot ID:', orphanedBot.bot_id);
    console.log('Status:', orphanedBot.status);
    console.log('Calendar Event ID:', orphanedBot.calendar_event_id || '❌ MISSING!');
    console.log('Meeting URL:', orphanedBot.meeting_url);
    console.log('Scheduled Join:', orphanedBot.scheduled_join_time);
    console.log('Created:', orphanedBot.created_at);
    console.log();
  }

  // Step 4: Analysis
  console.log('🔬 Step 4: Root Cause Analysis');
  console.log('─'.repeat(60));

  if (!calendarEvent) {
    console.log('\n❌ ISSUE #1: Calendar Event Not in Database');
    console.log('The calendar.event_created webhook was received but the event');
    console.log('was not saved to the calendar_events table.');
    console.log();
    console.log('Possible causes:');
    console.log('  1. Calendar sync webhook handler error');
    console.log('  2. Database insert failure');
    console.log('  3. RLS policy blocking insert');
    console.log();
  } else if (!calendarEvent.auto_join_enabled) {
    console.log('\n⚠️  ISSUE #2: Auto-Join Not Enabled');
    console.log('The calendar event exists but auto_join_enabled is false.');
    console.log('The auto-join-scheduler will skip events without this flag.');
    console.log();
    console.log('How to enable:');
    console.log('  1. Go to Calendar page in use60');
    console.log('  2. Find this meeting');
    console.log('  3. Click "Enable Auto-Join"');
    console.log();
  }

  if (orphanedBot && !orphanedBot.calendar_event_id) {
    console.log('❌ ISSUE #3: Bot Deployed Without Calendar Event Link');
    console.log('A bot was deployed but not linked to the calendar event.');
    console.log();
    console.log('This happens when:');
    console.log('  1. Bot deployed manually without calendar_event_id parameter');
    console.log('  2. Bot deployed before calendar event was synced');
    console.log('  3. Deploy function called directly instead of via auto-join-scheduler');
    console.log();
    console.log('Without the calendar_event_id link, the bot had no meeting_url to join!');
    console.log();
  }

  console.log('✅ Investigation Complete');
}

debugCalendarEvent().catch(console.error);
