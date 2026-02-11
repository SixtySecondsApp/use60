---
name: Competitor Intel
description: |
  Competitive intelligence and battlecard generation for a specific competitor.
  Use when a user asks "how do we compare to [competitor]", "competitive analysis",
  "what is [competitor] doing", "battlecard for [competitor]", or needs talking points
  against a rival. Returns structured battlecard with comparison, objection handlers,
  and competitive positioning.
metadata:
  author: sixty-ai
  version: "2"
  category: sales-ai
  skill_type: atomic
  is_active: true
  context_profile: research
  agent_affinity:
    - research
  triggers:
    - pattern: "how do we compare to"
      intent: "competitive_comparison"
      confidence: 0.90
      examples:
        - "how do we stack up against"
        - "compare us to"
        - "what makes us different from"
    - pattern: "competitive analysis"
      intent: "competitor_analysis"
      confidence: 0.85
      examples:
        - "competitor analysis for"
        - "competitive intel on"
        - "analyze the competition"
    - pattern: "what is the competitor doing"
      intent: "competitor_monitoring"
      confidence: 0.80
      examples:
        - "what's new with"
        - "what has the competitor launched recently"
        - "competitor news"
    - pattern: "battlecard for"
      intent: "battlecard_generation"
      confidence: 0.90
      examples:
        - "create a battlecard"
        - "give me a battlecard against"
        - "competitive battlecard"
  keywords:
    - "competitor"
    - "competitive"
    - "battlecard"
    - "compare"
    - "versus"
    - "vs"
    - "differentiation"
    - "objection"
    - "rival"
  required_context:
    - competitor_name
    - company_name
  inputs:
    - name: competitor_name
      type: string
      description: "Name of the competitor to research and build a battlecard for"
      required: true
    - name: competitor_website
      type: string
      description: "Competitor's website URL if known"
      required: false
    - name: deal_id
      type: string
      description: "Related deal ID for tailoring competitive positioning to the deal context"
      required: false
  outputs:
    - name: competitor_profile
      type: object
      description: "Competitor overview with name, description, target market, pricing, and key customers"
    - name: comparison
      type: object
      description: "Head-to-head feature comparison with strengths, weaknesses, and neutral areas"
    - name: battlecard
      type: object
      description: "Sales battlecard with elevator pitch, differentiators, landmines, and win themes"
    - name: objection_handlers
      type: array
      description: "Common objections with recommended responses and supporting proof points"
    - name: recent_intel
      type: array
      description: "3-5 recent competitive developments with impact and talking points"
  requires_capabilities:
    - web_search
  priority: high
  tags:
    - sales-ai
    - competitive
    - battlecard
    - positioning
---

# Competitor Intel

## The Philosophy of Competitive Intelligence

Competitive intelligence exists to help reps win deals, not to bash competitors. The distinction matters:

**Bad CI** sounds like: "They're terrible at X, they always break, their customers hate them."
**Good CI** sounds like: "We take a different approach to X. Here's why our approach works better for [specific use case]. Here's a customer who evaluated both and chose us because [specific reason]."

The data supports this approach. According to Gong's analysis of over 1 million sales calls:
- Reps who use competitive battlecards in deals win **65% more competitive deals** than those who don't.
- But reps who directly badmouth competitors see a **12% decrease** in win rates. Buyers don't trust salespeople who trash-talk.
- The most effective competitive positioning uses the "acknowledge-bridge-differentiate" pattern: acknowledge the competitor's strength, bridge to a different evaluation criterion, then differentiate on that criterion.

Your job is to arm the rep with honest, factual competitive intelligence that helps them position ${company_name} as the better choice for this specific buyer -- without resorting to FUD or dishonesty.

## Goal

Generate actionable competitive intelligence and a battlecard that helps sales reps win against a specific competitor. The output must be immediately usable in a live conversation -- concise enough to reference during a call, detailed enough to build confidence.

## Required Capabilities
- **Web Search**: To research competitor information across the web (routed to Gemini with Google Search grounding)

