---
name: Deal Next Best Actions
description: |
  Generate a ranked action plan for advancing a specific deal based on its stage,
  recent activity, and your capacity. Use when a user asks "what should I do next
  on this deal", "next steps for the Acme deal", or "how do I move this deal forward".
  Returns prioritized actions with ROI rationale and time estimates.
metadata:
  author: sixty-ai
  version: "2"
  category: sales-ai
  skill_type: atomic
  is_active: true
  context_profile: sales
  agent_affinity:
    - pipeline
  triggers:
    - pattern: "next steps for this deal"
      intent: "deal_next_actions"
      confidence: 0.90
      examples:
        - "what should I do next on this deal"
        - "next best actions for this deal"
        - "what are the next steps"
    - pattern: "how do I move this deal forward"
      intent: "deal_advancement"
      confidence: 0.85
      examples:
        - "how to advance this deal"
        - "move this deal forward"
        - "push this deal to the next stage"
    - pattern: "deal action plan"
      intent: "deal_actions"
      confidence: 0.80
      examples:
        - "action plan for this deal"
        - "what actions should I take on this deal"
        - "recommend actions for this deal"
  keywords:
    - "next steps"
    - "actions"
    - "deal"
    - "advance"
    - "move forward"
    - "priorities"
    - "what to do"
    - "recommendations"
  required_context:
    - deal_id
    - company_name
  inputs:
    - name: deal_id
      type: string
      description: "The deal identifier to generate next best actions for"
      required: true
    - name: deal_context
      type: object
      description: "Additional deal context such as recent activity or health signals"
      required: false
    - name: user_capacity
      type: string
      description: "User's current workload level affecting action volume"
      required: false
      default: "normal"
      example: "busy"
  outputs:
    - name: actions
      type: array
      description: "Ranked action items with type, priority, ROI rationale, and time estimates"
    - name: priorities
      type: object
      description: "Summary of priority distribution across actions"
    - name: roi_rationale
      type: string
      description: "Overall rationale for the recommended action plan"
    - name: minimum_viable_action
      type: object
      description: "Single most important action if user is busy"
  requires_capabilities:
    - crm
  priority: high
  tags:
    - sales-ai
    - deals
    - actions
    - pipeline
    - prioritization
---

# Deal Next Best Actions

## Goal
Generate a ranked, prioritized action plan for advancing a deal based on stage, activity patterns, and capacity. This is not a generic checklist -- it is a situational analysis that reads the deal's signals, diagnoses what is blocking progress, and prescribes the specific actions with the highest probability of moving this deal to close.

## Why Prescriptive Actions Matter

The difference between a good rep and a great rep is not effort -- it is allocation. Data consistently shows:

- **Top-performing reps spend 65% of their time on deals they will win** (Salesforce State of Sales, 2023). Average reps spread time evenly, wasting 40%+ on dead deals.
- **The #1 reason deals stall is inaction, not objections** (Gong Labs, analysis of 70,000+ deals). 56% of "lost" deals were actually "abandoned" -- the rep stopped doing things, not because the buyer said no.
- **Deals that receive a meaningful seller action every 5-7 business days close at 2.3x the rate** of deals with gaps longer than 14 days (InsightSquared pipeline analytics).
- **The right action at the right time matters more than volume.** A single well-timed executive introduction outperforms 10 follow-up emails (RAIN Group, What Sales Winners Do Differently).
- **Reps who follow a next-best-action framework achieve 23% higher quota attainment** than reps who rely on intuition alone (CSO Insights, 2022).

The goal is not "do more" -- it is "do the one thing that moves the needle most, right now."

## Required Capabilities
- **CRM**: To fetch deal data, stage, recent activity, and related records

## Inputs
- `deal_id`: The deal identifier (required)
- `user_capacity` (optional): "busy" | "normal" | "available" -- affects action volume
- `organization_id`: Current organization context (from session)

