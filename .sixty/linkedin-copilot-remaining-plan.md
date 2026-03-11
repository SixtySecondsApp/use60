# LinkedIn Lead Response Copilot — Remaining Work Plan

**Created**: 2026-03-09
**Branch**: `feat/linkedin-lead-response-copilot`
**PR**: https://github.com/SixtySecondsApp/use60/pull/107

## What's Already Built (PR #107)

| Component | File | Status |
|-----------|------|--------|
| Database migration | `supabase/migrations/20260309211920_linkedin_lead_tables.sql` | Deployed to staging |
| OAuth initiate | `supabase/functions/oauth-initiate/providers/linkedin.ts` | Deployed |
| OAuth callback | `supabase/functions/linkedin-oauth-callback/index.ts` | Deployed |
| Webhook endpoint | `supabase/functions/webhook-linkedin/index.ts` | Deployed |
| Ingest orchestrator | `supabase/functions/linkedin-lead-ingest/index.ts` | Deployed |
| Contact matching | `supabase/functions/linkedin-lead-ingest/matching.ts` | Deployed |
| ICP scoring | `supabase/functions/linkedin-lead-ingest/scoring.ts` | Deployed |
| Email drafting | `supabase/functions/linkedin-lead-ingest/drafting.ts` | Deployed |
| Task creation | `supabase/functions/linkedin-lead-ingest/tasks.ts` | Deployed |
| Slack notification | `supabase/functions/linkedin-lead-ingest/notification.ts` | Deployed |
| Reconciliation job | `supabase/functions/linkedin-lead-reconcile/index.ts` | Deployed |
| Frontend hook | `src/lib/hooks/useLinkedInIntegration.ts` | Created |
| Config entries | `supabase/config.toml` (verify_jwt=false) | Deployed |
| OAuth router | `supabase/functions/oauth-initiate/index.ts` (linkedin added) | Deployed |

**Secrets set on staging**: `LINKEDIN_CLIENT_ID`, `LINKEDIN_CLIENT_SECRET`, `LINKEDIN_REDIRECT_URI`
**Redirect URIs registered**: staging, production, development

---

## Remaining Work: 3 Independent Batches

Each batch can run in its own context window with `/60:ship --resume` or by referencing this plan.

---

### Batch 1: Frontend — LinkedIn Integration UI

**Scope**: Add LinkedIn to the Integrations page + lead source configuration
**Tier**: 2 (Sonnet x2) — 5 stories, familiar component patterns
**Branch**: Continue on `feat/linkedin-lead-response-copilot`

#### Stories

**B1-001: LinkedIn Integration Card on Integrations Page**
- File: `src/pages/Integrations.tsx` (1,232 lines)
- Pattern: Copy the HubSpot card pattern — `IntegrationCardWithLogo` with status badge
- Add to "Sales Tools" or new "Lead Generation" category
- Uses `useLinkedInIntegration()` hook (already built)
- Connect button triggers `connectLinkedIn()`, status shows connected/disconnected
- Handle `?linkedin_status=connected` URL param (hook already does this)

**B1-002: LinkedInConfigModal Component**
- File: `src/components/integrations/LinkedInConfigModal.tsx` (new, ~200 lines)
- Pattern: Copy `HubSpotConfigModal.tsx` (295 lines)
- Sections:
  - Connection status (ad account name, scopes, connected_at)
  - Lead sources summary (count of active forms/events)
  - Quick actions: "Configure Lead Sources" → opens B1-003, "View Sync History"
  - Webhook URL display (for manual webhook registration)
  - Danger zone: Disconnect
- Uses `useLinkedInIntegration()` hook

**B1-003: Lead Source Configuration Panel**
- File: `src/components/integrations/LinkedInLeadSourcesConfig.tsx` (new, ~300 lines)
- Fetches available forms/events from LinkedIn API via new edge function handler
- Toggle switches per form to enable/disable sync
- Writes to `linkedin_lead_sources` table
- Shows form name, source type badge (ad_form/event_form), campaign name
- Needs new edge function handler to list forms (see B1-004)

**B1-004: Edge Function — List LinkedIn Lead Forms**
- File: Add handler to `linkedin-oauth-callback/index.ts` or create `linkedin-admin/index.ts`
- Calls LinkedIn API: `GET /rest/leadForms?q=owner&owner=...` with access token from `integration_credentials`
- Returns list of forms with id, name, status, associated campaigns
- Also queries events API for event registration forms
- Auth: JWT (user must be org admin)

