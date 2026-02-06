# Execution Plan: Team Members & Profile Tab Enhancements

**Project**: use60 Sales Dashboard - ORGREM & Leave Organization Features
**Date Created**: 2026-02-02
**Status**: READY FOR IMPLEMENTATION

---

## Overview

This plan defines the implementation roadmap for 6 interconnected features that enable users to leave organizations, admins to manage removed members, and profile viewing of organization membership. The plan is organized into 11 stories with clear dependencies, allowing for parallel work on backend and frontend components.

### Key Features
1. **Access Control**: Non-admins can VIEW team members page but NOT pending requests
2. **UI Restructuring**: Move invite section to top, merge rejoin into pending requests
3. **Rejoin Refresh**: Remove 10-second auto-refresh, load once on mount
4. **Profile Tab Enhancement**: Show un-editable organization name
5. **Leave Organization**: Users can leave (not owners), with goodbye screen
6. **Infrastructure Fixes**: Verify ORGREM migrations deployed, fix RPC function

---

## Database Schema Status

### Existing Tables (Already Migrated)
- `rejoin_requests` table exists (20260202093840_create_rejoin_requests_table.sql)
- `organization_memberships.member_status` column exists
- `profiles.redirect_to_onboarding` flag exists
- `remove_user_from_org` RPC function exists

### Status Check Required
- **Critical**: Verify all ORGREM migrations have been deployed to production
- **Critical**: Confirm `remove_user_from_org` RPC function is accessible from authenticated users
- **Note**: If migrations missing, database must be deployed before frontend features

---

## User Flow Diagrams

### Leave Organization Flow
```
User in Profile Tab
    ↓
Clicks "Leave Organization" button
    ↓
Confirmation Dialog: "Are you sure? You'll lose access to all organization data."
    ↓
(if owner) "You must transfer ownership or cancel billing first."
    ↓
(if not owner) Call leaveOrganization() RPC
    ↓
Set member_status='removed'
Set active_org_id=NULL on profiles
    ↓
Frontend navigates to GoodbyeScreen
    ↓
"We hope you come back soon" message
    ↓
2-3 second countdown
    ↓
Redirect to www.use60.com/learnmore
```

### Team Members Page Access
```
Regular Member
    ↓
Can view TeamMembersPage (READ access)
    ↓
Can see member list
    ↓
Cannot see "Pending Join Requests" section
    ↓
Cannot see "Rejoin Requests" section
    ↓
Can see "Leave team" button on own row
    ↓
Cannot see remove/role change buttons

Admin/Owner
    ↓
Can view all sections
    ↓
Can approve/reject join requests
    ↓
Can approve/reject rejoin requests
    ↓
Can remove members
    ↓
Can change roles
```

---

## Story Breakdown

### Story 1: Verify & Fix ORGREM Infrastructure
**ID**: ORGREM-INFRA-001
**Type**: Backend / Infrastructure
**Priority**: CRITICAL (blocks all other work)
**Effort**: 2-4 hours
**Owner**: Backend Lead

#### Description
Verify that all ORGREM migrations have been deployed to production database. Check that the `remove_user_from_org` RPC function is properly created and accessible from authenticated users.

#### Acceptance Criteria
- [ ] Query production database to confirm `rejoin_requests` table exists
- [ ] Verify `remove_user_from_org` RPC function is in `public` schema
- [ ] Test RPC function can be called with `supabase.rpc('remove_user_from_org', {...})`
- [ ] Confirm RLS policies on `rejoin_requests` table are correct
- [ ] If any issues, create/deploy missing migrations

#### Dependencies
- None (foundation task)

#### Blocks
- All frontend tasks

#### Files Affected
- Database migrations already exist (no new SQL needed unless fixes required)
- Key migrations:
  - `20260202093840_create_rejoin_requests_table.sql`
  - `20260202093842_create_remove_user_from_org_rpc.sql`
  - `20260202093846_update_rls_for_removed_users.sql`
  - `20260202093847_create_approve_rejoin_rpc.sql`

