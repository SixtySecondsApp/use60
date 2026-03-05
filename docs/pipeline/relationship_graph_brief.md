# PRD-RG-001: Relationship Graph

**AI-Powered Connection Radar for Sales Intelligence**

| Field | Value |
|---|---|
| Document ID | PRD-RG-001 |
| Version | 1.1 |
| Status | Draft — Decisions Locked |
| Author | Andrew / 60 Engineering |
| Date | March 2026 |
| Sprint Target | Phase 1: 12 days · Phase 2: 8 days · Phase 3: 7 days |
| Dependencies | V2 Architecture, Command Centre, Autopilot Engine, Credit Governance |
| Design Reference | `docs/pipeline/relationship_graph_SVG.jsx` (SVG + D3 prototype) |
| Priority | P1 — Core differentiator and primary visual interface |

> **60 Philosophy:** The Relationship Graph is not a visualisation — it is a command surface. Every node is actionable. Every signal is a prompt. The AI sees what the rep misses, and the graph makes the invisible visible. If a contact is drifting cold, 60 does not wait for the rep to notice. It acts.

---

## 1. Executive Summary

The Relationship Graph transforms how sales reps understand their pipeline and network. Instead of flat CRM lists, contacts exist in a spatial solar system where proximity to the centre represents relationship warmth. AI scores every interaction, every signal, and every piece of context to compute a warmth score. The rep sees their world at a glance — who is hot, who is drifting, and where to focus next.

**The graph lives as a third view tab on the Pipeline page**, alongside the existing Kanban (Board) and Table views. Reps toggle between Board / Table / Graph from the same `PipelineHeader` view switcher. This keeps the graph tightly integrated with pipeline context — filters, search, and metrics carry across all three views.

**The graph shows the rep's full network** — every contact with at least one interaction, not just contacts linked to active deals. Deal-linked contacts show deal arcs and health indicators; non-deal contacts are positioned purely by warmth. This makes the graph a combined pipeline + network view.

**The centre is switchable.** Default mode is "My Network" (rep at centre, all contacts orbiting by warmth). An alternative "Deal View" mode places a selected deal at the centre with its stakeholders orbiting. This dual-centre model lets reps switch between "how is my network?" and "who matters for this deal?"

This is a full interactive command surface: click to inspect, trigger agents (draft follow-ups, re-engage, meeting prep, enrich) directly from contact nodes, drag to explore, and filter by tier, company, or deal. Agent actions are a Phase 1 must-have — the graph is a command surface, not a dashboard. All actions flow through the Command Centre pipeline and respect autonomy policies.

> **Why This Matters:** 60 already has the data (CRM, meetings, transcripts, signals) and the agents (fleet of 8, skills system, copilot). What is missing is the visual command layer that makes it all intuitive. The Relationship Graph is the connective tissue between data and action.

---

## 1.1 Design Decisions (v1.1)

Decisions locked during requirements discovery. These override any conflicting details in subsequent sections.

| # | Decision | Choice | Rationale |
|---|----------|--------|-----------|
| D1 | **UI placement** | Third view tab on Pipeline page (Board / Table / Graph) | Keeps graph integrated with pipeline context — filters, search, metrics shared across views |
| D2 | **Graph centre** | Switchable — "My Network" (rep at centre) + "Deal View" (deal at centre) | Supports both "how is my network?" and "who matters for this deal?" workflows |
| D3 | **Warmth model** | Full 5-signal model from Phase 1 (recency, engagement, deal momentum, multi-threading, sentiment) | The scoring model is the core differentiator — shipping a simplified version undermines the value proposition |
| D4 | **Detail panel** | Dedicated 370px graph panel with warmth breakdown, timeline, and agent actions | Contact-centric context differs from the existing deal-centric `DealIntelligenceSheet` |
| D5 | **Deal visualisation** | Arc connections between contacts on the same deal, coloured by deal health | Surfaces multi-threading and deal relationships without adding visual clutter of separate deal nodes |
| D6 | **Contact scope** | All contacts — full network, not just deal-linked | The graph is a combined pipeline + network view. Non-deal contacts positioned by warmth alone |
| D7 | **Rendering engine** | SVG + D3 (reference: `relationship_graph_SVG.jsx`) | Faster iteration, native DOM events, CSS transitions, React-friendly. Canvas upgrade path in Phase 3 if needed |
| D8 | **Agent actions** | Phase 1 must-have — all 5 actions (draft, prep, re-engage, task, enrich) | The graph is a command surface, not a dashboard. "See it, act on it" is the core loop |
| D9 | **Company clustering** | Toggle — default individual contacts, optional "group by company" | Gives reps both views: full network overview and account penetration analysis |
| D10 | **Mobile** | Warmth-sorted contact list on mobile (< 768px) | Same data, readable format. Graph is a desktop power-user tool; mobile gets a functional equivalent |

