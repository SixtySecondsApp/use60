# Consult Report: Always-On Demo Experience
Generated: 2026-02-22

## User Request
Build a comprehensive demo page showing the before-and-after experience with simulated data. Show every single feature in action — training screens, questions, settings pages, how it helps a sales rep, all capabilities, tone, and full experience.

## Clarifications
- Q: Who is the primary audience? A: All three (multi-purpose) — internal QA, investor, prospect
- Q: Data source? A: Fully fictional — scripted "Meridian AI" company, zero backend dependency
- Q: Before state? A: Before 60 entirely — manual CRM, missed follow-ups, no meeting prep
- Q: Interaction model? A: Internal only at /settings/demo, behind auth
- Q: AI personality? A: Adaptive — demo shows all three tones (executive assistant → friendly coach → invisible operator)

## Features Demoed (22 scenes across 5 acts)

### Act 1 — Before 60 (1 scene)
- Split-view pain state dashboard

### Act 2 — Onboarding (1 scene)
- Enrichment → AI config inference (14 items, confidence dots) → confirm → completeness 42%

### Act 3 — Day 1 (10 scenes)
1. Morning Briefing (pipeline math, Signal Watch, AI priorities)
2. Pipeline Mathematics (quarter context, target tracking, gap analysis, coverage ratio)
3. External Meeting Prep (attendee intel, risk signals, talking points, competitor battlecard)
4. Post-Meeting Debrief (coaching metrics, sentiment, action items, key quotes)
5. CRM Auto-Update (HITL approval, 4 field changes, confidence badges)
6. Proposal Generation (6-step wizard, ProposalPreview, 3-tier pricing, PDF export, Slack HITL)
7. Internal Meeting Prep (1:1 with manager, pipeline review prep, coaching points)
8. Deal Risk Alert (4 signal dimensions, intervention suggestions)
9. Re-engagement (ghosting detection, stall reason analysis, draft outreach)
10. EOD Synthesis (scorecard, overnight plan, tomorrow preview)

### Transition — Overnight Work (animated timeline)

### Act 4 — Week 2 (4 scenes)
1. Progressive Learning Montage (6 config questions via Slack, completeness climbing 42%→84%)
2. Tone Adaptation (3-column comparison of same alert in 3 personality modes)
3. Competitive Intelligence (Intercom: 12 encounters, 58% win rate, counter-positioning)
4. Cross-Deal Patterns (objection clustering, stage bottleneck, win/loss correlation)

### Act 5 — Month 1 (6 scenes)
1. Before/After Reveal (7-row transformation table, right panel un-blurs)
2. Knowledge Graph (D3 force-directed, 15 nodes, warm intro paths, ghost overlay, company timeline, strength breakdown)
3. Heartbeat Dashboard (9 agents status, action stats, uptime)
4. Coaching Digest (weekly scores, SPIN analysis, team learning, win celebration)
5. Conversational Slack (multi-turn DM thread, 6 example queries, typing animation)
6. Final Learning Beat (behavioral learning, graduated autonomy summary, closing CTA)

## Master Plan Coverage Check

All 24 PRDs from use60_master_plan.md are represented:

| PRD | Covered In Scene |
|-----|-----------------|
| PRD-01: Config Engine | Act 2 (14 inferred items, 3-tier resolution) |
| PRD-02: Fleet Orchestrator | Act 5 Scene 3 (Heartbeat Dashboard) |
| PRD-03: Auto CRM Update | Act 3 Scene 5 |
| PRD-04: Deal Risk Scorer | Act 3 Scene 8 |
| PRD-05: Re-engagement | Act 3 Scene 9 |
| PRD-06: Morning Briefing | Act 3 Scenes 1-2 |
| PRD-07: EOD Synthesis | Act 3 Scene 10 |
| PRD-08: Internal Meeting Prep | Act 3 Scene 7 |
| PRD-09: Methodology Settings | Act 2 (MEDDIC selection) |
| PRD-10: Autonomy Settings | Act 5 Scene 6 (graduated autonomy) |
| PRD-11: CRM Field Mapping | Act 3 Scene 5 (field confidence) |
| PRD-12: Custom SOP Builder | Referenced in tooltip |
| PRD-13: Email Signals | Act 3 Scene 1 (morning brief signals) |
| PRD-14: Engagement Patterns | Act 3 Scene 3 (response time baselines) |
| PRD-15: Ambient Signals | Act 3 Scene 1 (Signal Watch temp) |
| PRD-16: Relationship Graph | Act 5 Scene 2 (full D3 visualization) |
| PRD-17: Competitive Intelligence | Act 4 Scene 3 |
| PRD-18: Cross-Deal Patterns | Act 4 Scene 4 |
| PRD-19: Coaching Digest | Act 5 Scene 4 |
| PRD-20: Org-Wide Learning | Act 5 Scene 4 (team tip) |
| PRD-21: Forecast Accuracy | Act 3 Scene 2 (pipeline math) |
| PRD-22: Conversational Slack | Act 5 Scene 5 |
| PRD-23: Onboarding Wizard | Act 2 |
| PRD-24: Graduated Autonomy | Act 5 Scene 6 |

## Also Demoed (beyond 24 PRDs)
- Proposal generation with PDF/DOCX export (skill + edge functions)
- Temporal intelligence / sales clock (quarter phases, fiscal year)
- Overnight work visualization (agent working 11PM-7AM)
- Config completeness system (tiers, scoring, category breakdown)
- Progressive config questions via Slack Block Kit
- Heartbeat system (agent health monitoring)
- Tone personalization (adaptive voice)

## Scope
- 21 stories
- ~10.5 hours total, ~6-7 hours parallelized
- All frontend — zero backend changes, zero migrations, zero edge function changes
- Fully fictional data — safe for any audience