#### Testing
```bash
# Test RPC access
SELECT public.remove_user_from_org(
  'org-uuid-here'::uuid,
  'user-uuid-here'::uuid
);

# Verify table exists
SELECT * FROM public.rejoin_requests LIMIT 1;

# Test RLS policies work for authenticated user
```

---

### Story 2: Create Leave Organization Service
**ID**: ORGREM-LEAVE-001
**Type**: Backend / Service Layer
**Priority**: HIGH
**Effort**: 2-3 hours
**Owner**: Backend/Frontend Lead

#### Description
Create a service module to handle the leave organization functionality. This includes:
- RPC call to remove user from organization
- Clearing active_org_id from profiles table
- Sending notification email to admins

#### Acceptance Criteria
- [ ] `leaveOrganizationService.ts` created in `/src/lib/services/`
- [ ] Export `leaveOrganization(orgId: string, userId: string)` function
- [ ] Function calls `remove_user_from_org` RPC with proper error handling
- [ ] Returns `{success: boolean, error?: string}`
- [ ] Email sent to remaining admins (non-blocking)
- [ ] Proper error messages for edge cases (owner, not member, etc.)
- [ ] TypeScript strict mode compliant

#### Dependencies
- Story 1: ORGREM-INFRA-001 (RPC function must exist)

#### Blocks
- Story 3: Leave button implementations
- Story 5: Profile tab leave button

#### Files to Create
- `/src/lib/services/leaveOrganizationService.ts`

#### Files to Modify
- None

#### Implementation Pattern
```typescript
export async function leaveOrganization(
  orgId: string,
  userId: string
): Promise<{ success: boolean; error?: string }>
```

---

### Story 3: Create Goodbye Screen Component
**ID**: ORGREM-UI-001
**Type**: Frontend / UI Component
**Priority**: HIGH
**Effort**: 2-3 hours
**Owner**: Frontend Lead

#### Description
Create a centered, full-screen goodbye component shown when user successfully leaves an organization. Displays a warm message with a 2-3 second countdown before redirecting to landing page.

#### Acceptance Criteria
- [ ] Component displays centered message: "We hope you come back soon"
- [ ] Shows organization name in message
- [ ] Countdown timer visible (3...2...1)
- [ ] Animated transition (Framer Motion)
- [ ] Auto-redirects to `www.use60.com/learnmore` after countdown
- [ ] Accessible design (proper colors, contrast, text)
- [ ] Responsive mobile layout
- [ ] Dark mode support

#### Dependencies
- None (standalone component)

#### Blocks
- Story 5: Profile tab integration
- Story 6: Team members page integration

#### Files to Create
- `/src/components/GoodbyeScreen.tsx`

#### Files to Modify
- None

#### Component Props
```typescript
interface GoodbyeScreenProps {
  organizationName: string;
  redirectUrl?: string; // Default: www.use60.com/learnmore
  countdownSeconds?: number; // Default: 3
}
```

#### Design Notes
- Use Framer Motion for fade-in animation
- Show heartfelt message (not generic)
- Include org name if possible
- Countdown should be large and visible
- Loading spinner or subtle animation during redirect

---

### Story 4: Update Team Members Page - Access Control
**ID**: ORGREM-UI-002
**Type**: Frontend / Access Control
**Priority**: HIGH
**Effort**: 1-2 hours
**Owner**: Frontend Lead

#### Description
Update TeamMembersPage to allow regular members (non-admins) to view the team members list but hide the pending requests sections. Currently only canManageTeam users can see the page at all.

#### Acceptance Criteria
- [ ] Regular members can access `/settings/team-members`
- [ ] Regular members see team member list
- [ ] "Pending Join Requests" section NOT visible to regular members
- [ ] "Rejoin Requests" section NOT visible to regular members
- [ ] "Invite Team Members" section NOT visible to regular members
- [ ] Access control logic uses `permissions.canManageTeam`
- [ ] No console errors or warnings

#### Dependencies
- None

#### Blocks
- Story 7: Team members layout restructuring

#### Files to Modify
- `/src/pages/settings/TeamMembersPage.tsx` (lines 907-1012 conditional render)

