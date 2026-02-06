# Email System - Comprehensive Variable Reference Guide

**Last Updated**: 2026-02-03
**Version**: 1.0
**Status**: Production Ready

---

## Table of Contents

1. [Quick Reference](#quick-reference)
2. [Variable Catalog](#variable-catalog)
3. [Email Type Sections](#email-type-sections)
4. [Integration Guide](#integration-guide)
5. [Best Practices](#best-practices)
6. [Troubleshooting](#troubleshooting)
7. [Administration](#administration)

---

## Quick Reference

### All 18 Email Types - At a Glance

| # | Type ID | Name | Category | Required Variables | Optional Variables |
|---|---------|------|----------|-------------------|-------------------|
| 1 | `organization_invitation` | Organization Invitation | Organization | recipient_name, organization_name, inviter_name, action_url | expiry_time |
| 2 | `member_removed` | Member Removed | Organization | recipient_name, organization_name, admin_name | support_email |
| 3 | `org_approval` | Organization Approval | Organization | recipient_name, organization_name, action_url | - |
| 4 | `join_request_approved` | Join Request Approved | Organization | recipient_name, admin_name, organization_name, action_url | - |
| 5 | `waitlist_invite` | Waitlist Invite | Waitlist | recipient_name, company_name, action_url | expiry_time |
| 6 | `waitlist_welcome` | Waitlist Welcome | Waitlist | recipient_name, company_name, action_url | - |
| 7 | `welcome` | Welcome (Onboarding) | Onboarding | recipient_name, organization_name, action_url | - |
| 8 | `fathom_connected` | Fathom Connected | Integrations | recipient_name, organization_name, action_url | - |
| 9 | `first_meeting_synced` | First Meeting Synced | Integrations | recipient_name, meeting_title, action_url | - |
| 10 | `trial_ending` | Trial Ending | Trial | recipient_name, trial_days, action_url | - |
| 11 | `trial_expired` | Trial Expired | Trial | recipient_name, action_url | - |
| 12 | `subscription_confirmed` | Subscription Confirmed | Trial | recipient_name, plan_name, action_url | - |
| 13 | `meeting_limit_warning` | Meeting Limit Warning | Trial | recipient_name, current_meetings, meeting_limit, remaining_meetings, action_url | - |
| 14 | `upgrade_prompt` | Upgrade Prompt | Trial | recipient_name, feature_name, upgrade_plan, action_url | - |
| 15 | `email_change_verification` | Email Change Verification | Account | recipient_name, old_email, new_email, action_url | expiry_time |
| 16 | `password_reset` | Password Reset | Account | recipient_name, action_url | expiry_time |
| 17 | `join_request_rejected` | Join Request Rejected | Organization | recipient_name, organization_name | support_email |
| 18 | `permission_to_close` | Permission to Close | Admin | recipient_name, requester_name, item_type, item_name, action_url | - |

---

## Variable Catalog

### Universal Variables

These variables are standardized across ALL email types and should be used consistently:

#### 1. **recipient_name** (Required for all types)
- **Type**: String
- **Description**: The recipient's display name (usually first name or full name)
- **Format**: Plain text, max 100 characters
- **Example**: "John", "Sarah Smith"
- **Default**: Extracted from email if not provided (e.g., "john" from john@example.com)
- **Usage**: Use in greeting: "Hi {{recipient_name}},"
- **Database Source**: `profiles.full_name` or `profiles.first_name`
- **Common Mistakes**:
  - Using email instead of name
  - Using "User" or generic placeholder
  - Leaving blank instead of providing fallback

#### 2. **user_email** (Optional, logged by system)
- **Type**: String (Email)
- **Description**: The recipient's email address
- **Format**: Valid RFC 5322 format
- **Example**: "john@acme.com"
- **Default**: Automatically set from `to_email` parameter
- **Usage**: For tracking and analytics
- **Validation**: Must pass RFC 5322 email validation
- **Common Mistakes**: Misspelled email addresses, invalid format

#### 3. **organization_name** (Used in 8 email types)
- **Type**: String
- **Description**: Name of the organization the action relates to
- **Format**: Plain text, max 200 characters, may include special characters
- **Example**: "Acme Corp", "Smith & Associates"
- **Default**: None - must be provided
- **Usage**: Context for organization-related actions
- **Database Source**: `organizations.name`
- **Common Mistakes**:
  - Using org_id instead of name
  - Using abbreviation instead of full name
  - HTML encoding issues with special characters

#### 4. **action_url** (Used in 15 email types)
- **Type**: String (URL)
- **Description**: Primary call-to-action link for the email
- **Format**: Full HTTPS URL (must start with https://)
- **Example**: "https://app.use60.com/invite/abc123", "https://app.use60.com/upgrade"
- **Default**: None - must be provided
- **Validation Rules**:
  - Must be HTTPS (secure)
  - Must be absolute URL (include domain)
  - Should include authentication token in query string if needed
  - Max 2048 characters
- **Usage**: Main button in email template
- **Common Mistakes**:
  - Using relative URLs (e.g., "/invite/abc123")
  - Using HTTP instead of HTTPS
  - Forgetting query parameters needed for authentication
  - Including unencoded special characters

#### 5. **expiry_time** (Optional, used in 5 email types)
- **Type**: String
- **Description**: When the action URL expires (e.g., "24 hours", "7 days")
- **Format**: Human-readable time duration
- **Example**: "24 hours", "7 days", "30 minutes"
- **Default**: None - only include if action expires
- **Usage**: Warning about link expiration deadline
- **Calculation**: Typically NOW() + interval (24 hours, 7 days, etc.)
- **Database Source**: Calculate from `invitation.expires_at` timestamp
- **Common Mistakes**:
  - Using absolute timestamp instead of duration
  - Providing non-human-readable format
  - Forgetting to update when expiry changes

#### 6. **support_email** (Optional, used in 2 email types)
- **Type**: String (Email)
- **Description**: Support contact email address
- **Format**: Valid RFC 5322 email format
- **Example**: "support@use60.com", "help@use60.com"
- **Default**: "support@use60.com" (configured in edge function)
- **Usage**: When user needs to contact support
- **Static**: Usually doesn't change per request
- **Common Mistakes**: Using internal email instead of public support email

#### 7. **admin_name** (Used in 3 email types)
- **Type**: String
- **Description**: Name of administrator performing action
- **Format**: Plain text, max 100 characters
- **Example**: "Sarah Chen", "John Smith"
- **Default**: None - must be provided when applicable
- **Database Source**: `profiles.full_name` of admin user
- **Usage**: Context for administrative actions
- **Common Mistakes**: Using email or username instead of display name

### Contextual Variables by Category

#### Organization & Membership (4 types)

**organization_invitation** variables:
- `recipient_name` - Person being invited
- `organization_name` - Organization they're invited to
- `inviter_name` - Person sending invitation
- `action_url` - Link to accept invitation
- `expiry_time` - When invitation expires (optional)

**member_removed** variables:
- `recipient_name` - Person being removed
- `organization_name` - Organization they're removed from
- `admin_name` - Administrator who removed them
- `support_email` - Support contact (optional)

**org_approval** variables:
- `recipient_name` - Organization owner
- `organization_name` - Organization being approved
- `action_url` - Link to get started

**join_request_approved** variables:
- `recipient_name` - Person whose request was approved
- `admin_name` - Administrator who approved
- `organization_name` - Organization they joined
- `action_url` - Link to get started

#### Waitlist & Access (2 types)

**waitlist_invite** variables:
- `recipient_name` - Invitee name
- `company_name` - Company name (use for marketing)
- `action_url` - Early access link
- `expiry_time` - When access link expires (optional)

**waitlist_welcome** variables:
- `recipient_name` - New user name
- `company_name` - Company name
- `action_url` - Login/dashboard link

#### Integrations (2 types)

**fathom_connected** variables:
- `recipient_name` - User who connected
- `organization_name` - Organization where connected
- `action_url` - Link to analytics dashboard

**first_meeting_synced** variables:
- `recipient_name` - User with synced meeting
- `meeting_title` - Title of first meeting
- `action_url` - Link to meeting in app

#### Trial & Subscription (5 types)

**trial_ending** variables:
- `recipient_name` - Trial user
- `trial_days` - Days remaining (e.g., "3", "7")
- `action_url` - Upgrade URL

**trial_expired** variables:
- `recipient_name` - User whose trial expired
- `action_url` - Reactivation URL

**subscription_confirmed** variables:
- `recipient_name` - New subscriber
- `plan_name` - Plan they subscribed to (e.g., "Professional", "Enterprise")
- `action_url` - Subscription management URL

**meeting_limit_warning** variables:
- `recipient_name` - User approaching limit
- `current_meetings` - Number used (e.g., "8")
- `meeting_limit` - Monthly limit (e.g., "10")
- `remaining_meetings` - Number left (e.g., "2")
- `action_url` - Upgrade URL

**upgrade_prompt** variables:
- `recipient_name` - Interested user
- `feature_name` - Feature they want (e.g., "Advanced Analytics")
- `upgrade_plan` - Plan containing feature (e.g., "Professional")
- `action_url` - Upgrade URL

#### Account Management (3 types)

**email_change_verification** variables:
- `recipient_name` - User changing email
- `old_email` - Current email address
- `new_email` - New email address
- `action_url` - Verification link
- `expiry_time` - When link expires (optional)

**password_reset** variables:
- `recipient_name` - User resetting password
- `action_url` - Password reset link
- `expiry_time` - When link expires (optional)

**join_request_rejected** variables:
- `recipient_name` - Requester whose request was rejected
- `organization_name` - Organization they requested to join
- `support_email` - Support contact (optional)

#### Admin & Moderation (1 type)

**permission_to_close** variables:
- `recipient_name` - Permission requester/approver
- `requester_name` - Person requesting to close
- `item_type` - Type of item (e.g., "Deal", "Task")
- `item_name` - Name of item (e.g., "Acme Contract")
- `action_url` - Link to review request

---

## Email Type Sections

### 1. organization_invitation

**Template ID**: `organization_invitation`
**Template Name**: Organization Invitation
**Category**: Organization & Membership

**Purpose**: Invite users to join an organization. Sent when an organization owner/admin invites someone to collaborate.

**Required Variables**:
- `recipient_name` - Person being invited
- `organization_name` - Organization name
- `inviter_name` - Who is sending invitation
- `action_url` - Invitation acceptance link (includes token)

**Optional Variables**:
- `expiry_time` - When invitation expires (e.g., "7 days")

**Example JSON**:
```json
{
  "to_email": "sarah@acme.com",
  "to_name": "Sarah Chen",
  "template_type": "organization_invitation",
  "variables": {
    "recipient_name": "Sarah",
    "organization_name": "Acme Corp",
    "inviter_name": "John Smith",
    "action_url": "https://app.use60.com/invite/token_abc123xyz",
    "expiry_time": "7 days"
  }
}
```

**Validation Rules**:
- `action_url` must contain valid invitation token
- `expiry_time` should be human-readable duration if provided
- `organization_name` must not be empty
- Email address must be valid

**Verify Template Exists**:
```sql
SELECT * FROM encharge_email_templates
WHERE template_type = 'organization_invitation'
AND is_active = TRUE;
```

**Database Query to Get Template Details**:
```sql
SELECT id, template_name, subject_line, html_body, text_body, variables
FROM encharge_email_templates
WHERE template_type = 'organization_invitation';
```

**Common Gotchas**:
- Forgetting to URL-encode special characters in `action_url`
- Using organization ID instead of name
- Including HTTP instead of HTTPS
- Not including authentication token in URL
- Incorrect token format/validation

---

### 2. member_removed

**Template ID**: `member_removed`
**Template Name**: Member Removed
**Category**: Organization & Membership

**Purpose**: Notify user they've been removed from an organization. Sent when organization admin removes a member.

**Required Variables**:
- `recipient_name` - Person being removed
- `organization_name` - Organization name
- `admin_name` - Administrator who removed them

**Optional Variables**:
- `support_email` - Support contact for disputes

**Example JSON**:
```json
{
  "to_email": "john@example.com",
  "to_name": "John Doe",
  "template_type": "member_removed",
  "variables": {
    "recipient_name": "John",
    "organization_name": "Acme Corp",
    "admin_name": "Sarah Chen",
    "support_email": "support@use60.com"
  }
}
```

**Validation Rules**:
- All three required fields must be non-empty
- `admin_name` should be actual person name, not email
- `organization_name` must match org in database

**Verify Template Exists**:
```sql
SELECT * FROM encharge_email_templates
WHERE template_type = 'member_removed'
AND is_active = TRUE;
```

**Common Gotchas**:
- Sending to wrong email address
- Including technical details user doesn't need
- Not providing support email for disputes
- Using org ID instead of name

---

### 3. org_approval

**Template ID**: `org_approval`
**Template Name**: Organization Approval
**Category**: Organization & Membership

**Purpose**: Confirm organization setup is complete and ready to use.

**Required Variables**:
- `recipient_name` - Organization owner
- `organization_name` - Organization name
- `action_url` - Get started URL

**Optional Variables**: None

**Example JSON**:
```json
{
  "to_email": "owner@acme.com",
  "to_name": "Alice Smith",
  "template_type": "org_approval",
  "variables": {
    "recipient_name": "Alice",
    "organization_name": "Acme Corp",
    "action_url": "https://app.use60.com/dashboard"
  }
}
```

**Verify Template Exists**:
```sql
SELECT * FROM encharge_email_templates
WHERE template_type = 'org_approval'
AND is_active = TRUE;
```

---

### 4. join_request_approved

**Template ID**: `join_request_approved`
**Template Name**: Join Request Approved
**Category**: Organization & Membership

**Purpose**: Notify user their request to join an organization was approved.

**Required Variables**:
- `recipient_name` - User whose request was approved
- `admin_name` - Admin who approved
- `organization_name` - Organization they joined
- `action_url` - Get started link

**Example JSON**:
```json
{
  "to_email": "candidate@example.com",
  "to_name": "Mike Johnson",
  "template_type": "join_request_approved",
  "variables": {
    "recipient_name": "Mike",
    "admin_name": "Sarah Chen",
    "organization_name": "Acme Corp",
    "action_url": "https://app.use60.com/org/acme-corp"
  }
}
```

**Verify Template Exists**:
```sql
SELECT * FROM encharge_email_templates
WHERE template_type = 'join_request_approved'
AND is_active = TRUE;
```

---

### 5. waitlist_invite

**Template ID**: `waitlist_invite`
**Template Name**: Waitlist Invite
**Category**: Waitlist & Access

**Purpose**: Invite user from waitlist to get early access to the product.

**Required Variables**:
- `recipient_name` - Invitee name
- `company_name` - Company name (usually "Sixty" or product name)
- `action_url` - Early access link with auth token

**Optional Variables**:
- `expiry_time` - When access link expires

**Example JSON**:
```json
{
  "to_email": "prospect@company.com",
  "to_name": "Emma Wilson",
  "template_type": "waitlist_invite",
  "variables": {
    "recipient_name": "Emma",
    "company_name": "Sixty",
    "action_url": "https://app.use60.com/waitlist/token_xyz789",
    "expiry_time": "30 days"
  }
}
```

**Validation Rules**:
- `action_url` should include valid waitlist token
- `expiry_time` should be human-readable if provided

**Verify Template Exists**:
```sql
SELECT * FROM encharge_email_templates
WHERE template_type = 'waitlist_invite'
AND is_active = TRUE;
```

**Common Gotchas**:
- Token expiration not checked on app side
- Wrong email sent (typos in address)
- Using HTTP instead of HTTPS

---

### 6. waitlist_welcome

**Template ID**: `waitlist_welcome`
**Template Name**: Waitlist Welcome
**Category**: Waitlist & Access

**Purpose**: Welcome user after they've been granted access from waitlist.

**Required Variables**:
- `recipient_name` - New user name
- `company_name` - Company name (usually "Sixty")
- `action_url` - Login/dashboard URL

**Example JSON**:
```json
{
  "to_email": "newuser@company.com",
  "to_name": "Emma Wilson",
  "template_type": "waitlist_welcome",
  "variables": {
    "recipient_name": "Emma",
    "company_name": "Sixty",
    "action_url": "https://app.use60.com/app"
  }
}
```

**Verify Template Exists**:
```sql
SELECT * FROM encharge_email_templates
WHERE template_type = 'waitlist_welcome'
AND is_active = TRUE;
```

---

### 7. welcome

**Template ID**: `welcome`
**Template Name**: Welcome (Onboarding)
**Category**: Onboarding

**Purpose**: General welcome email for new accounts or onboarding.

**Required Variables**:
- `recipient_name` - New user name
- `organization_name` - Organization name
- `action_url` - Get started URL

**Example JSON**:
```json
{
  "to_email": "newuser@acme.com",
  "to_name": "Robert Brown",
  "template_type": "welcome",
  "variables": {
    "recipient_name": "Robert",
    "organization_name": "Acme Corp",
    "action_url": "https://app.use60.com/onboarding"
  }
}
```

**Verify Template Exists**:
```sql
SELECT * FROM encharge_email_templates
WHERE template_type = 'welcome'
AND is_active = TRUE;
```

---

### 8. fathom_connected

**Template ID**: `fathom_connected`
**Template Name**: Fathom Connected
**Category**: Integrations

**Purpose**: Confirm Fathom analytics has been successfully connected.

**Required Variables**:
- `recipient_name` - User who connected
- `organization_name` - Organization where connected
- `action_url` - Analytics dashboard URL

**Example JSON**:
```json
{
  "to_email": "user@company.com",
  "to_name": "David Lee",
  "template_type": "fathom_connected",
  "variables": {
    "recipient_name": "David",
    "organization_name": "Tech Startup Inc",
    "action_url": "https://app.use60.com/analytics"
  }
}
```

**Verify Template Exists**:
```sql
SELECT * FROM encharge_email_templates
WHERE template_type = 'fathom_connected'
AND is_active = TRUE;
```

---

### 9. first_meeting_synced

**Template ID**: `first_meeting_synced`
**Template Name**: First Meeting Synced
**Category**: Integrations

**Purpose**: Notify user when their first meeting has been synced to Sixty.

**Required Variables**:
- `recipient_name` - User name
- `meeting_title` - Title of meeting (e.g., "Q1 Sales Review")
- `action_url` - URL to meeting in app

**Example JSON**:
```json
{
  "to_email": "user@company.com",
  "to_name": "Patricia Garcia",
  "template_type": "first_meeting_synced",
  "variables": {
    "recipient_name": "Patricia",
    "meeting_title": "Q1 Sales Review - Acme Account",
    "action_url": "https://app.use60.com/meetings/abc123"
  }
}
```

**Validation Rules**:
- `meeting_title` should be actual meeting title from calendar
- `action_url` should link directly to meeting view

**Verify Template Exists**:
```sql
SELECT * FROM encharge_email_templates
WHERE template_type = 'first_meeting_synced'
AND is_active = TRUE;
```

---

### 10. trial_ending

**Template ID**: `trial_ending`
**Template Name**: Trial Ending
**Category**: Trial & Subscription

**Purpose**: Warning that trial period is ending soon, encourage upgrade.

**Required Variables**:
- `recipient_name` - Trial user
- `trial_days` - Days remaining (numeric: "3", "7")
- `action_url` - Upgrade URL

**Example JSON**:
```json
{
  "to_email": "trial@company.com",
  "to_name": "Linda Martinez",
  "template_type": "trial_ending",
  "variables": {
    "recipient_name": "Linda",
    "trial_days": "3",
    "action_url": "https://app.use60.com/upgrade"
  }
}
```

**Validation Rules**:
- `trial_days` must be numeric string ("3", not "three")
- Should be sent when trial_days >= 1 and <= 10

**Verify Template Exists**:
```sql
SELECT * FROM encharge_email_templates
WHERE template_type = 'trial_ending'
AND is_active = TRUE;
```

**Database Query for Trial Logic**:
```sql
SELECT id, full_name, email, organization_id,
  EXTRACT(DAY FROM trial_expires_at - NOW()) as days_remaining
FROM profiles
WHERE trial_expires_at > NOW()
  AND trial_expires_at <= NOW() + INTERVAL '10 days'
ORDER BY trial_expires_at ASC;
```

---

### 11. trial_expired

**Template ID**: `trial_expired`
**Template Name**: Trial Expired
**Category**: Trial & Subscription

**Purpose**: Notify trial has ended, offer reactivation.

**Required Variables**:
- `recipient_name` - User name
- `action_url` - Reactivation URL

**Example JSON**:
```json
{
  "to_email": "expired@company.com",
  "to_name": "Thomas Anderson",
  "template_type": "trial_expired",
  "variables": {
    "recipient_name": "Thomas",
    "action_url": "https://app.use60.com/reactivate"
  }
}
```

**Verify Template Exists**:
```sql
SELECT * FROM encharge_email_templates
WHERE template_type = 'trial_expired'
AND is_active = TRUE;
```

---

### 12. subscription_confirmed

**Template ID**: `subscription_confirmed`
**Template Name**: Subscription Confirmed
**Category**: Trial & Subscription

**Purpose**: Welcome new paying subscriber.

**Required Variables**:
- `recipient_name` - New subscriber name
- `plan_name` - Plan they subscribed to (e.g., "Professional", "Enterprise")
- `action_url` - Subscription management URL

**Example JSON**:
```json
{
  "to_email": "subscriber@company.com",
  "to_name": "Jennifer White",
  "template_type": "subscription_confirmed",
  "variables": {
    "recipient_name": "Jennifer",
    "plan_name": "Professional",
    "action_url": "https://app.use60.com/settings/subscription"
  }
}
```

**Valid Plan Names**: "Starter", "Professional", "Enterprise", "Custom"

**Verify Template Exists**:
```sql
SELECT * FROM encharge_email_templates
WHERE template_type = 'subscription_confirmed'
AND is_active = TRUE;
```

---

### 13. meeting_limit_warning

**Template ID**: `meeting_limit_warning`
**Template Name**: Meeting Limit Warning
**Category**: Trial & Subscription

**Purpose**: Alert user they're approaching their monthly meeting limit.

**Required Variables**:
- `recipient_name` - User name
- `current_meetings` - Number used (numeric: "8")
- `meeting_limit` - Monthly limit (numeric: "10")
- `remaining_meetings` - Number left (numeric: "2")
- `action_url` - Upgrade URL

**Example JSON**:
```json
{
  "to_email": "user@company.com",
  "to_name": "Kevin Davis",
  "template_type": "meeting_limit_warning",
  "variables": {
    "recipient_name": "Kevin",
    "current_meetings": "8",
    "meeting_limit": "10",
    "remaining_meetings": "2",
    "action_url": "https://app.use60.com/upgrade"
  }
}
```

**Validation Rules**:
- All counts must be numeric strings
- `remaining_meetings` = `meeting_limit` - `current_meetings`
- Should trigger when `remaining_meetings` <= 2

**Verify Template Exists**:
```sql
SELECT * FROM encharge_email_templates
WHERE template_type = 'meeting_limit_warning'
AND is_active = TRUE;
```

**Database Query for Meeting Count**:
```sql
SELECT p.id, p.full_name, p.email,
  COUNT(m.id) as meetings_this_month,
  org.meeting_limit,
  org.meeting_limit - COUNT(m.id) as remaining
FROM profiles p
JOIN organizations org ON p.organization_id = org.id
LEFT JOIN meetings m ON m.owner_user_id = p.id
  AND EXTRACT(YEAR FROM m.created_at) = EXTRACT(YEAR FROM NOW())
  AND EXTRACT(MONTH FROM m.created_at) = EXTRACT(MONTH FROM NOW())
GROUP BY p.id, org.meeting_limit
HAVING (org.meeting_limit - COUNT(m.id)) <= 2;
```

---

### 14. upgrade_prompt

**Template ID**: `upgrade_prompt`
**Template Name**: Upgrade Prompt
**Category**: Trial & Subscription

**Purpose**: Encourage user to upgrade to access specific feature.

**Required Variables**:
- `recipient_name` - User name
- `feature_name` - Feature they want (e.g., "Advanced Analytics")
- `upgrade_plan` - Plan containing feature (e.g., "Professional")
- `action_url` - Upgrade URL

**Example JSON**:
```json
{
  "to_email": "user@company.com",
  "to_name": "Amanda Taylor",
  "template_type": "upgrade_prompt",
  "variables": {
    "recipient_name": "Amanda",
    "feature_name": "Advanced Analytics",
    "upgrade_plan": "Professional",
    "action_url": "https://app.use60.com/upgrade?feature=analytics"
  }
}
```

**Valid Feature Names**: "Advanced Analytics", "AI Meeting Insights", "Team Collaboration", "Custom Reports", "API Access"

**Verify Template Exists**:
```sql
SELECT * FROM encharge_email_templates
WHERE template_type = 'upgrade_prompt'
AND is_active = TRUE;
```

---

### 15. email_change_verification

**Template ID**: `email_change_verification`
**Template Name**: Email Change Verification
**Category**: Account Management

**Purpose**: Verify email change request by user.

**Required Variables**:
- `recipient_name` - User name
- `old_email` - Current email (shown for verification)
- `new_email` - New email being verified
- `action_url` - Verification link with token

**Optional Variables**:
- `expiry_time` - When verification link expires

**Example JSON**:
```json
{
  "to_email": "newemail@company.com",
  "to_name": "Rachel Cooper",
  "template_type": "email_change_verification",
  "variables": {
    "recipient_name": "Rachel",
    "old_email": "rachel.old@company.com",
    "new_email": "rachel.new@company.com",
    "action_url": "https://app.use60.com/verify-email/token_def456",
    "expiry_time": "24 hours"
  }
}
```

**Validation Rules**:
- Send to `new_email` address (not old)
- `action_url` must contain valid verification token
- Token should expire quickly (24 hours)
- Email shown should match user input

**Verify Template Exists**:
```sql
SELECT * FROM encharge_email_templates
WHERE template_type = 'email_change_verification'
AND is_active = TRUE;
```

**Common Gotchas**:
- Sending to wrong email address (should be NEW email)
- Token already consumed/expired
- User forgets they requested change
- Verification link not working

---

### 16. password_reset

**Template ID**: `password_reset`
**Template Name**: Password Reset
**Category**: Account Management

**Purpose**: Send password reset link when user requests password change.

**Required Variables**:
- `recipient_name` - User name
- `action_url` - Password reset link with token

**Optional Variables**:
- `expiry_time` - When reset link expires (typically "1 hour")

**Example JSON**:
```json
{
  "to_email": "user@company.com",
  "to_name": "Michael Brown",
  "template_type": "password_reset",
  "variables": {
    "recipient_name": "Michael",
    "action_url": "https://app.use60.com/reset-password/token_ghi789",
    "expiry_time": "1 hour"
  }
}
```

**Validation Rules**:
- Token must be secure (cryptographically random)
- Should expire within 1-2 hours
- Should have rate limiting to prevent abuse
- Should NOT include password in email

**Verify Template Exists**:
```sql
SELECT * FROM encharge_email_templates
WHERE template_type = 'password_reset'
AND is_active = TRUE;
```

**Security Best Practices**:
- Tokens should be single-use
- Only valid for limited time (1 hour)
- Should be long and random (32+ characters)
- Should NOT be guessable or sequential
- Log all password reset attempts

---

### 17. join_request_rejected

**Template ID**: `join_request_rejected`
**Template Name**: Join Request Rejected
**Category**: Organization & Membership

**Purpose**: Notify user their request to join organization was rejected.

**Required Variables**:
- `recipient_name` - Requester name
- `organization_name` - Organization they requested

**Optional Variables**:
- `support_email` - Support contact if they have questions

**Example JSON**:
```json
{
  "to_email": "requester@example.com",
  "to_name": "Nicole Johnson",
  "template_type": "join_request_rejected",
  "variables": {
    "recipient_name": "Nicole",
    "organization_name": "TechCorp Inc",
    "support_email": "support@use60.com"
  }
}
```

**Verify Template Exists**:
```sql
SELECT * FROM encharge_email_templates
WHERE template_type = 'join_request_rejected'
AND is_active = TRUE;
```

---

### 18. permission_to_close

**Template ID**: `permission_to_close`
**Template Name**: Permission to Close
**Category**: Admin & Moderation

**Purpose**: Request permission from approver to close a deal/task/item.

**Required Variables**:
- `recipient_name` - Approver name
- `requester_name` - Who is requesting to close
- `item_type` - Type of item (e.g., "Deal", "Task", "Opportunity")
- `item_name` - Name of item (e.g., "Acme Contract", "Q1 Planning")
- `action_url` - Link to review request

**Example JSON**:
```json
{
  "to_email": "manager@company.com",
  "to_name": "Christopher Lee",
  "template_type": "permission_to_close",
  "variables": {
    "recipient_name": "Christopher",
    "requester_name": "James Wilson",
    "item_type": "Deal",
    "item_name": "Acme Corp Contract Renewal",
    "action_url": "https://app.use60.com/deals/abc123/close-approval"
  }
}
```

**Valid Item Types**: "Deal", "Task", "Opportunity", "Project", "Account"

**Verify Template Exists**:
```sql
SELECT * FROM encharge_email_templates
WHERE template_type = 'permission_to_close'
AND is_active = TRUE;
```

---

## Integration Guide

### How to Pass Variables When Calling Functions

#### Method 1: Direct Edge Function Call (HTTP)

```bash
curl -X POST https://your-project.supabase.co/functions/v1/encharge-send-email \
  -H "Authorization: Bearer $EDGE_FUNCTION_SECRET" \
  -H "Content-Type: application/json" \
  -d '{
    "template_type": "organization_invitation",
    "to_email": "sarah@acme.com",
    "to_name": "Sarah Chen",
    "variables": {
      "recipient_name": "Sarah",
      "organization_name": "Acme Corp",
      "inviter_name": "John Smith",
      "action_url": "https://app.use60.com/invite/token123",
      "expiry_time": "7 days"
    }
  }'
```

#### Method 2: TypeScript Service (Frontend)

```typescript
import { supabase } from '@/lib/supabase';

async function sendInvitation(
  toEmail: string,
  organizationName: string,
  inviterName: string,
  invitationToken: string
) {
  const { data, error } = await supabase.functions.invoke(
    'send-organization-invitation',
    {
      body: {
        to_email: toEmail,
        to_name: toEmail.split('@')[0], // fallback name
        organization_name: organizationName,
        inviter_name: inviterName,
        invitation_url: `https://app.use60.com/invite/${invitationToken}`,
        expiry_time: '7 days',
      },
      headers: {
        'x-edge-function-secret': import.meta.env.VITE_EDGE_FUNCTION_SECRET,
      },
    }
  );

  if (error) throw new Error(`Failed to send invitation: ${error.message}`);
  return data;
}
```

#### Method 3: Backend Service (Node.js)

```typescript
async function sendWaitlistWelcome(
  userEmail: string,
  userName: string,
  loginUrl: string
) {
  const response = await fetch(
    `${process.env.SUPABASE_URL}/functions/v1/encharge-send-email`,
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.EDGE_FUNCTION_SECRET}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        template_type: 'waitlist_welcome',
        to_email: userEmail,
        to_name: userName,
        variables: {
          recipient_name: userName.split(' ')[0],
          company_name: 'Sixty',
          action_url: loginUrl,
        },
      }),
    }
  );

  if (!response.ok) {
    throw new Error(`Email send failed: ${response.statusText}`);
  }

  return response.json();
}
```

### How to Access Functions (HTTP Endpoints)

All email functions are available via Supabase Edge Functions:

**Base URL**: `https://{project-id}.supabase.co/functions/v1/`

