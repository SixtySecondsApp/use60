# ONBOARDING V2 - COMPREHENSIVE TESTING CHECKLIST

## Pre-Deployment Verification

### Code Status
- [x] Critical bug fixed in ProtectedRoute.tsx
- [ ] Build passes without errors: `npm run build`
- [ ] No TypeScript errors: `npm run type-check`
- [ ] Linting passes: `npm run lint`

### Database Prerequisites
- [ ] Migration applied: `20260204120000_allow_users_to_leave_organization.sql`
- [ ] Column exists: `organization_memberships.member_status`
- [ ] Column exists: `organization_memberships.removed_at`
- [ ] Column exists: `organization_memberships.removed_by`
- [ ] Column exists: `profiles.profile_status`
- [ ] Column exists: `organizations.company_domain`

### Edge Functions Deployed
- [ ] `deep-enrich-organization` function exists and is callable
- [ ] `save-organization-skills` function exists
- [ ] `compile-organization-skills` function exists (for Phase 7)
- [ ] `encharge-send-email` function exists

### RPC Functions Deployed
- [ ] `user_leave_organization` RPC exists
- [ ] `request_rejoin` RPC exists
- [ ] `create_join_request` RPC exists
- [ ] `find_similar_organizations_by_domain` RPC exists
- [ ] `find_similar_organizations` RPC exists

---

## PATH 1: CORPORATE EMAIL WITH AUTO-JOIN

### Scenario
User signs up with a @company-domain.com email for a company that already has an organization set up.

### Test Steps

1. **Setup**:
   - [ ] Create organization in database with name "Test Corp" and company_domain = "testcorp.com"
   - [ ] Create a team member in that organization
   - [ ] Verify organization is marked as active (is_active = true)

2. **New User Signup**:
   - [ ] Navigate to /auth/signup
   - [ ] Fill email: employee@testcorp.com
   - [ ] Fill password and confirm password
   - [ ] Click "Create Account"
   - [ ] Complete email verification if prompted
   - [ ] System should auto-detect corporate email

3. **Email Domain Check**:
   - [ ] Should NOT be marked as personal email
   - [ ] Domain should be extracted as "testcorp.com"
   - [ ] RPC should find exact match organization
   - [ ] Should auto-join the organization

4. **Automatic Organization Joining**:
   - [ ] Organization ID should be set to Test Corp's ID
   - [ ] User should be added to organization_memberships
   - [ ] Role should be "member" (not owner)
   - [ ] member_status should be "active"
   - [ ] Should redirect to "enrichment_loading" step

5. **Enrichment Process**:
   - [ ] Enrichment loading step should display
   - [ ] Progress indicator should be visible
   - [ ] Should call `deep-enrich-organization` edge function
   - [ ] Should start polling for status

6. **Enrichment Completion**:
   - [ ] Polling should complete within 5 minutes
   - [ ] Should show enrichment results (company info, logo, etc)
   - [ ] Should display 5 skills: Qualification, Enrichment, Brand Voice, Objections, ICP
   - [ ] Should allow configuring each skill

7. **Skills Configuration**:
   - [ ] Each skill can be configured or skipped
   - [ ] Can tab through all 5 skills
   - [ ] Configurations should be editable
   - [ ] Can reset skill to AI defaults

8. **Completion**:
   - [ ] After saving all skills, should redirect to /dashboard
   - [ ] Should NOT see onboarding page again
   - [ ] Organization should be accessible
   - [ ] localStorage should be cleared (no `sixty_onboarding_*` key)

9. **Verification**:
   - [ ] User should be member of organization (member_status='active')
   - [ ] Organization should be in org switcher
   - [ ] Can access organization dashboard
   - [ ] Can see team members in Settings

---

## PATH 2: PERSONAL EMAIL WITH WEBSITE INPUT

### Scenario
User signs up with gmail.com and provides their company website.

### Test Steps - Part A: New Organization Creation

1. **Setup**:
   - [ ] Note: This organization should NOT exist yet
   - [ ] Website: acme-example.com (unique test name)

2. **New User Signup**:
   - [ ] Sign up with email: person@gmail.com
   - [ ] Complete email verification
   - [ ] Should detect personal email

3. **Website Input Step**:
   - [ ] Should display "What's your company website?" form
   - [ ] Should have text input for URL
   - [ ] Should have "I don't have a website" option
   - [ ] Enter URL: acme-example.com

4. **Organization Lookup**:
   - [ ] Should extract domain "acme-example.com"
   - [ ] Should query for existing organization
   - [ ] If no match: proceed to organization creation

