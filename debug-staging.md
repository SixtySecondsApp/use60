# Staging Database Debug Guide

## Check Migration Status

Go to Supabase Dashboard → SQL Editor and run:

```sql
-- 1. Check if member_status column exists
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'organization_memberships'
ORDER BY ordinal_position;
```

**Expected:** Should see `member_status` column of type `text`

---

```sql
-- 2. Check if RPC function exists
SELECT
  proname as function_name,
  prosecdef as "SECURITY DEFINER",
  proacl as acl
FROM pg_proc
WHERE proname = 'user_leave_organization'
AND pronamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public');
```

**Expected:** Should return one row showing the function exists

---

```sql
-- 3. Check RLS policies on organization_memberships
SELECT
  policyname,
  permissive,
  qual,
  with_check
FROM pg_policies
WHERE tablename = 'organization_memberships'
ORDER BY policyname;
```

**Expected:** Should include `users_can_leave_organization` policy

---

```sql
-- 4. Check what migrations are recorded as applied
SELECT version, executed_at
FROM supabase_migrations
WHERE version LIKE '202602041%'
ORDER BY version;
```

**Expected:** Should show versions 110000, 120000, and/or 130000

---

## If Migrations Are Missing

If the above queries show missing migrations, run this in SQL Editor:

```sql
-- Paste the entire contents of:
-- supabase/migrations/20260204130000_deploy_leave_organization_complete.sql
```

This single migration creates both the RPC function and RLS policy.

---

## If Migrations Exist But Leave Fails

Check user's RLS permissions:

```sql
-- Check if user can select their own memberships
SELECT *
FROM organization_memberships
WHERE user_id = auth.uid()
LIMIT 1;
```

If this fails or returns empty, there's an RLS issue.

---

## Verify Fix

After deploying migrations, test with this SQL:

```sql
-- Test the RPC function directly
SELECT user_leave_organization('YOUR-ORG-ID-HERE'::uuid)::jsonb as result;
```

Replace `YOUR-ORG-ID-HERE` with an actual org ID from the database.

Expected result: `{"success": true, ...}`
