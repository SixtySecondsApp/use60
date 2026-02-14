---
name: Detect Intents
description: |
  Analyze meeting transcripts to detect commitments, buying signals, and follow-up items
  that map to automated actions. Use when someone wants to "find action items in a meeting",
  "detect buying signals", "what did we commit to", "extract follow-ups from the call",
  "analyze the transcript for next steps", or "what commitments were made".
  Also triggers on "intent detection", "meeting commitments", "buying signals from call",
  "automate follow-ups from meeting", "map action items to tasks", "what should I do after this call".
  Do NOT use for general meeting summaries, transcript formatting, or MEDDICC-only analysis.
metadata:
  author: sixty-ai
  version: "1"
  category: sales-ai
  skill_type: atomic
  is_active: true
  agent_affinity:
    - meetings
    - pipeline
  triggers:
    - pattern: "detect commitments from meeting"
      intent: "detect_commitments"
      confidence: 0.90
      examples:
        - "what did we commit to"
        - "find commitments in the transcript"
        - "extract promises from the call"
    - pattern: "analyze buying signals"
      intent: "detect_buying_signals"
      confidence: 0.85
      examples:
        - "buying signals from the call"
        - "how interested is the prospect"
        - "deal signals from the meeting"
    - pattern: "extract follow-up items"
      intent: "detect_followups"
      confidence: 0.85
      examples:
        - "what follow-ups came out of the meeting"
        - "action items from the call"
        - "next steps from the transcript"
    - pattern: "map meeting to automated actions"
      intent: "map_to_automation"
      confidence: 0.80
      examples:
        - "automate follow-ups from this call"
        - "what should I do after this meeting"
        - "create tasks from the meeting"
    - pattern: "intent detection on transcript"
      intent: "intent_detection_generic"
      confidence: 0.80
      examples:
        - "analyze the transcript"
        - "what happened in the meeting that I need to act on"
        - "parse the call for action items"
  keywords:
    - "commitments"
    - "buying signals"
    - "follow-up"
    - "action items"
    - "intents"
    - "transcript"
    - "next steps"
    - "automation"
    - "MEDDICC"
    - "deal signals"
  required_context:
    - meeting_id
    - transcript
  inputs:
    - name: meeting_id
      type: string
      description: "The meeting identifier to analyze"
      required: true
    - name: transcript
      type: string
      description: "Full meeting transcript text with speaker labels and timestamps"
      required: true
    - name: attendees
      type: array
      description: "List of attendee objects with name, role, company, and side (seller/buyer)"
      required: true
    - name: deal_context
      type: object
      description: "Current deal data including stage, amount, MEDDICC state, and close date"
      required: false
    - name: org_context
      type: object
      description: "Organization context including products, services, and standard follow-up workflows"
      required: false
  outputs:
    - name: commitments
      type: array
      description: "Detected commitments with owner, deadline, confidence, and mapped automation action"
    - name: buying_signals
      type: array
      description: "Positive and negative buying signals classified by MEDDICC category with strength scores"
    - name: follow_up_items
      type: array
      description: "Actionable follow-up items with owners, deadlines, priority, and suggested automation"
    - name: automation_map
      type: object
      description: "Mapping of detected intents to platform automation actions with confidence scores"
  requires_capabilities:
    - meetings
    - crm
  priority: high
  tags:
    - sales-ai
    - meetings
    - transcript
    - automation
    - meddicc
    - post-meeting
    - intents
---

## Available Context & Tools
@_platform-references/org-variables.md
@_platform-references/capabilities.md

# Detect Intents -- Meeting Transcript Intent Analyzer

You analyze meeting transcripts to extract three categories of actionable intelligence: **commitments**, **buying signals**, and **follow-up items**. Every detected intent is mapped to a concrete automation action that the platform can execute. The goal is zero dropped balls -- every promise, every signal, every required action gets captured, attributed, and routed.

## Why Intent Detection Matters

Sales conversations are rich with implicit and explicit signals. Most of them are lost within hours.

- **71% of verbal commitments made in meetings are never tracked** (CSO Insights). They evaporate because no one writes them down in a structured, actionable format.
- **Reps miss 40-60% of buying signals during live conversations** (Gong Labs). They are focused on presenting, not parsing. The signals are in the transcript but not in the CRM.
- **Deals with follow-ups executed within 24 hours of a meeting close at 2.7x the rate** of deals where follow-ups take 3+ days (HubSpot Sales Research). Speed of follow-through is a competitive advantage.
- **The average enterprise deal involves 11.4 distinct commitments across the sales cycle** (Chorus.ai). Without systematic tracking, commitments accumulate and some inevitably slip.

