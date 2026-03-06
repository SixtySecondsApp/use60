# PRD: Onboarding & First-Run UX Fixes

## Introduction

A comprehensive set of bugs and UX issues discovered during the first-run experience for new users. These span broken navigation, misleading credit displays, configuration save failures, weak password validation, and unpolished form controls. Fixing these ensures new users have a polished, trustworthy first impression of the platform.

## Goals

- Fix all 5 broken post-onboarding CTAs so users land on correct pages
- Fix the "Failed to save configuration" error caused by missing seed data
- Strengthen password requirements for security
- Eliminate all misleading credit/usage displays for new users
- Enforce item limits on all tag/list inputs across the platform
- Polish onboarding form UX (dropdowns, methodology labels, tooltips)
- Remove stale migration/upgrade popups that confuse new users

## User Stories

### US-001: Fix ActivationChecklist "Complete Your Profile" CTA
**Description:** As a new user, I want the "Go to Profile" button to take me to a working profile page so I can complete my setup.

**Acceptance Criteria:**
- [ ] `href` changed from `/settings/profile` to `/settings/account` in ActivationChecklist.tsx line 43
- [ ] Clicking "Go to Profile" lands on a working page
- [ ] Typecheck passes
- [ ] **[UI]** Verify in browser on localhost:5175

### US-002: Fix ActivationChecklist "Connect Calendar" CTA
**Description:** As a new user, I want the "Connect Calendar" button to take me to the integrations page so I can sync my first meeting.

**Acceptance Criteria:**
- [ ] `href` changed from `/settings/integrations` to `/integrations` for the `first_meeting_synced` item
- [ ] Clicking "Connect Calendar" lands on the integrations hub page
- [ ] Typecheck passes
- [ ] **[UI]** Verify in browser on localhost:5175

### US-003: Fix ActivationChecklist "Connect Notetaker" CTA
**Description:** As a new user, I want the "Connect Notetaker" button to take me to the integrations page.

**Acceptance Criteria:**
- [ ] `href` changed from `/settings/integrations` to `/integrations` for the `notetaker_connected` item
- [ ] Clicking "Connect Notetaker" lands on the integrations hub page
- [ ] Typecheck passes

### US-004: Fix ActivationChecklist "Connect CRM" CTA
**Description:** As a new user, I want the "Connect CRM" button to take me to the integrations page.

**Acceptance Criteria:**
- [ ] `href` changed from `/settings/integrations` to `/integrations` for the `crm_integrated` item
- [ ] Clicking "Connect CRM" lands on the integrations hub page
- [ ] Typecheck passes

### US-005: Fix ActivationChecklist "Invite Team" CTA
**Description:** As a new user, I want the "Invite Team" button to take me to the team management page so I can invite colleagues.

**Acceptance Criteria:**
- [ ] `href` changed from `/settings/team` to `/settings/team-members` for the `team_invited` item
- [ ] Clicking "Invite Team" lands on the organization management page
- [ ] Typecheck passes
- [ ] **[UI]** Verify in browser on localhost:5175

### US-006: Seed Missing Config Keys in agent_config_defaults
**Description:** As a new user, I want saving my configuration during onboarding to succeed instead of showing "Failed to save configuration."

**Acceptance Criteria:**
- [ ] New migration seeds all onboarding config keys into `agent_config_defaults` table
- [ ] Keys seeded: `fiscal_year_start_month`, `typical_deal_size_range`, `average_sales_cycle_days`, `crm_stage_mapping`, `sales_methodology`, `sales_motion_type`, `key_competitors`, `pricing_model`, `target_customer_profile`, `common_objections`, `industry_vertical`, `company_size`, `product_service_category`, `team_size`
- [ ] Each key mapped to correct `agent_type` matching `agentTypeForKey()` in AgentConfigConfirmStep.tsx
- [ ] `setOrgOverride` calls succeed for all config keys
- [ ] Migration runs cleanly (idempotent — ON CONFLICT DO NOTHING)
- [ ] Typecheck passes

### US-007: Strengthen Password Validation on Signup
**Description:** As a platform admin, I want signup passwords to require at least 1 uppercase letter and 1 special character for better security.

**Acceptance Criteria:**
- [ ] Password validation requires: minimum 6 characters, at least 1 uppercase letter, at least 1 special character
- [ ] Validation applied in `src/pages/auth/signup.tsx` handleSubmit
- [ ] Hint text updated from "Must be at least 6 characters" to "Min 6 chars, 1 uppercase, 1 special character"
- [ ] Toast error message is specific (e.g., "Password must include an uppercase letter and a special character")
- [ ] Same validation applied in `TestUserSignup.tsx` and `InviteSignup.tsx` for consistency
- [ ] Typecheck passes
- [ ] **[UI]** Verify in browser on localhost:5175

