# User Deletion Bug - Visual Flows & Diagrams

## Current Flow (With Bug)

### Admin Deletes User - Current Broken Flow

```
ADMIN UI (Users.tsx)
    │
    ├─ User clicks Delete button
    │
    ├─ Dialog appears: "Are you sure?"
    │
    └─ User clicks "Delete"
            │
            ▼
    useUsers Hook (useUsers.ts:deleteUser)
            │
            ├─ Check: Admin permission? ✓
            │
            ├─ Check: Not self-delete? ✓
            │
            └─ Call: supabase.functions.invoke('delete-user')
                    │
                    ▼
        Edge Function (delete-user/index.ts)
                    │
                    ├─ Verify admin? ✓
                    │
                    ├─ Get profile info ✓
                    │
                    ├─ Update internal_users ✓
                    │
                    ├─ Anonymize profile ✓
                    │
                    └─ Delete auth user:
                            │
                            ├─ TRY
                            │   └─ supabaseAdmin.auth.admin.deleteUser(userId)
                            │
                            └─ CATCH authError (LINE 114)
                                    │
                                    ├─ ❌ PROBLEM: Silently logs error
                                    │
                                    ├─ ❌ PROBLEM: Doesn't verify deletion
                                    │
                                    └─ ❌ PROBLEM: Returns "success" anyway!
                                            │
                                            ▼
                                    Return HTTP 200 OK
                                    { success: true }
                    │
                    ▼
        Hook receives response
                    │
                    ├─ Check: error? ✗ (no error)
                    │
                    ├─ Check: data.error? ✗ (no error)
                    │
                    └─ Result: ASSUME SUCCESS ✓
                            │
                            ├─ Show: "User deleted successfully" ✓
                            │
                            └─ Refresh users list
                                    │
                                    ▼
                    ADMIN SEES: Success message
                                    │
                                    ├─ Profile: ANONYMIZED ✓
                                    ├─ Auth record: STILL EXISTS ✗
                                    └─ Internal user: DEACTIVATED ✓
```

### User Tries to Sign Up - Current Error

```
SIGNUP FORM (signup.tsx)
    │
    ├─ User enters: alice@example.com
    │
    ├─ User enters: password
    │
    └─ User clicks: Sign Up
            │
            ▼
    Auth Hook (signUp function)
            │
            ├─ Call: supabase.auth.signUpWithPassword
            │           ↓
            │   Supabase Auth Service
            │           │
            │           ├─ Check: Email in auth.users?
            │           │
            │           └─ YES! Found: alice@example.com
            │                   │
            │                   ├─ Status: user_already_exists
            │                   │
            │                   └─ Return Error 422:
            │                           "User already registered"
            │
            └─ Catch error in signup.tsx (line 148)
                    │
                    ├─ Check: "already registered"? ✓ YES
                    │
                    ├─ Show: "An account already exists"
                    │
                    └─ Offer: "Log in instead"
                            │
                            ▼
                    USER SEES: "Already registered" error
                    USER STATE: BLOCKED - Can't proceed
```

---

## Fixed Flow (Option A: Better Error Handling)

### Admin Deletes User - Fixed Flow

```
ADMIN UI (Users.tsx)
    │
    ├─ User clicks Delete button
    │
    ├─ Dialog appears (IMPROVED WARNING)
    │
    └─ User clicks "Delete"
            │
            ▼
    useUsers Hook (useUsers.ts:deleteUser) - IMPROVED
            │
            ├─ Check: Admin permission? ✓
            │
            ├─ Check: Not self-delete? ✓
            │
            ├─ Set: edgeFunctionFailed = false
            │
            └─ Call: supabase.functions.invoke('delete-user')
                    │
                    ▼
        Edge Function (delete-user/index.ts) - IMPROVED
                    │
                    ├─ Verify admin? ✓
                    │
                    ├─ Get profile info ✓
                    │
                    ├─ Update internal_users ✓
                    │
                    ├─ Anonymize profile ✓
                    │
                    ├─ Delete auth user:
                    │   │
                    │   ├─ TRY
                    │   │   └─ supabaseAdmin.auth.admin.deleteUser(userId)
                    │   │       ✓ SUCCESS
                    │   │
                    │   └─ CATCH authError
                    │       │
                    │       ├─ Is "not found" error? ✓
                    │       │   └─ Log: "Auth user not found (expected)"
                    │       │   └─ authDeleteSuccessful = true
                    │       │
                    │       └─ Is OTHER error? ✗
                    │           ├─ Log: "CRITICAL: Auth deletion failed"
                    │           └─ ✓ THROW ERROR (don't continue!)
                    │                   │
                    │                   ▼
                    │           Return HTTP 500
                    │           {
                    │             error: "Auth deletion failed",
                    │             authDeletionFailed: true
                    │           }
                    │
                    ├─ Verify deletion successful:
                    │   │
                    │   ├─ Call: getUserById(userId)
                    │   │
                    │   ├─ If user still exists?
                    │   │   └─ ✓ THROW ERROR: "Verification failed"
                    │   │
                    │   └─ If user not found?
                    │       └─ ✓ Log: "Successfully deleted"
                    │
                    └─ Return HTTP 200 OK
                            {
                              success: true,
                              message: "User deleted successfully"
                            }
                    │
                    ▼
        Hook receives response - IMPROVED
                    │
                    ├─ Check: error? ✗ (no error)
                    │
                    ├─ Check: data.success? ✓ YES
                    │
                    ├─ Check: authDeletionFailed? ✗ NO
                    │
                    └─ Result: FULL SUCCESS ✓
                            │
                            ├─ Show: "User deleted successfully.
                            │         They can now sign up again."
                            │
                            └─ Refresh users list
                                    │
                                    ▼
                    ADMIN SEES: Clear success message
                                    │
                                    ├─ Profile: ANONYMIZED ✓
                                    ├─ Auth record: DELETED ✓
                                    └─ Internal user: DEACTIVATED ✓
```

