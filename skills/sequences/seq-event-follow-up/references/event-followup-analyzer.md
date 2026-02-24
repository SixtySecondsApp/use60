# event-followup-analyzer

> This reference is auto-populated from `skills/atomic/event-followup-analyzer/SKILL.md`.
> Do not edit directly — edit the source skill and re-sync.


# Event Follow-Up Analyzer

## Goal
Analyze event attendees to identify warm leads and generate personalized follow-up recommendations.

## Inputs
- `contacts`: List of contacts who attended the event
- `event_context`: Details about the event (name, date, topic)

## Output Contract
Return a SkillResult with:
- `data.priority_leads`: array of top leads to follow up with
  - `contact_id`: string
  - `name`: string
  - `company`: string | null
  - `priority`: "hot" | "warm" | "nurture"
  - `reason`: string (why they're a priority)
  - `engagement_signals`: string[] (questions asked, booth visited, etc.)
- `data.followup_recommendations`: array of recommended actions
  - `contact_id`: string
  - `action_type`: "email" | "call" | "linkedin" | "meeting"
  - `timing`: "today" | "this_week" | "next_week"
  - `suggested_message`: string
- `data.email_drafts`: array of draft emails for top leads
  - `to`: string (contact email)
  - `subject`: string
  - `body`: string
  - `contact_id`: string

## Guidance
- Prioritize leads who asked questions or showed strong engagement
- Personalize follow-ups based on their role and event participation
- Suggest timely actions (strike while iron is hot)
- Include specific references to the event in email drafts
