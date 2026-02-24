import { createClient } from '@supabase/supabase-js';
import * as fs from 'fs';
import * as path from 'path';
import * as dotenv from 'dotenv';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load staging env
const stagingEnvPath = path.resolve(__dirname, '../.env.staging');
const envContent = fs.readFileSync(stagingEnvPath, 'utf8');
const env = dotenv.parse(envContent);

const supabase = createClient(
  env.VITE_SUPABASE_URL,
  env.SUPABASE_SERVICE_ROLE_KEY
);

const ORG_ID = '1d1b4274-c9c4-4cb7-9efc-243c90c86f4c';
const TEST_DOMAIN = 'conturae.com';

async function testEnrichment() {
  console.log('Starting enrichment test...');
  console.log('Organization:', ORG_ID);
  console.log('Domain:', TEST_DOMAIN);

  // Call the edge function
  const { data, error } = await supabase.functions.invoke('deep-enrich-organization', {
    body: {
      action: 'start',
      organization_id: ORG_ID,
      domain: TEST_DOMAIN,
      force: true
    }
  });

  if (error) {
    console.error('Edge function error:', error);
    process.exit(1);
  }

  console.log('\nEnrichment started:', data);

  // Poll for completion
  console.log('\nPolling for completion...');
  let attempts = 0;
  const maxAttempts = 60; // 5 minutes max

  while (attempts < maxAttempts) {
    await new Promise(resolve => setTimeout(resolve, 5000)); // Wait 5 seconds

    const { data: enrichment, error: pollError } = await supabase
      .from('organization_enrichment')
      .select('id, status, enrichment_source, error_message, enrichment_data')
      .eq('organization_id', ORG_ID)
      .eq('domain', TEST_DOMAIN)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (pollError) {
      console.error('Poll error:', pollError);
      process.exit(1);
    }

    if (!enrichment) {
      console.log(`Attempt ${attempts + 1}: No enrichment record found yet...`);
      attempts++;
      continue;
    }

    console.log(`Attempt ${attempts + 1}: Status = ${enrichment.status}, Source = ${enrichment.enrichment_source}`);

    if (enrichment.status === 'completed') {
      console.log('\n✅ Enrichment completed!');
      console.log('Source:', enrichment.enrichment_source);

      if (enrichment.enrichment_data) {
        const data = enrichment.enrichment_data as any;
        console.log('\nEnriched fields:');
        console.log('- Company Name:', data.company_name);
        console.log('- Industry:', data.industry);
        console.log('- Founded:', data.founded_year);
        console.log('- Headquarters:', data.headquarters);
        console.log('- Employees:', data.employee_count);
        console.log('- Leadership:', data.leadership?.length, 'people');
        console.log('- Products:', data.products?.length, 'products');
        console.log('- Funding:', data.funding_stage);
        console.log('- Rating:', data.customer_rating);
      }

      process.exit(0);
    }

    if (enrichment.status === 'failed') {
      console.log('\n❌ Enrichment failed!');
      console.log('Error:', enrichment.error_message);
      process.exit(1);
    }

    attempts++;
  }

  console.log('\n⏱️ Timeout: Enrichment did not complete within 5 minutes');
  process.exit(1);
}

testEnrichment().catch(console.error);
