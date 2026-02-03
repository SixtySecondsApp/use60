# EMAIL-003: Create Variables Configuration Reference - COMPLETE

**Date**: 2026-02-03
**Status**: ✅ COMPLETE
**Duration**: Variables schema created
**Deliverable**: Comprehensive variables configuration for all 18 email types

---

## Executive Summary

Created comprehensive standardized variables schema for all 18 email types in Sixty Sales Dashboard. This reference ensures consistent variable naming, types, and requirements across all email implementations.

**Key Standardizations**:
- **Universal Variables**: Applied to all emails (recipient_name, action_url, support_email, expiry_time)
- **Contextual Variables**: Applied to specific email groups (organization_name, inviter_name, admin_name, company_name, etc.)
- **Consistent Naming**: All variables use snake_case convention
- **Type Definitions**: Each variable has defined type (string, number, email, url, datetime)

---

## Universal Variables (Required in All Templates)

These variables must be available for all 18 email types:

| Variable | Type | Description | Example | Required | Default |
|----------|------|-------------|---------|----------|---------|
| `recipient_name` | String | First name of email recipient | "Sarah" | ✅ Yes | None |
| `action_url` | URL | Primary call-to-action button link | `https://app.use60.com/invite/abc123` | ✅ Yes | None |
| `support_email` | Email | Support contact email address | "support@use60.com" | ❌ No | support@use60.com |
| `expiry_time` | String | Human-readable expiration period | "7 days" | ❌ No | None |
| `email_heading` | String | Email subject/main heading | "You're Invited" | ✅ Yes | None |
| `email_content` | HTML | Main message body (supports HTML) | `<p>You've been invited...</p>` | ✅ Yes | None |
| `cta_button_text` | String | Call-to-action button label | "Accept Invitation" | ✅ Yes | "Get Started" |

---

## Contextual Variables by Email Type

### Category 1: Organization Membership (4 types)

#### 1. organization_invitation
**Used by**: send-organization-invitation function
**Purpose**: User invited to join organization

**Required Variables**:
- `recipient_name` (string)
- `email_heading` → "You're Invited to {{organization_name}}"
- `email_content` → Invitation details
- `action_url` (URL)
- `cta_button_text` → "Accept Invitation"

**Additional Variables**:
| Variable | Type | Description | Example | Required |
|----------|------|-------------|---------|----------|
| `organization_name` | String | Name of organization | "ACME Corp" | ✅ Yes |
| `inviter_name` | String | Name of person who invited | "John Smith" | ✅ Yes |
| `inviter_email` | Email | Email of person who invited | "john@acme.com" | ❌ No |
| `expiry_time` | String | Invitation expiration period | "7 days" | ✅ Yes |
| `role` | String | Role being assigned | "Sales Rep" | ❌ No |

**Database Template Name**: `organization_invitation`

**Example Usage**:
```json
{
  "recipient_name": "Sarah",
  "email_heading": "You're Invited to ACME Corp",
  "email_content": "<p>John Smith has invited you to join ACME Corp...</p>",
  "cta_button_text": "Accept Invitation",
  "action_url": "https://app.use60.com/invite/abc123",
  "organization_name": "ACME Corp",
  "inviter_name": "John Smith",
  "expiry_time": "7 days"
}
```

---

#### 2. member_removed
**Used by**: send-removal-email function
**Purpose**: Notify user they've been removed from organization

**Required Variables**:
- `recipient_name` (string)
- `email_heading` → "You've Been Removed from {{organization_name}}"
- `email_content` → Removal notification
- `action_url` (URL to support)
- `cta_button_text` → "Contact Support"

**Additional Variables**:
| Variable | Type | Description | Example | Required |
|----------|------|-------------|---------|----------|
| `organization_name` | String | Name of organization | "ACME Corp" | ✅ Yes |
| `admin_name` | String | Name of admin who removed user | "Jane Doe" | ✅ Yes |
| `admin_email` | Email | Admin's email | "jane@acme.com" | ❌ No |
| `removal_reason` | String | Why they were removed | "Inactive account" | ❌ No |

