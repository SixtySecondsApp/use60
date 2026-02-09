# Phase 2: @60 in HubSpot — Embedded Copilot on Existing Stack

**Product:** use60
**Date:** 7 February 2026
**Author:** Andrew Bryce
**Status:** Draft
**Depends on:** Phase 1 (Slack) — webhook handler, smart briefing engine, copilot command routing

---

## The Problem

Reps live in HubSpot. They check deal records, update contacts, review email threads, prep for meetings — all inside HubSpot. Right now, when @60 has intelligence to share (meeting summaries, follow-up drafts, deal risk alerts), it can only reach the rep in Slack or use60. The rep has to context-switch to get the value.

Phase 2 brings @60 directly into HubSpot so reps never leave their CRM to get AI-powered intelligence and take action on it.

---

## What We're Not Doing

We're not introducing new infrastructure. Everything in this brief runs on what we already have:

- **Supabase** — Database, Edge Functions (150s timeout), auth, realtime
- **Vercel** — Frontend deployment, API routes (Pro plan, 60s timeout)
- **Existing HubSpot integration** — OAuth connection, bidirectional sync, webhook processing, entity mapping, sync queue
- **Existing copilot engine** — Skills, sequences, business context, tone of voice
- **Phase 1 webhook handler** — Action routing, state management, audit logging (deployed to Supabase Edge Functions, not Cloudflare)

The HubSpot-specific additions are a HubSpot Public App with UI Extensions that call our existing Supabase Edge Functions as the backend.

---

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     HubSpot CRM Record                      │
│                                                             │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────┐  │
│  │ @60 Command  │  │ Quick Action │  │ Results Card     │  │
│  │ Input Card   │  │ Buttons Card │  │ (CRM Extension)  │  │
│  └──────┬───────┘  └──────┬───────┘  └──────────────────┘  │
│         │                  │                    ▲            │
└─────────┼──────────────────┼────────────────────┼───────────┘
          │                  │                    │
          ▼                  ▼                    │
