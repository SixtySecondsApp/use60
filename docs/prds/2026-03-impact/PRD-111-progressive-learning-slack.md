# PRD-111: Progressive Learning Slack Flow

**Priority:** Tier 3 — Differentiator Upgrade
**Current Score:** 3 (ALPHA) — full backend pipeline, no in-app completion UI
**Target Score:** 4 (BETA)
**Estimated Effort:** 6-8 hours
**Dependencies:** None

---

## Problem

Progressive learning is core to 60's "no setup" promise — the agent self-configures by asking contextual questions at the right moment (after a morning briefing, after a meeting, etc.). The backend is complete:
- 20+ question templates across 4 categories (revenue_pipeline, daily_rhythm, agent_behaviour, methodology)
- `questionEvaluator.ts` (324 lines) — eligibility checks with quiet hours, cooldowns, rate limiting
- `questionDelivery.ts` (240 lines) — Slack Block Kit delivery with in-app fallback
- `evaluate-config-questions` edge function (254 lines) — trigger evaluation
- `answer-config-question` edge function (230 lines) — answer processing
- 3-tier config resolution: platform defaults → org overrides → user overrides
- `get_config_completeness()` RPC returns tier and percentage

But:
1. **No in-app question answering flow** — questions deliver to Slack, but the in-app fallback has no UI to render them
2. **No completeness dashboard** — users can't see how "tuned" their agent is
3. **No question history** — can't see what was asked, what was answered, what was skipped
4. **Config completeness card exists but isn't wired** — demo data only

## Goal

An in-app progressive learning surface that shows config completeness, renders pending questions, and displays answer history — complementing the Slack delivery channel.

## Success Criteria

- [ ] Config completeness widget in dashboard/settings (tier badge + progress bar)
- [ ] In-app question card renderer (mirrors Slack Block Kit layout)
- [ ] Question notification badge in nav (pending question count)
- [ ] Answer history timeline showing all questions with responses
- [ ] "Teach 60" section in settings for manually answering pending questions
- [ ] Category-based progress breakdown (revenue_pipeline, daily_rhythm, etc.)

## Stories

| ID | Title | Type | Est | Dependencies |
|----|-------|------|-----|-------------|
| LEARN-UI-001 | Build ConfigCompletenessWidget with tier badge and progress bar | frontend | 1h | — |
| LEARN-UI-002 | Create InAppQuestionCard renderer matching Slack Block Kit layout | frontend | 2h | — |
| LEARN-UI-003 | Add question notification badge to navigation | frontend | 1h | LEARN-UI-002 |
| LEARN-UI-004 | Build answer history timeline with category filters | frontend | 1.5h | — |
| LEARN-UI-005 | Create "Teach 60" section in settings with pending questions list | frontend | 1.5h | LEARN-UI-002 |
| LEARN-UI-006 | Wire answer submission to answer-config-question edge function | frontend | 1h | LEARN-UI-002 |

## Technical Notes

- `agent_config_questions` table: template_id, status (pending/asked/answered/skipped/expired), delivery_channel (slack/in_app), answer_value, asked_at, answered_at
- `agent_config_question_templates` table: 20+ templates with config_key, question_template, trigger_event, priority, category, scope, options
- `agent_config_question_log` table: audit trail with event_type (delivered/answered/skipped/expired/rate_limited)
- `get_config_completeness(org_id, user_id)` RPC returns {tier, percentage, categories}
- `get_next_config_question(org_id, user_id, trigger_event)` RPC returns highest-priority pending question
- Question categories: revenue_pipeline, daily_rhythm, agent_behaviour, methodology
- Completeness tiers from demo data: onboarding → learning → calibrating → autonomous → expert
- `questionBlockKit.ts` has the Slack rendering logic — mirror the structure in React
- `configQuestions.ts` (354 lines) in demo data shows the expected question format and progression
