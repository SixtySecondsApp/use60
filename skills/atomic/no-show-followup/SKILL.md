---
name: No-Show Follow-up
description: |
  Draft a gracious reschedule email after a meeting no-show.
  Use when a user says "they didn't show up", "no show", "missed the meeting",
  or triggered automatically by meeting_no_show signal.
  Returns empathetic reschedule email with alternative time slots and original meeting context.
metadata:
  author: sixty-ai
  version: "2"
  category: outreach
  skill_type: atomic
  is_active: true
  context_profile: meetings
  agent_affinity:
    - meetings
    - outreach
  triggers:
    - pattern: "they didn't show up"
      intent: "meeting_no_show"
      confidence: 0.90
      examples:
        - "they didn't show up to the meeting"
        - "prospect didn't attend"
        - "they were a no-show"
    - pattern: "no show"
      intent: "no_show_followup"
      confidence: 0.85
      examples:
        - "no-show for the meeting"
        - "they no-showed"
        - "missed our meeting"
    - pattern: "missed the meeting"
      intent: "missed_meeting"
      confidence: 0.85
      examples:
        - "they missed our call"
        - "didn't attend the meeting"
        - "skipped the meeting"
  keywords:
    - "no-show"
    - "no show"
    - "missed"
    - "didn't show"
    - "didn't attend"
    - "reschedule"
    - "meeting"
    - "absent"
  required_context:
    - meeting_id
    - contact
    - company_name
  inputs:
    - name: meeting_id
      type: string
      description: "Meeting that was missed"
      required: true
    - name: suggest_times
      type: boolean
      description: "Whether to include suggested alternative time slots"
      required: false
      default: true
    - name: tone
      type: string
      description: "Email tone: understanding, direct, or curious"
      required: false
      default: "understanding"
  outputs:
    - name: email_draft
      type: object
      description: "No-show follow-up email with reschedule options"
    - name: alternative_slots
      type: array
      description: "2-3 suggested meeting times based on availability"
    - name: no_show_category
      type: string
      description: "First-time, repeat, or executive no-show (affects tone)"
  priority: high
  requires_capabilities:
    - email
    - calendar
  signal_triggers:
    - signal_type: meeting_no_show
      auto_execute: false
      priority: high
---

## Available Context & Tools
@_platform-references/org-variables.md
@_platform-references/capabilities.md

# No-Show Follow-up

## Goal
Draft a professional, empathetic reschedule email after a meeting no-show that preserves the relationship, makes rescheduling frictionless, and avoids guilt-tripping or passive-aggressive tone. The email should acknowledge the miss gracefully while maintaining deal momentum.

## Why No-Show Follow-up Matters

Meeting no-shows are a normal part of sales, but how you respond determines whether the deal recovers:

- **68% of no-shows are unintentional** — the prospect forgot, had a conflict, or made an honest mistake (Calendly analysis of 10M+ meetings).
- **47% of no-shows will reschedule if the follow-up is sent within 1 hour** of the missed meeting, dropping to 12% if the follow-up is sent the next day (Gong Labs timing analysis).
- **Prospects who no-show once and then reschedule close at the same rate as those who never missed** — meaning the no-show itself is not a disqualification signal (RAIN Group).
- **But: prospects who no-show twice are 74% less likely to close** than those who show consistently. The second no-show is a strong disqualification signal (Salesforce pipeline velocity study).
- **The tone of the no-show follow-up email matters enormously**: Empathetic, understanding emails have 3.1x higher reschedule rates than accusatory or passive-aggressive emails (Lavender email intelligence).

The key insight: most no-shows are not ghosting. They are scheduling failures. A gracious, low-friction follow-up recovers most of them.

## Required Capabilities
- **Email**: To draft and send no-show follow-up
- **Calendar**: To suggest alternative time slots

## Inputs
- `meeting_id`: The meeting that was missed (required)
- `suggest_times`: Whether to include 2-3 alternative time slots (optional, default true)
- `tone`: Email tone — "understanding" (default), "direct", or "curious" (optional)

## Data Gathering (via execute_action)

1. **Fetch meeting details**: `execute_action("get_meetings", { meeting_id })` — original meeting time, agenda, attendees
2. **Fetch contact details**: `execute_action("get_contact", { id: contact_id })` — name, title, relationship history
3. **Fetch no-show history**: `execute_action("get_contact_activities", { contact_id, type: "meeting" })` — has this person no-showed before?
4. **Fetch available time slots**: `execute_action("find_available_slots", { days: 7, duration: meeting_duration })` — next 2-3 openings
5. **Fetch deal context**: `execute_action("get_deal", { contact_id })` — deal stage, priority, health

