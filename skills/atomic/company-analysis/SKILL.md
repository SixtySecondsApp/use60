---
name: Company Analysis
description: |
  Deep company analysis covering funding, tech stack, hiring, news, and competitive landscape.
  Use when a user asks "analyze this company", "company deep dive", "tell me about [company]'s business",
  "company intel", or needs comprehensive business intelligence on a target account.
  Returns structured analysis with business model, financials, technology, and growth assessment.
metadata:
  author: sixty-ai
  version: "2"
  category: enrichment
  skill_type: atomic
  is_active: true
  triggers:
    - pattern: "analyze this company"
      intent: "company_analysis"
      confidence: 0.90
      examples:
        - "analyze this account"
        - "deep analysis of this company"
        - "company analysis for"
    - pattern: "company deep dive"
      intent: "company_deep_dive"
      confidence: 0.90
      examples:
        - "deep dive on this company"
        - "do a deep dive on"
        - "full company breakdown"
    - pattern: "tell me about their business"
      intent: "company_intel"
      confidence: 0.80
      examples:
        - "what does this company do"
        - "tell me about their products"
        - "how does this company make money"
    - pattern: "company intel"
      intent: "company_intelligence"
      confidence: 0.85
      examples:
        - "get intel on this company"
        - "company intelligence report"
        - "account intelligence"
  keywords:
    - "company"
    - "analysis"
    - "deep dive"
    - "intel"
    - "business model"
    - "funding"
    - "tech stack"
    - "account"
    - "research"
  required_context:
    - company_name
  inputs:
    - name: company_name
      type: string
      description: "Name of the company to analyze"
      required: true
    - name: company_website
      type: string
      description: "Company website URL to speed up research"
      required: false
    - name: industry
      type: string
      description: "Industry context to focus the research"
      required: false
  outputs:
    - name: business_overview
      type: object
      description: "Company fundamentals with name, description, business model, products, target market, and leadership"
    - name: financials
      type: object
      description: "Financial intelligence with funding, valuation, revenue signals, and financial health"
    - name: technology
      type: object
      description: "Technology landscape with tech stack, engineering culture, and integration ecosystem"
    - name: market_position
      type: object
      description: "Competitive context with market segment, key competitors, and differentiators"
    - name: growth_assessment
      type: object
      description: "Growth trajectory with evidence, hiring trends, milestones, and risks"
    - name: news_timeline
      type: array
      description: "5-8 recent news items with date, title, source, summary, and significance"
  requires_capabilities:
    - web_search
  priority: high
  tags:
    - enrichment
    - company
    - analysis
    - account-intel
---

# Company Analysis

## Goal
Produce a comprehensive company analysis that equips the sales rep with deep account intelligence for strategic engagement.

## Required Capabilities
- **Web Search**: To research company information across the web (routed to Gemini with Google Search grounding)

## Inputs
- `company_name`: Name of the company to analyze (required)
- `company_website`: Company website URL (if known, speeds up research)
- `industry`: Industry context (if known, helps focus research)
- `organization_id`: Current organization context

## Data Gathering (via web search)
1. Search for the company's official website, About page, and product pages
2. Search for business model, revenue model, and target market information
3. Search for funding rounds on Crunchbase, PitchBook, or news articles (investors, valuation, total raised)
4. Search for technology stack via job postings, BuiltWith, StackShare, or engineering blog posts
5. Search for recent news, press releases, product launches, and blog posts (last 6 months)
6. Search for leadership team, key executives, and recent leadership changes
7. Search for competitive landscape and market positioning
8. Search for hiring activity and open roles (indicates growth areas and priorities)
9. Search for customer reviews, case studies, or notable clients (if B2B)

## Output Contract
Return a SkillResult with:
- `data.business_overview`: Company fundamentals with:
  - `company_name`: Official name
  - `website`: URL
  - `description`: 2-3 sentence company description
  - `business_model`: How they make money (SaaS, marketplace, services, etc.)
  - `products`: Array of main products/services with brief descriptions
  - `target_market`: Who they sell to (segments, verticals, company sizes)
  - `headquarters`: Location
  - `founded`: Year founded
  - `employee_count`: Estimated headcount or range
  - `leadership`: Array of key executives (name, title)
- `data.financials`: Financial intelligence with:
  - `funding_total`: Total funding raised
  - `latest_round`: Most recent funding round (type, amount, date)
  - `investors`: Notable investors
  - `valuation`: Last known valuation (if available)
  - `revenue_signals`: Any public revenue data or estimates
  - `financial_health`: "strong" | "stable" | "concerning" | "unknown" with reasoning
- `data.technology`: Technology landscape with:
  - `tech_stack`: Known technologies, frameworks, and tools
  - `engineering_culture`: Insights from engineering blog or job postings
  - `infrastructure`: Cloud provider, key platforms
  - `integration_ecosystem`: Key integrations and partners
- `data.market_position`: Competitive context with:
  - `market_segment`: Primary market category
  - `key_competitors`: Array of 3-5 main competitors
  - `differentiators`: What makes them unique
  - `market_share_signals`: Any available market position data
- `data.growth_assessment`: Growth trajectory with:
  - `trajectory`: "rapid_growth" | "steady_growth" | "stable" | "declining" | "unknown"
  - `evidence`: Array of growth signals (hiring, funding, product launches, market expansion)
  - `hiring_trends`: What roles they are hiring for and what it signals
  - `recent_milestones`: Major achievements or announcements
  - `risks`: Potential concerns or challenges
- `data.news_timeline`: Array of 5-8 recent news items with:
  - `date`: Publication date
  - `title`: Headline
  - `source`: Publication
  - `summary`: One-sentence summary
  - `significance`: Why this matters for sales engagement
  - `url`: Link to article
- `references`: Array of all source URLs used

## Guidelines
- Structure the analysis to be scannable -- reps need to quickly find relevant talking points
- Prioritize information that is actionable for sales (buying signals, pain points, growth areas)
- Compare the company's tech stack against ${company_name}'s offering to identify fit
- Flag potential entry points: new leadership, recent funding, technology gaps, competitive displacement opportunities
- Note any existing relationship signals (shared investors, mutual customers, technology overlap with ${company_name})
- Be explicit about confidence level -- clearly mark information as "confirmed" vs "estimated" vs "unverified"

## Error Handling
- If company name is ambiguous (multiple companies with same name), ask for clarification or use additional context (industry, location) to disambiguate
- If the company is very private or early-stage with limited public info, return what is available and clearly note information gaps
- If web search returns conflicting information, present the most recent and most credible source
- Always return at least `business_overview` even if other sections have limited data
