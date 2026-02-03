# INVITE-005: Testing Guide

**Story**: End-to-end test of invitation magic link flow
**Status**: Ready for manual testing
**Prerequisites**: Correct staging service role key must be configured

---

## Prerequisites

### 1. Fix Service Role Key (CRITICAL)

Before testing, the staging service role key must be corrected:

```bash
# Current key is for wrong project
Current:  wbgmnyekgqklggilgqag
Expected: caerqjzvuerejfrdtygb
```

**Action Required**:
1. Go to https://supabase.com/dashboard/project/caerqjzvuerejfrdtygb/settings/api
2. Copy the `service_role` secret key
3. Update `.env.staging` line 19
4. Verify the decoded JWT contains `"ref":"caerqjzvuerejfrdtygb"`

### 2. Apply Migration

The RLS policy migration must be applied to staging:

```bash
# Connect to staging database
npx supabase db push --project-ref caerqjzvuerejfrdtygb

# Or apply migration directly
psql $STAGING_DB_URL < supabase/migrations/20260203200000_allow_public_invitation_lookup.sql
```

### 3. Deploy Code Changes

The code fixes must be deployed to staging environment:
- `src/lib/services/invitationService.ts` (base URL + error handling)
- `.env.staging` (VITE_PUBLIC_URL)

---

## Test Scenarios

### Scenario 1: Happy Path - New User Accepts Invitation

**Setup**:
1. Login to staging as organization admin
2. Navigate to Settings → Team Management
3. Click "Invite Team Member"
4. Enter test email: `test-invite-$(date +%s)@example.com`
5. Select role: Member
6. Click "Send Invitation"

**Verification Steps**:

1. **Database Check**:
   ```bash
   node check-staging-db.mjs
   ```
   Verify:
   - ✅ Invitation record created
   - ✅ Token is 64-character hex
   - ✅ expires_at is 7 days from now
   - ✅ accepted_at is NULL

2. **Email Check**:
   - Check email logs table for sent email
   - Verify email contains: `https://staging.use60.com/invite/{token}`
   - NOT `http://localhost:5175/invite/{token}`

3. **Magic Link Click** (Incognito Browser):
   - Open incognito/private browsing
   - Click magic link from email
   - Verify: AcceptInvitation page loads
   - Verify: NO PGRST116 error
   - Verify: Invitation details displayed:
     - Organization name
     - Inviter name
     - Your email
     - Role
   - Verify: "Accept Invitation" button visible

4. **Signup Flow**:
   - Click "Create Account & Join"
   - Fill in: First name, Last name, Password
   - Email should be pre-filled and locked
   - Click "Create Account"
   - Verify: Account created
   - Verify: Redirected to dashboard
   - Verify: Organization name appears in header

5. **Database Check** (After Accept):
   ```bash
   node check-staging-db.mjs
   ```
   Verify:
   - ✅ Invitation accepted_at is NOT NULL
   - ✅ organization_memberships record created
   - ✅ User role matches invitation

**Expected Result**: ✅ New user successfully joins organization via magic link

---

### Scenario 2: Existing User Accepts Invitation

**Setup**:
1. Create invitation for email of existing staging user
2. Send invitation

**Verification Steps**:

1. **Login as Existing User**:
   - Login to staging with existing account
   - Navigate to magic link URL from email
   - Or click link (will redirect to AcceptInvitation page)

2. **Email Match Validation**:
   - If logged in with CORRECT email:
     - ✅ Shows "Accept Invitation" button
     - ✅ Click button
     - ✅ Membership added
     - ✅ Redirected to dashboard
     - ✅ Shows new organization in header

   - If logged in with WRONG email:
     - ⚠️ Shows error: "This invitation was sent to {email}"
     - ⚠️ Shows "Switch Account" button
     - ✅ Can logout and login with correct email

**Expected Result**: ✅ Existing user can accept invitation when logged in with correct email

---

### Scenario 3: Error Cases

#### 3a. Expired Invitation

**Setup**:
1. Create invitation with past expires_at:
   ```sql
   UPDATE organization_invitations
   SET expires_at = NOW() - INTERVAL '1 day'
   WHERE token = '{test-token}';
   ```

**Test**:
- Click magic link
- Verify shows: "Invitation not found, expired, or already used"
- Verify: User-friendly error message (not PGRST116)

#### 3b. Already Accepted Invitation

**Setup**:
1. Accept invitation once
2. Try clicking magic link again

**Test**:
- Click magic link
- Verify shows: "Invitation not found, expired, or already used"
- Verify: Cannot accept twice

#### 3c. Invalid Token

**Test**:
- Navigate to: `https://staging.use60.com/invite/invalid-token-12345`
- Verify shows: "Invitation not found, expired, or already used"
- Verify: No server error
- Verify: No PGRST116 error

#### 3d. Malformed Token

**Test**:
- Navigate to: `https://staging.use60.com/invite/`
- Verify: Route not found or appropriate error

**Expected Result**: ✅ All error cases handled gracefully with user-friendly messages

---

### Scenario 4: RLS Policy Verification

**Test**: Unauthenticated token lookup

```bash
# Using anon key (simulates unauthenticated user)
curl -X GET \
  'https://caerqjzvuerejfrdtygb.supabase.co/rest/v1/organization_invitations?token=eq.{test-token}&accepted_at=is.null&expires_at=gt.2026-02-03T00:00:00Z&select=id,email,expires_at' \
  -H "apikey: {VITE_SUPABASE_ANON_KEY}" \
  -H "Authorization: Bearer {VITE_SUPABASE_ANON_KEY}"
```

**Expected**:
- ✅ Returns invitation data (if token valid)
- ✅ No authentication error
- ✅ Policy allows public read

