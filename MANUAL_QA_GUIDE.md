# Onboarding V2 Manual QA Testing Guide

This guide provides step-by-step instructions for manually testing all three onboarding V2 paths in the staging environment.

## Test Environment Setup

### Credentials
- **Email**: `max.parish501@gmail.com`
- **Password**: `NotTesting@1`
- **Staging URL**: https://staging.use60.com (or your staging environment)

### Test Data Available
The staging environment has been pre-configured with:
- **ACME Corp** organization with domain `@acme-corp.com` (for auto-join testing)
- **Example Company** organization with domain matching capabilities (for personal email testing)
- Test enrichment data available

## Path 1: Corporate Email Auto-Join

### Objective
Verify that business email users are automatically joined to their organization based on email domain matching.

### Acceptance Criteria
- Business email (@acme-corp.com) is detected on signup
- User is automatically joined to ACME Corp org
- Enrichment data is loaded
- Skills configuration displayed
- User can complete onboarding and reach dashboard
- onboarding_step marked as 'complete' in DB

### Step-by-Step Instructions

1. **Navigate to Onboarding**
   - Go to staging environment onboarding page
   - Click "Sign Up"

2. **Enter Corporate Email**
   - Email: `test.user1@acme-corp.com`
   - Password: Any valid password (e.g., `TestPassword123!`)
   - Confirm Password: Same as above
   - Click Sign Up

3. **Verify Auto-Join**
   - **Expected**: Page should proceed directly to enrichment_loading step (no website_input)
   - **Verify**: Organization name "ACME Corp" visible in current org context
   - **Screenshot**: Capture enrichment loading page

4. **Wait for Enrichment Completion**
   - Enrichment loading should show progress (1-5 minutes)
   - **Expected**: Enrichment completes with company data
   - **Screenshot**: Capture enrichment results with company information

5. **Skills Configuration**
   - Should see 5 skill cards: Lead Qualification, Lead Enrichment, Brand Voice, Objections, ICP
   - Click "Skip All Skills" or configure one skill
   - Click "Complete" or "Next"
   - **Screenshot**: Capture skills config step

6. **Verify Dashboard Access**
   - **Expected**: Redirected to /dashboard
   - **Verify**: Dashboard loads successfully
   - **Verify**: Org switcher shows "ACME Corp" as active org
   - **Screenshot**: Capture dashboard with org switcher

7. **Database Verification** (If DB access available)
   - Query: `SELECT onboarding_step, completed_at FROM user_onboarding_progress WHERE user_id = '<user_id>'`
   - **Expected**: onboarding_step = 'complete', completed_at is set
   - Query: `SELECT role FROM organization_memberships WHERE org_id = '<org_id>' AND user_id = '<user_id>'`
   - **Expected**: role = 'member', member_status = 'active'

### Expected Outcomes
- [ ] Email detected as business domain
- [ ] Auto-joined to ACME Corp
- [ ] Enrichment loaded with company data
- [ ] Skills config displayed
- [ ] Dashboard accessible
- [ ] onboarding_progress marked complete

### Issues to Report
- Auto-join doesn't occur for business email
- Enrichment times out or fails
- Skills config has missing/broken UI
- Cannot access dashboard
- onboarding_progress not marked complete

---

## Path 2: Personal Email with Website Input

### Objective
Verify that personal email users can enter a company website and join via request if org exists.

### Acceptance Criteria
- Personal email (gmail.com) goes to website_input step
- Website input validation works
- Org matching shows with confidence scores
- Join request created successfully
- Pending approval page displayed
- Auto-polling for approval works
- Can approve via admin and redirect to dashboard

### Step-by-Step Instructions

1. **Navigate to Onboarding**
   - Go to staging environment onboarding page
   - Click "Sign Up"

2. **Enter Personal Email**
   - Email: `test.personal@gmail.com`
   - Password: `TestPassword123!`
   - Confirm Password: Same
   - Click Sign Up

3. **Verify Website Input Step**
   - **Expected**: Page shows "Enter your company website" step
   - Look for input field with placeholder like "example.com" or "www.company.com"
   - **Screenshot**: Capture website input page

