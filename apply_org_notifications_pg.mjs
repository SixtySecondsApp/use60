import pg from 'pg';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const { Client } = pg;
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Staging database connection
const connectionString = 'postgresql://postgres:Gi7JO1tz2NupAzHt@db.caerqjzvuerejfrdtygb.supabase.co:5432/postgres';

async function applyMigrations() {
  const client = new Client({
    connectionString,
    ssl: { rejectUnauthorized: false }
  });

  try {
    console.log('🔌 Connecting to staging database...\n');
    await client.connect();
    console.log('✅ Connected successfully!\n');

    const migrations = [
      '20260205000001_add_org_context_to_notifications.sql',
      '20260205000002_org_notification_rls.sql',
      '20260205000003_notify_org_members_function.sql',
      '20260205000004_member_management_notifications.sql',
      '20260205000005_deal_notifications.sql',
      '20260205000006_org_settings_notifications.sql',
      '20260205000008_weekly_digest.sql',
      '20260205000010_low_engagement_alerts.sql',
      '20260205000011_notification_batching.sql',
      '20260205000014_notification_queue.sql',
    ];

    for (const migrationFile of migrations) {
      try {
        console.log(`📄 Applying ${migrationFile}...`);

        const sql = readFileSync(
          join(__dirname, 'supabase', 'migrations', migrationFile),
          'utf-8'
        );

        await client.query(sql);
        console.log(`✅ Applied ${migrationFile} successfully\n`);
      } catch (error) {
        // Check if it's a safe error (already exists)
        if (
          error.message.includes('already exists') ||
          error.message.includes('duplicate key')
        ) {
          console.log(`⚠️  Skipping ${migrationFile} (already applied)\n`);
          continue;
        }

        console.error(`❌ Error applying ${migrationFile}:`, error.message);
        throw error;
      }
    }

    console.log('\n🎉 All org-notifications migrations applied successfully!\n');

    // Record migrations in schema_migrations table
    console.log('📝 Recording migrations in schema_migrations table...');
    for (const migrationFile of migrations) {
      const version = migrationFile.replace('.sql', '');
      try {
        await client.query(
          `INSERT INTO supabase_migrations.schema_migrations (version, statements, name)
           VALUES ($1, ARRAY['Applied via script'], $2)
           ON CONFLICT (version) DO NOTHING`,
          [version, migrationFile]
        );
      } catch (error) {
        console.log(`⚠️  Could not record migration ${version} (may not matter)`);
      }
    }

    console.log('✅ Migration recording complete\n');
  } catch (error) {
    console.error('\n❌ Fatal error:', error.message);
    process.exit(1);
  } finally {
    await client.end();
    console.log('🔌 Database connection closed');
  }
}

applyMigrations();
