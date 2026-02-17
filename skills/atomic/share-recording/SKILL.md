---
name: Share Recording
description: |
  Package meeting recording link and transcript summary into a shareable email.
  Use when a user asks "share the recording", "send them the transcript",
  "share meeting recording", or needs to distribute recording access to participants.
  Returns professional email with recording link, key highlights, and access instructions.
metadata:
  author: sixty-ai
  version: "2"
  category: meetings
  skill_type: atomic
  is_active: true
  context_profile: meetings
  agent_affinity:
    - meetings
    - outreach
  triggers:
    - pattern: "share the recording"
      intent: "share_meeting_recording"
      confidence: 0.90
      examples:
        - "share recording from the meeting"
        - "send them the recording link"
        - "can you share the recording"
    - pattern: "send them the transcript"
      intent: "share_transcript"
      confidence: 0.85
      examples:
        - "send transcript to the team"
        - "share the transcript with them"
        - "email the transcript"
    - pattern: "share meeting recording"
      intent: "recording_distribution"
      confidence: 0.85
      examples:
        - "distribute the recording"
        - "send recording to attendees"
        - "give them access to the recording"
  keywords:
    - "share"
    - "recording"
    - "transcript"
    - "send"
    - "video"
    - "meeting"
    - "distribute"
    - "link"
  required_context:
    - meeting_id
    - company_name
  inputs:
    - name: meeting_id
      type: string
      description: "Meeting identifier to fetch recording from"
      required: false
    - name: recipient_emails
      type: array
      description: "Email addresses of recipients"
      required: false
    - name: include_highlights
      type: boolean
      description: "Whether to include transcript highlights in email"
      required: false
      default: true
  outputs:
    - name: email_draft
      type: object
      description: "Email with recording link, access instructions, and optional highlights"
    - name: recording_url
      type: string
      description: "Direct link to recording"
    - name: transcript_summary
      type: string
      description: "Key highlights from transcript"
  priority: medium
  requires_capabilities:
    - email
    - meetings
---

## Available Context & Tools
@_platform-references/org-variables.md
@_platform-references/capabilities.md

# Share Recording

## Goal
Package a meeting recording and transcript into a professional, shareable email that makes it easy for recipients to access the recording, understand what was discussed, and quickly identify relevant sections without watching the entire video.

## Why Recording Sharing Matters

Meeting recordings are high-value assets but often underutilized:

- **73% of meeting participants say they would watch a recording if it came with a summary** highlighting relevant sections (Zoom User Research, 2024).
- **Average 60-minute meeting recording is watched for only 8 minutes** when shared without context (Chorus.ai usage analytics).
- **Recordings shared within 4 hours of meeting end have 5.7x higher view rates** than recordings shared days later (Gong Labs).
- **Internal team members are 3.2x more likely to act on meeting outcomes** when they can watch the recording vs. reading a text summary alone (Salesforce internal research).
- **Buyers who receive recording links + highlights engage 2.1x more in follow-up discussions** compared to those who receive only text recaps (Lavender email intelligence).

The key insight: recordings are powerful when packaged with context. A raw link with no summary sits ignored in inboxes.

## Required Capabilities
- **Meetings**: To fetch recording URL, transcript, and meeting metadata
- **Email**: To draft and send recording-sharing email

## Inputs
- `meeting_id`: Meeting identifier (required, or use most recent meeting if omitted)
- `recipient_emails`: Array of recipient email addresses (optional, defaults to meeting attendees)
- `include_highlights`: Boolean flag for including transcript highlights (optional, default true)

## Data Gathering (via execute_action)

1. **Fetch meeting details**: `execute_action("get_meetings", { meeting_id })` — get title, date, attendees, recording_url
2. **Fetch recording metadata**: `execute_action("get_recording", { meeting_id })` — recording duration, file size, expiry date
3. **Fetch transcript**: `execute_action("get_transcript", { meeting_id })` — full transcript or summary
4. **Fetch contact details**: `execute_action("get_contact", { id: contact_id })` for each recipient

If recording URL is not available, return error: "Recording not found for this meeting. Please verify the meeting has been recorded and processing is complete."

## Email Structure for Recording Sharing

### Section 1: Context + Purpose (1-2 sentences)
Remind recipients what meeting this was and why they should watch.

**Good example**: "Here's the recording from our technical deep-dive with Acme yesterday. Sarah and her engineering team walked through their OAuth requirements and integration timeline."

**Bad example**: "Please find the recording attached below."

