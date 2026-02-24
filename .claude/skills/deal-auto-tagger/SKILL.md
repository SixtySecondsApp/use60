---
name: Deal Auto-Tagger
description: |
  AI-suggest tags and labels for deals based on attributes, meeting themes, and strategic signals.
  Use when a user asks "tag this deal", "categorize this deal", "label this opportunity", or
  auto-triggered post-meeting to suggest relevant tags (industry vertical, deal size tier, urgency,
  product interest, buying stage). Returns suggested tags with confidence and reasoning.
metadata:
  author: sixty-ai
  version: "2"
  category: sales-ai
  skill_type: atomic
  is_active: true
  context_profile: sales
  agent_affinity:
    - pipeline
    - research
  triggers:
    - pattern: "tag this deal"
      intent: "deal_tagging"
      confidence: 0.90
      examples:
        - "add tags to this deal"
        - "tag this opportunity"
        - "apply tags"
    - pattern: "categorize this deal"
      intent: "deal_categorization"
      confidence: 0.85
      examples:
        - "categorize this opportunity"
        - "what category is this deal"
        - "classify this deal"
    - pattern: "label this opportunity"
      intent: "deal_labeling"
      confidence: 0.80
      examples:
        - "label this deal"
        - "add labels"
        - "what labels should I use"
  keywords:
    - "tag"
    - "tags"
    - "label"
    - "categorize"
    - "classify"
    - "segment"
    - "vertical"
    - "industry"
  required_context:
    - deal
    - company_name
  inputs:
    - name: deal_id
      type: string
      description: "The deal identifier to analyze and tag"
      required: true
    - name: auto_apply
      type: boolean
      description: "If true, apply tags immediately; if false, return suggestions only (default: false)"
      required: false
      default: false
  outputs:
    - name: suggested_tags
      type: array
      description: "Recommended tags with category, confidence, and reasoning"
    - name: applied_tags
      type: array
      description: "Tags that were applied (if auto_apply is true)"
  priority: low
  requires_capabilities:
    - crm
    - meetings
---

## Available Context & Tools
@_platform-references/org-variables.md
@_platform-references/capabilities.md

# Deal Auto-Tagger

## Goal
Analyze a deal's attributes (industry, size, stage, products discussed, meeting themes) and intelligently suggest or apply tags that improve pipeline segmentation, reporting, and prioritization. Tags should be specific, actionable, and consistent across the pipeline -- not random or one-off labels.

## Why Structured Deal Tagging Matters

Untagged or poorly tagged deals are invisible in pipeline analytics. The data:

- **73% of sales teams cannot accurately segment their pipeline** by industry, deal size, or product interest because tagging is inconsistent or missing (CSO Insights, 2023).
- **Win rate analysis by segment requires consistent tagging.** Teams with structured tagging (industry vertical, deal size tier, product line) can identify their highest-performing segments and focus there. Teams without tagging operate blind.
- **Forecasting accuracy improves by 34%** when deals are tagged by urgency and buying stage (Clari Revenue Analytics).
- **Manager visibility depends on tags.** Sales leaders filter pipeline by tags to identify risks ("Enterprise deals in legal review") or opportunities ("Healthcare deals above $200K in proposal stage"). Without tags, these filters are useless.
- **AI-suggested tags are 5x more consistent than manual tagging** (HubSpot tagging study). Reps are inconsistent: one rep tags "SaaS" and another tags "Software." AI enforces a standard taxonomy.

## Required Capabilities
- **CRM**: To fetch deal data, company data, contacts, and activities
- **Meetings**: To analyze meeting transcripts for themes and topics

## Inputs
- `deal_id`: The deal identifier (required)
- `auto_apply`: If true, apply tags immediately via CRM. If false, return suggestions only. Default: false (suggestion mode).

## Data Gathering (via execute_action)

1. **Fetch deal record**: `execute_action("get_deal", { id: deal_id })` -- stage, value, close date, existing tags
2. **Fetch company data**: `execute_action("get_company", { id: company_id })` -- industry, employee count, revenue, location
3. **Fetch deal contacts**: `execute_action("list_contacts", { deal_id })` -- titles, seniority levels
4. **Fetch meeting transcripts**: `execute_action("list_meetings", { deal_id, include_transcripts: true })` -- analyze themes, topics, pain points, product mentions
5. **Fetch activities**: `execute_action("get_deal_activities", { deal_id, limit: 10 })` -- look for patterns (frequency, engagement level)

## Tag Taxonomy (Standardized)

Use this standardized tag taxonomy across all deals. Do NOT create new tags outside this structure.

