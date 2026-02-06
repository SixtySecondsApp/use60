# PHASE 6 ACTION ITEMS & GO-LIVE READINESS
## Email Functions Staging Deployment - Next Steps

**Date**: 2026-02-03
**Status**: CONDITIONAL GO - Environment variables needed
**Estimated Duration to Completion**: 30-40 minutes

---

## CRITICAL ACTION ITEMS (BLOCKING DEPLOYMENT)

### ACTION 1: Generate and Configure EDGE_FUNCTION_SECRET ⚠️ CRITICAL

**Current Status**: ❌ NOT SET (blocking)

**What to Do**:
1. Open terminal in project directory
2. Run command to generate random secret:
   ```bash
   # Mac/Linux:
   openssl rand -hex 16

   # Windows PowerShell:
   [System.Convert]::ToBase64String((1..16 | ForEach-Object { [byte](Get-Random -Max 256) }))
   ```
3. Copy the 32-character output
4. Edit `.env` file and replace:
   ```env
   # BEFORE:
   # EDGE_FUNCTION_SECRET=... (not set)

   # AFTER:
   EDGE_FUNCTION_SECRET=a3f8b9c2d1e4f6g7h8i9j0k1l2m3n4o5
   ```
5. Save `.env` file
6. Verify by running: `grep "EDGE_FUNCTION_SECRET" .env`

**Expected Output**:
```
EDGE_FUNCTION_SECRET=a3f8b9c2d1e4f6g7h8i9j0k1l2m3n4o5
```

**Timeline**: 2-3 minutes

**Verification**:
```bash
cd "C:\Users\Media 3\Desktop\Max-Projects\sixty-sales-dashboard"
grep "EDGE_FUNCTION_SECRET=" .env | grep -v "="
# Should show: EDGE_FUNCTION_SECRET=<value>
```

---

### ACTION 2: Get and Set SUPABASE_SERVICE_ROLE_KEY ⚠️ CRITICAL

**Current Status**: ❌ PLACEHOLDER (needs real value)

**What to Do**:
1. Go to Supabase Dashboard: https://app.supabase.com/project/caerqjzvuerejfrdtygb/settings/api
2. Find section "Project API keys"
3. Locate "service_role key" (should say "Service role key - Use with caution")
4. Click "Reveal" button to show the key
5. Copy the entire key (very long, starts with "eyJ0eXAi...")
6. Edit `.env` file and replace:
   ```env
   # BEFORE:
   SUPABASE_SERVICE_ROLE_KEY=YOUR_STAGING_SERVICE_ROLE_KEY_HERE

   # AFTER:
   SUPABASE_SERVICE_ROLE_KEY=eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9...
   ```
7. Save `.env` file
8. Verify by running: `grep "SUPABASE_SERVICE_ROLE_KEY" .env`

**Expected Pattern**:
- Starts with: `eyJ0eXAi`
- Contains: Multiple dots (jwt has 3 parts: header.payload.signature)
- Length: 200+ characters

**Important**: ⚠️ This is a sensitive credential. Keep it safe and never commit it to git.

**Timeline**: 3-5 minutes

**Verification**:
```bash
grep "SUPABASE_SERVICE_ROLE_KEY=" .env | wc -c
# Should show length > 200
```

---

### ACTION 3: Verify All Other Environment Variables

**Status**: ✅ Already Set

**What to Check**:
```bash
cd "C:\Users\Media 3\Desktop\Max-Projects\sixty-sales-dashboard"

echo "Checking required environment variables..."
echo ""
echo "AWS_REGION:" $(grep "^AWS_REGION=" .env)
echo "AWS_ACCESS_KEY_ID:" $(grep "^AWS_ACCESS_KEY_ID=" .env | cut -d= -f1)=***
echo "AWS_SECRET_ACCESS_KEY:" $(grep "^AWS_SECRET_ACCESS_KEY=" .env | cut -d= -f1)=***
echo "SUPABASE_URL:" $(grep "^SUPABASE_URL=" .env)
echo "SES_FROM_EMAIL:" $(grep "^SES_FROM_EMAIL=" .env)
```

