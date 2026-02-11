---
name: "Event Outreach Pipeline"
description: |
  End-to-end event outreach sequence that finds targeted prospects, generates personalized
  multi-stage email sequences for an event invitation, creates an ops table with the leads,
  enriches key fields, and pushes everything to an Instantly campaign ready to send.

  Use this when someone wants to find prospects and invite them to an event, webinar,
  roundtable, breakfast, lunch, dinner, conference, workshop, or meetup with automated
  outreach. Handles the full pipeline from lead discovery to campaign launch.

metadata:
  author: sixty-ai
  version: "2"
  category: agent-sequence
  skill_type: sequence
  is_active: true
  context_profile: sales
  agent_affinity:
    - prospecting
    - outreach

triggers:
  - pattern: "find.*(?:leads|people|directors|contacts).*(?:sequence|email|invite|outreach|campaign)"
    intent: "event_outreach_pipeline"
    confidence: 0.90
    examples:
      - "Find me 20 Directors in Bristol and create a sequence inviting them to our event"
      - "Search for CTOs in London and write an outreach campaign for our roundtable"
      - "Find 50 marketing managers and invite them to our webinar"
      - "Build a prospect list and create email sequences for our breakfast event"
  - pattern: "(?:prospect|outreach|campaign).*(?:event|roundtable|webinar|breakfast|conference|workshop)"
    intent: "event_prospect_campaign"
    confidence: 0.85
    examples:
      - "Create an outreach campaign for our AI roundtable in Bristol"
      - "Prospect for our upcoming breakfast event and write the emails"
  - pattern: "find.*and.*(?:invite|email|message|reach out|contact them)"
    intent: "find_and_outreach"
    confidence: 0.80
    examples:
      - "Find Directors of Marketing and invite them to our event"
      - "Search for founders and email them about our conference"

keywords:
  - event outreach
  - prospect and invite
  - find and email
  - campaign pipeline
  - roundtable invitation
  - webinar outreach
  - event sequence
  - prospect campaign

required_context: []

optional_context:
  - company_name
  - event_name
  - event_details

inputs:
  - name: search_criteria
    type: object
    description: "Lead search criteria: titles, location, company size, industry, count"
    required: true
  - name: event_details
    type: object
    description: "Event info: name, date, time, location, venue, description, value proposition"
    required: true
  - name: sequence_stages
    type: number
    description: "Number of email stages (default: 2)"
    required: false
    default: 2
  - name: tone
    type: string
    description: "Email tone: professional, casual, conversational, executive (default: professional)"
    required: false
    default: professional

outputs:
  - name: table_id
    type: string
    description: "ID of the created ops table with leads"
  - name: lead_count
    type: number
    description: "Number of leads found and added"
  - name: email_sequences
    type: array
    description: "Generated email sequences (subject + body per stage)"
  - name: campaign_status
    type: string
    description: "Status of the Instantly campaign creation"

requires_capabilities:
  - ops_tables
  - web_search

linked_skills:
  - sales-sequence

workflow:
  - order: 1
    action: search_leads_create_table
    input_mapping:
      query: "${inputs.search_criteria.query}"
      person_titles: "${inputs.search_criteria.titles}"
      person_locations: "${inputs.search_criteria.location}"
      employee_ranges: "${inputs.search_criteria.company_size}"
      per_page: "${inputs.search_criteria.count}"
    output_key: search_result
    on_failure: stop

  - order: 2
    action: add_ops_column
    input_mapping:
      table_id: "${outputs.search_result.table_id}"
      name: "Email Sequence Status"
      column_type: "status"
    output_key: status_column
    on_failure: continue

  - order: 3
    skill_key: sales-sequence
    input_mapping:
      context:
        event_name: "${inputs.event_details.name}"
        event_date: "${inputs.event_details.date}"
        event_time: "${inputs.event_details.time}"
        event_location: "${inputs.event_details.location}"
        event_venue: "${inputs.event_details.venue}"
        event_description: "${inputs.event_details.description}"
        sequence_type: "event_invitation"
        num_stages: "${inputs.sequence_stages}"
        tone: "${inputs.tone}"
        lead_count: "${outputs.search_result.row_count}"
        lead_titles: "${inputs.search_criteria.titles}"
    output_key: email_sequences
    on_failure: stop

  - order: 4
    action: push_ops_to_instantly
    input_mapping:
      table_id: "${outputs.search_result.table_id}"
      campaign_config:
        name: "${inputs.event_details.name} Outreach"
        emails: "${outputs.email_sequences.emails}"
    output_key: campaign_result
    on_failure: stop
    needs_confirmation: true

execution_mode: async
timeout_ms: 120000

priority: high

tags:
  - prospecting
  - outreach
  - events
  - campaign
  - pipeline
---

## Available Context
@_platform-references/org-variables.md

# Event Outreach Pipeline

## Goal

Execute a complete event outreach pipeline in one flow: find targeted prospects, generate personalized multi-stage email sequences for an event invitation, and push everything to an Instantly campaign ready to launch.

## When to Use

