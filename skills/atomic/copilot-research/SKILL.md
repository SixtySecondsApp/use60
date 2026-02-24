---
name: Copilot Research
description: |
  Generate a pre-meeting research brief with company intel, stakeholder mapping, and talking points.
  Use when a user asks "/research", "research brief", "prep for meeting", "research this company",
  "tell me about [company]", "who is [contact]", or "background on [company]".
  Pulls CRM data, company profiles, contact history, and web search to produce a tabbed card
  with company overview, stakeholders, talking points, and risks.
  Requires a company or contact entity in context.
  Do NOT use for meeting-specific prep with agenda and time allocation -- use meeting-prep-brief for that.
  This skill focuses on deep company and stakeholder research independent of a specific meeting.
metadata:
  author: sixty-ai
  version: "2"
  category: sales-ai
  skill_type: atomic
  is_active: true
  command_centre:
    enabled: true
    label: "/research"
    description: "Pre-meeting research brief with intel and stakeholders"
    icon: "search"
  context_profile: full
  agent_affinity:
    - pipeline
    - meetings
  triggers:
    - pattern: "/research"
      intent: "slash_research"
      confidence: 0.95
      examples:
        - "/research"
        - "/research Acme Corp"
        - "/research on this company"
    - pattern: "research brief"
      intent: "research_brief"
      confidence: 0.90
      examples:
        - "give me a research brief"
        - "research brief on this company"
        - "company research brief"
    - pattern: "prep for meeting"
      intent: "meeting_research"
      confidence: 0.85
      examples:
        - "prep for my meeting with Acme"
        - "help me prepare for the call"
        - "background for the meeting"
  keywords:
    - "research"
    - "brief"
    - "intel"
    - "background"
    - "stakeholder"
    - "company"
    - "prep"
    - "dossier"
  requires_context:
    - company
    - contact
  inputs:
    - name: company_name
      type: string
      description: "Company name to research"
      required: false
    - name: contact_id
      type: string
      description: "Contact ID to anchor the research around"
      required: false
    - name: deal_id
      type: string
      description: "Deal ID for deal-specific context"
      required: false
    - name: depth
      type: string
      description: "Research depth: quick (5-min scan), standard (15-min brief), deep (30-min dossier)"
      required: false
      default: "standard"
  outputs:
    - name: company_overview
      type: object
      description: "Company snapshot: industry, size, funding, recent news, tech stack, fiscal calendar"
    - name: stakeholders
      type: array
      description: "Stakeholder map with names, titles, roles, decision authority, and interaction history"
    - name: talking_points
      type: array
      description: "Prioritized talking points tailored to company context and deal stage"
    - name: risks
      type: array
      description: "Identified risks with mitigation suggestions: competitive, stakeholder, timing, scope"
  requires_capabilities:
    - crm
    - web_search
  priority: high
  tags:
    - sales-ai
    - research
    - pre-meeting
    - stakeholder
    - company-intel
---

## Available Context & Tools
@_platform-references/org-variables.md
@_platform-references/capabilities.md

## Instructions

You are executing the /research skill. Your job is to produce a comprehensive research brief that gives the user deep context on a company and its stakeholders before a meeting or outreach.

## Data Gathering

Collect intelligence from all available sources:

1. **Check for existing research profile**: Query `client_fact_profiles` for a profile matching the company domain or name (where `research_status = 'complete'` and `research_completed_at` within last 7 days). If found, use its `research_data` as the foundation instead of gathering from scratch.
2. **Fetch company from CRM**: `execute_action("get_company_status", { company_name })` -- overview, relationship health, deal history
3. **Fetch contacts at company**: `execute_action("get_contacts", { company: company_name })` -- all known contacts, titles, roles
4. **Fetch deal context**: `execute_action("get_deal", { name: company_name })` -- active deals, stages, amounts
5. **Fetch meeting history**: Search for past meetings with this company -- extract themes, commitments, concerns
6. **Fetch activity timeline**: Recent emails, calls, tasks involving contacts at this company
7. **Web search**: Company news (last 90 days), funding, leadership changes, product launches, earnings

## Output Format (Tabbed Card)

