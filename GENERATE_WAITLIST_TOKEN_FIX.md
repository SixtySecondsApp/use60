# Fix: generate-waitlist-token 401 Unauthorized

**Status**: Ready to Implement
**Time Required**: 15 minutes (5 min fix + 10 min test)
**Risk Level**: Minimal (config-only change)

---

## The Problem

The `generate-waitlist-token` edge function returns **401 Unauthorized** because it's missing from `supabase/config.toml`. When a function is missing from config, Supabase defaults to `verify_jwt = true`, which validates the Authorization header as a JWT at the platform level, BEFORE the function code runs.

Your code sends `Authorization: Bearer <64-char-hex-string>` (the custom EDGE_FUNCTION_SECRET), which is not a valid JWT, so the platform rejects it with 401 before your function authentication code even executes.

---

## The Solution (5 Minutes)

### File: `supabase/config.toml`

**Add these 3 lines after line 152** (after the `test-auth` entry):

```toml
# Waitlist magic token generation - called from frontend with custom secret auth
[functions.generate-waitlist-token]
verify_jwt = false
```

### Complete Context:

```toml
# Test auth endpoint - for debugging JWT issues
[functions.test-auth]
verify_jwt = false

# Waitlist magic token generation - called from frontend with custom secret auth
# Uses EDGE_FUNCTION_SECRET for inter-function calls, or admin user JWT
[functions.generate-waitlist-token]
verify_jwt = false
```

---

## Why This Works

| Step | What Happens |
|------|--------------|
| 1 | Frontend sends: `Authorization: Bearer <EDGE_FUNCTION_SECRET>` |
| 2 | Platform checks config.toml for `generate-waitlist-token` |
| 3 | **Before Fix**: Not found → defaults to `verify_jwt=true` → rejects as invalid JWT |
| 4 | **After Fix**: Found → sees `verify_jwt=false` → skips JWT validation |
| 5 | Platform passes request to function |
| 6 | Function checks the EDGE_FUNCTION_SECRET itself |
| 7 | Secret matches → generates token ✅ |

---

## Deploy (5-10 Minutes)

### Option A: Remote Supabase (Recommended)
```bash
# Just rebuild the frontend
npm run build
# Or push to main - config picked up automatically
```

### Option B: Local Supabase CLI
```bash
supabase functions deploy generate-waitlist-token
```

---

## Test (5 Minutes)

1. Navigate to waitlist admin panel
2. Click "Grant Access" on a pending entry
3. Check browser console (F12) - should NOT see 401 error
4. Verify email arrives in inbox
5. Confirm entry status changes to 'released'

---

## Why Previous Fixes Didn't Work

- ✅ Code fix was correct (but never ran - blocked at platform)
- ✅ Environment variables were set (but platform didn't use them)
- ✅ Function redeployed (but config not updated)
- ✅ Frontend rebuilt (but platform still validating JWT)

**The platform was rejecting requests at the JWT validation gate, before your function code could execute.**

---

## Comparison: Why It Works for Other Functions

**send-organization-invitation** (WORKS ✅):
```toml
[functions.send-organization-invitation]
verify_jwt = false
```

**generate-waitlist-token** (BROKEN ❌):
```
(not in config at all - defaults to verify_jwt = true)
```

You're just adding the same config pattern that already works for similar functions.

---

## Validation

After making the change:

```bash
# Verify the config was added
grep -A 1 "generate-waitlist-token" supabase/config.toml

# Output should be:
# [functions.generate-waitlist-token]
# verify_jwt = false
```

---

## Safety Notes

✅ **Safe to do because:**
- Configuration-only change (no code changes)
- Matches existing pattern in codebase (21+ other functions use `verify_jwt = false`)
- Function already has proper authentication logic
- Completely reversible (just remove the 3 lines)
- No breaking changes

---

## Summary

| Metric | Value |
|--------|-------|
| **Root Cause** | Missing config entry (not code or env vars) |
| **Files Changed** | 1: `supabase/config.toml` |
| **Lines Added** | 4 (3 content + 1 blank) |
| **Implementation Time** | 5 minutes |
| **Test Time** | 5-10 minutes |
| **Risk** | Very Low |
| **Rollback** | 2 minutes (remove 3 lines) |

---

## Next Step

**Edit `supabase/config.toml`** and add those 3 lines. Done! 🎉

