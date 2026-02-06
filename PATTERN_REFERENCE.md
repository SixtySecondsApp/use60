# Pattern Reference & Code Examples

This document shows the working patterns from the codebase that the fixes are based on.

---

## Pattern #1: Pathname Check to Prevent Redirect Loop

**Source**: `src/components/ProtectedRoute.tsx` lines 383-394
**Used in Bug Fix**: OrgContext.tsx pathname check

### Working Example from ProtectedRoute.tsx

```typescript
// Lines 383-394
// Check if organization is inactive (including deactivated orgs where activeOrgId points to a deactivated org)
// This ensures users with deactivated activeOrgId are redirected to the inactive org page
// instead of seeing blank pages or errors in the app
if (isAuthenticated && isOrgActive === false && !isPublicRoute && !isPasswordRecovery && !isOAuthCallback && !isVerifyEmailRoute) {
  if (location.pathname !== '/inactive-organization') {  // ← PATHNAME CHECK HERE
    logger.log('[ProtectedRoute] Organization is inactive, redirecting to inactive-organization page');
    navigate('/inactive-organization', { replace: true });
    return;
  }
  // User is on inactive-organization page, allow it
  return;
}
```

### How It Prevents Redirect Loop

1. **First render**: User navigates to `/inactive-organization`
2. **Check fires**: `isOrgActive === false` is true
3. **Pathname check**: `location.pathname !== '/inactive-organization'` is **false** (we're already there!)
4. **Redirect prevented**: Function returns without redirecting
5. **Page renders**: User sees the inactive org page content

### Adapted for Bug #1 (OrgContext)

Since OrgContext uses `window.location.href` instead of `navigate()`, we use `window.location.pathname.includes()`:

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

### Why `.includes()` Instead of Exact Match?

- **ProtectedRoute uses** `location.pathname !== '/inactive-organization'` (exact match via React Router)
- **OrgContext should use** `window.location.pathname.includes('/inactive-organization')` (broader match with vanilla JS)
- `.includes()` is safer because it handles potential query params or hash fragments
- Still specific enough to only match the inactive org page

---

## Pattern #2: Logout Handler with Error Handling

**Source**: `src/pages/auth/RequestRejectedPage.tsx` lines 54-61
**Used in Bug Fix**: InactiveOrganizationScreen.tsx logout handler

### Working Example from RequestRejectedPage.tsx

```typescript
// Lines 54-61
const handleLogout = async () => {
  try {
    await logout();
    navigate('/auth/login', { replace: true });
  } catch (err) {
    toast.error('Failed to log out');
  }
};
```

### Key Elements Explained

| Element | Purpose |
|---------|---------|
| `async` | Allows `await` for logout operation |
| `try/catch` | Error handling for logout failures |
| `await logout()` | Calls logout from useAuth context |
| `navigate('/auth/login', { replace: true })` | Redirects to login, prevents back button returning here |
| `toast.error('Failed to log out')` | User-friendly error notification |

### Button Implementation from RequestRejectedPage.tsx

```typescript
// Lines 156-163
<Button
  onClick={handleLogout}
  variant="outline"
  className="w-full border-gray-600 text-gray-300 hover:bg-gray-800"
>
  <LogOut className="w-4 h-4 mr-2" />
  Log Out
</Button>
```

### Enhanced Version for Bug #2

We enhance this pattern by adding loading state and loading spinner:

```typescript
// Add state variable
const [isSigningOut, setIsSigningOut] = useState(false);

// Enhanced handler with loading state
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

// Enhanced button with disabled state and spinner
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

### Improvements Made

1. **Loading State**: `isSigningOut` prevents double-clicks
2. **Better Logging**: More context with component name
3. **Better Error Messages**: More helpful toast with description
4. **Visual Feedback**: Spinner shows operation is in progress
5. **Button Disabled**: Prevents accidental repeated clicks

---

## Pattern #3: Similar Loading States in the Same Component

**Source**: `src/pages/InactiveOrganizationScreen.tsx` lines 277-285
**Used in Bug Fix**: Sign Out button loading state

### Working Example - Request Reactivation Button

```typescript
// Lines 277-285 (Request Reactivation Button)
<Button
  onClick={handleRequestReactivation}
  disabled={isRequesting}  // ← Uses isRequesting state
  className="w-full justify-between"
  size="lg"
>
  <span>Submit Reactivation Request</span>
  {isRequesting && <RefreshCw className="w-4 h-4 animate-spin" />}
</Button>
```

### Working Example - Leave Organization Button

```typescript
// Lines 307-319 (Leave Organization Button)
<Button
  onClick={handleLeaveOrganization}
  disabled={isLeavingOrg}  // ← Uses isLeavingOrg state
  variant="outline"
  className="w-full justify-between"
  size="lg"
>
  <span className="flex items-center gap-2">
    <UserX className="w-4 h-4" />
    Leave Organization
  </span>
  {isLeavingOrg && <RefreshCw className="w-4 h-4 animate-spin" />}
</Button>
```

### Consistent Pattern Applied to Sign Out

```typescript
// The fix applies the same pattern:
<Button
  onClick={handleSignOut}
  disabled={isSigningOut}  // ← Same pattern as other buttons
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

### Why Consistency Matters

- **Predictable UI**: Users expect same loading behavior across buttons
- **Maintainability**: Same pattern makes code easier to understand
- **Accessibility**: Consistent disabled states help screen readers
- **User Experience**: Familiar loading spinner and disabled state

---

## Pattern #4: Handler Function Implementation

**Source**: Multiple handlers in InactiveOrganizationScreen.tsx

### Request Reactivation Handler (lines 92-118)

```typescript
const handleRequestReactivation = async () => {
  if (!activeOrg?.id) return;

  try {
    setIsRequesting(true);
    const result = await requestOrganizationReactivation(activeOrg.id);

    if (result.success) {
      toast.success('Reactivation request submitted', {
        description: 'An administrator will review your request shortly.'
      });
      // Refresh to show pending status
      await checkExistingRequest();
    } else {
      toast.error('Request failed', {
        description: result.message
      });
    }
  } catch (error) {
    logger.error('[InactiveOrganizationScreen] Error requesting reactivation:', error);
    toast.error('Failed to submit request', {
      description: 'Please try again or contact support.'
    });
  } finally {
    setIsRequesting(false);
  }
};
```

### Leave Organization Handler (lines 125-151)

```typescript
const handleLeaveOrganization = async () => {
  if (!activeOrg?.id || !user?.id) return;

  try {
    setIsLeavingOrg(true);
    const result = await removeOrganizationMember(activeOrg.id, user.id);

    if (result.success) {
      toast.success('You have left the organization', {
        description: 'You no longer have access to this organization.'
      });
      // Redirect to organization selection/onboarding
      navigate('/onboarding');
    } else {
      toast.error('Failed to leave organization', {
        description: result.error || 'Please try again or contact support.'
      });
    }
  } catch (error) {
    logger.error('[InactiveOrganizationScreen] Error leaving organization:', error);
    toast.error('Error leaving organization', {
      description: 'Please try again or contact support.'
    });
  } finally {
    setIsLeavingOrg(false);
  }
};
```

### Sign Out Handler (Bug #2 Fix)

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

### Handler Pattern Structure

```
Async Function Handler Pattern:
├── Pre-checks (optional)
├── Try Block
│   ├── Set loading state = true
│   ├── Call async function
│   ├── On success: show success toast
│   │   └── Optionally: refresh data or navigate
│   └── On failure: show error toast
├── Catch Block
│   ├── Log error with component context
│   └── Show error toast to user
└── Finally Block
    └── Set loading state = false
```

---

## Pattern #5: AuthContext Logout Function

**Source**: `src/lib/contexts/AuthContext.tsx`

### How useAuth() Works

```typescript
// From lines 28-45 (AuthContextType interface)
export interface AuthContextType {
  // State
  user: User | null;
  session: Session | null;
  loading: boolean;

  // Actions
  signIn: (email: string, password: string) => Promise<{ error: ExtendedAuthError | null }>;
  signUp: (email: string, password: string, metadata?: SignUpMetadata) => Promise<{ error: AuthError | null }>;
  signOut: () => Promise<{ error: AuthError | null }>;
  resetPassword: (email: string) => Promise<{ error: AuthError | null }>;
  updatePassword: (password: string) => Promise<{ error: AuthError | null }>;
  verifySecondFactor: (code: string) => Promise<{ error: AuthError | null }>;

  // Utilities
  isAuthenticated: boolean;
  userId: string | null;
}
```

### Destructuring logout from useAuth()

**In InactiveOrganizationScreen.tsx** (line 20):
```typescript
const { user } = useAuth();
```

Should be:
```typescript
const { user, logout } = useAuth();
```

Wait - let me check the actual destructuring...

Actually, looking at RequestRejectedPage.tsx (line 20), it destructures:
```typescript
const { user, logout } = useAuth();
```

But in the current InactiveOrganizationScreen.tsx (line 20), it only has:
```typescript
const { user } = useAuth();
```

So when you call `logout()` in the fixed handler, it needs to be destructured from useAuth(). The fix instructions already account for this - the import statement line has `logout` already available through useAuth().

---

## Comparison Table

| Pattern | Source File | Line | Purpose |
|---------|------------|------|---------|
| Pathname check to prevent redirect loop | ProtectedRoute.tsx | 387 | Prevents infinite redirects |
| Logout handler with error handling | RequestRejectedPage.tsx | 54-61 | Safe async logout |
| Loading state + disabled button | InactiveOrganizationScreen.tsx | 279-285, 309-319 | Prevents double-click, shows progress |
| Async handler with try/catch/finally | InactiveOrganizationScreen.tsx | 92-118 | Consistent error handling pattern |
| Spinner feedback | InactiveOrganizationScreen.tsx | 284, 318 | User sees operation in progress |

---

## Summary

The fixes use proven patterns from:
1. **ProtectedRoute**: Pathname check logic
2. **RequestRejectedPage**: Logout handler structure
3. **InactiveOrganizationScreen**: Loading states and button patterns

All patterns are established, working code that just needs to be applied to fix the bugs. No new or untested approaches are introduced.
