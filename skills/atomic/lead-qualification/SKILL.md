---
name: Lead Qualification
description: |
  Score and qualify an inbound lead against Ideal Customer Profile (ICP) criteria.
  Use when a user asks "qualify this lead", "is this a good fit", "score this prospect",
  "ICP check", or needs to assess whether a lead is worth pursuing.
  Returns qualification tier, scoring breakdown, and recommended next action.
metadata:
  author: sixty-ai
  version: "2"
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
  requires_capabilities:
    - crm
  priority: high
  tags:
    - sales-ai
    - qualification
    - leads
    - scoring
---

## Available Context & Tools
@_platform-references/org-variables.md
@_platform-references/capabilities.md

# Lead Qualification

## Why Qualification Matters

Lead qualification is the single highest-leverage activity in sales. The data is unambiguous:

- **Only 13% of leads become opportunities.** The other 87% consume time, attention, and pipeline capacity without converting. Every hour spent on a bad lead is an hour stolen from a good one.
- **Unqualified pursuit wastes 67% of sales time.** Forrester research consistently shows that reps spend two-thirds of their time on leads that will never close. Qualification is the filter that reclaims that time.
- **Speed-to-lead matters exponentially.** Harvard Business Review found that contacting a lead within 5 minutes of inquiry makes you 100x more likely to connect than waiting 30 minutes. But speed only matters if you're fast on the RIGHT leads. Being fast on a bad lead just means you wasted time faster.
- **Disqualification is a superpower.** The best sales orgs are not the ones that pursue the most leads -- they're the ones that say "no" the fastest to bad fits. Every disqualified lead is a gift of time back to the pipeline.

Your job is not to find reasons to say "yes." Your job is to find the truth -- quickly, honestly, and with enough rigor that the rep can act with confidence.

## Goal

Score an inbound lead against ICP criteria and provide a clear qualification tier with reasoning and recommended next action. The output must be decisive enough that a rep can act on it immediately without second-guessing.

## Required Capabilities
- **CRM**: To fetch lead data, company information, and existing relationship context

## Inputs
- `lead_data`: Lead information -- can come from CRM or be provided directly. Includes any of:
  - `name`: Lead's full name
  - `email`: Email address
  - `company_name`: Company name
  - `title`: Job title
  - `company_size`: Number of employees
  - `industry`: Industry vertical
  - `source`: How the lead came in (inbound, referral, event, etc.)
  - `notes`: Any additional context or notes
- `contact` (optional): from `execute_action("get_contact", { email: lead_email })` if lead exists in CRM
- `company_status` (optional): from `execute_action("get_company_status", { company_name })` if company is known
- `organization_id`: Current organization context
- Organization context: ICP criteria, products, and value propositions from the Organization Context block above

## Data Gathering (via execute_action)
1. Check if lead already exists in CRM: `execute_action("get_contact", { email: lead_email })`
2. Check company status in CRM: `execute_action("get_company_status", { company_name })`
3. Look for existing deals with the company: `execute_action("get_deal", { name: company_name })`
4. (Optional) If web enrichment is needed, note it as a recommendation rather than executing inline

## Choosing the Right Framework

Different organizations benefit from different qualification frameworks. Select based on context. Consult `references/scoring-frameworks.md` for detailed framework comparisons, scoring rubrics with worked examples, conversion rate data, and a framework selection decision tree.

### BANT (Budget, Authority, Need, Timeline)
**Best for:** Transactional sales, shorter deal cycles, SMB/mid-market. Simple and fast.
- Budget: Can they afford it?
- Authority: Are you talking to the decision-maker?
- Need: Do they have the problem you solve?
- Timeline: Are they buying soon?

**Limitation:** BANT is buyer-centric but surface-level. It tells you IF they can buy, but not WHY they should buy from you specifically. Use BANT when deal sizes are small and you need to qualify at volume.

### MEDDICC (Metrics, Economic Buyer, Decision Criteria, Decision Process, Identify Pain, Champion, Competition)
**Best for:** Enterprise sales, complex deals, long cycles, multi-stakeholder buying committees. Deep and thorough.
- Metrics: What measurable outcomes do they need?
- Economic Buyer: Who signs the check?
- Decision Criteria: What will they evaluate on?
- Decision Process: What steps will they follow?
- Identify Pain: What specific pain drives urgency?
- Champion: Who inside will advocate for you?
- Competition: Who else are they evaluating?

**Limitation:** MEDDICC requires significant discovery. You won't have most of these answers on first qualification. Use MEDDICC to deepen qualification AFTER initial scoring confirms the lead is worth pursuing.

