# Implementation Guide - Step by Step

This guide walks you through implementing both bug fixes in the order of lowest risk to highest impact.

---

## Preparation

1. **Create a new branch** (if not already on fix branch):
   ```bash
   git checkout -b fix/go-live-bug-fixes
   ```

2. **Ensure you're on the latest code**:
   ```bash
   git pull origin fix/go-live-bug-fixes
   ```

3. **Open the files to edit**:
   - File 1: `src/lib/contexts/OrgContext.tsx`
   - File 2: `src/pages/InactiveOrganizationScreen.tsx`

4. **Verify your IDE setup**:
   - TypeScript checking enabled
   - ESLint configured
   - Prettier formatting available

---

## Step 1: Fix OrgContext (Lower Risk)

This fix is simpler and lower risk - it's a single line addition.

### Step 1.1: Locate the Code

**File**: `src/lib/contexts/OrgContext.tsx`
**Lines**: 213-222

Use Find (Ctrl+F) to locate:
```
// Check if active org is inactive and redirect to inactive page
```

### Step 1.2: Review Current Code

Before making changes, verify you see:
```typescript
213→  // Check if active org is inactive and redirect to inactive page
214→  useEffect(() => {
215→    if (!activeOrg || !activeOrgId) return;
216→
217→    // If org is inactive, redirect immediately
218→    if (activeOrg.is_active === false) {
219→      logger.log('[OrgContext] Active org is inactive, redirecting to inactive page');
220→      window.location.href = '/inactive-organization';
221→    }
222→  }, [activeOrg, activeOrgId]);
```

### Step 1.3: Make the Change

Position cursor at end of line 215 (after `return;`)

Add new line and type:
```typescript

    // Prevent redirect loop when already on inactive-organization page
    if (window.location.pathname.includes('/inactive-organization')) return;
```

### Step 1.4: Verify the Change

After insertion, lines should now be:
```typescript
213→  // Check if active org is inactive and redirect to inactive page
214→  useEffect(() => {
215→    if (!activeOrg || !activeOrgId) return;
216→
217→    // Prevent redirect loop when already on inactive-organization page
218→    if (window.location.pathname.includes('/inactive-organization')) return;
219→
220→    // If org is inactive, redirect immediately
221→    if (activeOrg.is_active === false) {
222→      logger.log('[OrgContext] Active org is inactive, redirecting to inactive page');
223→      window.location.href = '/inactive-organization';
224→    }
225→  }, [activeOrg, activeOrgId]);
```

### Step 1.5: Verify No Errors

- [ ] No TypeScript errors in IDE
- [ ] ESLint shows no issues
- [ ] No syntax errors (red squiggles)

### Step 1.6: Save the File

Use Ctrl+S or File > Save

---

## Step 2: Fix InactiveOrganizationScreen (Higher Risk)

This fix has three parts. Do them in order.

### Part 2.1: Verify logout is Available

**File**: `src/pages/InactiveOrganizationScreen.tsx`
**Line**: 20

Find the line that says:
```typescript
const { user } = useAuth();
```

**Critical Check**: Look at how `useAuth()` is destructured. According to RequestRejectedPage.tsx pattern, `logout` should be available.

If the current code only has `{ user }`, check if there's a `logout` function being used elsewhere. Looking at RequestRejectedPage.tsx line 20:
```typescript
const { user, logout } = useAuth();
```

**For InactiveOrganizationScreen, your current line 20 should be**:
```typescript
const { user } = useAuth();
```

**After fix, it should stay the same** - the handler will call `logout()` which comes from the import pattern, not direct destructuring. Actually, reviewing the RequestRejectedPage more carefully, it DOES destructure logout. Let me check if this needs to be updated...

Actually, the provided code shows InactiveOrganizationScreen only destructures `{ user }` on line 20. The fix handler will need `logout()`. This could be from:
1. Adding it to destructuring: `const { user, logout } = useAuth();`
2. Or calling it via: `const auth = useAuth(); auth.logout();`

