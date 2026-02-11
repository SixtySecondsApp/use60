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

async function monitor() {
  console.log('📊 Monitoring enrichment (checking every 10 seconds)...\n');

  let lastStatus = '';
  let lastSource = '';
  let attempts = 0;

  const interval = setInterval(async () => {
    attempts++;

    const { data } = await supabase
      .from('organization_enrichment')
      .select('status, enrichment_source, updated_at, company_name, error_message')
      .eq('id', ENRICHMENT_ID)
      .single();

    if (!data) {
      console.log(`  ${attempts}. ❌ Record not found`);
      return;
    }

    const statusChanged = data.status !== lastStatus || data.enrichment_source !== lastSource;

    if (statusChanged) {
      const timestamp = new Date(data.updated_at).toLocaleTimeString();
      console.log(`  ${attempts}. [${timestamp}] Status: ${data.status} | Source: ${data.enrichment_source || 'N/A'}`);

      if (data.status === 'completed') {
        clearInterval(interval);
        console.log('\n✅ Enrichment completed!\n');
        console.log(`   Source: ${data.enrichment_source}`);
        console.log(`   Company: ${data.company_name || 'N/A'}`);

        if (data.error_message) {
          console.log(`   ⚠️ Error: ${data.error_message}`);
        }

        // Calculate data completeness
        const fullData = (await supabase
          .from('organization_enrichment')
          .select('*')
          .eq('id', ENRICHMENT_ID)
          .single()).data;

        if (fullData) {
          const fields = [
            'company_name', 'industry', 'description', 'employee_count', 'founded_year',
            'headquarters', 'funding_stage', 'products', 'value_propositions', 'competitors',
            'target_market', 'tech_stack', 'key_people', 'reviews_summary', 'recent_news',
            'pain_points', 'buying_signals'
          ];

          const populated = fields.filter(f => {
            const val = fullData[f];
            if (Array.isArray(val)) return val.length > 0;
            if (typeof val === 'object' && val !== null) return Object.keys(val).length > 0;
            return val !== null && val !== undefined && val !== '';
          }).length;

          const completeness = Math.round((populated / fields.length) * 100);
          console.log(`   Data completeness: ${completeness}% (${populated}/${fields.length} fields)`);

          if (data.enrichment_source === 'skill_research') {
            console.log('\n🎉 SUCCESS! Used company-research skill with Extended Thinking!');
          } else {
            console.log(`\n⚠️ Still using fallback (${data.enrichment_source})`);
          }
        }

        process.exit(0);
      } else if (data.status === 'failed') {
        clearInterval(interval);
        console.log('\n❌ Enrichment failed');
        console.log(`   Error: ${data.error_message}`);
        process.exit(1);
      }
    }

    lastStatus = data.status;
    lastSource = data.enrichment_source || '';

  }, 10000);

  // Timeout after 5 minutes
  setTimeout(() => {
    clearInterval(interval);
    console.log('\n⏱️ Timeout after 5 minutes');
    process.exit(1);
  }, 300000);
}

monitor();
