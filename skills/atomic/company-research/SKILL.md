---
name: Company Research Report
description: |
  Deep company research producing a comprehensive, human-readable intelligence report with sourced findings.
  Use when a user asks "research this company", "company research on [company]", "full report on [company]",
  "due diligence on [company]", "look up [company]", or needs a detailed company overview before outreach.
  Unlike company-analysis (which returns structured JSON for programmatic use), this skill produces a
  formatted markdown report suitable for reading, sharing, or pasting into an email/doc.
  Covers: company overview, leadership, product suite, evolution timeline, market position, financials,
  customer reputation, recent activity, competitive landscape, and buying intent signals.
metadata:
  author: sixty-ai
  version: "1"
  category: enrichment
  skill_type: atomic
  is_active: true
  command_centre:
    enabled: true
    label: "/research"
    description: "Deep research on a company or contact"
    icon: "file-search"
  context_profile: research
  agent_affinity:
    - research
    - pipeline
    - outreach
  triggers:
    - pattern: "research this company"
      intent: "company_research"
      confidence: 0.90
      examples:
        - "research [company]"
        - "do a research report on"
        - "company research for"
    - pattern: "full report on"
      intent: "company_full_report"
      confidence: 0.85
      examples:
        - "give me a full report on"
        - "build a report on this company"
        - "comprehensive report on"
    - pattern: "due diligence on"
      intent: "company_due_diligence"
      confidence: 0.85
      examples:
        - "due diligence report"
        - "run due diligence on"
        - "DD on this company"
    - pattern: "look up this company"
      intent: "company_lookup"
      confidence: 0.80
      examples:
        - "look up [company]"
        - "what can you find on"
        - "find out about this company"
    - pattern: "company overview"
      intent: "company_overview"
      confidence: 0.75
      examples:
        - "give me an overview of"
        - "overview of this company"
        - "tell me everything about"
  keywords:
    - "research"
    - "report"
    - "due diligence"
    - "look up"
    - "overview"
    - "company intel"
    - "company profile"
    - "full report"
    - "intelligence report"
  required_context:
    - company_name
  inputs:
    - name: company_name
      type: string
      description: "Name of the company to research"
      required: true
    - name: company_website
      type: string
      description: "Company website URL or domain (speeds up research)"
      required: false
    - name: founder_name
      type: string
      description: "Founder or CEO name (helps disambiguate)"
      required: false
    - name: industry
      type: string
      description: "Industry context to focus the research"
      required: false
  outputs:
    - name: report
      type: string
      description: "Formatted markdown intelligence report with all sections"
    - name: company_overview
      type: object
      description: "Structured summary with name, founded, headquarters, industry, website, employees"
    - name: leadership
      type: array
      description: "Key leaders with name, role, and background"
    - name: products
      type: array
      description: "Product/service lines with descriptions"
    - name: timeline
      type: array
      description: "Company evolution milestones by year"
    - name: market_position
      type: object
      description: "Performance claims, scale, notable clients, awards"
    - name: financials
      type: object
      description: "Funding rounds, investors, valuation signals"
    - name: reputation
      type: object
      description: "Review platform ratings and themes"
    - name: recent_activity
      type: array
      description: "Recent 5-10 notable events or announcements"
    - name: competitive_landscape
      type: object
      description: "Direct competitors, differentiators, market trends"
    - name: buying_signals
      type: array
      description: "Detected buying intent signals for sales teams"
    - name: sources
      type: array
      description: "All URLs consulted with descriptive titles"
  requires_capabilities:
    - web_search
  priority: high
  tags:
    - enrichment
    - company
    - research
    - report
    - due-diligence
    - account-intel
---

## Available Context & Tools
@_platform-references/org-variables.md
@_platform-references/capabilities.md

# Company Research Report

## Goal
Produce a comprehensive, human-readable intelligence report on a target company. The report should feel like a professional analyst briefing — factual, sourced, and actionable for sales teams.

## Required Capabilities
- **Web Search**: To research company information across multiple sources (routed to search-capable model)

## Inputs
- `company_name`: Name of the company to research (required)
- `company_website`: Company website URL or domain (if known, speeds up research significantly)
- `founder_name`: Founder or CEO name (helps disambiguate when multiple companies share a name)
- `industry`: Industry context (helps focus research on the right company and relevant metrics)

## Research Methodology

### Phase 1: Discovery (run searches in parallel)

Execute these searches simultaneously:

1. **Primary**: `"[Company Name]" company` — official site, Wikipedia, Crunchbase
2. **Product/service**: `"[Company Name]" product OR platform OR service` — what they sell
3. **Leadership**: `"[Company Name]" founder OR CEO OR "co-founder"` — who runs it
4. **News**: `"[Company Name]" news OR announcement OR funding OR acquisition` — recent activity
5. **Reviews**: `"[Company Name]" reviews OR Trustpilot OR G2 OR Capterra` — market reputation

If a domain is known, also:
6. **Site-specific**: `site:[domain.com]` — what they publish themselves
7. **Companies House / SEC**: `"[Company Name]" "companies house" OR "SEC filing"` — official records

### Phase 2: Deep Dive

