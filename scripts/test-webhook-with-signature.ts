import * as dotenv from 'dotenv';
import { createHmac } from 'crypto';

dotenv.config();

const supabaseUrl = process.env.VITE_SUPABASE_URL!;
const webhookSecret = process.env.MEETINGBAAS_WEBHOOK_SECRET!;

function generateSvixSignature(secret: string, timestamp: string, payload: string): string {
  // SVIX signature format: timestamp.payload
  const signedContent = `${timestamp}.${payload}`;

  // Remove 'whsec_' prefix from secret if present
  const cleanSecret = secret.startsWith('whsec_') ? secret.substring(6) : secret;

  // Create HMAC-SHA256 signature
  const hmac = createHmac('sha256', Buffer.from(cleanSecret, 'base64'));
  hmac.update(signedContent);
  const signature = hmac.digest('base64');

  // SVIX uses v1= prefix
  return `v1,${signature}`;
}

async function testWebhookWithSignature() {
  console.log('🧪 Testing MeetingBaas Webhook with Proper Signature\n');
  console.log('═'.repeat(70));

  const testPayload = {
    id: 'evt_test_' + Date.now(),
    type: 'bot.joining',
    bot_id: '208d1d5c-32eb-4f8f-b2df-5a99a39890c5',
    meeting_url: 'https://meet.google.com/qzp-wdmm-zwm',
    timestamp: new Date().toISOString(),
  };

  const webhookUrl = `${supabaseUrl}/functions/v1/meetingbaas-webhook`;
  const rawBody = JSON.stringify(testPayload);
  const timestamp = Math.floor(Date.now() / 1000).toString();

  console.log('\n📝 Test Payload:');
  console.log(JSON.stringify(testPayload, null, 2));
  console.log('\n🔐 Webhook Secret:', webhookSecret.substring(0, 15) + '...');
  console.log('⏰ Timestamp:', timestamp);

  // Generate SVIX signature
  const signature = generateSvixSignature(webhookSecret, timestamp, rawBody);
  console.log('✍️  Signature:', signature.substring(0, 30) + '...');

  console.log('\n🚀 Sending webhook request...\n');

  try {
    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'svix-id': testPayload.id,
        'svix-timestamp': timestamp,
        'svix-signature': signature,
      },
      body: rawBody,
    });

    const responseText = await response.text();

    console.log('📊 Response:');
    console.log(`   Status: ${response.status} ${response.statusText}`);
    console.log(`   Body: ${responseText}`);

    if (response.ok) {
      console.log('\n✅ SUCCESS! Webhook processed correctly');
      console.log('\n📋 Next: Check the recordings table to see if status updated');
    } else {
      console.log('\n❌ FAILED with status', response.status);

      try {
        const errorData = JSON.parse(responseText);
        console.log('\n📝 Error Details:');
        console.log(JSON.stringify(errorData, null, 2));
      } catch {
        console.log('\n📝 Raw Error:', responseText);
      }
    }

  } catch (error) {
    console.error('\n❌ Request Failed:', error);
    if (error instanceof Error) {
      console.error('Error:', error.message);
    }
  }

  console.log('\n' + '═'.repeat(70));
}

testWebhookWithSignature();
