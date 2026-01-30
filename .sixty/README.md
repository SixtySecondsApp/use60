# 60/ Workflow — Onboarding Production Hardening

This directory contains the execution plan for making the onboarding flow production-ready.

## Quick Start

```bash
# View current status
60/status

# Start execution
60/run

# View this plan
cat .sixty/plan.json | jq
```

## Current Sprint

**Feature**: Onboarding & User Management Production Hardening
**Status**: In Progress
**Stories**: 19 total (0 complete)
**Estimated Time**: 5 hours (with parallel execution)

## Files

| File | Purpose |
|------|---------|
| `plan.json` | Complete execution plan with all 19 stories |
| `consult/onboarding-production-ready.md` | Full analysis report from 60/consult |
| `progress.md` | Session log (created on first 60/run) |
| `config.json` | Project settings (created on first 60/run) |

## Story Breakdown

### Phase 1: Critical Fixes (P0)
- **ONBOARD-001**: Deploy 404 fix to staging ⏱️ 10min
- **ONBOARD-002**: Add email tracking to database ⏱️ 15min
- **ONBOARD-003**: AWS SES error handling ⏱️ 25min
- **ONBOARD-004**: Email retry UI ⏱️ 30min

### Phase 2: Data Integrity (P1)
- **ONBOARD-005-007**: Orphaned invitation cleanup ⏱️ 45min
- **ONBOARD-008-009**: Race condition protection ⏱️ 40min
- **ONBOARD-010-011**: Session persistence ⏱️ 40min

### Phase 3: UX Polish (P2)
- **ONBOARD-012-014**: Rejection notifications ⏱️ 70min
- **ONBOARD-015-017**: Duplicate org approval ⏱️ 60min
- **ONBOARD-018-019**: Rate limiting ⏱️ 45min

## Parallel Execution Groups

**Group 1** (after ONBOARD-001):
- ONBOARD-002, ONBOARD-005, ONBOARD-008 (schema migrations)
- **Time saved**: 30 minutes

**Group 2** (after Group 1):
- ONBOARD-003, ONBOARD-006, ONBOARD-009, ONBOARD-010
- **Time saved**: 45 minutes

**Group 3**:
- ONBOARD-012, ONBOARD-015, ONBOARD-018 (independent work)
- **Time saved**: 20 minutes

## Key Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Email provider | AWS SES | Already in use |
| Approval timeline | 24 hours | Acceptable SLA |
| Rejection UX | Email notification | User expectation |
| Duplicate orgs | Require admin approval | Prevent fragmentation |
| Environment | Staging | Safe testing ground |

## Dependencies

All stories depend on **ONBOARD-001** (deploying the 404 fix). The dependency tree ensures:
1. Schema changes complete before code changes
2. Templates created before email sending
3. No file conflicts between parallel stories

## Progress Tracking

Run `60/status` to see:
- ✅ Completed stories
- 🔄 In-progress stories
- 🔒 Blocked stories (waiting on dependencies)
- ⏭️ Ready stories (can start now)

## Notes

- This is a **staging environment** deployment
- All changes will be tested before production
- Email templates use AWS SES (not Supabase default)
- Parallel execution enabled for 5-hour completion vs 6.7 hours sequential
