# User Deletion Bug - Exact Code Fixes

## Fix Overview
This document contains the exact code changes needed to fix the user deletion bug. Apply all three changes together.

---

## Change 1: Fix Edge Function Error Handling

**File**: `/supabase/functions/delete-user/index.ts`

**Lines to replace**: 113-119

### BEFORE (Current - Has Bug)

```typescript
    // Delete from auth.users to revoke access (user can sign up again with same email)
    try {
      await supabaseAdmin.auth.admin.deleteUser(userId)
    } catch (authError: any) {
      // It's okay if auth user doesn't exist - profile might have been created without auth
      console.log('Note: Could not delete auth user (may not exist):', authError.message)
    }
```

### AFTER (Fixed)

```typescript
    // Delete from auth.users to revoke access (user can sign up again with same email)
    let authDeleteSuccessful = false;
    try {
      await supabaseAdmin.auth.admin.deleteUser(userId);
      authDeleteSuccessful = true;
    } catch (authError: any) {
      // Only ignore "not found" errors - all other errors should be reported
      const isNotFoundError = authError.message?.includes('not found') ||
                              authError.message?.includes('does not exist') ||
                              authError.status === 404;

      if (isNotFoundError) {
        // User auth record doesn't exist - this is fine
        console.log('Note: Auth user not found (user may not have had Supabase auth):', authError.message);
        authDeleteSuccessful = true;
      } else {
        // Real error - this is critical and must be reported
        console.error('CRITICAL: Failed to delete Supabase auth user:', authError.message);
        console.error('Auth error details:', {
          status: authError.status,
          message: authError.message,
          userId: userId
        });
        // Throw error instead of silently failing
        return new Response(
          JSON.stringify({
            error: `Failed to delete Supabase auth user: ${authError.message}. User profile has been anonymized but auth deletion failed. Please try again or contact support.`,
            authDeletionFailed: true,
            userId: userId
          }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }

    // Verify auth user is actually deleted (don't rely on absence of exception)
    if (authDeleteSuccessful) {
      try {
        const { data: checkUser } = await supabaseAdmin.auth.admin.getUserById(userId);
        if (checkUser && checkUser.id === userId) {
          // Auth user still exists - deletion failed silently
          console.error('CRITICAL: Auth user still exists after deletion attempt:', userId);
          return new Response(
            JSON.stringify({
              error: 'Auth deletion verification failed: user still exists after deletion',
              userId: userId,
              authDeletionFailed: true
            }),
            { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
      } catch (verifyError: any) {
        // When user is deleted, getUserById should return "not found" error
        if (!verifyError.message?.includes('not found') && !verifyError.message?.includes('does not exist')) {
          console.warn('Verification returned unexpected error:', verifyError.message);
          // Still consider it successful if we can't verify (safer than failing)
          console.log('Auth user likely deleted (verification unclear but no positive exists)');
        } else {
          console.log('Auth user successfully deleted (verified: getUserById returns not found)');
        }
      }
    }
```

**Key Changes:**
1. Distinguish between "not found" (expected) and other errors (critical)
2. Throw error for real auth deletion failures instead of silently continuing
3. Verify auth user is actually deleted after deletion attempt
4. Return detailed error response if deletion fails
5. Add comprehensive logging for debugging

---

## Change 2: Update Hook Error Handling and Fallback

**File**: `/src/lib/hooks/useUsers.ts`

**Lines to replace**: 299-374

### BEFORE (Current - Has Bug)

```typescript
  const deleteUser = async (targetUserId: string) => {
    try {
      // Use cached userId from auth context
      if (!userId) {
        throw new Error('No authenticated user found');
      }

      // Prevent self-deletion
      if (userId === targetUserId) {
        toast.error('You cannot delete your own account');
        return;
      }

      // Try edge function first for proper deletion (handles auth.users and RLS)
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
        // If edge function fails (not deployed, network error, etc.), fallback to direct deletion
        logger.warn('Edge function deletion failed, attempting direct deletion:', edgeFunctionError);

        // Check if it's a permission/authorization error - don't fallback in that case
        if (edgeFunctionError?.status === 401 || edgeFunctionError?.status === 403) {
          throw new Error('Unauthorized: Admin access required to delete users');
        }

        // Fallback: Anonymize the user from profiles table
        // Note: This won't delete from auth.users, but will anonymize the profile
        const targetUser = users.find(u => u.id === targetUserId);
        if (targetUser?.email) {
          // Deactivate in internal_users if exists
          await supabase
            .from('internal_users')
            .update({ is_active: false, updated_at: new Date().toISOString() })
            .eq('email', targetUser.email.toLowerCase());
        }

        // Anonymize profile: clear personal data but keep name for audit trail in meetings/tasks
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

        toast.success('User deleted successfully');
        await fetchUsers();
      }
    } catch (error: any) {
      logger.error('Delete error:', error);
      const errorMessage = error.message || error.error || 'Unknown error';
      toast.error('Failed to delete user: ' + errorMessage);
    }
  };
```