Based on Phase 1 results, fetch the most promising URLs:
- Company About page and product pages
- Crunchbase or PitchBook profile
- Recent blog posts or press releases (last 6 months)
- Companies House / SEC filings (if applicable)
- G2, Trustpilot, or Capterra review pages
- LinkedIn company page

### Phase 3: Synthesis

Compile findings into the structured report format below.

## Output Contract

Return a SkillResult with:

- `data.report`: The full formatted markdown report (see Report Format below)
- `data.company_overview`: Structured object with `name`, `founded`, `headquarters`, `company_type`, `industry`, `website`, `employees`
- `data.leadership`: Array of `{ name, role, background }`
- `data.products`: Array of `{ name, domain, description, target_customer }`
- `data.timeline`: Array of `{ year, milestone }`
- `data.market_position`: Object with `performance_claims`, `scale`, `notable_clients`, `awards`
- `data.financials`: Object with `funding_rounds`, `total_raised`, `investors`, `valuation`, `revenue_signals`
- `data.reputation`: Object with `platforms` array of `{ name, rating, review_count, summary }`
- `data.recent_activity`: Array of `{ date, event, source_url }`
- `data.competitive_landscape`: Object with `direct_competitors`, `differentiators`, `market_trends`
- `data.buying_signals`: Array of detected buying intent signals (see Buying Signals section)
- `data.sources`: Array of `{ title, url }` for all consulted sources
- `references`: Array of all source URLs used

## Report Format

The `report` field must use this exact markdown structure. Omit sections where no data was found rather than guessing.

```markdown
## [Company Name] — Intelligence Report

### Company Overview

| Field | Detail |
|-------|--------|
| **Founded** | [Year], [Location] |
| **Headquarters** | [City, Country] |
| **Company Type** | [Private/Public, Company Number if available] |
| **Industry** | [Primary industry] |
| **Website** | [Primary domain] |
| **Employees** | [Estimate or range] |

[2-3 sentence summary of what the company does and its market position.]

---

### Leadership

| Person | Role | Background |
|--------|------|------------|
| [Name] | [Title] | [Brief bio] |

---

### Product Suite

- **[Product Name]** ([domain]) — [Description, key features, target customer]

---

### Company Evolution

| Year | Milestone |
|------|-----------|
| [Year] | [Key event] |

---

### Market Position

- **Performance Claims**: [Stated metrics]
- **Scale**: [Users, customers, countries, revenue]
- **Notable Clients**: [Named customers]
- **Awards/Recognition**: [Awards, rankings]

---

### Financial & Funding

| Round | Date | Amount | Investors |
|-------|------|--------|-----------|
| [Type] | [Date] | [Amount] | [Investors] |

---

### Customer Reputation

| Platform | Rating | Reviews | Summary |
|----------|--------|---------|---------|
| [Platform] | [Score] | [Count] | [Themes] |

---

### Recent Activity

- [Date]: [Event] ([Source])

---

### Competitive Landscape

- **Direct Competitors**: [List]
- **Differentiators**: [What sets them apart]
- **Market Trends**: [Relevant trends]

---

### Buying Intent Signals

- [Signal type]: [Detail and what it means for outreach]

---

### Sources

- [Source Title](URL)
```

## Buying Intent Signals

Flag these if found -- they're high value for sales teams. Use the products, competitors, and industry from the Organization Context above to identify signals relevant to ${company_name}'s sales motion:

- **Leadership changes**: New CTO/VP Engineering = potential tech stack review
- **Funding round**: Fresh capital = budget for new tools
- **Job postings**: Hiring for roles related to ${company_name}'s product area (as described in Organization Context) = active need
- **Competitor mentions**: Complaints about current vendor = switching intent
- **Conference attendance**: Speaking/sponsoring = active in market
- **Blog content**: Writing about problems that ${company_name}'s products solve (reference Organization Context for product details) = awareness stage
- **Tech stack changes**: Migrating platforms = evaluation window
- **Expansion signals**: New offices, new markets, international growth

## Quality Standards

1. **Every claim needs a source.** Prefix uncertain information with "reportedly" or "according to [source]".
2. **Dates matter.** Note when information was published. Flag data older than 6 months.
3. **No hallucinated metrics.** If data isn't publicly available, say so explicitly.
4. **Actionable for sales.** Include details a rep would use: tech stack, pain points, growth trajectory, decision-makers, buying signals.
5. **Sources section is mandatory.** List all URLs with descriptive titles.

## Edge Cases

### Company not found
Try alternate names, abbreviations, parent companies, domain variations. If still minimal: report what was found and clearly state the gaps.

### Multiple companies with same name
Use `founder_name` or `industry` input to disambiguate. If still ambiguous, present the most likely match and note the disambiguation.

### Very large companies (Fortune 500)
Focus on the most recent 12 months. Skip exhaustive history. Emphasize recent strategic moves, leadership changes, and market positioning shifts.

### Very small / new companies
Lean harder on social media, founder backgrounds, job postings, and product screenshots. Note limited data availability honestly.

## Error Handling
- If company name is ambiguous, use additional context (industry, founder, domain) to disambiguate
- If web search returns conflicting information, present the most recent and most credible source
- Always return at least `company_overview` and `report` even if other sections have limited data
- Mark confidence level on uncertain information: "confirmed", "estimated", "unverified"
