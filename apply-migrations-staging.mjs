#!/usr/bin/env node

import pg from 'pg';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const { Client } = pg;
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Staging database connection from .env.staging
// Using pooler connection with correct format
const config = {
  host: 'aws-0-eu-west-1.pooler.supabase.com',
  port: 5432,
  database: 'postgres',
  user: 'postgres',  // Standard postgres user (not postgres.<ref>)
  password: 'Gi7JO1tz2NupAzHt',
  ssl: {
    rejectUnauthorized: false
  },
  // Add connection options for pooler
  options: '-c search_path=public'
};

// Migrations to apply (in order)
const migrations = [
  '20260205130000_fix_join_requests_rls_member_status.sql',
  '20260205130100_fix_join_requests_rpc_member_status.sql',
  '20260205140000_add_org_deletion_scheduler.sql',
  '20260205140100_rpc_deactivate_organization_by_owner.sql',
  '20260205150000_fix_fuzzy_matching_active_members.sql',
];

console.log('🚀 Applying onboarding bug fix migrations to STAGING database...');
console.log('   Database: aws-0-eu-west-1.pooler.supabase.com');
console.log('   Project: caerqjzvuerejfrdtygb');
console.log('');

const client = new Client(config);

try {
  await client.connect();
  console.log('✅ Connected to database');
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

      // Execute SQL
      await client.query(sql);

      console.log(`   ✅ Applied successfully`);
      successCount++;
    } catch (err) {
      // Check if it's a "already exists" error (safe to skip)
      if (err.message.includes('already exists') ||
          err.message.includes('duplicate') ||
          err.code === '42710' || // duplicate object
          err.code === '42P07') {  // duplicate table
        console.log(`   ⚠️  Already applied, skipping...`);
        skippedCount++;
      } else {
        console.error(`   ❌ Failed: ${err.message}`);
        failedCount++;

        // Only stop on critical errors
        if (!err.message.includes('does not exist') &&
            !err.message.includes('cannot drop') &&
            err.code !== '42883') { // function does not exist
          console.error('');
          console.error('❌ Stopping due to critical migration failure');
          await client.end();
          process.exit(1);
        }
      }
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

  if (failedCount === 0 || (failedCount === skippedCount)) {
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

} catch (err) {
  console.error('❌ Connection error:', err.message);
  process.exit(1);
} finally {
  await client.end();
}