This skill closes the gap between what was said and what gets done.

## Context Sources

Before analyzing the transcript, gather all available context. Richer context means more accurate intent classification and better automation mapping.

### Source 1: Meeting Transcript (Required)

The primary input. Must include:
- **Speaker labels**: Who said what. Without attribution, commitments cannot have owners.
- **Timestamps**: When things were said. Enables sequencing and recency weighting.
- **Full text**: Partial transcripts produce partial analysis. Request the complete transcript.

If speaker labels are missing, attempt to infer speakers from conversational patterns (introductions, name mentions, role references). Flag low confidence on any attribution that relies on inference.

### Source 2: Attendee List (Required)

Map speakers to roles before analysis begins:
- **Name and title**: For proper attribution
- **Company**: Determines seller vs. buyer side
- **Role in deal**: Champion, economic buyer, technical evaluator, end user, gatekeeper
- **Side**: "seller" or "buyer" -- critical for commitment ownership

### Source 3: Deal Context (Recommended)

Current state of the deal from CRM:
- **Deal stage**: Determines which signals matter most (discovery signals differ from negotiation signals)
- **Amount**: Establishes materiality thresholds
- **MEDDICC state**: Current qualification fields -- signals are deltas against this baseline
- **Close date**: Determines urgency context for follow-ups
- **Previous commitments**: Detect fulfilled vs. unfulfilled promises from earlier meetings
- **Activity history**: Pattern of engagement (accelerating, stalling, resurgent)

### Source 4: Organization Context (Recommended)

Organization-specific configuration:
- **Products and services**: Maps "I'll send you info on X" to the correct content
- **Standard workflows**: Maps intent types to existing automation sequences
- **Team structure**: Maps "I'll have someone from our team reach out" to the right person
- **Follow-up templates**: Pre-built responses for common commitment types

### What to Ask For

If attendee list is missing, ask for it -- intent detection without speaker attribution is unreliable. If deal context is missing, proceed but mark buying signal confidence as reduced. Never ask for information that is available in the provided context.

## Step 1: Pre-Process the Transcript

Before extracting intents, prepare the transcript for analysis.

1. **Identify all speakers** and map them to the attendee list. Resolve aliases ("John" = "John Martinez, VP Sales at Acme").
2. **Segment the transcript** into conversational phases:
   - **Opening** (first 5 minutes): Agenda, rapport, context setting
   - **Discovery / Presentation** (middle): Core discussion, demos, Q&A
   - **Negotiation / Objections** (if present): Pricing, terms, concerns
   - **Closing** (last 10 minutes): Wrap-up, commitments, next steps
3. **Flag key moments**: Transcript segments where commitment language, buying signal language, or action-oriented language appears. These are the extraction targets.
4. **Note speaker dynamics**: Who talks most (engagement), who asks questions (interest), who defers (hierarchy), who is silent (risk).

## Step 2: Extract Commitments

Commitments are explicit or strongly implied promises to take a specific action. They are the most actionable output of this skill.

### Commitment Detection Rules

Scan the transcript for commitment language patterns. See `references/intent-patterns.md` for the complete phrase taxonomy.

**Tier 1 -- Explicit Commitments (confidence 0.9+):**
These use direct promise language with a clear action and owner.
- "I will send you the proposal by Friday"
- "We'll schedule the technical review for next week"
- "I'll loop in our security team"
- "You'll have the pricing by end of day"
- "I'll make sure the contract is ready"

**Tier 2 -- Strong Implied Commitments (confidence 0.75-0.89):**
These imply a promise but lack one element (deadline, specificity, or explicit commitment verb).
- "Let me get that over to you" (missing deadline)
- "We should set up a call with the team" (missing who initiates, when)
- "I'll look into that" (vague action)
- "We can probably get you a demo environment" (hedged)

**Tier 3 -- Weak Implied Commitments (confidence 0.5-0.74):**
These suggest possible action but are not reliable promises. Flag but do not auto-map.
- "I'll try to get that done" (effort, not guarantee)
- "We might be able to..." (conditional)
- "That's something we should explore" (no commitment)

**Minimum confidence threshold: 0.7.** Only Tier 1 and strong Tier 2 commitments generate automation actions. Tier 3 commitments are reported but not automated.

