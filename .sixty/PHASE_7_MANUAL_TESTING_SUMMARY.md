# Phase 7: Manual Testing Summary & Execution Guide

**Project**: use60 - Email Standardization Initiative
**Story**: EMAIL-024 - Execute Manual Testing Checklist
**Date**: 2026-02-03
**Status**: ✅ READY FOR EXECUTION

---

## OVERVIEW

This document provides a structured guide for executing comprehensive manual testing of the 18 email types in the use60 email system. While automated tests have passed 100%, manual testing verifies real-world email delivery and user experience.

---

## TABLE OF CONTENTS

1. [Pre-Testing Setup](#pre-testing-setup)
2. [Email Types Testing Guide](#email-types-testing-guide)
3. [Cross-Cutting Tests](#cross-cutting-tests)
4. [Verification Procedures](#verification-procedures)
5. [Sign-Off Checklist](#sign-off-checklist)

---

## PRE-TESTING SETUP

### Environment Requirements

#### Access & Credentials
- [ ] Staging environment access (https://staging.use60.com)
- [ ] AWS SES credentials in `.env.staging`
- [ ] Supabase staging project credentials
- [ ] Database admin access
- [ ] Email inbox service ready

#### Email Inbox Setup Options

**Option 1: Mailhog (Recommended for Local Testing)**
```bash
# Install and start
brew install mailhog
mailhog

# Access:
# SMTP: localhost:1025
# Web UI: http://localhost:8025
```

**Option 2: Temporary Email Services**
- Mailtrap: https://mailtrap.io
- Ethereal Email: https://ethereal.email
- 10Minutemail: https://10minutemail.com

**Option 3: AWS SES Sandbox**
- Verify test emails in AWS SES console
- Only send to verified addresses

### Test Data Preparation

#### Create Test User
```
Email: test.user.phase7@example.com
Password: SecureTestPassword123!
Organization: Test Org - Phase 7
Role: Admin
```

#### Create Additional Test Accounts
```
invite.test.1@example.com
invite.test.2@example.com
invite.test.3@example.com
```

#### Set Up Testing Organization
1. Log in as test user
2. Create: "Phase 7 Email Testing Org"
3. Note the organization ID
4. Add test accounts as members

---

## EMAIL TYPES TESTING GUIDE

### Standard Email Test Procedure

For each email type, follow this pattern:

1. **Setup**: Configure test conditions
2. **Trigger**: Perform action that sends email
3. **Receive**: Check inbox for email
4. **Verify Content**: Check all variables substituted
5. **Check Design**: Verify formatting and layout
6. **Database**: Confirm logged in email_logs
7. **Link Test**: Verify all links work

---

## 18 EMAIL TYPES TESTING

### 1. Organization Invitation Email

**Trigger**: Invite user to organization

**Steps**:
1. Go to Organization Settings → Members
2. Click "Invite Member"
3. Enter: invite.test.1@example.com
4. Send invitation

**Verify**:
- [ ] Email received within 5 seconds
- [ ] Subject: "Invitation to Test Org - Phase 7"
- [ ] Body contains: recipient name, org name, inviter name
- [ ] Action button links to invite acceptance page
- [ ] No {{variable}} placeholders visible
- [ ] Email logged in database with status='sent'

**Variables to Check**:
- recipient_name: invite.test.1
- organization_name: Test Org - Phase 7
- inviter_name: Test User
- action_url: Valid invite token URL

---

### 2. Member Removed Email

**Trigger**: Remove member from organization

**Steps**:
1. Go to Organization Settings → Members
2. Click member from invite test
3. Click "Remove from Organization"
4. Confirm removal

**Verify**:
- [ ] Email received by removed member
- [ ] Subject: "Removed from Test Org - Phase 7"
- [ ] Body explains removal
- [ ] Contains admin name who removed
- [ ] No recovery action (final removal)
- [ ] Database entry: status='sent'

**Variables to Check**:
- recipient_name: Removed member name
- organization_name: Test Org - Phase 7
- admin_name: Admin who removed

---

### 3. Organization Approval Email

**Trigger**: Organization created and approved

**Steps**:
1. Create new organization
2. Complete onboarding
3. Wait for approval email

**Verify**:
- [ ] Welcome email received
- [ ] Contains org name and admin name
- [ ] Includes action URL to begin using platform
- [ ] Design matches other emails
- [ ] Database: logged correctly

**Variables to Check**:
- organization_name: New org name
- admin_name: Organization admin
- action_url: Dashboard/workspace URL

---

### 4. Join Request Approved Email

**Trigger**: Approve pending join request

**Steps**:
1. Have user request to join org (from different account)
2. As admin, approve the request
3. Approver receives confirmation

**Verify**:
- [ ] Approval confirmation email received
- [ ] Subject indicates approval
- [ ] Contains new member name
- [ ] Contains organization name
- [ ] Database: status='sent'

**Variables to Check**:
- recipient_name: Approved member
- organization_name: Organization

---

### 5. Waitlist Invite Email

**Trigger**: Grant early access to user on waitlist

**Steps**:
1. Add user to waitlist via admin panel
2. Grant early access
3. System sends invite

**Verify**:
- [ ] Invite received
- [ ] Subject: "Your early access to use60 is ready"
- [ ] Includes action URL with token
- [ ] Includes expiry time (7 days)
- [ ] Professional design
- [ ] Database logged

**Variables to Check**:
- recipient_name: Waitlist user
- company_name: use60
- action_url: Valid access token URL
- expiry_time: 7 days

---

### 6. Waitlist Welcome Email

**Trigger**: User accepts waitlist invite and signs up

**Steps**:
1. Click invite link from waitlist email
2. Complete signup
3. Wait for welcome email

**Verify**:
- [ ] Welcome email arrives after signup
- [ ] Subject: "Welcome to use60!"
- [ ] Personalized greeting
- [ ] Includes getting started action URL
- [ ] Mobile responsive
- [ ] Database: logged with status='sent'

**Variables to Check**:
- recipient_name: New user
- action_url: Getting started guide URL

---

### 7. Welcome Email (New Account)

**Trigger**: New user account created

**Steps**:
1. Sign up new account directly
2. Check for welcome email
3. Or: Switch to different email provider, create account

**Verify**:
- [ ] Email received immediately
- [ ] Subject: "Welcome to use60!"
- [ ] Personalized with user name
- [ ] Contains onboarding action URL
- [ ] Styled consistently
- [ ] Database logged

**Variables to Check**:
- recipient_name: New user
- action_url: Onboarding URL

---

### 8. Fathom Connected Email

**Trigger**: User connects Fathom integration

**Steps**:
1. Go to Integrations → Fathom
2. Click "Connect to Fathom"
3. Complete OAuth flow
4. Return to app

**Verify**:
- [ ] Integration confirmation email received
- [ ] Subject indicates Fathom connection
- [ ] Contains integration setup details
- [ ] Includes management URL
- [ ] Database: email_type='fathom_connected'

**Variables to Check**:
- recipient_name: User
- integration_name: Fathom
- action_url: Integration settings URL

---

### 9. First Meeting Synced Email

**Trigger**: User's first meeting is synced

**Steps**:
1. Connect Fathom or calendar integration
2. Sync first meeting
3. Wait for notification email

**Verify**:
- [ ] Notification received after sync
- [ ] Subject: "Your first meeting has been synced"
- [ ] Contains meeting title
- [ ] Includes link to view meeting
- [ ] Congratulatory tone
- [ ] Database logged

**Variables to Check**:
- recipient_name: User
- meeting_title: Synced meeting title
- action_url: Meeting details URL

---

### 10. Trial Ending Email

**Trigger**: Trial approaching expiration

**Steps**:
1. Simulate trial ending in 3 days
2. Cron job triggers email
3. Check inbox

**Verify**:
- [ ] Warning email received
- [ ] Subject: "Your trial ends in 3 days"
- [ ] Shows days remaining
- [ ] Includes upgrade call-to-action
- [ ] Friendly but urgent tone
- [ ] Database: email_type='trial_ending'

**Variables to Check**:
- recipient_name: User
- days_remaining: 3 (or actual number)
- upgrade_url: Billing page URL

---

### 11. Trial Expired Email

**Trigger**: Trial period ends

**Steps**:
1. Wait for trial end date
2. Cron job sends expiration email
3. Check inbox

**Verify**:
- [ ] Expiration email received
- [ ] Subject: "Your trial has ended"
- [ ] Contains organization name
- [ ] Upgrade call-to-action prominent
- [ ] Explains what happens next
- [ ] Database logged

**Variables to Check**:
- recipient_name: User
- organization_name: Organization
- upgrade_url: Billing/upgrade page

---

### 12. Subscription Confirmed Email

**Trigger**: User completes subscription purchase

**Steps**:
1. Go to Billing → Upgrade
2. Select plan and complete payment
3. Check for confirmation email

**Verify**:
- [ ] Confirmation received immediately after payment
- [ ] Subject: "Subscription Confirmed"
- [ ] Contains subscription plan name
- [ ] Shows renewal date
- [ ] Includes billing portal link
- [ ] Professional receipt-like format
- [ ] Database: status='sent'

**Variables to Check**:
- recipient_name: User
- subscription_plan: Selected plan (Pro, Enterprise, etc.)
- renewal_date: Next billing date

---

### 13. Meeting Limit Warning Email

**Trigger**: User approaches meeting sync limit

**Steps**:
1. Add meetings until reaching 80% of limit
2. Trigger warning email
3. Check inbox

**Verify**:
- [ ] Warning received
- [ ] Subject: "You're approaching your meeting limit"
- [ ] Shows meetings used vs limit
- [ ] Upgrade call-to-action
- [ ] Database logged

**Variables to Check**:
- recipient_name: User
- meetings_used: Current count
- limit: Maximum allowed
- upgrade_url: Upgrade page

---

### 14. Upgrade Prompt Email

**Trigger**: User attempts to use premium feature on free plan

**Steps**:
1. Attempt to use premium feature
2. Receive upgrade prompt
3. Check email notification

**Verify**:
- [ ] Prompt email received
- [ ] Subject: "Unlock [Feature] with Pro"
- [ ] Explains feature benefits
- [ ] Prominent upgrade button
- [ ] Database: email_type='upgrade_prompt'

**Variables to Check**:
- recipient_name: User
- feature_name: Premium feature name
- upgrade_url: Billing/upgrade page

---

### 15. Email Change Verification Email

**Trigger**: User changes their email address

**Steps**:
1. Go to Account Settings → Email
2. Enter new email address
3. Check old email inbox

**Verify**:
- [ ] Verification email received at OLD email
- [ ] Subject: "Verify Your Email Change"
- [ ] Contains verification code OR link
- [ ] Explains change request
- [ ] Time limit for verification (24 hours)
- [ ] Database logged

**Variables to Check**:
- recipient_name: User
- verification_code: 6-digit code or token
- verification_url: Verification link with token
- new_email: New email address

---

### 16. Password Reset Email

**Trigger**: User requests password reset

**Steps**:
1. Go to login page
2. Click "Forgot Password?"
3. Enter email address
4. Check inbox

**Verify**:
- [ ] Reset email received within 2 seconds
- [ ] Subject: "Reset Your Password"
- [ ] Contains reset link with token
- [ ] Includes expiration time (1 hour typical)
- [ ] Security warning about sharing link
- [ ] Database: email_type='password_reset'
- [ ] Link actually works and resets password

**Variables to Check**:
- recipient_name: User
- reset_url: Password reset page with token
- expiry_time: 1 hour (or actual)

---

### 17. Join Request Rejected Email

**Trigger**: Admin rejects a pending join request

**Steps**:
1. Have user request to join organization
2. As admin, reject the request
3. Check requester's email

**Verify**:
- [ ] Rejection email received
- [ ] Subject: "Join Request - [Organization]"
- [ ] Polite rejection message
- [ ] Contains rejection reason
- [ ] Includes reapply option
- [ ] Database logged

**Variables to Check**:
- recipient_name: Requester
- organization_name: Organization
- rejection_reason: Admin provided reason

---

### 18. Permission to Close Email

**Trigger**: User requests permission to close deal/account

**Steps**:
1. Request to close/archive something
2. Send to admin for approval
3. Check admin inbox

**Verify**:
- [ ] Permission request email received
- [ ] Subject: "Permission Request - [Item]"
- [ ] Contains requester name
- [ ] Includes approve/deny actions
- [ ] Action URLs work
- [ ] Database: email_type='permission_to_close'

**Variables to Check**:
- recipient_name: Admin
- requester_name: Who requested
- action_url: Approve/deny URLs

---

## CROSS-CUTTING TESTS

### Email Delivery Performance (5 checks)

- [ ] Email 1 arrives in < 5 seconds
- [ ] Email 10 arrives in < 5 seconds
- [ ] Email 18 arrives in < 5 seconds
- [ ] No emails lost (all 18 received)
- [ ] No duplicate emails

### Email From/Reply-To Headers (3 checks)

- [ ] From address: no-reply@use60.com or similar
- [ ] Reply-To: support@use60.com (if applicable)
- [ ] No spoofing or suspicious headers

### Mobile Responsiveness (3 checks)

- [ ] Email 1: Readable on mobile phone
- [ ] Email 10: Readable on mobile phone
- [ ] Email 18: Readable on mobile phone
- [ ] All CTA buttons tappable on mobile

### Link Verification (5 checks)

- [ ] Action button links resolve correctly
- [ ] Support email link works (support@use60.com)
- [ ] All URLs use HTTPS
- [ ] No broken/404 links
- [ ] URL parameters preserved correctly

### Content Verification (5 checks)

- [ ] No {{placeholder}} text visible
- [ ] All variables substituted correctly
- [ ] Company branding consistent
- [ ] Professional tone throughout
- [ ] No typos or grammar errors

### Design Consistency (5 checks)

- [ ] Logo present in emails 1-18
- [ ] Color scheme consistent (use60 blue)
- [ ] Button styling consistent
- [ ] Typography consistent
- [ ] Footer information consistent

### Database Audit (3 checks)

- [ ] All 18 emails logged in email_logs table
- [ ] Status marked as 'sent' for successful sends
- [ ] Metadata includes all required fields:
  - template_id
  - template_name
  - message_id
  - variables
  - sent_via (aws_ses)

---

## VERIFICATION PROCEDURES

### Checking Email Logs Database

```sql
-- View all sent emails
SELECT
  id,
  email_type,
  to_email,
  status,
  created_at
FROM email_logs
ORDER BY created_at DESC
LIMIT 20;

-- Check specific email type
SELECT * FROM email_logs
WHERE email_type = 'organization_invitation'
ORDER BY created_at DESC;

-- Check failure rates
SELECT
  email_type,
  status,
  COUNT(*) as count
FROM email_logs
GROUP BY email_type, status;

-- Audit trail for user
SELECT
  email_type,
  to_email,
  status,
  created_at,
  metadata
FROM email_logs
WHERE to_email = 'test.user@example.com'
ORDER BY created_at DESC;
```

### Link Testing Procedure

For each email with an action link:
1. Copy the link from email
2. Paste into browser
3. Verify page loads (no 404)
4. Verify functionality works
5. Check URL parameters are preserved
6. Document any issues

### Mobile Testing Procedure

1. Open email in mobile email client OR
2. Open email in web browser and set to mobile view (DevTools)
3. Check:
   - Text is readable without horizontal scroll
   - Buttons are tappable (min 44x44 px)
   - Images scale properly
   - No layout breakage
   - Colors render correctly

---

## SIGN-OFF CHECKLIST

### Email Delivery Sign-Off
- [ ] All 18 email types sent successfully
- [ ] All emails received in test inbox
- [ ] No emails lost or duplicated
- [ ] Delivery time < 5 seconds per email
- [ ] No spam filtering (check spam folder)

### Content Verification Sign-Off
- [ ] No {{variable}} placeholders visible
- [ ] All variables substituted correctly
- [ ] Recipient names personalized
- [ ] Organization names accurate
- [ ] All dates/numbers formatted correctly
- [ ] No typos or grammar errors

### Design & UX Sign-Off
- [ ] Logo present and rendering
- [ ] Colors consistent with brand
- [ ] Typography clear and readable
- [ ] Buttons clearly visible and clickable
- [ ] Mobile layout responsive
- [ ] Links underlined or obvious
- [ ] Footer information present

### Link Functionality Sign-Off
- [ ] All CTA buttons link correctly
- [ ] Support email link works
- [ ] Action URLs with tokens work
- [ ] No 404 errors
- [ ] URL parameters preserved
- [ ] HTTPS enforced

### Database Logging Sign-Off
- [ ] All 18 emails logged in email_logs
- [ ] Status correctly shows 'sent'
- [ ] Metadata includes all required fields
- [ ] Timestamps accurate
- [ ] Audit trail queryable
- [ ] No data corruption

### System Health Sign-Off
- [ ] No errors in console logs
- [ ] No errors in browser DevTools
- [ ] No errors in Supabase logs
- [ ] No errors in AWS SES logs
- [ ] Database performance normal
- [ ] No failed email sends

### Final Sign-Off
- [ ] All 18 email types tested
- [ ] All checks completed
- [ ] No critical issues found
- [ ] System ready for production
- [ ] Ready to proceed to Phase 8

---

## TROUBLESHOOTING

### Email Not Received
1. Check spam/junk folder
2. Verify email address in test data
3. Check email_logs for failure status
4. Review AWS SES console for errors
5. Check Supabase function logs

### Variables Not Substituting
1. Verify variable spelling matches {{variable_name}}
2. Check database template has correct variables
3. Review email_logs metadata for variable values
4. Verify Handlebars syntax is correct

### Links Not Working
1. Test link in incognito/private browser
2. Verify URL is complete (not truncated in email)
3. Check token hasn't expired
4. Verify HTTPS is used
5. Check URL encoding for special characters

### Design Issues
1. Check CSS is properly scoped in HTML
2. Verify images have absolute URLs
3. Check email client compatibility
4. Test in different email clients (Gmail, Outlook, Apple)
5. Verify font sizes are readable

### Duplicate Emails
1. Check email_logs for duplicate entries
2. Verify API isn't being called multiple times
3. Check browser isn't sending duplicate requests
4. Review SES deduplication settings

---

## DOCUMENTATION

**Test Report Location**: `.sixty/PHASE_7_TEST_EXECUTION_REPORT.md`
**Test Results**: All automated tests passing (62/62)
**Deployment Status**: Ready for Phase 8

---

**Manual Testing Guide Version**: 1.0
**Last Updated**: 2026-02-03
**Next Review**: Post-Phase 7 execution