---

## 2. Objectives and Success Metrics

### 2.1 Primary Objectives

1. **Make pipeline health instantly visible.** Reps should understand their relationship landscape in under 5 seconds.
2. **Reduce time-to-action.** From seeing a cold contact to triggering re-engagement should be 2 clicks maximum.
3. **Surface what CRM lists hide.** Multi-threading gaps, fading relationships, and deal risks become obvious through spatial positioning.
4. **Drive agent adoption.** The graph is the most intuitive way to trigger fleet actions, building the approval → confidence → autonomy loop.

### 2.2 Success Metrics

| Metric | Target | Measurement |
|---|---|---|
| Time to first agent trigger from graph | < 30 seconds | Analytics event tracking |
| Daily active users viewing graph | > 60% of active users | Page view tracking |
| Agent actions triggered from graph per user per week | > 5 actions | Command Centre attribution |
| Reduction in contacts going cold without action | 30% fewer after 30 days | Warmth score decay analysis |
| User-reported pipeline visibility improvement | > 4.2/5 satisfaction | In-app survey at Day 14 |
| Average session time on graph page | > 90 seconds | Session duration tracking |

---

## 3. User Stories

| ID | Story | Priority |
|---|---|---|
| US-01 | As a rep, I want to see all my contacts (with or without deals) positioned by warmth so I can instantly identify who needs attention across my full network. | P0 |
| US-02 | As a rep, I want to click a contact and see their full context (timeline, deal, signals, scoring breakdown) without leaving the graph. | P0 |
| US-03 | As a rep, I want to trigger agent actions (draft email, re-engage, enrich) directly from a contact node so I can act immediately. | P0 |
| US-04 | As a rep, I want to see warmth trends (up/down arrows) so I know which relationships are improving or fading. | P0 |
| US-05 | As a rep, I want to filter by warmth tier, company, or deal so I can focus on specific segments. | P1 |
| US-06 | As a rep, I want an optional "group by company" toggle that clusters contacts by company so I can see account-level penetration and multi-threading. | P1 |
| US-07 | As a rep, I want to see deal health indicators on contact nodes so I can spot at-risk deals visually. | P1 |
| US-08 | As a rep, I want to search contacts from the graph and see matching nodes highlighted. | P1 |
| US-09 | As a manager, I want to view my team's combined relationship graph to identify coverage gaps. | P2 |
| US-10 | As a rep, I want the graph to suggest which contacts I should prioritise today based on AI analysis. | P2 |
| US-11 | As a rep, I want to access the graph as a tab on the Pipeline page alongside Board and Table views, so I can switch between views without losing filter context. | P0 |
| US-12 | As a rep, I want to switch the graph centre between "My Network" (me at centre) and "Deal View" (a deal at centre with its stakeholders), so I can view my world or drill into a specific deal. | P1 |
| US-13 | As a rep on mobile, I want a warmth-sorted contact list that shows the same data as the graph but in a readable list format, so I can review my network on my phone. | P2 |

---

## 4. AI Warmth Scoring Model

The warmth score is the core data model that drives spatial positioning. It is a composite 0–1 score computed from five weighted signals, recalculated on every interaction event. The model uses time-decay to ensure recency dominates — a meeting last week matters more than ten emails last quarter.

### 4.1 Signal Weights

| Signal | Weight | Source | Decay Half-Life |
|---|---|---|---|
| Recency | 0.30 | Last interaction timestamp (any type) | 7 days |
| Engagement Depth | 0.25 | Meeting count, email replies, call duration, response time | 14 days |
| Deal Momentum | 0.20 | Stage progression velocity, deal age, stall detection | 21 days |
| Multi-Threading | 0.15 | Distinct contacts engaged at same company, CC patterns, internal shares | 30 days |
| Sentiment | 0.10 | AI-inferred from email tone, transcript analysis, signal types | 30 days |

### 4.2 Score Computation

**Base formula:** `warmth = Σ(signal_i × weight_i × decay_factor_i)`

