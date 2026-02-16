---
name: QBR Scheduler
description: |
  Schedule Quarterly Business Review (QBR) and draft invite email with proposed agenda.
  Use when a QBR milestone triggers (90 days since last QBR) or user asks "schedule QBR",
  "send QBR invite", or needs to proactively engage strategic accounts.
  Returns QBR invite email with agenda items based on account history and performance.
metadata:
  author: sixty-ai
  version: "2"
  category: relationship-ai
  skill_type: atomic
  is_active: true
  context_profile: account
  agent_affinity:
    - customer-success
    - account-management
  triggers:
    - pattern: "schedule QBR"
      intent: "qbr_scheduling"
      confidence: 0.90
      examples:
        - "send QBR invite"
        - "set up quarterly business review"
        - "schedule business review meeting"
    - pattern: "quarterly review"
      intent: "quarterly_review_scheduling"
      confidence: 0.85
      examples:
        - "quarterly check-in"
        - "Q1 review meeting"
        - "business review with customer"
    - pattern: "QBR due"
      intent: "qbr_reminder"
      confidence: 0.85
      examples:
        - "time for QBR"
        - "schedule next quarterly review"
        - "quarterly meeting needed"
  keywords:
    - "QBR"
    - "quarterly"
    - "business review"
    - "review meeting"
    - "strategic review"
    - "account review"
  required_context:
    - deal_id
    - contact_id
    - company_name
  inputs:
    - name: deal_id
      type: string
      description: "The deal identifier for the account requiring QBR"
      required: true
    - name: contact_id
      type: string
      description: "Primary stakeholder for QBR invitation"
      required: false
    - name: last_qbr_date
      type: string
      description: "Date of last QBR (ISO format)"
      required: false
    - name: account_tier
      type: string
      description: "Account tier (enterprise, strategic, mid-market)"
      required: false
  outputs:
    - name: email_draft
      type: object
      description: "QBR invite email with proposed agenda and meeting details"
    - name: agenda_items
      type: array
      description: "Suggested QBR agenda topics based on account history"
    - name: meeting_metadata
      type: object
      description: "Suggested meeting duration, format, and attendees"
  priority: high
  requires_capabilities:
    - crm
    - email
    - calendar
---

## Available Context & Tools
@_platform-references/org-variables.md
@_platform-references/capabilities.md

# QBR Scheduler

## Goal
Generate a professional QBR (Quarterly Business Review) invite email with a proposed agenda based on account performance, relationship history, and strategic opportunities. The QBR is NOT a product pitch — it is a strategic partnership check-in that reviews value delivered, addresses gaps, aligns on future goals, and uncovers expansion opportunities through consultative conversation.

## Why Quarterly Business Reviews Matter

QBRs are the cornerstone of strategic account management and the strongest predictor of retention and expansion:

- **Accounts with regular QBRs have 2.7x higher retention rates** compared to accounts with reactive-only engagement (Gainsight QBR Impact Study, 2024).
- **62% of expansion revenue comes from accounts that participate in structured QBRs** vs. 18% from accounts without QBRs (ChurnZero expansion benchmarks).
- **QBRs scheduled 90 days after the previous one have 41% higher attendance rates** than those scheduled ad-hoc or overdue (Salesforce Customer Success data).
- **The #1 customer complaint about vendor relationships: "They only reach out when they want to sell us something"** — QBRs flip this by leading with value, not asks (LinkedIn State of Sales, 2024).
- **QBRs that include data-driven performance metrics drive 3.2x more actionable decisions** than those based on qualitative discussion alone (Forrester Customer Success Frameworks).

The conclusion: QBRs are not optional for strategic accounts. They are the operational rhythm of partnership.

## Required Capabilities
- **CRM**: To fetch deal data, account history, usage metrics, relationship activity
- **Email**: To draft and send QBR invite communications
- **Calendar**: To propose meeting times and integrate with scheduling tools

## Inputs
- `deal_id`: The deal identifier for the account requiring QBR (required)
- `contact_id`: Primary stakeholder for QBR invitation (optional — will infer from deal if not provided)
- `last_qbr_date`: Date of last QBR (optional — helps determine if QBR is overdue)
- `account_tier`: Account tier (enterprise, strategic, mid-market) (optional — influences QBR format)

## Data Gathering (via execute_action)

Gather comprehensive account context before drafting:

