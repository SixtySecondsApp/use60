import { createClient } from '@supabase/supabase-js';
import * as fs from 'fs';
import * as dotenv from 'dotenv';
import { parseSkillFile } from './lib/skillParser.js';

const envContent = fs.readFileSync('.env.staging', 'utf8');
const env = dotenv.parse(envContent);

const supabase = createClient(
  env.VITE_SUPABASE_URL,
  env.SUPABASE_SERVICE_ROLE_KEY
);

async function testUpsert() {
  console.log('1. Parsing skill file...');
  const record = await parseSkillFile('.claude/skills/company-research/SKILL.md');

  console.log('\n2. Parsed frontmatter keys:', Object.keys(record.frontmatter));
  console.log('   Has requires_capabilities:', !!record.frontmatter.requires_capabilities);

  console.log('\n3. Performing upsert...');
  const { data, error } = await supabase
    .from('platform_skills')
    .upsert(
      {
        skill_key: record.skill_key,
        category: record.category,
        frontmatter: record.frontmatter,
        content_template: record.content_template,
        is_active: record.is_active,
      },
      { onConflict: 'skill_key' }
    )
    .select();

  if (error) {
    console.error('\n❌ Upsert error:', error);
    return;
  }

  console.log('\n✅ Upsert successful');
  console.log('   Returned data:', data);

  console.log('\n4. Verifying database...');
  const { data: verifyData } = await supabase
    .from('platform_skills')
    .select('frontmatter, updated_at')
    .eq('skill_key', 'company-research')
    .single();

  console.log('\n   Updated at:', verifyData?.updated_at);
  console.log('   Frontmatter keys:', Object.keys((verifyData?.frontmatter as any) || {}));
  console.log('   Has requires_capabilities:', !!(verifyData?.frontmatter as any)?.requires_capabilities);
  console.log('\n   Full frontmatter:');
  console.log(JSON.stringify(verifyData?.frontmatter, null, 2));
}

testUpsert();