#### Code Changes
```typescript
// Current: Only shows if canManageTeam
{permissions.canManageTeam && (
  <div>
    {/* Pending Join Requests */}
  </div>
)}

// New: Regular members can view page, but admins only see request sections
// Keep page structure same, just conditionally hide sections
```

#### Testing
- [ ] Log in as regular member
- [ ] Navigate to team members page - should load successfully
- [ ] Verify you can see member list
- [ ] Verify you cannot see "Pending Join Requests"
- [ ] Verify you cannot see "Rejoin Requests"
- [ ] Verify you cannot see "Invite Team Members"

---

### Story 5: Update Team Members Page - Layout Restructuring
**ID**: ORGREM-UI-003
**Type**: Frontend / UI Restructuring
**Priority**: HIGH
**Effort**: 3-4 hours
**Owner**: Frontend Lead

#### Description
Restructure the TeamMembersPage layout:
1. Move "Invite Team Members" section to TOP (above Team Members list)
2. Remove separate "Rejoin Requests" section
3. Merge rejoin requests into "Pending Join Requests" with "Rejoin" tag to differentiate
4. Add "Leave team" button to each member row for regular members

#### Acceptance Criteria
- [ ] Invite section is first (top of page)
- [ ] Pending Join Requests follows (consolidated)
- [ ] Rejoin requests appear in same section with "Rejoin" tag
- [ ] Both join and rejoin requests sorted by date
- [ ] "Rejoin Requests" header removed (no separate section)
- [ ] Each member row shows "Leave team" button when:
  - User is viewing own row
  - User is not an owner
  - User can perform leave action
- [ ] Button only appears for own row (not other members)
- [ ] Sorting/filtering preserved
- [ ] No UX regressions in existing functionality

#### Dependencies
- Story 4: Access control must be in place

#### Blocks
- Story 9: Rejoin refresh logic update

#### Files to Modify
- `/src/pages/settings/TeamMembersPage.tsx`

#### Code Changes
1. Move invite form rendering order (lines 1014-1056 → move before line 659)
2. Update pending join requests section to include rejoin data
3. Remove rejoin requests section (lines 906-1012)
4. Add conditional "Leave team" button rendering in member row

#### Design Notes
- Rejoin requests get blue "Rejoin" tag instead of clock icon
- Same approval/rejection buttons as join requests
- Maintains collapsible sections if desired
- Keep existing styling consistent

---

### Story 6: Update Team Members Page - Remove Auto-Refresh
**ID**: ORGREM-UI-004
**Type**: Frontend / Performance
**Priority**: MEDIUM
**Effort**: 1 hour
**Owner**: Frontend Lead

#### Description
Remove the 10-second auto-refresh (`refetchInterval: 10000`) from both join requests and rejoin requests queries. Load data once on component mount and let users manually refresh if needed.

#### Acceptance Criteria
- [ ] Join requests query no longer has `refetchInterval: 10000`
- [ ] Rejoin requests query no longer has `refetchInterval: 10000`
- [ ] Initial load still fires on component mount
- [ ] Users can manually refresh page if needed
- [ ] No automatic polling in background
- [ ] Reduces database load and network traffic

#### Dependencies
- None

#### Blocks
- None

#### Files to Modify
- `/src/pages/settings/TeamMembersPage.tsx` (lines 140 and 180)

#### Code Changes
```typescript
// Line 140 - Remove from join requests query
- refetchInterval: 10000,

// Line 180 - Remove from rejoin requests query
- refetchInterval: 10000,
```

#### Testing
- [ ] Open team members page
- [ ] Wait 15 seconds
- [ ] Verify no new API requests in network tab
- [ ] Refresh page manually - data should reload

---

### Story 7: Implement Leave Team Button on Team Members Page
**ID**: ORGREM-UI-005
**Type**: Frontend / Feature
**Priority**: HIGH
**Effort**: 2-3 hours
**Owner**: Frontend Lead

#### Description
Add "Leave team" button to the team members list for regular members viewing their own row. Button triggers a confirmation dialog and then calls the leave organization service.

