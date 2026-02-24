---
name: LinkedIn Connect Reminder
description: |
  Create a LinkedIn connection reminder task with the contact's LinkedIn profile URL and AI-generated
  personalized connection message. Use when a user asks "connect on LinkedIn", "add them on LinkedIn",
  "send LinkedIn request", or wants to send a connection to a prospect. Returns LinkedIn URL, suggested
  message, and task reminder.
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
    - pattern: "connect on LinkedIn"
      intent: "linkedin_connect"
      confidence: 0.90
      examples:
        - "connect with them on LinkedIn"
        - "LinkedIn connect with Sarah"
        - "send a LinkedIn connection"
    - pattern: "add them on LinkedIn"
      intent: "linkedin_add"
      confidence: 0.85
      examples:
        - "add her on LinkedIn"
        - "add him to my LinkedIn network"
        - "LinkedIn add this contact"
    - pattern: "send LinkedIn request"
      intent: "linkedin_request"
      confidence: 0.80
      examples:
        - "send a LinkedIn connection request"
        - "LinkedIn request to John"
        - "request LinkedIn connection"
  keywords:
    - "linkedin"
    - "connect"
    - "connection"
    - "add"
    - "request"
    - "network"
    - "social"
  required_context:
    - contact
    - company_name
  inputs:
    - name: contact_id
      type: string
      description: "The contact identifier to connect with on LinkedIn"
      required: true
    - name: context
      type: string
      description: "Additional context for why to connect (e.g., after meeting, mutual connection, event)"
      required: false
  outputs:
    - name: linkedin_url
      type: string
      description: "LinkedIn profile URL for the contact"
    - name: connection_message
      type: string
      description: "Personalized LinkedIn connection message (under 300 chars)"
    - name: why_connect
      type: string
      description: "Brief explanation of why connecting now makes sense"
    - name: task
      type: object
      description: "Task reminder with LinkedIn URL and suggested message"
  priority: medium
  requires_capabilities:
    - crm
    - tasks
---

## Available Context & Tools
@_platform-references/org-variables.md
@_platform-references/capabilities.md

# LinkedIn Connect Reminder

## Goal
Generate a personalized LinkedIn connection request reminder with the contact's LinkedIn profile URL and an AI-crafted connection message that is professional, contextual, and under LinkedIn's 300-character limit. This skill creates a task reminder so the rep can execute the connection at the optimal time with a ready-to-send message.

## Why LinkedIn Connection Timing Matters

LinkedIn connections are most effective when they are timely and contextual. The data:

- **Within 24 hours of a meeting**: Connection acceptance rate is 73% vs. 28% when sent a week later (LinkedIn Sales Navigator data, 2023).
- **Personalized messages increase acceptance by 42%** compared to no message or generic "I'd like to add you to my professional network" (Hootsuite social selling study).
- **The 300-character limit is strict.** Messages longer than 300 characters are rejected by LinkedIn. Concise, valuable messages win.
- **Timing context matters.** "Great meeting you yesterday" is stronger than "I found you on LinkedIn." Connection requests that reference a specific shared context (meeting, event, mutual connection, shared interest) have 3x higher acceptance rates.
- **Follow-through increases deal velocity.** Contacts who accept LinkedIn connections engage in 2.1x more deal activities over the next 60 days compared to those not connected (Gong correlation study).

## Required Capabilities
- **CRM**: To fetch contact data including LinkedIn URL, name, title, company, recent interactions
- **Tasks**: To create the reminder task with the LinkedIn URL and suggested message

## Inputs
- `contact_id`: The contact identifier (required)
- `context`: Additional context for why to connect now (optional) -- e.g., "after our demo yesterday", "met at SaaStr conference", "referred by John Smith"

## Data Gathering (via execute_action)

1. **Fetch contact**: `execute_action("get_contact", { id: contact_id })` -- get name, title, company, LinkedIn URL
2. **Fetch recent activities with contact**: `execute_action("list_activities", { contact_id, limit: 5 })` -- look for recent meetings, emails, calls to inform the "why now" and personalize the message
3. **Fetch deal context if available**: `execute_action("list_deals", { contact_id })` -- if the contact is on an active deal, use that context