5. **Organization Creation**:
   - [ ] Should create new organization
   - [ ] Name should be set to domain or user input
   - [ ] company_domain should be set to "acme-example.com"
   - [ ] User should be added as "owner"
   - [ ] Should set enrichment_source='website'

6. **Enrichment Process**:
   - [ ] Should move to enrichment_loading step
   - [ ] Should call edge function with website domain
   - [ ] Should show loading state
   - [ ] Should start polling

7. **Enrichment Completion**:
   - [ ] Should extract company info from website
   - [ ] Should generate AI-powered skills
   - [ ] Should display results

8. **Skills Configuration**:
   - [ ] Should configure 5 skills
   - [ ] Can customize based on company info

9. **Completion**:
   - [ ] Save skills
   - [ ] Redirect to dashboard
   - [ ] Organization created and owned by user

### Test Steps - Part B: Existing Organization (Fuzzy Match)

1. **Setup**:
   - [ ] Create organization "ACME Corp" with company_domain="acme.com"
   - [ ] Keep it active

2. **New User Signup**:
   - [ ] Sign up with email: another@gmail.com

3. **Website Input**:
   - [ ] Enter website: acme-inc.com (similar but not exact)

4. **Fuzzy Matching**:
   - [ ] Should find fuzzy match (similarity_score > 0.7)
   - [ ] Should show organization selection page
   - [ ] Should display "ACME Corp" as option to join

5. **Organization Selection**:
   - [ ] Should display found organization
   - [ ] Should show member count if available
   - [ ] Should show similarity score
   - [ ] Can select to join existing org
   - [ ] Should create join request (NOT auto-join)

6. **Join Request Pending**:
   - [ ] Should move to "pending_approval" step
   - [ ] Should display admin approval message
   - [ ] Should redirect to `/auth/pending-approval`

7. **Create New Option**:
   - [ ] Should also have option to create new organization
   - [ ] If selected, should create new org instead

---

## PATH 3: PERSONAL EMAIL WITH Q&A FALLBACK

### Scenario
User signs up with gmail.com and doesn't have a website, uses Q&A fallback.

### Test Steps

1. **New User Signup**:
   - [ ] Sign up with email: person@gmail.com
   - [ ] Complete email verification

2. **Website Input Step**:
   - [ ] Should display website input form
   - [ ] Click "I don't have a website" button

3. **Manual Enrichment Step**:
   - [ ] Should transition to manual enrichment page
   - [ ] Should display Q&A form with fields:
     - [ ] Company name
     - [ ] Company description
     - [ ] Industry
     - [ ] Target customers
     - [ ] Main products
     - [ ] Competitors

4. **Fill Q&A Form**:
   - [ ] Fill in all required fields with test data
   - [ ] Company name: "Test Startup Inc"
   - [ ] Description: "We build AI tools"
   - [ ] Industry: "Software"
   - [ ] Customers: "Enterprise"
   - [ ] Products: "AI Chatbot"
   - [ ] Competitors: "OpenAI, Anthropic"

5. **Organization Lookup**:
   - [ ] Should fuzzy match by company name
   - [ ] If similar org found with score > 0.7, require approval
   - [ ] If no match, create new organization

6. **Organization Creation**:
   - [ ] Should create organization with name from Q&A
   - [ ] User should be owner
   - [ ] enrichment_source should be 'manual'

7. **Manual Enrichment Processing**:
   - [ ] Should call edge function with manual data
   - [ ] Should set isEnrichmentLoading = true
   - [ ] Should move to enrichment_loading step

8. **Enrichment Polling**:
   - [ ] Should poll for enrichment status
   - [ ] Should handle manual enrichment (no web scraping)
   - [ ] Should use Q&A data for skill generation
   - [ ] Should complete polling and show results

9. **Skills Configuration**:
   - [ ] Should show generated skills based on Q&A data
   - [ ] Can configure and save

10. **Completion**:
    - [ ] Should save skills
    - [ ] Should redirect to dashboard
    - [ ] Organization created from Q&A input

---

## REMOVED USER STEP

### Scenario
User leaves organization or is removed, and needs to handle the redirect.

### Test Steps - Part A: User-Initiated Leave

1. **Setup**:
   - [ ] Create test user in organization
   - [ ] User should NOT be owner
   - [ ] Verify active membership exists

2. **Navigate to Settings**:
   - [ ] Go to /settings/organization-management
   - [ ] Should see organization in list
   - [ ] Should see "Leave Team" button

