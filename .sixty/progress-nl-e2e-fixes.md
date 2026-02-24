# Progress — NL Table Builder E2E Fixes

## Codebase Patterns
- Edge functions use `esm.sh@2.43.4` for Supabase client (pinned)
- Deploy with `--no-verify-jwt` to staging
- `instantly-push` edge function reads `config?.push_config?.campaign_id` for per-row push
- `CampaignApprovalBanner` queries `instantly-admin` for campaign links and statuses
- Email generation: Tier 1 Claude Sonnet → Tier 2 Gemini Flash (example-based)

---

## Session Log

### 2026-02-07 — NLE-001 ✅
**Story**: Fix table horizontal overscroll chaining
**Files**: src/components/ops/OpsTable.tsx
**Time**: 1 min
**Gates**: build ✅
**Learnings**: `overscrollBehavior: 'contain'` prevents scroll chaining

---

### 2026-02-07 — NLE-002 ✅
**Story**: Remove auto-push + fix push_config structure
**Files**: supabase/functions/ops-workflow-orchestrator/index.ts
**Time**: 10 min
**Gates**: build ✅
**Learnings**: Kept fullMapping build for campaign link record but removed push call. push_config nesting is what OpsTableCell reads for per-row push.

---

### 2026-02-07 — NLE-003 ✅
**Story**: Add email_type + event_details to planner
**Files**: supabase/functions/ops-workflow-orchestrator/index.ts
**Time**: 8 min
**Gates**: build ✅
**Learnings**: Rules 15-16 in planner prompt, tool schema needs enum + object for email_type/event_details

---

### 2026-02-07 — NLE-004 ✅
**Story**: Make email generation type-aware
**Files**: supabase/functions/generate-email-sequence/index.ts
**Time**: 15 min
**Gates**: build ✅
**Learnings**: Three helpers: buildEmailSystemPrompt, filterContextForEmailType, buildEventDetailsBlock. All 3 generation functions + all 3 callsites updated.

---

### 2026-02-07 — NLE-005 ✅
**Story**: Push All Leads button + enable repush
**Files**: src/components/ops/CampaignApprovalBanner.tsx, src/components/ops/OpsTableCell.tsx
**Time**: 8 min
**Gates**: build ✅
**Learnings**: pushAllMutation fetches row IDs + uses field_mapping from campaign link

---

### 2026-02-07 — NLE-006 ✅
**Story**: Campaign status control — all statuses + pause
**Files**: src/components/ops/CampaignApprovalBanner.tsx, src/components/ops/OpsTableCell.tsx
**Time**: 10 min
**Gates**: build ✅
**Learnings**: Banner now renders per-campaign with state-based styling (green/amber/gray). pauseMutation calls instantly-admin.

---

## Build Verification
- `npx vite build --mode staging` — ✅ passed (38s, no TS errors)
- Edge functions need deploying: `ops-workflow-orchestrator`, `generate-email-sequence`