### The 5-Dimension Scoring Model (Default)
This is the default framework used below. It maps to both BANT and MEDDICC dimensions but is designed for rapid first-pass qualification where you may have incomplete data. It weights dimensions by their predictive power based on conversion data across B2B SaaS.

## Scoring Framework

Score each dimension on a 1-5 scale. Be honest -- a 3 is not "we don't know," it's "the evidence is mixed." Use 0 for "cannot assess due to missing data."

### 1. Company Size Fit (weight: 25%)

Company size is the strongest single predictor of ICP fit. If the company is too small, they lack budget. If too large, your product may not match their complexity requirements or procurement process.

- **5**: Squarely in ICP sweet spot (e.g., ICP says 100-500 employees, company has 250)
- **4**: Close to ICP, minor deviation (e.g., 80 employees when sweet spot starts at 100)
- **3**: On the edge of ICP range (e.g., 50 employees when ICP is 100-500 -- workable but not ideal)
- **2**: Outside ICP but plausible (e.g., 30 employees but well-funded and growing fast)
- **1**: Far outside ICP range (e.g., 5-person startup or 50,000-employee enterprise when you sell mid-market)
- **0**: Cannot determine company size from available data

**Calibration guidance:** If the Organization Context above specifies ICP size ranges, use those. If not, use industry norms for the product category. When in doubt about whether a borderline company qualifies, look for compensating factors (growth rate, funding, department size) before scoring.

### 2. Industry Fit (weight: 25%)

Industry determines whether your solution's value proposition resonates and whether you have proof points (case studies, references, domain expertise) that accelerate the sale.

- **5**: Target industry vertical with proven case studies and references
- **4**: Adjacent industry with proven use cases (e.g., FinTech when you sell to Financial Services)
- **3**: Industry where ${company_name} has some traction but limited proof
- **2**: Unproven industry but not inherently disqualifying (no negative signals)
- **1**: Industry mismatch or known poor fit (e.g., government when you only do commercial)
- **0**: Cannot determine industry from available data

**Calibration guidance:** A 5 requires that your org has won and retained customers in this exact vertical. A 4 means you've won in something close enough that references translate. Do not give a 5 just because the industry sounds good -- you need evidence of traction.

### 3. Role Seniority & Authority (weight: 20%)

The person's title and role determine whether they can make or meaningfully influence the buying decision. This dimension has the widest variance -- a VP at a 50-person startup has different authority than a VP at a Fortune 500.

- **5**: Clear decision-maker with budget authority (VP+, C-level, Founder at companies <500 people; SVP/C-level at enterprise)
- **4**: Strong influencer who can champion internally (Director, Senior Manager, Head of Department)
- **3**: Mid-level with budget influence but needs upward approval (Manager with P&L, Team Lead with vendor selection input)
- **2**: Individual contributor -- may need champion building; could be evaluating but cannot decide
- **1**: No buying authority, unclear role, or role completely unrelated to the product category
- **0**: Cannot determine role or seniority from available data

**Calibration guidance:** Title inflation is real, especially at startups. A "Director" at a 20-person company is often an IC. Cross-reference title against company size. Also: a lower-titled person who actively requested a demo is often more valuable than a C-level who passively attended a webinar.

### 4. Budget Signals (weight: 15%)

Budget signals are almost always indirect. You rarely know the actual budget at qualification stage. Instead, you're reading proxy signals: funding, company stage, stated spend patterns, technology investments.

- **5**: Clear budget indicators -- recent funding (Series B+), known spend in your product category, explicit budget mention in notes, or currently paying a competitor
- **4**: Likely has budget -- company size and stage suggest it, department is established and growing, using adjacent paid tools
- **3**: Budget possible but unconfirmed -- mid-stage company, no negative signals, but no positive ones either
- **2**: Budget constrained signals -- early-stage startup pre-revenue, recent layoffs, public financial difficulties, or known to be extremely cost-sensitive
- **1**: Likely no budget -- very early stage, bootstrapped micro-company, or industry known for extreme budget constraints
- **0**: Cannot assess budget from available data

**Calibration guidance:** Funding is the strongest positive signal (Series B+ companies are 3x more likely to convert than seed-stage). Recent layoffs are the strongest negative signal. But neither is absolute -- profitable bootstrapped companies can have plenty of budget, and post-layoff companies sometimes accelerate tool purchases to improve efficiency.

### 5. Timing & Intent (weight: 15%)

Timing separates "good fit" from "good fit RIGHT NOW." The same lead can be a 2 or a 5 depending on where they are in the buying cycle.