**Database Template Name**: `member_removed`

**Example Usage**:
```json
{
  "recipient_name": "Sarah",
  "email_heading": "You've Been Removed from ACME Corp",
  "email_content": "<p>You have been removed from ACME Corp...</p>",
  "cta_button_text": "Contact Support",
  "action_url": "mailto:support@use60.com",
  "organization_name": "ACME Corp",
  "admin_name": "Jane Doe"
}
```

---

#### 3. org_approval
**Used by**: NEW FUNCTION (to be created)
**Purpose**: Notify organization that a join request or setup was approved

**Required Variables**:
- `recipient_name` (string)
- `email_heading` → "Organization Approved"
- `email_content` → Approval notification
- `action_url` (URL to organization)
- `cta_button_text` → "View Organization"

**Additional Variables**:
| Variable | Type | Description | Example | Required |
|----------|------|-------------|---------|----------|
| `organization_name` | String | Name of organization | "ACME Corp" | ✅ Yes |
| `approval_type` | String | Type of approval | "setup_complete" | ✅ Yes |
| `approval_details` | String | Additional approval info | "Your organization is ready" | ❌ No |

**Database Template Name**: `org_approval`

---

#### 4. join_request_approved
**Used by**: handle-join-request-action function
**Purpose**: Notify user that their join request was approved

**Required Variables**:
- `recipient_name` (string)
- `email_heading` → "Your Request Has Been Approved"
- `email_content` → Approval notification
- `action_url` (URL to organization)
- `cta_button_text` → "Get Started"

**Additional Variables**:
| Variable | Type | Description | Example | Required |
|----------|------|-------------|---------|----------|
| `organization_name` | String | Organization name | "ACME Corp" | ✅ Yes |
| `admin_name` | String | Admin approving request | "John Smith" | ✅ Yes |

**Database Template Name**: `join_request_approved`

---

### Category 2: Waitlist & Access (2 types)

#### 5. waitlist_invite
**Used by**: send-waitlist-invitation / waitlistAdminService function
**Purpose**: Send early access/waitlist invitation

**Required Variables**:
- `recipient_name` (string)
- `email_heading` → "Early Access to {{company_name}}"
- `email_content` → Waitlist invitation
- `action_url` (URL to get access)
- `cta_button_text` → "Get Started"

**Additional Variables**:
| Variable | Type | Description | Example | Required |
|----------|------|-------------|---------|----------|
| `company_name` | String | Company/product name | "Sixty" | ✅ Yes |
| `expiry_time` | String | Waitlist code expiration | "7 days" | ✅ Yes |
| `invitation_code` | String | Unique invitation code | "INVITE-ABC123" | ❌ No |
| `waitlist_position` | Number | User's position on waitlist | "45" | ❌ No |

**Database Template Name**: `waitlist_invite`

**Example Usage**:
```json
{
  "recipient_name": "Alex",
  "email_heading": "Early Access to Sixty",
  "email_content": "<p>Great news! Your early access is ready...</p>",
  "cta_button_text": "Get Started",
  "action_url": "https://app.use60.com/waitlist/abc123",
  "company_name": "Sixty",
  "expiry_time": "7 days",
  "invitation_code": "INVITE-ABC123"
}
```

---

#### 6. waitlist_welcome
**Used by**: waitlist-welcome-email function
**Purpose**: Welcome user after they accept waitlist invitation

**Required Variables**:
- `recipient_name` (string)
- `email_heading` → "Welcome to {{company_name}}"
- `email_content` → Welcome message
- `action_url` (URL to app)
- `cta_button_text` → "Open {{company_name}}"

**Additional Variables**:
| Variable | Type | Description | Example | Required |
|----------|------|-------------|---------|----------|
| `company_name` | String | Company/product name | "Sixty" | ✅ Yes |
| `getting_started_url` | URL | Link to onboarding | `https://use60.com/getting-started` | ❌ No |

