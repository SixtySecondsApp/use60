---
name: Deal Rescue Plan
description: |
  Diagnose an at-risk deal and produce a rescue plan with concrete tasks.
  Use when a user asks "rescue this deal", "this deal is at risk what should I do",
  "save this deal", or needs a turnaround strategy for a struggling opportunity.
  Returns diagnosis, ranked rescue actions, and MAP tasks.
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
    - pattern: "rescue this deal"
      intent: "deal_rescue"
      confidence: 0.90
      examples:
        - "help me rescue this deal"
        - "save this deal"
        - "this deal needs rescuing"
    - pattern: "deal is at risk"
      intent: "deal_risk_response"
      confidence: 0.85
      examples:
        - "this deal is at risk what should I do"
        - "my deal is slipping"
        - "deal in trouble"
    - pattern: "turnaround plan for deal"
      intent: "deal_turnaround"
      confidence: 0.80
      examples:
        - "turn this deal around"
        - "recovery plan for this deal"
        - "what can I do to save this opportunity"
  keywords:
    - "rescue"
    - "save"
    - "at risk"
    - "slipping"
    - "trouble"
    - "turnaround"
    - "recovery"
    - "deal"
  required_context:
    - deal
    - company_name
  inputs:
    - name: deal_id
      type: string
      description: "The deal identifier to diagnose and create a rescue plan for"
      required: true
    - name: deal_context
      type: object
      description: "Additional deal context such as recent activity, health data, or notes"
      required: false
  outputs:
    - name: diagnosis
      type: object
      description: "Root cause diagnosis with why_at_risk, missing_info, and confidence level"
    - name: rescue_plan
      type: array
      description: "Ranked rescue actions with ROI rationale and time estimates"
    - name: map_tasks
      type: array
      description: "Concrete MAP tasks with title, description, due date, and priority"
  priority: critical
  requires_capabilities:
    - crm
---

# Deal Rescue Plan

## Goal
Turn an at-risk deal into an executable rescue plan. This is not about optimism or "staying positive" -- it is a clinical diagnosis of what went wrong, a clear-eyed assessment of whether the deal is salvageable, and if it is, a specific 72-hour action plan to get it back on track.

## Why Deal Rescue Matters

Most "lost" deals were not lost -- they were abandoned too early or rescued too late. The data:

- **38% of deals marked "lost" were actually salvageable** with the right intervention at the right time (CSO Insights, 2022). Reps gave up because they did not know what to do, not because the buyer said no.
- **The average B2B deal goes dark 2.7 times** before closing (Gong Labs, 70,000+ deal analysis). Going dark is not death -- it is a normal part of complex buying. But STAYING dark for 21+ days IS death.
- **72 hours is the rescue window.** After a deal shows risk signals, you have roughly 72 hours to intervene before the buyer's attention permanently shifts elsewhere (Forrester B2B Buying Study). After that, the cost of re-engagement increases 4x.
- **Rescue attempts that use a different channel succeed 2.5x more often** than repeating the same failed approach (RAIN Group). If email stopped working, switch to phone. If phone stopped working, go through a different contact. If all direct channels fail, use a mutual connection.
- **The #1 predictor of successful deal rescue is accurate diagnosis.** Teams that correctly identify WHY a deal stalled recover 3x more often than teams that just "try harder" with the same approach (Winning by Design).

The cost of NOT attempting rescue is also significant: acquiring a new opportunity to replace a lost one costs 5-8x more than saving the existing one (Pacific Crest SaaS Survey).

## Required Capabilities
- **CRM**: To fetch deal data, contacts, activities, health signals, and pipeline context

## Inputs
- `deal_id`: The deal identifier (required)
- `deal_context`: Additional context such as recent notes, health data, or known risk factors (optional)

## Data Gathering (via execute_action)

Gather all available data before diagnosing. The more context you have, the more accurate the diagnosis:

