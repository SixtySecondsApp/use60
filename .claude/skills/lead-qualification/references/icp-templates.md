# ICP Templates and Scoring Calibration Guide

Templates for defining Ideal Customer Profiles, scoring calibration with worked examples, and ICP evolution guidance.

## Table of Contents

1. [ICP Definition Template](#icp-definition-template)
2. [Example ICPs by Business Type](#example-icps-by-business-type)
3. [Scoring Calibration: 10 Worked Examples](#scoring-calibration-10-worked-examples)
4. [ICP Fit Correlation Data](#icp-fit-correlation-data)
5. [Anti-ICP Patterns](#anti-icp-patterns)
6. [ICP Evolution Guide](#icp-evolution-guide)

---

## ICP Definition Template

Use this template to build a custom ICP for any organization. Fill in the criteria based on analysis of your best 20 customers.

### Section 1: Firmographic Profile

```
COMPANY SIZE
  Sweet spot:        _____ to _____ employees
  Acceptable range:  _____ to _____ employees
  Minimum viable:    _____ employees
  Maximum viable:    _____ employees

REVENUE RANGE
  Sweet spot:        $_____ to $_____ ARR
  Acceptable range:  $_____ to $_____ ARR

INDUSTRY
  Tier 1 (Core):     _________________________________
  Tier 2 (Expanding): _________________________________
  Tier 3 (Opportunistic): _____________________________
  Tier 4 (Excluded): _________________________________

GEOGRAPHY
  Primary markets:   _________________________________
  Acceptable:        _________________________________
  Excluded:          _________________________________

COMPANY STAGE
  Ideal:             [ ] Pre-seed  [ ] Seed  [ ] Series A
                     [ ] Series B  [ ] Series C+
                     [ ] Growth    [ ] Public
  Excluded:          _________________________________
```

### Section 2: Technographic Profile

```
REQUIRED TECH
  Must use:          _________________________________
  Preferred:         _________________________________

COMPETITOR USAGE
  Displacement targets: _________________________________
  Compatible:           _________________________________
  Incompatible:         _________________________________

TECH MATURITY
  Ideal:             [ ] Bleeding edge  [ ] Modern
                     [ ] Mainstream      [ ] Conservative
```

### Section 3: Behavioral Profile

```
ENGAGEMENT THRESHOLDS
  Hot trigger:       _________________________________
                     (e.g., demo request, pricing page visit)
  Warm trigger:      _________________________________
                     (e.g., case study download, webinar attendance)
  Cold baseline:     _________________________________
                     (e.g., newsletter signup only)

SOURCE QUALITY
  Best sources:      _________________________________
  Standard sources:  _________________________________
  Low-value sources: _________________________________
```

### Section 4: Negative Criteria

```
HARD DISQUALIFIERS
  1. _________________________________________________
  2. _________________________________________________
  3. _________________________________________________

SOFT DISQUALIFIERS (score penalties)
  1. _________________________ (penalty: _____)
  2. _________________________ (penalty: _____)
  3. _________________________ (penalty: _____)
```

### How to Fill This Template
1. Export your top 20 customers by revenue, retention, and NPS
2. For each field, find the median and interquartile range
3. The IQR becomes your "sweet spot," 1.5x IQR becomes "acceptable range"
4. Hard disqualifiers come from your bottom 20 customers -- what do they share?

---

## Example ICPs by Business Type

### Example 1: B2B SaaS (Sales Enablement Tool)

**Firmographic**:
- Company size: 100-500 employees (sweet spot), 50-1000 (acceptable)
- Revenue: $10M-$100M ARR
- Industries: SaaS, FinTech, MarTech (Tier 1); Professional Services, Healthcare Tech (Tier 2)
- Geography: US, UK, Canada, Australia
- Stage: Series B through pre-IPO

**Technographic**:
- Must use: Salesforce or HubSpot CRM
- Preferred: Outreach, Gong, or similar sales stack
- Displacement targets: Chorus, Highspot
- Tech maturity: Modern to bleeding edge

**Behavioral**:
- Hot: Demo request, pricing page 3+ visits, competitor comparison page
- Warm: Case study download, webinar attendance, 5+ email opens
- Cold: Single blog visit, newsletter only

**Buyer Personas**: VP of Sales, Director of Sales Enablement, CRO
**Hard Disqualifiers**: <50 employees, no CRM, government, education

### Example 2: Professional Services (Consulting Firm Selling Strategy)

**Firmographic**:
- Company size: 200-5000 employees (sweet spot), 100-10000 (acceptable)
- Revenue: $50M-$1B
- Industries: Financial Services, Healthcare, Technology, Energy (Tier 1); Retail, Manufacturing (Tier 2)
- Geography: US, UK, EMEA
- Stage: Established (10+ years), public or PE-backed

**Technographic**:
- Less relevant. Focus on functional maturity, not specific tools.
- Signal: Companies undergoing digital transformation, M&A, or market expansion

**Behavioral**:
- Hot: RFP received, direct referral from existing client, executive outreach
- Warm: Attended thought leadership event, downloaded industry report, engaged with senior partner's LinkedIn post
- Cold: General website visit, newsletter subscriber

**Buyer Personas**: CEO, CFO, Chief Strategy Officer, SVP of Corporate Development
**Hard Disqualifiers**: <$20M revenue, pre-revenue startup, government (unless specific practice), <100 employees

### Example 3: Marketplace (Two-Sided Platform)

**Firmographic**:
- Company size: 20-200 employees (marketplace teams are lean)
- GMV: $10M-$500M (more relevant than headcount)
- Industries: E-commerce, food delivery, logistics, real estate, recruitment (Tier 1)
- Geography: US, UK, EU
- Stage: Series A through Series C (high growth phase)

**Technographic**:
- Must use: Stripe or similar payment infrastructure
- Preferred: Segment, Amplitude, or similar analytics
- Signal: Custom-built marketplace vs. Sharetribe/Arcadier platform (custom = more sophisticated buyer)

**Behavioral**:
- Hot: Demo request mentioning specific GMV or transaction volume numbers
- Warm: Downloaded marketplace growth playbook, attended marketplace-specific event
- Cold: General SaaS content engagement

**Buyer Personas**: CEO/Founder, VP of Product, Head of Marketplace Operations
**Hard Disqualifiers**: <$1M GMV, B2C consumer marketplace (not B2B), no transaction infrastructure

### Example 4: Hardware / IoT (Industrial Monitoring Product)

**Firmographic**:
- Company size: 500-10000 employees (manufacturing operations need scale)
- Revenue: $100M-$5B
- Industries: Manufacturing, Energy, Mining, Utilities (Tier 1); Transportation, Agriculture (Tier 2)
- Geography: US, Canada, Germany, Australia
- Stage: Established. Minimum 5 years in operation. Public or PE-backed preferred.

**Technographic**:
- Must use: SCADA or similar OT system
- Preferred: SAP, Oracle, or similar ERP
- Signal: Active digital transformation initiative, Industry 4.0 mentions in annual report
- Tech maturity: Mainstream to conservative (enterprise hardware buyers are risk-averse)

**Behavioral**:
- Hot: RFP received, pilot request, site visit scheduled, referenced by existing customer
- Warm: Attended industry conference booth, downloaded technical whitepaper, engaged with case study
- Cold: Website visit, general content download

**Buyer Personas**: VP of Operations, Plant Manager, Director of Engineering, Chief Technology Officer
**Hard Disqualifiers**: <200 employees, no physical operations, pure-software company, no OT infrastructure

### Example 5: Consulting / Agency (Digital Marketing Agency)

**Firmographic**:
- Company size: 10-100 employees (agencies are small; a 50-person agency is mid-market)
- Revenue: $2M-$30M (project-based, so revenue correlates with team size)
- Industries: Digital agencies, creative agencies, performance marketing, SEO agencies (Tier 1); PR firms, branding agencies (Tier 2)
- Geography: US, UK, Australia, Canada
- Stage: Established (3+ years). Founder-led or PE-backed.

**Technographic**:
- Must use: Project management tool (Asana, Monday, ClickUp)
- Preferred: HubSpot, Google Analytics, social media management tools
- Signal: Managing 20+ client accounts simultaneously (capacity indicator)

**Behavioral**:
- Hot: Demo request citing specific pain ("we're losing clients because of reporting gaps"), referral from another agency
- Warm: Attended agency-focused webinar, downloaded agency growth guide, multiple blog visits
- Cold: Single blog visit, social media follow

**Buyer Personas**: Founder/CEO, Director of Operations, Head of Client Services
**Hard Disqualifiers**: <5 employees (freelancer, not agency), no active client base, in-house marketing team (not an agency)

---

## Scoring Calibration: 10 Worked Examples

These examples show how to score diverse leads across the 5-Dimension model. Each demonstrates different data availability and scoring considerations.

### Lead 1: Perfect Fit (Score: 4.8)
**Profile**: VP of Revenue, 300-person FinTech, Series C, demo request with note "evaluating for Q2 rollout."
- Company Size: **5** (300 = ICP sweet spot)
- Industry: **5** (FinTech = Tier 1 vertical with 4 case studies)
- Authority: **5** (VP of Revenue = decision-maker)
- Budget: **4** (Series C = strong signal, no explicit amount)
- Timing: **5** (Demo request + stated Q2 timeline + evaluation language)
- Source multiplier: 1.15x (demo request) | **Final: 5.0 (capped)**

### Lead 2: Good Fit, Wrong Person (Score: 3.1)
**Profile**: Marketing Analyst at a 400-person SaaS company, downloaded a case study.
- Company Size: **5** (400 = ICP sweet spot)
- Industry: **5** (SaaS = Tier 1)
- Authority: **2** (Analyst = IC, no buying authority)
- Budget: **3** (Mid-size SaaS likely has budget, but no specific signals)
- Timing: **3** (Case study download = moderate intent, not product-specific)
- Source multiplier: 1.0x | **Final: 3.1**
- **Key note**: Great company, wrong person. Next action: find the VP/Director and use this Analyst as a door-opener.

### Lead 3: Right Person, Wrong Company (Score: 2.3)
**Profile**: CEO of a 15-person consulting boutique. Referral from a current customer.
- Company Size: **1** (15 = far below ICP minimum of 50)
- Industry: **3** (Consulting = Tier 2, some use cases)
- Authority: **5** (CEO = ultimate decision-maker)
- Budget: **2** (15-person boutique, limited budget likely)
- Timing: **3** (Referral implies some interest, but no stated urgency)
- Source multiplier: 1.25x (customer referral) | **Final: 2.3**
- **Key note**: Referral multiplier helps but cannot overcome fundamental size mismatch. Warm referral path = handle personally, do not ignore. But manage expectations on deal size.

### Lead 4: Data-Sparse Inbound (Score: 1.5 before enrichment)
**Profile**: "Jordan" at "Innovate Labs." Email: jordan@innovatelabs.co. No title, no company size, no source context. Newsletter signup.
- Company Size: **0** (Unknown)
- Industry: **0** (Unknown -- "Labs" could be anything)
- Authority: **0** (No title)
- Budget: **0** (Nothing to assess)
- Timing: **2** (Newsletter signup = minimal intent)
- Source multiplier: 1.0x | **Final: 0.4**
- **Next action**: Enrich before scoring. Chain to `lead-research` for company data, then `sales-enrich` for contact data. Re-score after enrichment.

### Lead 5: Churned Customer Returning (Score: 4.2)
**Profile**: Director of Sales Ops at RevenueMax (250 employees). They were a customer for 8 months, churned 6 months ago citing "missing Salesforce integration." You shipped Salesforce integration 3 months ago. They just visited your integrations page.
- Company Size: **5** (250 = ICP sweet spot)
- Industry: **4** (RevenueMax is RevOps SaaS -- adjacent vertical)
- Authority: **4** (Director of Sales Ops = strong influencer, may need VP approval)
- Budget: **5** (Were already paying. Budget was allocated before. Churn reason resolved.)
- Timing: **5** (Visited integrations page = checking if churn reason is resolved. Very high intent.)
- Source multiplier: 1.0x (direct return visit) | **Final: 4.2**
- **Key note**: Flag existing relationship. Churn reason resolved. This is a high-priority win-back. Route to account manager, not SDR.

### Lead 6: Big Logo, No Signal (Score: 2.0)
**Profile**: "Business Development Associate" at Microsoft. Attended an industry webinar you sponsored.
- Company Size: **1** (200,000+ employees = far above ICP maximum. Even targeting a division, procurement complexity is prohibitive.)
- Industry: **5** (Tech = Tier 1)
- Authority: **1** (BD Associate at a 200K-person company = zero buying authority)
- Budget: **3** (Microsoft has budget for everything, but this person cannot access it)
- Timing: **2** (Webinar attendance = low intent, especially at a sponsored event)
- Source multiplier: 1.0x | **Final: 2.0**
- **Key note**: Big logo bias trap. The company is too large and the contact is too junior. Unless you have an enterprise strategy for Microsoft specifically, disqualify.

### Lead 7: Startup Founder, High Intent (Score: 3.7)
**Profile**: Co-founder/CEO of a 35-person AI startup. Series A ($12M) raised 4 months ago. Demo request with note: "Building out our sales team, need tools ASAP."
- Company Size: **2** (35 = below ICP minimum of 50, but growing fast post-Series A)
- Industry: **5** (AI/Tech = Tier 1)
- Authority: **5** (CEO/Co-founder = ultimate authority)
- Budget: **4** (Series A, $12M raised recently = budget available for tool purchases)
- Timing: **5** (Demo request + "ASAP" + building sales team = immediate need)
- Source multiplier: 1.15x (demo request) | **Final: 3.7**
- **Key note**: Below ICP on company size but compensating factors are strong. Fast-growing, funded, CEO-driven, immediate need. Warm, worth a discovery call. May become a Hot lead as they grow.

### Lead 8: Perfect Company, Passive Entry (Score: 3.3)
**Profile**: VP of Sales at a 200-person MarTech company, Series B. Badge scan at a conference booth. No conversation notes.
- Company Size: **5** (200 = ICP sweet spot)
- Industry: **5** (MarTech = Tier 1)
- Authority: **5** (VP of Sales = decision-maker)
- Budget: **4** (Series B = strong signal)
- Timing: **1** (Badge scan only = minimal intent. Did they stop at the booth or just walk by?)
- Source multiplier: 1.0x (event lead) | **Final: 3.3**
- **Key note**: Perfect on paper but zero intent signal. The Timing score drags the total down. Next action: personalized outreach referencing the event. If they respond, re-score Timing to 3-4.

### Lead 9: Competitor's Customer (Score: 3.9)
**Profile**: Head of Sales Enablement at a 350-person SaaS company. Found via web search for "alternatives to [Competitor]." Downloaded your comparison guide.
- Company Size: **5** (350 = ICP sweet spot)
- Industry: **5** (SaaS = Tier 1)
- Authority: **4** (Head of Sales Enablement = strong influencer, likely drives the evaluation)
- Budget: **4** (Already paying a competitor = budget allocated for this category)
- Timing: **5** (Searched for alternatives + downloaded comparison = active competitive evaluation)
- Source multiplier: 1.0x (content inbound) | **Final: 3.9**
- **Key note**: Borderline Hot (0.1 below). Competitive displacement opportunity. They already have budget allocated and are actively unhappy. Fast-track to discovery. Use competitor-intel skill to prepare positioning.

### Lead 10: Unusual Profile (Score: 2.6)
**Profile**: "Chief of Staff" at a 180-person healthcare analytics company. Inbound from a partner referral. No other data.
- Company Size: **5** (180 = ICP sweet spot)
- Industry: **3** (Healthcare analytics = Tier 2, limited case studies)
- Authority: **3** (Chief of Staff is ambiguous. Could have significant influence or be primarily operational. Needs verification.)
- Budget: **0** (No data)
- Timing: **3** (Partner referral implies some intent, but no engagement data)
- Source multiplier: 1.15x (partner referral) | **Final: 2.6**
- **Key note**: Interesting lead with an unusual title. Key swing factor: if Chief of Staff has budget authority (common at 180-person companies), Authority jumps to 4-5 and score reaches ~3.3 (Warm). Enrich the contact to verify role and reporting structure.

---

## ICP Fit Correlation Data

### Win Rate by ICP Fit Score

| ICP Fit Score | Average Win Rate | Average Sales Cycle | Average ACV | 12-Month Retention |
|---------------|-----------------|--------------------|--------------|--------------------|
| 4.5-5.0 (Strong fit) | 35-45% | 28 days | At or above list price | 95%+ |
| 3.5-4.4 (Good fit) | 20-30% | 45 days | At list price | 88-95% |
| 2.5-3.4 (Moderate fit) | 10-18% | 65 days | 10-20% below list | 75-88% |
| 1.5-2.4 (Weak fit) | 5-10% | 90+ days | 20-40% below list | 55-75% |
| Below 1.5 (Poor fit) | <5% | 120+ days | Deep discount | <55% |

### The Revenue Quality Multiplier

ICP-fit deals generate more revenue per unit of sales effort:

| Metric | ICP-Fit Deals | Non-ICP Deals | Difference |
|--------|--------------|---------------|------------|
| Win rate | 33% | 12% | 2.75x |
| Sales cycle | 35 days | 72 days | 2.1x faster |
| Average discount | 8% | 22% | 2.75x less discounting |
| Expansion revenue (12mo) | 28% of ACV | 8% of ACV | 3.5x more expansion |
| Support tickets/account | 3.2/month | 8.7/month | 2.7x fewer tickets |

### Which Dimensions Predict Conversion Most Strongly?

Ranked by correlation with closed-won outcome across B2B SaaS:

| Rank | Dimension | Correlation with Close | Why |
|------|-----------|----------------------|-----|
| 1 | Timing & Intent (behavioral) | 0.48 | What they DO is the strongest predictor. A demo request from anyone beats a passive badge scan from a VP. |
| 2 | Company Size Fit | 0.42 | Structural fit determines whether the sale is even possible. |
| 3 | Role Authority | 0.38 | Talking to the right person accelerates everything. |
| 4 | Industry Fit | 0.31 | Matters for proof points and sales messaging, but less binary than size. |
| 5 | Budget Signals | 0.22 | Least predictive at qualification stage because budget is usually unknown. Becomes more predictive in later stages. |

**Implication**: Timing & Intent and Company Size together account for most of the predictive power. If you had to score on only two dimensions, score these two.

---

## Anti-ICP Patterns

These are lead profiles that look promising on the surface but consistently fail to convert. Train your scoring to catch them.

### Pattern 1: "The Tire Kicker"
**Looks like**: Senior title, ICP-fit company, high engagement (downloaded everything, attended every webinar).
**Actually is**: Serial evaluator who never buys. Often in a role focused on "market intelligence" rather than tool adoption.
**Detection**: Check engagement-to-action ratio. If they have consumed 10+ content pieces over 6+ months with zero product-specific actions (demo, trial, pricing), they are researching, not buying.
**Score impact**: Reduce Timing & Intent to 2 despite high engagement. Add note: "High content consumption but zero product-intent actions over [timeframe]."

### Pattern 2: "The Wrong Department"
**Looks like**: Right company size, right industry, senior title.
**Actually is**: A department that has no budget for or decision authority over your product category. Example: VP of Engineering evaluating a sales tool "for the sales team."
**Detection**: Cross-reference title function against your product category. If the function does not match, Authority drops to 2 regardless of seniority.
**Score impact**: Authority capped at 2 unless verified as cross-functional buyer.

### Pattern 3: "The Growing-Into-It Startup"
**Looks like**: Funded startup with a visionary founder, growing fast, loves your product.
**Actually is**: Too early. They will outgrow your tool before they fully adopt it, or their needs will change as they scale.
**Detection**: Current headcount is <40% of your ICP minimum AND they have not hit product-market fit (pre-revenue or <$1M ARR). They are buying aspiration, not solving a current problem.
**Score impact**: Company Size scores 2 max. Add note: "Growing fast but current stage premature. Flag for re-qualification in 6 months."

### Pattern 4: "The Zombie Champion"
**Looks like**: Enthusiastic internal champion who loves your product and is driving the evaluation.
**Actually is**: A champion with no political capital. They are excited but cannot influence the decision. Often a mid-level IC who discovered your product independently.
**Detection**: Champion has been "working on it internally" for 3+ months with no new stakeholders introduced and no process milestones hit.
**Score impact**: Authority stays at 2-3 despite champion enthusiasm. Note: "Champion identified but influence unverified. Has not introduced economic buyer after [timeframe]."

### Pattern 5: "The Budget Mirage"
**Looks like**: Large company, recent funding, stated interest in your category.
**Actually is**: Budget exists in theory but is locked in annual planning cycles, frozen due to macroeconomic conditions, or allocated to a competing priority.
**Detection**: Web enrichment reveals recent hiring freeze, earnings miss, or public statements about "cost optimization." Alternatively, they say "budget approved" but the Decision Process reveals 6+ approval layers.
**Score impact**: Budget signals drops to 2. Add note: "Budget theoretically available but [specific blocker]. Verify budget accessibility, not just existence."

---

## ICP Evolution Guide

Your ICP is not static. It should evolve as you learn from actual outcomes.

### Quarterly Review (30 Minutes)

Pull these reports and compare to current ICP:

1. **Last quarter's closed-won deals**: What are their firmographic, technographic, and behavioral profiles? Any surprises outside current ICP?
2. **Last quarter's closed-lost deals**: Where did they diverge from ICP? Are you losing in segments you thought were strong?
3. **Churn analysis**: Did any churned accounts match ICP at close? What was different about them?
4. **Fastest deals**: Which deals closed in half the average cycle? What do they share?
5. **Highest NPS accounts**: Which customers are happiest? What firmographic patterns emerge?

### Annual Deep Review (Half Day)

1. Segment all customers by revenue, retention, NPS, and support load
2. Identify the top quartile on all four dimensions -- that is your "Platinum ICP"
3. Compare Platinum ICP firmographics to your current ICP definition
4. Adjust criteria, scoring weights, and tier thresholds based on data
5. Update disqualifiers based on closed-lost and churn patterns
6. Validate with sales team (do these changes match their intuition from deal work?)

### Common ICP Evolution Triggers

| Trigger | What to Review | Typical Change |
|---------|---------------|---------------|
| New product launch | Industry fit, company size ranges | New verticals open up, size ranges may shift |
| Price change | Budget signals weights, minimum viable company size | Higher price = larger minimum company, lower price = wider range |
| New competitor enters market | Industry fit priorities, competitive displacement signals | May need to focus on verticals where competitor is weak |
| Market expansion (new geo) | Geography criteria, tech stack requirements | New regions have different buying patterns |
| 2+ quarters of declining win rates | All dimensions -- something has shifted | Correlate dimension scores with outcomes to find the drift |
| Surge in a new segment | Company size, industry tiers | Emerging segment may deserve Tier 1 promotion |

### ICP Version Control

Maintain a changelog:

```
v1.0 (2025-Q1): Initial ICP. Based on first 20 customers.
v1.1 (2025-Q2): Expanded industry Tier 1 to include FinTech. Win rate data supported promotion.
v1.2 (2025-Q3): Raised minimum company size from 30 to 50. Sub-30 accounts churned at 2x rate.
v2.0 (2025-Q4): Major revision. Added technographic criteria. Removed government from Tier 3 (zero wins in 4 quarters).
v2.1 (2026-Q1): Adjusted source multipliers. Partner referrals downgraded from 1.15x to 1.10x based on actual conversion data.
```

---

## Sources and Further Reading

- Gartner. "B2B Sales Benchmark Report." 2024. ICP-fit correlation across 500 B2B companies.
- Salesforce. "State of Sales." 5th Edition, 2024. Survey of 7,700 sales professionals.
- Pavilion Revenue Collective. "Revenue Leader Survey." 2023. ICP-fit impact data from 400 revenue leaders.
- Forrester Research. "Align Sales and Marketing Around the ICP." 2023.
- Lincoln Murphy. "Ideal Customer Profile Framework." SixteenVentures.
- Winning by Design. "Revenue Architecture: ICP Definition Methodology." 2024.
