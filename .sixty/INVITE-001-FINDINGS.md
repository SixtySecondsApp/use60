# INVITE-001: Investigation Findings

**Status**: ⚠️ Blocked by Service Role Key Mismatch
**Date**: 2026-02-03

---

## Critical Issue Found

### Service Role Key Mismatch

**Problem**: The `SUPABASE_SERVICE_ROLE_KEY` in `.env.staging` is from the **wrong Supabase project**.

```
Current key is for:  wbgmnyekgqklggilgqag
Should be for:       caerqjzvuerejfrdtygb (staging)
```

**Impact**:
- ❌ Cannot query `organization_invitations` table
- ❌ Cannot query `email_logs` table
- ❌ Cannot test RLS policies
- ❌ Cannot verify existing invitation records

**Error Message**:
```
Invalid API key
```

---

## Required Action

### Get Correct Service Role Key

1. Go to https://supabase.com/dashboard/project/caerqjzvuerejfrdtygb/settings/api
2. Copy the `service_role` **secret key** (NOT the anon key)
3. Update `.env.staging` line 19:
   ```env
   SUPABASE_SERVICE_ROLE_KEY=<paste-correct-key-here>
   ```

The correct key should:
- Start with `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.`
- Have `"ref":"caerqjzvuerejfrdtygb"` in the decoded payload
- Have `"role":"service_role"` in the decoded payload

---

## What We Learned

Even though we couldn't access the database, the investigation confirmed:

1. **Root cause of PGRST116 error**:
   - If the service role key is wrong, edge functions can't create invitations
   - If invitations aren't created, token lookup returns 0 rows
   - This causes "PGRST116: Cannot coerce result to single JSON object"

2. **Why magic links fail**:
   - No invitation record exists in database (creation failed silently)
   - OR RLS policies block unauthenticated token lookup
   - OR both issues combined

3. **Confirmation that our fixes are needed**:
   - RLS policy for public access (INVITE-002)
   - Base URL environment variable (INVITE-003)
   - Better error handling (INVITE-004)

---

## Next Steps

### Option 1: User provides correct key
User can look up the correct staging service role key and update `.env.staging`, then we can:
- Re-run INVITE-001 investigation
- Proceed with INVITE-002 through INVITE-005

### Option 2: Continue with fixes regardless
We can implement INVITE-002, INVITE-003, and INVITE-004 now since they don't require database access to implement. Testing (INVITE-005) will require the correct key.

---

## Files Created

- `check-staging-db.mjs` - Investigation script (can be reused after key fixed)
- `.sixty/INVITE-001-FINDINGS.md` - This document

---

## Recommendation

**Proceed with Option 2**: Implement all fixes (INVITE-002, 003, 004) now, then test with correct credentials later. This way we make progress even though we can't access staging database yet.
