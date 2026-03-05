# PRD: Use60 Go-Live Audit Fixes — Round 2

## Introduction

Drue (product owner) performed a comprehensive production audit of app.use60.com on 2026-03-03, testing every Settings page, the GoLive onboarding flow, and the Meetings module as a brand-new user. He found 14 new critical/high-priority bugs and confirmed 7 existing in-progress tasks still have incomplete subtasks. This PRD captures ALL remaining work — 20 tasks, ~60 subtasks — organized into parallelizable workstreams for agent team execution.

**Branch:** `feature/golive-audit-round2`
**Target:** Production (ygdpgliavpxeugaajgrb)
**Prerequisite:** Merge `feature/trial-credits-onboarding` to main first (has partial fixes)

## Goals

- Fix every bug Drue found during the March 3 production audit
- Close all security vulnerabilities (calendar access leak, API key exposure, sybil credits attack)
- Make Settings pages functional for brand-new users on first login
- Make the onboarding flow clean, consistent, and error-free
- Make the Support system actually work (tickets, docs, chat)
- Establish a backend Credit Menu for dynamic pricing
- Zero broken buttons, zero dead links, zero misleading UI states

## Team Structure

- **Leader:** Opus (orchestration, code review, integration)
- **Team A — Settings Fixes:** Sonnet (billing, sales goals, integrations, API keys, autonomy, sales methodology, google workspace)
- **Team B — Org & Onboarding:** Sonnet (org management, invitation flow, onboarding UX, get started guide, credits)
- **Team C — Meetings & Support:** Sonnet (meeting settings security, notetaker, support page, docs)

---

## User Stories

### CRITICAL — Security (Due Mar 4)

### US-001: Fix Calendar Access Leak in Meeting Settings
**Description:** As a user, I should only see MY calendar accounts in Meeting Settings, not all Sixty Seconds accounts, so that other users' calendars are protected.
**Dev Hub Task:** TSK-0494
**Team:** C

**Acceptance Criteria:**
- [ ] `useMeetingBaaSCalendar` hook filters by BOTH `user_id` AND `org_id` (not just `user_id`)
- [ ] RLS policy on `meetingbaas_calendars` table enforces org-level isolation
- [ ] User wu7sijusiq@wnbaldwy.com can only see their own calendar, not Sixty Seconds internal calendars
- [ ] Typecheck passes
- [ ] Verify in browser on localhost:5175

### US-002: Fix Calendar Save and Bot Sync Errors
**Description:** As a user, I want to save my calendar selection and connect the bot without errors, so that automatic call recording works.
**Dev Hub Task:** TSK-0494 (subtasks 1-3)
**Team:** C

**Acceptance Criteria:**
- [ ] "Failed to save calendar selection" error is resolved — calendar selection persists after save
- [ ] Bot Calendar Sync 'Connect' button triggers the connect flow (not just scrolling the page)
- [ ] "Calendar already exists in MeetingBaaS" error is handled gracefully — auto-reconnect or clear error message with actionable steps
- [ ] Typecheck passes
- [ ] Verify in browser on localhost:5175

### US-003: Fix API Key Visibility — Security Hardening
**Description:** As a user, I should not be able to reveal my full API key after saving it, so that keys remain secure.
**Dev Hub Task:** TSK-0493
**Team:** A

**Acceptance Criteria:**
- [ ] After an API key is saved, the eye icon is removed or disabled — keys display as `sk-...xxxx` (last 4 chars only)
- [ ] To change a key, user must enter a new one (no reveal of old)
- [ ] The `ai_provider_keys` JSONB in `user_settings` stores full key server-side but frontend only receives masked version
- [ ] Typecheck passes
- [ ] Verify in browser on localhost:5175

### US-004: Fix Sybil Attack Vector — Invited Users Getting Free Credits
**Description:** As the system, invited org members should NOT receive their own 100 free credits or see the setup wizard that grants credits, so that users cannot exploit invitations for unlimited credits.
**Dev Hub Task:** TSK-0499 (subtask 4)
**Team:** B

**Acceptance Criteria:**
- [ ] Invited users who join an existing org do NOT receive the 100 free trial credits
- [ ] Invited users do NOT see the purple Setup button/wizard that grants credits
- [ ] Credits are shared at org level — invited members inherit org credit balance
- [ ] The `grant_trial_credits` RPC checks if user is joining via invitation and skips credit grant
- [ ] Typecheck passes

---

### HIGH PRIORITY — Settings Module (Due Mar 6-9)

