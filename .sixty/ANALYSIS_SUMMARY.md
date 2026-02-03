# Email System Audit & Analysis Summary

**Date**: 2025-02-03
**Status**: Plan Created - Ready for Execution
**Severity**: Critical (Blocks Go-Live)

---

## Executive Summary

You have a **well-architected email system** with **one critical configuration bug** preventing team member invitations from working.

### The 401 Error Root Cause
```
send-organization-invitation edge function
├─ NOT in config.toml
├─ Defaults to verify_jwt = true
├─ Frontend doesn't send JWT
└─ Result: 401 Unauthorized ❌
```

**Fix**: Add 5 lines to `config.toml` (5 minutes)

---

## Critical Findings

### 🔴 Issues Found
1. **Missing config entry** for `send-organization-invitation` (causes 401 error)
2. **Hardcoded HTML** in `send-organization-invitation` (inconsistent with other emails)
3. **Missing templates** for `organization_invitation` and `user_created`
4. **Inconsistent styling** across email templates

### ✅ What's Working Well
- AWS SES integration is solid (7 working email functions)
- Database template system is mature
- Service architecture is clean
- Error handling is generally good
- Environment variables are properly configured

### ⚠️ Architecture Observations
- Multiple email providers (AWS SES primary, Encharge for tracking, Gmail API for user emails)
- Some functions call other functions (double-hop: `send-password-reset-email` → `encharge-send-email`)
- Email logs not always populated
- No health check for full email system

---

## Email Operations Audit

### All Email Functions (8 Sending)
| Function | Status | Auth | Uses Template |
|----------|--------|------|----------------|
| `encharge-send-email` | ✅ Works | Service role + JWT | Database ✅ |
| `send-password-reset-email` | ✅ Works | Config: verify_jwt=false | Database ✅ |
| `request-email-change` | ✅ Works | User JWT | Database ✅ |
| `handle-join-request-action` | ✅ Works | Service role | Database ✅ |
| `send-removal-email` | ✅ Works | Service role | Database ✅ |
| `send-waitlist-invitation` | ✅ Works | Service role | Database ✅ |
| `send-scheduled-emails` | ✅ Works | Gmail OAuth | N/A (Gmail API) |
| **send-organization-invitation** | ❌ **401 Error** | **Missing config** | **Hardcoded ❌** |

### Database Templates (Current)
| Template | Active | Variables | Status |
|----------|--------|-----------|--------|
| welcome | ✅ | first_name, user_name | ✅ |
| password_reset | ✅ | first_name, reset_link | ✅ |
| email_change_verification | ✅ | Multiple | ✅ |
| join_request_approved | ✅ | first_name, org_name | ✅ |
| join_request_rejected | ✅ | first_name, org_name | ✅ |
| member_removed | ✅ | Multiple | ✅ |
| **organization_invitation** | ❌ **Missing** | N/A | N/A |
| **user_created** | ❌ **Missing** | N/A | N/A |

### Environment Configuration
✅ **Status**: Properly configured for staging

```env
AWS_REGION=eu-west-2
AWS_ACCESS_KEY_ID=✅ Configured
AWS_SECRET_ACCESS_KEY=✅ Configured
SES_FROM_EMAIL=staging@sixtyseconds.ai
SES_FROM_NAME=Sixty Seconds (Staging)
```

**Note**: Resend API key not configured (AWS SES is primary).

---

## Comparison: Why Some Work, Others Don't

### send-password-reset-email ✅ (WORKS)
```toml
[functions.send-password-reset-email]
verify_jwt = false  ← Explicitly configured
```
- Frontend can call without JWT
- Function logs auth headers
- Email sends successfully

### send-organization-invitation ❌ (BROKEN)
```toml
[functions.send-organization-invitation]  ← MISSING from config!
```
- Defaults to verify_jwt = true
- Platform requires JWT
- Frontend doesn't provide one
- Result: 401 Unauthorized

### Solution
Add to config.toml:
```toml
[functions.send-organization-invitation]
verify_jwt = false
```

---

## Email Template Styling Analysis