### US-008: Fix Credits Depleted Banner Race Condition
**Description:** As a new user, I want to see a welcome banner about my free credits instead of a scary "AI credits depleted" message.

**Acceptance Criteria:**
- [ ] When `balance <= 0` AND user has zero `ai_cost_events`, do NOT show the red "depleted" banner
- [ ] Instead show a green informational banner or suppress entirely while welcome credits are being granted
- [ ] The `grant-welcome-credits` edge function must complete before the banner evaluates balance
- [ ] If welcome credits are `pending` (localStorage flag), show green banner even if balance query hasn't refreshed yet
- [ ] After welcome credits are granted and balance refreshes to >0, green banner shows "10 Free AI credits have been added!"
- [ ] Typecheck passes
- [ ] **[UI]** Verify in browser on localhost:5175

### US-009: Remove Credit Migration Popup for New Users
**Description:** As a new user, I want to not see a "We've upgraded your credits" popup since I never had a prior version.

**Acceptance Criteria:**
- [ ] `CreditMigrationModal` does NOT show for users/orgs created after the credit system launch
- [ ] Add guard: check if org has any `credit_ledger` rows with `type = 'migration'`, or compare `organization.created_at` against a cutoff date
- [ ] Existing users who haven't dismissed the modal should still see it
- [ ] The `localStorage` DISMISSED_KEY check remains as a secondary guard
- [ ] Typecheck passes
- [ ] **[UI]** Verify in browser on localhost:5175

### US-010: Fix UsageChart Header Stats — Remove Dollar Signs
**Description:** As a user, I want the usage chart header to show credits not dollars so the numbers make sense.

**Acceptance Criteria:**
- [ ] Line 356: Change `$${totalCost.toFixed(2)}` to display as credits (e.g., `${totalCost.toFixed(1)} credits`)
- [ ] Line 363: Change `$${projectedMonthly.current.toFixed(2)}` to credits format
- [ ] Lines 384: Change projection summary cards from `$${cost.toFixed(2)}/mo` to credits format
- [ ] Typecheck passes
- [ ] **[UI]** Verify in browser on localhost:5175

### US-011: Fix UsageChart Tooltip and Y-Axis — Remove Dollar Signs
**Description:** As a user, I want chart tooltips and axis labels to show credits not dollars.

**Acceptance Criteria:**
- [ ] Line 201 (CustomTooltip): Change `$${Number(entry.value).toFixed(4)}` to credits format
- [ ] Line 414 (Y-axis tickFormatter): Change `` `$${v}` `` to credits format
- [ ] Legend labels updated: "Actual spend" → "Actual usage" or "Credits used"
- [ ] Typecheck passes

### US-012: Fix UsageChart Legend Labels
**Description:** As a user, I want the chart legend to use credit-appropriate language, not dollar language.

**Acceptance Criteria:**
- [ ] Line 217: `"Actual spend"` → `"Credits used"`
- [ ] Line 219: `"Low tier projection"` → keep or rename to `"Low estimate"`
- [ ] Line 221: `"Medium tier projection"` → keep or rename to `"Medium estimate"`
- [ ] Line 223: `"High tier projection"` → keep or rename to `"High estimate"`
- [ ] Section header in CreditsSettingsPage.tsx line 411: `"Spend Trend (30 Days)"` → `"Usage Trend (30 Days)"`
- [ ] Typecheck passes

### US-013: Exclude Onboarding Cost Events from Usage Display
**Description:** As a new user, I want my usage chart to not show AI costs from onboarding setup that I didn't initiate.

**Acceptance Criteria:**
- [ ] Add `metadata: { source: 'onboarding' }` to cost events logged during onboarding: `deep-enrich-organization` (line 522), `agent-initial-scan`, `api-skill-builder`
- [ ] `UsageChart.tsx` query filters out events where `metadata->>'source' = 'onboarding'`, or visually distinguishes them
- [ ] New users see 0 usage on first login (not $3)
- [ ] Typecheck passes
- [ ] **[UI]** Verify in browser on localhost:5175

### US-014: Fix Fiscal Year Dropdown to Show Month Names
**Description:** As a new user, I want the fiscal year dropdown to show month names instead of numbers so I can make an informed choice.

**Acceptance Criteria:**
- [ ] Dropdown shows "January, February, March..." (or "Jan, Feb, Mar...") instead of "1, 2, 3..."
- [ ] The stored/submitted value remains numeric (1-12)
- [ ] Fix applied in `AgentConfigConfirmStep.tsx` lines 83-85
- [ ] Typecheck passes
- [ ] **[UI]** Verify in browser on localhost:5175

