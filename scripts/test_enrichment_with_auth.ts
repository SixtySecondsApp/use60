/**
 * Test enrichment with proper user authentication
 */

import { createClient } from '@supabase/supabase-js';
import * as fs from 'fs';
import * as dotenv from 'dotenv';

// Load staging environment
const envContent = fs.readFileSync('.env.staging', 'utf8');
const env = dotenv.parse(envContent);

const TEST_ORG_ID = '1d1b4274-c9c4-4cb7-9efc-243c90c86f4c';
const TEST_DOMAIN = 'conturae.com';
const TEST_EMAIL = 'test@example.com';
const TEST_PASSWORD = 'test123456';

async function runTest() {
  console.log('🔐 Creating authenticated client...\n');

  // Create client with anon key first
  const supabaseAnon = createClient(
    env.VITE_SUPABASE_URL,
    env.VITE_SUPABASE_ANON_KEY
  );

  // Try to sign in with test user
  let { data: signInData, error: signInError } = await supabaseAnon.auth.signInWithPassword({
    email: TEST_EMAIL,
    password: TEST_PASSWORD,
  });

  if (signInError || !signInData.session) {
    console.log('⚠️ Test user doesn\'t exist, creating...');

    // Create test user
    const { data: signUpData, error: signUpError } = await supabaseAnon.auth.signUp({
      email: TEST_EMAIL,
      password: TEST_PASSWORD,
    });

    if (signUpError || !signUpData.session) {
      console.error('❌ Failed to create test user:', signUpError);
      process.exit(1);
    }

    signInData = signUpData;
  }

  console.log('✅ Authenticated successfully\n');

  // Create authenticated client
  const supabase = createClient(
    env.VITE_SUPABASE_URL,
    env.VITE_SUPABASE_ANON_KEY,
    {
      global: {
        headers: {
          Authorization: `Bearer ${signInData.session!.access_token}`,
        },
      },
    }
  );

  console.log('🚀 Triggering enrichment...\n');

  // Call edge function with proper auth
  const { data, error } = await supabase.functions.invoke('deep-enrich-organization', {
    body: {
      action: 'start',
      organization_id: TEST_ORG_ID,
      domain: TEST_DOMAIN,
      force: true,
    },
  });

  if (error) {
    console.error('❌ Edge function error:', error);
    process.exit(1);
  }

  console.log('✅ Enrichment started:', data);
  console.log('\n⏳ Polling for completion (max 5 minutes)...\n');

  const startTime = Date.now();
  const POLL_INTERVAL = 5000;
  const MAX_POLL_TIME = 5 * 60 * 1000;
  let attempts = 0;

  while (Date.now() - startTime < MAX_POLL_TIME) {
    attempts++;
    await new Promise(resolve => setTimeout(resolve, POLL_INTERVAL));

    const { data: enrichment, error: pollError } = await supabase
      .from('organization_enrichment')
      .select(`
        id, status, enrichment_source, error_message,
        company_name, industry, description, employee_count, founded_year,
        headquarters, funding_stage, products, key_people, competitors,
        tech_stack, reviews_summary, recent_news
      `)
      .eq('organization_id', TEST_ORG_ID)
      .eq('domain', TEST_DOMAIN)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (pollError) {
      console.error('❌ Polling error:', pollError);
      process.exit(1);
    }

    if (!enrichment) {
      console.log(`  Attempt ${attempts}: No data yet`);
      continue;
    }

    const elapsed = Math.round((Date.now() - startTime) / 1000);
    console.log(`  Attempt ${attempts} (${elapsed}s): status=${enrichment.status}`);

    if (enrichment.status === 'completed') {
      console.log('\n✅ Enrichment completed!\n');
      console.log('📊 Results:');
      console.log('===========\n');
      console.log(`Company: ${enrichment.company_name || 'N/A'}`);
      console.log(`Industry: ${enrichment.industry || 'N/A'}`);
      console.log(`Founded: ${enrichment.founded_year || 'N/A'}`);
      console.log(`Headquarters: ${enrichment.headquarters || 'N/A'}`);
      console.log(`Employees: ${enrichment.employee_count || 'N/A'}`);
      console.log(`Funding: ${enrichment.funding_stage || 'N/A'}`);
      console.log(`Leadership: ${enrichment.key_people?.length || 0} people`);
      console.log(`Products: ${enrichment.products?.length || 0} products`);
      console.log(`Competitors: ${enrichment.competitors?.length || 0} listed`);
      console.log(`Tech Stack: ${enrichment.tech_stack?.length || 0} technologies`);
      console.log(`Recent News: ${enrichment.recent_news?.length || 0} items`);
      console.log(`\n⏱️ Total time: ${elapsed} seconds`);
      process.exit(0);
    }

    if (enrichment.status === 'failed') {
      console.log('\n❌ Enrichment failed!');
      console.log(`Error: ${enrichment.error_message || 'Unknown'}`);
      process.exit(1);
    }
  }

  console.log('\n⏱️ Timeout after 5 minutes');
  process.exit(1);
}

runTest().catch(error => {
  console.error('\n❌ Test failed:', error);
  process.exit(1);
});
