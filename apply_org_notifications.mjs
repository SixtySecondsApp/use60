import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Staging credentials
const supabaseUrl = 'https://caerqjzvuerejfrdtygb.supabase.co';
const supabaseServiceRoleKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNhZXJxanp2dWVyZWpmcmR0eWdiIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2Nzk0OTIyNywiZXhwIjoyMDgzNTI1MjI3fQ.vZn5nVNIllQBoRgf9_gFTKwrFoakOUJ8VNJ4nnHUnko';

const supabase = createClient(supabaseUrl, supabaseServiceRoleKey);

async function applyMigrations() {
  console.log('🚀 Applying org-notifications migrations to staging...\n');

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
      console.log(`\n📄 Applying ${migrationFile}...`);

      const sql = readFileSync(
        join(__dirname, 'supabase', 'migrations', migrationFile),
        'utf-8'
      );

      const { data, error } = await supabase.rpc('exec_sql', { sql });

      if (error) {
        console.error(`❌ Error applying ${migrationFile}:`, error.message);

        // Check if it's a safe error (already exists)
        if (
          error.message.includes('already exists') ||
          error.message.includes('duplicate key') ||
          error.message.includes('does not exist')
        ) {
          console.log(`⚠️  Skipping (already applied or safe to ignore)`);
          continue;
        }

        throw error;
      }

      console.log(`✅ Applied ${migrationFile} successfully`);
    } catch (error) {
      console.error(`\n❌ Failed to apply ${migrationFile}:`, error.message);
      console.error('Stopping migration process.\n');
      process.exit(1);
    }
  }

  console.log('\n🎉 All org-notifications migrations applied successfully!\n');
}

applyMigrations().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
