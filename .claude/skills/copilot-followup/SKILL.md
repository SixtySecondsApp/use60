---
name: Copilot Follow-up
description: |
  Draft a follow-up email based on the most recent meeting or activity with a contact.
  Use when a user asks "/followup", "follow up", "follow-up email", "draft a follow-up",
  "send a follow-up to [contact]", or "write a follow-up after the meeting".
  Pulls CRM data, meeting transcripts (via RAG), enrichment signals, and deal context
  to generate a deeply personalized email with subject line options, body, send timing,
  confidence level, and multi-threading suggestions when contacts go silent.
  Requires a contact or deal entity in context.
  Do NOT use for post-meeting recap emails -- use post-meeting-followup-drafter for those.
  This skill is for general follow-ups triggered by any recent activity or inactivity.
metadata:
  author: sixty-ai
  version: "3"
  category: sales-ai
  skill_type: atomic
  is_active: true
  command_centre:
    enabled: true
    label: "/followup"
    description: "Draft a follow-up email from recent activity"
    icon: "mail"
  context_profile: sales
  agent_affinity:
    - outreach
    - pipeline
  triggers:
    - pattern: "/followup"
      intent: "slash_followup"
      confidence: 0.95
      examples:
        - "/followup"
        - "/followup for Sarah"
        - "/followup on the Acme deal"
    - pattern: "follow up"
      intent: "draft_followup"
      confidence: 0.90
      examples:
        - "follow up with this contact"
        - "send a follow up"
        - "I need to follow up"
    - pattern: "follow-up email"
      intent: "followup_email"
      confidence: 0.90
      examples:
        - "draft a follow-up email"
        - "write a follow-up email to them"
        - "compose follow-up email"
  keywords:
    - "follow-up"
    - "followup"
    - "email"
    - "follow up"
    - "check in"
    - "touch base"
    - "nudge"
    - "re-engage"
    - "ghost"
    - "no reply"
  requires_context:
    - contact
    - deal
  inputs:
    - name: contact_id
      type: string
      description: "The contact to follow up with"
      required: false
    - name: deal_id
      type: string
      description: "The deal context for the follow-up"
      required: false
    - name: context
      type: string
      description: "Additional context or instructions for the follow-up (e.g., 'about the pricing discussion')"
      required: false
    - name: tone
      type: string
      description: "Desired tone: professional, friendly, or executive"
      required: false
      default: "professional"
  outputs:
    - name: email_subject
      type: array
      description: "2-3 subject line options, under 50 chars each"
    - name: email_body
      type: string
      description: "Complete follow-up email, 80-150 words"
    - name: suggested_send_time
      type: object
      description: "ISO timestamp + rationale (timezone-aware, day/time optimized)"
    - name: rag_context_used
      type: array
      description: "Specific findings from transcript search that informed this email"
    - name: personalization_signals
      type: array
      description: "Min 3 specific details from CRM/RAG used to personalize"
    - name: multi_thread_suggestion
      type: object
      description: "If primary contact unresponsive, suggest alternative contact with rationale"
    - name: confidence_level
      type: string
      description: "high/medium/low based on data richness"
  requires_capabilities:
    - email
    - crm
  priority: high
  tags:
    - sales
    - email
    - follow-up
    - outreach
    - rag
---

## Available Context & Tools
@_platform-references/org-variables.md
@_platform-references/capabilities.md

## Instructions

You are executing the /followup skill. Your job is to draft a contextual, deeply personalized follow-up email using a 5-layer intelligence model. Every email must reference specific details from CRM data or meeting transcripts -- never send a generic follow-up.

Consult `references/followup-templates.md` for email templates organized by follow-up type, with annotated good and bad examples for each.

Consult `references/personalization-guide.md` for the personalization signal library, value-add strategies by deal stage, multi-threading playbook, and send timing research.

## Layer 1: Contact & Deal Context

Collect core intelligence before anything else:

