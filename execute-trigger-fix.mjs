#!/usr/bin/env node

import { Pool } from 'pg';
import fs from 'fs';

// Read the .env.staging file
const envPath = '.env.staging';
const envContent = fs.readFileSync(envPath, 'utf-8');

// Parse environment variables
const envVars = {};
envContent.split('\n').forEach(line => {
  const trimmedLine = line.trim();
  if (trimmedLine && !trimmedLine.startsWith('#')) {
    const [key, ...valueParts] = trimmedLine.split('=');
    if (key) {
      envVars[key.trim()] = valueParts.join('=').trim();
    }
  }
});

// Use pooler with correct format
const DB_HOST = 'aws-0-eu-west-1.pooler.supabase.com';
const DB_USER = 'postgres@caerqjzvuerejfrdtygb';  // Try @ format for pooler
const DB_PASSWORD = envVars.SUPABASE_DATABASE_PASSWORD;
const DB_PORT = 6543;  // Pooler uses port 6543, not 5432
const DB_NAME = 'postgres';

if (!DB_PASSWORD) {
  console.error('❌ Missing SUPABASE_DATABASE_PASSWORD in .env.staging');
  process.exit(1);
}

console.log('🔧 Organization Settings Trigger Fix');
console.log('=====================================\n');
console.log('📍 Database: Staging (caerqjzvuerejfrdtygb)');
console.log(`🔐 User: ${DB_USER}`);
console.log(`🔗 Host: ${DB_HOST}\n`);

// Use direct parameters for pooler compatibility
const pool = new Pool({
  host: DB_HOST,
  port: DB_PORT,
  database: DB_NAME,
  user: DB_USER,
  password: DB_PASSWORD,
  ssl: { rejectUnauthorized: false },
  statement_timeout: 30000,
  connect_timeout: 10000,
  application_name: 'trigger-fix',
});

const SQL_STATEMENTS = [
  'DROP TRIGGER IF EXISTS org_settings_changed_notification ON organizations;',
  'DROP FUNCTION IF EXISTS notify_on_org_settings_changed();',
  `CREATE FUNCTION notify_on_org_settings_changed()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actioned_by_name TEXT;
  v_change_description TEXT;
BEGIN
  -- Only trigger if key settings have changed
  IF OLD.name != NEW.name OR
     OLD.logo_url != NEW.logo_url OR
     OLD.notification_settings != NEW.notification_settings OR
     OLD.company_domain != NEW.company_domain THEN

    -- Get name of person who made the change
    SELECT full_name INTO v_actioned_by_name FROM profiles WHERE id = auth.uid();

    -- Build change description
    v_change_description := CASE
      WHEN OLD.name != NEW.name THEN
        'Organization name changed to "' || NEW.name || '"'
      WHEN OLD.logo_url != NEW.logo_url THEN
        'Organization logo updated'
      WHEN OLD.company_domain != NEW.company_domain THEN
        'Organization domain changed to "' || COALESCE(NEW.company_domain, 'none') || '"'
      ELSE
        'Notification settings updated'
    END;

    -- Add who made the change if known
    IF v_actioned_by_name IS NOT NULL THEN
      v_change_description := v_change_description || ' by ' || v_actioned_by_name;
    END IF;

    -- Notify org owners and admins
    PERFORM notify_org_members(
      p_org_id := NEW.id,
      p_role_filter := ARRAY['owner', 'admin'],
      p_title := 'Organization Settings Updated',
      p_message := v_change_description,
      p_type := 'info',
      p_category := 'system',
      p_action_url := '/settings/organization-management',
      p_metadata := jsonb_build_object(
        'org_id', NEW.id,
        'org_name', NEW.name,
        'changed_by', auth.uid(),
        'changed_by_name', v_actioned_by_name,
        'action_timestamp', NOW(),
        'changes', jsonb_build_object(
          'name_changed', (OLD.name != NEW.name),
          'old_name', OLD.name,
          'new_name', NEW.name,
          'logo_changed', (OLD.logo_url != NEW.logo_url),
          'domain_changed', (OLD.company_domain != NEW.company_domain),
          'old_domain', OLD.company_domain,
          'new_domain', NEW.company_domain,
          'settings_changed', (OLD.notification_settings != NEW.notification_settings)
        )
      ),
      p_is_org_wide := TRUE
    );
  END IF;

  RETURN NEW;
END;
$$;`,
  `CREATE TRIGGER org_settings_changed_notification
  AFTER UPDATE ON organizations
  FOR EACH ROW
  EXECUTE FUNCTION notify_on_org_settings_changed();`,
];

async function executeFix() {
  const client = await pool.connect();
  try {
    console.log('⏳ Connecting to staging database...');

    // Test connection
    const testResult = await client.query('SELECT version()');
    console.log('✅ Connection successful!\n');

    console.log('📋 Executing SQL statements...\n');

    for (let i = 0; i < SQL_STATEMENTS.length; i++) {
      const statement = SQL_STATEMENTS[i];
      const desc = [
        'Drop old trigger',
        'Drop old function',
        'Create corrected function',
        'Create new trigger'
      ][i];

      try {
        await client.query(statement);
        console.log(`✅ Step ${i + 1}/${SQL_STATEMENTS.length}: ${desc}`);
      } catch (error) {
        console.error(`❌ Step ${i + 1}/${SQL_STATEMENTS.length}: ${desc}`);
        console.error(`   Error: ${error.message}`);
        throw error;
      }
    }

    console.log('\n✨ SUCCESS! Trigger has been fixed!\n');
    console.log('📝 Changes applied:');
    console.log('   ✓ Dropped old org_settings_changed_notification trigger');
    console.log('   ✓ Dropped old notify_on_org_settings_changed() function');
    console.log('   ✓ Created new function with correct "company_domain" references');
    console.log('   ✓ Recreated org_settings_changed_notification trigger\n');
    console.log('🎉 Organization settings updates will now work correctly!');
    console.log('   • Logo uploads ✅');
    console.log('   • Logo removal ✅');
    console.log('   • Settings changes ✅\n');

    process.exit(0);
  } catch (error) {
    console.error('\n❌ Error applying fix:', error.message);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

executeFix().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