## Inputs
- `competitor_name`: Name of the competitor to research (required)
- `competitor_website`: Competitor's website URL (if known, speeds up research)
- `deal_context`: Current deal context where competitor is involved (if available) -- includes prospect company, deal stage, key stakeholders, and stated requirements
- `organization_id`: Current organization context
- Organization variables: `${company_name}`, `${products}`, `${value_proposition}`

## Data Gathering (via web search)

### Phase 1: Discovery (Run in Parallel)

1. `"[Competitor]" product features pricing` -- what they sell and what it costs
2. `"[Competitor]" vs OR "compared to" OR alternative` -- head-to-head comparisons, analyst reviews
3. `"[Competitor]" review G2 OR Capterra OR TrustRadius` -- customer sentiment and ratings
4. `"[Competitor]" news OR announcement OR launch 2025 OR 2026` -- recent developments
5. `"[Competitor]" funding OR revenue OR employees OR "series"` -- company trajectory
6. `"[Competitor]" customer OR "case study" OR "switched from"` -- customer evidence
7. `"${company_name}" vs "[Competitor]"` -- direct comparison content (if it exists)
8. `"[Competitor]" complaints OR problems OR "switched to"` -- pain points and churn signals

### Phase 2: Deep Dive

Based on Phase 1 results, fetch:
- Competitor's pricing page and feature pages
- G2/Capterra/TrustRadius comparison pages
- Head-to-head blog posts or analyst reviews
- Recent product changelogs or release notes
- Competitor's customer case studies
- Review site "switched from" stories

### Phase 3: Battlecard Assembly

Synthesize all findings into the structured battlecard format below.

## Battlecard Design Principles

An effective battlecard follows these principles. Reference the products, value propositions, and competitive positioning from Organization Context to ground all comparison points, differentiators, and win themes in ${company_name}'s actual capabilities. See `references/battlecard-templates.md` for complete card structures at three depth levels: Quick Reference Card (mid-call), Full Competitive Brief (deal prep), and Displacement Playbook (switchout deals).

### 1. Scannable in 30 seconds
The rep may pull this up MID-CALL. The key differentiators, elevator pitch, and top objection handlers must be visible at a glance. Do not bury the lead.

### 2. Honest and defensible
Every claim must be supportable with evidence. If a prospect fact-checks a claim (and they will), the rep cannot be caught in an exaggeration. Credibility, once lost, is impossible to recover.

### 3. Buyer-centric, not product-centric
The battlecard should be framed around what the BUYER cares about, not what you want to say. "We have feature X" is product-centric. "Teams like yours typically need X because of [business reason]" is buyer-centric.

### 4. Updated regularly
Competitive intelligence decays fast. A battlecard based on 12-month-old data is actively dangerous -- the rep may cite deprecated features or resolved issues. Always note the date of the intelligence.

## Feature Comparison Methodology

Feature comparison is the backbone of the battlecard. It must be honest to be useful.

### How to Assess Each Feature

For each feature area, assign one of these ratings to BOTH ${company_name}'s product and the competitor. Reference the products, value propositions, and competitive positioning from Organization Context to inform these ratings:

| Rating | Definition |
|--------|-----------|
| **Strong** | Clear, well-built capability. Customer reviews confirm it works well. No significant gaps. |
| **Moderate** | Capability exists but has known limitations. Reviews are mixed. Adequate for most use cases but not best-in-class. |
| **Weak** | Capability exists but is rudimentary, unreliable, or poorly reviewed. Known pain point for users. |
| **Absent** | Capability does not exist or is so limited it's functionally absent. |
| **Unknown** | Cannot determine from available information. Note this honestly rather than guessing. |

### Honesty Rules

- **Never rate ${company_name}'s product as "Strong" in an area where reviews say otherwise.** If G2 reviews consistently cite a weakness in ${company_name}'s product, acknowledge it. The rep will lose credibility if they claim strength in an area the prospect has already read is weak.
- **Never rate the competitor as "Weak" without evidence.** "We think they're weak at X" is not evidence. "G2 reviews consistently cite X as a pain point" is evidence. "Their pricing page doesn't mention X" is suggestive but not conclusive.
- **Always note "Absent" vs "Weak."** There's a big difference between "they don't have it at all" and "they have it but it's not great." Conflating these destroys trust.
- **Acknowledge areas where the competitor wins.** A battlecard that claims ${company_name}'s product is better in every dimension is not a battlecard -- it's propaganda, and no rep will trust it. The most useful battlecards clearly identify WHERE you lose so the rep knows which discussions to steer away from.

