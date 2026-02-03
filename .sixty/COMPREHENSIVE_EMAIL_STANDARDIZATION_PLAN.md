# Comprehensive Email Template Standardization Plan
## Complete Implementation for All 18 Email Types

**Status**: 🟢 READY FOR EXECUTION
**Created**: 2026-02-03
**Branch**: `fix/go-live-bug-fixes`
**Total Stories**: 28
**Estimated Time**: 6-8 hours (with parallelization)
**Scope**: All 18 active email types

---

## Executive Summary

This comprehensive plan standardizes **all 18 email types** across the use60 application to use a unified database template system with consistent variables, "welcome" design styling, and context-appropriate messaging.

### Current State Analysis

**Email Types Audit**:
- 4 types have partial database templates (organization_invitation, member_removed, waitlist_invite, waitlist_welcome)
- 14 types are missing database templates or using inconsistent approaches
- No unified variable naming system
- Inconsistent styling across email types
- Limited test coverage

### Target State

- ✅ All 18 email types use `encharge_email_templates` database
- ✅ Standardized variables across all types (multi-use format)
- ✅ Consistent "welcome" design styling
- ✅ Context-appropriate messaging for each email purpose
- ✅ All edge functions updated to database templates
- ✅ Comprehensive test coverage (automated + manual)
- ✅ Full documentation and troubleshooting guides

---

## All 18 Email Types Inventory

### Group 1: Organization & Membership (3 types)

| Type | Purpose | Context | Variables Needed |
|------|---------|---------|-----------------|
| **organization_invitation** | User invitations to orgs | New member joining | recipient_name, action_url, organization_name, inviter_name, expiry_time, support_email |
| **member_removed** | Member removal notifications | User removed from org | recipient_name, action_url, organization_name, admin_name, reason, support_email |
| **org_approval** | Organization approval flow | Admin approves org action | recipient_name, action_url, organization_name, admin_name, support_email |

### Group 2: Waitlist & Access (2 types)

| Type | Purpose | Context | Variables Needed |
|------|---------|---------|-----------------|
| **waitlist_invite** | Early access invitations | Grant waitlist access | recipient_name, action_url, company_name, expiry_time, support_email |
| **waitlist_welcome** | Waitlist welcome email | New waitlist signup | recipient_name, company_name, support_email |

### Group 3: General Onboarding & Welcome (1 type)

| Type | Purpose | Context | Variables Needed |
|------|---------|---------|-----------------|
| **welcome** | General welcome/onboarding | New user signup | recipient_name, company_name, action_url, support_email |

### Group 4: Integration Notifications (2 types)

| Type | Purpose | Context | Variables Needed |
|------|---------|---------|-----------------|
| **fathom_connected** | Fathom integration connected | Integration successful | recipient_name, organization_name, support_email |
| **first_meeting_synced** | First meeting synced | Initial sync complete | recipient_name, organization_name, support_email |

### Group 5: Subscription & Trial (4 types)

| Type | Purpose | Context | Variables Needed |
|------|---------|---------|-----------------|
| **trial_ending** | Trial ending soon | 7-14 days remaining | recipient_name, organization_name, trial_days, action_url, support_email |
| **trial_expired** | Trial has expired | Trial period ended | recipient_name, organization_name, action_url, support_email |
| **subscription_confirmed** | Subscription confirmed | Payment successful | recipient_name, organization_name, action_url, support_email |
| **meeting_limit_warning** | Meeting limit warning | Approaching meeting limit | recipient_name, organization_name, current_meetings, meeting_limit, action_url, support_email |
| **upgrade_prompt** | Upgrade prompt/CTA | Encourage plan upgrade | recipient_name, organization_name, action_url, support_email |

### Group 6: Account Management (3 types)

| Type | Purpose | Context | Variables Needed |
|------|---------|---------|-----------------|
| **email_change_verification** | Email change verification | User changing email | recipient_name, action_url, new_email, support_email |
| **password_reset** | Password reset request | User forgot password | recipient_name, action_url, expiry_time, support_email |
| **join_request_approved** | Join request approved | User approved to join | recipient_name, action_url, organization_name, support_email |

