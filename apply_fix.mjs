#!/usr/bin/env node
/**
 * Apply database fixes for organization reactivation
 * Uses service role key to execute SQL migrations
 */

import pg from 'pg';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Staging database connection (from .env.staging)
// Using Session Mode pooler (port 5432) which supports DDL
const config = {
  host: 'aws-0-eu-west-1.pooler.supabase.com',
  port: 5432,
  database: 'postgres',
  user: 'postgres.caerqjzvuerejfrdtygb',
  password: 'Gi7JO1tz2NupAzHt',
  ssl: { rejectUnauthorized: false }
};

async function executeMigration(client, filePath, name) {
  console.log(`\n📝 Executing ${name}...`);

  const sql = readFileSync(filePath, 'utf8');

  try {
    await client.query(sql);
    console.log(`✅ ${name} applied successfully`);
    return true;
  } catch (error) {
    console.error(`❌ ${name} failed:`, error.message);
    return false;
  }
}

async function main() {
  console.log('🚀 Applying reactivation fixes to staging database...\n');

  const client = new pg.Client(config);

  try {
    console.log('🔌 Connecting to database...');
    await client.connect();
    console.log('✅ Connected\n');

    // Apply migrations in order
    const success1 = await executeMigration(
      client,
      join(__dirname, 'supabase/migrations/20260217230000_fix_reactivation_rls_policies.sql'),
      'Migration 1: Fix RLS Policies'
    );

    if (!success1) {
      console.error('\n❌ Migration 1 failed. Stopping.');
      process.exit(1);
    }

    const success2 = await executeMigration(
      client,
      join(__dirname, 'supabase/migrations/20260217230100_fix_reactivation_rpc_function.sql'),
      'Migration 2: Fix RPC Function'
    );

    if (!success2) {
      console.error('\n❌ Migration 2 failed');
      process.exit(1);
    }

    console.log('\n✅ All migrations applied successfully!');
    console.log('\n🎉 The reactivation buttons should now work correctly.');

  } catch (error) {
    console.error('\n❌ Error:', error.message);
    process.exit(1);
  } finally {
    await client.end();
  }
}

main();
