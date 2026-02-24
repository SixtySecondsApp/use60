# PHASE 6 DEPLOYMENT CHECKLIST
## Email Functions to Staging - Step-by-Step Guide

**Project**: use60 - Pre & Post Meeting Command Centre
**Branch**: fix/go-live-bug-fixes
**Staging Project ID**: caerqjzvuerejfrdtygb
**Deployment Date**: 2026-02-03

---

## PRE-DEPLOYMENT: ENVIRONMENT SETUP (15 minutes)

### Step 1: Generate Secure Secret
- [ ] Open terminal in project directory
- [ ] Run: `openssl rand -hex 16` (Mac/Linux) or PowerShell equivalent (Windows)
- [ ] Copy the 32-character hex string generated
- [ ] Paste into .env file: `EDGE_FUNCTION_SECRET=<paste_here>`
- [ ] Save .env file

**Example Output**:
```
EDGE_FUNCTION_SECRET=a3f8b9c2d1e4f6g7h8i9j0k1l2m3n4o5
```

### Step 2: Get Service Role Key
- [ ] Go to: https://app.supabase.com/project/caerqjzvuerejfrdtygb/settings/api
- [ ] Find "Project API keys" section
- [ ] Locate "service_role key" (NOT "anon key")
- [ ] Click "Reveal" button
- [ ] Copy the full key (usually starts with "eyJ...")
- [ ] Paste into .env: `SUPABASE_SERVICE_ROLE_KEY=<paste_here>`
- [ ] Save .env file

**Do NOT expose this key publicly!**

### Step 3: Verify Secrets Are Set
```bash
cd "C:\Users\Media 3\Desktop\Max-Projects\sixty-sales-dashboard"
grep "EDGE_FUNCTION_SECRET" .env
grep "SUPABASE_SERVICE_ROLE_KEY" .env
```

Expected output:
```
EDGE_FUNCTION_SECRET=a3f8b9c2d1e4f6g7h8i9j0k1l2m3n4o5
SUPABASE_SERVICE_ROLE_KEY=eyJ0eXAiOiJKV1QiLCJhbGc...
```

- [ ] EDGE_FUNCTION_SECRET is set (not placeholder)
- [ ] SUPABASE_SERVICE_ROLE_KEY is set (not placeholder)
- [ ] AWS_ACCESS_KEY_ID is set: AKIA***REDACTED***
- [ ] AWS_SECRET_ACCESS_KEY is set
- [ ] AWS_REGION is set: eu-west-2

---

## DATABASE MIGRATION: CREATE EMAIL TEMPLATES (10 minutes)

### Step 4: Apply Migration via Supabase SQL Editor
- [ ] Go to: https://app.supabase.com/project/caerqjzvuerejfrdtygb/sql/new
- [ ] Open file: `/supabase/migrations/20260203210000_create_all_email_templates.sql`
- [ ] Copy entire file contents
- [ ] Paste into Supabase SQL editor
- [ ] Click "Run" button
- [ ] Verify no errors appear

**Expected Output**: "Query successful" with row count

### Step 5: Verify Templates Created
Run in SQL editor:
```sql
SELECT COUNT(*) as template_count FROM encharge_email_templates;
```

- [ ] Result shows 18 templates
- [ ] No error messages

### Step 6: Check Specific Templates
Run in SQL editor:
```sql
SELECT template_name, template_type, is_active FROM encharge_email_templates
ORDER BY template_name;
```

- [ ] All 18 templates listed (see template list below)
- [ ] is_active column = TRUE for all

**18 Email Templates Expected**:
1. organization_invitation
2. member_removed
3. org_approval
4. join_request_approved
5. waitlist_invite
6. waitlist_welcome
7. welcome
8. fathom_connected
9. first_meeting_synced
10. trial_ending
11. trial_expired
12. subscription_confirmed
13. meeting_limit_warning
14. upgrade_prompt
15. email_change_verification
16. password_reset
17. join_request_rejected
18. permission_to_close

---

## EDGE FUNCTION DEPLOYMENT (10 minutes)

### Step 7: Deploy All Functions to Staging
```bash
cd "C:\Users\Media 3\Desktop\Max-Projects\sixty-sales-dashboard"

# Deploy all functions at once
npx supabase functions deploy --project-ref caerqjzvuerejfrdtygb
```