**Decay function:** `decay = pow(0.5, days_since_event / half_life)`

**Normalisation:** Scores are normalised to 0–1 range per user to ensure relative positioning makes sense regardless of absolute activity volume. A rep with 5 contacts and a rep with 500 contacts both get meaningful spatial distribution.

### 4.3 Warmth Tiers

| Tier | Score Range | Visual Treatment | Default Agent Behaviour |
|---|---|---|---|
| **Hot** | 0.70 – 1.00 | Inner orbit, large node, orange glow, comet trail if trending | Keep-warm nurture sequences, proactive prep |
| **Warm** | 0.40 – 0.69 | Mid orbit, medium node, amber tint | Scheduled follow-ups, content sharing |
| **Cool** | 0.15 – 0.39 | Outer orbit, smaller node, indigo | Re-engagement sequences, enrichment triggers |
| **Cold** | 0.00 – 0.14 | Far orbit, small node, muted slate | Cold reactivation, data enrichment, list hygiene |

### 4.4 Warmth Delta Tracking

Every score recalculation stores the previous value. The delta (current minus previous) drives visual indicators:

- **Positive delta (> +0.03):** Green up-arrow badge on node, comet trail animation, trending badge in panel
- **Negative delta (< -0.03):** Red down-arrow badge on node, flagged in morning briefing agent
- **Stable (within ±0.03):** No indicator

Contacts with sustained negative delta over 14 days trigger the re-engagement agent automatically if the contact has an active deal.

---

## 5. Entity Model and Data Architecture

### 5.1 Graph Entities

Three entity types render as nodes in the graph, with hierarchical relationships:

**Contacts (Primary Nodes):** Every contact in the CRM — with or without active deals. All contacts with at least one interaction or signal appear in the graph, making it a full network view, not just a pipeline view. Contacts are positioned radially based on warmth score. Visual size scales with warmth. Each node carries avatar, company badge, deal arc (if deal-linked), and delta indicator. Non-deal contacts appear without deal arcs but are otherwise visually identical.

**Companies (Cluster Anchors):** An optional "Group by Company" toggle activates company clustering. When enabled, contacts from the same company are grouped into gravitational clusters. The company node sits at the centroid of its contacts, sized by total deal value. This immediately surfaces multi-threading gaps — a company node with only one contact is visually obvious. Default state: individual contacts (clustering off).

**Deals (Connection Arcs):** Deals render as curved connection lines between contacts sharing the same deal. The arc colour reflects deal health (strong = green, healthy = indigo, at risk = orange, stalled = red). Arc opacity reflects deal probability. A probability progress ring appears around each deal-connected contact node.

### 5.2 Database Schema

#### `contact_warmth_scores`

Pre-computed warmth scores, recalculated on every interaction event via database trigger.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `contact_id` | uuid FK → contacts.id | Unique per contact per org |
| `org_id` | uuid FK → organizations.id | RLS: user sees own org only |
| `user_id` | uuid FK → auth.users.id | Owner of the contact |
| `warmth_score` | numeric(4,3) | 0.000 to 1.000 |
| `warmth_score_previous` | numeric(4,3) | Previous calculation value |
| `warmth_delta` | numeric(4,3) | Current minus previous |
| `tier` | text | hot · warm · cool · cold |
| `recency_score` | numeric(4,3) | Component score 0–1 |
| `engagement_score` | numeric(4,3) | Component score 0–1 |
| `deal_momentum_score` | numeric(4,3) | Component score 0–1 |
| `multi_thread_score` | numeric(4,3) | Component score 0–1 |
| `sentiment_score` | numeric(4,3) | Component score 0–1 |
| `last_interaction_at` | timestamptz | Most recent event of any type |
| `last_interaction_type` | text | email · meeting · call · signal |
| `signal_count_30d` | integer | Rolling 30-day signal count |
| `trending_direction` | text | up · down · stable |
| `calculated_at` | timestamptz | Last recalculation timestamp |
| `created_at` | timestamptz | Default now() |

#### `contact_warmth_signals`

