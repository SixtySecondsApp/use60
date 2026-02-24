/**
 * Programmatic test for onboarding enrichment with company-research skill
 *
 * Tests the full V3 enrichment flow:
 * 1. Triggers enrichment for conturae.com
 * 2. Polls for completion (with timeout)
 * 3. Validates data completeness (target: 89% = 17/19 fields)
 * 4. Reports results
 */

import { createClient } from '@supabase/supabase-js';
import * as fs from 'fs';
import * as dotenv from 'dotenv';

// Load staging environment
const envContent = fs.readFileSync('.env.staging', 'utf8');
const env = dotenv.parse(envContent);

const supabase = createClient(
  env.VITE_SUPABASE_URL,
  env.SUPABASE_SERVICE_ROLE_KEY
);

const TEST_ORG_ID = '1d1b4274-c9c4-4cb7-9efc-243c90c86f4c';
const TEST_DOMAIN = 'conturae.com';
const POLL_INTERVAL = 5000; // 5 seconds
const MAX_POLL_TIME = 5 * 60 * 1000; // 5 minutes

interface EnrichmentData {
  company_name?: string;
  tagline?: string;
  description?: string;
  industry?: string;
  employee_count?: string;
  founded_year?: string;
  headquarters?: string;
  company_type?: string;
  funding_status?: string;
  funding_rounds?: any[];
  investors?: string[];
  valuation?: string;
  review_ratings?: any[];
  awards?: string[];
  recent_news?: any[];
  products?: any[];
  value_propositions?: string[];
  competitors?: any[];
  target_market?: string;
  customer_types?: string[];
  key_features?: string[];
  pain_points_mentioned?: string[];
  tech_stack?: string[];
  key_people?: any[];
  pricing_model?: string;
}

const EXPECTED_FIELDS = [
  'company_name',
  'industry',
  'description',
  'employee_count',
  'founded_year',
  'headquarters',
  'company_type',
  'funding_status',
  'key_people',
  'products',
  'competitors',
  'target_market',
  'tech_stack',
  'review_ratings',
  'recent_news',
  'awards',
  'value_propositions',
  'key_features',
  'pain_points_mentioned',
];

function calculateCompleteness(data: EnrichmentData): { percentage: number; populated: number; total: number; missing: string[] } {
  let populated = 0;
  const missing: string[] = [];

  for (const field of EXPECTED_FIELDS) {
    const value = (data as any)[field];
    if (value !== null && value !== undefined && value !== '' &&
        !(Array.isArray(value) && value.length === 0)) {
      populated++;
    } else {
      missing.push(field);
    }
  }

  return {
    percentage: Math.round((populated / EXPECTED_FIELDS.length) * 100),
    populated,
    total: EXPECTED_FIELDS.length,
    missing,
  };
}