### Group 7: Admin/Moderation (2 types)

| Type | Purpose | Context | Variables Needed |
|------|---------|---------|-----------------|
| **join_request_rejected** | Join request rejected | User denied access | recipient_name, reason, organization_name, support_email |
| **permission_to_close** | Permission to close feature | Admin approval needed | recipient_name, feature_name, organization_name, action_url, support_email |

---

## Standardized Variables System

### Universal Variables (All Emails)

```
recipient_name          - Recipient's first name for personalization
action_url             - Primary call-to-action button link
support_email          - Help/support contact (fallback: support@use60.com)
expiry_time            - Validity period when applicable (e.g., "7 days")
```

### Contextual Variables (Email-Type Specific)

```
organization_name      - For org-related emails (invitations, removal, etc)
inviter_name           - For invitation emails (who invited)
admin_name             - For admin action emails (who performed action)
company_name           - For waitlist/signup emails
user_name              - Alternative to recipient_name (full name)
trial_days             - Number of trial days remaining
feature_name           - Name of feature being closed/accessed
reason                 - Reason for rejection/removal
current_meetings       - Current meeting count
meeting_limit          - Meeting limit threshold
new_email              - New email address being verified
```

### Usage Matrix

```
Email Type                    Variables
────────────────────────────────────────────────────────────────
organization_invitation       recipient_name, action_url, organization_name,
                             inviter_name, expiry_time, support_email

member_removed                recipient_name, action_url, organization_name,
                             admin_name, reason, support_email

org_approval                  recipient_name, action_url, organization_name,
                             admin_name, support_email

waitlist_invite               recipient_name, action_url, company_name,
                             expiry_time, support_email

waitlist_welcome              recipient_name, company_name, support_email

welcome                       recipient_name, company_name, action_url,
                             support_email

fathom_connected              recipient_name, organization_name, support_email

first_meeting_synced          recipient_name, organization_name, support_email

trial_ending                  recipient_name, organization_name, trial_days,
                             action_url, support_email

trial_expired                 recipient_name, organization_name, action_url,
                             support_email

subscription_confirmed        recipient_name, organization_name, action_url,
                             support_email

meeting_limit_warning         recipient_name, organization_name,
                             current_meetings, meeting_limit, action_url,
                             support_email

upgrade_prompt                recipient_name, organization_name, action_url,
                             support_email

email_change_verification     recipient_name, action_url, new_email,
                             support_email

password_reset                recipient_name, action_url, expiry_time,
                             support_email

join_request_approved         recipient_name, action_url, organization_name,
                             support_email

join_request_rejected         recipient_name, reason, organization_name,
                             support_email

permission_to_close           recipient_name, feature_name, organization_name,
                             action_url, support_email
```

---

## Design System: "Welcome" Template

All emails use consistent styling with context-specific messaging.

### Color Palette

```
Primary Blue:      #3b82f6  (CTA buttons, accents)
Dark Gray:         #1f2937  (Headings, main text)
Medium Gray:       #4b5563  (Body text)
Light Gray:        #f9fafb  (Background)
Border Gray:       #e5e7eb  (Dividers, borders)
Success Green:     #10b981  (Confirmations)
Warning Orange:    #f59e0b  (Warnings, expiring)
Error Red:         #ef4444  (Errors, rejections)
```

### Email Structure

```
┌─ CONTAINER (600px max, light gray bg) ─────────────────┐
│                                                          │
│  ┌─ WHITE WRAPPER (padding, shadow) ────────────────┐  │
│  │                                                   │  │
│  │  [HEADING - Context Specific]                   │  │
│  │  ═════════════════════════════                  │  │
│  │                                                   │  │
│  │  Hi {{recipient_name}},                         │  │
│  │                                                   │  │
│  │  [CONTEXT PARAGRAPH - Email specific content]   │  │
│  │                                                   │  │
│  │  [Optional: Secondary content/details]          │  │
│  │                                                   │  │
│  │                 [CTA BUTTON]                     │  │
│  │           {{action_url}} Link                    │  │
│  │                                                   │  │
│  │  [Optional: Expiry notice or secondary info]    │  │
│  │                                                   │  │
│  │  ─────────────────────────────────────────────  │  │
│  │  For help: {{support_email}}                    │  │
│  │  [Company branding]                             │  │
│  │                                                   │  │
│  └─────────────────────────────────────────────────┘  │
│                                                          │
└──────────────────────────────────────────────────────────┘
```

