---
name: Meeting Competitive Intel
description: |
  Extract competitor mentions and positioning signals from meeting transcripts.
  Use when a user asks "what are prospects saying about competitors", "competitive
  intelligence from meetings", "who are we competing against", "competitor mentions
  in meetings", "competitive landscape from calls", or wants to understand how
  prospects perceive competitors. Uses semantic search across all meeting transcripts
  to find competitor mentions, sentiment, and positioning signals.
  Do NOT use for general competitive research (use competitor-intel skill) or
  single-meeting summaries.
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
    - pattern: "competitive intelligence from meetings"
      intent: "meeting_competitive_intel"
      confidence: 0.88
      examples:
        - "competitive insights from my calls"
        - "what did prospects say about competitors in meetings"
        - "competitor intel from transcripts"
    - pattern: "what are prospects saying about competitors"
      intent: "competitor_sentiment"
      confidence: 0.85
      examples:
        - "what do prospects think about competitors"
        - "competitor feedback from meetings"
        - "how do prospects view our competition"
    - pattern: "who are we competing against"
      intent: "competitive_landscape"
      confidence: 0.82
      examples:
        - "who else are they looking at"
        - "which competitors come up in calls"
        - "competitive landscape from meetings"
    - pattern: "competitor mentions in meetings"
      intent: "competitor_mentions"
      confidence: 0.85
      examples:
        - "how often do competitors come up"
        - "competitor name drops in calls"
        - "which competitors are mentioned most"
  keywords:
    - "competitor"
    - "competition"
    - "competitive"
    - "alternative"
    - "comparing"
    - "versus"
    - "vs"
    - "landscape"
    - "battle card"
    - "positioning"
    - "differentiation"
  required_context:
    - user_id
    - competitors
  inputs:
    - name: period
      type: string
      description: "Time period to analyze: 'this_week', 'last_week', 'this_month', 'last_month', 'last_30_days', 'last_90_days'. Defaults to 'last_30_days'."
      required: false
      default: "last_30_days"
    - name: competitor_name
      type: string
      description: "Optional specific competitor to focus on. If omitted, analyzes all known competitors from org context."
      required: false
    - name: include_battle_cards
      type: boolean
      description: "Whether to generate battle card recommendations based on findings"
      required: false
      default: true
  outputs:
    - name: competitor_matrix
      type: object
      description: "Competitor x meeting mention matrix with frequency and context"
    - name: sentiment_by_competitor
      type: object
      description: "Prospect sentiment toward each competitor (positive, neutral, negative)"
    - name: key_quotes
      type: array
      description: "Specific prospect quotes about competitors with context"
    - name: positioning_gaps
      type: array
      description: "Areas where competitors are perceived as stronger"
    - name: positioning_strengths
      type: array
      description: "Areas where ${company_name} is perceived as stronger"
    - name: battle_card_recommendations
      type: array
      description: "Recommended battle card updates based on current prospect feedback"
    - name: trend_analysis
      type: object
      description: "Competitor mention trends over time"
  requires_capabilities:
    - calendar
    - crm
  priority: high
  tags:
    - sales-ai
    - meetings
    - competitive-intelligence
    - analytics
    - positioning
---

## Available Context & Tools
@_platform-references/org-variables.md
@_platform-references/capabilities.md

# Meeting Competitive Intel

## Why Meeting-Sourced Competitive Intelligence Matters

The best competitive intelligence doesn't come from analyst reports or competitor websites. It comes from what prospects say in your meetings.

- **67% of competitive intelligence gathered by sales teams is never shared or acted upon** (Crayon State of CI Report). It lives in individual reps' heads and dies with each conversation.
- **Prospects tell you exactly how they perceive your competition** -- what they like, what they don't, and what they're comparing. This is more valuable than any battle card because it reflects real market perception, not marketing claims.
- **Competitive dynamics shift fast.** A competitor launches a new feature, drops their price, or wins a marquee customer -- and suddenly you're hearing about it in every call. If you're not tracking these signals, you're always reacting instead of anticipating.

This skill mines your meeting transcripts for competitive intelligence, aggregates it across all calls, and turns it into actionable positioning guidance.

## Data Gathering (via execute_action)

1. **Fetch meetings for the period**: `execute_action("get_meetings_for_period", { period, includeContext: true })` -- all meetings with CRM context
2. **Fetch pipeline deals**: `execute_action("get_pipeline_deals", {})` -- correlate competitor mentions with deal stages and outcomes

Use the meeting analytics endpoints for competitive signal extraction:

3. **Semantic search per competitor**: For each competitor in `${competitors}` (and any `competitor_name` input), use the search endpoint (`/api/search`, POST) with queries:
   - "[Competitor Name]"
   - "[Competitor Name] vs"
   - "compared to [Competitor Name]"
   - "looking at [Competitor Name]"
   - "evaluating [Competitor Name]"

4. **Multi-search for general competitive language**: Use `/api/search/multi` (POST) with broad competitive queries:
   - "competitor alternative other vendor"
   - "evaluating comparing options shortlist"
   - "build vs buy in-house solution"
   - "already using another tool"

5. **Ask endpoint for synthesis**: Use `/api/search/ask` (POST) for targeted questions:
   - "What did prospects say about [Competitor Name]?"
   - "Which competitors were mentioned and what was said about them?"
   - "What features or capabilities did prospects compare between vendors?"

6. **Key moments per transcript**: Use `/api/insights/{transcriptId}/key-moments` to find competition-related key moments across meeting transcripts.

7. **Sentiment per transcript**: Use `/api/insights/{transcriptId}/sentiment` to correlate competitor mentions with sentiment shifts.

## Competitor Detection Patterns

### Direct Mentions
Explicit competitor names or product names:
- "We're also looking at [Competitor]"
- "We currently use [Competitor]"
- "[Competitor] showed us their demo last week"
- "How do you compare to [Competitor]?"

### Indirect References
References to competitors without naming them:
- "Another vendor we're evaluating"
- "The other tool we're looking at"
- "One of your competitors offered us..."
- "We saw a similar product that does..."

When indirect references appear, attempt to identify the competitor from context clues (features mentioned, pricing ranges, integration capabilities).

### Build-vs-Buy Signals
Internal development as a competitive alternative:
- "Our engineering team thinks they can build this"
- "We have an internal tool that does some of this"
- "We're considering building our own"

### Status Quo as Competitor
Current processes and tools as alternatives to buying:
- "We've been doing this manually and it works"
- "Our spreadsheet system is fine for now"
- "We're not sure we need a dedicated tool"

## Analysis Framework

### Competitor Mention Matrix

Build a matrix of competitors vs. meetings:

| Competitor | Meeting 1 | Meeting 2 | Meeting 3 | Total |
|-----------|-----------|-----------|-----------|-------|
| Competitor A | Mentioned | - | Mentioned | 2 |
| Competitor B | - | Mentioned | Mentioned | 2 |
| Build-in-house | - | - | Mentioned | 1 |

### Sentiment Analysis per Competitor

For each competitor mention, classify the prospect's sentiment:
- **Positive**: Prospect speaks favorably about the competitor ("They have a great UI")
- **Neutral**: Factual mention without valence ("We're also evaluating them")
- **Negative**: Prospect speaks unfavorably ("Their support is terrible")
- **Comparative**: Prospect directly compares ("They're cheaper but less flexible than you")

### Positioning Signal Extraction

From prospect language, extract signals about how they perceive the competitive landscape:

**Strength signals** (${company_name} is perceived as better):
- "You have better [feature/capability]"
- "We like your approach to [X] more"
- "Your team seems more responsive"

**Gap signals** (competitor is perceived as better):
- "[Competitor] has [feature] that you don't"
- "They're further along on [capability]"
- "Their pricing is more competitive"

**Parity signals** (perceived as similar):
- "You're both pretty similar on [X]"
- "Either would work for [use case]"
- "The features are comparable"

### Win/Loss Correlation

When deal outcomes are available:
- Which competitors appeared in won deals vs. lost deals?
- Were there specific positioning points that correlated with winning?
- Were there specific competitor strengths that correlated with losing?

## Battle Card Generation

Based on findings, generate updated battle card recommendations:

For each competitor with significant mention volume:
1. **Competitor overview**: What prospects say they do (from prospect language, not marketing)
2. **Where they win**: Specific strengths prospects cite
3. **Where they lose**: Specific weaknesses prospects cite
4. **Key differentiators**: How ${company_name} is different (from prospect perspective)
5. **Recommended talk track**: What to say when this competitor comes up
6. **Land mines to set**: Questions to ask early that favor ${company_name}'s strengths
7. **Traps to avoid**: Topics where the competitor is stronger -- redirect the conversation

## Output Contract

Return a SkillResult with:

- `data.competitor_matrix`: Object mapping competitor names to arrays of meeting mentions, each with `meeting_title`, `meeting_date`, `prospect`, `deal_name`, `deal_stage`, `context_snippet`

