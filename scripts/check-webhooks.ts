import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

// Load environment variables
dotenv.config();

const supabaseUrl = process.env.VITE_SUPABASE_URL!;
const supabaseKey = process.env.VITE_SUPABASE_SERVICE_ROLE_KEY!;

const supabase = createClient(supabaseUrl, supabaseKey);

async function checkWebhooks() {
  const botIds = [
    '208d1d5c-32eb-4f8f-b2df-5a99a39890c5',
    'b61a33b2-2416-4efc-a055-4663e34c6e1c'
  ];

  console.log('🔍 Checking webhook events for bot IDs...\n');

  for (const botId of botIds) {
    console.log(`Bot ID: ${botId}`);

    const { data, error } = await supabase
      .from('webhook_events')
      .select('*')
      .eq('source', 'meetingbaas')
      .contains('payload', { bot_id: botId })
      .order('created_at', { ascending: false });

    if (error) {
      console.error(`Error fetching webhooks for ${botId}:`, error);
      continue;
    }

    if (!data || data.length === 0) {
      console.log('   ❌ No webhooks received for this bot\n');
      continue;
    }

    console.log(`   ✅ Found ${data.length} webhook event(s):\n`);
    data.forEach((event, idx) => {
      console.log(`   ${idx + 1}. Event Type: ${event.event_type}`);
      console.log(`      Status: ${event.status}`);
      console.log(`      Created: ${new Date(event.created_at).toLocaleString()}`);
      if (event.processed_at) {
        console.log(`      Processed: ${new Date(event.processed_at).toLocaleString()}`);
      }
      if (event.error_message) {
        console.log(`      Error: ${event.error_message}`);
      }
      console.log('');
    });
  }
}

checkWebhooks();