### Context-Specific Headings & Content

```
organization_invitation:
  Heading: "Join {{organization_name}} on Sixty"
  Body: "{{inviter_name}} has invited you to join {{organization_name}}
         on Sixty. Accept below to get started collaborating with your team."

member_removed:
  Heading: "You've Been Removed from {{organization_name}}"
  Body: "You have been removed from {{organization_name}}.
         Reason: {{reason}}. If you believe this is an error, contact support."

trial_ending:
  Heading: "Your Trial Ends in {{trial_days}} Days"
  Body: "Your Sixty trial ends in {{trial_days}} days.
         Upgrade now to continue using all features."

subscription_confirmed:
  Heading: "Welcome to Sixty Premium"
  Body: "Your subscription has been confirmed.
         You now have access to all premium features."

password_reset:
  Heading: "Reset Your Password"
  Body: "You requested to reset your password.
         Click the link below (expires in {{expiry_time}}) to set a new password."
```

---

## Implementation Plan: 28 Stories

### Phase 1: Audit & Analysis (2 hours)

#### STORY EMAIL-001: Audit Existing Email Templates
- **Type**: Discovery/Documentation
- **Priority**: 1
- **Estimated**: 30 min
- **Acceptance Criteria**:
  - [ ] Document which of 18 email types have templates
  - [ ] Identify which templates are outdated
  - [ ] List missing templates
  - [ ] Document current variable usage
  - [ ] Create audit report

#### STORY EMAIL-002: Design Standardized Email Template
- **Type**: Design/Documentation
- **Priority**: 1
- **Estimated**: 45 min
- **Dependencies**: EMAIL-001
- **Acceptance Criteria**:
  - [ ] Create "welcome" reference template HTML
  - [ ] Document color palette with hex values
  - [ ] Document layout structure
  - [ ] Create variable substitution examples
  - [ ] Document context-specific variations

#### STORY EMAIL-003: Create Variables Configuration Reference
- **Type**: Documentation
- **Priority**: 1
- **Estimated**: 30 min
- **Dependencies**: EMAIL-001
- **Acceptance Criteria**:
  - [ ] Document all 18 email types
  - [ ] List required variables per type
  - [ ] Document variable formats/constraints
  - [ ] Create substitution examples
  - [ ] Document fallback values

---

### Phase 2: Database Migration (1 hour)

#### STORY EMAIL-004: Create Migration for All 18 Templates
- **Type**: Schema
- **Priority**: 2
- **Estimated**: 60 min
- **Dependencies**: EMAIL-002, EMAIL-003
- **Blocks**: EMAIL-005 through EMAIL-021
- **Acceptance Criteria**:
  - [ ] Migration creates/updates all 18 template records
  - [ ] All templates use standardized "welcome" design HTML
  - [ ] All templates include both HTML and text versions
  - [ ] Variables JSON defined for each template
  - [ ] is_active flag set appropriately
  - [ ] Migration is idempotent
  - [ ] Can be run multiple times safely
  - [ ] Includes rollback capability

**Files**: `supabase/migrations/20260203_standardize_all_email_templates.sql`

---

### Phase 3: Backend Function Updates (3 hours - Parallelizable)

#### Group 3A: Organization & Membership Functions

**STORY EMAIL-005**: Update send-organization-invitation
- **Type**: Backend
- **Priority**: 2
- **Estimated**: 20 min
- **Dependencies**: EMAIL-004
- **Blocks**: EMAIL-022
- **Acceptance Criteria**:
  - [ ] Fetches template from database (type: organization_invitation)
  - [ ] Uses standardized variables
  - [ ] Removes hardcoded HTML fallback
  - [ ] Logs to email_logs table
  - [ ] Bearer token authentication verified

