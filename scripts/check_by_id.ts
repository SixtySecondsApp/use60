import { createClient } from '@supabase/supabase-js';
import * as fs from 'fs';
import * as dotenv from 'dotenv';

const envContent = fs.readFileSync('.env.staging', 'utf8');
const env = dotenv.parse(envContent);

const supabase = createClient(
  env.VITE_SUPABASE_URL,
  env.SUPABASE_SERVICE_ROLE_KEY
);

const ENRICHMENT_ID = 'a1d506df-fc41-4da6-96cf-55ecd2d3fce3';

async function checkById() {
  const { data, error } = await supabase
    .from('organization_enrichment')
    .select('*')
    .eq('id', ENRICHMENT_ID)
    .maybeSingle();

  if (error) {
    console.error('Error:', error);
    return;
  }

  if (!data) {
    console.log('❌ No record found with that ID');
    console.log('The edge function returned success but never created a database record.');
    console.log('This indicates the edge function crashed after returning the initial response.\n');

    // Check for ANY records created in the last hour
    const { data: recentData } = await supabase
      .from('organization_enrichment')
      .select('id, domain, status, enrichment_source, created_at')
      .gte('created_at', new Date(Date.now() - 3600000).toISOString())
      .order('created_at', { ascending: false });

    console.log(`Recent enrichments (last hour): ${recentData?.length || 0}`);
    recentData?.forEach(r => {
      console.log(`  ${r.id.substring(0, 8)}... | ${r.domain} | ${r.status} | ${r.enrichment_source}`);
    });

    return;
  }

  console.log('✅ Found enrichment record:\n');
  console.log(`  ID: ${data.id}`);
  console.log(`  Domain: ${data.domain}`);
  console.log(`  Status: ${data.status}`);
  console.log(`  Source: ${data.enrichment_source}`);
  console.log(`  Created: ${data.created_at}`);
  console.log(`  Error: ${data.error_message || 'none'}`);
  console.log(`  Company: ${data.company_name || 'N/A'}`);
  console.log(`  Industry: ${data.industry || 'N/A'}`);
  console.log(`  Data completeness: ${calculateCompleteness(data)}%`);
}

function calculateCompleteness(data: any): number {
  const fields = [
    'company_name', 'industry', 'description', 'employee_count', 'founded_year',
    'headquarters', 'funding_stage', 'products', 'value_propositions', 'competitors',
    'target_market', 'tech_stack', 'key_people', 'reviews_summary', 'recent_news',
    'pain_points', 'buying_signals'
  ];

  const populated = fields.filter(f => {
    const val = data[f];
    if (Array.isArray(val)) return val.length > 0;
    if (typeof val === 'object' && val !== null) return Object.keys(val).length > 0;
    return val !== null && val !== undefined && val !== '';
  }).length;

  return Math.round((populated / fields.length) * 100);
}

checkById();
