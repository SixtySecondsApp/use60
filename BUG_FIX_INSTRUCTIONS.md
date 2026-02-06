# Bug Fix Instructions

## Overview
This document provides detailed instructions for fixing two critical bugs affecting the inactive organization flow:

1. **Infinite Load in OrgContext** - Redirect loop when accessing `/inactive-organization` page
2. **Cannot Log Out** - Non-existent `/auth/logout` route

---

## Bug #1: Infinite Load in OrgContext

### Problem Summary
Users navigating to `/inactive-organization` page experience an infinite loop because:
- OrgContext checks if `activeOrg.is_active === false` and redirects to `/inactive-organization`
- The page loads and renders, but the redirect keeps firing
- Browser history shows `/inactive-organization` loading over and over

### Root Cause
The useEffect at lines 213-222 in `src/lib/contexts/OrgContext.tsx` redirects whenever the org is inactive, with no check to prevent redirect when already on the target page.

```typescript
// Current problematic code
useEffect(() => {
  if (!activeOrg || !activeOrgId) return;

  // If org is inactive, redirect immediately
  if (activeOrg.is_active === false) {
    logger.log('[OrgContext] Active org is inactive, redirecting to inactive page');
    window.location.href = '/inactive-organization';  // Always fires!
  }
}, [activeOrg, activeOrgId]);
```

### Solution

**File**: `C:\Users\Media 3\Desktop\Max-Projects\sixty-sales-dashboard\src\lib\contexts\OrgContext.tsx`
**Lines**: 213-222

Add a pathname check (like ProtectedRoute.tsx line 387) before the redirect:

```typescript
// Check if active org is inactive and redirect to inactive page
useEffect(() => {
  if (!activeOrg || !activeOrgId) return;

  // Prevent redirect loop when already on inactive-organization page
  if (window.location.pathname.includes('/inactive-organization')) return;

  // If org is inactive, redirect immediately
  if (activeOrg.is_active === false) {
    logger.log('[OrgContext] Active org is inactive, redirecting to inactive page');
    window.location.href = '/inactive-organization';
  }
}, [activeOrg, activeOrgId]);
```

### Key Changes
- Add pathname check right after null checks
- Use `window.location.pathname.includes('/inactive-organization')` to detect if already on the page
- This prevents the redirect from firing when the page loads
- Follows the exact pattern used successfully in ProtectedRoute.tsx line 387

