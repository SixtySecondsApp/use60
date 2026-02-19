---
name: Flag for Manager
description: |
  Send a Slack notification to the user's manager with deal context, risk assessment, and recommended action.
  Use when a user asks "flag for review", "escalate this deal", "manager attention needed", "flag for manager",
  or needs managerial oversight on a high-risk or high-value opportunity. Returns escalation summary with
  risk level and recommended actions.
metadata:
  author: sixty-ai
  version: "2"
  category: sales-ai
  skill_type: atomic
  is_active: true
  context_profile: sales
  agent_affinity:
    - pipeline
    - crm_ops
  triggers:
    - pattern: "flag for manager"
      intent: "manager_escalation"
      confidence: 0.90
      examples:
        - "flag this for my manager"
        - "escalate to manager"
        - "manager needs to see this"
    - pattern: "escalate this deal"
      intent: "deal_escalation"
      confidence: 0.90
      examples:
        - "escalate this to leadership"
        - "needs escalation"
        - "escalate for review"
    - pattern: "manager attention needed"
      intent: "manager_attention"
      confidence: 0.85
      examples:
        - "my manager should know about this"
        - "manager needs to be aware"
        - "need manager input"
    - pattern: "flag for review"
      intent: "escalation_review"
      confidence: 0.90
      examples:
        - "flag this deal for review"
        - "needs manager review"
        - "flag for attention"
  keywords:
    - "flag"
    - "escalate"
    - "manager"
    - "review"
    - "attention"
    - "leadership"
    - "oversight"
    - "help"
    - "risk"
  required_context:
    - deal
    - company_name
    - user_info
  inputs:
    - name: deal_id
      type: string
      description: "The deal identifier to escalate to manager"
      required: true
    - name: reason
      type: string
      description: "Brief reason for escalation (optional -- AI will infer from deal data if not provided)"
      required: false
    - name: urgency
      type: string
      description: "Escalation urgency: 'critical', 'high', 'medium' (optional -- AI will determine if not provided)"
      required: false
  outputs:
    - name: escalation_summary
      type: object
      description: "Summary of the escalation with deal context, risk assessment, and recommended action"
    - name: slack_notification
      type: object
      description: "Slack message sent to manager with formatted deal context and risk analysis"
    - name: task
      type: object
      description: "Internal tracking task for the escalation"
  priority: high
  requires_capabilities:
    - crm
    - slack
    - tasks
---

## Available Context & Tools
@_platform-references/org-variables.md
@_platform-references/capabilities.md

# Flag for Manager

## Goal
Escalate a deal to the user's manager via Slack notification with structured context: deal details, risk assessment, specific ask, and recommended action. This skill ensures managers receive high-signal escalations with enough information to act quickly -- not generic "FYI" messages, but clear requests for help with specific next steps.

## Why Manager Escalation Matters

Manager escalation is a force multiplier when done correctly, but becomes noise when overused or poorly structured. The data:

- **Timely escalations improve close rates by 28%** for deals above $100K when manager involvement happens at the right stage (CSO Insights, 2023).
- **Executive-to-executive alignment** increases deal velocity by 34% and reduces late-stage slippage by 41% (Gong Labs).
- **But over-escalation destroys trust.** Managers who receive more than 3 low-urgency escalations per week start ignoring all escalations, including the critical ones (Sales Leadership Study, 2022).
- **The best escalations are specific.** Generic "deal needs help" messages result in no action 67% of the time. Specific requests ("need exec-to-exec call to address technical objection") get action 82% of the time (Revenue.io analysis).
- **Manager escalations should be rare and valuable.** Top-performing reps escalate 1-2 deals per month. Under-performers escalate 5+ deals per week, often for issues they should handle themselves (SalesHacker benchmarking).

The goal: escalate the RIGHT deals at the RIGHT time with the RIGHT context.

## Required Capabilities
- **CRM**: To fetch deal data, activities, health signals, and risk indicators
- **Slack**: To send formatted notification to manager
- **Tasks**: To create internal tracking task for the escalation

## Inputs
- `deal_id`: The deal identifier (required)
- `reason`: Brief reason for escalation (optional -- if not provided, AI will infer from deal data)
- `urgency`: Escalation urgency level (optional -- AI will determine based on deal signals)

## Data Gathering (via execute_action)

