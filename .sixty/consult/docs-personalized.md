# Consult Report: Personalized Documentation System V2

**Generated**: 2026-02-08
**Request**: Build in-depth plan for extensive, well-written, visually good docs that are dynamic and personalized per org/integrations

---

## What Already Exists (V1 — Complete)

| Component | Status | Notes |
|-----------|--------|-------|
| `docs_articles` table | Complete | JSONB metadata, org_id, versioning trigger |
| `docs_versions` table | Complete | Auto-snapshot on content change |
| `docs_feedback` table | Complete | Thumbs up/down per article per user |
| `docs_ai_proposals` table | Complete | AI-proposed updates with Slack approval |
| `docs-api` edge function | Complete | Full CRUD + feedback + AI proposals |
| DocsPage.tsx | Complete | Sidebar nav, search, markdown rendering, dark mode |
| DocsAdminPage.tsx | Complete | Split-pane editor, version history, publish/draft |
| DocsFeedback.tsx | Complete | Thumbs up/down component |
| PersonalizedExample.tsx | Complete | Basic template vars (table_name, column_name only) |
| 7 Ops Intelligence articles | Complete | Seeded via migration |
| Contextual help icons | Complete | ? icons in OpsDetailPage linking to /docs |

## Gaps Identified

### 1. Content Coverage (~15%)
- 7 articles exist, all Ops Intelligence
- Zero docs for: Pipeline, Meetings, Contacts, Copilot, Tasks, Voice AI, Coaching
- Zero integration guides (HubSpot, Slack, Fathom, JustCall, Apollo, Instantly, Fireflies, 60 Notetaker)
- Zero admin/settings guides

### 2. Personalization (Shallow)
- Only 2 template variables: `{{table_name}}`, `{{column_name}}`
- No integration-aware filtering
- No role-based content visibility
- No real CRM data in examples (deal names, contact names, etc.)
- No conditional content blocks

### 3. Visual Quality
- `:::beginner`/`:::intermediate`/`:::advanced` blocks not rendered (raw text)
- No styled callouts (tip, warning, info)
- No table of contents for long articles
- No contextual help panel (slide-over)
- TryItButton component exists but unused
- No video/GIF embed support

### 4. Discovery
- Only /docs route — no contextual help on feature pages (except OpsDetailPage)
- Copilot can't search docs
- No "suggested next reading" or related articles

## User Requirements

1. **In-app + /docs route** — contextual help everywhere + searchable docs hub
2. **Deep personalization** — integrations + role + usage patterns + live CRM context in examples
3. **Supabase-backed content** — admin CMS for authoring, DB storage

## Recommended Plan (6 Features, 23 Stories)

### Feature 1: Personalization Engine (5 stories)
- DOCS-101: Schema for integration/role/feature filtering metadata
- DOCS-102: Org context loader hook (contacts, deals, companies, meetings, team)
- DOCS-103: Integration-aware article filtering in DocsPage
- DOCS-104: Rich template variable system (12+ variables + conditional blocks)
- DOCS-123: Admin UI for setting visibility rules on articles

### Feature 2: Visual & UX Improvements (6 stories)
- DOCS-105: Skill level callout cards (beginner/intermediate/advanced)
- DOCS-106: Styled callout blocks (tip, warning, info, note)
- DOCS-107: Floating table of contents
- DOCS-108: Contextual help slide-over panel component
- DOCS-109: Add HelpPanel to key feature pages
- DOCS-110: Wire up TryItButton for navigation

### Feature 3: Core Feature Documentation (5 stories)
- DOCS-111: Pipeline & Deals (2 articles)
- DOCS-112: Meeting Intelligence (3 articles)
- DOCS-113: Copilot & AI Assistant (3 articles)
- DOCS-114: Contacts & CRM (2 articles)
- DOCS-115: Tasks & Activity (3 articles)

### Feature 4: Integration Documentation (4 stories)
- DOCS-116: HubSpot guide
- DOCS-117: Slack guide
- DOCS-118: Meeting recorders (Fathom, 60 Notetaker, Fireflies)
- DOCS-119: Apollo, Instantly, JustCall

### Feature 5: Admin & Settings Documentation (2 stories)
- DOCS-120: Getting Started & Onboarding
- DOCS-121: Admin Settings, Team Management, AI Configuration

### Feature 6: Copilot Docs Integration (1 story)
- DOCS-122: search-documentation skill for copilot

## Total Output

- **23 stories** across 6 features
- **~25 new articles** covering all platform features
- **Estimated**: ~8 hours with parallel execution
- **Parallel groups**: 6 (heavy parallelism in content authoring)

## Risks

| Risk | Severity | Mitigation |
|------|----------|------------|
| Content authoring is time-intensive | Medium | Template structure per article, use AI to draft |
| Conditional blocks add markdown parsing complexity | Medium | Pre-process before ReactMarkdown, not inside it |
| Org context queries could be slow | Low | Single batched query + 5min cache |
| Articles go stale as features change | Medium | AI proposals pipeline already exists for updates |

## Predecessor Plan
All V1 work is in `plan-docs-cms.json` (17 stories, all complete).
