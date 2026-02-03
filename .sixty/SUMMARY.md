# Email System Standardization - Executive Summary

**Status**: Plan Created & Ready to Execute
**Priority**: CRITICAL (Go-live blocking)
**Estimated Effort**: 2.5 hours
**Branch**: fix/go-live-bug-fixes

---

## What's Being Fixed

### Critical Bugs (Must Fix First)
1. **Column name bug** in `waitlist-welcome-email` - queries `html_template` but schema has `html_body`
2. **Missing authentication** on `waitlist-welcome-email` - completely open endpoint, anyone can send emails

### System Issues (Causing Maintenance Burden)
3. **Code duplication** - AWS SES signing code copied in 2 places
4. **Duplicate function** - `send-waitlist-welcome` is just a wrapper around `encharge-send-email`
5. **Inconsistent authentication** - 4 different auth patterns across email functions
6. **Inconsistent variables** - Same URL called `action_url`, `invitation_link`, and `magic_link`
7. **Incomplete logging** - Only `encharge-send-email` logs emails; others don't track anything

---

## Execution Plan (8 Stories)

### Phase 1: Critical Fixes (15 min) ⚠️ DO FIRST
- **EMAIL-001**: Fix html_template → html_body (5 min)
- **EMAIL-002**: Add EDGE_FUNCTION_SECRET auth to waitlist-welcome-email (10 min)

### Phase 2: Consolidation (35 min)
- **EMAIL-003**: Remove duplicate AWS SES code (20 min)
- **EMAIL-004**: Delete send-waitlist-welcome wrapper function (15 min)

### Phase 3: Standardization (60 min)
- **EMAIL-005**: Standardize auth pattern across all functions (25 min)
- **EMAIL-006**: Standardize template variable names (20 min)
- **EMAIL-007**: Add logging to all email functions (15 min)

### Phase 4: Verification (20 min)
- **EMAIL-008**: Integration test all three email flows (20 min)

---

## Key Changes

### Authentication
**Before**: 4 different patterns (JWT, service role, no auth, inline verification)
**After**: Single pattern - `EDGE_FUNCTION_SECRET` header with fallback to service role

### Code Duplication
**Before**: AWS SES signing code in 2+ places
**After**: Single implementation in `_shared/ses.ts`, all functions import it

### Template Variables
**Before**: Inconsistent naming (user_name vs first_name, action_url vs invitation_link vs magic_link)
**After**: Standard names everywhere (recipient_name, action_url, organization_name, etc.)

### Email Logging
**Before**: Only `encharge-send-email` logs to `email_logs` table
**After**: All email sends logged consistently

---

## Files Generated

```
.sixty/
├── plan.json                      # Structured execution plan with all 8 stories
├── IMPLEMENTATION_GUIDE.md        # Step-by-step instructions for each story
├── STANDARDIZATION_GUIDE.md       # Complete reference guide (from analysis)
└── SUMMARY.md                     # This file
```

---

## What Gets Fixed

### Email Type 1: Organization Invitations
✅ Authentication standardized to EDGE_FUNCTION_SECRET
✅ Uses standard variable names (recipient_name, action_url, etc.)
✅ Logged to email_logs table
✅ Uses _shared/ses.ts for sending

### Email Type 2: Waitlist Welcome
✅ Column name bug fixed (html_template → html_body)
✅ Authentication added (was completely open)
✅ Duplicate function eliminated
✅ AWS SES code consolidated
✅ Uses standard variable names
✅ Logged to email_logs table

### Email Type 3: Early Access / Waitlist Invite
✅ Authentication standardized
✅ Variable aliasing removed (single action_url instead of 3 names)
✅ Uses standard variable names
✅ Logged to email_logs table

---

## How to Proceed

### Option A: Self-Execute
1. Read `IMPLEMENTATION_GUIDE.md`
2. Follow step-by-step instructions for each of 8 stories
3. Run integration test (EMAIL-008) to verify everything works
4. Commit and deploy

### Option B: Request Implementation
Ask Claude to implement all stories with code changes ready to commit.

---

## Risk Assessment

### Risks: VERY LOW
- Email failures are **non-blocking** in invitationService (graceful degradation)
- All changes are **internal to edge functions**
- System continues operating even if emails fail
- Can be tested thoroughly in staging before production

### Rollback: SIMPLE
- Just revert the commit
- No database migrations needed
- No breaking changes to APIs

---

## Success Criteria

All three email types work reliably:
✅ Organization invitations send via AWS SES
✅ Waitlist welcome emails send via AWS SES
✅ Early access/waitlist invite emails send via AWS SES
✅ All sends logged to email_logs table
✅ All functions use consistent auth pattern (EDGE_FUNCTION_SECRET)
✅ All functions use consistent variable names
✅ No code duplication

---

## Timeline

**If self-executing**: ~2.5 hours of work
**If requesting implementation**: Can be done in single coding session

---

## Next Steps

1. Review this summary
2. Read IMPLEMENTATION_GUIDE.md (detailed instructions)
3. Either:
   - Execute stories EMAIL-001 through EMAIL-008 yourself, OR
   - Ask Claude to implement all changes and provide code ready to commit

**All the information you need is in the .sixty/ directory files.**
