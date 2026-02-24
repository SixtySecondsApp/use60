# Testing Procedures

## Test Environment Setup

1. Ensure you have an account with an inactive organization
2. Use browser DevTools (F12) to monitor:
   - Network requests
   - Console logs
   - Application state

## Bug #1: OrgContext Pathname Check Tests

### Test 1.1: No Infinite Redirect Loop

**Steps:**
1. Navigate to an existing inactive organization's dashboard
2. Verify the app initially redirects to `/inactive-organization`
3. **Check Network tab**: Should show only ONE request to `/inactive-organization`, not repeated requests
4. **Check Console logs**: Should see log message: `[OrgContext] Active org is inactive, redirecting to inactive page`
5. Page content should load and display without continuous loading

**Expected Result**: ✓ Page loads once and stays loaded
**Failure Indicator**: ✗ Continuous network requests to `/inactive-organization`, browser appears stuck

### Test 1.2: Redirect Works from Active Page

**Steps:**
1. Start from dashboard or another active page
2. Set active org to an inactive organization
3. Observe behavior

**Expected Result**: ✓ User redirects to `/inactive-organization` when org becomes inactive
**Failure Indicator**: ✗ User stays on previous page despite inactive org

### Test 1.3: Page Loads Correctly

**Steps:**
1. Navigate to `/inactive-organization` for an inactive org
2. Verify all page elements render:
   - Organization name displays correctly
   - Deactivation info section visible
   - Days remaining countdown (if applicable)
   - Action buttons present
   - Help text visible

**Expected Result**: ✓ All content renders correctly
**Failure Indicator**: ✗ Page appears blank or shows loading spinner indefinitely

### Test 1.4: Multiple Org Switches

**Steps:**
1. Have multiple organizations (some active, some inactive)
2. Switch between them repeatedly
3. Monitor network requests and console logs

**Expected Result**: ✓ No redirect loops when switching between orgs
**Failure Indicator**: ✗ Browser appears stuck or network shows repeated requests

## Bug #2: Sign Out Flow Tests

### Test 2.1: Sign Out Button Works

**Prerequisites:**
- Logged in user on `/inactive-organization` page
- Browser DevTools open to Application > Cookies/Local Storage

**Steps:**
1. Click the "Sign Out" button
2. Observe button immediately shows loading spinner
3. Wait for redirect to complete
4. **Verify redirected to**: `/auth/login`
5. **Verify browser state**:
   - Supabase auth session cleared
   - User not logged in
   - Cannot access `/dashboard` without re-logging in

**Expected Result**: ✓ Button shows spinner, user redirected to login
**Failure Indicator**:
- ✗ Button does nothing
- ✗ Spinner doesn't appear
- ✗ Still logged in after redirect
- ✗ Redirected to wrong page

### Test 2.2: Button Disabled During Logout

**Steps:**
1. Click "Sign Out" button once
2. **Immediately** try clicking it again (before redirect)
3. Observe button state

**Expected Result**: ✓ Button is disabled (appears grayed out), second click has no effect
**Failure Indicator**: ✗ Button appears active, multiple logout requests possible

### Test 2.3: Logout Error Handling

**Steps:**
1. Open browser DevTools Network tab
2. Set up network throttling (Slow 3G or similar)
3. Click "Sign Out" button
4. Simulate error by:
   - Blocking network in DevTools, OR
   - Manually injecting logout failure

**Expected Result**: ✓ Error toast appears: "Failed to sign out"
**Failure Indicator**: ✗ No error feedback, user confused about what happened

### Test 2.4: Verify Logout Actually Happened

**Steps:**
1. Sign out successfully from `/inactive-organization`
2. After redirect to `/auth/login`, try to navigate directly to `/dashboard`
3. Verify you're redirected back to `/auth/login` (not authenticated)

**Expected Result**: ✓ User cannot access protected routes, must log in again
**Failure Indicator**: ✗ User can still access dashboard or other protected pages

### Test 2.5: Button Loading State UX

**Steps:**
1. Click "Sign Out" button
2. Observe visual feedback

**Expected Result**:
- ✓ Button becomes disabled (appears grayed out)
- ✓ Text "Sign Out" remains visible
- ✓ Spinner appears to the right
- ✓ Smooth visual transition

**Failure Indicator**: ✗ No visual feedback, confusing UX

## Combined Workflow Tests

### Test 3.1: Complete Inactive Org Flow