### Industry Vertical Tags
Use specific verticals, not generic categories:
- `Healthcare` (hospitals, clinics, health tech)
- `Financial Services` (banks, insurance, fintech)
- `SaaS` (B2B software companies)
- `E-commerce` (online retail, marketplaces)
- `Manufacturing` (industrial, supply chain)
- `Education` (schools, universities, ed-tech)
- `Real Estate` (property management, construction)
- `Technology` (IT services, hardware, infrastructure)
- `Non-Profit` (NGOs, associations, foundations)
- `Government` (public sector, agencies)
- `Retail` (brick-and-mortar stores, franchises)
- `Media & Entertainment` (publishing, broadcasting, gaming)
- `Professional Services` (consulting, legal, accounting)
- `Other` (if none of the above fit)

### Deal Size Tier Tags
Based on deal value. Tiers should align with your company's pricing structure:
- `Enterprise` ($250K+)
- `Mid-Market` ($50K-$249K)
- `SMB` ($10K-$49K)
- `Starter` (under $10K)

Adjust these thresholds based on your company's ACV segmentation.

### Urgency Level Tags
Based on timeline and compelling events:
- `Urgent` (close date within 30 days OR buyer has a hard deadline)
- `High Priority` (close date 30-60 days OR strong buying signals)
- `Standard` (close date 60-90 days OR normal sales cycle)
- `Long-Term` (close date 90+ days OR early exploration)

### Product Interest Tags
Based on which products/solutions the buyer discussed:
- Use your company's product line names (e.g., `Platform`, `Analytics`, `Integrations`, `API`, `Enterprise Suite`)
- If multiple products discussed, apply multiple tags
- If product is unclear, use `TBD - Product Interest`

### Buying Stage Tags (distinct from CRM stage)
These are behavioral indicators, not CRM pipeline stages:
- `Active Evaluation` (comparing solutions, running POCs, technical review)
- `Budget Approved` (buyer confirmed budget is allocated)
- `Legal Review` (contract/security/procurement in progress)
- `Executive Alignment` (C-level or VP+ engaged)
- `Champion Identified` (clear internal advocate)
- `Multi-Threaded` (3+ stakeholders engaged)
- `Single-Threaded` (only one contact engaged -- risk signal)
- `Competitive` (actively comparing with named competitors)

### Risk Tags (optional, for at-risk deals)
- `Stalled` (no activity in 14+ days)
- `Close Date Pushed` (close date moved 2+ times)
- `Budget Risk` (budget not confirmed or reduced)
- `Champion Dark` (primary contact unresponsive)

### Strategic Tags (optional, for special deals)
- `Strategic Partnership` (joint go-to-market, co-sell, integration partnership)
- `Expansion` (upsell or cross-sell to existing customer)
- `Renewal` (contract renewal)
- `Reference Account` (high-profile logo, referenceable customer)
- `Pilot/POC` (proof of concept or pilot deal, not full contract)

## Tag Suggestion Logic

For each tag category, analyze the deal data and determine which tags apply:

### Industry Vertical
- Check company industry field first (if available and accurate)
- If company industry is missing or vague ("Technology"), analyze:
  - Company name (e.g., "City Hospital" → Healthcare)
  - Contact titles (e.g., "VP of Patient Care" → Healthcare)
  - Meeting transcript keywords (e.g., "patient records", "EMR" → Healthcare)
- Assign ONE primary vertical (do not tag multiple verticals unless genuinely multi-industry)

### Deal Size Tier
- Based on deal value. If value is missing:
  - Estimate from company size (employee count, revenue)
  - Estimate from solution scope discussed in meetings
  - Default: `TBD - Size` if insufficient data

### Urgency Level
- Check close date proximity (within 30 days = Urgent)
- Check for compelling events in transcript:
  - "Need this by end of quarter"
  - "Board meeting in 3 weeks"
  - "Regulatory deadline in April"
  - "Fiscal year ends June 30"
- Default: `Standard` if no urgency signals

### Product Interest
- Analyze meeting transcripts for product mentions:
  - "We're interested in your analytics module" → `Analytics`
  - "Need the full enterprise suite with all integrations" → `Enterprise Suite`, `Integrations`
- If no clear product discussed, use `TBD - Product Interest`

### Buying Stage
- `Active Evaluation`: Transcript shows "comparing options", "POC", "evaluating vendors"
- `Budget Approved`: Buyer said "budget is allocated", "we have $X approved"
- `Legal Review`: Activities show contract review, security questionnaire, DPA negotiation
- `Executive Alignment`: VP+ or C-level attendees in meetings
- `Champion Identified`: One person is clearly driving the initiative internally
- `Multi-Threaded`: 3+ unique contacts engaged in the last 30 days
- `Single-Threaded`: Only 1 contact engaged (risk flag)
- `Competitive`: Buyer mentioned competitors by name