Structure the output as four tabs for the structured response panel:

### Tab 1: Company Overview
```json
{
  "name": "Company Name",
  "description": "1-sentence description",
  "industry": "Industry vertical",
  "size": "Employee count and revenue range",
  "founded": "Year",
  "headquarters": "City, State/Country",
  "funding": "Last round, total raised, investors",
  "tech_stack": ["Known technologies"],
  "recent_news": [
    { "headline": "...", "date": "...", "relevance": "why this matters for the deal" }
  ],
  "fiscal_calendar": "Calendar year or custom FY",
  "competitors": ["Known competitors in their market"]
}
```

### Tab 2: Stakeholders
For each known contact:
```json
{
  "name": "Full Name",
  "title": "Job Title",
  "role": "champion | economic_buyer | technical_evaluator | influencer | blocker | unknown",
  "decision_authority": "high | medium | low",
  "last_interaction": "Date and type of last interaction",
  "sentiment": "positive | neutral | cautious | unknown",
  "notes": "Key context -- what they care about, concerns raised, communication style",
  "linkedin_url": "URL if available"
}
```

Include a stakeholder map summary: who is the champion, who is the economic buyer, who is missing from the map.

### Tab 3: Talking Points
Generate 5-7 prioritized talking points tailored to:
- The company's industry and specific situation
- Pain points surfaced in previous interactions
- ${company_name} differentiators relevant to their needs (from Organization Context)
- The current deal stage (if a deal exists)

Each talking point should have:
```json
{
  "point": "The talking point",
  "rationale": "Why this matters to them specifically",
  "source": "Where this insight came from (CRM, meeting transcript, news, etc.)",
  "priority": "high | medium"
}
```

### Tab 4: Risks
Identify and categorize risks:

- **Competitive**: Are they evaluating alternatives? Who? How far along?
- **Stakeholder**: Is the champion strong? Is an unknown blocker present? Has anyone gone quiet?
- **Timing**: Has the deal stalled? Is their budget cycle ending? Are there competing priorities?
- **Scope**: Are requirements expanding? Are they asking for capabilities ${company_name} does not have?
- **Relationship**: Has there been a miscommunication? Missed commitment? Support issue?

Each risk should have:
```json
{
  "category": "competitive | stakeholder | timing | scope | relationship",
  "description": "What the risk is",
  "severity": "high | medium | low",
  "mitigation": "Suggested response or preparation"
}
```

## Depth Levels

### Quick (5-min scan)
- Company snapshot (name, industry, size, 1 recent news item)
- Primary contact only
- Top 3 talking points
- Top 1-2 risks

### Standard (15-min brief) -- Default
- Full company overview with news and tech stack
- All known stakeholders with roles
- 5-7 talking points
- Full risk assessment

### Deep (30-min dossier)
- Everything in standard, plus:
- Detailed competitive landscape
- Stakeholder LinkedIn analysis and communication style
- Historical interaction timeline
- Cross-referenced insights from meeting transcripts
- Strategic recommendations for account approach

## Quality Checklist

Before returning:
- [ ] Company description is accurate and current (not stale CRM data)
- [ ] Every stakeholder has a role and decision authority assigned
- [ ] Talking points reference specific company context, not generic sales advice
- [ ] Risks include actionable mitigation suggestions
- [ ] Recent news is within the last 90 days
- [ ] No fabricated data -- if information is unavailable, say so
- [ ] Stakeholder map identifies gaps (missing economic buyer, no champion, etc.)

## Error Handling

### Company not found in CRM
Search by alternative names, domains, or partial matches. If still not found, use web search to build a basic profile and note: "This company is not yet in your CRM. Here is what I found from public sources."

### No contacts at company
Note: "No contacts found for this company in your CRM. Consider adding key stakeholders after your research." Provide a suggested org chart based on company size and industry norms.

### No deal context
Generate the brief without deal-specific language. Focus on company intel and stakeholder mapping. Note: "No active deal found. This research brief is based on company and contact data."

### Stale data (last update > 30 days)
Flag prominently: "CRM data for this company was last updated [X days] ago. Some information may be outdated. Consider verifying key details before the meeting."