### US-005: Fix Billing & Subscription Page
**Description:** As a new user, the billing page should not show "Current Plan: Basic" when I've never selected a plan, and the upgrade button should work.
**Dev Hub Task:** TSK-0501
**Team:** A

**Acceptance Criteria:**
- [ ] New users with no subscription see "No Plan Selected" or "Free Tier" instead of "Current Plan: Basic"
- [ ] "Upgrade to Pro" button calls the correct edge function without error
- [ ] If no Stripe subscription exists, the page shows plan comparison with working CTA buttons
- [ ] Typecheck passes
- [ ] Verify in browser on localhost:5175

### US-006: Fix Sales Goals — Values Not Persisting
**Description:** As a user, when I save sales goal targets, they should persist when I navigate away and return.
**Dev Hub Task:** TSK-0500
**Team:** A

**Acceptance Criteria:**
- [ ] Enter a value in any target field (revenue, outbound, meetings, proposal), click Save
- [ ] Navigate to main Settings page, then return to Sales Goals — values are still there
- [ ] Verify the `targets` table upsert in `useTargets` hook is executing successfully
- [ ] Toast confirmation shown on successful save
- [ ] Typecheck passes
- [ ] Verify in browser on localhost:5175

### US-007: Fix Organization Invitation Email — Sender & Flow
**Description:** As an invited user, I should receive a professional-looking invitation email from a recognizable sender address, and the signup flow should be smooth.
**Dev Hub Task:** TSK-0499 (main + subtasks 1, 2)
**Team:** B

**Acceptance Criteria:**
- [ ] Invitation emails sent from `app@use60.com` (or `invites@use60.com` if already verified) with friendly display name "60 Team"
- [ ] Verify the `send-organization-invitation` edge function uses the correct SES sender identity
- [ ] New invited user signup flow does NOT show an error then ask to "return to log in"
- [ ] New invited user is NOT forced through full org setup questions — they skip onboarding and join the existing org directly
- [ ] Typecheck passes

### US-008: Fix Invited User Credits & Org Membership
**Description:** As an invited user joining an org, I should share the org's credits and my invitation status should update correctly.
**Dev Hub Task:** TSK-0499 (subtasks 3, 5, 6)
**Team:** B

**Acceptance Criteria:**
- [ ] Invited user's credit balance reflects org-level credits (not zero)
- [ ] Org member invite limit enforced at 20 users — UI shows warning when limit reached
- [ ] After invited member completes signup, their status moves from "Invited" to "Team Member" in the org management UI
- [ ] `organization_memberships` record updated on signup completion
- [ ] Typecheck passes
- [ ] Verify in browser on localhost:5175

### US-009: Fix Org Management — Domain & URL Mismatch
**Description:** As an org admin, the company domain and website shown in org management and settings should match what was entered during setup, not the email domain.
**Dev Hub Task:** TSK-0499 (subtasks 7, 8)
**Team:** B

**Acceptance Criteria:**
- [ ] Org Management page shows the website URL entered during setup (not email domain)
- [ ] Settings page shows correct Company Domain and Company Website
- [ ] The `organizations` table `company_domain` and `website` fields are populated from the onboarding website input, not email parsing
- [ ] Typecheck passes
- [ ] Verify in browser on localhost:5175

### US-010: Fix JustCall Settings Button
**Description:** As a user, clicking the JustCall settings button should open JustCall configuration.
**Dev Hub Task:** TSK-0498
**Team:** A

**Acceptance Criteria:**
- [ ] JustCall settings button navigates to the correct settings panel or opens configuration modal
- [ ] If JustCall is not connected, show connection instructions
- [ ] Typecheck passes
- [ ] Verify in browser on localhost:5175

### US-011: Fix Slack Settings Button
**Description:** As a user, clicking the Slack settings button should open Slack configuration.
**Dev Hub Task:** TSK-0497
**Team:** A

**Acceptance Criteria:**
- [ ] Slack settings button navigates to the correct settings panel or opens configuration modal
- [ ] If Slack is not connected, show connection instructions
- [ ] Typecheck passes
- [ ] Verify in browser on localhost:5175

### US-012: Fix Email Sync Error
**Description:** As a user, syncing emails should work or show a meaningful error when no CRM contacts exist yet.
**Dev Hub Task:** TSK-0496
**Team:** A

**Acceptance Criteria:**
- [ ] If no CRM contacts exist, show helpful message: "Add contacts to your CRM first to sync emails" instead of generic error
- [ ] If contacts exist, email sync completes successfully with accurate count
- [ ] Error toast shows actionable message, not raw error dump
- [ ] Typecheck passes
- [ ] Verify in browser on localhost:5175