## Data Gathering (via execute_action)
1. Fetch deal: `execute_action("get_deal", { id: deal_id })` -- stage, value, close date, contacts, health
2. Fetch pipeline summary: `execute_action("get_pipeline_summary", {})` -- overall pipeline context
3. Fetch recent activities: `execute_action("get_deal_activities", { deal_id, limit: 20 })` -- meeting history, emails, calls
4. Fetch tasks: `execute_action("list_tasks", { deal_id })` -- existing planned actions
5. Fetch contacts needing attention: `execute_action("get_contacts_needing_attention", { days_since_contact: 7, filter: "at_risk" })` -- engagement gaps

If any data call fails, proceed with available data. Note the gap and adjust recommendations accordingly.

## Action Prioritization Framework

### The Impact-Urgency-Effort Matrix

Every potential action is scored on three dimensions:

**Impact (1-5):** How much does this action advance the deal toward close?
- 5: Directly creates a commitment or removes a blocker (executive meeting, contract sent, objection resolved)
- 4: Builds significant momentum (demo, reference call, business case delivered)
- 3: Maintains engagement and advances understanding (follow-up email with value, discovery call)
- 2: Administrative or preparatory (CRM update, internal alignment, research)
- 1: Low-value activity (generic check-in, non-specific follow-up)

**Urgency (1-5):** What is the cost of delay?
- 5: Window closing within 48 hours (competitor eval ending, budget cycle closing, champion leaving)
- 4: Overdue or time-sensitive (close date approaching, no activity in 14+ days, stakeholder requested response)
- 3: Should happen this week (scheduled follow-up, pending deliverable, next milestone approaching)
- 2: Important but not time-critical (relationship building, long-term positioning)
- 1: Can wait without consequence (nice-to-have research, optional optimization)

**Effort (inverted, 1-5):** How easy is it to execute? Lower effort scores higher.
- 5: Under 15 minutes (send email, make call, update CRM)
- 4: 15-30 minutes (prepare brief, schedule meeting, send document)
- 3: 30-60 minutes (build presentation, write proposal section, conduct research)
- 2: 1-3 hours (create ROI model, prepare custom demo, build business case)
- 1: Half-day or more (full proposal, executive presentation, POC setup)

**Priority Score = Impact x Urgency x Effort (inverted)**
- Score 75-125: **Urgent** -- do today
- Score 40-74: **High** -- do this week
- Score 15-39: **Medium** -- schedule for next week
- Score 1-14: **Low** -- batch with other work or delegate

### Capacity Adjustment

Adjust action volume based on user capacity:

| Capacity | Max Actions | Focus |
|----------|-------------|-------|
| **busy** | 1 (minimum_viable_action only) | Highest-impact single action that takes <15 min |
| **normal** | 3-5 | Top actions across impact/urgency spectrum |
| **available** | 5-8 | Full action plan including preparation and optimization |

When capacity is "busy," the minimum_viable_action MUST be executable in under 15 minutes and have the highest combined impact + urgency score. Reps drowning in work need one clear thing to do, not a list.

## Stage-Specific Action Playbooks

See `references/action-library.md` for the full action catalog with impact ratings, effort levels, and templates for each action type. See `references/stage-playbooks.md` for complete stage-by-stage playbooks with exit criteria, risk indicators, and time limits.

### Stage 1-2: Discovery / Qualification

**Primary objective:** Validate that this deal is worth pursuing and establish the buying process.

**Highest-impact actions at this stage:**
1. **Multi-thread into the account** (Impact: 5). Connect with 3+ stakeholders. Single-threaded deals close at 5% vs. 17% for multi-threaded (Gong). Specific action: identify the economic buyer, technical evaluator, and end-user champion.
2. **Quantify the pain** (Impact: 5). Move from "we have a problem" to "this problem costs us $X/month." Without a number, there is no urgency and no budget justification.
3. **Map the buying process** (Impact: 4). Ask explicitly: "Walk me through how your company evaluates and purchases solutions like this." This question alone accelerates deals by 12% (Corporate Visions research).
4. **Confirm BANT/MEDDIC criteria** (Impact: 4). Budget: is there money? Authority: who decides? Need: is the pain real? Timeline: is there a forcing function?
5. **Send a meeting recap with insights** (Impact: 3, Effort: 5). Within 24 hours of a discovery call, send a recap that demonstrates you listened and adds insight they did not have.