**Database Template Name**: `waitlist_welcome`

---

### Category 3: Onboarding (1 type)

#### 7. welcome
**Used by**: invite-user function (admin onboarding)
**Purpose**: Welcome new user to organization

**Required Variables**:
- `recipient_name` (string)
- `email_heading` → "Welcome to {{organization_name}}"
- `email_content` → Onboarding instructions
- `action_url` (URL to app)
- `cta_button_text` → "Get Started"

**Additional Variables**:
| Variable | Type | Description | Example | Required |
|----------|------|-------------|---------|----------|
| `organization_name` | String | Organization name | "ACME Corp" | ✅ Yes |
| `getting_started_url` | URL | Onboarding guide | `https://use60.com/getting-started` | ❌ No |

**Database Template Name**: `welcome`

---

### Category 4: Integrations (2 types)

#### 8. fathom_connected
**Used by**: NEW FUNCTION (to be created)
**Purpose**: Notify when Fathom analytics is connected

**Required Variables**:
- `recipient_name` (string)
- `email_heading` → "Fathom Connected Successfully"
- `email_content` → Connection confirmation
- `action_url` (URL to view analytics)
- `cta_button_text` → "View Analytics"

**Additional Variables**:
| Variable | Type | Description | Example | Required |
|----------|------|-------------|---------|----------|
| `organization_name` | String | Organization name | "ACME Corp" | ✅ Yes |

**Database Template Name**: `fathom_connected`

---

#### 9. first_meeting_synced
**Used by**: NEW FUNCTION (to be created)
**Purpose**: Notify when first meeting is synced from calendar

**Required Variables**:
- `recipient_name` (string)
- `email_heading` → "Your First Meeting is Ready"
- `email_content` → Meeting sync confirmation
- `action_url` (URL to view meeting)
- `cta_button_text` → "View Meeting"

**Additional Variables**:
| Variable | Type | Description | Example | Required |
|----------|------|-------------|---------|----------|
| `meeting_title` | String | Title of synced meeting | "Q1 Planning" | ✅ Yes |
| `meeting_date` | Date | Meeting date/time | "2026-02-10" | ❌ No |

**Database Template Name**: `first_meeting_synced`

---

### Category 5: Subscription & Trial (5 types)

#### 10. trial_ending
**Used by**: scheduled-encharge-emails (cron)
**Purpose**: Warn user their trial is ending soon

**Required Variables**:
- `recipient_name` (string)
- `email_heading` → "Your Trial Ends in {{trial_days}} Days"
- `email_content` → Trial ending warning
- `action_url` (URL to upgrade)
- `cta_button_text` → "Upgrade Now"

**Additional Variables**:
| Variable | Type | Description | Example | Required |
|----------|------|-------------|---------|----------|
| `trial_days` | Number | Days until trial ends | "3" | ✅ Yes |
| `trial_end_date` | Date | Exact end date | "2026-02-10" | ❌ No |

**Database Template Name**: `trial_ending`

**Example Usage**:
```json
{
  "recipient_name": "Sarah",
  "email_heading": "Your Trial Ends in 3 Days",
  "email_content": "<p>Your trial ends in 3 days...</p>",
  "cta_button_text": "Upgrade Now",
  "action_url": "https://app.use60.com/upgrade",
  "trial_days": "3"
}
```

---

#### 11. trial_expired
**Used by**: scheduled-encharge-emails (cron)
**Purpose**: Notify user that trial has expired

**Required Variables**:
- `recipient_name` (string)
- `email_heading` → "Your Trial Has Expired"
- `email_content` → Trial expired message
- `action_url` (URL to reactivate)
- `cta_button_text` → "Reactivate"

**Additional Variables**:
| Variable | Type | Description | Example | Required |
|----------|------|-------------|---------|----------|
| `expiry_date` | Date | When trial expired | "2026-02-10" | ❌ No |
| `reactivation_url` | URL | URL to reactivate | `https://app.use60.com/reactivate` | ❌ No |