Append-only signal log. Every interaction that affects warmth is recorded here for audit and recalculation.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `contact_id` | uuid FK | |
| `org_id` | uuid FK | RLS scoped |
| `signal_type` | text | email_sent · email_received · email_opened · meeting_held · meeting_booked · call_completed · linkedin_message · linkedin_engaged · page_view · proposal_opened · form_filled · event_attended · deal_stage_change · video_viewed |
| `signal_weight` | numeric(3,2) | Raw signal value before decay |
| `metadata` | jsonb | Source-specific data (duration, sentiment, page URL, etc.) |
| `occurred_at` | timestamptz | When the interaction happened |
| `created_at` | timestamptz | When the signal was recorded |

#### `contact_graph_positions`

Cached graph positions for fast rendering. Recalculated when warmth scores change.

| Column | Type | Notes |
|---|---|---|
| `contact_id` | uuid PK FK | |
| `org_id` | uuid FK | |
| `user_id` | uuid FK | |
| `angle` | numeric | Radial angle in radians |
| `radius` | numeric | Distance from centre (0–1) |
| `cluster_id` | uuid nullable FK | Company cluster if enabled |
| `updated_at` | timestamptz | |

### 5.3 Database Triggers and Functions

| Function | Trigger | Purpose |
|---|---|---|
| `recalculate_contact_warmth()` | AFTER INSERT on contact_warmth_signals | Recalculates warmth score for affected contact. Uses SECURITY DEFINER. Updates tier and trending_direction. |
| `recalculate_org_warmth_scores()` | Called by warmth-recalculate cron | Batch recalculation for entire org. Handles normalisation. |
| `get_contact_graph_data()` | RPC callable | Returns all contacts with warmth, company, deal, and position data for graph rendering. Single query, no N+1. |
| `get_warmth_timeline()` | RPC callable | Returns signal history for a specific contact with pagination. |

---

## 6. Visual Specification

### 6.1 Rendering Engine

**SVG + D3** for rendering and interaction. SVG was chosen over Canvas for faster iteration, native DOM events (hover, click, accessibility), CSS transitions, and easier integration with React's component model. D3 handles zoom/pan transforms and force calculations. The rendering pipeline:

**Reference implementation:** `docs/pipeline/relationship_graph_SVG.jsx`

1. **Background layer:** SVG `<rect>` fills with radial gradient nebula overlays (indigo, violet, cyan at low opacity)
2. **Orbit layer:** Concentric `<circle>` rings with dashed strokes, slow CSS `animateTransform` rotation in alternating directions, tier labels at ring edges
3. **Connection layer:** `<line>` elements from centre to each node (opacity/width proportional to warmth), `<path>` quadratic curves for deal arcs between same-deal contacts coloured by deal health
4. **Node layer:** SVG `<g>` groups per contact — main `<circle>` with radial gradient fill, company badge circle, delta indicator circle, deal probability arc `<path>`, SVG `<filter>` for glow effects
5. **Label layer:** SVG `<text>` for contact names (shown for warmth > 0.42 or hovered/selected), role + company on hover
6. **Centre node:** Pulsing "YOU" node with animated radius and glow gradient
7. **UI overlay (DOM):** Fixed-position tooltip `<div>` on hover, 370px detail panel `<div>` on select — these are HTML/React, not SVG

**Zoom/Pan:** D3 `d3.zoom()` applied to the SVG element, transforms a root `<g>` container. Scale extent: 0.3× to 4×.

**Transitions:** CSS `transition` properties on SVG elements for smooth position, opacity, and size changes (0.3s–0.6s easing). SVG `<animate>` for continuous effects (orbit rotation, centre pulse).

**Performance notes:** SVG handles up to ~200–300 nodes comfortably. For 500+ node scenarios, consider upgrading the node layer to Canvas (hybrid approach) in Phase 3. For Phase 1, SVG is sufficient for the target user base (solo founders, small teams — typically 20–100 contacts).

### 6.2 Node Visual Encoding

| Visual Property | Data Mapping | Notes |
|---|---|---|
| Radial distance from centre | 1 - warmth_score | Hot = close, Cold = far |
| Node size | 15 + (warmth × 11) pixels | Selected: +5, Hovered: +3 |
| Node colour | Tier colour with radial gradient | Gradient: light core to dark edge |
| Glow radius | Node size × 1.7 (normal) to 3.2 (selected) | Radial gradient falloff |
| Company badge | 6.5px circle at bottom-left | Company brand colour, initial letter |
| Delta indicator | 5.5px circle at top-right | Green (up) or red (down) with arrow |
| Deal probability arc | Partial ring around node | Arc length = probability, colour = deal health |
| Comet trail | 14-point position history | Orange, fading opacity, only for delta > +0.03 |
| Orbit speed | 0.10 × (1.1 - warmth × 0.55) | Hot contacts orbit slower (more stable) |

