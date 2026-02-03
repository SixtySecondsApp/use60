# Email System Fix & Template Standardization - Execution Plan

**Created**: 2025-02-03
**Feature**: EMAIL-FIX
**Total Stories**: 7
**Estimated Time**: 1.5-2 hours (110 minutes)
**MVP Scope**: 4 stories, 50 minutes

---

## Overview

This plan addresses three critical issues with the email system:

1. **401 Unauthorized Error** on `send-organization-invitation` edge function
2. **Missing Database Templates** for organization invitations and new user welcome
3. **Inconsistent Styling** across all email templates

---

## Story Breakdown

### EMAIL-FIX-001: Fix the 401 Error (5 min) ⚡ CRITICAL

**Priority**: 1
**Type**: Configuration
**File**: `supabase/config.toml`

**Problem**: The `send-organization-invitation` edge function is not configured in `config.toml`, so it defaults to `verify_jwt = true`. The frontend doesn't send JWT tokens, causing 401 Unauthorized.

**Solution**: Add the function to config with `verify_jwt = false` (like `send-password-reset-email` at line 133-134).

**What to do**:
```toml
# Add after line 134:
[functions.send-organization-invitation]
verify_jwt = false
```

**Acceptance**:
- [ ] Section added to config.toml
- [ ] verify_jwt = false is set
- [ ] Comment added explaining function is public
- [ ] Frontend invocation works without 401

---

### EMAIL-FIX-002: Create organization_invitation Template (15 min) 🗄️ DATABASE

**Priority**: 2
**Type**: Database Migration
**File**: `supabase/migrations/add_organization_invitation_template.sql`
**Blocks**: EMAIL-FIX-004
**Parallel with**: EMAIL-FIX-005

**Problem**: Organization invitation emails use hardcoded HTML in the edge function. This is inconsistent with other emails which use database templates.

**Solution**: Create a new `organization_invitation` template in `encharge_email_templates` table.

**Template Details**:
- **Template Name**: `organization_invitation`
- **Subject**: `{{inviter_name}} invited you to join {{organization_name}}`
- **Variables**:
  - `{{recipient_name}}`
  - `{{organization_name}}`
  - `{{inviter_name}}`
  - `{{invitation_url}}`
  - `{{expiry_time}}`
- **Styling**: Match the welcome/password_reset templates

**Acceptance**:
- [ ] Template created in database
- [ ] Subject line includes variables
- [ ] HTML uses standardized styling
- [ ] All variables documented
- [ ] is_active = true
- [ ] Can be fetched by edge function

**Reference**: Look at existing `welcome` and `password_reset` templates for styling patterns.

---

### EMAIL-FIX-003: Test the Fix (10 min) ✅ VERIFICATION

**Priority**: 2
**Type**: Testing
**Depends on**: EMAIL-FIX-001

**What to do**:
1. Start staging environment (`npm run dev`)
2. Go to Team Members page
3. Click "Resend Invite" on any pending invitation
4. Check browser console for errors (should see no 401)
5. Verify email arrives (check staging email account)
6. Update CHANGELOG.md

**Acceptance**:
- [ ] No 401 error in console
- [ ] Email sent successfully
- [ ] Email arrives and displays correctly
- [ ] Changelog updated

---

### EMAIL-FIX-004: Refactor Edge Function (20 min) ⚙️ EDGE FUNCTION

**Priority**: 3
**Type**: Refactoring
**File**: `supabase/functions/send-organization-invitation/index.ts`
**Depends on**: EMAIL-FIX-002

**Problem**: The edge function has hardcoded HTML generation. Should fetch template from database like other email functions.

**Solution**:
1. Query `encharge_email_templates` table for `organization_invitation` template
2. Replace `{{variable}}` placeholders with actual values
3. Keep existing AWS SES call
4. Keep fallback HTML in case template not found

**Acceptance**:
- [ ] Function fetches template from database
- [ ] Hardcoded HTML generation removed
- [ ] Variables properly substituted
- [ ] AWS SES call unchanged
- [ ] Fallback HTML still present
- [ ] Email styling identical to current

**Reference**: Look at `encharge-send-email/index.ts` for variable substitution pattern.

---

### EMAIL-FIX-005: Create user_created Template (15 min) 🗄️ DATABASE

**Priority**: 2
**Type**: Database Migration
**File**: `supabase/migrations/add_user_created_template.sql`
**Blocks**: EMAIL-FIX-006
**Parallel with**: EMAIL-FIX-002

**Problem**: Missing welcome email for newly created users.

**Solution**: Create `user_created` template in database.

**Template Details**:
- **Template Name**: `user_created`
- **Subject**: `Welcome to Sixty, {{first_name}}!`
- **Variables**:
  - `{{first_name}}`
  - `{{user_name}}`
  - `{{setup_url}}`
  - `{{onboarding_steps}}`
- **Content**: Welcome message with call-to-action for first meeting sync
- **Styling**: Match existing templates

**Acceptance**:
- [ ] Template created in database
- [ ] Proper styling applied
- [ ] Variables documented
- [ ] is_active = true
- [ ] Ready for signup flow

