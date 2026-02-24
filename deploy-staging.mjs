#!/usr/bin/env node
/**
 * Deploy staging migrations using .env.staging
 *
 * Usage: node deploy-staging.mjs
 *
 * This script will:
 * 1. Read credentials from .env.staging
 * 2. Connect to the staging Supabase database
 * 3. Apply the two migration files
 * 4. Verify success
 */

import { Client } from 'pg';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Load .env.staging
const envFile = fs.readFileSync(path.join(__dirname, '.env.staging'), 'utf-8');
const envLines = envFile.split('\n');
const env = {};
envLines.forEach(line => {
  const match = line.match(/^([^=]+)=(.*)$/);
  if (match) {
    env[match[1].trim()] = match[2].trim();
  }
});

const PASSWORD = env.SUPABASE_DATABASE_PASSWORD;
const PROJECT_ID = 'caerqjzvuerejfrdtygb';
const HOST = `db.${PROJECT_ID}.supabase.co`;

const connectionString = `postgresql://postgres:${PASSWORD}@${HOST}:5432/postgres`;

console.log('🔐 Deploying migrations to staging environment');
console.log('📍 Project:', PROJECT_ID);
console.log('📍 Host:', HOST);
console.log('📍 Database: postgres');
console.log('');

const migrations = [
  {
    name: '20260205170000_fix_organization_memberships_rls_policy.sql',
    file: 'supabase/migrations/20260205170000_fix_organization_memberships_rls_policy.sql',
    description: 'Create app_auth.is_admin() function'
  },
  {
    name: '20260205180000_fix_organization_member_visibility.sql',
    file: 'supabase/migrations/20260205180000_fix_organization_member_visibility.sql',
    description: 'Fix member visibility RLS policy'
  }
];

const client = new Client({
  connectionString: connectionString,
  ssl: { rejectUnauthorized: false }
});

async function deploy() {
  try {
    console.log('⏳ Connecting to staging database...');
    await client.connect();
    console.log('✅ Connected successfully\n');

    console.log('🚀 Deploying migrations:\n');

    let deployed = 0;
    let failed = 0;

    for (const migration of migrations) {
      console.log(`⏳ ${migration.name}`);
      console.log(`   Description: ${migration.description}`);

      try {
        const filePath = path.join(__dirname, migration.file);
        const sql = fs.readFileSync(filePath, 'utf-8');

        // Split SQL by semicolon and execute non-empty statements
        const statements = sql
          .split(';')
          .map(s => s.trim())
          .filter(s => s.length > 0 && !s.startsWith('--'));

        console.log(`   Executing ${statements.length} statement(s)...`);

        for (const statement of statements) {
          if (statement.trim()) {
            await client.query(statement);
          }
        }

        console.log(`✅ ${migration.name} - Success\n`);
        deployed++;
      } catch (err) {
        console.error(`❌ ${migration.name} - Error:`);
        console.error(`   ${err.message}\n`);
        failed++;
      }
    }

    console.log('');
    console.log('═'.repeat(70));
    if (failed === 0) {
      console.log(`✨ SUCCESS: All ${deployed} migrations deployed successfully!`);
    } else {
      console.log(`⚠️  PARTIAL: ${deployed} deployed, ${failed} failed`);
    }
    console.log('═'.repeat(70));
    console.log('');

    if (deployed > 0) {
      console.log('🎉 Next steps:');
      console.log('');
      console.log('1. Refresh your staging app:');
      console.log('   https://localhost:5175/organizations');
      console.log('');
      console.log('2. Verify the fixes:');
      console.log('   ✓ Testing Software: Should show 1 member + owner name');
      console.log('   ✓ Sixty Seconds: Should show 3 members + owner name');
      console.log('   ✓ Other orgs: Should show correct member counts');
      console.log('');
      console.log('3. If issues persist:');
      console.log('   - Check browser console for errors');
      console.log('   - Verify RLS policies in Supabase Dashboard');
      console.log('');
    } else {
      process.exit(1);
    }

  } catch (error) {
    console.error('❌ Connection error:', error.message);
    console.error('');
    console.error('Troubleshooting:');
    console.error('1. Verify .env.staging exists and has SUPABASE_DATABASE_PASSWORD');
    console.error('2. Check network connectivity to Supabase');
    console.error('3. Alternatively, deploy via Supabase Dashboard SQL Editor:');
    console.error('   https://app.supabase.com/projects/caerqjzvuerejfrdtygb/sql/new');
    console.error('');
    process.exit(1);
  } finally {
    await client.end();
    console.log('✅ Database connection closed');
  }
}

deploy();
