#!/usr/bin/env node

/**
 * Deploy Database Migrations to Staging
 *
 * Uses Supabase Management API to execute SQL migrations.
 * This is more reliable than direct database connections.
 */

import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import dotenv from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load staging environment
console.log('\n📋 Loading staging environment...');
const result = dotenv.config({ path: join(__dirname, '.env.staging') });
if (result.error) {
  console.error('❌ Error loading .env.staging:', result.error.message);
  process.exit(1);
}

// Get Supabase credentials
const projectId = process.env.SUPABASE_PROJECT_ID;
const accessToken = process.env.SUPABASE_ACCESS_TOKEN;
const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!projectId || !accessToken || !supabaseUrl || !serviceKey) {
  console.error('❌ Missing Supabase credentials in .env.staging');
  console.error('   SUPABASE_PROJECT_ID:', projectId ? '✓' : '✗');
  console.error('   SUPABASE_ACCESS_TOKEN:', accessToken ? '✓' : '✗');
  console.error('   SUPABASE_URL:', supabaseUrl ? '✓' : '✗');
  console.error('   SUPABASE_SERVICE_ROLE_KEY:', serviceKey ? '✓' : '✗');
  process.exit(1);
}

console.log('✅ Loaded staging credentials');
console.log('   Project ID:', projectId);
console.log('   API URL:', supabaseUrl);

// Migrations to deploy
const migrations = [
  {
    file: '20260205000004_member_management_notifications.sql',
    description: 'Member management notifications (full_name fix)',
    critical: true
  },
  {
    file: '20260205000005_deal_notifications.sql',
    description: 'Deal notifications (full_name fix)',
    critical: true
  },
  {
    file: '20260205000006_org_settings_notifications.sql',
    description: 'Org settings notifications (full_name fix)',
    critical: true
  },
  {
    file: '20260206000000_fix_org_settings_trigger.sql',
    description: 'Org settings trigger fix (domain + full_name fix)',
    critical: true
  }
];

/**
 * Execute SQL via Supabase Management API
 */
async function executeSQL(sql) {
  const url = `https://api.supabase.com/v1/projects/${projectId}/database/query`;

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ query: sql })
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`HTTP ${response.status}: ${error}`);
  }

  return await response.json();
}

/**
 * Execute a SQL migration
 */
async function executeMigration(migration) {
  const { file, description } = migration;
  const filePath = join(__dirname, 'supabase', 'migrations', file);

  console.log(`\n🔄 Deploying: ${description}`);
  console.log(`   File: ${file}`);

  try {
    // Read migration file
    const sql = readFileSync(filePath, 'utf-8');
    console.log(`   Size: ${sql.length} bytes`);

    // Execute SQL
    const result = await executeSQL(sql);

    console.log('   ✅ Migration deployed successfully');
    return { success: true, result };

  } catch (error) {
    console.error(`   ❌ Migration failed:`, error.message);
    return { success: false, error: error.message };
  }
}

/**
 * Verify trigger exists and has correct code
 */
async function verifyTrigger() {
  console.log('\n🔍 Verifying trigger deployment...');

  try {
    const result = await executeSQL(`
      SELECT proname, prosrc
      FROM pg_proc
      WHERE proname = 'notify_on_org_settings_changed';
    `);

    if (!result || result.length === 0) {
      console.error('   ❌ Trigger function not found in database');
      return false;
    }

    const trigger = result[0];
    const hasCompanyDomain = trigger.prosrc.includes('company_domain');
    const hasFullNameFix = trigger.prosrc.includes('COALESCE(NULLIF(trim(first_name');

    console.log('   ✅ Trigger found:', trigger.proname);
    console.log('   ✅ Uses company_domain:', hasCompanyDomain ? 'YES' : 'NO');
    console.log('   ✅ Has full_name fix:', hasFullNameFix ? 'YES' : 'NO');

    return hasCompanyDomain && hasFullNameFix;

  } catch (error) {
    console.error('   ❌ Could not verify trigger:', error.message);
    return false;
  }
}

/**
 * Main deployment function
 */
async function main() {
  console.log('\n═══════════════════════════════════════════════════════════');
  console.log('  STAGING DATABASE MIGRATION DEPLOYMENT');
  console.log('═══════════════════════════════════════════════════════════\n');

  const results = [];

  // Deploy each migration
  for (const migration of migrations) {
    const result = await executeMigration(migration);
    results.push({ ...migration, ...result });

    // Stop on critical failure
    if (!result.success && migration.critical) {
      console.error('\n❌ Critical migration failed. Stopping deployment.');
      break;
    }
  }

  // Summary
  console.log('\n═══════════════════════════════════════════════════════════');
  console.log('  DEPLOYMENT SUMMARY');
  console.log('═══════════════════════════════════════════════════════════\n');

  const successful = results.filter(r => r.success).length;
  const failed = results.filter(r => !r.success).length;

  console.log(`✅ Successful: ${successful}/${migrations.length}`);
  console.log(`❌ Failed: ${failed}/${migrations.length}\n`);

  results.forEach(r => {
    const icon = r.success ? '✅' : '❌';
    console.log(`${icon} ${r.description}`);
  });

  // Verify trigger if all succeeded
  if (failed === 0) {
    await verifyTrigger();
  }

  console.log('\n═══════════════════════════════════════════════════════════\n');

  if (failed > 0) {
    console.error('⚠️  Some migrations failed. Please review errors above.');
    process.exit(1);
  } else {
    console.log('🎉 All migrations deployed successfully!\n');
    console.log('Next steps:');
    console.log('  1. Test organization deactivation in staging');
    console.log('  2. Verify no "domain" or "full_name" errors');
    console.log('  3. Check notifications have correct user names\n');
  }
}

// Run deployment
main().catch(error => {
  console.error('\n❌ Deployment failed:', error);
  process.exit(1);
});