1. **Deal record**: `execute_action("get_deal", { id: deal_id })` — account value, contract terms, products/services, owner
2. **Contact details**: `execute_action("get_contact", { id: contact_id })` — primary QBR stakeholder
3. **Activity history**: `execute_action("get_deal_activities", { deal_id, limit: 100 })` — meetings, emails, support tickets, QBRs
4. **Open tasks**: `execute_action("list_tasks", { deal_id })` — unresolved issues, pending deliverables
5. **Recent meetings**: Check for prior QBRs, check-ins, escalations in the last 90 days
6. **Usage data** (if available): Product usage metrics, feature adoption trends, user growth
7. **Support tickets**: Recent issues, escalations, or product feedback

If data calls fail, note missing information and draft a more generic QBR invite with a discovery-first agenda.

## QBR Email Structure Methodology

Every QBR invite email uses a 5-section structure optimized for executive engagement:

### Section 1: Opening + QBR Purpose (2-3 sentences)
**Purpose**: Set the frame as a strategic partnership review, not a vendor check-in.

**Rules**:
- Lead with partnership language ("let's review our progress together")
- Acknowledge the quarterly cadence or time since last QBR
- Frame the QBR as mutual value (for both parties to align)
- Use the contact's name and acknowledge their role/seniority

**Good example**: "Sarah, it's been 90 days since our last quarterly review, and I'd love to schedule our next QBR to review what's working, address any gaps, and align on your team's priorities for Q2. These check-ins are invaluable for making sure ${company_name} is delivering the value your team needs."

**Bad example**: "Hi Sarah, it's time for our quarterly business review. Let me know when you're available."

### Section 2: Proposed Agenda (4-6 bullet points)
**Purpose**: Show that this is a structured, valuable use of their time (not a fishing expedition).

