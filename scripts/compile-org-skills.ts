#!/usr/bin/env node

/**
 * Compile platform skills into organization_skills for an org (dev/staging helper).
 *
 * Why this exists:
 * - Copilot lists/executes org skills from `organization_skills` (compiled from `platform_skills`)
 * - When you seed new platform skills (e.g. test skills), you need to compile them into the org
 *
 * Usage (with tsx):
 *   npx tsx scripts/compile-org-skills.ts --org <ORG_ID>
 *   npx tsx scripts/compile-org-skills.ts --org <ORG_ID> --skill test-echo
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

function getArg(name: string): string | null {
  const idx = process.argv.indexOf(`--${name}`);
  if (idx === -1) return null;
  const value = process.argv[idx + 1];
  if (!value || value.startsWith('--')) return null;
  return value;
}

const orgId = getArg('org');
const skillKey = getArg('skill');

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseServiceKey =
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseServiceKey || !orgId) {
  console.error(
    [
      'Missing required inputs.',
      '',
      'Required:',
      '- VITE_SUPABASE_URL',
      '- SUPABASE_SERVICE_ROLE_KEY (preferred) or VITE_SUPABASE_ANON_KEY',
      '- --org <ORG_ID>',
      '',
      'Optional:',
      '- --skill <SKILL_KEY>  (compile one skill; default is compile all)',
    ].join('\n')
  );
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

async function main() {
  const body = skillKey
    ? { action: 'compile_one', organization_id: orgId, skill_key: skillKey }
    : { action: 'compile_all', organization_id: orgId };

  const { data, error } = await supabase.functions.invoke('compile-organization-skills', { body });

  if (error) {
    console.error('Failed invoking compile-organization-skills:', error.message);
    process.exit(1);
  }

  if (!data?.success) {
    console.error('Compilation failed:', data?.error || 'unknown error');
    process.exit(1);
  }

  if (skillKey) {
    console.log(`Compiled skill ${skillKey} for org ${orgId}`);
    console.log(JSON.stringify(data.result || {}, null, 2));
  } else {
    console.log(`Compiled ${data.compiled} skill(s) for org ${orgId}`);
    if (Array.isArray(data.errors) && data.errors.length > 0) {
      console.log('Errors:', JSON.stringify(data.errors, null, 2));
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

