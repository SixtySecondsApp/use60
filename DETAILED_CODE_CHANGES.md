# Detailed Code Changes

## Change #1: OrgContext.tsx - Add Pathname Check

**File**: `src/lib/contexts/OrgContext.tsx`
**Lines to Modify**: 213-222

### Before (Current - Buggy)
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

### After (Fixed)
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

### What Changed
- **Added line 217-218**: Pathname check to prevent redirect when already on the target page
- Line numbers shift down by 2 after the insertion
- No dependency array changes
- No new imports needed

---

## Change #2: InactiveOrganizationScreen.tsx - Fix Logout

**File**: `src/pages/InactiveOrganizationScreen.tsx`

### Change #2a: Add Loading State (After line 28)

**Before (Current)**
```typescript
24→  const [isCheckingStatus, setIsCheckingStatus] = useState(true);
25→  const [isOwner, setIsOwner] = useState(false);
26→  const [daysRemaining, setDaysRemaining] = useState<number | null>(null);
27→  const [isOverdue, setIsOverdue] = useState(false);
28→  const [isLeavingOrg, setIsLeavingOrg] = useState(false);
29→
30→  useEffect(() => {
```

**After (Fixed)**
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

### What Changed
- **Added line 29**: `const [isSigningOut, setIsSigningOut] = useState(false);`
- Tracks loading state during logout operation

---

### Change #2b: Replace handleSignOut Function (Lines 153-156)

**Before (Current - Buggy)**
```typescript
153→  const handleSignOut = () => {
154→    // Will trigger auth context sign out
155→    navigate('/auth/logout');
156→  };
```

**After (Fixed)**
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

### What Changed
- **Line 153**: Make function async
- **Line 155**: Set loading state
- **Line 156**: Call logout() from AuthContext (instead of navigate to non-existent route)
- **Line 157**: Navigate to actual login page with replace: true
- **Lines 158-162**: Error handling with logging and toast
- **Line 164**: Clear loading state

### Why These Changes
- `logout()` is already imported from useAuth (line 7, 20)
- Async/await allows proper error handling
- Loading state prevents double-clicks
- Error handling prevents silent failures
- `replace: true` prevents back-button confusion

---

### Change #2c: Update Sign Out Button (Lines 335-346)

**Before (Current)**
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

**After (Fixed)**
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

### What Changed
- **Line 337**: Add `disabled={isSigningOut}` to prevent clicks during logout
- **Line 345**: Replace `<span>→</span>` with loading spinner
- Shows visual feedback to user during logout operation

### Why These Changes
- `disabled` prevents double-click issues
- Spinner shows operation is in progress
- Removes the `→` arrow to make room for spinner
- Matches pattern used in other buttons (e.g., requestReactivation button on line 280-284)

---

## Summary of All Changes

### OrgContext.tsx
- 1 insertion (2 lines)
- No deletions
- No new imports
- No dependency changes

### InactiveOrganizationScreen.tsx
- 1 state variable addition
- 1 function replacement (13 lines → 14 lines)
- 1 button update (add disabled state, replace arrow with spinner)
- Total: 3 sections modified, 1 new state variable

## Verification Checklist

After making changes, verify:

1. **Syntax**
   - [ ] No TypeScript errors
   - [ ] All brackets balanced
   - [ ] All semicolons present

2. **Imports**
   - [ ] `logout` is destructured from useAuth (line 20)
   - [ ] `RefreshCw` is imported from lucide-react (line 3)
   - [ ] `toast` is imported from sonner (line 14)
   - [ ] `logger` is available (line 15)

3. **State Variables**
   - [ ] `isSigningOut` defined in state block
   - [ ] Initial value is `false`

4. **Handler Function**
   - [ ] Function is async
   - [ ] Sets isSigningOut to true/false correctly
   - [ ] Calls logout() from AuthContext
   - [ ] Error handling present
   - [ ] Navigation goes to '/auth/login' with replace: true

5. **Button**
   - [ ] disabled prop set to isSigningOut
   - [ ] Spinner shows when isSigningOut is true
   - [ ] Arrow removed

## File Line Mapping

### src/lib/contexts/OrgContext.tsx
- Line 15: `import React, createContext...`
- Line 30: `import logger from '@/lib/utils/logger';`
- Line 213-222: **useEffect - FIX LOCATION**

### src/pages/InactiveOrganizationScreen.tsx
- Line 1-3: `import { useState, useEffect } from 'react';`
- Line 3: `import { AlertCircle, RefreshCw, LogOut, Clock, Calendar, Mail, UserX }`
- Line 7: `import { useOrganizationContext } from '@/lib/hooks/useOrganizationContext';`
- Line 8: `import { useAuth } from '@/lib/contexts/AuthContext';`
- Line 14: `import { toast } from 'sonner';`
- Line 15: `import { logger } from '@/lib/utils/logger';`
- Line 20: `const { user } = useAuth();` **<-- logout is destructured here**
- Line 28: `const [isLeavingOrg, setIsLeavingOrg] = useState(false);` **<-- Add isSigningOut after this**
- Line 153-156: **handleSignOut function - FIX LOCATION**
- Line 335-346: **Sign Out button - FIX LOCATION**