Expected output:
```
Deploying send-organization-invitation...
Deploying send-removal-email...
Deploying encharge-send-email...
...
✓ All functions deployed successfully
```

- [ ] Command completes without errors
- [ ] All 10 functions show "✓" status

**Functions Being Deployed** (in order):
1. ✓ send-organization-invitation
2. ✓ send-removal-email
3. ✓ waitlist-welcome-email
4. ✓ org-approval-email
5. ✓ fathom-connected-email
6. ✓ first-meeting-synced-email
7. ✓ subscription-confirmed-email
8. ✓ meeting-limit-warning-email
9. ✓ permission-to-close-email
10. ✓ encharge-send-email (dispatcher)

### Step 8: Verify Deployment in Dashboard
- [ ] Go to: https://app.supabase.com/project/caerqjzvuerejfrdtygb/functions
- [ ] All 10 functions listed
- [ ] Each function has green "Active" status
- [ ] No "Error" or "Inactive" status

---

## SET ENVIRONMENT SECRETS IN SUPABASE (10 minutes)

### Step 9: Configure Secrets for Each Function
For each function listed on the dashboard:

1. Click on the function name
2. Click "Secrets" or "Environment" tab
3. Add the following secrets:

**Secrets to Add**:
```
EDGE_FUNCTION_SECRET = [your_generated_secret]
AWS_ACCESS_KEY_ID = AKIA***REDACTED***
AWS_SECRET_ACCESS_KEY = ***REDACTED***
AWS_REGION = eu-west-2
SUPABASE_URL = https://caerqjzvuerejfrdtygb.supabase.co
SUPABASE_SERVICE_ROLE_KEY = [your_service_role_key]
```

- [ ] Secrets added to send-organization-invitation
- [ ] Secrets added to send-removal-email
- [ ] Secrets added to waitlist-welcome-email
- [ ] Secrets added to org-approval-email
- [ ] Secrets added to fathom-connected-email
- [ ] Secrets added to first-meeting-synced-email
- [ ] Secrets added to subscription-confirmed-email
- [ ] Secrets added to meeting-limit-warning-email
- [ ] Secrets added to permission-to-close-email
- [ ] Secrets added to encharge-send-email (critical - dispatcher)

**Note**: EDGE_FUNCTION_SECRET must be exactly the same value everywhere.

---

## FUNCTION TESTING (10 minutes)

### Step 10: Test send-organization-invitation

**Via cURL**:
```bash
curl -X POST https://caerqjzvuerejfrdtygb.supabase.co/functions/v1/send-organization-invitation \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer a3f8b9c2d1e4f6g7h8i9j0k1l2m3n4o5" \
  -d '{
    "to_email": "test.user@example.com",
    "to_name": "Test User",
    "organization_name": "Test Organization",
    "inviter_name": "Admin User",
    "invitation_url": "https://app.use60.com/join/test-invite-code",
    "expiry_time": "7 days"
  }'
```

Expected response:
```json
{
  "success": true,
  "message_id": "...",
  "template_type": "organization_invitation"
}
```

- [ ] Response has status 200
- [ ] "success" is true
- [ ] "message_id" is populated
- [ ] "template_type" shows "organization_invitation"

### Step 11: Test encharge-send-email (Dispatcher)

**Via cURL**:
```bash
curl -X POST https://caerqjzvuerejfrdtygb.supabase.co/functions/v1/encharge-send-email \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_SERVICE_ROLE_KEY" \
  -d '{
    "template_type": "waitlist_welcome",
    "to_email": "newuser@example.com",
    "to_name": "New User",
    "variables": {
      "recipient_name": "New",
      "company_name": "Sixty",
      "action_url": "https://app.use60.com"
    }
  }'
```

Expected response:
```json
{
  "success": true,
  "message_id": "...",
  "template_type": "waitlist_welcome",
  "template_name": "waitlist_welcome",
  "event_tracked": "Waitlist Welcome Sent"
}
```

- [ ] Response has status 200
- [ ] "success" is true
- [ ] "message_id" from AWS SES is populated
- [ ] "event_tracked" shows Encharge event name

### Step 12: Check Function Logs