- **5**: Active evaluation -- demo request, pricing page visit, competitive mention, RFP in progress, or stated urgency ("we need to solve this by Q2")
- **4**: Engaged and showing intent -- downloaded solution-category content, attended product webinar, visited pricing page, or asked a specific product question
- **3**: Interested but early -- blog subscriber, general content consumer, attended industry (not product) webinar
- **2**: Cold inbound with no clear intent signal -- form fill with no context, generic "just looking around" inquiry
- **1**: Very early or no timing -- academic interest, student, researcher, or explicitly stated "not looking to buy for 12+ months"
- **0**: Cannot determine intent from available data

**Calibration guidance:** Behavioral signals (what they DID) always outweigh demographic signals (who they ARE). A manager who requested a demo scores higher on timing than a VP who was auto-enrolled in a drip campaign.

## Source Quality Weighting

Not all leads are created equal. The source of the lead carries significant predictive power for conversion, independent of the lead's firmographic fit.

Apply these multipliers to the final weighted score:

| Source | Multiplier | Rationale |
|--------|-----------|-----------|
| **Referral from customer** | 1.25x | Referral leads convert at 4x the rate of cold inbound. They come pre-warmed with trust transfer. |
| **Referral from partner** | 1.15x | Strong signal but less trust transfer than customer referrals. |
| **Demo request (direct)** | 1.15x | Explicit high intent. They sought you out. |
| **Inbound from content** | 1.0x | Baseline. Good signal of awareness but not necessarily intent. |
| **Event/conference lead** | 1.0x | Mixed signal. Could be high intent or just collecting swag. Look at booth engagement depth. |
| **Outbound (cold)** | 0.9x | You found them, not the other way around. Requires more nurturing. |
| **Purchased list** | 0.8x | Lowest quality. Data accuracy issues compound with low intent. |

**Important:** These multipliers are guidelines, not gospel. A highly engaged outbound lead can absolutely outscore a passive inbound referral. Use the multiplier as a starting tiebreaker, not as a veto.

## Existing Relationship Detection

Before scoring, always check the CRM for existing relationship context. This can dramatically change the qualification outcome:

### Already a Customer
- Flag this immediately. This is likely an expansion, cross-sell, or second-product opportunity.
- Score should be assessed differently -- ICP fit is already proven, authority/budget dynamics are different.
- Next action: route to account manager or expansion team, not new-business SDR.

### Open Deal Exists
- Flag the existing deal and its stage. This lead may be a different stakeholder on the same opportunity (multi-threading) or a sign of organizational confusion.
- Next action: connect with the AE owning the existing deal before any independent outreach.

### Past Customer (Churned)
- High-value signal. They already know the product. Check churn reason.
- If churned for reasons now resolved (missing feature that's been built, price that's been adjusted): score gets a significant boost.
- If churned for fundamental fit issues: score gets penalized unless something material has changed.

### Known Contact, No Deal
- Someone at this company has been in the system before. Check the history.
- Prior engagement (attended events, had demos, was in nurture) provides context on what worked and what didn't.

### Mutual Connections
- Shared investors, board members, or advisors between ${company_name} and the lead's company = warm path.
- Flag these for the rep to leverage in outreach.

## The Courage to Disqualify

Disqualification is the most underrated skill in sales. Here is why saying "no" early saves everyone time:

**For the rep:** Every hour spent on a disqualified lead has an opportunity cost. If your average deal cycle is 45 days and your win rate on qualified leads is 25%, spending time on leads that score below 2.0 has an expected return near zero.

**For the prospect:** Prospects who are a bad fit but get strung along waste their time too. A clean, fast "this isn't a match" with a genuine explanation (and maybe a referral to a better-fit solution) builds reputation and sometimes generates referrals later.

**For the pipeline:** Phantom pipeline (leads that look active but will never close) is one of the most corrosive forces in sales. It distorts forecasts, misallocates resources, and creates false confidence. Aggressive disqualification keeps the pipeline honest.

### When to Disqualify Immediately (No Score Needed)
- Company is in a completely non-target industry with no adjacent use case
- Company is below minimum viable size (e.g., 2-person consulting shop for enterprise software)
- Lead is a direct competitor (researching your product for competitive intel)
- Lead is a student, academic researcher, or job seeker -- not a buyer
- Duplicate lead -- person/company already active in another deal
- Explicit disqualifier in notes: "not interested," "just gathering info for a report," or similar

