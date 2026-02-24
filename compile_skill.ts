import { createClient } from '@supabase/supabase-js';
import * as fs from 'fs';
import * as dotenv from 'dotenv';

// Load staging env
const envContent = fs.readFileSync('.env.staging', 'utf8');
const env = dotenv.parse(envContent);

const supabase = createClient(
  env.VITE_SUPABASE_URL,
  env.SUPABASE_SERVICE_ROLE_KEY
);

const ORG_ID = '1d1b4274-c9c4-4cb7-9efc-243c90c86f4c';

async function compileSkill() {
  console.log('Compiling company-research skill for org...');

  // Get platform skill
  const { data: platformSkill, error: psError } = await supabase
    .from('platform_skills')
    .select('*')
    .eq('skill_key', 'company-research')
    .eq('is_active', true)
    .single();

  if (psError || !platformSkill) {
    console.error('Platform skill not found:', psError);
    process.exit(1);
  }

  console.log('Found platform skill:', platformSkill.skill_key);

  // Upsert into organization_skills
  const { error: insertError } = await supabase
    .from('organization_skills')
    .upsert({
      organization_id: ORG_ID,
      skill_id: platformSkill.skill_key,
      platform_skill_id: platformSkill.id,
      is_enabled: true,
      is_active: true,
      compiled_frontmatter: platformSkill.frontmatter,
      compiled_content: platformSkill.content_template,
      platform_skill_version: platformSkill.version,
      updated_at: new Date().toISOString()
    }, {
      onConflict: 'organization_id,skill_id'
    });

  if (insertError) {
    console.error('Insert error:', insertError);
    process.exit(1);
  }

  console.log('✅ Skill compiled for org');

  // Verify
  const { data: verification, error: verifyError } = await supabase
    .from('organization_skills')
    .select('skill_id, is_enabled, is_active, platform_skill_version')
    .eq('organization_id', ORG_ID)
    .eq('skill_id', 'company-research')
    .single();

  if (verifyError) {
    console.error('Verification error:', verifyError);
    process.exit(1);
  }

  console.log('Verification:', verification);
  console.log('🎉 company-research is ready!');
}

compileSkill().catch(console.error);
