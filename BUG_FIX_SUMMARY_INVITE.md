# Bug Fix Summary: Invitation FK Constraint Violation

## Bug Report
**User**: Drue@sixtyseconds.video
**Error**: `insert or update on table "organization_memberships" violates foreign key constraint "organization_memberships_profiles_fk"`
**Environment**: Production
**Severity**: Critical (blocks all new user invitations)

## Root Cause Analysis

### The Problem
When a user accepts an organization invitation, the system tries to create an `organization_membership` record. This record has a foreign key constraint (`organization_memberships_profiles_fk`) that requires the `user_id` to exist in the `profiles` table.

The bug occurs when:
1. User signs up via invitation link
2. Auth account is created (`auth.users` record)
3. **Profile is NOT created** (trigger fails or doesn't run)
4. Frontend tries to accept invitation
5. RPC function tries to create membership
6. ❌ **FK constraint fails** because profile doesn't exist

### Why Profiles Weren't Created

There's a trigger `trigger_create_profile_on_auth_signup` that should auto-create profiles, but:
- It may not be deployed to production
- It may fail silently
- There may be a race condition
- The InviteSignup flow explicitly tries to upsert the profile (lines 184-194), but only logs a warning if it fails, allowing the code to continue

### The Flow That Breaks

```
1. User clicks invitation link
2. User signs up → auth.users created
3. Trigger SHOULD create profile → FAILS
4. Frontend upserts profile → FAILS (logs warning)
5. complete_invite_signup() RPC called
6. RPC: INSERT INTO organization_memberships (org_id, user_id, role) VALUES (...)
7. ❌ FK constraint fails: user_id doesn't exist in profiles
```

## The Fix

### Strategy: Defensive Programming
Both RPC functions (`complete_invite_signup` and `accept_org_invitation`) now **ensure the profile exists** before attempting to create the membership.

### Key Changes

**Before** (line 67-68 in original):
```sql
-- Create membership
INSERT INTO organization_memberships (org_id, user_id, role)
VALUES (v_invitation.org_id, v_user_id, v_invitation.role);
```

**After** (with defensive check):
```sql
-- CRITICAL FIX: Ensure profile exists before creating membership
IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = v_user_id) THEN
  INSERT INTO public.profiles (
    id,
    email,
    profile_status,
    created_at,
    updated_at
  ) VALUES (
    v_user_id,
    v_user_email,
    'active',
    NOW(),
    NOW()
  ) ON CONFLICT (id) DO NOTHING;

  RAISE LOG '[complete_invite_signup] Created missing profile for user: %', v_user_id;
END IF;

-- Create membership (now safe - profile guaranteed to exist)
INSERT INTO organization_memberships (org_id, user_id, role)
VALUES (v_invitation.org_id, v_user_id, v_invitation.role);
```

## How to Apply the Fix

### Option 1: Via Supabase Dashboard (Recommended)
1. Go to Supabase Dashboard: https://supabase.com/dashboard/project/ygdpgliavpxeugaajgrb
2. Navigate to **SQL Editor**
3. Create a new query
4. Copy the contents of `HOTFIX_INVITE_BUG.sql`
5. Click **Run**
6. Verify both functions were created successfully

### Option 2: Via CLI (After Resolving Migration Conflicts)
```bash
# First, sync local migrations with remote
npx supabase db pull

# Then push the new migration
npx supabase db push
```

## Testing the Fix

### Test Case 1: New User Invitation
1. Admin invites a new user (email that's never been registered)
2. User receives invitation email
3. User clicks link → signs up with password
4. User accepts invitation
5. ✅ **Should succeed** - profile created automatically if missing

### Test Case 2: Existing User Invitation
1. Admin invites an existing user (already has account)
2. User receives invitation email
3. User clicks link → logs in
4. User accepts invitation
5. ✅ **Should succeed** - profile already exists

### Test Case 3: Retry for Failed User
For the user who encountered the error (Drue@sixtyseconds.video):
1. Apply the hotfix
2. Resend the invitation (or use existing token)
3. User attempts to accept invitation again
4. ✅ **Should succeed** - RPC will create missing profile

## Verification Checklist

After applying the fix:
- [ ] Both RPC functions updated successfully
- [ ] No errors in Supabase logs
- [ ] Test invitation flow with new user
- [ ] Test invitation flow with existing user
- [ ] Verify Drue@sixtyseconds.video can now accept invitation

## Files Modified

1. **Created**:
   - `supabase/migrations/20260211000000_fix_invite_missing_profile.sql` - Full migration
   - `HOTFIX_INVITE_BUG.sql` - Direct SQL for immediate fix
   - `BUG_FIX_SUMMARY_INVITE.md` - This document

2. **Fixed Functions**:
   - `complete_invite_signup(p_token TEXT)` - Used by InviteSignup.tsx
   - `accept_org_invitation(p_token TEXT)` - Used by AcceptInvitation.tsx

## Related Files Reference

- **Frontend**:
  - `src/pages/auth/InviteSignup.tsx:206` - Calls `completeInviteSignup()`
  - `src/pages/auth/AcceptInvitation.tsx:78` - Calls `acceptInvitation()`
  - `src/lib/services/invitationService.ts:271-326` - Wrapper functions

- **Backend**:
  - `supabase/migrations/20260117000004_create_invite_signup_rpc.sql` - Original RPC
  - `supabase/migrations/20260204000200_fix_accept_org_invitation_ambiguous_org_id.sql` - Previous fix
  - `supabase/migrations/20260121000009_auto_create_profile_on_auth_signup.sql` - Trigger (may not be deployed)

## Pattern for Future

This bug highlights a pattern:
- ✅ **DO**: Always verify FK dependencies exist before inserting
- ✅ **DO**: Create missing dependencies if they should exist
- ✅ **DO**: Log when defensive creation happens for debugging
- ❌ **DON'T**: Assume triggers always run successfully
- ❌ **DON'T**: Let silent failures propagate to FK constraints

Apply this pattern to other RPC functions that create records with FK constraints.

## Questions & Answers

### Q: Why not just fix the trigger?
**A**: The trigger should work, but this fix provides defense-in-depth. Even if the trigger is fixed, this ensures the system is resilient to future failures.

### Q: Will this create duplicate profiles?
**A**: No. The INSERT uses `ON CONFLICT (id) DO NOTHING`, so it's idempotent.

### Q: What happens to users who already failed?
**A**: They can retry accepting the invitation. The RPC will now create their missing profile and succeed.

### Q: Should we add this check to other RPCs?
**A**: Yes! Any RPC that inserts into tables with FK to profiles should have this check:
- `add_invited_user_to_admin_org()`
- Any other user-creation flows

## Status

- [x] Bug identified
- [x] Root cause analyzed
- [x] Fix developed
- [ ] **Fix applied to production** ← ACTION REQUIRED
- [ ] Testing completed
- [ ] Documentation updated
