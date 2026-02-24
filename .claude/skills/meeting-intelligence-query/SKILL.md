---
name: Meeting Intelligence Query
description: |
  Search and analyze meeting transcripts using AI-powered RAG pipeline. Supports semantic search
  across transcripts, structured filters by sentiment/date/company/contact, aggregation and trend
  analysis, and cross-meeting pattern detection for objections, competitors, and commitments.
  Use when someone asks "search meetings", "search my calls", "find in meetings", "find in transcripts",
  "what was discussed", "what came up in", "what objections came up", "meeting insights",
  "meeting analytics", "across all meetings", "in my calls", "from transcripts",
  "how many meetings", "sentiment trend", "talk time analysis", "competitors mentioned",
  "commitments made", or "decisions from meetings".
  Do NOT use for single-meeting summaries, coaching analysis, or live meeting support.
metadata:
  author: sixty-ai
  version: "1"
  category: sales-ai
  skill_type: atomic
  is_active: true
  agent_affinity:
    - meetings
    - research
  triggers:
    - pattern: "search meetings"
      intent: "meeting_search"
      confidence: 0.92
      examples:
        - "search my meetings for pricing objections"
        - "search my calls about budget"
        - "search all meetings for Acme"
    - pattern: "find in transcripts"
      intent: "transcript_search"
      confidence: 0.90
      examples:
        - "find in my meeting transcripts"
        - "find mentions of competitor in calls"
        - "find what was said about timeline"
    - pattern: "what objections came up"
      intent: "objection_search"
      confidence: 0.88
      examples:
        - "what objections came up this month"
        - "what objections did I hear this week"
        - "common objections across my calls"
    - pattern: "meeting analytics"
      intent: "meeting_aggregation"
      confidence: 0.87
      examples:
        - "meeting analytics for this quarter"
        - "analytics on my sales calls"
        - "how many meetings did I have this week"
    - pattern: "sentiment trend"
      intent: "sentiment_analysis"
      confidence: 0.85
      examples:
        - "sentiment trend across my calls"
        - "how has sentiment changed in my meetings"
        - "which meetings had negative sentiment"
    - pattern: "competitors mentioned"
      intent: "competitor_detection"
      confidence: 0.88
      examples:
        - "which competitors came up in my calls"
        - "how often is Salesforce mentioned"
        - "competitor mentions this quarter"
    - pattern: "commitments made"
      intent: "commitment_search"
      confidence: 0.85
      examples:
        - "what commitments were made in my calls"
        - "find promises made in meetings"
        - "what did I commit to across my calls"
    - pattern: "talk time analysis"
      intent: "talk_time_aggregation"
      confidence: 0.85
      examples:
        - "what's my average talk time"
        - "talk ratio across my calls"
        - "how much am I talking vs listening"
    - pattern: "across all meetings"
      intent: "cross_meeting_query"
      confidence: 0.82
      examples:
        - "patterns across all meetings"
        - "themes across my calls this month"
        - "what keeps coming up in my meetings"
    - pattern: "decisions from meetings"
      intent: "decision_search"
      confidence: 0.85
      examples:
        - "what decisions were made in my calls"
        - "find decisions from recent meetings"
        - "decisions across my last 10 meetings"
  keywords:
    - "search"
    - "find"
    - "transcripts"
    - "meetings"
    - "calls"
    - "objections"
    - "competitors"
    - "commitments"
    - "sentiment"
    - "talk time"
    - "analytics"
    - "patterns"
    - "trends"
    - "across"
    - "mentions"
    - "decisions"
  required_context:
    - user_id
  inputs:
    - name: question
      type: string
      description: "Natural language question or search query to run across meeting transcripts"
      required: false
    - name: transcript_id
      type: string
      description: "Specific transcript ID for deep-dive analysis on a single meeting"
      required: false
    - name: filters
      type: object
      description: "Optional filters: date_range, company, contact_id, sentiment, meeting_type"
      required: false
    - name: analysis_type
      type: string
      description: "Type of analysis: semantic_search, aggregation, trend, or insight. Defaults to semantic_search."
      required: false
  outputs:
    - name: results
      type: array
      description: "Matching transcript excerpts or meeting records with relevance scores, meeting title, date, and speaker"
    - name: aggregation
      type: object
      description: "Summary counts and trend data when analysis_type is aggregation or trend"
    - name: insights
      type: array
      description: "Key patterns or findings surfaced from across the matched meetings"
    - name: suggested_actions
      type: array
      description: "Follow-on actions the user can take based on what was found (e.g., create tasks from commitments)"
  requires_capabilities:
    - meetings
  priority: high
  tags:
    - meetings
    - search
    - analytics
    - transcripts
    - rag
    - cross-meeting
    - sentiment
    - objections
    - competitors
---

## Available Context & Tools
@_platform-references/org-variables.md
@_platform-references/capabilities.md

# Meeting Intelligence Query

## Purpose

This skill is the intelligence layer on top of your meeting transcript library. It answers questions that span many meetings -- not a single call summary, but patterns, trends, and evidence found across your entire conversation history. Think of it as a research assistant that has read every call you've ever had and can surface what matters.

## Choosing the Right Action

Before executing, identify which type of query the user is asking.

### Type 1: Semantic Question (RAG Search)

**When to use:** The user asks an open-ended question about what was discussed, said, or happened across meetings. The answer requires reading transcript content and returning relevant excerpts.

**Examples:**
- "What objections came up in my calls this month?"
- "What has Acme said about their budget?"
- "Find calls where competitors were mentioned"
- "What have prospects said about our pricing?"

