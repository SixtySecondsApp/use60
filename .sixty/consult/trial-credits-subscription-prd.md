# PRD: Trial Lifecycle, Credit Monetization & First-Login Experience

**Owner:** Product
**Status:** Draft
**Target:** March–April 2026
**Priority:** P0 — Revenue-critical
**Branch:** `feature/trial-credits-onboarding`

---

## Table of Contents

1. [The Problem](#the-problem)
2. [The Solution](#the-solution)
3. [User Flows](#user-flows)
4. [Technical Specifications](#technical-specifications)
5. [Database Schema Changes](#database-schema-changes)
6. [Credit Menu Audit](#credit-menu-audit)
7. [Instant Replay Integration](#instant-replay-integration)
8. [First-Login Product Tour](#first-login-product-tour)
9. [Trial Communications](#trial-communications)
10. [Admin Customer Tracking](#admin-customer-tracking)
11. [Execution Plan](#execution-plan)
12. [Success Metrics](#success-metrics)
13. [Risks & Mitigations](#risks-mitigations)

---

## 1. The Problem {#the-problem}

### Revenue Leakage

60 has a fully built billing infrastructure — Stripe integration, credit system, subscription plans, pack purchases — but **zero enforcement**. Trial users have unlimited access forever because:

1. **`ProtectedRoute.tsx` has no trial check.** It checks auth, org membership, org active status, and onboarding completion. It does NOT check subscription status, trial expiry, or payment state. (Lines 327-348 only query `organizations.is_active`.)

2. **No mechanism expires DB-only trials.** `start-free-trial` creates a subscription row with `status: 'trialing'` and `trial_ends_at` but creates NO Stripe subscription. Since there's no Stripe subscription, the `customer.subscription.trial_will_end` webhook never fires. No cron or trigger flips the status when the date passes.

3. **`increment_trial_meeting()` is the only gate** — it expires trials when meetings hit 100. But if a user simply uses AI features without recording meetings, they run forever on a trial.

4. **Credit gating is decorative.** `useRequireCredits` hook exists but is used in exactly 2 files: `CreditGate.tsx` and `CreditSystemDemo.tsx`. Zero production features use it. 16+ edge functions deduct credits via `logAICostEvent` but don't pre-check balance with `checkCreditBalance`. An org at zero balance can fire many AI calls before being soft-blocked (grace threshold of 10 credits).

5. **No upgrade pressure.** No in-app trial countdown, no upgrade wall, no "trial expired" screen. The billing page shows a progress bar only while actively trialing — once expired, it shows nothing.

### Cold Start Problem (from Instant Replay PRD)

60's wow moment is the first AI-generated follow-up email. Today, users must:
1. Sign up → 2. Connect calendar → 3. Connect notetaker → 4. Wait for a real meeting → 5. Meeting processed → 6. See follow-up

Steps 1-3 happen in one sitting. Step 4 might take hours or days. For a busy founder who carved out 10 minutes to try 60, that gap is fatal.

### No Onboarding Education

- No product tour exists (zero tour/walkthrough/joyride code in the codebase)
- No credit system explanation during onboarding
- The activation checklist (6 items, 7-day window) is the only post-onboarding guidance
- V2 onboarding dropped the notetaker connection step that V1 had (`fathom_connect` was step 4 of 5 in V1)

---

## 2. The Solution {#the-solution}

### Three Pillars

**Pillar 1: Trial Enforcement & Subscription Gate**
Close the revenue leak. When a 14-day trial expires, users must subscribe or lose AI-powered features. 14-day grace period with read-only access. Account deactivation after grace period if no subscription.

**Pillar 2: Credit Monetization**
Audit and complete the credit menu. Wire credit checks into all AI actions. Give Basic plan 100 credits/month. Make credit balance visible everywhere. Prompt top-ups when credits run low.

**Pillar 3: First-Login Experience**
Instant Replay (from PRD) proves value in <5 minutes. React Joyride tour explains the product. Credit system explainer teaches the monetization model. Enhanced activation checklist guides the first 14 days.

### The User Journey (Post-Implementation)

```
SIGN UP
  │
  ▼
ONBOARDING (existing V2 flow)
  │ → Company enrichment → Skills config
  │
  ▼
NEW: NOTETAKER CONNECTION STEP
  │ → Connect Fathom/Fireflies
  │ → "Run Instant Replay?" (opt-in, charges ~3-5 credits)
  │ → See: summary, action items, draft follow-up email
  │ → "This happens automatically after every meeting"
  │
  ▼
NEW: CREDIT EXPLAINER
  │ → "You just used 3 credits. Here's how credits work."
  │ → Shows balance, monthly allowance, top-up option
  │
  ▼
COMPLETION → DASHBOARD
  │ → 14-day trial starts (100 meeting limit)
  │ → 10 welcome credits + trial credits granted
  │
  ▼
NEW: PRODUCT TOUR (React Joyride, 5 steps)
  │ → Dashboard overview, meetings, copilot, credits, settings
  │
  ▼
TRIAL PERIOD (14 days)
  │ → Full access to all features
  │ → Credit balance visible in nav (from day 1)
  │ → Trial countdown badge visible to admin (from day 10)
  │ → Email sequence: Day 0, 3, 7, 10, 12, 14
  │
  ├─── Day 14: TRIAL EXPIRES ───┐
  │                              │
  │  ┌───────────────────┐      │  ┌────────────────────┐
  │  │ USER SUBSCRIBES   │      │  │ USER DOESN'T       │
  │  │                   │      │  │                     │
  │  │ Basic (£29/mo)    │      │  │ GRACE PERIOD        │
  │  │ → 100 credits/mo  │      │  │ 14 days read-only   │
  │  │ → Full access     │      │  │ → Can view data     │
  │  │                   │      │  │ → Can't run AI      │
  │  │ Pro (£99/mo)      │      │  │ → Upgrade banner    │
  │  │ → 250 credits/mo  │      │  │ → Email: Day 14, 19 │
  │  │ → Full access     │      │  │                     │
  │  └───────────────────┘      │  └────────┬───────────┘
  │                              │           │
  │                              │  Day 28: GRACE EXPIRES
  │                              │           │
  │                              │  ┌────────▼───────────┐
  │                              │  │ ORG DEACTIVATED     │
  │                              │  │ → is_active = false  │
  │                              │  │ → 14-day deletion    │
  │                              │  │   countdown          │
  │                              │  │ → InactiveOrgScreen  │
  │                              │  │   (with billing msg) │
  │                              │  └────────────────────┘
  │                              │
  └──────────────────────────────┘
```

---

## 3. User Flows {#user-flows}

### Flow 1: Trial Expiry → Upgrade Wall

**Trigger:** `trial_ends_at` passes OR `trial_meetings_used >= trial_meetings_limit`

**What user sees:**

```
┌──────────────────────────────────────────────────┐
│  ⚠️  Your 14-day trial has ended                 │
│                                                   │
│  Your data is safe. Subscribe to keep using 60.   │
│                                                   │
│  ┌──────────────────┐  ┌──────────────────┐      │
│  │  BASIC  £29/mo   │  │  PRO   £99/mo    │      │
│  │                   │  │                   │      │
│  │  100 credits/mo   │  │  250 credits/mo   │      │
│  │  1 seat           │  │  1 seat + extras  │      │
│  │  Core features    │  │  Team insights    │      │
│  │                   │  │  API access       │      │
│  │  [Subscribe]      │  │  [Subscribe]      │      │
│  └──────────────────┘  └──────────────────┘      │
│                                                   │
│  Or continue with read-only access for 14 days.   │
│  After that, your account will be deactivated.    │
│                                                   │
│  [Maybe Later — Continue Read-Only]               │
└──────────────────────────────────────────────────┘
```

**Technical route:**
1. `ProtectedRoute.tsx` checks `useTrialStatus(orgId)` + `useHasActiveSubscription(orgId)`
2. If trial expired AND no active subscription → redirect to `/trial-expired`
3. New page: `TrialExpiredPage.tsx` — plan comparison + Stripe checkout
4. "Maybe Later" sets `grace_period_started_at` on `organization_subscriptions` and redirects to dashboard with read-only mode

### Flow 2: Grace Period (14 days read-only)

**What changes during grace:**
- All AI actions blocked (credit deduction RPCs reject if `status = 'grace_period'`)
- Persistent top banner: "Your trial ended X days ago. Subscribe to restore full access. [Upgrade Now]"
- Data is fully visible (meetings, contacts, deals, pipeline)
- Existing automations paused (no new Slack posts, no cron-triggered actions)
- Settings accessible (so user can subscribe from billing page)

**Technical implementation:**
- New subscription status: `grace_period` (add to CHECK constraint)
- `checkCreditBalance` returns 402 if `status = 'grace_period'`
- Frontend: `useIsInGracePeriod(orgId)` hook → drives banner + blocks AI buttons
- `GracePeriodBanner` component in `AppLayout`

### Flow 3: Grace Expires → Org Deactivation

**Trigger:** `grace_period_ends_at` passes (14 days after trial expiry = day 28 from trial start)

**What happens:**
1. `trial-expiry-cron` (new edge function) runs daily:
   - Finds orgs where `status = 'trialing'` AND `trial_ends_at < now()` → sets `status = 'grace_period'`, `grace_period_started_at = now()`, `grace_period_ends_at = now() + 14 days`
   - Finds orgs where `status = 'grace_period'` AND `grace_period_ends_at < now()` → sets `organizations.is_active = false`, `deletion_scheduled_at = now() + 14 days`, `deactivation_reason = 'trial_expired_no_subscription'`
2. Existing `InactiveOrganizationScreen` kicks in
3. Existing `org-deletion-cron` handles day-25 warning + day-30 deletion

**Updated `InactiveOrganizationScreen`:**
- Detects `deactivation_reason = 'trial_expired_no_subscription'`
- Shows billing-specific message: "Your trial ended and no subscription was started. Subscribe now to restore your account."
- Direct upgrade CTA → Stripe checkout
- Existing reactivation request flow still works as fallback

### Flow 4: Instant Replay (During Onboarding)

Detailed in [Section 7](#instant-replay-integration).

### Flow 5: Credit Top-Up Prompt

**Trigger:** Credits hit 20% of monthly allowance OR absolute balance < 5

**What user sees:**
```
┌──────────────────────────────────────────┐
│  Your credits are running low            │
│  Balance: 12 credits                     │
│                                          │
│  ┌────────┐ ┌────────┐ ┌────────┐       │
│  │ £49    │ │ £99    │ │ £149   │       │
│  │ 100 cr │ │ 250 cr │ │ 500 cr │       │
│  │ [Buy]  │ │ [Buy]  │ │ [Buy]  │       │
│  └────────┘ └────────┘ └────────┘       │
│                                          │
│  Or enable auto top-up in Settings.      │
│  [Dismiss]                               │
└──────────────────────────────────────────┘
```

**Technical:** `useRequireCredits` hook already returns `showTopUpPrompt`. The gap is that no production component calls it. Wire into: copilot input, meeting action buttons, enrichment triggers.

---

## 4. Technical Specifications {#technical-specifications}

### 4.1 Trial Expiry Cron (`trial-expiry-cron`)

**New edge function:** `supabase/functions/trial-expiry-cron/index.ts`

```
Runs: Daily (cron schedule in config.toml)
Auth: CRON_SECRET (same pattern as org-deletion-cron)
Uses: getCorsHeaders(req), @supabase/supabase-js@2.43.4
```

**Logic:**

```
Step 1: Expire overdue trials
  SELECT org_id, trial_ends_at
  FROM organization_subscriptions
  WHERE status = 'trialing'
    AND trial_ends_at < NOW()

  For each:
    → UPDATE status = 'grace_period',
             grace_period_started_at = NOW(),
             grace_period_ends_at = NOW() + interval '14 days'
    → INSERT user_notifications (type: 'trial_expired', action_url: '/trial-expired')
    → Invoke send-trial-expired-email (Day 14 email)

Step 2: Expire overdue grace periods
  SELECT os.org_id
  FROM organization_subscriptions os
  WHERE os.status = 'grace_period'
    AND os.grace_period_ends_at < NOW()

  For each:
    → UPDATE organizations SET
         is_active = false,
         deactivated_at = NOW(),
         deletion_scheduled_at = NOW() + interval '14 days',
         deactivation_reason = 'trial_expired_no_subscription'
    → UPDATE organization_subscriptions SET status = 'expired'
    → INSERT user_notifications (type: 'account_deactivated')
    → Invoke send-account-deactivated-email

Step 3: Grace period warnings (day 12 of grace = 2 days before deactivation)
  SELECT org_id
  FROM organization_subscriptions
  WHERE status = 'grace_period'
    AND grace_period_ends_at BETWEEN NOW() AND NOW() + interval '2 days'
    AND NOT EXISTS (
      SELECT 1 FROM user_notifications
      WHERE org_id = os.org_id AND type = 'grace_expiring_soon'
    )

  For each:
    → INSERT user_notifications (type: 'grace_expiring_soon')
    → Invoke send-grace-expiring-email
```

### 4.2 ProtectedRoute Trial Check

**File:** `src/components/ProtectedRoute.tsx`

**New check inserted after org active check (line ~348), before onboarding check:**

```typescript
// NEW: Trial/subscription enforcement
const { data: subState } = useSubscriptionState(activeOrgId);

if (subState?.status === 'grace_period' && !isGracePeriodExemptRoute(pathname)) {
  // Allow access but in read-only mode — handled by GracePeriodBanner
  // Block AI-action routes
  if (isAIActionRoute(pathname)) {
    return <Navigate to="/trial-expired" replace />;
  }
}

if (subState?.status === 'expired' && !isTrialExemptRoute(pathname)) {
  return <Navigate to="/trial-expired" replace />;
}

// Exempt routes: /settings/billing, /trial-expired, /auth/*, /onboarding/*
```

**New hooks needed:**
- `useIsInGracePeriod(orgId)` — returns `{ isGrace, daysRemaining, endsAt }`
- `useSubscriptionGate(orgId)` — combined gate: returns `{ canUseAI, reason, upgradeUrl }`

### 4.3 Credit Enforcement Wiring

**Problem:** 16+ edge functions call `logAICostEvent`/`logFlatRateCostEvent` (which deduct credits) but don't call `checkCreditBalance` first (which would block at zero).

**Fix:** Add `checkCreditBalance` call to `_shared/costTracking.ts` at the top of `logAICostEvent`:

```typescript
// In costTracking.ts, inside logAICostEvent():
const balanceCheck = await checkCreditBalance(supabase, orgId);
if (!balanceCheck.allowed) {
  return { blocked: true, reason: 'insufficient_credits', balance: balanceCheck.balance };
}
// ... proceed with AI call and deduction
```

This is a **single-file change** that fixes all 16+ edge functions at once because they all use the shared `logAICostEvent` helper.

**Also add subscription status check:**
```typescript
const { data: sub } = await supabase
  .from('organization_subscriptions')
  .select('status')
  .eq('org_id', orgId)
  .maybeSingle();

if (sub?.status === 'grace_period' || sub?.status === 'expired') {
  return { blocked: true, reason: 'subscription_inactive' };
}
```

### 4.4 Frontend Credit Gate Wiring

**Problem:** `useRequireCredits` exists but no production component uses it.

**Fix:** Create a `withCreditGate` HOC or `useCreditGatedAction` hook:

```typescript
function useCreditGatedAction(action: string, estimatedCost: number) {
  const { hasCredits, balance, showTopUpPrompt } = useRequireCredits();
  const { isGrace } = useIsInGracePeriod(orgId);

  const canExecute = hasCredits && !isGrace;
  const reason = isGrace ? 'grace_period' : !hasCredits ? 'no_credits' : null;

  return {
    canExecute,
    reason,
    estimatedCost,
    execute: (fn: () => void) => {
      if (!canExecute) {
        if (reason === 'grace_period') navigate('/trial-expired');
        else showTopUpPrompt();
        return;
      }
      fn();
    }
  };
}
```

**Wire into these components (highest traffic first):**
1. Copilot chat input (`CopilotPanel.tsx` or equivalent)
2. Meeting summary generation button
3. Follow-up email generation
4. Contact/company enrichment triggers
5. Proposal generation
6. Sequence generation
7. Any "Ask AI" button across the app

### 4.5 Basic Plan Monthly Credits

**Current state:** `grant_subscription_credits()` is called from `stripe-webhook` on `invoice.paid` for Pro plans only. It always grants 250 credits.

**Change:** Make the credit amount plan-aware:

```typescript
// In stripe-webhook handleInvoicePaid():
const planCredits = subscription.plan_slug === 'pro' ? 250
                  : subscription.plan_slug === 'basic' ? 100
                  : 0;

if (planCredits > 0) {
  await supabase.rpc('grant_subscription_credits', {
    p_org_id: orgId,
    p_amount: planCredits,
    p_period_end: subscription.current_period_end
  });
}
```

**Also update `subscription_plans` seed:**
```sql
UPDATE subscription_plans
SET features = features || '{"bundled_credits": 100}'::jsonb
WHERE slug = 'basic';
```

---

## 5. Database Schema Changes {#database-schema-changes}

### Migration 1: Trial Grace Period Columns

```sql
-- Add grace period columns to organization_subscriptions
ALTER TABLE organization_subscriptions
  ADD COLUMN IF NOT EXISTS grace_period_started_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS grace_period_ends_at TIMESTAMPTZ;

-- Expand status CHECK to include 'grace_period'
ALTER TABLE organization_subscriptions
  DROP CONSTRAINT IF EXISTS organization_subscriptions_status_check;
ALTER TABLE organization_subscriptions
  ADD CONSTRAINT organization_subscriptions_status_check
  CHECK (status IN ('active', 'trialing', 'past_due', 'canceled', 'paused', 'expired', 'grace_period'));

-- Add deactivation_reason to organizations (if not exists)
ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS deactivation_reason TEXT;

-- Index for cron queries
CREATE INDEX IF NOT EXISTS idx_org_subs_trial_expiry
  ON organization_subscriptions(trial_ends_at)
  WHERE status = 'trialing';

CREATE INDEX IF NOT EXISTS idx_org_subs_grace_expiry
  ON organization_subscriptions(grace_period_ends_at)
  WHERE status = 'grace_period';
```

### Migration 2: check_subscription_access RPC

```sql
CREATE OR REPLACE FUNCTION check_subscription_access(p_org_id UUID)
RETURNS JSONB AS $$
DECLARE
  v_sub RECORD;
  v_result JSONB;
BEGIN
  SELECT status, trial_ends_at, grace_period_ends_at, plan_id
  INTO v_sub
  FROM organization_subscriptions
  WHERE org_id = p_org_id
  ORDER BY created_at DESC
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'has_access', false,
      'can_use_ai', false,
      'reason', 'no_subscription',
      'action', 'subscribe'
    );
  END IF;

  CASE v_sub.status
    WHEN 'active' THEN
      RETURN jsonb_build_object('has_access', true, 'can_use_ai', true, 'status', 'active');
    WHEN 'trialing' THEN
      IF v_sub.trial_ends_at > NOW() THEN
        RETURN jsonb_build_object(
          'has_access', true, 'can_use_ai', true, 'status', 'trialing',
          'trial_days_remaining', EXTRACT(DAY FROM v_sub.trial_ends_at - NOW())::int
        );
      ELSE
        RETURN jsonb_build_object(
          'has_access', true, 'can_use_ai', false,
          'status', 'trial_expired', 'action', 'subscribe'
        );
      END IF;
    WHEN 'grace_period' THEN
      RETURN jsonb_build_object(
        'has_access', true, 'can_use_ai', false,
        'status', 'grace_period',
        'grace_days_remaining', GREATEST(0, EXTRACT(DAY FROM v_sub.grace_period_ends_at - NOW())::int),
        'action', 'subscribe'
      );
    WHEN 'past_due' THEN
      RETURN jsonb_build_object(
        'has_access', true, 'can_use_ai', true,
        'status', 'past_due', 'action', 'update_payment'
      );
    ELSE
      RETURN jsonb_build_object(
        'has_access', false, 'can_use_ai', false,
        'status', v_sub.status, 'action', 'subscribe'
      );
  END CASE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

GRANT EXECUTE ON FUNCTION check_subscription_access(UUID) TO authenticated, service_role;
```

### Migration 3: Credit Menu — Add Missing Actions

```sql
INSERT INTO credit_menu (action_id, display_name, description, category, unit, cost_low, cost_medium, cost_high, is_active, free_with_sub, is_flat_rate)
VALUES
  ('instant_replay', 'Instant Replay', 'Full post-meeting pipeline on historical meeting', 'ai_actions', 'per replay', 1.5, 3.0, 5.0, true, false, false),
  ('writing_style_analysis', 'Writing Style Analysis', 'Analyze and learn writing voice from emails', 'ai_actions', 'per analysis', 0.5, 1.0, 2.0, false, false, false),
  ('fact_profile_research', 'Company Fact Profile', 'Deep research for org fact profile', 'enrichment', 'per profile', 0.3, 1.0, 2.5, false, false, false),
  ('battlecard_generation', 'Competitive Battlecard', 'Generate competitive positioning battlecard', 'ai_actions', 'per battlecard', 0.5, 1.5, 3.0, false, false, false),
  ('linkedin_enrichment', 'LinkedIn Profile Enrichment', 'Enrich contact with LinkedIn data', 'enrichment', 'per contact', 0.3, 0.3, 0.3, false, false, true)
ON CONFLICT (action_id) DO NOTHING;

-- Activate draft items that should be live
UPDATE credit_menu SET is_active = true
WHERE action_id IN ('pre_meeting_brief', 'transcript_search', 'coaching_analysis', 'deal_intelligence', 'lead_qualification', 'notetaker_bot')
  AND is_active = false;
```

### Migration 4: Update Basic Plan Credits

```sql
UPDATE subscription_plans
SET features = features || '{"bundled_credits": 100}'::jsonb
WHERE slug = 'basic' AND is_active = true;
```

### Migration 5: Instant Replay Flag

```sql
ALTER TABLE user_onboarding_progress
  ADD COLUMN IF NOT EXISTS instant_replay_completed BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS instant_replay_meeting_id UUID REFERENCES meetings(id) ON DELETE SET NULL;
```

---

## 6. Credit Menu Audit {#credit-menu-audit}

### Currently Active (17 items)

| action_id | Category | Low | Med | High | Flat? | Free w/sub? |
|-----------|----------|-----|-----|------|-------|-------------|
| copilot_chat | ai_actions | 0.3 | 0.8 | 4.0 | No | No |
| meeting_summary | ai_actions | 0.3 | 1.8 | 8.5 | No | Yes |
| research_enrichment | ai_actions | 0.3 | 0.6 | 3.5 | No | No |
| content_generation | ai_actions | 0.3 | 1.4 | 5.0 | No | No |
| crm_update | ai_actions | 0.2 | 0.5 | 1.5 | No | No |
| task_execution | ai_actions | 0.3 | 1.0 | 4.0 | No | No |
| daily_briefing | agents | 0 | 0 | 0 | Yes | Yes |
| deal_risk_score | agents | 0.5 | 1.0 | 3.0 | No | No |
| reengagement_trigger | agents | 1.0 | 2.0 | 5.0 | No | No |
| stale_deal_alert | agents | 0.3 | 0.8 | 2.5 | No | No |
| weekly_coaching_digest | agents | 1.0 | 2.5 | 6.0 | No | No |
| apollo_search | integrations | 0.3 | — | — | Yes | No |
| apollo_enrichment | integrations | 0.5 | — | — | Yes | No |
| email_send | integrations | 0.1 | — | — | Yes | No |
| ai_ark_company | enrichment | 0.25 | — | — | Yes | No |
| ai_ark_people | enrichment | 1.25 | — | — | Yes | No |
| exa_enrichment | enrichment | 0.2 | — | — | Yes | No |
| call_recording_storage | storage | 0 | 0 | 0 | Yes | Yes |

### Currently Draft (Need Activation) — 11 items

| action_id | Category | Low | Med | High | Recommendation |
|-----------|----------|-----|-----|------|---------------|
| notetaker_bot | agents | 1.0 | 2.0 | 5.0 | **Activate** — notetaker is live |
| pre_meeting_brief | ai_actions | 0.3 | 1.2 | 5.0 | **Activate** — prep briefs are live |
| transcript_search | ai_actions | 0.2 | 0.6 | 2.5 | **Activate** — ask-meeting-ai is live |
| deal_proposal | ai_actions | 1.0 | 2.5 | 8.0 | **Activate** — proposals are live |
| coaching_analysis | ai_actions | 0.5 | 1.5 | 6.0 | **Activate** — coaching is live |
| deal_intelligence | ai_actions | 0.5 | 1.2 | 4.5 | **Activate** — deal summaries are live |
| lead_qualification | ai_actions | 0.3 | 0.8 | 3.0 | **Activate** — qualification is live |
| competitor_intel | ai_actions | 0.5 | 1.5 | 6.0 | **Activate** — battlecards are live |
| deal_rescue_plan | ai_actions | 0.5 | 1.5 | 5.0 | **Activate** — rescue plans are live |
| sequence_step_execution | agents | 0.3 | 0.8 | 3.0 | Keep draft — sequences not fully live |
| slack_notification | integrations | 0.1 | — | — | Keep draft — too granular for now |
| hubspot_sync | integrations | 0.2 | — | — | Keep draft — sync is background |

### New Items to Add — 5 items

| action_id | Category | Low | Med | High | Rationale |
|-----------|----------|-----|-----|------|-----------|
| instant_replay | ai_actions | 1.5 | 3.0 | 5.0 | Full pipeline run: summary + actions + email |
| writing_style_analysis | ai_actions | 0.5 | 1.0 | 2.0 | Brand voice learning from email history |
| fact_profile_research | enrichment | 0.3 | 1.0 | 2.5 | Org fact profile generation |
| battlecard_generation | ai_actions | 0.5 | 1.5 | 3.0 | Competitive battlecard |
| linkedin_enrichment | enrichment | 0.3 | 0.3 | 0.3 | LinkedIn profile data (flat rate) |

### Cost/Margin Analysis

At 1 credit = £0.10, our target margin is **70-80%** on AI actions:

| Tier | Our AI Cost/Call | Credit Price | Revenue/Credit | Margin |
|------|-----------------|-------------|----------------|--------|
| Low (Haiku) | ~£0.003-£0.01 | 0.2-0.5 cr (£0.02-£0.05) | £0.02-£0.05 | ~80-95% |
| Medium (Sonnet) | ~£0.01-£0.05 | 0.5-2.0 cr (£0.05-£0.20) | £0.05-£0.20 | ~70-85% |
| High (Opus) | ~£0.05-£0.30 | 2.0-8.5 cr (£0.20-£0.85) | £0.20-£0.85 | ~65-80% |

Integration costs (Apollo, AI Ark, Exa) have thinner margins (~50-60%) because we're reselling third-party API calls. This is acceptable as they drive engagement that leads to more AI usage.

---

## 7. Instant Replay Integration {#instant-replay-integration}

### Insertion Point in Onboarding

**Current V2 flow:** `skills_config` → `complete`
**New V2 flow:** `skills_config` → `notetaker_connection` → `complete`

### Changes Required

**1. Store (`onboardingV2Store.ts`):**
- Add `'notetaker_connection'` to `OnboardingV2Step` type (line 223)
- `saveAllSkills()` (line 1808) currently sets `currentStep: 'complete'` — change to NOT set step (let the caller decide)

**2. OnboardingV2.tsx:**
- Add `'notetaker_connection'` to `VALID_STEPS` array (line 41)
- Add case in `renderStep()` (~line 400): `case 'notetaker_connection': return <NotetakerConnectionStep />`

**3. SkillsConfigStep.tsx:**
- In `moveNext()` after successful `saveAllSkills()`: call `setStep('notetaker_connection')` instead of `setStep('complete')`

**4. New component: `NotetakerConnectionStep.tsx`:**
- Shows available notetakers: Fathom, Fireflies, JustCall, 60 Notetaker
- OAuth connection flow (reuse existing integration hooks: `useFathomIntegration`, `useFirefliesIntegration`, `useJustCallIntegration`)
- On successful connection → show Instant Replay panel
- Skip button → proceeds directly to `complete`

**5. New component: `InstantReplayPanel.tsx`:**
- Shows meeting title + date: "Want 60 to show you what it can do with this?"
- Credit cost disclosure: "This will use ~3 credits"
- "Run Instant Replay" button
- Progressive loading (SSE events from `generate-follow-up` pattern):
  - Meeting found → Transcript loaded → Summary generated → Action items extracted → Follow-up drafted
- Tabbed results: Summary | Action Items | Follow-Up Email
- "This happens automatically after every meeting from now on."
- Continue button → `setStep('complete')`

**6. New edge function: `instant-replay/index.ts`:**

```
Input: { user_id, org_id, notetaker_source: 'fathom' | 'fireflies' | 'justcall' }

Step 1: Fetch recent meeting
  → Call notetaker API for most recent meeting with transcript
  → Fathom: GET /api/v1/recordings?limit=1&sort=-created_at
  → Fireflies: GraphQL query for most recent transcript
  → JustCall: GET /v1/calls?per_page=1&sort=-date (with recording)
  → Normalize to: { transcript, title, date, duration, participants }

Step 2: Check for existing meeting
  → Query meetings table by fathom_recording_id / source external ID
  → If exists and pipeline already ran → return cached results
  → If not → create meeting record (owner_user_id, NOT user_id)

Step 3: Run pipeline stages (parallel where possible)
  → meeting-process-structured-summary (Claude Sonnet, ~10-30s)
  → extract-action-items (Claude Haiku, ~2-5s)
  → generate-follow-up (Claude Sonnet + RAG, ~10-30s) — but NO auto-send
  → condense-meeting-summary (Claude Haiku, ~1-2s)

Step 4: Return results via SSE stream
  → event: step { id: 'summary', status: 'complete', data: {...} }
  → event: step { id: 'action_items', status: 'complete', data: {...} }
  → event: step { id: 'follow_up', status: 'complete', data: {...} }
  → event: complete { meeting_id, credits_used }

Step 5: Set flag
  → UPDATE user_onboarding_progress SET instant_replay_completed = true, instant_replay_meeting_id = ?

Credit cost: Deducted via logAICostEvent with action_id = 'instant_replay'
```

**Edge cases (from PRD):**

| Scenario | Handling |
|----------|----------|
| No meetings found | Skip gracefully. "You're all set — 60 will process your next meeting automatically." |
| No transcript | Try up to 3 most recent meetings. Fall back to "no meetings" path. |
| Transcript < 200 words | Skip, try next meeting. |
| Meeting > 30 days old | Use it but frame differently. Skip follow-up email (too late). Focus on summary + action items. |
| Pipeline timeout (>90s) | Show whatever completed. Don't block onboarding. |
| User skips notetaker | No replay. Proceed to complete. |
| Meeting already in DB | Reuse existing results. Don't re-process. |

---

## 8. First-Login Product Tour {#first-login-product-tour}

### Library: React Joyride

**Installation:** `npm install react-joyride`

### Tour Steps (5 steps, ~60 seconds total)

| Step | Target | Content |
|------|--------|---------|
| 1 | Dashboard overview | "Welcome to 60! This is your command center. Upcoming meetings, recent activity, and your pipeline — all in one view." |
| 2 | Meetings nav item | "Meetings are where 60 shines. After every call, you'll get summaries, action items, and follow-up emails automatically." |
| 3 | Copilot panel/button | "Ask 60 anything about your deals, contacts, or meetings. It knows your full context." |
| 4 | Credit balance (nav) | "Credits power AI features. You have [X] credits. Your [plan] gives you [N] credits each month. Top up anytime in Settings." |
| 5 | Settings nav item | "Connect your calendar, CRM, and Slack here. The more 60 knows, the more it can do." |

### Implementation

**File:** `src/components/ProductTour.tsx`

```typescript
import Joyride, { Step, CallBackProps, STATUS } from 'react-joyride';

const TOUR_STEPS: Step[] = [
  { target: '[data-tour="dashboard"]', content: '...', placement: 'bottom' },
  { target: '[data-tour="meetings"]', content: '...', placement: 'right' },
  { target: '[data-tour="copilot"]', content: '...', placement: 'left' },
  { target: '[data-tour="credits"]', content: '...', placement: 'bottom' },
  { target: '[data-tour="settings"]', content: '...', placement: 'right' },
];

// Show tour when:
// 1. User completed onboarding within the last hour
// 2. localStorage 'sixty_tour_completed' is NOT set
// 3. User is on the dashboard
```

**Data attributes to add:** Add `data-tour="xxx"` attributes to nav items and key UI elements. Non-breaking change — just HTML attributes.

**Persistence:** `localStorage['sixty_tour_completed_${userId}']` + `user_onboarding_progress.tour_completed` column.

### Credit System Explainer

**Shown:** After Instant Replay completes (if run) OR as the first thing on dashboard (if replay was skipped), as a dismissible card.

**Content:**
```
┌──────────────────────────────────────────────┐
│  How Credits Work                             │
│                                               │
│  Credits power 60's AI features:              │
│  • Follow-up emails: ~1-2 credits each        │
│  • Meeting summaries: ~1-2 credits each       │
│  • Contact enrichment: ~0.5-1 credit each     │
│  • Copilot questions: ~0.3-1 credit each      │
│                                               │
│  Your plan includes [100/250] credits/month.   │
│  Need more? Top up anytime from Settings.      │
│                                               │
│  Current balance: [XX] credits                │
│                                               │
│  [Got It]                [View Pricing →]      │
└──────────────────────────────────────────────┘
```

---

## 9. Trial Communications {#trial-communications}

### Email Sequence (via Encharge automation)

| Day | Trigger | Subject | Content Focus |
|-----|---------|---------|--------------|
| 0 | Trial starts | "Your 14-day trial has started — here's your one task for today" | Connect calendar. Single CTA. |
| 3 | Calendar | "What [Company Name] reps do differently after every meeting" | Social proof. Show the follow-up workflow. |
| 7 | Calendar OR behavior | Activated: "You've used [X] credits and saved [Y] hours" / Not activated: "You haven't tried [core feature] yet" | Segmented by activation milestones. |
| 10 | Calendar | "4 days left in your trial — here's what happens next" | Clear pricing table. What they keep vs lose. |
| 12 | Calendar | "Your trial ends in 2 days" | Direct. Upgrade CTA. Optional: 10% first month off for annual. |
| 14 | Trial expires | "Your trial has ended — your data is safe" | Grace period explained. "Upgrade in the next 14 days to pick up exactly where you left off." |
| 26 | Grace day 12 | "Last chance — your 60 account deactivates in 2 days" | Final offer. Show specific data they'll lose ("3 meeting preps ready, 2 deals tracked"). |

### In-App Notifications

| Trigger | Type | Content | Visibility |
|---------|------|---------|------------|
| Day 10 | Top banner | "4 days left in your trial. [Upgrade Now →]" | Org admins only |
| Day 12 | Modal (once) | Plan comparison + upgrade CTA | Org admins only |
| Day 14 | Full page redirect | `TrialExpiredPage` with plans | All org members |
| Credit < 20% | Toast | "Credits running low. [Top Up →]" | User who triggered |
| Credit = 0 | Modal | Credit pack selector | User who triggered |

### Activation Tracking Extensions

Add to `ActivationEventType`:
```typescript
| 'notetaker_connected'
| 'instant_replay_completed'
| 'credits_topped_up'
| 'tour_completed'
```

---

## 10. Admin Customer Tracking {#admin-customer-tracking}

### New Tab in Existing SaasAdminDashboard (`/platform/customers`)

**Access:** Platform admins only (`isPlatformAdmin`)

> **Note:** The `/platform/customers` route is already occupied by `SaasAdminDashboard`. The customer tracking view will be added as a new tab within that existing page, not as a separate route.

**Columns:**

| Column | Source |
|--------|--------|
| Org Name | `organizations.name` |
| Plan | `subscription_plans.name` via `organization_subscriptions.plan_id` |
| Status | `organization_subscriptions.status` (active/trialing/grace_period/expired/canceled) |
| Trial End | `organization_subscriptions.trial_ends_at` |
| Grace End | `organization_subscriptions.grace_period_ends_at` |
| Credits Balance | `org_credit_balance.balance_credits` |
| Credits Used (30d) | Aggregated from `credit_transactions` |
| Meetings (trial) | `trial_meetings_used / trial_meetings_limit` |
| MRR | `organization_subscriptions.current_recurring_amount_cents` |
| Owner Email | `profiles.email` via `organization_memberships.role = 'owner'` |
| Signed Up | `organizations.created_at` |

**Filters:**
- Status: All | Trialing | Grace Period | Active | Past Due | Canceled | Expired
- Trial ending: Next 3 days | Next 7 days | Next 14 days
- Plan: Basic | Pro | Enterprise
- Credits: Low (<10) | Zero | Healthy

**Sort:** Default by trial end date (soonest first for trialing), then by created_at.

**Actions per row:**
- View org details
- Grant credits
- Extend trial (update `trial_ends_at`)
- Send email
- Deactivate org

---

## 11. Execution Plan {#execution-plan}

### Phase 1: Trial Lifecycle (Foundation)

| ID | Story | Type | Dependencies | Files |
|----|-------|------|-------------|-------|
| TRIAL-001 | Add grace period columns + status to organization_subscriptions | schema | — | 1 migration |
| TRIAL-002 | Create `check_subscription_access` RPC | schema | TRIAL-001 | 1 migration |
| TRIAL-003 | Create `trial-expiry-cron` edge function | backend | TRIAL-001 | 1 edge function, config.toml |
| TRIAL-004 | Add trial/grace checks to `ProtectedRoute.tsx` | frontend | TRIAL-001, TRIAL-002 | ProtectedRoute.tsx, new hooks |
| TRIAL-005 | Create `TrialExpiredPage.tsx` with plan comparison + Stripe checkout | frontend | TRIAL-004 | 1 new page, router |
| TRIAL-006 | Create `GracePeriodBanner` component in AppLayout | frontend | TRIAL-004 | 1 component, AppLayout.tsx |
| TRIAL-007 | Update `InactiveOrganizationScreen` with billing-specific messages | frontend | TRIAL-001 | InactiveOrganizationScreen.tsx |

### Phase 2: Credit Enforcement

| ID | Story | Type | Dependencies | Files |
|----|-------|------|-------------|-------|
| CREDIT-001 | Add missing actions to credit_menu + activate draft items | schema | — | 1 migration |
| CREDIT-002 | Add pre-flight `checkCreditBalance` to `costTracking.ts` | backend | — | costTracking.ts |
| CREDIT-003 | Add subscription status check to `costTracking.ts` | backend | TRIAL-001 | costTracking.ts |
| CREDIT-004 | Update Basic plan to 100 credits/month | schema+backend | — | 1 migration, stripe-webhook |
| CREDIT-005 | Wire `useRequireCredits` into production components | frontend | CREDIT-002 | 5-8 component files |
| CREDIT-006 | Create `CreditTopUpPrompt` modal + low-balance toast | frontend | CREDIT-005 | 1-2 new components |
| CREDIT-007 | Audit and patch 17 edge functions bypassing costTracking | backend | CREDIT-002 | 17 edge functions |

### Phase 3: Instant Replay

| ID | Story | Type | Dependencies | Files |
|----|-------|------|-------------|-------|
| REPLAY-001 | Create `fetch-recent-meeting` helper (Fathom + Fireflies) | backend | — | 1 shared module |
| REPLAY-002 | Create `instant-replay` orchestrator edge function | backend | REPLAY-001 | 1 edge function |
| REPLAY-003 | Add `notetaker_connection` step to V2 onboarding flow | frontend | — | onboardingV2Store, OnboardingV2.tsx, SkillsConfigStep.tsx |
| REPLAY-004 | Create `NotetakerConnectionStep.tsx` | frontend | REPLAY-003 | 1 new component |
| REPLAY-005 | Create `InstantReplayPanel.tsx` with SSE progress | frontend | REPLAY-002, REPLAY-004 | 1 new component |
| REPLAY-006 | Add `instant_replay_completed` flag to user_onboarding_progress | schema | — | 1 migration |

### Phase 4: First-Login Experience

| ID | Story | Type | Dependencies | Files |
|----|-------|------|-------------|-------|
| TOUR-001 | Install react-joyride + create `ProductTour.tsx` | frontend | — | package.json, 1 component |
| TOUR-002 | Add `data-tour` attributes to nav items + key UI elements | frontend | TOUR-001 | 3-5 layout files |
| TOUR-003 | Create `CreditSystemExplainer` component | frontend | — | 1 component |
| TOUR-004 | Enhance `ActivationChecklist` with credit + notetaker items | frontend | REPLAY-003 | ActivationChecklist.tsx |
| TOUR-005 | Extend activation tracking with new events | frontend | — | useActivationTracking.ts |

### Phase 5: Admin Tracking

| ID | Story | Type | Dependencies | Files |
|----|-------|------|-------------|-------|
| ADMIN-001 | Add Customers tab to existing SaasAdminDashboard | frontend | TRIAL-001 | SaasAdminDashboard.tsx |
| ADMIN-002 | Add trial extension + credit grant actions to customer row | frontend | ADMIN-001 | ADMIN-001 page |

### Phase 6: Trial Communications

| ID | Story | Type | Dependencies | Files |
|----|-------|------|-------------|-------|
| COMMS-001 | Create trial email templates (7 emails) | backend | — | Email templates + Encharge config |
| COMMS-002 | Wire email triggers into trial-expiry-cron + activation tracking | backend | TRIAL-003, COMMS-001 | trial-expiry-cron, activation hooks |
| COMMS-003 | In-app trial countdown badge + modal | frontend | TRIAL-004 | Nav component, 1 modal |

### Dependency Graph

```
TRIAL-001 ──┬──→ TRIAL-002 ──→ TRIAL-004 ──→ TRIAL-005
             │                       │
             │                       └──→ TRIAL-006
             │
             ├──→ TRIAL-003 ──→ COMMS-002
             │
             ├──→ TRIAL-007
             │
             └──→ CREDIT-003

CREDIT-001 (independent)
CREDIT-002 ──→ CREDIT-005 ──→ CREDIT-006
             └──→ CREDIT-007
CREDIT-004 (independent)

REPLAY-001 ──→ REPLAY-002 ──→ REPLAY-005
REPLAY-003 ──→ REPLAY-004 ──→ REPLAY-005
REPLAY-006 (independent)

TOUR-001 ──→ TOUR-002
TOUR-003 (independent)
TOUR-004 (depends on REPLAY-003)
TOUR-005 (independent)

ADMIN-001 ──→ ADMIN-002
COMMS-001 ──→ COMMS-002
COMMS-003 (depends on TRIAL-004)
```

### Parallel Execution Groups

| Group | Stories | Can run in parallel |
|-------|---------|-------------------|
| Foundation batch | TRIAL-001, CREDIT-001, CREDIT-004, REPLAY-006 | Yes (all independent schema) |
| Backend batch | TRIAL-003, CREDIT-002, REPLAY-001 | Yes (different functions) |
| Frontend onboarding | REPLAY-003, REPLAY-004, TOUR-001, TOUR-003 | Yes (different components) |
| Admin + comms | ADMIN-001, COMMS-001 | Yes (different areas) |

### MVP Cut (Ship First — 20 stories)

Phases 1-3: Trial lifecycle + credit enforcement (incl. CREDIT-007) + Instant Replay

### Fast Follow (Ship Second — 7 stories)

Phases 4-5: Product tour + admin tracking

### Polish (Ship Third — 3 stories)

Phase 6: Trial communications

---

## 12. Success Metrics {#success-metrics}

### Primary

| Metric | Current | Target | Measurement |
|--------|---------|--------|-------------|
| Trial → Paid conversion | ~0% (no enforcement) | 15-25% | Cohort: trial_started → subscription_started within 28 days |
| Time to wow moment | 1-3 days | < 5 minutes | notetaker_connected → first_summary_viewed delta |
| Day-1 retention | TBD baseline | +20% | % of signups returning within 24 hours |
| Monthly credit revenue | £0 | £500+/mo by month 3 | Sum of credit pack purchases |
| MRR from subscriptions | £0 | £2,000+/mo by month 3 | Active subscriptions * monthly price |

### Secondary

| Metric | Target | Measurement |
|--------|--------|-------------|
| Instant Replay completion | >70% of notetaker-connected users | replay_completed / notetaker_connected |
| Follow-up email engagement | >40% approved/edited | Click-through on replay email draft |
| Credit top-up rate | >10% of subscribers | Monthly top-up purchases / active subscribers |
| Tour completion | >60% of first-login users | tour_completed events / first dashboard visits |
| Grace → Paid conversion | >20% | Subscriptions started during grace / total grace entries |

### Guardrail Metrics (Must Not Regress)

| Metric | Threshold |
|--------|-----------|
| Onboarding completion rate | No regression from current |
| Onboarding drop-off at notetaker step | < 15% (replay loading could cause abandonment) |
| Credit spend complaints in first 24h | < 5 support tickets/week |
| Pipeline processing error rate | No increase |

---

## 13. Risks & Mitigations {#risks-mitigations}

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Breaking existing trial users | High | High | Migration must grandfather current trialing orgs. Set `trial_ends_at` for orgs that don't have it. |
| Credit gate blocks paying users | Medium | High | Only gate AI actions, never core navigation. `past_due` status still allows AI (user is trying to pay). |
| Instant Replay pipeline timeout | Medium | Medium | 90-second soft timeout. Show partial results. Don't block onboarding. |
| Notetaker API rate limits | Medium | Low | Single meeting fetch only. Retry with backoff. Cache response. |
| Tour annoys returning users | Low | Low | One-time only, dismissible, persisted in localStorage + DB. |
| Credit pricing too high | Medium | Medium | Start with current prices. Admin can adjust via CreditMenuAdmin. Monitor top-up conversion rate. |
| Grace period too generous (14 days) | Low | Medium | Monitor grace→paid conversion. Can shorten to 7 days if exploitation is observed. |
| `trial_will_end` webhook gap | High | Medium | The new `trial-expiry-cron` handles DB-only trials. Stripe-managed trials still use webhook. Both paths converge on same grace period logic. |
| `start-free-trial` doesn't set `trial_meetings_limit` | High | Medium | Fix in this project: set `trial_meetings_limit = 100` in the edge function. |

### Verification Findings (Codebase Audit — 5 Agent Reports)

The following critical findings were discovered by 5 parallel verification agents that stress-tested this PRD against the actual codebase.

#### Blockers Resolved

| Blocker | Impact | Resolution |
|---------|--------|------------|
| `deletion_scheduled_at` trigger (migration 20260205140001) auto-sets 30 days when `is_active` flips — overrides 14-day grace for trial users | Trial grace period would silently be 30 days, not 14 | **TRIAL-001**: Modify trigger to check `deactivation_reason` — 14 days for `trial_expired`, 30 days for subscription cancellation |
| `saveAllSkills()` in onboardingV2Store sets `currentStep: 'complete'` AND marks DB complete — new notetaker step gets skipped on resume | Users who completed skills but didn't connect notetaker would skip it on return | **REPLAY-003**: Split `saveAllSkills()` into `persistSkillsToServer()` (save only) + let component control step transitions |
| Pipeline child functions each charge credits independently — orchestrator would also charge = triple deduction | Instant Replay costs 9-15 credits instead of 3-5 | **REPLAY-002**: Orchestrator charges once upfront, child calls use service role key with `skip_credit_check` flag |

#### Security Vulnerabilities Woven Into Stories

| Vuln | Description | Fixed In |
|------|-------------|----------|
| V1: `deduct_credits_ordered` accepts negative amounts | Unlimited free credits via negative deduction | **CREDIT-002**: Add `p_amount > 0` validation |
| V2: `grant_subscription_credits` callable by any authenticated user | Any user can grant credits to any org | **TRIAL-002**: `REVOKE EXECUTE FROM authenticated` on grant RPCs |
| V3: `start-free-trial` allows re-trialing after grace/expired | Infinite trial reset exploit | **TRIAL-003**: Block status transitions from `grace_period`/`expired` back to `trialing` |
| V4: `CRON_SECRET` guard fails open when env var not set | Unauthenticated cron execution | **TRIAL-003**: Guard fails closed (reject request if env var missing) |
| V5: `org_credit_balance` UPDATE RLS has no column restriction | Admins can set `balance_credits = 99999` | **CREDIT-002**: Restrict UPDATE to specific columns |
| V6: `organization_subscriptions` SELECT policy dropped in baseline_fixed | Trial enforcement gate fails open (returns null) | **TRIAL-001**: Recreate SELECT policy |

#### Plan Adjustments Made

| Issue | Change |
|-------|--------|
| `/platform/customers` route collision with `SaasAdminDashboard` | **ADMIN-001**: Merge as new tab into existing `SaasAdminDashboard` |
| `TrialConversionModal` already triggers on `expired` — conflicts with new redirect | **TRIAL-004**: Remove modal trigger for expired, keep only for approaching-expiry |
| `SubscriptionStatus` type missing `expired`/`grace_period` | **TRIAL-001**: Update TypeScript type as part of schema migration |
| `update-subscription` rejects non-active/trialing for upgrades | **TRIAL-002**: Allow `grace_period` and `expired` statuses |
| 17 edge functions bypass `costTracking.ts` entirely | **CREDIT-007**: New story — audit and patch all 17 |
| No `org_credit_balance` row for trial orgs = credit enforcement fail-open | **TRIAL-003**: `start-free-trial` creates balance row |
| `source_type` CHECK constraint missing `'fireflies'` | **REPLAY-006**: Add to CHECK constraint |
| Config.toml has no `[cron]` section — crons use pg_cron SQL | **TRIAL-003**: Use pg_cron via migration, not config.toml |
| `LowBalanceBanner` imported but never rendered in AppLayout | **CREDIT-006**: Wire up existing component instead of building new |
| ProtectedRoute uses `useEffect`+`useState`, not React Query | **TRIAL-004**: Follow existing component pattern (no React Query hooks) |

### Open Questions

1. **Should we retroactively expire existing trial accounts?** Recommendation: Yes, but with a 7-day warning email. Identify all orgs with `status = 'trialing'` and `trial_ends_at < now()`. Send a "your trial has been extended for 7 more days" email, then let the cron handle expiry normally.

2. **Should `past_due` block AI?** Recommendation: No. The user has a payment method on file and is trying to pay. Blocking AI would cause churn. Stripe retries failed payments for up to 3 attempts. Only block if status transitions to `canceled` or `expired`.

3. **How many welcome credits should we grant?** Currently 10. Recommendation: Increase to 25 (enough for ~8-10 AI actions including Instant Replay). This gives users enough rope to experience multiple features during trial without topping up.

4. **Should purchased credits expire?** Currently no expiry (packs have `expires_at = NULL`). Recommendation: Keep no-expiry policy. Research shows this removes hesitation on top-ups and builds trust.

---

## Appendix A: Current System State Summary

### Files Requiring Changes

| File | Change Type | Scope |
|------|-------------|-------|
| `src/components/ProtectedRoute.tsx` | Modify | Add trial/grace checks |
| `src/components/AppLayout.tsx` (or equivalent) | Modify | Add GracePeriodBanner, trial badge |
| `src/pages/InactiveOrganizationScreen.tsx` | Modify | Add billing-specific messages |
| `src/lib/stores/onboardingV2Store.ts` | Modify | Add notetaker_connection step |
| `src/pages/onboarding/v2/OnboardingV2.tsx` | Modify | Add step to VALID_STEPS + renderStep |
| `src/pages/onboarding/v2/SkillsConfigStep.tsx` | Modify | Route to notetaker_connection instead of complete |
| `supabase/functions/_shared/costTracking.ts` | Modify | Add pre-flight credit + subscription check |
| `supabase/functions/stripe-webhook/index.ts` | Modify | Plan-aware credit grants |
| `supabase/functions/start-free-trial/index.ts` | Modify | Set trial_meetings_limit, use getCorsHeaders, block re-trial exploit, create credit balance row |
| `supabase/functions/update-subscription/index.ts` | Modify | Allow grace_period/expired status upgrades (line 138) |
| `supabase/migrations/20260205140001` (trigger) | Modify | 14-day deletion for trial_expired, 30-day for subscription cancel |
| `supabase/migrations/20260221050001` (credit RPCs) | Modify | Restrict grant RPCs to service_role, validate positive amounts |
| `supabase/migrations/20260210200001` (credit balance) | Modify | Restrict UPDATE RLS to specific columns |
| `supabase/migrations/20260108203000` (baseline) | Modify | Recreate organization_subscriptions SELECT policy |
| `src/lib/types/subscription.ts` | Modify | Add 'expired' and 'grace_period' to SubscriptionStatus type |
| 17 edge functions bypassing costTracking | Modify | Add costTracking imports and credit pre-checks |
| `src/lib/hooks/useActivationTracking.ts` | Modify | Add new event types |
| `src/components/dashboard/ActivationChecklist.tsx` | Modify | Add credit + notetaker items |
| `src/pages/settings/BillingSettingsPage.tsx` | Modify | Add expired trial state |

### New Files

| File | Purpose |
|------|---------|
| `supabase/functions/trial-expiry-cron/index.ts` | Daily cron: expire trials, expire grace, warn |
| `supabase/functions/instant-replay/index.ts` | Orchestrate Instant Replay pipeline |
| `src/pages/TrialExpiredPage.tsx` | Upgrade wall with plan comparison |
| `src/pages/onboarding/v2/NotetakerConnectionStep.tsx` | Onboarding notetaker + replay step |
| `src/components/InstantReplayPanel.tsx` | Progressive loading replay results |
| `src/components/GracePeriodBanner.tsx` | Persistent upgrade banner during grace |
| `src/components/ProductTour.tsx` | React Joyride wrapper |
| `src/components/CreditSystemExplainer.tsx` | Credit education card |
| `src/components/CreditTopUpPrompt.tsx` | Low-balance modal |
| (Merged into `SaasAdminDashboard.tsx`) | Admin customer tracking tab |
| 4-5 migration files | Schema changes |

### Existing Infrastructure Reused (No Changes Needed)

| Component | Reused For |
|-----------|-----------|
| `create-checkout-session` | Stripe checkout from upgrade wall |
| `create-portal-session` | Stripe portal from billing page |
| `grant_subscription_credits()` RPC | Monthly credit grants (just needs plan-aware caller) |
| `deduct_credits_ordered()` RPC | Credit deduction (already works) |
| `generate-follow-up` edge function | Instant Replay email draft (SSE pattern) |
| `meeting-process-structured-summary` | Instant Replay summary |
| `extract-action-items` | Instant Replay action items |
| `condense-meeting-summary` | Instant Replay one-liner |
| `fathom-sync` | Existing Fathom API patterns |
| `fireflies-sync` | Existing Fireflies GraphQL patterns |
| `org-deletion-cron` | Post-grace org cleanup |
| `InactiveOrganizationScreen` | Post-grace deactivation UI |
| `CreditMenuAdmin` | Admin pricing adjustments |
| `ActivationChecklist` | Enhanced with new items |
| `useActivationTracking` | Extended with new events |

---

## Appendix B: Competitive Landscape

| Competitor | Trial Model | Credit System | Cold Start Solution |
|------------|-------------|--------------|-------------------|
| **Gong** | 14-day, CC required | No credits (seat-based) | None — wait for meetings |
| **HubSpot** | 14-day, no CC | AI credits (limited) | CRM import is instant value |
| **Salesloft** | No self-serve trial | No credits (seat-based) | None — manual cadence setup |
| **Fathom** | Free tier forever | No credits | Instant recording (no analysis) |
| **Apollo** | Free tier + credits | Credit-based (contact exports) | Instant search value |
| **Clay** | 14-day, no CC | Credit-based (enrichment) | Spreadsheet is immediate |
| **60 (after this PRD)** | 14-day, no CC, grace | Credit-based (AI actions) | **Instant Replay** — unique |

60's differentiator: The only product that proves its AI works using your own data before you've even finished setting it up, combined with a credit system that makes AI power accessible without enterprise pricing.
