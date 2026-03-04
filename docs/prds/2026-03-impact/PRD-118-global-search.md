# PRD-118: Global Search & Command Palette

**Priority:** Tier 1 — Ship Blocker
**Current Score:** 2 (SCAFFOLD) — search infrastructure exists, no unified experience
**Target Score:** 4 (BETA)
**Estimated Effort:** 8-10 hours
**Dependencies:** None

---

## Problem

Search components exist but are fragmented:
- `SearchInput.tsx` (60 lines) — generic debounced search component
- `SmartSearch.tsx` — mounted in AppLayout but unclear if wired for cross-entity search
- `MeetingSearchPanel.tsx` (7,509 lines) — powerful meeting search but only in command centre
- `TestContactSearch.tsx`, `TestDealSearch.tsx`, etc. — test implementations suggesting work-in-progress

There is **no unified global search**:
1. **No Cmd+K command palette** — standard SaaS pattern, users expect it
2. **No cross-entity search** — can't search across deals, contacts, meetings, and tasks in one query
3. **No recent items** — no quick access to recently viewed deals/contacts
4. **No search results page** — individual entity searches exist but no combined results view
5. **Meeting search is buried** — 7,500-line search panel only accessible from command centre

## Goal

A global command palette (Cmd+K) that searches across all entities and provides quick navigation, plus a dedicated search results page for deeper exploration.

## Success Criteria

- [ ] Cmd+K command palette accessible from any page
- [ ] Cross-entity search: deals, contacts, meetings, tasks, companies
- [ ] Recent items section (last 10 viewed entities)
- [ ] Quick actions from search results (open deal, email contact, view meeting)
- [ ] Search results page with entity-type tabs and filters
- [ ] Keyboard navigation (arrow keys, Enter to select, Esc to close)

## Stories

| ID | Title | Type | Est | Dependencies |
|----|-------|------|-----|-------------|
| SRCH-001 | Build CommandPalette component with Cmd+K trigger | frontend | 2h | — |
| SRCH-002 | Add cross-entity search (deals, contacts, meetings, tasks, companies) | frontend + backend | 2h | SRCH-001 |
| SRCH-003 | Add recent items section with localStorage tracking | frontend | 1h | SRCH-001 |
| SRCH-004 | Build quick actions for each entity type | frontend | 1h | SRCH-001 |
| SRCH-005 | Create search results page with entity-type tabs | frontend | 1.5h | — |
| SRCH-006 | Add keyboard navigation and accessibility | frontend | 1h | SRCH-001 |
| SRCH-007 | Create unified search RPC (searches across all entity tables) | backend | 1.5h | — |

## Technical Notes

- Consider `cmdk` library (radix-based command palette) — lightweight, accessible, widely used
- Unified search RPC: `UNION ALL` across deals, contacts, meetings, tasks with relevance scoring
- Use PostgreSQL `websearch_to_tsquery` for full-text search across entities
- Recent items: store in localStorage with `{ type, id, name, viewedAt }` — cap at 20 items
- `SmartSearch.tsx` in AppLayout — may be extensible as the palette trigger
- Quick actions per type: Deal → open sheet, Contact → email/call, Meeting → view detail, Task → mark complete
- Entity result format: `{ type, id, title, subtitle, icon, url }`
- Consider debounced API calls (300ms) with client-side recent items shown instantly