### Risk Tags
Apply ONLY if risk signals are clearly present:
- `Stalled`: No activity in 14+ days
- `Close Date Pushed`: Close date has been moved 2+ times
- `Budget Risk`: Buyer raised budget concerns or value was reduced 20%+
- `Champion Dark`: Primary contact has not responded to last 3+ outreach attempts

### Strategic Tags
Apply ONLY if applicable:
- `Strategic Partnership`: Buyer discussed co-marketing, integration partnership, joint solution
- `Expansion`: Buyer is an existing customer, this is an upsell/cross-sell
- `Renewal`: Contract renewal for existing customer
- `Reference Account`: Buyer is a well-known brand in the industry (Fortune 500, major logo)
- `Pilot/POC`: Buyer wants a paid or unpaid pilot before full commitment

## Confidence Scoring

For each suggested tag, assign a confidence score (0.0-1.0):
- **0.9-1.0**: Explicit evidence (e.g., company industry field says "Healthcare" → tag: `Healthcare`)
- **0.7-0.89**: Strong inference (e.g., transcript mentions "patient data" 5+ times → tag: `Healthcare`)
- **0.5-0.69**: Moderate inference (e.g., contact title is "Director of Clinical Operations" → tag: `Healthcare`)
- **0.3-0.49**: Weak inference (e.g., company name includes "Health" but unclear context)
- **0.0-0.29**: Insufficient data (do not suggest this tag)

Only suggest tags with confidence 0.5+ (moderate to high confidence).

## Tag Application (if auto_apply is true)

If `auto_apply` is true, apply tags using:
```
execute_action("update_deal", {
  id: deal_id,
  tags: [array of suggested tags]
})
```

Notes:
- Append to existing tags, do not replace (unless replacing an old tag with a corrected version, e.g., `TBD - Size` → `Mid-Market`)
- If a tag from the same category already exists, replace it (e.g., if deal is already tagged `SMB` and AI suggests `Enterprise`, replace `SMB` with `Enterprise`)
- Do not apply low-confidence tags (under 0.5) automatically
- Log the tag changes to deal activity feed: "AI applied tags: [Industry: Healthcare], [Size: Enterprise], [Urgency: High Priority]"

## Output Contract

Return a SkillResult with:
- `data.suggested_tags`: array of 3-8 tags
  - `category`: string ("Industry Vertical" | "Deal Size Tier" | "Urgency Level" | "Product Interest" | "Buying Stage" | "Risk" | "Strategic")
  - `tag`: string (the tag name from the taxonomy)
  - `confidence`: number (0.0-1.0)
  - `reasoning`: string (why this tag applies -- reference specific data)
  - `replace_existing`: string | null (if this tag should replace an existing tag, name the old tag)
- `data.applied_tags`: array | null
  - If `auto_apply` is true: list of tags that were successfully applied
  - If `auto_apply` is false: null (suggestion mode)

## Quality Checklist

Before returning tag suggestions, verify:

- [ ] Tags are from the standard taxonomy (do NOT invent new tags)
- [ ] Each tag has confidence 0.5+ (moderate to high confidence)
- [ ] Reasoning for each tag is SPECIFIC (references actual data, not assumptions)
- [ ] Industry vertical is accurate (not guessed from vague company name)
- [ ] Deal size tier matches the actual deal value (or is marked `TBD - Size` if value is missing)
- [ ] Urgency level reflects the buyer's timeline (not the seller's desired timeline)
- [ ] Product interest tags reflect what the BUYER discussed (not what the seller wants to sell)
- [ ] Risk tags are only applied when risk signals are clearly present (do not over-flag)
- [ ] If multiple tags in the same category are suggested (e.g., `Healthcare` and `Technology`), explain why both apply or choose the primary one
- [ ] Existing tags are preserved (append, do not wipe out manually added tags)
- [ ] If `auto_apply` is true, applied tags are logged to deal activity feed

## Examples

### Good Tag Suggestion (High Confidence)

**Deal Data:**
- Company: "Memorial Hospital System"
- Industry field: "Healthcare"
- Deal value: $320,000
- Close date: March 15, 2026 (28 days from now)
- Transcript excerpt: "We need to replace our legacy patient data system before our HIPAA audit in April. Budget is approved at $300K. I'm working with our CTO and CFO to finalize the vendor decision."