**Action:**
```
execute_action("meeting_intelligence_query", {
  question: "<user's natural language question>",
  filters: { date_range: "...", company: "...", contact_id: "..." }  // optional
})
```

The RAG pipeline embeds the question, retrieves semantically relevant transcript chunks, and returns them ranked by relevance with meeting context (title, date, speaker, excerpt).

### Type 2: Aggregation / Count Query

**When to use:** The user wants counts, totals, averages, or time-based summaries across meetings.

**Examples:**
- "How many meetings did I have this week?"
- "How many calls mentioned budget concerns?"
- "What's my average meeting duration this month?"

**Action:**
```
execute_action("meeting_analytics_dashboard", {
  date_range: "this_week" | "this_month" | "this_quarter" | "custom",
  metric: "count" | "duration" | "attendees"
})
```

### Type 3: Talk Time / Ratio Analysis

**When to use:** The user wants to understand how much they're talking vs. listening, either for a specific meeting or as a trend across calls.

**Examples:**
- "What's my average talk ratio?"
- "Am I talking too much in my calls?"
- "Talk time analysis for this quarter"

**Action:**
```
execute_action("meeting_analytics_talk_time", {
  date_range: "this_quarter",
  aggregation: "average" | "per_meeting"
})
```

### Type 4: Sentiment Trend Analysis

**When to use:** The user wants to understand sentiment direction across meetings -- are prospects becoming more positive or more negative over time?

**Examples:**
- "How has sentiment trended in my calls this quarter?"
- "Which of my recent meetings had negative sentiment?"
- "Sentiment breakdown across my Acme meetings"

**Action:**
```
execute_action("meeting_analytics_sentiment_trends", {
  date_range: "this_quarter",
  company: "Acme"  // optional filter
})
```

### Type 5: Single Meeting Deep Dive

**When to use:** The user references a specific meeting by name or ID and wants in-depth analysis of that specific transcript.

**Examples:**
- "Give me insights from my Acme call on Tuesday"
- "Deep dive into this transcript" (when a meeting is in context)
- "What happened in my discovery call with [name]?"

**Action:**
```
execute_action("meeting_analytics_insights", {
  transcriptId: "<transcript_id>"
})
```

If the transcript ID is not known, first call `meeting_intelligence_query` with the question and company/person name to identify the meeting, then use the returned transcript ID for the deep dive.

## Multi-Turn Pattern

Meeting intelligence queries often evolve through multiple turns. Follow this pattern:

**Turn 1 -- Broad search:**
User: "What objections came up in my Acme calls?"
→ Call `meeting_intelligence_query` with `question: "objections"` and `filters: { company: "Acme" }`
→ Return matching excerpts with meeting titles, dates, and speakers

**Turn 2 -- User narrows in:**
User: "Tell me more about that pricing objection from the April 12th call"
→ Use the `transcript_id` returned from Turn 1 to call `meeting_analytics_insights`
→ Return detailed analysis of that specific meeting

**Turn 3 -- Action offer:**
User: "Can you create a task to prepare a pricing response?"
→ Hand off to task creation with context already loaded

Always carry transcript IDs forward in context so the user can drill down without re-searching.

## After Presenting Results

Once results are returned, scan them for follow-on opportunities and offer them proactively:

- **Commitments found** → "I found 3 commitments from these calls. Would you like me to create tasks for them?"
- **Objections found** → "Pricing objections came up in 4 of your last 10 calls. Would you like me to draft objection-handling talking points?"
- **Competitor mentions found** → "[Competitor] was mentioned in 6 calls this month. Want me to surface your competitive positioning for that competitor?"
- **Action items found** → "These meetings had open action items. Should I check which ones are still unresolved?"

Be specific -- cite the meeting title, date, and speaker name when available. Generic summaries are less useful than "In your April 12th call with Sarah Chen at Acme, she said: 'The pricing is higher than what we expected.'"

## Clarification

If the query is ambiguous, ask one focused clarifying question before executing. Do NOT execute a broad search and then ask.

**Good:** "Are you looking for objections across all your meetings, or specifically your Acme calls?"
**Bad:** (run a broad search, return 50 results, then ask what they wanted)

If no date range is specified, default to the last 30 days and mention that: "I'll search your meetings from the last 30 days. If you want a different range, let me know."

## Output Format

Present results in a scannable format:

```
Found [N] relevant moments across [M] meetings:

1. **[Meeting Title]** — [Date] with [Speaker/Company]
   > "[exact quote or excerpt]"
   [Brief context: why this is relevant]

2. **[Meeting Title]** — [Date] with [Speaker/Company]
   > "[exact quote or excerpt]"
   [Brief context]
```

For aggregations, use a summary stat format:
```
In the last 30 days:
- 12 meetings total
- 4 mentioned budget objections (33%)
- Average talk ratio: 47% you / 53% prospect
- Sentiment: 6 positive, 4 neutral, 2 negative
```

## Error Handling

### No results found
If the RAG search returns no results: "I didn't find any mentions of [topic] in your [timeframe] meetings. This could mean the topic didn't come up, or the meetings may not have been transcribed. Would you like me to search a wider date range?"

### Transcript not available for a meeting
Some meetings may not have transcripts (no recording, not yet processed). Note this when surfacing results: "Note: [N] of your meetings from this period don't have transcripts and were not searched."

### Ambiguous meeting reference
If the user says "my call with John" and multiple meetings match: "I found [N] meetings with John: [list with dates and companies]. Which one did you mean?"

### Query too broad
If the question would match almost every meeting (e.g., "what happened in all my calls"), narrow automatically and explain: "That's a broad query -- I'll search for key themes and decisions rather than returning every meeting. To narrow it down, you can ask about a specific topic, company, or date range."
