# Organization Invitation Magic Link Fix - Execution Plan

**Feature ID**: `invite-fix`
**Priority**: 🔴 Critical (P1)
**Estimated Time**: 1.5 hours
**Created**: 2026-02-03 19:00

---

## 🎯 Problem Statement

Users clicking "Accept Invite" magic links in organization invitation emails are instantly redirected to an invalid link page with error:

```
PGRST116: Cannot coerce the result to a single JSON object
The result contains 0 rows
```

---

## 🔍 Root Causes Identified

### 1. **RLS Policy Blocks Unauthenticated Access**
Current SELECT policy on `organization_invitations` requires a JWT email claim. Unauthenticated users clicking magic links don't have a JWT yet, so token lookup fails.

### 2. **Base URL Detection Uses Hardcoded Production URL**
`invitationService.ts` falls back to `https://app.use60.com` when not in browser. This causes issues when creating invitations from localhost or staging.

### 3. **Poor Error Handling with .single()**
Using `.single()` throws PGRST116 when no rows match. Should use `.maybeSingle()` for graceful null handling.

---

## 📋 Execution Plan

### Story Breakdown

| ID | Story | Type | Est. | Priority | Dependencies |
|----|-------|------|------|----------|--------------|
| **INVITE-001** | Verify staging database state | investigation | 15m | P1 | None |
| **INVITE-002** | Add RLS policy for public lookup | schema | 20m | P1 | INVITE-001 |
| **INVITE-003** | Fix base URL detection | bugfix | 10m | P1 | INVITE-001 |
| **INVITE-004** | Change .single() to .maybeSingle() | bugfix | 15m | P2 | None |
| **INVITE-005** | End-to-end testing | test | 30m | P1 | INVITE-002, 003, 004 |

**Total Estimated Time**: 1.5 hours
**Parallel Opportunities**: INVITE-002 + INVITE-003 (after INVITE-001)

---

## 📝 Story Details

### INVITE-001: Verify Staging Database State

**Type**: Investigation
**Time**: 15 minutes
**Priority**: P1

**Objective**: Query staging database to understand current state of invitations.

**Actions**:
- [ ] Connect to staging database using `.env.staging` credentials
- [ ] Query `organization_invitations` table for recent records
- [ ] Verify token format (should be 64-char hex)
- [ ] Check invitation status (pending/expired/accepted)
- [ ] Document findings in investigation report

**SQL Queries**:
```sql
-- Check recent invitations
SELECT id, email, token, org_id, expires_at, accepted_at, created_at
FROM organization_invitations
ORDER BY created_at DESC
LIMIT 10;

-- Verify token format
SELECT token, LENGTH(token) as token_length
FROM organization_invitations
ORDER BY created_at DESC
LIMIT 1;

-- Check expired vs valid
SELECT
  COUNT(*) FILTER (WHERE accepted_at IS NULL AND expires_at > NOW()) as valid,
  COUNT(*) FILTER (WHERE accepted_at IS NOT NULL) as accepted,
  COUNT(*) FILTER (WHERE expires_at < NOW()) as expired
FROM organization_invitations;
```

**Acceptance Criteria**:
- ✅ Successfully connected to staging database
- ✅ Found and analyzed invitation records
- ✅ Verified token format correctness
- ✅ Documented findings in `.sixty/consult/magic-link-fix.md`

---

### INVITE-002: Add RLS Policy for Public Invitation Lookup

**Type**: Schema
**Time**: 20 minutes
**Priority**: P1
**Dependencies**: INVITE-001
**Parallel With**: INVITE-003

**Objective**: Allow unauthenticated users to look up invitations by token.

**Migration File**: `supabase/migrations/20260203200000_allow_public_invitation_lookup.sql`

**SQL**:
```sql
-- Allow public token lookup for unauthenticated magic link acceptance
-- This is safe because:
-- 1. Token is 256-bit cryptographically random (impossible to guess)
-- 2. Only returns pending/valid invitations
-- 3. Invitation details aren't sensitive (email, org name, role)

CREATE POLICY "Allow public token lookup for invitation acceptance"
ON organization_invitations
FOR SELECT
TO public
USING (
  accepted_at IS NULL
  AND expires_at > NOW()
);
```

**Actions**:
- [ ] Create migration file with above SQL
- [ ] Apply migration to staging database
- [ ] Test unauthenticated query by token
- [ ] Verify policy appears in pg_policies

**Acceptance Criteria**:
- ✅ Policy created and applied to staging
- ✅ Unauthenticated users can query by token
- ✅ Policy only returns pending, non-expired invitations
- ✅ Policy tested with sample token lookup

**Security Notes**:
- Token is 256-bit random (32 bytes → 64 hex chars)
- Probability of guessing: 1 in 2^256 (essentially impossible)
- No sensitive data exposed (just email, org name, role)
- Only returns unused, non-expired invitations