**B1-005: Sync History View**
- File: `src/components/integrations/LinkedInSyncHistory.tsx` (new, ~150 lines)
- Queries `linkedin_sync_runs` table via supabase
- Table showing: timestamp, run_type, leads_received, leads_created, leads_matched, duration_ms, error
- Filterable by date range
- Shows in LinkedInConfigModal or as separate tab

#### Key References
```
src/pages/Integrations.tsx                           — card grid, category sections
src/components/integrations/HubSpotConfigModal.tsx   — config modal pattern (295 lines)
src/components/integrations/ConfigureModal.tsx        — base modal wrapper
src/lib/hooks/useLinkedInIntegration.ts              — already built, connect/disconnect/status
```

---

### Batch 2: Slack Interactive Handler — LinkedIn Lead Approval

**Scope**: Wire the Slack approval buttons to actual send actions
**Tier**: 2 (Sonnet x2) — 4 stories, extends existing slack-interactive patterns
**Branch**: Continue on `feat/linkedin-lead-response-copilot`

#### Stories

**B2-001: Slack Interactive Handler for LinkedIn Lead Actions**
- File: `supabase/functions/slack-interactive/handlers/linkedinLead.ts` (new, ~350 lines)
- Pattern: Copy `handlers/hitl.ts` (538 lines) + `handlers/autonomyPromotion.ts` (228 lines)
- Handle action_id prefixes:
  - `approve::linkedin_lead_email::{hitl_id}` → send email, update HITL, record signal
  - `edit::linkedin_lead_email::{hitl_id}` → redirect to app (contact page with draft open)
  - `reassign::linkedin_lead_email::{hitl_id}` → open modal with user picker
  - `reject::linkedin_lead_email::{hitl_id}` → dismiss, update HITL status
- On approve:
  - Read `hitl_pending_approvals.original_content` for email draft
  - Call `email-send-as-rep` for Gmail/Outlook OR `crm-push` with `to_instantly` action
  - Update Slack message to show "Sent" confirmation (use `buildActionConfirmation()`)
  - Record `autopilot_signals` entry with `signal_type: 'approved'`, `action_type: 'linkedin_lead_email'`
- On reject/dismiss:
  - Update HITL status to 'rejected'
  - Record signal with `signal_type: 'rejected'`
  - Update Slack message

**B2-002: Register Handler in slack-interactive Router**
- File: `supabase/functions/slack-interactive/index.ts` (large file, ~9500 lines)
- Import `handleLinkedInLeadAction` from `./handlers/linkedinLead.ts`
- Add action_id routing for `approve::linkedin_lead_email`, `edit::linkedin_lead_email`, `reassign::linkedin_lead_email`, `reject::linkedin_lead_email`
- Follow existing dispatch pattern (switch on action_id prefix)

**B2-003: Send Channel Selection**
- Within B2-001 handler, check user preference for send channel
- If Instantly: call `supabase.functions.invoke('crm-push', { body: { action: 'to_instantly', ... } })`
- If Gmail/Outlook: call `supabase.functions.invoke('email-send-as-rep', { body: { ... } })`
- Default to Gmail/Outlook if no Instantly integration configured
- Check `integration_credentials` for `provider='instantly'` to determine availability

**B2-004: Reassign Modal**
- Within B2-001, handle reassign action:
  - Open Slack modal (`views.open`) with user selector
  - On submit: update `hitl_pending_approvals.user_id`, re-send Slack DM to new owner
  - Update original message to "Reassigned to @user"

#### Key References
```
supabase/functions/slack-interactive/index.ts                    — main router (dispatch pattern)
supabase/functions/slack-interactive/handlers/hitl.ts            — HITL approve/reject (538 lines)
supabase/functions/slack-interactive/handlers/autonomyPromotion.ts — promotion flow (228 lines)
supabase/functions/_shared/slackBlocks.ts                        — block builders
supabase/functions/_shared/orchestrator/adapters/emailDraftApproval.ts — email approval pattern
supabase/functions/linkedin-lead-ingest/notification.ts          — builds the Slack blocks (already done)
```

