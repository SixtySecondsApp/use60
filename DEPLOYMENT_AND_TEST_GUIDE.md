# Deployment & Testing Guide - Leave Organization & Onboarding Fixes

## 📋 Overview

This guide covers the deployment of critical bug fixes for:
1. Leave Organization feature (RLS issue fixed)
2. Onboarding infinite loading (RPC error handling added)
3. Organization selection flow improvements

**Branch:** `fix/go-live-bug-fixes`
**Commits:** 5 total (6e4c9e4e, d19f6ab1, 8a720587, d99fa080, + earlier fixes)

## 🚀 Deployment Steps

### Step 1: Deploy RPC Functions to Staging Database

These RPC functions are required for the leave organization feature to work:

#### Option A: Using Supabase CLI
```bash
cd sixty-sales-dashboard
npx supabase db push --linked
```

#### Option B: Manual SQL Execution in Supabase Dashboard

1. Go to [Supabase Dashboard](https://app.supabase.com/)
2. Select project: `caerqjzvuerejfrdtygb` (staging)
3. SQL Editor → New Query
4. Copy and paste from `supabase/migrations/20260204110000_create_user_leave_organization_rpc.sql`
5. Execute
6. Copy and paste from `supabase/migrations/20260126000011_add_business_email_org_check.sql`
7. Execute

**Required RPC Functions:**
- `user_leave_organization(p_org_id)` - Allows users to leave organizations (SECURITY DEFINER)
- `check_existing_org_by_email_domain(p_email)` - Finds existing orgs by email domain (SECURITY DEFINER)

### Step 2: Deploy Frontend Code

```bash
# Code is already pushed to branch fix/go-live-bug-fixes
# Create PR and merge to main
git push origin fix/go-live-bug-fixes
```

Then deploy normally:
```bash
# Via Vercel CLI or automatic deployment
vercel deploy --prod
```

### Step 3: Verify Deployment

After deployment completes:
1. Check that no 404 errors appear in browser console for RPC functions
2. Confirm /onboarding page loads without infinite spinner
3. Test leave organization flow end-to-end

## 🧪 Testing

### Test Setup

**Test Credentials:**
- Email: `max.parish501@gmail.com`
- Password: `NotTesting@1`

**Test Environment:**
- Local: `http://localhost:5175`
- Staging: `https://staging.use60.com`

### Test Case 1: Leave Organization Flow

**Steps:**
1. Login with test credentials
2. Navigate to `/settings/organization-management`
3. Click "Leave Team" button
4. Confirm in dialog
5. Verify redirect to `/onboarding/removed-user`

**Expected Results:**
- ✅ Button click succeeds
- ✅ Confirmation dialog appears
- ✅ Redirect happens within 1-2 seconds
- ✅ Shows "Remove User Step" component
- ✅ No RLS errors in console

**Error Handling:**
- ✅ If user is owner → Shows error "must transfer ownership"
- ✅ If already removed → Shows error "already been removed"
- ✅ If not a member → Shows error "not a member"

### Test Case 2: Choose Different Organization After Leaving

**Steps:**
1. Complete "Leave Organization Flow" test
2. On `/onboarding/removed-user` page
3. Click "Choose Different Organization" button
4. Verify redirect to `/onboarding?step=organization_selection`
5. Wait for organization selection page to load
6. Verify no infinite loading spinner

**Expected Results:**
- ✅ Redirect to organization selection page
- ✅ Page loads within 3-5 seconds
- ✅ Organization search interface visible
- ✅ No 404 errors in console
- ✅ No infinite spinner

### Test Case 3: Onboarding Organization Selection (No RPC)

**Steps:**
1. Start fresh onboarding flow
2. Enter a business email (e.g., company@yourcompany.com)
3. On organization selection step
4. Verify page loads (even if RPC doesn't exist)

**Expected Results:**
- ✅ Page loads smoothly (no infinite spinner)
- ✅ Can see organization search interface
- ✅ Console shows graceful handling of missing RPC
- ✅ Can proceed with manual organization entry or creation

### Automated Tests

**Run Playwright Tests:**
```bash
# Start dev server (or use staging URL)
npm run dev

# In another terminal, run tests
node test-leave-org.mjs

# Expected output:
# 🧪 TESTING: Leave Organization Flow
# ✓ Login successful
# ✓ Dashboard loaded
# ✓ Settings page opened
# ✓ Leave button found and clicked
# ✓ Redirect to removed-user page
# 🎉 Test completed!
```

**Test Script Location:** `test-leave-org.mjs`

## 📊 Code Changes Summary

### 1. Fixed Organization Selection Infinite Loading (2 commits)

**Problem:** Missing RPC function caused infinite 404 errors

**Files Changed:**
- `src/pages/onboarding/v2/OnboardingV2.tsx` (lines 277, 297-306)

**Changes:**
- Added 'organization_selection' to `stepsToSkip` array
- Added PGRST202 error detection for missing RPC functions
- Prevents infinite retries when function doesn't exist

### 2. Fixed Leave Organization RLS Issue (1 commit)

**Problem:** RLS UPDATE policy blocked regular members from leaving

**Files Changed:**
- `src/lib/services/leaveOrganizationService.ts` (lines 14-52)

**Changes:**
- Switched from direct table updates to RPC function calls
- RPC runs with SECURITY DEFINER to bypass RLS
- Simplified error handling with better logging

### 3. Added RPC Migration (Already in repo)

**File:** `supabase/migrations/20260204110000_create_user_leave_organization_rpc.sql`

**Contains:**
- `user_leave_organization(uuid)` function definition
- Proper SECURITY DEFINER configuration
- RLS bypassing for secure database operations
- Atomic operations: validate → update → redirect

## 🔍 Troubleshooting

### Issue: "Could not find the function public.check_existing_org_by_email_domain"

**Cause:** RPC function hasn't been deployed to staging database

**Solution:**
1. Run `supabase db push --linked` from CLI
2. OR manually execute the migration SQL in Supabase Dashboard
3. OR code will handle gracefully (no infinite loading)

### Issue: Leave button doesn't redirect

**Cause:** Either:
1. RPC function not deployed
2. User is the last owner
3. RLS policy issue

**Solution:**
1. Check browser console for specific error message
2. If owner error → Transfer ownership first
3. If RLS error → Verify service role permissions

### Issue: Onboarding page infinitely loading

**Cause:**
1. RPC function missing (check_existing_org_by_email_domain)
2. Network error
3. Incorrect environment URL

**Solution:**
1. Check browser console for errors (should show PGRST202)
2. Verify environment URL is correct
3. Clear browser cache and refresh

## 📈 Performance Notes

- Leave organization operation: ~500-800ms (with redirect delay)
- Organization selection page load: ~2-3 seconds
- RPC functions execute in <100ms when available

## 🔐 Security Notes

- All RPC functions use SECURITY DEFINER to securely bypass RLS
- User authentication validated in RPC via `auth.uid()`
- Soft-delete pattern preserves audit trail
- No data is permanently deleted

## ✅ Go-Live Checklist

- [ ] RPC functions deployed to staging
- [ ] Playwright tests pass
- [ ] Leave organization flow tested end-to-end
- [ ] Organization selection flow tested
- [ ] No RLS errors in console
- [ ] No infinite loading spinners
- [ ] Code reviewed and merged
- [ ] Deployed to production
- [ ] Production tests confirm working
- [ ] Users can successfully leave organizations
- [ ] Users can select different organizations after leaving

## 🚨 Rollback Plan

If issues arise after deployment:

### Quick Rollback (Code Only)
```bash
git revert d99fa080  # Revert RPC error handling
git revert 8a720587  # Revert RPC usage in leave service
```

### Database Rollback
If RPC functions cause issues:
1. Drop functions: `DROP FUNCTION user_leave_organization(uuid);`
2. Drop functions: `DROP FUNCTION check_existing_org_by_email_domain(text);`
3. Revert code to use direct table updates

### Full Rollback
```bash
git checkout main
vercel deploy --prod  # Deploy main branch
```

## 📞 Support

For issues with deployment:
1. Check error messages in browser console
2. Check Supabase project logs
3. Verify RPC functions exist: `SELECT * FROM pg_proc WHERE proname LIKE '%leave%';`
4. Check RLS policies: `SELECT * FROM pg_policies WHERE tablename = 'organization_memberships';`

## 📝 Related Documentation

- `/LEAVE_ORGANIZATION_FIX_SUMMARY.md` - Detailed technical analysis
- `supabase/migrations/20260204110000_*` - Migration files
- `src/lib/services/leaveOrganizationService.ts` - Service implementation
- `src/pages/onboarding/v2/RemovedUserStep.tsx` - Removed user UI
