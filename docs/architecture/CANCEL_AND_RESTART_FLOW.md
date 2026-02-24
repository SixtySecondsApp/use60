# Cancel and Restart Onboarding Flow

## Overview
Users with pending join requests can now cancel their request and restart the onboarding process to either:
- Create a new organization
- Request to join a different organization

## Changes Made

### 1. Database Layer ✅

**Migration: `20260122000001_add_cancel_join_request_rpc.sql`**
- Added `cancel_join_request(p_request_id, p_user_id)` RPC function
- Deletes the pending join request
- Resets profile status to `'active'`
- Resets onboarding progress to `'website_input'` step
- Clears onboarding completion date

### 2. Frontend Components ✅

**Updated: `src/lib/stores/onboardingV2Store.ts`**
- Fixed `reset()` function to set `currentStep: 'website_input'` (was incorrectly set to `'enrichment_loading'`)
- Ensures onboarding starts from the beginning when restarted

**Updated: `src/App.tsx`**
- Added direct import for `PendingApprovalPage`
- Added route: `/auth/pending-approval`

**Updated: `src/components/ProtectedRoute.tsx`**
- Added `/auth/pending-approval` to public routes list
- Ensures users can access pending approval page without redirect loops

**Existing: `src/pages/auth/PendingApprovalPage.tsx`**
- Already has "Cancel Request & Restart Onboarding" button (line 239-252)
- Calls `cancelJoinRequest(requestId, userId)`
- On success, redirects to `/onboarding?step=website_input`

**Existing: `src/pages/onboarding/v2/PendingApprovalStep.tsx`**
- Already has "Cancel Request & Restart Onboarding" button (line 179-209)
- Calls `cancelJoinRequest(requestId, userId)`
- Resets onboarding store state
- On success, redirects to `/onboarding?step=website_input`

### 3. Service Layer ✅

**Existing: `src/lib/services/joinRequestService.ts`**
- `cancelJoinRequest(requestId, userId)` function already implemented
- Calls the `cancel_join_request` RPC
- Returns success/error status

## User Flow

### Current State (Pending Approval)
1. User signs up with business email
2. Matches existing organization
3. Submits join request
4. Profile status set to `'pending_approval'`
5. User is redirected to `/auth/pending-approval`

### Cancel and Restart Flow
1. **User clicks "Cancel Request & Restart Onboarding" button**
   - Shows confirmation dialog

2. **System executes `cancel_join_request()` RPC**
   ```sql
   DELETE FROM organization_join_requests WHERE id = request_id;
   UPDATE profiles SET profile_status = 'active' WHERE id = user_id;
   UPDATE user_onboarding_progress SET onboarding_step = 'website_input', onboarding_completed_at = NULL WHERE user_id = user_id;
   ```

3. **Frontend redirects to `/onboarding?step=website_input`**
   - Onboarding store is reset
   - User starts fresh from website input step

4. **User can now:**
   - Enter a different company website
   - Choose to join a different organization
   - Create a new organization

## Testing

### Manual Testing Steps

1. **Setup**
   ```bash
   # Ensure migrations are applied
   supabase db push --linked --include-all
   ```

2. **Create Test Scenario**
   - Sign up with a business email that matches an existing org
   - Submit join request
   - Verify you're on `/auth/pending-approval` page

3. **Test Cancel Flow**
   - Click "Cancel Request & Restart Onboarding"
   - Confirm the action
   - Verify you're redirected to `/onboarding?step=website_input`
   - Verify you can enter a new website URL
   - Verify you can complete onboarding

4. **Database Verification**
   ```sql
   -- Run the test script
   -- Edit the script to replace YOUR_EMAIL_HERE with test user email
   -- Replace YOUR_USER_ID_HERE with test user ID
   ```

   See `supabase/scripts/test-cancel-and-restart-flow.sql` for full test script.

### Expected Outcomes

✅ **After Cancel:**
- Join request is deleted from `organization_join_requests`
- Profile status is `'active'`
- Onboarding step is `'website_input'` (or NULL)
- User can access onboarding flow
- User is NOT redirected to pending approval page

❌ **What Should NOT Happen:**
- User should NOT remain stuck on pending approval page
- Profile status should NOT remain `'pending_approval'`
- Join request should NOT still exist

## Key Files

### Database
- `supabase/migrations/20260122000001_add_cancel_join_request_rpc.sql`

### Frontend
- `src/pages/auth/PendingApprovalPage.tsx` - Main pending approval UI
- `src/pages/onboarding/v2/PendingApprovalStep.tsx` - Onboarding step variant
- `src/lib/services/joinRequestService.ts` - Service layer
- `src/lib/stores/onboardingV2Store.ts` - State management
- `src/App.tsx` - Route configuration
- `src/components/ProtectedRoute.tsx` - Route protection logic

### Test Scripts
- `supabase/scripts/test-cancel-and-restart-flow.sql` - Comprehensive flow test
- `supabase/scripts/check-and-fix-join-requests.sql` - Data validation and repair

## Troubleshooting

### Issue: User stuck on pending approval page after cancel
**Solution:** Check that:
1. Profile status is `'active'` in database
2. Join request is deleted
3. Browser has reloaded/refreshed to get new auth state

### Issue: User redirected back to pending approval after cancel
**Solution:**
1. Clear browser cache
2. Verify `cancel_join_request` RPC completed successfully
3. Check browser console for errors

### Issue: Onboarding shows wrong step after restart
**Solution:**
1. Verify `reset()` function sets `currentStep: 'website_input'`
2. Check `user_onboarding_progress` table has `onboarding_step = 'website_input'`
3. Clear local storage and reload

## Additional Notes

- The cancel functionality respects user data privacy - only the user who created the request can cancel it
- Admins cannot cancel join requests on behalf of users (they can only approve/reject)
- After canceling, users can request to join the same organization again if desired
- The RPC function is wrapped with `SECURITY DEFINER` to ensure proper permissions
