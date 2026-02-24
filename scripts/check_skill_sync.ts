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

async function checkSkill() {
  console.log('🔍 Checking company-research skill in organization_skills...\n');

  const { data, error } = await supabase
    .from('organization_skills')
    .select(`
      skill_id,
      skill_name,
      is_enabled,
      is_active,
      platform_skill_id,
      platform_skill_version,
      compiled_frontmatter,
      platform_skills:platform_skill_id(category, frontmatter, version, is_active)
    `)
    .eq('organization_id', TEST_ORG_ID)
    .eq('skill_id', 'company-research');

  if (error) {
    console.error('❌ Query error:', error);
    return;
  }

  if (!data || data.length === 0) {
    console.log('❌ company-research skill NOT found in organization_skills for this org');
    return;
  }

  console.log(`✅ Found ${data.length} row(s):\n`);
  data.forEach((row, idx) => {
    console.log(`Row ${idx + 1}:`);
    console.log(`  skill_id: ${row.skill_id}`);
    console.log(`  skill_name: ${row.skill_name}`);
    console.log(`  is_enabled: ${row.is_enabled}`);
    console.log(`  is_active: ${row.is_active}`);
    console.log(`  platform_skill_id: ${row.platform_skill_id}`);
    console.log(`  platform_skill_version: ${row.platform_skill_version}`);
    console.log(`  platform_skills.category: ${row.platform_skills?.category}`);
    console.log(`  platform_skills.version: ${row.platform_skills?.version}`);
    console.log(`  platform_skills.is_active: ${row.platform_skills?.is_active}`);

    const frontmatter = row.compiled_frontmatter as any;
    if (frontmatter) {
      console.log(`  frontmatter.requires_capabilities: ${JSON.stringify(frontmatter.requires_capabilities)}`);
    }
    console.log('');
  });

  // Check what the edge function query would return
  console.log('🧪 Simulating edge function query (.eq("is_active", true)):\n');

  const { data: edgeData, error: edgeError } = await supabase
    .from('organization_skills')
    .select(`
      skill_id,
      is_enabled,
      compiled_frontmatter,
      compiled_content,
      platform_skill_version,
      platform_skills:platform_skill_id(category, frontmatter, content_template, version, is_active)
    `)
    .eq('organization_id', TEST_ORG_ID)
    .eq('skill_id', 'company-research')
    .eq('is_active', true)
    .maybeSingle();

  if (edgeError) {
    console.error('❌ Edge query error:', edgeError);
    return;
  }

  if (!edgeData) {
    console.log('❌ Edge function query returned NULL (skill not found with is_active=true)');
    console.log('   This is why the skill execution fails!');
  } else {
    console.log('✅ Edge function query would find the skill');
    console.log(`   is_enabled: ${edgeData.is_enabled}`);
    console.log(`   has content: ${!!edgeData.compiled_content}`);
  }
}

checkSkill();