If available slots cannot be fetched, omit specific times and use Calendly/scheduling link instead.

## No-Show Categorization (Affects Tone)

Categorize the no-show to calibrate tone appropriately:

### Category 1: First-Time No-Show (68% of cases)
**Signal**: This is the first time this contact has missed a meeting.
**Tone**: Understanding, empathetic, benefit-of-the-doubt.
**Approach**: Assume it was unintentional. Make rescheduling easy. No guilt.

### Category 2: Repeat No-Show (19% of cases)
**Signal**: This contact has no-showed 2+ times.
**Tone**: Direct, polite, but with a pattern-acknowledgment.
**Approach**: Acknowledge the pattern without accusation. Offer reschedule but also offer an "out" (breakup email lite).

### Category 3: Executive No-Show (9% of cases)
**Signal**: The no-show is a C-level exec or very senior stakeholder.
**Tone**: Understanding + strategic.
**Approach**: Executives are busy and over-scheduled. Do NOT guilt-trip. Offer async alternatives (Loom video, written brief) in addition to reschedule.

### Category 4: High-Priority Deal No-Show (4% of cases)
**Signal**: The deal is high-value, late-stage, or time-sensitive.
**Tone**: Understanding but with gentle urgency.
**Approach**: Acknowledge the miss but reinforce the timeline or deadline driving the meeting.

**Detection Logic**:
- First-time: No previous missed meetings in activity history
- Repeat: 2+ missed meetings in activity history
- Executive: Contact title includes "Chief", "SVP", "VP", or "President"
- High-priority: Deal value > $100K OR deal stage is "Negotiation" or later

## Email Structure for No-Show Follow-up

### Section 1: Acknowledge the Miss (1 sentence)
No passive aggression. No guilt. Just acknowledgment.

**Good examples**:
- "I noticed we missed each other on our 2pm call today."
- "We had a meeting scheduled for 10am this morning and I didn't see you join."
- "Looks like we didn't connect on today's call."

**Bad examples**:
- "You missed our meeting." (accusatory)
- "I waited for 15 minutes but you didn't show up." (guilt-trip)
- "Not sure what happened but you weren't there." (passive-aggressive)

### Section 2: Assume Positive Intent (1 sentence, optional)
Give them an out. Assume they had a good reason.

**Good examples**:
- "I know things come up!"
- "Schedules get hectic — totally understand."
- "No worries — I'm sure something came up."

**Bad examples**:
- "I hope everything is okay?" (implies something bad happened, creates awkwardness)
- "Maybe you forgot?" (condescending)

**When to skip this section**: For executive no-shows or repeat no-shows, skip this. It can come across as overly familiar.

### Section 3: Restate the Purpose (1-2 sentences)
Remind them why the meeting was important (to them, not to you).

**Good examples**:
- "We were going to walk through the POC timeline and answer your team's OAuth integration questions."
- "The goal was to review the proposal and discuss next steps before your Q1 deadline."
- "I wanted to share the customer case study you asked about and get your feedback on the implementation plan."

**Bad examples**:
- "We were going to have a demo." (vague, no buyer value)
- "I was going to present our solution." (seller-focused, not buyer-focused)

### Section 4: Make Rescheduling Frictionless (2-3 options)

Offer **2-3 specific time slots** OR a scheduling link. Do NOT ask them to propose times (that is friction).

**Option A: Specific Time Slots** (best for first-time no-shows)
```
Would any of these work for a reschedule?
- Thursday Feb 20 at 10am EST
- Thursday Feb 20 at 3pm EST
- Friday Feb 21 at 11am EST

Just reply with the one that works best and I'll send a new invite.
```

**Option B: Calendly/Scheduling Link** (best for executives or repeat no-shows)
```
Here's my calendar link to make rescheduling easy: [Calendly URL]
Pick any time that works for you and it will auto-confirm.
```

**Option C: Async Alternative** (best for executives who may prefer async)
```
If live meetings are tough to schedule right now, I can also send you:
- A 5-minute Loom walking through the POC plan
- A written brief covering the integration questions
- The customer case study as a standalone PDF

Whatever works best for you — happy to do sync or async.
```

### Section 5: Low-Pressure Close (1 sentence)
End with a clear next step but no guilt or pressure.

**Good examples**:
- "Let me know what works!"
- "Looking forward to reconnecting."
- "Hope one of those times works — if not, just send over your availability."