### Feature Comparison Categories

Structure the comparison around buyer priorities, not product architecture:

1. **Core functionality** -- The primary job-to-be-done that both products serve
2. **Ease of use / UX** -- Onboarding, daily workflow, learning curve
3. **Integrations** -- Which tools it connects with (especially CRM, email, calendar)
4. **Reporting / analytics** -- What insights it provides
5. **Customization** -- How much it can be tailored to specific workflows
6. **Support / success** -- Response times, support channels, CSM availability
7. **Pricing / value** -- Cost relative to capabilities
8. **Security / compliance** -- SOC2, GDPR, enterprise security features
9. **Scalability** -- How it handles growth (more users, more data, more complexity)
10. **AI / automation** -- Intelligent features, workflow automation, AI capabilities

## Objection Handler Development

The best objection handlers follow the **Acknowledge-Bridge-Differentiate (ABD)** framework. See `references/objection-library.md` for a comprehensive library of competitive objections organized by category (Price, Feature, Market Position, Switching Cost, UX, Social Proof) with fully worked ABD responses, proof points, and common mistakes to avoid.

### The ABD Framework

1. **Acknowledge**: Validate the prospect's concern. Never dismiss it. "That's a fair point -- [Competitor] does have [feature/strength]."
2. **Bridge**: Shift the conversation to a criterion that matters more. "What we've found is that most teams in your situation prioritize [different criterion] because..."
3. **Differentiate**: Show how you excel on the bridged criterion. "That's where our approach differs. We [specific differentiation], which means [specific outcome]."

### Example

**Objection**: "[Competitor] seems to have more integrations than you."

**Bad response**: "We have plenty of integrations too."

**ABD response**: "That's a fair point -- [Competitor] has built out a wide integration catalog. What we've found, though, is that integration breadth matters less than integration depth. Most teams use 3-5 core integrations daily. Our [CRM/email/calendar] integrations are bi-directional and real-time, not just one-way data syncs. We'd rather do 20 integrations really well than 200 superficially. Do you have specific integrations that are critical for your workflow? Let's check if we cover those."

### Objection Categories to Cover

For each competitor, develop handlers for these objection types:

1. **"They're cheaper"** -- Price objection. Bridge to total cost of ownership, implementation time, time-to-value.
2. **"They have [feature] and you don't"** -- Feature gap objection. Acknowledge if true. Bridge to alternative approach or roadmap. Differentiate on what you DO have.
3. **"They're the market leader"** -- Market position objection. Acknowledge their scale. Bridge to what that means for the buyer (slower innovation, less attention, one-size-fits-all). Differentiate on agility, focus, or specialization.
4. **"We already use them"** -- Switching cost objection. This is the hardest. See "Competitive Displacement Strategy" section.
5. **"Our team prefers their UI"** -- UX preference objection. Acknowledge taste is subjective. Bridge to workflow efficiency (not just appearance). Differentiate on outcomes, not aesthetics.
6. **"They have better reviews"** -- Social proof objection. Acknowledge if true. Bridge to review demographics (are those reviews from companies like theirs?). Differentiate on relevant customer segment reviews.

## Landmine Questions

Landmine questions are questions the rep asks that subtly expose competitor weaknesses. They must be legitimate questions (things the buyer should actually care about), not gotcha traps.

### Landmine Design Principles

1. **The question must be genuinely important.** If the prospect realizes you're asking a loaded question, you lose trust immediately. The question must be something any thoughtful buyer should ask.
2. **The answer should naturally favor you.** The question should lead to a criterion where you're stronger, without the question itself being obviously biased.
3. **Frame it as helping the buyer evaluate.** "As you're evaluating options, one thing I'd recommend asking any vendor is..." is better than just firing off a question.

### Landmine Question Templates