### Section 2: Recording Access Instructions (2-3 lines)
Clear instructions for accessing the recording, including any required authentication or permissions.

**Format**:
```
Recording link: [URL]
Duration: [X minutes]
Expires: [Date] (if applicable)
```

### Section 3: Key Highlights (3-5 bullet points)
If `include_highlights: true`, extract the most important moments from the transcript. Use timestamps to make the recording scannable.

**Good example**:
```
Key moments:
- [03:45] Sarah outlines SOC 2 compliance deadline (Q3) as non-negotiable
- [12:20] Engineering team raises OAuth integration concerns
- [28:15] Budget approval process explained (VP Eng sign-off required)
- [41:30] Competitor comparison discussion
- [52:00] Next steps and POC scope agreed
```

**Bad example**:
```
Topics covered:
- We discussed compliance
- Integration was mentioned
- Budget came up
- Next steps
```

### Section 4: Call-to-Action (1 sentence)
What should recipients do after watching?

**Examples**:
- "Review the OAuth discussion at 12:20 and let me know if you have technical concerns."
- "Watch the competitor comparison section (41:30) before our strategy call tomorrow."
- "No action needed — sharing for your awareness."

## Highlight Generation Methodology

If transcript is available, extract highlights using this framework:

### Priority 1: Decision Moments (highest value)
Any moment where a decision was made, a commitment was given, or a concrete next step was agreed.
- Example: "[28:00] Agreed to proceed with POC starting Feb 20"

### Priority 2: Objections or Concerns
Any moment where a concern, risk, blocker, or objection was raised.
- Example: "[15:30] Sarah flagged security review as potential blocker"

### Priority 3: Key Information Revealed
New information about budget, timeline, stakeholders, competitors, requirements.
- Example: "[09:15] Revealed they're also evaluating Competitor X"

### Priority 4: High-Emotion Moments
Enthusiasm, frustration, urgency — these signal what matters most to the buyer.
- Example: "[22:45] Engineering team expressed strong enthusiasm for automation capabilities"

### Priority 5: Action Items
Any task assigned to anyone during the meeting.
- Example: "[44:00] Sarah to share API credentials by Friday"

**Timestamp Format**: Use `[MM:SS]` format for videos under 60 minutes, `[HH:MM:SS]` for longer recordings.

**Limit to 5 highlights**: More than 5 and recipients will not read them.

## Email Tone Calibration

### For external recipients (customers, prospects):
- **Tone**: Professional, helpful, value-focused
- **Focus**: Business outcomes and decisions, not internal play-by-play
- **Include**: Only highlights relevant to the recipient's role

### For internal recipients (sales team, managers):
- **Tone**: Tactical, candid, complete
- **Focus**: Deal signals, risks, competitor mentions, buyer dynamics
- **Include**: All highlights including sensitive information (budget, concerns, internal politics)

## Multi-Recipient Considerations

If the email is going to multiple recipients with different roles:
1. **Group highlights by relevance**: "[For Engineering] OAuth discussion at 12:20..." and "[For Procurement] Budget approval process at 28:15..."
2. **Use individual emails for sensitive content**: If some highlights are confidential, send separate emails rather than diluting the content
3. **Default to the lowest common denominator for access**: If some recipients need special permissions for the recording, note this explicitly

## Recording Access Troubleshooting

Include troubleshooting information if the recording platform has common access issues:

**For Zoom**:
- "If the link asks for a password, use: [password]"
- "You may need to sign in with the email address you used in the meeting"

**For 60 Notetaker (MeetingBaaS)**:
- "This recording is hosted securely. Click the link to view — no account required"
- "Recording includes video, audio, and searchable transcript"

**For Fathom**:
- "Open the link to view recording and AI-generated summary"
- "You can jump to specific topics using the sidebar"

## Output Contract

Return a SkillResult with:

### `data.email_draft`
Object:
- `subject`: string (e.g., "Recording: Acme Technical Deep-Dive — Feb 12")
- `body`: string (full email text)
- `body_html`: string | null (HTML formatted version)
- `to`: string[] (recipient email addresses)
- `recording_url`: string (embedded in body, also returned separately)
- `sections`: array of section objects:
  - `type`: "context" | "access" | "highlights" | "cta"
  - `content`: string
  - `timestamps`: array | null (timestamp objects for highlights section)

### `data.recording_url`
String: Direct link to the recording

### `data.recording_metadata`
Object:
- `duration_minutes`: number
- `recording_date`: string (ISO date)
- `file_size_mb`: number | null
- `expires_at`: string | null (ISO date if recording has expiry)
- `platform`: "zoom" | "fathom" | "meetingbaas" | "other"

