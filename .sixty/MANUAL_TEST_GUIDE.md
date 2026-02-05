# Manual Test Guide: Onboarding Manual Enrichment Fix

**Bug**: RLS 42501 error when completing manual enrichment
**Root Cause**: State transition race condition
**Status**: ✅ FIXED in commit 484c54d1

---

## What Was the Problem?

When a user:
1. Signs up with personal email (gmail.com, yahoo.com, etc.)
2. Selects "I don't have a website yet"
3. Completes all 6 manual enrichment questions
4. Clicks "Complete"

They would experience:
- ❌ Redirect back to "website_input" step
- ❌ Network error: RLS 42501 on organization_memberships
- ❌ Automatic advance to enrichment_result after a few seconds
- ❌ Confusing UX with unexpected step transitions

---

## What's Fixed?

The fix ensures:
- ✅ Organization created FIRST (with valid authentication context)
- ✅ State updated ATOMICALLY (no intermediate renders)
- ✅ No premature redirects (guard accounts for async operations)
- ✅ Polling stops if needed (doesn't continue after redirects)
- ✅ Clear error messages (better debugging)

---

## How to Test

### Test 1: Happy Path - Manual Enrichment Completion

**Goal**: Verify manual enrichment works without redirect

**Steps**:
1. Open browser DevTools (F12)
2. Go to "Network" tab
3. Filter for XHR/Fetch requests
4. Go to your app's signup page
5. Sign up with personal email (e.g., `yourname@gmail.com`)
6. Select **"I don't have a website yet"** (NOT "I have a website")
7. Fill all 6 manual enrichment fields:
   - Company Name: `Testing Software` (or any name)
   - Industry: (select one)
   - Company Size: (select one)
   - Location: (any location)
   - Revenue: (any value)
   - Key Challenges: (any text)
8. Click **"Complete"** on the final question

**Expected Results**:
- ✅ No redirect back to website_input
- ✅ Step progresses: manual_enrichment → enrichment_loading → enrichment_result
- ✅ Network tab shows NO 42501 errors
- ✅ All requests succeed (status 200)
- ✅ Console shows no error messages
- ✅ Organization created with correct name

**What to Check in Console**:
```
✅ Should NOT see:
  "[EnrichmentLoadingStep] No organizationId - cannot proceed"

✅ Should see:
  "[submitManualEnrichment] Organization selection required, waiting for user choice"
  "[pollEnrichmentStatus] Updated org name to: Testing Software"
```

**What to Check in Network Tab**:
```
✅ organization_memberships POST/INSERT request
   Status: 200 or 201 (NOT 403, NOT 42501)
   Response: Success

✅ deep-enrich-organization edge function
   Status: 200 (successfully invoked)
```

---

### Test 2: Organization Selection Flow

**Goal**: Verify organization selection still works (triggers when similar org found)

**Steps**:
1. Use a corporate email domain (e.g., `user@company-that-exists.com`)
2. If your test data has a similar organization, selection modal will appear
3. Select the organization or create new
4. Click **"Complete"** on manual enrichment

**Expected Results**:
- ✅ Organization selection modal appears (if similar org exists)
- ✅ User can select existing org or choose to create new
- ✅ No errors during selection
- ✅ Can proceed to enrichment_result
- ✅ No RLS 42501 errors

**What to Check**:
```
✅ Console log:
  "[submitManualEnrichment] Organization selection required, waiting for user choice"

✅ UI behavior:
  Modal/overlay appears for org selection
  User can make selection
  Step transition smooth after selection
```

---

### Test 3: Website-Based Enrichment (Regression Test)

**Goal**: Verify website-based enrichment still works (wasn't broken by fix)

**Steps**:
1. Sign up with corporate email (e.g., `user@acme.com` where acme.com is valid domain)
2. Leave website field empty OR it's auto-detected
3. App should auto-enrich from website
4. Verify enrichment completes

**Expected Results**:
- ✅ Enrichment starts automatically
- ✅ No redirect to manual enrichment (unless website invalid)
- ✅ Enrichment completes successfully
- ✅ Organization created with website data
- ✅ No RLS errors

---

### Test 4: Error Scenarios

#### 4a: Network Failure During Manual Enrichment

**Steps**:
1. Open DevTools > Network tab
2. Set throttling to "Offline"
3. Start manual enrichment form
4. Fill fields and click "Complete"
5. Watch what happens

**Expected Results**:
- ✅ Error displayed to user (not silent failure)
- ✅ User can retry or go back
- ✅ No hanging loading state

#### 4b: Invalid Input

**Steps**:
1. Try to submit with empty fields
2. Try with special characters
3. Try with very long input

**Expected Results**:
- ✅ Form validation prevents submission
- ✅ Clear error messages
- ✅ No backend errors

---

### Test 5: Console Logging Check

**Goal**: Verify debug logging shows proper flow

**Steps**:
1. Open DevTools > Console
2. Complete manual enrichment (Test 1)
3. Watch console output

**Expected Console Output Order**:
```
✅ [submitManualEnrichment] Org creation starting...
   → createOrganizationFromManualData called

✅ [submitManualEnrichment] Organization created (not selection step)
   → finalOrgId now has valid UUID

✅ [submitManualEnrichment] Setting step to enrichment_loading
   → State updated atomically

✅ [EnrichmentLoadingStep] Guard skipping (enrichmentSource='manual')
   → Component mounts, guard doesn't fire

✅ [submitManualEnrichment] Calling deep-enrich-organization
   → Edge function invoked

✅ [pollEnrichmentStatus] Starting enrichment polling
   → Polling begins

✅ [pollEnrichmentStatus] Updated org name to: [Your Company Name]
   → Enrichment processing

✅ [pollEnrichmentStatus] Enrichment complete!
   → Stepping to enrichment_result

❌ Should NOT see:
   [EnrichmentLoadingStep] No organizationId - cannot proceed
   [EnrichmentLoadingStep] Redirecting to website_input
```

---

## Browser/Device Testing

Test on:
- ✅ Chrome (latest)
- ✅ Firefox (latest)
- ✅ Safari (if available)
- ✅ Mobile (iOS/Android)
- ✅ Slow 3G network (DevTools > Network throttling)

---

## Verification Checklist

After running tests, verify:

### Technical Checks
- [ ] No RLS 42501 errors in Network tab
- [ ] No console errors (red X marks)
- [ ] All XHR requests return 200/201 status
- [ ] organization_memberships created successfully
- [ ] Step transitions in correct order
- [ ] EnrichmentLoadingStep mounts with valid organizationId

### User Experience Checks
- [ ] No unexpected redirects
- [ ] No confusing step jumps
- [ ] Clear loading states
- [ ] Error messages are helpful
- [ ] Organization data persists correctly

### Regression Checks
- [ ] Website-based enrichment still works
- [ ] Organization selection still works
- [ ] Error handling works
- [ ] Mobile experience unchanged
- [ ] Other onboarding paths unaffected

---

## If You Find Issues

### Issue: Still getting RLS 42501 error

**Debug Steps**:
1. Check browser cache - clear it
2. Check that you're on the latest deployed version
3. Check commit hash in app (if available) - should be `484c54d1` or later
4. Check if changes were actually deployed

**Report**:
```
Please provide:
- Exact steps to reproduce
- Email used for signup
- Console errors (full text)
- Network tab requests (export as HAR)
- Browser/OS info
```

### Issue: Redirect to website_input still happening

**Debug Steps**:
1. Check browser console for `[EnrichmentLoadingStep]` messages
2. Verify `enrichmentSource` is `'manual'` in store
3. Verify `isEnrichmentLoading` is `true` during init
4. Check if organization was actually created

### Issue: Enrichment not completing

**Debug Steps**:
1. Check if polling started (look for `[pollEnrichmentStatus]` in console)
2. Check Network tab for polling requests
3. Verify organization exists in database
4. Check if edge function `deep-enrich-organization` returned success

---

## Performance Check

**Expected timings**:
- Organization creation: < 500ms
- Step transition: < 100ms
- First enrichment status check: < 1s
- Enrichment completion: 5-30 seconds (depends on AI processing)
- Total manual enrichment flow: 30-60 seconds

If timing is significantly slower, check:
- Network latency (throttle check)
- Database query performance
- Edge function processing

---

## Post-Fix Confirmation

Once you've tested, confirm:

✅ **Functionality**: Manual enrichment works end-to-end without RLS error

✅ **User Experience**: No unexpected redirects or step jumps

✅ **Performance**: Reasonable completion time

✅ **Regression**: Other onboarding paths unaffected

✅ **Error Handling**: Clear error messages when issues occur

---

## Next Steps

If all tests pass:
1. **Deploy**: Merge PR to main
2. **Monitor**: Watch error logs for any 42501 errors
3. **Announce**: Notify team that manual enrichment is fixed

If issues found:
1. **Report**: Create detailed bug report
2. **Investigate**: Check if fix was properly deployed
3. **Troubleshoot**: Use debug steps above
