# Enrichment Playbook — Data Sources, Signals & Quality

Reference this file for integration details, signal definitions, and data quality benchmarks.

## Table of Contents
1. [Integration Reference](#integration-reference)
2. [Free Data Sources](#free-data-sources)
3. [Signal Definitions](#signal-definitions)
4. [Data Quality Benchmarks](#data-quality-benchmarks)
5. [Enrichment Statistics](#enrichment-statistics)
6. [Output Schema](#output-schema)

---

## Integration Reference

### Apollo.io

**Person Enrichment:**
```
POST https://api.apollo.io/api/v1/people/match
Headers: x-api-key: [key]

Request: {
  "first_name": "...",
  "last_name": "...",
  "organization_name": "...",
  "email": "...",            // optional, improves match
  "reveal_personal_emails": true,
  "reveal_phone_number": true
}

Key response fields:
- email, email_status (verified/unverified)
- phone_numbers (array with type: mobile/work)
- title, headline, seniority
- organization.name, industry, estimated_num_employees
- organization.annual_revenue, total_funding
- organization.technology_names (array of tech stack)
- organization.latest_funding_stage, latest_funding_round_date
- linkedin_url
- employment_history (array)
```

**Company Enrichment:**
```
GET https://api.apollo.io/api/v1/organizations/enrich
Params: domain=[company.com]

Key response fields:
- name, website_url, linkedin_url
- industry, keywords, secondary_industries
- estimated_num_employees, annual_revenue
- total_funding, latest_funding_stage
- technology_names (full tech stack)
- founded_year, publicly_traded_symbol
- city, state, country
- crunchbase_url
```

**Rate limits:** 600 calls/hour for person endpoint
**Credits:** 1 credit for email, 8 for phone, 1-9 for enrichment
**Accuracy:** 91% email accuracy, <1% invalid phone numbers

### AI Ark

**People Search:**
```
POST https://api.ai-ark.com/v1/people/search
Headers: X-TOKEN: [key]

Key response fields:
- full_name, email addresses
- job titles, company names
- employment history with dates
- locations, phone numbers
- LinkedIn profiles
- skills, education
```

**Company Search:**
```
POST https://api.ai-ark.com/v1/companies/search

Key response fields:
- company name, industry, website
- employee count, LinkedIn URL
- multiple regions (EMEA, NAM, APAC)
```

**Reverse Lookup:** Lookup by email or social handle
**Rate limits:** 10k records per batch request
**Credits:** 1 credit = 1 complete record
**Data freshness:** Updated every 30 days

### Apify LinkedIn Scraper

**Profile Scrape:**
```
POST https://api.apify.com/v2/acts/curious_coder~linkedin-profile-scraper/runs
Headers: Authorization: Bearer [token]

Input: {
  "profileUrls": ["https://linkedin.com/in/..."]
}

Key response fields:
- name, headline, summary, avatar
- current position (company, title, dates)
- full employment history
- education, certifications
- skills list, languages
- posts and activity
- connections count, followers
```

**Company Scrape:**
```
Actor: bebity~linkedin-premium-actor
Returns: company details, employee listings, job postings
```

**Rate limits:** Up to 40 profiles/minute, 500/day per LinkedIn account
**Cost:** $3-10 per 1,000 profiles
**Best practice:** Use no-cookie version for safety (no LinkedIn account risk)

---

## Free Data Sources

Use these BEFORE calling paid integrations. They're free and often sufficient.

### Company Research

| Source | What You Get | How to Access |
|--------|-------------|---------------|
| Company website | About, team, pricing, blog, careers | Web scrape |
| LinkedIn company page | Size, industry, description, employees | Web search |
| Crunchbase | Funding, investors, leadership, timeline | Web search (limited free) |
| Google News | Recent coverage, announcements, partnerships | `site:news.google.com "[company]"` |
| Job postings | Tech stack, growth areas, team gaps, culture | LinkedIn Jobs, Indeed, company careers page |
| GitHub | Dev practices, tech stack, activity level | Search by company name |
| G2/Capterra | Product reviews, competitor comparisons, sentiment | Web search |
| Company blog | Strategy, product updates, culture, thought leadership | Direct from website |

### Person Research

| Source | What You Get | How to Access |
|--------|-------------|---------------|
| LinkedIn (public) | Title, company, headline, connections | Web search `site:linkedin.com/in "[name]"` |
| Google search | Published content, interviews, mentions | `"[name]" "[company]"` |
| Twitter/X | Interests, opinions, engagement style | Search by name/handle |
| Podcast appearances | Thought leadership, speaking topics | `"[name]" podcast OR interview` |
| Company team page | Bio, role, photo | Company website /about or /team |
| Conference talks | Expertise areas, industry involvement | YouTube, event sites |

### Tech Stack Detection

| Source | What You Get | How to Access |
|--------|-------------|---------------|
| Job postings | Tools and technologies mentioned in requirements | Careers page, LinkedIn Jobs |
| BuiltWith | Website technologies, analytics, frameworks | builtwith.com (limited free) |
| Wappalyzer | Frontend stack, CMS, analytics tools | Browser extension (free) |
| GitHub repos | Languages, frameworks, development tools | github.com/[company] |
| StackShare | Self-reported tech stack | stackshare.io |

---

## Signal Definitions

### High Intent Signals (Score: +3 each)

| Signal | Why It Matters | Where to Find |
|--------|---------------|---------------|
| **Funding in last 90 days** | New capital = new budget. Companies that just raised are 2.5x more likely to buy. | Crunchbase, news, company blog |
| **Contact changed jobs <90 days** | New leaders evaluate vendors immediately. Highest-propensity prospects. | LinkedIn, Apollo |
| **Hiring for role you serve** | Active job posting = active need. The budget is approved. | LinkedIn Jobs, careers page |
| **Mentioned your category** | They're actively thinking about the problem you solve. | LinkedIn posts, blog, Twitter |
| **Replacing competitor tool** | Job posting mentions migrating from X. Budget allocated, timeline exists. | Job postings, tech stack changes |

### Medium Intent Signals (Score: +2 each)

| Signal | Why It Matters | Where to Find |
|--------|---------------|---------------|
| **Headcount growing >20%** | Scaling teams = scaling tools. Growing pain = buying mode. | LinkedIn, news, job posting volume |
| **New leadership in dept** | New leaders bring new vendors. Evaluation cycle starts. | LinkedIn, company announcements |
| **Office expansion** | Growing into new markets = new operational needs. | News, job postings with new locations |
| **Published content on your topic** | Problem-aware, thinking about solutions. | Blog, LinkedIn, podcasts |
| **Event attendance** | Investing time in learning = evaluating solutions. | Conference attendee lists, social posts |

### Context Signals (Score: +1 each)

| Signal | Why It Matters | Where to Find |
|--------|---------------|---------------|
| **Compatible tech stack** | Lower friction to adopt your solution. | BuiltWith, job postings, GitHub |
| **Industry trend alignment** | Macro forces pushing toward your solution. | Industry reports, news |
| **Competitor activity** | If competitors use your solution, social proof is built in. | Case studies, G2 reviews |
| **Seasonal buying pattern** | Budget cycles, fiscal year timing. | Industry knowledge |

### Negative Signals (Score: -2 each)

| Signal | Meaning | Action |
|--------|---------|--------|
| **Recent layoffs** | Budget cuts, survival mode. | Deprioritize or wait 6 months |
| **Recently bought competitor** | Locked in, won't switch soon. | Remove from pipeline |
| **Company downsizing** | Cutting spend, not adding. | Deprioritize |
| **Contact leaving company** | Won't have authority soon. | Find replacement contact |

---

## Data Quality Benchmarks

### Confidence Scoring

| Level | Criteria | Display |
|-------|----------|---------|
| **High** | Confirmed by 2+ independent sources, or from verified API (Apollo email verification) | ✅ High |
| **Medium** | Single credible source (company website, LinkedIn), or API data without verification flag | 🟡 Medium |
| **Low** | Inferred, single unverified source, or data older than 6 months | ⚠️ Low |
| **Stale** | Data older than 12 months with no recent confirmation | 🔴 Stale |

### Freshness Rules

| Data Type | Refresh Threshold | Action When Stale |
|-----------|-------------------|-------------------|
| Email address | 6 months | Re-verify or flag |
| Phone number | 6 months | Re-verify or flag |
| Job title | 3 months | Check LinkedIn for changes |
| Employee count | 6 months | Re-check, flag trend |
| Funding data | 3 months | Check for new rounds |
| Tech stack | 6 months | Re-check job postings |
| Revenue | 12 months | Flag as estimate |

### Common Data Decay Rates

- 30% of B2B contact data becomes obsolete annually
- Average tenure in role: 2.5 years (titles change)
- 25% of email addresses change per year
- Company employee count can shift 20%+ quarterly at growth-stage companies
- Tech stack changes average 2-4 tool additions/removals per year

---

## Enrichment Statistics

**Why waterfall enrichment beats single-source:**
- Waterfall match rates: 85-95% coverage
- Single-source match rates: 50-60% coverage
- Cost reduction: Only pay when data is found

**Impact of enrichment on sales:**
- Teams using enrichment report 25% more output
- Deals close 30% faster with proper enrichment
- SDRs waste 27% of selling time on bad data without enrichment

**What matters most for conversion (ranked):**
1. Intent data (buying signals) — highest conversion impact
2. Behavioral data (engagement patterns)
3. Firmographic fit (company size, industry, revenue)
4. Technographic fit (compatible tech stack)
5. Contact accuracy (verified email, direct phone)

---

## Output Schema

### Single Lead — Full Profile

```json
{
  "lead": {
    "person": {
      "name": "",
      "title": "",
      "seniority": "",
      "department": "",
      "linkedin_url": "",
      "email": { "value": "", "verified": false, "source": "", "confidence": "" },
      "phone": { "value": "", "type": "", "source": "", "confidence": "" },
      "employment_history": [],
      "time_in_role": "",
      "decision_maker": true,
      "content_topics": [],
      "social_profiles": {}
    },
    "company": {
      "name": "",
      "domain": "",
      "industry": "",
      "employees": { "value": "", "confidence": "" },
      "revenue": { "value": "", "confidence": "" },
      "founded": "",
      "hq": "",
      "funding": {
        "total": "",
        "latest_round": "",
        "latest_date": "",
        "investors": []
      },
      "tech_stack": [],
      "growth_trend": "",
      "leadership": []
    },
    "signals": [
      { "type": "high|medium|context|negative", "signal": "", "evidence": "", "source": "", "date": "" }
    ],
    "score": {
      "value": 0,
      "label": "",
      "reasoning": ""
    },
    "recommended_approach": "",
    "sources": [],
    "enriched_at": "",
    "data_freshness": ""
  }
}
```

### Batch — Summary Table

```json
{
  "batch": {
    "total": 0,
    "enriched": 0,
    "needs_review": 0,
    "leads": [
      {
        "name": "",
        "company": "",
        "title": "",
        "score": 0,
        "top_signal": "",
        "email_found": true,
        "status": "complete|needs_review|failed"
      }
    ]
  }
}
```