1. **Fetch contact details**: `execute_action("get_contact", { id: contact_id })` -- name, title, company, email, last interaction date
2. **Fetch deal context**: `execute_action("get_deal", { id: deal_id })` -- stage, amount, last activity, next steps, close date
3. **Fetch recent activities**: Last 30 days of meetings, emails, calls, and tasks involving this contact
4. **Fetch meeting digest**: If the most recent activity is a meeting, pull the digest for quotes and decisions
5. **Fetch open tasks**: Pending commitments related to this contact/deal

## Layer 2: Enrichment

Light enrichment for tone calibration and value-add opportunities:

1. **Contact role and seniority**: Use title to determine IC/Manager/Director/VP/C-Suite. This shapes tone (executives get shorter, more direct emails).
2. **Company news**: Check for recent funding, product launches, leadership changes, or earnings within the last 90 days. Fresh news creates natural value-add openings ("Congrats on the Series B -- here's how that changes the ROI model we discussed").
3. **Organization context**: Pull ${company_name} products, competitors, and value propositions from Organization Context to align the email with current positioning.

## Layer 3: Historical Context (via RAG)

Before drafting, search meeting transcripts for follow-up-critical intelligence:

1. "commitments made to {contact}" -- surface any promises that need addressing
2. "concerns raised by {contact}" -- address unresolved concerns proactively
3. "next steps discussed with {company}" -- ensure follow-up aligns with agreed plan
4. "decisions made in meeting with {contact}" -- reference confirmed decisions
5. "{contact} asked about" -- identify questions that were deferred or unanswered

Use RAG results to:
- Reference specific commitments in the email opening
- Include answers to deferred questions as the value-add
- Flag unfulfilled promises that need addressing before follow-up
- Quote specific language the contact used (builds rapport and shows you listened)

If RAG returns no results, proceed with CRM data only and note the gap in confidence_level.

## Layer 4: Intelligence Signals

Analyze patterns across the data to detect:

### Deal Health
- **Healthy**: Regular engagement, deal advancing through stages, commitments being met
- **Stalling**: Same stage 2x longer than average, close date pushed, fewer touchpoints
- **Ghost risk**: 14+ days of silence, 2+ unanswered emails, no meeting scheduled

### Engagement Trajectory
- Count activities in the last 14 days vs. the 14 days prior. Trending up = momentum. Trending down = cooling.
- If engagement is declining, the follow-up must re-ignite interest (new value, not more asks).

### Multi-Threading Opportunity
If the primary contact has been unresponsive (2+ follow-ups, 14+ days silence):
1. Identify other contacts at the same company from CRM
2. Suggest a different contact to reach out to with rationale
3. Draft an alternative email for the new contact
4. Flag to the user: "Consider switching to [Name, Title] -- they were active in the [date] meeting and showed interest in [topic]"

Never keep emailing an unresponsive contact without suggesting alternatives.

## Layer 5: Email Strategy (Synthesis)

Synthesize all layers into the final email.

### Follow-up Type Detection

Determine the type from recent activity -- this drives template selection:

| Last Activity | Follow-up Type | Timing |
|--------------|---------------|--------|
| Meeting (today) | Post-meeting recap | Within 1 hour |
| Meeting (1-3 days ago) | Check-in on commitments | Same day or next morning |
| Demo completed | Post-demo | Within 4 hours |
| Proposal sent (3+ days) | Proposal follow-up | With specific question |
| Email sent (3-5 days, no reply) | Gentle nudge | Mid-morning, mid-week |
| Email sent (7+ days, no reply) | Re-engagement | With new value-add |
| Deal gone quiet (14+ days) | Re-activation | With trigger event or new info |
| Task completed for them | Deliverable handoff | Immediately |

### Subject Line (2-3 options)
- Keep under 50 characters
- Reference the specific context (meeting topic, deliverable, deal name)
- If replying to an existing thread, preserve "Re:" prefix

### Email Body (80-150 words, 5 sections)

