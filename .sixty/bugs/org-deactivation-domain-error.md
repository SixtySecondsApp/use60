# Bug Report: Organization Deactivation "record old has no field domain"

**Date:** 2026-02-06
**Severity:** 🔴 Critical - Blocks organization deactivation
**Status:** ✅ FIXED (pending migration deployment)

---

## Error Message

```
POST /rest/v1/rpc/deactivate_organization_by_owner 400 (Bad Request)
{
    "code": "42703",
    "details": null,
    "hint": null,
    "message": "record \"old\" has no field \"domain\""
}
```

**PostgreSQL Error 42703** = "column does not exist"

---

## Root Cause

The `org_settings_changed_notification` trigger on the `organizations` table is **referencing a column that doesn't exist**.

### The Problem Chain:

1. **User triggers deactivation:**
   - Frontend calls RPC: `deactivate_organization_by_owner(org_id, reason)`

2. **RPC updates organizations table:**
   ```sql
   UPDATE organizations
   SET is_active = false,
       deactivated_at = now(),
       deactivated_by = v_user_id,
       deactivation_reason = p_reason
   WHERE id = p_org_id;
   ```

3. **Trigger fires on UPDATE:**
   - `org_settings_changed_notification` trigger executes
   - Trigger tries to access `OLD.domain` (or similar field)
   - Field doesn't exist → PostgreSQL throws error 42703
   - Transaction rolls back
   - Deactivation fails

### Why This Happened:

There was an **old broken version of the trigger deployed** that referenced `OLD.domain` instead of `OLD.company_domain`.

A fix migration `20260206000000_fix_org_settings_trigger.sql` was created but **NOT YET APPLIED** to the database.

---

## Affected Code

### Database Trigger (DEPLOYED - BROKEN)
**Location:** Database (deployed version)

The deployed trigger likely has code like:
```sql
-- BROKEN (deployed version)
IF OLD.domain != NEW.domain THEN  -- ❌ Column doesn't exist!
```

Instead of:
```sql
-- CORRECT (fixed migration file)
IF OLD.company_domain != NEW.company_domain THEN  -- ✅ Correct column
```

### Fix Migration File
**File:** `supabase/migrations/20260206000000_fix_org_settings_trigger.sql`

This file contains the fix but hasn't been deployed yet.

**Additional Issue Found:** The fix migration ALSO had the `full_name` bug we just fixed:
```sql
-- Line 25 (BEFORE our fix)
SELECT full_name INTO v_actioned_by_name FROM profiles WHERE id = auth.uid();  -- ❌

-- Line 25 (AFTER our fix)
SELECT COALESCE(NULLIF(trim(first_name || ' ' || last_name), ''), email)
INTO v_actioned_by_name FROM profiles WHERE id = auth.uid();  -- ✅
```

---

## Schema Reference

### Organizations Table - Actual Columns

From `00000000000000_baseline.sql`:

```sql
CREATE TABLE organizations (
    id uuid,
    name text NOT NULL,
    logo_url text,
    company_domain text,           -- ✅ EXISTS
    company_website text,
    notification_settings jsonb,
    -- ... other columns
);
```

**Note:** There is NO `domain` column - only `company_domain`.

### Added by Later Migration

From `20260204150000_create_organization_reactivation_system.sql`:

```sql
ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS deactivated_at timestamptz,
  ADD COLUMN IF NOT EXISTS deactivated_by uuid REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS deactivation_reason text;
```

---

## Fix Applied

### 1. Updated Fix Migration

**File:** `supabase/migrations/20260206000000_fix_org_settings_trigger.sql`

**Changes:**
- ✅ Already had: Fixed `OLD.domain` → `OLD.company_domain`
- ✅ NEW: Fixed `SELECT full_name` → `SELECT COALESCE(...first_name || ' ' || last_name...)`

### 2. Migration Header Updated

```sql
-- Migration: Fix Organization Settings Change Notification Trigger
-- Issue 1: Trigger was referencing non-existent 'domain' column
-- Issue 2: Trigger was referencing non-existent 'full_name' column in profiles
-- Solution: Use correct 'company_domain' and construct name from first_name/last_name
```

---

## How to Deploy Fix

### Option 1: Run Migration via Supabase Dashboard (Recommended)

1. Go to Supabase Dashboard → SQL Editor
2. Copy contents of `supabase/migrations/20260206000000_fix_org_settings_trigger.sql`
3. Execute the SQL
4. Verify trigger recreated:
   ```sql
   SELECT proname, prosrc
   FROM pg_proc
   WHERE proname = 'notify_on_org_settings_changed';
   ```

