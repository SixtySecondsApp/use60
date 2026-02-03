# Email Template Audit Report
Generated: 2026-02-03

## Executive Summary

**Current State**: 12 templates in database
**Expected State**: 18 templates (per edge function mapping)
**Issues Found**: 10 critical problems

## Problem 1: Missing Templates

The edge function expects 18 template types, but only 12 exist in database.

**Missing templates** (need to be created):
1. `member_removed` - For org member removal notifications
2. `org_approval` - Organization setup completion
3. `join_request_approved` - Join request approval
4. `fathom_connected` - Fathom integration success
5. `first_meeting_synced` - First meeting sync notification
6. `subscription_confirmed` - Subscription confirmation
7. `meeting_limit_warning` - Meeting limit approaching
8. `upgrade_prompt` - Feature upgrade prompts
9. `join_request_rejected` - Join request rejection
10. `permission_to_close` - Permission request notifications

## Problem 2: Duplicate Welcome Templates

Two templates exist with `template_type = 'welcome'`:
- "Welcome to Sixty" (created 2025-12-11)
- "Welcome to Sixty Seconds" (created 2026-01-22)

**Impact**: Edge function will return inconsistent results when querying by type.

**Recommendation**: Keep the newer one, delete or rename the older one.

## Problem 3: Wrong Template Types

### organization_invitation
- **Current**: `template_type = 'transactional'`
- **Expected**: `template_type = 'organization_invitation'`
- **Why it matters**: Edge function queries by `template_type`, not by `template_name`
- **Fix**: Update template_type to match template_name

### user_created
- **Current**: `template_type = 'transactional'`
- **Issue**: Not referenced in edge function mapping
- **Status**: Orphaned/unused template

## Problem 4: Inconsistent Naming

### Waitlist Invitation Template
- **Template name**: "Waitlist Invitation - Set Password"
- **Template type**: `waitlist_invitation`
- **Expected type**: `waitlist_invite` (per edge function)
- **Fix**: Either rename type to match edge function, or update edge function mapping

## Problem 5: Empty Variables Arrays

Most templates show `Variables: (none)` despite using placeholders like `{{first_name}}`.

**Affected templates**:
- Email Change Verification
- Magic Link - Early Access
- Reset Password
- Trial Ending Soon
- Trial Expired
- Waitlist Invitation - Set Password
- Welcome to Sixty
- Welcome to Sixty Seconds
- Welcome to the Waitlist
- You're In!

**Impact**:
- Makes it harder to know which variables are required
- No validation of variables passed to templates
- Poor developer experience

**Expected format** (from migration file):
```json
[
  {"name": "recipient_name", "description": "Recipient's first name"},
  {"name": "organization_name", "description": "Organization name"}
]
```

## Problem 6: Unused Templates

These templates exist but aren't referenced in the edge function:
1. `magic_link_waitlist` - Magic Link - Early Access
2. `transactional` (user_created) - user_created template

**Recommendation**: Either add to edge function mapping or mark as inactive.

## Edge Function Template Mapping

The edge function (encharge-send-email/index.ts:504-536) expects these types:

```typescript
{
  // Organization & Membership (4)
  organization_invitation: 'Organization Invitation Sent',
  member_removed: 'Member Removed',
  org_approval: 'Organization Approval',
  join_request_approved: 'Join Request Approved',

  // Waitlist & Access (2)
  waitlist_invite: 'Waitlist Invite Sent',
  waitlist_welcome: 'Waitlist Welcome Sent',

  // Onboarding (1)
  welcome: 'Account Created',

  // Integrations (2)
  fathom_connected: 'Fathom Connected',
  first_meeting_synced: 'First Meeting Synced',

  // Subscription & Trial (5)
  trial_ending: 'Trial Ending Soon',
  trial_expired: 'Trial Expired',
  subscription_confirmed: 'Subscription Confirmed',
  meeting_limit_warning: 'Meeting Limit Warning',
  upgrade_prompt: 'Upgrade Prompt Sent',

  // Account Management (3)
  email_change_verification: 'Email Change Verification',
  password_reset: 'Password Reset Requested',
  join_request_rejected: 'Join Request Rejected',

  // Admin/Moderation (1)
  permission_to_close: 'Permission to Close Requested',
}
```

## Current Database State

| # | Template Name | template_type | Status | Issues |
|---|---------------|---------------|--------|--------|
| 1 | Email Change Verification | email_change_verification | ✅ OK | Empty variables |
| 2 | Magic Link - Early Access | magic_link_waitlist | ⚠️ Unused | Not in edge function |
| 3 | organization_invitation | transactional | ❌ WRONG | Should be 'organization_invitation' |
| 4 | Reset Password | password_reset | ✅ OK | Empty variables |
| 5 | Trial Ending Soon | trial_ending | ✅ OK | Empty variables |
| 6 | Trial Expired | trial_expired | ✅ OK | Empty variables |
| 7 | user_created | transactional | ⚠️ Unused | Not in edge function |
| 8 | Waitlist Invitation - Set Password | waitlist_invitation | ❌ WRONG | Should be 'waitlist_invite' |
| 9 | Welcome to Sixty | welcome | ⚠️ Duplicate | Multiple welcome types |
| 10 | Welcome to Sixty Seconds | welcome | ⚠️ Duplicate | Newer version |
| 11 | Welcome to the Waitlist | waitlist_welcome | ✅ OK | Empty variables |
| 12 | You're In! | waitlist_invite | ✅ OK | Empty variables |

## Migration File vs Database

The migration `20260203210000_create_all_email_templates.sql` was supposed to create 17 templates with:
- Proper `template_type` values
- Complete `variables` arrays
- Standardized HTML/text bodies

**What went wrong**: The migration was never run, or was overwritten by older templates.

## Recommended Actions

### Immediate (Critical)
1. ✅ Fix `organization_invitation` template_type
2. ✅ Fix `Waitlist Invitation` template_type
3. ✅ Delete duplicate Welcome template
4. ✅ Populate variables arrays for all templates

### Short-term (Important)
5. ✅ Create 10 missing templates from migration file
6. ✅ Verify HTML structure includes Sixty logo
7. ✅ Test each template with edge function

### Long-term (Maintenance)
8. ✅ Add template validation tests
9. ✅ Document required variables per template
10. ✅ Create template preview/testing tool

## Code References

### Templates Queried By Type
- `src/lib/services/enchargeTemplateService.ts:53` - `getTemplateByType()`
- `supabase/functions/encharge-send-email/index.ts:456` - Edge function query

### Templates Queried By Name
- `src/lib/services/enchargeTemplateService.ts:74` - `getTemplateByName()`

### Migration Files
- `supabase/migrations/20260203210000_create_all_email_templates.sql` - Full template definitions
- `supabase/migrations/20250203_add_organization_invitation_template.sql` - Org invitation template

## Testing Checklist

After fixes:
- [ ] Run migration to create missing templates
- [ ] Verify no duplicates exist
- [ ] Test organization invitation email
- [ ] Test welcome email
- [ ] Test password reset email
- [ ] Verify all variables populate correctly
- [ ] Check HTML renders with Sixty logo
- [ ] Verify text fallback versions work