#### Acceptance Criteria
- [ ] Button appears only on user's own row
- [ ] Button not shown for owners
- [ ] Button not shown if user is viewing other members
- [ ] Click opens confirmation dialog
- [ ] Dialog shows: "Leave this organization? You'll lose access to all data."
- [ ] Dialog shows second confirmation: "Are you sure? (This action cannot be undone)"
- [ ] On confirm: calls `leaveOrganization()` service
- [ ] On success: shows GoodbyeScreen component
- [ ] On error: shows toast error and stays on page
- [ ] Button styling consistent with other actions

#### Dependencies
- Story 2: Leave Organization Service
- Story 3: Goodbye Screen Component
- Story 5: Layout restructuring

#### Blocks
- None

#### Files to Modify
- `/src/pages/settings/TeamMembersPage.tsx`

#### Files to Import
- `leaveOrganizationService.ts`
- `GoodbyeScreen.tsx`

#### Code Pattern
```typescript
const handleLeaveTeam = async () => {
  // 1. Check if owner
  if (member.role === 'owner') {
    toast.error('Owners cannot leave the organization');
    return;
  }

  // 2. Show confirmation dialog (use window.confirm or Dialog component)
  if (!window.confirm('Leave this organization?...')) return;

  // 3. Call service
  const result = await leaveOrganization(activeOrgId, user.id);

  // 4. Show goodbye screen or error
  if (result.success) {
    setShowGoodbye(true);
  } else {
    toast.error(result.error);
  }
};
```

#### Button Placement
- Last item in member row action area
- Red/warning color styling
- Icon: LogOut or similar

---

### Story 8: Add Organization Name to Profile Tab
**ID**: ORGREM-PROFILE-001
**Type**: Frontend / Feature
**Priority**: MEDIUM
**Effort**: 1-2 hours
**Owner**: Frontend Lead

#### Description
Add an un-editable organization name field to the Profile.tsx component showing the user's current organization membership. This field should display the organization name but not be editable.

#### Acceptance Criteria
- [ ] New section "Organization" added to profile form
- [ ] Shows current organization name
- [ ] Field is read-only (disabled/grayed out)
- [ ] Positioned after name fields, before email field
- [ ] Fetches org name from `useOrg()` context
- [ ] Shows loading state while org data loads
- [ ] Handles null org gracefully (shows "No organization")
- [ ] Responsive layout maintained
- [ ] Dark mode support

#### Dependencies
- None

#### Blocks
- Story 9: Leave organization button on profile

#### Files to Modify
- `/src/pages/Profile.tsx`

#### Code Changes
```typescript
// Add to form data state
const { activeOrg } = useOrg();

// Add form field in UI (after name fields)
<div className="md:col-span-2 space-y-2">
  <label className="text-sm font-medium text-gray-700 dark:text-gray-400">
    Organization
  </label>
  <input
    type="text"
    value={activeOrg?.name || 'No organization'}
    disabled={true}
    className="/* grayed out styling */"
  />
  <p className="text-xs text-gray-500">
    Organization name cannot be changed from here
  </p>
</div>
```

#### Testing
- [ ] Profile loads with org name displayed
- [ ] Organization field is clearly disabled/read-only
- [ ] Field displays correct organization name
- [ ] Layout doesn't break on long org names

---

### Story 9: Implement Leave Organization Button on Profile Tab
**ID**: ORGREM-PROFILE-002
**Type**: Frontend / Feature
**Priority**: HIGH
**Effort**: 2-3 hours
**Owner**: Frontend Lead

#### Description
Add "Leave Organization" button to the Profile tab, positioned next to the organization name field. Button triggers confirmation dialogs and calls the leave organization service, then shows the goodbye screen.

#### Acceptance Criteria
- [ ] Button appears next to organization field
- [ ] Button labeled "Leave Organization"
- [ ] Red/warning color styling
- [ ] Click opens first confirmation dialog
- [ ] Dialog title: "Leave Organization?"
- [ ] Dialog text: "Are you sure you want to leave? You'll lose access to all organization data."
- [ ] Dialog shows "Cancel" and "Leave" buttons
- [ ] If confirmed, shows second dialog: "This action cannot be undone. Continue?"
- [ ] On final confirm: calls `leaveOrganization()` service
- [ ] Disables button during API call (show spinner/loading state)
- [ ] On success: shows GoodbyeScreen component
- [ ] On error: shows toast error and stays on page
- [ ] Owners see message: "Owners cannot leave. Transfer ownership first."
- [ ] Button only visible if user has activeOrg

