# Consult Report: Pending Approval Flow Auto-Detection
Generated: 2026-02-02 10:30

## User Request
"When I am on the pending approval screen (http://localhost:5175/onboarding?step=pending_approval) I should be able to refresh / click check status and if it detects that I have been accepted to the organization, it should automatically log me in and put me on the dashboard. It currently removes my pending request (correct) but displays an error and prompts me to log in. This is tedious for the user especially if they are accepted quickly. Instead, make it so I can still login to load the dashboard for the organization I have joined but also allow me to just refresh / check onboarding stage to load into the organization, this will also stop accepted users getting confused if they access this page knowing they have been accepted."

## Problem Analysis

### Current Behavior
1. User clicks "Check Approval Status" button
2. Query finds no pending request (it was approved and removed)
3. Shows error toast: "No pending request found"
4. Resets profile_status to 'active'
5. Prompts user to log in ❌

### Expected Behavior
1. User lands on pending approval page (or manually refreshes)
2. Automatic polling every 5 seconds checks approval status
3. When approved detected:
   - Update profile_status to 'active'
   - Reload organization memberships (OrgContext)
   - Set active org to newly joined org
   - Mark onboarding complete
   - Redirect to /dashboard ✅

## Root Causes

1. **No automatic polling** - User must manually click button
2. **Missing membership check** - Only checks join_requests table, not organization_memberships
3. **Context not refreshed** - OrgContext doesn't reload when approval happens
4. **Race condition** - Navigation attempts before org context is ready
5. **Profile status mismatch** - Status stays 'pending_approval' even after membership created

## Codebase Analysis

### Relevant Files

| File | Purpose | Key Functions |
|------|---------|---------------|
| `src/pages/onboarding/v2/PendingApprovalStep.tsx` | Onboarding pending approval screen | `checkApprovalStatus()` |
| `src/pages/auth/PendingApprovalPage.tsx` | Standalone pending approval page | Similar to PendingApprovalStep |
| `src/lib/contexts/OrgContext.tsx` | Organization context provider | `loadOrganizations()` |
| `src/lib/stores/onboardingV2Store.ts` | Onboarding state management | Join request flow |
| `src/lib/services/joinRequestService.ts` | Join request API calls | `approveJoinRequest()`, `cancelJoinRequest()` |

### Existing Patterns

#### Polling Pattern (from enrichment)
```typescript
// src/lib/stores/onboardingV2Store.ts:870-961
const POLL_INTERVAL = 2000; // 2 seconds
const MAX_POLLING_DURATION = 5 * 60 * 1000; // 5 minutes
const MAX_ATTEMPTS = 150;

// Recursive polling with timeout protection
setTimeout(() => get().pollEnrichmentStatus(organizationId), POLL_INTERVAL);
```

#### Organization Refresh Pattern (from AcceptJoinRequest)
```typescript
// src/pages/auth/AcceptJoinRequest.tsx:80-91
await loadOrganizations(); // Refresh org list
switchOrg(membership.org_id); // Switch to new org
await supabase
  .from('user_onboarding_progress')
  .upsert({
    user_id: session.user.id,
    onboarding_step: 'complete',
    onboarding_completed_at: new Date().toISOString(),
  }, { onConflict: 'user_id' });
navigate('/dashboard');
```

### Database Schema

```sql
-- organization_join_requests
CREATE TABLE organization_join_requests (
  id uuid PRIMARY KEY,
  org_id uuid REFERENCES organizations(id),
  user_id uuid REFERENCES auth.users(id),
  email text NOT NULL,
  status text CHECK (status IN ('pending', 'approved', 'rejected')),
  user_profile jsonb,
  created_at timestamptz DEFAULT NOW()
);

-- organization_memberships
CREATE TABLE organization_memberships (
  org_id uuid REFERENCES organizations(id),
  user_id uuid REFERENCES auth.users(id),
  role text CHECK (role IN ('owner', 'admin', 'member', 'readonly')),
  created_at timestamptz DEFAULT NOW(),
  PRIMARY KEY (org_id, user_id)
);

-- profiles
CREATE TABLE profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id),
  email text,
  profile_status text CHECK (profile_status IN ('active', 'pending_approval', 'rejected')),
  first_name text,
  last_name text
);
```