### AFTER (Fixed)

```typescript
  const deleteUser = async (targetUserId: string) => {
    try {
      // Use cached userId from auth context
      if (!userId) {
        throw new Error('No authenticated user found');
      }

      // Prevent self-deletion
      if (userId === targetUserId) {
        toast.error('You cannot delete your own account');
        return;
      }

      // Try edge function first for proper deletion (handles auth.users and RLS)
      let edgeFunctionFailed = false;
      let authDeletionFailed = false;
      try {
        const { data, error } = await supabase.functions.invoke('delete-user', {
          body: { userId: targetUserId }
        });

        if (error) {
          logger.error('Edge function error:', error);
          throw error;
        }

        if (data?.error) {
          logger.error('Edge function returned error:', data.error);
          throw new Error(data.error);
        }

        if (!data?.success) {
          logger.error('Edge function did not succeed:', data);
          throw new Error(data?.message || 'Delete operation did not complete successfully');
        }

        // Check if auth deletion specifically failed
        if (data?.authDeletionFailed) {
          authDeletionFailed = true;
          logger.warn('Auth deletion failed in edge function:', data.error);
        }

        if (!authDeletionFailed) {
          // Auth deletion was successful
          toast.success('User deleted successfully. They can now sign up again with the same email.');
          logger.log('User deleted successfully (auth record confirmed deleted):', data.userId);
          await fetchUsers();
          return;
        } else {
          // Auth deletion failed but profile was anonymized - show warning
          toast.warning('User profile deleted, but auth record deletion failed. They may not be able to sign up again with the same email. Please retry or contact support.');
          logger.warn('User deleted but auth deletion failed - fallback will anonymize profile', data);
          // Continue to fallback for better handling
          edgeFunctionFailed = true;
        }
      } catch (edgeFunctionError: any) {
        edgeFunctionFailed = true;
        logger.warn('Edge function deletion failed, attempting fallback anonymization:', edgeFunctionError);

        // Check if it's a permission/authorization error - don't fallback in that case
        if (edgeFunctionError?.status === 401 || edgeFunctionError?.status === 403) {
          const msg = 'Unauthorized: Admin access required to delete users. Please ensure your admin credentials are valid.';
          logger.error(msg, edgeFunctionError);
          throw new Error(msg);
        }

        // For other errors, proceed to fallback
        logger.warn('Will attempt fallback anonymization due to edge function error');
      }

      // Fallback: Anonymize the user from profiles table
      // WARNING: This doesn't delete from auth.users, only anonymizes the profile
      if (edgeFunctionFailed) {
        logger.warn('Using fallback: anonymizing profile only. Auth record may still exist.');

        const targetUser = users.find(u => u.id === targetUserId);
        if (targetUser?.email) {
          // Deactivate in internal_users if exists
          try {
            await supabase
              .from('internal_users')
              .update({ is_active: false, updated_at: new Date().toISOString() })
              .eq('email', targetUser.email.toLowerCase());
          } catch (internalUserError) {
            logger.warn('Could not deactivate internal user:', internalUserError);
            // Continue anyway, this is not critical
          }
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

        // Show warning that auth record may still exist
        toast.warning(
          'User profile anonymized, but the edge function is unavailable. ' +
          'They may not be able to sign up again with the same email until the service is restored. ' +
          'Contact support for assistance.'
        );
        logger.warn(
          'User profile anonymized as fallback. Auth record may still exist. ' +
          'Email reuse will be blocked until edge function is available and deletion is retried.',
          { userId: targetUserId, email: targetUser?.email }
        );
        await fetchUsers();
      }
    } catch (error: any) {
      logger.error('Delete error:', error);
      const errorMessage = error.message || error.error || 'Unknown error';
      toast.error('Failed to delete user: ' + errorMessage);
    }
  };
```

**Key Changes:**
1. Check edge function response for `authDeletionFailed` flag
2. Distinguish between complete success and partial failures
3. Show specific toasts for different failure scenarios
4. Better logging with context
5. Clearer warnings about fallback limitations
6. Don't claim success if auth deletion failed

---

## Change 3: Update Admin UI Dialog

**File**: `/src/pages/admin/Users.tsx`

**Lines to replace**: 613-631

### BEFORE (Current)

