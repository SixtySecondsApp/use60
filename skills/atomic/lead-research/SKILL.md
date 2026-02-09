---
name: Lead Research
description: |
  Research a lead or company using web search to find key business intelligence.
  Use when a user asks "research this lead", "look up this company", "find out about [company]",
  "what can you tell me about [person]", or needs enrichment data before outreach.
  Returns structured contact enrichment data with LinkedIn, company details, news, and tech stack.
metadata:
  author: sixty-ai
  version: "2"
  category: enrichment
  skill_type: atomic
  is_active: true
  triggers:
    - pattern: "research this lead"
      intent: "lead_research"
      confidence: 0.90
      examples:
        - "research this person"
        - "look into this lead"
        - "find info on this lead"
    - pattern: "look up this company"
      intent: "company_lookup"
      confidence: 0.85
      examples:
        - "look up this person"
        - "search for this company"
        - "find this company online"
    - pattern: "what can you tell me about"
      intent: "lead_intel"
      confidence: 0.80
      examples:
        - "what do we know about this person"
        - "find out about this company"
        - "dig up info on this prospect"
    - pattern: "enrich this contact"
      intent: "contact_enrichment"
      confidence: 0.85
      examples:
        - "enrich this lead"
        - "get more data on this contact"
        - "fill in the blanks on this prospect"
  keywords:
    - "research"
    - "lead"
    - "lookup"
    - "enrich"
    - "prospect"
    - "company"
    - "background"
    - "intel"
    - "find"
    - "search"
  required_context:
    - lead_name
  inputs:
    - name: lead_name
      type: string
      description: "Name of the person to research"
      required: false
    - name: company_name
      type: string
      description: "Name of the company to research"
      required: false
    - name: email
      type: string
      description: "Email address of the lead for finding LinkedIn and professional profiles"
      required: false
  outputs:
    - name: lead_profile
      type: object
      description: "Structured profile with name, title, LinkedIn URL, seniority, and background"
    - name: company_overview
      type: object
      description: "Company details with name, website, industry, size, headquarters, and description"
    - name: recent_news
      type: array
      description: "3-5 recent news items with title, source, date, summary, and URL"
    - name: enrichment_data
      type: object
      description: "Additional intelligence with funding, tech stack, hiring signals, and growth indicators"
  requires_capabilities:
    - web_search
  priority: high
  tags:
    - enrichment
    - leads
    - research
    - prospecting
---

# Lead Research

## Goal
Research a lead or company using web search to gather actionable intelligence for sales outreach.

## Required Capabilities
- **Web Search**: To search the web for lead and company information (routed to Gemini with Google Search grounding)

## Inputs
- `lead_name`: Name of the person to research (if available)
- `company_name`: Name of the company to research (if available)
- `email`: Email address of the lead (if available, useful for finding LinkedIn profiles)
- `organization_id`: Current organization context

## Data Gathering (via web search)
1. Search for the person's LinkedIn profile and professional background
2. Search for the company website and About page
3. Search for recent news articles, press releases, and blog posts about the company
4. Search for funding rounds, investor information, and company size
5. Search for technology stack and tools used (e.g., via BuiltWith, Wappalyzer mentions, job postings)
6. Search for recent hiring activity and open roles (signals growth or priorities)

## Output Contract
Return a SkillResult with:
- `data.lead_profile`: Structured profile object with:
  - `name`: Full name
  - `title`: Current job title
  - `linkedin_url`: LinkedIn profile URL (if found)
  - `role_seniority`: "C-level" | "VP" | "Director" | "Manager" | "IC"
  - `background`: Brief professional background summary
  - `recent_activity`: Any recent posts, talks, or public activity
- `data.company_overview`: Company details with:
  - `company_name`: Official company name
  - `website`: Company website URL
  - `industry`: Industry classification
  - `company_size`: Employee count range
  - `headquarters`: Location
  - `founded`: Year founded (if found)
  - `description`: One-paragraph company description
- `data.recent_news`: Array of 3-5 recent news items with:
  - `title`: Article/news title
  - `source`: Publication name
  - `date`: Publication date
  - `summary`: One-sentence summary
  - `url`: Link to the article
- `data.enrichment_data`: Additional intelligence with:
  - `funding`: Latest funding round, amount, investors (if available)
  - `tech_stack`: Known technologies and tools
  - `hiring_signals`: Recent job postings and what they indicate
  - `growth_indicators`: Revenue, headcount growth, market expansion signals
- `references`: Array of source URLs used in research

## Guidelines
- Always cite sources with URLs so the rep can verify information
- If the lead name is ambiguous, use company context to disambiguate
- Prioritize recent information (last 6 months) over older data
- If limited information is found, clearly state what could not be determined rather than guessing
- Use ${company_name} context to tailor research toward relevant competitive and partnership angles
- Flag any connection points between the lead's company and ${company_name} (shared investors, mutual connections, technology overlap)

## Error Handling
- If no lead name or company name is provided, ask the user for clarification
- If web search returns no results, return a partial result with what was found and note the gaps
- If the person/company appears to be very small or private, note limited public information availability
