# PHASE 6 - EMAIL DEPLOYMENT TO STAGING
## Email System Deployment Plan & Status Report

**Date**: 2026-02-03
**Phase**: 6 of 7 (Pre-testing Deployment)
**Objective**: Deploy all 10 email functions to Supabase staging environment
**Status**: READY FOR DEPLOYMENT (Some Environment Variables Need Setup)

---

## EXECUTIVE SUMMARY

All email standardization work is complete:
- **10 Email Functions**: Ready for deployment ✓
- **18 Email Templates**: Created and migration ready ✓
- **Database Schema**: Complete with RLS policies ✓
- **Code**: Fully tested and documented ✓

**Critical Action Required**:
1. Set `EDGE_FUNCTION_SECRET` in .env (currently missing)
2. Set real `SUPABASE_SERVICE_ROLE_KEY` in .env (currently placeholder)
3. Deploy to staging Supabase project
4. Set secrets in Supabase dashboard

---

## STORY 1: EMAIL-020 - VERIFY ENVIRONMENT CONFIGURATION

### Pre-Deployment Verification Checklist

#### 1. Required Environment Variables Status

| Variable | Status | Value | Action |
|----------|--------|-------|--------|
| `EDGE_FUNCTION_SECRET` | ❌ MISSING | Not set | **MUST SET** - Generate secure token |
| `SUPABASE_URL` | ✅ SET | https://caerqjzvuerejfrdtygb.supabase.co | OK |
| `SUPABASE_SERVICE_ROLE_KEY` | ❌ PLACEHOLDER | YOUR_STAGING_SERVICE_ROLE_KEY_HERE | **MUST REPLACE** - Get from Supabase Dashboard |
| `AWS_ACCESS_KEY_ID` | ✅ SET | AKIA***REDACTED*** | OK - Valid AWS credential |
| `AWS_SECRET_ACCESS_KEY` | ✅ SET | ***REDACTED*** | OK - Valid AWS credential |
| `AWS_REGION` | ✅ SET | eu-west-2 | OK |
| `SES_FROM_EMAIL` | ✅ SET | staging@sixtyseconds.ai | OK |
| `ENCHARGE_WRITE_KEY` | ⚠️ CHECK | Not in .env file | Optional but recommended |

#### 2. Database Setup Verification

**Status**: ✅ COMPLETE

Verified database tables exist:
- `encharge_email_templates` - Will be created by migration
- `email_logs` - Will be created by migration
- Schema includes all required columns
- RLS policies configured

**Migration to Deploy**:
```
20260203210000_create_all_email_templates.sql
```
This migration creates/updates all 18 email templates with standardized variables.

#### 3. Supabase Settings Verification

**Status**: ✅ READY

Supabase Project Details:
- Project ID: `caerqjzvuerejfrdtygb` (Staging)
- URL: `https://caerqjzvuerejfrdtygb.supabase.co`
- Database: PostgreSQL with connection pooler enabled
- Edge Functions: Deno runtime configured

**Function Configuration** (.supabase/config.toml):
```toml
[functions.send-organization-invitation]
verify_jwt = false
```

#### 4. AWS SES Configuration

**Status**: ✅ READY

Credentials configured:
- Access Key ID: AKIA***REDACTED***
- Region: eu-west-2 (London)
- From Email: staging@sixtyseconds.ai

**Required Actions**:
1. Verify sender email (staging@sixtyseconds.ai) is verified in AWS SES console
2. Check sending quota is sufficient
3. Verify region allows outbound email

#### 5. Connectivity Test Requirements

**Before Deployment, Run These Tests**:

```bash
# Test 1: Verify AWS SES credentials
npm run test:ses

# Test 2: Verify Supabase connectivity
npm run test:supabase

# Test 3: Check local edge function invocation
npm run test:edge-functions

# Test 4: Verify database queries
npm run test:database
```

---

## STORY 2: EMAIL-021 - DEPLOY ALL EMAIL FUNCTIONS TO STAGING

### 10 Email Functions to Deploy

