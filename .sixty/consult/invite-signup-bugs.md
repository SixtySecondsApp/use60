# Consult Report: Invitation Signup Bugs
Generated: 2026-02-03

## User Report
> When I signed up to an invite request to join an organization, it saved my password but did not save my first and last name. So now my names are blank even after a refresh which it shouldnt need anyway. Also I have loaded into the organization "Gmail" which shouldnt be possible but also I accepted an invite to join "Sixty Seconds" so why has it created a new organization and removed my ability to join.

---

## Bug 1: First/Last Name Not Saved

### Root Cause
The `InviteSignup.tsx` flow calls `signUp()` which passes `first_name` and `last_name` in auth metadata. The DB trigger `create_profile_on_auth_user_created()` (migration `20260126000003`) should extract these from `raw_user_meta_data` and write them to the `profiles` table.

**However**, there's a critical timing issue:

1. Migration `20260121000009` created the trigger WITHOUT name extraction (just `id` and `email`)
2. Migration `20260126000003` updated the function to include name extraction
3. **If migration `20260126000003` was NOT applied to production**, the trigger creates profiles with empty names

Additionally, the `InviteSignup.tsx` flow does NOT go through `AuthCallback.tsx` — it redirects directly to `/dashboard`. The `AuthCallback.tsx` has a profile upsert at line 268-278 that saves `first_name`/`last_name` from `user_metadata`, but this only runs when users verify their email via the callback URL. **Invited users skip this entirely.**

### The Flow That Fails
```
User fills in first_name, last_name, password on InviteSignup page
  → signUp() stores names in auth.users.raw_user_meta_data ✓
  → DB trigger creates profile (may or may not extract names depending on migration state)
  → completeInviteSignup() creates membership, marks onboarding complete
  → navigate('/dashboard') — AuthCallback never runs, no profile upsert
```

### Fix Required
The `InviteSignup.tsx` handleSignup function must explicitly update the profile with first_name/last_name after signup, rather than relying solely on the DB trigger.

---

## Bug 2: "Gmail" Organization Created

### Root Cause
The `auto_create_org_for_new_user()` trigger (baseline.sql:1298) creates organizations based on email domain. For `user@gmail.com`, it creates an org named "Gmail".

**Multiple migrations attempted to disable this:**
- `20260121000006` — DROP TRIGGER and DROP FUNCTION
- `20260126000010` — Double-checks removal with verification

**If these migrations haven't been applied to production**, the trigger is still active and creates "Gmail" orgs for personal email signups.

Even if the trigger IS disabled, the `AuthCallback.tsx` (lines 285-367) has its own org-detection logic that runs after email verification. For personal emails, it sets a `needs_website_input` flag (line 303). For business emails, it looks for existing orgs by domain. This flow runs for regular signups going through email verification — but **should NOT run for invited users** since they shouldn't go through AuthCallback.

### The Flow That Creates "Gmail"
```
User signs up via InviteSignup with gmail.com email
  → auth.users INSERT triggers create_profile_on_auth_user_created()
  → profiles INSERT triggers auto_create_org_for_new_user() (IF NOT DISABLED)
  → Trigger extracts domain "gmail" → creates org "Gmail"
  → completeInviteSignup() creates membership to invited org
  → User now belongs to BOTH "Gmail" AND the invited org
```

### Fix Required
1. Verify migrations `20260121000006` and `20260126000010` are applied in production
2. The `complete_invite_signup` RPC should clean up any auto-created orgs

---

## Bug 3: Loaded Into Wrong Organization / Can't Join Invited Org

### Root Cause
This is a consequence of Bug 2. The sequence is:

1. User signs up → trigger creates "Gmail" org + membership (user is owner)
2. `completeInviteSignup()` runs → tries to create membership in "Sixty Seconds"
3. But the RPC at line 52-64 checks `IF EXISTS (membership in invited org)` — if a race condition or the "already a member" check triggers incorrectly, it could fail
4. Even if membership is created, the orgStore may load the FIRST org it finds (alphabetically or by creation time), which could be "Gmail"

The orgStore likely selects the active org on login. If "Gmail" was created first and the user is its owner, it may be selected as the default.

### Additional Issue
The `completeInviteSignup` RPC does NOT:
- Clean up auto-created organizations
- Set the newly joined org as the "active" org
- Remove memberships from auto-created orgs

---

## Recommended Fixes

### Story 1: Fix name saving in InviteSignup
**File**: `src/pages/auth/InviteSignup.tsx`
After successful signup and before/after `completeInviteSignup()`, explicitly upsert the profile with first_name and last_name.

### Story 2: Verify auto-org-creation trigger is disabled in production
Run the verification query from migration `20260126000010` against production to confirm the trigger doesn't exist.

### Story 3: Update `complete_invite_signup` RPC to clean up auto-created orgs
Modify the RPC to:
1. After creating membership in invited org, find and remove any auto-created personal-email orgs
2. Remove the user's membership in those orgs
3. Delete the org if no other members remain

### Story 4: Ensure orgStore loads the invited org after signup
After `completeInviteSignup()` returns, explicitly set the active org in the store to `result.org_id`.