1. **Fetch deal record**: `execute_action("get_deal", { id: deal_id, include_health: true })` -- stage, value, close date, health score, days in stage, contacts
2. **Fetch recent activities**: `execute_action("get_deal_activities", { deal_id, limit: 10 })` -- meetings, calls, emails (look for patterns: silence, objections, competitive mentions)
3. **Fetch overdue tasks**: `execute_action("list_tasks", { deal_id, status: "overdue" })` -- execution gaps
4. **Fetch user info**: `execute_action("get_current_user", {})` -- get user's manager info for Slack routing
5. **Fetch pipeline context**: `execute_action("get_pipeline_summary", {})` -- understand how this deal fits in the overall pipeline

If manager info is not available, return an error: "Manager information not found. Update your user profile with your manager's Slack handle to enable escalations."

## Escalation Worthiness Assessment

Before escalating, determine if this deal warrants manager attention. Use these criteria:

### ESCALATE (send notification) if ANY of these are true:
- Deal value is $200K+ and showing critical risk signals (no activity 14+ days, close date pushed 2+ times, single-threaded)
- Deal value is $150K+ and competitor is actively winning
- Close date is within 7 days and there is a blocking issue (legal, technical, procurement)
- Executive-to-executive alignment is needed and rep cannot access the buyer's executive
- 3+ risk signals are present simultaneously on a deal above $75K
- The deal requires strategic pricing or partnership concession beyond rep authority
- Buyer explicitly requested to speak with rep's manager or executive
- Rep has exhausted standard rescue tactics and needs strategic guidance

### DO NOT ESCALATE (suggest rep handle it) if:
- Deal is under $50K with only medium-severity risk signals (rep should manage this)
- Issue is a standard objection (pricing, features, timeline) that the rep can address
- The rep has not attempted basic rescue actions yet (switch channels, go around the champion, send breakup email)
- Deal is early-stage (discovery/evaluation) with no urgency -- too early for manager escalation
- The request is for information or guidance, not for manager action (suggest internal coaching instead)

If the deal does not meet escalation criteria, return a response that explains why and recommends what the rep should do instead.

## Risk Assessment Framework

Analyze the deal and assign a risk level:

### Critical Risk
- Deal value $150K+ AND close date within 14 days AND blocking issue unresolved
- No activity in 21+ days on a deal above $100K
- Competitor winning with confirmed executive sponsorship on buyer side
- Champion left the company and no replacement identified
- Close date in the past by 7+ days with no update

### High Risk
- Deal value $100K+ with 2+ critical risk signals (activity gap, close date pushed, single-threaded)
- Economic buyer never engaged and deal is past evaluation stage
- Technical or legal blocker with no clear resolution path
- Close date pushed 3+ times on any deal above $75K

### Medium Risk
- Deal showing early warning signs (declining activity, no next meeting scheduled) but still salvageable with standard tactics
- Competitive situation is known but differentiation is unclear
- Budget confirmed but timeline is vague

### Low Risk (do not escalate)
- Deal is healthy but rep wants manager visibility "just in case"
- Minor issues that are normal in the sales process

## Recommended Action Framework

For each escalation, provide a SPECIFIC recommended action for the manager. Not "please review" but "please do X."

### Manager Actions by Escalation Type

**Executive alignment needed:**
- Recommended action: "Request a 20-minute executive briefing between [your exec] and [buyer's exec] to discuss strategic fit and timeline."

**Competitor risk:**
- Recommended action: "Bring in [your exec or product leader] to differentiate on [specific feature/capability] where we have an edge."
- Alternative: "Share a reference from [customer name] who evaluated [competitor] and chose us for [reason]."

**Pricing/commercial issue:**
- Recommended action: "Approve [specific discount/concession] to match budget and close by [date]."
- Alternative: "Explore alternative pricing structure (e.g., phased rollout, annual vs multi-year) to fit budget."

**Technical blocker:**
- Recommended action: "Engage [your technical lead or solutions architect] for a deep-dive with their engineering team on [specific concern]."

**Deal going dark:**
- Recommended action: "Reach out directly to [buyer's exec or champion's manager] to assess project status and re-engage."

**Strategic partnership required:**
- Recommended action: "Explore partnership or co-sell with [partner name] to strengthen the deal positioning."

**Rep needs coaching:**
- Recommended action: "Schedule 30-minute deal strategy session to review rescue plan and next steps."

### What NOT to Recommend
- "Please review this deal" (too vague)
- "Let me know what you think" (not actionable)
- "FYI" (not an escalation, just noise)
- "Help" (no specific ask)

## Slack Notification Format

The Slack message should be structured, professional, and actionable. Follow this format:

```
🚨 *Deal Escalation: [Deal Name]*

*Deal:* [Company Name] - [Deal Name]
*Value:* $[Amount]
*Stage:* [Current Stage]
*Close Date:* [Date]
*Risk Level:* [Critical/High/Medium]

*Why escalating:*
[1-2 sentence explanation of the specific issue -- be direct and factual]

*Risk signals:*
• [Signal 1 with data -- e.g., "No activity in 18 days since last demo"]
• [Signal 2 with data -- e.g., "Close date pushed from Jan 15 to Feb 28"]
• [Signal 3 with data -- e.g., "Single-threaded through Sarah Chen (Director), no exec engagement"]

*Recommended action:*
[Specific action request for manager -- e.g., "Request executive alignment call between our VP Sales and their CTO to address technical concerns raised in security review."]

*Context:*
[1-2 sentences of additional context that helps the manager understand the situation -- recent interactions, buyer sentiment, competitive landscape]

*Rep:* [User Name]
*Escalated:* [Timestamp]
```

### Slack Formatting Rules
- Use bold for section headers (`*Section:*`)
- Use bullet points for risk signals
- Include deal value upfront (managers prioritize by $$)
- Be concise -- manager should understand the situation in 30 seconds
- End with a specific ask, not "please advise"

## Internal Tracking Task

Create a task to track the escalation and ensure follow-up:

- **Title**: "Manager escalation: [Deal Name] - [Brief issue]"
- **Description**: Include the full escalation summary, the Slack notification sent, and the expected follow-up timeline.
- **Due date**: Set based on urgency:
  - Critical: today (manager should respond same day)
  - High: tomorrow (manager should respond within 24 hours)
  - Medium: 2 days out (manager should respond within 48 hours)
- **Priority**: high
- **Deal ID**: link to the deal
- **Assigned to**: the user (to track the escalation, not the manager)

The task serves as a reminder to follow up with the manager if no response is received.

## Output Contract

Return a SkillResult with:
- `data.escalation_summary`: object
  - `deal_id`: string
  - `deal_name`: string
  - `company`: string
  - `value`: number
  - `close_date`: string
  - `risk_level`: "critical" | "high" | "medium" | "low"
  - `risk_signals`: string[] (specific signals with data)
  - `reason_for_escalation`: string (1-2 sentence explanation)
  - `recommended_action`: string (specific ask for manager)
  - `escalation_worthy`: boolean (true if meets escalation criteria, false if rep should handle)
  - `alternative_approach`: string | null (if escalation_worthy is false, what should rep do instead?)
- `data.slack_notification`: object
  - `channel`: "slack"
  - `recipient`: string (manager Slack handle)
  - `message`: string (formatted Slack message)
  - `sent`: boolean (true if successfully sent via send-slack-message)
  - `error`: string | null (if send failed)
- `data.task`: object
  - `title`: string
  - `description`: string
  - `due_date`: string (ISO date)
  - `priority`: "high"
  - `deal_id`: string

## Quality Checklist

Before sending the escalation, verify:

- [ ] Risk level is accurate based on the risk assessment framework (not inflated)
- [ ] Escalation is warranted based on criteria (not noise)
- [ ] Risk signals include SPECIFIC data (dates, numbers, names) not vague descriptions
- [ ] Recommended action is SPECIFIC and actionable (not "please review")
- [ ] Slack message is concise (manager can read in 30 seconds)
- [ ] Deal value is prominently displayed (managers prioritize by $$)
- [ ] Manager recipient is correctly identified (Slack handle is valid)
- [ ] Tracking task is created for follow-up
- [ ] If escalation is NOT worthy, alternative approach is provided for the rep
- [ ] Tone is professional and factual (not alarmist or defensive)

## Examples

### Good Escalation (Critical Risk, Executive Alignment Needed)

**Escalation Summary:**
```json
{
  "deal_id": "deal_abc123",
  "deal_name": "Acme Corp - Enterprise Platform",
  "company": "Acme Corp",
  "value": 285000,
  "close_date": "2026-02-28",
  "risk_level": "critical",
  "risk_signals": [
    "No activity in 19 days since last demo on Jan 28",
    "Close date pushed twice: Jan 31 → Feb 14 → Feb 28",
    "Single-threaded through Sarah Chen (Director of Engineering), no VP or C-level engagement",
    "Competitor (DataBricks) mentioned in last meeting transcript as 'also evaluating'"
  ],
  "reason_for_escalation": "Deal is $285K, close date is 12 days away, and we have not engaged the economic buyer. Sarah Chen has gone dark for 19 days. Without executive alignment, this deal will slip or lose to DataBricks.",
  "recommended_action": "Request executive briefing between our VP Sales and Acme's VP of Engineering (Sarah's manager) to discuss strategic fit, timeline, and address any concerns that may be blocking Sarah's engagement.",
  "escalation_worthy": true,
  "alternative_approach": null
}
```

