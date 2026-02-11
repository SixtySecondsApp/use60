import { createClient } from '@supabase/supabase-js';
import * as fs from 'fs';
import * as path from 'path';
import * as dotenv from 'dotenv';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load staging env
const stagingEnvPath = path.resolve(__dirname, '../.env.staging');
const envContent = fs.readFileSync(stagingEnvPath, 'utf8');
const env = dotenv.parse(envContent);

console.log('Using Supabase URL:', env.VITE_SUPABASE_URL);

const supabase = createClient(
  env.VITE_SUPABASE_URL,
  env.SUPABASE_SERVICE_ROLE_KEY
);

const ORG_ID = '1d1b4274-c9c4-4cb7-9efc-243c90c86f4c';
const SKILL_KEY = 'company-research';

async function syncSkill() {
  console.log('\n=== Step 1: Read SKILL.md ===');
  const skillPath = path.resolve(__dirname, '../skills/atomic/company-research/SKILL.md');
  const skillContent = fs.readFileSync(skillPath, 'utf8');

  // Parse frontmatter
  const frontmatterMatch = skillContent.match(/^---\n([\s\S]+?)\n---\n([\s\S]+)$/);
  if (!frontmatterMatch) {
    console.error('Failed to parse SKILL.md frontmatter');
    process.exit(1);
  }

  const frontmatterYaml = frontmatterMatch[1];
  const bodyMarkdown = frontmatterMatch[2];

  // Simple YAML parse for key fields
  const nameMatch = frontmatterYaml.match(/^name:\s*(.+)$/m);
  const categoryMatch = frontmatterYaml.match(/^metadata:\s*\n(?:.*\n)*?\s+category:\s*(.+)$/m);
  const isActiveMatch = frontmatterYaml.match(/is_active:\s*(true|false)/);
  const versionMatch = frontmatterYaml.match(/version:\s*"?(\d+)"?/);

  const skillName = nameMatch ? nameMatch[1].trim() : SKILL_KEY;
  const category = categoryMatch ? categoryMatch[1].trim() : 'enrichment';
  const isActive = isActiveMatch ? isActiveMatch[1] === 'true' : true;
  const version = versionMatch ? versionMatch[1] : '1';

  console.log('Parsed:', { skillName, category, version, isActive });

  // Build frontmatter JSONB (we'll parse the full YAML properly later, but this is MVP)
  const frontmatterJsonb = {
    name: skillName,
    category,
    version,
    is_active: isActive,
    // ... other fields would be parsed from YAML
  };

  console.log('\n=== Step 2: Upsert to platform_skills ===');
  const { data: platformSkill, error: upsertError } = await supabase
    .from('platform_skills')
    .upsert({
      skill_key: SKILL_KEY,
      category,
      frontmatter: frontmatterJsonb as any,
      content_template: bodyMarkdown,
      version,
      is_active: isActive
    }, {
      onConflict: 'skill_key'
    })
    .select()
    .single();

  if (upsertError) {
    console.error('Upsert error:', upsertError);
    process.exit(1);
  }

  console.log('✅ Upserted to platform_skills:', platformSkill.skill_key);

  console.log('\n=== Step 3: Compile to organization_skills ===');
  const { error: compileError } = await supabase
    .from('organization_skills')
    .upsert({
      organization_id: ORG_ID,
      skill_id: platformSkill.skill_key,
      platform_skill_id: platformSkill.id,
      skill_name: skillName,
      is_enabled: true,
      is_active: true,
      compiled_frontmatter: frontmatterJsonb as any,
      compiled_content: bodyMarkdown,
      platform_skill_version: platformSkill.version,
      updated_at: new Date().toISOString()
    }, {
      onConflict: 'organization_id,skill_id'
    });

  if (compileError) {
    console.error('Compile error:', compileError);
    process.exit(1);
  }

  console.log('✅ Compiled for org');

  console.log('\n=== Step 4: Verify ===');
  const { data: verification, error: verifyError } = await supabase
    .from('organization_skills')
    .select('skill_id, is_enabled, is_active')
    .eq('organization_id', ORG_ID)
    .eq('skill_id', SKILL_KEY)
    .single();

  if (verifyError || !verification) {
    console.error('Verification failed:', verifyError);
    process.exit(1);
  }

  console.log('Final state:', verification);
  console.log('\n🎉 company-research is ready for use in staging!');
}

syncSkill().catch(console.error);