**Red flags to check:** No response after discovery call (48h), only one contact engaged, no mention of budget or timeline, "just exploring" language without specifics.

### Stage 3-4: Evaluation / Demo

**Primary objective:** Prove ${company_name}'s solution solves their specific problem better than alternatives.

**Highest-impact actions at this stage:**
1. **Deliver a customized demo** (Impact: 5). Generic demos close at 20% vs. 45% for demos tailored to the buyer's specific use case and data (Consensus benchmark data).
2. **Introduce a reference customer** (Impact: 5). Peer validation is the #1 trust accelerator. Same industry, same problem, measurable results. Time it for after the demo, before the proposal.
3. **Create the business case / ROI model** (Impact: 5). Shift the conversation from "does this work?" to "how much is it worth?" Quantify cost of inaction, implementation cost, time to value, and 3-year return.
4. **Engage the economic buyer** (Impact: 4). If you have only been talking to evaluators, the deal is at risk. Request an executive alignment meeting: "We want to make sure ${company_name}'s solution aligns with [exec name]'s priorities."
5. **Identify and address the competitor** (Impact: 4). If you do not know who else they are evaluating, ask directly. Then position: do not attack the competitor, differentiate on the buyer's specific criteria.

**Red flags to check:** Demo requested but keeps getting postponed, technical team engaged but no executive sponsor, evaluation criteria not shared, "we need to see more" without specific asks.

### Stage 5-6: Negotiation / Proposal

**Primary objective:** Remove obstacles between "yes" and signature.

**Highest-impact actions at this stage:**
1. **Send the proposal/contract** (Impact: 5, Urgency: 5). Every day without a proposal in hand is a day the deal can die. If you are waiting to "make it perfect," send it now and iterate.
2. **Pre-wire the negotiation** (Impact: 5). Before formal negotiation, have an informal conversation with your champion: "What concerns do you think [economic buyer] will have? What would make this a no-brainer?" This prevents surprises.
3. **Map procurement requirements** (Impact: 4). Ask: "What does your procurement process look like? Do you need vendor registration, security review, legal review? How long does each take?" Then build those into the timeline.
4. **Offer a concession strategy** (Impact: 4). Have 2-3 concessions ready (extended payment terms, additional training, pilot period) that cost you little but give the buyer something to "win" in negotiation.
5. **Create urgency with a deadline** (Impact: 3). Use a real constraint: pricing validity, implementation team availability, or fiscal year alignment. Artificial urgency backfires.

**Red flags to check:** "Let me think about it" without a next step, new stakeholders appearing late, legal review expanding scope, radio silence after proposal sent.

### Stage 7+: Closing

**Primary objective:** Get to signature and set up for successful implementation.

**Highest-impact actions at this stage:**
1. **Resolve the final objection** (Impact: 5). There is always one last thing. Find it and address it directly. Call your champion: "Is there anything between us and getting this signed this week?"
2. **Make signing frictionless** (Impact: 5). E-sign link, not a PDF to print. Pre-filled where possible. Clear instructions on who signs and where.
3. **Preview the implementation plan** (Impact: 4). Show them what happens AFTER they sign. This reduces the perceived risk of commitment and makes signing feel like progress, not a leap of faith.
4. **Align on success metrics** (Impact: 3). Before they sign, agree on how you will both measure success in the first 90 days. This sets up the relationship and reduces post-purchase regret.

