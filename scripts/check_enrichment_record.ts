import { createClient } from '@supabase/supabase-js';
import * as fs from 'fs';
import * as dotenv from 'dotenv';

const envContent = fs.readFileSync('.env.staging', 'utf8');
const env = dotenv.parse(envContent);

const supabase = createClient(
  env.VITE_SUPABASE_URL,
  env.SUPABASE_SERVICE_ROLE_KEY
);

const TEST_ORG_ID = '1d1b4274-c9c4-4cb7-9efc-243c90c86f4c';
const TEST_DOMAIN = 'conturae.com';

async function checkStatus() {
  const { data, error } = await supabase
    .from('organization_enrichment')
    .select('*')
    .eq('organization_id', TEST_ORG_ID)
    .eq('domain', TEST_DOMAIN)
    .order('created_at', { ascending: false })
    .limit(5);

  if (error) {
    console.error('Error:', error);
    return;
  }

  console.log(`Found ${data?.length || 0} enrichment records for ${TEST_DOMAIN}:\n`);

  if (!data || data.length === 0) {
    console.log('No records found. The edge function may have failed silently.');
    return;
  }

  data.forEach((record, idx) => {
    console.log(`Record ${idx + 1}:`);
    console.log(`  Status: ${record.status}`);
    console.log(`  Source: ${record.enrichment_source}`);
    console.log(`  Created: ${record.created_at}`);
    console.log(`  Error: ${record.error_message || 'none'}`);
    console.log('');
  });
}

checkStatus();
