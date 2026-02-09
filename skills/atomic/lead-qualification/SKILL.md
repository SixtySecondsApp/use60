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

# Lead Qualification

## Goal
Score an inbound lead against ICP criteria and provide a clear qualification tier with reasoning and recommended next action.

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
- Organization variables: `${company_name}`, `${icp_criteria}`, `${products}`

## Data Gathering (via execute_action)
1. Check if lead already exists in CRM: `execute_action("get_contact", { email: lead_email })`
2. Check company status in CRM: `execute_action("get_company_status", { company_name })`
3. Look for existing deals with the company: `execute_action("get_deal", { name: company_name })`
4. (Optional) If web enrichment is needed, note it as a recommendation rather than executing inline

## Scoring Framework
Score each dimension on a 1-5 scale:

### 1. Company Size Fit (weight: 25%)
- 5: Squarely in ICP sweet spot
- 4: Close to ICP, minor deviation
- 3: On the edge of ICP range
- 2: Outside ICP but plausible
- 1: Far outside ICP range

### 2. Industry Fit (weight: 25%)
- 5: Target industry vertical
- 4: Adjacent industry with proven use cases
- 3: Industry where ${company_name} has some traction
- 2: Unproven industry but not disqualifying
- 1: Industry mismatch or known poor fit

### 3. Role Seniority & Authority (weight: 20%)
- 5: Decision maker (VP+, C-level, Founder)
- 4: Strong influencer (Director, Senior Manager)
- 3: Mid-level with budget influence
- 2: Individual contributor, may need champion building
- 1: No buying authority or unclear role

### 4. Budget Signals (weight: 15%)
- 5: Clear budget indicators (recent funding, known spend in category)
- 4: Likely has budget (company size and stage suggest it)
- 3: Budget possible but unconfirmed
- 2: Budget constrained signals
- 1: Likely no budget or very early stage

### 5. Timing & Intent (weight: 15%)
- 5: Active evaluation, demo request, competitive mention
- 4: Engaged (downloaded content, attended webinar, visited pricing)
- 3: Interested but early (blog reader, newsletter subscriber)
- 2: Cold inbound with no clear intent signal
- 1: Very early or unclear timing

## Qualification Tiers
- **Hot** (score >= 4.0): High-priority, fast-track to sales. Book meeting within 24 hours.
- **Warm** (score 3.0 - 3.9): Good potential, needs nurturing or more qualification. Follow up within 48 hours.
- **Cold** (score 2.0 - 2.9): Low priority, may not be worth active pursuit now. Add to nurture sequence.
- **Disqualified** (score < 2.0): Does not meet minimum criteria. Log reason and close out.

## Output Contract
Return a SkillResult with:
- `data.qualification_score`: Overall weighted score (0.0 - 5.0)
- `data.qualification_tier`: "hot" | "warm" | "cold" | "disqualified"
- `data.scoring_breakdown`: Array of dimension scores:
  - `dimension`: Name of scoring dimension
  - `score`: 1-5 score
  - `weight`: Percentage weight
  - `reasoning`: Why this score was assigned
  - `data_source`: What data point(s) informed the score
- `data.qualification_summary`: 2-3 sentence summary of the qualification assessment
- `data.strengths`: Array of positive indicators (why this lead might convert)
- `data.concerns`: Array of risk factors or gaps (why this lead might not convert)
- `data.missing_info`: Array of data points that would improve scoring accuracy
- `data.next_action`: Recommended next step with:
  - `action`: Specific action to take (e.g., "Book discovery call", "Send nurture email", "Enrich via lead-research skill")
  - `priority`: "urgent" | "high" | "medium" | "low"
  - `rationale`: Why this is the right next step
  - `suggested_owner`: "AE" | "SDR" | "Marketing" (who should own next step)
  - `timeline`: When to take the action (e.g., "within 24 hours", "this week")
- `data.existing_relationship`: Any existing CRM relationship context (prior deals, existing contacts at company)

## Guidelines
- Use ${icp_criteria} if available to calibrate scoring to the organization's specific ICP
- If critical data is missing (e.g., no company size), note it in `missing_info` and score conservatively
- Consider the lead source -- referrals and demo requests score higher on intent than passive inbound
- Check for existing relationships in CRM -- if the company is already a customer or has open deals, flag this prominently
- Be decisive with the tier -- reps need a clear recommendation, not a hedge
- If the lead is clearly disqualified, say so directly with the reason
- Suggest the "lead-research" skill as a follow-up if web enrichment would improve the score

## Error Handling
- If no lead data is provided at all, ask the user what they know about the lead
- If only a name or email is provided, attempt CRM lookup and note that scoring will be limited without more data
- If CRM lookups fail, score based on available data and flag the gaps
- Always return a tier and next action recommendation even with incomplete data