┌─────────────────────────────────────────────────┼───────────┐
│  Supabase Edge Functions                        │           │
│                                                 │           │
│  ┌──────────────────┐  ┌───────────────────┐    │           │
│  │ /hubspot/command  │  │ /hubspot/action   │    │           │
│  │ (parse + route)   │  │ (button handler)  │────┘           │
│  └────────┬─────────┘  └───────┬───────────┘               │
│           │                     │                            │
│           ▼                     ▼                            │
│  ┌──────────────────────────────────────────┐               │
│  │          Copilot Engine                   │               │
│  │  (same engine as Slack + use60 platform)  │               │
│  │                                           │               │
│  │  Skills • Sequences • Business Context    │               │
│  └──────────────────────────────────────────┘               │
│           │                                                  │
│  ┌────────▼─────────┐  ┌───────────────────┐               │
│  │ Supabase DB      │  │ External APIs     │               │
│  │ (state, queue,   │  │ (HubSpot, Apollo, │               │
│  │  audit, context) │  │  Instantly, etc.) │               │
│  └──────────────────┘  └───────────────────┘               │
└─────────────────────────────────────────────────────────────┘
```

**Key point:** The HubSpot UI Extensions are just a rendering surface. All logic runs in Supabase Edge Functions, calling the same copilot engine that powers Slack and the use60 platform. We're adding a new front door, not a new house.

---

## HubSpot Public App Setup

### App Type

**Public App** registered in HubSpot's developer portal. This is required for UI Extensions and CRM cards. The app uses the existing OAuth connection we've already built for the HubSpot CRM sync — we're extending it with additional scopes, not creating a second connection.

### Additional OAuth Scopes Required

On top of the existing sync scopes, the embedded UI needs:

| Scope | Purpose |
|---|---|
| `crm.objects.contacts.read` | Pull contact context into @60 commands (already have) |
| `crm.objects.deals.read` | Pull deal context (already have) |
| `crm.objects.contacts.write` | Write back enrichment data, notes (already have) |
| `crm.objects.deals.write` | Update deal properties from actions (already have) |
| `timeline` | Post timeline events from @60 actions |
| `crm.extensions.cards.read` | Required for CRM Extension Cards |

Most scopes are already authorised through the existing integration. The `timeline` and `crm.extensions.cards.read` scopes need adding to the OAuth flow — users will see an updated permissions prompt next time they reconnect.

### App Components

The HubSpot Public App contains three components, all rendering within the CRM record sidebar:

---

## Component 1: @60 Command Input Card

**What it is:** A persistent UI Extension card embedded in contact, deal, and company record sidebars. Contains a text input where the rep types natural language commands.

**Built with:** HubSpot's App Cards framework (React components hosted on our Vercel deployment, rendered inside HubSpot via iframe).

**How it works:**

1. Rep types a command: `write a follow-up based on our last meeting`
2. Card sends POST to our Supabase Edge Function: `/hubspot/command`
3. Edge Function receives the command + HubSpot context (record ID, record type, user ID)
4. Edge Function enriches context by pulling:
   - From Supabase: business context, tone of voice, meeting history, previous @60 interactions
   - From HubSpot API: full contact/deal record, recent activities, email threads, associated records
5. Passes enriched command to copilot engine
6. Copilot executes the relevant skill/sequence
7. Result returned to the card and rendered in the Results Card (Component 3)

**UI state management:** The card shows a loading state while the copilot processes ("@60 is working on that...") with a subtle animation. Commands are stored in Supabase so the rep can see recent @60 interactions for this record.

**Vercel hosting:** The React app card is deployed as a static build on Vercel at a dedicated route (`/hubspot/cards/command`). HubSpot loads it via the app card iframe URL registered in the developer portal.

---

## Component 2: Quick Action Buttons Card

**What it is:** A CRM Extension Card showing the most common @60 actions as one-click buttons, contextualised to the record type.

**Built with:** CRM Extension Cards (server-side, no iframe needed — HubSpot fetches card data from our API and renders natively).

**Card data endpoint:** Supabase Edge Function at `/hubspot/cards/actions`

HubSpot calls this endpoint every time a record is loaded, passing the record ID. Our Edge Function returns the appropriate buttons based on:

| Record type | Buttons shown |
|---|---|
| Contact | "Write follow-up", "Enrich contact", "Add to campaign", "Prep for meeting" |
| Deal | "Write follow-up", "Summarise deal", "Draft proposal", "What should I do next?" |
| Company | "Find decision makers", "Company intel", "Add contacts to campaign" |

**Contextual intelligence:** Buttons adapt based on state. If there's a recent meeting with no follow-up sent, "Write follow-up" gets a red indicator. If the deal has been idle for 5+ days, "What should I do next?" gets surfaced prominently.

**Button actions:** Each button triggers a POST to `/hubspot/action` (Supabase Edge Function) with the action type and record context. This routes through the same action handler built in Phase 1 for Slack, adapted for HubSpot's response format.

---

## Component 3: Results Card

**What it is:** A UI Extension card that displays @60's output — follow-up drafts, enrichment data, meeting summaries, deal intelligence, campaign confirmations.

**Built with:** HubSpot App Cards (React on Vercel, iframe).

**How results are delivered:**

For fast operations (enrichment lookup, deal summary): the result renders directly in the card after the Edge Function responds.

For slower operations (email generation with enrichment, campaign creation): the card shows a progress state, and the result is pushed via Supabase Realtime. The card subscribes to a Supabase channel scoped to `hubspot:{record_id}:{user_id}` and updates when the copilot completes.

**Result types and their rendering:**

| Result type | How it renders |
|---|---|
| Email draft | Subject, body preview, tone indicator. Buttons: "Send via Instantly", "Copy to clipboard", "Edit", "Discard" |
| Meeting summary | Key takeaways, action items, attendees. Buttons: "Create HubSpot tasks", "Draft follow-up", "Log to timeline" |
| Contact enrichment | Updated fields highlighted. Buttons: "Save to HubSpot", "Add to campaign", "Dismiss" |
| Deal intelligence | Risk signals, suggested next steps, pipeline context. Buttons: "Act on suggestion", "Snooze", "Dismiss" |
| Campaign confirmation | Contact added, personalised intro preview, send schedule. Buttons: "View campaign", "Edit email", "Remove" |

**Approval flow:** Same HITL pattern as Slack. The rep sees the output, can approve/edit/dismiss. "Send via Instantly" requires explicit click — @60 never sends without confirmation.

---

## Backend: Supabase Edge Functions

All new endpoints follow the existing Edge Function patterns in the codebase.

### New Edge Functions

```
supabase/functions/
├── hubspot-command/        # Receives @60 commands from the input card
│   └── index.ts
├── hubspot-action/         # Handles button clicks from quick actions + results card
│   └── index.ts
├── hubspot-card-actions/   # CRM Extension Card data endpoint (returns button config)
│   └── index.ts
└── hubspot-card-results/   # Serves latest @60 results for a record
    └── index.ts