#### Dependencies
- Story 8: Organization field must exist
- Story 2: Leave Organization Service
- Story 3: Goodbye Screen Component

#### Blocks
- None

#### Files to Modify
- `/src/pages/Profile.tsx`

#### Files to Import
- `leaveOrganizationService.ts`
- `GoodbyeScreen.tsx`
- Dialog/Modal components if using

#### Code Pattern
```typescript
const handleLeaveOrg = async () => {
  if (!activeOrg) return;

  // Check if owner
  const { userRole } = useOrg();
  if (userRole === 'owner') {
    toast.error('Owners cannot leave. Please transfer ownership first.');
    return;
  }

  // First confirmation
  if (!window.confirm('Are you sure you want to leave?...')) return;

  // Second confirmation
  if (!window.confirm('This action cannot be undone...')) return;

  // Call service
  setIsLoading(true);
  const result = await leaveOrganization(activeOrg.id, user.id);
  setIsLoading(false);

  if (result.success) {
    setShowGoodbye(true);
  } else {
    toast.error(result.error);
  }
};
```

#### Button Placement
- New section or row after organization field
- Or: Inline button next to org field on right side

#### Styling
- Red border and text (danger action)
- Icon: LogOut or Door
- Hover state: darker red background
- Loading state: spinner overlay

#### UX Considerations
- Two-step confirmation (safety measure)
- Clear messaging about data loss
- Visual warning that action is final
- Smooth transition to goodbye screen

---

### Story 10: Integration Testing - Leave Flow E2E
**ID**: ORGREM-TEST-001
**Type**: Testing / QA
**Priority**: HIGH
**Effort**: 2-3 hours
**Owner**: QA / Frontend Lead

#### Description
Create end-to-end tests verifying the complete leave organization flow works correctly across the app. Tests should cover both profile tab and team members page paths.

#### Acceptance Criteria
- [ ] Test: Regular member can leave from profile tab
- [ ] Test: Regular member can leave from team members page
- [ ] Test: Owner cannot leave from profile tab (shows error)
- [ ] Test: Owner cannot leave from team members page (button not shown)
- [ ] Test: Goodbye screen shows and counts down
- [ ] Test: Goodbye screen redirects to landing page
- [ ] Test: Member removed correctly in database (member_status='removed')
- [ ] Test: active_org_id cleared on user profile
- [ ] Test: Rejoin request NOT auto-created (only manual via edge function)
- [ ] Test: User sees error if they're the last admin
- [ ] Test: Confirmation dialogs work correctly (cancel flow)
- [ ] Test: Toast messages show on errors

#### Dependencies
- Story 2: Leave Organization Service
- Story 3: Goodbye Screen
- Story 5-9: UI implementation complete

#### Test Files
- `/src/__tests__/pages/Profile.test.tsx` (new or update)
- `/src/__tests__/pages/TeamMembersPage.test.tsx` (new or update)
- `/src/__tests__/components/GoodbyeScreen.test.tsx` (new)

#### Test Scenarios
```typescript
// Profile tab leave flow
1. User navigates to profile
2. Sees organization name field
3. Clicks "Leave Organization" button
4. Confirms two dialogs
5. Goodbye screen appears with countdown
6. Redirected to landing page

// Team members page leave flow
1. User navigates to team members
2. Sees "Leave team" button on own row
3. Clicks "Leave team" button
4. Confirms dialog
5. Goodbye screen appears
6. Redirected to landing page

// Owner restrictions
1. Owner sees organization field
2. "Leave Organization" button is disabled or missing
3. Hovering shows tooltip: "Owners cannot leave"
```

---

### Story 11: Documentation & Knowledge Transfer
**ID**: ORGREM-DOC-001
**Type**: Documentation
**Priority**: MEDIUM
**Effort**: 1-2 hours
**Owner**: Tech Lead / Frontend Lead

#### Description
Document the new leave organization feature, update CLAUDE.md with new patterns, and create runbook for troubleshooting common issues.

