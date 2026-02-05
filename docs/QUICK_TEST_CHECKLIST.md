# Quick Test Checklist - Waitlist Invitation Flow

## 5-Minute Sanity Check

Before running full test scenarios, verify basic functionality:

### Step 1: Admin Panel Access
- [ ] Navigate to admin waitlist management page
- [ ] Page loads without errors
- [ ] Can see list of waitlist entries
- [ ] All entries have "Pending" or "Released" status

### Step 2: Send Single Invitation
**Entry:** Use any pending entry from the waitlist

**Action:**
1. Click the checkmark button next to a pending entry
2. Wait 2-3 seconds

**Expected Results:**
- [ ] Button is disabled while processing
- [ ] Toast appears: "Invitation sent to [email]"
- [ ] No error toast
- [ ] Console shows: `[grantAccess] → "success"`

**If Failed:**
- Check console for error messages
- Check network tab for grantAccess function call
- Verify edge function deployed in Supabase dashboard

### Step 3: Database Check
**Run in Supabase SQL Editor:**
```sql
SELECT email, status, invited_at
FROM meetings_waitlist
WHERE email = '[the email you just invited]'
LIMIT 1;
```

**Expected:**
- [ ] status = 'released' (not 'converted' yet)
- [ ] invited_at = recent timestamp
- [ ] user_id = NULL (hasn't signed up yet)

### Step 4: Email Check
**Check email inbox** (Gmail, test account, or Mailtrap):

**Expected Email:**
- [ ] Subject: "Welcome to Sixty Seconds! Set Your Password"
- [ ] From: noreply@use60.com (or similar)
- [ ] Contains magic invitation link
- [ ] Link format: `https://app.use60.com/auth/callback?...`

**If Not Received:**
- Check spam folder
- Check Supabase Edge Functions logs for errors
- Verify encharge email service is configured

---

## 15-Minute Full Flow Test

### Setup (5 min)
1. [ ] Choose test email (e.g., `test-flow-1@gmail.com`)
2. [ ] Make sure inbox is empty or monitored
3. [ ] Have password ready (e.g., `TestPass123!@`)
4. [ ] Open browser DevTools (F12)

### Run Test (10 min)

#### Part A: Admin Sends Invitation (2 min)
1. [ ] Go to waitlist admin page
2. [ ] Find or create pending entry with test email
3. [ ] Click checkmark button
4. [ ] Verify toast: "Invitation sent to test-flow-1@gmail.com"
5. [ ] Check console: no errors

#### Part B: User Receives Email (2 min)
1. [ ] Check email inbox
2. [ ] Find "Welcome to Sixty Seconds" email
3. [ ] Copy invitation link
4. [ ] **Don't click yet** - we'll test in next step

#### Part C: User Sets Password (3 min)
1. [ ] Click invitation link
2. [ ] **Expected:** Redirected to password setup page
3. [ ] **If error:** Check browser console for auth errors
4. [ ] Set password
5. [ ] **Expected:** Logged in and redirected to onboarding/dashboard

#### Part D: Check Final Status (3 min)
1. [ ] Run SQL query:
   ```sql
   SELECT email, status, user_id, converted_at
   FROM meetings_waitlist
   WHERE email = 'test-flow-1@gmail.com'
   LIMIT 1;
   ```
2. [ ] **Expected:**
   - status = 'converted' (if completed onboarding)
   - user_id = not NULL (linked to auth user)
   - converted_at = recent timestamp

---

## Common Issues & Quick Fixes

### Issue: "Invitation sent" toast but no email received

**Quick Check:**
1. [ ] Did you check spam folder?
2. [ ] Is the email address correct in the waitlist?
3. [ ] Run this SQL:
   ```sql
   SELECT status, invited_at
   FROM meetings_waitlist
   WHERE email = '[your email]'
   ```
   - If `invited_at` is NULL → edge function didn't run
   - If `invited_at` is populated → email service issue

**Fixes:**
- Check Supabase Edge Functions logs: Dashboard → Edge Functions → send-waitlist-invitation
- Check email service logs (encharge dashboard)
- Verify email address isn't in bounce list

---

### Issue: Invitation link doesn't work

**Quick Check:**
1. [ ] Is the link format correct? Should start with `https://app.use60.com/auth/callback`
2. [ ] Check browser console for auth errors
3. [ ] Check Supabase logs: Dashboard → Logs → auth

**Fixes:**
- Clear browser cache and cookies
- Try in private/incognito window
- Check if token_hash is in URL: `?token_hash=...&type=magiclink`

---

### Issue: After password setup, user doesn't reach dashboard

**Quick Check:**
1. [ ] Open browser DevTools console
2. [ ] Look for errors in AuthCallback
3. [ ] Check if user is logged in: `console.log((await supabase.auth.getSession()).data.session)`

**Fixes:**
- Check onboarding completion status:
  ```sql
  SELECT * FROM user_onboarding_progress
  WHERE user_id = '[user id]'
  ```
- If no record: user hasn't completed onboarding
- If record exists but no `onboarding_completed_at`: user is stuck in onboarding

---

### Issue: Waitlist entry status still "released" (not "converted")

**Quick Check:**
1. [ ] Did user complete onboarding? Check:
   ```sql
   SELECT onboarding_completed_at, skipped_onboarding
   FROM user_onboarding_progress
   WHERE user_id = '[user id]'
   ```

**Fixes:**
- If NULL/false: user hasn't completed onboarding yet
- If populated: Dashboard should have auto-converted it
  - Check browser console on dashboard for `✅ Waitlist entry marked as converted`
  - Manually trigger by refreshing dashboard page
- Check DB directly to see if update is working:
  ```sql
  SELECT status, converted_at FROM meetings_waitlist
  WHERE user_id = '[user id]'
  ```

---

### Issue: User sees wrong onboarding flow

**For Corporate Email (e.g., @company.com):**
- [ ] Should skip website input
- [ ] Should NOT ask "What's your company website?"
- [ ] Should go straight to enrichment/skills

**For Personal Email (e.g., @gmail.com):**
- [ ] SHOULD see "What's your company website?" first
- [ ] If not: check user_metadata → `needs_website_input` should be true

**Fix:**
```javascript
// In console, check metadata:
(await supabase.auth.getUser()).data.user.user_metadata
// Should show: { needs_website_input: true }
```

---

## Detailed Console Debugging

Copy/paste these commands in browser console to debug:

### Check Current Auth State
```javascript
const { data: { user } } = await supabase.auth.getUser();
console.log('User:', {
  email: user?.email,
  confirmed: user?.email_confirmed_at,
  metadata: user?.user_metadata,
  created: user?.created_at,
});
```

### Check Waitlist Entry
```javascript
const { data: entry } = await supabase
  .from('meetings_waitlist')
  .select('*')
  .eq('email', '[your email]')
  .single();
console.log('Waitlist Entry:', entry);
```

### Check Onboarding Status
```javascript
const { data: { user } } = await supabase.auth.getUser();
const { data: progress } = await supabase
  .from('user_onboarding_progress')
  .select('*')
  .eq('user_id', user?.id)
  .single();
console.log('Onboarding Progress:', progress);
```

### Check Organization
```javascript
const { data: { user } } = await supabase.auth.getUser();
const { data: orgs } = await supabase
  .from('organization_memberships')
  .select('org_id, role')
  .eq('user_id', user?.id);
console.log('Organizations:', orgs);
```

### Enable Debug Logging
```javascript
// Enable verbose logging
localStorage.setItem('DEBUG_WAITLIST', 'true');
// Then check console for [AuthCallback], [grantAccess], etc.

// To see all logs:
// Reload page and watch console during auth flow
```

---

## Success Indicators

When everything is working, you'll see:

### In Browser Console
```
✅ [WaitlistTable] Invitation sent successfully
✅ [AuthCallback] Successfully linked waitlist entry
✅ [AuthCallback] Personal email detected: gmail.com
✅ [AuthCallback] Organization detection found existing org
✅ [Dashboard] Waitlist entry marked as converted
```

### In Admin UI
```
✅ Pending entry shows check button
✅ Click check → "Invitation sent to user@example.com" (green toast)
✅ Entry status changes to "Released"
```

### In User Email
```
✅ Email received within 30 seconds
✅ Subject: "Welcome to Sixty Seconds! Set Your Password"
✅ Link is clickable and formatted correctly
```

### In Database
```
✅ status: pending → released → converted
✅ invited_at: populated when sent
✅ converted_at: populated after signup
✅ user_id: linked to auth.users
```

---

## Need Help?

If tests fail:
1. [ ] Check IMPLEMENTATION_VALIDATION.md for known issues
2. [ ] Check Supabase Edge Functions logs
3. [ ] Check browser DevTools Network tab for API errors
4. [ ] Check Supabase Studio SQL for database state
5. [ ] Read WAITLIST_INVITATION_TEST_GUIDE.md for detailed scenarios