**Recommendation**: Destructure it like RequestRejectedPage does:

Change line 20 from:
```typescript
const { user } = useAuth();
```

To:
```typescript
const { user, logout } = useAuth();
```

This is the cleaner pattern. Make this change first.

### Part 2.2: Add Loading State

**File**: `src/pages/InactiveOrganizationScreen.tsx`
**Location**: After line 28

Find these lines:
```typescript
24→  const [isCheckingStatus, setIsCheckingStatus] = useState(true);
25→  const [isOwner, setIsOwner] = useState(false);
26→  const [daysRemaining, setDaysRemaining] = useState<number | null>(null);
27→  const [isOverdue, setIsOverdue] = useState(false);
28→  const [isLeavingOrg, setIsLeavingOrg] = useState(false);
29→
30→  useEffect(() => {
```

Add this line after line 28:
```typescript
  const [isSigningOut, setIsSigningOut] = useState(false);
```

Result should be:
```typescript
24→  const [isCheckingStatus, setIsCheckingStatus] = useState(true);
25→  const [isOwner, setIsOwner] = useState(false);
26→  const [daysRemaining, setDaysRemaining] = useState<number | null>(null);
27→  const [isOverdue, setIsOverdue] = useState(false);
28→  const [isLeavingOrg, setIsLeavingOrg] = useState(false);
29→  const [isSigningOut, setIsSigningOut] = useState(false);
30→
31→  useEffect(() => {
```

**Verify**: No TypeScript errors

### Part 2.3: Replace handleSignOut Function

**File**: `src/pages/InactiveOrganizationScreen.tsx`
**Lines**: 153-156

Find:
```typescript
153→  const handleSignOut = () => {
154→    // Will trigger auth context sign out
155→    navigate('/auth/logout');
156→  };
```

Replace with:
```typescript
153→  const handleSignOut = async () => {
154→    try {
155→      setIsSigningOut(true);
156→      await logout();
157→      navigate('/auth/login', { replace: true });
158→    } catch (err) {
159→      logger.error('[InactiveOrganizationScreen] Error signing out:', err);
160→      toast.error('Failed to sign out', {
161→        description: 'Please try again or contact support.'
162→      });
163→    } finally {
164→      setIsSigningOut(false);
165→    }
166→  };
```

**Verify**:
- [ ] No TypeScript errors
- [ ] `logout` is available (should be from destructuring in Step 2.1)
- [ ] `setIsSigningOut` is available (from Step 2.2)
- [ ] All imports present: `logger`, `toast`, `navigate`

### Part 2.4: Update Sign Out Button

**File**: `src/pages/InactiveOrganizationScreen.tsx`
**Lines**: 335-346

Find:
```typescript
335→            <Button
336→              onClick={handleSignOut}
337→              variant="outline"
338→              className="w-full justify-between"
339→              size="lg"
340→            >
341→              <span className="flex items-center gap-2">
342→                <LogOut className="w-4 h-4" />
343→                Sign Out
344→              </span>
345→              <span>→</span>
346→            </Button>
```

Replace with:
```typescript
335→            <Button
336→              onClick={handleSignOut}
337→              disabled={isSigningOut}
338→              variant="outline"
339→              className="w-full justify-between"
340→              size="lg"
341→            >
342→              <span className="flex items-center gap-2">
343→                <LogOut className="w-4 h-4" />
344→                Sign Out
345→              </span>
346→              {isSigningOut && <RefreshCw className="w-4 h-4 animate-spin" />}
347→            </Button>
```

**Changes**:
- Line 337: Add `disabled={isSigningOut}`
- Line 346: Replace `<span>→</span>` with `{isSigningOut && <RefreshCw className="w-4 h-4 animate-spin" />}`

**Verify**:
- [ ] `RefreshCw` is imported (line 3)
- [ ] `isSigningOut` state variable exists (from Step 2.2)
- [ ] No TypeScript errors

### Step 2.5: Verify All Changes in Context