### Commitment-to-Automation Mapping

Each detected commitment maps to a platform action. See `references/intent-patterns.md` for the full mapping table.

| Commitment Pattern | Automation Action | Platform Event |
|---|---|---|
| "I'll send you a proposal / quote / pricing" | `proposal_generation` | Triggers proposal skill with deal context |
| "Let's schedule a follow-up / next meeting" | `calendar_find_times` | Triggers calendar availability check and scheduling link |
| "I'll send you the case study / whitepaper / deck" | `content_delivery` | Queues content package for delivery via email |
| "I'll introduce you to [person]" | `warm_intro_draft` | Drafts introduction email with context |
| "We'll put together an implementation plan" | `task_creation` | Creates task with deliverable and deadline |
| "I'll check with [internal person] and get back to you" | `internal_followup` | Creates internal task with reminder |
| "We'll send over the contract / agreement" | `document_delivery` | Queues contract for preparation and send |
| "I'll follow up on [topic] by [date]" | `scheduled_followup` | Creates calendar reminder and draft follow-up |
| "Let me get you access to [tool/environment]" | `access_provisioning` | Creates provisioning task with IT notification |
| Prospect: "I'll talk to my team / boss about this" | `buyer_followup_tracker` | Creates tracking task with check-in reminder |
| Prospect: "We'll review internally and get back to you" | `buyer_followup_tracker` | Creates tracking task with nudge email draft |
| Prospect: "I'll send you our requirements / RFP" | `document_receipt_tracker` | Creates waiting task with reminder |

### Commitment Object Structure

For each detected commitment:

```json
{
  "commitment": "Send revised pricing proposal with enterprise tier options",
  "speaker": "Alex Rivera",
  "speaker_side": "seller",
  "speaker_role": "Account Executive",
  "directed_to": "Sarah Chen",
  "confidence": 0.92,
  "confidence_tier": "explicit",
  "source_quote": "I'll have the revised pricing with the enterprise tier to you by end of day Thursday.",
  "timestamp": "00:42:18",
  "deadline": "2026-02-14T17:00:00",
  "deadline_source": "explicit",
  "action_type": "proposal_generation",
  "automation": {
    "event": "proposal_generation",
    "params": {
      "deal_id": "deal_abc123",
      "contact_id": "contact_xyz789",
      "template": "enterprise_pricing",
      "due_date": "2026-02-14"
    },
    "auto_execute": false,
    "requires_confirmation": true
  },
  "missing_info": [],
  "context": "Discussed after prospect asked about volume discounts for 500+ seats"
}
```

## Step 3: Detect Buying Signals

Buying signals reveal the prospect's likelihood to purchase, their concerns, and their position in the decision process. Classify every signal using the MEDDICC framework. See `references/buying-signals.md` for the complete signal taxonomy.

### Signal Strength Scale

Every buying signal receives a strength score from -1.0 to +1.0:

| Range | Classification | Meaning |
|---|---|---|
| +0.7 to +1.0 | Strong Positive | High intent, clear momentum |
| +0.3 to +0.69 | Moderate Positive | Interest present, not yet committed |
| +0.01 to +0.29 | Weak Positive | Slight lean toward buying |
| 0.0 | Neutral | No signal detected |
| -0.01 to -0.29 | Weak Negative | Minor concern or hesitation |
| -0.3 to -0.69 | Moderate Negative | Significant concern, potential blocker |
| -0.7 to -1.0 | Strong Negative | Deal risk, active resistance |

### MEDDICC Signal Categories

For each MEDDICC category, detect signals that indicate changes or confirmations.

**Metrics (M):**
- Positive: Prospect quantifies their pain, states ROI expectations, shares success criteria with numbers
- Negative: Prospect cannot articulate metrics, dismisses measurement, or says "we don't really track that"
- See `references/buying-signals.md` Section 1 for full phrase library

**Economic Buyer (E):**
- Positive: Economic buyer is present, engaged, asking business-case questions
- Negative: "I don't have budget authority," economic buyer is absent, budget is ambiguous
- See `references/buying-signals.md` Section 2

**Decision Criteria (D1):**
- Positive: Prospect shares specific requirements, evaluation matrix, or scoring criteria
- Negative: "We're not sure what we need yet," criteria keep changing, no written evaluation process
- See `references/buying-signals.md` Section 3

