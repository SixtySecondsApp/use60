# Consult Report: Meeting Intelligence Copilot Integration

Generated: 2026-02-19

## User Request

Integrate the Intelligence page query bar (meeting analytics RAG pipeline) into the Copilot and create skills so users can query meetings, collect and display data through the copilot chat interface.

---

## Key Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Search backend | Existing `meeting-analytics` edge function | Railway PostgreSQL + pgvector RAG already built and working |
| Copilot mode | Autonomous only (`copilot-autonomous`) | Active default, forward-looking |
| Query types | All 4: semantic, structured filters, aggregation, cross-meeting | Full coverage |
| Display format | Rich structured panel (adaptive layout) | Conversational answer for semantic queries, card/table for structured |
| Skill count | Single `meeting-intelligence-query` skill | Edge function already handles all query types |
| Proactive enrichment | Yes, as a Claude tool | Claude decides when to enrich deal/contact discussions with meeting context |
| API bridge | Copilot calls meeting-analytics edge function | Keeps RAG pipeline centralized, no duplication |
| Panel wiring | New panel in copilot-autonomous SSE stream | Forward-looking, builds out autonomous panel system |
| Panel content | Full Intelligence page parity | Answer + sources + sentiment + talk time + action items + key moments |
| Conversation | Multi-turn with context | Follow-up queries refine previous search |
| Actions | Full action loop | Create tasks, draft emails, update deals from meeting intelligence |
| Delivery | Everything together | Single feature ship, no phasing |

---

## Current Architecture (What Exists)

### Meeting Analytics RAG System

**Backend**: Railway PostgreSQL with pgvector extension
- `transcripts` table — full_text, title, created_at, is_demo
- `transcript_segments` table — chunked text with `embedding` column (OpenAI text-embedding-3-small)
- `sentiment_analysis` — per-transcript overall sentiment
- `action_items` — extracted tasks with assignee/priority
- `key_moments` — decisions, agreements, milestones, objections, questions
- `summaries` — brief and detailed meeting summaries

**Edge Function**: `supabase/functions/meeting-analytics/`
- Router at `router.ts` with 20+ endpoints
- **`/api/search/ask`** (POST) — Full RAG pipeline:
  1. Detect aggregate vs specific-meeting question
  2. Fetch allowed transcripts
  3. Generate query embedding → vector search `transcript_segments`
  4. Rank meetings by relevance (count * 0.3 + totalSimilarity * 0.4 + topSimilarity * 0.3)
  5. Detect specific meeting title match in question
  6. Fetch structured data (sentiment, action items, key moments, summaries, talk time)
  7. Collect relevant transcript excerpts
  8. GPT-4o-mini synthesis with focused context
  9. Return answer + source citations
- **`/api/search`** (POST) — Semantic segment search with threshold/limit
- **`/api/search/similar`** (POST) — Find similar segments
- **`/api/search/multi`** (POST) — Multi-transcript search
- **`/api/dashboard/metrics`** — Dashboard overview
- **`/api/analytics/talk-time`** — Talk time analytics
- **`/api/analytics/conversion`** — Conversion analytics
- **`/api/analytics/sentiment-trends`** — Sentiment trends over time
- **`/api/insights/{id}`** — Per-transcript insights (topics, sentiment, action items, key moments, summary, QA pairs)

**Frontend Service**: `src/lib/services/meetingAnalyticsService.ts`
- Thin HTTP client wrapping all meeting-analytics endpoints
- Base URL: `VITE_MEETING_ANALYTICS_API_URL` || Supabase edge function URL || localhost:3000

**Frontend Hooks**: `src/lib/hooks/useMeetingAnalytics.ts`
- React Query wrappers for all endpoints
- `useMaAsk()` — mutation for RAG Q&A
- `useMaSearch()` — semantic search
- `useMaDashboard()`, `useMaTrends()`, etc.

**Frontend Components**: `src/components/meeting-analytics/`
- `AskAnythingPanel.tsx` — Conversational Q&A interface
- `SearchHero.tsx` — Hero wrapper with starter questions
- `TranscriptsTab.tsx`, `DashboardTab.tsx`, `InsightsTab.tsx`, `ReportsTab.tsx`

### Copilot Autonomous System

**Edge Function**: `supabase/functions/copilot-autonomous/index.ts`
- Claude Haiku 4.5 with native `tool_use`
- SSE streaming: `tool_start`, `tool_result`, `structured_response`, `message`, `done`
- Currently returns **plain text only** (no structured panels)
- Tools: `list_skills`, `get_skill`, `execute_action`, `resolve_entity`