**Suggested Tags:**
```json
[
  {
    "category": "Industry Vertical",
    "tag": "Healthcare",
    "confidence": 1.0,
    "reasoning": "Company industry field is 'Healthcare' and company name is 'Memorial Hospital System'.",
    "replace_existing": null
  },
  {
    "category": "Deal Size Tier",
    "tag": "Enterprise",
    "confidence": 1.0,
    "reasoning": "Deal value is $320,000, which exceeds the Enterprise tier threshold ($250K+).",
    "replace_existing": "TBD - Size"
  },
  {
    "category": "Urgency Level",
    "tag": "Urgent",
    "confidence": 0.95,
    "reasoning": "Close date is 28 days away and buyer mentioned a hard deadline: 'before our HIPAA audit in April.' Regulatory compliance deadline creates urgency.",
    "replace_existing": null
  },
  {
    "category": "Product Interest",
    "tag": "Platform",
    "confidence": 0.80,
    "reasoning": "Buyer mentioned 'replace our legacy patient data system,' which maps to the Platform product.",
    "replace_existing": null
  },
  {
    "category": "Buying Stage",
    "tag": "Budget Approved",
    "confidence": 1.0,
    "reasoning": "Buyer explicitly stated 'Budget is approved at $300K.'",
    "replace_existing": null
  },
  {
    "category": "Buying Stage",
    "tag": "Executive Alignment",
    "confidence": 0.90,
    "reasoning": "Buyer is working with CTO and CFO (C-level executives) to finalize the vendor decision.",
    "replace_existing": null
  }
]
```

### Bad Tag Suggestion (Low Confidence, Do Not Suggest)

**Deal Data:**
- Company: "Tech Solutions Inc."
- Industry field: (blank)
- Deal value: (blank)
- No meeting transcripts available
- No activities in last 30 days

**Suggested Tags:**
```json
[
  {
    "category": "Industry Vertical",
    "tag": "Technology",
    "confidence": 0.25,
    "reasoning": "Company name includes 'Tech,' but no other data available. Insufficient confidence to suggest this tag."
  }
]
```
Why this fails: Confidence is too low (0.25). Do not suggest tags below 0.5 confidence. If data is insufficient, return an empty suggestion list and recommend: "Insufficient data to suggest tags. Recommend: (1) Update company industry field, (2) Add deal value, (3) Log meeting notes or call summary to provide context."

### Tag Replacement Example

**Scenario:** Deal is currently tagged `SMB` but new analysis shows deal value is $280K.

**Suggested Tag:**
```json
{
  "category": "Deal Size Tier",
  "tag": "Enterprise",
  "confidence": 1.0,
  "reasoning": "Deal value is $280,000, which is in the Enterprise tier ($250K+). Replacing previous tag 'SMB' which was incorrect.",
  "replace_existing": "SMB"
}
```

## Error Handling

### Insufficient data for tagging
If deal has minimal data (no company, no value, no meetings, no activities):
- Return empty `suggested_tags` array
- Provide guidance: "Insufficient data to suggest tags. Recommend: (1) Update company and industry fields, (2) Add deal value, (3) Log meeting notes or activities to provide tagging context."

### Conflicting data (e.g., company industry says "Healthcare" but transcript is clearly SaaS)
If industry field and transcript signals conflict:
- Trust the TRANSCRIPT over the CRM industry field (industry fields are often wrong or outdated)
- Suggest the correct tag with reasoning: "Company industry field says 'Healthcare' but meeting transcript shows SaaS product discussion. Tagging as 'SaaS' based on actual deal context."

### Deal value is missing
If deal value is blank:
- Do not guess. Tag as `TBD - Size`
- Reasoning: "Deal value not set in CRM. Recommend updating deal value to determine size tier."

### Multiple products discussed
If transcript shows interest in multiple products (e.g., "Platform" and "Analytics"):
- Suggest BOTH product tags with confidence scores
- Reasoning: "Buyer discussed both Platform ('need core data management') and Analytics ('want reporting dashboards'). Suggesting both product tags."

### Existing tags conflict with suggestions
If deal is already tagged `Financial Services` but AI suggests `Healthcare`:
- Flag the conflict: "Existing tag 'Financial Services' conflicts with AI suggestion 'Healthcare.' Review manually to confirm correct vertical."
- Do not auto-replace in conflict scenarios (requires human judgment)

### No recent activity (deal is stale)
If deal has no activity in 30+ days:
- Suggest risk tag: `Stalled`
- Reasoning: "No activity in [X] days. Tagging as 'Stalled' to flag for review."

## Tone and Presentation

- Be confident when data is clear: "Company industry is Healthcare. High confidence (1.0)."
- Be honest when data is unclear: "Insufficient data to determine industry vertical. Recommend updating company profile."
- Explain reasoning: "Budget is approved (buyer said '$300K allocated') → tag: Budget Approved."
- Do not over-tag. 3-6 tags per deal is ideal. More than 8 tags dilutes value.
- If a tag is low-confidence, do not suggest it. Better to have fewer accurate tags than many guessed tags.
- Tag conflicts should be flagged, not silently resolved. "Existing tag conflicts with suggestion -- recommend manual review."
- Tags are for segmentation and analysis, not storytelling. Keep them specific and standardized.