---

### Batch 3: Autonomy Progression for LinkedIn Leads

**Scope**: Track clean approvals, promote to auto-send after 5
**Tier**: 1 (Sonnet x1) — 3 stories, extends existing autonomy resolver
**Branch**: Continue on `feat/linkedin-lead-response-copilot`

#### Stories

**B3-001: Register `linkedin_lead_email` Action Type**
- File: `supabase/functions/_shared/orchestrator/unifiedAutonomyResolver.ts` (367 lines)
- Add `'linkedin_lead_email'` to the known action types
- File: `supabase/functions/_shared/orchestrator/autonomyResolver.ts`
- Add default policy for `linkedin_lead_email`: `{ default_tier: 'approve' }`
- Ensure `autopilot_confidence` row is created on first signal for this action type

**B3-002: Signal Recording in Slack Handler**
- Already partially covered by B2-001 (recording autopilot_signals)
- Ensure each approve/reject records:
  - `signal_type`: 'approved' | 'rejected' | 'edited'
  - `action_type`: 'linkedin_lead_email'
  - `was_edited`: boolean (true if user edited before sending)
  - `time_to_respond_ms`: time between notification and action
  - `autonomy_tier_at_time`: current tier when action was taken
- Track consecutive clean approvals (no edits) in `autopilot_confidence.clean_approval_rate`

**B3-003: Auto-Send Promotion After 5 Clean Approvals**
- File: Extend `supabase/functions/slack-interactive/handlers/linkedinLead.ts`
- After recording approval signal, check:
  - Query `autopilot_signals` for last 5 signals where `action_type = 'linkedin_lead_email'`
  - If all 5 are `approved` and `was_edited = false`:
    - Send promotion Slack DM using existing `autonomyPromotion.ts` pattern
    - Buttons: "Enable auto-send for LinkedIn leads" / "Not yet"
    - On accept: upsert `autonomy_policies` with `policy: 'auto'` for `linkedin_lead_email`
    - On dismiss: set cooldown (7 days) in `autopilot_confidence.cooldown_until`
- In the ingest orchestrator (`linkedin-lead-ingest/index.ts`):
  - Before creating HITL approval, check autonomy tier via `resolveAutonomy()`
  - If tier is `'auto'`: skip HITL, send email directly after configurable delay (default 5min)
  - If tier is `'approve'`: current behavior (Slack DM with buttons)
  - If tier is `'suggest'`: create command centre item only, no Slack DM

#### Key References
```
supabase/functions/_shared/orchestrator/unifiedAutonomyResolver.ts  — tier resolution (367 lines)
supabase/functions/_shared/orchestrator/autonomyResolver.ts         — org policy chain
supabase/functions/slack-interactive/handlers/autonomyPromotion.ts  — promotion flow (228 lines)
supabase/functions/_shared/orchestrator/promotionEngine.ts          — applyPromotion()
Tables: autopilot_confidence, autopilot_signals, autonomy_policies, autonomy_audit_log
```

---

## Execution Order

```
Batch 1 (Frontend UI)          — can start immediately, no deps on B2/B3
Batch 2 (Slack Handlers)       — can start immediately, no deps on B1/B3
Batch 3 (Autonomy)             — depends on B2-001 (signal recording in handler)

Recommended: Run B1 and B2 in parallel, then B3.
```

## Resume Commands

```bash
# Start a new context window and run:
/60:ship --resume

# Or reference this plan directly:
# "Continue LinkedIn Lead Response Copilot — execute Batch 1 (Frontend UI) from .sixty/linkedin-copilot-remaining-plan.md"
```

## Deployment Checklist (after all batches)

- [ ] Deploy updated `slack-interactive` to staging
- [ ] Deploy updated `linkedin-lead-ingest` to staging (autonomy check)
- [ ] Set secrets on production: `LINKEDIN_CLIENT_ID`, `LINKEDIN_CLIENT_SECRET`, `LINKEDIN_REDIRECT_URI`
- [ ] Deploy all LinkedIn functions to production
- [ ] Apply migration to production
- [ ] Test OAuth flow end-to-end on staging with real LinkedIn ad account
- [ ] Test webhook with LinkedIn test lead
- [ ] Verify Slack approval → email send flow
- [ ] Verify autonomy promotion after 5 clean approvals