---

### INVITE-003: Fix Base URL Detection

**Type**: Bugfix
**Time**: 10 minutes
**Priority**: P1
**Dependencies**: INVITE-001
**Parallel With**: INVITE-002

**Objective**: Use environment variable for base URL instead of hardcoded production URL.

**File**: `src/lib/services/invitationService.ts` (lines 72-74)

**Current Code**:
```typescript
const baseUrl = typeof window !== 'undefined'
  ? window.location.origin
  : 'https://app.use60.com'; // ❌ Hardcoded production URL
```

**Fixed Code**:
```typescript
const baseUrl = typeof window !== 'undefined'
  ? window.location.origin
  : (import.meta.env.VITE_PUBLIC_URL || 'https://app.use60.com');
```

**Environment Variables**:
Add to `.env.staging`:
```env
VITE_PUBLIC_URL=https://staging.use60.com
```

Add to `.env.production`:
```env
VITE_PUBLIC_URL=https://app.use60.com
```

**Actions**:
- [ ] Update `invitationService.ts` lines 72-74
- [ ] Add `VITE_PUBLIC_URL` to `.env.staging`
- [ ] Add `VITE_PUBLIC_URL` to `.env.example`
- [ ] Test invitation creation in staging

**Acceptance Criteria**:
- ✅ Code uses `VITE_PUBLIC_URL` env var
- ✅ Fallback chain works: browser origin → env var → production
- ✅ Staging invitations use `https://staging.use60.com`
- ✅ Production invitations use `https://app.use60.com`

---

### INVITE-004: Change .single() to .maybeSingle()

**Type**: Bugfix
**Time**: 15 minutes
**Priority**: P2

**Objective**: Improve error handling to avoid PGRST116 errors.

**File**: `src/lib/services/invitationService.ts` (line ~411)

**Current Code**:
```typescript
const { data, error } = await supabase
  .from('organization_invitations')
  .select(...)
  .eq('token', token)
  .is('accepted_at', null)
  .gt('expires_at', new Date().toISOString())
  .single(); // ❌ Throws PGRST116 if 0 rows

if (error) {
  console.error('Error fetching invitation:', error);
  return { data: null, error: error.message };
}

return { data, error: null };
```

**Fixed Code**:
```typescript
const { data, error } = await supabase
  .from('organization_invitations')
  .select(...)
  .eq('token', token)
  .is('accepted_at', null)
  .gt('expires_at', new Date().toISOString())
  .maybeSingle(); // ✅ Returns null if 0 rows

if (error) {
  console.error('Error fetching invitation:', error);
  return { data: null, error: error.message };
}

if (!data) {
  return {
    data: null,
    error: 'Invitation not found, expired, or already used'
  };
}

return { data, error: null };
```

**Actions**:
- [ ] Update `getInvitationByToken()` function
- [ ] Change `.single()` to `.maybeSingle()`
- [ ] Add null check with user-friendly error message
- [ ] Test with invalid/expired/accepted tokens

**Acceptance Criteria**:
- ✅ No more PGRST116 errors
- ✅ User-friendly error messages displayed
- ✅ Function handles all error cases gracefully
- ✅ No breaking changes to return type

---

### INVITE-005: End-to-End Testing

**Type**: Test
**Time**: 30 minutes
**Priority**: P1
**Dependencies**: INVITE-002, INVITE-003, INVITE-004

**Objective**: Comprehensive testing of entire invitation magic link flow.

**Test Scenarios**:

#### 1. Happy Path - New User
- [ ] Create invitation in staging as org admin
- [ ] Verify invitation record created in database
- [ ] Verify token is 64-char hex
- [ ] Verify email sent with correct URL: `https://staging.use60.com/invite/{token}`
- [ ] Open magic link in incognito browser (unauthenticated)
- [ ] Verify AcceptInvitation page loads without errors
- [ ] Verify invitation details displayed correctly
- [ ] Sign up with invitation email
- [ ] Verify membership created
- [ ] Verify redirect to dashboard

#### 2. Happy Path - Existing User
- [ ] Create invitation for existing user email
- [ ] Login with that user account
- [ ] Click magic link
- [ ] Verify invitation details shown
- [ ] Accept invitation
- [ ] Verify added to organization
- [ ] Verify removed from old organization (single-org constraint)

#### 3. Error Cases
- [ ] Test expired invitation (create one with past expires_at)
- [ ] Verify shows: "Invitation expired"
- [ ] Test already-accepted invitation
- [ ] Verify shows: "Invitation already used"
- [ ] Test invalid token (random string)
- [ ] Verify shows: "Invitation not found"
- [ ] Test wrong email (logged in as different user)
- [ ] Verify shows: "Email mismatch" error