**Available Functions**:
- `/encharge-send-email` - Main dispatcher (supports all 18 types)
- `/send-organization-invitation` - Direct org invitation
- `/waitlist-welcome-email` - Direct waitlist welcome
- `/send-removal-email` - Direct member removal

**Authentication Methods**:
1. **Bearer Token** (Recommended):
   ```
   Authorization: Bearer {EDGE_FUNCTION_SECRET}
   ```

2. **Custom Header**:
   ```
   x-edge-function-secret: {EDGE_FUNCTION_SECRET}
   ```

3. **API Key** (Backward compatible):
   ```
   apikey: {SUPABASE_SERVICE_ROLE_KEY}
   ```

### Error Handling When Variables Missing

**Response on Missing Required Variables**:
```json
{
  "success": false,
  "error": "Missing template_type or to_email"
}
```

**How to Handle**:
```typescript
try {
  const response = await sendEmail({
    template_type: 'trial_ending',
    to_email: userEmail,
    variables: {
      recipient_name: userName,
      trial_days: '3',
      action_url: upgradeUrl,
    },
  });

  if (!response.success) {
    console.error('Email send failed:', response.error);
    // Show user-friendly error
    toast.error('Failed to send email. Please try again.');
    // Retry with exponential backoff
    setTimeout(() => retryEmail(variables), 5000);
  }
} catch (error) {
  console.error('Unexpected error:', error);
  // Handle network error
  toast.error('Network error sending email');
}
```