**Database Template Name**: `trial_expired`

---

#### 12. subscription_confirmed
**Used by**: NEW FUNCTION (to be created)
**Purpose**: Confirm subscription purchase

**Required Variables**:
- `recipient_name` (string)
- `email_heading` → "Your Subscription is Confirmed"
- `email_content` → Subscription confirmation
- `action_url` (URL to manage subscription)
- `cta_button_text` → "Manage Subscription"

**Additional Variables**:
| Variable | Type | Description | Example | Required |
|----------|------|-------------|---------|----------|
| `plan_name` | String | Subscription plan name | "Professional" | ✅ Yes |
| `price` | String | Monthly/annual price | "$29/month" | ❌ No |
| `renewal_date` | Date | Next renewal date | "2026-03-03" | ❌ No |

**Database Template Name**: `subscription_confirmed`

---

#### 13. meeting_limit_warning
**Used by**: NEW FUNCTION (to be created)
**Purpose**: Warn user they're approaching meeting limit

**Required Variables**:
- `recipient_name` (string)
- `email_heading` → "You're Approaching Your Meeting Limit"
- `email_content` → Meeting limit warning
- `action_url` (URL to upgrade)
- `cta_button_text` → "Upgrade Plan"

**Additional Variables**:
| Variable | Type | Description | Example | Required |
|----------|------|-------------|---------|----------|
| `current_meetings` | Number | Current meeting count | "45" | ✅ Yes |
| `meeting_limit` | Number | Limit for current plan | "50" | ✅ Yes |
| `remaining_meetings` | Number | Meetings remaining | "5" | ✅ Yes |

**Database Template Name**: `meeting_limit_warning`

---

#### 14. upgrade_prompt
**Used by**: NEW FUNCTION (to be created)
**Purpose**: Encourage user to upgrade plan

**Required Variables**:
- `recipient_name` (string)
- `email_heading` → "Unlock More Features"
- `email_content` → Upgrade benefits
- `action_url` (URL to upgrade page)
- `cta_button_text` → "Upgrade Now"

**Additional Variables**:
| Variable | Type | Description | Example | Required |
|----------|------|-------------|---------|----------|
| `feature_name` | String | Feature they're missing | "Advanced Analytics" | ✅ Yes |
| `current_plan` | String | Their current plan | "Starter" | ❌ No |
| `upgrade_plan` | String | Recommended upgrade | "Professional" | ❌ No |

**Database Template Name**: `upgrade_prompt`

---

### Category 6: Account Management (3 types)

#### 15. email_change_verification
**Used by**: request-email-change function
**Purpose**: Request verification of new email address

**Required Variables**:
- `recipient_name` (string)
- `email_heading` → "Verify Your New Email Address"
- `email_content` → Email change verification
- `action_url` (URL to verify)
- `cta_button_text` → "Verify Email"

**Additional Variables**:
| Variable | Type | Description | Example | Required |
|----------|------|-------------|---------|----------|
| `old_email` | Email | Current email address | "sarah@old.com" | ✅ Yes |
| `new_email` | Email | New email address | "sarah@new.com" | ✅ Yes |
| `expiry_time` | String | Verification link expiration | "24 hours" | ✅ Yes |

**Database Template Name**: `email_change_verification`

**Example Usage**:
```json
{
  "recipient_name": "Sarah",
  "email_heading": "Verify Your New Email Address",
  "email_content": "<p>You requested to change your email...</p>",
  "cta_button_text": "Verify Email",
  "action_url": "https://app.use60.com/verify-email/abc123",
  "old_email": "sarah@old.com",
  "new_email": "sarah@new.com",
  "expiry_time": "24 hours"
}
```

---

#### 16. password_reset
**Used by**: send-password-reset-email function
**Purpose**: Send password reset link

