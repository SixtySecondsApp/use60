# Consult Report: Trial Period, Credits, Subscription & Onboarding Overhaul
Generated: 2026-02-27

## User Request

After onboarding, implement a trial period with credits, subscription prompting after trial, 14-day grace period with account removal for non-upgraders, credit system audit, monthly credit allowances, top-up system, new user tutorial walkthrough, and integration of the "Instant Replay" PRD feature.

## Clarifications & Decisions

| Question | Decision |
|----------|----------|
| Grace period model | 14 days for trial expiry accounts, 30 days for subscription cancellations |
| Basic plan credits | 100 credits/month (Pro keeps 250/month) |
| Instant Replay credits | Charge ~3-5 credits per PRD recommendation. First-time login view only. Replayable in docs area. |
| Tour library | React Joyride |

## PRD Integration: Instant Replay

**Source**: PRD_ Instant Replay — First-Meeting Onboarding Experience.docx
**Priority**: P0 — Growth-critical
**Target**: March 2026

### Core Concept
The moment a user connects their notetaker during onboarding, 60 pulls their most recent past meeting and runs the full post-meeting pipeline on it — live, in the first session. Within 2-3 minutes, the user sees: structured summary, action items, draft follow-up email, and suggested CRM updates.

### Key Constraints (from PRD)
- One replay per user (`instant_replay_completed` flag)
- Don't double-process meetings already in DB
- Credits charged (not free) — demonstrates credit value
- Follow-up email is DRAFT only — never auto-send during onboarding
- No auto-send during onboarding even if autonomy settings allow it
- Show meeting title + date first, let user confirm ("Run Instant Replay?")
- Progressive loading: summary first, then action items, then email
- 90-second soft timeout — show whatever completed
- Edge cases: no meetings, no transcript, short transcript (<2min), old meetings (>30 days)

### Technical Approach (from PRD)
All pipeline stages already exist. This is a new trigger, not new functionality:
- `instant-replay` orchestrator edge function (NEW)
- `fetch-recent-meeting` per-notetaker helper (NEW)
- Onboarding UI panel with realtime progress (NEW)
- Composes: `process-meeting-summary`, `extract-action-items`, `draft-follow-up-email`, `suggest-crm-updates`, `generate-prep-brief`

---

## Codebase Analysis

### What Already Exists

| Component | Status | Files |
|-----------|--------|-------|
| Stripe integration | Full (checkout, portal, webhooks, sync) | `stripe-webhook/`, `create-checkout-session/`, `stripe-sync-product/` |
| Subscription plans | Basic £29/mo, Pro £99/mo, Enterprise (contact) | `subscription_plans` table, `PricingControl.tsx` |
| Credit system | Full (balance, packs, FIFO deduction, auto-top-up, budget caps) | `org_credit_balance`, `credit_transactions`, `credit_packs` |
| Credit menu | Seeded ~15 actions, 3 tiers (low/med/high) | `credit_menu` table, `CreditMenuAdmin.tsx` |
| Trial system | 14-day, 100-meeting limit, `start-free-trial` edge function | `organization_subscriptions.trial_ends_at` |
| Welcome credits | Granted on onboarding complete | `grant-welcome-credits/` edge function |
| Org deactivation | 30-day countdown + daily cron deletion | `InactiveOrganizationScreen.tsx`, `org-deletion-cron/` |
| Billing UI | Settings pages for billing + credits + purchases | `BillingSettingsPage.tsx`, `CreditsSettingsPage.tsx` |
| Activation checklist | 6-item, 7-day window, dismissible | `ActivationChecklist.tsx` |
| Feature gating | 3-tier permissions | `FeatureGate.tsx`, `UserPermissionsContext.tsx` |
| Activation tracking | Milestone events + Encharge automation | `useActivationTracking.ts` |
| Subscription credit grants | `grant_subscription_credits()` RPC (Pro: 250/mo) | Migration `20260221050001` |
| Trial meeting tracking | `increment_trial_meeting()` RPC | Migration `20260221050002` |