```

### hubspot-command (core flow)

```
POST /hubspot-command
Body: {
  command: "write a follow-up based on our last meeting",
  hubspot_record_id: "12345",
  hubspot_record_type: "contact",
  hubspot_user_id: "user_abc",
  org_id: "org_xyz"
}

Flow:
1. Validate request + auth (check org has active HubSpot connection)
2. Pull HubSpot record context via existing HubSpot API client
3. Pull use60 context from Supabase (business context, tone, meetings)
4. Merge contexts into copilot prompt
5. Route to copilot engine (same as Slack command handler)
6. For fast results: return directly
7. For slow results: write to Supabase `hubspot_results` table,
   Realtime subscription notifies the card
```

### hubspot-action (button handler)

```
POST /hubspot-action
Body: {
  action: "send_email",
  resource_type: "email_draft",
  resource_id: "draft_abc123",
  hubspot_record_id: "12345",
  org_id: "org_xyz"
}

Flow:
1. Validate request
2. Look up pending action in Supabase (same state table as Phase 1)
3. Execute action (send via Instantly, create HubSpot task, log timeline event)
4. Update action status to "approved"
5. Return confirmation for card to render
6. Log to audit trail
```

### hubspot-card-actions (CRM Extension Card)

```
GET /hubspot-card-actions?record_id=12345&record_type=contact&org_id=org_xyz

Flow:
1. Check record type → return appropriate button set
2. Check record state (recent meeting? idle deal? missing enrichment?)
3. Add urgency indicators to relevant buttons
4. Return HubSpot CRM Card JSON format
```

This endpoint follows HubSpot's CRM Extension Card spec — it returns a JSON payload that HubSpot renders natively, no iframe needed.

---

## Database Additions

New tables in Supabase, following existing schema patterns:

```sql
-- @60 command history per HubSpot record
create table hubspot_copilot_commands (
  id uuid primary key default gen_random_uuid(),
  org_id uuid references organizations(id),
  user_id uuid references users(id),
  hubspot_record_id text not null,
  hubspot_record_type text not null, -- 'contact', 'deal', 'company'
  command_text text not null,
  status text not null default 'processing', -- 'processing', 'completed', 'failed'
  result jsonb,
  created_at timestamptz default now(),
  completed_at timestamptz
);

-- @60 results awaiting action (extends Phase 1 pattern)
create table hubspot_pending_actions (
  id uuid primary key default gen_random_uuid(),
  org_id uuid references organizations(id),
  user_id uuid references users(id),
  hubspot_record_id text not null,
  resource_type text not null, -- 'email_draft', 'enrichment', 'task_list'
  resource_id text not null,
  content jsonb not null,
  status text not null default 'pending',
  actioned_at timestamptz,
  expires_at timestamptz default now() + interval '24 hours',
  created_at timestamptz default now()
);

