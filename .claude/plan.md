# Supabase Performance Optimization Plan

## Context
- 75,000 requests/day and 7,000/hour on staging
- Sources: pg_cron jobs (~40-50%), frontend polling (~30-40%), realtime cascades (~10-20%)
- Global QueryClient defaults are good, but individual hooks override them aggressively

## Stories

### Phase 1: Quick Wins — Cron Interval Tuning (Backend)

#### PERF-001: Increase auto-join-scheduler cron from 2min to 5min
- **Type**: migration
- **File**: New migration to update cron schedule
- **Impact**: Saves ~1,500 requests/day (720 → 288 runs/day)
- **Acceptance**:
  - New migration calls `cron.unschedule('auto-join-scheduler')` then `cron.schedule` with `*/5 * * * *`
  - Meetings still get bots deployed within 5-minute window
- **Est**: 5min

#### PERF-002: Increase poll-gladia-jobs cron from 3min to 5min
- **Type**: migration
- **File**: New migration to update cron schedule
- **Impact**: Saves ~160 requests/day (480 → 288 runs/day)
- **Acceptance**:
  - New migration updates gladia polling to `*/5 * * * *`
  - Aligns with poll-s3-upload-queue and poll-transcription-queue intervals
- **Est**: 5min

#### PERF-003: Add early-exit gate checks to polling crons
- **Type**: edge function
- **Files**: `supabase/functions/poll-s3-upload-queue/index.ts`, `supabase/functions/poll-transcription-queue/index.ts`, `supabase/functions/poll-gladia-jobs/index.ts`
- **Impact**: Saves ~500-1,000 requests/day when no work pending
- **Acceptance**:
  - Each function does a fast count check first
  - Returns early with 200 + `{ skipped: true }` if no pending work
  - Full logic only runs when work exists
- **Est**: 15min

---

### Phase 2: Quick Wins — Frontend Polling Fixes

#### PERF-004: Fix useCreditBalance — adopt smart polling
- **Type**: frontend
- **File**: `src/lib/hooks/useCreditBalance.ts`
- **Impact**: ~2,000 fewer requests/day per active user
- **Changes**:
  - Replace `refetchInterval: 30_000` with `useSmartPollingInterval(60000, 'background')`
  - Remove `refetchOnWindowFocus: true`
- **Est**: 5min

#### PERF-005: Fix useApprovalDetection — increase staleTime from 1s to 30s
- **Type**: frontend
- **File**: `src/lib/hooks/useApprovalDetection.ts`
- **Impact**: ~500 fewer requests/day per active user
- **Changes**:
  - Change `staleTime: 1000` → `staleTime: 30 * 1000` (both queries at lines 98, 134)
  - Remove `refetchOnWindowFocus: true` (both queries)
- **Est**: 5min

#### PERF-006: Remove redundant polling from usePendingHITLRequests (has realtime)
- **Type**: frontend
- **File**: `src/lib/hooks/useHITLRequests.ts`
- **Impact**: ~300 fewer requests/day per active user
- **Changes**:
  - Remove `refetchInterval: hitlPolling` (line 81) — realtime subscription handles updates
  - Remove unused `useSmartPollingInterval` import
- **Est**: 5min

#### PERF-007: Fix OrganizationManagementPage — reduce polling from 30s to 120s
- **Type**: frontend
- **File**: `src/pages/settings/OrganizationManagementPage.tsx`
- **Impact**: ~200 fewer requests/day per active user
- **Changes**:
  - Change `refetchInterval: 30000` → use `useSmartPollingInterval(120000, 'background')` at lines 199, 253
- **Est**: 5min

---

### Phase 3: Medium Impact — Redundant Polling+Realtime Cleanup

#### PERF-008: Remove redundant polling where realtime subscriptions exist
- **Type**: frontend
- **Files**: `src/lib/hooks/useEmailActions.ts`, `src/lib/hooks/useRecordings.ts`, `src/components/IntegrationReconnectBanner.tsx`
- **Impact**: ~500 fewer requests/day per active user
- **Changes**:
  - `useEmailActions.ts`: Has realtime (line 404) AND polling (line 367) — remove polling
  - `useRecordings.ts`: Has realtime (line 587) AND polling (line 622) — remove polling for active recordings
  - `IntegrationReconnectBanner.tsx`: Increase staleTime from 30s to 5min
- **Est**: 15min

#### PERF-009: Fix orgStore N+1 meeting count queries
- **Type**: frontend
- **File**: `src/lib/stores/orgStore.ts`
- **Impact**: Saves N queries per app load (N = number of orgs)
- **Changes**:
  - Lines 235-248: Skip meeting count when user already has a persisted `activeOrgId`
  - Only run the meeting-count logic for first-time org selection
- **Est**: 15min

---

### Phase 4: Backend Batching

#### PERF-010: Batch google-calendar-sync per-user fan-out
- **Type**: edge function
- **File**: `supabase/functions/google-calendar-sync/index.ts`
- **Impact**: Saves ~3,000 internal function invocations/day
- **Changes**:
  - Process all users within single invocation instead of calling edge function per user
  - Fetch all google_integrations in one query, process in parallel within function
- **Est**: 30min

---

## Execution Order

```
PERF-001 ─┐
PERF-002 ─┤ (parallel — independent SQL migrations)
PERF-003 ─┘

PERF-004 ─┐
PERF-005 ─┤ (parallel — independent hook fixes)
PERF-006 ─┤
PERF-007 ─┘

PERF-008 ─── (after PERF-006 pattern)
PERF-009 ─── (independent)

PERF-010 ─── (larger refactor, independent)
```

## Estimated Total Savings: ~8,000-10,000+ fewer requests/day
## Estimated Total Effort: ~1.5 hours
