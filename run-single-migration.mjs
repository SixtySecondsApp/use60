#!/usr/bin/env node

import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const PROJECT_ID = 'caerqjzvuerejfrdtygb';
const ACCESS_TOKEN = 'sbp_8e5eef8735fc3f15ed2544a5ad9508a902f2565f';
const API_URL = `https://api.supabase.com/v1/projects/${PROJECT_ID}/database/query`;

const migration = '20260205160000_fix_org_deactivation_validation.sql';

console.log('🚀 Applying organization deactivation fix to STAGING database...');
console.log(`   Migration: ${migration}`);
console.log('   Fix: Remove requirement for multiple organizations');
console.log('');

try {
  const migrationPath = join(__dirname, 'supabase', 'migrations', migration);
  const sql = readFileSync(migrationPath, 'utf8');

  const response = await fetch(API_URL, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${ACCESS_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ query: sql }),
  });

  const result = await response.json();

  if (!response.ok) {
    const errorMsg = result.error || result.message || 'Unknown error';
    console.error(`❌ Failed: ${errorMsg}`);
    process.exit(1);
  } else {
    console.log(`✅ Applied successfully!`);
    console.log('');
    console.log('🎉 Organization deactivation validation fixed!');
    console.log('   Users can now deactivate their only organization.');
  }
} catch (err) {
  console.error(`❌ Error: ${err.message}`);
  process.exit(1);
}
