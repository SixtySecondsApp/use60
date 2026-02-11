# Data Source Reliability and Freshness Hierarchy

A definitive guide to evaluating, prioritizing, and cross-referencing B2B sales intelligence data sources.

## Table of Contents

1. [The Source Hierarchy Model](#the-source-hierarchy-model)
2. [Tier 1: Verified Sources](#tier-1-verified-sources)
3. [Tier 2: Reliable Sources](#tier-2-reliable-sources)
4. [Tier 3: Useful Sources](#tier-3-useful-sources)
5. [Tier 4: Supplementary Sources](#tier-4-supplementary-sources)
6. [Freshness Decay Rates by Data Type](#freshness-decay-rates-by-data-type)
7. [Cross-Reference Rules](#cross-reference-rules)
8. [Conflict Resolution Methodology](#conflict-resolution-methodology)
9. [Source-Specific Accuracy Data](#source-specific-accuracy-data)
10. [Practical Source Selection Guide](#practical-source-selection-guide)

---

## The Source Hierarchy Model

Not all data sources are equally reliable. A funding amount from Crunchbase is not the same confidence level as a funding amount from a press release, and neither is the same as a funding amount inferred from a blog post. The source hierarchy ensures you weight data correctly and flag uncertainty when it exists.

### Hierarchy Summary

| Tier | Label | Confidence | Example Sources |
|------|-------|-----------|-----------------|
| **Tier 1** | Verified | 90-100% | SEC filings, verified API data (Apollo, ZoomInfo), company press releases, signed contracts |
| **Tier 2** | Reliable | 70-89% | Company website, LinkedIn (self-reported), Crunchbase (editorially reviewed), official social media |
| **Tier 3** | Useful | 50-69% | News articles, review sites (G2, Capterra), industry reports, conference materials |
| **Tier 4** | Supplementary | 30-49% | Inferred data, estimated ranges, blog posts, community forums, social media comments |

**Rule**: When data from a higher-tier source conflicts with data from a lower-tier source, the higher-tier source wins unless the lower-tier source is demonstrably more recent.

---

## Tier 1: Verified Sources

These sources provide data that has been officially filed, contractually committed, or verified through direct integration with authoritative databases.

### SEC / Companies House / Public Filings

| Data Available | Confidence | Freshness | Notes |
|---------------|-----------|-----------|-------|
| Revenue (public companies) | 99% | Quarterly | 10-K, 10-Q filings. Gold standard for revenue data. |
| Employee count (public) | 95% | Annual | Reported in filings but may lag actual headcount. |
| Acquisitions | 99% | Within days | 8-K filings for material acquisitions. |
| Executive compensation | 95% | Annual | Proxy statements. Useful for understanding company scale. |
| Funding (if venture-backed and disclosed) | 90% | Event-based | Series rounds appear in SEC Form D filings. |

**Limitation**: Only available for public companies or venture-backed companies that file Form D. Most private B2B companies have minimal public filings.

### Verified API Data (Apollo, ZoomInfo, Clearbit)

| Data Available | Confidence | Freshness | Notes |
|---------------|-----------|-----------|-------|
| Contact email | 85-95% | Varies by provider | Apollo: 91% accuracy on verified emails. ZoomInfo: 95%. |
| Direct phone | 70-85% | Lower freshness | Phone numbers change more frequently than email. |
| Job title | 80-90% | 1-6 months lag | Pulled from LinkedIn and other sources. May lag role changes. |
| Company size | 85-90% | 3-12 months lag | Aggregated from multiple sources. Generally reliable. |
| Industry | 90-95% | Stable | Industry rarely changes. High confidence. |
| Tech stack | 60-80% | 3-6 months lag | Detected via web scraping, job postings, integrations. |

**Limitation**: API data providers aggregate and infer data. Their "verified" label does not mean 100% confirmed. Cross-reference critical data points.

### Company Press Releases

| Data Available | Confidence | Freshness | Notes |
|---------------|-----------|-----------|-------|
| Funding rounds | 95% | Day of announcement | Companies control their own PR. Amounts may be rounded. |
| Product launches | 95% | Day of announcement | Official positioning and messaging. |
| Partnerships | 90% | Day of announcement | Both parties usually confirm. |
| Leadership changes | 95% | Day of announcement | Hire/departure press releases are highly reliable. |
| Revenue milestones | 90% | When announced | Companies choose when to share. May be selective. |

**Limitation**: Press releases are marketing documents. Companies share flattering data and omit unflattering data. Funding amounts may exclude certain terms. Revenue milestones may use favorable metrics (bookings vs. ARR vs. revenue).

---

## Tier 2: Reliable Sources

These sources provide self-reported or editorially reviewed data that is generally accurate but may contain biases, omissions, or staleness.

### Company Website

| Data Available | Confidence | Freshness | Notes |
|---------------|-----------|-----------|-------|
| Products/services | 85-90% | Usually current | Core pages are maintained. But feature pages may lag. |
| Team/leadership | 75-85% | Varies widely | Some companies update in real-time. Others are 6-12 months stale. |
| Customer logos | 80% | May be stale | Companies add logos but rarely remove churned customers. |
| Company description | 85% | Usually current | About page is typically maintained. |
| Pricing | 80-90% | Usually current | Pricing pages are high-traffic and maintained. But enterprise pricing is rarely shown. |
| Blog content | 90% | Date shown | Content itself is reliable. But old posts may describe outdated strategies. |

**Limitation**: Company websites are marketing surfaces. They present the best version of reality. Customer logos may include churned customers. Team pages may be outdated.

### LinkedIn (Company and Personal Profiles)

| Data Available | Confidence | Freshness | Notes |
|---------------|-----------|-----------|-------|
| Current title | 80-85% | Self-reported, variable | Most people update within 1-3 months of a change. Some never update. |
| Employment history | 80% | Self-reported | Generally accurate but may omit short stints or unflattering roles. |
| Employee count | 75-85% | Updates slowly | LinkedIn counts employees who list the company. Lags actual hiring/departures by 1-3 months. |
| Company headquarters | 85% | Usually current | Rarely changes. High confidence. |
| Industry | 85-90% | Stable | Self-classified by the company admin. |
| Connections | 90% | Real-time | Connection lists are accurate at time of viewing. |
| Activity/posts | 95% | Real-time | What they post is what they post. But absence of activity does not mean inactivity. |

**Limitation**: LinkedIn data is self-reported. Title inflation is common (especially at startups). "500+ employees" could mean 501 or 5,000. People often delay updating profiles after role changes.

### Crunchbase

| Data Available | Confidence | Freshness | Notes |
|---------------|-----------|-----------|-------|
| Funding rounds | 85-90% | Usually within days | Editorially reviewed. Most rounds are captured. But some stealth rounds are missed. |
| Investors | 85% | Event-based | Usually accurate for lead investors. May miss follow-on participants. |
| Company description | 80% | May be stale | Community-edited. Quality varies. |
| Employee count | 70-80% | Quarterly at best | Less frequently updated than LinkedIn. |
| Founded date | 90% | Static | Usually accurate but may show incorporation date, not founding date. |
| Acquisitions | 85% | Within days-weeks | Well-tracked for funded companies. May miss acqui-hires. |

**Limitation**: Crunchbase has better coverage of VC-backed tech companies and weaker coverage of bootstrapped, non-tech, or international companies.

---

## Tier 3: Useful Sources

These sources provide contextual data that is generally directionally correct but may lack verification and carries higher uncertainty.

### News Articles

| Data Available | Confidence | Freshness | Notes |
|---------------|-----------|-----------|-------|
| Events (funding, launch, acquisition) | 75-85% | Day of publication | Major publications (TechCrunch, WSJ) are reliable. Trade press less so. |
| Revenue figures (reported) | 60-75% | As reported | Journalists may misquote, round, or conflate metrics. |
| Employee count | 50-65% | As reported | Often sourced from LinkedIn or company statements. Secondary source. |
| Strategic direction | 60-70% | As reported | Analyst interpretation may not match company reality. |
| Quotes from executives | 80-85% | As reported | Direct quotes are generally accurate. Context may be selectively presented. |

**Limitation**: News articles are written to a narrative. Journalists may over-simplify, selectively quote, or speculate. Company-planted stories are common (especially in funding coverage). Always cross-reference with Tier 1 or 2 sources.

### Review Sites (G2, Capterra, TrustRadius)

| Data Available | Confidence | Freshness | Notes |
|---------------|-----------|-----------|-------|
| Product strengths/weaknesses | 70-80% | Varies by review recency | Aggregate of 20+ reviews is reliable. Individual reviews are not. |
| Customer company names | 75% | As reviewed | Self-reported by reviewers. May include trial users. |
| Market category/competitors | 80% | Quarterly grid updates | Analyst-curated categories are reliable for competitive context. |
| Pricing sentiment | 60-70% | Varies | "Expensive" or "good value" is subjective. Use with caution. |
| Feature ratings | 70-75% | As reviewed | Useful for feature comparison but reviewers have different benchmarks. |

**Limitation**: Review sites have known biases. Companies incentivize reviews (G2 gifts, Capterra rewards). Review recency varies -- a product reviewed in 2022 may have changed significantly. Always check the date of individual reviews.

### Industry Reports (Gartner, Forrester, IDC)

| Data Available | Confidence | Freshness | Notes |
|---------------|-----------|-----------|-------|
| Market sizing | 70-80% | Annual | Methodologies vary. Different firms produce different numbers for the same market. |
| Competitive positioning | 75% | Annual (Magic Quadrant, Wave) | Analyst relationships and methodology create biases. Not purely objective. |
| Technology trends | 75-80% | Annual | Directionally correct but tend to be 6-12 months behind actual adoption. |
| Vendor profiles | 70% | Annual | Vendors pay for placement and coverage. Not fully independent. |

---

## Tier 4: Supplementary Sources

These sources provide directional signals that should never be treated as fact without cross-reference.

### Inferred Data

| Data Type | How It Is Inferred | Confidence | Notes |
|-----------|--------------------|-----------|-------|
| Revenue estimate | Employee count x industry-average revenue per employee | 40-60% | Wide variance. SaaS ranges from $100K-$500K per employee. |
| Burn rate estimate | Total funding - estimated revenue, divided by time | 30-50% | Multiple unknowns compound. Use as rough ballpark only. |
| Decision-maker authority | Title + company size = inferred authority level | 50-65% | Title inflation and flat organizations reduce reliability. |
| Tech stack (from job postings) | Technologies mentioned in job descriptions | 60-75% | Aspirational requirements may not reflect current stack. |
| Growth trajectory | Hiring rate + funding recency + news sentiment | 50-65% | Composite inference. Directionally useful but not precise. |

### Blog Posts and Social Media

| Data Available | Confidence | Freshness | Notes |
|---------------|-----------|-----------|-------|
| Personal opinions/priorities | 65-75% | As posted | What people write about reveals interests but not necessarily buying intent. |
| Company culture signals | 55-65% | As posted | Social media presents curated reality. |
| Strategic hints | 50-60% | As posted | Founders sometimes hint at direction but rarely reveal specifics. |
| Technical architecture | 65-75% | As posted | Engineering blog posts are more reliable but may be aspirational. |

---

## Freshness Decay Rates by Data Type

All data decays. Some types decay faster than others. This table defines how quickly each data type becomes unreliable.

| Data Type | Fresh (<) | Acceptable (<) | Stale (>) | Decay Driver |
|-----------|-----------|----------------|-----------|-------------|
| Job title / role | 3 months | 6 months | 6 months | People change roles. Average tenure in a role is 2.3 years but changes are not always updated. |
| Email address | 6 months | 12 months | 12 months | People leave companies. Domains change. |
| Phone number | 3 months | 6 months | 6 months | Higher churn than email. Mobile numbers more stable than direct lines. |
| Company size | 6 months | 12 months | 12 months | Headcount changes with hiring cycles. Fast-growth companies can change 20%+ in 6 months. |
| Funding data | 3 months | 12 months | 12 months | Funding is an event, not a continuous signal. Recency of the round matters for buying signals. |
| Tech stack | 6 months | 12 months | 12 months | Major stack changes happen annually. Individual tool changes happen monthly. |
| News / press | 30 days | 90 days | 90 days | News is inherently time-bound. Only major events (funding, acquisition) retain relevance beyond 90 days. |
| Company description | 12 months | 24 months | 24 months | Company positioning changes slowly. But pivots can make descriptions obsolete overnight. |
| Revenue data | 3 months | 6 months | 6 months | For growth-stage companies, revenue can change 30-50% in 6 months. |
| Contact details (general) | 3 months | 6 months | 6 months | Average B2B database decays at 2-3% per month (ZoomInfo, 2024). |

### The 2-3% Monthly Decay Rule

B2B contact databases decay at approximately 2-3% per month (ZoomInfo research, 2024; Gartner, 2023). This means:
- After 6 months, 12-18% of your data is stale
- After 12 months, 24-36% of your data is stale
- After 18 months, 36-54% of your data is stale

This decay rate compounds. It applies to email addresses, phone numbers, job titles, and company information. The practical implication: any data point older than 6 months should be verified before use in outreach.

---

## Cross-Reference Rules

### The 2-Source Rule

For any data point that will be used in outreach or qualification scoring, verify it with at least 2 independent sources. A "source" means a distinct origin of the data, not two websites reporting the same press release.

| Data Point | Primary Source | Cross-Reference With |
|-----------|---------------|---------------------|
| Job title | LinkedIn | Company website team page, or email signature |
| Company size | LinkedIn company page | Crunchbase, or job postings count |
| Funding round | Crunchbase | Press release or TechCrunch article |
| Revenue range | Press release or award listing | Employee count x industry benchmark |
| Tech stack | Job postings | Website analysis (BuiltWith) or engineering blog |
| Company industry | Company website | LinkedIn company page classification |

### When Cross-Reference Is Not Needed

Some data points are low-risk enough that single-source is acceptable:

- Company founded date (rarely contested)
- Company headquarters location (stable, easy to verify)
- Industry classification (broad and rarely wrong)
- LinkedIn profile URL (if identity is verified)

---

## Conflict Resolution Methodology

When two sources disagree, use this decision framework:

### Step 1: Check Recency
Which source was updated more recently? If one source is 3 months old and another is 12 months old, the newer source wins unless there is reason to doubt it.

### Step 2: Check Tier
Which source is higher-tier? Tier 1 beats Tier 2 beats Tier 3, unless the lower-tier source is significantly more recent.

### Step 3: Check Specificity
Which source is more specific? "Approximately 200 employees" from Crunchbase vs. "247 employees" from LinkedIn -- the more specific figure is usually more reliable (someone counted).

### Step 4: Check Incentive
Does either source have an incentive to misrepresent? Company websites may inflate customer counts. LinkedIn profiles may inflate titles. Press releases may round up funding amounts. Factor in the incentive.

### Step 5: Document the Conflict

If the conflict cannot be resolved, present both data points with their sources and recency:

```
Employee count:
- LinkedIn company page: ~250 (updated March 2026)
- Crunchbase: 180 (updated September 2025)
- Using LinkedIn figure as primary (more recent, updated by company admin)
- Note: Discrepancy may reflect Q3-Q4 2025 hiring wave visible in job postings
```

### Common Conflicts and Resolution Defaults

| Conflict | Resolution |
|----------|-----------|
| LinkedIn employee count vs. Crunchbase | Use LinkedIn (updated by company admins, refreshed more frequently) |
| LinkedIn title vs. company website title | Use LinkedIn (self-reported by the person, usually more current) |
| Funding amount in press release vs. Crunchbase | Use press release (primary source), note Crunchbase may include extensions |
| Revenue from news article vs. from SEC filing | Use SEC filing (legally required accuracy) |
| Tech stack from job posting vs. BuiltWith | Use job posting (more comprehensive, includes internal tools) |

---

## Source-Specific Accuracy Data

### Email Verification Accuracy by Provider

| Provider | Claimed Accuracy | Independent Testing | Notes |
|----------|-----------------|-------------------|-------|
| ZoomInfo | 95% | 88-92% | Highest accuracy for US enterprise contacts |
| Apollo.io | 91% | 82-88% | Good for mid-market and startup contacts |
| Clearbit | 90% | 80-86% | Strong for tech companies, weaker for non-tech |
| Hunter.io | 85% | 78-84% | Pattern-based verification, good for domain-level accuracy |
| Lusha | 88% | 80-85% | Good for direct dials, weaker for email |

Source: Accuracy ranges from independent testing by Demand Gen Report (2024) and SalesIntel accuracy audit (2023).

### Company Data Accuracy by Source

| Source | Company Size Accuracy | Industry Accuracy | Funding Accuracy |
|--------|---------------------|-------------------|-----------------|
| LinkedIn | 80-85% | 85-90% | N/A (not provided) |
| Crunchbase | 70-80% | 85% | 85-90% |
| ZoomInfo | 85-90% | 90% | 80-85% |
| Apollo.io | 75-85% | 85% | 75-80% |
| Company Website | 85-90% (when listed) | 90%+ | 90% (when announced) |

---

## Practical Source Selection Guide

### By Research Phase

| Phase | Best Sources | Why |
|-------|-------------|-----|
| **Identity verification** | LinkedIn, company website | Confirm the right person at the right company |
| **Company basics** | LinkedIn company page, Crunchbase, company website | Fast, reliable, covers size/industry/location |
| **Financial intelligence** | Crunchbase, press releases, SEC filings | Funding data is critical for budget signals |
| **Tech stack** | Job postings, BuiltWith, engineering blog | Multiple detection methods improve accuracy |
| **Recent signals** | Google News, LinkedIn activity, company blog | Freshness is paramount for timing signals |
| **Competitive context** | G2/Capterra, comparison articles | Review sites aggregate competitive positioning |
| **Connection points** | LinkedIn activity, mutual connections, conference bios | Personal and specific, not company-level |

### By Data Criticality

| If The Data Will Be Used For... | Minimum Source Tier | Cross-Reference Required? |
|-------------------------------|--------------------|-----------------------|
| Outreach personalization (in an email) | Tier 2 | Yes, if factual claims are made |
| Qualification scoring | Tier 2 | Not mandatory, but improves confidence |
| Internal account planning | Tier 3 | No (internal use, lower risk) |
| Executive briefing / board presentation | Tier 1 or Tier 2 | Yes, always |
| Competitive positioning claims | Tier 2 | Yes, must be defensible |

---

## Sources and Further Reading

- ZoomInfo. "B2B Data Accuracy and Decay Research." 2024. Analysis of 200M contact records over 24 months.
- Gartner. "Data Quality in B2B Sales: Benchmark Report." 2023.
- Demand Gen Report. "Sales Intelligence Accuracy Audit." 2024. Independent testing of 6 major data providers.
- SalesIntel. "The State of B2B Data Quality." 2023. Accuracy benchmarks by data type and provider.
- Crunchbase. "Data Methodology and Sources." Documentation, 2024.
- LinkedIn. "Economic Graph: How LinkedIn Data Is Generated." Documentation, 2024.
- Apollo.io. "Data Accuracy Methodology." Documentation, 2024.
