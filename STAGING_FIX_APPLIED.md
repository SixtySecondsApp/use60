# ✅ Invitation Bug Fix - Applied to Staging

**Date**: 2026-02-11
**Environment**: Staging (caerqjzvuerejfrdtygb)
**Status**: Successfully Applied

---

## 🐛 Bug Fixed

**Error**: `insert or update on table "organization_memberships" violates foreign key constraint "organization_memberships_profiles_fk"`

**Affected Users**: All new user invitations (discovered via Drue@sixtyseconds.video)

---

## ✅ What Was Fixed

### Root Cause
When users accepted invitations, the system tried to create organization memberships but the profile record didn't exist yet, causing a FK constraint violation.

**The broken flow**:
1. User signs up via invitation → `auth.users` created
2. Trigger should auto-create profile → **Failed silently**
3. Frontend tried to upsert profile → **Failed but only logged warning**
4. RPC tried to create membership → ❌ **FK constraint violation**

### The Solution
Both RPC functions now use **defensive programming**:

```sql
-- Check if profile exists, create if missing
IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = v_user_id) THEN
  INSERT INTO public.profiles (id, email, profile_status, created_at, updated_at)
  VALUES (v_user_id, v_user_email, 'active', NOW(), NOW())
  ON CONFLICT (id) DO NOTHING;

  RAISE LOG 'Created missing profile for user: %', v_user_id;
END IF;

-- Now safe to create membership
INSERT INTO organization_memberships (org_id, user_id, role)
VALUES (v_invitation.org_id, v_user_id, v_invitation.role);
```

---

## 📦 Applied Migrations

**Staging Database**: caerqjzvuerejfrdtygb

| Migration | Status | Timestamp |
|-----------|--------|-----------|
| 20260211000000_enrichment_stats_rpc.sql | ✅ Applied | 2026-02-11 00:00:00 |
| 20260211120000_fix_invite_missing_profile.sql | ✅ Applied | 2026-02-11 12:00:00 |
| 20260211130000_fix_invite_missing_profile_v2.sql | ✅ Applied | 2026-02-11 13:00:00 |

**Note**: The first migration (120000) failed during application but the second (130000) succeeded with improved syntax.

---

## 🔧 Functions Updated

### 1. `complete_invite_signup(p_token TEXT)`
- **Used by**: InviteSignup.tsx (new user signup flow)
- **Change**: Now ensures profile exists before creating membership
- **Location**: Called from `src/lib/services/invitationService.ts:271-326`

### 2. `accept_org_invitation(p_token TEXT)`
- **Used by**: AcceptInvitation.tsx (existing user invitation acceptance)
- **Change**: Now ensures profile exists before creating membership
- **Location**: Called from `src/lib/services/invitationService.ts:271-326`

---

## 🧪 Testing Instructions

### Test Case 1: New User Invitation
1. **Admin**: Invite a brand new user (email never registered before)
2. **User**: Receive invitation email
3. **User**: Click link → goes to `/auth/invite-signup/{token}`
4. **User**: Fill in name, password, submit
5. **Expected**: ✅ Account created, invitation accepted, redirected to dashboard

### Test Case 2: Existing User Invitation
1. **Admin**: Invite an existing user (already has account)
2. **User**: Receive invitation email
3. **User**: Click link → goes to `/invite/{token}`
4. **User**: Log in with existing credentials
5. **User**: Click "Accept Invitation"
6. **Expected**: ✅ Membership created, redirected to organization dashboard

### Test Case 3: Retry Failed Invitation
If the original user (Drue@sixtyseconds.video) is in staging:
1. Have them try accepting the invitation again
2. **Expected**: ✅ Profile automatically created, membership succeeds

---

## 📋 Production Deployment Plan

### Prerequisites
- [ ] All staging tests pass
- [ ] No regressions observed
- [ ] User confirmation that fix works

### Deployment Steps
1. **Link to production**: `npx supabase link --project-ref ygdpgliavpxeugaajgrb`
2. **Push migrations**: `npx supabase db push`
3. **Verify functions**: Check Supabase dashboard → Database → Functions
4. **Test immediately**: Send a test invitation after deployment

### Production Environment
- **Project Ref**: ygdpgliavpxeugaajgrb
- **URL**: https://app.use60.com
- **Git Branch**: `main`

---

## 📚 Key Learnings

### Pattern: Defensive Programming for FK Constraints
✅ **Always verify FK dependencies exist before inserting**

```sql
-- Anti-pattern: Assume dependency exists
INSERT INTO child_table (parent_id, data) VALUES (parent_id, data);
-- ❌ Fails if parent doesn't exist

-- Best practice: Verify and create if needed
IF NOT EXISTS (SELECT 1 FROM parent_table WHERE id = parent_id) THEN
  INSERT INTO parent_table (id, ...) VALUES (parent_id, ...)
  ON CONFLICT (id) DO NOTHING;
END IF;
INSERT INTO child_table (parent_id, data) VALUES (parent_id, data);
-- ✅ Always succeeds if parent should exist
```

### Pattern: RPC Function Migration Syntax
Use explicit dollar-quote delimiters to avoid parsing issues:

```sql
-- ❌ Can cause parsing issues
CREATE OR REPLACE FUNCTION my_func() RETURNS ... AS $$
...
$$ LANGUAGE plpgsql;

-- ✅ Explicit delimiter, better compatibility
CREATE OR REPLACE FUNCTION my_func()
RETURNS ...
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
...
$function$;
```

---

## 🔗 Related Documentation

- **Full Bug Report**: `BUG_FIX_SUMMARY_INVITE.md`
- **Hotfix SQL**: `HOTFIX_INVITE_BUG.sql` (for manual application)
- **Memory Updated**: Added to `.claude/memory/MEMORY.md` as Bug Fix #5

---

## 📞 Support

If issues persist after applying this fix:

1. **Check Supabase logs**: Dashboard → Logs → Filter for "complete_invite_signup" or "accept_org_invitation"
2. **Check browser console**: Look for error messages during invitation acceptance
3. **Verify functions exist**: Dashboard → Database → Functions → Search for the two functions
4. **Check migration status**: `npx supabase migration list | grep 20260211`

---

## ✅ Sign-Off

- [x] Bug identified and root cause analyzed
- [x] Fix developed with defensive programming
- [x] Migration created and syntax validated
- [x] Applied to staging successfully
- [x] Documentation created
- [x] Memory updated with learnings
- [ ] **Ready for production after staging validation**
