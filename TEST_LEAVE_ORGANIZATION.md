# 🧪 Testing: Leave Organization Feature

## Prerequisites

- ✅ Code deployed to staging: https://staging.use60.com
- ✅ Account: `max.parish501@gmail.com` / `NotTesting@1`
- ✅ Member of at least 2 organizations

---

## Full Test Flow

### Step 1: Login to Staging
```
URL: https://staging.use60.com
Email: max.parish501@gmail.com
Password: NotTesting@1
```

### Step 2: Navigate to Organization Settings
1. Click **Settings** (gear icon)
2. Click **Organization Management**
3. You should see list of organizations you're a member of

### Step 3: Leave Current Organization
1. Scroll down to **Leave Team** section
2. Click **Leave Team** button
3. Confirm in the dialog

### Step 4: Verify Removal
After clicking Leave:
- [ ] Should see "You were removed from [Organization Name]" page
- [ ] Page shows two options:
  - "Request to Rejoin [Organization]"
  - "Choose Different Organization"

### Step 5: Check Organization List is Updated
Open browser DevTools and run:
```javascript
// Check if left org is in the list
const orgList = document.querySelector('[data-test="org-list"]');
console.log(orgList?.textContent);
```

**Expected**: Left organization name should NOT appear

### Step 6: Try Manual Navigation
1. Copy the URL of the organization you just left (if you remember it)
2. Try to navigate to that URL manually
3. **Expected**: Redirected to `/onboarding` (access denied)

### Step 7: Select Different Organization
1. On the removed-user page, click **Choose Different Organization**
2. Should see organization selection list
3. Select a different organization
4. Should be redirected to onboarding for that org

### Step 8: Verify Access Denied
1. Open browser DevTools → Console
2. Try to access the left organization's data
3. **Expected**: 403 Forbidden error (not allowed)

---

## Automated Test Scenarios

### Scenario 1: Leave and Rejoin
```
1. Leave organization → See removed page ✅
2. Click "Request to Rejoin" → See pending approval ✅
3. Admin approves → User can access org again ✅
```

### Scenario 2: Leave and Choose Different
```
1. Leave organization ✅
2. Click "Choose Different Organization" ✅
3. Select different org ✅
4. Complete onboarding ✅
5. Access new org ✅
```

### Scenario 3: Cannot Access Left Org
```
1. Leave organization ✅
2. Try to access left org via URL ✅
3. Should redirect to /onboarding ✅
```

### Scenario 4: Organization Disappears from List
```
1. Before: Org appears in org switcher ✅
2. Leave org ✅
3. After: Org gone from switcher ✅
4. Dashboard doesn't show org ✅
```

---

## Expected Behavior

### What Should Happen ✅
- User is marked as `member_status='removed'` in database
- Organization disappears from org list immediately
- Cannot access any pages of that organization
- Can request to rejoin through proper flow
- Can select different organization through onboarding
- Sidebar org switcher doesn't show left org

### What Should NOT Happen ❌
- Organization still visible in org list
- Still able to access org dashboard
- Still able to see org data
- Still in organization members list as active member
- Any permissions still granted

---

## Testing with Playwright

If using Playwright browser automation:

```typescript
// Login
await page.goto('https://staging.use60.com/auth/login');
await page.fill('input[name="email"]', 'max.parish501@gmail.com');
await page.fill('input[name="password"]', 'NotTesting@1');
await page.click('button:has-text("Sign In")');

// Navigate to org settings
await page.click('a:has-text("Settings")');
await page.click('a:has-text("Organization Management")');

// Leave organization
await page.click('button:has-text("Leave Team")');
await page.click('button:has-text("Confirm")');

// Verify removed page
const heading = await page.textContent('h1');
expect(heading).toContain('You Were Removed');

// Verify org not in list
const orgOptions = await page.$$('option');
const removedOrgText = orgOptions.map(o => o.textContent());
expect(removedOrgText).not.toContain('Organization Name');
```

---

## Browser Console Checks

Check these in browser DevTools Console:

```javascript
// Check active organizations in store
window.__STORE__.getState().organizations
// Should NOT include the left organization

// Check memberships
window.__STORE__.getState().memberships
// Should NOT have entry with member_status='removed'

// Check OrgContext
useOrg() // From React DevTools
// activeOrgId should not be the left org
```

---

## Database Verification

Check Supabase for verification:

```sql
-- Verify member_status is set correctly
SELECT user_id, org_id, role, member_status, removed_at
FROM organization_memberships
WHERE user_id = 'YOUR_USER_ID'
ORDER BY created_at DESC;

-- Should show: member_status='removed' with recent removed_at timestamp
```

---

## Troubleshooting

### Issue: Organization still in list
**Check**:
1. Hard refresh (Ctrl+Shift+R or Cmd+Shift+R)
2. Clear browser cache
3. Check browser DevTools → Network (see if requests are fresh)
4. Verify database query returns empty for active memberships

### Issue: Still able to access org
**Check**:
1. Verify ProtectedRoute is checking member_status
2. Check OrgContext is filtering organizations
3. Ensure staging database has member_status column
4. Check RLS policies on organization_memberships

### Issue: Removed page not showing
**Check**:
1. Verify redirect URL is correct
2. Check if leaveOrganization returned success
3. Look at browser console for errors
4. Check if toast notification appeared

---

## Success Criteria

All must pass:

- [ ] Can click "Leave Team" button
- [ ] User removed from database (member_status='removed')
- [ ] See "You were removed" confirmation page
- [ ] Organization disappears from org list
- [ ] Cannot access left organization
- [ ] Can request to rejoin
- [ ] Can choose different organization
- [ ] Full flow works end-to-end

---

## Deployment Verification

Before testing:

1. Confirm code is deployed
   ```bash
   git log --oneline | head -1
   # Should show: 01fa0fea fix: Prevent removed users...
   ```

2. Verify .env.staging in Vercel
   - VITE_SUPABASE_URL points to staging
   - All keys match .env.staging

3. Check Supabase staging project
   - Project ID: caerqjzvuerejfrdtygb
   - Database: active and accessible

---

## Notes

- Test with multiple browsers if possible (Chrome, Firefox, Safari)
- Test on mobile as well (responsive design)
- Try multiple leave/rejoin cycles
- Test with both owner and non-owner roles
- Verify other users' org lists aren't affected

---

**Status**: Ready for testing after deployment! 🚀