### 6.3 Interaction Model

| Interaction | Behaviour | Implementation |
|---|---|---|
| Hover | Tooltip with warmth, trend, last interaction, deal summary | Fixed-position `<div>` at cursor + 16px offset, outside SVG |
| Click | Select node, open 370px detail panel (overview tab) | React state: `setSelected(nodeId)`, render panel |
| Scroll wheel | Zoom (0.3× to 4×) | D3 `d3.zoom()` on SVG root, transforms `<g>` container |
| Click + drag (empty space) | Pan graph | D3 zoom handles translate via `d3.zoomIdentity` |
| Search | Filter nodes to matching contacts/companies | `useMemo` recomputes visible nodes, non-matches removed |
| Tier filter buttons | Show only contacts in selected tier | Toggle filter state, recompute node positions |
| Company group toggle | Cluster contacts by company or show individually | Toggle state, reposition nodes with/without clustering |
| Centre mode switch | Toggle between "My Network" (you at centre) and "Deal View" (selected deal at centre) | Swap centre node, recalculate radial positions |
| Right-click (future) | Context menu with quick actions | Phase 3 implementation |

---

## 7. Detail Panel Specification

The detail panel is a dedicated 370px right sidebar that opens when a contact node is selected. This is a **graph-specific panel** (not the existing `DealIntelligenceSheet`), built for contact-centric context with warmth breakdown, interaction timeline, and agent actions. It provides three tabbed views with glassmorphic styling (bg: rgba(17,17,24,0.88), backdrop-blur: 20px). The SVG graph width contracts to accommodate the panel with a smooth 0.3s width transition.

### 7.1 Overview Tab

- **Header:** Avatar with tier colour gradient, name, role, company, warmth delta badge
- **Warmth meter:** Horizontal bar with gradient fill, numeric score, delta percentage
- **Interaction stats:** 4-column grid — Meetings, Emails, Calls, LinkedIn messages
- **Warmth breakdown:** 5-row horizontal bar chart showing component scores (recency, engagement, deal momentum, multi-thread, sentiment)
- **Active deal card:** Deal name, value, stage badge, probability, health status with coloured indicator
- **Active signals:** Tag cloud of current signals with descriptive labels
- **Related contacts:** Clickable list of other contacts at the same company with their warmth scores
- **AI next step:** Callout card showing the AI-suggested next action for this contact

### 7.2 Timeline Tab

- **Vertical timeline:** Chronological list of all interactions with coloured dots
- **Event types:** Email, meeting, signal, call, LinkedIn — each with distinct icon
- **Sentiment indicators:** Hot (● orange), positive (↗ green), neutral (→ slate), cold (↘ indigo)
- **Time labels:** Relative ("2h ago", "Yesterday") with absolute date on hover
- **Pagination:** Infinite scroll loading 20 events at a time via `get_warmth_timeline()` RPC

### 7.3 Agents Tab

Each agent action is an expandable card that shows a rich preview before the rep triggers it:

| Action | Preview Content | Credits | Confidence Source |
|---|---|---|---|
| Draft Follow-up | Full email with subject, body personalised to deal stage and signals | 2 | Template match + signal relevance |
| Meeting Prep | 5-section briefing: contact context, interaction history, deal status, key signals, suggested agenda | 4 | Data completeness score |
| Re-engage / Keep Warm | Multi-step sequence with day-by-day plan, adapted to warmth tier | 3 | Warmth tier + signal recency |
| Create Task | Pre-filled task with title (next action), due date, priority | 0 | Rule-based |
| Enrich Profile | Sources (Apollo, LinkedIn, etc.) and fields to be enriched | 1 | Missing field detection |

Each action card displays: credit cost prominently, AI confidence percentage with visual bar, full preview of what the agent will produce, "Trigger" button with credit cost confirmation, and post-trigger confirmation with "Queued via Command Centre" status.

All triggered actions flow into the Command Centre pipeline and respect autonomy policies. If the action type is set to "approve", the rep sees the preview. If "auto", the agent executes immediately and the rep gets a Slack notification.

---

## 8. Integration with V2 Architecture

### 8.1 Command Centre

The graph is a visual entry point to the Command Centre. When a rep triggers an agent action from the graph, it creates a Command Centre item that flows through the standard enrichment and autonomy pipeline. The graph does not bypass any existing governance.