## Recommended Solution

### Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                  Pending Approval Flow                      │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌──────────────────────────────────────────────┐          │
│  │  useApprovalDetection Hook (PEND-001)        │          │
│  │  - Checks organization_memberships first     │          │
│  │  - Falls back to organization_join_requests  │          │
│  │  - Returns { isApproved, membership }        │          │
│  └─────────────────┬────────────────────────────┘          │
│                    │                                        │
│                    ▼                                        │
│  ┌──────────────────────────────────────────────┐          │
│  │  Auto-Polling (PEND-002)                     │          │
│  │  - useEffect with 5-second interval          │          │
│  │  - Calls useApprovalDetection.refetch()      │          │
│  │  - Shows "Checking status..." indicator      │          │
│  └─────────────────┬────────────────────────────┘          │
│                    │                                        │
│           isApproved = true?                                │
│                    │                                        │
│                    ▼                                        │
│  ┌──────────────────────────────────────────────┐          │
│  │  Approval Detected (PEND-003)                │          │
│  │  1. Update profile_status to 'active'        │          │
│  │  2. Call loadOrganizations() from OrgContext │          │
│  │  3. Wait for load to complete                │          │
│  │  4. switchOrg(membership.org_id)             │          │
│  └─────────────────┬────────────────────────────┘          │
│                    │                                        │
│                    ▼                                        │
│  ┌──────────────────────────────────────────────┐          │
│  │  Complete Onboarding (PEND-004)              │          │
│  │  - Mark user_onboarding_progress complete    │          │
│  │  - Prevents redirect back to onboarding      │          │
│  └─────────────────┬────────────────────────────┘          │
│                    │                                        │
│                    ▼                                        │
│  ┌──────────────────────────────────────────────┐          │
│  │  Navigate to Dashboard                       │          │
│  │  - User sees their organization's dashboard  │          │
│  │  - No error messages or login prompts        │          │
│  └──────────────────────────────────────────────┘          │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### Story Breakdown

| ID | Title | Type | Est. | Dependencies |
|----|-------|------|------|--------------|
| PEND-001 | Create useApprovalDetection hook | frontend | 15m | - |
| PEND-002 | Add automatic polling | frontend | 20m | PEND-001 |
| PEND-003 | Implement org context refresh | frontend | 25m | PEND-001, PEND-002 |
| PEND-004 | Mark onboarding complete | frontend | 10m | PEND-003 |
| PEND-005 | Add visual feedback | frontend | 15m | PEND-003 |
| PEND-006 | Fix error handling | frontend | 15m | PEND-001 |
| PEND-007 | Apply to PendingApprovalPage | frontend | 10m | PEND-001-004 |
| **PEND-008** | **Update onboarding progress on approval** | **backend** | **20m** | **-** |
| **PEND-009** | **Cleanup auto-created organizations** | **frontend** | **25m** | **PEND-003** |
| **PEND-010** | **Fix ProtectedRoute membership check** | **frontend** | **20m** | **PEND-008** |

**Total Estimate**: 175 minutes (~3 hours)
**MVP (Stories 1-4, 8)**: 90 minutes (~1.5 hours)

### Additional Stories (Added 2026-02-02)

**Context**: During testing, discovered that approved users (max.parish101@gmail.com) were stuck in pending approval loop even after successful membership creation. Root cause analysis revealed:

1. **PEND-008** - Backend RPC doesn't update onboarding progress
   - approve_join_request creates membership but leaves onboarding_step as 'pending_approval'
   - ProtectedRoute redirects based on this stale state

2. **PEND-009** - Auto-created placeholder orgs not cleaned up
   - Users get "Test" organization during onboarding flow
   - When joining existing org, placeholder should be deleted

3. **PEND-010** - ProtectedRoute routing logic flawed
   - Only checks profile_status, doesn't verify actual memberships
   - Should allow dashboard access if ANY membership exists

### Parallel Opportunities

| Group | Stories | Reason | Time Saved |
|-------|---------|--------|------------|
| Group 1 | PEND-004, PEND-005 | Independent after PEND-003 | 10m |
| Group 2 | PEND-008, PEND-009 | Backend RPC + frontend cleanup | 20m |

