---
name: Meeting Objection Tracker
description: |
  Extract and track objections across multiple meetings to find patterns, frequency,
  and trends. Use when a user asks "what objections came up", "common objections",
  "objection patterns", "track objections", "what pushback are we getting", or wants
  to understand recurring objections across their sales conversations. Aggregates
  objection data across ALL meetings using semantic search and key moment analysis --
  unlike coaching-analysis which grades objection handling for a single call.
  Do NOT use for single-meeting coaching or meeting summaries.
metadata:
  author: sixty-ai
  version: "2"
  category: sales-ai
  skill_type: atomic
  is_active: true
  context_profile: sales
  agent_affinity:
    - meetings
    - pipeline
  triggers:
    - pattern: "what objections came up"
      intent: "objection_review"
      confidence: 0.88
      examples:
        - "what objections did I hear"
        - "objections from my calls"
        - "what pushback came up"
    - pattern: "common objections"
      intent: "objection_patterns"
      confidence: 0.85
      examples:
        - "most common objections"
        - "recurring objections"
        - "what objections keep coming up"
    - pattern: "objection patterns"
      intent: "objection_analysis"
      confidence: 0.82
      examples:
        - "objection trends"
        - "analyze objections across meetings"
        - "objection frequency"
    - pattern: "track objections"
      intent: "objection_tracking"
      confidence: 0.80
      examples:
        - "track my objections"
        - "objection tracker"
        - "log of objections"
  keywords:
    - "objection"
    - "pushback"
    - "concern"
    - "hesitation"
    - "blocker"
    - "resistance"
    - "objections"
    - "common"
    - "pattern"
    - "recurring"
    - "overcome"
  required_context:
    - user_id
  inputs:
    - name: period
      type: string
      description: "Time period to analyze: 'this_week', 'last_week', 'this_month', 'last_month', 'last_30_days', 'last_90_days'. Defaults to 'last_30_days'."
      required: false
      default: "last_30_days"
    - name: category_filter
      type: string
      description: "Filter by objection category: 'pricing', 'timing', 'competition', 'authority', 'status_quo', 'technical', 'all'. Defaults to 'all'."
      required: false
      default: "all"
    - name: deal_id
      type: string
      description: "Optional deal ID to focus objection analysis on a specific deal's meetings"
      required: false
  outputs:
    - name: objection_inventory
      type: array
      description: "All objections grouped by category with frequency, source meetings, and quotes"
    - name: frequency_ranking
      type: array
      description: "Objections ranked by how often they appear"
    - name: prospect_map
      type: object
      description: "Which prospects raised which objections"
    - name: suggested_responses
      type: array
      description: "Recommended responses based on patterns from won deals"
    - name: trend_analysis
      type: object
      description: "New vs recurring objections, emerging patterns"
    - name: recommendations
      type: array
      description: "Strategic recommendations for addressing top objections"
  requires_capabilities:
    - calendar
    - crm
  priority: high
  tags:
    - sales-ai
    - meetings
    - objections
    - analytics
    - patterns
---

## Available Context & Tools
@_platform-references/org-variables.md
@_platform-references/capabilities.md

# Meeting Objection Tracker

## Why Tracking Objections Across Meetings Matters

Individual objection handling is a skill. Objection pattern recognition is a strategy.

- **The same 5-7 objections account for 80% of all pushback** (Gong analysis of 2M+ sales calls). If you know what's coming, you can prepare killer responses in advance.
- **Reps who prepare for the top 3 objections before a call close 27% more deals** (RAIN Group). But most reps don't know what their top objections are -- they handle them reactively.
- **Objection patterns reveal product-market fit gaps.** When every prospect says "we can't justify the price," that's not a sales problem -- it's a positioning or product problem.
- **New objections are leading indicators.** If a competitor launched a feature last month and you're suddenly hearing about it in calls, you need to know immediately.

This skill aggregates objections across all meetings to give you -- and your team -- a systematic view of what's blocking deals and how to address it.

## Objection Categories

Classify every objection into one of these categories:

### Pricing
Concerns about cost, budget, ROI, or value-for-money.
- "That's more than we budgeted for"
- "Can you do better on the price?"
- "We can't justify the cost"
- "Your competitor is cheaper"
- "We need to see ROI before committing"

