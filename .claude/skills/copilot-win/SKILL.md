---
name: Win Note
description: |
  Deal-won announcement for Slack with key stats and the deal story.
  Use when a user says "/win", "win note", "deal won", "celebrate deal",
  "announce the win", or wants to share a closed-won deal with the team.
  Produces a Slack-ready announcement with key metrics, the deal journey narrative,
  and lessons learned -- celebrating the win while capturing institutional knowledge.
metadata:
  author: sixty-ai
  version: "2"
  category: sales-ai
  skill_type: atomic
  is_active: true
  context_profile: sales
  agent_affinity:
    - pipeline
  triggers:
    - pattern: "/win"
      intent: "win_slash_command"
      confidence: 0.95
      examples:
        - "/win"
        - "/win Acme Corp"
    - pattern: "win note"
      intent: "win_note"
      confidence: 0.90
      examples:
        - "write a win note"
        - "create a win announcement"
        - "post a win note for this deal"
    - pattern: "deal won"
      intent: "deal_won_celebration"
      confidence: 0.85
      examples:
        - "we won this deal"
        - "deal is closed won"
        - "mark this as a win"
    - pattern: "celebrate deal"
      intent: "deal_celebration"
      confidence: 0.80
      examples:
        - "celebrate this deal"
        - "announce the win"
        - "share the win with the team"
  keywords:
    - "win"
    - "won"
    - "celebrate"
    - "closed won"
    - "announcement"
    - "win note"
    - "deal won"
    - "victory"
  requires_context:
    - deal
  inputs:
    - name: deal_id
      type: string
      description: "Deal ID for the closed-won deal to announce"
      required: true
    - name: shoutouts
      type: string
      description: "Names of team members to thank or highlight in the announcement"
      required: false
    - name: channel
      type: string
      description: "Slack channel to post to (default: #wins or org default)"
      required: false
  outputs:
    - name: announcement_text
      type: string
      description: "Slack-formatted announcement message with deal details, story, and team shoutouts"
    - name: key_stats
      type: object
      description: "Deal metrics: value, days to close, stage duration, win factors"
    - name: deal_story
      type: string
      description: "Narrative arc of the deal from first touch to close -- what happened, what worked, and lessons for the team"
  requires_capabilities:
    - crm
  priority: medium
  tags:
    - sales-ai
    - pipeline
    - celebration
    - slack
---

## Available Context & Tools
@_platform-references/org-variables.md
@_platform-references/capabilities.md

# Win Note

## Instructions

You are executing the /win skill. Your job is to produce a Slack-ready deal-won announcement that celebrates the win, highlights key stats, tells the deal story, and captures lessons for the team. The tone should be energetic and celebratory but professional -- not over-the-top.

## Goal

Generate a win announcement that serves three purposes:
1. **Celebrate**: Recognize the team's effort and boost morale
2. **Inform**: Share key deal metrics and context with the broader team
3. **Teach**: Capture what worked so others can replicate the win

## Required Capabilities
- **CRM**: Fetch deal details, history, contacts, and timeline

## Data Gathering (via execute_action)

1. `execute_action("get_deal", { id: deal_id })` -- value, stage history, close date, source, owner
2. `execute_action("get_deal_contacts", { deal_id })` -- key stakeholders and champion
3. `execute_action("get_deal_activities", { deal_id, limit: 50 })` -- full deal timeline
4. `execute_action("get_meetings", { deal_id })` -- meeting history for the deal story
5. `execute_action("get_company", { id: company_id })` -- customer firmographics

## Announcement Structure

### Slack Message Format

Use Slack Block Kit formatting (bold, bullet points, dividers). The message should be structured as:

**Header**: Company name + deal value (prominent)

**Key Stats Block**:
- Deal value (ARR or one-time)
- Days from first touch to close
- Number of meetings held
- Deal source (inbound, outbound, referral, etc.)
- Competitor displaced (if any)

**Deal Story Block** (3-5 sentences):
The narrative arc of the deal. What was the customer's problem? How did we engage? What was the turning point? What sealed the deal? This should read like a mini case study that other reps can learn from.

**What Worked Block** (2-3 bullet points):
Specific tactics or moments that contributed to the win. These should be actionable insights others can apply:
- "Multi-threaded early -- engaged VP Eng and CTO by week 2"
- "POC with clear success criteria eliminated competitor"
- "Champion armed with ROI deck for internal sell"

**Shoutouts Block** (if team members mentioned):
Call out specific contributors by name with what they did.

**Closing**: Brief, celebratory sign-off.

### Tone Guidelines

- Celebratory but professional -- not juvenile or over-the-top
- Focus on the team and the customer's success, not individual ego
- Include specific details that make the story real (not generic "great teamwork")
- Use Slack formatting: *bold* for emphasis, bullet points for lists, > for quotes
- Keep total message under 300 words (Slack messages that are too long get skimmed)

## Key Stats Computation

Calculate from deal data:
- **Deal value**: From deal record (format as currency)
- **Days to close**: From first activity to close date
- **Meetings held**: Count of meetings associated with the deal
- **Stage progression**: How long the deal spent in each stage
- **Win factors**: Inferred from activities (multi-threading, POC, champion engagement, etc.)

## Deal Story Construction

Build the narrative from activity history:
1. **Opening**: How did we first engage? (Source, first meeting, initial pain point)
2. **Middle**: What happened during the sales process? (Key meetings, turning points, obstacles overcome)
3. **Climax**: What was the deciding factor? (What tipped the deal in our favor)
4. **Resolution**: Close details (timeline, process, final decision)

Keep it concise -- 3-5 sentences. The story should be specific enough to be useful, short enough to be read.

## Quality Checklist

Before returning results, verify:
- [ ] Deal value and key stats are accurate (pulled from CRM, not estimated)
- [ ] Deal story references specific events from the deal timeline
- [ ] "What worked" items are actionable insights, not platitudes
- [ ] Tone is celebratory but professional
- [ ] Total announcement is under 300 words
- [ ] Slack formatting is correct (bold, bullets, dividers)
- [ ] Shoutouts included if team members were specified
- [ ] No confidential pricing details or internal-only information in the public announcement

## Error Handling

### Deal is not closed-won
Check deal stage. If not closed-won, warn: "This deal is currently in [stage]. Win note is typically generated for closed-won deals. Proceed anyway?" If the user confirms, generate the note with a note about the current stage.

### Minimal deal history
Generate announcement with available data. Use deal record fields (value, close date, source) even if activity history is sparse. Note: "Limited deal history available. Consider adding context about what made this deal special."

### No contacts on the deal
Generate announcement without stakeholder details. Note in the deal story: "Customer stakeholders not recorded in CRM."

### Shoutouts requested but names not in system
Include the names as provided by the user in plain text. Do not try to resolve to user IDs.

## Output Contract

Return a SkillResult with:
- `data.announcement_text`: string (full Slack-formatted message, ready to post)
- `data.key_stats`: object with { deal_value, days_to_close, meetings_held, deal_source, competitor_displaced, stage_history[] }
- `data.deal_story`: string (narrative arc, 3-5 sentences)
- `data.what_worked`: array of strings (2-3 actionable insights)
- `data.shoutouts`: array of { name, contribution } (if provided)