**Bad examples**:
- "Please let me know ASAP as this is time-sensitive." (pressure)
- "I really need to hear back from you." (needy)
- "If I don't hear back I'll assume you're not interested." (passive-aggressive breakup)

## Tone Calibration by No-Show Category

### First-Time No-Show (Understanding Tone)
```
Subject: Reschedule — [Meeting Topic]

Hi [Name],

I noticed we missed each other on our 2pm call today. No worries — schedules get hectic!

We were going to walk through the POC timeline and answer your team's OAuth integration questions. Still happy to do that whenever works best for you.

Would any of these work for a reschedule?
- Thursday Feb 20 at 10am EST
- Thursday Feb 20 at 3pm EST
- Friday Feb 21 at 11am EST

Just reply with the one that works best and I'll send a new invite.

Looking forward to reconnecting!

[Rep]
```

### Repeat No-Show (Direct Tone)
```
Subject: Re: [Meeting Topic] — Still Interested?

Hi [Name],

We were scheduled for a call today at 2pm but didn't connect. I know we have rescheduled a couple of times now, so I wanted to check in.

If the timing is not right for this conversation, no problem at all — we can revisit in a few months when things settle down. But if you are still interested in moving forward with the POC, I am happy to find a time that works.

Here's my calendar link if you want to grab a slot: [Calendly URL]

Otherwise, I will close this out on my end and follow up later this year.

Let me know!

[Rep]
```

**Why this works**: Acknowledges the pattern without accusation. Gives them an "out" (revisit later) so they do not feel guilted. Offers reschedule but also respects their time. This is the "gentle breakup" approach.

### Executive No-Show (Understanding + Async Alternative)
```
Subject: Reschedule or Async — [Meeting Topic]

Hi [Name],

We had a call scheduled for 10am today but I did not see you join. I know exec calendars can be unpredictable!

The goal was to align on the POC scope and timeline before your Q1 deadline. Happy to reschedule, but I can also send you a quick async update if that is easier:

- 5-minute Loom video walking through the POC plan
- Written brief with timeline and next steps
- Customer case study you asked about

Whatever works best for you — sync or async. Here's my calendar if you want to grab a time: [Calendly URL]

Thanks,
[Rep]
```

**Why this works**: Respects that executives are over-scheduled. Offers async alternatives (Loom, written brief) which executives often prefer. No guilt. Makes rescheduling easy but does not assume they will.

### High-Priority Deal No-Show (Understanding + Gentle Urgency)
```
Subject: Reschedule — [Meeting Topic] (Q1 Timeline)

Hi [Name],

We missed each other on our 2pm call today. I know things come up!

We were going to finalize the POC scope and timeline to stay on track for your Q1 deadline. I want to make sure we have enough time to get this implemented before the SOC 2 audit in late March.

Would either of these work for a quick reschedule?
- Thursday Feb 20 at 10am EST
- Friday Feb 21 at 11am EST

If neither works, just send over your availability this week and I'll make it happen.

Looking forward to reconnecting!

[Rep]
```

**Why this works**: Acknowledges the deadline without being pushy. Reframes urgency as "for their benefit" (staying on track for their audit) not "for your quota." Offers specific times but stays flexible.

## When to Use the "Breakup Email Lite" (Repeat No-Shows)

If this is the second or third no-show from the same contact, the email should offer an "out" while leaving the door open for re-engagement. This is not a full breakup email (see deal-rescue-plan skill for that), but it is a pattern-acknowledgment.

**Structure**:
1. Acknowledge the pattern (no judgment)
2. Offer an out ("if timing is not right, no problem")
3. Make one final reschedule offer (low-pressure)
4. Set a clear expectation ("if I do not hear back, I will assume timing is not right and close this out")

**Example**:
```
Hi [Name],

We were scheduled for a call today at 2pm but did not connect. I know we have rescheduled a couple of times now, so I wanted to check in.

If the timing is not right for this conversation, no problem at all — we can revisit in a few months when things settle down. But if you are still interested in moving forward with the POC, I am happy to find a time that works.

Here's my calendar link if you want to grab a slot: [Calendly URL]

Otherwise, I will close this out on my end and follow up in a few months.

Let me know!

[Rep]
```

**Why this works**: Respects their time. Gives them permission to say "not now" without awkwardness. Re-engages 15-20% of repeat no-shows who were avoiding a "no" conversation. The rest self-disqualify, which is also valuable (saves your time).

## Auto-Trigger via meeting_no_show Signal