---

### EMAIL-FIX-006: Standardize Template Styling (25 min) 🎨 DESIGN

**Priority**: 4
**Type**: Refactoring
**File**: `supabase/migrations/standardize_email_template_styles.sql`
**Depends on**: EMAIL-FIX-002, EMAIL-FIX-005

**Problem**: Email templates have inconsistent styling, fonts, colors, buttons.

**Solution**: Audit all templates and apply consistent styling.

**Templates to audit** (8+):
- `organization_invitation` (new)
- `user_created` (new)
- `welcome`
- `password_reset`
- `email_change_verification`
- `join_request_approved`
- `join_request_rejected`
- `member_removed`

**Styling checklist**:
- [ ] Same background color
- [ ] Same text color
- [ ] Same button color, padding, border-radius
- [ ] Same font family and sizes
- [ ] Same spacing/padding
- [ ] Same footer format
- [ ] Dark mode friendly
- [ ] Outlook compatible
- [ ] Max-width: 600px container

**Acceptance**:
- [ ] All templates audited
- [ ] Consistent color palette applied
- [ ] Consistent typography
- [ ] Consistent spacing
- [ ] Consistent button styling
- [ ] Consistent footer format
- [ ] All templates still functional

---

### EMAIL-FIX-007: Add Test Utilities (20 min) 🧪 TESTING

**Priority**: 5
**Type**: Feature
**Files**:
- `src/lib/services/testEmailService.ts`
- `supabase/functions/health/index.ts` (extend existing)

**Problem**: No easy way to test all email operations or verify templates are accessible.

**Solution**: Create test utility and extend health endpoint.

**What to do**:
1. Create `testEmailService.ts` with functions to test each email type
2. Extend `/health` endpoint to return email system status
3. Support dry-run mode (no actual sending)
4. Log all results

**Acceptance**:
- [ ] testEmailService.ts created
- [ ] Test functions for each template
- [ ] Health check returns email status
- [ ] Dry-run mode works
- [ ] Comprehensive logging

**Reference**: Can run locally with `npm run test:email` command.

---

## Execution Plan

### MVP Scope (Priority: Go-Live Critical)
**Stories**: EMAIL-FIX-001, EMAIL-FIX-002, EMAIL-FIX-003, EMAIL-FIX-004
**Time**: 50 minutes
**Outcome**: Fixes 401 error and standardizes organization invitation template

### Full Scope
**Stories**: All 7
**Time**: 110 minutes
**Outcome**: Complete email system audit and modernization

### Parallel Opportunities
- **EMAIL-FIX-002 + EMAIL-FIX-005**: Both are independent database migrations
  - Can run in parallel, saves ~15 minutes
  - Start both after EMAIL-FIX-001 is complete

### Dependency Flow
```
EMAIL-FIX-001 (config fix)
    ↓
    ├→ EMAIL-FIX-002 (org invitation template) ⟷ EMAIL-FIX-005 (user_created template)
    │       ↓
    │   EMAIL-FIX-004 (refactor function)
    │       ↓
    │   EMAIL-FIX-006 (standardize styling)
    │       ↓
    │   EMAIL-FIX-007 (test utilities)
    │
    └→ EMAIL-FIX-003 (verify fix works)
```

---

## Post-Deployment Checklist

After deploying all changes:

- [ ] Send test organization invitation from TeamMembersPage
- [ ] Verify no 401 error in browser console
- [ ] Check email arrives in staging inbox
- [ ] Verify email styling matches welcome template
- [ ] Test resend invitation workflow
- [ ] Verify all 8+ templates are accessible
- [ ] Check AWS SES quota hasn't changed
- [ ] Run `npm run test:email` if implemented

---

## Risk Mitigation

| Risk | Mitigation |
|------|-----------|
| Email styling breaks existing templates | Test all templates in multiple email clients before deploying |
| Template migration missing variables | Verify variables match function code. Add logging. |
| Config change doesn't take effect | Redeploy functions after config.toml change |
| Fallback HTML doesn't work | Keep original template in function as fallback |

---

## Files Changed

**Configuration**:
- `supabase/config.toml`

**Edge Functions**:
- `supabase/functions/send-organization-invitation/index.ts`
- `supabase/functions/health/index.ts` (optional extend)

**Migrations**:
- `supabase/migrations/add_organization_invitation_template.sql`
- `supabase/migrations/add_user_created_template.sql`
- `supabase/migrations/standardize_email_template_styles.sql`

**Services**:
- `src/lib/services/testEmailService.ts` (new)

---

## Next Steps

1. **Review this plan** - Confirm scope and priorities
2. **Start with EMAIL-FIX-001** - The 5-minute config fix
3. **Run EMAIL-FIX-003 immediately after** - Verify the fix works
4. **Parallel: EMAIL-FIX-002 + EMAIL-FIX-005** - Create templates
5. **EMAIL-FIX-004** - Refactor edge function
6. **EMAIL-FIX-006** - Standardize styling
7. **EMAIL-FIX-007** - Add test utilities (optional)

Ready to begin? Run `/60-run` when ready.
