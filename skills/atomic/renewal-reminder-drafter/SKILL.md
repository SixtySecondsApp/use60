---
name: Renewal Reminder Drafter
description: |
  Draft a renewal reminder email 60 days before contract end with account health summary.
  Use when a renewal milestone triggers or user asks "draft renewal reminder",
  "prepare contract renewal outreach", or needs to proactively engage expiring accounts.
  Returns professional renewal email with value recap, health metrics, and renewal CTA.
metadata:
  author: sixty-ai
  version: "2"
  category: relationship-ai
  skill_type: atomic
  is_active: true
  context_profile: account
  agent_affinity:
    - retention
    - customer-success
  triggers:
    - pattern: "draft renewal reminder"
      intent: "renewal_reminder_email"
      confidence: 0.90
      examples:
        - "prepare renewal reminder email"
        - "write contract renewal outreach"
        - "draft renewal communication"
    - pattern: "contract expiring"
      intent: "contract_expiration_outreach"
      confidence: 0.85
      examples:
        - "contract ending soon"
        - "renewal approaching"
        - "subscription expiring"
    - pattern: "renewal reminder for this account"
      intent: "account_renewal"
      confidence: 0.85
      examples:
        - "send renewal reminder to customer"
        - "proactive renewal outreach"
        - "check in about contract renewal"
  keywords:
    - "renewal"
    - "contract"
    - "expiring"
    - "subscription"
    - "expiration"
    - "reminder"
    - "extension"
  required_context:
    - deal_id
    - contact_id
    - company_name
  inputs:
    - name: deal_id
      type: string
      description: "The deal identifier for the expiring contract"
      required: true
    - name: contact_id
      type: string
      description: "Primary contact for renewal discussion"
      required: false
    - name: contract_end_date
      type: string
      description: "Contract expiration date (ISO format)"
      required: true
    - name: contract_value
      type: number
      description: "Current contract ARR/value"
      required: false
  outputs:
    - name: email_draft
      type: object
      description: "Renewal reminder email with subject, body, value recap, and expansion opportunity CTA"
    - name: health_summary
      type: object
      description: "Account health snapshot with usage, engagement, and risk signals"
    - name: suggested_talking_points
      type: array
      description: "Renewal conversation talking points based on account history"
  priority: high
  requires_capabilities:
    - crm
    - email
---

## Available Context & Tools
@_platform-references/org-variables.md
@_platform-references/capabilities.md

# Renewal Reminder Drafter

## Goal
Generate a consultative, value-focused renewal reminder email 60 days before contract expiration. This is NOT a pushy sales pitch — it is a strategic account check-in that recaps delivered value, surfaces expansion opportunities, and opens a renewal conversation anchored in partnership, not urgency.

## Why 60-Day Renewal Timing Matters

The 60-day window before contract expiration is the optimal renewal engagement point:

- **Renewal conversations started 60-90 days before expiration close at 2.3x the rate** of those started in the final 30 days (ChurnZero retention benchmarks, 2024).
- **58% of customers appreciate proactive renewal outreach 2-3 months in advance** as a sign of partnership vs. transactional behavior (Gainsight State of Customer Success).
- **Early renewal conversations uncover expansion opportunities in 41% of accounts** — but only if started before the customer enters "renewal decision mode" (SaaStr Annual Survey).
- **Contracts renewed at the 60-day mark have 17% higher retention rates** than those renewed in the final week, because there is time to address concerns vs. rushing a signature (ProfitWell retention study).

The key insight: starting at 60 days positions you as a strategic partner reviewing progress, NOT a vendor panicking about churn.

## Required Capabilities
- **CRM**: To fetch deal data, contract details, usage metrics, relationship history
- **Email**: To draft and send renewal reminder communications

## Inputs
- `deal_id`: The deal identifier for the expiring contract (required)
- `contact_id`: Primary renewal contact (optional — will infer from deal if not provided)
- `contract_end_date`: Contract expiration date (required)
- `contract_value`: Current ARR or contract value (optional)

## Data Gathering (via execute_action)

Gather comprehensive account context before drafting:

1. **Deal record**: `execute_action("get_deal", { id: deal_id })` — stage, value, close date, contract terms, owner
2. **Contact details**: `execute_action("get_contact", { id: contact_id })` — primary stakeholder for renewal
3. **Activity history**: `execute_action("get_deal_activities", { deal_id, limit: 50 })` — meetings, emails, support tickets, QBRs
4. **Open tasks**: `execute_action("list_tasks", { deal_id })` — unresolved issues, pending deliverables
5. **Recent meetings**: Check for QBRs, check-ins, product feedback sessions in the last 90 days
6. **Usage data** (if available): Product usage metrics, feature adoption, user growth

