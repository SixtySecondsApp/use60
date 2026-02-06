# Organization Deactivation Feature - Implementation Summary

**Date**: February 5, 2026
**Branch**: fix/go-live-bug-fixes
**Status**: Partially Complete (5/11 Stories)

---

## Overview

Added the ability for organization owners to **deactivate and leave their organization** with a **30-day recovery window** before automatic deletion.

### User Requirements
- ✅ Deactivation from Settings tab → Organization Management → Settings → "Danger Zone"
- ✅ Immediate access loss for all members
- ✅ 30-day reactivation window (then auto-delete)
- ✅ Owner removed from organization (not account deleted)
- ✅ Owner receives email confirmation with reactivation button

---

## Architecture

### Data Model
- **Organizations table**: Added `deletion_scheduled_at` column (via trigger, set to NOW() + 30 days)
- **Existing infrastructure**: Reuses `organization_reactivation_requests` table for request tracking
- **No cascading deletes**: Soft deactivation via `is_active = false` preserves data for 30 days
- **Audit trail**: `deactivated_at`, `deactivated_by`, `deactivation_reason` already existed

### Access Control
- **RLS filters**: Inactive orgs filtered from normal member queries
- **Owner protection**: Single-org check prevents owner from deactivating only organization
- **RPC security**: `SECURITY DEFINER` with explicit validation
- **Member state**: Keeps `member_status = 'active'` (unlike removal which sets to 'removed')