**Skill Execution**: `src/lib/copilot/agent/autonomousExecutor.ts`
- Converts organization_skills to Claude tool definitions
- Lazy-loads skill content on executeTool()
- `execute_action` adapter handles CRM actions (get_meetings, get_contact, etc.)

**Frontend**: `src/lib/hooks/useCopilotChat.ts`
- Manages tool call state and SSE stream parsing
- ToolCallIndicator for loading states
- ChatMessage renders structured responses via CopilotResponse router

---

## What We're Building

### 1. Meeting Intelligence Query Skill

**Location**: `skills/atomic/meeting-intelligence-query/SKILL.md`

**Capabilities** (single skill, all query types):
- **Semantic search**: "What objections came up this week?" — vector search transcripts, AI synthesis
- **Structured filters**: "Show me negative sentiment calls with Acme" — filter by date, company, contact, sentiment
- **Aggregation & trends**: "How many meetings this week? What's my avg sentiment trend?" — counts, averages, patterns
- **Cross-meeting intelligence**: "What competitors keep coming up?" — pattern detection across meetings

**Trigger phrases** (high-confidence routing):
- "search meetings", "search my calls", "find in meetings"
- "what was discussed", "what came up", "what objections"
- "meeting insights", "meeting analytics", "meeting data"
- "across all meetings", "in my calls", "from transcripts"
- "how many meetings", "sentiment trend", "talk time"

**Tool interface** (what Claude sees):
```typescript
{
  name: "meeting_intelligence_query",
  description: "Search and analyze meeting transcripts using RAG. Supports semantic search, structured filters, aggregation, and cross-meeting intelligence.",
  input_schema: {
    type: "object",
    properties: {
      question: { type: "string", description: "Natural language question about meetings" },
      transcriptId: { type: "string", description: "Optional: specific transcript to search" },
      maxMeetings: { type: "number", description: "Max meetings to analyze (default 20, max 50)" },
      queryType: {
        type: "string",
        enum: ["semantic", "aggregate", "structured", "cross_meeting"],
        description: "Query type hint for optimizing the search approach"
      }
    },
    required: ["question"]
  }
}
```

### 2. Meeting Context Enrichment Tool

**Purpose**: Proactive enrichment when discussing deals/contacts. Claude autonomously calls this when it detects a deal or contact is being discussed.

**Tool interface**:
```typescript
{
  name: "search_meeting_context",
  description: "Search for recent meeting context related to a deal or contact. Call this proactively when discussing deals or contacts to enrich your response with meeting intelligence.",
  input_schema: {
    type: "object",
    properties: {
      query: { type: "string", description: "Search query derived from deal/contact context" },
      contactName: { type: "string", description: "Contact name to filter meetings" },
      companyName: { type: "string", description: "Company name to filter meetings" },
      maxResults: { type: "number", description: "Max results (default 5)" }
    },
    required: ["query"]
  }
}
```

### 3. Copilot-to-Meeting-Analytics Bridge

**How it works**: `copilot-autonomous` edge function makes an internal HTTP call to the `meeting-analytics` edge function.

```
User message → copilot-autonomous (Claude tool_use)
  → Claude selects meeting_intelligence_query tool
  → copilot-autonomous fetches meeting-analytics /api/search/ask
  → Returns structured result to Claude
  → Claude synthesizes response
  → SSE stream: tool_start → tool_result → structured_response → message
```

**Implementation**:
- Add `MEETING_ANALYTICS_URL` env var to copilot-autonomous (same Supabase project, internal call)
- New tool handler in copilot-autonomous that calls meeting-analytics endpoints
- Parse response and format as both Claude tool result AND structured_response SSE event

### 4. MeetingIntelligenceResponse Panel (New Structured Component)

**Adaptive layout based on query type**:

**Semantic queries** ("what objections came up?"):
- AI-synthesized answer (markdown)
- Collapsible source citations with similarity scores
- Per-source: transcript title, date, snippet, sentiment badge
- Links to full transcript

**Structured queries** ("show me negative calls with Acme"):
- Meeting cards in a grid/list
- Each card: title, date, sentiment badge, company, key snippet
- Talk time breakdown (speaker percentages)
- Action items count
- Click to expand for full details

**Aggregation queries** ("how many meetings this week?"):
- Summary stats (count, avg sentiment, avg talk time)
- Mini charts (sentiment trend, meeting frequency)
- Top topics/objections/decisions

**Cross-meeting queries** ("what competitors keep coming up?"):
- Pattern cards (competitor name, mention count, meetings list)
- Timeline view of mentions
- Relevant excerpts per pattern