### User Tries to Sign Up - Fixed Success

```
SIGNUP FORM (signup.tsx)
    │
    ├─ User enters: alice@example.com
    │
    ├─ User enters: password
    │
    └─ User clicks: Sign Up
            │
            ▼
    Auth Hook (signUp function)
            │
            ├─ Call: supabase.auth.signUpWithPassword
            │           ↓
            │   Supabase Auth Service
            │           │
            │           ├─ Check: Email in auth.users?
            │           │
            │           └─ NO! (was properly deleted)
            │                   │
            │                   ├─ Create new user ✓
            │                   │
            │                   └─ Return Success:
            │                           "User created"
            │
            └─ Catch error? ✗ NO ERROR
                    │
                    ├─ Increment code usage
                    │
                    ├─ Auto-verify email (if available)
                    │
                    └─ Redirect to onboarding
                            │
                            ▼
                    USER SEES: Account created successfully
                    USER STATE: HAPPY - Can continue signup
```

---

## Data State Comparison

### Before Deletion

```
Database State:
┌─────────────────────┐
│ profiles table      │
├─────────────────────┤
│ id: 123abc          │
│ email: alice@...    │
│ name: Alice         │
│ is_admin: true      │
└─────────────────────┘

┌─────────────────────┐
│ auth.users table    │
├─────────────────────┤
│ id: 123abc          │
│ email: alice@...    │
│ active: true        │
└─────────────────────┘

┌──────────────────────┐
│ internal_users table │
├──────────────────────┤
│ email: alice@...     │
│ is_active: true      │
└──────────────────────┘
```

### After Deletion (Current - With Bug)

```
Database State (BROKEN):
┌─────────────────────┐
│ profiles table      │
├─────────────────────┤
│ id: 123abc          │
│ email: deleted_...  │  ✓ Anonymized
│ name: Alice         │
│ is_admin: false     │
└─────────────────────┘

┌─────────────────────┐
│ auth.users table    │
├─────────────────────┤
│ id: 123abc          │  ✗ STILL EXISTS!
│ email: alice@...    │
│ active: true        │
└─────────────────────┘

┌──────────────────────┐
│ internal_users table │
├──────────────────────┤
│ email: alice@...     │
│ is_active: false     │  ✓ Deactivated
└──────────────────────┘

RESULT: Orphaned auth record!
        User can't signup with same email
```

### After Deletion (Fixed)

```
Database State (WORKING):
┌─────────────────────┐
│ profiles table      │
├─────────────────────┤
│ id: 123abc          │
│ email: deleted_...  │  ✓ Anonymized
│ name: Alice         │
│ is_admin: false     │
└─────────────────────┘

┌─────────────────────┐
│ auth.users table    │
├─────────────────────┤
│ (RECORD DELETED)    │  ✓ Properly removed
└─────────────────────┘

┌──────────────────────┐
│ internal_users table │
├──────────────────────┤
│ email: alice@...     │
│ is_active: false     │  ✓ Deactivated
└──────────────────────┘

RESULT: Clean deletion
        User can signup with same email
```

---

## Error Flow - Current vs Fixed

### Current (Broken)