**Slack Message:**
```
🚨 *Deal Escalation: Acme Corp - Enterprise Platform*

*Deal:* Acme Corp - Enterprise Platform
*Value:* $285,000
*Stage:* Proposal
*Close Date:* Feb 28 (12 days)
*Risk Level:* CRITICAL

*Why escalating:*
Deal is $285K with close date in 12 days, but our champion has gone dark for 19 days and we've never engaged the economic buyer. Competitor DataBricks is in active evaluation.

*Risk signals:*
• No activity in 19 days since last demo on Jan 28
• Close date pushed twice: Jan 31 → Feb 14 → Feb 28
• Single-threaded through Sarah Chen (Director), no VP/C-level engagement
• Competitor DataBricks mentioned in last meeting as "also evaluating"

*Recommended action:*
Request executive briefing between our VP Sales and Acme's VP of Engineering (Sarah's manager) to discuss strategic fit and address any concerns blocking Sarah's engagement. Goal: re-engage and differentiate vs. DataBricks before Feb 28 close date.

*Context:*
Last interaction was a positive demo on Jan 28. Sarah said "looks great, we'll review internally." Since then: radio silence. This pattern suggests internal decision-making has shifted to a level above Sarah, and we're not in that conversation.

*Rep:* Alex Rodriguez
*Escalated:* Feb 16, 2026 10:45am
```

### Bad Escalation (Not Worthy)

**User request:** "Flag this deal for my manager"
**Deal context:** $35K deal, in discovery stage, one email sent 3 days ago with no response yet

**Response:**
```json
{
  "escalation_worthy": false,
  "reason": "This deal is $35K in early-stage discovery with only 3 days since last contact. This is normal sales cycle timing and does not meet escalation criteria (deals above $75K with critical risk signals, or blocking issues requiring manager intervention).",
  "alternative_approach": "Standard follow-up: (1) Send a value-add email with a relevant case study or insight (not 'just checking in'), (2) If no response in 7 days, call the contact directly, (3) If still no response after 14 days, send a breakup email. Escalate only if the deal reaches $75K+ and shows multiple critical risk signals."
}
```

## Error Handling

### Manager info not available
If the user's manager Slack handle is not in the system, return an error:
- `slack_notification.sent`: false
- `slack_notification.error`: "Manager Slack handle not found. Update your user profile to enable manager escalations."
- Recommended action: "Update your user profile with your manager's Slack handle, then retry the escalation."

### Deal does not meet escalation criteria
If the deal does not warrant escalation (see "Escalation Worthiness Assessment"), do not send the Slack notification. Instead:
- `escalation_worthy`: false
- `alternative_approach`: [specific guidance for what the rep should do instead]
- Return the analysis so the rep understands why escalation is not recommended

### Slack send fails
If `send-slack-message` action fails (e.g., invalid Slack handle, Slack integration not configured), capture the error:
- `slack_notification.sent`: false
- `slack_notification.error`: [error message from Slack API]
- Still create the tracking task so the rep knows to follow up manually

### Insufficient deal data
If critical deal data is missing (no close date, no value, no stage), include this in the risk signals:
- "Deal data incomplete: missing close date and value. Recommend updating CRM before escalating."
- Proceed with escalation if other signals are strong, but note the data gap as a risk signal itself

### Multiple escalations on same deal
If the deal has already been escalated within the last 7 days, include a note in the Slack message:
- "Note: This deal was previously escalated on [date]. This is a follow-up escalation due to [new development]."
- Avoid re-escalating the same issue without new information -- this is noise

## Tone and Presentation

- Be direct and factual. "No activity in 19 days" not "the deal seems to be struggling."
- Use data and specifics. "Close date pushed from Jan 31 to Feb 28" not "timeline is slipping."
- Frame the ask clearly. "Request executive briefing between [your exec] and [buyer's exec]" not "maybe we should consider executive involvement?"
- Be honest about risk. If the deal is likely lost, say so: "Probability of close is low without immediate intervention."
- Respect the manager's time. The Slack message should be scannable in 30 seconds.
- If escalation is NOT warranted, explain why and guide the rep to the right next steps. This is coaching, not gatekeeping.
- Escalations should be rare, valuable, and actionable. The manager should WANT to receive them, not dread them.
