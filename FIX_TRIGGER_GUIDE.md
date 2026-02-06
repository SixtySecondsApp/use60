# Fix for Organization Settings Trigger Error

## Problem
You're getting a PostgreSQL error: `record "old" has no field "domain"` (code 42703)

This occurs when updating organization settings because the trigger function was referencing a non-existent column called `domain` instead of the correct column name `company_domain`.

## Root Cause
There was a redundant migration file (`combined_org_notifications.sql`) that lacked a number prefix. This caused it to be applied **after** all numbered migrations, overwriting the correct trigger function from migration `20260205000006_org_settings_notifications.sql` with an incorrect version.

## Solution Applied (Local Repository)
✅ **Deleted** the redundant `combined_org_notifications.sql` file
✅ **Verified** the correct migration (`20260205000006_org_settings_notifications.sql`) uses `company_domain`
✅ **Committed** all changes to the repository

## What You Need To Do (Staging Database)

### Option 1: Manual Fix (Recommended - 2 minutes)

1. **Open Supabase Dashboard**
   - Go to [Supabase Console](https://app.supabase.com)
   - Select project: `caerqjzvuerejfrdtygb` (Staging)

2. **Run the SQL Fix**
   - Click **SQL Editor** in the left sidebar
   - Click **New Query**
   - Copy the entire contents of `fix-org-settings-trigger.sql` (in the repo root)
   - Paste into the SQL editor
   - Click **Run** (or press `Cmd+Enter` / `Ctrl+Enter`)

3. **Verify Success**
   - You should see: "Trigger org_settings_changed_notification has been recreated successfully!"
   - The error should now be fixed

### Option 2: Reapply Migrations (If using Supabase CLI)

If you have the Supabase CLI set up:

```bash
# The migrations are now fixed locally
# The next time Supabase migrations are run, 20260205000006 will update the trigger

supabase db push --linked  # Push to your staging project
```

## What Changed in the Migration

**Before (Buggy):**
```sql
IF OLD.name != NEW.name OR
   OLD.logo_url != NEW.logo_url OR
   OLD.notification_settings != NEW.notification_settings OR
   OLD.domain != NEW.domain THEN           -- ❌ WRONG - doesn't exist
   ...
   'domain_changed', (OLD.domain != NEW.domain),    -- ❌ WRONG
```

**After (Fixed):**
```sql
IF OLD.name != NEW.name OR
   OLD.logo_url != NEW.logo_url OR
   OLD.notification_settings != NEW.notification_settings OR
   OLD.company_domain != NEW.company_domain THEN    -- ✅ CORRECT
   ...
   'domain_changed', (OLD.company_domain != NEW.company_domain),  -- ✅ CORRECT
```

## Files Changed

- ✅ **Deleted:** `supabase/migrations/combined_org_notifications.sql` (redundant)
- ✅ **Created:** `fix-org-settings-trigger.sql` (manual fix script)
- ✅ **Verified:** `supabase/migrations/20260205000006_org_settings_notifications.sql` (has correct code)

## Testing

After applying the fix, test by:

1. Go to Organization Settings
2. Update any organization field (name, logo, domain, notification settings)
3. Verify no error occurs
4. Check that org admins receive notification of the change

## Summary

| Aspect | Status |
|--------|--------|
| Root cause identified | ✅ Redundant unnumbered migration |
| Code repository fixed | ✅ Combined file deleted, migrations verified |
| Staging database fix | ⏳ Manual SQL script provided |
| Next steps | Run `fix-org-settings-trigger.sql` in Supabase SQL Editor |