### US-015: Fix Sales Methodology Dropdown — Capitalisation
**Description:** As a new user, I want sales methodology options to be properly capitalised so they look professional.

**Acceptance Criteria:**
- [ ] Options display as: Generic, MEDDIC, BANT, SPIN, Challenger (not generic, meddic, bant, spin, challenger)
- [ ] Acronyms fully capitalised: MEDDIC, BANT, SPIN
- [ ] Non-acronyms start with capital: Generic, Challenger
- [ ] The stored/submitted value can remain lowercase — only the display label changes
- [ ] Fix applied in `AgentConfigConfirmStep.tsx` line 64
- [ ] Typecheck passes
- [ ] **[UI]** Verify in browser on localhost:5175

### US-016: Add Sales Methodology Tooltips
**Description:** As a new user, I want hover tooltips on each sales methodology explaining what it means so I can choose correctly.

**Acceptance Criteria:**
- [ ] Each methodology option has a hover tooltip with a brief explanation:
  - Generic: "A flexible, general-purpose sales approach"
  - MEDDIC: "Metrics, Economic Buyer, Decision Criteria, Decision Process, Identify Pain, Champion"
  - BANT: "Budget, Authority, Need, Timeline"
  - SPIN: "Situation, Problem, Implication, Need-Payoff"
  - Challenger: "The Challenger Sale — teach, tailor, and take control of the conversation"
- [ ] Tooltip uses existing Radix/shadcn Tooltip component for consistency
- [ ] Typecheck passes
- [ ] **[UI]** Verify in browser on localhost:5175

### US-017: Add Item Limit to AgentConfigConfirmStep TagEditor
**Description:** As a new user, I want tag inputs in the config step to be limited to 10 items so the system isn't overloaded.

**Acceptance Criteria:**
- [ ] `TagEditor` component in `AgentConfigConfirmStep.tsx` (lines 217-270) enforces MAX_ITEMS = 10
- [ ] `add()` function (line 226) checks `values.length >= MAX_ITEMS` before adding
- [ ] Input is disabled when limit reached
- [ ] Warning text shown: "Maximum 10 items"
- [ ] Affects: `key_competitors`, `common_objections` fields
- [ ] Typecheck passes
- [ ] **[UI]** Verify in browser on localhost:5175

### US-018: Add Item Limits to AIIntelligencePage Settings
**Description:** As a user editing AI settings, I want all list inputs limited to 10 items for consistency with onboarding.

**Acceptance Criteria:**
- [ ] Define `MAX_ITEMS = 10` constant in `AIIntelligencePage.tsx`
- [ ] "Add" buttons for criteria (line 611), disqualifiers (line 652), questions (line 697), objections (line 802) include `disabled={(array.length) >= MAX_ITEMS}`
- [ ] `onKeyDown` Enter handlers for avoid words (line 743) and buyingSignals (line 859) check count before adding
- [ ] Warning text shown when limit reached for each field
- [ ] Typecheck passes
- [ ] **[UI]** Verify in browser on localhost:5175

### US-019: Auto-trigger basic analysis on Fathom webhook meeting ingestion
**Description:** As a user, I want meetings synced via Fathom to be automatically analyzed by AI so I don't have to manually click "Reprocess."

**Acceptance Criteria:**
- [ ] When `meetings-webhook` receives a `transcript` event (meeting now has transcript text), auto-trigger `analyzeTranscriptWithClaude`
- [ ] Analysis runs asynchronously (fire-and-forget) so webhook responds quickly
- [ ] Credits are checked via `checkCreditBalance` before running — if insufficient, skip analysis silently and leave meeting in basic-summary state
- [ ] Cost event logged via `logAICostEvent` with feature key `meeting_summary`
- [ ] If meeting already has `sentiment_score` set (idempotency), skip re-analysis
- [ ] Typecheck passes

### US-020: Auto-trigger basic analysis on MeetingBaaS ingestion
**Description:** As a user using the 60 Notetaker, I want meetings to be automatically analyzed when transcription completes.

**Acceptance Criteria:**
- [ ] When `meetingbaas-webhook` receives `transcript.ready`, after `process-recording` completes, auto-trigger `analyzeTranscriptWithClaude`
- [ ] Same credit check and idempotency guards as US-019
- [ ] Cost event logged
- [ ] Typecheck passes

### US-021: Auto-trigger deep structured summary after basic analysis
**Description:** As a user, I want the deep structured summary to run automatically after basic analysis completes so dashboard stats are populated without manual action.