1. **Deal record**: `execute_action("get_deal", { id: deal_id })` -- stage, value, close date, contacts, health score, days in stage
2. **Activity history**: `execute_action("get_deal_activities", { deal_id, limit: 30 })` -- all meetings, emails, calls, notes (look for patterns)
3. **Open tasks**: `execute_action("list_tasks", { deal_id })` -- overdue tasks, incomplete actions
4. **Contacts on deal**: from deal record -- engagement levels, last contact dates, roles
5. **Pipeline context**: `execute_action("get_pipeline_summary", {})` -- how this deal fits in the overall pipeline

If data calls fail, note what is missing and include "information gathering" as the first rescue action.

## Root Cause Analysis Framework

Consult `references/risk-signals.md` for the comprehensive risk signal taxonomy with detection methods, severity ratings, accuracy data, and false positive indicators. Use `references/rescue-playbooks.md` for detailed rescue playbooks with email templates, call scripts, and escalation paths for each root cause type.

Before prescribing a rescue plan, diagnose the root cause. Incorrect diagnosis leads to wasted effort. These are the 8 most common reasons deals die, listed by frequency:

### 1. Champion Has Gone Dark (28% of at-risk deals)

**Signals:**
- No response to last 2+ outreach attempts
- Meeting cancelled or rescheduled without rebooking
- Email open rates dropped (if tracked)
- Last meaningful interaction was 14+ days ago

**Why it happens:**
- Champion is overwhelmed with internal priorities
- Champion lost internal political support for the initiative
- Champion changed roles, went on leave, or left the company
- Champion is evaluating a competitor and avoiding the awkward conversation
- Your emails became predictable and ignorable

**Diagnosis confidence:** HIGH if last 3+ messages received no substantive response. MEDIUM if 1-2 messages unanswered (could just be busy).

### 2. No Compelling Event / Lack of Urgency (22%)

**Signals:**
- "We're interested but no rush"
- Close date has been pushed 2+ times
- No specific timeline or deadline mentioned
- Buyer is "evaluating" with no decision date
- Deal has been in the same stage for 2x the average stage duration

**Why it happens:**
- The pain is real but not urgent (nice-to-have, not must-have)
- No budget cycle forcing a decision
- No regulatory, competitive, or operational deadline
- Status quo is tolerable even if not ideal
- The initiative does not have executive sponsorship

**Diagnosis confidence:** HIGH if close date pushed 2+ times AND no compelling event identified. MEDIUM if deal is simply slow-moving.

### 3. Missing or Blocked Economic Buyer (18%)

**Signals:**
- All conversations are with evaluators, not decision-makers
- "I need to run this by my boss" keeps coming up
- Champion says "we love it" but the deal does not progress
- No access to budget authority
- Proposal has been "under review" for 2+ weeks

**Why it happens:**
- Champion does not have the authority they implied
- Economic buyer has not been engaged and does not feel ownership
- Economic buyer has different priorities than the champion
- Budget is controlled at a level above your contact
- Internal politics are blocking the initiative from reaching decision-makers

**Diagnosis confidence:** HIGH if no meeting or email interaction with the economic buyer AND deal is past evaluation stage. MEDIUM if economic buyer was engaged but went silent.

### 4. Competitor Gained Advantage (12%)

**Signals:**
- Buyer asking about features you do not have (competitor positioning)
- New evaluation criteria introduced late in the process
- Buyer requesting a pricing match or "best and final offer"
- Reference to "another solution" or "the other vendor"
- Sudden request for a detailed comparison or security review (competitor is doing this)

**Why it happens:**
- Competitor offered a better deal, bundled pricing, or strategic partnership
- Competitor has a stronger relationship with a senior stakeholder
- Competitor is better positioned on a specific feature or requirement that matters
- The buyer is using you as leverage to get a better price from the competitor (Column A vs Column B)

**Diagnosis confidence:** HIGH if buyer mentioned a competitor by name or introduced new evaluation criteria late. MEDIUM if behavior patterns suggest comparison shopping.

### 5. Budget Issue (10%)

