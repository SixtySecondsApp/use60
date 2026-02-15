# Consult Report: Proactive Agent User Journey & Configuration

**Date**: 15 February 2026
**Branch**: `feat/proactive-agent-v2`
**Previous**: `.sixty/consult/proactive-agent-v2-gap-analysis.md`

---

## User Request

"Does the proactive agent now work for all users? Lets discuss their journey and how they can configure it."

## Clarifications

- **Config model**: Hybrid — admin enables at org level, users fine-tune per-sequence preferences
- **Rollout**: Internal user only until ready
- **In-app delivery**: New dedicated Agent Activity feed (not existing notification bell)
- **Defaults**: Core sequences ON by default (meeting debrief, pre-meeting briefing, deal risk), advanced OFF (coaching, campaigns, email)

---

## Agent Findings

### Agent 1: Configuration & Settings Infrastructure

**Current Tables**:

| Table | Purpose | Coverage |
|-------|---------|----------|
| `slack_notification_settings` | Org-level feature toggles | 4 features (meeting_debrief, daily_digest, meeting_prep, deal_rooms) |
| `slack_user_preferences` | Per-user notification toggles | 6 types (morning_brief, post_meeting, deal_risk, campaign_alerts, task_reminders, deal_momentum) |
| `slack_user_mappings` | Slack user links + timezone | Briefing time, timezone |

**Critical Gaps**:
1. No proactive agent master switch (org or user level)
2. No per-sequence settings for orchestrator's 9 event types
3. Agent Abilities page (`abilityRegistry.ts`) stores toggle state in localStorage only — zero backend enforcement
4. Feature key mismatch: morning_brief (backend) vs daily_digest (settings UI)
5. `deliverySlack.ts` feature map covers only 6 of 14+ notification types — coaching_weekly, campaign_daily_check, email_received bypass user preferences entirely

### Agent 2: User Journey & Touchpoints

**5/8 proactive touchpoints are Slack-only** — no in-app delivery:
- Meeting debrief, pre-meeting briefing, deal risk alerts, coaching weekly, campaign reports

**Broken flows**:
- Email draft in meeting debrief HITL has no Send/Edit/Cancel buttons
- Pre-meeting deep links may not resolve in-app

**Delivery bypasses**: Orchestrator-driven adapters (notifySlackSummary.ts, etc.) call Slack directly, skipping quiet hours, rate limits, and dedup in the proactive delivery layer.

### Agent 3: Prerequisites & Readiness

**Minimum viable setup**:
1. Organization exists
2. User exists with profile
3. Slack connected: org settings + user mapping + bot token
4. Credit balance > 0 (cost budget gate in runner.ts:87-89)
5. ANTHROPIC_API_KEY in org settings (required by some adapters)

**Per-sequence prerequisites**:
- Calendar connected → pre_meeting_90min
- Instantly connected → campaign_daily_check
- Gmail connected → email_received

**Graceful degradation**: Context loader handles missing contacts/deals/companies as non-fatal. Missing org or user = FATAL.

---

## Synthesis

### Agreements (All Agents)
- No master on/off switch exists — critical gap
- Agent Abilities page is cosmetic (localStorage) — must wire to backend
- Feature key mismatch needs fixing
- Orchestrator bypasses delivery policy layer — needs routing through it

### Recommended Approach
- New `proactive_agent_config` table for org-level settings (master switch + per-sequence defaults)
- New `user_sequence_preferences` table for user-level opt-in/out per sequence
- Gate in `runner.ts` after cost budget check — prevents wasted compute
- Extend `deliverySlack.ts` feature map to cover all 9 sequences
- New `agent_activity` table + UI panel for in-app delivery mirror
- Prerequisites check service for onboarding

### Default Sequence Configuration
| Sequence | Default | Rationale |
|----------|---------|-----------|
| meeting_ended | ON | Core value prop — meeting debrief |
| pre_meeting_90min | ON | High-value, low-noise |
| deal_risk_scan | ON | Proactive pipeline management |
| stale_deal_revival | OFF | Advanced — needs user buy-in |
| coaching_weekly | OFF | Advanced — manager feature |
| campaign_daily_check | OFF | Requires Instantly integration |
| email_received | OFF | Requires Gmail push setup |
| proposal_generation | OFF | High-stakes — needs explicit opt-in |
| calendar_find_times | OFF | Triggered by intent detection, not standalone |

---

## Plan Generated

See: `.sixty/plan-proactive-config.json` (13 stories, 5 phases)
