# 🚨 IMMEDIATE ACTION REQUIRED

## Error Still Present in Staging Database

**Error**: `record "old" has no field "domain"` (PostgreSQL code 42703)
**Location**: Trigger `notify_on_org_settings_changed()`
**Database**: Staging (`caerqjzvuerejfrdtygb`)
**Status**: ⏳ Waiting for manual SQL execution

---

## Root Cause

The trigger function was created with incorrect column reference:
- **❌ Wrong**: `OLD.domain` (column doesn't exist)
- **✅ Correct**: `OLD.company_domain` (actual column name)

This breaks whenever you try to update organization settings (logo, name, domain, etc.)

---

## Quick Fix (3 minutes)

### Step 1: Open Supabase Dashboard
Go to: https://app.supabase.com/projects

### Step 2: Select Staging Project
Click on: `caerqjzvuerejfrdtygb` (Staging)

### Step 3: Open SQL Editor
Click: **SQL Editor** (left sidebar)
Click: **New Query**

### Step 4: Copy the SQL Fix
Copy the entire SQL from: `fix-org-settings-trigger.sql`

Or use this SQL directly:

```sql
DROP TRIGGER IF EXISTS org_settings_changed_notification ON organizations;
DROP FUNCTION IF EXISTS notify_on_org_settings_changed();

CREATE FUNCTION notify_on_org_settings_changed()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actioned_by_name TEXT;
  v_change_description TEXT;
BEGIN
  IF OLD.name != NEW.name OR
     OLD.logo_url != NEW.logo_url OR
     OLD.notification_settings != NEW.notification_settings OR
     OLD.company_domain != NEW.company_domain THEN

    SELECT full_name INTO v_actioned_by_name FROM profiles WHERE id = auth.uid();

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

    IF v_actioned_by_name IS NOT NULL THEN
      v_change_description := v_change_description || ' by ' || v_actioned_by_name;
    END IF;

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
$$;

CREATE TRIGGER org_settings_changed_notification
  AFTER UPDATE ON organizations
  FOR EACH ROW
  EXECUTE FUNCTION notify_on_org_settings_changed();
```

### Step 5: Execute
Paste the SQL above into the SQL Editor and click **Run** (or press `Cmd+Enter` / `Ctrl+Enter`)

### Step 6: Verify
You should see: "Query succeeded"

---

## What This Fixes

Once executed, the following will work:
- ✅ Organization logo uploads
- ✅ Organization logo removal
- ✅ Organization name changes
- ✅ Any organization settings updates

---

## Why This Happened

1. A redundant migration file (`combined_org_notifications.sql`) was created
2. Because it had no number prefix, it ran alphabetically AFTER all numbered migrations
3. It overrode the correct trigger function from `20260205000006_org_settings_notifications.sql`
4. The redundant file had the correct code, but it wasn't being applied to the database

### What We Fixed in Code

✅ Deleted the redundant `combined_org_notifications.sql`
✅ Created numbered migration `20260206000000_fix_org_settings_trigger.sql`
✅ Verified correct migration in repository

### What Still Needs Fixing

⏳ **Apply the SQL in Supabase Dashboard** (this document)

---

## Files Available

- `fix-org-settings-trigger.sql` - The SQL to run in Supabase Dashboard
- `FIX_TRIGGER_GUIDE.md` - Detailed guide
- `TRIGGER_FIX_APPLIED.md` - Status documentation
- `20260206000000_fix_org_settings_trigger.sql` - The migration file

---

## After Running the SQL

Test in staging:
1. Go to Organization Settings
2. Try uploading an organization logo
3. Try removing the logo
4. Update organization name/domain

All should work without errors!

---

**Time to fix**: ~3 minutes
**Difficulty**: Very Easy (just copy & paste SQL)
**Impact**: Fixes all organization settings updates