### Examples by Category

#### Organization Invitations
```typescript
// Send organization invitation
await supabase.functions.invoke('send-organization-invitation', {
  body: {
    to_email: candidateEmail,
    to_name: candidateName,
    organization_name: org.name,
    inviter_name: currentUser.name,
    invitation_url: `https://app.use60.com/join/${inviteToken}`,
    expiry_time: '7 days',
  },
});
```

#### Trial Warnings
```typescript
// Send trial ending warning
await supabase.functions.invoke('encharge-send-email', {
  body: {
    template_type: 'trial_ending',
    to_email: userEmail,
    to_name: userName,
    variables: {
      recipient_name: userName.split(' ')[0],
      trial_days: String(daysRemaining),
      action_url: 'https://app.use60.com/upgrade',
    },
  },
});
```

#### Account Management
```typescript
// Send email verification
await supabase.functions.invoke('encharge-send-email', {
  body: {
    template_type: 'email_change_verification',
    to_email: newEmail, // Send to NEW email
    variables: {
      recipient_name: user.fullName,
      old_email: user.email,
      new_email: newEmail,
      action_url: `https://app.use60.com/verify-email/${token}`,
      expiry_time: '24 hours',
    },
  },
});
```

---

## Best Practices

### Naming Conventions

**Variable Names**: Always use `snake_case` (lowercase with underscores)
```typescript
// Good
{ recipient_name: "John", organization_name: "Acme" }

