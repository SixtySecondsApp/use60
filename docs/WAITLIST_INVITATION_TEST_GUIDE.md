# Waitlist Invitation Flow - Testing Guide

## Pre-Test Setup

### Environment
- **Dev Server:** http://localhost:5175
- **Supabase Project:** ygdpgliavpxeugaajgrb (production)
- **Testing Duration:** 15-30 minutes per test scenario

### Prerequisites
1. ✅ Admin account with access to waitlist management
2. ✅ Multiple test email addresses (at least 3):
   - Corporate email: `test-corporate@acme.com` (corporate domain)
   - Personal email 1: `test-personal-1@gmail.com`
   - Personal email 2: `test-personal-2@yahoo.com`
3. ✅ Access to email inbox (or email testing service like Mailtrap)
4. ✅ Database access to verify waitlist_entry status changes

---

## Test Scenarios

### Test 1: Basic Invitation Flow (HIGH PRIORITY)
**Goal:** Verify admin can send invitation and user receives email

**Steps:**
1. Navigate to admin waitlist management page
2. Add new test entry or find existing pending entry
3. Click check button next to pending entry
4. **Expected Result:**
   - ✅ Success toast: "Invitation sent to test@example.com"
   - ✅ Waitlist entry status in DB: still 'released' (not yet converted)
   - ✅ User receives branded email with subject: "Welcome to Sixty Seconds! Set Your Password"
   - ✅ Email contains magic invitation link

**Debug Points:**
```javascript
// Check browser console for logs:
[AuthCallback] → "Successfully linked waitlist entry"
[grantAccess] → "Invitation sent successfully"

// Check database:
SELECT id, email, status, invited_at
FROM meetings_waitlist
WHERE email = 'test@example.com'
-- Status should be: 'released'
-- invited_at should be: NOW()
```

**Common Issues:**
- No email received → Edge function not deployed or email service down
- Toast shows error → Check `grantAccess` error message in network tab
- Wrong email format → Check invitation template in edge function

---

### Test 2: Corporate Email + No Existing Organization
**Goal:** User from new company domain creates organization

**Email:** `test-corporate@newstartup.com` (new domain)

**Steps:**
1. Send invitation to corporate email
2. User clicks email link → redirected to /auth/callback?waitlist_entry=...
3. **Expected:** Redirected to password setup
4. Set password
5. **Expected:** Redirected to /onboarding/v2
6. Check organization detection:
   - No existing org with "newstartup.com" domain
   - Should skip website input (corporate email)
   - Should go through onboarding
7. Complete onboarding steps
8. **Expected:** Redirected to /dashboard

**Verification:**
```sql
-- In Supabase:
SELECT id, email, status, user_id, converted_at
FROM meetings_waitlist
WHERE email = 'test-corporate@newstartup.com'
-- Status should be: 'converted'
-- converted_at should be: populated with timestamp
-- user_id should be: linked to auth user

SELECT id, domain, user_id
FROM organizations
WHERE user_id IN (SELECT id FROM auth.users WHERE email = 'test-corporate@newstartup.com')
-- Domain should be: 'newstartup.com'
```

---

### Test 3: Corporate Email + Existing Organization
**Goal:** User joins existing organization by domain

**Setup:**
1. Create/find organization with domain "acme.com"
2. Create first user: `alice@acme.com` (owner)
3. Send invitation to: `bob@acme.com` (same domain)

**Steps:**
1. Bob clicks invitation link → password setup
2. Sets password
3. **Expected:** AuthCallback detects existing org
4. Bob added as 'member' to existing acme.com organization
5. Auto-created organization (from trigger) is deleted
6. Bob redirected to /dashboard (skips onboarding)
7. Bob sees Alice's data (shared organization)