**Signals:**
- "We need to revisit the budget"
- Request for dramatic pricing reduction (30%+)
- Budget cycle reset or fiscal year change
- Hiring freeze or cost-cutting announcement at the buyer's company
- Champion says "we have the budget" but procurement says otherwise

**Why it happens:**
- Original budget was aspirational, not approved
- Budget was reallocated to a higher-priority initiative
- Economic conditions changed (market downturn, missed earnings, leadership change)
- The internal business case was not strong enough to survive budget scrutiny
- The deal is real but the buyer's cash flow timing does not match your pricing structure

**Diagnosis confidence:** HIGH if buyer explicitly mentioned budget constraints. MEDIUM if budget has never been confirmed and deal is stalling.

### 6. Technical or Integration Blocker (8%)

**Signals:**
- Technical evaluation stalled or returned "concerns"
- Security review flagged issues
- Integration requirements expanded beyond original scope
- IT/engineering team raised objections
- POC/pilot did not meet expectations

**Why it happens:**
- Technical requirements were not fully understood during discovery
- The buyer's environment has constraints you did not anticipate
- A technical stakeholder was not involved early enough and is now blocking
- The buyer's technical team favors a different architecture or vendor
- Your product genuinely cannot do what they need (and rescue may not be possible)

**Diagnosis confidence:** HIGH if a specific technical objection has been raised. MEDIUM if technical team is simply "still reviewing."

### 7. Internal Organizational Change (7%)

**Signals:**
- Champion announced new role, departure, or restructuring
- Project deprioritized due to company-wide strategy shift
- New leadership with different priorities
- M&A activity at the buyer's company
- Hiring freeze or layoffs affecting the team sponsoring the initiative

**Why it happens:**
- Organizations change constantly. Your deal exists in a political context that can shift overnight.
- New leaders bring new priorities and often cancel predecessor initiatives
- M&A creates uncertainty -- all purchasing decisions freeze until the dust settles
- Restructuring changes reporting lines, budgets, and authority

**Diagnosis confidence:** HIGH if a specific organizational change is known. MEDIUM if the buyer has gone quiet without explanation (organizational change is a common hidden cause).

### 8. Poor Discovery / Bad Fit (5%)

**Signals:**
- Buyer keeps asking "but can it do X?" where X is outside ${company_name}'s product
- Implementation scope keeps expanding
- Buyer's actual use case diverges from what was discussed in discovery
- Multiple demos without clear next steps
- "We like it, but it's not quite what we need"

**Why it happens:**
- Discovery was too shallow -- you pitched before you understood
- The rep projected what they wanted to hear, not what the buyer said
- The buyer's needs evolved during the evaluation
- The product genuinely is not the right fit (and rescue means graceful disqualification)

**Diagnosis confidence:** HIGH if the buyer has explicitly stated a gap between ${company_name}'s solution and their needs. MEDIUM if there is a pattern of expanding requirements.

## The 72-Hour Rescue Window Methodology

Once the root cause is diagnosed, execute this rescue framework within 72 hours. Speed is the single most important factor in deal rescue.

### Hour 0-4: Diagnose and Plan

1. **Confirm the diagnosis.** Review all data. Identify the primary root cause and any secondary factors.
2. **Assess salvageability.** Not every deal should be rescued (see "When to Walk Away" below).
3. **Choose the rescue strategy** based on root cause (see Rescue Strategy Playbook below).
4. **Identify the right contact.** The rescue attempt should go to the person with the most influence and the most to gain from the deal succeeding. This may NOT be your current primary contact.
5. **Prepare the rescue message or action.** It must be specific, valuable, and different from what you have been doing.

### Hour 4-24: Execute the Primary Rescue Action

The first rescue action must be:
- **High-value:** Bring something new -- an insight, a resource, an introduction, a concession
- **Channel-switched:** If email failed, call. If calls failed, try LinkedIn. If all direct channels failed, go through a different stakeholder or a mutual connection.
- **Specific:** Reference the last meaningful interaction. Show you remember where the conversation was.
- **Low-pressure:** Acknowledge the silence without guilt-tripping. "I noticed we haven't connected recently" not "I've sent you 4 emails."