### 8.2 Proactive Fleet

Fleet agents feed into the graph in two ways:

- **Signal injection:** When the morning briefing agent identifies priority contacts or the deal risk agent flags an at-risk relationship, they emit signals into `contact_warmth_signals`, which triggers warmth recalculation.
- **Visual indicators:** Agent-generated insights appear as signal tags on contact nodes (e.g. "Deal Risk Alert", "Re-engagement Suggested").

### 8.3 Autopilot Engine

Agent actions triggered from the graph feed into the autopilot signal loop. Every approval or edit from the graph contributes to the confidence model. This means the graph directly drives autonomy progression — the more a rep triggers and approves actions from the graph, the faster those action types earn autonomous status.

### 8.4 Credit Governance

All agent actions show credit cost before triggering. The credit ledger records the graph as the source channel. Fleet throttling applies — if the org is at 80%+ budget, non-critical agent actions from the graph show a "budget limited" badge and route through the model router to use cheaper models where possible.

### 8.5 Slack Copilot

The Slack copilot gains a new skill: "show relationship graph for [contact/company]". This returns a text-based warmth summary with key signals and suggested actions, linking back to the full graph in-app.

---

## 9. Edge Functions

| Function | Type | Purpose | Credits |
|---|---|---|---|
| `warmth-recalculate` | cron (hourly) | Batch recalculation of all contact warmth scores per org. Handles normalisation and delta computation. | 0 |
| `warmth-signal-ingest` | HTTP POST | Receives interaction events from CRM sync, email tracking, meeting completion, etc. Writes to `contact_warmth_signals`. | 0 |
| `graph-agent-trigger` | HTTP POST | Triggers agent action from graph UI. Creates Command Centre item with graph as source channel. | Varies |
| `warmth-timeline` | HTTP GET | Paginated timeline of interaction signals for a specific contact. | 0 |
| `warmth-export` | HTTP GET | CSV export of warmth scores for reporting. | 0 |

---

## 10. Implementation Phases

### Phase 1: Full Command Surface (12 days)

**Goal:** Complete graph with real data, agent actions, and full 5-signal warmth model. Ship a command surface, not a dashboard.

**Database & Backend:**
1. Database schema: `contact_warmth_scores`, `contact_warmth_signals`, `contact_graph_positions`
2. `warmth-recalculate` edge function with full 5-signal composite model (recency, engagement, deal momentum, multi-threading, sentiment)
3. `warmth-signal-ingest` edge function with hooks from existing CRM sync, meeting completion, and email tracking
4. `get_contact_graph_data()` RPC — returns ALL contacts (with and without deals) with warmth, company, deal, and position data
5. `graph-agent-trigger` edge function routing to Command Centre

**Frontend — Pipeline Integration:**
6. Add "Graph" as third view tab in `PipelineHeader` view switcher (Board / Table / Graph)
7. `RelationshipGraph` component rendered inside `PipelineView` when graph tab is active
8. URL state: `?view=graph` — filters, search, and metrics carry across all three views via `usePipelineFilters`

**Frontend — SVG Graph (reference: `docs/pipeline/relationship_graph_SVG.jsx`):**
9. SVG + D3 rendering engine: nebula background gradients, orbit rings, centre "YOU" node with pulse animation
10. Contact nodes with radial gradient fill, company badge, delta indicator, deal probability arc
11. Deal connection arcs (quadratic curves) between contacts sharing the same deal, coloured by deal health
12. D3 zoom/pan (0.3×–4×), hover tooltips, click to select
13. Tier filter buttons and search (filter + reposition nodes)
14. Optional "Group by Company" toggle — default: individual contacts, toggle clusters them by company

**Frontend — Detail Panel (370px sidebar):**
15. Overview tab: warmth meter, interaction stats grid, 5-signal breakdown bars, deal card, signals tags, AI next step, related contacts at same company
16. Timeline tab: vertical chronological timeline with sentiment-coloured dots, event type icons
17. Agents tab: 5 action cards (Draft Follow-up, Meeting Prep, Re-engage, Create Task, Enrich) with rich previews, confidence bars, credit costs, and "Trigger" buttons
18. All triggered actions flow through Command Centre — credit cost confirmation before trigger