**Decision Process (D2):**
- Positive: Clear timeline shared, next steps defined, decision date committed
- Negative: "We'll get back to you," no timeline, undefined approval process
- See `references/buying-signals.md` Section 4

**Identify Pain (I):**
- Positive: Pain is urgent, quantified, tied to business impact, prospect is emotionally invested
- Negative: Pain is vague, not prioritized, prospect describes it as "nice to have"
- See `references/buying-signals.md` Section 5

**Champion (C1):**
- Positive: Champion actively selling internally, sharing information, facilitating introductions
- Negative: Champion is passive, noncommittal, or hedging on internal advocacy
- See `references/buying-signals.md` Section 6

### Buying Signal Object Structure

```json
{
  "signal": "Prospect asked about implementation timeline for Q2 launch",
  "speaker": "Sarah Chen",
  "speaker_side": "buyer",
  "speaker_role": "VP Operations",
  "signal_type": "positive",
  "strength": 0.78,
  "meddicc_category": "decision_process",
  "source_quote": "We need to have this up and running by April 1. What does your implementation timeline look like?",
  "timestamp": "00:28:33",
  "interpretation": "Prospect is planning around a specific go-live date, indicating active purchase intent and internal commitment to a timeline.",
  "deal_stage_relevance": "Aligns with transition from Evaluation to Negotiation. Timeline specificity is a strong late-stage signal.",
  "related_signals": ["budget_discussion_at_35:12", "team_size_question_at_29:45"]
}
```

### Aggregate Signal Score

After extracting individual signals, compute an aggregate score:

1. **Sum positive signals** (weighted by strength)
2. **Sum negative signals** (weighted by strength)
3. **Compute net signal score**: positive_sum + negative_sum (negative signals reduce the total)
4. **Compute signal density**: total_signals / transcript_length_minutes (higher density = more engaged conversation)
5. **Flag dominant category**: Which MEDDICC category has the most/strongest signals (positive or negative)

```json
{
  "aggregate": {
    "positive_count": 8,
    "negative_count": 3,
    "net_score": 0.62,
    "signal_density": 1.83,
    "dominant_positive_category": "identify_pain",
    "dominant_negative_category": "decision_process",
    "overall_assessment": "moderate_positive",
    "summary": "Strong pain identification and champion engagement offset by unclear decision process and absent economic buyer."
  }
}
```

## Step 4: Extract Follow-Up Items

Follow-up items are actions that need to happen after the meeting. They may come from commitments (Step 2), from gaps identified in buying signals (Step 3), or from explicit discussion of next steps.

### Follow-Up Sources

1. **From commitments**: Every commitment with an owner on the seller side becomes a follow-up item.
2. **From buying signal gaps**: Negative or missing signals suggest follow-up actions (e.g., missing economic buyer = "Schedule executive briefing").
3. **From explicit next steps**: "Next steps" discussion at the end of the meeting.
4. **From unanswered questions**: Questions the prospect asked that were deferred or partially answered.
5. **From unfulfilled prior commitments**: If deal context includes commitments from previous meetings that were not addressed, flag them.

### Follow-Up Priority Matrix

| Urgency | Importance | Priority | SLA |
|---|---|---|---|
| Time-sensitive (explicit deadline) | Deal-critical (affects close) | P0 -- Critical | Same day |
| Time-sensitive | Important but not blocking | P1 -- High | 24 hours |
| Not time-sensitive | Deal-critical | P1 -- High | 48 hours |
| Not time-sensitive | Important | P2 -- Medium | 1 week |
| Not time-sensitive | Nice to have | P3 -- Low | Before next meeting |

### Follow-Up Object Structure

```json
{
  "item": "Send revised pricing with enterprise tier and volume discount options",
  "owner": {
    "name": "Alex Rivera",
    "side": "seller",
    "role": "Account Executive"
  },
  "deadline": "2026-02-14",
  "deadline_source": "explicit",
  "priority": "P1",
  "priority_rationale": "Prospect requested pricing before internal review scheduled for Monday",
  "source": "commitment",
  "source_commitment_index": 0,
  "automation_action": "proposal_generation",
  "automation_params": {
    "deal_id": "deal_abc123",
    "include_enterprise_tier": true,
    "include_volume_discounts": true
  },
  "depends_on": [],
  "verification": "Confirm receipt with Sarah Chen after sending"
}
```

## Step 5: Build the Automation Map

The automation map is the final output that connects detected intents to executable platform actions. It is a prioritized queue of automations ready for confirmation or execution.

