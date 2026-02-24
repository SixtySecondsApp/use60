# Magic Link Fix - Organization Invitations

## Problem Summary

Users clicking "Accept Invite" magic links get instant redirect to an invalid link page with error:
```
PGRST116: Cannot coerce the result to a single JSON object - The result contains 0 rows
```

## Root Causes Identified

### 1. ❌ **Service Role Key Mismatch (CRITICAL)**

**Location:** `.env.staging` line 19

**Issue:**
```
VITE_SUPABASE_URL=https://caerqjzvuerejfrdtygb.supabase.co  ✓ Staging
SUPABASE_SERVICE_ROLE_KEY=eyJ...wbgmnyekgqklggilgqag...      ✗ Different project!
```

The service role key is from project `wbgmnyekgqklggilgqag` but the URL points to `caerqjzvuerejfrdtygb`.

**Impact:**
- All service role queries fail with "Invalid API key"
- Edge functions can't access database
- Invitations may not be created
- Token lookups fail even if invitations exist

**Fix:**
1. Go to https://supabase.com/dashboard/project/caerqjzvuerejfrdtygb/settings/api
2. Copy the `service_role` secret key (starts with `eyJ...`)
3. Update `.env.staging` line 19 with the correct key

---

### 2. ⚠️ **Base URL Detection Logic**

**Location:** `src/lib/services/invitationService.ts:72-74`

**Current code:**
```typescript
const baseUrl = typeof window !== 'undefined'
  ? window.location.origin
  : 'https://app.use60.com'; // Default to production URL
```

**Issue:**
- If admin creates invitation from `http://localhost:5175`, the email contains that URL
- External users can't access localhost links
- Staging should always use `https://staging.use60.com`

**Fix:** Use environment variable

```typescript
const baseUrl = typeof window !== 'undefined'
  ? window.location.origin
  : import.meta.env.VITE_PUBLIC_URL || 'https://app.use60.com';
```

Then in `.env.staging`:
```
VITE_PUBLIC_URL=https://staging.use60.com
```

---

### 3. ⚠️ **RLS Policy May Block Unauthenticated Lookups**

**Location:** `supabase/migrations/20260203000200_fix_organization_invitations_rls_policies.sql`

**Current SELECT policy:**
```sql
-- Allow users to view their own pending invitations using JWT email claim
OR (
  "accepted_at" IS NULL
  AND "expires_at" > "now"()
  AND "lower"(("email")::"text") = "lower"(("auth"."jwt"() ->> 'email')::text)
)
```

**Issue:**
- Requires `auth.jwt()` to extract email
- Unauthenticated users clicking magic links don't have a JWT yet
- Token lookup may be blocked by RLS

**Fix:** Add policy to allow public token lookup

```sql
-- Allow anyone to look up invitations by token (for magic link acceptance)
CREATE POLICY "Allow public token lookup for invitation acceptance"
ON organization_invitations
FOR SELECT
TO public
USING (
  accepted_at IS NULL
  AND expires_at > NOW()
);
```

**Note:** This is safe because:
- Only returns invitations that haven't been accepted
- Only returns non-expired invitations
- Token is a 256-bit cryptographically random value (impossible to guess)
- Invitation details aren't sensitive (just email, org name, role)

---

### 4. ⚠️ **Single() vs MaybeSingle()**

**Location:** `src/lib/services/invitationService.ts:365-414`

**Current code:**
```typescript
.single();  // ← Throws PGRST116 if 0 rows
```

**Issue:**
- `.single()` throws an error if no rows match
- This creates a poor error message for users
- Should use `.maybeSingle()` and handle null case gracefully

**Fix:**
```typescript
.maybeSingle();  // ← Returns null if 0 rows
```

Then handle null:
```typescript
if (!data) {
  return {
    data: null,
    error: 'Invitation not found, expired, or already used'
  };
}
```

---

## Implementation Plan

### Phase 1: Immediate Fixes (Required)