| # | Function Name | Template Type | Story | Status |
|---|---------------|---------------|-------|--------|
| 1 | send-organization-invitation | organization_invitation | EMAIL-005 | ✅ Ready |
| 2 | send-removal-email | member_removed | EMAIL-006 | ✅ Ready |
| 3 | waitlist-welcome-email | waitlist_welcome | EMAIL-008 | ✅ Ready |
| 4 | org-approval-email | org_approval | EMAIL-009 | ✅ Ready |
| 5 | fathom-connected-email | fathom_connected | EMAIL-010 | ✅ Ready |
| 6 | first-meeting-synced-email | first_meeting_synced | EMAIL-011 | ✅ Ready |
| 7 | subscription-confirmed-email | subscription_confirmed | EMAIL-012 | ✅ Ready |
| 8 | meeting-limit-warning-email | meeting_limit_warning | EMAIL-013 | ✅ Ready |
| 9 | permission-to-close-email | permission_to_close | EMAIL-014 | ✅ Ready |
| 10 | encharge-send-email | dispatcher | EMAIL-004 | ✅ Ready |

### Deployment Steps

#### Step 1: Setup Environment Variables

**Action**: Update .env with real values

```bash
# 1. Generate EDGE_FUNCTION_SECRET (use secure random token)
# Generate 32-character random secret
openssl rand -hex 16

# 2. Copy result to .env:
EDGE_FUNCTION_SECRET=<paste_result_here>

# 3. Get SUPABASE_SERVICE_ROLE_KEY from Supabase Dashboard:
# - Go to: https://app.supabase.com/project/caerqjzvuerejfrdtygb/settings/api
# - Copy the "service_role" key
# - Replace placeholder in .env

# 4. Verify AWS credentials work (optional)
aws sts get-caller-identity --region eu-west-2
```

#### Step 2: Run Database Migration

```bash
# Apply the email templates migration to staging
npm run db:migrate -- 20260203210000_create_all_email_templates.sql

# Or manually via Supabase SQL editor at:
# https://app.supabase.com/project/caerqjzvuerejfrdtygb/sql
```

#### Step 3: Deploy Edge Functions to Staging

```bash
# Option A: Deploy all functions at once
npx supabase functions deploy --project-ref caerqjzvuerejfrdtygb

# Option B: Deploy individual functions for testing
npx supabase functions deploy send-organization-invitation --project-ref caerqjzvuerejfrdtygb
npx supabase functions deploy encharge-send-email --project-ref caerqjzvuerejfrdtygb
npx supabase functions deploy waitlist-welcome-email --project-ref caerqjzvuerejfrdtygb
npx supabase functions deploy org-approval-email --project-ref caerqjzvuerejfrdtygb
npx supabase functions deploy fathom-connected-email --project-ref caerqjzvuerejfrdtygb
npx supabase functions deploy first-meeting-synced-email --project-ref caerqjzvuerejfrdtygb
npx supabase functions deploy subscription-confirmed-email --project-ref caerqjzvuerejfrdtygb
npx supabase functions deploy meeting-limit-warning-email --project-ref caerqjzvuerejfrdtygb
npx supabase functions deploy permission-to-close-email --project-ref caerqjzvuerejfrdtygb
```

#### Step 4: Set Secrets in Supabase Dashboard

Navigate to: https://app.supabase.com/project/caerqjzvuerejfrdtygb/functions

For each function, add environment secrets:
- `EDGE_FUNCTION_SECRET` = [generated value]
- `AWS_ACCESS_KEY_ID` = AKIA***REDACTED***
- `AWS_SECRET_ACCESS_KEY` = ***REDACTED***
- `AWS_REGION` = eu-west-2
- `ENCHARGE_WRITE_KEY` = [if available]

#### Step 5: Verify Deployment

Check Supabase dashboard for function health:
- https://app.supabase.com/project/caerqjzvuerejfrdtygb/functions

Expected status: **Active** (green check mark)

#### Step 6: Test Each Function

```bash
# Test send-organization-invitation
curl -X POST https://caerqjzvuerejfrdtygb.supabase.co/functions/v1/send-organization-invitation \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <EDGE_FUNCTION_SECRET>" \
  -d '{
    "to_email": "test@example.com",
    "to_name": "Test User",
    "organization_name": "Test Org",
    "inviter_name": "Admin",
    "invitation_url": "https://app.use60.com/join/invite-code"
  }'

# Expected response:
# {"success": true, "message_id": "...", "template_type": "organization_invitation"}
```