**Test**: Accepted invitations not returned

```bash
# Try to fetch accepted invitation
curl -X GET \
  'https://caerqjzvuerejfrdtygb.supabase.co/rest/v1/organization_invitations?token=eq.{accepted-token}&select=id' \
  -H "apikey: {VITE_SUPABASE_ANON_KEY}" \
  -H "Authorization: Bearer {VITE_SUPABASE_ANON_KEY}"
```

**Expected**:
- ✅ Returns empty array (policy blocks accepted invitations)

---

### Scenario 5: Base URL Validation

**Test**: Invitation created from localhost

**Setup**:
1. Run frontend locally: `npm run dev`
2. Login to staging (localhost points to staging DB)
3. Create invitation

**Verification**:
- Check email received
- Verify URL is `https://staging.use60.com/invite/{token}`
- NOT `http://localhost:5175/invite/{token}`

**Expected**: ✅ VITE_PUBLIC_URL environment variable overrides localhost

---

### Scenario 6: Concurrent Invitations

**Test**: Multiple pending invitations for same email

**Setup**:
1. Create invitation for `test@example.com`
2. Create another invitation for same email
3. Send both

**Verification**:
- Both invitations should work independently
- Accepting one shouldn't invalidate the other
- Each has unique token

**Expected**: ✅ Multiple invitations can coexist

---

## Automated Test Script

After manual testing passes, create automated tests:

```typescript
// test/invitation-magic-link.test.ts

import { describe, it, expect, beforeAll } from 'vitest';
import { createClient } from '@supabase/supabase-js';

describe('Invitation Magic Link Flow', () => {
  let supabase;
  let testToken;

  beforeAll(async () => {
    // Setup test environment
    supabase = createClient(
      process.env.VITE_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );

    // Create test invitation
    const { data } = await supabase
      .from('organization_invitations')
      .insert({
        org_id: 'test-org-id',
        email: 'test@example.com',
        role: 'member',
        expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
      })
      .select()
      .single();

    testToken = data.token;
  });

  it('should allow unauthenticated token lookup', async () => {
    const anonClient = createClient(
      process.env.VITE_SUPABASE_URL,
      process.env.VITE_SUPABASE_ANON_KEY
    );

    const { data, error } = await anonClient
      .from('organization_invitations')
      .select('id, email')
      .eq('token', testToken)
      .is('accepted_at', null)
      .gt('expires_at', new Date().toISOString())
      .maybeSingle();

    expect(error).toBeNull();
    expect(data).not.toBeNull();
    expect(data.email).toBe('test@example.com');
  });

  it('should return null for invalid token without error', async () => {
    const anonClient = createClient(
      process.env.VITE_SUPABASE_URL,
      process.env.VITE_SUPABASE_ANON_KEY
    );

    const { data, error } = await anonClient
      .from('organization_invitations')
      .select('id')
      .eq('token', 'invalid-token-12345')
      .maybeSingle();

    expect(error).toBeNull();
    expect(data).toBeNull();
  });

  it('should not return accepted invitations', async () => {
    // Mark invitation as accepted
    await supabase
      .from('organization_invitations')
      .update({ accepted_at: new Date().toISOString() })
      .eq('token', testToken);

    const anonClient = createClient(
      process.env.VITE_SUPABASE_URL,
      process.env.VITE_SUPABASE_ANON_KEY
    );

    const { data } = await anonClient
      .from('organization_invitations')
      .select('id')
      .eq('token', testToken)
      .is('accepted_at', null)
      .maybeSingle();

    expect(data).toBeNull();
  });
});
```

---

## Success Criteria

All tests pass when:

- ✅ Invitations created with correct staging URL
- ✅ Emails sent with `https://staging.use60.com/invite/{token}`
- ✅ Unauthenticated users can access magic links
- ✅ No PGRST116 errors occur
- ✅ User-friendly error messages for all error cases
- ✅ New users can sign up and accept invitations
- ✅ Existing users can login and accept invitations
- ✅ Email mismatch validation works
- ✅ Expired/invalid/used invitations handled gracefully
- ✅ RLS policy allows public access only for valid invitations

---

## Rollback Plan

If issues occur in staging:

1. **Revert Code Changes**:
   ```bash
   git revert HEAD~3  # Revert last 3 commits
   git push origin fix/go-live-bug-fixes
   ```

2. **Revert Migration**:
   ```sql
   DROP POLICY "Allow public token lookup for invitation acceptance"
   ON organization_invitations;
   ```

3. **Revert Environment Variables**:
   ```env
   VITE_PUBLIC_URL=http://localhost:5175
   ```

---

## Post-Testing Checklist

After all tests pass:

- [ ] Document test results in `.sixty/INVITE-005-TEST-RESULTS.md`
- [ ] Update plan.json to mark INVITE-005 as complete
- [ ] Commit all changes with descriptive message
- [ ] Update progress.md with learnings
- [ ] Deploy to production (if staging tests successful)
- [ ] Verify production invitations work correctly
- [ ] Monitor error logs for 24 hours
- [ ] Close related bug tickets in issue tracker

---

## Contact & Support

If tests fail or issues arise:

1. Check `.sixty/INVITE-001-FINDINGS.md` for known issues
2. Review `.sixty/consult/magic-link-fix.md` for root cause analysis
3. Examine browser console for client-side errors
4. Check Supabase logs for server-side errors
5. Verify RLS policies in Supabase Dashboard

---

## Next Steps

1. **Prerequisite**: Update staging service role key
2. **Apply**: Run migration script
3. **Deploy**: Push code changes to staging
4. **Test**: Follow all test scenarios above
5. **Document**: Record test results
6. **Deploy**: Push to production if successful