// Bad
{ recipientName: "John", OrganizationName: "Acme" }
{ recipient-name: "John", organization-name: "Acme" }
```

**Template Types**: Always use `snake_case` (lowercase with underscores)
```typescript
// Good
template_type: 'organization_invitation'
template_type: 'trial_ending'

// Bad
template_type: 'OrganizationInvitation'
template_type: 'trialEnding'
```

### Variable Format Requirements

**Email Addresses**:
- Must be valid RFC 5322 format
- Case-insensitive (store lowercase)
- Example: "john.doe@acme.com"

**Names**:
- Max 100 characters
- Should include first and last name when possible
- Avoid special characters (use ASCII only)
- Handle HTML entities: use plain text, not HTML-encoded

**URLs**:
- Must be HTTPS (never HTTP)
- Must be absolute (include domain)
- Should be URL-encoded if contain special characters
- Max 2048 characters
- Always include required tokens/parameters

**Numbers**:
- Pass as strings: "3" not 3
- For percentages: "75%" or "75"
- For durations: "3 days", "24 hours"

**Dates**:
- Use human-readable format: "March 15, 2026"
- Not timestamps or epoch
- Include timezone if relevant

### Security Considerations

**Never Include in Variables**:
- Passwords or password reset tokens (use in URL only)
- API keys or secrets
- Credit card numbers
- Social security numbers
- Health or financial data
- Medical information

**Sensitive Data**:
- Store in URL path/query parameters instead
- Example: Verification tokens should be in URL, not variable
- Do not log full email addresses in non-production
- Use hashing for any identifiers

**URL Security**:
- Use cryptographically random tokens
- Implement token expiration
- Implement single-use tokens
- Implement rate limiting for token generation
- Log all attempts to use invalid/expired tokens

### Performance Tips

**Batch Sending**:
```typescript
// Bad: Sequential calls
for (const user of users) {
  await sendEmail(user);
}