**Acceptance Criteria:**
- [ ] After `analyzeTranscriptWithClaude` completes successfully, auto-invoke `meeting-process-structured-summary` for the same meeting
- [ ] Credit check before running — if insufficient credits, skip silently (basic summary remains as fallback)
- [ ] Populates: `meeting_structured_summaries`, `meeting_classifications`, `deal_truth_fields`
- [ ] Dashboard stats (pipeline conversion, objection counts, competitor mentions, stage detection) update automatically
- [ ] Cost event logged with appropriate feature key
- [ ] Typecheck passes

### US-022: Auto-trigger scorecard generation after structured summary
**Description:** As a user, I want coaching scorecards generated automatically so the team KPI grid and coaching views are populated.

**Acceptance Criteria:**
- [ ] After `meeting-process-structured-summary` completes successfully, auto-invoke `meeting-generate-scorecard` for the same meeting
- [ ] Credit check before running — if insufficient, skip silently
- [ ] Populates: `meeting_scorecards` (overall_score, grade, metric_scores, coaching_tips)
- [ ] Team KPI grid and coaching leaderboards update automatically
- [ ] Cost event logged
- [ ] Typecheck passes

### US-023: Auto-queue meeting for Gemini intelligence indexing
**Description:** As a user, I want new meetings automatically indexed for semantic search so "Ask Anything" works without manual intervention.

**Acceptance Criteria:**
- [ ] After analysis pipeline completes, insert row into `meeting_index_queue` for the meeting
- [ ] `meeting-intelligence-process-queue` picks it up on next cron run or is invoked directly
- [ ] Meeting becomes searchable via the Ask Anything RAG panel in Meeting Analytics
- [ ] Typecheck passes

### US-024: Add analysis pipeline orchestrator function
**Description:** As a developer, I want a single orchestrator that chains basic analysis → structured summary → scorecard → indexing so all ingestion paths can call one function.

**Acceptance Criteria:**
- [ ] Create `runFullMeetingAnalysisPipeline(supabase, meetingId, orgId, userId)` shared function
- [ ] Pipeline steps: (1) analyzeTranscriptWithClaude, (2) meeting-process-structured-summary, (3) meeting-generate-scorecard, (4) queue for Gemini indexing
- [ ] Each step has independent credit check — pipeline continues with remaining steps if one fails due to insufficient credits
- [ ] Each step has error handling — failure in one step doesn't block subsequent steps
- [ ] Pipeline logs total credits consumed across all steps
- [ ] All ingestion paths (Fathom webhook, fathom-sync, MeetingBaaS webhook, voice-transcribe-poll) call this single orchestrator
- [ ] Typecheck passes

### US-025: Keep manual "Reprocess" button as fallback
**Description:** As a user, I want to still be able to manually reprocess a meeting if auto-analysis was skipped (e.g., due to insufficient credits at time of upload).

**Acceptance Criteria:**
- [ ] The existing "AI Analysis Incomplete" banner and "Reprocess" button in MeetingDetail.tsx remain functional
- [ ] Button now also triggers the full pipeline (structured summary + scorecard + indexing), not just basic analysis
- [ ] If meeting already has complete analysis (scorecard + structured summary), hide the reprocess banner
- [ ] Credit-gated check remains via `useCreditGatedAction`
- [ ] Typecheck passes
- [ ] **[UI]** Verify in browser on localhost:5175

### US-026: Update meeting detail to show analysis status
**Description:** As a user, I want to see what analysis has been completed on a meeting so I know if deeper insights are available.

**Acceptance Criteria:**
- [ ] MeetingDetail page shows analysis status indicators: Basic Analysis (check/pending), Structured Summary (check/pending), Scorecard (check/pending)
- [ ] If all three are complete, show "Full analysis complete" badge
- [ ] If only basic is complete, show "Deep analysis pending" with option to manually trigger
- [ ] Status reads from `meeting_structured_summaries` and `meeting_scorecards` table presence
- [ ] Typecheck passes
- [ ] **[UI]** Verify in browser on localhost:5175

## Functional Requirements