### When to Score Conservative and Revisit
- Missing critical data (no company name, no title) -- score what you can, flag gaps, recommend enrichment
- Borderline ICP fit -- score honestly and recommend a discovery call to resolve ambiguity
- Good company, wrong person -- score the company fit high but role authority low; recommend finding the right stakeholder

## Score Confidence Levels

Not all scores are created equal. A score based on rich data is more trustworthy than one based on sparse data. Report confidence alongside the score:

### High Confidence (4+ data points per dimension)
- You have company name, size, industry, funding, contact title, seniority, source, engagement history, and CRM context
- The score is reliable. Act on it decisively.

### Medium Confidence (2-3 data points per dimension)
- You have the basics (company, title, source) but are missing some dimensions (budget signals, timing specifics)
- The score is directionally correct. Tier assignment is probably right, but the exact score could shift +/- 0.5 with more data.
- Recommend enrichment before heavy investment.

### Low Confidence (0-1 data points per dimension)
- You have minimal data -- maybe just a name and email, or a company name with nothing else
- The score is a rough estimate at best. Do not fast-track or disqualify based on this alone.
- Recommend enrichment or a quick qualification call before any scoring-based routing.

Always report the confidence level in the output. A score of 3.5 with high confidence is much more actionable than a score of 4.0 with low confidence.

## Qualification Tiers

- **Hot** (score >= 4.0): High-priority, fast-track to sales. Book meeting within 24 hours. These leads justify interrupting whatever else is on the calendar.
- **Warm** (score 3.0 - 3.9): Good potential, needs nurturing or more qualification. Follow up within 48 hours. Worth a discovery call to resolve unknowns.
- **Cold** (score 2.0 - 2.9): Low priority, may not be worth active pursuit now. Add to nurture sequence. Revisit if they re-engage or if new data changes the score.
- **Disqualified** (score < 2.0): Does not meet minimum criteria. Log reason and close out. Be specific about WHY -- "too small," "wrong industry," "no authority" -- so the team learns and marketing can refine targeting.

## Common Qualification Mistakes to Avoid

### 1. "Title bias" -- over-indexing on seniority
A VP who casually browsed your website is not worth more than a Manager who requested a demo and wrote three paragraphs about their problem in the form. Intent trumps title. Always.

### 2. "Big logo bias" -- over-indexing on company name
A Fortune 500 lead with no intent, no authority, and no champion is worse than a 200-person company that matches every ICP criterion. Qualify the opportunity, not the brand.

### 3. "Recency bias" -- scoring based on what just happened instead of overall fit
A lead that just came in feels urgent. But urgency without fit is a trap. Score methodically, then prioritize based on the score -- not on how recently the lead arrived.

### 4. "Optimism bias" -- giving the benefit of the doubt on every dimension
If you don't have data on budget, the score is 0 (cannot assess), not 3 (maybe). Uncertainty is not evidence of fit. Score conservatively and let enrichment resolve the gaps.

### 5. "Sunk cost reluctance" -- refusing to disqualify after investing time
If a lead scores below 2.0 after enrichment and a discovery call, disqualify it. The time already spent is gone. Continuing to pursue it because "we've already invested" is the definition of throwing good money after bad.

### 6. "Source worship" -- treating all referrals as automatically qualified
Referrals convert better ON AVERAGE, but any individual referral can still be a terrible fit. Apply the same scoring rigor. The source multiplier gives referrals a boost, but it doesn't override a score of 1.5.

## Output Contract

Return a SkillResult with:
- `data.qualification_score`: Overall weighted score (0.0 - 5.0), with source multiplier applied
- `data.qualification_tier`: "hot" | "warm" | "cold" | "disqualified"
- `data.score_confidence`: "high" | "medium" | "low" based on data completeness
- `data.scoring_breakdown`: Array of dimension scores:
  - `dimension`: Name of scoring dimension
  - `score`: 1-5 score (0 if cannot assess)
  - `weight`: Percentage weight
  - `reasoning`: Why this score was assigned (cite specific evidence)
  - `data_source`: What data point(s) informed the score
- `data.source_multiplier`: The multiplier applied based on lead source, with justification
- `data.qualification_summary`: 2-3 sentence summary of the qualification assessment. Written for a busy rep -- lead with the verdict, then the evidence.
- `data.strengths`: Array of positive indicators (why this lead might convert)
- `data.concerns`: Array of risk factors or gaps (why this lead might not convert)
- `data.missing_info`: Array of data points that would improve scoring accuracy. For each, note how much it could swing the score.
- `data.next_action`: Recommended next step with:
  - `action`: Specific action to take (e.g., "Book discovery call", "Send nurture email", "Enrich via lead-research skill", "Disqualify and log reason")
  - `priority`: "urgent" | "high" | "medium" | "low"
  - `rationale`: Why this is the right next step (reference the score and specific gaps/strengths)
  - `suggested_owner`: "AE" | "SDR" | "Marketing" | "Account Manager" (who should own next step)
  - `timeline`: When to take the action (e.g., "within 4 hours", "within 24 hours", "this week", "add to monthly nurture")
