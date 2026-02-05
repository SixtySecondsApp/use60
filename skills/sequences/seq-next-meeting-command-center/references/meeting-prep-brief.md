# meeting-prep-brief

> This reference is auto-populated from `skills/atomic/meeting-prep-brief/SKILL.md`.
> Do not edit directly — edit the source skill and re-sync.


# Meeting Prep Brief

## Goal
Generate a comprehensive pre-meeting brief that helps sales reps prepare effectively.

## Required Capabilities
- **Calendar**: To fetch meeting details, attendees, and context
- **CRM**: To pull related deals, contacts, and company information
- **Transcript** (optional): To reference previous meeting notes

## Inputs
- `meeting_id` or `event_id`: The calendar event identifier
- `organization_id`: Current organization context

## Data Gathering (via execute_action)
1. Fetch meeting details: `execute_action("get_meetings", { meeting_id })`
2. Fetch primary contact (preferred): `execute_action("get_contact", { id: primary_contact_id })`
3. Fetch related deals (best-effort): `execute_action("get_deal", { name: company_or_deal_name })`
4. Fetch company status: `execute_action("get_company_status", { company_name })`
5. (Optional) Search for previous meeting transcripts if transcript capability available

## Output Contract
Return a SkillResult with:
- `data.brief`: Structured brief object with:
  - `meeting_title`: Meeting subject/title
  - `attendees`: Array of attendee objects (name, email, role, company)
  - `meeting_goals`: Primary objectives for this meeting
  - `context_summary`: Key context from CRM (deal stage, recent activity, relationship health)
  - `agenda`: Suggested agenda items
  - `talking_points`: Key points to cover (aligned to deal stage and company needs)
  - `questions`: Strategic questions to ask
  - `risks`: Potential risks or objections to prepare for
  - `success_criteria`: What "good" looks like for this meeting
- `data.context_summary`: High-level summary of relationship/deal context
- `references`: Links to related CRM records, previous meetings, etc.

## Guidelines
- Use organization context (company_name, brand_tone, products) to personalize talking points
- Reference deal stage to suggest appropriate next steps
- Flag any red flags or risks from CRM data
- Keep brief concise but actionable (aim for 1-page summary)