- **Scalability**: "How does [the solution] handle [specific scenario that tests limits]? We've found that's where tools start to diverge."
- **Total cost**: "Have you mapped out the total cost including implementation, training, and ongoing admin time? Sometimes the sticker price is misleading."
- **Data ownership**: "What happens to your data if you decide to switch providers? How easy is export?"
- **Integration depth**: "Are the integrations real-time and bi-directional, or batch and one-way? That distinction matters a lot in daily workflow."
- **Support model**: "What does their support SLA look like for your tier? Some vendors reserve fast response times for enterprise plans."
- **Roadmap transparency**: "How often do they share their product roadmap? Are you betting on features that might not ship?"

## Win Theme Identification

A win theme is a consistent narrative that resonates across competitive deals. You want 3 win themes -- no more, no fewer. Three is memorable. Five is not.

### How to Identify Win Themes

Win themes emerge from the intersection of three factors:
1. **Where you're objectively stronger** (feature comparison shows "Strong" for you, "Weak" for them)
2. **What buyers consistently value** (G2 reviews, deal win/loss analysis, market research)
3. **What's hardest for the competitor to fix** (architectural limitations, business model constraints, cultural gaps)

The best win themes target competitor weaknesses that are STRUCTURAL, not temporary. A missing feature can be built. A fundamentally different architecture or business model cannot be easily changed.

### Win Theme Format

Each win theme should be:
- **One sentence** that captures the theme
- **One proof point** that makes it concrete
- **One customer quote or data point** that makes it credible

Example:
- **Theme**: "Purpose-built for mid-market teams, not enterprise-scaled-down."
- **Proof point**: "Our average implementation takes 2 weeks vs. their 3 months because we designed for your team size from day one."
- **Evidence**: "Teams that switch from [Competitor] to us report 40% less admin overhead within the first quarter."

## Competitive Displacement Strategy

Winning a net-new deal against a competitor is different from winning a switchout. Displacement deals require overcoming the "switching cost" barrier -- the effort, risk, and organizational politics of changing tools.

### The Switching Cost Equation

Buyers unconsciously calculate: `Benefit of switching > Cost of switching + Risk of switching + Effort of switching`

Your job is to make the left side as large and concrete as possible while making the right side feel manageable.

### Displacement Tactics

1. **Quantify the cost of staying.** What is the prospect losing by staying with the competitor? Lost deals, wasted time, missed insights? Make the status quo expensive.

2. **Minimize switching perception.** "Our migration team handles the entire transition. Your team won't miss a day of productivity." Offer migration support, data import, parallel running period.

3. **Find the catalyst.** Something triggered the evaluation. A contract renewal? A new leader? A bad experience? A competitor price increase? Find it and anchor to it. "You mentioned the renewal is coming up in Q3 -- that's the natural window to make this switch."

4. **Build internal champions.** Switchout deals almost always require an internal advocate who's frustrated enough with the current tool to push through organizational inertia. Identify and arm this person.

5. **Offer proof before commitment.** Pilot, POC, free trial alongside the existing tool. Reduce the perceived risk of switching.

## Recent Intel Monitoring

Competitive intelligence has a shelf life. Here is what matters and what to ignore:

### Always-Track Events (report immediately)
- **New product launch or major feature release** -- changes the competitive comparison
- **Pricing change** -- directly affects win rate and objection handling
- **Acquisition (acquirer or acquired)** -- fundamentally changes competitive dynamic
- **Major security breach or outage** -- creates switching window
- **Leadership change (CEO, CPO, CRO)** -- signals strategic shift
- **Funding round** -- signals growth trajectory and competitive investment

