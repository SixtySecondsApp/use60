# Consult Report: Organization User Removal with Rejoin Flow
Generated: 2026-02-02 14:00

## User Request
"Can you make it so that when I delete a user from my organization, it completely removes them, but keeps their account details, so that when they login, they are sent to the organization onboarding screen, and can setup to either request to join back or choose another organisation to join."

## Clarifications
1. **Q: When a user is removed, what happens to their data?**
   - **A: Option B** - Keep data visible but mark as "created by removed user"

2. **Q: Should removed users receive notification?**
   - **A: Yes** - Email using waitlist/early access template style

3. **Q: Can removed users immediately request to rejoin?**
   - **A: Yes** - Immediate rejoin request allowed, but requires admin approval

## Agent Findings

### Codebase Scout
✅ **Existing Assets Found:**
- `organization_memberships` table - Core org/user relationship table
- `organization_join_requests` flow - Proven pattern for approval workflows
- OnboardingV2 with step-based routing (`/src/pages/onboarding/v2/`)
- Email system (`encharge-send-email` + `waitlist_email_templates`)
- TeamMembersPage with removal UI (`/src/pages/settings/TeamMembersPage.tsx:298-328`)
- Profile status system (`profile_status` column: `active`, `pending_approval`, `rejected`)

⚠️ **Gaps Identified:**
- No RPC function for safe user removal
- No redirect mechanism for removed users on next login
- No email notification on removal
- No rejoin request flow for removed users
- No audit trail (removed_by, removed_at)
- No data reassignment logic

🎯 **Suggested Locations:**
- RPC: `remove_user_from_organization()` in new migration
- Components: Update existing `TeamMembersPage.tsx:298-328`
- Services: Optional `/src/lib/services/organizationMembershipService.ts`
- Email: New template type `member_removed`