**Rules**:
- Include 4-6 specific agenda topics based on account history
- Lead with THEIR priorities (value recap, performance metrics) not YOUR asks (upsells, renewals)
- Use data-driven topics ("Review: 30% reduction in reconciliation time") not generic placeholders ("Discuss progress")
- Include one forward-looking topic ("Plan: Q2 roadmap alignment" or "Explore: Advanced feature opportunities")
- Time-box the agenda (show it's a 30-45 minute meeting, not a 2-hour commitment)

**Good example**:
```
Proposed Agenda (30 minutes):
1. Value delivered Q1: Usage metrics, time savings, ROI summary (8 min)
2. Performance review: Uptime, support response times, SLA adherence (5 min)
3. Feedback session: What's working, what needs improvement (7 min)
4. Q2 priorities: Your team's roadmap and how we can support (5 min)
5. Feature spotlight: Advanced audit logging for SOC 2 compliance (3 min)
6. Next steps & follow-up actions (2 min)
```

**Bad example**:
```
Agenda:
- Review account status
- Discuss product updates
- Talk about future opportunities
- Q&A
```

### Section 3: Value Preview (1-2 sentences)
**Purpose**: Give a teaser of the value recap to incentivize attendance.

**Rules**:
- Include 1-2 quantified metrics or wins from the past quarter
- Make it specific to THEIR account (not generic product stats)
- Frame as "here's what we'll cover" not "here's why you should attend"

**Good example**: "We've seen your team process 800K+ API calls this quarter with 99.98% uptime, and your engineering team has saved an estimated 70+ hours on manual reconciliation. I'll bring a full performance breakdown to the meeting."

**Bad example**: "We have a lot of great updates to share with you."

### Section 4: Proposed Meeting Details (3-4 lines)
**Purpose**: Make scheduling as frictionless as possible.

**Rules**:
- Propose specific date/time options (2-3 slots)
- Specify duration (30 or 45 minutes for most accounts, 60 for strategic/enterprise)
- Offer format flexibility (video call, phone, in-person if relevant)
- Include suggested attendees from their team (multi-threading opportunity)
- Offer to send a calendar invite once confirmed

**Good example**:
```
Proposed timing (30 minutes, video call):
- Tuesday, March 18 at 2:00pm EST
- Thursday, March 20 at 10:00am EST
- Friday, March 21 at 3:00pm EST

If helpful, I'd love to include your VP of Engineering and our technical success
lead on the call. I'll send a calendar invite once you confirm what works best.
```

**Bad example**: "Let me know when you're free and I'll send an invite."

### Section 5: CTA (1 sentence)
**Purpose**: Get confirmation with minimal friction.

**Rules**:
- Ask for a simple reply confirming one of the proposed times
- Offer flexibility if none of the times work
- Keep it to one sentence

**Good example**: "Could you let me know which of those times works best, or suggest an alternative if none fit your schedule?"

**Bad example**: "Please confirm your availability at your earliest convenience."

## Agenda Generation Methodology

The QBR agenda is the most important part of the invite. A well-structured agenda drives attendance and engagement.

### Agenda Construction Framework

Generate agenda items by analyzing account data across these dimensions:

#### 1. Value Delivered (ALWAYS include, 8-10 min)
- **Purpose**: Recap quantified value delivered in the past quarter
- **Data sources**: Usage metrics, time savings estimates, ROI calculations, feature adoption stats
- **Format**: "Value delivered Q1: Usage metrics, time savings, ROI summary"
- **Example**: "Your team processed 800K API calls, reduced reconciliation time by 70 hours, and achieved 95% feature adoption"

#### 2. Performance Review (ALWAYS include, 5-7 min)
- **Purpose**: Transparently report on SLA adherence, uptime, support response times
- **Data sources**: Uptime logs, support ticket response times, SLA compliance data
- **Format**: "Performance review: Uptime, support response times, SLA adherence"
- **Example**: "99.98% uptime (exceeding 99.9% SLA), average support response time 2.3 hours (SLA: 4 hours)"

#### 3. Feedback Session (ALWAYS include, 5-10 min)
- **Purpose**: Create space for the customer to surface concerns, requests, or praise
- **Data sources**: Recent support tickets, feature requests, escalations, product feedback
- **Format**: "Feedback session: What's working, what needs improvement"
- **Example**: Invite open discussion, but come prepared with "We noticed you requested [Feature X] — let's discuss timing and feasibility"

#### 4. Customer Roadmap Alignment (include for strategic/enterprise accounts, 5-7 min)
- **Purpose**: Understand their Q2 priorities and align ${company_name}'s support
- **Data sources**: Prior QBR notes, sales discovery notes, industry trends
- **Format**: "Q2 priorities: Your team's roadmap and how we can support"
- **Example**: "What are your top 3 priorities for Q2? How can we help you hit those goals?"

#### 5. Product/Feature Spotlight (optional, 3-5 min)
- **Purpose**: Introduce relevant features they are not using OR preview upcoming releases
- **Data sources**: Feature adoption data, product roadmap, industry use cases
- **Format**: "Feature spotlight: [Specific feature] for [Their use case]"
- **Example**: "Feature spotlight: Advanced audit logging for SOC 2 compliance (we noticed you're not using this yet)"
- **CRITICAL**: Only include if the feature is genuinely relevant to their use case. Forced product pitches destroy QBR trust.

#### 6. Expansion Opportunity (optional, include only if backed by data, 3-5 min)
- **Purpose**: Surface natural expansion paths based on usage patterns or team growth
- **Data sources**: Usage trends, team growth, feature requests, API limit hits
- **Format**: "Growth discussion: [Specific expansion opportunity]"
- **Example**: "Your team has grown from 10 to 18 users and you're hitting API rate limits — let's discuss the Growth plan"
- **CRITICAL**: Only include if there is clear evidence of expansion fit. Forcing an upsell in a QBR is a trust violation.

#### 7. Open Issues Resolution (include if unresolved support tickets exist, 5-7 min)
- **Purpose**: Address outstanding support tickets or escalations before discussing anything else
- **Data sources**: Open support tickets, unresolved issues
- **Format**: "Issue resolution: [Specific open tickets]"
- **Example**: "Before we review the quarter, let's close out the API timeout issue your team flagged last month"
- **CRITICAL**: If there are open high-priority issues, this MUST be the first agenda item. You cannot discuss upsells or renewals when critical issues are unresolved.

#### 8. Next Steps & Follow-Up (ALWAYS include, 2-3 min)
- **Purpose**: Lock in follow-up actions and next QBR date
- **Format**: "Next steps & follow-up actions"
- **Example**: "Agree on Q2 action items and schedule our next QBR for June"

### Agenda Priority Order

Order agenda items by this priority:
1. **Open issues resolution** (if any high-priority issues exist) — ALWAYS FIRST
2. **Value delivered** — lead with what you've accomplished
3. **Performance review** — transparency builds trust
4. **Feedback session** — give them space to talk
5. **Customer roadmap alignment** — show you care about their goals
6. **Feature spotlight** (if relevant) — introduce value-add opportunities
7. **Expansion opportunity** (if backed by data) — growth conversation
8. **Next steps** — lock in actions

### Meeting Duration by Account Tier

Recommend meeting duration based on account tier:

- **Enterprise/Strategic accounts**: 45-60 minutes (more comprehensive agenda, executive attendance)
- **Mid-market accounts**: 30-45 minutes (focused agenda, working-level attendance)
- **Small accounts**: 30 minutes (streamlined agenda, single contact)

## Tone Guidelines: Strategic Partnership, Not Vendor Check-In

The QBR invite tone is critical. This is not a sales meeting — it is a strategic partnership review.

**Strategic partnership tone characteristics**:
- **Mutual value**: "Let's review our progress together" not "I'd like to update you"
- **Data-driven**: Lead with metrics, performance, and ROI (not product features)
- **Transparent**: Acknowledge both wins and areas for improvement
- **Customer-first**: Their roadmap and priorities are the agenda anchor
- **Forward-looking**: Focus on Q2 alignment, not just Q1 recap

**Avoid**:
- Sales language ("I'd love to discuss expansion opportunities" as the opening)
- Generic agenda placeholders ("Discuss progress", "Review updates")
- One-sided framing ("I'll present our Q1 performance" — this is a dialogue, not a presentation)
- Ignoring unresolved issues (you cannot pitch when critical problems exist)

## QBR Attendance Strategy: Multi-Threading

QBRs are an opportunity to multi-thread into the account by inviting additional stakeholders.

**Attendee Recommendations**:
- **From customer side**:
  - Primary contact (required)
  - Economic buyer or executive sponsor (for strategic accounts)
  - Technical lead or power user (if product adoption is a topic)
  - Procurement or finance (if renewal is within 6 months)
- **From ${company_name} side**:
  - Account owner (required)
  - Technical success lead or solutions engineer (if technical topics on agenda)
  - Executive sponsor (for strategic accounts, shows commitment)

**Invite Strategy**:
- Default: Invite primary contact and SUGGEST additional attendees ("If helpful, I'd love to include your VP of Engineering")
- Do NOT over-invite — a 6-person QBR is a waste of time
- For enterprise accounts, coordinate executive alignment in advance

## Output Contract

Return a SkillResult with:

### `data.email_draft`
Object:
- `subject`: string (recommended subject line)
- `subject_variants`: array of 3 subject line options
- `body`: string (full email text)
- `body_html`: string | null (HTML formatted version)
- `to`: string (primary contact email)
- `cc`: string[] | null (suggested additional attendees)
- `sections`: array of section objects:
  - `type`: "opening" | "agenda" | "value_preview" | "meeting_details" | "cta"
  - `content`: string
- `tone`: "strategic" | "partnership"
- `word_count`: number

### `data.agenda_items`
Array of 4-8 objects:
- `title`: string (agenda item title)
- `description`: string (1-2 sentence description of what will be covered)
- `duration_minutes`: number (time allocation)
- `priority`: "critical" | "high" | "medium"
- `data_source`: string (where the agenda item is sourced from: "usage_metrics" | "support_tickets" | "account_history" | "product_roadmap")

### `data.meeting_metadata`
Object:
- `recommended_duration`: number (30, 45, or 60 minutes)
- `recommended_format`: "video" | "phone" | "in_person"
- `suggested_attendees_customer`: string[] (roles or names of customer attendees to invite)
- `suggested_attendees_vendor`: string[] (roles from ${company_name} to include)
- `proposed_times`: array of 3 ISO datetime strings

### `data.account_health_snapshot`
Object:
- `overall_health`: "strong" | "moderate" | "at_risk"
- `usage_trend`: "increasing" | "stable" | "declining"
- `unresolved_issues`: number (count of open high-priority tickets)
- `expansion_readiness`: "high" | "medium" | "low" | "none"
- `last_qbr_date`: string (ISO date) | null
- `days_since_last_qbr`: number | null

### `data.value_metrics`
Object (preview of what will be shared in QBR):
- `key_metrics`: array of { metric: string, value: string, context: string }
- `time_period`: string ("Q1 2025")
- `roi_estimate`: string | null (estimated ROI if calculable)

## Quality Checklist

Before returning results, validate:

- [ ] Agenda includes at least 4 specific, data-driven topics (not generic placeholders)
- [ ] Agenda leads with value delivered and performance review (not product pitches)
- [ ] If unresolved support tickets exist, they are the FIRST agenda item
- [ ] Expansion opportunity is only included if backed by usage data or growth signals
- [ ] Meeting duration is appropriate for account tier (30-60 min)
- [ ] Email proposes 2-3 specific time options (not "let me know when you're free")
- [ ] Value preview includes at least 1 quantified metric from the past quarter
- [ ] Tone is strategic partnership, not vendor check-in
- [ ] Subject line is under 50 characters
- [ ] Email is 150-250 words (substantive but concise)
- [ ] Suggested attendees are relevant to the agenda topics

## Error Handling

### Insufficient account data
If account data is minimal (no usage metrics, no activity history), draft a discovery-first QBR agenda: "Since we don't have a full quarter of data yet, let's use this QBR to establish a baseline and align on success metrics for Q2." Flag: "Insufficient data for value recap — agenda focuses on baseline setting."

### Last QBR was < 60 days ago
If the last QBR was less than 60 days ago, flag: "Last QBR was only [X] days ago. Consider waiting until the 90-day cadence unless there is a specific reason to meet sooner (renewal, escalation, major milestone)."

### Last QBR was > 180 days ago (overdue)
If the last QBR was over 180 days ago, acknowledge the gap directly in the email: "I realized it's been over 6 months since our last QBR, which is on me. Let's schedule a catch-up to review where things stand and make sure we're aligned going forward." Flag: "QBR significantly overdue — account may be at risk."

### Unresolved high-priority support tickets
If there are open high-priority support tickets, make issue resolution the FIRST agenda item and acknowledge it in the email: "Before we review the quarter, I want to make sure we fully resolve the [specific issue] your team flagged. Let's start there and then cover performance and next steps." Flag: "Critical issues must be resolved before QBR."

### No usage data available
If usage metrics are not available, focus the agenda on qualitative feedback and roadmap alignment: "Since we don't have detailed usage analytics yet, let's focus this QBR on your team's feedback and Q2 priorities. I'll bring a performance baseline for our next review." Flag: "Usage data unavailable — agenda focuses on feedback and alignment."

### Contact is not decision-maker
If the primary contact is not the economic buyer, suggest inviting the decision-maker: "Would it be helpful to include [Economic Buyer Name] in this QBR? I'd love to align with them on strategic priorities for Q2." Flag: "Primary contact is not decision-maker — recommend executive alignment."

## Examples

### Good QBR Invite Email (Strategic Account)
```
Subject: Acme x ${company_name} — Q1 QBR Scheduling

Hi Sarah,

It's been 90 days since our last quarterly review, and I'd love to schedule our
next QBR to review what's working, address any gaps, and align on your team's
priorities for Q2. These check-ins are invaluable for making sure ${company_name}
is delivering the value your team needs.

Proposed Agenda (45 minutes):
1. Value delivered Q1: 800K API calls, 70 hours saved, 99.98% uptime (8 min)
2. Performance review: SLA adherence, support response times (5 min)
3. Issue resolution: Close out API timeout tickets from last month (7 min)
4. Feedback session: What's working, what needs improvement (10 min)
5. Q2 priorities: Your team's roadmap and how we can support (7 min)
6. Feature spotlight: Advanced audit logging for SOC 2 compliance (5 min)
7. Next steps & Q2 action plan (3 min)

We've seen your team process 800K+ API calls this quarter with 99.98% uptime,
and your engineering team has saved an estimated 70+ hours on manual
reconciliation. I'll bring a full performance breakdown to the meeting.

Proposed timing (45 minutes, video call):
- Tuesday, March 18 at 2:00pm EST
- Thursday, March 20 at 10:00am EST
- Friday, March 21 at 3:00pm EST

If helpful, I'd love to include your VP of Engineering and our technical success
lead on the call. I'll send a calendar invite once you confirm what works best.

Could you let me know which of those times works, or suggest an alternative?

Best,
[Rep]
```

### Good QBR Invite Email (At-Risk Account)
```
Subject: Acme x ${company_name} — Overdue QBR + Account Check-In

Hi Sarah,

I realized it's been over 6 months since our last QBR, which is on me. I'd love
to schedule a catch-up to review where things stand, address any concerns, and
make sure we're aligned on your team's priorities going forward.

Proposed Agenda (30 minutes):
1. Issue resolution: API timeout and support ticket backlog (10 min)
2. Feedback session: What's working, what's not (10 min)
3. Q2 alignment: Your priorities and how we can better support (7 min)
4. Next steps & follow-up actions (3 min)

I know there have been some bumps with support response times and the recent API
issues. I want to make sure we address those head-on and rebuild your confidence
in the partnership.

Proposed timing (30 minutes, video call):
- Tuesday, March 18 at 3:00pm EST
- Wednesday, March 19 at 10:00am EST
- Thursday, March 20 at 2:00pm EST

Could you let me know which time works best?

Best,
[Rep]
```

**Why this works**: Acknowledges the gap. Leads with issue resolution. Frames QBR as rebuilding trust, not upselling. Consultative, not defensive.
