# Consult Report: Interactive Sandbox Hero
Generated: 2026-03-04

## User Request
"Create the full application as the hero, personalized to the person we are reaching out to. The demo should be in line with their business — the application looks amazing so this is the best possible demo and initial experience on the homepage."

## Clarifications
- **Entry points:** Both /t/{code} campaign links AND homepage URL input
- **App depth:** Interactive sandbox — full app chrome with clickable navigation
- **Personalization:** Maximum — company as deal, contacts as stakeholders, AI-drafted email to them specifically

---

## Key Finding: Why We Build a Sandbox, Not Render the Real App

The real 60 app **cannot be rendered on the landing page** without massive refactoring:

| Blocker | Impact | Detail |
|---------|--------|--------|
| Auth wall | Critical | Every component calls `useUser()`, `useAuth()`, `useOrg()` — crashes without session |
| Bundle bloat | Critical | +2.5-4MB gzipped from integration SDKs (HubSpot, Bullhorn, Slack, etc.) |
| LCP death | Critical | Would blow the 1.5s target to 5-6s on 4G |
| Query waterfall | High | 15+ React Query hooks fire on mount, all fail without auth |

**Solution:** Build a pixel-perfect sandbox replica using the same design system. Zero auth dependencies, lightweight, instant load. The visitor can't tell it's not the real app.

---

## What Exists (Reusable)

### Landing Page
- **ProductShowcase** (52KB, standalone): 5 panels with swipe navigation, zero auth deps
- **useDemoResearch hook**: Public API call to demo-research edge function, 55s timeout, mock fallback
- **AgentResearch animation**: 6-agent grid showing AI working in real-time
- **pageViewTracker**: Session/visitor IDs, UTM extraction, device detection
- **MockDataGenerator**: Seeded random data for users, companies, contacts
- **Framer Motion setup**: Spring physics, AnimatePresence, scroll-triggered reveals

### Main App (Reference Only — Cannot Import Directly)
- **AppLayout.tsx** (1,207 lines): Sidebar nav, topbar, banner system, mobile menu
- **Pipeline/Kanban**: DealCard with health indicators, drag-drop columns
- **Dashboard**: KPI cards, activity log, team matrix, sales funnel
- **Command Center**: 3-state UI (compact/medium/full), Cmd+K trigger
- **Design system**: Shadcn/Radix UI, 35 component files, dark mode tokens

### Research & Enrichment Infrastructure
- **landing-research edge function**: 6 parallel queries (Gemini + Exa) — company, competitors, social proof, market, brand
- **enrich-cascade**: AI Ark + Apollo fallback for contact enrichment
- **research-router**: Multi-provider orchestration (Perplexity, Exa, Apify)
- **Apify integrations**: LinkedIn scraping, Maps search, SERP results

### Database
- `page_views` table: Exists, tracks visits
- `partial_signups` table: Exists, tracks conversion funnel
- `campaign_visitors` table: **Does NOT exist** — needs creation
- `waitlist_invite_codes`: Exists, could inform code generation pattern

---

## Recommended Architecture

### Sandbox Component Structure

```
packages/landing/src/sandbox/
├── SandboxApp.tsx              ← Full app shell (sidebar + topbar + main content area)
├── SandboxSidebar.tsx          ← Faithful replica of app sidebar navigation
├── SandboxTopbar.tsx           ← Logo, notifications, user avatar (demo user)
├── SandboxRouter.tsx           ← Internal view switching (no real routing)
├── views/
│   ├── SandboxPipeline.tsx     ← Kanban with their company as a deal
│   ├── SandboxDashboard.tsx    ← KPIs, activity feed, metrics
│   ├── SandboxMeetingPrep.tsx  ← AI-generated prep doc for hypothetical meeting
│   ├── SandboxEmailDraft.tsx   ← Follow-up email personalized to them
│   ├── SandboxContacts.tsx     ← Their team members as contacts
│   └── SandboxCopilot.tsx      ← Command center with AI interaction
├── data/
│   ├── SandboxDataProvider.tsx ← React context providing all mock/enriched data
│   ├── generatePersonalizedData.ts ← Transforms ResearchData into full app dataset
│   └── sandboxTypes.ts         ← Lightweight type definitions
└── components/
    ├── SandboxDealCard.tsx      ← Simplified DealCard (no DnD dependencies)
    ├── SandboxKPICard.tsx       ← Dashboard metric card
    ├── SandboxActivityFeed.tsx  ← Recent activity timeline
    ├── SandboxQuickAdd.tsx      ← Command palette demo
    └── SandboxTour.tsx          ← Guided highlight overlay (optional)
```

### Data Flow

```
HOMEPAGE FLOW:
  User enters URL → useDemoResearch() fires → AgentResearch animation
  → generatePersonalizedData(researchData) → SandboxDataProvider
  → SandboxApp renders with their company data

CAMPAIGN FLOW (/t/{code}):
  /t/{code} → DB lookup → pre-enriched data loaded instantly
  → generatePersonalizedData(enrichedData) → SandboxDataProvider
  → SandboxApp renders with maximum personalization
  → "Welcome, {First Name}. Here's what 60 would do for {Company}."
```

### /t/{code} System Design

