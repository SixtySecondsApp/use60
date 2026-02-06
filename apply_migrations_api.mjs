import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const projectRef = 'caerqjzvuerejfrdtygb';
const accessToken = 'sbp_8e5eef8735fc3f15ed2544a5ad9508a902f2565f';

async function executeSql(sql) {
  const response = await fetch(
    `https://api.supabase.com/v1/projects/${projectRef}/database/query`,
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ query: sql }),
    }
  );

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`API error: ${response.status} - ${error}`);
  }

  return await response.json();
}

async function applyMigrations() {
  console.log('🚀 Applying org-notifications migrations via Supabase API...\n');

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

      await executeSql(sql);
      console.log(`✅ Applied ${migrationFile} successfully\n`);
    } catch (error) {
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
}

applyMigrations().catch(error => {
  console.error('\n❌ Fatal error:', error.message);
  process.exit(1);
});
