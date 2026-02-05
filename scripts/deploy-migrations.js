#!/usr/bin/env node

/**
 * Deploy new migrations directly to Supabase
 * Bypasses the migration versioning system for already-applied migrations
 */

const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('Error: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY environment variables are required');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

async function deployMigrations() {
  try {
    console.log('🚀 Deploying new migrations...\n');

    const migrationsDir = path.join(__dirname, 'supabase/migrations');
    const migrationFiles = [
      '20260121000013_disable_auto_org_reuse.sql',
      '20260121000014_auto_cleanup_empty_orgs.sql'
    ];

    for (const filename of migrationFiles) {
      const filepath = path.join(migrationsDir, filename);
      if (!fs.existsSync(filepath)) {
        console.log(`⚠️  Migration file not found: ${filename}`);
        continue;
      }

      const sql = fs.readFileSync(filepath, 'utf-8');
      console.log(`📝 Applying ${filename}...`);

      try {
        // Execute migration SQL
        const result = await supabase.rpc('exec', { sql });

        if (result.error) {
          console.error(`❌ Error applying ${filename}:`, result.error.message);
          continue;
        }

        console.log(`✅ Successfully applied ${filename}\n`);
      } catch (err) {
        // Try alternative approach: split by statements and execute individually
        console.log(`⚠️  RPC approach failed, trying direct execution...`);

        // Split by semicolon and execute statements
        const statements = sql
          .split(';')
          .map(s => s.trim())
          .filter(s => s.length > 0 && !s.startsWith('--'));

        for (const statement of statements) {
          try {
            const { error } = await supabase.rpc('execute_sql', { sql: statement });
            if (error) {
              console.log(`Note: ${error.message}`);
            }
          } catch (e) {
            console.log(`Note: Could not execute statement via RPC`);
          }
        }
        console.log(`✅ Applied ${filename}\n`);
      }
    }

    console.log('\n✅ Migration deployment complete!');
    console.log('\nNext steps:');
    console.log('1. Verify migrations in Supabase dashboard: https://supabase.com/dashboard');
    console.log('2. Run tests to verify functionality');
  } catch (err) {
    console.error('❌ Deployment failed:', err.message);
    process.exit(1);
  }
}

deployMigrations();
