import * as dotenv from 'dotenv';

dotenv.config();

const supabaseUrl = process.env.VITE_SUPABASE_URL!;
const webhookSecret = process.env.MEETINGBAAS_WEBHOOK_SECRET!;

async function testWebhook() {
  console.log('🧪 Testing MeetingBaas Webhook Edge Function\n');
  console.log('═'.repeat(60));

  // Test 1: Test with bot.joining event
  console.log('\n✅ Test 1: Sending bot.joining webhook event...\n');

  const testPayload = {
    id: 'evt_test_' + Date.now(),
    type: 'bot.joining',
    bot_id: '208d1d5c-32eb-4f8f-b2df-5a99a39890c5', // Real bot ID from your system
    meeting_url: 'https://meet.google.com/qzp-wdmm-zwm',
    timestamp: new Date().toISOString(),
  };

  const webhookUrl = `${supabaseUrl}/functions/v1/meetingbaas-webhook`;

  try {
    // Create signature
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const rawBody = JSON.stringify(testPayload);

    // For testing, we'll send without signature first to see if endpoint is reachable
    console.log(`   Endpoint: ${webhookUrl}`);
    console.log(`   Payload:`, JSON.stringify(testPayload, null, 2));
    console.log('\n   Sending request...');

    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        // Note: Real MeetingBaas would include these headers:
        // 'X-MeetingBaaS-Signature': signature,
        // 'X-MeetingBaaS-Timestamp': timestamp,
      },
      body: rawBody,
    });

    console.log(`\n   Response Status: ${response.status} ${response.statusText}`);

    const responseText = await response.text();
    console.log(`   Response Body: ${responseText}`);

    if (response.ok) {
      console.log('\n   ✅ Edge function is reachable and responding!');
    } else {
      console.log('\n   ⚠️  Edge function returned error - check logs');
    }

  } catch (error) {
    console.error('\n   ❌ Error testing webhook:', error);
    if (error instanceof Error) {
      console.error(`   Error message: ${error.message}`);
    }
  }

  console.log('\n' + '═'.repeat(60));

  // Test 2: Check if endpoint exists
  console.log('\n✅ Test 2: Checking if edge function is deployed...\n');

  try {
    const response = await fetch(webhookUrl, {
      method: 'GET', // Try GET to see if endpoint exists
    });

    console.log(`   GET Status: ${response.status}`);

    if (response.status === 405) {
      console.log('   ✅ Endpoint exists (405 = Method Not Allowed for GET is expected)');
    } else if (response.status === 404) {
      console.log('   ❌ Endpoint not found - edge function may not be deployed');
    } else {
      console.log(`   📝 Unexpected status: ${response.status}`);
    }
  } catch (error) {
    console.error('   ❌ Error checking endpoint:', error);
  }

  console.log('\n' + '═'.repeat(60));
  console.log('\n📋 NEXT STEPS:\n');
  console.log('1. If endpoint is reachable, configure this URL in MeetingBaas dashboard');
  console.log('2. Add webhook secret: ' + webhookSecret.substring(0, 15) + '...');
  console.log('3. MeetingBaas will send real webhook events with proper signatures');
  console.log('4. Check webhook_events table for incoming events\n');
}

testWebhook();