> **Phase 1 Exit Criteria:** Rep can open the Graph tab on Pipeline, see all contacts (deal and non-deal) positioned by full AI warmth scoring, click to see context, trigger any agent action with preview, filter by tier, search, and optionally group by company. All data is live from CRM. Agent actions flow through Command Centre.

### Phase 2: Intelligence & Fleet Integration (8 days)

**Goal:** Bidirectional fleet connection, switchable centre mode, and mobile support.

1. **Deal View centre mode:** Toggle between "My Network" (rep at centre) and "Deal View" (selected deal at centre with its stakeholders orbiting)
2. Fleet signal injection: morning briefing, deal risk, and re-engagement agents emit signals into `contact_warmth_signals`, triggering warmth recalculation
3. Visual signal tags on nodes from fleet agents (e.g. "Deal Risk Alert", "Re-engagement Suggested")
4. Autopilot integration: graph-triggered actions contribute to confidence model, driving autonomy progression
5. Credit budget awareness: agent cards show "budget limited" badge at 80%+ org budget
6. Warmth delta tracking with enhanced visual indicators (animated up/down badges)
7. **Mobile list view:** On screens < 768px, render a warmth-sorted contact list instead of the graph — same data (warmth score, tier, delta, company, deal, signals), displayed as a scrollable list with tier-coloured accents

> **Phase 2 Exit Criteria:** Rep can switch between network and deal-centric views. Fleet agents feed warmth signals into the graph. Mobile users see a functional warmth list. Autopilot signals are recorded.

### Phase 3: Polish and Scale (7 days)

**Goal:** Premium visual experience, performance at scale, and advanced interactions.

1. Right-click context menu for quick actions on nodes
2. Keyboard shortcuts (Esc to deselect, Tab to cycle nodes, / to focus search)
3. Performance optimisation for 300+ nodes (consider hybrid SVG/Canvas — Canvas for node layer, SVG for overlays)
4. Spatial indexing for hit testing at scale
5. Refined animations: comet trails for trending-up contacts, enhanced orbit effects
6. Manager team view: aggregated graph showing team coverage gaps (org admin only)
7. Slack copilot skill: "show relationship graph for [contact/company]" returns text warmth summary linking to in-app graph

> **Phase 3 Exit Criteria:** Graph handles 300+ contacts smoothly. Right-click context menu works. Manager view available. Visual polish matches prototype.

---

## 11. Performance Requirements

| Metric | Target | Strategy |
|---|---|---|
| Initial render (< 50 contacts) | < 200ms | Single RPC query, `useMemo` node positions |
| Initial render (50–200 contacts) | < 500ms | SVG handles this natively, deferred label rendering for off-screen nodes |
| Initial render (200–300 contacts) | < 1 second | Reduce SVG filter complexity, limit glow effects to top-tier nodes |
| Interaction responsiveness | < 16ms per frame (60fps equivalent) | CSS transitions handle animations, D3 zoom is native, no manual RAF loop needed |
| Warmth recalculation (per contact) | < 50ms | Database trigger, pre-computed components |
| Batch recalculation (per org) | < 5 seconds for 500 contacts | Hourly cron, parallel signal aggregation |
| Detail panel open | < 100ms | Warmth data already loaded, timeline lazy-loaded |
| Agent action trigger | < 200ms to confirmation | Async queue, immediate UI feedback |
| SVG node limit (comfortable) | ~200–300 nodes | For 300+ nodes, Phase 3 evaluates hybrid SVG/Canvas approach |
| Mobile list render | < 150ms | Simple sorted list with virtualisation if > 100 contacts |

---

## 12. Security and Access Control

- **Row-Level Security:** All warmth tables use RLS. Users see only contacts where `owner_id` matches their user ID, or where they have org-level access.
- **Manager view:** Team-wide graph requires org admin role. Individual rep data is never visible to other reps.
- **Signal data:** `contact_warmth_signals` is append-only. No deletion except by automated 90-day cleanup cron.
- **Agent triggers:** Graph-triggered actions respect the same autonomy policies as all other entry points. No privilege escalation.
- **Export:** `warmth-export` requires org admin role and logs the export event for audit.

---

## 13. Risks and Mitigations

