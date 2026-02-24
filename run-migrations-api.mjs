#!/usr/bin/env node

import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Staging credentials from .env.staging
const PROJECT_ID = 'caerqjzvuerejfrdtygb';
const ACCESS_TOKEN = 'sbp_8e5eef8735fc3f15ed2544a5ad9508a902f2565f';
const API_URL = `https://api.supabase.com/v1/projects/${PROJECT_ID}/database/query`;

// Migrations to apply (in order)
const migrations = [
  '20260205130000_fix_join_requests_rls_member_status.sql',
  '20260205130100_fix_join_requests_rpc_member_status.sql',
  '20260205140000_add_org_deletion_scheduler.sql',
  '20260205140100_rpc_deactivate_organization_by_owner.sql',
  '20260205150000_fix_fuzzy_matching_active_members.sql',
];

console.log('🚀 Applying onboarding bug fix migrations to STAGING database...');
console.log(`   Project: ${PROJECT_ID}`);
console.log('   Method: Supabase Management API');
console.log('');

let successCount = 0;
let failedCount = 0;
let skippedCount = 0;

for (let i = 0; i < migrations.length; i++) {
  const migration = migrations[i];
  const migrationNum = i + 1;

  console.log(`📝 Migration ${migrationNum}/${migrations.length}: ${migration}`);

  try {
    // Read migration file
    const migrationPath = join(__dirname, 'supabase', 'migrations', migration);
    const sql = readFileSync(migrationPath, 'utf8');

    // Execute SQL via Management API
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

      // Check if it's a safe "already exists" error
      if (errorMsg.includes('already exists') ||
          errorMsg.includes('duplicate') ||
          errorMsg.includes('42710') ||
          errorMsg.includes('42P07')) {
        console.log(`   ⚠️  Already applied, skipping...`);
        skippedCount++;
      } else {
        console.error(`   ❌ Failed: ${errorMsg}`);
        failedCount++;
      }
    } else {
      console.log(`   ✅ Applied successfully`);
      successCount++;
    }
  } catch (err) {
    console.error(`   ❌ Error: ${err.message}`);
    failedCount++;
  }

  console.log('');
}

console.log('');
console.log('✨ Migration Summary:');
console.log(`   Total: ${migrations.length}`);
console.log(`   Success: ${successCount}`);
console.log(`   Skipped: ${skippedCount}`);
console.log(`   Failed: ${failedCount}`);
console.log('');

if (failedCount === 0) {
  console.log('🎉 All migrations applied successfully!');
  console.log('');
  console.log('🧪 Next steps:');
  console.log('   1. Test onboarding flow with company website');
  console.log('   2. Verify no auto-join (should create join request)');
  console.log('   3. Test empty org filtering');
  console.log('   4. Check error messages are user-friendly');
} else {
  console.log('⚠️  Some migrations failed. Please review errors above.');
}