**Panel data structure**:
```typescript
interface MeetingIntelligenceResponseData {
  queryType: 'semantic' | 'aggregate' | 'structured' | 'cross_meeting';
  answer: string;
  sources: Array<{
    transcriptId: string;
    transcriptTitle: string;
    text: string;
    similarity: number;
    date?: string;
    sentiment?: string;
    positiveScore?: number;
  }>;
  structuredData?: Array<{
    title: string;
    id: string;
    date: string;
    sentiment?: string;
    positiveScore?: number;
    agreements?: string[];
    decisions?: string[];
    objections?: Array<{ title: string; description: string }>;
    questions?: string[];
    actionItems?: Array<{ text: string; assignee?: string; priority?: string }>;
    summary?: string;
    talkTime?: {
      speakers: Array<{ name: string; percentage: number }>;
      totalWords: number;
      talkRatio: string;
      isBalanced: boolean;
    };
  }>;
  metadata: {
    segmentsSearched: number;
    meetingsAnalyzed: number;
    totalMeetings: number;
    isAggregateQuestion: boolean;
    specificMeeting: string | null;
    searchTimeMs?: number;
  };
  // For action loop
  suggestedActions?: Array<{
    type: 'create_task' | 'draft_email' | 'update_deal' | 'post_slack';
    label: string;
    data: Record<string, unknown>;
  }>;
}
```

### 5. Multi-Turn Context Management

**How follow-up queries work**:
- Claude's conversation history naturally maintains context
- When a follow-up references a previous meeting search, Claude uses the prior tool results as context
- Claude can refine the search query or drill into specific transcripts
- Example flow:
  1. "What objections came up with Acme?" → full RAG search
  2. "What about pricing specifically?" → Claude refines to "pricing objections with Acme"
  3. "Show me the exact quotes" → Claude calls with specific transcriptIds from prior results

### 6. Action Loop Integration

**After showing meeting intelligence results, the copilot can**:
- **Create tasks**: From action items found in transcripts → existing `execute_action('create_task')` adapter
- **Draft follow-up emails**: Using meeting context → existing `post-meeting-followup-drafter` skill
- **Update deals**: With MEDDICC insights from meetings → existing `execute_action('update_deal')` adapter
- **Post to Slack**: Meeting summaries or alerts → existing Slack integration

**Trigger**: Claude's system prompt instructs it to suggest relevant actions after presenting meeting intelligence. User can confirm via the HITL preview→confirm pattern.

---

## Files to Create / Modify

### New Files

| File | Purpose |
|------|---------|
| `skills/atomic/meeting-intelligence-query/SKILL.md` | Meeting intelligence query skill definition |
| `src/components/copilot/responses/MeetingIntelligenceResponse.tsx` | New structured response panel |
| `src/lib/types/meetingIntelligenceResponse.ts` | TypeScript types for the panel data |

### Modified Files

| File | Change |
|------|--------|
| `supabase/functions/copilot-autonomous/index.ts` | Add meeting_intelligence_query + search_meeting_context tool handlers, internal fetch to meeting-analytics |
| `src/lib/copilot/agent/autonomousExecutor.ts` | Register new tools, handle structured_response for meeting intelligence |
| `src/lib/hooks/useCopilotChat.ts` | Handle new `meeting_intelligence` structured response type in SSE stream |
| `src/components/copilot/CopilotResponse.tsx` | Register MeetingIntelligenceResponse in the router switch |
| `src/components/copilot/types.ts` | Add `meeting_intelligence` to the response type union |
| `src/components/copilot/ChatMessage.tsx` | Ensure new structured response renders correctly |

### Existing Files Referenced (Read-Only)

| File | Why |
|------|-----|
| `supabase/functions/meeting-analytics/handlers/ask.ts` | RAG pipeline we're calling |
| `supabase/functions/meeting-analytics/handlers/search.ts` | Semantic search endpoint |
| `supabase/functions/meeting-analytics/handlers/analytics.ts` | Aggregation endpoints |
| `src/lib/services/meetingAnalyticsService.ts` | API client patterns to follow |
| `src/components/meeting-analytics/AskAnythingPanel.tsx` | UI patterns to mirror |
| `src/components/copilot/ToolCallIndicator.tsx` | Loading state patterns |
| `src/components/copilot/responses/PostMeetingFollowUpPackResponse.tsx` | Reference for meeting-related panel design |

---

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                     USER MESSAGE                             │
│  "What objections came up in my Acme calls this month?"     │
└─────────────┬───────────────────────────────────────────────┘
              │
              ▼