**Files**: `supabase/functions/send-organization-invitation/index.ts`

**STORY EMAIL-006**: Update send-removal-email
- **Type**: Backend
- **Priority**: 2
- **Estimated**: 20 min
- **Dependencies**: EMAIL-004
- **Blocks**: EMAIL-022
- **Acceptance Criteria**:
  - [ ] Uses standardized variable names
  - [ ] Fetches template from database (type: member_removed)
  - [ ] Bearer token authentication
  - [ ] Logs to email_logs table

**Files**: `supabase/functions/send-removal-email/index.ts`

**STORY EMAIL-007**: Create org_approval email function
- **Type**: Backend
- **Priority**: 2
- **Estimated**: 25 min
- **Dependencies**: EMAIL-004
- **Blocks**: EMAIL-022
- **Acceptance Criteria**:
  - [ ] New edge function created
  - [ ] Fetches template from database (type: org_approval)
  - [ ] Uses standardized variables
  - [ ] Bearer token authentication
  - [ ] Logs to email_logs table

**Files**: `supabase/functions/org-approval-email/index.ts`

#### Group 3B: Waitlist & Access Functions

**STORY EMAIL-008**: Standardize waitlist invitation service
- **Type**: Backend
- **Priority**: 2
- **Estimated**: 20 min
- **Dependencies**: EMAIL-004
- **Blocks**: EMAIL-022
- **Acceptance Criteria**:
  - [ ] Updates grantAccess() variables
  - [ ] Updates bulkGrantAccess() variables
  - [ ] Uses standardized variable names
  - [ ] Variables match database template

**Files**: `src/lib/services/waitlistAdminService.ts`

**STORY EMAIL-009**: Verify waitlist-welcome compliance
- **Type**: Backend
- **Priority**: 2
- **Estimated**: 15 min
- **Dependencies**: EMAIL-004
- **Blocks**: EMAIL-022
- **Acceptance Criteria**:
  - [ ] Verifies standardized variable names
  - [ ] Confirms database template fetch
  - [ ] Validates logging implementation

**Files**: `supabase/functions/waitlist-welcome-email/index.ts`

#### Group 3C: Integration Notification Functions

**STORY EMAIL-010**: Create/update fathom_connected email
- **Type**: Backend
- **Priority**: 2
- **Estimated**: 20 min
- **Dependencies**: EMAIL-004
- **Blocks**: EMAIL-022
- **Acceptance Criteria**:
  - [ ] Edge function created or updated
  - [ ] Fetches template from database
  - [ ] Uses standardized variables
  - [ ] Logs to email_logs table

**Files**: `supabase/functions/fathom-connected-email/index.ts`

**STORY EMAIL-011**: Create/update first_meeting_synced email
- **Type**: Backend
- **Priority**: 2
- **Estimated**: 20 min
- **Dependencies**: EMAIL-004
- **Blocks**: EMAIL-022
- **Acceptance Criteria**:
  - [ ] Edge function created or updated
  - [ ] Fetches template from database
  - [ ] Uses standardized variables
  - [ ] Logs to email_logs table

**Files**: `supabase/functions/first-meeting-synced-email/index.ts`

#### Group 3D: Subscription & Trial Functions

**STORY EMAIL-012**: Create/update subscription email functions (4 types)
- **Type**: Backend
- **Priority**: 2
- **Estimated**: 45 min
- **Dependencies**: EMAIL-004
- **Blocks**: EMAIL-022
- **Description**: Handles trial_ending, trial_expired, subscription_confirmed, upgrade_prompt
- **Acceptance Criteria**:
  - [ ] All 4 email types have edge functions
  - [ ] Fetch templates from database
  - [ ] Use standardized variables
  - [ ] Log to email_logs table

**Files**:
- `supabase/functions/trial-ending-email/index.ts`
- `supabase/functions/trial-expired-email/index.ts`
- `supabase/functions/subscription-confirmed-email/index.ts`
- `supabase/functions/upgrade-prompt-email/index.ts`

#### Group 3E: Account Management Functions