-- Enable Realtime for live card updates
alter publication supabase_realtime add table hubspot_copilot_commands;
alter publication supabase_realtime add table hubspot_pending_actions;
```

These tables mirror the Phase 1 Slack state management pattern. The same copilot engine writes results here, and the HubSpot cards read from here via Supabase Realtime subscriptions.

---

## Frontend: Vercel Deployment

### App Card React Components

The HubSpot App Cards are React components deployed on Vercel. They run inside HubSpot's iframe and communicate with our Supabase backend.

```
src/
├── hubspot/
│   ├── cards/
│   │   ├── CommandInput.tsx      # @60 text input + command history
│   │   ├── ResultsPanel.tsx      # Displays copilot output with action buttons
│   │   └── shared/
│   │       ├── ActionButtons.tsx  # Approve / Edit / Dismiss button group
│   │       ├── LoadingState.tsx   # "Working on it..." animation
│   │       └── ErrorState.tsx     # Graceful failure UI
│   ├── hooks/
│   │   ├── useHubSpotContext.ts   # Reads record context from HubSpot SDK
│   │   ├── useRealtimeResult.ts   # Supabase Realtime subscription for results
│   │   └── useCopilotCommand.ts   # Submit command, track state
│   └── utils/
│       ├── hubspot-sdk.ts         # HubSpot App Cards SDK wrapper
│       └── api.ts                 # Calls to Supabase Edge Functions
```

**HubSpot App Cards SDK:** HubSpot provides a client SDK for App Cards that gives access to the current record context (record ID, type, properties) and allows opening modals, navigating to records, etc. Our React components use this to pass context to Edge Functions without additional API calls.

**Supabase Realtime in the card:** The ResultsPanel subscribes to the `hubspot_copilot_commands` table filtered by `hubspot_record_id` and `user_id`. When the Edge Function completes a command and writes the result, the card updates instantly.

**Deployment:** These components are part of the existing Vercel project, deployed at `/hubspot/cards/*` routes. HubSpot's app configuration points to these URLs for card rendering.

---

## Proactive Intelligence (Background Push)

Phase 1 builds the proactive engine for Slack (deal risk alerts, post-meeting follow-ups, campaign updates). Phase 2 extends this to HubSpot by writing @60 intelligence directly to the CRM record.

### HubSpot Timeline Events

When @60 generates proactive intelligence, it creates a HubSpot Timeline Event on the relevant record. This appears in the contact/deal activity feed alongside emails, calls, and notes.

**Timeline event types:**

| Event | What it posts | Trigger |
|---|---|---|
| Meeting processed | Summary, action items, follow-up status | MeetingBaaS webhook |
| Follow-up sent | Email content, send time, campaign name | Rep approves in Slack or HubSpot |
| Deal risk detected | Risk reason, suggested action, days idle | Background monitoring |
| Contact enriched | New data found, enrichment source | Enrichment skill completion |
| Campaign activity | Added to campaign, email opened, reply received | Instantly webhook |

**Implementation:** A new Supabase Edge Function (`hubspot-timeline-event`) receives events from the copilot engine and creates Timeline Events via the HubSpot API. This uses the existing HubSpot API client with the `timeline` scope.

### CRM Extension Card: Proactive Section

The Results Card also shows a "Suggested by @60" section at the top when there are proactive recommendations for the current record. These are populated from the same background monitoring that powers Slack alerts.

Example: Rep opens a deal record. The Results Card shows:
> **⚠️ @60 noticed:** No activity on this deal for 6 days. Last meeting was a positive demo with Sarah Chen. Suggested: send a follow-up referencing the ROI discussion.
> [Draft follow-up] [Snooze 3 days] [Dismiss]

This is pulled from Supabase where the background engine has already flagged the deal — the card just reads and renders it.

---

## Cross-Surface Sync

Actions taken in HubSpot are reflected in Slack and vice versa.

| Action in HubSpot | What happens in Slack |
|---|---|
| Rep approves a follow-up | Slack notification: "✓ Follow-up for Acme sent from HubSpot" |
| Rep dismisses a suggestion | Slack alert for same suggestion is removed/updated |
| Rep adds contact to campaign | Slack confirms: "Sarah Chen added to AI Round Table from HubSpot" |

| Action in Slack | What happens in HubSpot |
|---|---|
| Rep approves a follow-up | Timeline event posted, Results Card updates |
| Rep uses @60 command | Command + result appear in HubSpot command history |
| Proactive alert acted on | HubSpot deal/contact record updated accordingly |

**How:** Both surfaces write to the same Supabase tables. The Phase 1 Slack handler and the Phase 2 HubSpot handler share the same state. When one updates a record, the other surface picks it up via Realtime (HubSpot card) or the next Slack message update.

---

## Build Sequence

### Sprint 1 (Weeks 1–2): HubSpot Public App + CRM Extension Card

**Goal:** Get @60 visible inside HubSpot with contextual quick action buttons.

| Task | Detail |
|---|---|
| Register HubSpot Public App | Developer portal, OAuth scope extension, app card URLs |
| CRM Extension Card endpoint | Supabase Edge Function returning button config per record type |
| Contextual button logic | Check record state (recent meeting, idle deal, missing data) to prioritise buttons |
| Button → Edge Function routing | Each button triggers POST to `/hubspot-action`, reusing Phase 1 action handler pattern |
| OAuth scope upgrade | Add `timeline` + `crm.extensions.cards.read`, handle re-auth prompt for existing connections |
| Test with existing HubSpot connections | Verify card appears on contact/deal/company records |

**Definition of done:** Open a contact in HubSpot, see @60 quick action buttons in the sidebar, click "Enrich contact", and see the enrichment result appear (even if in a basic format).

---

### Sprint 2 (Weeks 3–4): Command Input + Results Card

**Goal:** Reps can type natural language commands and see rich results inside HubSpot.

| Task | Detail |
|---|---|
| Command Input App Card | React component deployed on Vercel, text input + command history |
| Results Panel App Card | React component showing copilot output with approve/edit/dismiss |
| HubSpot SDK integration | Read record context (ID, type, properties) from SDK, pass to Edge Functions |
| `/hubspot-command` Edge Function | Receive command, enrich with CRM + use60 context, route to copilot |
| Supabase Realtime subscription | Results Card subscribes to command completion events |
| Result type renderers | Email drafts, enrichment data, deal summaries, meeting summaries |
| Loading + error states | "Working on it..." animation, graceful failure with retry |

**Definition of done:** Rep types "@60 write a follow-up based on our last meeting" in the command input, copilot generates a tone-matched draft using meeting transcript + business context, draft appears in the Results Card with Send/Edit/Dismiss buttons that actually work.

---

### Sprint 3 (Weeks 5–6): Proactive Intelligence + Timeline Events

**Goal:** @60 pushes intelligence to HubSpot records automatically and posts activity to the timeline.

| Task | Detail |
|---|---|
| Timeline Event Edge Function | Creates HubSpot Timeline Events for @60 actions (meetings processed, follow-ups sent, enrichments) |
| Timeline event type registration | Register custom event types in HubSpot developer portal |
| Proactive suggestions in Results Card | "Suggested by @60" section reading from background monitoring data |
| Background flags for HubSpot records | Extend Phase 1 monitoring to write deal/contact flags to Supabase |
| Suggestion action buttons | Draft follow-up, snooze, dismiss — wired to existing action handler |

**Definition of done:** A meeting finishes, MeetingBaaS processes it, and within 5 minutes the HubSpot contact record shows a Timeline Event with the meeting summary, plus the Results Card shows a follow-up draft ready to send.

---

### Sprint 4 (Weeks 7–8): Cross-Surface Sync + Polish

**Goal:** Actions in Slack and HubSpot are fully synchronised. Polish the UX.

| Task | Detail |
|---|---|
| Cross-surface state sync | Slack actions update HubSpot cards, HubSpot actions update Slack messages |
| Deduplication | If rep acts in Slack, don't show the same prompt in HubSpot (and vice versa) |
| Command history | Show recent @60 interactions for this record, persisted in Supabase |
| Notification preferences | Per-user: which surface gets proactive alerts (Slack, HubSpot, or both) |
| Edit modal | "Edit" button opens a modal with editable fields (HubSpot App Card modal) for email drafts |
| Performance optimisation | Cache HubSpot record context, debounce Realtime subscriptions |
| Error recovery | Retry failed commands, surface errors clearly in both surfaces |

**Definition of done:** Rep approves a follow-up in Slack → HubSpot timeline shows "Follow-up sent" → Results Card updates to show completion. Rep dismisses a suggestion in HubSpot → Slack alert for the same suggestion is updated. Zero duplicate prompts across surfaces.

---

## Data Dependencies

| Sprint | What's needed | Source | Status |
|---|---|---|---|
| 1 | HubSpot developer account + app registration | HubSpot | Need to register |
| 1 | Existing HubSpot OAuth connection | Supabase | Built |
| 1 | Existing HubSpot API client | Codebase | Built |
| 2 | Copilot engine accessible from Edge Functions | Supabase | Built (same as Slack) |
| 2 | Meeting transcripts linked to HubSpot contacts | MeetingBaaS + Supabase | Built |
| 3 | Background monitoring engine (deal risk, idle contacts) | Phase 1 Sprint 3 | Depends on Phase 1 |
| 4 | Phase 1 Slack state management tables | Supabase | Built in Phase 1 |

---

## HubSpot App Review

HubSpot requires app review before a Public App can be installed by other HubSpot portals. For Phase 2, we can start with a **private app** installed only on our own portal and early beta users. App marketplace listing comes later when we're ready for broader distribution.

**Private app advantages:**
- No review process, immediate deployment
- Can iterate fast without approval cycles
- Install via direct link, not marketplace

**Marketplace listing (future):**
- Required for public distribution
- Needs security review, documentation, support process
- Plan for this after Phase 2 is stable with 5–10 beta users

---

## Success Metrics

| Metric | What it measures | Target |
|---|---|---|
| Card load time | Is the @60 card fast enough to not annoy reps? | <2 seconds |
| Commands per rep per day (HubSpot) | Are reps using the command input? | 2+ per active rep |
| Quick action click rate | Are contextual buttons being used? | >30% of record views get at least one click |
| Cross-surface action rate | Are reps acting from both Slack and HubSpot? | >25% of actions from HubSpot |
| Timeline events created per week | Is @60 activity visible in HubSpot? | 20+ per active rep |
| Follow-up time (HubSpot initiated) | How fast are follow-ups from within HubSpot? | <10 mins |
| Proactive suggestion action rate | Are background recommendations useful? | >40% acted on (not dismissed) |

---

## What This Enables

After Phase 2, a rep's HubSpot experience looks like this:

They open a deal record. The sidebar shows @60 quick actions — "Write follow-up" has a red indicator because yesterday's meeting hasn't been followed up. They click it. Within seconds, a draft appears in the Results Card, written in their tone of voice, referencing specific points from the meeting. They click "Send via Instantly" and it's done. A Timeline Event logs the action. Their Slack gets a confirmation. The deal record is updated.

They didn't open use60. They didn't switch tabs. They didn't write a word. @60 did the work, they made the decision.

That's the product.