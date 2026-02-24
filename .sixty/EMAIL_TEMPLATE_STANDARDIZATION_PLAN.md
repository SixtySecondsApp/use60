# Email Template Standardization & Multi-Use System Plan

**Status**: 🔴 AWAITING APPROVAL
**Created**: 2026-02-03
**Branch**: `fix/go-live-bug-fixes`
**Estimated Time**: 3.5+ hours (with parallelization)
**Total Stories**: 10

---

## Executive Summary

This plan standardizes all email sending across the application to use a centralized database template system with consistent variables and "welcome" design styling. Currently, emails are sent through 4 different methods with inconsistent approaches (hardcoded templates, database lookups, variable naming).

**Key Changes**:
- ✅ All emails will use `encharge_email_templates` database
- ✅ All variables standardized (recipient_name, action_url, organization_name, etc.)
- ✅ Consistent "welcome" design across all email types
- ✅ Context-appropriate messaging based on email purpose
- ✅ Comprehensive automated + manual test coverage

---

## Problem Statement

### Current State
1. **send-organization-invitation**: Uses hardcoded HTML fallback template
2. **send-removal-email**: Delegates to encharge but has inconsistent variables
3. **waitlist-invite**: Uses encharge with non-standard variables
4. **waitlist-welcome**: Uses database template (reference implementation)

### Issues
- **Inconsistency**: Different template sources, variable names, styling
- **Maintainability**: Changes require updating multiple locations
- **Scalability**: Adding new email types requires code changes
- **Testing**: No centralized way to verify template variables

---

## Objectives

1. **Create database templates** for ALL email types using consistent "welcome" design
2. **Standardize variables** across email types (recipient_name, action_url, etc.)
3. **Update all functions** to use database templates (especially send-organization-invitation)
4. **Ensure visual consistency** with context-appropriate messaging
5. **Create test coverage** (automated + manual) for all email flows

---

## Standardized Variables

### Universal (All Emails)
```
recipient_name      - Primary greeting (extracted from first_name or email)
action_url          - Primary CTA button link (invitation, confirmation, etc)
support_email       - Help/support contact email (fallback: support@use60.com)
expiry_time         - Validity period when applicable (e.g., "7 days")
```

### Contextual (Email-Type Specific)
```
organization_name   - For org-related emails (invitations, removal, etc)
inviter_name        - For invitation emails (who invited you)
admin_name          - For admin action emails (who removed you)
company_name        - For waitlist/signup emails
```

### Email Type Mappings

| Email Type | Variables | Database Name |
|---|---|---|
| Organization Invitation | recipient_name, action_url, organization_name, inviter_name, expiry_time, support_email | `organization_invitation` |
| Member Removed | recipient_name, action_url, organization_name, admin_name, support_email | `member_removed` |
| Waitlist Invite | recipient_name, action_url, company_name, expiry_time, support_email | `waitlist_invite` |
| Waitlist Welcome | recipient_name, company_name, support_email | `waitlist_welcome` |

---

## Implementation Plan

### Phase 1: Schema & Foundation (20 min)
**Story**: EMAIL-001
**Task**: Create standardized email template migration

The migration will:
- Create/update 4+ email template records in `encharge_email_templates`
- Use "welcome" design styling for all templates
- Include both HTML and text versions
- Define required variables for each template type
- Ensure migration is idempotent (safe to rerun)

**Files**:
- `supabase/migrations/20260203_standardize_email_templates.sql`

---

### Phase 2: Backend Updates (70 min - Parallelizable)

#### Story EMAIL-002: Update send-organization-invitation
- Remove hardcoded HTML fallback
- Add database template lookup (`organization_invitation` type)
- Use standardized variables
- Keep fallback for development
- Verify Bearer token authentication
- Log sends to `email_logs` table

**Files**:
- `supabase/functions/send-organization-invitation/index.ts`

#### Story EMAIL-003: Update send-removal-email
- Update variable naming to standardized format
- Add database template lookup (`member_removed` type)
- Update to use Bearer token auth (consistency)
- Verify email logging

**Files**:
- `supabase/functions/send-removal-email/index.ts`

#### Story EMAIL-004: Standardize waitlist invitations
- Update `grantAccess()` function variables
- Update `bulkGrantAccess()` function variables
- Verify variable names match database template

**Files**:
- `src/lib/services/waitlistAdminService.ts`

#### Story EMAIL-005: Verify waitlist-welcome compliance
- Confirm it uses standardized variable names
- Verify database template fetch works correctly
- Confirm email logging is consistent

**Files**:
- `supabase/functions/waitlist-welcome-email/index.ts`

---

### Phase 3: Documentation (15 min)

**Story**: EMAIL-006
**Task**: Create template variables configuration document

**Output**: `.sixty/EMAIL_TEMPLATE_VARIABLES.md`

Content:
- Complete reference for all standardized variables
- Which variables apply to each email type
- Examples for each email type
- Variable format constraints
- Fallback/default values

---

### Phase 4: Testing Setup (50 min)

#### Story EMAIL-007: Automated Test Suite
- Create integration tests for all 4 email types
- Verify template loading from database
- Verify variable substitution
- Verify Bearer token authentication
- Verify email logging
- Tests run in CI/CD