Go to: https://app.supabase.com/project/caerqjzvuerejfrdtygb/functions

For each function:
- [ ] Click on function name
- [ ] View "Logs" tab
- [ ] Check for any ERROR or WARN messages
- [ ] Verify recent invocations show status "OK"

**Typical log messages** (these are OK):
```
[send-organization-invitation] Delegating to encharge-send-email dispatcher
[encharge-send-email] Email sent successfully - Message ID: 010000...
```

**Error patterns to watch for** (these indicate problems):
```
401 Unauthorized - Check EDGE_FUNCTION_SECRET
403 Forbidden - Check AWS credentials
404 Not Found - Template doesn't exist, check template_type
500 Error - Check AWS SES quota or network connectivity
```

---

## VERIFICATION: DATABASE LOGGING (5 minutes)

### Step 13: Verify Email Logs

Run in SQL editor at: https://app.supabase.com/project/caerqjzvuerejfrdtygb/sql/new

```sql
-- Check if email_logs table exists
SELECT table_name FROM information_schema.tables
WHERE table_schema = 'public' AND table_name = 'email_logs';

-- View recent logs
SELECT email_type, to_email, status, created_at
FROM email_logs
ORDER BY created_at DESC
LIMIT 5;

-- Check RLS policies
SELECT * FROM pg_policies
WHERE tablename IN ('encharge_email_templates', 'email_logs');
```

- [ ] email_logs table exists
- [ ] Contains recent email records
- [ ] status column shows "sent"
- [ ] RLS policies are in place

---

## FINAL VERIFICATION: FUNCTION HEALTH STATUS

### Step 14: Verify All Functions Active

Dashboard: https://app.supabase.com/project/caerqjzvuerejfrdtygb/functions

Create a checklist for each function:

**send-organization-invitation**
- [ ] Status: Active (green)
- [ ] Last invoked: Recent
- [ ] Error rate: 0%

**send-removal-email**
- [ ] Status: Active (green)
- [ ] Last invoked: Recent or Never (OK)
- [ ] Error rate: 0% or N/A

**waitlist-welcome-email**
- [ ] Status: Active (green)
- [ ] Last invoked: Recent or Never (OK)
- [ ] Error rate: 0% or N/A

**org-approval-email**
- [ ] Status: Active (green)
- [ ] Last invoked: Recent or Never (OK)
- [ ] Error rate: 0% or N/A

**fathom-connected-email**
- [ ] Status: Active (green)
- [ ] Last invoked: Recent or Never (OK)
- [ ] Error rate: 0% or N/A

**first-meeting-synced-email**
- [ ] Status: Active (green)
- [ ] Last invoked: Recent or Never (OK)
- [ ] Error rate: 0% or N/A

**subscription-confirmed-email**
- [ ] Status: Active (green)
- [ ] Last invoked: Recent or Never (OK)
- [ ] Error rate: 0% or N/A

**meeting-limit-warning-email**
- [ ] Status: Active (green)
- [ ] Last invoked: Recent or Never (OK)
- [ ] Error rate: 0% or N/A

**permission-to-close-email**
- [ ] Status: Active (green)
- [ ] Last invoked: Recent or Never (OK)
- [ ] Error rate: 0% or N/A

**encharge-send-email (Dispatcher)**
- [ ] Status: Active (green)
- [ ] Last invoked: Recent (should be frequently used)
- [ ] Error rate: 0%

---

## GO/NO-GO DECISION

### Deployment Success Criteria

**Code Deployment**:
- [ ] All 10 functions deployed to staging
- [ ] All functions show "Active" status
- [ ] No deployment errors in logs
- [ ] No 401/403 authentication errors

**Database**:
- [ ] Migration applied successfully
- [ ] 18 templates created and active
- [ ] email_logs table accessible
- [ ] All required columns present

**Secrets & Configuration**:
- [ ] EDGE_FUNCTION_SECRET set correctly
- [ ] SUPABASE_SERVICE_ROLE_KEY is real (not placeholder)
- [ ] AWS credentials configured
- [ ] All secrets set in Supabase dashboard

**API Testing**:
- [ ] send-organization-invitation returns 200
- [ ] encharge-send-email returns 200 with message_id
- [ ] All functions return correct response format
- [ ] No errors in recent logs