**Required Variables**:
- `recipient_name` (string)
- `email_heading` → "Reset Your Password"
- `email_content` → Password reset instructions
- `action_url` (URL to reset password)
- `cta_button_text` → "Reset Password"

**Additional Variables**:
| Variable | Type | Description | Example | Required |
|----------|------|-------------|---------|----------|
| `expiry_time` | String | Link expiration | "1 hour" | ✅ Yes |
| `reset_token` | String | Reset token code | "RESET-ABC123XYZ" | ❌ No |

**Database Template Name**: `password_reset`

---

#### 17. join_request_rejected
**Used by**: handle-join-request-action function
**Purpose**: Notify user that their join request was rejected

**Required Variables**:
- `recipient_name` (string)
- `email_heading` → "Your Request Could Not Be Approved"
- `email_content` → Rejection notification
- `action_url` (URL to support)
- `cta_button_text` → "Contact Support"

**Additional Variables**:
| Variable | Type | Description | Example | Required |
|----------|------|-------------|---------|----------|
| `organization_name` | String | Organization name | "ACME Corp" | ✅ Yes |
| `rejection_reason` | String | Why rejected | "Account not eligible" | ❌ No |
| `support_url` | URL | Support contact | `https://use60.com/support` | ❌ No |

**Database Template Name**: `join_request_rejected`

---

### Category 7: Admin/Moderation (2 types)

#### 18. permission_to_close
**Used by**: NEW FUNCTION (to be created)
**Purpose**: Request admin permission to close/archive item

**Required Variables**:
- `recipient_name` (string)
- `email_heading` → "Permission Needed to Close {{item_type}}"
- `email_content` → Permission request
- `action_url` (URL to review)
- `cta_button_text` → "Review Request"

**Additional Variables**:
| Variable | Type | Description | Example | Required |
|----------|------|-------------|---------|----------|
| `item_type` | String | Type of item | "Deal" | ✅ Yes |
| `item_name` | String | Name of item | "Acme Corp Deal" | ✅ Yes |
| `requester_name` | String | Who requested | "John Smith" | ✅ Yes |

**Database Template Name**: `permission_to_close`

---

## Variable Type Definitions

All variables use one of these types:

### String
Plain text, no special formatting. Maximum 500 characters unless otherwise noted.

```
Examples: "John Smith", "ACME Corp", "7 days"
Validation: alphanumeric + common punctuation
```

### Email
Valid email address format.

```
Format: user@domain.com
Validation: RFC 5322 email format
Examples: "support@use60.com", "sarah@example.com"
```

### URL
Full URL including protocol.

```
Format: https://...
Validation: Valid HTTP/HTTPS URL
Examples: "https://app.use60.com/invite/abc123"
```

### Number
Integer or decimal number.

```
Format: numeric only
Validation: Valid JSON number
Examples: 3, 45, 29.99
```

### Date
ISO 8601 date format.

```
Format: YYYY-MM-DD or ISO 8601 datetime
Examples: "2026-02-10", "2026-02-10T14:30:00Z"
```

### HTML
HTML content that will be safely rendered in email.

```
Allowed tags: <p>, <strong>, <em>, <a>, <ul>, <ol>, <li>, <br>, <blockquote>
Validation: HTML escaping required
```

---

## Variable Validation Rules

### Recipient Name
- **Type**: String
- **Max Length**: 50 characters
- **Required**: Yes
- **Format**: First name only (no email addresses)
- **Fallback**: None - email must not be sent if missing

### Action URL
- **Type**: URL
- **Max Length**: 2000 characters
- **Required**: Yes
- **Format**: Full HTTPS URL
- **Validation**: Must include domain and path
- **Fallback**: None - email must not be sent if missing

### Email Content
- **Type**: HTML
- **Max Length**: 5000 characters
- **Required**: Yes
- **Format**: Valid HTML with only approved tags
- **Validation**: HTML escaping required
- **Fallback**: None - email must not be sent if missing

