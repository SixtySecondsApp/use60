# Leave Organization Feature - Fix Summary

## 📋 Issue Overview

Users were unable to leave organizations. When clicking "Leave Team", the button would respond but no redirect would occur, and users remained members of the organization.

## 🔍 Root Cause Analysis

The explorer agent discovered that the **RLS (Row Level Security) UPDATE policy on `organization_memberships` table was blocking regular members from updating their own membership rows**. The policy required users to have `owner` or `admin` role to perform updates, but a regular `member` trying to leave doesn't have these privileges.

**Affected Code:**
- `src/lib/services/leaveOrganizationService.ts` - Attempting direct table updates
- RLS Policy in `supabase/migrations/20260202210000_allow_platform_admins_to_manage_org_members.sql`

## ✅ Solutions Applied

### 1. Fixed Onboarding Organization Selection Loading (Commits: 6e4c9e4e, d19f6ab1)

**Problem:** Organization selection page infinitely spun with 404 errors on missing RPC `check_existing_org_by_email_domain`.

**Solution:**
- Added `'organization_selection'` to `stepsToSkip` array in OnboardingV2.tsx to prevent RPC call when user is already selecting an organization
- Added better error handling for RPC failures to prevent infinite loading

**Files Changed:**
- `src/pages/onboarding/v2/OnboardingV2.tsx` (lines 273-316)

### 2. Fixed Leave Organization Flow (Commit: 8a720587)

**Problem:** RLS policy prevented members from updating their own membership records.

**Solution:**
- Converted `leaveOrganizationService` to use `user_leave_organization()` RPC function instead of direct table updates
- RPC function runs with `SECURITY DEFINER` to bypass RLS restrictions
- Enables atomic operations: validate member → soft delete membership → set redirect flag → return status

**Files Changed:**
- `src/lib/services/leaveOrganizationService.ts` (lines 14-52)

**How it Works:**
```
User clicks "Leave"
  ↓
RPC function called: user_leave_organization(p_org_id)
  ↓
RPC validates user is member (not owner)
  ↓
RPC updates organization_memberships (member_status = 'removed')
  ↓
RPC updates profiles (redirect_to_onboarding = true)
  ↓
RPC returns success
  ↓
Frontend redirects to /onboarding/removed-user
  ↓
RemovedUserStep shows options:
  - Request to rejoin
  - Choose different organization ✓
```

## 📋 Pre-Deployment Checklist

### Database Migrations Required

The following migration must be applied to staging/production databases:

**File:** `supabase/migrations/20260204110000_create_user_leave_organization_rpc.sql`

**What it does:**
- Creates `user_leave_organization(p_org_id uuid)` function with SECURITY DEFINER
- Validates user is active member (not owner)
- Marks membership as removed (soft delete)
- Sets redirect flag for onboarding redirect
- Grants execute permission to authenticated users

**How to apply:**
```bash
# Using Supabase CLI
supabase db push

# OR manually in Supabase Dashboard:
# SQL Editor → Execute the migration SQL
```

### Code Deployment

All frontend code changes are ready in commits:
- `6e4c9e4e` - Skip RPC for org selection step
- `d19f6ab1` - Add error handling for RPC failures
- `8a720587` - Use RPC for leave organization

These will auto-deploy with normal deployment process.

## 🧪 Testing Results

### Test Scenario
1. Login as regular member
2. Navigate to Organization Management
3. Click "Leave Team" button
4. Confirm in dialog
5. Expect: Redirect to `/onboarding/removed-user`
6. Expect: Options to "Request to Rejoin" or "Choose Different Organization"

### Current Test Status
- ✅ Login flow working
- ✅ Organization management page loads
- ✅ Leave button found and clickable
- ⏳ Redirect pending database RPC availability
- ⏳ Full flow test pending deployment

## 🚀 Deployment Steps

### Step 1: Apply Database Migration
```bash
cd sixty-sales-dashboard
npx supabase db push --linked
```

Or via Supabase Dashboard:
1. Go to SQL Editor
2. Copy-paste content from `supabase/migrations/20260204110000_create_user_leave_organization_rpc.sql`
3. Execute

### Step 2: Deploy Frontend Code
```bash
git push origin fix/go-live-bug-fixes
# Then merge PR and deploy normally
```

### Step 3: Test End-to-End
1. User logs in with regular member account
2. Navigate to `/settings/organization-management`
3. Click "Leave Team"
4. Confirm leave
5. Verify redirect to `/onboarding/removed-user`
6. Test "Choose Different Organization" flow

## 📊 Related Fixes in This Branch

This fix is part of a larger go-live bug fix branch that also includes:

1. ✅ **OB-001**: Fixed onboarding access for existing users
2. ✅ **OB-002**: Skip waitlist check for re-onboarding users
3. ✅ **OB-003**: Fixed email domain organization selection infinite loading
4. ✅ **ORG-LEAVE-001**: Leave organization with proper redirect

## 🔧 Fallback / Rollback Plan

If RPC function deployment fails:

1. **Fallback 1:** Modify RLS policy to allow members to update their own membership
   - File: `supabase/migrations/20260202210000_allow_platform_admins_to_manage_org_members.sql`
   - Change: Add `OR (org_id IN (SELECT org_id FROM organization_memberships WHERE user_id = auth.uid()))` to UPDATE policy

2. **Fallback 2:** Add alternative non-RPC path in service
   - Keep RPC call attempt
   - Catch 404/function-not-found errors
   - Fall back to direct table update with better error logging

3. **Rollback:** Revert commit `8a720587` and restore previous implementation with RLS policy fix

## 📝 Notes

- The soft-delete pattern (member_status = 'removed') preserves audit trail and data
- User can still request to rejoin through `RemovedUserStep` component
- Session storage flag `user_removed_redirect` ensures user stays on removed-user page
- Auth context also checks `redirect_to_onboarding` flag for additional safety

## 🎯 Success Criteria

- ✅ User can click "Leave Team" button
- ✅ No errors in browser console
- ✅ User is redirected to `/onboarding/removed-user`
- ✅ User can see "Choose Different Organization" option
- ✅ User can complete organization selection flow
- ✅ No infinite loading spinners