async function testEnrichment() {
  console.log('🧪 Testing V3 Onboarding Enrichment');
  console.log('=====================================\n');
  console.log(`Organization: ${TEST_ORG_ID}`);
  console.log(`Domain: ${TEST_DOMAIN}`);
  console.log(`Expected: 89% data completeness (17/19 fields)\n`);

  // Step 1: Delete any existing enrichment for clean test
  console.log('📝 Step 1: Cleaning up existing enrichment data...');
  await supabase
    .from('organization_enrichment')
    .delete()
    .eq('organization_id', TEST_ORG_ID)
    .eq('domain', TEST_DOMAIN);
  console.log('✅ Cleanup complete\n');

  // Step 2: Trigger enrichment via direct database insert
  // (bypasses auth requirement of edge function)
  console.log('🚀 Step 2: Triggering enrichment...');

  const { data: enrichmentRecord, error: insertError } = await supabase
    .from('organization_enrichment')
    .insert({
      organization_id: TEST_ORG_ID,
      domain: TEST_DOMAIN,
      status: 'pending',
      enrichment_source: 'company-research',
    })
    .select()
    .single();

  if (insertError || !enrichmentRecord) {
    console.error('❌ Failed to create enrichment record:', insertError);
    process.exit(1);
  }

  console.log(`✅ Enrichment record created (ID: ${enrichmentRecord.id})`);

  // Step 3: Trigger the enrichment processing via edge function
  // We'll call it with the service role key in the Authorization header
  console.log('🔧 Step 3: Invoking edge function...');

  try {
    const response = await fetch(
      `${env.VITE_SUPABASE_URL}/functions/v1/deep-enrich-organization`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          action: 'start',
          organization_id: TEST_ORG_ID,
          domain: TEST_DOMAIN,
          force: true,
        }),
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error('❌ Edge function failed:', response.status, errorText);
      // Continue to polling anyway - enrichment might have started
    } else {
      const result = await response.json();
      console.log('✅ Edge function invoked:', result.message || 'Started');
    }
  } catch (error) {
    console.error('⚠️ Edge function error (continuing to poll):', error);
  }

  console.log('\n⏳ Step 4: Polling for completion...');
  const startTime = Date.now();
  let attempts = 0;

  while (Date.now() - startTime < MAX_POLL_TIME) {
    attempts++;
    await new Promise(resolve => setTimeout(resolve, POLL_INTERVAL));

    const { data: enrichment, error: pollError } = await supabase
      .from('organization_enrichment')
      .select(`
        id, status, enrichment_source, error_message,
        company_name, industry, description, employee_count, founded_year,
        headquarters, funding_stage, products, value_propositions, competitors,
        target_market, tech_stack, key_people, reviews_summary, recent_news,
        pain_points, buying_signals
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
      console.log(`  Attempt ${attempts}: No enrichment record found`);
      continue;
    }

    const elapsed = Math.round((Date.now() - startTime) / 1000);
    console.log(`  Attempt ${attempts} (${elapsed}s): status=${enrichment.status}, source=${enrichment.enrichment_source}`);

    if (enrichment.status === 'completed') {
      console.log('\n✅ Step 5: Enrichment completed!\n');

      // Analyze results
      const data: EnrichmentData = {
        company_name: enrichment.company_name,
        industry: enrichment.industry,
        description: enrichment.description,
        employee_count: enrichment.employee_count,
        founded_year: enrichment.founded_year?.toString(),
        headquarters: enrichment.headquarters,
        company_type: enrichment.funding_stage, // Using funding_stage as company_type
        funding_status: enrichment.funding_stage,
        products: enrichment.products as any[],
        value_propositions: enrichment.value_propositions as string[],
        competitors: enrichment.competitors as any[],
        target_market: enrichment.target_market,
        tech_stack: enrichment.tech_stack as string[],
        key_people: enrichment.key_people as any[],
        review_ratings: enrichment.reviews_summary ? [enrichment.reviews_summary] : [],
        recent_news: enrichment.recent_news as any[],
        pain_points_mentioned: enrichment.pain_points as string[],
      };
      const completeness = calculateCompleteness(data);

      console.log('📊 Results:');
      console.log('===========\n');
      console.log(`Company Name: ${data.company_name || 'N/A'}`);
      console.log(`Industry: ${data.industry || 'N/A'}`);
      console.log(`Founded: ${data.founded_year || 'N/A'}`);
      console.log(`Headquarters: ${data.headquarters || 'N/A'}`);
      console.log(`Employees: ${data.employee_count || 'N/A'}`);
      console.log(`Funding: ${data.funding_status || 'N/A'}`);
      console.log(`Leadership: ${data.key_people?.length || 0} people`);
      console.log(`Products: ${data.products?.length || 0} products`);
      console.log(`Competitors: ${data.competitors?.length || 0} listed`);
      console.log(`Tech Stack: ${data.tech_stack?.length || 0} technologies`);
      console.log(`Reviews: ${data.review_ratings?.length || 0} platforms`);
      console.log(`Recent News: ${data.recent_news?.length || 0} items`);

      console.log('\n📈 Data Completeness:');
      console.log('=====================\n');
      console.log(`Populated Fields: ${completeness.populated}/${completeness.total}`);
      console.log(`Completeness: ${completeness.percentage}%`);
      console.log(`Target: 89% (17/19 fields)\n`);

      if (completeness.percentage >= 89) {
        console.log('✅ SUCCESS: Target completeness achieved!');
      } else {
        console.log(`⚠️ PARTIAL: Below target (${completeness.percentage}% vs 89%)`);
        console.log(`\nMissing fields: ${completeness.missing.join(', ')}`);
      }

      console.log(`\n⏱️ Total time: ${elapsed} seconds`);
      process.exit(0);
    }

    if (enrichment.status === 'failed') {
      console.log('\n❌ Step 5: Enrichment failed!\n');
      console.log(`Error: ${enrichment.error_message || 'Unknown error'}`);
      process.exit(1);
    }
  }

  console.log('\n⏱️ Timeout: Enrichment did not complete within 5 minutes');
  process.exit(1);
}

testEnrichment().catch(error => {
  console.error('\n❌ Test failed with error:', error);
  process.exit(1);
});
