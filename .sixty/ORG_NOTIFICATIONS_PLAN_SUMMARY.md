# Organization Notifications - Implementation Plan

**Generated:** 2026-02-05
**Status:** Ready for execution
**Total Stories:** 14
**Estimated Time:** 8.5 hours (5-6 hours with parallelization)

---

## 📋 Plan Overview

The organization notifications feature has been added to `.sixty/plan.json` with 14 stories organized into 4 phases.

### Feature Details
- **Feature ID:** `org-notifications`
- **Priority:** High (1)
- **Status:** Pending
- **Consult Report:** `.sixty/consult/org-notifications-analysis.md`

---

## 🏗️ Implementation Phases

### **Phase 1: Database Foundation** (Sequential)
Stories that must run in order to establish the base schema:

| Story ID | Title | Est. Time | Dependencies |
|----------|-------|-----------|--------------|
| ORG-NOTIF-001 | Add org_id and org-wide flags to notifications table | 30min | None |
| ORG-NOTIF-002 | Create org-scoped RLS policies | 20min | 001 |
| ORG-NOTIF-003 | Create notify_org_members() RPC function | 25min | 001, 002 |
| ORG-NOTIF-004 | Add member management notifications | 45min | 003 |

**Phase 1 Total:** ~2 hours

---

### **Phase 2: Business Notifications** (Can run parallel after 003)
Stories that add deal and organization event notifications:

| Story ID | Title | Est. Time | Parallel With |
|----------|-------|-----------|---------------|
| ORG-NOTIF-005 | Add high-value deal notifications | 30min | 006, 007 |
| ORG-NOTIF-006 | Enhance deal health notifications for admins | 25min | 005, 007 |
| ORG-NOTIF-007 | Add organization settings change notifications | 20min | 005, 006 |

**Phase 2 Total:** ~1.5 hours (with parallelization: 30 min)

---

### **Phase 3: Team Visibility & Digests** (Can run parallel)
Stories that add activity feeds and engagement tracking:

| Story ID | Title | Est. Time | Parallel With |
|----------|-------|-----------|---------------|
| ORG-NOTIF-008 | Create weekly activity digest system | 60min | 009, 010 |
| ORG-NOTIF-009 | Create OrgActivityFeed component | 45min | 008, 010 |
| ORG-NOTIF-010 | Create low engagement alert system | 30min | 008, 009 |

**Phase 3 Total:** ~2 hours (with parallelization: 60 min)

---

### **Phase 4: Delivery Enhancements** (Can run parallel)
Stories that improve notification delivery and reduce fatigue:

| Story ID | Title | Est. Time | Parallel With |
|----------|-------|-----------|---------------|
| ORG-NOTIF-011 | Add notification batching and consolidation | 45min | 012, 013, 014 |
| ORG-NOTIF-012 | Extend Slack integration for org notifications | 40min | 011, 013, 014 |
| ORG-NOTIF-013 | Create notification preferences UI | 60min | 011, 012 |
| ORG-NOTIF-014 | Integrate notification queue for intelligent delivery | 50min | 013 |

**Phase 4 Total:** ~3 hours (with parallelization: 110 min)

---

## 🎯 Key Deliverables

### Database Changes
- ✅ `notifications` table extended with org context
- ✅ `notify_org_members()` RPC function
- ✅ `digest_schedules` table for weekly summaries
- ✅ `user_notification_preferences` table
- ✅ `slack_channel_mappings` table

### Backend Features
- ✅ Member management notifications (removal, role change)
- ✅ Deal notifications (high-value, won, lost, at-risk)
- ✅ Organization settings change tracking
- ✅ Weekly activity digests
- ✅ Engagement monitoring
- ✅ Notification batching and consolidation

### Frontend Components
- ✅ `OrgActivityFeed` - Team activity timeline
- ✅ `NotificationPreferences` - User settings UI

### Integrations
- ✅ Extended Slack integration for org channels
- ✅ Notification queue for intelligent delivery

---

## 📊 Execution Strategy

### Recommended Order (Optimized for Parallelization)