```sql
-- campaign_links table
code         TEXT PRIMARY KEY,      -- 6-char base62 (e.g. 'a7Kx9B')
email        TEXT,                  -- original contact email
domain       TEXT,                  -- extracted company domain
first_name   TEXT,
last_name    TEXT,
company_name TEXT,
enrichment   JSONB,                -- pre-enriched company/contact data
campaign_id  TEXT,                  -- grouping identifier
org_id       UUID,                 -- which 60 org created this
created_at   TIMESTAMPTZ DEFAULT now(),
expires_at   TIMESTAMPTZ DEFAULT now() + interval '30 days',
first_visit  TIMESTAMPTZ,          -- NULL until they click
visit_count  INTEGER DEFAULT 0,
engagement   JSONB DEFAULT '{}',   -- interaction tracking
score        INTEGER DEFAULT 0     -- computed engagement score
```

**Pre-enrichment pipeline:**
1. Upload CSV (email, first_name, last_name, company)
2. For each: extract domain → run landing-research (Gemini + Exa)
3. Generate random 6-char code → store mapping
4. Output: `use60.com/t/{code}` links ready for campaign

**On visit:**
1. Resolve code → campaign_links row
2. Load enrichment JSONB → pass to sandbox
3. Track visit (increment visit_count, set first_visit)
4. Score engagement events (scroll depth, clicks, time on section)
5. If score > threshold → Slack webhook alert

---

## Personalization Depth (Maximum)

For /t/{code} visitors, the sandbox shows:

| What They See | How It's Generated |
|---------------|-------------------|
| Their company as a deal in pipeline | From enrichment data (company name, domain, industry) |
| Their team members as contacts | AI Ark/Apollo enrichment of company contacts |
| Deal health score | Algorithmically generated based on company signals |
| AI-drafted follow-up email TO them | Gemini generation using their name, company, and role |
| Meeting prep doc for hypothetical call | Generated from company research, competitive landscape |
| Dashboard metrics | Simulated weekly stats based on their company size/industry |
| Slack notification previews | Pre-meeting brief, follow-up draft, deal alert — all personalized |
| "Your first week with 60" | Projected savings based on team size and sales cycle |

For homepage visitors (URL input), same data but generated in real-time via the existing demo-research pipeline.

---

## Risks & Mitigations

| Risk | Severity | Mitigation |
|------|----------|-----------|
| Sandbox looks fake/different from real app | Medium | Use exact same Tailwind tokens, Lucide icons, card patterns from AppLayout |
| Bundle size creep | Medium | Keep sandbox components self-contained, no main app imports, lazy-load below fold |
| Research API latency (homepage flow) | Medium | Show agent animation during research (already exists), cache results |
| Pre-enrichment cost at scale | Medium | Batch with rate limits, ~$0.10 per company (Gemini + Exa) |
| /t/{code} code collisions | Low | 56.8B combinations, collision check on generation |
| Mobile performance | Medium | Simplified sandbox view on mobile, fewer animations |
| Stale enrichment data | Low | 30-day TTL on campaign links, re-enrich on second visit |

---

## Phased Execution Plan

### Phase 1: Sandbox Shell (4 stories)
- SandboxApp shell with sidebar + topbar
- SandboxRouter for internal view switching
- SandboxDataProvider with mock data context
- Dark theme matching app design system

### Phase 2: Core Views (5 stories)
- SandboxPipeline (Kanban with deal cards)
- SandboxDashboard (KPIs + activity feed)
- SandboxMeetingPrep (AI prep doc view)
- SandboxEmailDraft (follow-up composer)
- SandboxContacts (contact list view)

### Phase 3: Personalization Engine (3 stories)
- generatePersonalizedData() transforms ResearchData → full dataset
- AI-generated content (email draft, meeting prep) via edge function
- Company-aware demo scenarios

### Phase 4: Homepage Integration (2 stories)
- URL input → research → sandbox transition
- Guided tour overlay for first-time visitors

### Phase 5: /t/{code} System (4 stories)
- campaign_links migration + RLS policies
- /t/:code route + resolver edge function
- Pre-enrichment batch pipeline
- Instant sandbox load from pre-enriched data

### Phase 6: Interactive Copilot (2 stories)
- Command center / Quick Add demo
- Simulated AI responses with typing animation

### Phase 7: Tracking & Alerts (3 stories)
- Engagement scoring (scroll depth, clicks, time per section)
- Slack webhook integration for hot leads
- Lead flow into 60 app pipeline

### Phase 8: Polish & Performance (2 stories)
- Lazy loading, code splitting, animation optimization
- Mobile-responsive sandbox, touch gestures

**MVP (Phases 1-4):** ~14 stories — Interactive sandbox on homepage
**Full (Phases 1-8):** ~25 stories — Complete campaign system with tracking

---

## Design Reference

The sandbox must match the app's design language exactly:

- **Background:** `bg-gray-950` / `#0a0a0a` (warm dark)
- **Cards:** `bg-gray-900` with `border border-gray-800/50`, `rounded-xl`
- **Accent:** Indigo-to-violet gradient (`from-indigo-500 to-violet-500`)
- **Text:** `text-white` primary, `text-gray-400` secondary
- **Sidebar:** ~240px, collapsible, with Lucide nav icons
- **Topbar:** 64px fixed, logo left, actions right
- **Cards:** Glassmorphism with `backdrop-blur-sm` on hover
- **Animations:** Framer Motion spring physics (stiffness: 300, damping: 30)
- **Icons:** Lucide React only, 20px in cards, 16px inline
- **Fonts:** Inter (body), JetBrains Mono (data/metrics)

---

*Report saved: .sixty/consult/interactive-sandbox-hero.md*
*Strategy source: website-strategy/website_brief.md + website-strategy/style_guide.md*
*Next step: Review this report, then run `60/plan` to generate execution plan*