### What's Missing

| Gap | Priority | Impact |
|-----|----------|--------|
| Trial expiry enforcement gate | P0 | Users can use features indefinitely after trial ends |
| Grace period (14-day read-only after trial) | P0 | No intermediate state between trial and deactivation |
| Upgrade wall / subscription prompt UI | P0 | No UI prompts users to subscribe when trial ends |
| Customers tracking tab (admin) | P1 | Admins can't see trial status, expiry dates, conversion funnel |
| Interactive product tour (React Joyride) | P1 | No walkthrough for new users |
| Credit education during onboarding | P1 | Users don't understand credits until they hit the settings page |
| Instant Replay feature | P0 | Core PRD feature — doesn't exist yet |
| Missing credit menu entries | P1 | Several AI actions not priced (prep_brief, proposal, sequence, etc.) |
| Trial expiry email sequence | P1 | Only basic webhook notification, no 7-email nurture sequence |
| In-app trial countdown | P1 | No visible trial status in the app UI |
| Basic plan credit allowance (100/mo) | P1 | Only Pro has monthly credits currently |
| Credit system walkthrough/explainer | P1 | No UI explains credits to new users |

### Credit Menu Audit

**Currently priced (in credit_menu):**
- copilot_chat, meeting_summary, research_enrichment, content_generation, crm_update
- task_execution, deal_risk_score, reengagement_trigger, stale_deal_alert, weekly_coaching_digest
- apollo_search, apollo_enrichment, email_send, ai_ark_company, ai_ark_people, exa_enrichment
- daily_briefing (free), call_recording_storage (free)

**Missing — needs to be added:**

| Action | Recommended Pricing (Low/Med/High) | Rationale |
|--------|-----------------------------------|-----------|
| instant_replay | 1.5 / 3.0 / 5.0 | Full pipeline run (summary + actions + email) |
| prep_brief | 0.5 / 1.5 / 3.0 | Meeting prep generation |
| proposal_generation | 1.0 / 2.5 / 5.0 | Sales proposal creation |
| sequence_generation | 0.8 / 2.0 / 4.0 | Outreach sequence (multi-email) |
| deep_contact_enrichment | 0.3 / 0.8 / 2.0 | Beyond basic enrichment |
| deep_company_research | 0.5 / 1.5 / 3.5 | Company intelligence report |
| transcript_processing | 0.3 / 0.8 / 2.0 | Meeting transcript analysis |
| writing_style_analysis | 0.5 / 1.0 / 2.0 | Brand voice learning |
| fact_profile_research | 0.3 / 1.0 / 2.5 | Organization fact profile |
| battlecard_generation | 0.5 / 1.5 / 3.0 | Competitive battlecard |
| deal_rescue_plan | 0.5 / 1.5 / 3.0 | At-risk deal diagnosis |
| coaching_analysis | 0.5 / 1.5 / 3.5 | Meeting coaching insights |
| linkedin_enrichment | 0.3 flat | LinkedIn profile data |
| calendar_prep_auto | 0.3 / 0.8 / 2.0 | Automated calendar prep |

**Storage costs (already defined but verify enforcement):**

| Unit | Credits/month |
|------|---------------|
| Audio per hour | 0.5 |
| Transcripts per 100 | 0.1 |
| Docs per 100 | 0.05 |
| Enrichment per 500 | 0.1 |

### Subscription Plan Updates

| Plan | Monthly Price | Annual Price | Monthly Credits | Key Change |
|------|-------------|-------------|-----------------|------------|
| Basic | £29/mo | £290/yr | **100** (was 0) | Add 100 credit allowance |
| Pro | £99/mo | £990/yr | 250 (unchanged) | No change |
| Enterprise | Contact | — | Custom | No change |

---

## Market Research Findings

### Trial-to-Paid Conversion Benchmarks
- Median B2B SaaS: 18.5% conversion
- Top quartile: 35-45%
- No-CC trials: 18% conversion but higher sign-up volume and better 90-day retention
- Achievement-based payment prompts convert 258% higher than calendar nudges