### Why This Works
- ProtectedRoute already implements this pattern successfully (line 387)
- The `.includes()` approach is safe because we're only checking the path, not route params
- No dependencies change on the pathname check (it's a one-time local variable check)
- OrgContext can still redirect users from other pages when they land on an inactive org

### Testing Steps
1. Have an inactive organization
2. Navigate to `/inactive-organization`
3. Verify page loads without continuous redirects
4. Check browser DevTools Network tab - should see one GET request, not repeated requests
5. Verify page content displays (deactivation info, action buttons)
6. Verify buttons work (request reactivation, leave org, choose different org, sign out)

---

## Bug #2: Cannot Log Out

### Problem Summary
The Sign Out button on `/inactive-organization` page doesn't work because:
- Handler calls `navigate('/auth/logout')` which is not a real route
- No auth logout actually happens
- User stays on the page, confused about why nothing happened

### Root Cause
The `handleSignOut` function at line 153-156 in `src/pages/InactiveOrganizationScreen.tsx` tries to navigate to a non-existent route instead of calling the logout function from AuthContext.

```typescript
// Current problematic code
const handleSignOut = () => {
  // Will trigger auth context sign out
  navigate('/auth/logout');  // ❌ This route doesn't exist!
};
```

### Solution

**File**: `C:\Users\Media 3\Desktop\Max-Projects\sixty-sales-dashboard\src\pages\InactiveOrganizationScreen.tsx`
**Lines**: 1-20 (imports), 153-156 (handler)

#### Step 1: Update Imports

Replace the current imports section with:

```typescript
import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { AlertCircle, RefreshCw, LogOut, Clock, Calendar, Mail, UserX } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useOrganizationContext } from '@/lib/hooks/useOrganizationContext';
import { useAuth } from '@/lib/contexts/AuthContext';
import {
  requestOrganizationReactivation,
  getReactivationRequestStatus,
  type OrganizationReactivationRequest
} from '@/lib/services/organizationReactivationService';
import { removeOrganizationMember } from '@/lib/services/organizationAdminService';
import { toast } from 'sonner';
import { logger } from '@/lib/utils/logger';
import { supabase } from '@/lib/supabase/clientV2';
```

#### Step 2: Add Loading State

Add this state variable after line 28 (after `setIsLeavingOrg`):

```typescript
  const [isSigningOut, setIsSigningOut] = useState(false);
```

Full state section should now look like:
```typescript
  const [isRequesting, setIsRequesting] = useState(false);
  const [existingRequest, setExistingRequest] = useState<OrganizationReactivationRequest | null>(null);
  const [isCheckingStatus, setIsCheckingStatus] = useState(true);
  const [isOwner, setIsOwner] = useState(false);
  const [daysRemaining, setDaysRemaining] = useState<number | null>(null);
  const [isOverdue, setIsOverdue] = useState(false);
  const [isLeavingOrg, setIsLeavingOrg] = useState(false);
  const [isSigningOut, setIsSigningOut] = useState(false);  // NEW
```

#### Step 3: Replace Handler Function

Replace lines 153-156 with:

```typescript
  const handleSignOut = async () => {
    try {
      setIsSigningOut(true);
      await logout();
      navigate('/auth/login', { replace: true });
    } catch (err) {
      logger.error('[InactiveOrganizationScreen] Error signing out:', err);
      toast.error('Failed to sign out', {
        description: 'Please try again or contact support.'
      });
    } finally {
      setIsSigningOut(false);
    }
  };
```

#### Step 4: Update Button to Use Loading State

Replace the Sign Out button (lines 335-346) with:

```typescript
            <Button
              onClick={handleSignOut}
              disabled={isSigningOut}
              variant="outline"
              className="w-full justify-between"
              size="lg"
            >
              <span className="flex items-center gap-2">
                <LogOut className="w-4 h-4" />
                Sign Out
              </span>
              {isSigningOut && <RefreshCw className="w-4 h-4 animate-spin" />}
            </Button>
```

### Key Changes Summary
1. **Extract `logout` from useAuth()** - Already destructured on line 20
2. **Add `isSigningOut` state** - Tracks logout operation status
3. **Make handler async** - Allows waiting for logout completion
4. **Call logout() directly** - Uses AuthContext's logout function
5. **Navigate to /auth/login** - Goes to actual login page after success
6. **Add error handling** - Shows toast if logout fails
7. **Add loading state to button** - Disables button and shows spinner during logout

### Comparison to Working Example

This follows the exact pattern from RequestRejectedPage.tsx (lines 54-61):

```typescript
// Pattern from RequestRejectedPage.tsx (line 54-61)
const handleLogout = async () => {
  try {
    await logout();
    navigate('/auth/login', { replace: true });
  } catch (err) {
    toast.error('Failed to log out');
  }
};
```

### Testing Steps
1. Navigate to `/inactive-organization`
2. Click the "Sign Out" button
3. Verify button shows loading spinner
4. Verify user is logged out and redirected to `/auth/login`
5. Verify user cannot access `/dashboard` without logging in again
6. Test error case: If logout fails, verify error toast appears

### Why This Works
- `logout()` is the correct function from AuthContext (already imported on line 7)
- Uses the same async/await pattern as working code
- Error handling prevents silent failures
- Loading state prevents double-clicks
- Navigation uses `replace: true` to prevent back-button returning to inactive page
- Matches the established pattern in the codebase

---

## Implementation Checklist

- [ ] **Bug #1 - OrgContext**
  - [ ] Read OrgContext.tsx (verify lines 213-222)
  - [ ] Add pathname check to prevent redirect loop
  - [ ] Verify no additional dependencies added
  - [ ] Test on inactive organization
  - [ ] Verify ProtectedRoute still works correctly

- [ ] **Bug #2 - InactiveOrganizationScreen**
  - [ ] Verify `logout` is available from useAuth() hook (line 20)
  - [ ] Add `isSigningOut` state variable
  - [ ] Replace `handleSignOut` function with async version
  - [ ] Update button to include disabled state and loading spinner
  - [ ] Remove unused imports if any
  - [ ] Test sign out flow
  - [ ] Test error handling (if applicable)

---

## Deployment Notes

- Both fixes are backward compatible
- No database changes required
- No new dependencies added
- Minimal code footprint
- Follow existing codebase patterns
- No breaking changes to existing functionality
- Can be deployed independently

---

## Files Modified

1. `src/lib/contexts/OrgContext.tsx` - Lines 213-222
2. `src/pages/InactiveOrganizationScreen.tsx` - Lines 1-20 (imports), 28-29 (state), 153-156 (handler), 335-346 (button)

---

## Related Issues

- Infinite organization status checks causing load spam
- Keep inactive orgs in store to display inactive organization page
- Prevent infinite org active status checks

---

## References

- **Pattern source**: `src/components/ProtectedRoute.tsx` line 387 (pathname check)
- **Pattern source**: `src/pages/auth/RequestRejectedPage.tsx` lines 54-61 (logout handler)
- **Auth context**: `src/lib/contexts/AuthContext.tsx` (logout function definition)