### Timing
Concerns about when to buy, urgency, or readiness.
- "We're not ready yet"
- "Let's revisit next quarter"
- "We have other priorities right now"
- "The timing isn't right"
- "We need more time to evaluate"

### Competition
References to alternatives, competitors, or build-vs-buy.
- "We're also looking at [competitor]"
- "How are you different from [competitor]?"
- "Our engineering team thinks they can build this"
- "We already have a tool that does some of this"
- "We've had demos with three other vendors"

### Authority
Concerns about decision-making power, stakeholders, or approval process.
- "I need to run this by my boss"
- "Our procurement team handles this"
- "The board needs to approve"
- "I can't make this decision alone"
- "Legal has to review everything"

### Status Quo
Resistance to change, comfort with current process, or inertia.
- "Our current process works fine"
- "We've always done it this way"
- "The team doesn't want another tool"
- "Change management is hard for us"
- "We tried something similar before and it didn't work"

### Technical
Concerns about product capabilities, integration, or security.
- "Does it integrate with [system]?"
- "We need [specific feature] and you don't have it"
- "What about data security?"
- "Our IT team has concerns about [X]"
- "Can it handle our scale?"

### Trust
Concerns about the vendor, company stability, or relationship.
- "We've never heard of you"
- "How long have you been around?"
- "Can you share references in our industry?"
- "What happens if you get acquired?"
- "We had a bad experience with a similar vendor"

## Data Gathering (via execute_action)

1. **Fetch meetings for the period**: `execute_action("get_meetings_for_period", { period, includeContext: true })` -- all meetings with attendee and deal context
2. **Fetch deals for context**: `execute_action("get_pipeline_deals", {})` -- correlate objections with deal stages and outcomes

Use the meeting analytics endpoints to find objection language across transcripts:

3. **Semantic search for objections**: Use the search endpoint (`/api/search`, POST) with queries targeting objection language:
   - "objection concern hesitation pushback"
   - "too expensive pricing budget cost"
   - "not ready timing next quarter later"
   - "competitor alternative comparison"
   - "need approval authority decision"
   - "current process works fine status quo"
   - "integration security technical requirement"

4. **Ask endpoint for analysis**: Use the RAG ask endpoint (`/api/search/ask`, POST) with targeted questions:
   - "What objections or concerns did prospects raise?"
   - "What pricing concerns came up in meetings?"
   - "What competitor mentions appeared?"

5. **Key moments**: Use the insights endpoint (`/api/insights/{transcriptId}/key-moments`) to find moments tagged as objections or blockers for each meeting transcript.

6. **Sentiment analysis**: Use `/api/insights/{transcriptId}/sentiment` to correlate objection moments with sentiment dips.

## Objection Extraction Rules

### What Counts as an Objection

An objection is a statement from a prospect or customer that:
1. **Expresses resistance** to moving forward
2. **Raises a concern** about the product, price, timing, or vendor
3. **References an alternative** (competitor, build-in-house, status quo)
4. **Defers or delays** a decision

### What Does NOT Count

- Internal discussion between seller-side participants
- Questions seeking clarification without resistance (e.g., "How does the integration work?" is a question, not an objection)
- Positive conditions ("If the pricing works, we'd love to move forward" -- this is conditional interest, not an objection)
- Restated seller-side talking points

### Confidence Scoring

- **High confidence**: Explicit pushback language ("We can't do that," "That's a dealbreaker," "We're going with [competitor]")
- **Medium confidence**: Hedging or deferral language ("We'd need to think about that," "That might be a concern for our team")
- **Low confidence**: Indirect signals (long pause after pricing, topic change after feature question, sentiment dip without explicit language)

## Analysis Framework

### Frequency Analysis

Rank all objections by how often they appear across meetings:
- Count unique instances (not the same objection repeated within one meeting)
- Note which objection categories dominate
- Flag any category with >30% of total objections as a "systemic pattern"

### Trend Analysis

Compare objections across time periods:
- **New objections**: Appeared for the first time in this period
- **Recurring objections**: Appeared in both this period and previous periods
- **Resolved objections**: Appeared before but not in this period
- **Escalating objections**: Appearing more frequently than before

New objections deserve special attention -- they may signal competitor moves, market shifts, or emerging product gaps.

### Prospect Mapping

Map objections to specific prospects and deals:
- Which prospects raised which objections?
- Do certain prospect profiles (industry, size, stage) cluster around certain objections?
- Are there objections unique to enterprise vs. mid-market vs. SMB?