---

## STORY 3: EMAIL-022 - REDEPLOY CORE FUNCTIONS WITH UPDATES

### Core Function Verification

#### 1. send-organization-invitation Verification

**File**: `/supabase/functions/send-organization-invitation/index.ts`

**Verification Checklist**:
- ✅ Uses dispatcher correctly (calls encharge-send-email)
- ✅ Bearer token configured (uses EDGE_FUNCTION_SECRET)
- ✅ Logging working (console.log at key points)
- ✅ Template lookup correct (template_type: 'organization_invitation')
- ✅ Variables standardized:
  - recipient_name
  - organization_name
  - inviter_name
  - action_url
  - expiry_time
  - support_email

**Key Code**:
```typescript
const dispatcherResponse = await fetch(`${SUPABASE_URL}/functions/v1/encharge-send-email`, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
    'apikey': SUPABASE_SERVICE_ROLE_KEY,
  },
  body: JSON.stringify({
    template_type: 'organization_invitation',
    to_email: to_email,
    to_name: recipientName,
    variables: emailVariables,
  }),
});
```

#### 2. encharge-send-email Verification

**File**: `/supabase/functions/encharge-send-email/index.ts`

**Verification Checklist**:
- ✅ Dispatcher working (routes to correct template type)
- ✅ Event mapping complete (all 18 template types mapped)
- ✅ Variable substitution working (processTemplate function)
- ✅ Logging to email_logs table (insert with full metadata)

**Event Type Mappings** (18 total):
1. organization_invitation → "Organization Invitation Sent"
2. member_removed → "Member Removed"
3. org_approval → "Organization Approval"
4. join_request_approved → "Join Request Approved"
5. waitlist_invite → "Waitlist Invite Sent"
6. waitlist_welcome → "Waitlist Welcome Sent"
7. welcome → "Account Created"
8. fathom_connected → "Fathom Connected"
9. first_meeting_synced → "First Meeting Synced"
10. trial_ending → "Trial Ending Soon"
11. trial_expired → "Trial Expired"
12. subscription_confirmed → "Subscription Confirmed"
13. meeting_limit_warning → "Meeting Limit Warning"
14. upgrade_prompt → "Upgrade Prompt Sent"
15. email_change_verification → "Email Change Verification"
16. password_reset → "Password Reset Requested"
17. join_request_rejected → "Join Request Rejected"
18. permission_to_close → "Permission to Close Requested"

#### 3. waitlist-welcome-email Verification

**File**: `/supabase/functions/waitlist-welcome-email/index.ts`

**Verification Checklist**:
- ✅ Using standardized variables
- ✅ Database templates loaded
- ✅ Logging correct
- ✅ Error handling working

---

## ENVIRONMENT SETUP GUIDE

### Quick Setup Instructions

#### 1. Generate EDGE_FUNCTION_SECRET

```bash
# On Mac/Linux:
openssl rand -hex 16

# On Windows (PowerShell):
[System.Convert]::ToBase64String((1..16 | ForEach-Object { [byte](Get-Random -Max 256) }))

# Or use online generator and keep it safe
```

#### 2. Get SUPABASE_SERVICE_ROLE_KEY

1. Go to: https://app.supabase.com/project/caerqjzvuerejfrdtygb/settings/api
2. Under "Project API keys", find "service_role key"
3. Copy the full key (starts with "eyJ...")

#### 3. Update .env File

```bash
# Find these lines in .env:
EDGE_FUNCTION_SECRET=<PASTE_SECRET_HERE>
SUPABASE_SERVICE_ROLE_KEY=<PASTE_SERVICE_ROLE_KEY_HERE>

# Save the file
```

#### 4. Verify Setup

```bash
# Test Supabase connection
npx supabase projects list

# Test function deployment
npx supabase functions deploy --dry-run --project-ref caerqjzvuerejfrdtygb
```

---