### Credit System Best Practices
- Action-based credits (not token-based) — users must understand what they're buying
- Purchased credits should never expire (builds trust, removes hesitation)
- Show credit balance in every relevant UI context
- Soft limit email at 20% remaining, hard wall at 0%

### The Aha Moment for 60
60's aha moment: Receiving the first AI-generated follow-up email that is accurate, in the user's tone, with specific deal context. Instant Replay delivers this in <5 minutes.

### Recommended Email Sequence (14-day trial)

| Day | Purpose | Focus |
|-----|---------|-------|
| 0 | Welcome + first action | Connect calendar, singular CTA |
| 3 | Value reinforcement | Social proof / use case story |
| 7 | Mid-trial behavior check | Segmented: activated vs not |
| 10 | Urgency introduction | "4 days left" + clear pricing |
| 12 | Final push | "2 days left" + limited offer |
| 14 | Expiry day | "Your data is safe" + grace period explained |
| 19 | Grace day 5 (win-back) | "2 days until deactivation" + specific data they'll lose |

---

## Recommended Execution Plan

### Phase 1: Foundation (Database + Backend)

**TRIAL-001: Trial expiry gate + grace period schema**
- Add `trial_grace_ends_at` column to `organization_subscriptions`
- Add `subscription_status_effective` computed column or RPC
- Create `check_trial_status()` RPC that returns: active_trial | grace_period | expired | active_subscription
- Modify org deactivation logic: trial accounts get 14-day grace, subscription cancellations keep 30 days
- Add `trial_grace_started_at` timestamp

**TRIAL-002: Credit menu audit — add missing actions**
- Add 14 missing actions to `credit_menu` table via migration
- Ensure pricing tiers (low/med/high) are set
- Verify all AI-powered edge functions check credits before execution

**TRIAL-003: Update Basic plan credit allowance**
- Modify `grant_subscription_credits()` RPC to grant 100 credits for Basic, 250 for Pro
- Add Basic plan monthly credit reset logic
- Update `subscription_plans` table with credit columns for Basic

**TRIAL-004: Customer tracking admin views**
- New admin page: `/admin/customers` or `/platform/customers`
- Shows: org name, plan, trial status, trial end date, grace period end, subscription start, credits remaining
- Filters: trialing, grace period, active subscription, expired
- Sort by trial end date (soonest first)

### Phase 2: Trial Enforcement + Upgrade UI

**TRIAL-005: Trial expiry enforcement in frontend**
- Modify `ProtectedRoute.tsx` to check trial status
- New `TrialExpiredWall` component — shown when trial expired, no subscription
- Grace period mode: read-only access, upgrade banner, no AI actions
- Post-grace: redirect to upgrade-or-deactivate screen
- `useRequireCredits` hook blocks AI actions during grace period

**TRIAL-006: In-app trial status indicators**
- Trial countdown badge in top nav (visible from day 10 for org admins)
- Trial progress bar in Settings > Billing
- Upgrade CTA that intensifies as trial approaches end
- Credit usage summary during trial ("You've used 45 of 100 trial credits")

**TRIAL-007: Upgrade wall + subscription prompt**
- Modal at trial expiry: clear pricing comparison, what you keep vs lose
- One-click upgrade flow (Stripe Checkout)
- Grace period messaging: "Your data is safe for 14 more days"
- Post-grace messaging: "Upgrade to restore your account"

### Phase 3: Instant Replay (PRD Feature)

**TRIAL-008: fetch-recent-meeting helper**
- Per-notetaker API calls: Fathom, Fireflies, JustCall
- Normalized output: { transcript, title, date, duration, participants }
- Edge cases: no meetings, no transcript, short (<2min), old (>30 days)

**TRIAL-009: instant-replay orchestrator edge function**
- Accepts user_id and notetaker_source
- Calls fetch-recent-meeting
- Creates meeting record (check for duplicates first with maybeSingle())
- Triggers pipeline stages: summary → action items → email draft
- Emits realtime progress events
- Charges credits (~3-5 per PRD)
- Sets `instant_replay_completed` flag