**Red flags to check:** Contract sent but not opened, champion going quiet, new decision-maker surfaced, "we need one more meeting," close date pushed for the second time.

## Activity Pattern Analysis

Read `references/action-library.md` for the complete re-engagement action catalog with templates for each silence duration (7-day, 14-day, 21-day, 30+ day gaps).

Beyond stage-specific actions, analyze the deal's activity patterns to detect systemic issues:

### Staleness Detection
- **No activity in 7+ days**: Engagement is cooling. Priority action: re-engage with a value-add (insight, article, introduction), NOT a "just checking in" email.
- **No activity in 14+ days**: Deal is at risk of dying. Priority action: direct outreach to champion with a specific question that requires a response. If no response in 48 hours, call.
- **No activity in 21+ days**: Deal is likely dead. Priority action: send a "breakup" email -- "I have not heard back, so I am going to assume the timing is not right. If things change, I am here." This paradoxically re-engages 15-20% of stalled deals (Gong).

### Ghosting Detection
- **You sent 2+ messages with no response**: Stop emailing. Switch channels (call, LinkedIn, text). Or go around the contact to a different stakeholder.
- **Meetings keep getting rescheduled**: The buyer is deprioritizing you. Escalate urgency by introducing a constraint or new value.
- **"Let me get back to you" repeated 3+ times**: The buyer is avoiding a "no." Address it directly: "I want to be respectful of your time. Are you still considering this, or has something changed?"

### Multithreading Analysis
- **Only 1 contact engaged**: Critical risk. Multi-threaded deals close at 3x the rate. Action: ask your contact to introduce you to the technical evaluator and the economic buyer.
- **2-3 contacts engaged**: Good but not safe. Action: identify who is missing (usually the economic buyer or the end-user champion) and find a path to them.
- **4+ contacts engaged**: Strong position. Action: ensure all stakeholders are aligned on the same evaluation criteria and timeline.

### Engagement Momentum
- **Increasing activity (more meetings, faster responses)**: The deal has momentum. Do not slow it down. Match the buyer's pace.
- **Decreasing activity (longer gaps, shorter responses)**: Momentum is dying. Diagnose why: competing priorities? Unresolved objection? New competitor? Address the root cause, not the symptom.
- **Sporadic activity (intense burst, then silence, then burst)**: The buyer is evaluating multiple vendors in rounds. You need to win each round. Ask where you stand relative to alternatives.

## ROI Rationale Framework

Every recommended action must include a rationale explaining WHY this action will advance the deal. The rationale should connect the action to a measurable outcome:

**Good Rationale Examples:**
- "Schedule a reference call because peer validation reduces evaluation time by 35% and the buyer has been in evaluation for 3 weeks with no clear movement toward a decision."
- "Send the ROI model because the economic buyer has not been engaged and cannot justify the budget without quantified value. Deals without a business case close at 12% vs. 38% with one."
- "Multi-thread into engineering because the champion is the only contact. If they go on vacation, change roles, or get overruled, this deal dies. Adding 2 contacts reduces single-point-of-failure risk."

**Bad Rationale Examples:**
- "Follow up because it's been a while" (no insight, no data, no specificity)
- "Update the CRM" (administrative, not deal-advancing)
- "Check in with the prospect" (what will this accomplish?)

## Output Contract