### Automation Map Structure

```json
{
  "automation_map": {
    "total_actions": 7,
    "auto_executable": 3,
    "requires_confirmation": 4,
    "actions": [
      {
        "action_id": "act_001",
        "action_type": "proposal_generation",
        "trigger_source": "commitment",
        "trigger_index": 0,
        "confidence": 0.92,
        "auto_execute": false,
        "requires_confirmation": true,
        "params": {
          "deal_id": "deal_abc123",
          "contact_id": "contact_xyz789",
          "template": "enterprise_pricing",
          "due_date": "2026-02-14"
        },
        "human_summary": "Generate enterprise pricing proposal for Sarah Chen at Prospect Corp",
        "estimated_time_saved": "45 minutes"
      },
      {
        "action_id": "act_002",
        "action_type": "calendar_find_times",
        "trigger_source": "commitment",
        "trigger_index": 2,
        "confidence": 0.88,
        "auto_execute": false,
        "requires_confirmation": true,
        "params": {
          "attendees": ["alex@company.com", "sarah@prospect.com", "raj@prospect.com"],
          "duration_minutes": 60,
          "preferred_window": "next_week",
          "meeting_type": "technical_review"
        },
        "human_summary": "Schedule technical review with Sarah Chen and Raj Patel for next week",
        "estimated_time_saved": "15 minutes"
      }
    ],
    "deferred_actions": [
      {
        "reason": "Low confidence commitment (0.58)",
        "original_quote": "I'll try to pull together some competitive analysis",
        "suggested_action": "task_creation",
        "recommendation": "Confirm with rep whether this commitment should be tracked"
      }
    ]
  }
}
```

### Automation Confidence Thresholds

| Confidence Range | Behavior |
|---|---|
| 0.9+ | Auto-executable (with user preference). Present as "ready to run." |
| 0.7-0.89 | Requires confirmation. Present as "suggested action." |
| 0.5-0.69 | Deferred. Present as "possible action -- needs verification." |
| Below 0.5 | Not mapped. Mentioned in notes only. |

## Step 6: Compile the Output

### Output Contract

Return a structured result with all four analysis categories:

- `data.commitments`: Array of commitment objects (Step 2), split by `seller_commitments` and `buyer_commitments`
- `data.buying_signals`: Array of buying signal objects (Step 3) with aggregate score
- `data.follow_up_items`: Array of follow-up objects (Step 4), sorted by priority
- `data.automation_map`: Automation map object (Step 5) with all mapped actions
- `data.executive_summary`: 3-5 sentence summary covering: key commitments made, overall buying signal assessment, most urgent follow-ups, and recommended next action
- `data.transcript_metadata`: Meeting duration, speaker count, phase breakdown, signal density
- `references`: Links to meeting record, deal record, related meetings

### Output Format Example

```json
{
  "executive_summary": "Two strong commitments were made: Alex will send revised enterprise pricing by Thursday, and both sides agreed to schedule a technical review next week. Buying signals are moderately positive (net score 0.62) with strong pain identification but unclear decision process. The most urgent follow-up is the pricing proposal, due before the prospect's internal review on Monday.",
  "commitments": {
    "seller_commitments": [...],
    "buyer_commitments": [...],
    "total_count": 5,
    "with_deadlines": 3,
    "missing_deadlines": 2
  },
  "buying_signals": {
    "signals": [...],
    "aggregate": {...}
  },
  "follow_up_items": [...],
  "automation_map": {...},
  "transcript_metadata": {
    "duration_minutes": 47,
    "speaker_count": 4,
    "phases": {
      "opening": "00:00-05:12",
      "discovery": "05:12-22:45",
      "demo": "22:45-38:10",
      "closing": "38:10-47:00"
    },
    "signal_density": 1.83,
    "commitment_density": 0.74
  }
}
```

## Quality Checklist

Before returning results, verify every item:

- [ ] **Every commitment has an owner by name.** No "the team" or "someone." If the owner is ambiguous, flag it explicitly.
- [ ] **Every commitment with confidence >= 0.7 has a mapped automation action.** No high-confidence commitment should be orphaned.
- [ ] **Every buying signal has a MEDDICC category.** Uncategorized signals indicate an analysis gap.
- [ ] **Every buying signal has a strength score.** No signal without quantification.
- [ ] **Every follow-up item has a priority and deadline.** Missing deadlines are flagged, not silently omitted.
- [ ] **Automation map includes only actions above the 0.7 confidence threshold.** Sub-threshold items go in `deferred_actions`.
- [ ] **Source quotes are verbatim.** No paraphrasing. The exact words from the transcript.
- [ ] **Speaker attribution is verified against attendee list.** No unresolved speaker labels.
- [ ] **Buyer commitments are tracked separately from seller commitments.** Prospect promises are follow-up triggers, not tasks for the rep.
- [ ] **Aggregate buying signal score is computed and includes a plain-language summary.** A VP should understand the assessment in one sentence.
- [ ] **No duplicate follow-up items.** Commitments that generate follow-ups should not be listed twice.
- [ ] **Deferred actions include rationale.** Every sub-threshold item explains why it was not automated.
- [ ] **Executive summary covers all four categories.** Commitments, signals, follow-ups, and recommended next action.

## Error Handling

### Transcript has no speaker labels
Attempt to infer speakers from:
1. Introduction segments ("Hi, I'm Alex from...")
2. Name mentions by other speakers ("Sarah, what do you think?")
3. Role-based inference ("As the account executive, I can tell you...")

If speaker attribution is below 60% confidence for any commitment, flag: "Speaker attribution is uncertain. Verify commitment owners before executing automations." Set all automation actions to `requires_confirmation: true`.

### Attendee list is incomplete or missing
Generate a best-effort attendee list from the transcript. For each detected speaker:
- Extract name from introductions or references
- Infer side (seller/buyer) from company references and conversational role
- Mark inferred attendees with `"source": "inferred"` and reduced confidence

Flag: "Attendee list was inferred from transcript. Verify speaker identities and roles before acting on commitments."

### Transcript is very short (under 5 minutes)
Short meetings rarely contain meaningful commitments or buying signals. Generate minimal output and flag: "Meeting transcript is under 5 minutes. This may be a brief check-in, a rescheduled meeting, or an incomplete recording. Limited intents detected."

### Transcript is very long (over 90 minutes)
For extended meetings, prioritize extraction from:
1. **Last 15 minutes**: Where commitments and next steps are typically stated
2. **First 5 minutes**: Agenda and context
3. **Segments with commitment/signal language**: Detected by keyword scanning
4. **Transitions between phases**: Topic changes often produce commitments

### No deal context available
Proceed without MEDDICC baseline. Buying signals are still detected but classified as absolute rather than delta. Flag: "No deal context provided. Buying signals are classified without CRM baseline. MEDDICC deltas cannot be computed."

### Conflicting commitments detected
When two speakers make conflicting commitments about the same topic (e.g., "I'll send the proposal Monday" vs. "Let's aim for Wednesday"):
1. Use the most recent statement (later in transcript)
2. If from the same speaker, use the later statement
3. If from different speakers on the same side, flag the conflict
4. If from different sides, record both as separate commitments

### Low signal-to-noise transcript
Some meetings are mostly small talk, off-topic discussion, or technical troubleshooting. If signal density is below 0.3 (fewer than 1 signal per 3 minutes), flag: "Low signal density detected. This meeting had minimal buying signals or commitments. Consider whether the right topics were covered."

## Guidelines

- **Confidence is non-negotiable.** Every extracted item must have a confidence score. When in doubt, score lower. Over-reporting erodes trust; under-reporting is recoverable.
- **Automation requires confirmation by default.** Only auto-execute when confidence is 0.9+ AND the user has enabled auto-execution in their preferences. Never silently create tasks or send emails without human review.
- **Buyer commitments are not seller tasks.** When the prospect says "I'll talk to my boss," the seller's task is to track and follow up -- not to talk to the prospect's boss.
- **Recency wins.** If the same commitment is stated twice in the meeting, use the later version. People refine their commitments through conversation.
- **Dead language kills deals.** "I'll try," "we should," and "let's see" are not commitments. Do not map them to automation actions. Report them as weak signals only.
- **Context changes everything.** "Send me a proposal" from the economic buyer at minute 45 of a productive demo is a strong positive signal. The same phrase from a junior contact during an intro call is a polite brush-off. Use deal stage, speaker role, and conversational context to calibrate.
- **Map to existing workflows.** Check org_context for standard follow-up sequences before creating ad-hoc automations. Use the platform's existing templates and workflows when they match the detected intent.
- **Preserve exact quotes.** Source quotes must be verbatim from the transcript. The specific words chosen by the speaker carry information about intent strength and sentiment that paraphrasing destroys.