**TRIAL-010: Onboarding Instant Replay UI panel**
- New step in onboarding flow after notetaker connection
- Opt-in: shows meeting title/date, "Run Instant Replay?" button
- Progressive loading with mission-control-style progress feed
- Tabbed results: Summary | Action Items | Follow-Up Email
- "This happens automatically after every meeting" framing
- Graceful fallbacks for all edge cases
- Credit cost shown before running

### Phase 4: Product Tour + Credit Education

**TRIAL-011: React Joyride integration**
- Install react-joyride
- First-login tour (3-5 steps): dashboard overview, key features, credits
- Tour triggers on first visit after onboarding completion
- Dismissible, doesn't re-show
- Persisted via localStorage + user_onboarding_progress

**TRIAL-012: Credit system explainer**
- New component: CreditSystemExplainer
- Shown during onboarding (after Instant Replay demonstrates credit usage)
- Explains: what credits are, how to earn (subscription), how to buy (top-up), what they unlock
- Visual: credit balance preview, sample actions with costs
- Also accessible from Settings > Credits as "How credits work" section

**TRIAL-013: Enhanced activation checklist**
- Update ActivationChecklist with credit-related milestones
- Add: "Understand your credits" (links to explainer)
- Add: "Use your first AI follow-up" (ties to Instant Replay or first real meeting)
- Extend visibility window from 7 days to 14 days (matches trial)

### Phase 5: Trial Communications

**TRIAL-014: Trial expiry email sequence**
- 7-email sequence via Encharge automation
- Achievement-based triggers (not just calendar)
- Segmented: activated users vs non-activated
- Templates with personalization (features used, credits consumed)

**TRIAL-015: In-app notifications for trial lifecycle**
- Day 10: "4 days left" notification
- Day 12: upgrade modal on login (one-time, dismissible)
- Day 14: trial expired notification with clear next steps
- Grace day 12: final warning notification

### Phase 6: Docs + Replay Reference

**TRIAL-016: Instant Replay in documentation/help area**
- "What is Instant Replay?" help article
- Video or interactive demo showing the replay experience
- Accessible from help menu / docs section
- For users who want to re-experience the demo

---

## Risk Assessment

| Risk | Severity | Mitigation |
|------|----------|------------|
| Breaking existing trial users | High | Migration must grandfather current trialing orgs with correct dates |
| Credit gate blocks paying users | High | Only gate AI actions, never core navigation/viewing |
| Instant Replay pipeline timeout | Medium | 90-second soft timeout, show partial results |
| Notetaker API rate limits | Medium | Single meeting fetch only, retry with backoff |
| Tour annoys returning users | Low | One-time only, dismissible, persisted |
| Credit pricing too high/low | Medium | Admin can adjust via CreditMenuAdmin; start conservative |

## Dependencies

| Dependency | Status | Risk |
|------------|--------|------|
| Fathom API (fetch recent recordings) | Available | Low |
| Fireflies GraphQL API | Available | Low |
| JustCall API | Available | Low |
| React Joyride package | npm install needed | None |
| Encharge email automation | Already integrated | None |
| Stripe (already integrated) | Working | None |

## Estimated Scope

| Phase | Stories | Estimate |
|-------|---------|----------|
| Phase 1: Foundation | 4 stories | Large |
| Phase 2: Trial Enforcement | 3 stories | Large |
| Phase 3: Instant Replay | 3 stories | Large |
| Phase 4: Tour + Education | 3 stories | Medium |
| Phase 5: Communications | 2 stories | Medium |
| Phase 6: Docs | 1 story | Small |
| **Total** | **16 stories** | — |

**MVP (ship first):** Phase 1 + Phase 2 + Phase 3 (10 stories) — delivers trial enforcement, credit audit, and the Instant Replay wow moment.

**Fast follow:** Phase 4 + Phase 5 (5 stories) — adds tour, education, and email sequence.

**Polish:** Phase 6 (1 story) — docs/replay reference.