┌─────────────────────────────────────────────────────────────┐
│              copilot-autonomous (Claude Haiku 4.5)           │
│                                                              │
│  1. Routing: skill triggers match "meeting intelligence"     │
│  2. Claude selects meeting_intelligence_query tool           │
│  3. SSE: tool_start event                                    │
│                                                              │
│  ┌─────────────────────────────────────┐                    │
│  │  Internal fetch to meeting-analytics │                    │
│  │  POST /api/search/ask               │                    │
│  │  { question: "objections Acme...",  │                    │
│  │    maxMeetings: 20 }                │                    │
│  └──────────────┬──────────────────────┘                    │
│                 │                                            │
│                 ▼                                            │
│  ┌─────────────────────────────────────┐                    │
│  │  meeting-analytics edge function     │                    │
│  │                                      │                    │
│  │  Railway PostgreSQL + pgvector       │                    │
│  │  ┌──────────────────────────────┐   │                    │
│  │  │ 1. Embed query (OpenAI)      │   │                    │
│  │  │ 2. Vector search segments    │   │                    │
│  │  │ 3. Rank meetings             │   │                    │
│  │  │ 4. Enrich with structured    │   │                    │
│  │  │    data (sentiment, actions,  │   │                    │
│  │  │    key moments, talk time)    │   │                    │
│  │  │ 5. GPT-4o-mini synthesis     │   │                    │
│  │  └──────────────────────────────┘   │                    │
│  └──────────────┬──────────────────────┘                    │
│                 │                                            │
│                 ▼                                            │
│  4. SSE: tool_result event (raw data)                       │
│  5. Claude processes results, suggests actions               │
│  6. SSE: structured_response (MeetingIntelligenceResponse)  │
│  7. SSE: message (text summary + suggested actions)          │
│  8. SSE: done                                                │
└─────────────┬───────────────────────────────────────────────┘
              │
              ▼
┌─────────────────────────────────────────────────────────────┐
│              FRONTEND (useCopilotChat)                        │
│                                                              │
│  1. ToolCallIndicator shows "Searching meetings..."          │
│  2. MeetingIntelligenceResponse panel renders:               │
│     ┌─────────────────────────────────────────────────┐     │
│     │  AI Answer (markdown)                            │     │
│     │  ─────────────────────────                       │     │
│     │  Source Cards:                                   │     │
│     │  ┌─────────────────────┐  ┌──────────────────┐  │     │
│     │  │ Acme Q3 Review      │  │ Acme Pricing Call │  │     │
│     │  │ 2026-02-15 | 87%   │  │ 2026-02-10 | 82% │  │     │
│     │  │ 😐 Negative         │  │ 😐 Neutral       │  │     │
│     │  │ "We're concerned..." │  │ "The pricing..." │  │     │
│     │  └─────────────────────┘  └──────────────────┘  │     │
│     │                                                  │     │
│     │  Key Signals:                                    │     │
│     │  - 3 objections detected                         │     │
│     │  - 2 action items pending                        │     │
│     │  - Talk ratio: 65/35 (unbalanced)               │     │
│     │                                                  │     │
│     │  Suggested Actions:                              │     │
│     │  [Create Tasks] [Draft Follow-up] [Post Slack]  │     │
│     └─────────────────────────────────────────────────┘     │
│                                                              │
│  3. User can click actions → preview → confirm              │
│  4. Follow-up: "Show me the exact quotes about pricing"      │
│     → Claude refines search with prior context               │
└─────────────────────────────────────────────────────────────┘
```

---

## Risks & Mitigations

| Severity | Risk | Mitigation |
|----------|------|------------|
| High | Railway DB credentials in copilot-autonomous env | Internal fetch to meeting-analytics edge function (already has credentials). No direct DB access from copilot. |
| Medium | GPT-4o-mini synthesis adds latency (~2-3s) | ToolCallIndicator shows progress. Could skip synthesis for structured-only queries. |
| Medium | Token budget for meeting context in Claude conversation | Summarize meeting results before passing to Claude. Limit to top 5-10 sources in tool result. |
| Low | Structured panel complexity | Mirror AskAnythingPanel patterns. Reuse existing Tailwind/Radix components. |
| Low | Multi-turn context can accumulate stale meeting data | Claude's session compaction (80k token limit) handles this naturally. |

---

## Acceptance Criteria

1. User can ask any meeting-related question in the copilot and get an AI-synthesized answer with source citations
2. Results display in a rich structured panel matching the Intelligence page quality
3. Panel adapts layout based on query type (semantic, structured, aggregate, cross-meeting)
4. Claude proactively surfaces meeting context when discussing deals/contacts
5. Follow-up queries refine previous search results naturally
6. User can take actions from meeting results: create tasks, draft emails, update deals, post to Slack
7. ToolCallIndicator shows meaningful progress during search
8. All 4 query types work: semantic search, structured filters, aggregation/trends, cross-meeting intelligence