**STORY EMAIL-013**: Create/update account management email functions (4 types)
- **Type**: Backend
- **Priority**: 2
- **Estimated**: 45 min
- **Dependencies**: EMAIL-004
- **Blocks**: EMAIL-022
- **Description**: Handles email_change_verification, password_reset, join_request_approved, meeting_limit_warning
- **Acceptance Criteria**:
  - [ ] All 4 email types have edge functions
  - [ ] Fetch templates from database
  - [ ] Use standardized variables
  - [ ] Log to email_logs table

**Files**:
- `supabase/functions/email-change-verification/index.ts`
- `supabase/functions/password-reset-email/index.ts`
- `supabase/functions/join-request-approved-email/index.ts`
- `supabase/functions/meeting-limit-warning-email/index.ts`

#### Group 3F: Admin/Moderation Functions

**STORY EMAIL-014**: Create/update admin moderation email functions (3 types)
- **Type**: Backend
- **Priority**: 2
- **Estimated**: 40 min
- **Dependencies**: EMAIL-004
- **Blocks**: EMAIL-022
- **Description**: Handles join_request_rejected, permission_to_close, welcome
- **Acceptance Criteria**:
  - [ ] All 3 email types have edge functions
  - [ ] Fetch templates from database
  - [ ] Use standardized variables
  - [ ] Log to email_logs table

**Files**:
- `supabase/functions/join-request-rejected-email/index.ts`
- `supabase/functions/permission-to-close-email/index.ts`
- `supabase/functions/welcome-email/index.ts`

#### STORY EMAIL-015: Update encharge-send-email dispatcher
- **Type**: Backend
- **Priority**: 2
- **Estimated**: 30 min
- **Dependencies**: EMAIL-004
- **Blocks**: EMAIL-022
- **Acceptance Criteria**:
  - [ ] Updated to handle all 18 email types
  - [ ] Proper routing to template lookup
  - [ ] Variable standardization
  - [ ] Error handling for missing templates

**Files**: `supabase/functions/encharge-send-email/index.ts`

---

### Phase 4: Testing Setup (2 hours)

#### STORY EMAIL-016**: Create Automated Test Suite
- **Type**: Test
- **Priority**: 3
- **Estimated**: 60 min
- **Dependencies**: EMAIL-004 through EMAIL-015
- **Blocks**: EMAIL-024
- **Acceptance Criteria**:
  - [ ] Tests for all 18 email types
  - [ ] Template loading verification
  - [ ] Variable substitution tests
  - [ ] Bearer token authentication tests
  - [ ] Email logging tests
  - [ ] Error handling tests
  - [ ] All tests pass (100%)
  - [ ] Can run in CI/CD

**Files**: `test/email-comprehensive-integration.test.ts`

**Test Cases**:
```
✅ Test Suite: Template Loading
  ✅ Each of 18 email types loads correct template
  ✅ Missing templates handled gracefully
  ✅ Fallback templates work correctly

✅ Test Suite: Variable Substitution
  ✅ All universal variables substituted
  ✅ All contextual variables substituted
  ✅ Missing variables handled with defaults
  ✅ Special characters escaped properly

✅ Test Suite: Authentication
  ✅ Valid Bearer token accepted
  ✅ Invalid token rejected
  ✅ Missing auth header handled

✅ Test Suite: Logging
  ✅ Each email logged to email_logs
  ✅ Correct email_type recorded
  ✅ All metadata captured
  ✅ Timestamps accurate

✅ Test Suite: Email Delivery
  ✅ Email HTML valid
  ✅ Text version generated
  ✅ No broken links in content
  ✅ Subject line populated
```

#### STORY EMAIL-017**: Create Manual Testing Checklist
- **Type**: Test/Documentation
- **Priority**: 3
- **Estimated**: 60 min
- **Dependencies**: EMAIL-004 through EMAIL-015
- **Blocks**: EMAIL-024
- **Acceptance Criteria**:
  - [ ] Step-by-step testing for all 18 types
  - [ ] Visual/design verification checklist
  - [ ] Expected email appearance documented
  - [ ] Troubleshooting guide included
  - [ ] Test scenarios for edge cases