### Patterns Analyst
✅ **Must Follow:**
1. Toast notifications for all user feedback (`toast.success()`, `toast.error()`)
2. Validate permissions BEFORE mutations (`permissions.canManageTeam`)
3. Prevent destructive self-operations (can't remove self)
4. Invalidate React Query cache after mutations (`queryClient.invalidateQueries()`)
5. Specific status codes in edge functions (400/401/403/404/500)
6. Verify admin status in edge functions (`is_admin = true`)
7. Non-blocking email errors (email failures don't stop user actions)
8. Use `ConfirmDialog` for destructive actions with loading state
9. Async/await only, never `.then()` chains
10. Log with function prefix tags (`console.log('[function-name]')`)

**State Management:**
- Server state: React Query with `useQuery` hooks
- UI state: Zustand stores with selector hooks
- Query invalidation: `queryClient.invalidateQueries({ queryKey: ['namespace'] })`

**Component Patterns:**
- ConfirmDialog for destructive actions (variant: 'destructive')
- Permission checks before rendering actions
- Toast feedback on all mutations

**Edge Function Patterns:**
```typescript
// Auth verification
const { data: { user } } = await supabaseAdmin.auth.getUser(token)
// Admin check
const { data: profile } = await supabaseAdmin
  .from('profiles')
  .select('is_admin')
  .eq('id', user.id)
  .single()
// Email sending (non-blocking)
await fetch(`${supabaseUrl}/functions/v1/encharge-send-email`, ...)
```

### Risk Scanner
🔴 **High Severity Risks:**
1. **RLS allows self-removal** - Current policy has `(user_id = auth.uid())` clause allowing self-deletion
   - Mitigation: Update RLS policy to require admin-only deletion

2. **Session stays valid after removal** - User can continue using app until session expires
   - Mitigation: Add auth middleware to detect `member_status='removed'` on next request

3. **No constraint preventing last owner removal** - Frontend check only, no DB constraint
   - Mitigation: Add validation in RPC function

4. **Cascading data deletion risk** - Multiple tables have `ON DELETE CASCADE` on `owner_id`
   - Mitigation: Only update `member_status`, never delete auth.users

5. **Meetings/tasks use different owner columns** - `meetings.owner_user_id` vs `deals.owner_id`
   - Mitigation: Update queries to handle NULL owner_user_id gracefully

🟡 **Medium Severity Risks:**
1. **No audit trail** - Can't track who removed whom and when
   - Mitigation: Add `removed_by`, `removed_at` columns or audit table

2. **Admin can remove owner without warning** - RLS allows, no confirmation
   - Mitigation: Enhanced confirmation dialog in frontend

🟢 **Low Severity Risks:**
1. **Stale role cache in frontend** - OrgContext caches memberships
   - Mitigation: Subscribe to Realtime changes or invalidate on removal

### Scope Sizer
**Total Estimate:**
- Optimistic: 8-10 hours
- Realistic: 12-16 hours
- Pessimistic: 20-24 hours
- Confidence: High (>80%)

**Recommended Breakdown:** 19 stories across 5 phases:
1. **Phase 1: Foundation** (Schema + Core Backend) - 7 stories, ~3.5 hours
2. **Phase 2: Auth & Middleware** (Redirect Logic) - 3 stories, ~1.5 hours
3. **Phase 3: Email & Notifications** - 3 stories, ~1 hour
4. **Phase 4: UI Components** - 4 stories, ~2 hours
5. **Phase 5: Testing** - 3 stories, ~1.5 hours

**Parallel Opportunities:**
- Group A: ORGREM-001, 002, 008 (schema migrations) - saves 20min
- Group B: ORGREM-004, 011, 012 (email templates) - saves 15min
- Group C: ORGREM-003, 005, 006 (RPCs) - saves 10min
- Group D: ORGREM-013, 014, 015, 016 (UI) - saves 15min
- Group E: ORGREM-017, 018, 019 (tests) - saves 10min

**MVP Suggestion (6-8 hours):**
Stories: ORGREM-001, 002, 003, 004, 013, 009, 010
- Admin removes user → Email sent → Redirect on next login
- Data marked "created by removed user"
- Defer: Rejoin flow, admin approval UI, comprehensive testing

## Synthesis Results

### ✅ AGREEMENTS (all agents align)
- Reuse `organization_memberships` with new `member_status` column ✓
- Follow `organization_join_requests` pattern for rejoin flow ✓
- Email via `encharge-send-email` edge function ✓
- Auth middleware detects removed status and redirects ✓
- Keep all data visible, mark as "created by removed user" ✓
- Total realistic estimate: 12-16 hours (MVP: 6-8 hours) ✓

### ⚠️ CONFLICTS (resolved)
1. **Story count**: Sizer suggested 19, Scout identified 7 core stories
   → Resolution: Use 19 (complete feature with rejoin flow)

2. **Data deletion approach**: Risk Scanner warned about CASCADE, Scout confirmed no deletion
   → Resolution: Only update `member_status='removed'`, never delete records ✓

3. **Session handling**: Patterns suggest Realtime, Risk Scanner flagged high severity
   → Resolution: Use auth middleware check on each request + optional Realtime later

### 🔍 GAPS (need implementation)
1. Add `member_status` enum to `organization_memberships` (`active`, `removed`)
2. Create `rejoin_requests` table (similar to `organization_join_requests`)
3. Create RPC: `remove_user_from_org()` with admin + last-owner validation
4. Create RPC: `request_rejoin()` and `approve_rejoin_request()`
5. Add auth middleware to detect `member_status='removed'` on login
6. Create "You were removed" onboarding screen
7. Email template: `member_removed` notification
8. Admin UI for approving rejoin requests
9. Update RLS policies for removed users (view-only data access)

## Final Recommendation

### Architecture Decisions
1. **No data deletion** - Soft delete via `member_status='removed'`
2. **RLS-based visibility** - Removed users can view but not modify their data
3. **Email via encharge** - Follows established `encharge-send-email` pattern
4. **RPC for mutations** - All state changes via RPCs (matches join_requests pattern)
5. **Zustand for UI state** - Onboarding redirect flag in existing patterns
6. **No breaking changes** - Added columns have defaults, existing queries work

### Recommended Approach
**Option A: MVP First (Recommended) ⭐**
- Delivers: Remove users → Email → Redirect to onboarding
- Time: 6-8 hours
- Then add: Rejoin flow in Phase 2 (4-6 hours)
- Why: Test removal UX with real users before building rejoin complexity

**Option B: Full Feature**
- Delivers: Everything including rejoin + admin approval
- Time: 12-16 hours
- Why: Complete solution in one go, no follow-up needed

## Next Steps
Execute with `60/run` after plan approval
