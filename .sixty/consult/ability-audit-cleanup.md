# Consult Report: Ability Registry Audit & Cleanup
Generated: 2026-02-14 21:45

## User Request
"Post-Meeting Follow-up and Post-Call Summary are the same thing. Post-Meeting Follow-up is working correctly. Audit all abilities against that standard, suggest 3 new abilities, consolidate duplicates."

## Gold Standard: Post-Meeting Follow-up
- Backend: orchestrator (multi-step, wave-based parallel execution)
- Event: meeting_ended
- Steps: 9 (classify → extract → detect → suggest → draft → update CRM → create tasks → notify Slack → coaching)
- Real adapters: 8/9 implemented (update-crm-from-meeting is sole stub)
- Slack delivery: via notify-slack-summary adapter → send-slack-message edge function
- HITL: email draft approval via Slack

## Agent Findings

### Registry State (22 abilities total)
- 13 orchestrator-backed (V2 multi-step)
- 9 V1-simulate (single copilot skill execution)

### Duplicates Identified

| V1 (Single Skill) | V2 (Orchestrator) | Verdict |
|---|---|---|
| Post-Call Summary (`post-meeting-followup-pack-builder`) | Post-Meeting Follow-up (9-step pipeline) | **Remove V1** — V2 is the gold standard |
| Pre-Meeting Nudge (`meeting-prep-brief`) | Pre-Meeting Briefing (5-step pipeline) | **Remove V1** — V2 has enrichment + Gemini research |
| Stale Deal Alert (`deal-slippage-diagnosis`) | Stale Deal Revival (0/3 stubs) | **Keep V1** until V2 implemented |

### Sub-Steps Listed as Standalone Abilities
- Call Type Classification — sub-step of Post-Meeting Follow-up (wave 1)
- Coaching Micro-Feedback — sub-step of Post-Meeting Follow-up (wave 2)
- Intent Detection — sub-step of Post-Meeting Follow-up (wave 2)

These run automatically within the meeting_ended sequence. Users cannot trigger them independently. Showing them as separate ability cards is confusing.

### Near-Duplicate V1 Abilities
- Morning Brief (`daily-brief-planner`): "schedule, priority deals, contacts, tasks"
- Daily Focus Planner (`daily-focus-planner`): "CVHS-scored deals, contacts, next best actions, task pack"

Both cron-triggered, V1-simulate, in-app only. Merge into one.

## Synthesis

### Remove (5 abilities)
1. `post-call-summary` — duplicate of Post-Meeting Follow-up
2. `pre-meeting-nudge` — duplicate of Pre-Meeting Briefing
3. `call-type-classification` — sub-step, not standalone
4. `coaching-micro-feedback` — sub-step, not standalone
5. `detect-intents` — sub-step, not standalone

### Merge (2 → 1)
- `morning-brief` + `sales-assistant-digest` → single "Daily Briefing" using `daily-focus-planner` skill

### Add (3 new abilities)
1. **Deal Stage Change Alert** — `buildDealStageChangeMessage` + `buildDealMomentumMessage` blocks exist
2. **Win/Loss Post-Mortem** — `buildDealWonMessage` + `buildDealLostMessage` blocks exist
3. **Account Intelligence Digest** — `buildAccountIntelligenceDigest` + `buildAccountSignalAlert` blocks exist

## Final Registry (18 abilities)

| # | Ability | Stage | Backend | Status |
|---|---------|-------|---------|--------|
| 1 | Pre-Meeting Briefing | pre-meeting | orchestrator | Production |
| 2 | Daily Briefing (merged) | pre-meeting | v1-simulate | Working |
| 3 | Post-Meeting Follow-up | post-meeting | orchestrator | Gold Standard |
| 4 | Coaching Analysis | coaching | orchestrator | Working |
| 5 | Calendar Scheduling | pipeline | orchestrator | Partial |
| 6 | Stale Deal Alert | pipeline | v1-simulate | Working |
| 7 | Deal Stage Change Alert | pipeline | v1-simulate | **NEW** |
| 8 | Email Classification | outreach | orchestrator | Partial |
| 9 | Email Send-as-Rep | outreach | orchestrator | Partial |
| 10 | HITL Follow-up Email | outreach | v1-simulate | Working |
| 11 | Email Reply Received | outreach | v1-simulate | Working |
| 12 | Proposal Generation | outreach | orchestrator | Not Working |
| 13 | Campaign Monitoring | outreach | orchestrator | Production |
| 14 | Weekly Coaching Digest | coaching | orchestrator | Production |
| 15 | Win/Loss Post-Mortem | coaching | v1-simulate | **NEW** |
| 16 | 60 Smart Suggestion | coaching | v1-simulate | Working |
| 17 | Account Intelligence Digest | pre-meeting | v1-simulate | **NEW** |
| 18 | Stale Deal Revival | pipeline | orchestrator | Not Working (all stubs) |
