# post-meeting-followup-drafter

> This reference is auto-populated from `skills/atomic/post-meeting-followup-drafter/SKILL.md`.
> Do not edit directly — edit the source skill and re-sync.


# Post-Meeting Follow-up Drafter

## Goal
Generate professional follow-up communications (email + Slack) that recap meeting value and drive next steps.

## Required Capabilities
- **Email**: To draft and send follow-up emails
- **Messaging**: To post internal Slack updates

## Inputs
- `meeting_digest`: Output from meeting-digest-truth-extractor
- `meeting_id`: Meeting identifier
- `organization_id`: Current organization context

## Data Gathering (via execute_action)
1. Fetch meeting details: `execute_action("get_meetings", { meeting_id })`
2. Fetch contact details: `execute_action("get_contact", { id: contact_id })`
3. Fetch deal context: `execute_action("get_deal", { id: deal_id })`

## Output Contract
Return a SkillResult with:
- `data.email_draft`: Email draft object:
  - `subject`: Subject line (with variants)
  - `body`: Email body (structured sections)
  - `to`: Recipient email(s)
  - `cc`: CC recipients (if any)
  - `sections`: Array of sections:
    - `type`: "recap" | "value" | "decisions" | "next_steps" | "cta"
    - `content`: Section content
    - `quotes`: Relevant quotes from meeting
- `data.slack_update`: Internal Slack update object:
  - `channel`: Suggested channel
  - `message`: Slack-formatted message
  - `thread_ts`: Optional thread timestamp
- `data.subject_lines`: Array of subject line options
- `data.cta`: Clear call-to-action for the email
- `data.approval_required`: true (always require approval for sending)

## Structure Requirements
1. **Recap**: Brief summary of what was discussed
2. **Value**: What value was delivered/created in the meeting
3. **Decisions**: Key decisions made (with quotes if available)
4. **Next Steps**: Clear action items with owners and deadlines
5. **CTA**: Specific next action requested

## Guidelines
- Use organization brand_tone and writing_style
- Include "what we heard" quotes from transcript
- Avoid risky claims (use organization words_to_avoid list)
- Make CTAs specific and time-bound
- Generate both short and long email variants
- Always require approval before sending (approval-gated)
