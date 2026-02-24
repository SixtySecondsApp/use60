# Bug Report: invite-user-401
Generated: 2026-02-11
Reported Error: "401 Unauthorized - Invalid JWT when calling invite-user edge function"

## Symptom Analysis
- **Error**: POST https://caerqjzvuerejfrdtygb.supabase.co/functions/v1/invite-user returns 401
- **Message**: {"code":401,"message":"Invalid JWT"}
- **Trigger**: Attempting to invite a user from admin panel
- **Environment**: Staging (caerqjzvuerejfrdtygb.supabase.co)
- **Scope**: Blocks all user invitations

## Root Cause

The `invite-user` edge function is failing JWT validation at line 52:

```typescript
const { data: { user: adminUser }, error: userError } = await supabaseAdmin.auth.getUser(token)
```

## Likely Causes (Priority Order)

### BUG-001 [P0] Edge Function Not Deployed
**Severity**: 🔴 Critical
**Confidence**: 85%

The edge function may not be deployed to the staging environment.

**Evidence**:
- We just modified the frontend code to call the edge function
- We just added the config.toml entry for invite-user
- No deployment was performed after these changes

**Fix**:
```bash
# Deploy the invite-user function to staging
supabase functions deploy invite-user --project-ref caerqjzvuerejfrdtygb
```

**Test**:
- Try inviting a user after deployment
- Check Supabase logs for the function execution

---

### BUG-002 [P1] Invalid or Expired JWT
**Severity**: 🟠 High
**Confidence**: 60%

The user's JWT may be expired, malformed, or from a different environment.

**Evidence**:
- Generic "Invalid JWT" error message
- No specific error details from edge function

**Fix**:
1. User should log out completely
2. Clear browser localStorage
3. Log back in
4. Try inviting again

**Test**:
- Check browser DevTools > Application > Local Storage
- Look for `sb-caerqjzvuerejfrdtygb-auth-token` key
- Verify token is present and recent

---

### BUG-003 [P2] Missing Environment Variable in Edge Function
**Severity**: 🟡 Medium
**Confidence**: 40%

The edge function may not have access to `SUPABASE_SERVICE_ROLE_KEY` in the Supabase project settings.

**Evidence**:
- Edge functions get env vars from Supabase dashboard
- Local .env files don't affect deployed functions

**Fix**:
1. Go to Supabase Dashboard
2. Select project: caerqjzvuerejfrdtygb
3. Settings > Edge Functions > Secrets
4. Verify `SUPABASE_SERVICE_ROLE_KEY` is set
5. If missing, add it from Settings > API > service_role key

**Test**:
- Check Supabase logs for edge function errors
- Look for "SUPABASE_SERVICE_ROLE_KEY undefined" messages

---

### BUG-004 [P2] JWT Validation Logic Issue
**Severity**: 🟡 Medium
**Confidence**: 20%

The edge function's JWT validation might have an issue with how it verifies tokens.

**Evidence**:
- `auth.getUser(token)` on service role client should work
- But implementation might have edge cases

**Fix**:
Review edge function JWT validation (lines 50-56):
```typescript
const token = authHeader.replace('Bearer ', '')
const { data: { user: adminUser }, error: userError } = await supabaseAdmin.auth.getUser(token)

if (userError || !adminUser) {
  // Add more specific error logging
  console.error('[invite-user] JWT validation failed:', {
    hasToken: !!token,
    tokenLength: token?.length,
    errorMessage: userError?.message,
    errorStatus: userError?.status
  })
  throw new Error(`Invalid token: ${userError?.message || 'Unknown error'}`)
}
```

**Test**:
- Check Supabase logs for detailed error messages
- Verify token format and structure

---

## Execution Plan

### Phase 1: Quick Fixes (Est: 5 min)
1. **Deploy edge function**
   ```bash
   cd C:\Users\Media 3\Desktop\Max-Projects\sixty-sales-dashboard
   supabase functions deploy invite-user --project-ref caerqjzvuerejfrdtygb
   ```

2. **Test invitation flow**
   - Go to admin panel
   - Try inviting a user
   - Check if 401 error persists

### Phase 2: Verification (Est: 3 min)
3. **If still failing, check Supabase logs**
   ```bash
   supabase functions logs invite-user --project-ref caerqjzvuerejfrdtygb
   ```

4. **Verify environment variables**
   - Go to Supabase Dashboard > Settings > Edge Functions > Secrets
   - Confirm SUPABASE_SERVICE_ROLE_KEY is set

### Phase 3: User Session Reset (Est: 2 min)
5. **If still failing, reset user session**
   - Log out from the app
   - Clear browser cache and localStorage
   - Log back in
   - Try invitation again

### Phase 4: Debug Mode (If needed)
6. **Add detailed logging to edge function**
   - Modify invite-user/index.ts to log more details
   - Redeploy and test
   - Analyze logs for specific failure point

---

## Test Plan

After fix, verify:

- [ ] User invitation succeeds without 401 error
- [ ] Invitation email is sent
- [ ] New user appears in users list
- [ ] Edge function logs show successful execution
- [ ] Admin check passes correctly
- [ ] Profile creation succeeds
- [ ] Zombie auth cleanup works (if applicable)

---

## Prevention

To prevent similar issues:

1. **Always deploy edge functions after modifying them**
2. **Verify deployment with `supabase functions list`**
3. **Check Supabase logs immediately after deployment**
4. **Test with actual user session, not just Postman/curl**
5. **Add comprehensive error logging to edge functions**

---

## Related Files

- `supabase/functions/invite-user/index.ts` - Edge function code
- `src/lib/hooks/useUsers.ts` - Frontend inviteUser function (line 521-610)
- `supabase/config.toml` - Edge function configuration
- `.env.staging` - Environment variables

---

## Notes

- The edge function was recently modified to call Supabase directly instead of /api route
- Config.toml entry was just added for invite-user
- No deployment was performed after these changes
- This is the most likely cause of the 401 error