4. **Enter Company Website**
   - Website: `https://example-company.com`
   - Click "Submit" or "Continue" or "Next"
   - **Expected**: Page processes domain extraction and searches for matching orgs
   - **Wait**: 5-10 seconds for fuzzy matching to complete

5. **Verify Organization Selection**
   - **Expected**: Either see:
     - Organization selection step with 1-3 org options, OR
     - Directly proceed to pending approval (if single strong match)

   - **If organization selection**:
     - Look for confidence scores (e.g., "95% match", "75% match")
     - Click on preferred organization
     - **Screenshot**: Capture org selection with confidence scores

   - **Expected next step**: Pending approval page

6. **Verify Pending Approval Page**
   - **Expected**: Page shows "Waiting for approval from organization admins"
   - Should show organization name
   - Should show request submission time
   - **Screenshot**: Capture pending approval page
   - Look for "Withdraw Request" button (if available)

7. **Approve Join Request** (Admin Action Required)
   - Contact admin or use admin panel to approve the join request
   - OR: Wait for auto-approval if configured (usually auto-approves in test)
   - Pending approval page should auto-refresh every 30 seconds

8. **Verify Approval Redirect**
   - After approval, page should automatically redirect to dashboard
   - **Expected**: No redirect loop, direct access to dashboard
   - **Screenshot**: Capture dashboard after approval

9. **Verify Membership**
   - Check org switcher shows the joined org
   - **Screenshot**: Capture org switcher with new org

10. **Database Verification** (If available)
    - Query: `SELECT status FROM organization_join_requests WHERE user_id = '<user_id>'`
    - **Expected**: status = 'approved'
    - Query: `SELECT member_status FROM organization_memberships WHERE user_id = '<user_id>'`
    - **Expected**: member_status = 'active'

### Expected Outcomes
- [ ] Personal email detected and goes to website_input
- [ ] Website validation works
- [ ] Org matching displays with confidence scores
- [ ] Join request created
- [ ] Pending approval page shown
- [ ] Auto-polling detects approval
- [ ] Redirects to dashboard without loop
- [ ] Member status set to active

### Issues to Report
- Website input step doesn't appear
- Org matching fails or shows irrelevant orgs
- Confidence scores not displayed
- Join request creation fails
- Stuck on pending approval page
- Redirect loop between onboarding and dashboard

---

## Path 3: Personal Email with Q&A Fallback

### Objective
Verify that personal email users without a website can complete Q&A form to create an organization.

### Acceptance Criteria
- Personal email goes to website_input step
- "I don't have a website" option available
- Q&A form displays with all 6 fields
- Form submission creates new organization
- Enrichment data generated from Q&A
- Skills config displayed
- Dashboard accessible
- New org shows in org switcher

### Step-by-Step Instructions

1. **Navigate to Onboarding**
   - Go to staging environment onboarding page
   - Click "Sign Up"

2. **Enter Personal Email**
   - Email: `test.qa@yahoo.com`
   - Password: `TestPassword123!`
   - Confirm Password: Same
   - Click Sign Up

3. **Reach Website Input Step**
   - **Expected**: Website input step displays
   - **Screenshot**: Capture website input page

4. **Click "I Don't Have a Website"**
   - Look for button/link: "I don't have a website", "Skip website", "Enter details manually", etc.
   - Click it
   - **Expected**: Page transitions to Q&A form

5. **Verify Q&A Form**
   - **Expected**: Form with 6 input fields:
     1. Company Name
     2. Company Description
     3. Industry
     4. Target Customers
     5. Main Products/Services
     6. Competitors
   - **Screenshot**: Capture Q&A form

6. **Fill Q&A Form**
   - **Company Name**: "Test Startup Inc"
   - **Company Description**: "We build innovative software solutions for enterprise customers"
   - **Industry**: "Software/Technology/SaaS"
   - **Target Customers**: "Mid-market enterprise customers with 100-1000 employees"
   - **Main Products**: "Cloud platform for data analytics and insights"
   - **Competitors**: "Datadog, Splunk, New Relic, Elastic"
   - **Screenshot**: Capture filled Q&A form

7. **Submit Q&A Form**
   - Click "Submit", "Continue", "Next", or similar button
   - **Expected**: Page transitions to enrichment_loading step
   - **Screenshot**: Capture enrichment loading

