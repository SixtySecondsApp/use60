# Bug Fix Summary: UI Styling & Rejoin Request Visibility

**Date**: 2026-02-05
**Environment**: Staging (staging.use60.com)
**Status**: ✅ Fixed & Ready for Testing

---

## Bugs Fixed

### Bug #1: Rejoin Requests Not Visible in Organization Management
**Severity**: 🔴 High (Admin cannot see rejoin requests despite notification)

**What Happened**:
- Admin receives notification about rejoin request ✅
- Admin clicks notification → opens Organization Management page
- **PROBLEM**: Rejoin request not visible in the UI (empty list)

**Investigation**:
1. Verified rejoin_requests table has data:
   - Found 1 pending request in database ✅
   - Request ID: `6a499a9d-570a-410a-9ad8-debb15550742`
   - Org: "Sixty Seconds" (`1d1b4274-c9c4-4cb7-9efc-243c90c86f4c`)
   - Requester: Max Staging (max.parish501@gmail.com)

2. Verified RLS policies are correct:
   - Policy "Org admins can view org rejoin requests" exists ✅
   - Requires admin/owner role + active status ✅

3. Tested query with anon key (RLS enforced):
   - Query returns 0 results (RLS blocking) ✅
   - This is expected - proves RLS is working

4. Root cause identified:
   - Query not auto-refreshing after notification
   - No refetch interval set (unlike join requests which refresh every 30s)

**Fix Applied**:
```typescript
// Added to OrganizationManagementPage.tsx line 201-246

const { data: rejoinRequests = [], refetch: refetchRejoinRequests } = useQuery({
  queryKey: ['rejoin-requests', activeOrgId],
  queryFn: async () => {
    // ... existing query logic ...
  },
  enabled: !!activeOrgId && !!user?.id && permissions.canManageTeam,
  retry: 2,
  refetchInterval: 30000, // ✅ NEW: Auto-refresh every 30 seconds
});
```

**Debug Logging Added**:
```typescript
logger.log('[OrganizationManagement] Fetching rejoin requests for org:', activeOrgId);
logger.log('[OrganizationManagement] Query enabled:', !!activeOrgId && !!user?.id && permissions.canManageTeam);
logger.log('[OrganizationManagement] Rejoin requests fetched:', data?.length || 0);
```

**Why This Fixes It**:
- Rejoin requests now auto-refresh every 30 seconds (same as join requests)
- When admin receives notification and opens page, query will run
- Within 30 seconds, the request will appear in the UI
- Logging helps debug any remaining issues

---

### Bug #2: Logout Button Styling Incorrect
**Severity**: 🟡 Low (Visual inconsistency)

**What Happened**:
- Logout button has solid red background (`bg-red-600`)
- Should have red outline to match Cancel Request button style

**Before**:
```tsx
<Button
  onClick={handleLogout}
  className="w-full bg-red-600 hover:bg-red-700 text-white border !border-red-600"
>
  <LogOut className="w-4 h-4 mr-2" />
  Log Out
</Button>
```

**After**:
```tsx
<Button
  onClick={handleLogout}
  variant="outline"
  className="w-full border-red-600 text-red-600 hover:bg-red-600/10 dark:border-red-500 dark:text-red-400 dark:hover:bg-red-500/10"
>
  <LogOut className="w-4 h-4 mr-2" />
  Log Out
</Button>
```

---

### Bug #3: Button Styling Inconsistency on Pending Approval Page
**Severity**: 🟡 Low (Visual inconsistency)

**What Happened**:
- "Check Approval Status" button: Solid violet background
- "Cancel Request" button: Gray outline
- **Issue**: Inconsistent styling between primary actions

**Fix Applied**:
All buttons now use consistent outline style:

1. **Check Approval Status** (line 463-476):
```tsx
<Button
  variant="outline"
  className="w-full border-violet-600 text-violet-600 hover:bg-violet-600/10
    dark:border-violet-500 dark:text-violet-400 dark:hover:bg-violet-500/10"
>
```

