# ICP Templates and Scoring Calibration Guide

Templates for defining Ideal Customer Profiles and calibrating qualification scores to real-world fit signals.

## Table of Contents

1. [What an ICP Actually Is (and Is Not)](#what-an-icp-actually-is-and-is-not)
2. [Firmographic Criteria](#firmographic-criteria)
3. [Technographic Criteria](#technographic-criteria)
4. [Behavioral Criteria](#behavioral-criteria)
5. [Negative Qualification Criteria (Disqualifiers)](#negative-qualification-criteria)
6. [Scoring Calibration Examples](#scoring-calibration-examples)
7. [ICP Scorecard Template](#icp-scorecard-template)
8. [ICP Fit Correlation Data](#icp-fit-correlation-data)
9. [Common ICP Mistakes](#common-icp-mistakes)
10. [ICP Review Cadence](#icp-review-cadence)

---

## What an ICP Actually Is (and Is Not)

An ICP is a description of the company (not the person) that is the best fit for your product. It is a firmographic, technographic, and behavioral profile that, when matched, predicts the highest likelihood of:

1. **Closing** -- the deal converts
2. **Retaining** -- they renew and do not churn
3. **Expanding** -- they buy more over time
4. **Advocating** -- they refer others

An ICP is NOT:
- A buyer persona (that describes the person, not the company)
- A total addressable market definition (TAM is broader)
- A wishlist of dream logos (that is a target account list)
- Static (it should evolve as you learn)

**The data**: Companies that sell to ICP-fit accounts close deals 2.5x faster, retain 3x better at 12 months, and see 1.8x higher lifetime value compared to non-ICP accounts (Gartner, B2B Sales Benchmark, 2024).

---

## Firmographic Criteria

Firmographic data is the bedrock of ICP definition. It is the most accessible, most stable, and most predictive category of criteria.

### Company Size (Employee Count)

| Size Band | Label | Typical Characteristics |
|-----------|-------|------------------------|
| 1-10 | Micro | Founder-led decisions. No formal procurement. Budget highly constrained. Fast decisions but small deals. |
| 11-50 | Small | Emerging functional leaders. Some process but still informal. Budget exists but is guarded. |
| 51-200 | Lower Mid-Market | Department heads with budget authority. Formal evaluation but not bureaucratic. Sweet spot for many B2B SaaS products. |
| 201-500 | Upper Mid-Market | VP-level decision-makers. Multi-stakeholder evaluation. Established procurement processes. |
| 501-2000 | Small Enterprise | Multiple business units. Formal RFP processes common. Security and compliance requirements. |
| 2001-10000 | Mid Enterprise | Long sales cycles (6-12 months). Procurement-driven. Pilots and POCs standard. |
| 10000+ | Large Enterprise | 9-18 month cycles. Multiple stakeholder layers. Land-and-expand is the only viable strategy. |

**How to define your size band**: Look at your last 20 closed-won deals. What is the median employee count? What is the interquartile range (middle 50%)? That is your ICP size band. Anything outside 1.5x that range on either end is a stretch.

### Revenue Range

Revenue correlates with buying capacity more directly than employee count but is harder to determine for private companies.

| Revenue Range | What It Signals |
|---------------|----------------|
| Pre-revenue | Extremely budget-constrained. Only buy essentials. Often use free tools. |
| $1M-$10M ARR | Budget exists but tight. Tool purchases require clear ROI justification. |
| $10M-$50M ARR | Established budget cycles. Category spend emerging. More tools in the stack. |
| $50M-$200M ARR | Dedicated budget for your category likely exists. Procurement formalized. |
| $200M+ ARR | Large budgets but long cycles. Enterprise features (SSO, audit logs, compliance) required. |

### Industry Vertical

Industry fit is binary for some products (you either serve healthcare or you don't) and a spectrum for others (a project management tool works across industries, but some are better fits).

**Template for defining industry fit**:

| Tier | Industries | Why |
|------|-----------|-----|
| **Tier 1 (Core)** | [List 2-4 industries where you have 5+ customers, case studies, and domain expertise] | Proven fit. References available. Sales cycle is predictable. |
| **Tier 2 (Expanding)** | [List 3-5 industries where you have 1-3 customers and early proof points] | Emerging fit. Some proof but not enough to lead with industry-specific messaging. |
| **Tier 3 (Opportunistic)** | [List industries you have not served but where the use case logically applies] | Theoretical fit. No proof points. Higher risk, higher effort. |
| **Tier 4 (Excluded)** | [List industries that are explicitly not a fit -- regulatory, use case, or strategic reasons] | Disqualified. Do not pursue. |

### Geography

| Criterion | Why It Matters |
|-----------|---------------|
| Country / Region | Regulatory compliance (GDPR, CCPA), language support, time zone for support/sales |
| Headquarters vs. offices | A US-headquartered company with an APAC office has different buying dynamics than an APAC-headquartered company |
| Remote-first vs. office-based | Affects collaboration tool needs, communication preferences, buying process (remote-first = more async, more distributed decision-making) |

---

## Technographic Criteria

Technographic criteria assess whether the prospect's technology environment is compatible with your product and whether they are the type of organization that buys tools in your category.

### Tech Stack Compatibility Matrix

| Signal | What to Look For | Why It Matters |
|--------|-----------------|----------------|
| **CRM** | Salesforce, HubSpot, Pipedrive, etc. | Determines integration requirements and buyer sophistication |
| **Category adjacency** | Do they use tools adjacent to yours? | Using adjacent tools suggests maturity in the function your product serves |
| **Competitor usage** | Are they using a direct competitor? | Competitive displacement opportunity (or barrier) |
| **Tech sophistication** | Modern stack vs. legacy | Modern stack = more open to new tools, easier integration. Legacy = longer adoption, higher switching cost. |
| **Integration requirements** | What must you connect with? | Hard integration requirements are binary disqualifiers if you cannot meet them |

### Technology Maturity Assessment

| Maturity Level | Indicators | Implication for Qualification |
|----------------|-----------|------------------------------|
| **Bleeding edge** | Latest frameworks, AI-native tools, experimental tech | High openness to new tools. Fast evaluation. May be fickle. |
| **Modern** | Current-generation tools, cloud-native, API-first | Good balance. Open to new tools with proof. Standard evaluation. |
| **Mainstream** | Established tools, some legacy, gradual upgrades | Moderate openness. Need strong ROI case and peer proof. |
| **Conservative** | Legacy systems, long upgrade cycles, risk-averse | Low openness to new tools. Need extensive proof, pilot, and executive sponsorship. Longer cycle. |

---

## Behavioral Criteria

Behavioral criteria measure what the prospect has done, not just who they are. Behavioral signals are the strongest short-term predictors of conversion because they indicate active intent.

### Engagement Level Scoring

| Score | Engagement Level | Indicators |
|-------|-----------------|------------|
| **5 - Active Evaluation** | Requested demo, filled out contact form, asked pricing question, visited pricing page 3+ times, downloaded comparison guide |
| **4 - High Engagement** | Downloaded multiple assets, attended product webinar, engaged with product-focused content, opened 5+ emails |
| **3 - Moderate Engagement** | Downloaded one asset, attended industry webinar, visited website 3+ times, subscribed to newsletter |
| **2 - Low Engagement** | Single website visit, one email open, social media follow, minimal interaction |
| **1 - No Engagement** | On a purchased list, no voluntary interaction, no website activity |

### Content Consumption Patterns

| Content Type | Intent Signal Strength | What It Tells You |
|-------------|----------------------|-------------------|
| Pricing page | Very High | Evaluating cost. Likely has budget conversations happening. |
| Comparison / "vs" page | Very High | Active competitive evaluation. Shortlist stage. |
| Case study (your vertical) | High | Looking for proof in their context. Building internal business case. |
| Product feature page | High | Evaluating capabilities. Matching to requirements. |
| Integration page | High | Confirming technical compatibility. Often late-stage. |
| ROI calculator | Very High | Building financial justification. Champion activity. |
| Blog post (problem-focused) | Medium | Problem awareness stage. Early but promising. |
| Blog post (general) | Low | General interest. Too early to qualify on this alone. |
| About page | Low | Curiosity. Not a buying signal. |

### Event Attendance

| Event Type | Intent Signal | Scoring Impact |
|------------|--------------|----------------|
| Product demo (requested) | Very High | +1.0 to Timing & Intent score |
| Product webinar (registered + attended) | High | +0.5 to Timing & Intent score |
| Product webinar (registered, no-show) | Low-Medium | +0.2 (registered = some intent, no-show = low priority) |
| Industry webinar (attended) | Low | Awareness only. Does not boost score unless topic is directly related. |
| In-person conference (visited booth, had conversation) | Medium-High | +0.5 to +0.8 depending on conversation depth |
| In-person conference (scanned badge only) | Low | Badge scans are the purchased list of events. Minimal signal. |

---

## Negative Qualification Criteria

Disqualifiers are as important as qualifiers. Knowing when to say "no" saves more time than knowing when to say "yes."

### Hard Disqualifiers (Immediate Disqualification)

| Criterion | Why It Disqualifies |
|-----------|-------------------|
| Direct competitor | They are researching you for competitive intel, not buying |
| Company size below absolute minimum | Below the threshold where your product delivers value (e.g., 2-person shop for enterprise tool) |
| Regulated industry you cannot serve | HIPAA, FedRAMP, SOX requirements you do not meet |
| Geography you cannot support | Country-specific data residency, language, or support requirements |
| Known bankruptcy or dissolution | No budget, no future |
| Student / academic / job seeker | Not a buyer. Route to marketing or community. |
| Existing customer (same product) | Not a new lead. Route to account management for expansion. |
| Duplicate lead (active deal exists) | Route to deal owner, do not create parallel qualification. |

### Soft Disqualifiers (Score Penalty, Not Immediate Rejection)

| Criterion | Score Impact | When to Override |
|-----------|-------------|-----------------|
| Company in hiring freeze | -1 to Budget Signals | If freeze is department-specific and does not affect your buyer's team |
| Recent layoffs (>10% of workforce) | -1 to Budget Signals, -0.5 to Timing | If layoffs were in unrelated division AND new leadership hired in your buyer's function |
| No social media / web presence | -0.5 to Company Size (may indicate very small) | If the company is in a low-visibility industry (manufacturing, logistics) where this is normal |
| Personal email (gmail, yahoo) | -1 to Role Authority | If lead is a known founder or freelance consultant with buying authority |
| Title mismatch (too junior) | -1 to Role Authority | If the person was explicitly sent by a senior stakeholder to evaluate |

---

## Scoring Calibration Examples

These examples show what each score level looks like in practice across the five dimensions.

### Company Size Fit: What Each Score Looks Like

Assume ICP sweet spot is 100-500 employees:

| Score | Example | Reasoning |
|-------|---------|-----------|
| **5** | 250 employees, growing 20% YoY | Dead center of ICP. Growth confirms stability. |
| **4** | 80 employees, just raised Series B, hiring 15 roles | Below range but compensating factors (funding, growth trajectory). Will likely be in range within 6 months. |
| **3** | 50 employees, stable, no recent funding | Edge of range. Workable but may lack the complexity that makes your product valuable. |
| **2** | 25 employees, seed-funded, CEO makes all decisions | Well below range. Might grow into ICP but timing is too early. |
| **1** | 8 employees, bootstrapped consulting shop | Far below range. Product is not designed for this size. |
| **0** | Cannot determine size from available data | No LinkedIn company page, no Crunchbase, no website team page. |

### Budget Fit: What Each Score Looks Like

Assume your ACV is $30K-$60K:

| Score | Example | Reasoning |
|-------|---------|-----------|
| **5** | "We have $75K budgeted for tools in this category." Paying a competitor $45K/year currently. | Explicit confirmation. Budget exists and is in range. |
| **4** | Series B, 200 employees, uses 3 other paid tools in adjacent categories ($10K-$40K each). | No explicit budget but strong proxy signals. Company clearly spends on tools. |
| **3** | Mid-size company, no funding news, uses some paid tools but unclear category spend. | Budget possible. No red flags but no strong positives. Needs discovery. |
| **2** | Early-stage, 30 employees, primarily using free tools. Recent blog post about "doing more with less." | Budget-constrained signals. May not prioritize paid tools in your category. |
| **1** | Bootstrapped 10-person agency. Public pricing shows they charge $5K/project. Your ACV exceeds their project revenue. | Structural budget mismatch. Your product costs more than their typical client engagement. |

### Timing & Intent: What Each Score Looks Like

| Score | Example | Reasoning |
|-------|---------|-----------|
| **5** | Demo request submitted Sunday night with detailed notes: "Evaluating tools for Q2 rollout. Need to present to VP by March 15." | Active evaluation with defined timeline and internal stakeholder awareness. |
| **4** | Downloaded 3 case studies in one week, visited pricing page twice, opened last 4 marketing emails. | Strong engagement pattern. Consistent behavior over multiple days indicates genuine evaluation. |
| **3** | Attended an industry webinar last month, subscribed to newsletter, visited blog twice. | Interested but not product-focused. Awareness stage, not evaluation stage. |
| **2** | Filled out a gated whitepaper form 3 months ago. No activity since. | Stale engagement. Was interested at some point but signal has decayed. |
| **1** | Name on a purchased list. No voluntary interaction ever. | Zero intent signal. This is an interruption, not a response to interest. |

---

## ICP Scorecard Template

Use this template to build a custom ICP scorecard for any organization. Fill in the criteria based on analysis of your best 20 customers.

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

---

## ICP Fit Correlation Data

### Win Rate by ICP Fit Score

| ICP Fit Score | Average Win Rate | Average Sales Cycle | Average ACV | 12-Month Retention |
|---------------|-----------------|--------------------|--------------|--------------------|
| 4.5-5.0 (Strong fit) | 35-45% | 28 days | At or above list price | 95%+ |
| 3.5-4.4 (Good fit) | 20-30% | 45 days | At list price | 88-95% |
| 2.5-3.4 (Moderate fit) | 10-18% | 65 days | 10-20% below list | 75-88% |
| 1.5-2.4 (Weak fit) | 5-10% | 90+ days | 20-40% below list | 55-75% |
| Below 1.5 (Poor fit) | <5% | 120+ days (if ever) | Deep discount | <55% |

Source: Aggregated from Gartner B2B Sales Benchmarks (2024), Salesforce State of Sales (2024), and Pavilion Revenue Collective survey (2023).

### The Revenue Quality Multiplier

**ICP-fit deals do not just close more -- they generate more revenue per unit of sales effort.**

| Metric | ICP-Fit Deals | Non-ICP Deals | Difference |
|--------|--------------|---------------|------------|
| Win rate | 33% | 12% | 2.75x |
| Sales cycle | 35 days | 72 days | 2.1x faster |
| Average discount | 8% | 22% | 2.75x less discounting |
| Expansion revenue (12mo) | 28% of ACV | 8% of ACV | 3.5x more expansion |
| NPS score | 52 | 18 | 2.9x higher satisfaction |
| Support tickets per account | 3.2/month | 8.7/month | 2.7x fewer tickets |

The math is stark: a sales team that ruthlessly qualifies for ICP fit will generate more revenue with fewer reps, shorter cycles, less discounting, and happier customers.

---

## Common ICP Mistakes

### 1. ICP Too Broad
**Symptom**: "Our ICP is any B2B company with 10+ employees."
**Problem**: This is not an ICP -- it is a TAM definition. If your ICP includes 80% of the market, it is not helping you prioritize.
**Fix**: Narrow to the segment where you win at 2x or higher than your average win rate.

### 2. ICP Based on Aspiration, Not Data
**Symptom**: "We want to sell to Fortune 500 companies" when all 20 of your customers are 50-200 person startups.
**Problem**: Your ICP should describe who you win, not who you wish you could win.
**Fix**: Analyze your top 20 customers by revenue, retention, and satisfaction. That is your ICP.

### 3. ICP Ignores Negative Criteria
**Symptom**: The ICP defines who to pursue but not who to avoid.
**Problem**: Without explicit disqualifiers, reps waste time on leads that match some criteria but have fatal flaws.
**Fix**: For every positive criterion, define the negative boundary. "100-500 employees" means you must also document "Below 50 employees is disqualified."

### 4. ICP Never Updated
**Symptom**: The ICP was defined 18 months ago and has not changed.
**Problem**: Markets shift, products evolve, and your winning customer profile changes. An 18-month-old ICP is steering you with a stale map.
**Fix**: Review and update ICP quarterly based on the last quarter's closed-won and closed-lost data.

### 5. ICP Conflates Company Fit with Buyer Persona
**Symptom**: "Our ICP is a VP of Sales at a SaaS company."
**Problem**: That is a buyer persona (person) stapled to one firmographic criterion (industry). It does not tell you what size SaaS company, what stage, what geography, or what tech stack.
**Fix**: Separate company ICP (firmographic + technographic + behavioral) from buyer persona (title, seniority, function, motivations).

### 6. ICP Treated as Binary
**Symptom**: Leads are either "ICP" or "not ICP" with no gradient.
**Problem**: Most leads are somewhere in between. A binary system either over-qualifies (missing good leads that are 80% fit) or under-qualifies (wasting time on leads that match one criterion).
**Fix**: Use a scoring model (like the 5-Dimension model) that produces a gradient, not a binary.

---

## ICP Review Cadence

### Quarterly Review (30 Minutes)

Pull these reports and compare to your current ICP:

1. **Last quarter's closed-won deals**: What are their firmographic, technographic, and behavioral profiles? Any surprises?
2. **Last quarter's closed-lost deals**: Where did they diverge from ICP? Are you losing in segments you thought were strong?
3. **Churn analysis**: Did any churned accounts match your ICP at close? If so, what was different?
4. **Fastest deals**: Which deals closed in half the average cycle? What do they have in common?
5. **Highest NPS accounts**: Which customers are happiest? What do they share?

### Annual Deep Review (Half Day)

Run a comprehensive ICP analysis:

1. Segment all customers by revenue, retention, NPS, and support load
2. Identify the top quartile on all four dimensions -- that is your "Platinum ICP"
3. Compare Platinum ICP firmographics to your current ICP definition
4. Adjust criteria, scoring weights, and thresholds based on data
5. Update disqualifiers based on closed-lost and churn patterns
6. Validate with sales team (do these changes match their intuition from deal work?)

---

## Sources and Further Reading

- Gartner. "B2B Sales Benchmark Report." 2024. Analysis of ICP-fit correlation with win rates across 500 B2B companies.
- Salesforce. "State of Sales." 5th Edition, 2024. Survey of 7,700 sales professionals across 38 countries.
- Pavilion Revenue Collective. "Revenue Leader Survey." 2023. Self-reported ICP-fit impact data from 400 revenue leaders.
- Forrester Research. "Align Sales and Marketing Around the ICP." 2023.
- Lincoln Murphy. "Ideal Customer Profile Framework." SixteenVentures.
- Winning by Design. "Revenue Architecture: ICP Definition Methodology." 2024.
- TOPO (Gartner). "ICP Development Best Practices." 2023.