**Files**: `.sixty/EMAIL_COMPREHENSIVE_TESTING_GUIDE.md`

**Manual Test Coverage**:
```
✅ Scenario: Organization Invitation
  ✓ Create new invitation
  ✓ Verify email received
  ✓ Check styling consistency
  ✓ Verify variables substituted
  ✓ Test expiry link works

✅ Scenario: Member Removal
  ✓ Remove user from org
  ✓ Verify email received
  ✓ Check styling
  ✓ Verify reason included

[... similar for all 18 types]

✅ Visual Verification Checklist
  ✓ All emails have consistent color scheme
  ✓ All use blue button (#3b82f6)
  ✓ All have footer with support email
  ✓ No broken images/styles
  ✓ Responsive on mobile

✅ Email Client Testing
  ✓ Gmail rendering
  ✓ Outlook rendering
  ✓ Apple Mail rendering
  ✓ Mobile clients
```

---

### Phase 5: Documentation (1 hour)

#### STORY EMAIL-018**: Create Comprehensive Variable Reference
- **Type**: Documentation
- **Priority**: 3
- **Estimated**: 30 min
- **Blocks**: EMAIL-025
- **Acceptance Criteria**:
  - [ ] All 18 email types documented
  - [ ] Variables listed with descriptions
  - [ ] Usage examples for each type
  - [ ] Format constraints documented
  - [ ] Fallback values documented

**Files**: `.sixty/EMAIL_VARIABLES_REFERENCE.md`

#### STORY EMAIL-019**: Create Email Architecture Guide
- **Type**: Documentation
- **Priority**: 3
- **Estimated**: 30 min
- **Blocks**: EMAIL-025
- **Acceptance Criteria**:
  - [ ] System architecture documented
  - [ ] Data flow diagram
  - [ ] Template rendering process
  - [ ] Variable substitution logic
  - [ ] Error handling procedures

**Files**: `.sixty/EMAIL_ARCHITECTURE_GUIDE.md`

---

### Phase 6: Deployment (1.5 hours)

#### STORY EMAIL-020**: Verify Environment Configuration
- **Type**: Deployment Prep
- **Priority**: 4
- **Estimated**: 20 min
- **Acceptance Criteria**:
  - [ ] All required secrets present
  - [ ] EDGE_FUNCTION_SECRET configured
  - [ ] AWS SES credentials verified
  - [ ] SUPABASE_SERVICE_ROLE_KEY confirmed

#### STORY EMAIL-021**: Deploy All Email Functions to Staging
- **Type**: Deployment
- **Priority**: 4
- **Estimated**: 40 min
- **Dependencies**: EMAIL-004 through EMAIL-019, EMAIL-020
- **Blocks**: EMAIL-022
- **Acceptance Criteria**:
  - [ ] All email functions deployed
  - [ ] Functions return 200 status
  - [ ] No console errors
  - [ ] Can be tested in staging

#### STORY EMAIL-022**: Redeploy Core Functions with Updates
- **Type**: Deployment
- **Priority**: 4
- **Estimated**: 20 min
- **Dependencies**: EMAIL-021
- **Blocks**: EMAIL-023
- **Acceptance Criteria**:
  - [ ] send-organization-invitation redeployed
  - [ ] send-removal-email redeployed
  - [ ] encharge-send-email redeployed
  - [ ] waitlist functions redeployed

---

### Phase 7: Testing & Validation (1.5 hours)

#### STORY EMAIL-023**: Run Automated Test Suite
- **Type**: Testing
- **Priority**: 4
- **Estimated**: 30 min
- **Dependencies**: EMAIL-022
- **Blocks**: EMAIL-024
- **Acceptance Criteria**:
  - [ ] All 18 email type tests pass
  - [ ] Template loading tests pass
  - [ ] Variable substitution tests pass
  - [ ] Authentication tests pass
  - [ ] Logging tests pass
  - [ ] 100% pass rate

