# Documentation Search Methodology

The 4-phase search process for finding, ranking, and synthesizing answers from platform documentation. Covers query optimization, relevance scoring, progressive disclosure, and multi-article synthesis.

## Table of Contents
1. [The 4-Phase Search Process](#the-4-phase-search-process)
2. [Phase 1: Keyword Extraction and Query Understanding](#phase-1-keyword-extraction-and-query-understanding)
3. [Phase 2: Semantic Expansion and Query Variants](#phase-2-semantic-expansion-and-query-variants)
4. [Phase 3: Progressive Disclosure](#phase-3-progressive-disclosure)
5. [Phase 4: Multi-Article Synthesis](#phase-4-multi-article-synthesis)
6. [Query Optimization Techniques](#query-optimization-techniques)
7. [Result Ranking Methodology](#result-ranking-methodology)
8. [Handling Ambiguous Queries](#handling-ambiguous-queries)
9. [Zero-Result Strategies](#zero-result-strategies)
10. [Multi-Topic Synthesis Approach](#multi-topic-synthesis-approach)

---

## The 4-Phase Search Process

Documentation search is not a single query -- it is a 4-phase process that transforms a natural language question into a synthesized, directly useful answer.

```
Phase 1: KEYWORD EXTRACTION
  "How do I connect my Google Calendar?" -> ["connect", "Google Calendar"]
  + Intent classification: "how-to" -> procedural content

Phase 2: SEMANTIC EXPANSION
  ["connect", "Google Calendar"]
  -> Query 1: "connect Google Calendar" (direct)
  -> Query 2: "Google Calendar integration setup" (expanded)
  -> Query 3: category:"Integrations" + "calendar sync" (scoped)

Phase 3: PROGRESSIVE DISCLOSURE
  Layer 1: Direct answer (2-3 sentences)
  Layer 2: Key steps (numbered list)
  Layer 3: Full article links

Phase 4: MULTI-ARTICLE SYNTHESIS
  When the answer spans multiple articles, weave them into
  a unified narrative with citations.
```

### Why 4 Phases

| Phase | Problem It Solves | Without It |
|-------|------------------|-----------|
| Keyword Extraction | Users ask in natural language; search engines need keywords | Raw question matches poorly against article titles |
| Semantic Expansion | A single query misses synonyms and related terms | Relevant articles with different terminology are missed |
| Progressive Disclosure | Users want answers, not reading lists | 60% of users abandon after the first irrelevant link (Forrester) |
| Multi-Article Synthesis | Some answers span multiple docs | User must click through 3-5 articles and piece it together themselves |

---

## Phase 1: Keyword Extraction and Query Understanding

### Intent Classification

Before searching, classify the user's intent to determine the type of content to prioritize.

| Intent Type | Signal Words | Content to Prioritize | Example |
|------------|-------------|----------------------|---------|
| How-to | "how do I," "how to," "steps to," "set up," "configure" | Procedural guides, step-by-step instructions | "How do I connect my calendar?" |
| What-is | "what is," "what does," "explain," "define" | Conceptual overviews, feature descriptions | "What is deal health scoring?" |
| Troubleshooting | "not working," "error," "broken," "can't," "won't" | FAQ, troubleshooting guides, known issues | "Calendar sync not working" |
| Configuration | "settings," "configure," "change," "customize," "turn on/off" | Settings documentation, admin guides | "How do I change notification settings?" |
| Integration | "connect," "integrate," "sync," "link," "import" | Integration guides, setup docs | "Connect Slack to pipeline alerts" |
| Feature discovery | "can I," "is there," "does it support," "is it possible" | Feature documentation, capability lists | "Can I export data to CSV?" |
| Comparison | "difference between," "vs," "compared to" | Feature comparison, plan comparison | "What's the difference between health score and deal score?" |

### Keyword Extraction Process

1. **Remove stop words**: "how," "do," "I," "my," "the," "a," "is," "it," "to"
   - Exception: Keep "not" (it changes meaning: "working" vs "not working")
2. **Preserve compound terms**: "Google Calendar" stays as a unit, not "Google" + "Calendar"
3. **Expand abbreviations**: "cal" -> "calendar," "int" -> "integration," "config" -> "configuration"
   - Exception: Keep known acronyms as-is: "CRM," "API," "SSO," "CSV"
4. **Extract the subject**: The thing being asked about (feature, integration, setting)
5. **Extract the action**: What they want to do (set up, fix, understand, configure)
6. **Preserve proper nouns**: "Google Calendar," "Slack," "HubSpot," "Fathom" -- keep exact casing

### Worked Examples

| User Question | Extracted Keywords | Intent | Subject | Action |
|--------------|-------------------|--------|---------|--------|
| "How do I connect my Google Calendar?" | ["connect", "Google Calendar"] | How-to | Google Calendar integration | Connect/set up |
| "Deal health scoring not updating" | ["deal health scoring", "not updating"] | Troubleshooting | Deal health scoring | Fix/troubleshoot |
| "What's the difference between tasks and reminders?" | ["difference", "tasks", "reminders"] | Comparison | Tasks, Reminders | Understand |
| "Can I send Slack notifications for won deals?" | ["Slack notifications", "won deals"] | Feature discovery | Slack integration | Configure |
| "Where do I change my email notification settings?" | ["email notification", "settings"] | Configuration | Email notifications | Change |

---

## Phase 2: Semantic Expansion and Query Variants

A single query often misses relevant articles because different authors use different terminology. Generate 2-3 query variants to improve recall.

### Expansion Strategies

| Strategy | Method | Example |
|----------|--------|---------|
| Synonym substitution | Replace key terms with platform-specific synonyms | "connect" -> also try "integrate," "sync," "link" |
| Action-verb expansion | Add related action verbs | "set up" -> also try "configure," "enable," "activate" |
| Category scoping | Add the likely documentation category as a filter | "Google Calendar" -> category:"Integrations" |
| Abbreviation expansion | Try both abbreviated and full forms | "CRM" -> also try "customer relationship management" |
| Feature name variation | Try official and colloquial names | "deal health" -> also try "deal score," "pipeline health" |

### Query Variant Generation

For each user query, generate exactly 3 variants:

```
Variant 1: DIRECT
  Use the extracted keywords as-is.
  Example: "connect Google Calendar"

Variant 2: EXPANDED
  Add synonyms and action-verb expansions.
  Example: "Google Calendar integration setup configuration"

Variant 3: SCOPED
  Apply category filter + simplified keywords.
  Example: category:"Integrations" + "calendar sync"
```

### Synonym Map (Platform-Specific)

| User Term | Also Search For |
|----------|----------------|
| connect | integrate, sync, link, set up, enable |
| broken | not working, error, issue, problem, bug |
| settings | configuration, preferences, options, admin |
| alert | notification, warning, reminder |
| pipeline | deals, opportunities, funnel |
| health score | deal health, risk score, deal score |
| meeting | calendar event, call, appointment |
| contact | person, lead, prospect |
| task | to-do, action item, reminder |
| recording | transcript, notes, meeting recording |
| AI | copilot, assistant, automation |

---

## Phase 3: Progressive Disclosure

Present information in layers of increasing detail. Most users get their answer in Layer 1 without clicking any links.

### The 3-Layer Model

```
LAYER 1: DIRECT ANSWER (2-3 sentences)
  Synthesized from the top-matching articles.
  Directly answers the user's question.
  Cites the source article.

LAYER 2: KEY STEPS or DETAILS (if applicable)
  Numbered steps for how-to questions.
  Bullet points for concept explanations.
  Table for comparisons.

LAYER 3: FULL ARTICLE LINKS
  Ranked by relevance.
  Title + category + excerpt.
  Max 3 articles shown.
```

### Why Progressive Disclosure Works

| Research Finding | Source | Application |
|-----------------|--------|------------|
| 67% of users prefer self-service over talking to support | Zendesk, 2024 | Layer 1 must be self-sufficient |
| 91% would use a knowledge base if it answered their question | Forrester | The answer must be in Layer 1, not behind a link |
| Average support ticket costs $15-25 | Zendesk | Every Layer 1 answer saves $15-25 |
| 60% of users abandon after the first irrelevant link | Forrester | Links alone are not enough; synthesize first |
| Users spend an average of 10 seconds scanning before deciding to click | Nielsen Norman Group | Layer 1 must deliver value in 10 seconds |

### Layer 1 Quality Standards

The synthesized answer must:
1. **Directly address the question** (not "here are some articles that might help")
2. **Be 2-5 sentences** (not a single word, not a paragraph)
3. **Cite the source article** ("Source: [Article Title]")
4. **Be self-contained** (the user should not need to click a link to get the answer)
5. **Use the user's terminology** (if they said "connect," say "connect," not "integrate")

### Layer 2 Format by Intent

| Intent | Layer 2 Format | Example |
|--------|---------------|---------|
| How-to | Numbered steps | "1. Go to Settings > Integrations\n2. Click Google Calendar\n3. Authorize" |
| What-is | Bullet points of key aspects | "Deal health scoring measures:\n- Activity recency\n- Stakeholder engagement\n- Pipeline velocity" |
| Troubleshooting | Diagnostic steps | "Try these fixes:\n1. Check that your calendar is connected\n2. Verify the sync interval\n3. Clear cache and retry" |
| Comparison | Table | Feature comparison table |
| Configuration | Setting location + options | "Navigate to Settings > Notifications > Email" |

---

## Phase 4: Multi-Article Synthesis

When the answer spans multiple documentation articles, synthesize them into a unified narrative.

### When Multi-Article Synthesis Is Needed

| Trigger | Example |
|---------|---------|
| Question touches multiple features | "How do I set up deal health AND connect it to Slack alerts?" |
| Answer has prerequisites in another article | "To use auto-join, you first need to connect your calendar" |
| Different aspects are in different articles | Setup in one article, troubleshooting in another |
| The user's question is broader than any single article | "How does the meeting intelligence system work?" |

### Synthesis Strategy

1. **Identify the primary article** -- the one most directly answering the question
2. **Identify supporting articles** -- prerequisites, related config, troubleshooting
3. **Compose the answer starting from the primary article**
4. **Weave in supporting context where needed**, clearly citing each source
5. **Present a unified narrative** -- the user should not know the answer came from multiple sources

### Good vs. Bad Synthesis

**Good** (unified narrative with citations):
> To connect Google Calendar, go to Settings > Integrations > Google Calendar and click "Connect." Authorize with your Google account and select which calendars to sync. (Source: Google Calendar Integration Guide)
>
> Once connected, your calendar events will appear in the meetings section. To see them in your pipeline, link meetings to deals from the deal page or enable auto-linking in Settings > Meetings > Auto-link Rules. (Source: Meeting-Deal Linking)

**Bad** (link dump):
> I found these articles that might help:
> 1. Google Calendar Integration Guide
> 2. Meeting-Deal Linking
> 3. Pipeline View Guide

The bad version forces the user to do the work. Always synthesize.

---

## Query Optimization Techniques

### Exact Match

Use exact match for specific feature names, error messages, and technical terms.

| Scenario | Query Approach | Example |
|----------|---------------|---------|
| Feature by name | Exact match on feature name | `"deal health scoring"` (quoted) |
| Error message | Exact match on error text | `"PGRST116"` or `"connection refused"` |
| Integration name | Exact match on proper noun | `"Google Calendar"` |
| Setting name | Exact match on UI label | `"auto-join scheduler"` |

### Fuzzy Matching

Use fuzzy matching when the user's terminology might not match the documentation exactly.

| Scenario | Fuzzy Approach | Example |
|----------|---------------|---------|
| Misspelling | Allow 1-2 character edits | "calender" -> "calendar" |
| Abbreviation | Expand common abbreviations | "notif" -> "notification" |
| Colloquial term | Map to official feature name | "bot" -> "meeting recording bot," "notetaker" |
| Partial term | Stem matching | "scheduling" -> also matches "scheduled," "schedule" |

### Tag-Based Filtering

When the intent classification produces a high-confidence category, use it as a pre-filter.

| Detected Category | Tag Filter | Reduces Results By |
|------------------|-----------|-------------------|
| Integrations | `tag:integration` | ~70% (only integration articles remain) |
| Settings | `tag:configuration` | ~80% |
| Pipeline | `tag:pipeline OR tag:deals` | ~60% |
| Meetings | `tag:meetings OR tag:calendar` | ~65% |
| Security | `tag:security OR tag:admin` | ~85% |

### Category Browsing (Fallback)

When search returns no results, suggest category browsing:

```
"I couldn't find a specific article for that. You might find what you're looking for
in one of these categories:

- Integrations: Calendar, Slack, HubSpot, Fathom connections
- Pipeline: Deals, stages, health scoring, forecasting
- Settings: Notifications, preferences, admin configuration

Browse all documentation at /docs"
```

---

## Result Ranking Methodology

After retrieval, re-rank results using a weighted relevance score.

### Relevance Scoring Model

```
RELEVANCE_SCORE = (Title_Match x 0.30) + (Content_Match x 0.25) +
                  (Category_Alignment x 0.20) + (Recency x 0.15) +
                  (Specificity x 0.10)
```

### Scoring Details

| Signal | Max Score | How to Calculate |
|--------|----------|-----------------|
| Title Match (30%) | 100 | Title contains exact search terms: 100. Contains partial: 60. No match: 0. |
| Content Match (25%) | 100 | Body contains a paragraph directly answering the question: 100. Related content: 50. Tangential: 20. |
| Category Alignment (20%) | 100 | Article category matches detected intent: 100. Related category: 50. Unrelated: 0. |
| Recency (15%) | 100 | Updated in last 30 days: 100. Last 90 days: 70. Last year: 40. Older: 20. |
| Specificity (10%) | 100 | Article focuses on the exact topic: 100. Covers it as a subsection: 50. Mentions it briefly: 20. |

### Cutoff Thresholds

| Score Range | Treatment |
|------------|-----------|
| 70-100 | High confidence. Show in Layer 1 answer and cite as primary source. |
| 40-69 | Medium confidence. Show in Layer 3 links with caveat. |
| Below 40 | Low confidence. Do not show. Treat as "not found" if all results are below 40. |

---

## Handling Ambiguous Queries

When the query could mean multiple things, the search must address the ambiguity instead of guessing wrong.

### Ambiguity Detection

| Signal | Example | Strategy |
|--------|---------|----------|
| Single-word query | "scoring" | Could mean deal scoring, lead scoring, health scoring. Ask for clarification. |
| Multiple possible features | "sync" | Calendar sync? HubSpot sync? Slack sync? Provide top result and note alternatives. |
| Homonyms | "pipeline" | Sales pipeline? Data pipeline? CI/CD pipeline? Assume sales pipeline (platform context). |
| Feature vs. concept | "health" | Deal health score feature? Or general account health? Default to the feature. |

### Ambiguity Resolution Patterns

**Pattern 1: Best Guess + Alternatives**
```
"I found results for deal health scoring. If you were looking for lead scoring
or account health, try asking about those specifically."
```

**Pattern 2: Clarification Request** (for single-word queries)
```
"Can you be more specific? For example:
- 'deal health scoring' for pipeline health
- 'lead scoring' for inbound qualification
- 'calendar sync' for meeting integration"
```

**Pattern 3: Multiple Results** (when space allows)
```
"Here are results for the most likely interpretation:

[Primary result: Deal health scoring]

If you were looking for something else:
- Lead scoring: [link]
- Account health: [link]"
```

---

## Zero-Result Strategies

When the search returns nothing, the response must still be helpful. Never return an empty result.

### The 5-Step Zero-Result Recovery

```
Step 1: ACKNOWLEDGE honestly
  "I couldn't find documentation on [topic]."

Step 2: RETRY with broader terms
  Drop category filters, use synonym expansion, try parent concepts.
  If retry succeeds: use those results.

Step 3: SUGGEST related topics
  "However, I found articles on [related topic 1] and [related topic 2]
  that might be helpful."

Step 4: OFFER alternatives
  - "Browse all documentation at /docs"
  - "Try asking about [reformulated question]"
  - "Contact support for this specific question"

Step 5: DISTINGUISH between "not documented" and "not possible"
  - Feature exists but docs are missing: "This feature exists but may not have
    dedicated documentation yet."
  - Feature might not exist: "This might not currently be supported. Check the
    feature request board or ask support."
```

### Never Say

| Bad Response | Why It's Bad | Better Response |
|-------------|-------------|----------------|
| "No results found." | Abrupt, unhelpful, dead end | "I couldn't find specific documentation on that topic. Here's what might help..." |
| "Try a different search." | Puts burden on user without guidance | "Try asking about [specific reformulation] instead." |
| "I can't help with that." | Final, discouraging | "I don't have documentation on that yet. You can browse /docs or contact support." |
| [Empty response] | The worst possible outcome | Always provide an alternative path |

---

## Multi-Topic Synthesis Approach

When a user's question naturally spans multiple topics, synthesize across documentation boundaries.

### Topic Bridging

| User Question Pattern | Topics to Bridge | Synthesis Approach |
|----------------------|-----------------|-------------------|
| "How do I [X] AND [Y]?" | Two separate features | Answer each, then explain how they connect |
| "Set up [X] (which requires [Y])" | Feature + prerequisite | Start with prerequisite, then feature |
| "Why is [X] not working?" | Feature + troubleshooting | Explain what it should do, then troubleshoot |
| "What's the best way to [workflow]?" | Multiple features in a workflow | Describe the end-to-end workflow across features |

### Cross-Reference Signals

Include cross-references when:
- The answer to one question naturally leads to another topic
- The user's question implies they need to know about a related feature
- A prerequisite exists that the user may not know about

### Cross-Reference Format

```
"One more thing: [feature] works best when combined with [related feature].
If you haven't set that up yet, see [Related Article Title]."
```

This proactive cross-referencing prevents the user from needing to ask a follow-up question.