If data calls fail, note missing information and draft a more generic email with a discovery-first CTA.

## Renewal Email Structure Methodology

Every renewal reminder email uses a 5-section structure optimized for partnership positioning:

### Section 1: Opening + Context (2-3 sentences)
**Purpose**: Set the frame as a strategic partnership check-in, not a sales push.

**Rules**:
- Lead with appreciation for the partnership, not "your contract is expiring"
- Reference a specific recent win, milestone, or value delivery moment
- Acknowledge the renewal timeline transparently but not urgently
- Use the contact's name and personalize based on recent interactions

**Good example**: "Sarah, we're coming up on your contract renewal in 60 days, and I wanted to take a moment to reflect on the progress your team has made with ${company_name} over the past year. Seeing your engineering team reduce data reconciliation time by 70% has been one of my favorite customer success stories this quarter."

**Bad example**: "Hi Sarah, your contract is expiring soon. Let's discuss renewal options."

### Section 2: Value Recap (3-5 bullet points)
**Purpose**: Quantify value delivered over the contract period.

**Rules**:
- Use THEIR metrics and success criteria, not your product features
- Include numbers wherever possible (time saved, revenue impact, efficiency gains)
- Reference specific milestones or wins from meetings/QBRs
- Attribute value to their team's efforts ("your team achieved...") not just the product
- Use "we" language to emphasize partnership

**Good example**:
```
Value delivered over the past year:
- Reduced manual data reconciliation from 15 hours/week to 4 hours/week (70% time savings)
- Achieved SOC 2 compliance on schedule with zero security incidents
- Onboarded 12 new team members with 95% feature adoption rate within 30 days
- Processed 2.3M API calls with 99.97% uptime (exceeding SLA)
```

**Bad example**:
```
What we've provided:
- Access to our enterprise platform
- 24/7 customer support
- Regular product updates
- Dedicated account manager
```

### Section 3: Relationship Health Snapshot (2-3 sentences)
**Purpose**: Transparently surface any concerns or opportunities.