### Current Styles
- **Organization Invitation**: Inline HTML, blue button (#3b82f6), light background (#f9fafb)
- **Password Reset**: Database template, styled HTML
- **Welcome**: Database template, styled HTML

**Issue**: Different style approaches. Should standardize.

### Proposed Standardization
All templates should:
- Use same color palette
- Use same button styling
- Use same typography
- Use same spacing
- Support dark mode
- Respect max-width: 600px

---

## Service Layer Integration

### Frontend Services Using Email
1. **invitationService.ts** (lines 44-87)
   - Calls `send-organization-invitation` edge function
   - Doesn't pass JWT (correct for public endpoint)
   - Currently silences 401 errors

2. **enchargeEmailService.ts**
   - Wrapper for transactional emails
   - Uses service role authentication

3. **emailInviteService.ts**
   - Bulk waitlist invitations
   - Has Resend fallback

---

## Execution Plan Summary

### 7 Stories Organized by Priority

**MVP (Go-Live Critical)** — 50 minutes
1. EMAIL-FIX-001: Fix config.toml (5 min) ⚡
2. EMAIL-FIX-002: Create org_invitation template (15 min)
3. EMAIL-FIX-003: Test the fix (10 min)
4. EMAIL-FIX-004: Refactor edge function (20 min)

**Full Scope** — 110 minutes (adds 60 more minutes)
5. EMAIL-FIX-005: Create user_created template (15 min)
6. EMAIL-FIX-006: Standardize all styling (25 min)
7. EMAIL-FIX-007: Add test utilities (20 min)

### Timeline
- **MVP completion**: ~1 hour (unblocks invitations)
- **Full completion**: ~2 hours (comprehensive audit + standardization)

---

## Recommendations

### Immediate (Before Go-Live)
1. ✅ Fix the 401 error (EMAIL-FIX-001)
2. ✅ Create missing templates (EMAIL-FIX-002)
3. ✅ Test in staging (EMAIL-FIX-003)
4. ✅ Refactor edge function (EMAIL-FIX-004)

### Short-term (Week 1)
5. Create user_created template for signup flow
6. Standardize email styling

### Medium-term (Week 2)
7. Add email test utilities for monitoring

---

## Key Files to Edit

| File | Changes | Time |
|------|---------|------|
| `supabase/config.toml` | Add 3 lines | 5 min |
| `supabase/migrations/*.sql` | Create 3 migrations | 45 min |
| `supabase/functions/send-organization-invitation/index.ts` | Refactor HTML | 20 min |
| `src/lib/services/testEmailService.ts` | New file | 20 min |

---

## Testing Strategy

### Unit Tests
- Template variables correctly substituted
- Fallback HTML works if template not found

### Integration Tests
- Frontend can invoke edge function
- Email arrives in staging inbox
- All 8+ templates accessible from database

### Manual Testing
- Send test invitation from TeamMembersPage
- Verify email styling in multiple clients
- Check console for errors

---

## Next Steps

1. **Review** this analysis and execution plan
2. **Confirm** you want to proceed with all 7 stories (or just MVP)
3. **Run** `/60-run` to start execution
4. **Monitor** via `/60-status` as you work

**Status**: ✅ Analysis complete, plan created, ready for execution

---

## Questions Answered

### Why 401?
Missing `verify_jwt = false` in config.toml. Platform requires JWT, frontend doesn't send one.

### Why no 401 on other emails?
They either:
- Have `verify_jwt = false` in config, OR
- Implement their own JWT validation inside the function

### Why refactor to database template?
Consistency. All other email functions use database templates for easy updates and A/B testing.

### Why standardize styling?
Professional appearance. Mismatched styles confuse users and look unprofessional.

### Why test utilities?
Monitoring and confidence. Easy to verify all email operations work without manual testing.

---

## AWS SES Configuration

**Current Setup** ✅
- Region: eu-west-2
- Credentials: Configured in .env.staging
- Sender: staging@sixtyseconds.ai
- Rate: Not limited in staging

**Health Check**:
```bash
curl https://app.use60.com/functions/v1/encharge-send-email?test=ses
```

Returns: SES quota, sent count, rate limit.

---

## Conclusion

You have a **mature, well-structured email system** with a **simple configuration bug** preventing one critical function from working. The fix is straightforward, and the execution plan provides both a quick path (50 min MVP) and comprehensive improvements (110 min full scope).

**Status**: Ready for implementation. Next step: `/60-run`
