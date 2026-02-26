---
name: Lead Qualification
description: |
  Score and qualify an inbound lead against Ideal Customer Profile (ICP) criteria using
  multi-layer intelligence: CRM data, web research enrichment, historical transcript context,
  behavioral signals, and enrichment chaining. Use when a user asks "qualify this lead",
  "is this a good fit", "score this prospect", "ICP check", or needs to assess whether a
  lead is worth pursuing. Returns qualification tier, scoring breakdown, enrichment data,
  and recommended next action.
metadata:
  author: sixty-ai
  version: "3"
  category: sales-ai
  skill_type: atomic
  is_active: true
  context_profile: sales
  agent_affinity:
    - research
    - prospecting
  triggers:
    - pattern: "qualify this lead"
      intent: "lead_qualification"
      confidence: 0.90
      examples:
        - "qualify this prospect"
        - "lead qualification"
        - "run qualification on this lead"
    - pattern: "is this a good fit"
      intent: "fit_assessment"
      confidence: 0.85
      examples:
        - "is this lead a good fit"
        - "does this match our ICP"
        - "would this be a good customer"
    - pattern: "score this prospect"
      intent: "lead_scoring"
      confidence: 0.85
      examples:
        - "score this lead"
        - "lead score"
        - "rate this prospect"
    - pattern: "ICP check"
      intent: "icp_validation"
      confidence: 0.90
      examples:
        - "check against ICP"
        - "ICP fit"
        - "ideal customer profile check"
  keywords:
    - "qualify"
    - "qualification"
    - "score"
    - "ICP"
    - "fit"
    - "prospect"
    - "lead"
    - "inbound"
    - "ideal customer"
    - "enrich"
    - "research"
  required_context:
    - lead_data
    - company_name
  inputs:
    - name: lead_data
      type: object
      description: "Lead information including name, email, company, title, industry, and source"
      required: true
    - name: contact_id
      type: string
      description: "CRM contact ID if the lead already exists in the system"
      required: false
    - name: company_name
      type: string
      description: "Company name for CRM and web enrichment lookup"
      required: false
  outputs:
    - name: qualification_score
      type: number
      description: "Overall weighted qualification score from 0.0 to 5.0"
    - name: qualification_tier
      type: string
      description: "Qualification tier: hot, warm, cold, or disqualified"
    - name: scoring_breakdown
      type: array
      description: "Per-dimension scores with weight, reasoning, and data source"
    - name: next_action
      type: object
      description: "Recommended next step with action, priority, rationale, owner, and timeline"
    - name: enrichment_data
      type: object
      description: "Web search and API enrichment findings: funding, news, tech stack, hiring signals, stakeholder profiles"
    - name: rag_context_used
      type: array
      description: "Historical transcript and activity context that informed qualification decisions"
    - name: behavioral_signals
      type: array
      description: "Intent signals beyond form data: website activity, content engagement, email opens, demo requests"
    - name: confidence_level
      type: string
      description: "Qualification confidence: high, medium, or low based on data completeness across all layers"
  requires_capabilities:
    - crm
    - web_search
  priority: high
  tags:
    - sales-ai
    - qualification
    - leads
    - scoring
    - enrichment
---

## Available Context & Tools
@_platform-references/org-variables.md
@_platform-references/capabilities.md

# Lead Qualification

## Why Qualification Matters

Lead qualification is the single highest-leverage activity in sales:

- **Only 13% of leads become opportunities.** Every hour on a bad lead is stolen from a good one.
- **Unqualified pursuit wastes 67% of sales time.** Qualification is the filter that reclaims it.
- **Speed-to-lead matters exponentially.** Contacting within 5 minutes = 100x more likely to connect than waiting 30 minutes. But speed only matters on the RIGHT leads.
- **Disqualification is a superpower.** The best orgs say "no" the fastest to bad fits.

Your job is not to find reasons to say "yes." Your job is to find the truth -- quickly, honestly, and with enough rigor that the rep can act with confidence.

## Goal

Score an inbound lead against ICP criteria using multi-layer intelligence and provide a clear qualification tier with reasoning and recommended next action. The output must be decisive enough that a rep can act on it immediately without second-guessing.

## Required Capabilities
- **CRM**: Fetch lead data, company information, and existing relationship context
- **Web Search**: Enrich leads with company funding, news, tech stack, and hiring signals