Use this sequence when the user wants to:
- Find prospects matching specific criteria AND invite them to an event
- Build a targeted outreach list for a roundtable, webinar, breakfast, conference, or workshop
- Create a full campaign pipeline from lead discovery to email sequence to campaign launch

## Instructions

### Step 1: Parse the User's Request

Extract from the user's message:

**Search Criteria:**
- **Titles**: Job titles to search for (e.g., "Director", "CTO", "VP of Marketing")
- **Location**: Geographic area (e.g., "Bristol", "London", "UK")
- **Company Size**: Employee count range (e.g., "50-200", "100-500")
- **Industry**: If mentioned (e.g., "SaaS", "fintech", "healthcare")
- **Count**: Number of leads to find (default: 25)

**Event Details:**
- **Event Name**: Full name of the event
- **Date**: When it's happening
- **Time**: Start and end time
- **Location/City**: Where it's happening
- **Venue**: Specific venue name
- **Description**: What the event is about
- **Value Proposition**: Why someone should attend

**Sequence Config:**
- **Number of stages**: How many emails (default: 2)
- **Tone**: Professional, casual, conversational, executive

### Step 2: Find Leads (search_leads_create_table)

Use `execute_action` with action `search_leads_create_table`:

```
execute_action("search_leads_create_table", {
  query: "<natural language search query>",
  person_titles: ["Director", "Head of"],
  person_locations: ["Bristol, United Kingdom"],
  employee_ranges: [{"min": 50, "max": 200}],
  per_page: 20
})
```

This creates an ops table with the matching leads.

### Step 3: Generate Email Sequences (sales-sequence skill)

Use `execute_action` with action `run_skill` to invoke the sales-sequence skill:

```
execute_action("run_skill", {
  skill_key: "sales-sequence",
  context: {
    sequence_type: "event_invitation",
    event_name: "AI Roundtable Breakfast",
    event_date: "6th March 2026",
    event_time: "9:00 AM - 11:00 AM",
    event_location: "Bristol",
    event_venue: "Harbour Hotel",
    num_stages: 2,
    tone: "professional",
    target_titles: ["Director"],
    target_company_size: "50-200 employees",
    value_proposition: "Exclusive AI roundtable with senior leaders"
  }
})
```

The sales-sequence skill will generate:
- **Email 1** (Initial Invitation): Personal, value-led invitation with event details, RSVP CTA
- **Email 2** (Follow-up): Gentle nudge referencing the first email, social proof, urgency (limited seats)

Each email should include:
- Subject line
- Body with personalization tokens ({first_name}, {company_name})
- Clear CTA (RSVP link or reply to confirm)

### Step 4: Push to Instantly Campaign (with confirmation)

Before pushing, **present the email sequences to the user for review**.

Show:
- Number of leads found
- Email 1 subject + preview
- Email 2 subject + preview
- Campaign name

Ask: "Ready to create this campaign in Instantly with {N} leads? Confirm to proceed."

On confirmation, use `execute_action` with action `push_ops_to_instantly`:

```
execute_action("push_ops_to_instantly", {
  table_id: "<from step 2>",
  campaign_config: {
    name: "AI Roundtable Breakfast - Bristol Directors",
    emails: [
      { subject: "...", body: "..." },
      { subject: "...", body: "..." }
    ]
  }
})
```

### Step 5: Report Results

Return a summary:
- "Found {N} Directors in Bristol (50-200 employees)"
- "Created 2-stage invitation sequence for AI Roundtable Breakfast"
- "Campaign '{name}' created in Instantly with {N} contacts"
- Link to open the ops table
- Note: "Review and activate the campaign in Instantly when ready"

## Output Format

```json
{
  "status": "success",
  "summary": "Created outreach campaign for AI Roundtable Breakfast with 20 Directors from Bristol",
  "data": {
    "table_id": "uuid",
    "table_name": "AI Roundtable - Bristol Directors",
    "lead_count": 20,
    "email_sequences": [
      {
        "stage": 1,
        "subject": "Exclusive AI Roundtable in Bristol - You're Invited",
        "body": "Hi {first_name}..."
      },
      {
        "stage": 2,
        "subject": "Quick follow-up: AI Roundtable - 3 seats remaining",
        "body": "Hi {first_name}..."
      }
    ],
    "campaign_name": "AI Roundtable Breakfast - Bristol Directors",
    "campaign_status": "created_pending_activation"
  }
}
```

## Error Handling

- **No leads found**: Suggest broadening search criteria (wider location, more titles, larger company size)
- **Sales-sequence fails**: Fall back to generating simple email templates inline
- **Instantly push fails**: Save email sequences to ops table column so user can manually create campaign
- **Missing event details**: Ask user for missing info before proceeding

## Guidelines

- Always show email previews before pushing to Instantly (HITL pattern)
- Include personalization tokens in emails ({first_name}, {company_name})
- Keep subject lines under 60 characters
- Make sure emails reference the specific event, date, time, and venue
- Include a clear CTA in every email (RSVP link or "reply to confirm")
- Stage 2 should reference Stage 1 ("I reached out last week about...")
- Add urgency elements in later stages ("limited seats", "filling up fast")
- Always include TODAY'S DATE context in email generation prompts