#### Acceptance Criteria
- [ ] CLAUDE.md updated with "Leave Organization" section
- [ ] Service layer pattern documented
- [ ] Permission system clearly explained
- [ ] Component architecture diagram added
- [ ] Troubleshooting guide for common issues
- [ ] Database schema notes updated
- [ ] RPC function documentation added
- [ ] Edge cases documented

#### Dependencies
- All other stories complete

#### Blocks
- None (final task)

#### Files to Create/Modify
- `/CLAUDE.md` (update)
- `/docs/LEAVE_ORGANIZATION.md` (new)
- `/docs/TROUBLESHOOTING.md` (update)

#### Documentation Content
- Feature overview
- User flow diagrams
- Component tree
- Service interactions
- Permission matrix
- Error handling
- Database changes
- Migration checklist

---

## Implementation Dependencies Graph

```
┌─────────────────────────────────────────┐
│ Story 1: ORGREM Infrastructure         │
│ (Verify RPC & migrations exist)         │
└──────────────────┬──────────────────────┘
                   │
        ┌──────────┴──────────┬──────────┐
        │                     │          │
        ▼                     ▼          ▼
┌──────────────┐    ┌──────────────┐    ┌──────────────────┐
│ Story 2:     │    │ Story 3:     │    │ Story 4:         │
│ Leave Org    │    │ Goodbye      │    │ Access Control   │
│ Service      │    │ Screen       │    │ (can view page)  │
└──────┬───────┘    └──────┬───────┘    └────────┬─────────┘
       │                   │                    │
       │          ┌────────┴───────────┐        │
       │          │                    │        │
       ▼          ▼                    ▼        ▼
    ┌──────────────────────────────────────────────┐
    │ Story 5: Layout Restructuring                │
    │ (Move invite to top, merge rejoin requests) │
    └──────────────────┬───────────────────────────┘
                       │
        ┌──────────────┼──────────────┐
        │              │              │
        ▼              ▼              ▼
    ┌─────────┐   ┌─────────┐   ┌──────────────┐
    │ Story 6 │   │ Story 7 │   │ Story 8      │
    │ Remove  │   │ Leave   │   │ Org Name in  │
    │ Refresh │   │ Button  │   │ Profile      │
    │ (perf)  │   │ (teams) │   │              │
    └─────────┘   └─────────┘   └──────┬───────┘
                                        │
                                        ▼
                                ┌──────────────┐
                                │ Story 9:     │
                                │ Leave Org    │
                                │ Button       │
                                │ (profile)    │
                                └──────┬───────┘
                                       │
                                       ▼
                                ┌──────────────┐
                                │ Story 10:    │
                                │ E2E Testing  │
                                └──────┬───────┘
                                       │
                                       ▼
                                ┌──────────────┐
                                │ Story 11:    │
                                │ Documentation│
                                └──────────────┘
```

---

## Implementation Timeline

### Phase 1: Infrastructure & Core (Days 1-2)
- **Story 1**: Verify ORGREM infrastructure [2-4h]
- **Story 2**: Create leave organization service [2-3h]
- **Story 3**: Create goodbye screen component [2-3h]
- **Total**: 6-10 hours, 1-2 developers

### Phase 2: Access Control & UI Foundation (Days 2-3)
- **Story 4**: Update access control [1-2h]
- **Story 5**: Restructure layout [3-4h]
- **Story 6**: Remove auto-refresh [1h]
- **Total**: 5-7 hours, 1 developer

### Phase 3: Team Members Feature (Day 4)
- **Story 7**: Leave button on team members [2-3h]
- **Testing**: Manual testing of team members flow [1-2h]
- **Total**: 3-5 hours, 1 developer

### Phase 4: Profile Tab Feature (Day 4-5)
- **Story 8**: Organization field in profile [1-2h]
- **Story 9**: Leave button on profile [2-3h]
- **Testing**: Manual testing of profile flow [1-2h]
- **Total**: 4-7 hours, 1 developer

### Phase 5: Testing & Documentation (Day 5-6)
- **Story 10**: E2E test suite [2-3h]
- **Story 11**: Documentation [1-2h]
- **Total**: 3-5 hours, 1-2 developers

