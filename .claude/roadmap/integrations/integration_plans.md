# Feature Brief: @60 — Embedded AI Sales Assistant

**Product:** use60
**Date:** 7 February 2026
**Author:** Andrew Bryce
**Status:** Draft

---

## Overview

@60 is use60's AI copilot delivered as an embedded assistant that lives inside the tools revenue teams already use — HubSpot, Slack, and the use60 platform itself. Rather than asking reps to context-switch into a separate application, @60 meets them where they work and executes any skill or sequence from a single natural language command.

The copilot runs continuously in the background. It has full access to business context, CRM data, meeting transcripts, and all use60 skills. Regardless of where the rep invokes it, @60 has the same capabilities and the same context.

**Example commands:**
> @60 Add this guy to the AI Round Table campaign

> @60 Can you write a follow up based on our last meeting?

> @60 Enrich this contact and find me 10 similar profiles

> @60 What's the deal history with this company?

> @60 Draft a proposal based on yesterday's discovery call

---

## Strategic Rationale

Revenue teams don't want another dashboard. The mid-market companies use60 is targeting (300–800 employees) have established CRM workflows and Slack-based communication patterns. Adoption depends on reducing friction to zero.

@60 solves this by making the copilot invisible infrastructure. The rep stays in HubSpot, stays in Slack, and @60 handles everything behind the scenes — follow-ups, enrichment, campaign management, meeting prep, content generation. The value compounds because @60 pulls context from both use60's business intelligence AND the platform it's embedded in.

This also creates a defensible moat. Once @60 is wired into a team's HubSpot and Slack, switching costs are high — they're not just losing a tool, they're losing an embedded team member.

---

## Core Principle: One Copilot, Every Surface

@60 is not three separate products. It is a single copilot with a unified skill set, unified context, and unified memory — exposed through multiple surfaces.

```
                    ┌─────────────────────┐
                    │   use60 Copilot     │
                    │   Engine            │
                    │                     │
                    │  • All skills       │
                    │  • All sequences    │
                    │  • Business context │
                    │  • Tone of voice    │
                    │  • Meeting history  │
                    │  • CRM data         │
                    └──────┬──────────────┘
                           │
              ┌────────────┼────────────┐
              │            │            │
         ┌────▼───┐  ┌────▼───┐  ┌────▼────┐
         │HubSpot │  │ Slack  │  │ use60   │
         │Surface │  │Surface │  │Platform │
         └────────┘  └────────┘  └─────────┘
```

A command sent from HubSpot has access to the same skills as one sent from Slack. The difference is the ambient context each surface provides automatically.

---

## Surface 1: HubSpot

### How It Appears

**@60 Command Input** — a persistent input field embedded via HubSpot UI Extensions (React-based custom cards) in the contact, deal, and company record sidebars. The rep types a natural language command and @60 executes it.

**Quick Action Buttons** — the most common actions surfaced as one-click buttons on the record. These are pre-filled @60 commands that skip typing:
- "Write follow-up"
- "Add to campaign"
- "Enrich contact"
- "Summarise deal history"
- "Prep for meeting"

**Results Card** — a CRM Extension Card that displays @60's output directly in the sidebar. Follow-up drafts, enrichment data, campaign confirmations, meeting summaries — all rendered inline without leaving HubSpot.

### Ambient Context (Auto-Pulled)

When @60 is invoked from a HubSpot record, it automatically has:

| From HubSpot | From use60 |
|---|---|
| Contact name, title, company | Business context (ICP, value prop) |
| Deal stage and pipeline | Tone of voice profile |
| Email thread history | Email sign-off (per user) |
| Meeting transcripts (via integration) | Skill library |
| Last activity date and type | Sequence templates |
| Associated contacts and companies | Enrichment data from previous runs |
| Notes and tasks | Campaign history |

This dual-context is the key advantage. When a rep says "@60 write a follow up based on our last meeting", the copilot pulls the meeting transcript from HubSpot AND applies the tone of voice and business context from use60. The output is immediately better than anything a generic AI tool could produce.

### Technical Implementation

- **HubSpot Public App** with UI Extensions (app cards using React)
- **CRM Extension Cards** for displaying results
- **HubSpot Workflow Actions** for automated triggers (e.g. deal stage change → @60 generates follow-up)
- **HubSpot API** for reading CRM context and writing back (logging activities, updating properties, creating tasks)
- Commands route to the use60 copilot API with HubSpot record context attached as metadata

---

## Surface 2: Slack

### How It Appears

**@60 Mention in Any Channel** — the rep @mentions the use60 bot in any channel or DM. The copilot responds in-thread to keep channels clean.

**Slash Command** — `/60 [command]` as an alternative input method for quick actions.

**Proactive Notifications** — @60 doesn't just respond to commands. It proactively surfaces insights and reminders in a dedicated channel or DM:
- "You had a call with Sarah at Acme yesterday. Want me to draft the follow-up?"
- "3 prospects in your Bristol campaign haven't been contacted in 7 days."
- "New enrichment data available for the AI Round Table campaign — 12 new email addresses found."

**Interactive Messages** — Slack Block Kit messages with buttons for quick approvals and actions. When @60 drafts a follow-up, the rep sees the email with "Send", "Edit", and "Discard" buttons inline.

### Ambient Context (Auto-Pulled)

When @60 is invoked from Slack, it has:

