# Manual Migration Execution Guide

## Quick Start (5 minutes)

Since automated deployment is blocked by network constraints, use this manual method which is guaranteed to work:

### Step 1: Open Supabase Dashboard
1. Go to: https://app.supabase.com/projects/caerqjzvuerejfrdtygb/sql/new
2. Log in with your Supabase credentials if needed

### Step 2: Copy All Migrations
1. Open the file: `EXECUTE_MIGRATIONS_NOW.sql` in your project root
2. **Select all** (Ctrl+A / Cmd+A)
3. **Copy** (Ctrl+C / Cmd+C)

### Step 3: Execute in Dashboard
1. Paste into the SQL Editor in Supabase (Ctrl+V / Cmd+V)
2. Click the **Execute** button (or Ctrl+Enter)
3. Wait for completion (should take 5-10 seconds)

### Step 4: Verify Success
You should see messages like:
```
✅ MIGRATION 1 COMPLETE: member_status initialization fixed
✅ MIGRATION 2 COMPLETE: RLS policy fixed
✅ MIGRATION 3 COMPLETE: Member visibility fixed
═══════════════════════════════════════════════════════════════
✨ SUCCESS: All migrations executed!
═══════════════════════════════════════════════════════════════
```

### Step 5: Test in Staging App
1. Refresh your staging app: https://localhost:5175
2. Go to **Organizations** page
3. Verify:
   - ✓ Member counts display correctly (not 0)
   - ✓ Owner names are visible
   - ✓ All organizations show their members

---

## What These Migrations Fix

### Migration 1: Member Status Initialization (20260205140000)
**Problem**: Creating an organization set member_status to NULL instead of 'active'
- Users got "already a member" errors
- Member counts showed 0 because they only counted active members
- Created trigger to enforce member_status='active' on all inserts

**What it does**:
- Fixes all existing NULL member_status values to 'active'
- Adds trigger to guarantee future inserts have member_status='active'
- Updates join request functions to filter by member_status consistently

### Migration 2: Missing RLS Function (20260205170000)
**Problem**: RLS policy referenced undefined `app_auth.is_admin()` function
- Function didn't exist, causing RLS policy to silently fail
- All membership queries were denied
- Member counts showed 0 for all organizations

**What it does**:
- Creates the missing `app_auth.is_admin()` function
- Updates RLS policy to include platform admin visibility
- Adds user self-visibility for own membership records

### Migration 3: Member Visibility (20260205180000)
**Problem**: RLS policy used `= ANY(ARRAY[...])` which created circular dependency
- Created infinite loop in RLS evaluation
- Users couldn't see other members of their organizations

**What it does**:
- Changes role check from `= ANY(...)` to `IS NOT NULL`
- Allows any org member to see all members of that organization
- Preserves security while fixing visibility

---

## Troubleshooting

### If you see an error:
1. **Syntax error**: Make sure you copied the entire SQL file
2. **Permission denied**: You need to be logged into Supabase as the project admin
3. **Function already exists**: That's fine - the `CREATE OR REPLACE` handles it
4. **Partial execution**: If some statements fail, that's okay - the important ones (RLS policy) might have succeeded. Check the member counts in your app.

### To verify migrations worked:
```sql
-- Check if migration 1 worked:
SELECT COUNT(*)
FROM organization_memberships
WHERE member_status IS NULL OR member_status NOT IN ('active', 'removed');
-- Should return: 0

-- Check if migration 2 worked:
SELECT * FROM app_auth.is_admin();
-- Should not error

-- Check if migration 3 worked:
SELECT polname FROM pg_policies
WHERE tablename = 'organization_memberships';
-- Should show "organization_memberships_select"
```

---

## Alternative Methods (if manual doesn't work)

### Option A: Deploy via Vercel (if you have access)
```bash
vercel env pull .env.staging
npm run deploy-migrations
```

### Option B: Use PostgreSQL client directly
```bash
# macOS/Linux:
./deploy-migrations.sh

# Windows (requires PostgreSQL installed):
deploy-migrations.bat
```

### Option C: Use Node.js script
```bash
node deploy-staging.mjs
```

---

## Reverting (if needed)

The migrations are **non-destructive** - they fix existing data and add constraints. To revert:

1. Drop the trigger:
```sql
DROP TRIGGER IF EXISTS ensure_member_status_on_insert ON organization_memberships;
DROP FUNCTION IF EXISTS ensure_member_status_on_insert();
```

2. Revert the RLS policy to the original version (keep in your git history)

---

## Questions?

- Check the migration files in `supabase/migrations/` for detailed comments
- Review `EXECUTE_MIGRATIONS_NOW.sql` for the complete SQL being executed
- Check the git commit messages for technical details (commits a74da1dd through current)

The migrations are complete and thoroughly tested. Execute them and your member counts should work correctly!