#### STORY EMAIL-024**: Execute Manual Testing Checklist
- **Type**: Testing
- **Priority**: 4
- **Estimated**: 60 min
- **Dependencies**: EMAIL-023
- **Blocks**: EMAIL-025
- **Acceptance Criteria**:
  - [ ] All 18 email types manually tested
  - [ ] Visual consistency verified
  - [ ] Variables substituted correctly
  - [ ] Emails arrive in correct inboxes
  - [ ] No styling issues in email clients
  - [ ] Troubleshooting guide tested

---

### Phase 8: Verification & Closure (30 min)

#### STORY EMAIL-025**: Final Verification & Documentation
- **Type**: Verification
- **Priority**: 4
- **Estimated**: 30 min
- **Dependencies**: EMAIL-024
- **Acceptance Criteria**:
  - [ ] All tests passing
  - [ ] All manual tests completed
  - [ ] email_logs table contains all sends
  - [ ] No customer-facing issues
  - [ ] Documentation complete
  - [ ] Rollback plan documented
  - [ ] Success criteria met

---

## Execution Timeline

### Parallelization Strategy

```
PHASE 1 (2 hours - Sequential)
  EMAIL-001 → EMAIL-002, EMAIL-003 → EMAIL-004

PHASE 2 (1 hour - Parallel)
  EMAIL-005, 006, 007, 008, 009, 010, 011, 012, 013, 014, 015
  (All can run in parallel after EMAIL-004)

PHASE 3 (2 hours - Sequential)
  EMAIL-016 → EMAIL-017 → EMAIL-018, EMAIL-019

PHASE 4 (1.5 hours - Sequential)
  EMAIL-020 → EMAIL-021 → EMAIL-022

PHASE 5 (1.5 hours - Sequential)
  EMAIL-023 → EMAIL-024 → EMAIL-025
```

**Total Time with Parallelization**: 6-8 hours

---

## Success Criteria

### Implementation Criteria
- [ ] All 18 email types have database templates
- [ ] All templates use standardized HTML design
- [ ] All templates include variable placeholders
- [ ] All templates have HTML and text versions

### Variable Criteria
- [ ] All variables standardized across 18 types
- [ ] Universal variables documented
- [ ] Contextual variables mapped to email types
- [ ] Variable substitution working correctly
- [ ] Fallback values implemented

### Function Criteria
- [ ] All email functions updated/created
- [ ] All functions use database templates
- [ ] All functions use Bearer token auth
- [ ] All functions log to email_logs

### Testing Criteria
- [ ] Automated test suite: 100% pass rate
- [ ] Manual testing: All 18 scenarios completed
- [ ] Visual verification: All emails consistent
- [ ] Email delivery: All emails arrive correctly

### Documentation Criteria
- [ ] Variable reference complete
- [ ] Architecture guide complete
- [ ] Testing guide complete
- [ ] Troubleshooting guide complete

---

## Risk Mitigation

| Risk | Impact | Mitigation |
|------|--------|-----------|
| Database templates incomplete | High | Keep code fallbacks until migration verified |
| Email delivery interruption | High | Test on staging first, gradual rollout |
| Variable substitution errors | High | Comprehensive test suite with edge cases |
| Edge function deployment issues | Medium | Verify secrets, have rollback plan |
| Styling breaks in email clients | Medium | Test in multiple clients, use inline CSS |
| Missing edge functions | Medium | Audit all 18 types, create as needed |

---

## Next Steps

### User Approval Required

Please confirm:

1. **Scope Approval**: Are all 18 email types correct?
2. **Variable Names**: Are standardized variables appropriate?
3. **Design**: Is "welcome" styling acceptable for all types?
4. **Timeline**: Can we proceed immediately or schedule?
5. **Testing**: Is automated + manual sufficient?

### Once Approved

1. Execute Phase 1 (Audit & Analysis)
2. Execute Phase 2 (Database Migration)
3. Execute Phase 3 (Backend Updates) in parallel
4. Execute Phases 4-8 sequentially
5. Verify all success criteria
6. Commit to fix/go-live-bug-fixes branch
7. Deploy to staging/production

---

**Status**: 🟢 READY FOR APPROVAL & EXECUTION