## 5-Layer Intelligence Model

Each layer adds depth. Execute layers in order; later layers build on earlier findings.

### Layer 1: Lead & CRM Context
Gather baseline data from CRM and user input.

1. Check if lead exists in CRM: `execute_action("get_contact", { email: lead_email })`
2. Check company status: `execute_action("get_company_status", { company_name })`
3. Look for existing deals: `execute_action("get_deal", { name: company_name })`
4. Load Organization Context (ICP criteria, products, value propositions) from the block above

### Layer 2: Web Enrichment
Search the web and enrichment APIs for signals not in CRM.

- **Company enrichment**: Search for recent funding rounds, acquisitions, product launches, leadership changes, hiring patterns, and tech stack signals. These directly inform Budget Signals and Company Size dimensions.
- **Contact enrichment**: If AI Ark or Apollo capabilities are available, enrich the contact for title verification, seniority level, reporting structure, social profiles, and career history. This informs Role Authority scoring.
- **Competitive signals**: Check if the company uses a competitor's product (job postings mentioning competitor tools, review site profiles, tech stack detection).

### Layer 3: Historical Context (RAG)
Search meeting transcripts and activity history for relevant context.

- **Past interactions with this company**: Prior demos, discovery calls, support conversations, or any touchpoint. If found, this dramatically changes qualification (they already know you).
- **Similar company win/loss patterns**: Search for transcripts from companies of similar size, industry, and stage. What objections came up? What messaging resonated?
- **Persona pattern matching**: Search for calls with similar titles/roles. What did that persona care about? What made them buy or not buy?
- **Flag when RAG returns nothing**: Distinguish between "first interaction" (no history exists) vs. "data gap" (history may exist but is not indexed).

### Layer 4: Behavioral Signals
Assess intent signals beyond static firmographic data.

- **Website activity**: Pricing page visits, feature page views, comparison page visits, return visit frequency
- **Content engagement**: Case study downloads, webinar attendance, whitepaper downloads, newsletter opens
- **Email engagement**: Open rates, click-throughs, reply rates on any prior outreach
- **High-intent actions**: Demo requests, free trial signups, contact form submissions with detailed notes
- **Low-intent indicators**: Passive form fills, single blog visit, unsubscribed from nurture

Score behavioral signals using the engagement rubric in `references/icp-templates.md`.

### Layer 5: Qualification Synthesis
Combine all layers into a scored qualification using the framework below. Every score must cite which layer(s) provided the evidence.

## Choosing the Right Framework

Select the framework based on context. Consult `references/scoring-frameworks.md` for detailed comparisons, worked examples, conversion data, and the framework selection decision tree.

### BANT (Budget, Authority, Need, Timeline)
**Best for:** Transactional sales, shorter deal cycles, SMB/mid-market. Simple and fast.
**Limitation:** Surface-level. Tells you IF they can buy, not WHY they should buy from you. Use for deal sizes under $25K and high-volume qualification.

### MEDDICC
**Best for:** Enterprise sales, complex deals, long cycles, multi-stakeholder buying committees.
**Limitation:** Requires significant discovery. Use to deepen qualification AFTER initial scoring confirms the lead is worth pursuing.

### The 5-Dimension Scoring Model (Default)
Default framework. Designed for rapid first-pass qualification with incomplete data. Weights dimensions by predictive power based on B2B SaaS conversion data.

## Scoring Framework

Score each dimension 1-5. Use 0 for "cannot assess due to missing data." Cite evidence from specific layers.

### 1. Company Size Fit (weight: 25%)
Strongest single predictor. If ICP says 100-500 employees:
- **5**: Squarely in sweet spot (e.g., 250 employees)
- **4**: Close to ICP, minor deviation (e.g., 80 employees)
- **3**: Edge of range (e.g., 50 employees -- workable but not ideal)
- **2**: Outside ICP but plausible (e.g., 30 employees, well-funded and growing)
- **1**: Far outside range
- **0**: Cannot determine from any layer

### 2. Industry Fit (weight: 25%)
Determines value proposition resonance and proof point availability.
- **5**: Target vertical with proven case studies
- **4**: Adjacent industry with proven use cases
- **3**: Some traction but limited proof
- **2**: Unproven but not disqualifying
- **1**: Industry mismatch or known poor fit
- **0**: Cannot determine

