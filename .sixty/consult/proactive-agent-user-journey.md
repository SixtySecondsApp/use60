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

## Phase 1: Configuration Infrastructure (COMPLETE — 13 stories)

All 13 stories from the original consult are complete:
- `proactive_agent_config` table + `user_sequence_preferences` table
- RPCs: `get_proactive_agent_config`, `upsert_proactive_agent_config`, `get_merged_sequence_preferences`
- Runner preference gate in orchestrator
- Delivery feature map extended for all 9 sequences
- Agent activity table + UI panel
- Prerequisites check service + setup wizard
- Settings navigation link + admin check fix
- Orchestrator config seeded for 9 system sequences

---

## Phase 2: Strategic Growth Consult (3 Research Areas)

### Research Agent 1: Credit Metering

**Finding**: Only 1 of 7 AI-using adapters tracks costs via `logAICostEvent()`.

| Adapter | AI Calls | Provider | Tracked? | Est. Cost/Run |
|---------|----------|----------|----------|---------------|
| `emailSend.ts` | 1 | Anthropic Sonnet | YES | $0.003 |
| `preMeeting.ts` | 10+ | Gemini + Claude Haiku | NO | $0.0034 |
| `dealRisk.ts` | 1-50 | Claude Haiku | NO | $0.001-0.05 |
| `callTypeClassifier.ts` | 1 | Anthropic | NO | $0.001 |
| `crmFieldExtractor.ts` | 1 | Anthropic | NO | $0.001 |
| `reengagement.ts` | 5 | Gemini + Claude Haiku | NO | $0.003 |
| `proposalGenerator.ts` | 1 | Anthropic | NO | $0.002 |

**Edge functions also untracked**: `gemini-research` calculates cost but never logs it. `detect-intents` imports the helper but unclear if wired.

**Pattern exists**: `emailSend.ts` has the gold-standard implementation. `costTracking.ts` exports `logAICostEvent()`, `extractAnthropicUsage()`, `extractGeminiUsage()`.

**Pipeline**: `logAICostEvent()` → `ai_cost_events` table → `deduct_credits` RPC → `org_credit_balance`

**Scope**: ~3-4 hours total (3 simple copy-paste + 2 medium + 1 complex parallel adapter)

---

### Research Agent 2: Integration-Gated Marketplace

**Finding**: Strong readiness infrastructure exists but is disconnected from the abilities UI.

**What exists:**
- `skillReadiness.ts` (401 lines) — evaluates 6 capability types (crm, calendar, email, meetings, messaging, tasks)
- `prerequisites.ts` (571 lines) — maps sequences → required integrations
- `useOrgCapabilities()` hook — calls `check-org-capabilities` edge function
- `SkillCard.tsx` (488 lines) — readiness badges, progress bars, capability checks
- Integration hooks for all major integrations (Slack, Google, Fathom, etc.)

**What's missing:**
- No `requiredIntegrations` field in `abilityRegistry.ts` (24 abilities, zero integration metadata)
- No locked/unlocked state on `AbilityCard.tsx` — shows all abilities regardless of prerequisites
- No "Connect X to unlock" messaging anywhere
- No reverse lookup: integration → what abilities it unlocks
- No marketplace-style filtering (locked vs unlocked)

**MVP approach**: Add `requiredIntegrations` to registry, create `useAbilityPrerequisites()` hook, modify `AbilityCard.tsx` — ~400 new lines, ~100 modified, no new components needed.

**Full marketplace**: 5 new components, ~800 lines, 9-14 hours.

---

### Research Agent 3: User Ability Builder

**Finding**: All skill creation is platform-admin only. Three existing builders exist but none are user-accessible.

**Existing builders:**
- `SkillBuilderWizard` (656 lines) — AI-powered 4-step wizard, platform admin only
- `AgentSequenceBuilderPage` (529 lines) — multi-step sequence builder, platform admin only
- `AutomationRuleBuilder` (659 lines) — deal pipeline automation, org admin accessible

**User preference system already exists**: `user_sequence_preferences` table proves the system supports per-user customization of pre-built sequences.

**Recommended approach (Hybrid "Quick Automations")**:
- Form-based builder (not AI-generated for MVP)
- Triggers: Manual (keyword) + Event (meeting_ended, deal_created)
- Actions: Create task, send Slack, add note, run platform skill
- Security: Template-only (no custom prompts), action whitelist, rate limiting
- Access: Org admin only for MVP
- Database: `user_automations` table with RLS

**Scope**: 4-6 weeks MVP, 8-12 weeks with AI assist + approval workflow

---

## Synthesis: The Complete Journey Gap

### What Users Experience Today vs. What They Should

| Journey Stage | Today | Ideal |
|---------------|-------|-------|
| **Discovery** | Must find it in Settings | Dashboard banner: "AI agent can automate X" |
| **Onboarding** | Setup wizard exists but no prompt to start | Guided wizard with integration progress |
| **Activation** | Shows all 9 sequences regardless of prerequisites | "Connect Google Calendar to unlock Pre-Meeting Briefings" |
| **Customization** | Org admin toggles + user delivery override | Toggle + choose delivery + set preferences |
| **Building** | No user creation capability | "Create your own: When X happens, do Y" |
| **Visibility** | Agent activity bell, credit tracking incomplete | Real-time feed + credit usage per ability |
| **Growth** | No unlock progression | "You've unlocked 4/9 abilities. Connect X for more" |

### Priority Order

1. **Credit metering** (3-4 hours) — Must-have, burning invisible credits today
2. **Integration gating on abilities UI** (1-2 days) — High value, infrastructure exists
3. **Discovery nudges** (1 day) — Dashboard banner, onboarding prompt
4. **User ability builder MVP** (4-6 weeks) — Strategic, deferred

---

## Questions for Decision

### Q1: Credit Metering Strategy
Should we track costs **per-adapter** (granular, shows which abilities cost most) or **per-sequence** (simpler, one cost entry per orchestrator run)?

### Q2: Marketplace Scope
Should the abilities page be an **admin-only config page** (current) or a **user-facing marketplace** where every team member sees what's available and can request abilities?

### Q3: Integration Gating Behavior
When a user lacks a required integration, should the ability be **hidden**, **shown but locked** (with "Connect X to unlock"), or **shown with degraded functionality** (skip steps that need that integration)?

### Q4: User Ability Builder Access
Should the automation builder be available to **org admins only**, **all team members** (with admin approval), or **all users** (self-service)?

### Q5: Copilot Integration
Should user-created automations be **copilot-routable** (say "run my automation" in chat) or **trigger-only** (runs on events, not from copilot)?

### Q6: Credit Visibility
Should users see **real-time credit consumption per ability** (transparency), **just a balance** (simple), or **projected monthly cost** per enabled ability?