**Scenario**: User with inactive org goes through all actions

**Steps:**
1. Start logged in with inactive org
2. Navigate to dashboard → redirected to `/inactive-organization`
3. **Test 1**: Verify no redirect loop (Test 1.1)
4. **Test 2**: Click "Request Reactivation" if owner
5. **Test 3**: Click "Leave Organization"
6. **Test 4**: Navigate back and click "Sign Out"
7. **Verify**: Logged out and at `/auth/login`

**Expected Result**: ✓ All flows work smoothly without errors
**Failure Indicator**: ✗ Any action fails or causes unexpected behavior

### Test 3.2: Page Refresh Handling

**Steps:**
1. Navigate to `/inactive-organization`
2. Refresh page (F5)
3. Wait for page to reload completely

**Expected Result**:
- ✓ No redirect loop
- ✓ Page content loads
- ✓ All buttons functional

**Failure Indicator**: ✗ Redirect loop resumes after refresh

### Test 3.3: Browser Back Button

**Steps:**
1. From another page, navigate to `/inactive-organization`
2. Verify page loads without loop
3. Try browser back button
4. Navigate forward again

**Expected Result**: ✓ Back/forward navigation works smoothly
**Failure Indicator**: ✗ Back button causes issues or redirect loop resumes

## Browser Testing

Test on these browsers:
- [ ] Chrome (latest)
- [ ] Firefox (latest)
- [ ] Safari (latest)
- [ ] Edge (latest)

## Performance Verification

### Check 1: No Memory Leaks

**Steps:**
1. Open DevTools Performance/Memory tab
2. Navigate to `/inactive-organization`
3. Keep the page open for 30 seconds
4. Take memory snapshot
5. Check for continuously growing memory usage

**Expected Result**: ✓ Memory usage stable
**Failure Indicator**: ✗ Memory continuously increases (memory leak from infinite effect)

### Check 2: Network Efficiency

**Steps:**
1. Open DevTools Network tab (filter by XHR/Fetch)
2. Navigate to `/inactive-organization`
3. Monitor network activity for 10 seconds

**Expected Result**:
- ✓ Initial page load request
- ✓ No repeated requests to same endpoint
- ✓ Queries for org data happen only once

**Failure Indicator**: ✗ Repeated requests to `/organizations` or similar endpoints

## Console Log Verification

### Expected Logs for Test 1.1 (Bug #1)
```
[OrgContext] Active org is inactive, redirecting to inactive page
```

Should appear **once per page load**, not repeatedly.

### Expected Logs for Test 2.1 (Bug #2)
```
[InactiveOrganizationScreen] Error signing out: [error details]  // ONLY if error occurs
```

Should NOT see this unless there's an actual error.

## Regression Testing

After fixes, verify these don't break:

### Active Organization Flow
**Steps:**
1. Switch to an active organization
2. Verify you can access dashboard normally
3. OrgContext should NOT redirect

**Expected**: ✓ Active orgs work normally

### Other Pages with Inactive Org Check
**Steps:**
1. Visit `/onboarding` with inactive org
2. Visit other pages

**Expected**: ✓ Pages handle inactive org appropriately (redirect or show error)

## Accessibility Testing

### Test 2.5 Accessibility
1. Use keyboard to navigate to "Sign Out" button
2. Press Enter to activate
3. Verify spinner is announced to screen readers

**Expected Result**: ✓ Button accessible via keyboard, spinner is announced

## Test Completion Checklist

- [ ] Test 1.1: No infinite redirect loop
- [ ] Test 1.2: Redirect works from active page
- [ ] Test 1.3: Page loads correctly
- [ ] Test 1.4: Multiple org switches work
- [ ] Test 2.1: Sign out button works
- [ ] Test 2.2: Button disabled during logout
- [ ] Test 2.3: Error handling works
- [ ] Test 2.4: User actually logged out
- [ ] Test 2.5: Button UX is good
- [ ] Test 3.1: Complete workflow works
- [ ] Test 3.2: Page refresh works
- [ ] Test 3.3: Back button works
- [ ] Memory leak check passed
- [ ] Network efficiency check passed
- [ ] Console logs are correct
- [ ] Regression tests passed
- [ ] Accessibility checks passed

## Notes

- If any test fails, check the detailed code changes document
- Use console logs to debug issues
- Check network requests to understand data flow
- Memory profiler helpful for detecting infinite loops
- Test on slow network to catch timing issues