| From Slack | From use60 |
|---|---|
| Channel context (which deal/client channel) | Full business context |
| Thread context (what's being discussed) | CRM data (via HubSpot sync) |
| User identity (which rep is asking) | Meeting transcripts |
| Shared files and links in thread | Skill and sequence library |

### Key Slack Workflows

**Post-meeting follow-up:**
```
Rep: @60 can you write a follow up based on our last meeting with Acme?
@60: [Drafts email using meeting transcript + tone of voice + deal context]
     [Presents with Send / Edit / Discard buttons]
Rep: [Clicks Send]
@60: ✓ Follow-up sent via Instantly. Logged to HubSpot deal record.
```

**Campaign management:**
```
Rep: @60 add James from TechCorp to the AI Round Table campaign
@60: ✓ James Chen (CTO, TechCorp) added to AI Round Table campaign.
     Personalised intro generated. Email queued for Monday 9am.
     [View in use60] [Edit email] [Remove from campaign]
```

**Quick enrichment:**
```
Rep: @60 what do we know about this company? https://techcorp.io
@60: [Returns enriched company profile + matching contacts in Apollo]
     [Buttons: Add to CRM | Find decision makers | Start sequence]
```

### Technical Implementation

- **Slack App** with Bot Token (already in development)
- **Event Subscriptions** for @mentions and slash commands
- **Block Kit** for interactive message formatting
- **Proactive messaging** via scheduled checks against CRM state and campaign status
- Commands route to the same copilot API as HubSpot, with Slack thread context attached

---

## Surface 3: use60 Platform

The native use60 interface remains the power-user surface for complex workflows — the natural language table builder, campaign management, full Ops table, analytics, and configuration.

The @60 command input is also available here as the primary interaction method, consistent across all surfaces.

When a rep triggers something from HubSpot or Slack that requires deeper interaction (reviewing a full table, editing multiple campaign emails, configuring a complex sequence), @60 provides a deep link: "View full campaign in use60 →"

---

## Unified Behaviour Across Surfaces

### Same Skills Everywhere

Every skill available in use60 is available from every surface:
- Apollo search and enrichment
- Instantly campaign creation and management
- AI personalisation enrichment
- Email and sequence generation
- Meeting summarisation and follow-up
- Contact and deal intelligence
- Natural language table building (results viewable via deep link from Slack/HubSpot)

### Same Context Everywhere

The copilot maintains a unified context layer. An enrichment run triggered from Slack is visible in HubSpot and use60. A follow-up drafted in HubSpot appears in the Slack notification. Nothing is siloed.

### Adaptive Output

@60 adapts its response format to the surface:

| Surface | Output style |
|---|---|
| HubSpot | CRM cards, inline results, activity logging |
| Slack | Block Kit messages, threaded replies, interactive buttons |
| use60 | Full tables, rich UI, detailed views |

The same action (e.g. "write a follow-up") produces the same content but rendered appropriately for where the rep is working.

---

## Background Operations

@60 runs continuously, not just when invoked. Background operations include:

**Monitoring:** Watching for deal stage changes, overdue follow-ups, stale prospects, and campaign performance anomalies.

**Proactive suggestions:** Surfacing recommendations in Slack or as HubSpot tasks — "This deal hasn't had activity in 5 days", "Your meeting with Acme is tomorrow — here's a prep summary."

**Automated sequences:** When configured, executing follow-up sequences automatically based on triggers (post-meeting, deal stage change, time-based).

**Enrichment refresh:** Periodically re-enriching prospect data to keep profiles current.

The rep doesn't need to ask. @60 is always working in the background and surfaces what matters at the right time in the right place.

---

## Approval & Safety

All actions that send external communications (emails, campaign launches) require explicit rep approval, regardless of surface. @60 never sends on behalf of a rep without confirmation.

Approval flows are adapted to the surface:
- **HubSpot:** Approve/edit buttons in the results card
- **Slack:** Interactive Block Kit buttons in-thread
- **use60:** Review table with approve/edit per row or bulk approve

Internal actions (enrichment, CRM updates, note creation, meeting summaries) execute automatically unless the user's preferences specify otherwise.

---

## Rollout Sequence

| Phase | Surface | Scope |
|---|---|---|
| Phase 1 | Slack | @60 commands, proactive notifications, interactive follow-up drafts |
| Phase 2 | HubSpot | Sidebar command input, quick action buttons, results cards |
| Phase 3 | Deep integration | HubSpot workflow triggers, background monitoring, cross-surface sync |
| Future | Gmail / LinkedIn | Chrome extension bringing @60 to email and LinkedIn Sales Navigator |

Slack first because the integration is already in progress and the interaction pattern (@ mention a bot) is already familiar to every team.

---

## Open Questions

1. **Rate limiting across surfaces** — If a rep triggers the same action from both Slack and HubSpot simultaneously, how do we deduplicate?
2. **Notification preferences** — Should reps choose where @60's proactive suggestions appear (Slack only, HubSpot only, both)?
3. **Team visibility** — When one rep asks @60 to add a prospect to a campaign, should the deal owner be notified if they're a different person?
4. **Offline execution** — If @60 completes a background task outside working hours, when does it notify the rep?
5. **Permission scoping** — Should different team members have different @60 capabilities based on their role (e.g. SDRs can enrich and add to campaigns, but only AEs can send proposals)?
6. **Chrome extension** — Should we plan the @60 architecture to support a browser extension from day one, enabling Gmail and LinkedIn as future surfaces without a rebuild?

---

## Success Metrics

- Percentage of rep actions initiated from embedded surfaces (Slack/HubSpot) vs. use60 platform directly
- Time from meeting to follow-up sent (target: under 10 minutes with @60 vs. hours/days without)
- @60 commands per rep per day (adoption signal)
- Proactive suggestion acceptance rate (are background recommendations useful?)
- Rep-reported time saved per week
- Campaign creation time from @60 vs. manual setup