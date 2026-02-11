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

async function testCompile() {
  console.log('Calling compile-organization-skills edge function...\n');

  const { data, error } = await supabase.functions.invoke(
    'compile-organization-skills',
    {
      body: {
        action: 'compile_one',
        organization_id: TEST_ORG_ID,
        skill_key: 'company-research'
      }
    }
  );

  if (error) {
    console.error('❌ Edge function error:', error);
    return;
  }

  console.log('✅ Compile result:', JSON.stringify(data, null, 2));

  // Now check the database
  console.log('\n📊 Checking database...');
  const { data: orgSkill } = await supabase
    .from('organization_skills')
    .select('compiled_frontmatter, last_compiled_at')
    .eq('organization_id', TEST_ORG_ID)
    .eq('skill_id', 'company-research')
    .single();

  console.log('Last compiled at:', orgSkill?.last_compiled_at);
  console.log('Frontmatter keys:', Object.keys((orgSkill?.compiled_frontmatter as any) || {}));
  console.log('Has requires_capabilities:', !!(orgSkill?.compiled_frontmatter as any)?.requires_capabilities);
}

testCompile();