```
Day 1 (Foundation):
  - ORG-NOTIF-001 → 002 → 003 → 004
  - Time: ~2 hours sequential
  - Deploy & test in staging

Day 2 (Business Events):
  - ORG-NOTIF-005, 006, 007 (parallel)
  - Time: ~30 minutes with parallelization
  - Verify notifications appear for admins

Day 3 (Team Features):
  - ORG-NOTIF-008, 009, 010 (parallel)
  - Time: ~60 minutes with parallelization
  - Test digest generation and UI

Day 4 (Enhancements):
  - ORG-NOTIF-011, 012, 013 (parallel)
  - Then: ORG-NOTIF-014
  - Time: ~110 minutes total
  - Full system test
```

### Critical Path
```
001 → 002 → 003 → [005, 006, 007, 004] → [008, 009, 010] → [011, 012, 013] → 014
```

---

## ✅ Acceptance Criteria (Feature-Level)

After all 14 stories are complete, verify:

1. **Organization Context**
   - [ ] Admins can view org-wide notifications
   - [ ] RLS prevents cross-org access
   - [ ] `org_id` properly set on all new notifications

2. **Member Management**
   - [ ] Admins notified when members removed
   - [ ] Role changes trigger notifications
   - [ ] Affected users receive their notifications

3. **Business Events**
   - [ ] High-value deals (>$50k) notify owners/admins
   - [ ] Won/lost deals show in org feed
   - [ ] Critical deal health alerts reach admins

4. **Team Visibility**
   - [ ] OrgActivityFeed displays recent org events
   - [ ] Weekly digest generated on schedule
   - [ ] Inactive member alerts sent to admins

5. **User Experience**
   - [ ] Notification preferences UI functional
   - [ ] Similar notifications batched together
   - [ ] Slack integration works for org channels
   - [ ] Queue processes non-urgent notifications correctly

---

## 🚀 Next Steps

### Option 1: Start Implementation Immediately
```bash
cd .sixty
# Review the plan
cat plan.json | grep -A 20 "ORG-NOTIF-001"

# Start execution with 60/run
60/run --feature org-notifications
```

### Option 2: Execute with CLI (Recommended)
```bash
# Let 60/run handle dependency order and parallelization
60/run org-notifications
```

### Option 3: Manual Execution
Execute stories in dependency order:
1. Run ORG-NOTIF-001 (foundation)
2. Run ORG-NOTIF-002 (RLS)
3. Run ORG-NOTIF-003 (RPC function)
4. Run remaining stories respecting dependencies

---

## 📝 Testing Strategy

### Unit Tests
- Test `notify_org_members()` RPC with various role filters
- Test batching logic in notificationService
- Test weekly digest generation

### Integration Tests
- Test full notification flow from trigger to delivery
- Test RLS policies with different user roles
- Test Slack integration end-to-end

### Manual Testing
- Create test org with multiple members
- Trigger each notification type manually
- Verify admins see notifications, members don't (for org-wide)
- Test preferences UI and verify behavior changes

---

## 🔧 Configuration Required

Before running, ensure:

1. **Environment Variables**
   - `EDGE_FUNCTION_SECRET` set for inter-function calls
   - Slack OAuth tokens if using Slack integration

2. **Database Setup**
   - Supabase project has pg_cron enabled (for digests)
   - Service role key available for migrations

3. **Permissions**
   - User has admin/owner role in test org
   - RLS policies applied correctly

---

## 📚 Documentation

- **Consult Report:** `.sixty/consult/org-notifications-analysis.md`
- **Plan File:** `.sixty/plan.json` (stories 72-85)
- **Additional Stories:** `.sixty/org-notifications-stories.json`

---

## 💡 Design Decisions

Based on user preferences (from 60/consult):

✅ **Admin Scope:** Only org-wide events (privacy-focused)
✅ **Delivery:** In-app only by default (reduces fatigue)
✅ **Digests:** Owners only by default (opt-in for others)
✅ **Approach:** Build all phases comprehensively

---

## ⚠️ Known Risks & Mitigations

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Performance impact of org-wide queries | Low | Medium | Indexes on org_id, is_org_wide |
| Notification fatigue | Medium | High | Batching + preferences from day 1 |
| Migration breaks existing | Low | High | Test in staging first |
| RLS complexity | Low | Medium | Clear policy separation |

---

## 📞 Support

If you encounter issues during implementation:
1. Check migration error logs in Supabase dashboard
2. Verify RLS policies with test queries
3. Review notification_service logs
4. Test with single org before rolling out

---

**Ready to implement? Run:**
```bash
60/run org-notifications
```

Or execute manually starting with ORG-NOTIF-001.