### Overall Estimate
- **Total Effort**: 21-34 hours
- **Team Size**: 1-2 developers
- **Timeline**: 5-6 calendar days (with 1-2 devs working in parallel)
- **Risk Buffer**: Add 20% (4-7 hours) for unknowns

---

## Risk Mitigation

### Risk 1: ORGREM Migrations Not Deployed
**Likelihood**: MEDIUM | **Impact**: CRITICAL
- **Mitigation**: Story 1 validates infrastructure immediately
- **Contingency**: Create/deploy missing migrations before proceeding

### Risk 2: RPC Function Permission Issues
**Likelihood**: LOW | **Impact**: HIGH
- **Mitigation**: Test RPC access in Story 1 verification
- **Contingency**: Update RLS policies or function GRANT permissions

### Risk 3: Users Confused About Data Loss
**Likelihood**: MEDIUM | **Impact**: MEDIUM
- **Mitigation**: Two-step confirmation dialogs, clear messaging
- **Contingency**: Add recovery email option for 30 days

### Risk 4: Goodbye Screen Redirect Fails
**Likelihood**: LOW | **Impact**: MEDIUM
- **Mitigation**: Test redirect logic thoroughly in Story 10
- **Contingency**: Manual button to complete redirect

### Risk 5: Session Still Active After Leave
**Likelihood**: MEDIUM | **Impact**: MEDIUM
- **Mitigation**: Force auth logout/refresh after leave
- **Contingency**: RLS policies prevent access to removed user's org data

---

## Acceptance Criteria Checklist

### Before Merge
- [ ] All 11 stories completed and tested
- [ ] No new console errors or warnings
- [ ] Dark mode fully supported
- [ ] Mobile responsive (tested on iPhone/Android)
- [ ] Accessibility WCAG 2.1 AA compliant
- [ ] Database migrations deployed to staging
- [ ] Staging environment fully tested
- [ ] Performance acceptable (no new slow queries)

### Before Production Deploy
- [ ] All ORGREM migrations deployed to production
- [ ] RPC functions verified accessible
- [ ] Monitoring alerts set up for leave flow
- [ ] Email templates verified sending correctly
- [ ] Team members notified of new leave feature
- [ ] Help documentation updated
- [ ] Support team trained on new flow
- [ ] Rollback plan documented

---

## Success Metrics

### User Experience
- Users can successfully leave organization in <2 minutes
- No increase in support tickets for confusion
- >80% of users who click leave complete the action
- Goodbye screen counts down smoothly without errors

### Performance
- Team members page load time unchanged
- No increase in database query load
- API response times stable
- No memory leaks detected

### Data Integrity
- All leaving users properly marked as removed
- All active_org_id values cleared correctly
- RLS policies prevent removed user access
- Email notifications sent reliably

---

## Rollback Plan

If critical issues discovered:

1. **Immediate**: Disable leave buttons via feature flag
2. **Short-term**: Hide "Leave Organization" sections in UI
3. **Contingency**: Revert migrations if database corruption detected
4. **Communication**: Notify users via email that feature temporarily unavailable

---

## Notes & References

### Key Files
- Team Members Page: `/src/pages/settings/TeamMembersPage.tsx` (1114 lines)
- Profile Page: `/src/pages/Profile.tsx` (398 lines)
- Invitation Service: `/src/lib/services/invitationService.ts` (552 lines)
- ORGREM Migrations: `supabase/migrations/202602029***` (9 migration files)

### Existing Patterns
- Service layer pattern: See `invitationService.ts`, `joinRequestService.ts`
- Component pattern: See `Profile.tsx` for form handling
- Permission checking: See `OrgContext.tsx` `permissions` object
- Error handling: Toast notifications via `sonner` package

### Important Constraints
- Do NOT expose service role key to frontend
- Always use `maybeSingle()` for optional records
- Use explicit column selection in edge functions
- Async/await over `.then()` chains
- Handle TypeScript strict mode

---

**Document Version**: 1.0
**Last Updated**: 2026-02-02
**Next Review**: After Story 1 completion

