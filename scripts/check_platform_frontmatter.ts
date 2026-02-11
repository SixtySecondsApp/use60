import { createClient } from '@supabase/supabase-js';
import * as fs from 'fs';
import * as dotenv from 'dotenv';

const envContent = fs.readFileSync('.env.staging', 'utf8');
const env = dotenv.parse(envContent);

const supabase = createClient(
  env.VITE_SUPABASE_URL,
  env.SUPABASE_SERVICE_ROLE_KEY
);

async function checkPlatformFrontmatter() {
  const { data, error } = await supabase
    .from('platform_skills')
    .select('skill_key, frontmatter')
    .eq('skill_key', 'company-research')
    .single();

  if (error) {
    console.error('Error:', error);
    return;
  }

  console.log('Platform Skills Frontmatter:');
  console.log(JSON.stringify(data.frontmatter, null, 2));
}

checkPlatformFrontmatter();