**Verification:**
```sql
-- In Supabase:
SELECT * FROM organization_memberships
WHERE user_id IN (SELECT id FROM auth.users WHERE email = 'bob@acme.com')
-- Should have ONE membership
-- role should be: 'member' (not 'owner')
-- org_id should match Alice's organization

-- Check waitlist entry
SELECT status, converted_at FROM meetings_waitlist
WHERE email = 'bob@acme.com'
-- Status: 'converted'
```

---

### Test 4: Personal Email + Website Provided (IMPORTANT)
**Goal:** Personal email user provides company website in onboarding

**Email:** `test-personal@gmail.com`

**Steps:**
1. Send invitation to gmail.com email
2. User clicks link → password setup
3. Sets password
4. **Expected:** Redirected to /onboarding/v2
5. **Expected:** First step is "What's your company website?" (not enrichment)
6. User enters: "mycompany.com"
7. System checks if organization exists with mycompany.com:
   - If NEW: Creates organization with domain "mycompany.com"
   - If EXISTS: Shows "Request to Join" (don't need to test this scenario now)
8. Complete onboarding
9. **Expected:** Redirected to /dashboard

**Debug Points:**
```javascript
// Console logs to check:
[AuthCallback] Personal email detected: gmail.com, will request website input during onboarding
// User metadata should have: needs_website_input: true
```

**Verification:**
```sql
SELECT id, email, status FROM meetings_waitlist
WHERE email = 'test-personal@gmail.com'
-- Status: 'converted'
```

---

### Test 5: Personal Email + No Website (Q&A Flow)
**Goal:** Personal email user without website goes through Q&A

**Email:** `test-qa@yahoo.com`

**Steps:**
1. Send invitation
2. User clicks link → password setup
3. Sets password
4. **Expected:** Redirected to /onboarding/v2
5. **Expected:** Website input shown first
6. User clicks "I don't have a website yet"
7. **Expected:** Redirected to manual enrichment step
8. User answers questions:
   - Company name: "Test Company"
   - Industry: "SaaS"
   - Company size: "1-10"
9. Complete onboarding
10. **Expected:** Redirected to /dashboard

**Verification:**
```sql
SELECT * FROM organizations
WHERE id IN (
  SELECT org_id FROM organization_memberships
  WHERE user_id IN (SELECT id FROM auth.users WHERE email = 'test-qa@yahoo.com')
)
-- domain should be: NULL (no domain for manual Q&A)
-- Should have name, industry, size from user input
```

---

### Test 6: Waitlist Entry Status Tracking
**Goal:** Verify waitlist entries properly transition through statuses

**Scenario:** Send 3 invitations

**Steps:**
1. Before invitation:
   ```sql
   SELECT email, status FROM meetings_waitlist WHERE email IN (...)
   -- All should be: 'pending'
   ```

2. After admin clicks check button:
   ```sql
   -- Should be: 'released' (email sent)
   -- Check invited_at is populated
   ```

3. After user completes signup/onboarding:
   ```sql
   -- Should be: 'converted'
   -- Check converted_at is populated
   -- Check user_id is linked
   ```

---

### Test 7: Error Cases

#### 7a: Duplicate User
**Goal:** Verify error handling when user already exists

**Steps:**
1. Create user: `duplicate@test.com`
2. Try to send invitation to same email
3. **Expected:** Edge function returns error: "User with this email already exists"
4. **Expected:** Admin sees error toast
5. **Expected:** Waitlist entry status NOT changed

#### 7b: Invalid Email Address
**Goal:** Verify validation

**Steps:**
1. Try to send invitation to invalid email
2. **Expected:** Should not allow sending

#### 7c: Invitation Link Expiration
**Goal:** Verify expired links are handled

**Setup:**
1. Send invitation
2. Wait 7+ days (or manually update `invitation_expires_at` in DB to past date)
3. User clicks expired link
4. **Expected:** Error message: "Invitation link expired"

---

## Test Verification Checklist

### After Each Test Scenario
- [ ] User received email with correct subject
- [ ] Email contains valid invitation link
- [ ] User can click link without errors
- [ ] Password setup page loads
- [ ] User can set password
- [ ] Correct onboarding flow triggered (based on email type)
- [ ] Waitlist entry properly linked to user
- [ ] Status changed from 'released' to 'converted' after onboarding
- [ ] User successfully reaches dashboard
- [ ] No console errors or CORS issues

### Database Verification (Run These Queries)
```sql
-- Check all recent invitations
SELECT
  id,
  email,
  status,
  user_id,
  invited_at,
  converted_at,
  created_at
FROM meetings_waitlist
WHERE created_at > NOW() - INTERVAL '7 days'
ORDER BY created_at DESC;

-- Verify user linking
SELECT
  w.id as waitlist_id,
  w.email,
  w.status,
  w.user_id,
  u.email as user_email
FROM meetings_waitlist w
LEFT JOIN auth.users u ON w.user_id = u.id
WHERE w.email IN ('test-corporate@newstartup.com', 'test-personal@gmail.com', ...)
ORDER BY w.created_at DESC;

-- Check organization creation for personal emails
SELECT
  o.id,
  o.domain,
  o.created_at,
  u.email
FROM organizations o
JOIN organization_memberships om ON o.id = om.org_id
JOIN auth.users u ON om.user_id = u.id
WHERE u.email LIKE '%@gmail.com' OR u.email LIKE '%@yahoo.com'
ORDER BY o.created_at DESC;
```

---

## Success Criteria

✅ **All tests pass** when:

1. **Admin Flow:**
   - Admin can send invitations with one click
   - Toast confirms email sent
   - No database errors

2. **User Flow:**
   - User receives branded email
   - Email link works and redirects to password setup
   - User completes password setup
   - User is logged in after password setup

3. **Organization Detection:**
   - Corporate emails auto-join existing orgs (if domain matches)
   - Corporate emails create new orgs (if no domain match)
   - Personal emails trigger website input
   - Website input → organization creation

4. **Waitlist Status:**
   - Entry starts as 'pending'
   - Changes to 'released' when invitation sent
   - Changes to 'converted' after user completes onboarding
   - user_id linked to auth user
   - Timestamps (invited_at, converted_at) properly recorded

5. **No Errors:**
   - No console errors (except pre-existing CORS issues)
   - No database constraint violations
   - All async operations complete successfully

---

## Troubleshooting

### Issue: "Invitation sent" toast but user never receives email
**Check:**
- [ ] Is `send-waitlist-invitation` edge function deployed?
- [ ] Is `encharge-send-email` function working?
- [ ] Check Supabase Edge Functions logs
- [ ] Is email address in Supabase's bounce list?

### Issue: User clicks link but gets "Invitation expired" error
**Check:**
- [ ] Is `invitation_expires_at` column populated? (should be 7 days from invited_at)
- [ ] Check AuthCallback logs in console
- [ ] Verify token hash validation in Supabase auth

### Issue: User doesn't see organization after joining
**Check:**
- [ ] Is user actually in organization_memberships?
- [ ] Does organization exist in organizations table?
- [ ] Check RLS policies on organizations/organization_memberships

### Issue: Waitlist entry shows "pending" after sending invitation
**Check:**
- [ ] Edge function returned success?
- [ ] Check database directly: `SELECT * FROM meetings_waitlist WHERE email = ...`
- [ ] Is status field being updated correctly?

---

## Logging to Enable

Add these to browser console to debug:

```javascript
// See all waitlist-related logs
localStorage.setItem('DEBUG_WAITLIST', 'true');

// Then check console for messages tagged with [AuthCallback], [grantAccess], etc.
```

## Next Steps

After testing all scenarios:
1. [ ] Document any bugs found
2. [ ] Check email delivery rates
3. [ ] Monitor conversion rates from invitations
4. [ ] Get user feedback on onboarding flow
5. [ ] Monitor database for data consistency