### Hour 24-48: Escalate or Expand

If the primary rescue action gets a response:
- Great. You are back in motion. Propose a specific next step with a date and time.

If the primary rescue action gets no response:
- Go around. Contact a different stakeholder. Ask your champion's colleague about the project status.
- Go above. If appropriate, have your executive reach out to their executive (executive sponsor alignment).
- Go lateral. Use a mutual connection, a partner, or an industry event to reconnect.

### Hour 48-72: Make the Decision

If no response after 72 hours of multi-channel, multi-contact rescue attempts:
- Send the "honest check-in": "I want to be respectful of your time. It seems like the timing may not be right for [project]. If things change, I'm here. In the meantime, I'll close this out on my end."
- This is not giving up -- it is creating psychological tension. The fear of loss (the breakup email) re-engages 15-20% of stalled deals within 48 hours.
- If no response to the breakup email, move the deal to "closed-lost" with a clear reason and a reactivation reminder for 90 days.

## Rescue Strategy Playbook by Root Cause

### Rescue: Champion Gone Dark
1. **Switch channels.** Call instead of email. Leave a voicemail referencing a specific conversation point.
2. **Go around.** Reach out to another stakeholder on the deal. "Hi [Name], I had been working with [Champion] on [project]. I wanted to check in on the project status -- is it still moving forward?"
3. **Add value.** Share a relevant article, case study, or data point. Make it about their business, not ${company_name}'s product.
4. **Use the breakup email** after 72 hours of silence across all channels.

### Rescue: No Compelling Event
1. **Create urgency with data.** Quantify the cost of inaction: "Every month this project is delayed costs your team approximately $X in [lost productivity / missed revenue / compliance risk]."
2. **Introduce a constraint.** Implementation capacity, pricing validity, or team availability. It must be real -- artificial urgency destroys trust.
3. **Find an internal deadline.** Ask: "Is there a board meeting, budget cycle, or regulatory deadline that would make it important to have this in place by a specific date?"
4. **Propose a smaller first step.** If the full project feels too big to commit to, offer a paid pilot or a phased approach with a shorter time commitment.

### Rescue: Missing Economic Buyer
1. **Ask directly.** "For us to make this happen, who else needs to be involved in the decision? I want to make sure we address their priorities too."
2. **Offer an executive briefing.** "Would it be helpful if my [VP/CEO] had a 15-minute call with [their executive] to discuss strategic alignment?"
3. **Create a business case document.** Give your champion ammunition. Build the ROI model, the risk analysis, and the executive summary they need to sell internally.
4. **Name the pattern.** "In our experience, projects like this sometimes stall when the budget holder hasn't been directly involved. Would it help to include them in the next conversation?"

### Rescue: Competitor Gained Advantage
1. **Ask directly about the competitive landscape.** "I want to make sure we're focused on the right things. Are you evaluating other solutions? What criteria matter most?"
2. **Differentiate on THEIR criteria.** Do not list every feature you have. Focus on the 2-3 things that matter most to THIS buyer and where you win.
3. **Bring a reference.** A peer in their industry who evaluated the same competitor and chose you. This is the most powerful competitive weapon.
4. **Match strategically, not desperately.** If they are asking for a price match, counter with value: "We're not the cheapest option, but here's why our customers see 3x ROI vs. the alternative."

### Rescue: Budget Issue
1. **Restructure the deal.** Offer phased implementation, deferred payment, or a smaller initial scope that fits the current budget.
2. **Build the ROI case.** If the budget was cut, the business case was not strong enough. Rebuild it with harder numbers.
3. **Time it to the budget cycle.** If budget is gone for this fiscal year, agree on a "fast-start" plan for the new fiscal year with commitment now.
4. **Explore alternative budget holders.** Sometimes a different department has budget for the same initiative.