## Implementation Details

### PEND-001: useApprovalDetection Hook

```typescript
// src/lib/hooks/useApprovalDetection.ts
export function useApprovalDetection(orgId: string | null, userId: string | null) {
  return useQuery({
    queryKey: ['approval-detection', orgId, userId],
    queryFn: async () => {
      if (!orgId || !userId) return { isApproved: false, membership: null };

      // Strategy 1: Check organization_memberships (source of truth)
      const { data: membership } = await supabase
        .from('organization_memberships')
        .select('*')
        .eq('org_id', orgId)
        .eq('user_id', userId)
        .maybeSingle();

      if (membership) {
        return { isApproved: true, membership, isPending: false };
      }

      // Strategy 2: Check join_requests for pending status
      const { data: request } = await supabase
        .from('organization_join_requests')
        .select('*')
        .eq('org_id', orgId)
        .eq('user_id', userId)
        .eq('status', 'pending')
        .maybeSingle();

      return {
        isApproved: false,
        membership: null,
        isPending: !!request,
        request
      };
    },
    enabled: !!orgId && !!userId,
    refetchInterval: false // Manual refetch only
  });
}
```

### PEND-002: Auto-Polling

```typescript
// In PendingApprovalStep.tsx
const { isApproved, membership, refetch } = useApprovalDetection(
  pendingJoinRequest?.orgId,
  user?.id
);

useEffect(() => {
  if (!pendingJoinRequest) return;

  const interval = setInterval(() => {
    refetch();
  }, 5000); // 5 seconds

  return () => clearInterval(interval);
}, [pendingJoinRequest, refetch]);

// When approval detected
useEffect(() => {
  if (isApproved && membership) {
    handleApprovalDetected(membership);
  }
}, [isApproved, membership]);
```

### PEND-003: Organization Context Refresh

```typescript
async function handleApprovalDetected(membership: OrganizationMembership) {
  try {
    setIsLoadingDashboard(true);

    // 1. Update profile status
    await supabase
      .from('profiles')
      .update({ profile_status: 'active' })
      .eq('id', user.id);

    // 2. Reload organizations
    await loadOrganizations();

    // 3. Switch to newly joined org
    switchOrg(membership.org_id);

    // 4. Mark onboarding complete (PEND-004)
    await supabase
      .from('user_onboarding_progress')
      .upsert({
        user_id: user.id,
        onboarding_step: 'complete',
        onboarding_completed_at: new Date().toISOString()
      }, { onConflict: 'user_id' });

    // 5. Navigate
    navigate('/dashboard');
  } catch (error) {
    console.error('Error handling approval:', error);
    toast.error('Failed to load dashboard. Please try refreshing.');
  }
}
```

## Quality Gates

- [ ] **Lint**: Run `npm run lint` on modified files
- [ ] **TypeScript**: No type errors in modified files
- [ ] **Manual Test**: Complete approval flow end-to-end
  1. Create join request on staging
  2. Approve from admin account
  3. Verify auto-redirect to dashboard
  4. Verify no error messages
  5. Verify organization is active

## Risks & Mitigations

| Risk | Severity | Mitigation |
|------|----------|------------|
| Polling too frequent (server load) | Low | 5-second interval is reasonable |
| Race condition on context load | Medium | Wait for loadOrganizations() Promise |
| Memory leak from interval | Medium | Clean up interval in useEffect cleanup |
| Infinite polling if error | Low | Add error handling to stop polling |

## Success Metrics

- ✅ User sees dashboard within 5 seconds of approval
- ✅ No "login" or error messages displayed
- ✅ Organization context properly loaded
- ✅ Onboarding marked complete (no redirect back)
- ✅ Same UX on both PendingApprovalStep and PendingApprovalPage

## References

- AcceptJoinRequest flow: `src/pages/auth/AcceptJoinRequest.tsx:35-117`
- Enrichment polling pattern: `src/lib/stores/onboardingV2Store.ts:870-961`
- OrgContext methods: `src/lib/contexts/OrgContext.tsx:95-196`
- Join request service: `src/lib/services/joinRequestService.ts`