**Expected Results**:
- ✅ AWS_REGION=eu-west-2
- ✅ AWS_ACCESS_KEY_ID=AKIA***REDACTED***
- ✅ AWS_SECRET_ACCESS_KEY=***REDACTED***
- ✅ SUPABASE_URL=https://caerqjzvuerejfrdtygb.supabase.co
- ✅ SES_FROM_EMAIL=staging@sixtyseconds.ai

**Timeline**: 1 minute

---

## STANDARD ACTION ITEMS (DEPLOYMENT SEQUENCE)

### ACTION 4: Apply Database Migration

**After** Actions 1-2 are complete.

**Step 1: Open SQL Editor**
- Go to: https://app.supabase.com/project/caerqjzvuerejfrdtygb/sql/new
- This opens a new SQL editor tab

**Step 2: Copy Migration SQL**
- Open file: `C:\Users\Media 3\Desktop\Max-Projects\sixty-sales-dashboard\supabase\migrations\20260203210000_create_all_email_templates.sql`
- Copy the entire file contents (all ~23KB)

**Step 3: Paste and Execute**
- Paste entire contents into Supabase SQL editor
- Click "Run" button
- Wait for completion

**Step 4: Verify Success**
- Should see: "Query successful" message
- No error messages

**Step 5: Verify Templates Created**
In the same SQL editor, run:
```sql
SELECT COUNT(*) as total_templates FROM encharge_email_templates;
```

Expected result: `total_templates: 18`

**Timeline**: 5 minutes

---

### ACTION 5: Deploy All 10 Email Functions

**After** Actions 1-4 are complete.

**Command**:
```bash
cd "C:\Users\Media 3\Desktop\Max-Projects\sixty-sales-dashboard"
npx supabase functions deploy --project-ref caerqjzvuerejfrdtygb
```

**Expected Output**:
```
Deploying function send-organization-invitation...
Deploying function send-removal-email...
Deploying function waitlist-welcome-email...
Deploying function org-approval-email...
Deploying function fathom-connected-email...
Deploying function first-meeting-synced-email...
Deploying function subscription-confirmed-email...
Deploying function meeting-limit-warning-email...
Deploying function permission-to-close-email...
Deploying function encharge-send-email...

✓ All functions deployed successfully
```

**If Errors Occur**:
```bash
# Try deploying individually for more details:
npx supabase functions deploy send-organization-invitation --project-ref caerqjzvuerejfrdtygb
# Check the error output

# Or try with verbose logging:
npx supabase functions deploy --project-ref caerqjzvuerejfrdtygb --debug
```

**Timeline**: 5-10 minutes

---

### ACTION 6: Set Environment Secrets in Supabase Dashboard

**After** Action 5 completes.

**Critical**: All 10 functions need the same secrets set.

**For Each Function**:

1. Go to: https://app.supabase.com/project/caerqjzvuerejfrdtygb/functions
2. Click on function name (start with "send-organization-invitation")
3. Look for "Secrets" or "Environment" tab/section
4. Add/update these secrets:

**Required Secrets**:
```
EDGE_FUNCTION_SECRET = [the value you generated in Action 1]
AWS_ACCESS_KEY_ID = AKIA***REDACTED***
AWS_SECRET_ACCESS_KEY = ***REDACTED***
AWS_REGION = eu-west-2
SUPABASE_URL = https://caerqjzvuerejfrdtygb.supabase.co
SUPABASE_SERVICE_ROLE_KEY = [the key you got in Action 2]
```

**Functions to Update**:
- [ ] send-organization-invitation
- [ ] send-removal-email
- [ ] waitlist-welcome-email
- [ ] org-approval-email
- [ ] fathom-connected-email
- [ ] first-meeting-synced-email
- [ ] subscription-confirmed-email
- [ ] meeting-limit-warning-email
- [ ] permission-to-close-email
- [ ] encharge-send-email

**Timeline**: 10-15 minutes (1-2 minutes per function)

---

### ACTION 7: Verify Function Health Status

**After** Action 6 completes.

**Step 1: Check Dashboard**
- Go to: https://app.supabase.com/project/caerqjzvuerejfrdtygb/functions
- Verify each function shows green "Active" status
- Check "Last invoked" time (should show recent or "Never" if new)