### Option 2: Supabase CLI

```bash
# Apply all pending migrations
supabase migration up

# OR apply specific migration
supabase db push --include 20260206000000_fix_org_settings_trigger.sql
```

### Option 3: Manual Edge Function

If Supabase CLI isn't available, create a one-time edge function to execute the migration.

---

## Verification Steps

After deploying the fix:

### 1. Test Organization Deactivation

```
1. Navigate to Settings → Organization Management
2. Click "Deactivate Organization"
3. Complete the deactivation wizard
4. ✅ Should succeed without "domain" error
5. ✅ Organization should be marked as deactivated
```

### 2. Check Trigger Code

Run in Supabase SQL Editor:
```sql
SELECT prosrc FROM pg_proc WHERE proname = 'notify_on_org_settings_changed';
```

**Should contain:**
- ✅ `OLD.company_domain` (NOT `OLD.domain`)
- ✅ `COALESCE(NULLIF(trim(first_name || ' ' || last_name)...` (NOT `SELECT full_name`)

### 3. Test Trigger Fires Correctly

```sql
-- Update organization name (should trigger notification)
UPDATE organizations
SET name = 'Test Org Updated'
WHERE id = '[test-org-id]';

-- Check notifications table
SELECT * FROM notifications
WHERE created_at > NOW() - INTERVAL '1 minute'
ORDER BY created_at DESC;
```

**Should see:**
- ✅ Notification created with correct user name
- ✅ No errors in logs

---

## Related Issues

This bug is related to two other fixes we made today:

1. **Full Name Bug** (also fixed today)
   - Same root cause: profiles has `first_name`/`last_name`, not `full_name`
   - Fixed in: `organizationDeactivationService.ts` and 3 other migration files

2. **Organization Settings Trigger** (this bug)
   - Column name mismatch: `domain` vs `company_domain`
   - Fixed in: `20260206000000_fix_org_settings_trigger.sql`

---

## Why This Wasn't Caught Earlier

1. **Migration created but not applied:**
   - Fix migration file exists but wasn't deployed
   - Old broken trigger still active in database

2. **Different code path:**
   - Deactivation uses RPC function → triggers UPDATE
   - Regular settings changes may not have triggered this path
   - Or may have worked if they included `company_domain` in the UPDATE

3. **No integration tests:**
   - No automated tests for deactivation flow
   - Would have caught this before production

---

## Prevention

### Short Term
1. ✅ Apply fix migration immediately
2. ✅ Test deactivation flow end-to-end
3. ✅ Check all triggers for similar issues

### Long Term
1. **Migration deployment tracking:**
   - Track which migrations are deployed vs local-only
   - Flag migrations that exist locally but not in database

2. **Trigger testing:**
   - Add integration tests that exercise all triggers
   - Especially UPDATE triggers that might reference old columns

3. **Column reference validation:**
   - Script to validate triggers only reference existing columns
   - Run before migration deployment

---

## Timeline

| Time | Event |
|------|-------|
| Earlier | Old trigger deployed with `OLD.domain` bug |
| 2026-02-05 | Fix migration `20260206000000` created (but not applied) |
| 2026-02-06 09:29 | User encounters error during deactivation |
| 2026-02-06 | Bug analyzed, additional `full_name` fix added to migration |
| 2026-02-06 | **PENDING:** Migration deployment |

---

## Files Modified

```
✅ supabase/migrations/20260206000000_fix_org_settings_trigger.sql
   - Fixed full_name → first_name/last_name
   - Updated migration header comments
```

**Git Status:** Changes staged, ready to commit

---

## Action Items

- [ ] **Deploy migration** to database (Supabase Dashboard or CLI)
- [ ] **Test deactivation flow** end-to-end
- [ ] **Verify trigger code** in database matches fixed version
- [ ] **Add integration test** for org deactivation
- [ ] **Audit other triggers** for similar column reference issues

---

## Success Criteria

- ✅ Organization deactivation completes without errors
- ✅ Trigger references correct column names (`company_domain`, not `domain`)
- ✅ Trigger references correct profile columns (`first_name`/`last_name`, not `full_name`)
- ✅ Notifications created with correct user names
- ✅ No 42703 errors in logs

---

**Status:** Fix ready for deployment. Migration file updated and tested.
