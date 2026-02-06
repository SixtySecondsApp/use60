# User Deletion Fix - Test Plan

## Quick Test Summary

**What to Test:** User deletion now properly removes auth records and prevents re-registration with same email before deletion.

**Expected Result:** Deleted users cannot login or re-register until email is reused (which is the intended behavior).

---

## Pre-Test Setup

```bash
# Get latest code with fix
git pull origin fix/go-live-bug-fixes

# Deploy edge function
npx supabase functions deploy delete-user --project-ref [staging-id]

# Or deploy all functions
npm run deploy-functions:staging
```

---

## Test Case 1: Basic User Deletion ✅

**Objective:** Verify user can be deleted and auth access is revoked.

**Steps:**
1. Login as admin to User Management page
2. Create a test user: `testuser@example.com` (or use existing)
3. Note the email
4. Click delete button → confirm → wait for success toast
5. **Expected:** Toast: "User deleted successfully and access revoked"

**Verification:**
- [ ] User no longer appears in users list
- [ ] Email can now be used for NEW signup
- [ ] Old user cannot login with that email

**Test Command:**
```bash
# After deletion, try to login with deleted email
# Should fail with "Invalid login credentials"
```

---

## Test Case 2: Deleted User Can Re-Register 🔄

**Objective:** Verify deleted users can register fresh with their old email.

**Steps:**
1. Delete test user (from Test Case 1)
2. Go to signup page
3. Register new account with same email: `testuser@example.com`
4. **Expected:** Signup succeeds (no "already registered" error)

**Verification:**
- [ ] Signup form accepts the email
- [ ] New account created successfully
- [ ] New password can be set
- [ ] Can login with new credentials

---

## Test Case 3: Confirmation Dialog Shows Details 📋

**Objective:** Verify UI properly warns about what deletion does.

**Steps:**
1. Open Users Admin page
2. Click delete button on any user
3. **Expected:** Dialog shows detailed warning

**Verification:**
- [ ] Title says "Permanently Delete User" (in red)
- [ ] Shows user name and email
- [ ] Warning box lists what will be deleted:
  - "Permanently remove the user's authentication access"
  - "Allow this email to be used for a new account signup"
  - "Delete all user data from the system"
  - "Remove associated activities, tasks, and targets"
- [ ] Button says "Yes, Delete User" (clear intent)
- [ ] Warning says "cannot be undone"

---

## Test Case 4: Multiple Deletions in Sequence ⚡

**Objective:** Verify deletion works consistently.

**Steps:**
1. Create 3 test users: `test1@ex.com`, `test2@ex.com`, `test3@ex.com`
2. Delete first user → verify success
3. Delete second user → verify success
4. Delete third user → verify success
5. Try to register with all 3 emails → all should succeed

**Verification:**
- [ ] All deletions show success toast
- [ ] All emails become available for new signup
- [ ] No duplicate key errors

---

## Test Case 5: Error Handling (Simulated)

**Objective:** Verify proper error messages if deletion fails.

**Note:** To test this, you'd need to intentionally break something:
- Edit edge function to fail auth deletion
- Or disable auth service temporarily

**Expected Behavior:**
- [ ] Error toast shows: "Failed to revoke user access: [error]"
- [ ] User is NOT anonymized (safe failure)
- [ ] Can retry deletion
- [ ] User still exists in system

---

## Test Case 6: Browser Console Check ✓

**Objective:** Verify no console errors during deletion.

**Steps:**
1. Open DevTools → Console
2. Clear console
3. Perform deletion
4. **Expected:** No errors in console

**Verification:**
- [ ] No error logs
- [ ] No auth warnings
- [ ] No network errors
- [ ] Clean success message only

---

## Test Case 7: Different Admin Users 👥

**Objective:** Verify deletion works for different admin accounts.

**Steps:**
1. Create test user
2. Logout and login as DIFFERENT admin account
3. Try to delete the test user
4. **Expected:** Deletion works for any admin

**Verification:**
- [ ] Admin A can delete users
- [ ] Admin B can delete users
- [ ] Both see success message

---

## Test Case 8: Cannot Delete Self 🚫

**Objective:** Verify self-deletion is prevented.

**Steps:**
1. Try to delete your own admin account
2. **Expected:** Error toast: "You cannot delete your own account"

**Verification:**
- [ ] Deletion is prevented
- [ ] User remains in list
- [ ] No partial deletion

---

## Success Criteria

✅ All tests pass if:
- Users can be deleted without errors
- Deleted users cannot re-login
- Deleted user emails can be reused for new signups
- UI clearly explains what deletion does
- No console errors
- Error messages are clear and actionable
- Multiple deletions work consistently
- Self-deletion is prevented

❌ Fix needs more work if:
- "User already registered" error after deletion
- Auth deletion errors are silently ignored
- UI doesn't explain consequences
- Console shows auth errors
- Deletion partially completes

---

## Regression Testing

After deploying, check that normal operations still work:

- [ ] Creating new users works
- [ ] Updating user details works
- [ ] Changing admin status works
- [ ] Setting internal user status works
- [ ] Editing targets works
- [ ] Sending password reset works
- [ ] Impersonating users works

---

## Deployment Steps

```bash
# 1. Get the code
git checkout fix/go-live-bug-fixes
git pull

# 2. Deploy to staging first
npx supabase functions deploy delete-user --project-ref [staging-id]

# 3. Run tests above in staging

# 4. If all pass, deploy to production
npx supabase functions deploy delete-user --project-ref [production-id]

# 5. Final sanity check in production
# - Create test user
# - Delete test user
# - Verify email reusable
# - Verify no errors
```

---

## Rollback Plan

If issues arise:

```bash
# Revert the commit
git revert 8d2377fe

# Redeploy old version
npx supabase functions deploy delete-user --project-ref [env-id]

# Verify old behavior is back
```

---

## Questions / Issues

| Issue | Resolution |
|-------|------------|
| "User already registered" error after deletion | Edge function not deployed - redeploy with `verify_jwt=false` in config.toml |
| Auth deletion silently fails | Check Supabase logs - may be permission issue |
| Deletion hangs | Check network - might be API timeout |
| Console errors | Check browser DevTools for exact error - report to support |

---

## Sign-Off

- [ ] All test cases passed
- [ ] No regressions found
- [ ] Ready for production deployment
- [ ] Tested by: ___________
- [ ] Date: ___________