// Good: Parallel calls with limit
const emailPromises = users.map(user => sendEmail(user));
const results = await Promise.allSettled(emailPromises);
```

**Caching**:
```typescript
// Cache template list to avoid repeated database queries
const templateCache = new Map();

async function getTemplate(type: string) {
  if (templateCache.has(type)) {
    return templateCache.get(type);
  }
  const template = await fetchTemplate(type);
  templateCache.set(type, template);
  return template;
}

// Clear cache periodically (every hour)
setInterval(() => templateCache.clear(), 3600000);
```

**Retries with Exponential Backoff**:
```typescript
async function sendEmailWithRetry(
  variables: EmailVariables,
  maxRetries: number = 3
) {
  let lastError;
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await sendEmail(variables);
    } catch (error) {
      lastError = error;
      if (attempt < maxRetries) {
        // Wait: 1s, 2s, 4s
        const delayMs = Math.pow(2, attempt - 1) * 1000;
        await new Promise(resolve => setTimeout(resolve, delayMs));
      }
    }
  }
  throw lastError;
}
```

**Queue Large Sends**:
```typescript
// For sending to 1000+ users, use a queue
import PQueue from 'p-queue';

const queue = new PQueue({
  concurrency: 10, // Send 10 emails at a time
  interval: 1000,  // Per second
  maxSize: 100,    // Queue size limit
});