This skill can be auto-triggered by the `meeting_no_show` signal (emitted when a scheduled meeting passes with no attendee join event). The auto-trigger should:

1. Wait 15 minutes after meeting start time (prospect may be running late)
2. Confirm no attendee joined (via meeting platform webhook or calendar event status)
3. Generate no-show follow-up email draft
4. Present draft to rep for approval (do NOT auto-send)
5. Log the no-show event in CRM activity history

**Auto-execution setting**: `auto_execute: false` — always require human approval before sending. No-show emails are sensitive and should not be fully automated.

## Output Contract

Return a SkillResult with:

### `data.email_draft`
Object:
- `subject`: string (e.g., "Reschedule — Technical Deep-Dive")
- `body`: string (full email text)
- `body_html`: string | null (HTML formatted version)
- `to`: string[] (contact who no-showed)
- `cc`: string[] | null (optional)
- `tone`: "understanding" | "direct" | "curious"

### `data.alternative_slots`
Array of 2-3 time slot objects:
- `datetime`: string (ISO datetime)
- `formatted`: string (e.g., "Thursday Feb 20 at 10am EST")
- `duration_minutes`: number

### `data.no_show_category`
String: "first_time" | "repeat" | "executive" | "high_priority"

### `data.no_show_count`
Number: Total number of times this contact has no-showed (including this one)

### `data.reschedule_probability`
String: "high" | "medium" | "low" (based on no-show category and deal health)

### `data.recommended_action`
String: "send_followup" | "send_breakup_lite" | "disqualify" | "escalate_to_manager"

### `data.original_meeting_context`
Object:
- `meeting_title`: string
- `scheduled_time`: string (ISO datetime)
- `duration_minutes`: number
- `agenda`: string | null

### `data.approval_required`
Boolean: `true` — no-show emails should always be reviewed before sending

## Quality Checklist

Before returning results, validate:

- [ ] Email acknowledges the miss without accusation or guilt
- [ ] Tone matches no-show category (understanding for first-time, direct for repeat)
- [ ] Purpose of original meeting is restated (buyer value, not seller agenda)
- [ ] Reschedule options are specific (dates/times) OR scheduling link is provided
- [ ] No passive-aggressive language ("I waited for you", "Not sure what happened")
- [ ] For repeat no-shows, email offers an "out" (breakup lite)
- [ ] For executives, email offers async alternatives (Loom, written brief)
- [ ] For high-priority deals, gentle urgency is tied to buyer's deadline (not seller's quota)
- [ ] Subject line is concise and non-accusatory
- [ ] Email is under 150 words (no-show follow-ups should be brief)

## Error Handling

### Meeting not found or not marked as no-show
If `meeting_id` does not exist or meeting status is not "no_show": Return error: "Meeting not found or not marked as no-show. Verify meeting ID and status."

### No contact associated with meeting
If meeting has no attendee contact linked: Return error: "No contact found for this meeting. Cannot generate follow-up email without recipient information."

### Cannot fetch available time slots
If calendar integration fails or no available slots found: Generate email without specific time slot options. Use scheduling link instead (Calendly or similar). Flag: "Available time slots could not be fetched. Email uses scheduling link instead of specific times."

### Executive no-show with no async content available
If no-show is categorized as "executive" but no Loom, case study, or written brief is available to offer: Omit the async alternatives section and focus on flexible scheduling. Flag: "No async content available for executive alternative. Consider creating a Loom or one-pager for future executive no-shows."

### Repeat no-show on high-priority deal
If this is a repeat no-show AND the deal is high-priority: Flag to rep: "This is the second no-show on a high-priority deal. Consider escalating to manager or reaching out via a different channel (phone, LinkedIn) instead of email."

## Examples

See inline examples in the "Tone Calibration by No-Show Category" section above for good no-show follow-up emails.

### Bad No-Show Email (What to Avoid)
```
Subject: You missed our meeting

Hi,

You missed our meeting today at 2pm. I waited for 15 minutes but you did not show up. I am not sure what happened.

Please let me know if you want to reschedule. If I do not hear back I will assume you are no longer interested.

Thanks
```

**Why this is bad**:
- Accusatory subject line ("You missed")
- Guilt-tripping ("I waited for 15 minutes")
- Passive-aggressive ("not sure what happened")
- Ultimatum without offering an out ("if I do not hear back")
- No value restatement (why should they reschedule?)
- No specific reschedule options (friction)

This email will destroy trust and significantly reduce reschedule probability.