3. **Leave Organization**:
   - [ ] Click "Leave Team" button
   - [ ] Should show confirmation dialog
   - [ ] Confirm leaving

4. **Removed User Page**:
   - [ ] Should redirect to /onboarding/removed-user
   - [ ] Should display "You Left [Organization Name]"
   - [ ] Should show description about what happened
   - [ ] Should display two options:
     - [ ] "Request to Rejoin [Organization]"
     - [ ] "Choose Different Organization"

5. **Database Verification**:
   - [ ] Check organization_memberships table
   - [ ] member_status should be 'removed'
   - [ ] removed_at should be recent timestamp
   - [ ] removed_by should be user_id

6. **Organization List Update**:
   - [ ] Organization should disappear from org switcher
   - [ ] Organization should not appear in settings
   - [ ] Hard refresh browser (Ctrl+Shift+R)
   - [ ] Organization should still be gone

### Test Steps - Part B: Request to Rejoin

1. **From Removed Page**:
   - [ ] Click "Request to Rejoin [Organization]"
   - [ ] Should show loading state
   - [ ] Should submit join request

2. **Join Request Created**:
   - [ ] Should create join request in database
   - [ ] Profile status should be 'pending_approval'
   - [ ] Should show success message

3. **Redirect**:
   - [ ] Should redirect to /auth/pending-approval
   - [ ] Should display pending approval message

4. **Admin Approval (in separate session)**:
   - [ ] Admin views pending join requests
   - [ ] Admin approves the request
   - [ ] User should be notified via email

5. **After Approval**:
   - [ ] User's member_status should be 'active'
   - [ ] Organization should reappear in list
   - [ ] User can access organization again

### Test Steps - Part C: Choose Different Organization

1. **From Removed Page**:
   - [ ] Click "Choose Different Organization"
   - [ ] Should clear sessionStorage flag
   - [ ] Should reset Zustand store
   - [ ] Should clear localStorage
   - [ ] Should reset database progress to 'website_input'

2. **Redirect to Onboarding**:
   - [ ] Should redirect to /onboarding?step=website_input
   - [ ] Should display website input form
   - [ ] Should NOT show removed org in list

3. **Fresh Onboarding**:
   - [ ] Should allow selecting different organization
   - [ ] All previous state should be cleared
   - [ ] Can complete fresh onboarding

---

## LOCALSTORAGE PERSISTENCE & SESSION RECOVERY

### Scenario
User starts onboarding, closes browser, then returns and should resume from where they left off.

### Test Steps

1. **Start Onboarding**:
   - [ ] Sign up new user with corporate email
   - [ ] System starts enrichment
   - [ ] Wait for enrichment_loading step

2. **Verify localStorage**:
   - [ ] Open browser DevTools → Application → Local Storage
   - [ ] Should have key: `sixty_onboarding_${userId}`
   - [ ] Key should contain:
     - [ ] currentStep
     - [ ] domain
     - [ ] organizationId
     - [ ] other state

3. **Close Browser/Refresh**:
   - [ ] Close the browser completely
   - [ ] OR hard refresh the page (Ctrl+Shift+R)
   - [ ] Clear any session cookies if needed

4. **Return and Login**:
   - [ ] Log back in with same user
   - [ ] Should automatically restore state
   - [ ] Should show toast: "Restored your progress"

5. **Verify State Recovery**:
   - [ ] Should be on same step as before
   - [ ] currentStep should match
   - [ ] domain should be preserved
   - [ ] organizationId should be preserved

6. **Resume Onboarding**:
   - [ ] If on enrichment_loading, should resume polling
   - [ ] Should continue from enrichment step
   - [ ] NOT reset to website_input
   - [ ] Should complete onboarding from there

7. **Clear on Completion**:
   - [ ] After completing onboarding
   - [ ] localStorage key should be removed
   - [ ] Should not have `sixty_onboarding_*` key

8. **Test 24-Hour TTL**:
   - [ ] Manually set saved state timestamp to 25 hours ago
   - [ ] On next login, should NOT restore (stale)
   - [ ] Should redirect to fresh onboarding

---

## ERROR SCENARIOS & EDGE CASES

### Error Handling

1. **Enrichment Timeout**:
   - [ ] Start enrichment and wait > 5 minutes
   - [ ] Should show timeout error
   - [ ] Should not infinite loop
   - [ ] Should allow retry

2. **Network Failure During Enrichment**:
   - [ ] Start enrichment
   - [ ] Turn off network
   - [ ] Should catch error
   - [ ] Should show error message
   - [ ] Should allow retry