- `data.sentiment_by_competitor`: Object mapping competitor names to sentiment breakdown:
  - `positive_mentions`: count + example quotes
  - `neutral_mentions`: count + example quotes
  - `negative_mentions`: count + example quotes
  - `overall_sentiment`: positive | neutral | negative | mixed

- `data.key_quotes`: Array of quote objects:
  - `quote`: Verbatim prospect quote
  - `speaker`: Who said it
  - `competitor_referenced`: Which competitor
  - `meeting`: Meeting title and date
  - `deal`: Deal name and stage
  - `sentiment`: positive | neutral | negative
  - `signal_type`: strength | gap | parity | build_vs_buy | status_quo

- `data.positioning_gaps`: Array of gap objects:
  - `area`: Feature, capability, or attribute
  - `competitor`: Which competitor is perceived as stronger
  - `evidence`: Prospect quotes supporting this
  - `frequency`: How often this gap is mentioned
  - `suggested_counter`: How to address this in conversations

- `data.positioning_strengths`: Array of strength objects (same structure as gaps but where ${company_name} is perceived as stronger)

- `data.battle_card_recommendations`: Array of battle card objects per competitor:
  - `competitor_name`: Name
  - `mention_count`: Total mentions in period
  - `where_they_win`: Array of strengths (from prospect perspective)
  - `where_they_lose`: Array of weaknesses (from prospect perspective)
  - `recommended_talk_track`: Suggested positioning statement
  - `landmines`: Discovery questions that favor ${company_name}
  - `traps_to_avoid`: Topics to redirect away from

- `data.trend_analysis`: Object with:
  - `rising_competitors`: Competitors mentioned more this period vs. previous
  - `declining_competitors`: Competitors mentioned less
  - `new_competitors`: First-time mentions
  - `build_vs_buy_trend`: Increasing or decreasing

- `references`: Links to meetings, deals, and transcripts cited

## Quality Checklist

Before returning the analysis, verify:

- [ ] **All known competitors from ${competitors} were searched for.** Even competitors with zero mentions should be noted (absence is informative).
- [ ] **Quotes are from prospects, not the seller's team.** Speaker attribution is correct.
- [ ] **Indirect references are identified when possible.** "Another vendor" should be flagged for identification.
- [ ] **Sentiment classifications match the actual language.** "They have a nice UI" is positive toward the competitor, not negative.
- [ ] **Battle card recommendations are based on prospect perception, not marketing claims.** Use prospect language, not your own positioning.
- [ ] **Build-vs-buy and status-quo signals are included.** These are competitors too.
- [ ] **Gap and strength signals are balanced.** Don't only show where ${company_name} wins -- honest assessment of gaps is more valuable.

## Error Handling

### No competitors defined in organization context
Fall back to searching for general competitive language ("competitor," "alternative," "evaluating," "comparing"). Note: "No specific competitors are configured in your organization settings. Results show general competitive signals. Add competitors in Settings > Organization to get competitor-specific tracking."

### No competitor mentions found
Return: "No competitor mentions were detected in [N] meetings during [period]. This could mean: (1) meetings were early-stage discovery before competitive evaluation, (2) prospects are not evaluating alternatives, or (3) competitive conversations happened outside recorded meetings."

### Semantic search returns low-confidence results
Apply a confidence threshold. Only include results where the search relevance score exceeds 0.6. Note any borderline results as "possible mentions" rather than confirmed.

### Meeting analytics endpoints unavailable
Fall back to CRM deal data for competitive context (competitor fields on deal records). Note: "Meeting transcript search is unavailable. Competitive analysis is based on CRM deal data only. For richer insights, ensure meeting analytics is connected."

## Guidelines

- **Prospect language is gold.** Always use the prospect's exact words when describing perceptions. "They said the competitor's support is terrible" is infinitely more valuable than "competitor has weak support."
- Treat build-vs-buy and status quo as legitimate competitors. A prospect building in-house or sticking with spreadsheets is a competitive threat.
- Focus on actionable intelligence. "Competitor X was mentioned 7 times" is a stat. "Prospects cite Competitor X's lower price in 5 of 7 mentions -- recommend leading with ROI story before pricing discussion" is actionable intelligence.
- Update recommendations based on trends. If a competitor is being mentioned more frequently, that's an early warning signal that deserves immediate attention.
- Cross-reference with deal outcomes when available. Intelligence from lost deals is especially valuable for improving positioning.
- Use ${company_name}'s value propositions and differentiators from Organization Context to craft positioning recommendations that align with the company's strengths.