### 3. Role Seniority & Authority (weight: 20%)
Title + company size calibration. Cross-reference with Layer 2 enrichment data.
- **5**: Clear decision-maker with budget authority
- **4**: Strong influencer who can champion internally
- **3**: Mid-level with budget influence but needs approval
- **2**: IC -- may be evaluating but cannot decide
- **1**: No buying authority or unclear role
- **0**: Cannot determine

### 4. Budget Signals (weight: 15%)
Usually indirect. Layer 2 web enrichment (funding, competitor spend) is critical here.
- **5**: Clear budget indicators -- recent funding (Series B+), paying a competitor, explicit budget mention
- **4**: Likely has budget -- company size/stage suggest it, using adjacent paid tools
- **3**: Possible but unconfirmed
- **2**: Constrained signals -- early-stage pre-revenue, recent layoffs
- **1**: Likely no budget
- **0**: Cannot assess

### 5. Timing & Intent (weight: 15%)
Layer 4 behavioral signals are primary data source. Behavioral signals (what they DID) outweigh demographics (who they ARE).
- **5**: Active evaluation -- demo request, pricing page visit, competitive mention, stated urgency
- **4**: Engaged and showing intent -- solution content, product webinar, pricing page
- **3**: Interested but early -- blog subscriber, general content, industry webinar
- **2**: Cold inbound with no clear intent
- **1**: Very early or no timing signal
- **0**: Cannot determine

## Source Quality Weighting

Apply multiplier to final score:

| Source | Multiplier | Rationale |
|--------|-----------|-----------|
| Customer referral | 1.25x | 4x conversion rate vs cold inbound |
| Partner referral | 1.15x | Strong signal, less trust transfer |
| Demo request (direct) | 1.15x | Explicit high intent |
| Content inbound | 1.0x | Baseline |
| Event/conference | 1.0x | Mixed signal |
| Outbound (cold) | 0.9x | Requires more nurturing |
| Purchased list | 0.8x | Lowest quality |

## Existing Relationship Detection

Before scoring, check CRM for existing context. This changes qualification dramatically:
- **Already a customer**: Expansion/cross-sell opportunity. Route to account manager.
- **Open deal exists**: Different stakeholder on same opportunity. Connect with deal owner AE.
- **Past customer (churned)**: Check churn reason. If resolved, score boost. If fundamental, penalty.
- **Known contact, no deal**: Check prior engagement history.
- **Mutual connections**: Shared investors, board members, or advisors = warm path.

## Qualification Tiers

- **Hot** (>= 4.0): Fast-track. Book meeting within 24 hours.
- **Warm** (3.0 - 3.9): Good potential, needs nurturing. Follow up within 48 hours.
- **Cold** (2.0 - 2.9): Low priority. Add to nurture sequence.
- **Disqualified** (< 2.0): Does not meet minimum criteria. Log specific reason and close.

## Enrichment Chaining

When qualification data is insufficient, chain to other skills for deeper enrichment:

| Condition | Chain To | What It Adds |
|-----------|----------|-------------|
| Score 2.5-3.5, medium/low confidence | `lead-research` | Company deep-dive: tech stack, org chart, recent news, competitive landscape |
| Contact data sparse (no title, no LinkedIn) | `sales-enrich` | AI Ark/Apollo enrichment: verified title, seniority, direct phone, social profiles |
| Borderline ICP fit, need competitive context | `lead-research` then `competitor-intel` | Full competitive positioning for the specific company |

**When to chain automatically vs. recommend**: If confidence is Low and the lead source is high-value (referral, demo request), recommend chaining in the next_action. If confidence is Medium, note it in missing_info with impact estimate. Never auto-chain on Disqualified leads.

## Common Qualification Mistakes to Avoid

1. **Title bias**: A VP who casually browsed is worth less than a Manager who requested a demo. Intent trumps title.
2. **Big logo bias**: A Fortune 500 with no intent is worse than a 200-person company matching every criterion.
3. **Recency bias**: Score methodically, not by how recently the lead arrived.
4. **Optimism bias**: Missing data = score 0, not 3. Uncertainty is not evidence of fit.
5. **Sunk cost reluctance**: If it scores below 2.0 after enrichment, disqualify it.
6. **Source worship**: Referrals get a multiplier boost, not an override of a score of 1.5.

## Output Contract

Return a SkillResult with:

- `data.qualification_score`: Weighted score (0.0 - 5.0), source multiplier applied
- `data.qualification_tier`: "hot" | "warm" | "cold" | "disqualified"
- `data.confidence_level`: "high" | "medium" | "low" based on data completeness across all 5 layers
- `data.scoring_breakdown`: Array of dimension scores with `dimension`, `score`, `weight`, `reasoning`, `data_source`, `layer_sources` (which layers contributed)
- `data.source_multiplier`: Multiplier applied with justification
- `data.qualification_summary`: 2-3 sentences. Lead with verdict, then evidence.
- `data.strengths`: Positive indicators (why this lead might convert)
- `data.concerns`: Risk factors or gaps
- `data.missing_info`: Data points that would improve accuracy, with score swing estimate
- `data.next_action`: `action`, `priority`, `rationale`, `suggested_owner`, `timeline`
- `data.existing_relationship`: CRM relationship context
- `data.framework_recommendation`: For Hot/Warm, which deeper framework to use for discovery
- `data.enrichment_data`: Object with web search and API enrichment findings (funding, news, tech stack, hiring, stakeholder profiles). Empty object if enrichment unavailable.
- `data.rag_context_used`: Array of historical context items used (transcript snippets, activity summaries, pattern matches). Empty array if no RAG results.
- `data.behavioral_signals`: Array of intent signals observed (each with signal type, strength, and recency). Empty array if no behavioral data.

## Graceful Degradation

| Failure Mode | Behavior | Output Note |
|-------------|----------|-------------|
| No lead data at all | Ask user for minimum: company name + title | Template provided in response |
| Only name/email | CRM lookup. If not found, low-confidence preliminary score | "1 of 5 dimensions scorable. Recommend enrichment." |
| CRM API failure | Score from available data, flag gaps | "CRM lookup failed. Existing relationship unknown." |
| Web search unavailable | Skip Layer 2, proceed with Layers 1, 3-5 | "Web enrichment unavailable. Budget/company signals may be incomplete." |
| RAG returns nothing | Distinguish first interaction vs data gap | "No prior interactions found. Scoring without historical context." |
| Behavioral data missing | Score Timing & Intent from source + stated intent only | "No behavioral tracking data. Intent score based on source signal only." |
| Enrichment API failure | Proceed without enrichment, flag in missing_info | "Contact enrichment failed. Title/seniority unverified." |
| Borderline score (within 0.3 of tier boundary) | Call out explicitly with swing factor | "Score 2.8 is 0.2 below Warm. Key swing factor: [specific]." |
| Conflicting data | Explain conflict and resolution approach | "Title says VP but company is 5 people. Scoring authority at 3." |
| Competitor/student/spam | Immediate disqualification, no scoring | "Disqualified: [specific reason]." |

Always return something. A low-confidence score with caveats and a "get more data" next action is better than silence.

## Quality Checklist

Before returning, verify:

- [ ] Every dimension has an explicit score with cited evidence and layer source
- [ ] Dimensions with missing data scored 0 (not guessed at 3)
- [ ] Confidence level reported honestly, reflecting data coverage across all 5 layers
- [ ] Source multiplier applied and explained
- [ ] Existing CRM relationships checked and flagged
- [ ] Web enrichment attempted (or noted as unavailable)
- [ ] RAG context searched (or noted as first interaction)
- [ ] Behavioral signals assessed (or noted as unavailable)
- [ ] Summary leads with verdict, not analysis
- [ ] Next action is specific and actionable with timeline and owner
- [ ] Missing info includes impact assessment
- [ ] Enrichment chaining recommended where applicable
- [ ] Disqualification (if applicable) includes clear, specific reason

## Guidelines
- Use ICP criteria from Organization Context to calibrate scoring. See `references/icp-templates.md` for ICP templates, example ICPs for 5 business types, scoring calibration examples, anti-ICP patterns, and ICP evolution guidance.
- If critical data is missing, score that dimension 0. Do NOT assume a midpoint.
- Apply source quality multiplier as described above.
- Check for existing CRM relationships and flag prominently.
- Be decisive with the tier. "This could be warm or cold depending on..." is not helpful.
- Suggest enrichment chaining for borderline leads (score 2.5-3.5, medium/low confidence).
- Consult `references/scoring-frameworks.md` for BANT/MEDDICC worked examples, framework selection decision tree, conversion rate data, and score recalibration guidance.