If LinkedIn URL is missing from the contact record, note this and recommend finding it manually: "LinkedIn URL not found in CRM. Recommend searching LinkedIn for [First Name Last Name] at [Company] and updating the contact record."

## Connection Message Generation Framework

LinkedIn connection messages must be:
- **Under 300 characters** (strict limit)
- **Personalized** (reference specific context, not generic)
- **Low-pressure** (not salesy, not pushy)
- **Value-oriented** (what they gain, not what you want)

### Message Templates by Context

**After a meeting (most common):**
```
Hi [First Name], great meeting you [today/yesterday]! I'd love to stay connected and keep the conversation going on [topic discussed]. Looking forward to our next steps.
```

**After a demo:**
```
Hi [First Name], thanks for your time on the demo today. I'd love to connect and share any resources that might be helpful as you evaluate [solution category].
```

**Event or conference:**
```
Hi [First Name], nice meeting you at [event name]! I'd love to stay connected and continue the conversation about [topic]. Hope you enjoyed the rest of the event!
```

**Mutual connection:**
```
Hi [First Name], [Mutual Connection] suggested we connect. I work with [company type/industry] teams on [problem area] and thought it would be great to stay in touch.
```

**Cold outreach (use sparingly):**
```
Hi [First Name], I work with [company type] leaders on [specific problem]. Thought it would be valuable to connect given your work at [Company] in [area]. No pressure!
```

**Post-call or post-email:**
```
Hi [First Name], thanks for taking my call [today/this week]. I'd love to connect here and share any helpful resources as you think through [problem/initiative].
```

### Tone Rules
- Use first name only (never "Mr./Ms. Last Name")
- Keep it conversational, not formal
- Reference a specific shared experience ("great meeting you yesterday" not "I saw your profile")
- End with low-pressure forward-looking statement ("looking forward to staying in touch" not "I need to talk to you about...")
- Avoid sales language ("explore opportunities", "discuss solutions") -- this is relationship-building, not pitching

## Why Connect Now (Reasoning)

In addition to the connection message, generate a brief rationale for WHY connecting now makes sense. This is for internal reference (not sent to the contact) and helps the rep understand the strategic timing.

Examples:
- "You just had a productive demo with Sarah. Connecting within 24 hours keeps momentum and signals follow-through."
- "The deal is moving to evaluation stage. Connecting now expands your reach into the account beyond just the champion."
- "Sarah mentioned she follows industry news on LinkedIn. Connecting gives you a channel to share relevant insights beyond email."
- "You met Sarah at the SaaStr conference yesterday. Conference connections should happen within 48 hours while the context is fresh."

## Task Creation

Create a task reminder with:
- **Title**: "Send LinkedIn connection to [First Name Last Name]"
- **Description**: Include the LinkedIn URL (clickable), the suggested connection message (ready to copy-paste), and the "why connect now" reasoning.
- **Due date**:
  - If connected to a recent meeting (within 24 hours): set due date to today or tomorrow
  - If connected to an event: set due date within 2 days
  - Otherwise: set due date to tomorrow
- **Priority**: medium (important for relationship-building, but not urgent like a deal-closing task)
- **Contact ID**: link to the contact

### Task Description Format
```
LinkedIn Profile: [LinkedIn URL]

Suggested connection message (ready to copy):
---
[Generated message]
---
(Message length: [X]/300 characters)

Why connect now:
[Reasoning]

Tip: Personalize the message if needed, but keep it under 300 characters.
```

## Output Contract

Return a SkillResult with:
- `data.linkedin_url`: string (LinkedIn profile URL from contact record, or null if missing)
- `data.connection_message`: string (personalized message, 250-299 characters -- leave room for minor edits)
- `data.why_connect`: string (brief reasoning for why connecting now is strategically valuable)
- `data.task`: object
  - `title`: string
  - `description`: string (formatted with URL, message, and reasoning)
  - `due_date`: string (ISO date)
  - `priority`: "medium"
  - `contact_id`: string

## Quality Checklist

Before returning the LinkedIn connection reminder, verify:

- [ ] Connection message is under 300 characters (verify exact count)
- [ ] Message references SPECIFIC context (meeting, event, shared topic) not generic "I'd like to connect"
- [ ] Message uses first name only, not full name or title
- [ ] Message tone is friendly and low-pressure, not salesy
- [ ] LinkedIn URL is included (or clearly noted as missing)
- [ ] Task description includes the full formatted content with URL, message, and reasoning
- [ ] Due date reflects urgency (recent meeting = today/tomorrow, event = within 2 days)
- [ ] "Why connect now" reasoning is specific to this contact's situation, not generic
- [ ] If LinkedIn URL is missing, clear instructions are provided for how to find it
- [ ] Message is ready to copy-paste (no placeholders like [your name] or [company])

## Examples

### Good Connection Message (Post-Meeting)
```
Hi Sarah, great meeting you yesterday! I'd love to stay connected and share any resources that might help as you evaluate data platforms. Looking forward to our next steps.
```
Character count: 183. Why it works: Specific timing ("yesterday"), references the evaluation context, forward-looking and low-pressure.

### Bad Connection Message
```
Hi Sarah Chen, it was wonderful to make your acquaintance. I would be honored if you would accept my invitation to connect on this professional networking platform. I look forward to exploring potential opportunities for collaboration between our organizations.
```
Character count: 284. Why it fails: Overly formal ("wonderful to make your acquaintance"), generic ("this professional networking platform"), salesy ("exploring potential opportunities"), sounds like a template.

### Good Why Connect Now
```
You just completed a successful demo with Sarah yesterday (Feb 15). She mentioned she follows industry trends on LinkedIn. Connecting within 24 hours keeps momentum, signals follow-through, and opens a channel to share relevant insights beyond email.
```

### Bad Why Connect Now
```
It's good to connect with prospects on LinkedIn.
```
Why it fails: Generic, no specific reasoning, no strategic value explained.

### Good Task Description
```
LinkedIn Profile: https://www.linkedin.com/in/sarahchen

Suggested connection message (ready to copy):
---
Hi Sarah, great meeting you yesterday! I'd love to stay connected and share any resources that might help as you evaluate data platforms. Looking forward to our next steps.
---
(Message length: 183/300 characters)

Why connect now:
You just completed a successful demo with Sarah yesterday. Connecting within 24 hours keeps momentum and signals follow-through.

Tip: Personalize the message if needed, but keep it under 300 characters.
```

## Error Handling

### LinkedIn URL is missing from contact record
If the contact does not have a LinkedIn URL, include this in the output:
- `linkedin_url`: null
- In the task description, add: "LinkedIn URL not found in CRM. Action: Search LinkedIn for 'Sarah Chen [Company Name]' and update the contact record with the profile URL before sending the connection."

### No recent activity with contact
If there is no recent meeting, email, or call to reference, use a softer connection approach:
- Message template: "Hi [First Name], I've been following [Company]'s work in [industry/area]. I'd love to connect and stay in touch. Looking forward to it!"
- Why connect now: "No recent interaction, but connecting now positions you for future engagement when the timing is right."

### Contact's title or company is missing
If the contact record is incomplete (no title, no company), note this in the output and recommend data enrichment before sending the connection: "Contact data is incomplete. Recommend updating the contact record with title and company before sending LinkedIn connection."

### Character count exceeds 300
If the generated message is over 300 characters, trim it by:
1. Removing filler words ("I'd love to", "Looking forward to")
2. Shortening phrases ("great talking to you" → "great talking")
3. Removing the closing statement if necessary
Then verify the count is under 300 before returning.

### Multiple recent interactions
If the contact has multiple recent interactions (e.g., email yesterday and meeting last week), reference the MOST RECENT one: "Thanks for the follow-up email today" not "Great meeting you last week."

### Contact is already connected on LinkedIn
If the activity notes or contact record indicate the contact is already connected, change the skill output to acknowledge this: "Already connected with [Name] on LinkedIn. Consider engaging with their recent posts or sending a direct message to stay top-of-mind."

## Tone and Presentation

- Keep it simple. Connection messages should feel effortless, not crafted.
- Be specific about timing. "Yesterday" is better than "recently."
- Reference shared experience, not your product. The connection message is not a pitch.
- Low-pressure always. "No pressure" or "Looking forward to staying in touch" signals this is relationship-building, not a sales push.
- If the LinkedIn URL is missing, be direct: "Find the LinkedIn URL and update the CRM before sending the connection."