| Risk | Impact | Likelihood | Mitigation |
|---|---|---|---|
| SVG performance degrades with 300+ nodes | Medium | Low | Target users (solo founders, small teams) typically have 20–100 contacts. Phase 3 evaluates hybrid SVG/Canvas for scale. Reduce glow filters on lower-tier nodes. |
| Warmth scores feel arbitrary to reps | High | Low | Transparent breakdown in panel, explainable component scores, allow reps to flag disagreement |
| Over-notification from fleet signal injection | Medium | Medium | Deduplicate signals within 24h window, respect notification preferences |
| Graph becomes a passive dashboard instead of command surface | High | Medium | Default to agents tab in panel, surface AI next-step prominently, add nudge banners for cold contacts |
| Mobile experience is poor | Medium | Low | Phase 2 ships a warmth-sorted contact list on mobile (< 768px) — same data, list format. No graph on phone. |

---

## 14. Future Roadmap

### Phase 4: Intelligence Layer

- AI-generated daily focus list overlaid on graph ("These 5 contacts need attention today")
- Predictive warmth: forecast where contacts will be in 14 days based on current trajectory
- Account health scoring: aggregate warmth across all contacts at a company
- Competitive displacement detection: flag contacts engaging with competitor content

### Phase 5: Collaboration

- Shared team graph with territory boundaries
- Handoff visualisation: see contact warmth change when reassigning between reps
- Manager coaching overlay: highlight where reps are under-investing

### Phase 6: External Signals

- Real-time intent signals from Bombora, G2, or similar providers
- LinkedIn Sales Navigator signal integration (profile views, content engagement)
- Website visitor de-anonymisation mapped to graph positions

---

## 15. Appendix

### A. Engineering Principle Alignment

- **Protect the loop, not the feature:** Every graph-triggered action flows through the Command Centre approval loop. The graph never bypasses governance.
- **Extend, don't rebuild:** The warmth model builds on existing CRM data, meeting data, and signal infrastructure. No new external dependencies in Phase 1.
- **Default to action, gate with confidence:** Agent actions are immediately accessible from every node. Confidence scores and credit costs gate execution.
- **Make it visible before you make it clever:** Phase 1 ships the visualisation. Phase 2 adds agent integration. Phase 3 adds polish. Intelligence comes later.

### B. Design System Compliance

The graph follows 60's glassmorphic dark mode aesthetic: deep backgrounds (#030712), glass panels with backdrop-blur(20px), subtle borders with rgba opacity, and the indigo/violet accent palette. No shadows in dark mode. Tier colours (orange, amber, indigo, slate) are the only departure, used for data encoding rather than decoration.

### B.1 Technical Stack

| Layer | Technology | Notes |
|-------|-----------|-------|
| Graph rendering | SVG + D3.js | D3 for zoom/pan, SVG for nodes/connections/labels |
| Glow effects | SVG `<filter>` (`feGaussianBlur` + `feFlood` + `feComposite`) | Per-tier glow filters, selected node gets amplified glow |
| Gradients | SVG `<radialGradient>` | Per-node gradient (light core to dark edge), nebula background gradients |
| Animations | SVG `<animate>` + `<animateTransform>` + CSS `transition` | Orbit rotation, centre pulse, node position transitions |
| Detail panel | React DOM (HTML) | Not SVG — standard glassmorphic panel with tabs |
| Tooltips | React DOM (HTML) | Fixed-position div outside SVG |
| State management | React hooks (`useState`, `useMemo`, `useCallback`) | No Zustand needed for graph-local state |
| Server data | React Query hook wrapping `get_contact_graph_data()` RPC | Follows existing pipeline data-fetching pattern |
| Mobile fallback | React DOM list component | Warmth-sorted contact list, no SVG on mobile |

### C. Credit Cost Estimates

| Operation | Model | Est. Credits | Frequency |
|---|---|---|---|
| Warmth recalculation (per contact) | None (SQL computation) | 0 | Per interaction event + hourly batch |
| Draft follow-up email | Claude Haiku | 2 | On-demand from graph |
| Meeting prep briefing | Claude Sonnet | 4 | On-demand from graph |
| Re-engagement sequence generation | Claude Haiku | 3 | On-demand from graph |
| Profile enrichment | Apollo API + Haiku | 1 | On-demand from graph |
| Sentiment analysis (per signal) | Claude Haiku | 0.5 | Per email/transcript signal |

---

*PRD-RG-001 v1.1 — March 2026 — 60 / Sixty Seconds Ltd*
*v1.1: Design decisions locked (D1–D10). Rendering engine changed from Canvas to SVG + D3. Agent actions moved to Phase 1. Full network scope confirmed. Mobile list view added.*