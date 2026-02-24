---
name: Chase
description: |
  Gentle re-engagement email for a deal or contact that has gone quiet.
  Use when a user says "/chase", "chase up", "gentle follow up", "deal gone quiet",
  "haven't heard back", or needs to re-engage a prospect who stopped responding.
  Produces a warm, non-pushy email with strategic timing advice that breaks the
  silence without damaging the relationship.
metadata:
  author: sixty-ai
  version: "2"
  category: sales-ai
  skill_type: atomic
  is_active: true
  context_profile: sales
  agent_affinity:
    - outreach
  triggers:
    - pattern: "/chase"
      intent: "chase_slash_command"
      confidence: 0.95
      examples:
        - "/chase"
        - "/chase Acme Corp"
    - pattern: "chase up"
      intent: "chase_followup"
      confidence: 0.90
      examples:
        - "chase up this deal"
        - "chase up Sarah at Acme"
        - "can you chase this contact"
    - pattern: "gentle follow up"
      intent: "gentle_followup"
      confidence: 0.85
      examples:
        - "send a gentle follow up"
        - "write a soft follow up email"
        - "nudge this prospect"
    - pattern: "deal gone quiet"
      intent: "deal_reengagement"
      confidence: 0.85
      examples:
        - "this deal has gone quiet"
        - "haven't heard back from them"
        - "prospect went dark"
        - "no response in weeks"
  keywords:
    - "chase"
    - "follow up"
    - "nudge"
    - "re-engage"
    - "gone quiet"
    - "went dark"
    - "no response"
    - "haven't heard back"
    - "ghosted"
  requires_context:
    - contact
    - deal
  inputs:
    - name: deal_id
      type: string
      description: "Deal ID to chase -- pulls contact and conversation history"
      required: false
    - name: contact_id
      type: string
      description: "Contact ID to chase if no deal context"
      required: false
    - name: tone
      type: string
      description: "Email tone: warm (default), direct, or humorous"
      required: false
      default: "warm"
  outputs:
    - name: email_subject
      type: string
      description: "Subject line for the chase email -- concise, non-pushy, curiosity-driven"
    - name: email_body
      type: string
      description: "Full email body using a re-engagement pattern -- references last conversation, adds new value, soft CTA"
    - name: timing_suggestion
      type: object
      description: "Recommended send day, time, and rationale based on the prospect's engagement history"
  requires_capabilities:
    - crm
  priority: high
  tags:
    - sales-ai
    - outreach
    - follow-up
    - re-engagement
---

## Available Context & Tools
@_platform-references/org-variables.md
@_platform-references/capabilities.md

# Chase

## Instructions

You are executing the /chase skill. Your job is to write a re-engagement email that breaks the silence without damaging the relationship. The email must feel human, add genuine value, and give the prospect a low-friction reason to respond.

## Goal

Produce a chase email that re-opens a stalled conversation. The email should feel like it came from a thoughtful human, not a CRM sequence. It must reference specific past context, offer new value, and include a soft call-to-action that is easy to say yes to.

## The Psychology of Chase Emails

Most chase emails fail because they are about the seller ("Just checking in", "Wanted to follow up", "Circling back"). Effective chase emails succeed because they are about the buyer:

**Bad patterns** (seller-centric):
- "Just checking in to see if you had any thoughts"
- "Wanted to circle back on our last conversation"
- "Haven't heard from you -- is this still a priority?"

**Good patterns** (buyer-centric):
- Reference something specific from the last conversation + add new relevant information
- Share a resource, insight, or industry development that is genuinely useful
- Acknowledge their silence gracefully ("I know things get busy") without guilt-tripping
- Make the ask small: "Would a 10-minute call this week make sense?" not "Let's schedule a demo"

## Required Capabilities
- **CRM**: Fetch deal/contact history, last activity, and conversation context

## Data Gathering (via execute_action)