#### 4. RLS Policy Verification
- [ ] Confirm unauthenticated user can query by token
- [ ] Confirm authenticated user can query their invitation
- [ ] Confirm user cannot see other users' invitations
- [ ] Confirm accepted invitations not returned by public policy

#### 5. Email Validation
- [ ] Check email logs table for sent emails
- [ ] Verify email contains correct staging URL
- [ ] Verify email template variables replaced correctly
- [ ] Verify "Accept Invitation" button links to correct URL

**Acceptance Criteria**:
- ✅ All happy path scenarios work end-to-end
- ✅ All error cases show appropriate messages
- ✅ RLS policies function as expected
- ✅ Emails contain correct staging URLs
- ✅ No PGRST116 errors occur

---

## 🚀 Execution Strategy

### Phase 1: Investigation (15 min)
```bash
# Run INVITE-001
60/run --story INVITE-001
```

**Outcome**: Understand current database state before making changes.

---

### Phase 2: Parallel Fixes (20 min)
```bash
# Run INVITE-002 and INVITE-003 in parallel
60/run --story INVITE-002 --story INVITE-003 --parallel
```

**Outcome**:
- RLS policy deployed to staging
- Base URL detection fixed in code

---

### Phase 3: Error Handling (15 min)
```bash
# Run INVITE-004
60/run --story INVITE-004
```

**Outcome**: Graceful error handling implemented.

---

### Phase 4: Testing (30 min)
```bash
# Run INVITE-005
60/run --story INVITE-005
```

**Outcome**: Full confidence in magic link flow.

---

## 📊 Progress Tracking

Use `60/status` to monitor:

```
Feature: invite-fix (Organization Invitation Magic Link Fix)
Status: in_progress
Progress: 0/5 stories (0%)

Stories:
  [ ] INVITE-001 - Verify staging database state (15m)
  [ ] INVITE-002 - Add RLS policy for public lookup (20m)
  [ ] INVITE-003 - Fix base URL detection (10m)
  [ ] INVITE-004 - Change .single() to .maybeSingle() (15m)
  [ ] INVITE-005 - End-to-end testing (30m)

Next up: INVITE-001 (no blockers)
```

---

## 🧪 Testing Checklist

After completion, manually verify:

- [ ] Create invitation from staging admin account
- [ ] Check database for invitation record
- [ ] Verify email received with correct staging URL
- [ ] Click magic link in incognito browser
- [ ] Verify page loads without PGRST116 error
- [ ] Sign up or log in and accept invitation
- [ ] Verify membership created and user added to org
- [ ] Test expired invitation shows proper error
- [ ] Test invalid token shows proper error

---

## 📁 Files Modified

| File | Change |
|------|--------|
| `supabase/migrations/20260203200000_allow_public_invitation_lookup.sql` | New RLS policy |
| `src/lib/services/invitationService.ts` | Base URL + error handling fixes |
| `.env.staging` | Add VITE_PUBLIC_URL |
| `.env.example` | Add VITE_PUBLIC_URL |
| `.sixty/consult/magic-link-fix.md` | Investigation findings |

---

## 🔐 Security Considerations

**Q: Is it safe to allow public access to invitations table?**

**A: Yes, because:**
1. ✅ **Token is cryptographically secure**: 256-bit random value (impossible to guess)
2. ✅ **Policy is restrictive**: Only returns pending, non-expired invitations
3. ✅ **No sensitive data**: Invitation details (email, org name, role) aren't secret
4. ✅ **One-time use**: Token is marked accepted after first use
5. ✅ **Expiration**: All invitations expire in 7 days

**Similar patterns in production**:
- Password reset tokens
- Email verification links
- Magic login links

All use the same approach: cryptographically random token + public lookup.

---

## 🎉 Success Criteria

Feature is complete when:

1. ✅ Users can click magic links from emails without PGRST116 errors
2. ✅ Magic links work for both authenticated and unauthenticated users
3. ✅ Staging invitations use `https://staging.use60.com` URLs
4. ✅ Production invitations use `https://app.use60.com` URLs
5. ✅ Error messages are user-friendly and helpful
6. ✅ All edge cases (expired, invalid, used) handled gracefully
7. ✅ RLS policies secure but allow necessary public access

---

## 📞 Next Steps

1. **Start execution**:
   ```bash
   60/run
   ```

2. **Monitor progress**:
   ```bash
   60/status
   ```

3. **After completion**:
   - Test in staging environment
   - Verify emails contain correct URLs
   - Create test invitations and accept them
   - Deploy to production

---

## 📚 Reference Documents

- **Consult Report**: `.sixty/consult/magic-link-fix.md`
- **Plan JSON**: `.sixty/plan.json`
- **Progress Log**: `.sixty/progress.md` (auto-generated during execution)