### Track if Relevant (include if it changes positioning)
- **New integration or partnership** -- may close a gap or open a new angle
- **Conference keynote or major demo** -- reveals roadmap and messaging changes
- **Major customer win (especially your prospect's peer)** -- social proof to address
- **Industry analyst coverage** -- Gartner, Forrester, G2 grid changes

### Ignore (noise that doesn't affect deals)
- **Generic press releases** about corporate milestones
- **Social media posts** about company culture
- **Minor product updates** (bug fixes, UI tweaks)
- **Blog posts** about thought leadership (unless they signal a strategic pivot)

## Deal-Specific Competitive Positioning

When `deal_context` is provided, tailor the entire battlecard to the specific prospect:

### Tailoring Framework

1. **Match prospect priorities to your strengths.** If the prospect cares most about ease of use and you win on ease of use, lead with that. If they care most about integrations and you lose on integrations, prepare the bridge.

2. **Anticipate the competitor's pitch.** Based on the prospect's profile (industry, size, use case), predict what the competitor will emphasize. Prepare counters.

3. **Identify the prospect's switching cost.** If they're a current customer of the competitor, the switching cost is the primary obstacle. If they're evaluating from scratch, switching cost is irrelevant -- focus on win themes.

4. **Match customer evidence to the prospect.** "A company in your industry, of similar size, who was evaluating the same options, chose us because..." is the most powerful proof point. Find the closest match.

## The Status Quo: Your Biggest Competitor

In many deals, the real competitor is not another vendor -- it's the status quo. "Doing nothing" or "continuing with spreadsheets/manual processes" wins more deals than any named competitor.

### Recognizing Status Quo Competition
- Prospect says: "We're just exploring," "Not urgent," "We might build this ourselves," "Let me think about it"
- No timeline, no defined buying process, no allocated budget
- Champion is interested but hasn't gotten organizational buy-in

### Defeating the Status Quo
- **Quantify the cost of inaction.** "Every month you delay, your team spends [X hours] on manual [process]. That's [Y dollars] in labor cost and [Z missed opportunities]."
- **Create urgency with external forces.** "Your competitors are already using tools like this. The gap widens every quarter."
- **Make the first step small.** "Let's do a 2-week pilot with just your team. Zero commitment beyond that."
- **Find the pain trigger.** Something made them talk to you. Find it. Amplify it. "You mentioned the board is asking about [metric]. How are you tracking that today?"

## Output Contract

Return a SkillResult with:
- `data.competitor_profile`: Competitor overview with:
  - `name`: Competitor name
  - `website`: URL
  - `description`: What they do (2-3 sentences)
  - `target_market`: Who they sell to (segments, sizes, verticals)
  - `pricing_model`: Known pricing structure (if publicly available). If not public, note "pricing not publicly available -- positioned as enterprise/custom."
  - `company_size`: Employee count or range
  - `funding`: Total funding and last round
  - `growth_trajectory`: Growing, stable, or declining (with evidence)
  - `key_customers`: Notable customers (if known)
  - `market_position`: Where they sit (leader, contender, niche player)
- `data.comparison`: Head-to-head comparison with:
  - `feature_comparison`: Array of feature comparisons across 8-10 categories:
    - `category`: Feature category (from the standard list above)
    - `us`: ${company_name}'s capability ("strong" | "moderate" | "weak" | "absent" | "unknown")
    - `them`: Competitor's capability ("strong" | "moderate" | "weak" | "absent" | "unknown")
    - `notes`: Context, nuance, or evidence for the ratings
    - `evidence_source`: Where the rating came from (review site, product page, personal testing, etc.)
  - `strengths_vs_them`: Array of areas where ${company_name} wins, with proof points
  - `weaknesses_vs_them`: Array of areas where competitor has an edge, with mitigation strategies
  - `neutral`: Array of areas that are roughly equivalent
- `data.battlecard`: Sales battlecard with:
  - `elevator_pitch`: Why ${company_name} over this competitor (2-3 sentences, buyer-centric)
  - `key_differentiators`: Top 3-5 differentiators, each with a proof point and customer evidence
  - `win_themes`: Exactly 3 win themes, each with theme statement, proof point, and evidence
  - `landmines`: 3-5 landmine questions with the question, what answer favors you, and how to follow up
  - `trap_questions`: Questions the competitor might plant against ${company_name} and how to respond using ABD
  - `customer_evidence`: References to wins against this competitor or switching stories
  - `status_quo_messaging`: How to position against "do nothing" if the deal is also competing with inaction
- `data.objection_handlers`: Array of 5-8 common objections, each with:
  - `objection`: What the prospect might say (verbatim, not paraphrased)
  - `category`: "price" | "feature" | "market_position" | "switching_cost" | "ux" | "social_proof"
  - `response`: Recommended response using ABD framework (Acknowledge, Bridge, Differentiate) -- written as the rep would actually say it
  - `proof_points`: Supporting evidence or references
  - `do_not_say`: What to avoid saying in response (common mistakes)
- `data.displacement_strategy`: (if prospect is a current customer of competitor) Strategy with:
  - `catalyst`: What triggered the evaluation
  - `switching_cost_assessment`: How hard it is to switch, and how to mitigate
  - `migration_support`: What ${company_name} offers to ease the transition
  - `timeline`: Recommended switchover approach
- `data.recent_intel`: Array of 3-5 recent competitive developments (always-track events only) with:
  - `date`: Date of development
  - `title`: What happened
  - `impact`: How it affects competitive positioning (specific, not vague)
  - `talking_point`: How to address this with prospects (using ABD if it's a negative for you)
  - `url`: Source URL
- `references`: Array of all source URLs used

## Quality Checklist

Before returning the competitive intelligence, verify:

- [ ] Feature comparison is honest -- you've identified at least 1-2 areas where the competitor wins
- [ ] No unsubstantiated claims (every "strong" or "weak" rating has cited evidence)
- [ ] Objection handlers use ABD framework (not just "here's why we're better")
- [ ] Objection handlers include "do not say" guidance to prevent common mistakes
- [ ] Landmine questions are legitimate questions a buyer should ask (not transparent gotchas)
- [ ] Win themes target structural weaknesses, not temporary gaps
- [ ] Win themes are exactly 3 (not 2, not 5)
- [ ] Elevator pitch is buyer-centric, not product-centric
- [ ] Customer evidence references real, verifiable wins or switching stories (not fabricated)
- [ ] Recent intel is from the last 6 months (not stale)
- [ ] Pricing information is either verified or clearly marked as "not publicly available"
- [ ] Deal-specific tailoring is applied if deal_context is provided
- [ ] The battlecard is scannable -- a rep can reference it mid-call
- [ ] No competitor bashing -- all positioning is professional and factual

## Error Handling

### Competitor not recognized
Search broadly: `"[Competitor Name]" company product`. If multiple matches, present options: "I found several companies that might be [Name]. Could you clarify? [Option A - SaaS tool for X] or [Option B - consulting firm for Y]?" If a website is available, use that to resolve.

### Very new or niche competitor with limited public information
This is common in fast-moving markets. Adjust approach:
- Focus on what IS available: website, LinkedIn, any press mentions
- Extract whatever you can from their marketing (positioning, target market, pricing if listed)
- Note the limitation: "Limited competitive intelligence available -- [Competitor] appears to be early-stage with minimal public presence. Recommend asking the prospect directly what they like about [Competitor] and building the counter-positioning from that."
- Recommend: "If this competitor comes up again, consider requesting a more detailed CI briefing from your team."

### ${company_name} product information not available
If organization variables are not resolved, you cannot build a comparison or battlecard. Instead:
- Provide a thorough competitor profile (who they are, what they sell, how they're positioned)
- Note: "Cannot build head-to-head comparison without ${company_name} product context. Returning competitor analysis only."
- Provide the competitor's weaknesses and common complaints (from reviews) so the rep can identify natural counter-positioning points.

### Competitor recently acquired or merged
Note the acquisition and its implications:
- "Note: [Competitor] was acquired by [Acquirer] in [date]. This may change their pricing, product roadmap, and support model. Recommend monitoring closely."
- Acquisition often creates switching windows -- flag this as an opportunity.

### Competitor has a significantly larger market presence
Do not try to claim parity where it doesn't exist. Instead:
- Acknowledge the competitor's scale
- Position ${company_name}'s advantages that come from being smaller/more focused: faster innovation, better support, purpose-built for the prospect's segment
- Use the "big fish in a small pond" narrative: "They serve everyone. We serve companies exactly like yours."

### Always return at least competitor_profile and recent_intel
Even if comparison data is limited (e.g., missing ${company_name} context), always return the competitor profile and recent intelligence. The rep needs to know who they're up against even if the battlecard is incomplete.
