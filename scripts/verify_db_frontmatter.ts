import { createClient } from '@supabase/supabase-js';
import * as fs from 'fs';
import * as dotenv from 'dotenv';

const envContent = fs.readFileSync('.env.staging', 'utf8');
const env = dotenv.parse(envContent);

const supabase = createClient(
  env.VITE_SUPABASE_URL,
  env.SUPABASE_SERVICE_ROLE_KEY
);

async function verify() {
  // Check platform_skills
  const { data: platformData } = await supabase
    .from('platform_skills')
    .select('skill_key, frontmatter, updated_at')
    .eq('skill_key', 'company-research')
    .single();

  console.log('=== platform_skills ===');
  console.log('Updated at:', platformData?.updated_at);
  console.log('Has requires_capabilities:', !!(platformData?.frontmatter as any)?.requires_capabilities);
  console.log('Frontmatter keys:', Object.keys((platformData?.frontmatter as any) || {}));
  console.log('\nFull frontmatter:');
  console.log(JSON.stringify(platformData?.frontmatter, null, 2));

  // Check organization_skills for test org
  const { data: orgData } = await supabase
    .from('organization_skills')
    .select('skill_id, compiled_frontmatter, updated_at')
    .eq('organization_id', '1d1b4274-c9c4-4cb7-9efc-243c90c86f4c')
    .eq('skill_id', 'company-research')
    .single();

  console.log('\n=== organization_skills (test org) ===');
  console.log('Updated at:', orgData?.updated_at);
  console.log('Has requires_capabilities:', !!(orgData?.compiled_frontmatter as any)?.requires_capabilities);
  console.log('Frontmatter keys:', Object.keys((orgData?.compiled_frontmatter as any) || {}));
}

verify();