**Performance**:
- [ ] Functions respond within 5 seconds
- [ ] No timeout errors
- [ ] AWS SES requests succeed
- [ ] Database queries complete quickly

### Decision Matrix

| Criteria | Pass | Fail |
|----------|------|------|
| All 10 functions deployed | ✅ GO | ❌ STOP |
| No authentication errors | ✅ GO | ❌ STOP |
| 18 templates in database | ✅ GO | ❌ STOP |
| Test emails sent successfully | ✅ GO | ⚠️ FIX TESTS |
| Logs show correct tracking | ✅ GO | ⚠️ MONITOR |

### Final Status

**GO Decision When**:
- All 3 STOP criteria are ✅ GO
- At least 2 of 2 ⚠️ criteria are verified

**NO-GO Decision When**:
- Any STOP criteria is ❌ FAIL
- Cannot generate or set secrets
- AWS credentials are invalid

---

## TROUBLESHOOTING QUICK REFERENCE

### Issue: 401 Unauthorized

**Symptoms**:
```
"error": "Unauthorized: invalid credentials"
```

**Cause**: EDGE_FUNCTION_SECRET doesn't match

**Fix**:
1. Verify EDGE_FUNCTION_SECRET in .env
2. Verify same secret in Supabase dashboard
3. Redeploy function: `npx supabase functions deploy send-organization-invitation --project-ref caerqjzvuerejfrdtygb`

### Issue: 404 Not Found (Template)

**Symptoms**:
```
"error": "Template not found: organization_invitation"
```

**Cause**: Migration not applied or template_type mismatch

**Fix**:
1. Re-run migration in SQL editor
2. Check template_type spelling matches exactly
3. Verify 18 templates in encharge_email_templates table

### Issue: AWS SES Error (503/550)

**Symptoms**:
```
"error": "SES error: 550 - Invalid email address"
```

**Cause**:
- Invalid email address format
- Sender email not verified in SES
- SES daily limit exceeded

**Fix**:
1. Use valid email format (user@example.com)
2. Verify staging@sixtyseconds.ai is verified in AWS SES console
3. Check SES quota: https://console.aws.amazon.com/ses/

### Issue: Function Timeout

**Symptoms**:
```
Error: Task timed out after 30 seconds
```

**Cause**: Function taking too long (AWS SES slow response, etc.)

**Fix**:
1. Check AWS SES is responding
2. Increase function timeout in supabase/config.toml
3. Check database query performance
4. Verify network connectivity

### Issue: CORS Error

**Symptoms**:
```
Access-Control-Allow-Origin error
```

**Cause**: Browser making cross-origin request

**Fix**:
1. Use Bearer token in Authorization header
2. All functions have CORS headers configured
3. Use POST method (not GET)

---

## POST-DEPLOYMENT: NEXT STEPS

### After Checklist Completion ✅

Once all checks pass:

1. **Commit Changes**:
   ```bash
   git add .env supabase/functions supabase/migrations .sixty/
   git commit -m "feat: Deploy email functions to staging (Phase 6)"
   git push origin fix/go-live-bug-fixes
   ```

2. **Create PR** (if needed):
   ```bash
   gh pr create --title "feat: Deploy email functions to staging" \
     --body "All 10 email functions deployed to staging project"
   ```

3. **Update Status**:
   - Update `.sixty/PHASE_6_DEPLOYMENT_PLAN.md` with deployment timestamp
   - Mark Phase 6 as COMPLETE
   - Plan Phase 7: Testing & Validation

4. **Phase 7 Testing** (Next):
   - Create test cases for each email type
   - Test with real email addresses (use temporary inbox)
   - Verify email content and styling
   - Check deliverability in spam folders
   - Verify email_logs tracking
   - Estimated duration: 1-2 hours

---

## SIGN-OFF

**Deployment Completed By**: ___________________
**Date**: ___________________
**Time**: ___________________

**Verified By**: ___________________
**Date**: ___________________

**Approved for Phase 7**: ___________________
**Date**: ___________________

---

**Total Estimated Time**: ~45 minutes
- Environment setup: 15 min
- Database migration: 10 min
- Function deployment: 10 min
- Testing & verification: 10 min

**All systems GO? ✅ Ready for Phase 7**