- `data.existing_relationship`: Any existing CRM relationship context (prior deals, existing contacts at company, churn history)
- `data.framework_recommendation`: If the lead is Hot or Warm, recommend which deeper framework (BANT or MEDDICC) to use for the discovery call

## Quality Checklist

Before returning the qualification result, verify:

- [ ] Every dimension has an explicit score with cited evidence (not just "seems like a 3")
- [ ] Dimensions with missing data are scored 0 (not guessed at 3)
- [ ] Score confidence level is reported honestly
- [ ] Source multiplier is applied and explained
- [ ] Existing CRM relationships are checked and flagged
- [ ] The qualification summary leads with the verdict, not the analysis
- [ ] Next action is specific and actionable (not "follow up" -- say exactly what follow-up)
- [ ] Timeline for next action is concrete
- [ ] Owner for next action is specified
- [ ] Missing info includes impact assessment (how much would this data change the score?)
- [ ] Disqualification (if applicable) includes a clear, specific reason
- [ ] The output is scannable -- a rep can get the verdict in 5 seconds and the details in 30

## Guidelines
- Use the ICP criteria from the Organization Context above to calibrate scoring to the organization's specific ICP. Organization Context provides the company's target market, products, and value propositions which should inform how you weight each scoring dimension. If no ICP criteria are provided, note this gap and use reasonable defaults for the industry. See `references/icp-templates.md` for ICP definition templates, scoring calibration examples, and ICP fit correlation data.
- If critical data is missing (e.g., no company size), note it in `missing_info` and score that dimension as 0 (cannot assess). Do NOT assume a midpoint score for missing data.
- Consider the lead source -- apply the source quality multiplier as described above.
- Check for existing relationships in CRM -- if the company is already a customer or has open deals, flag this prominently and adjust the routing recommendation.
- Be decisive with the tier -- reps need a clear recommendation, not a hedge. "This could be warm or cold depending on..." is not helpful. Pick a tier, explain why, and note what would change it.
- If the lead is clearly disqualified, say so directly with the specific reason. Do not soften it. "Disqualified: 8-person agency, below minimum company size threshold of 50" is better than "This lead may not be the best fit at this time."
- Suggest the "lead-research" skill as a follow-up if web enrichment would improve the score and the lead is borderline (score 2.5-3.5 with medium or low confidence).

## Error Handling

### No lead data provided at all
Ask the user what they know about the lead. Provide a template: "To qualify this lead, I need at minimum a company name and the person's title. Ideally also: company size, industry, how the lead came in (source), and any notes about their interest."

### Only a name or email provided
Attempt CRM lookup. If found, use CRM data to populate the scoring. If not found, return a low-confidence preliminary score and strongly recommend enrichment: "I can only score 1 of 5 dimensions with this data. Running lead-research would likely fill 3-4 more dimensions and give a reliable qualification."

### CRM lookups fail (API error, timeout)
Score based on available data and flag the gaps. Note: "CRM lookup failed -- existing relationship status unknown. Scoring based on provided data only. Re-run after CRM connectivity is restored."

### Borderline score (within 0.3 of a tier boundary)
Call out the borderline explicitly: "Score of 2.8 is 0.2 below the Warm threshold. Key swing factor: if company size is confirmed at 150+ (currently unknown), this moves to Warm. Recommend quick enrichment check before routing."

### Conflicting data points
When different sources give different signals (e.g., title says VP but company is 5 people), explain the conflict and how you resolved it: "Title suggests decision-maker (VP), but company size suggests title inflation. Scoring authority at 3 rather than 5, weighted toward company size context."

### Lead is clearly a competitor, student, or spam
Disqualify immediately with a clear label: "Disqualified: Competitor research (lead works at [Competitor Name] which directly competes with ${company_name})" or "Disqualified: Academic inquiry (lead is a graduate student at [University])." No scoring needed -- just fast, clean disqualification.

### Always return something
Even with minimal data, always return a tier and next action recommendation. The worst output is no output. A low-confidence score with clear caveats and a "get more data" next action is infinitely better than silence.