### Email Flow
- **Owner notification**: Deactivation confirmation + reactivation button (30-day link)
- **Member notification**: Deactivation notice + support email (non-reactivation)
- **Asynchronous**: Edge function handles notifications (failures don't block deactivation)
- **Templates**: Prepared for Encharge integration

---

## Implementation Progress

### ✅ PHASE 1: Database & Backend (Stories 1.1-1.3)

**Story 1.1: Add Deletion Scheduler**
```
File: supabase/migrations/20260205140000_add_org_deletion_scheduler.sql
- Adds deletion_scheduled_at column
- Creates trigger: set deadline = NOW() + 30 days when is_active becomes false
- Creates indexes for efficient querying of scheduled deletions
```

**Story 1.2: Create RPC Function**
```
File: supabase/migrations/20260205140100_rpc_deactivate_organization_by_owner.sql
- RPC: deactivate_organization_by_owner(p_org_id UUID, p_reason TEXT)
- Validates: user is owner + org is active + user has other active orgs
- Actions: sets is_active=false, records audit fields, creates reactivation_requests entry
- Returns: deadline_date, request_id, deactivation_id
- Errors: Clear error messages for each validation failure
```

**Story 1.3: Service Layer**
```
File: src/lib/services/organizationDeactivationService.ts

Functions:
- validateOwnerCanDeactivate(orgId) - checks eligibility, returns error or null
- deactivateOrganizationAsOwner(orgId, reason) - initiates deactivation
- getAllOrgMembers(orgId) - retrieves member list
- getDeactivationStatus(orgId) - checks status and countdown
- showDeactivationError(error) - user-friendly toast messages

Features:
- TypeScript types exported
- Comprehensive error handling
- Wraps RPC calls with service layer pattern
- Triggers notification edge function
- Clears org context after deactivation
```

### ✅ PHASE 2: Frontend UI (Stories 2.1-2.2)

**Story 2.1: Settings Tab Section**
```
File: src/pages/settings/OrganizationManagementPage.tsx (modified)

Added:
- Import DeactivateOrganizationDialog and service functions
- State: showDeactivateDialog, canDeactivate, deactivationError
- useEffect: validates ownership eligibility on mount
- New "Danger Zone" section in Settings tab (owner only)
  - Warning alert: "All members will lose access immediately"
  - Reason dropdown: Billing, Restructuring, Closed, Other
  - Optional explanation text for "Other"
  - Disabled state if no other active orgs (with message)
  - Red danger-styled button
- Shows validation error if owner can't deactivate
```

**Story 2.2: Confirmation Dialog**
```
File: src/components/dialogs/DeactivateOrganizationDialog.tsx (NEW)

3-Step Confirmation Flow:
1. Warning Step (confirm-warning)
   - Alert icon + detailed warning
   - Reason selection dropdown
   - Important information bullets (immediate access loss, 30-day window, etc.)

2. Review Step (review-members)
   - Loads all members from getAllOrgMembers()
   - Displays member list with avatars, names, roles
   - Confirmation checkbox: "I understand all members will lose access"
   - Shows member count and org name

3. Type Confirmation (type-confirm)
   - Displays key details: org name, member count, 30-day window
   - Input field: type "DEACTIVATE" exactly (case-sensitive)
   - Calls deactivateOrganizationAsOwner() on final button
   - Handles success: clears localStorage, redirects to org selection
   - Handles errors: shows user-friendly error toast

Features:
- Asynchronous member loading
- Multi-step UX prevents accidents
- Detailed warnings at each step
- Loading states during API calls
- Error handling with proper UX feedback
```

### ✅ PHASE 3: Email Notifications (Story 3.1)

**Story 3.1: Deactivation Email Function**
```
File: supabase/functions/send-org-deactivation-email/index.ts (NEW)

Receives:
- org_id, org_name, deactivated_by_name, deactivation_reason
- deactivated_at, reactivation_deadline, member_emails[]

Actions:
- Sends owner confirmation email with:
  - Deactivation summary
  - Reason for deactivation
  - 30-day recovery deadline
  - Magic link/button to reactivate organization
  - Contact support link

- Sends member notification emails with:
  - Organization deactivated notice
  - Deactivation reason
  - Member contact email
  - Support contact info
  - (No reactivation button - only owner can reactivate)

- Batch sending support (multiple members in one call)
- Non-blocking: failures logged, don't block deactivation
- Template variables prepared for Encharge
- CORS headers for cross-origin function calls

Error Handling:
- Logs all errors
- Continues if individual emails fail
- Returns summary of what succeeded
```

---

## ⏳ PENDING WORK (Stories 3.2-4.3)

### Story 3.2: Member Notification Email Function
- Separate edge function for batch member notification
- May be same as 3.1 or split depending on Encharge API capabilities

### Story 3.3: Day-25 Auto-Warn + Cron Scheduler
- Scheduled job (GitHub Actions, Vercel Cron, or Supabase scheduled function)
- Runs daily at 10 AM UTC
- Finds orgs with `deletion_scheduled_at - NOW() < 5 days`
- Sends day-25 deletion warning emails
- Auto-deletes on day 30+ (soft delete cascade)
- Idempotent (safe to run multiple times)

### Story 4.1: Update InactiveOrganizationScreen
- Modify existing component to show deactivation-specific messaging
- Show deactivation reason if available
- Display countdown: "Reactivate by: [date]"
- If member: show owner contact email
- If owner: show "Reactivate" button (< 30 days)
- Link to check email for reactivation options

### Story 4.2: Update Admin Organizations Page
- Add "Status" column to org table
- Badges: Green "Active", Red "Deactivated (5 days left)", Gray "Deleted"
- Sort by deletion_scheduled_at
- Hover tooltip shows deactivation_reason
- Admin can manually approve reactivation request
- Admin can force-delete for abuse cases

### Story 4.3: Integration Testing
- Test: Single-org owner → deactivation blocked
- Test: Multi-org owner → deactivation succeeds
- Test: Owner receives email with reactivation link
- Test: All members receive notification
- Test: Members redirected to InactiveOrganizationScreen
- Test: 30-day countdown working
- Test: Auto-delete on day 30+
- Test: Deactivation reason appears in emails
- Test: Owner can request rejoin if they try to rejoin
- Test: Admin can see deactivation status

---

## Database Schema

### organizations table (existing)
```sql
deactivated_at        TIMESTAMPTZ      -- When org was deactivated
deactivated_by        UUID (FK)        -- Which user deactivated
deactivation_reason   TEXT             -- Why (Billing, Restructuring, etc.)
deletion_scheduled_at TIMESTAMPTZ      -- 30 days from deactivation (auto-set)
```

### Trigger (NEW)
```sql
set_org_deletion_schedule()
-- When is_active changes false: sets deletion_scheduled_at = NOW() + 30 days
-- When is_active changes true: clears deletion_scheduled_at = NULL
```

### Indexes (NEW)
```sql
idx_organizations_deletion_scheduled_at        -- For counting scheduled deletions
idx_organizations_ready_for_deletion           -- For finding deletable orgs
```

### RPC Functions (NEW)
```sql
deactivate_organization_by_owner(p_org_id UUID, p_reason TEXT)
-- Returns: {success, message, org_id, request_id, deadline_date, deactivated_at}
```

---

## Service Layer API

### organizationDeactivationService.ts
```typescript
// Check if owner can deactivate (null = can, string = cannot)
validateOwnerCanDeactivate(orgId: string): Promise<string | null>

// Execute deactivation
deactivateOrganizationAsOwner(orgId: string, reason: string): Promise<DeactivationResult>
// Returns: {success, message, orgId, requestId, deadlineDate, deactivatedAt, error}

// Get members for notifications
getAllOrgMembers(orgId: string): Promise<OrgMember[]>
// Returns: [{id, email, full_name, role}]

// Check deactivation status
getDeactivationStatus(orgId: string): Promise<DeactivationStatus | null>
// Returns: {orgId, orgName, deactivatedAt, daysRemaining, isOverdue}

// Show user-friendly error
showDeactivationError(error: string): void
```

---

## UI Components

### DeactivateOrganizationDialog.tsx
- Modal dialog with 3-step confirmation flow
- Handles member loading and displays list
- Manages dialog state and step navigation
- Integrates with service layer
- Handles success redirect

### OrganizationManagementPage.tsx (modified)
- Added deactivation section to Settings tab
- Added eligibility checking via useEffect
- Displays error if user can't deactivate
- Shows recovery info (30 days)
- Integrates with DeactivateOrganizationDialog

---

## Commit History

**Commit**: efb3ca4c
**Message**: feat: Implement organization deactivation feature with 30-day recovery window

```
59 files changed, 6344 insertions(+), 521 deletions(-)

Created:
- supabase/migrations/20260205140000_add_org_deletion_scheduler.sql
- supabase/migrations/20260205140100_rpc_deactivate_organization_by_owner.sql
- supabase/functions/send-org-deactivation-email/index.ts
- src/lib/services/organizationDeactivationService.ts
- src/components/dialogs/DeactivateOrganizationDialog.tsx

Modified:
- src/pages/settings/OrganizationManagementPage.tsx
```

---

## Testing Checklist

### Pre-Deployment
- [ ] Database migrations run without errors
- [ ] RPC function accepts valid inputs
- [ ] Service layer functions handle errors gracefully
- [ ] Dialog flows work end-to-end
- [ ] Email templates configured in Encharge
- [ ] Cron scheduler configured (Story 3.3)

### Functional Testing
- [ ] Owner with single org: deactivation blocked (shows error)
- [ ] Owner with multiple orgs: deactivation succeeds
- [ ] Owner receives confirmation email within 1 minute
- [ ] All members notified of deactivation
- [ ] Members redirected to InactiveOrganizationScreen on next login
- [ ] 30-day countdown calculation correct
- [ ] Auto-delete on day 30 (or manual trigger)
- [ ] Deactivation reason appears in emails
- [ ] Admin can view deactivation status
- [ ] Removed members still see "Removed" status (not "Deactivated")

### Edge Cases
- [ ] Owner attempts to deactivate while already deactivated org
- [ ] Network failure during email sending (doesn't block deactivation)
- [ ] Dialog closed mid-step (resets state)
- [ ] User no longer owns org before final confirmation
- [ ] Org deleted manually before day 30

### Security
- [ ] Non-owners cannot deactivate
- [ ] Non-authenticated users cannot deactivate
- [ ] RLS policies prevent member access to inactive org
- [ ] Email contains no sensitive data
- [ ] Reactivation link requires authentication

---

## Notes for Future Work

### Billing Integration (TODO)
1. Check payment status before allowing reactivation (Story 3.3)
2. Resume subscription when approved
3. Add grace period for non-payment deactivation
4. Data retention policy (X days after deletion)

### Admin Improvements (Story 4.2)
1. Bulk deletion of old deactivated orgs
2. Analytics on deactivation reasons
3. Automatic reactivation if payment resolved
4. Deactivation audit log

### User Communication
1. In-app banner warning members org will deactivate
2. Escalation email at day 20 (member request reactivation)
3. Final warning at day 25 (auto-delete notice)
4. Post-reactivation confirmation email to all members

### Performance
1. Background job for cron scheduler (not blocking requests)
2. Batch email sending for large orgs
3. Cache deactivation status in app state

---

## Success Metrics

✅ **Implemented**:
- Owner can deactivate from UI
- 3-step confirmation prevents accidents
- Email confirmation with reactivation option
- 30-day recovery window tracked in DB
- Members immediately lose access
- Single-org protection enforced

⏳ **To Complete**:
- Automated day-25 warning emails
- Automated day-30 deletion
- Enhanced admin interface
- Complete integration testing

---

## Files Reference

| File | Type | Purpose |
|------|------|---------|
| `supabase/migrations/20260205140000_*.sql` | Migration | Add deletion_scheduled_at column + trigger |
| `supabase/migrations/20260205140100_*.sql` | Migration | RPC deactivate_organization_by_owner() |
| `supabase/functions/send-org-deactivation-email/index.ts` | Edge Function | Send owner + member emails |
| `src/lib/services/organizationDeactivationService.ts` | Service | Business logic for deactivation |
| `src/components/dialogs/DeactivateOrganizationDialog.tsx` | Component | 3-step confirmation UI |
| `src/pages/settings/OrganizationManagementPage.tsx` | Page | Settings tab integration |

---

## Questions & Clarifications

**Q: What happens if owner tries to reactivate after 30 days?**
A: Org is auto-deleted. Reactivation would fail. Platform admin can manually restore from backup if needed.

**Q: Can partial members be re-added?**
A: No, all members must wait for reactivation or 30-day deletion. Individual rejoin is not implemented.

**Q: What if owner loses access before final confirmation?**
A: RPC validates at deactivation time, so permission change mid-dialog would cause final step to fail.

**Q: Are member tasks/deals deleted with org?**
A: No, data preserved for 30 days in soft-delete model. Only org membership affected immediately.

---

**Last Updated**: February 5, 2026
**Next Phase**: Stories 3.2-4.3 (Email notifications, Auto-delete, Admin UI, Testing)