3. **Missing Organization**:
   - [ ] Save onboarding state
   - [ ] Manually delete organization from database
   - [ ] Refresh page
   - [ ] Should detect missing org
   - [ ] Should clear state and restart

4. **RPC Function Not Available**:
   - [ ] Try to use fuzzy matching
   - [ ] If RPC fails, should fall back
   - [ ] Should still work (create new org)
   - [ ] Should show appropriate error

5. **Edge Function Not Available**:
   - [ ] Try to start enrichment
   - [ ] If edge function fails, should catch error
   - [ ] Should show user-friendly message
   - [ ] Should allow retry

### Edge Cases

1. **User is Last Owner**:
   - [ ] User is only owner of organization
   - [ ] Try to leave team
   - [ ] Should show error: "must transfer ownership first"
   - [ ] Should NOT allow leaving

2. **User Already Removed**:
   - [ ] User already has member_status='removed'
   - [ ] Try to leave again
   - [ ] Should show: "already removed"
   - [ ] Should prevent duplicate removal

3. **Exact Domain Match**:
   - [ ] Organization with exact company_domain exists
   - [ ] User signs up with that email
   - [ ] Should auto-join immediately
   - [ ] Should NOT show join request

4. **Multiple Fuzzy Matches**:
   - [ ] Website matches multiple orgs (score > 0.7)
   - [ ] Should show selection page
   - [ ] User should select which to join
   - [ ] Should create join request for selected

5. **Personal Email Domain List**:
   - [ ] Test with gmail.com
   - [ ] Test with yahoo.com
   - [ ] Test with hotmail.com
   - [ ] Test with custom domain @mycompany.com
   - [ ] Should correctly identify personal vs corporate

---

## UI RENDERING & RESPONSIVENESS

### Desktop Testing
- [ ] Website input form displays correctly
- [ ] Manual enrichment form displays correctly
- [ ] Enrichment loading animation plays
- [ ] Skills configuration shows all 5 skills
- [ ] Skills configuration is scrollable on small screens
- [ ] Removed user page displays properly

### Mobile Testing (iOS/Android)
- [ ] All forms are mobile-responsive
- [ ] Buttons are tappable (minimum 44x44)
- [ ] Text is readable without zooming
- [ ] No horizontal scroll on small screens
- [ ] Toast notifications appear correctly

### Dark Mode Testing
- [ ] All steps display correctly in dark mode
- [ ] Colors are readable (sufficient contrast)
- [ ] Icons are visible
- [ ] Buttons are clickable

---

## PERFORMANCE TESTING

1. **Page Load Time**:
   - [ ] Onboarding pages load in < 3 seconds
   - [ ] Enrichment loading shows progress
   - [ ] No jank or stuttering

2. **Polling Performance**:
   - [ ] Polling requests are not excessive
   - [ ] 2-second interval is maintained
   - [ ] Network tab shows reasonable request frequency

3. **localStorage Size**:
   - [ ] Saved state is < 100KB
   - [ ] Not storing unnecessary data
   - [ ] Not storing sensitive data

---

## SECURITY TESTING

1. **Authorization**:
   - [ ] Cannot access onboarding without being logged in
   - [ ] Cannot access removed-user page directly (without removal)
   - [ ] Cannot skip to skills step without completing previous steps

2. **Data Protection**:
   - [ ] No sensitive data in localStorage
   - [ ] No passwords, API keys, tokens in state
   - [ ] User email not exposed in unencrypted state

3. **Organization Access**:
   - [ ] Cannot access organization you're not member of
   - [ ] Removed users cannot access left organization
   - [ ] RLS policies enforce access control

---

## BROWSER COMPATIBILITY

- [ ] Chrome/Chromium (Latest)
- [ ] Firefox (Latest)
- [ ] Safari (Latest)
- [ ] Edge (Latest)
- [ ] Mobile Safari (iOS)
- [ ] Chrome Mobile (Android)

---

## FINAL VERIFICATION

Before marking as complete:

- [ ] All 3 paths work end-to-end
- [ ] Removed user flow works
- [ ] localStorage persistence works
- [ ] Step transitions are smooth
- [ ] Error handling is user-friendly
- [ ] UI is responsive and accessible
- [ ] No console errors
- [ ] Performance is acceptable
- [ ] Security checks pass
- [ ] Cross-browser compatible

---

## Sign-Off

- Tested by: _____________
- Date: _____________
- Status: ✅ PASSED / ❌ FAILED
- Notes: _____________