**In file header (imports)**:
- [ ] Line 3: Verify `RefreshCw` is imported from lucide-react
- [ ] Line 7: Verify `useAuth` import exists
- [ ] Line 8: Verify `useAuth` is imported from '@/lib/contexts/AuthContext'
- [ ] Line 14: Verify `toast` is imported from 'sonner'
- [ ] Line 15: Verify `logger` is imported from '@/lib/utils/logger'

**In component (line 20)**:
- [ ] Change `const { user }` to `const { user, logout }`

**In state (lines 24-29)**:
- [ ] Verify all state variables present
- [ ] Verify `isSigningOut` added on new line 29

**In handler (lines 153-166)**:
- [ ] Verify function is async
- [ ] Verify try/catch/finally structure
- [ ] Verify `logout()` is called
- [ ] Verify error handling present

**In button (lines 335-347)**:
- [ ] Verify `disabled={isSigningOut}` added
- [ ] Verify spinner replaces arrow

### Step 2.6: Save the File

Use Ctrl+S or File > Save

---

## Step 3: Verification

### TypeScript Check

Run in terminal:
```bash
npm run type-check
```

Expected: No errors related to your changes

### ESLint Check

Run in terminal:
```bash
npm run lint -- src/lib/contexts/OrgContext.tsx src/pages/InactiveOrganizationScreen.tsx
```

Expected: No errors in modified files

### Visual Verification

1. Review both files one more time
2. Check all semicolons are present
3. Check all brackets are balanced
4. Check imports are correct
5. Check indentation is consistent

### Build Check

Run in terminal:
```bash
npm run build
```

Expected: Build succeeds, no errors

---

## Step 4: Testing

### Quick Local Test

1. Start dev server:
   ```bash
   npm run dev
   ```

2. Navigate to an inactive organization
3. Verify no redirect loop occurs
4. Click Sign Out button
5. Verify button shows spinner
6. Verify redirect to /auth/login happens

### Full Test Suite

See `TESTING_PROCEDURES.md` for comprehensive testing steps.

---

## Step 5: Commit

When ready to commit:

```bash
git add src/lib/contexts/OrgContext.tsx src/pages/InactiveOrganizationScreen.tsx
git commit -m "fix: Prevent infinite org active status checks and enable logout from inactive org page

- Add pathname check in OrgContext to prevent redirect loop on /inactive-organization
- Fix logout handler in InactiveOrganizationScreen to call logout() instead of non-existent route
- Add loading state and visual feedback to sign out button
- Match existing error handling patterns from RequestRejectedPage"
```

---

## Troubleshooting

### Issue: TypeScript Error - "logout is not defined"

**Solution**:
Make sure line 20 includes logout in destructuring:
```typescript
const { user, logout } = useAuth();
```

### Issue: "RefreshCw is not defined"

**Solution**:
Make sure line 3 includes RefreshCw import:
```typescript
import { AlertCircle, RefreshCw, LogOut, Clock, Calendar, Mail, UserX } from 'lucide-react';
```

### Issue: Build fails with indentation errors

**Solution**:
Run prettier to fix formatting:
```bash
npm run format src/lib/contexts/OrgContext.tsx src/pages/InactiveOrganizationScreen.tsx
```

### Issue: Still seeing redirect loop after fix

**Solution**:
1. Clear browser cache: Ctrl+Shift+Delete
2. Verify code change was actually saved
3. Check DevTools Network tab for request patterns
4. Verify `window.location.pathname.includes('/inactive-organization')` is in the code

### Issue: Sign out button doesn't work

**Solution**:
1. Check browser console for errors
2. Verify `logout()` function is defined
3. Check that `setIsSigningOut(true)` runs
4. Verify network request shows logout was called

---

## Summary

**Total Changes**:
- File 1: 2 lines added
- File 2: 1 state variable added, 1 line updated, 14 lines replaced, 1 import updated

**Files Modified**: 2
**Time to Implement**: ~15 minutes
**Risk Level**: Low (follows existing patterns)
**Testing Time**: ~15-20 minutes