**Step 2: Check Function Logs**
- For each function, click to expand
- Click on "Logs" tab
- Should show recent invocations (might be empty if not tested yet)
- Look for any ERROR or critical issues

**Step 3: Test Each Function**

**Test send-organization-invitation**:
```bash
curl -X POST https://caerqjzvuerejfrdtygb.supabase.co/functions/v1/send-organization-invitation \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer a3f8b9c2d1e4f6g7h8i9j0k1l2m3n4o5" \
  -d '{
    "to_email": "test.user@gmail.com",
    "to_name": "Test User",
    "organization_name": "Test Org",
    "inviter_name": "Admin",
    "invitation_url": "https://app.use60.com/join/test"
  }'
```

Expected response:
```json
{
  "success": true,
  "message_id": "0000014e-...",
  "template_type": "organization_invitation"
}
```

**Test encharge-send-email (Dispatcher)**:
```bash
curl -X POST https://caerqjzvuerejfrdtygb.supabase.co/functions/v1/encharge-send-email \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_SERVICE_ROLE_KEY" \
  -d '{
    "template_type": "waitlist_welcome",
    "to_email": "test@gmail.com",
    "to_name": "Test",
    "variables": {
      "recipient_name": "Test",
      "company_name": "Sixty"
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

**Timeline**: 5-10 minutes

---

### ACTION 8: Verify Email Logs Table

**Status**: Verify logs are being recorded.

**Run in SQL Editor**:
```sql
-- Check if email_logs table exists
SELECT table_name FROM information_schema.tables
WHERE table_schema = 'public' AND table_name = 'email_logs';

-- View recent email logs (from the tests above)
SELECT email_type, to_email, status, created_at
FROM email_logs
ORDER BY created_at DESC
LIMIT 10;

-- Check column structure
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'email_logs'
ORDER BY ordinal_position;
```

**Expected Results**:
- email_logs table exists
- Shows test emails from Actions 7 tests
- status = 'sent'
- metadata contains message_id from AWS SES

**Timeline**: 3 minutes

---

## DOCUMENTATION & HANDOFF

### ACTION 9: Create Deployment Summary

**After** all technical actions complete.

**Create file**: `.sixty/PHASE_6_DEPLOYMENT_COMPLETE.md`

**Contents**:
```markdown
# PHASE 6 DEPLOYMENT COMPLETE

## Deployment Summary
- Date: 2026-02-03
- All 10 email functions deployed to staging
- 18 email templates created
- All systems operational

## Functions Deployed
1. send-organization-invitation ✅
2. send-removal-email ✅
3. waitlist-welcome-email ✅
4. org-approval-email ✅
5. fathom-connected-email ✅
6. first-meeting-synced-email ✅
7. subscription-confirmed-email ✅
8. meeting-limit-warning-email ✅
9. permission-to-close-email ✅
10. encharge-send-email ✅

## Verification Status
- All functions active in dashboard ✅
- Secrets configured ✅
- Database migration applied ✅
- Email logs recording ✅
- Test emails sent successfully ✅

## Next Phase
Phase 7: Testing & Validation
- Test email delivery
- Verify email content
- Check spam folders
- Monitor error rates
```

**Timeline**: 5 minutes

---

### ACTION 10: Commit Changes (Optional)

**Status**: Only after all tests pass.

**Commands**:
```bash
cd "C:\Users\Media 3\Desktop\Max-Projects\sixty-sales-dashboard"

# Stage changes
git add .env supabase/functions supabase/migrations .sixty/

# Create commit
git commit -m "feat: Deploy email functions to staging (Phase 6)

- Deploy 10 email functions to staging environment
- Create 18 standardized email templates
- Configure AWS SES and Encharge tracking
- Set up edge function authentication
- Enable email logging and audit trail"