for (const user of largeUserList) {
  await queue.add(() => sendEmail(user));
}
```

### Caching Strategies

**Template Cache** (Template Body):
- Cache in memory for 1-4 hours
- Invalidate on template update
- Reduces database queries

**User Data Cache** (for variables):
- Cache user profile for 5-10 minutes
- Use Redis for distributed cache
- Invalidate on profile change

**Compiled Templates** (Handlebars):
- Pre-compile templates on startup
- Cache compiled templates in memory
- Avoid recompiling on each send

---

## Troubleshooting

### Variables Not Showing in Email

**Problem**: Email arrives but {{variable}} shows literally

**Debugging Steps**:

1. **Check Variable Names Match Template**:
   ```sql
   SELECT html_body FROM encharge_email_templates
   WHERE template_type = 'organization_invitation';
   -- Look for {{variable_name}} syntax
   ```

2. **Verify Variable is Passed**:
   ```typescript
   console.log('Variables passed:', {
     recipient_name: "John",
     organization_name: "Acme"
   });
   ```

3. **Check for Typos**:
   ```typescript
   // Template expects: {{organization_name}}
   // You're passing: {organizationName} or {org_name}
   // These won't match!
   ```

4. **Enable Debug Logging**:
   ```typescript
   const variables = {
     recipient_name: "John",
     organization_name: "Acme",
   };
   console.log('Template variables:', JSON.stringify(variables, null, 2));
   ```

**Solutions**:
- Verify variable name matches exactly (case-sensitive)
- Use snake_case, not camelCase
- Check template query for expected variables
- Ensure variable is not null/undefined
- Check for extra spaces in template: `{{ variable }}` vs `{{variable}}`

### Wrong Variable Values

**Problem**: Email shows wrong data (old email, wrong name, etc.)

**Verification Steps**:

1. **Check Database Source**:
   ```sql
   SELECT id, full_name, email FROM profiles WHERE id = 'user-123';
   -- Verify this is current data
   ```

2. **Trace Variable Origin**:
   ```typescript
   const user = await getUser(userId);
   console.log('User from DB:', user);
   // Send this same object
   ```

3. **Verify Before Sending**:
   ```typescript
   const variables = buildVariables(user);
   console.assert(variables.recipient_name, 'Missing recipient name');
   console.assert(variables.organization_name, 'Missing org name');
   await sendEmail(variables);
   ```

4. **Check Logs Table**:
   ```sql
   SELECT * FROM email_logs
   WHERE to_email = 'user@example.com'
   ORDER BY created_at DESC
   LIMIT 10;
   -- Check metadata.variables field
   ```

**Solutions**:
- Fetch fresh user data, don't cache
- Use database timestamps, not local time
- Verify data before sending
- Check email_logs table for what was actually sent

### Special Character Handling

**Problem**: Special characters break email or show as question marks

**Character Issues**:
- Curly quotes ("") instead of straight quotes ("")
- em-dashes (—) displayed as ???
- Accents (é, ñ, ü) showing incorrectly
- Emoji not supported in all email clients

**Solutions**:
```typescript
// Normalize special characters
function sanitizeText(text: string): string {
  return text
    .replace(/[""]/g, '"')  // Curly quotes to straight
    .replace(/['']/g, "'")  // Curly apostrophes to straight
    .replace(/–/g, '-')     // En-dash to hyphen
    .replace(/—/g, '--')    // Em-dash to double hyphen
    .trim();
}

