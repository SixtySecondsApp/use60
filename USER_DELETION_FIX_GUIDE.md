# User Deletion Bug - Fix Implementation Guide

## Overview
This guide provides step-by-step instructions to fix the user deletion bug where deleted users cannot sign up again because their auth records weren't properly deleted.

## Root Cause
The `delete-user` edge function silently catches and ignores auth deletion errors, so when it fails, the auth record persists while the profile is anonymized. The fallback in the hook doesn't attempt auth deletion at all.

## Fix Implementation

### Option A: Improve Edge Function Error Handling (RECOMMENDED - LEAST DISRUPTIVE)

This approach makes the edge function properly report failures instead of silently ignoring them.

#### Step 1: Update Edge Function to Validate Auth Deletion

**File**: `/supabase/functions/delete-user/index.ts`

Replace lines 113-119:

```typescript
// OLD CODE (Silent failure):
try {
  await supabaseAdmin.auth.admin.deleteUser(userId)
} catch (authError: any) {
  // It's okay if auth user doesn't exist - profile might have been created without auth
  console.log('Note: Could not delete auth user (may not exist):', authError.message)
}
```

With:

```typescript
// NEW CODE (Validate deletion and report errors):
let authDeleteSuccessful = false;
try {
  await supabaseAdmin.auth.admin.deleteUser(userId);
  authDeleteSuccessful = true;
} catch (authError: any) {
  // Check if error is "user not found" (expected, no-op) vs real error
  const isNotFoundError = authError.message?.includes('not found') ||
                          authError.message?.includes('does not exist') ||
                          authError.status === 404;

  if (isNotFoundError) {
    // User auth record doesn't exist - this is fine, profile might have been created without auth
    console.log('Note: Auth user not found (expected for non-Supabase users):', authError.message);
    authDeleteSuccessful = true;
  } else {
    // Real error - auth deletion failed
    console.error('CRITICAL: Failed to delete auth user:', authError.message);
    // DO NOT silently continue - throw error to prevent orphaned auth record
    throw new Error(`Auth deletion failed: ${authError.message}`);
  }
}

// Verify auth user is actually deleted if we tried to delete it
if (authDeleteSuccessful) {
  try {
    const { data: deletedUser, error: verifyError } = await supabaseAdmin.auth.admin.getUserById(userId);
    if (!verifyError && deletedUser) {
      // Auth user still exists - deletion failed silently
      throw new Error(`Auth user still exists after deletion attempt. User ID: ${userId}`);
    }
  } catch (verifyError: any) {
    // Expected: verification should fail if user is deleted
    if (!verifyError.message?.includes('not found')) {
      console.log('Auth user deleted successfully');
    }
  }
}
```

#### Step 2: Update Hook to Handle Edge Function Errors Better

**File**: `/src/lib/hooks/useUsers.ts`

Replace the try-catch block (lines 313-336):

```typescript
// OLD CODE:
try {
  const { data, error } = await supabase.functions.invoke('delete-user', {
    body: { userId: targetUserId }
  });

  if (error) {
    throw error;
  }

  if (data?.error) {
    throw new Error(data.error);
  }

  toast.success('User deleted successfully');
  await fetchUsers();
  return;
} catch (edgeFunctionError: any) {
  // If edge function fails, fallback to direct deletion
  logger.warn('Edge function deletion failed, attempting direct deletion:', edgeFunctionError);

  // Check if it's a permission/authorization error - don't fallback in that case
  if (edgeFunctionError?.status === 401 || edgeFunctionError?.status === 403) {
    throw new Error('Unauthorized: Admin access required to delete users');
  }

  // Continue to fallback...
}
```

With:

```typescript
try {
  const { data, error } = await supabase.functions.invoke('delete-user', {
    body: { userId: targetUserId }
  });

  if (error) {
    logger.error('Edge function invocation error:', error);
    throw error;
  }

  if (data?.error) {
    logger.error('Edge function returned error:', data.error);
    throw new Error(data.error);
  }

  if (!data?.success) {
    throw new Error(data?.message || 'Delete operation did not complete successfully');
  }

  toast.success('User deleted successfully');
  logger.log('User deleted successfully:', data.userId);
  await fetchUsers();
  return;
} catch (edgeFunctionError: any) {
  // If edge function fails, fallback to direct deletion
  logger.warn('Edge function deletion failed, attempting direct deletion:', edgeFunctionError);

  // Check if it's a permission/authorization error - don't fallback in that case
  if (edgeFunctionError?.status === 401 || edgeFunctionError?.status === 403) {
    const errorMsg = 'Unauthorized: Admin access required to delete users. Please ensure edge function has proper permissions.';
    logger.error(errorMsg);
    throw new Error(errorMsg);
  }

  // Fallback: Anonymize the profile (WARNING: Does NOT delete auth records)
  logger.warn('WARNING: Falling back to profile anonymization only. Auth record may persist.');
  const targetUser = users.find(u => u.id === targetUserId);
  if (targetUser?.email) {
    // Deactivate in internal_users if exists
    await supabase
      .from('internal_users')
      .update({ is_active: false, updated_at: new Date().toISOString() })
      .eq('email', targetUser.email.toLowerCase());
  }

  // Anonymize profile: clear personal data but keep name for audit trail
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

  if (deleteError) {
    throw deleteError;
  }

  // WARNING: User will not be able to sign up with their original email!
  toast.success('User profile anonymized (edge function unavailable). Contact support if email reuse needed.');
  logger.warn('User profile anonymized due to edge function failure. Email reuse will be blocked until edge function is restored.');
  await fetchUsers();
}
```