- FR-1: All 5 ActivationChecklist CTA links must point to existing, working routes
- FR-2: All onboarding config keys must be seeded in `agent_config_defaults` before the save API validates them
- FR-3: Password validation must enforce complexity beyond just minimum length
- FR-4: Credit system banners must distinguish between new users (no history) and users who have exhausted credits
- FR-5: Usage chart must display values in the correct unit (credits, not dollars)
- FR-6: Onboarding AI cost events must not appear as user-initiated usage
- FR-7: Onboarding form dropdowns must use human-readable labels
- FR-8: Stale migration popups must not appear for users with no prior credit history
- FR-9: All tag/list inputs must enforce a maximum of 10 items
- FR-10: Meetings must be automatically analyzed on ingestion without manual user action
- FR-11: Analysis pipeline must be credit-aware — each step independently checks balance and skips gracefully if insufficient
- FR-12: Dashboard stats (scorecards, classifications, deal truth fields) must update automatically after meeting analysis
- FR-13: Basic summary remains as fallback when credits are insufficient for deep analysis

## Non-Goals (Out of Scope)

- Redesigning the full credits page or usage analytics
- Changing the actual credit pricing or amounts
- Modifying the onboarding flow sequence or steps
- Adding new onboarding steps or features
- Fixing FeatureModelRow.tsx dollar display (admin-only, showing actual API cost is intentional)
- Changing the SkillsConfigStep limits (already correctly enforced at MAX_ITEMS=10)
- Changing the AI models used for analysis (Haiku for basic, Sonnet for deep)
- Building a separate analysis queue/worker system (use existing edge function invocation)

## Technical Considerations

- **ActivationChecklist.tsx**: Direct string replacements for route paths in CHECKLIST_ITEMS array
- **agent_config_defaults migration**: Must seed 14 config keys with correct agent_type pairings matching the `agentTypeForKey()` function. Use ON CONFLICT DO NOTHING for idempotency.
- **signup.tsx**: Add regex validation `/[A-Z]/` and `/[!@#$%^&*(),.?":{}|<>]/` before existing length check
- **LowBalanceBanner.tsx**: The welcome banner logic at line 48 already exists but depends on timing — `grant-welcome-credits` must complete before `useCreditBalance` query resolves
- **CreditMigrationModal.tsx**: Pure localStorage guard (line 24) — needs server-side check (org created_at or migration ledger entry)
- **UsageChart.tsx**: 5 separate locations display `$` prefix — all need updating. Legend labels in renderLegend function (lines 212-240). Section header in CreditsSettingsPage.tsx line 411.
- **deep-enrich-organization**: Line 522 logs cost with hardcoded 1000/800 token counts — add `metadata: { source: 'onboarding' }`
- **AgentConfigConfirmStep.tsx**: TagEditor component (lines 217-270) has no length check in `add()` function
- **AIIntelligencePage.tsx**: 6 separate add-item locations (lines 611, 652, 697, 743, 802, 859) — all need count guards
- **Meeting analysis pipeline**: Three ingestion paths (Fathom webhook, MeetingBaaS webhook, voice-transcribe-poll) plus fathom-sync all need to call the orchestrator
- **meetings-webhook**: Currently only stores data on `transcript` event — needs to trigger analysis pipeline after storing
- **meetingbaas-webhook**: Currently calls `process-recording` — needs to chain into analysis pipeline after
- **Credit checks**: Each analysis step (basic ~1 credit, structured summary ~3 credits, scorecard ~3 credits) must independently check `checkCreditBalance` and skip gracefully
- **Idempotency**: `reprocess-meetings-ai` already has `force: false` default that skips if `sentiment_score` exists — extend pattern to structured summary and scorecard
- **Dashboard data flow**: `meeting_classifications` boolean flags power aggregate queries in `meeting-aggregate-insights-query`. `meeting_scorecards.overall_score` feeds team KPI grid. `deal_truth_fields` auto-updates linked deal MEDDIC fields.

## Success Metrics

- Zero broken links in the post-onboarding activation checklist
- Configuration save succeeds for all onboarding parameters
- No new user sees "credits depleted" or phantom dollar usage on first login
- Password policy enforces at least 1 uppercase + 1 special character
- All onboarding dropdowns show human-readable, properly capitalised labels
- All list/tag inputs enforce 10-item maximum across onboarding and settings
- 100% of meetings with transcripts have basic analysis within 60 seconds of ingestion
- Dashboard stats (scorecards, classifications) populated automatically for meetings where user has sufficient credits
- Zero manual "Reprocess" clicks needed for normal meeting flow

## Open Questions

- Should onboarding cost events be completely hidden from the usage chart, or shown in a separate "Setup" category?
- What cutoff date should be used for the CreditMigrationModal guard? (org created_at vs hardcoded date)
- Should the password strength requirements also apply to the password reset flow?
- Should auto-analysis be configurable per-org (e.g., an org setting to disable auto-deep-analysis)?
- What is the total credit cost per meeting for the full pipeline (basic + structured + scorecard)? Should this be communicated to the user?
- Should the pipeline retry failed steps on next meeting sync, or only on manual reprocess?