// For HTML: HTML-encode special characters
function htmlEncode(text: string): string {
  const map: Record<string, string> = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;',
  };
  return text.replace(/[&<>"']/g, m => map[m]);
}

// Use in variables
variables.recipient_name = sanitizeText(userData.full_name);
variables.organization_name = sanitizeText(org.name);
```

### Long Text Handling

**Problem**: Long names or text break email layout

**Solutions**:
```typescript
// Truncate long text
function truncateText(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return text.substring(0, maxLength - 3) + '...';
}

// Wrap long URLs
function wrapLongUrl(url: string): string {
  // Bitly or similar URL shortener
  const shortUrl = await shortenUrl(url);
  return shortUrl; // Much shorter
}

// Use in variables
variables.recipient_name = truncateText(userName, 50);
variables.action_url = wrapLongUrl(longUrl);
variables.item_name = truncateText(itemName, 100);
```

**Max Recommended Lengths**:
- Names: 50 characters
- Organization: 100 characters
- Item name: 100 characters
- URLs: 2048 characters (use shortener for display)

### URL Encoding

**Problem**: URLs with special characters don't work

**Solutions**:
```typescript
// Encode URL properly
function buildActionUrl(baseUrl: string, params: Record<string, string>): string {
  const url = new URL(baseUrl);
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }
  return url.toString();
}

