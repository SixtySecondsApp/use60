# Quick Test Guide - Email Authentication Fix

## What Changed?

The `send-organization-invitation` edge function now uses a **custom secret** from `.env.staging` instead of platform JWT verification.

---

## Test It Locally

### 1. Start Your Dev Server
```bash
npm run dev
```

This loads `.env.staging` automatically.

### 2. Go to Team Members Page
- In your browser, go to: **http://localhost:5175** (or your staging URL)
- Login with your test account
- Navigate to: **Settings → Team Members**

### 3. Test Sending an Invitation

**Option A: Resend Existing Invitation**
1. Find a pending invitation in the list
2. Click the **"Resend Invite"** button
3. Check browser console (F12 → Console tab)

**Option B: Invite New Member**
1. Click **"Add Team Member"** button
2. Enter an email address
3. Select a role
4. Click **"Send Invite"**

### 4. Check for Success

**In Browser Console:**
```
✅ NO 401 error - Success!
✅ No "Unauthorized" messages
✅ May see success response
```

**In Email Inbox:**
```
✅ Email arrives from: staging@sixtyseconds.ai
✅ Subject: "[Name] invited you to join [Organization]"
✅ Email contains invitation link
```

---

## Expected Behavior

### Before Fix ❌
```
POST /functions/v1/send-organization-invitation → 401 Unauthorized
Error: Platform JWT verification fails
```

### After Fix ✅
```
POST /functions/v1/send-organization-invitation
Header: x-edge-function-secret: staging-email-secret-use60-2025-xyz789
→ 200 OK
→ Email sent successfully
```

---

## Verify in Network Tab

1. Open **DevTools** (F12)
2. Go to **Network** tab
3. Filter by: type **`fetch`**
4. Send an invitation
5. Look for: `send-organization-invitation` request
6. Click on it
7. Check **Headers** tab:

Should see:
```
x-edge-function-secret: staging-email-secret-use60-2025-xyz789
```

Response should be:
```
200 OK
{
  "success": true,
  "messageId": "..."
}
```

---

## Troubleshooting

### Still Getting 401 Error?

**Check 1: Is .env.staging loaded?**
```bash
# In your terminal, at project root
cat .env.staging | grep EDGE_FUNCTION_SECRET
# Should output: EDGE_FUNCTION_SECRET=staging-email-secret-use60-2025-xyz789
```

**Check 2: Did you restart dev server?**
```bash
# Kill: Ctrl+C
# Restart:
npm run dev
```

**Check 3: Is the header being sent?**
- DevTools → Network tab
- Find `send-organization-invitation` request
- Click "Headers" → scroll to "Request Headers"
- Look for: `x-edge-function-secret`

If it's not there:
- Your `.env.staging` isn't being read
- Restart dev server with fresh .env load

**Check 4: Browser cache issue?**
- Hard refresh: `Ctrl+Shift+R` (or `Cmd+Shift+R` on Mac)
- Or clear cache and reload

---

## Still Stuck?

If you still get 401:

1. **Check the edge function code was deployed**:
   - Did you run `git pull` to get the latest code?
   - Does your function have the `verifySecret()` function?

2. **Check the secret is correct**:
   - Frontend: `VITE_EDGE_FUNCTION_SECRET`
   - Edge function: `EDGE_FUNCTION_SECRET`
   - Both should be: `staging-email-secret-use60-2025-xyz789`

3. **Check Supabase logs**:
   - Go to https://supabase.com/dashboard/project/caerqjzvuerejfrdtygb
   - Logs → Functions
   - Look for `send-organization-invitation`
   - Check for error messages

---

## Success Indicators ✅

All of these should be true:

- [ ] No 401 error in browser console
- [ ] Email header has `x-edge-function-secret`
- [ ] Response is 200 OK
- [ ] Response includes `"success": true`
- [ ] Email arrives in inbox
- [ ] Can send multiple invitations
- [ ] Works for both resend and new invitations

---

## Performance Impact

This change has **no performance impact**:
- Same number of HTTP requests
- Same email delivery time
- Just swapped JWT verification for secret verification
- Secret check is instant (string comparison)

---

## Next Steps

Once verified locally:

1. **Deploy to staging**:
   ```bash
   git push origin fix/go-live-bug-fixes
   # CI/CD deploys automatically
   ```

2. **Test in staging**:
   - Go to staging URL
   - Repeat the invitation test
   - Verify it works in cloud

3. **Deploy to production**:
   - Create PR with your changes
   - Get approval
   - Merge to main
   - Deploy to production

---

## Summary

| Test | Expected | Your Result |
|------|----------|------------|
| No 401 error | ✅ | ? |
| Email arrives | ✅ | ? |
| Header sent | ✅ | ? |
| Response 200 OK | ✅ | ? |

Once all ✅, you're good to deploy!