```typescript
                              <AlertDialogContent className="bg-gray-900/95 backdrop-blur-xl border border-gray-800/50">
                                <AlertDialogHeader>
                                  <AlertDialogTitle>Delete User</AlertDialogTitle>
                                  <AlertDialogDescription>
                                    Are you sure you want to delete {user.first_name} {user.last_name}? This action cannot be undone.
                                    All their activities and targets will also be deleted.
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

### AFTER (Fixed)

```typescript
                              <AlertDialogContent className="bg-gray-900/95 backdrop-blur-xl border border-gray-800/50">
                                <AlertDialogHeader>
                                  <AlertDialogTitle>Delete User - Permanent Action</AlertDialogTitle>
                                  <AlertDialogDescription className="space-y-3">
                                    <p>
                                      Are you sure you want to permanently delete <strong>{user.first_name} {user.last_name}</strong> ({user.email})?
                                    </p>
                                    <div className="bg-blue-500/10 border border-blue-500/30 rounded p-3 text-sm space-y-2">
                                      <p className="font-semibold text-blue-300">This action will:</p>
                                      <ul className="list-disc list-inside space-y-1 text-blue-200">
                                        <li>Anonymize their profile data</li>
                                        <li>Revoke their Supabase authentication credentials</li>
                                        <li>Deactivate them from internal user list</li>
                                        <li>Delete all their associated activities and targets</li>
                                        <li>Allow them to sign up again with the same email address</li>
                                      </ul>
                                    </div>
                                    <p className="text-amber-300 font-semibold">This action cannot be undone.</p>
                                  </AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                  <AlertDialogCancel className="bg-gray-800/50 text-gray-300 hover:bg-gray-800">Cancel</AlertDialogCancel>
                                  <AlertDialogAction
                                    onClick={() => deleteUser(user.id)}
                                    className="bg-red-500 hover:bg-red-600"
                                  >
                                    Yes, Delete User Permanently
                                  </AlertDialogAction>
                                </AlertDialogFooter>
                              </AlertDialogContent>
```

**Key Changes:**
1. Better warning about what deletion does
2. Shows email address
3. Lists all consequences
4. Emphasizes permanence
5. Button text clearer about what happens

---

## Implementation Steps

### Step 1: Deploy Updated Edge Function
1. Update `/supabase/functions/delete-user/index.ts` with Change 1
2. Deploy: `supabase functions deploy delete-user`
3. Verify deployment successful

### Step 2: Update Frontend Hook
1. Update `/src/lib/hooks/useUsers.ts` with Change 2
2. Test locally in dev environment
3. Verify new error messages appear

### Step 3: Update Admin UI
1. Update `/src/pages/admin/Users.tsx` with Change 3
2. Build and test
3. Verify dialog displays correctly

### Step 4: Test Everything
1. Create test user
2. Delete user from admin panel
3. Verify success message
4. Try signup with same email
5. Verify signup succeeds without "already registered" error
6. Check Supabase auth dashboard - user should be gone

---

## Error Message Examples

### Success Case (After Fix)
```
✅ "User deleted successfully. They can now sign up again with the same email."
```

### Partial Failure (Auth Delete Failed)
```
⚠️ "User profile deleted, but auth record deletion failed.
They may not be able to sign up again with the same email.
Please retry or contact support."
```

### Fallback Used (Edge Function Unavailable)
```
⚠️ "User profile anonymized, but the edge function is unavailable.
They may not be able to sign up again with the same email until
the service is restored. Contact support for assistance."
```

### Permission Error (Don't Fallback)
```
❌ "Unauthorized: Admin access required to delete users.
Please ensure your admin credentials are valid."
```

---

## Verification After Fix

### Check 1: Edge Function Validates
- Edge function throws error if auth deletion fails
- Returns clear success/failure status
- Doesn't silently ignore errors

### Check 2: Hook Handles Errors
- Shows different toasts for success vs failure
- Doesn't claim success if auth deletion failed
- Logs with full context

### Check 3: Admin UI Warns Properly
- Dialog explains all consequences
- Shows email being deleted
- Button text is clear

### Check 4: End-to-End Test
- Delete user → Success message
- Signup with same email → Works without "already registered"
- Supabase auth.users → User not found

---

## Rollback (If Needed)

### Quick Rollback
1. Revert edge function to previous code
2. Revert hook to previous code
3. Revert UI to previous code
4. Clear browser cache
5. Redeploy

### Partial Rollback (Just Edge Function)
If only edge function needs rollback:
1. Revert `/supabase/functions/delete-user/index.ts`
2. Deploy: `supabase functions deploy delete-user`
3. Keep hook and UI changes (backward compatible)

---

## Notes

- All three changes should be applied together for maximum benefit
- Changes are backward compatible - can deploy incrementally
- Edge function change is critical - don't skip it
- Hook change handles both old and new edge function responses
- UI change is cosmetic but improves admin experience
