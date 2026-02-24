import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

dotenv.config();

const supabaseUrl = process.env.VITE_SUPABASE_URL!;
const supabaseKey = process.env.VITE_SUPABASE_SERVICE_ROLE_KEY!;

const supabase = createClient(supabaseUrl, supabaseKey);

async function checkWebhookConfig() {
  console.log('🔍 Checking MeetingBaas webhook configuration...\n');

  // 1. Check environment variables
  console.log('1. Environment Variables:');
  console.log(`   MEETINGBAAS_API_KEY: ${process.env.MEETINGBAAS_API_KEY ? '✅ Set' : '❌ Not set'}`);
  console.log(`   MEETINGBAAS_WEBHOOK_SECRET: ${process.env.MEETINGBAAS_WEBHOOK_SECRET ? '✅ Set' : '❌ Not set'}`);
  console.log('');

  // 2. Check if ANY MeetingBaas webhooks have ever been received
  console.log('2. Recent MeetingBaas Webhooks (last 24 hours):');
  const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  const { data: recentWebhooks, error: webhookError } = await supabase
    .from('webhook_events')
    .select('event_type, status, created_at')
    .eq('source', 'meetingbaas')
    .gte('created_at', oneDayAgo)
    .order('created_at', { ascending: false })
    .limit(10);

  if (webhookError) {
    console.error('   Error:', webhookError);
  } else if (!recentWebhooks || recentWebhooks.length === 0) {
    console.log('   ❌ No MeetingBaas webhooks received in the last 24 hours');
  } else {
    console.log(`   ✅ Found ${recentWebhooks.length} webhook(s):`);
    recentWebhooks.forEach((wh, idx) => {
      console.log(`      ${idx + 1}. ${wh.event_type} - ${wh.status} - ${new Date(wh.created_at).toLocaleString()}`);
    });
  }
  console.log('');

  // 3. Check expected webhook URL
  console.log('3. Expected Webhook URL:');
  const webhookUrl = `${supabaseUrl}/functions/v1/meetingbaas-webhook`;
  console.log(`   ${webhookUrl}`);
  console.log('');

  // 4. Check bot deployments table
  console.log('4. Bot Deployments Status:');
  const { data: deployments, error: deployError } = await supabase
    .from('bot_deployments')
    .select('id, bot_id, status, created_at, updated_at')
    .in('bot_id', [
      '208d1d5c-32eb-4f8f-b2df-5a99a39890c5',
      'b61a33b2-2416-4efc-a055-4663e34c6e1c'
    ])
    .order('created_at', { ascending: false });

  if (deployError) {
    console.error('   Error:', deployError);
  } else if (!deployments || deployments.length === 0) {
    console.log('   ❌ No bot deployment records found');
  } else {
    console.log(`   Found ${deployments.length} deployment(s):`);
    deployments.forEach((dep, idx) => {
      console.log(`   ${idx + 1}. Bot ID: ${dep.bot_id}`);
      console.log(`      Status: ${dep.status}`);
      console.log(`      Created: ${new Date(dep.created_at).toLocaleString()}`);
      console.log(`      Updated: ${new Date(dep.updated_at).toLocaleString()}`);
      console.log('');
    });
  }
}

checkWebhookConfig();
