# EMAIL-017: Manual Testing Checklist & Guide

**Story**: EMAIL-017 - Create Manual Testing Checklist
**Date**: 2026-02-03
**Status**: ✅ Complete
**Duration**: 60 minutes
**Version**: 1.0

---

## Table of Contents

1. [Setup Section](#setup-section)
2. [Test Scenarios (18 Email Types)](#test-scenarios-18-email-types)
3. [Template-Specific Tests](#template-specific-tests)
4. [Cross-Cutting Tests](#cross-cutting-tests)
5. [Troubleshooting](#troubleshooting)
6. [Acceptance Criteria Checklist](#acceptance-criteria-checklist)

---

## Setup Section

### Prerequisites

Before starting manual testing, ensure you have:

- [ ] Access to staging environment (`https://staging.use60.com`)
- [ ] AWS SES credentials configured in `.env.staging`
- [ ] Supabase staging project credentials
- [ ] Access to staging database
- [ ] Email inbox service active (Mailhog or temporary email)
- [ ] Browser console access (DevTools F12)
- [ ] Database access tool (Supabase studio or pgAdmin)

### Environment Variables Needed

Verify these are set in `.env.staging`:

```bash
VITE_SUPABASE_URL=https://[project-id].supabase.co
SUPABASE_SERVICE_ROLE_KEY=[your-service-role-key]
AWS_ACCESS_KEY_ID=[staging-ses-access-key]
AWS_SECRET_ACCESS_KEY=[staging-ses-secret-key]
AWS_REGION=eu-west-2
EDGE_FUNCTION_SECRET=[unique-secret-for-staging]
ENCHARGE_WRITE_KEY=[staging-encharge-key]
```

### Test Data Setup

#### Step 1: Create Test User

```bash
# Via Supabase Auth
1. Go to https://[project-id].supabase.co/auth/users
2. Create new user: test.email.2026@example.com
3. Password: SecureTestPassword123!
4. Note the user ID
```

#### Step 2: Create Test Organization

```bash
# Via Frontend
1. Log in as test user
2. Create organization: "Test Org - Email Testing"
3. Add yourself as admin
4. Note the organization ID
```

#### Step 3: Create Test Users for Invitations

Create additional test email addresses for inviting:
- `invite.test.1@example.com`
- `invite.test.2@example.com`
- `invite.test.3@example.com`

#### Step 4: Set Up Email Inbox

**Option A: Using Mailhog (Local)**
```bash
# Install Mailhog
brew install mailhog  # macOS
# or download from https://github.com/mailhog/MailHog

# Start Mailhog
mailhog
# Access at: http://localhost:1025 (SMTP)
# UI at: http://localhost:8025
```

**Option B: Using Temporary Email Service**
- Mailtrap: https://mailtrap.io
- Ethereal: https://ethereal.email
- 10Minutemail: https://10minutemail.com

**Option C: Direct AWS SES Sandbox Testing**
- Verify your test email addresses in AWS SES console
- Configure SES to send to verified addresses only

---

## Test Scenarios: 18 Email Types

Each email type requires manual testing. Follow this pattern for each:

### Testing Pattern

For each email type:
1. **Trigger**: Follow exact steps to trigger the email
2. **Check Delivery**: Verify email arrived in inbox (2-5 seconds)
3. **Verify Content**: Check subject, sender, and body
4. **Test Variables**: Confirm all variables substituted correctly
5. **Check Design**: Verify responsive design on desktop/mobile
6. **Validate Links**: Click all links to ensure they work
7. **Database Check**: Verify log entry in email_logs table

---

## Template-Specific Tests

### 1. Organization Invitation

**Email Type**: `organization_invitation`
**Function**: `send-organization-invitation`
**Purpose**: Invite new team member to join organization

**Trigger Steps**:
```
1. Go to Test Org > Settings > Members
2. Click "Invite Member"
3. Enter: invite.test.1@example.com
4. Select Role: "Sales Rep"
5. Click "Send Invitation"
```

**Expected Email Subject**: `You're Invited to [Org Name]`

**Content Verification Checklist**:
- [ ] Recipient's name appears (e.g., "Hi invite.test.1")
- [ ] Organization name is correct
- [ ] Inviter's name shown (e.g., "John Smith invited you")
- [ ] "Accept Invitation" CTA button present
- [ ] Invitation link valid and goes to correct page
- [ ] Expiry time shown (e.g., "This link expires in 7 days")
- [ ] Support email present in footer
- [ ] Logo/branding consistent

**Variable Verification**:
```
recipient_name: ✓ Shows first name from email
organization_name: ✓ Shows "Test Org - Email Testing"
inviter_name: ✓ Shows your name
action_url: ✓ Link works and invites to correct org
expiry_time: ✓ Shows "7 days"
support_email: ✓ Shows support@use60.com
```

**Mobile Appearance Check**:
- [ ] Email displays correctly on 375px width
- [ ] CTA button tappable (minimum 44px height)
- [ ] Text readable without zooming
- [ ] No horizontal scroll

**Database Verification**:
```sql
-- Check email_logs table
SELECT * FROM email_logs
WHERE email_type = 'organization_invitation'
  AND to_email = 'invite.test.1@example.com'
ORDER BY created_at DESC
LIMIT 1;

-- Verify fields:
-- ✓ status = 'sent'
-- ✓ sent_via = 'aws_ses'
-- ✓ metadata.message_id populated
-- ✓ metadata.variables has all required fields
```

---

### 2. Member Removed

**Email Type**: `member_removed`
**Function**: `send-removal-email`
**Purpose**: Notify user they've been removed from organization

**Trigger Steps**:
```
1. Go to Test Org > Settings > Members
2. Find a member to remove
3. Click "..." menu > "Remove Member"
4. Confirm removal
```

**Expected Email Subject**: `You've been removed from [Org Name]`

**Content Verification Checklist**:
- [ ] Recipient name present
- [ ] Organization name shown
- [ ] Admin name shown (who removed them)
- [ ] Clear explanation of removal
- [ ] Support contact link works
- [ ] Tone is professional but empathetic
- [ ] No broken HTML/formatting

**Variable Verification**:
```
recipient_name: ✓ Correct recipient
organization_name: ✓ Correct org
admin_name: ✓ Shows admin who removed them
support_email: ✓ Present for questions
```

**Database Verification**:
```sql
SELECT * FROM email_logs
WHERE email_type = 'member_removed'
ORDER BY created_at DESC LIMIT 1;
```

---

### 3. Organization Approval

**Email Type**: `org_approval`
**Function**: `org-approval-email`
**Purpose**: Notify admin that organization is approved/ready

**Trigger Steps**:
```
1. Create new organization (if not using existing)
2. System should auto-send when setup complete
3. Check email inbox
```

**Expected Email Subject**: `Your organization setup is complete`

**Content Verification Checklist**:
- [ ] Recipient name shown
- [ ] Organization name correct
- [ ] Congratulatory tone
- [ ] "Get Started" CTA visible and working
- [ ] Next steps clear
- [ ] Professional design

**Database Verification**:
```sql
SELECT * FROM email_logs
WHERE email_type = 'org_approval'
ORDER BY created_at DESC LIMIT 1;
```

---

### 4. Join Request Approved

**Email Type**: `join_request_approved`
**Function**: `handle-join-request-action`
**Purpose**: Notify user their join request was approved

**Trigger Steps**:
```
1. Create second org: "Test Org 2"
2. Use another test account to request join
3. As first account, approve the request
4. Check email sent to requester
```

**Expected Email Subject**: `Your request to join [Org] was approved`

**Content Verification Checklist**:
- [ ] Recipient name shown
- [ ] Organization name correct
- [ ] Clear approval message
- [ ] CTA takes to organization
- [ ] No confusing language

**Database Verification**:
```sql
SELECT * FROM email_logs
WHERE email_type = 'join_request_approved'
ORDER BY created_at DESC LIMIT 1;
```

---

### 5. Waitlist Invite (Early Access)

**Email Type**: `waitlist_invite`
**Function**: `encharge-send-email` with template_type='waitlist_invite'
**Purpose**: Send early access invite to waitlist users

**Trigger Steps**:
```
1. Go to Admin Dashboard > Waitlist Management
2. Select users ready for early access
3. Click "Send Early Access Invite"
4. Enter email: invite.test.2@example.com
```

**Expected Email Subject**: `Your early access to Sixty is ready`

**Content Verification Checklist**:
- [ ] Recipient name shown (personalized)
- [ ] Company name "Sixty" displayed
- [ ] Urgency conveyed (early access, limited spots)
- [ ] "Get Started" CTA prominent
- [ ] Expiry time shown prominently
- [ ] Professional, excited tone

**Variable Verification**:
```
recipient_name: ✓ Shows recipient's first name
company_name: ✓ Shows "Sixty"
action_url: ✓ Link works, sets password
expiry_time: ✓ Shows "7 days" or configured time
```

**Mobile Appearance Check**:
- [ ] CTA button spans most of width on mobile
- [ ] Text hierarchy clear on small screens
- [ ] Expiry warning readable

**Database Verification**:
```sql
SELECT * FROM email_logs
WHERE email_type = 'waitlist_invite'
ORDER BY created_at DESC LIMIT 1;
```

---

### 6. Waitlist Welcome

**Email Type**: `waitlist_welcome`
**Function**: `waitlist-welcome-email`
**Purpose**: Welcome message when user joins waitlist

**Trigger Steps**:
```
1. Go to landing page: https://staging.use60.com
2. Scroll to waitlist signup form
3. Enter: invite.test.3@example.com
4. Submit form
```

**Expected Email Subject**: `Welcome to the Sixty Waitlist`

**Content Verification Checklist**:
- [ ] Recipient name shown or generic greeting
- [ ] Welcoming, friendly tone
- [ ] What to expect next explained
- [ ] Call-to-action clear (invite link or follow social)
- [ ] Unsubscribe link present
- [ ] No blank template variables

**Database Verification**:
```sql
SELECT * FROM email_logs
WHERE email_type = 'waitlist_welcome'
ORDER BY created_at DESC LIMIT 1;
```

---

### 7. Welcome Email (New Account)

**Email Type**: `welcome`
**Function**: `encharge-send-email` with template_type='welcome'
**Purpose**: First email when new user creates account

**Trigger Steps**:
```
1. Create new Supabase auth user
2. New user logs in for first time
3. System sends welcome email automatically
4. Check inbox
```

**Expected Email Subject**: `Welcome to Sixty!` or similar

**Content Verification Checklist**:
- [ ] Recipient name personalized
- [ ] Friendly, welcoming tone
- [ ] First steps clear
- [ ] Onboarding resources linked
- [ ] Support contact info present
- [ ] CTA leads to app dashboard

**Database Verification**:
```sql
SELECT * FROM email_logs
WHERE email_type = 'welcome'
ORDER BY created_at DESC LIMIT 1;
```

---

### 8. Fathom Connected

**Email Type**: `fathom_connected`
**Function**: `fathom-connected-email`
**Purpose**: Notification when Fathom integration is connected

**Trigger Steps**:
```
1. Go to Settings > Integrations > Fathom
2. Click "Connect Fathom"
3. Complete OAuth flow
4. Confirmation email sent
```

**Expected Email Subject**: `Fathom connected to your Sixty account`

**Content Verification Checklist**:
- [ ] Confirmation of successful connection
- [ ] Next steps explained (sync history, etc.)
- [ ] Link to start using feature
- [ ] Support contact if issues
- [ ] Professional integration tone

**Database Verification**:
```sql
SELECT * FROM email_logs
WHERE email_type = 'fathom_connected'
ORDER BY created_at DESC LIMIT 1;
```

---

### 9. First Meeting Synced

**Email Type**: `first_meeting_synced`
**Function**: `first-meeting-synced-email`
**Purpose**: Celebratory email when first meeting is synced

**Trigger Steps**:
```
1. Connect calendar (Google Calendar)
2. Wait for first meeting to sync
3. Email sent automatically
4. Check inbox
```

**Expected Email Subject**: `Your first meeting is synced!` or similar

**Content Verification Checklist**:
- [ ] Celebratory, encouraging tone
- [ ] Next actions explained
- [ ] CTA to view meeting/AI features
- [ ] Personalized with first name
- [ ] Professional but friendly

**Database Verification**:
```sql
SELECT * FROM email_logs
WHERE email_type = 'first_meeting_synced'
ORDER BY created_at DESC LIMIT 1;
```

---

### 10. Trial Ending Soon

**Email Type**: `trial_ending`
**Function**: `encharge-send-email` with template_type='trial_ending'
**Purpose**: Remind user trial is ending (sent 3 days before)

**Trigger Steps**:
```
1. Create user with trial ending in 3 days
2. Wait for automated email OR
3. Trigger manually: POST /functions/v1/encharge-send-email
   with template_type='trial_ending'
```

**Expected Email Subject**: `Your Sixty trial ends in 3 days`

**Content Verification Checklist**:
- [ ] Days remaining clearly stated (e.g., "3 days")
- [ ] Upgrade CTA prominent
- [ ] Pricing information linked
- [ ] No "hard sell" - respectful tone
- [ ] Support option included
- [ ] Free trial benefits summarized

**Variable Verification**:
```
days_remaining: ✓ Shows correct number
upgrade_url: ✓ Link works
support_email: ✓ Present
```

**Database Verification**:
```sql
SELECT * FROM email_logs
WHERE email_type = 'trial_ending'
ORDER BY created_at DESC LIMIT 1;
```

---

### 11. Trial Expired

**Email Type**: `trial_expired`
**Function**: `encharge-send-email` with template_type='trial_expired'
**Purpose**: Notify user trial has ended

**Trigger Steps**:
```
1. Create user with trial ended today
2. Trigger email (automated or manual)
3. Check inbox
```

**Expected Email Subject**: `Your Sixty trial has ended`

**Content Verification Checklist**:
- [ ] Clear that trial ended (not confusing past/future)
- [ ] Upgrade options presented clearly
- [ ] Free tier limitations explained
- [ ] Link to upgrade prominently shown
- [ ] Professional, not condescending
- [ ] Support contact for questions

**Database Verification**:
```sql
SELECT * FROM email_logs
WHERE email_type = 'trial_expired'
ORDER BY created_at DESC LIMIT 1;
```

---

### 12. Subscription Confirmed

**Email Type**: `subscription_confirmed`
**Function**: `subscription-confirmed-email`
**Purpose**: Confirmation after successful subscription purchase

**Trigger Steps**:
```
1. Go to Pricing page
2. Complete trial to paid upgrade
3. Confirmation email sent
4. Check inbox
```

**Expected Email Subject**: `Your subscription to Sixty is confirmed`

**Content Verification Checklist**:
- [ ] Subscription plan shown
- [ ] Billing amount and date clear
- [ ] Receipt or invoice linked
- [ ] Invoice can be downloaded
- [ ] When service starts shown
- [ ] Support contact for issues
- [ ] CTA back to app

**Variable Verification**:
```
plan_name: ✓ Shows subscription plan name
billing_amount: ✓ Shows price correctly
next_billing_date: ✓ Shows correct date
invoice_url: ✓ Link works and downloads PDF
```

**Database Verification**:
```sql
SELECT * FROM email_logs
WHERE email_type = 'subscription_confirmed'
ORDER BY created_at DESC LIMIT 1;
```

---

### 13. Meeting Limit Warning

**Email Type**: `meeting_limit_warning`
**Function**: `meeting-limit-warning-email`
**Purpose**: Warn user they're approaching meeting sync limit

**Trigger Steps**:
```
1. Set user to plan with 100 meeting limit
2. Sync 95+ meetings (or manually trigger)
3. Email sent when approaching limit
4. Check inbox
```

**Expected Email Subject**: `You're approaching your meeting limit`

**Content Verification Checklist**:
- [ ] Current meeting count shown
- [ ] Limit shown clearly
- [ ] Upgrade option presented
- [ ] How many meetings are included in higher plans
- [ ] Upgrade CTA prominent
- [ ] Not alarming, informative tone
- [ ] Support contact available

**Database Verification**:
```sql
SELECT * FROM email_logs
WHERE email_type = 'meeting_limit_warning'
ORDER BY created_at DESC LIMIT 1;
```

---

### 14. Upgrade Prompt

**Email Type**: `upgrade_prompt`
**Function**: `encharge-send-email` with template_type='upgrade_prompt'
**Purpose**: Encourage upgrade based on feature usage

**Trigger Steps**:
```
1. User on free plan uses advanced feature (needs upgrade)
2. Feature hint/CTA shown in-app
3. Email sent with upgrade offer
4. Check inbox
```

**Expected Email Subject**: `Try more of Sixty with [Plan Name]`

**Content Verification Checklist**:
- [ ] Feature benefit explained
- [ ] Current plan limitations shown
- [ ] New plan benefits listed
- [ ] Pricing transparent
- [ ] Upgrade CTA clear
- [ ] Free trial offer (if applicable)
- [ ] Risk-free messaging (money-back guarantee, etc.)

**Database Verification**:
```sql
SELECT * FROM email_logs
WHERE email_type = 'upgrade_prompt'
ORDER BY created_at DESC LIMIT 1;
```

---

### 15. Email Change Verification

**Email Type**: `email_change_verification`
**Function**: `request-email-change` and `verify-email-change`
**Purpose**: Send verification link when user changes email

**Trigger Steps**:
```
1. Go to Settings > Account > Email
2. Enter new email: verify.test@example.com
3. Click "Change Email"
4. Check inbox
```

**Expected Email Subject**: `Verify your new email address`

**Content Verification Checklist**:
- [ ] Verification link in email (not in separate message)
- [ ] Link expires appropriately (24-48 hours)
- [ ] Clear instructions on what to do
- [ ] Secure message ("Don't share this link")
- [ ] If user didn't request, explain how to reject
- [ ] Support contact if confused

**Variable Verification**:
```
new_email: ✓ Shows new email address
verification_url: ✓ Link works and verifies email
expiry_time: ✓ Shows "24 hours" or configured time
old_email: ✓ Shows their current email (security)
```

**Test Variations**:
- [ ] Click link before expiry - works
- [ ] Try link after expiry - shows error
- [ ] Try link in different browser - works
- [ ] Try invalid link - shows error

**Database Verification**:
```sql
SELECT * FROM email_logs
WHERE email_type = 'email_change_verification'
ORDER BY created_at DESC LIMIT 1;
```

---

### 16. Password Reset

**Email Type**: `password_reset`
**Function**: `send-password-reset-email`
**Purpose**: Allow user to reset forgotten password

**Trigger Steps**:
```
1. Go to Login > "Forgot password?"
2. Enter email: test.email.2026@example.com
3. Click "Send reset link"
4. Check inbox
```

**Expected Email Subject**: `Reset your Sixty password`

**Content Verification Checklist**:
- [ ] Password reset link in email
- [ ] Link expires appropriately (1-2 hours)
- [ ] Instructions clear ("click link, enter new password")
- [ ] Security warning ("only click if you requested this")
- [ ] Link doesn't auto-fill password
- [ ] Error if link already used
- [ ] Support contact for account recovery

**Test Variations**:
- [ ] Click link and set new password - works
- [ ] Try same link again - error (one-time use)
- [ ] Try very old link - error (expired)
- [ ] Try modifying link - error (invalid)

**Database Verification**:
```sql
SELECT * FROM email_logs
WHERE email_type = 'password_reset'
ORDER BY created_at DESC LIMIT 1;
```

---

### 17. Join Request Rejected

**Email Type**: `join_request_rejected`
**Function**: `handle-join-request-action`
**Purpose**: Notify user their join request was rejected

**Trigger Steps**:
```
1. As different user, request to join org
2. As org admin, reject the request
3. Email sent to requester
4. Check inbox
```

**Expected Email Subject**: `Your request to join [Org] was not approved`

**Content Verification Checklist**:
- [ ] Clear message that request was rejected
- [ ] Reason shown (if admin provided one)
- [ ] Organization name shown
- [ ] Option to contact org admin
- [ ] Professional, respectful tone
- [ ] Support contact if they need help

**Database Verification**:
```sql
SELECT * FROM email_logs
WHERE email_type = 'join_request_rejected'
ORDER BY created_at DESC LIMIT 1;
```

---

### 18. Permission to Close

**Email Type**: `permission_to_close`
**Function**: `permission-to-close-email`
**Purpose**: Request confirmation to close deal/opportunity

**Trigger Steps**:
```
1. Go to Deals > Find a deal
2. Click "Close Deal"
3. If additional confirmation needed, email sent
4. Check inbox
```

**Expected Email Subject**: `Confirm: Close [Deal Name]`

**Content Verification Checklist**:
- [ ] Deal name and details shown
- [ ] Confirmation action clear
- [ ] Approval CTA button works
- [ ] Reasoning for confirmation explained (audit trail)
- [ ] Link to view deal in app
- [ ] Professional tone
- [ ] Support contact for questions

**Database Verification**:
```sql
SELECT * FROM email_logs
WHERE email_type = 'permission_to_close'
ORDER BY created_at DESC LIMIT 1;
```

---

## Cross-Cutting Tests

These tests apply to **all 18 email types**:

### Email Delivery

**Test**: All emails arrive within acceptable time

```
Expected: 2-5 seconds from trigger to inbox
Verify:
- [ ] Email arrives in inbox quickly
- [ ] No delays or bounces
- [ ] Email appears in email_logs immediately after send
- [ ] Timestamp in email_logs is correct
- [ ] Message ID from SES is captured
```

### From Address

**Test**: All emails sent from correct address

```
Expected: From: Sixty Seconds <app@use60.com>
Verify:
- [ ] All 18 emails have correct from address
- [ ] Sender name is "Sixty Seconds"
- [ ] No variation in from address
- [ ] Reply-to is set correctly (if needed)
```

### Reply-To Address

**Test**: Reply-to address configured correctly

```
Expected: Reply-To: support@use60.com (or no reply if applicable)
Verify:
- [ ] User can reply to email (if applicable)
- [ ] Replies go to correct mailbox
- [ ] No bounces when replying
```

### Broken Images

**Test**: No broken image links

```
For each email:
- [ ] All images load successfully
- [ ] No missing image placeholders
- [ ] Logo renders correctly
- [ ] No red X icons for images
- [ ] Images have alt text (if alt text added)
```

### HTML Validity

**Test**: HTML is well-formed and renders correctly

```
For each email:
- [ ] No HTML errors in browser console
- [ ] Email renders same in all clients:
  - [ ] Gmail
  - [ ] Outlook
  - [ ] Apple Mail
  - [ ] Thunderbird
  - [ ] Mobile email apps
- [ ] No text overlapping
- [ ] Formatting preserved
```

### Link Validation

**Test**: All links work correctly

```
For each email:
1. List all links present
2. For each link:
   - [ ] Click link
   - [ ] Opens in correct target (_blank or _self)
   - [ ] No 404 errors
   - [ ] No mixed content warnings (http in https)
   - [ ] URL parameters preserved
   - [ ] Links work across browsers
```

**Links to check**:
- [ ] Primary CTA button link
- [ ] Support email link (mailto:)
- [ ] Any secondary action links
- [ ] Unsubscribe link (if applicable)
- [ ] Social media links (if included)
- [ ] Company website link (if included)

### Mobile Rendering

**Test**: Emails display correctly on mobile

```
Test viewport widths:
- [ ] 320px (iPhone SE)
- [ ] 375px (iPhone 12/13)
- [ ] 414px (iPhone 12/13 Pro)
- [ ] 480px (Android)

For each width:
- [ ] Text readable without zooming
- [ ] Images scale appropriately
- [ ] Buttons tappable (44px minimum)
- [ ] No horizontal scrolling required
- [ ] Layout stacks properly (single column)
- [ ] Margins/padding appropriate
- [ ] CTA button spans width or is clearly tappable
```

### Styling Consistency

**Test**: All emails use consistent styling

```
Verify:
- [ ] Font family consistent across all emails
- [ ] Font sizes readable (16px minimum for body)
- [ ] Color scheme consistent
- [ ] Button styling consistent
- [ ] Link colors consistent
- [ ] Line heights appropriate (1.5 minimum)
- [ ] Font weights appropriate
- [ ] No odd spacing/alignment issues
```

### Variable Substitution

**Test**: All template variables substituted correctly

```
For each email:
- [ ] No remaining {{variable}} placeholders
- [ ] Variables substituted with correct values
- [ ] Names personalized (not generic)
- [ ] URLs complete (not partial)
- [ ] Numbers formatted correctly
- [ ] Dates in correct format
- [ ] No double-substitutions (variable used twice)
```

### Error Scenarios

**Test**: Email system handles errors gracefully

```
Test each failure mode:
1. Invalid email address
   - [ ] Email rejected gracefully
   - [ ] Error logged in email_logs with status='failed'
   - [ ] Error message informative
   - [ ] No crash/500 error

2. Missing required variables
   - [ ] Error caught before send attempt
   - [ ] Error logged with reason
   - [ ] No blank/broken email sent

3. Template not found
   - [ ] Error caught
   - [ ] Appropriate 404 response
   - [ ] Logged in error logs

4. Database connection error
   - [ ] Error caught
   - [ ] Retry attempted (if configured)
   - [ ] Graceful error message
   - [ ] Support contacted if critical

5. SES send failure
   - [ ] Error caught from AWS
   - [ ] Appropriate error response
   - [ ] Logged with AWS error message
   - [ ] Retry attempted (if transient error)
```

### Performance

**Test**: Email sending performance is acceptable

```
Verify:
- [ ] Email delivery < 5 seconds (including SES)
- [ ] Logging completes without delays
- [ ] No timeout errors
- [ ] Multiple emails can be sent concurrently
- [ ] System handles rapid successive sends
```

### Internationalization (i18n)

**Test**: Non-English characters handled correctly

```
Verify:
- [ ] Recipient names with accents work: "José"
- [ ] Company names with non-ASCII: "Société Générale"
- [ ] Emojis (if used) render correctly
- [ ] Text encoding correct (UTF-8)
- [ ] No character replacement/corruption
```

---

## Troubleshooting

### Email Not Arriving

**Symptom**: Email not in inbox 5+ seconds after trigger

**Diagnosis Steps**:
1. Check email_logs table for entry:
   ```sql
   SELECT * FROM email_logs
   WHERE to_email = '[user-email]'
   ORDER BY created_at DESC LIMIT 5;
   ```

2. Check for log entry with status='failed':
   ```sql
   SELECT * FROM email_logs
   WHERE status = 'failed'
   ORDER BY created_at DESC LIMIT 5;
   ```

3. Check browser console for errors:
   - Open DevTools (F12)
   - Go to Console tab
   - Look for error messages or failed fetch requests

4. Check authentication:
   - Verify EDGE_FUNCTION_SECRET is set
   - Verify Bearer token or header is valid
   - Check authorization logs

**Common Fixes**:
- [ ] Check AWS SES sandbox/verified addresses
- [ ] Verify SMTP credentials are correct
- [ ] Check email doesn't have spam triggers (too many links, etc.)
- [ ] Verify email address format is valid
- [ ] Check email_logs for actual error message
- [ ] Check SES sending quota not exceeded
- [ ] Verify template exists in encharge_email_templates

---

### Variables Not Substituted

**Symptom**: Email contains `{{variable_name}}` instead of actual value

**Diagnosis Steps**:
1. Check template in database:
   ```sql
   SELECT * FROM encharge_email_templates
   WHERE template_type = '[email-type]';
   ```

2. Verify variable names in template match schema:
   - Should use snake_case: `{{recipient_name}}`
   - Not camelCase: `{{recipientName}}`

3. Check email_logs metadata:
   ```sql
   SELECT metadata FROM email_logs
   WHERE id = '[log-id]';
   ```

4. Verify variables passed to function:
   - Check network request in DevTools
   - Verify `variables` object in request body

**Common Fixes**:
- [ ] Ensure variable names match template syntax
- [ ] Check for typos in variable names
- [ ] Verify variables object not empty
- [ ] Check template actually has the variable
- [ ] Verify processTemplate function called

---

### Styling Issues

**Symptom**: Email renders incorrectly in certain clients

**Diagnosis Steps**:
1. Compare rendering across email clients:
   - Gmail (web and mobile)
   - Outlook (web and desktop)
   - Apple Mail
   - Thunderbird

2. Use Email on Acid or similar tool:
   - https://www.emailonacid.com
   - Test across 60+ clients

3. Check HTML in template:
   ```sql
   SELECT html_body FROM encharge_email_templates
   WHERE template_type = '[email-type]';
   ```

4. Check for CSS that's not supported:
   - CSS Grid not supported
   - CSS Variables not supported
   - Some @media queries not supported

**Common Fixes**:
- [ ] Use inline CSS instead of style tags
- [ ] Use old-school table layouts for structure
- [ ] Verify font-family fallbacks included
- [ ] Check colors are supported
- [ ] Use VML for Outlook-specific styling
- [ ] Test with Email on Acid

---

### Links Not Working

**Symptom**: Click link in email, get 404 or wrong page

**Diagnosis Steps**:
1. Inspect email source to see actual URL:
   - Right-click email > "View original" or similar
   - Find the `href` value

2. Test URL in browser:
   - Copy the exact URL
   - Paste in new browser tab
   - Check for 404 or redirect loops

3. Check variable substitution:
   ```sql
   SELECT metadata FROM email_logs
   WHERE id = '[log-id]';
   -- Check metadata.variables.action_url
   ```

4. Verify URL structure:
   - Has protocol (https://)
   - Has domain (app.use60.com)
   - Has path (/invite/abc123)
   - No extra characters

**Common Fixes**:
- [ ] Verify action_url variable is correct
- [ ] Check URL encoding (spaces → %20, etc.)
- [ ] Verify token/ID in URL is valid
- [ ] Check expiration of links
- [ ] Verify redirect logic on landing page
- [ ] Test link in same browser as email

---

### Browser Console Errors

**Symptom**: Red errors in DevTools Console

**Common Errors**:
1. `Failed to fetch encharge-send-email`
   - Check network tab for response
   - Verify EDGE_FUNCTION_SECRET matches
   - Check function deployed and accessible

2. `CORS error: No 'Access-Control-Allow-Origin' header`
   - Check corsHeaders in function
   - Verify function returns proper CORS headers
   - Check OPTIONS method handling

3. `401 Unauthorized`
   - Verify authentication headers correct
   - Check EDGE_FUNCTION_SECRET environment variable
   - Verify Bearer token format

4. `500 Internal Server Error`
   - Check function logs in Supabase
   - Look for database errors
   - Check AWS SES credentials

**How to Fix**:
- [ ] Open DevTools (F12)
- [ ] Go to Network tab
- [ ] Trigger action (send email)
- [ ] Find failed request
- [ ] Click request, check Response tab
- [ ] Read error message
- [ ] Apply fix based on error

---

### Database Errors

**Symptom**: Can't query email_logs, permission denied

**Diagnosis Steps**:
1. Verify you have access:
   ```sql
   SELECT * FROM email_logs LIMIT 1;
   ```

2. Check RLS policies:
   ```sql
   SELECT * FROM pg_policies
   WHERE tablename = 'email_logs';
   ```

3. Verify table exists:
   ```sql
   SELECT * FROM information_schema.tables
   WHERE table_name = 'email_logs';
   ```

**Common Fixes**:
- [ ] Use service role key for admin queries
- [ ] Verify RLS policies allow your role
- [ ] Check if table exists (might not be created)
- [ ] Verify schema name (might be in different schema)

---

## Acceptance Criteria Checklist

### Automated Testing Complete

- [ ] All 45+ test cases pass
- [ ] No flaky tests (don't fail randomly)
- [ ] Tests cover success paths
- [ ] Tests cover failure paths
- [ ] Mock data realistic
- [ ] Test output clear and readable

**Run Commands**:
```bash
npm run test:run -- test/email-templates.test.ts
npm run test:coverage -- test/email-templates.test.ts
```

### Manual Testing Complete (All 18 Email Types)

- [ ] 1. Organization Invitation - tested and verified
- [ ] 2. Member Removed - tested and verified
- [ ] 3. Organization Approval - tested and verified
- [ ] 4. Join Request Approved - tested and verified
- [ ] 5. Waitlist Invite - tested and verified
- [ ] 6. Waitlist Welcome - tested and verified
- [ ] 7. Welcome (New Account) - tested and verified
- [ ] 8. Fathom Connected - tested and verified
- [ ] 9. First Meeting Synced - tested and verified
- [ ] 10. Trial Ending Soon - tested and verified
- [ ] 11. Trial Expired - tested and verified
- [ ] 12. Subscription Confirmed - tested and verified
- [ ] 13. Meeting Limit Warning - tested and verified
- [ ] 14. Upgrade Prompt - tested and verified
- [ ] 15. Email Change Verification - tested and verified
- [ ] 16. Password Reset - tested and verified
- [ ] 17. Join Request Rejected - tested and verified
- [ ] 18. Permission to Close - tested and verified

### For Each Email Type

- [ ] **Content Verified**
  - [ ] Subject line correct
  - [ ] From address correct
  - [ ] Body text makes sense
  - [ ] No template syntax leaking (no `{{var}}` visible)
  - [ ] Variables substituted with real values
  - [ ] Personalization working

- [ ] **Design Verified**
  - [ ] Renders correctly in desktop email client
  - [ ] Renders correctly in mobile email client
  - [ ] Colors visible and readable
  - [ ] Text size appropriate
  - [ ] Images load correctly
  - [ ] Layout not broken
  - [ ] No horizontal scrolling

- [ ] **Links Working**
  - [ ] Primary CTA button clickable and works
  - [ ] All links go to correct destination
  - [ ] No 404 errors
  - [ ] Links work across browsers
  - [ ] Links don't trigger security warnings

- [ ] **Database Logging**
  - [ ] Entry in email_logs table
  - [ ] email_type correct
  - [ ] to_email correct
  - [ ] status = 'sent'
  - [ ] sent_via = 'aws_ses'
  - [ ] metadata populated correctly
  - [ ] created_at timestamp reasonable

### Cross-Cutting Acceptance

- [ ] **All 18 emails arrive** in inbox
- [ ] **From address consistent** across all emails
- [ ] **No broken images** in any email
- [ ] **HTML valid** in all emails
- [ ] **Mobile-responsive** - all readable on phone
- [ ] **Links working** - all tested and verified
- [ ] **Variables substituted** - no `{{}}` visible
- [ ] **Styling consistent** - fonts, colors, spacing
- [ ] **Error handling** - graceful failures logged
- [ ] **No browser errors** - DevTools Console clean

### Documentation Complete

- [ ] This checklist exists and is comprehensive
- [ ] Setup section clear and complete
- [ ] All 18 email types documented
- [ ] Trigger steps clear for each type
- [ ] Verification checklists complete
- [ ] Database queries provided
- [ ] Troubleshooting guide helpful
- [ ] Mobile testing instructions clear

### Ready for Deployment

- [ ] All automated tests passing
- [ ] All 18 email types manually tested
- [ ] All cross-cutting tests passing
- [ ] No known issues
- [ ] No browser console errors
- [ ] Database logging verified
- [ ] Performance acceptable
- [ ] Error scenarios tested

---

## Final Verification

Before signing off on manual testing, complete this final checklist:

```
Date Completed: ________________
Tester Name: ________________
Environment: [ ] Staging [ ] Production

All 18 email types tested: [ ] Yes [ ] No
All tests passed: [ ] Yes [ ] No
No blockers found: [ ] Yes [ ] No
Ready for deployment: [ ] Yes [ ] No

Issues Found:
_________________________________________________________________________
_________________________________________________________________________

Notes:
_________________________________________________________________________
_________________________________________________________________________

Sign-off: ____________________
```

---

## Quick Reference

### Commands

```bash
# Run automated tests
npm run test:run -- test/email-templates.test.ts

# Watch mode
npm run test -- test/email-templates.test.ts

# Coverage report
npm run test:coverage -- test/email-templates.test.ts

# Check specific email type
npm run test:run -- --grep "organization_invitation"
```

### Database Queries

```sql
-- All emails sent today
SELECT * FROM email_logs
WHERE created_at > NOW() - INTERVAL '1 day'
ORDER BY created_at DESC;

-- Failed emails
SELECT * FROM email_logs
WHERE status = 'failed'
ORDER BY created_at DESC LIMIT 10;

-- Specific email type
SELECT * FROM email_logs
WHERE email_type = 'organization_invitation'
ORDER BY created_at DESC LIMIT 10;

-- Email count by type
SELECT email_type, COUNT(*) as count
FROM email_logs
WHERE created_at > NOW() - INTERVAL '1 day'
GROUP BY email_type
ORDER BY count DESC;
```

### Support Contacts

- **Email Team**: engineering-team@use60.com
- **SES Support**: AWS SES console
- **Supabase Support**: Supabase dashboard
- **On-call Engineer**: Check on-call rotation

---

## Version History

| Version | Date | Notes |
|---------|------|-------|
| 1.0 | 2026-02-03 | Initial checklist creation |

---

**Status**: ✅ Complete and Ready for Use

This manual testing checklist covers all 18 email types with comprehensive verification steps, cross-cutting tests, troubleshooting guides, and acceptance criteria. Use this guide for both initial testing and ongoing regression testing of the email system.