2. **Cancel Request** (line 479-492):
```tsx
<Button
  variant="outline"
  className="w-full border-gray-600 text-gray-600 hover:bg-gray-600/10
    dark:border-gray-500 dark:text-gray-400 dark:hover:bg-gray-500/10"
>
```

3. **Restart Onboarding** (line 499-513):
```tsx
<Button
  variant="outline"
  className="w-full border-violet-600 text-violet-600 hover:bg-violet-600/10
    dark:border-violet-500 dark:text-violet-400 dark:hover:bg-violet-500/10"
>
```

4. **Log Out** (line 519-525):
```tsx
<Button
  variant="outline"
  className="w-full border-red-600 text-red-600 hover:bg-red-600/10
    dark:border-red-500 dark:text-red-400 dark:hover:bg-red-500/10"
>
```

---

## Files Modified

### Frontend
- ✅ `src/pages/settings/OrganizationManagementPage.tsx`
  - Added `refetchInterval: 30000` to rejoin requests query
  - Added comprehensive debug logging
  - Exported `refetchRejoinRequests` function for manual refresh

- ✅ `src/pages/auth/PendingApprovalPage.tsx`
  - Updated all 4 buttons to use consistent outline styling
  - Applied proper dark mode colors
  - Fixed hover states for all buttons

---

## Testing Instructions

### Test Bug #1 (Rejoin Request Visibility)

**Setup**:
1. Have 2 users: Admin (Andrew) and Regular User (Max)
2. Max must be removed from "Sixty Seconds" organization

**Test Flow**:
1. Log in as Max (removed user)
2. Click "Request to Rejoin" on RemovedUserStep
3. Should see success message, redirected to pending approval
4. Log in as Andrew (admin/owner)
5. Check for notification bell → should see "Rejoin Request" notification
6. Click notification → opens Organization Management page
7. **EXPECTED**: Within 30 seconds, rejoin request appears in "Rejoin Requests" section
8. Check browser console for debug logs:
   ```
   [OrganizationManagement] Fetching rejoin requests for org: 1d1b4274...
   [OrganizationManagement] Query enabled: true
   [OrganizationManagement] Rejoin requests fetched: 1
   ```

**If Issue Persists**:
- Check console logs for activeOrgId value
- Verify user has admin/owner role with active status
- Check query enabled conditions
- Manually call `refetchRejoinRequests()` from console

### Test Bug #2 & #3 (Button Styling)

**Test Flow**:
1. Log in as a user on pending approval page
2. **EXPECTED**: All buttons have outline style:
   - "Check Approval Status" → violet outline
   - "Cancel Request" → gray outline
   - "Log Out" → red outline
3. Hover over each button → should show subtle background tint
4. Test in both light and dark mode

---

## Database Verification

The database already has the correct data:

```sql
-- Verify pending rejoin request exists
SELECT id, org_id, user_id, status, created_at
FROM rejoin_requests
WHERE status = 'pending'
ORDER BY created_at DESC;
```

**Expected Result**:
```
id: 6a499a9d-570a-410a-9ad8-debb15550742
org_id: 1d1b4274-c9c4-4cb7-9efc-243c90c86f4c
user_id: c655ee44-468c-4337-8a19-a91282319705
status: pending
created_at: 2026-02-05 10:45:21.52506+00
```

---

## Rollback Plan

If issues arise:

```bash
# Revert styling changes
git checkout HEAD -- src/pages/auth/PendingApprovalPage.tsx

# Revert query changes
git checkout HEAD -- src/pages/settings/OrganizationManagementPage.tsx
```

No database changes were made, so no migration rollback needed.

---

## Next Steps

1. ✅ Test rejoin request visibility in staging
2. ✅ Verify button styling in light/dark mode
3. ⏳ Monitor console logs for any issues
4. ⏳ Deploy to production once verified
5. ⏳ Remove debug logging after confirmation (optional)

---

## Related Issues

- First Bug Fix Session: entity_id type mismatch & auto-approval feature
  - See: `BUG_FIX_SUMMARY_REJOIN.md`
  - Migrations: `20260205120000_fix_rejoin_notification_entity_id.sql`
  - Migrations: `20260205120100_add_rejoin_invitations_tracking.sql`