# Push to branch
git push origin fix/go-live-bug-fixes
```

**Timeline**: 2-3 minutes

---

## SUMMARY: COMPLETE EXECUTION TIMELINE

| Step | Action | Duration | Status |
|------|--------|----------|--------|
| 1 | Generate EDGE_FUNCTION_SECRET | 2 min | ⚠️ TODO |
| 2 | Get SUPABASE_SERVICE_ROLE_KEY | 3 min | ⚠️ TODO |
| 3 | Verify environment variables | 1 min | ⚠️ TODO |
| 4 | Apply database migration | 5 min | Pending env |
| 5 | Deploy 10 functions | 5-10 min | Pending env |
| 6 | Set secrets in Supabase | 10-15 min | Pending env |
| 7 | Verify function health | 5-10 min | Pending env |
| 8 | Verify email logs | 3 min | Pending env |
| 9 | Create deployment summary | 5 min | Pending env |
| 10 | Commit changes (optional) | 2-3 min | Pending env |
| **TOTAL** | | **~40-50 min** | Blocked on env |

---

## BLOCKERS & DEPENDENCIES

### Current Blockers

**❌ EDGE_FUNCTION_SECRET not set**
- Blocks: Actions 4-8
- Estimated fix: 2 minutes

**❌ SUPABASE_SERVICE_ROLE_KEY is placeholder**
- Blocks: Actions 4-8
- Estimated fix: 3-5 minutes

### No Other Blockers

All code is ready. All migrations are ready. Database schema is complete. Just need environment configuration!

---

## SUCCESS CRITERIA - GO/NO-GO CHECKLIST

### Before Deployment (NOW)
- [ ] EDGE_FUNCTION_SECRET generated and in .env
- [ ] SUPABASE_SERVICE_ROLE_KEY real (not placeholder) and in .env
- [ ] AWS credentials verified
- [ ] All 10 function directories exist

### After Deployment
- [ ] Migration applied (18 templates created)
- [ ] All 10 functions show Active in dashboard
- [ ] No errors in Supabase function logs
- [ ] Test send-organization-invitation returns 200
- [ ] Test encharge-send-email returns 200 with message_id
- [ ] Email logs table has test records
- [ ] All secrets set in Supabase dashboard

### GO Decision When
- ✅ All "Before" items complete
- ✅ All "After" items verified
- ✅ No blocking errors

### NO-GO Decision When
- ❌ Cannot set environment variables
- ❌ Deployment fails with errors
- ❌ Functions return 401/403 errors
- ❌ Templates not created

---

## ROLLBACK PLAN

If anything goes wrong:

1. **Functions**: Disable in Supabase dashboard (can be re-enabled)
2. **Database**: Templates can be deleted without affecting logs
3. **Secrets**: Can be updated and functions redeployed
4. **Local**: Can always go back and re-test locally with `npm run dev`

**Rollback Time**: < 5 minutes for any change

---

## PHASE 7 PREVIEW (After This Phase)

Once Phase 6 deployment is complete, Phase 7 will involve:
- Testing email delivery to real mailboxes
- Verifying email content and styling
- Checking spam folder placement
- Monitoring error rates
- Performance testing
- User acceptance testing

**Estimated Duration**: 1-2 hours

---

## QUESTIONS OR ISSUES?

**Reference Documents**:
1. PHASE_6_DEPLOYMENT_PLAN.md - Detailed plan and context
2. PHASE_6_DEPLOYMENT_CHECKLIST.md - Step-by-step checklist
3. PHASE_6_TECHNICAL_STATUS.md - Technical implementation details

**Key Resources**:
- Supabase Project: https://app.supabase.com/project/caerqjzvuerejfrdtygb
- Functions Dashboard: https://app.supabase.com/project/caerqjzvuerejfrdtygb/functions
- API Settings: https://app.supabase.com/project/caerqjzvuerejfrdtygb/settings/api

---

## EXECUTION START

**Ready to begin Phase 6 deployment?**

**Next Action**: Complete ACTION 1 (Generate EDGE_FUNCTION_SECRET)

**Estimated Total Time**: 40-50 minutes from start to finish

**Current Time**: 2026-02-03 (Time TBD)
**Expected Completion**: 2026-02-03 (Time TBD + 50 min)

---

**Report Prepared**: 2026-02-03
**Status**: READY FOR EXECUTION
**Next Review**: After Action 8 (Verify email logs)