**Files**:
- `test/email-template-integration.test.ts`

**Test Cases**:
1. Organization invitation sends successfully
2. Organization invitation creates email_logs entry
3. Member removal sends successfully
4. Waitlist invite sends successfully
5. Waitlist welcome sends successfully
6. Invalid/missing templates handled gracefully
7. Variable substitution works for all types
8. Bearer token authentication verified

#### Story EMAIL-008: Manual Testing Checklist
**Output**: `.sixty/EMAIL_TESTING_CHECKLIST.md`

Content:
- Step-by-step testing for each email flow
- Visual/design verification checklist
- Email appearance expectations
- Troubleshooting guide
- Test data templates
- Coverage for staging + production

**Manual Test Scenarios**:
1. Create organization invitation → verify email received with correct styling
2. Remove user from organization → verify email received
3. Grant waitlist access → verify invitation email received
4. Verify all emails have consistent design
5. Verify all variables are substituted correctly
6. Verify no styling breaks in email clients

---

### Phase 5: Deployment & Testing (60 min)

#### Story EMAIL-009: Redeploy Functions
- Deploy send-organization-invitation with updates
- Deploy send-removal-email with updates
- Deploy encharge-send-email (no changes needed)
- Deploy waitlist-welcome-email (verify it works)
- Verify all functions in Supabase dashboard
- Confirm environment secrets are set

#### Story EMAIL-010: Comprehensive Testing
- Run automated test suite (must pass 100%)
- Execute manual testing checklist
- Verify all email flows work end-to-end
- Verify email_logs table shows all sends
- Document results

---

## Design Reference: "Welcome" Template

All emails use the "welcome" template styling:

```
Colors:
  Primary: #3b82f6 (blue button)
  Text: #1f2937 (dark gray)
  Secondary: #4b5563 (medium gray)
  Background: #f9fafb (light gray)
  Border: #e5e7eb (light border)

Structure:
  - Max-width container (600px)
  - White wrapper with padding
  - Large heading
  - Greeting
  - Context/content paragraph
  - Centered CTA button
  - Secondary link/code block
  - Footer with support email

Button Style:
  - Padding: 12px 24px
  - Background: #3b82f6
  - Color: white
  - Border-radius: 6px
  - Font-weight: 500

Context-Specific Content:
  - Organization Invitation: "Join {org} on Sixty"
  - Member Removed: "You've been removed from {org}"
  - Waitlist Invite: "Early access granted to {company}"
  - Waitlist Welcome: "Welcome to {company}"
```

---

## Execution Order

```
EMAIL-001: Schema migration
    ↓
┌─→ EMAIL-002: send-organization-invitation
├─→ EMAIL-003: send-removal-email
├─→ EMAIL-004: waitlist invitations
└─→ EMAIL-005: waitlist welcome verification
    ↓
EMAIL-006: Documentation
    ↓
EMAIL-007: Automated tests
    ↓
EMAIL-008: Manual test checklist
    ↓
EMAIL-009: Redeploy functions
    ↓
EMAIL-010: Comprehensive testing
```

---

## Success Criteria

- [ ] All 4 email types use database templates (no hardcoded templates)
- [ ] All variables standardized (recipient_name, action_url, etc.)
- [ ] All email functions deploy without errors
- [ ] Automated test suite passes 100%
- [ ] Manual testing checklist completed
- [ ] email_logs table shows all sends successful
- [ ] Design is consistent across all emails
- [ ] No customer-facing email issues reported

---

## Risk Mitigation

| Risk | Mitigation |
|---|---|
| Database templates missing variables | Keep fallback templates until migration verified |
| Email delivery interruption | Test on staging first, gradual rollout to production |
| Variable substitution errors | Comprehensive test coverage with multiple scenarios |
| Edge function deployment issues | Verify secrets before deployment, have rollback plan |
| Design breaks in email clients | Test in multiple email clients, use inline styles |

---

## Dependencies

- ✅ Supabase project with encharge_email_templates table
- ✅ AWS SES credentials configured
- ✅ EDGE_FUNCTION_SECRET set in environment
- ✅ All edge functions deployed

---

## Related Issues

- Fix CORS authentication (already done - using Bearer token)
- Standardize template variables (this plan)
- Ensure all emails use database templates (this plan)
- Create comprehensive test coverage (this plan)

---

## Questions for User

Before proceeding, confirm:

1. **Design Approval**: Is the "welcome" styling acceptable for all email types?
2. **Variable Names**: Are the standardized variable names appropriate?
3. **Scope**: Should we include any additional email types beyond the 4 identified?
4. **Testing**: Is the test approach (automated + manual) sufficient?
5. **Timeline**: Can we proceed immediately or should we schedule for specific date?

---

## Next Steps

**Pending User Approval** → Proceed with execution

Once approved, execution will follow:
1. Run EMAIL-001 (schema migration)
2. Run EMAIL-002, 003, 004, 005 in parallel (backend updates)
3. Continue through phases in order

---

**Status**: 🔴 AWAITING APPROVAL AND NEXT INSTRUCTIONS