**Rules**:
- Be honest about engagement levels, usage trends, or support issues
- Frame risks as opportunities to improve ("we noticed X — let's discuss how to optimize Y")
- Acknowledge unresolved issues proactively (shows you're paying attention)
- If health is strong, say so explicitly ("your team's engagement has been outstanding")

**Good example**: "Your team's adoption has been excellent across core modules. I did notice feature requests for advanced reporting during our last QBR — I'd love to explore whether our Enterprise tier might better support your evolving needs."

**Bad example**: "Everything looks great! Let me know if you have any concerns."

### Section 4: Expansion Opportunity (if applicable)
**Purpose**: Surface natural expansion paths based on usage and goals.

**Rules**:
- Only include if there is genuine evidence of expansion fit (usage patterns, feature requests, team growth)
- Frame as solving THEIR problem, not upselling YOUR product
- Provide specific examples of what expansion could unlock
- Make it conversational, not pushy ("worth exploring" not "you need to upgrade")

**Good example**: "Given your team has grown from 8 to 15 users and you've hit API rate limits twice this quarter, it might be worth exploring our Growth plan — it includes unlimited API calls and advanced user permissions. Happy to share a comparison if that's helpful."

**Skip this section if**: No clear expansion fit exists. Forcing an upsell damages trust.

### Section 5: CTA + Next Step (1-2 sentences)
**Purpose**: Propose a low-friction next step to advance the renewal conversation.

**Rules**:
- Offer a meeting to review progress and discuss the renewal (not "sign here")
- Provide 2-3 specific time options (reduces scheduling friction)
- Frame the meeting as mutual value ("let's review what's working and where we can improve")
- No hard deadlines or pressure tactics

**Good example**: "Let's schedule a 30-minute renewal review in the next two weeks to discuss what's working, address any gaps, and explore the best contract structure for your team's growth. Would Tuesday Feb 25 at 2pm or Thursday Feb 27 at 10am work for a call?"

**Bad example**: "Please confirm your renewal by March 1st. Let me know if you have questions."

## Tone Guidelines: Consultative, Not Transactional

The renewal reminder tone is critical. This is not a sales email — it is a strategic account review invitation.

**Consultative tone characteristics**:
- **Partnership-first**: "We're in this together" not "you need to renew"
- **Value-anchored**: Lead with impact delivered, not contract terms
- **Transparent**: Acknowledge both wins and areas for improvement
- **Low-pressure**: Frame renewal as a natural continuation, not a crisis
- **Growth-oriented**: Focus on what's next, not what's past

**Avoid**:
- Urgency language ("time is running out", "act now", "limited time")
- Pushy upsells that ignore account health
- Ignoring unresolved issues or support tickets
- Generic "hope you're doing well" openings
- Threatening contract expiration ("if you don't renew...")

## Account Health Assessment

Generate a health summary based on available data to inform the email tone and talking points:

**Health Signals to Analyze**:
1. **Usage trends**: Increasing, stable, or declining usage over the past 90 days
2. **Engagement frequency**: When was the last meaningful interaction (meeting, email, support ticket)?
3. **Support ticket patterns**: High-priority issues, unresolved complaints, or positive feedback
4. **Feature adoption**: Are they using advanced features or only basic functionality?
5. **Stakeholder changes**: Has the primary contact or champion changed recently?
6. **Payment history**: Any late payments, downgrades, or pricing complaints?
7. **Expansion signals**: Team growth, feature requests, API limit hits, multi-department usage

**Health Categories**:
- **Strong**: High usage, engaged stakeholders, recent QBR, positive feedback, expansion signals
- **Moderate**: Stable usage, periodic contact, no major issues, no expansion signals
- **At Risk**: Declining usage, disengaged stakeholders, unresolved support issues, or no recent contact

**Email Tone by Health**:
- **Strong health**: Confident, growth-oriented, expansion-focused
- **Moderate health**: Partnership-focused, value-recap-heavy, discovery-oriented
- **At Risk**: Empathetic, issue-resolution-first, rebuild-trust-oriented

## Expansion Opportunity Detection

Only suggest expansion if there is genuine evidence. Forced upsells destroy renewal trust.

**Valid Expansion Signals**:
1. **Team growth**: User count increased significantly during contract period
2. **Usage patterns**: Hitting plan limits (API calls, storage, seats)
3. **Feature requests**: Asking for capabilities only available in higher tiers
4. **Multi-department adoption**: Product spreading beyond initial buyer team
5. **Expressed growth goals**: Customer shared plans that require more capacity

**Expansion Positioning**:
- Frame as solving a specific problem they have ("you mentioned needing advanced reporting")
- Quantify the ROI of upgrading ("at your current API usage, Growth tier would save 8 hours/month")
- Make it optional, not required ("worth exploring" not "you need to upgrade")
- Offer to send a detailed comparison, not a hard pitch

## Output Contract

Return a SkillResult with:

### `data.email_draft`
Object:
- `subject`: string (recommended subject line)
- `subject_variants`: array of 3 subject line options
- `body`: string (full email text)
- `body_html`: string | null (HTML formatted version)
- `to`: string (primary contact email)
- `cc`: string[] | null (account team CC list)
- `sections`: array of section objects:
  - `type`: "opening" | "value_recap" | "health_snapshot" | "expansion" | "cta"
  - `content`: string
  - `metrics`: object | null (for value_recap: quantified results)
- `tone`: "consultative" | "partnership" | "growth-oriented"
- `word_count`: number

### `data.health_summary`
Object:
- `overall_health`: "strong" | "moderate" | "at_risk"
- `usage_trend`: "increasing" | "stable" | "declining"
- `engagement_level`: "high" | "medium" | "low"
- `last_interaction_date`: string (ISO date)
- `last_interaction_type`: string ("meeting" | "email" | "support_ticket" | "qbr")
- `risk_signals`: string[] (specific concerns flagged)
- `positive_signals`: string[] (specific wins or engagement indicators)
- `missing_data`: string[] (data points unavailable for full assessment)

### `data.suggested_talking_points`
Array of 4-6 strings:
- Conversation topics for the renewal meeting based on account history
- Should include: value wins to reinforce, concerns to address, expansion opportunities to explore
- Ordered by priority (most important first)

### `data.expansion_opportunity`
Object | null (only if valid expansion fit exists):
- `recommended_tier`: string (name of higher plan tier)
- `key_benefits`: string[] (specific features/limits that address their needs)
- `roi_rationale`: string (why upgrading makes business sense for them)
- `evidence`: string[] (usage patterns or requests that support the recommendation)

### `data.next_steps`
Array of 2-3 objects:
- `action`: string (specific next step)
- `owner`: "rep" | "customer" | "both"
- `deadline`: string (suggested timing)

## Quality Checklist

Before returning results, validate:

- [ ] Email includes at least ONE specific, quantified value metric (not generic "great results")
- [ ] Opening references a real moment/milestone from the relationship (not templated)
- [ ] Health snapshot is honest (acknowledges concerns if they exist)
- [ ] Expansion suggestion is backed by actual usage data OR omitted entirely
- [ ] CTA proposes a meeting, not a contract signature
- [ ] Tone is consultative and partnership-focused, not transactional
- [ ] No urgency or pressure language ("time running out", "act now")
- [ ] Subject line is under 50 characters
- [ ] Email is 150-250 words (concise but substantive)
- [ ] Health summary identifies at least 2 positive signals and any risk signals
- [ ] Talking points are specific to THIS account (not generic renewal scripts)

## Error Handling

### Insufficient account data
If deal data is minimal (no activity history, no usage metrics), draft a discovery-first email: "As we approach your renewal in 60 days, I'd love to schedule a check-in to review how ${company_name} is working for your team and identify any areas we can improve." Flag: "Insufficient data for value recap — draft focuses on discovery."

### No recent engagement (90+ days)
If the last interaction was over 90 days ago, acknowledge the gap directly: "I realized we haven't connected recently, which is on me. I'd love to catch up before your contract renewal in 60 days to make sure we're supporting your team properly." Flag: "Account disengaged — renewal at risk."

### Unresolved support issues
If there are open high-priority support tickets, address them FIRST in the email before discussing renewal: "Before we discuss renewal, I want to make sure we've fully resolved the [specific issue] your team flagged last month. Can we schedule a call to address that and review your overall experience?" Flag: "Critical support issues must be resolved before renewal push."

### Contact changed recently
If the primary contact is new (joined in the last 90 days), adjust the email to rebuild context: "As your team's new [role], you may not have full visibility into the partnership history. I'd love to schedule a call to bring you up to speed on what we've delivered and discuss your priorities for the renewal period." Flag: "New contact — requires onboarding."

### Contract value unknown
If contract value is not available, omit ARR/pricing discussion and focus purely on value delivered and relationship health. Flag: "Contract terms unavailable — email focuses on qualitative value."

## Examples

### Good Renewal Reminder Email (Strong Health)
```
Subject: Acme x ${company_name} — 60-Day Renewal Check-In

Hi Sarah,

We're coming up on your contract renewal in 60 days, and I wanted to reflect on
the progress your team has made with ${company_name} over the past year. Seeing
your engineering team reduce data reconciliation time by 70% has been one of my
favorite success stories this quarter.

Value delivered over the past year:
- Reduced manual reconciliation from 15 hrs/week to 4 hrs/week (70% savings)
- Achieved SOC 2 compliance on schedule with zero security incidents
- Onboarded 12 new team members with 95% adoption within 30 days
- Processed 2.3M API calls with 99.97% uptime

Your team's engagement has been outstanding. I did notice you've hit API rate
limits twice this quarter — if your team continues growing at this pace, our
Growth plan with unlimited API calls might be worth exploring.

Let's schedule a 30-minute renewal review to discuss what's working, address any
gaps, and explore the best contract structure for your next phase of growth.
Would Tuesday Feb 25 at 2pm or Thursday Feb 27 at 10am work?

Looking forward to continuing the partnership.

Best,
[Rep]
```

### Good Renewal Reminder Email (At Risk)
```
Subject: Acme x ${company_name} — Let's Catch Up Before Renewal

Hi Sarah,

I realized we haven't connected in a few months, which is on me. With your
contract renewal coming up in 60 days, I wanted to reach out and make sure
we're supporting your team properly.

I know there were some integration challenges earlier this year that slowed your
rollout. I want to make sure those are fully resolved and that ${company_name} is
delivering the value you expected when we first partnered.

Could we schedule a 30-minute check-in next week to review what's working, what
isn't, and whether renewing makes sense for your team's goals? I'm happy to
discuss contract adjustments if the current plan isn't the right fit.

Would Tuesday Feb 25 at 10am or Wednesday Feb 26 at 3pm work?

Best,
[Rep]
```

**Why this works**: Acknowledges the engagement gap. Surfaces unresolved issues. Frames renewal as conditional ("if it makes sense") not assumed. Consultative, not pushy.