### Rescue: Technical Blocker
1. **Get specific about the blocker.** "What specific concern was raised? I want to make sure we address the exact issue."
2. **Bring in your technical team.** Schedule a technical deep-dive between your engineer and their engineer.
3. **Offer a POC focused on the blocker.** "Let us prove that the integration works in your environment. We'll set it up at no cost in [X] days."
4. **Address security concerns proactively.** If security is the issue, provide SOC 2 report, pen test results, DPA, and direct access to your security team.

### Rescue: Organizational Change
1. **Map the new landscape.** Who is now in charge? What are their priorities? Do they know about this initiative?
2. **Offer a fresh start.** Reach out to the new decision-maker with a brief executive summary. Do not assume they know or care about the history.
3. **Leverage your champion.** If your champion moved to a new role but is still at the company, they may be able to introduce you to their successor.
4. **If M&A: wait.** Do not push during active M&A. Set a reminder for 90 days post-close and re-engage then.

### Rescue: Poor Discovery / Bad Fit
1. **Be honest.** If ${company_name}'s product genuinely cannot do what they need, say so. "Based on what I'm hearing, I'm not sure we're the best fit for [specific requirement]. Let me explain what we can and cannot do."
2. **Narrow the scope.** If the full use case is a bad fit, maybe a subset works. "We can't do X, but we're excellent at Y. Would it make sense to start there?"
3. **Refer gracefully.** If the fit is truly wrong, refer them to a partner or even a competitor. This builds long-term trust and reputation. The deal you lose honestly becomes the referral you win later.

## When to Walk Away (Disqualification Signals)

Not every deal should be rescued. Attempting to save an unsalvageable deal wastes time, energy, and pipeline credibility. Walk away when:

- **The buyer's need has genuinely disappeared.** The project was cancelled, the regulation was repealed, the competitor threat evaporated. No amount of selling can create a need that does not exist.
- **Your product truly cannot solve their problem.** If the gap is fundamental (not a feature request but an architectural mismatch), rescue is impossible and attempting it destroys credibility.
- **The economic buyer is actively hostile.** If a senior leader has explicitly vetoed this initiative, going around them is career-damaging for your champion and relationship-destroying for you.
- **The buyer is using you for leverage.** If you have clear evidence they have already decided on a competitor and are using your proposal only to negotiate a better price, stop investing time.
- **The deal economics do not work.** If the price they want is below your cost, or the scope they need would make the deal unprofitable, walking away is the right business decision.
- **You have been ghosted after a breakup email.** If the breakup email gets no response, accept the loss. Do NOT send a second breakup email.

When disqualifying, log the reason in the CRM (for forecasting accuracy and pattern analysis), set a reactivation reminder for 6 months, and reallocate your time to winnable deals.

## Output Contract

Return a SkillResult with:
- `data.diagnosis`: object
  - `why_at_risk`: string (specific root cause from the 8-cause framework, not generic "deal is stalling")
  - `root_cause_type`: string ("champion_dark" | "no_compelling_event" | "missing_economic_buyer" | "competitor_advantage" | "budget_issue" | "technical_blocker" | "organizational_change" | "poor_fit")
  - `supporting_signals`: string[] (specific evidence from the deal data that supports this diagnosis)
  - `missing_info`: string[] (information needed to confirm the diagnosis)
  - `confidence`: "high" | "medium" | "low" (based on signal strength)
  - `salvageable`: boolean (honest assessment of whether rescue is worth attempting)
  - `salvageable_rationale`: string (why or why not -- if not salvageable, recommend disqualification)
- `data.rescue_plan`: array of 3-6 ranked rescue actions
  - `title`: string (specific, action-oriented)
  - `description`: string (detailed enough to execute without follow-up questions)
  - `timing`: "hour_0_4" | "hour_4_24" | "hour_24_48" | "hour_48_72" (when to execute within the rescue window)
  - `channel`: "email" | "phone" | "linkedin" | "in_person" | "internal" | "executive" (communication channel)
  - `target_contact`: string (who to reach out to -- name or role)
  - `priority`: "critical" | "high" | "medium"
  - `estimated_time`: number (minutes)
  - `roi_rationale`: string (why this specific action addresses the root cause)
  - `success_indicator`: string (how you will know if this action worked)
