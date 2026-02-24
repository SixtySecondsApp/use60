import { createClient } from '@supabase/supabase-js';
import * as fs from 'fs';
import * as dotenv from 'dotenv';

const envContent = fs.readFileSync('.env.staging', 'utf8');
const env = dotenv.parse(envContent);

const supabase = createClient(
  env.VITE_SUPABASE_URL,
  env.SUPABASE_SERVICE_ROLE_KEY
);

async function check() {
  const { data } = await supabase
    .from('organization_enrichment')
    .select('id, organization_id, domain, status, enrichment_source')
    .eq('id', 'a1d506df-fc41-4da6-96cf-55ecd2d3fce3')
    .single();

  console.log('Enrichment record:');
  console.log(JSON.stringify(data, null, 2));
}

check();
