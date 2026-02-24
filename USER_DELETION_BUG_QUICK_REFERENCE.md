# User Deletion Bug - Quick Reference

## The Issue in One Sentence
Deleted users still have auth records so they can't sign up again - getting "User already registered" error.

## Why It Happens

```
Admin deletes user
        ↓
deleteUser() hook calls edge function
        ↓
Edge function catches auth deletion errors silently
        ↓
Fallback anonymizes profile only (doesn't touch auth)
        ↓
auth.users record still exists
        ↓
Signup attempts fail: "User already registered"
```

## The Two Problems

### Problem 1: Edge Function Silently Fails
**File**: `/supabase/functions/delete-user/index.ts` (lines 113-119)

```typescript
try {
  await supabaseAdmin.auth.admin.deleteUser(userId)
} catch (authError: any) {
  console.log('Note: Could not delete auth user...') // Silently logged!
}
```

**Issue**: If auth deletion fails for ANY reason (permissions, network, timeout), it's ignored and function returns success.

### Problem 2: Hook Fallback Incomplete
**File**: `/src/lib/hooks/useUsers.ts` (lines 329-368)

```typescript
// Fallback only anonymizes - NEVER deletes auth!
const { error: deleteError } = await supabase
  .from('profiles')
  .update({
    email: `deleted_${targetUserId}@deleted.local`,
    // ... other anonymizations
  })
```

**Issue**: When edge function fails, fallback can't delete auth (client doesn't have permission), only anonymizes profile.

## What Gets Deleted

| Item | Deleted? | How |
|------|----------|-----|
| Profile record | ✅ Anonymized | Email → `deleted_{uuid}@deleted.local` |
| Internal user | ✅ Deactivated | `is_active = false` |
| Auth user | ❌ **NOT ALWAYS** | Edge function silently fails |

## The Data State After Bug

After deletion:
- `profiles` table: Email is fake, name intact
- `internal_users` table: Deactivated
- **`auth.users` table: EMAIL STILL EXISTS!** 👈 The Problem

When user tries signup:
1. Frontend calls `signUp(email, password)`
2. Supabase checks `auth.users` for existing email
3. Finds the orphaned record
4. Returns error 422: "User already registered"
5. User stuck, can't proceed

## Where the Error Occurs

**File**: `/src/pages/auth/signup.tsx` (lines 148-151)

```typescript
if (error.message.toLowerCase().includes('already registered') ||
    error.message.toLowerCase().includes('already exists') ||
    error.message.toLowerCase().includes('user already') ||
    error.message.toLowerCase().includes('user_already_exists')) {
  // Shows: "An account with {email} already exists"
}
```

This error message is correct - the account DOES exist in auth.users! The bug is that it shouldn't.

## The Fix (Short Version)

### Option A: Better Error Handling (Recommended)

1. **Edge function**: Stop silently catching auth deletion errors
2. **Edge function**: Verify auth user is actually deleted
3. **Hook**: Better error messages to admin when fallback happens
4. **Admin UI**: Clear warning if fallback behavior used

Changes:
- `/supabase/functions/delete-user/index.ts` - Add validation
- `/src/lib/hooks/useUsers.ts` - Better error messaging
- `/src/pages/admin/Users.tsx` - Update dialog warning

### Option B: Soft Delete (More Robust)

1. Add `deleted_at` column to profiles
2. Set `deleted_at` instead of hard delete
3. Check for soft-deleted users in signup
4. Hard-delete on re-signup

Changes:
- Migration: Add column and index
- `/src/lib/hooks/useUsers.ts` - Soft delete
- `/src/pages/auth/signup.tsx` - Pre-signup check

## Root Cause Summary

| Layer | Component | Issue |
|-------|-----------|-------|
| **Supabase** | Edge function | Catches auth deletion errors silently |
| **Frontend** | Hook | Fallback doesn't attempt auth deletion |
| **Auth** | Signup flow | Correctly rejects duplicate auth emails |

The auth system is working correctly. The edge function is failing silently, and the fallback is incomplete.

## Testing

### Quick Test
1. Admin deletes user with email `test@example.com`
2. Try signup with `test@example.com`
3. **Bug**: "User already registered" error
4. **Fixed**: Signup succeeds

### Verification
1. Delete user in admin panel
2. Check Supabase dashboard auth.users - should be gone
3. If still there, bug exists

## Impact

- **Severity**: HIGH
- **Users affected**: Anyone deleted from admin panel who tries to sign up again
- **Data loss**: No, but access blocked
- **Scope**: All users, all orgs, ongoing issue

## Timeline

1. User created with email `alice@example.com`
2. Admin deletes user via dashboard
3. **Now**: Edge function fails (silently) or succeeds but doesn't verify
4. **Later**: Alice tries to sign up → Blocked with "already registered"
5. Alice stuck, must contact support or use different email

## Prevention

Once fixed:
- Edge function validates auth deletion
- Hook shows clear warnings if fallback used
- Signup checks both profiles and auth.users
- Monitoring alerts on failed deletions

## Questions to Answer

1. **Why doesn't the edge function verify deletion?**
   - Probably oversight, relying on exception not being thrown

2. **Why doesn't the fallback delete auth?**
   - Client doesn't have admin API permissions

3. **Why is error silently caught?**
   - Assumes auth.users might not exist for some users
   - But doesn't distinguish between "not found" and "permission denied"

4. **Why hasn't this been caught before?**
   - Edge function might work correctly in most cases
   - Only fails when: permissions not set, function not deployed, network issues
   - Could be environment-specific

## Architecture Issue

The deletion architecture has a gap:

```
Client (no auth delete permission)
    ↓ calls
Edge Function (has permission via service role)
    ↓ catches errors
    ↓ silently ignores failures
    ↓ returns "success"
Fallback (can't help, no permission either)
    ↓ only anonymizes
    ↓ can't reach auth system

Result: Orphaned auth record persists
```

Better architecture:

```
Edge Function (has permission)
    ↓ validates deletion
    ↓ throws error if it fails
    ↓ returns clear status
Client/Hook
    ↓ shows error to admin
    ↓ doesn't claim success

Result: Admin knows deletion failed, can retry or contact support
```

## Files to Review

1. `/supabase/functions/delete-user/index.ts` - Main issue here
2. `/src/lib/hooks/useUsers.ts` - Fallback incomplete
3. `/src/pages/admin/Users.tsx` - UI calls deletion
4. `/src/pages/auth/signup.tsx` - Where error surfaces

## Recommended Action

**Implement Option A** (better error handling):
- Least disruptive
- Fixes root cause (silent failures)
- Improves admin experience
- Can deploy immediately
- ~30 minutes to implement and test
