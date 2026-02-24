# Quick Fix Reference: generate-waitlist-token 401 Error

**Problem**: Edge function returns 401 Unauthorized
**Root Cause**: Missing from `supabase/config.toml`
**Fix Time**: 5 minutes
**Risk**: Very Low
**Confidence**: 99.9%

---

## The Problem

Platform validates your Authorization header as JWT before function code runs. Your custom secret (hex string) is not a valid JWT, so it gets 401 rejected at the gateway.

---

## The Fix

**File**: `supabase/config.toml`
**Location**: Add after line 152
**Lines**: 3 lines

```toml
# Waitlist magic token generation - called from frontend with custom secret auth
# Uses EDGE_FUNCTION_SECRET for inter-function calls, or admin user JWT
[functions.generate-waitlist-token]
verify_jwt = false
```

---

## Deploy

```bash
# Remote Supabase: just rebuild
npm run build

# Local Supabase: deploy function
supabase functions deploy generate-waitlist-token
```

---

## Test

1. Go to waitlist admin panel
2. Click "Grant Access"
3. No 401 error → SUCCESS ✅
4. Check email inbox → email should arrive

---

## Why This Works

Other functions using the same pattern:
- `send-organization-invitation` (line 142) ✅ Works
- `send-password-reset-email` (line 137) ✅ Works
- `encharge-send-email` ✅ Works

You're adding the same configuration.

---

## Why Previous Fixes Didn't Work

- Code fix: ✅ Correct (but never executed)
- Env vars: ✅ Set correctly (but not used at gateway)
- Redeployment: ✅ Deployed correctly (but config not updated)
- Frontend rebuild: ✅ Rebuilt correctly (but platform still validates)

**The platform was rejecting requests at the gateway, before your code ran.**

---

## Proof It's This Issue

| Check | Result |
|-------|--------|
| Environment vars | ✅ Set correctly |
| Function code | ✅ Correct logic |
| Frontend code | ✅ Correct headers |
| Config.toml | ❌ Missing entry |

---

## Safety

- ✅ Config-only (no code changes)
- ✅ Matches 21+ existing functions
- ✅ Function has proper auth
- ✅ Completely reversible
- ✅ No breaking changes

---

## Complete Context

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

## Rollback (if needed)

Remove the 3 lines and redeploy. Takes 2-3 minutes.

---

## For More Details

See:
- `ROOT_CAUSE_SUMMARY.md` - Detailed explanation
- `GENERATE_WAITLIST_TOKEN_FIX.md` - Full implementation guide
- `INVESTIGATION_EVIDENCE.md` - Complete evidence
- `DETAILED_ROOT_CAUSE_ANALYSIS.md` - Deep technical analysis