### US-013: Fix Sales Methodology Page — Add Clarity
**Description:** As a user, the Sales Methodology settings page should clearly explain what it does and what each option means.
**Dev Hub Task:** TSK-0492
**Team:** A

**Acceptance Criteria:**
- [ ] Page has a clear header description explaining purpose: "Choose the sales framework that guides how 60 analyzes your deals and coaches your conversations"
- [ ] Each methodology option (MEDDIC, BANT, SPIN, Challenger, Generic) has a 1-line description
- [ ] Methodology names are properly capitalized (MEDDIC not meddic, BANT not bant, SPIN not spin)
- [ ] Typecheck passes
- [ ] Verify in browser on localhost:5175

### US-014: Fix Autonomy & Approvals Page Errors
**Description:** As a user, the Autonomy & Approvals page should load without errors.
**Dev Hub Task:** TSK-0491
**Team:** A

**Acceptance Criteria:**
- [ ] Page loads without "Could not find table autopilot_confidence" error — the page uses `autonomy_policies` table which exists, so remove any stale reference to `autopilot_confidence`
- [ ] "Could not load team data" edge function error is resolved — verify the edge function is deployed and accessible
- [ ] Page renders all 8 action types with their current policy (approve/auto/suggest)
- [ ] Typecheck passes
- [ ] Verify in browser on localhost:5175

### US-015: Fix Google Workspace Settings — 3 Issues
**Description:** As a user, Google Workspace settings should display correctly and connection testing should work.
**Dev Hub Task:** TSK-0495
**Team:** A

**Acceptance Criteria:**
- [ ] Smart Categorization renders as a toggle or checkbox, not a dropdown
- [ ] Connection Info shows accurate token expiry (not "Token added today. Token expires today.")
- [ ] Connection test accurately reports service status for userinfo, gmail, calendar, tasks — with actionable error messages for failures
- [ ] Typecheck passes
- [ ] Verify in browser on localhost:5175

---

### HIGH PRIORITY — GoLive Module (Due Mar 6)

### US-016: Fix Get Started Guide — Consolidate Onboarding
**Description:** As a new user, I should see ONE onboarding flow (not two competing ones), and it should work correctly.
**Dev Hub Task:** TSK-0490
**Team:** B

**Acceptance Criteria:**
- [ ] Only ONE onboarding mechanism shown: either the top-center "Get started with use60" checklist OR the purple Setup wizard — not both
- [ ] Decision: Keep the `ActivationChecklist` (top center), remove/hide the purple `SetupWizardDialog` trigger for new signups
- [ ] "Skip for now" does NOT falsely mark items as complete (CRM connected, email configured, etc.)
- [ ] "Write your first cold email" completes once and marks as done — does not loop
- [ ] Typecheck passes
- [ ] Verify in browser on localhost:5175

### US-017: Fix Google Account Connection Crash
**Description:** As a new user connecting my Google account during setup, the flow should not crash.
**Dev Hub Task:** TSK-0490 (subtask 5, 6, 7)
**Team:** B

**Acceptance Criteria:**
- [ ] Google account connection does NOT throw "C.rpc(...).catch is not a function" TypeError
- [ ] Fix the RPC call to use proper `.then()/.catch()` or async/await pattern
- [ ] After successful connection, credits display correctly (not showing random 98.4 credits)
- [ ] Green banner shows accurate credit amount
- [ ] Copilot_autonomous actions don't silently consume credits during setup (or if they do, it's clearly communicated)
- [ ] Typecheck passes
- [ ] Verify in browser on localhost:5175

### US-018: Fix Support Page — Tickets, Docs, Chat
**Description:** As a user, the support page should let me submit tickets, browse documentation, and get useful chat responses.
**Dev Hub Task:** TSK-0489
**Team:** C

