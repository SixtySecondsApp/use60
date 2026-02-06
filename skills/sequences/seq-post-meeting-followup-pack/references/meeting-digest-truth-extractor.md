# meeting-digest-truth-extractor

> This reference is auto-populated from `skills/atomic/meeting-digest-truth-extractor/SKILL.md`.
> Do not edit directly — edit the source skill and re-sync.


# Meeting Digest Truth Extractor

## Goal
Extract structured, actionable truth from meeting transcripts with strict contract output.

## Required Capabilities
- **Transcript**: To access meeting transcript/recording
- **CRM**: To validate and enrich extracted data against CRM records

## Inputs
- `meeting_id`: The meeting identifier
- `transcript_id` or `transcript`: Transcript content or reference
- `organization_id`: Current organization context

## Data Gathering (via execute_action)
1. Fetch transcript: Use transcript capability to get full transcript
2. Fetch related CRM data: `execute_action("get_deal", { id: deal_id })`
3. Fetch contact details: `execute_action("get_contact", { id: contact_id })`
4. Fetch company info: `execute_action("get_company_status", { company_name })`

## Truth Hierarchy (enforced)
1. **CRM data** (highest priority): If CRM says deal stage is "negotiation", trust that over transcript mentions
2. **Transcript** (medium priority): Explicit statements in transcript
3. **User notes** (lowest priority): Only if no CRM/transcript data

## Output Contract
Return a SkillResult with:
- `data.decisions`: Array of decision objects:
  - `decision`: What was decided
  - `decision_maker`: Who made it
  - `confidence`: High/Medium/Low
  - `source`: "crm" | "transcript" | "inferred"
- `data.commitments`: Array of commitment objects:
  - `commitment`: What was committed to
  - `owner`: Who committed (name, email)
  - `deadline`: When (if mentioned)
  - `status`: "explicit" | "implied"
  - `missing_info`: What info is missing (owner, deadline, etc.)
- `data.meddicc_deltas`: Object with MEDDICC field changes:
  - `metrics`: Changes to success metrics
  - `economic_buyer`: Changes to decision maker
  - `decision_criteria`: Changes to evaluation criteria
  - `decision_process`: Changes to process/timeline
  - `identify_pain`: New pain points identified
  - `champion`: Champion status changes
  - `competition`: Competitive mentions
- `data.risks`: Array of risk objects:
  - `risk`: Description of risk
  - `severity`: High/Medium/Low
  - `mitigation`: Suggested mitigation
- `data.stakeholders`: Array of stakeholder objects:
  - `name`: Stakeholder name
  - `role`: Their role/title
  - `influence`: High/Medium/Low
  - `sentiment`: Positive/Neutral/Negative
- `data.unknowns`: Array of questions/unknowns that need follow-up
- `data.next_steps`: Array of recommended next steps with owners and deadlines
- `references`: Links to transcript, CRM records, etc.

## Guidelines
- De-duplicate contradictions using truth hierarchy
- Flag missing information (e.g., commitment without owner)
- Extract explicit quotes for "what we heard" sections
- Be conservative: if uncertain, mark confidence as Low
