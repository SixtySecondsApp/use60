# Bug Fix: Cancel Request Redirect Loop

## Issue
When users clicked "Cancel Request & Restart Onboarding" on the pending approval page, they were successfully canceling their join request but immediately getting redirected back to the pending approval page instead of reaching the onboarding flow.

## Root Causes

### 1. Stale React State in ProtectedRoute
**Problem**: The `hasPendingRequest` state in ProtectedRoute was not updated after the user canceled their request. The useEffect that checks for pending requests only runs when its dependencies change `[isAuthenticated, user, loading, isPublicRoute]`, none of which change during cancellation.

**Flow**:
1. User on pending-approval page → `hasPendingRequest = true`
2. User cancels request → Database deletion succeeds ✅
3. Navigate to `/onboarding` → ProtectedRoute remounts
4. `hasPendingRequest` still `true` (stale) ❌
5. Line 373 in ProtectedRoute redirects back to pending-approval ❌

### 2. Silent Error Swallowing in resetOnboardingState
**Problem**: The `resetOnboardingState()` function had a try-catch that swallowed all errors without propagating them. This allowed `cancelJoinRequest()` to return success even when the profile status wasn't actually reset to 'active'.

**Impact**: User would see success toast but remain stuck because `profile_status` was still 'pending_approval'.

### 3. No Synchronization Between Database and React State
**Problem**: Navigation happened with a fixed 1-second delay, but there was no mechanism to ensure ProtectedRoute's state was synchronized with the database changes before the redirect logic ran.

## Fixes Implemented

### Fix 1: Pass Navigation State Flag (Critical - P0)
**Files Modified**:
- `src/pages/auth/PendingApprovalPage.tsx`
- `src/components/ProtectedRoute.tsx`

**Changes**:
1. Pass `{ fromCancelRequest: true }` in navigation state when canceling
2. Check for this flag in ProtectedRoute's pending request blocking logic
3. Skip the redirect if user just canceled their request

**Code**:
```typescript
// PendingApprovalPage.tsx
navigate('/onboarding?step=website_input', {
  replace: true,
  state: { fromCancelRequest: true } // Signal to ProtectedRoute
});

// ProtectedRoute.tsx
const fromCancelRequest = location.state?.fromCancelRequest;
if (hasPendingRequest === true && !fromCancelRequest) {
  // Only redirect if NOT from cancel request
  navigate('/auth/pending-approval', { replace: true });
}
```

### Fix 2: Proper Error Handling in resetOnboardingState (High - P1)
**Files Modified**:
- `src/lib/services/joinRequestService.ts`

**Changes**:
1. Changed `resetOnboardingState()` return type from `Promise<void>` to `Promise<{ success: boolean; error?: string }>`
2. Check errors from both database operations (profile update and onboarding progress)
3. Return error details instead of swallowing them
4. Check reset result before returning success in `cancelJoinRequest()`

**Code**:
```typescript
async function resetOnboardingState(userId: string): Promise<{ success: boolean; error?: string }> {
  try {
    const { error: profileError } = await supabase
      .from('profiles')
      .update({ profile_status: 'active' })
      .eq('id', userId);

    if (profileError) {
      return {
        success: false,
        error: `Failed to reset profile status: ${profileError.message}`,
      };
    }

    const { error: progressError } = await supabase
      .from('user_onboarding_progress')
      .upsert(...);

    if (progressError) {
      return {
        success: false,
        error: `Failed to reset onboarding progress: ${progressError.message}`,
      };
    }

    return { success: true };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Unknown error',
    };
  }
}
```

### Fix 3: Optimistic State Update (High - P1)
**Files Modified**:
- `src/components/ProtectedRoute.tsx`

**Changes**:
1. Added new useEffect that watches for `location.state.fromCancelRequest`
2. Immediately clears `hasPendingRequest` state when flag is detected
3. Ensures React state is synchronized before redirect logic runs

**Code**:
```typescript
// Force re-check when user cancels from pending-approval page
useEffect(() => {
  const fromCancelRequest = location.state?.fromCancelRequest;
  if (fromCancelRequest && isAuthenticated && user) {
    // Clear the stale hasPendingRequest state immediately
    setHasPendingRequest(false);
    setIsCheckingPendingRequest(false);
  }
}, [location.state, isAuthenticated, user]);
```

## Verification

### Build Check
✅ TypeScript compilation successful
✅ No new lint errors
✅ Build completes in 34.24s

### Manual Testing Required
- [ ] Cancel join request from pending-approval page
- [ ] Verify redirect to onboarding (not back to pending-approval)
- [ ] Complete onboarding flow successfully
- [ ] Verify no console errors during flow
- [ ] Test with slow 3G network (throttle in DevTools)
- [ ] Test browser refresh during cancel operation

### Test Cases to Add
```typescript
describe('Cancel Join Request Flow', () => {
  it('should redirect to onboarding after canceling request', async () => {
    // Setup: User on pending-approval page
    // Action: Click cancel button
    // Assert: Navigate to /onboarding with fromCancelRequest flag
    // Assert: ProtectedRoute skips pending check
    // Assert: User reaches onboarding page
  });

  it('should not redirect back to pending-approval', async () => {
    // Setup: User cancels request
    // Action: Navigate to /onboarding
    // Assert: hasPendingRequest is false
    // Assert: No redirect to pending-approval
  });

  it('should handle reset errors gracefully', async () => {
    // Setup: Mock database error on profile update
    // Action: Cancel request
    // Assert: Error message shown to user
    // Assert: User not redirected (stays on pending-approval)
  });
});
```

## Edge Cases Addressed

1. **Race condition between deletion and navigation**: Fixed by passing navigation state flag
2. **Stale React Query cache**: Fixed by optimistic state update
3. **Silent error failures**: Fixed by proper error handling and propagation
4. **Multiple useEffect dependencies**: Fixed by adding location.state dependency

## Risk Assessment

**Low Risk**: Changes are surgical and focused on the specific bug flow. The navigation state flag approach is non-breaking since it only affects the cancel request flow.

**Backward Compatibility**: ✅ All existing flows unaffected. The `fromCancelRequest` check only applies to this specific scenario.

**Performance Impact**: None. Adds minimal overhead (one extra useEffect with simple state check).

## Related Issues

- ORGREM-016: Organization membership status tracking
- Cancel and restart flow improvements
- Join request approval system

## Next Steps

1. Deploy to staging
2. Perform manual testing with all edge cases
3. Monitor for any related issues
4. Consider adding E2E tests for critical user flows