```
Edge Function Runs
    │
    └─ auth.admin.deleteUser() throws error
            │
            ├─ Reason unknown (could be many things!)
            │   - Permissions
            │   - Network timeout
            │   - Supabase issue
            │   - etc.
            │
            └─ catch (error) { console.log(...) }
                    │
                    └─ ❌ SILENTLY LOGGED
                            │
                            └─ Function returns 200 OK
                                    │
                                    └─ Hook thinks success
                                            │
                                            └─ Admin sees success
                                                    │
                                                    └─ But auth still exists!
```

### Fixed

```
Edge Function Runs
    │
    └─ auth.admin.deleteUser() throws error
            │
            ├─ Check: Is it "not found"?
            │   ├─ YES → ✓ Log "expected" & continue
            │   └─ NO → Go to next check
            │
            └─ Check: Is it a real error?
                    ├─ YES → ✓ THROW ERROR
                    │           Return 500
                    │           authDeletionFailed: true
                    │
                    └─ NO → Continue
                            │
                            ├─ Verify: User still exists?
                            │
                            ├─ YES → ✓ THROW ERROR
                            │           Verification failed
                            │
                            └─ NO → Return 200 OK
                                    ✓ Confirmed deleted
```

---

## Timeout Flow (Edge Cases)

### If Edge Function Times Out

```
Current (Broken):
    Hook calls: invoke('delete-user')
            │
            ├─ Wait... wait... wait...
            │
            ├─ 30 seconds timeout (edge function default)
            │
            └─ Throws: "Function invoke timeout"
                    │
                    ├─ Caught by try-catch
                    │
                    └─ Falls back to anonymization
                            │
                            └─ Shows: "User deleted successfully"
                            ├─ But: Edge function never finished!
                            └─ And: Falls back without deleting auth

Fixed:
    Hook calls: invoke('delete-user')
            │
            ├─ Wait... wait... wait...
            │
            ├─ 30 seconds timeout
            │
            └─ Throws: "Function invoke timeout"
                    │
                    ├─ Caught by try-catch
                    │
                    └─ Shows: "Edge function unavailable. Profile anonymized
                              but email reuse will be blocked. Please retry
                              after service is restored."
                            │
                            └─ Admin knows something is wrong!
```

---

## Permission Flow

### If Service Role Key Missing

```
Current (Broken):
    Edge Function starts
            │
            └─ Tries: auth.admin.deleteUser()
                    │
                    └─ Error: "Missing service role permissions"
                            │
                            ├─ catch (error) { console.log(...) }
                            │
                            └─ ❌ SILENTLY LOGGED
                                    │
                                    └─ Returns 200 OK
                                            │
                                            └─ Admin unaware

Fixed:
    Edge Function starts
            │
            └─ Tries: auth.admin.deleteUser()
                    │
                    └─ Error: "Missing service role permissions"
                            │
                            ├─ Not a "not found" error → Real error
                            │
                            └─ ✓ THROW ERROR
                                    │
                                    └─ Returns 500 error:
                                       "Auth deletion failed:
                                        Missing service role permissions"
                                            │
                                            └─ Admin sees warning
                                                    │
                                                    └─ Can fix configuration
```

---

## Fallback Scenario

### When Edge Function Fails

```
Hook's Error Handler (when invoke throws):

catch (edgeFunctionError) {
    │
    ├─ Is 401/403? (auth error)
    │   └─ Throw: "Unauthorized"
    │
    └─ Else: Use fallback
            │
            ├─ Set: edgeFunctionFailed = true
            │
            ├─ Deactivate internal_users
            │
            ├─ Anonymize profile
            │
            └─ Show warning:
               "User profile anonymized, but edge function
                is unavailable. They may not be able to
                sign up again with the same email until
                the service is restored. Contact support."
                    │
                    └─ Admin knows: This is incomplete!
                    └─ Admin knows: Edge function is down!
                    └─ Admin knows: Email reuse blocked!
```

---

## Success vs Failure Comparison

### Three Possible Outcomes

```
OUTCOME 1: Full Success (Fixed)
┌─────────────────────────────────┐
│ Admin: "User deleted successfully│
│        They can sign up again"   │
├─────────────────────────────────┤
│ Profile: Anonymized ✓            │
│ Auth: Deleted ✓                  │
│ Internal: Deactivated ✓          │
├─────────────────────────────────┤
│ User: Can sign up ✓              │
└─────────────────────────────────┘

OUTCOME 2: Partial Failure (Fixed)
┌──────────────────────────────────┐
│ Admin: "Auth deletion failed.    │
│        Profile anonymized. Please│
│        retry or contact support" │
├──────────────────────────────────┤
│ Profile: Anonymized ✓            │
│ Auth: Deleted ✗ (failed)         │
│ Internal: Deactivated ✓          │
├──────────────────────────────────┤
│ User: Can't sign up ✗            │
│ (but admin knows about it!)      │
└──────────────────────────────────┘

OUTCOME 3: Fallback (Fixed)
┌──────────────────────────────────┐
│ Admin: "Edge function unavailable│
│        Profile anonymized. Email │
│        reuse blocked until service│
│        is restored"              │
├──────────────────────────────────┤
│ Profile: Anonymized ✓            │
│ Auth: STILL EXISTS ✗             │
│ Internal: Deactivated ✓          │
├──────────────────────────────────┤
│ User: Can't sign up ✗            │
│ (but admin knows about it!)      │
└──────────────────────────────────┘
```

