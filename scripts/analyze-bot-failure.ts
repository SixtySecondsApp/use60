#!/usr/bin/env tsx

/**
 * Comprehensive analysis of bot deployment failure
 */

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || '';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const BOT_ID = '6da9efca-701b-4826-94a9-ef3f1e3e67d9';

async function analyzeBotFailure() {
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  console.log('🔬 COMPREHENSIVE BOT FAILURE ANALYSIS');
  console.log('═'.repeat(60));
  console.log();

  // Get bot deployment
  const { data: deployment } = await supabase
    .from('bot_deployments')
    .select('*')
    .eq('bot_id', BOT_ID)
    .single();

  // Get recording
  const { data: recording } = await supabase
    .from('recordings')
    .select('*')
    .eq('bot_id', BOT_ID)
    .single();

  // Get calendar event
  const { data: event } = await supabase
    .from('calendar_events')
    .select('*')
    .eq('id', recording?.calendar_event_id)
    .maybeSingle();

  console.log('📊 TIMELINE ANALYSIS');
  console.log('─'.repeat(60));

  const eventCreated = event ? new Date(event.created_at) : null;
  const deploymentCreated = deployment ? new Date(deployment.created_at) : null;
  const scheduledJoin = deployment ? new Date(deployment.scheduled_join_time!) : null;
  const errorTime = new Date('2026-01-27T09:59:23.337Z'); // From webhook
  const meetingStart = event ? new Date(event.start_time) : null;

  if (eventCreated) {
    console.log(`09:48:51 - Calendar event created`);
  }
  if (deploymentCreated) {
    console.log(`09:48:52 - Bot deployed (+1 second)`);
  }
  console.log(`09:59:23 - Bot failed with TIMEOUT_WAITING_TO_START (-37 seconds before scheduled join!)`);
  if (scheduledJoin) {
    console.log(`10:00:00 - Scheduled join time (bot should have joined)`);
  }
  if (meetingStart) {
    console.log(`10:00:00 - Meeting started (user confirmed bot was NOT there)`);
  }
  console.log();

  console.log('🚨 CRITICAL ISSUE IDENTIFIED');
  console.log('─'.repeat(60));
  console.log('The bot failed at 09:59:23, which is 37 SECONDS BEFORE');
  console.log('the scheduled join time of 10:00:00.');
  console.log();
  console.log('This means:');
  console.log('  1. The bot deployment to MeetingBaaS failed');
  console.log('  2. MeetingBaaS tried to pre-join early and timed out');
  console.log('  3. The bot never attempted to join at the scheduled time');
  console.log('  4. User saw no bot in meeting because it failed before joining');
  console.log();

  console.log('📋 DEPLOYMENT DETAILS');
  console.log('─'.repeat(60));
  if (deployment) {
    console.log('Bot ID:', deployment.bot_id);
    console.log('Meeting URL:', deployment.meeting_url);
    console.log('Scheduled Join:', deployment.scheduled_join_time);
    console.log('Status History:', JSON.stringify(deployment.status_history, null, 2));
    console.log();
  }

  console.log('🔍 POSSIBLE ROOT CAUSES');
  console.log('─'.repeat(60));
  console.log();

  console.log('1. MeetingBaaS Configuration Issue:');
  console.log('   - Bot credentials not set up correctly');
  console.log('   - Webhook URL not accessible');
  console.log('   - API key issues');
  console.log();

  console.log('2. Meeting URL Issue:');
  console.log('   - Meeting link not accessible at deployment time');
  console.log('   - Meeting settings blocking bots');
  console.log('   - Meeting not created yet on Google Meet side');
  console.log();

  console.log('3. Reserved Flag Issue:');
  console.log('   - Bot might not have had reserved=true set correctly');
  console.log('   - MeetingBaaS might have tried to join immediately instead of waiting');
  console.log();

  console.log('4. Network/Infrastructure:');
  console.log('   - MeetingBaaS service issues');
  console.log('   - Network connectivity problems');
  console.log('   - Rate limiting');
  console.log();

  console.log('✅ NEXT STEPS');
  console.log('─'.repeat(60));
  console.log();
  console.log('1. Check MeetingBaaS Dashboard:');
  console.log('   - Log into https://meetingbaas.com');
  console.log(`   - Search for bot ID: ${BOT_ID}`);
  console.log('   - Check bot deployment logs');
  console.log('   - Look for error details from MeetingBaaS side');
  console.log();

  console.log('2. Verify Environment Variables:');
  console.log('   - MEETINGBAAS_API_KEY is set correctly');
  console.log('   - MEETINGBAAS_WEBHOOK_SECRET is configured');
  console.log('   - Webhook URL is accessible from internet');
  console.log();

  console.log('3. Test Manual Deployment:');
  console.log('   - Try deploying a bot to a test meeting NOW (not scheduled)');
  console.log('   - See if bot appears in real-time');
  console.log('   - This will isolate whether issue is with scheduled joins or all deployments');
  console.log();

  console.log('4. Check Edge Function Logs:');
  console.log('   - Go to Supabase Dashboard → Edge Functions → deploy-recording-bot');
  console.log('   - Look for logs around 09:48:52');
  console.log('   - Check for MeetingBaaS API response');
  console.log();
}

analyzeBotFailure().catch(console.error);