### Win/Loss Correlation

When deal outcome data is available:
- Which objections appeared in won deals? (These were successfully handled)
- Which objections appeared in lost deals? (These may be unresolved)
- Are there objections that correlate strongly with deal loss?

### Response Effectiveness

From won deals, extract how objections were handled:
- What did the rep say after the objection?
- Did the prospect's sentiment improve after the response?
- Can we extract reusable response patterns?

## Output Contract

Return a SkillResult with:

- `data.objection_inventory`: Array of objection objects, each with:
  - `category`: pricing | timing | competition | authority | status_quo | technical | trust
  - `objection_text`: The core objection (normalized/deduplicated across meetings)
  - `frequency`: Number of times this objection appeared
  - `meetings`: Array of meeting references (title, date, prospect name)
  - `example_quotes`: 2-3 verbatim quotes from transcripts
  - `deals_affected`: Array of deal names/IDs where this objection appeared
  - `confidence`: high | medium | low

- `data.frequency_ranking`: Array of `{ objection, category, count, pct_of_total }` sorted by frequency descending

- `data.prospect_map`: Object mapping prospect names to their objections: `{ "Prospect A": ["pricing", "timing"], "Prospect B": ["competition"] }`

- `data.suggested_responses`: Array of response suggestions, each with:
  - `objection`: The objection being addressed
  - `suggested_response`: Recommended response language
  - `source`: "won_deal_pattern" | "best_practice" | "product_positioning"
  - `evidence`: Why this response works (won deal reference or best practice citation)

- `data.trend_analysis`: Object with:
  - `new_objections`: Array of objections appearing for the first time
  - `recurring_objections`: Array with frequency comparison
  - `resolved_objections`: Array of objections no longer appearing
  - `escalating_objections`: Array with increasing frequency

- `data.recommendations`: Array of strategic recommendations:
  - `action`: What to do
  - `reason`: Why (based on data)
  - `priority`: critical | high | medium
  - `category`: Which objection category this addresses

- `references`: Links to meetings, deals, and transcripts cited

## Quality Checklist

Before returning the analysis, verify:

- [ ] **Objections are from prospects, not internal team members.** Speaker attribution is correct.
- [ ] **Deduplication is applied.** The same objection phrased differently in two meetings counts as one recurring objection, not two unique ones.
- [ ] **Categories are accurate.** "Your competitor is cheaper" is both competition AND pricing -- categorize by the dominant concern (pricing in this case).
- [ ] **Quotes are verbatim.** Do not paraphrase or clean up prospect language.
- [ ] **Frequency counts are unique-meeting counts.** An objection raised 3 times in the same meeting counts as 1 occurrence from that meeting.
- [ ] **Suggested responses are appropriate.** Don't suggest dismissive or aggressive responses. All suggestions should be professional, empathetic, and value-focused.
- [ ] **Trend analysis uses consistent time windows.** Compare same-length periods.

## Error Handling

### No meetings with transcripts in the period
Return: "No meeting transcripts found for [period]. Objection tracking requires recorded meetings with transcripts. Consider enabling meeting recording for future calls."

### No objections found
Return: "No objections were detected in [N] meetings during [period]. This could mean: (1) meetings were primarily internal, (2) meetings were early-stage discovery without pushback, or (3) transcripts lack sufficient detail. If objections were raised but not captured, consider checking transcript quality."

### Semantic search returns too many results
Filter results by confidence score. Only include high and medium confidence objections. Discard anything that is clearly a question rather than pushback.

### Single meeting in period
Generate the analysis but note: "Only 1 meeting with transcript data in [period]. Pattern analysis requires multiple meetings -- this is a single-meeting snapshot. For pattern insights, widen the time range."

## Guidelines

- Focus on patterns, not isolated incidents. A single objection in one meeting is a data point. The same objection across 5 meetings is a pattern.
- Use ${company_name}'s value propositions and differentiators from Organization Context to craft suggested responses that are specific to the product.
- Reference ${competitors} when analyzing competition-category objections for targeted competitive responses.
- Be constructive, not alarming. "Pricing is your most common objection -- here's how top performers handle it" is better than "Everyone thinks you're too expensive."
- When objections correlate with deal losses, frame recommendations as opportunities: "Deals with unresolved timing objections close at 15% vs. 45% for deals where timing was addressed -- here's how to address it earlier."