- `data.map_tasks`: array of 3-5 concrete tasks ready to create
  - `title`: string (specific, includes person/deliverable)
  - `description`: string (include checklist of subtasks)
  - `due_date`: string (ISO date, most within the 72-hour window)
  - `priority`: "high" | "medium" | "low"
  - `deal_id`: string

## Quality Checklist

Before returning the rescue plan, verify:

- [ ] Diagnosis identifies a SPECIFIC root cause from the 8-cause framework, not a vague "deal is struggling"
- [ ] Supporting signals are drawn from ACTUAL deal data, not assumptions
- [ ] Confidence level is honest -- "low" if insufficient data, not inflated to seem certain
- [ ] Salvageability assessment is honest -- recommending disqualification when appropriate is valuable, not defeatist
- [ ] Rescue actions are ROOT-CAUSE-SPECIFIC (not the same generic "follow up" for every diagnosis)
- [ ] Actions are ordered within the 72-hour rescue window with clear timing
- [ ] At least one action uses a DIFFERENT channel than what has been failing
- [ ] At least one action targets a DIFFERENT contact than the one who went silent
- [ ] Each action has a success indicator so the rep knows if it worked
- [ ] MAP tasks are specific enough to execute immediately (names, dates, deliverables)
- [ ] Task due dates are within the 72-hour window (rescue is urgent)
- [ ] If the deal has been stalled 30+ days, the plan includes an honest assessment of whether rescue is still viable

## Examples

### Good Diagnosis
```json
{
  "why_at_risk": "Champion Sarah Chen has not responded to 3 emails and 1 call over the past 18 days. The deal was in evaluation stage with a demo completed on Jan 15. No technical concerns were raised. The silence pattern combined with a recent LinkedIn post about 'new priorities in Q1' suggests internal reprioritization rather than competitive loss.",
  "root_cause_type": "champion_dark",
  "supporting_signals": [
    "No response to emails sent Jan 22, Jan 28, Feb 3",
    "Voicemail on Feb 1 not returned",
    "Last meeting (demo) on Jan 15 had positive feedback",
    "LinkedIn post on Jan 20: 'Excited about new Q1 initiatives' (may indicate priority shift)",
    "No other stakeholders engaged on this deal"
  ],
  "missing_info": [
    "Whether the project is still funded",
    "Whether Sarah is still the project lead",
    "Whether a competitor has entered the evaluation"
  ],
  "confidence": "medium",
  "salvageable": true,
  "salvageable_rationale": "The last direct interaction was positive (demo). The silence is likely internal reprioritization, not rejection. However, single-threaded engagement (only Sarah) makes this fragile. Multi-threading into the account is critical."
}
```

### Bad Diagnosis
```json
{
  "why_at_risk": "Deal is not moving forward",
  "root_cause_type": "champion_dark",
  "supporting_signals": ["No recent activity"],
  "missing_info": [],
  "confidence": "high",
  "salvageable": true,
  "salvageable_rationale": "We should follow up"
}
```
Why this fails: Vague diagnosis ("not moving forward" is a symptom, not a cause). No specific signals cited. Empty missing_info (there is always something you do not know). Confidence is "high" without evidence. Rationale is lazy.

### Good Rescue Action
```json
{
  "title": "Call Sarah Chen's colleague Mike Torres (VP Eng) about project status",
  "description": "Mike Torres was CC'd on the original intro email and attended the first demo. Call his direct line to ask: 'Hi Mike, I had been working with Sarah on the data platform evaluation. I haven't been able to reach her recently -- is the project still moving forward? I want to make sure we're supporting your team properly.'",
  "timing": "hour_4_24",
  "channel": "phone",
  "target_contact": "Mike Torres, VP Engineering",
  "priority": "critical",
  "estimated_time": 10,
  "roi_rationale": "Going around the silent champion to a secondary contact is 2.5x more effective than continuing to email the unresponsive contact. Mike has technical influence and can either re-engage Sarah or become the new primary contact.",
  "success_indicator": "Mike confirms project status and either re-introduces you to Sarah or agrees to take over as primary contact"
}
```