8. **Wait for Enrichment**
   - **Expected**: Enrichment completes 1-5 minutes
   - Should generate AI insights from Q&A data
   - **Screenshot**: Capture enrichment results

9. **Skills Configuration**
   - **Expected**: 5 skill cards display
   - Configure skills or click "Skip All Skills"
   - **Screenshot**: Capture skills config

10. **Reach Dashboard**
    - **Expected**: Redirect to /dashboard
    - Dashboard loads without errors
    - **Screenshot**: Capture dashboard

11. **Verify New Organization**
    - Click org switcher
    - **Expected**: "Test Startup Inc" (or your company name) appears in org list
    - Should be the active org
    - **Screenshot**: Capture org switcher with new org

12. **Database Verification** (If available)
    - Query: `SELECT name FROM organizations WHERE company_domain = 'test-startup-inc' OR name LIKE '%Test Startup%'`
    - **Expected**: New organization exists
    - Query: `SELECT member_status, role FROM organization_memberships WHERE user_id = '<user_id>'`
    - **Expected**: member_status = 'active', role = 'owner' (user owns newly created org)

### Expected Outcomes
- [ ] Website input step displays "no website" option
- [ ] Q&A form appears with 6 fields
- [ ] All Q&A fields fillable
- [ ] Form submits successfully
- [ ] Enrichment processes Q&A data
- [ ] Skills config appears
- [ ] Dashboard accessible
- [ ] New org in switcher
- [ ] User is owner of new org

### Issues to Report
- No "don't have website" option
- Q&A form missing fields
- Form validation too strict
- Q&A submission fails
- Enrichment doesn't process Q&A data
- New org not created
- User not set as owner

---

## Common Issues & Troubleshooting

### Page Stuck on Enrichment Loading
- **Symptom**: Enrichment loading page shows for >10 minutes
- **Action**: Check browser console for errors
- **Expected**: Enrichment completes within 5 minutes
- **Workaround**: Click "Enter details manually" if available

### Redirect Loop (Onboarding ↔ Dashboard)
- **Symptom**: Pages redirect back and forth
- **Cause**: onboarding_progress not marked complete
- **Action**: Check DB that onboarding_step = 'complete'
- **Report**: If persistent, this is a blocker bug

### Org Doesn't Appear in Switcher
- **Symptom**: User completed onboarding but org not in switcher
- **Cause**: organization_memberships not created or RLS issue
- **Check**: Verify member role and status in DB
- **Report**: If membership exists but hidden, likely RLS issue

### Confirmation Email Not Received
- **Symptom**: Signup completes but email verification pending
- **Note**: Staging may have email disabled
- **Workaround**: Use admin panel to mark email verified

### Approval Not Auto-Detecting
- **Symptom**: Pending approval page doesn't detect approval
- **Expected**: Auto-polls every 30 seconds
- **Action**: Manually refresh page after admin approves
- **Check**: Verify join_request.status = 'approved' in DB

---

## Test Data Teardown

After testing, consider:
- Deleting test user accounts created
- Removing orphaned test organizations
- Clearing enrichment request logs

Use admin panel or direct DB cleanup as appropriate for your environment.

---

## Sign-Off

After completing all three paths successfully:

- [ ] Path 1 (Corporate Auto-Join) passed all acceptance criteria
- [ ] Path 2 (Personal Email + Website) passed all acceptance criteria
- [ ] Path 3 (Personal Email + Q&A) passed all acceptance criteria
- [ ] No critical bugs encountered
- [ ] No redirect loops or stuck states
- [ ] Database state consistent and correct

**Tester Name**: _____________________

**Date**: _____________________

**Environment**: _____________________

**Notes**:
```



```

---

## Automated Test Running

To run the automated tests:

```bash
# Run unit tests only
npm test -- tests/unit/stores/onboardingV2Store.test.ts

# Run specific E2E test
npm run playwright tests/e2e/onboarding-v2-corporate-auto-join.spec.ts

# Run all E2E tests
npm run playwright tests/e2e/onboarding-v2*.spec.ts

# Run integration tests
npm test -- tests/integration/onboarding-v2-db-state.test.ts
```

See README for detailed test setup and environment configuration.