---

## Decision Tree - What To Do If User Deleted

```
User was deleted.
Can they sign up again?
│
├─ YES (with same email)
│   ├─ Fix worked! ✓
│   ├─ Auth was deleted
│   └─ Everything OK
│
└─ NO (error: "already registered")
    │
    ├─ Admin sees success message?
    │   ├─ YES → Old code, auth not deleted
    │   │   └─ Need to deploy fix
    │   │
    │   └─ NO (sees warning) → New code, fallback used
    │       └─ Edge function unavailable
    │           ├─ Check: Function deployed?
    │           ├─ Check: Service role key set?
    │           └─ Retry after fixing
    │
    └─ Manual fix: Contact support
        └─ Supabase can manually delete auth user
```

---

## Timeline of Events

### Bug Scenario

```
T=0:00   Admin deletes user Alice (alice@example.com)
         Dialog: "Delete User?" → Admin clicks Delete
         │
T=0:01   Edge function called with userId
         │
T=0:02   Profile anonymized to deleted_xxx
         Internal user deactivated
         │
T=0:03   Auth deletion attempted
         Fails silently (permissions? network? timeout?)
         │
T=0:04   Function returns HTTP 200 (still says success!)
         │
T=0:05   Admin sees: "User deleted successfully"
         │
         ❌ BUG: Auth record still exists!
         │
T=1:00   User Alice tries to sign up
         │
T=1:01   Signup: "alice@example.com"
         │
T=1:02   Supabase checks auth.users
         Finds: alice@example.com (orphaned record)
         │
T=1:03   Returns error: "User already registered" (422)
         │
T=1:04   User Alice sees error
         Confused: "But I was deleted!"
         Stuck: Can't sign up
         │
         😞 User blocked from signup
```

### Fixed Scenario

```
T=0:00   Admin deletes user Alice (alice@example.com)
         Dialog (improved): Shows what will happen
         Admin clicks Delete
         │
T=0:01   Edge function called with userId
         │
T=0:02   Profile anonymized to deleted_xxx ✓
         Internal user deactivated ✓
         │
T=0:03   Auth deletion attempted
         Fails! (permissions? network? timeout?)
         │
T=0:04   Function DETECTS error
         ├─ Is "not found"? → No
         ├─ Is real error? → YES!
         └─ THROWS error with details
         │
T=0:05   Function returns HTTP 500
         { error: "Auth deletion failed", authDeletionFailed: true }
         │
T=0:06   Admin sees warning: "Auth deletion failed.
                             Please retry or contact support."
         │
         ✓ Admin knows something went wrong!
         │
T=1:00   Admin retries user deletion
         or
         Fixes edge function deployment
         or
         Contacts support
         │
T=2:00   Problem resolved!
         Auth record actually deleted
         │
T=2:30   User Alice tries to sign up
         ✓ No "already registered" error
         ✓ Signup succeeds!
         │
         😊 User happy!
```

---

## Code Path Visualization

### Current Code Path (Broken)

```
deleteUser()
├─ invoke('delete-user')
│  └─ Promise catch
│     └─ Try again? → NO
│        └─ Use fallback (only anonymize)
│           ├─ Profile anonymized ✓
│           └─ Auth NOT deleted ✗
│
└─ Toast success
   User deleted but can't signup again
```

### Fixed Code Path

```
deleteUser()
├─ authDeleteSuccessful = false
├─ invoke('delete-user')
│  │
│  ├─ Check response
│  │  ├─ data.success?
│  │  └─ data.authDeletionFailed?
│  │
│  └─ Promise catch
│     ├─ Is 401/403?
│     │  └─ Throw (don't fallback)
│     │
│     └─ Use fallback
│        ├─ Profile anonymized ✓
│        ├─ Warning toast
│        └─ Log warning
│
└─ Different toast based on result
   ├─ Full success: "User deleted..."
   ├─ Partial failure: "Auth deletion failed..."
   └─ Fallback: "Edge function unavailable..."
```

---

This completes the visual documentation. All flows show:
- Current behavior (broken)
- Fixed behavior (working)
- Edge cases (timeout, permissions)
- User experience impact (blocked vs happy)