### If deal_id is provided:
1. `execute_action("get_deal", { id: deal_id })` -- stage, value, last activity date
2. `execute_action("get_deal_contacts", { deal_id })` -- primary contact to email
3. `execute_action("get_deal_activities", { deal_id, limit: 20 })` -- last conversation, topics discussed
4. `execute_action("get_meetings", { deal_id })` -- last meeting context

### If only contact_id is provided:
1. `execute_action("get_contact", { id: contact_id })` -- name, title, company
2. `execute_action("get_contact_activities", { contact_id, limit: 20 })` -- interaction history

### Always:
- Identify the last touchpoint (date, channel, topic)
- Calculate days since last contact
- Look for any stated next steps that were not completed
- Check for any recent company news about the prospect's organization

## Email Composition

### Subject Line Rules
- Under 50 characters
- No "Re:" tricks or fake threads
- No "Just checking in" or "Following up"
- Options:
  - Reference-based: "Quick thought on [topic from last call]"
  - Value-based: "[Relevant insight] for [their company]"
  - Curiosity-based: "Something I noticed about [their industry/company]"
  - Direct: "[First name] -- still make sense?"

### Email Body Structure

**Opening (1 sentence)**: Reference the last conversation specifically. Show you remember. Never open with "I hope this email finds you well."

**Value add (2-3 sentences)**: Share something genuinely useful:
- A relevant article, case study, or data point
- An insight related to their stated problem
- News about their industry or competitors
- A new feature or capability that addresses their specific concern

**Graceful acknowledgment (1 sentence)**: Acknowledge the gap without blame. "I know [quarter end / hiring season / product launches] can take over" is better than "I haven't heard from you."

**Soft CTA (1 sentence)**: Make it easy to say yes:
- "Would a quick 10-minute call this week be useful?"
- "Happy to send over [specific resource] if that would help"
- "No pressure either way -- just wanted to share this while it was top of mind"

**Total length**: 80-120 words. Chase emails must be short. Long emails signal desperation.

### Tone Variations

**Warm (default)**: Friendly, helpful, no pressure. Best for most situations.

**Direct**: Respectful but clear ask. Best when the deal was progressing well and silence is unexpected. "I want to respect your time -- is this still something you are exploring, or has the priority shifted?"

**Humorous**: Light, self-aware. Best for prospects with whom rapport was already established. Use sparingly. "I promise this is my last email before I start sending carrier pigeons."

## Timing Suggestion

Based on the prospect's engagement history, recommend:
- **Best day**: Analyze when they previously responded (Tuesday-Thursday typically best)
- **Best time**: Morning (8-10am) or late afternoon (4-5pm) in their timezone
- **Wait period**: If last contact was less than 5 days ago, suggest waiting. Do not chase too soon -- it signals desperation.
- **Rationale**: Brief explanation of why this timing was chosen

## Quality Checklist

Before returning results, verify:
- [ ] Email references specific context from the last conversation (not generic)
- [ ] Email adds genuine value (not just "checking in")
- [ ] Subject line is under 50 characters and non-pushy
- [ ] Body is 80-120 words (not a wall of text)
- [ ] CTA is low-friction (easy to say yes to)
- [ ] Tone matches the selected variation or defaults to warm
- [ ] No guilt-tripping, no desperation signals, no passive aggression
- [ ] Today's date context is included: use `new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })` for any date references

## Error Handling

### No recent activity found
Generate a general re-engagement email without specific references. Note: "No conversation history found. Email is general-purpose. Provide deal_id or contact_id for personalized chase."

### Contact went dark very recently (< 3 days)
Advise waiting: "Last contact was [X days] ago. Recommend waiting at least 5 business days before chasing to avoid appearing pushy."

### Multiple contacts on a deal
Choose the primary contact (champion or last person engaged). If unclear, note the options and let the rep decide.

## Output Contract

Return a SkillResult with:
- `data.email_subject`: string (subject line, under 50 characters)
- `data.email_body`: string (full email body, 80-120 words, with greeting and sign-off)
- `data.timing_suggestion`: object with { best_day, best_time, timezone, wait_until, rationale }
- `data.context_used`: object with { last_contact_date, days_since_contact, last_topic, contact_name }