**Acceptance Criteria:**
- [ ] Support page visual design aligned with rest of Use60 (consistent card styles, spacing, colors)
- [ ] "Open a Support Ticket" actually sends the ticket — email to support@sixtyseconds.video + logged in a `support_tickets` table
- [ ] Remove Slack reference from urgent tickets (users don't have a Slack channel with us)
- [ ] "How can we help?" search bar works — routes to relevant docs or AI chat
- [ ] Typecheck passes
- [ ] Verify in browser on localhost:5175

### US-019: Fix Support Documentation
**Description:** As a user, the documentation section should have accurate, non-duplicated content.
**Dev Hub Task:** TSK-0489 (subtasks 5, 6, 7)
**Team:** C

**Acceptance Criteria:**
- [ ] Remove duplicate "Welcome to 60" entries — keep one authoritative version
- [ ] Remove duplicate "Meetings Intelligence" entries
- [ ] Onboarding Guide rewritten to be user-facing (what to do, not what happens technically)
- [ ] All documentation links are functional (no dead links)
- [ ] Knowledge base has at minimum: Getting Started, Meetings, Pipeline, Settings guides
- [ ] Typecheck passes

### US-020: Improve Support Chat Quality
**Description:** As a user, the AI chat support should provide useful answers about Use60 features.
**Dev Hub Task:** TSK-0489 (subtask 4)
**Team:** C

**Acceptance Criteria:**
- [ ] AI chat has access to documentation content (seed the knowledge base with actual docs)
- [ ] Chat can answer basic questions: "How do I add a Google account?", "How do meetings work?", "How do I add credits?"
- [ ] Response time is under 5 seconds for simple queries
- [ ] If the AI doesn't know, it says so and suggests opening a ticket
- [ ] Typecheck passes

---

### HIGH PRIORITY — Meetings Module (Due Mar 9)

### US-021: Limit Notetaker Bot to One Per Meeting
**Description:** As a user, I should only be able to add one 60 Notetaker bot to a meeting, not multiples.
**Dev Hub Task:** TSK-0502
**Team:** C

**Acceptance Criteria:**
- [ ] "Join Meeting" button checks if a bot is already in the meeting — if so, show "Bot already in meeting" and disable the button
- [ ] Query `meetingbaas_calendars` or bot status before allowing a second join
- [ ] Bot has a profile picture (use 60 logo or branded avatar, not generic grey person)
- [ ] Typecheck passes
- [ ] Verify in browser on localhost:5175

---

### HIGH PRIORITY — In-Progress Onboarding Fixes

### US-022: Fix Onboarding Flow — UI Consistency
**Description:** As a new user going through onboarding, the UI should be consistent and not have duplicate titles, compressed layouts, or inconsistent edit styles.
**Dev Hub Task:** TSK-0374 (remaining subtasks)
**Team:** B

**Acceptance Criteria:**
- [ ] Remove duplicate tab title (e.g., "Qualification" header + "Qualification" title — keep only the header tab)
- [ ] Replace duplicated title area with the descriptive text (e.g., "Define how leads are scored and qualified")
- [ ] All editable fields use the same interaction pattern: click-to-edit with consistent visual style
- [ ] Rename all "Editable" / "Suggestion" / "Click to Edit" labels to unified "Editable Suggestions"
- [ ] Onboarding popup/modal is taller — content fully visible without internal scrolling
- [ ] Typecheck passes
- [ ] Verify in browser on localhost:5175

### US-023: Fix Onboarding — Input Validation & Security
**Description:** As the system, onboarding inputs should have proper validation to prevent abuse.
**Dev Hub Task:** TSK-0374 + TSK-0450 (validation subtasks)
**Team:** B

**Acceptance Criteria:**
- [ ] Limit additional rows per tab (Qualification, ICP, Objections, etc.) to max 10 items
- [ ] Enrichment text boxes have 150-word / 1000-character limit with counter
- [ ] Brand Voice: adding "Words to Avoid" does NOT delete the Tone Description (and vice versa) — fix the state management in onboarding UI
- [ ] Text inputs sanitized — no raw code/HTML injection possible (escape or strip HTML tags)
- [ ] Account Settings: name fields limited to 100 characters
- [ ] Typecheck passes

### US-024: Fix Onboarding — Broken Links & Banner
**Description:** As a new user, all onboarding action links should work and I should not see "AI credits depleted" on first login.
**Dev Hub Task:** TSK-0374 (link subtasks) + TSK-0450 (credits banner)
**Team:** B

**Acceptance Criteria:**
- [ ] "Complete your profile" navigates to a working profile page (fix /settings/profile route or redirect to /profile)
- [ ] "Sync your first meeting" navigates to working integrations page (fix /settings/integrations route)
- [ ] "Invite your team" navigates to working org management (fix /settings route or /settings/organization)
- [ ] New users see green "10 Free AI credits have been added!" banner, NOT red "AI credits depleted" banner
- [ ] The `credits_depleted` banner only shows for users who previously HAD credits and used them all
- [ ] Typecheck passes
- [ ] Verify in browser on localhost:5175

### US-025: Fix Onboarding — Enrichment & Config Saves
**Description:** As a new user, onboarding configuration (fiscal year, password, enrichment) should save correctly.
**Dev Hub Task:** TSK-0450 (remaining subtasks) + TSK-0484 + TSK-0483
**Team:** B

**Acceptance Criteria:**
- [ ] Password enforcement: minimum 8 chars, 1+ uppercase, 1+ special character — validated on signup form
- [ ] Website scrape handles `change_summary` column gracefully — if column missing, skip without error
- [ ] Fiscal Year Start Month dropdown shows month names (Jan, Feb, Mar...) not numbers (1, 2, 3...)
- [ ] Sales methodology options properly capitalized: MEDDIC, BANT, SPIN, Challenger, Generic — each with 1-line description
- [ ] Fiscal Year End Month save works without error
- [ ] Typecheck passes
- [ ] Verify in browser on localhost:5175

---

### HIGH PRIORITY — Credits (Non-Stripe)

### US-026: Fix Credits Page — Tooltips, Menu, Variables
**Description:** As a user, the credits page should have helpful tooltips on intelligence tiers, and credit costs should be driven by a backend Credit Menu table.
**Dev Hub Task:** TSK-0453 (subtasks 1, 5, 6) + TSK-0486 + TSK-0485
**Team:** B

**Acceptance Criteria:**
- [ ] Hovering over "Low" / "Medium" / "High" intelligence tiers shows tooltip explaining what each tier means and typical use cases
- [ ] Create `credit_menu` table: `id`, `action_type` (text), `action_label` (text), `credit_cost` (numeric), `intelligence_tier` (text), `is_active` (boolean), `updated_at` — admin-only, RLS restricted
- [ ] Seed `credit_menu` with current hardcoded credit costs from `creditPacks.ts`
- [ ] "What can your credits do" section reads from `credit_menu` table instead of hardcoded values
- [ ] New user does NOT see $3 usage on credits page — fix: filter usage to only show records for current user/org, created after their signup date
- [ ] Remove "We've upgraded your credits" popup — no user has seen a prior version
- [ ] Typecheck passes
- [ ] Verify in browser on localhost:5175

---

## Functional Requirements

- FR-1: All Settings page buttons must navigate to their correct destination or open the correct modal
- FR-2: All form saves must persist data and show toast confirmation
- FR-3: All error states must show user-friendly messages with actionable next steps
- FR-4: Calendar/meeting data must be filtered by org_id AND user_id (multi-tenant isolation)
- FR-5: Invited users must bypass full onboarding and inherit org context
- FR-6: Credit operations must be org-scoped, not user-scoped for invited members
- FR-7: Support tickets must be logged in database and emailed to admin
- FR-8: Input validation on all user-facing text fields (length limits, sanitization)

## Non-Goals (Out of Scope)

- Stripe payment integration (credit pack purchases, auto top-up subscriptions)
- Full knowledge base content authoring (seed minimum viable docs only)
- Redesigning the entire Settings page layout
- Mobile responsiveness fixes
- Performance optimization
- New feature development beyond fixing what's broken

## Technical Considerations

- **Merge first:** `feature/trial-credits-onboarding` branch has partial fixes — merge to main before starting
- **Migration needed:** `credit_menu` table creation + seed data
- **Migration needed:** Possible RLS policy update on `meetingbaas_calendars` for org isolation
- **Edge functions:** Verify `send-organization-invitation` uses correct SES sender; deploy with `--no-verify-jwt` for staging
- **Existing patterns:** Use `maybeSingle()` for lookups, `getCorsHeaders(req)` for CORS, explicit column selection
- **Column gotchas:** `meetings.owner_user_id`, `deals.owner_id`, `contacts.owner_id`
- **Frontend patterns:** Radix UI components from `src/components/ui/`, React Query for server state, Zustand for client state
- **Parallel execution:** Teams A, B, C can work simultaneously — minimal cross-dependencies

## Success Metrics

- Zero broken buttons across all Settings pages
- Zero error states on first login for new users
- All onboarding links navigate to working pages
- Support tickets successfully logged and emailed
- Calendar access properly isolated per org/user
- API keys never revealed after initial save
- All 26 user stories pass acceptance criteria

## Open Questions

- Q1: Should we keep ActivationChecklist or SetupWizard? (Recommendation: keep ActivationChecklist, remove wizard trigger)
- Q2: What should the minimum documentation set include? (Recommendation: Getting Started, Meetings, Pipeline, Credits, Settings)
- Q3: Should support tickets also post to an internal Slack channel? (Drue's subtask suggests yes)