**Task 1.1:** Fix staging service role key
- [ ] Get correct key from Supabase dashboard
- [ ] Update `.env.staging` line 19
- [ ] Redeploy edge functions with correct key

**Task 1.2:** Fix base URL detection
- [ ] Update `invitationService.ts:72-74` to use env var
- [ ] Add `VITE_PUBLIC_URL=https://staging.use60.com` to `.env.staging`
- [ ] Test invitation creation

**Task 1.3:** Fix error handling
- [ ] Change `.single()` to `.maybeSingle()` in `getInvitationByToken()`
- [ ] Add user-friendly error messages

### Phase 2: RLS Policy Fix (If needed)

**Task 2.1:** Add public token lookup policy
- [ ] Create migration for new RLS policy
- [ ] Test unauthenticated token lookup
- [ ] Deploy to staging

### Phase 3: Testing

**Test 3.1:** Create invitation in staging
- [ ] Login to staging as org admin
- [ ] Invite a test user
- [ ] Verify invitation record created in database
- [ ] Verify email sent with correct staging URL

**Test 3.2:** Accept invitation
- [ ] Click magic link from email
- [ ] Verify token lookup succeeds
- [ ] Verify invitation acceptance flow works
- [ ] Verify user added to organization

**Test 3.3:** Edge cases
- [ ] Test expired invitation (shows proper error)
- [ ] Test already-used invitation (shows proper error)
- [ ] Test invalid token (shows proper error)

---

## Quick Diagnostic Commands

### Check if invitations exist in staging DB:
```bash
# Using Supabase CLI
supabase db --project-ref caerqjzvuerejfrdtygb psql -c "
  SELECT
    email,
    token,
    expires_at,
    accepted_at,
    created_at
  FROM organization_invitations
  ORDER BY created_at DESC
  LIMIT 5;
"
```

### Test magic link URL:
```bash
# Get the most recent invitation token
# Then visit: https://staging.use60.com/invite/{token}
```

### Check email logs:
```bash
supabase db --project-ref caerqjzvuerejfrdtygb psql -c "
  SELECT
    email_type,
    to_email,
    status,
    created_at,
    metadata->>'organization_name' as org
  FROM email_logs
  WHERE email_type = 'organization_invitation'
  ORDER BY created_at DESC
  LIMIT 5;
"
```

---

## Files to Modify

1. **`.env.staging`** (line 19)
   - Fix service role key mismatch
   - Add VITE_PUBLIC_URL

2. **`src/lib/services/invitationService.ts`** (lines 72-74, 365-414)
   - Use env var for base URL
   - Change `.single()` to `.maybeSingle()`
   - Improve error messages

3. **`supabase/migrations/YYYYMMDD_allow_public_invitation_lookup.sql`** (new file)
   - Add RLS policy for public token lookup

---

## Expected Behavior After Fix

### Creating Invitation:
1. Admin clicks "Invite Team Member" in settings
2. Enters email: `test@example.com`
3. Invitation created with:
   - Random 64-char token
   - Expires in 7 days
   - Stored in staging database

### Sending Email:
4. Edge function called with Bearer token
5. Fetches email template from database
6. Replaces `{{action_url}}` with `https://staging.use60.com/invite/{token}`
7. Sends via AWS SES
8. Logs email send to `email_logs` table

### Accepting Invitation:
9. User clicks link from email
10. Browser opens `https://staging.use60.com/invite/{token}`
11. Frontend extracts token from URL
12. Calls `getInvitationByToken(token)`
13. Query succeeds (finds matching row)
14. Shows invitation details with "Accept" button
15. User clicks Accept
16. Membership created
17. User redirected to dashboard

---

## Next Steps

1. **Get correct staging service role key** from Supabase dashboard
2. **Update `.env.staging`** with correct key
3. **Test invitation creation** to verify database access works
4. **Inspect invitation record** to see what URL was stored
5. **Test magic link** to verify token lookup works

Once you provide the correct service role key or confirm you've updated it, I can help test the full flow and implement any additional fixes needed.
