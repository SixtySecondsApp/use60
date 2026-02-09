---
name: Meeting Digest Truth Extractor
description: |
  Extract decisions, commitments, risks, stakeholders, and MEDDICC updates from meeting transcripts.
  Use when a user asks "summarize my meeting", "what was decided in the call", "extract action items
  from the meeting", or needs a structured digest of what happened. Enforces truth hierarchy
  (CRM > transcript > notes) and returns structured, actionable output.
metadata:
  author: sixty-ai
  version: "2"
  category: sales-ai
  skill_type: atomic
  is_active: true
  triggers:
    - pattern: "summarize my meeting"
      intent: "meeting_summary"
      confidence: 0.85
      examples:
        - "summarize the meeting"
        - "what happened in the meeting"
        - "meeting summary"
    - pattern: "what was decided in the call"
      intent: "meeting_decisions"
      confidence: 0.85
      examples:
        - "what decisions were made"
        - "meeting decisions and commitments"
        - "key takeaways from the call"
    - pattern: "extract action items from the meeting"
      intent: "meeting_actions"
      confidence: 0.80
      examples:
        - "action items from the meeting"
        - "meeting next steps"
        - "what did we commit to"
    - pattern: "meeting digest"
      intent: "meeting_digest"
      confidence: 0.85
      examples:
        - "create a meeting digest"
        - "digest from my last call"
        - "post-meeting digest"
  keywords:
    - "meeting"
    - "digest"
    - "summary"
    - "decisions"
    - "commitments"
    - "action items"
    - "transcript"
    - "call"
    - "MEDDICC"
    - "next steps"
  required_context:
    - meeting_id
    - transcript_id
  inputs:
    - name: meeting_id
      type: string
      description: "The meeting identifier to extract a digest from"
      required: true
    - name: contact_id
      type: string
      description: "Primary contact associated with the meeting for CRM enrichment"
      required: false
    - name: include_transcript
      type: boolean
      description: "Whether to fetch and analyze the full transcript"
      required: false
      default: true
  outputs:
    - name: decisions
      type: array
      description: "Decisions made during the meeting with decision maker, confidence, and source"
    - name: commitments
      type: array
      description: "Commitments made with owner, deadline, status, and missing info"
    - name: meddicc_deltas
      type: object
      description: "Changes to MEDDICC fields (metrics, economic buyer, criteria, process, pain, champion, competition)"
    - name: risks
      type: array
      description: "Identified risks with severity and suggested mitigations"
    - name: stakeholders
      type: array
      description: "Stakeholders mentioned with role, influence level, and sentiment"
    - name: unknowns
      type: array
      description: "Questions and unknowns that need follow-up"
    - name: next_steps
      type: array
      description: "Recommended next steps with owners and deadlines"
  requires_capabilities:
    - meetings
    - crm
  priority: critical
  tags:
    - sales-ai
    - meetings
    - transcript
    - meddicc
    - post-meeting
---

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
