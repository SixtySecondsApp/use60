# Waitlist Release Feature - Testing Guide

## ✅ Pre-Testing Checklist

- [x] Latest code pulled (commits f923e4c1 and 9bfb2949)
- [x] Edge functions deployed to staging
- [x] EDGE_FUNCTION_SECRET configured in Supabase
- [x] config.toml updated with verify_jwt = false

## 🧪 Testing Steps

### Test 1: Single User Release

**Objective:** Verify basic waitlist release functionality works without 401 error

**Steps:**
1. Open staging app in browser
2. Login as waitlist admin user
3. Navigate to **Waitlist Management** → **Admin Panel**
4. Find a user with status **"pending"**
5. Click the **"Release"** button
6. **Expected Result:**
   - ✅ No console errors
   - ✅ No "401 Unauthorized" message
   - ✅ User status changes to "released"
   - ✅ Toast notification: "User released successfully"
   - ✅ Invitation email is sent (check email backend)

**Failure Indicators:**
- ❌ `401 Unauthorized` error in console
- ❌ `Edge Function returned a non-2xx status code` error
- ❌ User status doesn't change
- ❌ No email sent

### Test 2: Bulk Release

**Objective:** Verify bulk release works (multiple users at once)

**Steps:**
1. In Waitlist Admin panel, select **2-3 pending users**
2. Click **"Release Selected"** button
3. **Expected Result:**
   - ✅ All selected users released
   - ✅ Invitation emails sent for all
   - ✅ User statuses updated to "released"
   - ✅ Progress indicator shows completion

### Test 3: Resend Invitation

**Objective:** Verify invitation resend works for released users

**Steps:**
1. Find a user with status **"released"**
2. Click **"Resend Invitation"** button
3. **Expected Result:**
   - ✅ New invitation email is sent
   - ✅ No 401 error
   - ✅ Success toast message

### Test 4: Error Handling

**Objective:** Verify error messages are clear and helpful

**Steps:**
1. Try releasing a user without email (if allowed)
2. Try releasing an already-released user
3. Try releasing with invalid data
4. **Expected Result:**
   - ✅ Clear error message
   - ✅ No generic/cryptic errors
   - ✅ User can retry

### Test 5: Network Conditions

**Objective:** Test behavior under slow/failed connections

**Steps:**
1. Open DevTools → Network tab
2. Set throttling to "Slow 3G"
3. Try releasing a user
4. **Expected Result:**
   - ✅ Request eventually succeeds
   - ✅ No timeout errors
   - ✅ Appropriate loading indicator shown

### Test 6: Browser Console

**Objective:** Verify no unexpected errors in console

**Steps:**
1. Open DevTools → Console tab
2. Clear console
3. Perform release operation
4. **Expected Result:**
   - ✅ No errors (should be clean)
   - ✅ No warnings related to auth
   - ✅ Normal info logs only

## 🔍 Verification Checklist

### Code Level
- [x] `supabase/config.toml` has `verify_jwt = false` for both functions
- [x] Edge function code checks EDGE_FUNCTION_SECRET first
- [x] Service layer sends Authorization header with secret
- [x] No hardcoded credentials in code

### Deployment Level
- [x] `generate-waitlist-token` deployed to staging
- [x] `encharge-send-email` deployed to staging
- [x] Functions show ACTIVE status
- [x] No deployment errors in logs

### Environment Level
- [x] `EDGE_FUNCTION_SECRET` set in Supabase project
- [x] `VITE_EDGE_FUNCTION_SECRET` in `.env` and `.env.staging`
- [x] Secret value matches across all locations

### API Level
- [x] Authorization header format: `Bearer <EDGE_FUNCTION_SECRET>`
- [x] Function code validates header correctly
- [x] No platform JWT validation blocking requests

## 📊 Test Results Template

```markdown
## Test Session: [Date/Time]

### Environment
- URL: [staging/production]
- Browser: [Chrome/Safari/Firefox]
- Network: [Normal/Throttled/VPN]

### Test Results
- [ ] Single User Release: PASS/FAIL
- [ ] Bulk Release: PASS/FAIL
- [ ] Resend Invitation: PASS/FAIL
- [ ] Error Handling: PASS/FAIL
- [ ] Network Conditions: PASS/FAIL
- [ ] Browser Console: PASS/FAIL

### Issues Found
1. [Issue description]
   - Severity: [Critical/High/Medium/Low]
   - Reproducible: [Yes/No]
   - Fix: [Description of fix]

### Sign-off
- Tested by: [Name]
- Date: [Date]
- Status: [APPROVED/NEEDS FIXES]
```

## 🚀 Go-Live Checklist

Only proceed to production after ALL of the following are true:

- [ ] All 6 tests passed in staging
- [ ] No errors in browser console
- [ ] Network throttling test passed
- [ ] Email backend confirmed sending invitations
- [ ] No regression in other waitlist features
- [ ] All team members who tested signed off
- [ ] Production config.toml updated with same changes
- [ ] Production edge functions deployed
- [ ] Production EDGE_FUNCTION_SECRET configured
- [ ] One final sanity test in production with test user

## 🆘 Troubleshooting

### Still Getting 401 Error?

1. **Verify config.toml is deployed**
   ```bash
   git log --oneline | grep config
   # Should show: f923e4c1 fix: Disable JWT verification...
   ```

2. **Verify functions are redeployed**
   ```bash
   npx supabase functions list --project-ref caerqjzvuerejfrdtygb | grep waitlist
   # Should show: generate-waitlist-token | ACTIVE
   ```

3. **Verify environment variable is set**
   ```bash
   npx supabase secrets list --project-ref caerqjzvuerejfrdtygb | grep EDGE
   # Should show: EDGE_FUNCTION_SECRET | [digest]
   ```

4. **Hard refresh browser**
   - Ctrl+Shift+R (or Cmd+Shift+R on Mac)
   - Clear browser cache entirely

5. **Check browser console**
   - Look for exact error message
   - Screenshot for analysis

### Email Not Sending?

1. Verify `encharge-send-email` is deployed with `verify_jwt = false`
2. Check email template exists in database
3. Check AWS SES credentials are valid
4. Verify email logs in database

### Rate Limiting Errors?

1. Check if multiple rapid requests
2. Add delay between operations
3. Verify request headers include proper auth

## 📞 Support

If issues persist:
1. Check console errors exactly
2. Note the exact time and operation
3. Check Supabase function logs (Dashboard → Functions → Logs)
4. Share error message verbatim in report

---

**Ready to test!** Follow these steps in order and document results. 🎯