Return a SkillResult with:
- `data.actions`: Array of action objects (ranked by priority score):
  - `action_type`: "email" | "call" | "meeting" | "task" | "crm_update" | "research" | "internal_alignment" | "reference_call" | "proposal" | "demo"
  - `title`: Action title (specific and actionable)
  - `description`: What to do (detailed enough to execute without follow-up questions)
  - `priority`: "urgent" | "high" | "medium" | "low"
  - `priority_score`: number (Impact x Urgency x Effort)
  - `roi_rationale`: Why this action matters -- connect to data or deal-specific signal
  - `estimated_time`: Time estimate in minutes
  - `deadline`: Recommended deadline (ISO date)
  - `owner`: Suggested owner (user's name or role)
  - `dependencies`: Other actions this depends on (array of action titles or empty)
- `data.priorities`: Summary of priority distribution (how many urgent/high/medium/low)
- `data.roi_rationale`: Overall rationale for the action plan (2-3 sentences explaining the strategy)
- `data.minimum_viable_action`: The single most important action if user is busy (must be <15 min effort)
- `data.stage_insights`: Insights about deal stage and what typically works at this stage

## Quality Checklist

Before returning the action plan, verify:

- [ ] Actions are ranked by priority score, not alphabetically or randomly
- [ ] Every action has a specific ROI rationale tied to THIS deal's situation, not generic advice
- [ ] Time estimates are realistic (not everything is "5 minutes")
- [ ] The minimum_viable_action is genuinely the highest-impact thing the rep can do in under 15 minutes
- [ ] Actions account for existing open tasks (no duplicates)
- [ ] If activity gap is detected (7+ days), re-engagement is the #1 priority
- [ ] If only 1 contact is engaged, multi-threading is in the top 3 actions
- [ ] Actions match the deal stage (not recommending a discovery call for a deal in negotiation)
- [ ] At least one action involves the BUYER doing something (not all seller-side)
- [ ] Deadlines are specific dates, not "soon" or "next week"
- [ ] If the deal has a close date, actions are aligned to that timeline
- [ ] The overall rationale tells a coherent story about WHERE this deal is and WHAT moves it forward

## Error Handling

### Deal not found or data incomplete
If the deal record is missing critical fields (stage, value, close date), return actions focused on data completion: "Update deal stage and close date in CRM" as the first action, then provide best-effort recommendations based on available data.

### No activity history available
Without activity data, you cannot detect staleness or ghosting. Default to stage-appropriate actions and flag: "No activity history available. These recommendations are based on deal stage only. Connect activity tracking for more precise prioritization."

### Deal is in a very early stage with minimal data
If the deal is in Stage 1 with only a name and company, the actions should focus entirely on discovery: research the company, identify stakeholders, prepare discovery questions, schedule the first call. Do not recommend evaluation or closing actions.

### Deal appears to be dead (no activity 30+ days, past close date)
Be honest: "This deal shows no activity in [X] days and the close date has passed. Before investing time, confirm with the buyer that the opportunity is still active. If no response in 48 hours, mark as lost and reallocate your time." Provide a "reactivation" action as the minimum_viable_action, not a full plan for a potentially dead deal.

### User capacity is "busy" but the deal is critical
If the deal is high-value and high-urgency but the user is busy, note the tension: "This is your most critical deal, but you indicated limited capacity. The minimum viable action is [X]. However, this deal is at risk of slipping if [Y] is not addressed this week. Consider delegating [Z] to free up 30 minutes."

### Multiple conflicting signals
When data signals conflict (e.g., buyer says "we're excited" but activity is declining), prioritize behavioral signals over verbal ones. What people DO is more predictive than what they SAY. Note the discrepancy in the rationale.

### Too many open tasks already
If the deal already has 10+ open tasks, do not add more. Instead, prioritize the existing tasks: "You have [X] open tasks on this deal. Before adding new actions, complete or close these: [top 3 by impact]. Task overload causes paralysis, not progress."

## Tone and Presentation

- Be direct and specific. "Send a 3-bullet email to Sarah Chen summarizing the ROI model" not "Consider reaching out to the prospect."
- Explain the WHY in plain language. Reps follow advice they understand and believe, not advice that sounds generic.
- Be honest about dead or dying deals. Reps waste enormous time on deals they should abandon. Saying "this deal may not be worth your time" is valuable advice.
- Frame actions as experiments, not mandates. "Try this because the data shows..." not "You must do this."
- Acknowledge trade-offs. "This action takes 45 minutes, which is significant when you are busy, but it addresses the #1 blocker on your highest-value deal."