#### Step 3: Add Better Error Messaging to Admin UI

**File**: `/src/pages/admin/Users.tsx`

Update the AlertDialog to show warnings about fallback behavior (lines 613-631):

```typescript
<AlertDialogContent className="bg-gray-900/95 backdrop-blur-xl border border-gray-800/50">
  <AlertDialogHeader>
    <AlertDialogTitle>Delete User</AlertDialogTitle>
    <AlertDialogDescription>
      Are you sure you want to delete {user.first_name} {user.last_name}?
      <br /><br />
      This action:
      <ul className="mt-2 ml-4 space-y-1 text-sm list-disc">
        <li>Anonymizes their profile data</li>
        <li>Removes them from internal user list</li>
        <li>Deletes their Supabase auth credentials</li>
        <li>Allows them to sign up again with the same email</li>
      </ul>
      <br />
      <strong>This action cannot be undone.</strong> All their activities and targets will also be deleted.
    </AlertDialogDescription>
  </AlertDialogHeader>
  <AlertDialogFooter>
    <AlertDialogCancel className="bg-gray-800/50 text-gray-300 hover:bg-gray-800">Cancel</AlertDialogCancel>
    <AlertDialogAction
      onClick={() => deleteUser(user.id)}
      className="bg-red-500 hover:bg-red-600"
    >
      Delete
    </AlertDialogAction>
  </AlertDialogFooter>
</AlertDialogContent>
```

### Option B: Implement Soft Delete Pattern (ALTERNATIVE - MORE ROBUST)

If you want a safer approach that doesn't rely on edge function success:

#### Step 1: Add `deleted_at` Column to Profiles

```sql
ALTER TABLE public.profiles
ADD COLUMN deleted_at timestamp with time zone;

CREATE INDEX idx_profiles_deleted_at ON public.profiles(deleted_at);
```

#### Step 2: Update Delete Logic to Soft Delete

Instead of anonymizing and deleting auth, just set `deleted_at`:

```typescript
const { error } = await supabase
  .from('profiles')
  .update({
    deleted_at: new Date().toISOString(),
    email: `deleted_${targetUserId}@deleted.local`
  })
  .eq('id', targetUserId);
```

#### Step 3: Update Signup to Check for Soft-Deleted Users

In `/src/pages/auth/signup.tsx`, before creating auth user:

```typescript
// Check if user was previously deleted
const { data: existingProfile } = await supabase
  .from('profiles')
  .select('deleted_at')
  .eq('email', formData.email.toLowerCase())
  .maybeSingle();

if (existingProfile?.deleted_at) {
  // User was deleted - allow re-signup by hard-deleting the profile
  await supabase
    .from('profiles')
    .delete()
    .eq('email', formData.email.toLowerCase());
}
```

## Testing the Fix

### Test Case 1: Normal Deletion Flow

1. Create user "Alice" with email alice@example.com
2. Delete user from admin panel
3. Verify success message appears
4. Try to sign up with alice@example.com
5. **Expected**: Signup succeeds without "already registered" error

### Test Case 2: Edge Function Failure Handling

1. Temporarily disable edge function by renaming it
2. Try to delete a user
3. **Expected**: Clear error message about fallback behavior
4. Check toast shows warning about email reuse

### Test Case 3: Auth Deletion Validation

1. Delete user
2. Check Supabase auth users dashboard
3. **Expected**: User no longer appears in auth.users list

### Test Case 4: Data Integrity

1. Delete user with active data (tasks, activities, etc.)
2. **Expected**: Profile anonymized, related data handled by cascade rules
3. Verify no orphaned data remains

## Verification Checklist

After implementing fix:

- [ ] Edge function returns clear error if auth deletion fails
- [ ] Hook catches edge function errors properly
- [ ] Fallback behavior is logged with warnings
- [ ] Admin toast shows appropriate message
- [ ] Deleted users can sign up again
- [ ] No "User already registered" errors for deleted accounts
- [ ] Auth records are actually deleted (check Supabase dashboard)
- [ ] Profile records are anonymized or deleted
- [ ] Internal user tracking is updated
- [ ] Test with both Supabase and Clerk auth providers

## Rollback Plan

If the fix causes issues:

1. Revert edge function to previous version
2. Revert hook to previous version
3. Clear local cache in browser (localStorage/sessionStorage)
4. Contact Supabase support if auth deletion still fails

## Monitoring

Add to logging/monitoring:

```typescript
// Alert on failed user deletions
if (deletionFailed) {
  captureException(error, {
    tags: {
      function: 'delete-user',
      severity: 'high',
      impact: 'user-cannot-signup'
    }
  });
}
```

## Related Issues to Check

1. Verify cascade delete rules for:
   - activities
   - deals (if owner_id = user.id)
   - calendar_events
   - tasks

2. Check if deleted_at affects RLS policies

3. Verify soft delete doesn't break foreign key constraints
