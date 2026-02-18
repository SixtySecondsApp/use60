# Consult Report: Meeting Analytics Search Consolidation

Generated: 2026-02-18

## User Request

Remove the old search method from Meeting Analytics and keep only the new one (merged by Rishi). Maintain the visual style of the old Semantic Search but use the new Ask Anything (RAG) functionality.

## Analysis Results

### Which Is Which

| Method | Status | API | Hook | Endpoint |
|--------|--------|-----|------|----------|
| **Semantic Search** | OLD (earlier foundation) | `maService.search()` | `useMaSearch` | `POST /api/search` |
| **Ask Anything (RAG)** | NEW (commit `4687fc40` by Rishi) | `maService.askMeeting()` | `useMaAsk` | `POST /api/search/ask` |

### Key Differences

**Semantic Search (OLD)**:
- Vector similarity matching on transcript segments
- Returns ranked segments with similarity scores
- Debounced real-time search (500ms)
- Results: card list with transcript title, text snippet, timestamp, match %
- UI: Search input → result cards

**Ask Anything (NEW)**:
- RAG (Retrieval-Augmented Generation) pipeline
- Returns AI-generated answer + cited sources
- Mutation-based (submit question, get answer)
- Results: AI answer + source cards with similarity scores
- UI: Chat interface with user/assistant messages

### Files Affected

| File | Current State | Action |
|------|---------------|--------|
| `SearchTab.tsx` | Mode toggle between Semantic Search / Ask Anything | Consolidate to single search using `useMaAsk` |
| `SearchHero.tsx` | Mode toggle between Semantic Search / Ask Anything | Consolidate to single search using `useMaAsk` |
| `AskAnythingPanel.tsx` | Chat-style UI for Ask Anything | Will be modified or replaced |

### Plan

**Goal**: Use the Ask Anything RAG backend (`useMaAsk` / `POST /api/search/ask`) but display results in the Semantic Search card-style UI (no chat interface, no mode toggle).

#### Changes per file:

1. **SearchTab.tsx**: Remove mode toggle, remove `useMaSearch`. Use `useMaAsk` to power the search. Show AI answer at top, then source cards in the existing Semantic Search card style.

2. **SearchHero.tsx**: Same approach - remove mode toggle, wire up `useMaAsk`. Keep filters, example queries, and card-style results.

3. **AskAnythingPanel.tsx**: No longer imported by either component. Can be kept for standalone use (e.g., in TranscriptDetailSheet) but removed from SearchTab/SearchHero.

### Visual Spec

Keep the existing Semantic Search visual style:
- Search input with debounce
- Result cards with: transcript title, text snippet, match %, timestamp
- Loading skeleton cards
- Empty state with search icon
- Example query chips (from SearchHero)

Replace the data source:
- Instead of `useMaSearch` (vector similarity), use `useMaAsk` (RAG)
- Display the AI-generated answer prominently above the source cards
- Source cards map to the existing result card design