// Example
const actionUrl = buildActionUrl('https://app.use60.com/invite', {
  token: 'abc123xyz',
  org_id: 'org_456',
});
// Result: https://app.use60.com/invite?token=abc123xyz&org_id=org_456
```

**Don't Do**:
```typescript
// Bad - unencoded special characters
`https://app.use60.com/invite?name=John Doe&org=Acme & Co`

// Good - properly encoded
`https://app.use60.com/invite?name=John+Doe&org=Acme+%26+Co`
```

---

## Administration

### How to Modify Variables in Future

**To Add a New Variable to Template**:

1. Update SQL migration:
```sql
UPDATE encharge_email_templates
SET html_body = REPLACE(
  html_body,
  '<p>Existing text</p>',
  '<p>Existing text - {{new_variable_name}}</p>'
)
WHERE template_type = 'template_name';
```

2. Update variables JSON metadata:
```sql
UPDATE encharge_email_templates
SET variables = variables ||
  '[{"name": "new_variable", "description": "Description"}]'::jsonb
WHERE template_type = 'template_name';
```

3. Document in this guide (update variable table)

4. Update calling code to pass new variable

5. Test thoroughly before deploying

### How to Add New Email Type

**Step 1: Create Migration**:
```sql
INSERT INTO encharge_email_templates (
  template_name,
  template_type,
  subject_line,
  html_body,
  text_body,
  is_active,
  variables,
  created_at,
  updated_at
) VALUES (
  'event_name',
  'event_name',
  'Subject line with {{variables}}',
  '<p>HTML body with {{variables}}</p>',
  'Text body with {{variables}}',
  TRUE,
  '[{"name": "var1"}, {"name": "var2"}]'::jsonb,
  NOW(),
  NOW()
);
```

**Step 2: Update Event Mapping**:
In `encharge-send-email/index.ts`:
```typescript
const eventNameMap: Record<string, string> = {
  // ... existing mappings
  new_event_type: 'New Event Type Display Name',
};
```

**Step 3: Add to Variable Reference**:
- Add row to Quick Reference table
- Create Email Type Section
- Document all variables
- Add example JSON

**Step 4: Update Calling Code**:
```typescript
await sendEmail({
  template_type: 'new_event_type',
  to_email: userEmail,
  variables: { /* all required variables */ },
});
```

### How to Change Template

**To Update Template Content**:

1. **Create Migration**:
```sql
UPDATE encharge_email_templates
SET html_body = '<p>New content with {{variables}}</p>',
    text_body = 'New text version',
    updated_at = NOW()
WHERE template_type = 'template_name';
```

2. **Test Before Deploying**:
```sql
-- Verify template loads correctly
SELECT * FROM encharge_email_templates
WHERE template_type = 'template_name';
```

3. **Rollback Plan**:
```sql
-- Keep old version as backup in migration
-- Can revert if issues found
UPDATE encharge_email_templates
SET html_body = '{{old_version}}',
    updated_at = NOW()
WHERE template_type = 'template_name';
```

### Database Queries for Admins

**See All Templates**:
```sql
SELECT template_name, template_type, is_active, updated_at
FROM encharge_email_templates
ORDER BY template_type;
```

**Find Template by Type**:
```sql
SELECT * FROM encharge_email_templates
WHERE template_type = 'trial_ending';
```

**View All Variables for Template**:
```sql
SELECT template_type, variables
FROM encharge_email_templates
WHERE template_type = 'organization_invitation';
-- Variables column contains JSON with all variable definitions
```

**Check Email Send History**:
```sql
SELECT email_type, COUNT(*) as count, MAX(created_at) as last_sent
FROM email_logs
GROUP BY email_type
ORDER BY last_sent DESC;
```

**Find Failed Sends**:
```sql
SELECT to_email, email_type, status, metadata
FROM email_logs
WHERE status = 'failed'
ORDER BY created_at DESC
LIMIT 20;
```

**Resend Failed Email**:
```typescript
const failedLog = await supabase
  .from('email_logs')
  .select('*')
  .eq('id', logId)
  .single();

// Extract variables from metadata and resend
await sendEmail({
  template_type: failedLog.email_type,
  to_email: failedLog.to_email,
  variables: failedLog.metadata.variables,
});
```

**Audit Email Activity by User**:
```sql
SELECT
  user_id,
  email_type,
  COUNT(*) as send_count,
  MAX(created_at) as last_sent
FROM email_logs
WHERE user_id IS NOT NULL
GROUP BY user_id, email_type
HAVING COUNT(*) > 10  -- Users who got lots of emails
ORDER BY send_count DESC;
```

**Check Template Performance**:
```sql
SELECT
  email_type,
  COUNT(*) as total_sent,
  COUNT(*) FILTER (WHERE status = 'sent') as successful,
  COUNT(*) FILTER (WHERE status = 'failed') as failed,
  ROUND(100.0 * COUNT(*) FILTER (WHERE status = 'sent') / COUNT(*), 2) as success_rate
FROM email_logs
WHERE created_at > NOW() - INTERVAL '30 days'
GROUP BY email_type
ORDER BY total_sent DESC;
```

---

## Version History

| Date | Version | Changes |
|------|---------|---------|
| 2026-02-03 | 1.0 | Initial comprehensive reference guide |

## Support

For issues or questions:
- Check Troubleshooting section first
- Review error logs in email_logs table
- Contact engineering team for template changes
- File bugs with template_type, to_email, and variables

---

**Document End**