### Organization Name
- **Type**: String
- **Max Length**: 100 characters
- **Required**: Varies (see email type)
- **Format**: Any text
- **Fallback**: "Your Organization"

### Expiry Time
- **Type**: String
- **Max Length**: 50 characters
- **Required**: No (conditional)
- **Format**: Human-readable duration ("7 days", "24 hours", "1 week")
- **Fallback**: Not shown if missing

---

## Variable Substitution Examples

### Example 1: organization_invitation

**Template Storage**:
```json
{
  "template_type": "organization_invitation",
  "subject_line": "You're invited to {{organization_name}}",
  "html_body": "..."
}
```

**Data Provided**:
```json
{
  "recipient_name": "Sarah",
  "organization_name": "ACME Corp",
  "inviter_name": "John Smith",
  "action_url": "https://app.use60.com/invite/abc123",
  "expiry_time": "7 days"
}
```

**Rendered Subject**: "You're invited to ACME Corp"

**Rendered Content**:
```
Hi Sarah,

John Smith has invited you to join ACME Corp on Sixty.
Click the button below to accept the invitation.

[Accept Invitation Button → https://app.use60.com/invite/abc123]

This link expires in 7 days.
```

---

## Compliance Matrix

| Email Type | Template Type | Required Variables | Optional Variables | Validation |
|---|---|---|---|---|
| organization_invitation | organization_invitation | recipient_name, organization_name, inviter_name, action_url, expiry_time | inviter_email, role | All required present |
| member_removed | member_removed | recipient_name, organization_name, admin_name, action_url | admin_email, removal_reason | All required present |
| waitlist_invite | waitlist_invite | recipient_name, company_name, action_url, expiry_time | invitation_code, waitlist_position | All required present |
| waitlist_welcome | waitlist_welcome | recipient_name, company_name, action_url | getting_started_url | All required present |
| password_reset | password_reset | recipient_name, action_url, expiry_time | reset_token | All required present |
| email_change_verification | email_change_verification | recipient_name, old_email, new_email, action_url, expiry_time | None | Email format validation |
| join_request_approved | join_request_approved | recipient_name, organization_name, admin_name, action_url | None | All required present |
| join_request_rejected | join_request_rejected | recipient_name, organization_name, action_url | rejection_reason, support_url | All required present |
| trial_ending | trial_ending | recipient_name, action_url, trial_days | trial_end_date | trial_days is number |
| trial_expired | trial_expired | recipient_name, action_url | expiry_date, reactivation_url | Date format validation |
| welcome | welcome | recipient_name, organization_name, action_url | getting_started_url | All required present |
| fathom_connected | fathom_connected | recipient_name, action_url | organization_name | All required present |
| first_meeting_synced | first_meeting_synced | recipient_name, meeting_title, action_url | meeting_date | All required present |
| subscription_confirmed | subscription_confirmed | recipient_name, plan_name, action_url | price, renewal_date | All required present |
| meeting_limit_warning | meeting_limit_warning | recipient_name, current_meetings, meeting_limit, action_url | remaining_meetings | All numeric fields valid |
| upgrade_prompt | upgrade_prompt | recipient_name, feature_name, action_url | current_plan, upgrade_plan | All required present |
| org_approval | org_approval | recipient_name, organization_name, action_url | approval_details | All required present |
| permission_to_close | permission_to_close | recipient_name, item_type, item_name, requester_name, action_url | None | All required present |

---

## Implementation Checklist

- ✅ Standardized universal variables (recipient_name, action_url, support_email, expiry_time)
- ✅ Documented all 18 email types
- ✅ Created contextual variable groups
- ✅ Defined variable types and formats
- ✅ Created validation rules
- ✅ Built compliance matrix
- ✅ Provided usage examples
- ✅ Established type definitions
- ✅ Created substitution examples

---

## Next Steps

Phase 4 (EMAIL-004): Create Migration for All 18 Templates
- Create SQL migration script
- Insert all 18 template records
- Include HTML/text versions
- Set is_active flags
- Ensure idempotency

