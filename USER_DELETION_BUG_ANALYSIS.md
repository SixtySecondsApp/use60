# User Deletion Bug Analysis Report

## Issue Summary
Users deleted from the admin user management dashboard cannot sign up again with the same email address. They receive a "User already registered" error (Supabase auth error 422), indicating the auth record still exists in `auth.users` table even though the profile was deleted.

## Root Cause Analysis

### The Problem
The user deletion flow is **incomplete and creates orphaned auth records**:

1. **Admin deletes user** → Calls `deleteUser()` hook in admin UI
2. **Edge function called** → `delete-user` edge function processes request
3. **Profile is anonymized** → Email changed to `deleted_{userId}@deleted.local`
4. **Auth user IS deleted** → Edge function calls `supabaseAdmin.auth.admin.deleteUser(userId)`
5. **BUT: Deletion requires proper Supabase Admin API permission** ❌

### The Real Issue
Looking at the code flow:

**File**: `/src/lib/hooks/useUsers.ts` (lines 299-374)
- Calls edge function `delete-user`
- Has fallback that only anonymizes profile if edge function fails
- **The fallback does NOT delete from auth.users** (line 350-360)

**File**: `/supabase/functions/delete-user/index.ts` (lines 113-119)
- Calls `supabaseAdmin.auth.admin.deleteUser(userId)`
- Has try-catch that silently logs errors
- **Error handling is too permissive** - catches exceptions and continues

### Why Users Can't Sign Up Again

In `/src/pages/auth/signup.tsx` (lines 148-151):
```typescript
if (error.message.toLowerCase().includes('already registered') ||
    error.message.toLowerCase().includes('already exists') ||
    error.message.toLowerCase().includes('user already') ||
    error.message.toLowerCase().includes('user_already_exists'))
```

When signup attempts to create an auth user with an email that was previously deleted, Supabase auth checks the `auth.users` table and finds the orphaned record → Error 422 "User already registered".

## Current Code State

### What Gets Deleted

✅ **Deleted:**
- Profile record (anonymized with fake email)
- Internal user record (set `is_active = false`)
- Auth user (supposedly via admin API)

❌ **NOT Deleted:**
- Auth user when edge function fails (fallback only anonymizes profile)
- If admin API deletion has permission issues, the error is silently logged

### Code Locations

**Admin deletion UI** (616-631):
```typescript
<AlertDialog>
  <AlertDialogTrigger asChild>
    <button className="p-2 hover:bg-red-500/20 rounded-lg transition-colors">
      <Trash2 className="w-4 h-4 text-red-500" />
    </button>
  </AlertDialogTrigger>
  <AlertDialogContent>
    {/* Dialog content */}
  </AlertDialogContent>
</AlertDialog>
```

Calls: `deleteUser(user.id)` → `/src/lib/hooks/useUsers.ts:deleteUser()`

**Hook - Primary deletion** (`useUsers.ts:299-328`):
```typescript
try {
  const { data, error } = await supabase.functions.invoke('delete-user', {
    body: { userId: targetUserId }
  });

  if (error) throw error;
  if (data?.error) throw new Error(data.error);

  toast.success('User deleted successfully');
  await fetchUsers();
  return;
} catch (edgeFunctionError: any) {
  // Falls back to direct anonymization (doesn't delete auth)
}
```

**Fallback - Only anonymizes** (`useUsers.ts:338-368`):
```typescript
const { error: deleteError } = await supabase
  .from('profiles')
  .update({
    email: `deleted_${targetUserId}@deleted.local`,
    avatar_url: null,
    bio: null,
    clerk_user_id: null,
    auth_provider: 'deleted',
    updated_at: new Date().toISOString()
  })
  .eq('id', targetUserId);
```

**Edge function** (`delete-user/index.ts:113-119`):
```typescript
try {
  await supabaseAdmin.auth.admin.deleteUser(userId)
} catch (authError: any) {
  // Silently logs and continues!
  console.log('Note: Could not delete auth user (may not exist):', authError.message)
}
```

## The Specific Issues

### Issue 1: Silent Failures in Edge Function
Lines 114-119 of `delete-user/index.ts`:
- Catches auth deletion errors
- Only logs a message
- Returns success anyway
- **If auth deletion fails for any reason, it's ignored**

### Issue 2: Fallback Doesn't Delete Auth
Lines 329-368 of `useUsers.ts`:
- Fallback is triggered when edge function fails
- Only anonymizes the profile
- **Never attempts to delete from `auth.users`**
- Client doesn't have permission to call `auth.admin.deleteUser()`

### Issue 3: No Verification
- No check to confirm auth user was actually deleted
- No error surfacing if auth deletion fails
- Admin gets success message even if auth record persists

## Proof of Issue

1. Admin deletes User A (email: alice@company.com)
2. Edge function fails (or auth deletion fails silently)
3. Fallback anonymizes profile: email → `deleted_{uuid}@deleted.local`
4. But `auth.users` table still has: `alice@company.com` with active credentials
5. When Alice tries to sign up with alice@company.com:
   - Frontend calls `signUp()`
   - Supabase auth rejects: "User already registered" (error 422)
   - User stuck, can't create new account with same email

## Fix Strategy

There are two approaches:

### Approach 1: Improve Edge Function Error Handling (RECOMMENDED)
1. Remove silent try-catch from auth deletion
2. Check deletion response for errors
3. Return clear error if auth deletion fails
4. Frontend can then decide: retry or fallback

### Approach 2: Add Explicit Validation
1. After deletion, query auth users via admin API
2. Verify user is actually gone
3. If still exists, retry or fail loudly

### Approach 3: Implement Soft Delete
1. Instead of hard delete, mark user as `deleted = true`
2. Keep auth record but disable login
3. Block signup with deleted emails by checking profile table first

## Affected Scenarios

This bug occurs when:
- Edge function fails to deploy or isn't reachable
- Edge function deployment has no service role key env vars
- Supabase service role has insufficient permissions
- Network error occurs during auth deletion
- Auth deletion times out

## Severity

**HIGH** - Users cannot create new accounts after admin deletion, blocking their access entirely. The error message is confusing since the user is not trying to login with an existing account.

## Validation

To verify the bug:
1. Admin deletes a user via admin panel → Success message appears
2. User tries to sign up with same email → "User already registered" error
3. User cannot proceed with signup
4. Profile record is gone but auth record exists

## Files Involved

1. `/supabase/functions/delete-user/index.ts` - Edge function with silent failures
2. `/src/lib/hooks/useUsers.ts` - Hook with incomplete fallback
3. `/src/pages/admin/Users.tsx` - Admin UI that calls deletion
4. `/src/pages/auth/signup.tsx` - Signup flow that detects "already registered" error
5. `/supabase/migrations/00000000000000_baseline.sql` - Schema definition

## Related Tables

- `auth.users` - Supabase auth system table (deleted or not deleted)
- `public.profiles` - App profiles table (anonymized)
- `public.internal_users` - Internal user tracking (deactivated)
- `public.targets` - User targets (cascades with deletion?)

## Next Steps

1. Test if cascade delete works on targets/activities when profile is deleted
2. Implement proper error handling in edge function
3. Add validation to confirm auth deletion succeeded
4. Consider implementing soft-delete pattern instead
5. Add logging/alerting for failed user deletions
