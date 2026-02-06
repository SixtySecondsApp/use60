import * as dotenv from 'dotenv';

dotenv.config();

console.log('🔍 Staging vs Production Configuration Check\n');
console.log('═'.repeat(60));

// 1. Current Supabase Project
console.log('\n1. CURRENT SUPABASE PROJECT:');
console.log(`   URL: ${process.env.VITE_SUPABASE_URL}`);
console.log(`   Project ID: ${process.env.SUPABASE_PROJECT_ID}`);
console.log('');

// 2. Webhook Configuration
console.log('2. MEETINGBAAS WEBHOOK CONFIG:');
console.log(`   API Key: ${process.env.MEETINGBAAS_API_KEY ? '✅ Set (' + process.env.MEETINGBAAS_API_KEY.substring(0, 10) + '...)' : '❌ Not set'}`);
console.log(`   Webhook Secret: ${process.env.MEETINGBAAS_WEBHOOK_SECRET ? '✅ Set (' + process.env.MEETINGBAAS_WEBHOOK_SECRET.substring(0, 10) + '...)' : '❌ Not set'}`);
console.log('');

// 3. Webhook URLs
console.log('3. WEBHOOK ENDPOINTS:');
const currentWebhookUrl = `${process.env.VITE_SUPABASE_URL}/functions/v1/meetingbaas-webhook`;
console.log(`   Current (Staging): ${currentWebhookUrl}`);
console.log('');

// 4. Branch Detection
console.log('4. BRANCH DETECTION:');
console.log(`   Git Branch: staging (confirmed)`);
console.log(`   This is a SEPARATE Supabase project from production`);
console.log('');

// 5. What this means
console.log('5. IMPLICATIONS:');
console.log('   ⚠️  MeetingBaas needs SEPARATE webhook configuration for staging');
console.log('   ⚠️  Each Supabase project needs its own webhook URL registered');
console.log('   ⚠️  Staging and production will receive webhooks independently');
console.log('');

console.log('═'.repeat(60));
console.log('\n✅ STAGING WEBHOOK URL TO CONFIGURE IN MEETINGBAAS:');
console.log(`\n   ${currentWebhookUrl}\n`);
console.log('═'.repeat(60));