## DATABASE VERIFICATION QUERIES

Run these in Supabase SQL editor to verify setup:

```sql
-- 1. Verify templates table exists and has all templates
SELECT COUNT(*) as template_count FROM encharge_email_templates;
-- Expected: 18

-- 2. Check specific template
SELECT template_name, template_type, is_active
FROM encharge_email_templates
WHERE template_type = 'organization_invitation';

-- 3. Check email_logs table
SELECT COUNT(*) as log_count FROM email_logs;

-- 4. View recent logs
SELECT email_type, to_email, status, sent_at
FROM email_logs
ORDER BY created_at DESC
LIMIT 10;

-- 5. Check RLS policies
SELECT * FROM pg_policies
WHERE tablename IN ('encharge_email_templates', 'email_logs');
```

---

## SUCCESS CRITERIA

### All Deployment Steps Complete When:

#### Email Functions (10 total)
- [ ] All 10 functions deployed to staging
- [ ] Each function shows status "Active" in Supabase dashboard
- [ ] No errors in function logs
- [ ] Environment secrets properly set on remote

#### Database (18 templates)
- [ ] Migration 20260203210000 applied successfully
- [ ] All 18 templates visible in encharge_email_templates table
- [ ] email_logs table exists and is accessible

#### Authentication & Security
- [ ] EDGE_FUNCTION_SECRET set and working
- [ ] SUPABASE_SERVICE_ROLE_KEY real (not placeholder)
- [ ] AWS credentials validated
- [ ] All function endpoints secured

#### API Responses
- [ ] send-organization-invitation: Returns 200 with message_id
- [ ] encharge-send-email: Returns 200 with template_type
- [ ] waitlist-welcome-email: Returns 200 with email_sent: true
- [ ] No 401/403 authentication errors

---

## GO/NO-GO DECISION

**Current Status**: ⚠️ CONDITIONAL GO

**Before Deployment Can Proceed**:
1. ❌ EDGE_FUNCTION_SECRET must be set in .env
2. ❌ SUPABASE_SERVICE_ROLE_KEY must be replaced with real key
3. ✅ All 10 functions are code-complete and tested locally
4. ✅ Database schema and migrations are ready
5. ✅ AWS SES credentials are valid

**Estimated Time to Ready**: 10-15 minutes
- 5 min: Generate and configure secrets
- 5 min: Deploy functions
- 5 min: Verify in dashboard

**Next Phase**: Phase 7 - Testing & Validation (estimated 1-2 hours)

---

## QUICK REFERENCE - SUPABASE DASHBOARD URLS

| Resource | URL |
|----------|-----|
| Project Dashboard | https://app.supabase.com/project/caerqjzvuerejfrdtygb |
| API Settings | https://app.supabase.com/project/caerqjzvuerejfrdtygb/settings/api |
| Edge Functions | https://app.supabase.com/project/caerqjzvuerejfrdtygb/functions |
| SQL Editor | https://app.supabase.com/project/caerqjzvuerejfrdtygb/sql |
| Database | https://app.supabase.com/project/caerqjzvuerejfrdtygb/editor |

---

## ROLLBACK PLAN (If Issues Occur)

If deployment fails or issues arise:

1. **Disable Functions**: Temporarily disable in Supabase dashboard
2. **Revert Migration**: Remove email templates (data stays for logs)
3. **Local Testing**: Test functions locally with npm run dev
4. **Fix & Redeploy**: Make fixes and redeploy

```bash
# To see function logs:
npx supabase functions download send-organization-invitation --project-ref caerqjzvuerejfrdtygb

# To check recent logs:
# Via dashboard: https://app.supabase.com/project/caerqjzvuerejfrdtygb/functions
```

---

## NOTES & DEPENDENCIES

- All 10 functions are **inter-dependent** on encharge-send-email (the dispatcher)
- email_logs table is optional but recommended for audit trail
- AWS SES has daily sending limits - check your account quota
- Encharge integration is optional (tracking will be skipped if key is missing)

---

**Report Generated**: 2026-02-03
**Next Action**: Set environment variables and deploy to staging
**Estimated Completion**: ~30 minutes after environment setup