1. **Opening (1 sentence)**: Reference the last interaction specifically. Use a detail from Layer 3 (RAG) or Layer 1 (CRM). Never generic.
2. **Value-add (1-2 sentences)**: Provide something useful -- a resource, insight, answer to their deferred question, or deliverable they requested. See `references/personalization-guide.md` for value-add ideas by deal stage.
3. **Context bridge (1 sentence)**: Connect the value-add back to their stated goals or pain points.
4. **CTA (1 sentence)**: Single specific ask. Confirmatory ("Does Thursday still work?") or micro-commitment ("Could you share the requirements doc?"). Never "let me know your thoughts."
5. **Sign-off**: Brief, warm, professional.

### Tone Calibration

- **professional**: Clear, direct, respectful. Default for most B2B.
- **friendly**: Warm, conversational, first names. Established relationships.
- **executive**: Brief, high-level, action-oriented. C-suite. Under 80 words.

Match the tone to the recipient's seniority from Layer 2 and communication style from previous emails when possible.

### Suggested Send Time

Calculate the optimal send time:
- **Day**: Tuesday-Thursday outperform Monday/Friday
- **Time**: 9-10am and 1-2pm in the recipient's timezone
- **Recency**: Today's interaction = within 1-2 hours. 3+ days ago = next optimal morning slot.
- **Follow-up number**: First = same day. Second = 3-5 business days. Third = 7+ days with pattern break.

Return as ISO timestamp with human-readable note (e.g., "Tuesday 9:30 AM EST -- optimal open window").

## Anti-patterns (Never Do)

- Never open with "just checking in", "circling back", "touching base", or "hope this finds you well"
- Never re-pitch features or capabilities that were not discussed
- Never send a follow-up without a specific reason or value-add
- Never use guilt ("I haven't heard back from you")
- Never send more than 3 follow-ups without a pattern break (change channel, add new info, involve a different person)
- Never fabricate transcript quotes or meeting details

## Confidence Level

Set `confidence_level` based on data richness:

| Level | Criteria |
|-------|----------|
| **high** | CRM data + RAG transcript results + recent activity within 7 days |
| **medium** | CRM data present but RAG returned nothing, or last activity 7-30 days ago |
| **low** | Sparse CRM data, no transcripts, last activity 30+ days ago |

Always report honestly. A low-confidence email with a clear disclaimer is better than a fabricated high-confidence one.

## Quality Checklist

Before returning:
- [ ] Email references a specific detail from transcripts or CRM (not generic)
- [ ] At least 3 personalization signals used
- [ ] Subject line under 50 chars and context-specific
- [ ] Body between 80-150 words
- [ ] Exactly one CTA (specific ask, not "let me know")
- [ ] Value-add section provides something useful (resource, answer, insight)
- [ ] No dead language ("just checking in", "circling back", "touching base")
- [ ] If 2+ follow-ups sent with no reply, multi-thread suggestion included
- [ ] Suggested send time accounts for timezone and day/time optimization
- [ ] Confidence level reflects data quality

## Graceful Degradation

When data is missing, degrade gracefully -- never block the email:

| Missing Data | Fallback |
|-------------|----------|
| No RAG results | Use CRM activity notes; set confidence to medium |
| No deal linked | Relationship-focused email; omit deal-specific language |
| No recent activity | Ask user for context: "What was your last interaction about?" |
| Contact not in CRM | Ask user: "Who would you like to follow up with?" |
| No enrichment data | Skip Layer 2; rely on CRM title for tone calibration |
| Multiple recent activities | Prioritize the most recent; use user-provided context to disambiguate |

## Error Handling

### No recent activity found
Ask: "What was your last interaction with [contact name] about? I need context to write a relevant follow-up."

### Contact not in CRM
Ask: "Who would you like to follow up with? Please provide a name or email address."

### No deal linked
Generate a relationship-focused follow-up without deal-specific language. This is not an error -- many follow-ups are pre-deal or relationship maintenance.

### Multiple recent activities
Prioritize the most recent one. If the user provided additional context, use that to determine which activity to reference.