### `data.transcript_summary`
String: Plain-text summary of key highlights (without timestamps, for non-email uses)

### `data.highlights`
Array of highlight objects:
- `timestamp`: string (e.g., "12:20")
- `timestamp_seconds`: number (for programmatic seeking)
- `description`: string
- `category`: "decision" | "concern" | "information" | "emotion" | "action_item"
- `speaker`: string | null

### `data.approval_required`
Boolean: `true` — recording emails should always be reviewed before sending

## Quality Checklist

Before returning results, validate:

- [ ] Recording URL is valid and accessible
- [ ] Highlights include timestamps in consistent format
- [ ] At least 3 highlights included (if transcript available)
- [ ] No more than 5 highlights (scannable limit)
- [ ] Each highlight is specific, not vague ("discussed X" → "Sarah raised concern about X at 12:20")
- [ ] CTA is clear and actionable
- [ ] Email subject includes meeting name/company and date
- [ ] Access instructions are clear (password, permissions, expiry)
- [ ] Tone matches recipient audience (external vs internal)
- [ ] No sensitive information in external emails (budget, internal politics, competitive intel)

## Error Handling

### Recording not yet available
If meeting exists but recording is still processing: "Recording is still being processed. I'll notify you when it's ready (usually within 15 minutes of meeting end)."

### Recording expired or deleted
If recording URL exists but is no longer accessible: "This recording has expired or been deleted. Check your recording retention settings or contact support."

### No transcript available
If recording exists but transcript is not available: Generate email without the highlights section. Use Section 3 as "What Was Discussed" with 2-3 sentence summary instead of timestamped highlights.

### Multiple recordings for same meeting
If the meeting has multiple recording sources (e.g., both Zoom and Fathom recorded): Return the highest-quality recording (priority order: MeetingBaaS → Fathom → Zoom) and note in the email: "This meeting was recorded on multiple platforms. This link provides the full video and transcript."

### Recipient not a meeting attendee
If `recipient_emails` includes someone who was not in the meeting, add a context sentence: "I'm sharing this recording with you even though you couldn't attend. Here's the context: [brief 1-sentence summary]."

## Examples

### Good Recording-Sharing Email (External)
```
Subject: Recording: Acme Technical Deep-Dive — Feb 12

Hi Sarah,

Here's the recording from our technical deep-dive yesterday. Your engineering team walked through the OAuth requirements and integration timeline — really valuable session.

Recording link: https://app.use60.com/recordings/abc123
Duration: 58 minutes
Expires: March 12, 2026

Key moments:
- [03:45] SOC 2 compliance deadline (Q3) confirmed as non-negotiable
- [12:20] OAuth integration requirements detailed by your engineering team
- [28:15] Budget approval process (VP Eng sign-off by end of month)
- [41:30] Competitive evaluation criteria discussed
- [52:00] POC scope and timeline agreed (start Feb 20)

Could you review the OAuth discussion at 12:20 and confirm we captured your requirements correctly?

Best,
[Rep]
```

### Bad Recording-Sharing Email
```
Subject: Meeting Recording

Hi,

Here is the link to the recording: https://app.use60.com/recordings/abc123

Please let me know if you have any questions.

Thanks
```
**Why this is bad**: No context about which meeting. No highlights to guide viewing. No clear CTA. Could be ignored indefinitely.

### Good Recording-Sharing Email (Internal — Sales Manager)
```
Subject: WATCH: Acme Deal — Competitive Threat Surfaced

Hey Alex,

Watch the 41:30 mark — Acme is actively evaluating Competitor X and asked detailed questions about our API vs. theirs. This wasn't disclosed until the technical team joined.

Recording link: https://app.use60.com/recordings/abc123
Duration: 58 minutes

Critical moments:
- [09:15] Competitor X mentioned for first time
- [15:30] Sarah flagged security review as potential blocker (need your help here)
- [28:15] Budget approval requires VP Eng sign-off (we need executive alignment)
- [41:30] Direct competitive comparison — our API docs vs. theirs
- [52:00] POC scope agreed, but timeline contingent on security clearance

**Immediate risk**: They're further along with Competitor X than we thought. Need to accelerate the security review and get our CEO to call their VP Eng this week.

Watch 41:30 and let me know if we should bring in our enterprise SE.

[Rep]
```
**Why this is good**: Starts with the risk. Highlights are annotated with implications. CTA is specific and urgent. Tone is appropriate for internal stakeholder communication.
