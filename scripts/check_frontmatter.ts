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

async function checkFrontmatter() {
  const { data, error } = await supabase
    .from('organization_skills')
    .select('compiled_frontmatter')
    .eq('organization_id', TEST_ORG_ID)
    .eq('skill_id', 'company-research')
    .single();

  if (error) {
    console.error('Error:', error);
    return;
  }

  console.log('Compiled Frontmatter:');
  console.log(JSON.stringify(data.compiled_frontmatter, null, 2));
}

checkFrontmatter();