### Bad Rescue Action
```json
{
  "title": "Follow up with the prospect",
  "description": "Send another email to check in",
  "timing": "hour_0_4",
  "channel": "email",
  "target_contact": "Sarah",
  "priority": "high",
  "estimated_time": 5,
  "roi_rationale": "We should stay in touch",
  "success_indicator": "They respond"
}
```
Why this fails: Repeating the same failed approach (email to the same person). No specific content. No channel switch. Generic rationale. Vague success indicator.

## Error Handling

### Insufficient data for diagnosis
If the deal record has minimal data (no activity history, no contacts, no health score), return a diagnosis with `confidence: "low"` and include "information gathering" as the first 3 rescue actions: (1) review any internal notes or emails about this deal, (2) check if the contact is still at the company via LinkedIn, (3) reach out to any other stakeholders you have met. Make it clear: "Without activity history, this diagnosis is speculative. The first priority is gathering information to confirm the root cause."

### Deal has been stalled for 60+ days
Be direct: "This deal has been inactive for [X] days. The probability of recovery drops significantly after 30 days. Before investing in a rescue plan, consider: (1) Does this deal still represent a real opportunity? (2) Has the buyer's situation changed? (3) Is your time better spent on active deals?" If the user still wants to proceed, provide the rescue plan but flag it as a "long-shot reactivation" rather than a standard rescue.

### Multiple root causes detected
Deals often have compound problems (e.g., champion went dark AND budget was reallocated). Diagnose the PRIMARY root cause (the one that, if solved, would unblock everything else) and note secondary factors. The rescue plan should address the primary cause first. Do not try to solve 4 problems simultaneously -- it dilutes focus.

### Deal appears unsalvageable
If the signals clearly indicate the deal is dead (buyer explicitly declined, product does not fit, budget permanently eliminated), say so honestly. Set `salvageable: false` and provide a graceful exit plan instead of a rescue plan: how to close out professionally, preserve the relationship for future opportunities, and log the loss for pipeline analytics.

### Champion left the company
This is a special case. Check LinkedIn if possible. If confirmed: (1) Reach out to the champion at their new company -- they may buy again. (2) Identify the successor at the current company and request an introduction from anyone you know internally. (3) Treat this as a near-restart: the new contact needs to be educated and sold from a compressed discovery position.

### Rep asks to rescue a deal they should disqualify
If the deal shows clear disqualification signals but the rep wants to rescue it (often due to quota pressure or emotional attachment), provide the rescue plan but include an honest assessment: "This deal has [X, Y, Z] disqualification signals. The probability of close is estimated at [low percentage]. Consider whether the [estimated hours] of rescue effort would be better allocated to [alternative deal or prospecting]. If you decide to proceed, here is the plan."

## Tone and Presentation

- Be direct and honest. Reps respect candor. "This deal is in trouble because..." not "There may be some challenges."
- Diagnose first, prescribe second. Never skip the diagnosis to jump to actions. Wrong diagnosis = wrong prescription = wasted effort.
- Be specific about people, actions, and timing. "Call Mike Torres at 10am tomorrow" not "Reach out to the team soon."
- Acknowledge the emotional difficulty. Admitting a deal is at risk is hard. Frame the rescue plan as empowerment: "Here is exactly what to do to give this deal its best chance."
- Never use the word "just." "Just follow up" minimizes the complexity of sales. Every action should have a reason.
- If recommending disqualification, frame it as strength, not failure: "The best reps lose fast and redirect to winnable deals. This deal is not worth your limited time right now."
