# Transcript Extraction Pattern Library

A comprehensive lookup table for extracting truth from meeting transcripts. Organized by signal type: commitment language, risk indicators, decision language, stall/delay indicators, buying signals, and authority indicators. Each pattern includes example phrases, what they mean for the deal, and confidence ratings.

## Table of Contents

1. [How to Use This Pattern Library](#how-to-use-this-pattern-library)
2. [Commitment Language Patterns](#commitment-language-patterns)
3. [Decision Language Taxonomy](#decision-language-taxonomy)
4. [Risk Indicator Phrases](#risk-indicator-phrases)
5. [Stall and Delay Indicators](#stall-and-delay-indicators)
6. [Buying Signal Phrases](#buying-signal-phrases)
7. [Authority Indicators](#authority-indicators)
8. [Sentiment Shift Patterns](#sentiment-shift-patterns)
9. [Champion Health Indicators](#champion-health-indicators)
10. [Competitive Intelligence Phrases](#competitive-intelligence-phrases)
11. [Pattern Interaction Rules](#pattern-interaction-rules)
12. [Confidence Calibration Guide](#confidence-calibration-guide)

---

## How to Use This Pattern Library

This library is a lookup table for transcript analysis. When processing a meeting transcript:

1. **Scan for pattern matches** against the phrases listed below
2. **Note the signal type** (commitment, decision, risk, etc.)
3. **Assess confidence** using the indicators (strong, moderate, weak)
4. **Cross-reference against CRM data** using the Truth Hierarchy (CRM > transcript > notes)
5. **Extract structured output** with speaker attribution, timestamp, and confidence

**Important:** Patterns should be matched contextually, not just via keyword search. The phrase "I'll try to" is weak commitment language when followed by "get that to you by Friday" but is not commitment language when preceded by "I don't think" (negation).

---

## Commitment Language Patterns

Commitments are promises to take future action. They range from iron-clad guarantees to vague intentions. Calibrate confidence accordingly.

### Strong Commitment (High Confidence)

These phrases indicate a firm promise. Extract as a trackable commitment with high confidence.

| Pattern | Example | Commitment Strength |
|---------|---------|-------------------|
| "I will [action] by [date]" | "I will send the proposal by Friday" | Strongest -- explicit action + deadline |
| "You'll have [deliverable] by [time]" | "You'll have the security doc by end of week" | Strong -- promise with timeline |
| "Consider it done" | "The NDA review? Consider it done." | Strong -- unconditional commitment |
| "I commit to [action]" | "I commit to getting the budget approved this month" | Strong -- explicit commitment language |
| "I guarantee [outcome]" | "I guarantee we'll have the test environment ready" | Strong -- but verify follow-through |
| "I'll make sure [action] happens" | "I'll make sure the team reviews this before Tuesday" | Strong -- personal accountability |
| "We've decided to [action]" | "We've decided to move forward with the pilot" | Strong -- decision + commitment combined |
| "I'm signing off on [action]" | "I'm signing off on the budget for this" | Strongest -- authority + commitment |

### Moderate Commitment (Medium Confidence)

These suggest intention but lack the firmness of strong commitments. Flag for confirmation.

| Pattern | Example | What It Really Means |
|---------|---------|---------------------|
| "I should be able to [action]" | "I should be able to get approval this week" | Intention, not guarantee. May face obstacles. |
| "I'll try to [action]" | "I'll try to loop in the CTO next meeting" | Effort, not commitment. Low accountability. |
| "We're planning to [action]" | "We're planning to start the evaluation next month" | Intention with no firm date. Could slip. |
| "I think we can [action]" | "I think we can get the SOW signed by Q1" | Belief, not commitment. Hedged. |
| "Let me see what I can do" | "Let me see what I can do about the pricing" | Vague. No deliverable. No deadline. |
| "I'll do my best to [action]" | "I'll do my best to have the team ready" | Effort framing. Implies possible failure. |
| "We're working on [action]" | "We're working on getting internal alignment" | Ongoing, no completion criteria. |

### Weak / Non-Commitment (Low Confidence -- Flag as Risk)

These sound like commitments but are not. They should be flagged for follow-up to convert into real commitments.

| Pattern | Example | Risk Level |
|---------|---------|-----------|
| "Hopefully we can [action]" | "Hopefully we can get this done soon" | High -- no accountability, no timeline |
| "We'll circle back on that" | "Let's circle back on the timeline next time" | High -- indefinite deferral |
| "Someone on our team will [action]" | "Someone will reach out about the API" | Medium -- no named owner |
| "I'll get back to you on that" | "Good question, I'll get back to you" | Medium -- intent but no timeline |
| "We'll figure it out" | "We'll figure out the budget situation" | High -- no plan, no owner, no date |
| "That's on our radar" | "Integration is on our radar" | High -- acknowledgment without commitment |
| "We should probably [action]" | "We should probably schedule a follow-up" | Medium -- tentative, needs conversion |

---

## Decision Language Taxonomy

Decisions change the state of the deal. They are the highest-value extraction target.

### Final Decisions (Extract with High Confidence)

| Pattern | Example | Decision Type |
|---------|---------|--------------|
| "We've decided to [action]" | "We've decided to go with your proposal" | Final selection |
| "Our decision is [outcome]" | "Our decision is to proceed with the pilot" | Formal decision |
| "I'm approving [action]" | "I'm approving the $200K budget" | Budget/authority decision |
| "Let's go with [option]" | "Let's go with the enterprise tier" | Option selection |
| "Agreed" / "Deal" / "Done" | "Agreed -- we'll move forward with those terms" | Confirmation |
| "I'll sign off on that" | "The SOC2 report checks the box. I'll sign off." | Approval decision |
| "We're moving forward with [action]" | "We're moving forward with the implementation" | Advancement decision |
| "[Name], you have my approval" | "Sarah, you have my approval to proceed" | Delegated authority decision |

### Conditional Decisions (Extract with Medium Confidence)

These are decisions contingent on something else happening. Track both the decision and the condition.

| Pattern | Example | Condition to Track |
|---------|---------|-------------------|
| "If [condition], then we'll [action]" | "If pricing works out, we'll move to contract" | Pricing resolution |
| "Assuming [condition], we can [action]" | "Assuming legal approves, we could sign next month" | Legal review |
| "Pending [condition], we're a go" | "Pending the security review, we're a go" | Security review completion |
| "Once [condition] is met, we'll [action]" | "Once IT signs off, we'll start implementation" | IT approval |
| "Unless [exception], we plan to [action]" | "Unless the board objects, we plan to move forward" | Board review |
| "Subject to [condition]" | "Subject to final pricing, we accept the proposal" | Pricing finalization |

### Non-Decisions (Do NOT Extract as Decisions)

| Pattern | Example | What It Actually Is |
|---------|---------|-------------------|
| "We should think about [action]" | "We should think about a different approach" | Exploration, not commitment |
| "It would be nice to [action]" | "It would be nice to have that feature" | Aspiration |
| "In an ideal world, we'd [action]" | "In an ideal world, we'd start next month" | Hypothetical |
| "What if we [action]?" | "What if we ran a parallel evaluation?" | Brainstorming |
| "I'd need to check with [person]" | "I'd need to check with the CFO" | Deferred -- not a decision |
| "Let me think about that" | "Let me think about the timing" | Deferral |
| "That's interesting" | "That's an interesting approach" | Polite non-commitment |

---

## Risk Indicator Phrases

Risk patterns in transcripts signal potential deal threats. Each pattern has a risk category and severity.

### Critical Risk (Immediate Action Required)

| Pattern | Example | Risk Category | What It Means |
|---------|---------|--------------|---------------|
| "I'm starting to wonder if [doubt]" | "I'm starting to wonder if this is the right fit" | Champion erosion | Champion is losing conviction. ACT IMMEDIATELY. |
| "My team isn't on board" | "To be honest, my team isn't fully on board" | Internal resistance | Champion lacks internal support. May lose deal. |
| "I might be moving to [new role]" | "FYI, I might be moving to a different department" | Champion departure | Your primary contact may leave. Identify backup. |
| "We've had bad experiences with [similar]" | "We tried something like this before and it failed" | Historical trauma | Past failure creates deep skepticism. Address head-on. |
| "The board has other priorities" | "Honestly, the board is focused on cost-cutting" | Executive misalignment | Your initiative conflicts with top-level strategy. |

### High Risk (Address Within 48 Hours)

| Pattern | Example | Risk Category | What It Means |
|---------|---------|--------------|---------------|
| "I'm getting pushback from [person]" | "I've been getting pushback from the engineering leads" | Stakeholder blocker | Named opposition. Need a plan to address. |
| "That's more than we expected" | "That's significantly more than we budgeted" | Budget gap | Pricing may need restructuring or justification. |
| "I'm not sure this is the right fit" | "After the demo, I'm not sure this fits our workflow" | Solution fit concern | Missed on a key requirement. Need follow-up demo. |
| "We're also talking to [competitor]" | "Just want to be transparent -- we're also evaluating [X]" | Active competition | Competitor is in play. Need differentiation strategy. |
| "Our timeline has shifted" | "We're pushing the evaluation to next quarter" | Timeline slippage | Deal is cooling. Need to re-establish urgency. |

### Medium Risk (Monitor and Address in Next Interaction)

| Pattern | Example | Risk Category | What It Means |
|---------|---------|--------------|---------------|
| "We have a lot on our plate" | "Our team has a lot on their plate right now" | Bandwidth constraint | Not deprioritized, but at risk of being deprioritized. |
| "There are other priorities" | "There are a few other initiatives ahead of this" | Competing priorities | Your project is not #1. May stall. |
| "I'd need to check with [unnamed]" | "I'd need to run that by someone on the team" | Hidden stakeholder | Unknown person with influence. Need to identify. |
| "Let's revisit this [vague time]" | "Let's revisit this next quarter" | Soft stall | Polite delay. May or may not come back. |
| "I hope we can make this work" | "I really hope we can find a way to make this work" | Uncertain outcome | Positive intent but low confidence. Something is in the way. |

---

## Stall and Delay Indicators

Stalls are distinct from objections. An objection is a stated concern. A stall is avoidance behavior.

### Active Stall Patterns

| Pattern | Example | Stall Type | Counter |
|---------|---------|-----------|---------|
| "Can you send me some materials to review?" | After a demo where all questions were answered | Information deferral | "Happy to. What specific question will the materials help you answer?" |
| "We need to do more research internally" | Without naming what they need to research | Process stall | "What specifically do you need to research? I may be able to help." |
| "Let me get back to you after [vague event]" | "Let me get back to you after our planning cycle" | Time stall | "When does your planning cycle wrap up? Can I follow up on [specific date]?" |
| "We're still evaluating" | After 3+ months of evaluation | Extended stall | "I understand. What criteria remain unmet? Let's close those gaps specifically." |
| "I need to socialize this internally" | Without identifying who or when | Committee stall | "Who do you need to share it with? I can prepare tailored materials for them." |

### Passive Stall Indicators (Behavioral, Not Verbal)

These are not things the prospect says but patterns in their behavior:

| Indicator | Meaning | Action |
|-----------|---------|--------|
| Responses taking 3+ days when previously same-day | Interest is cooling | Escalate to different channel (phone, LinkedIn) |
| Rescheduling meetings more than once | Priority is dropping | Address directly: "I sense the timing may have shifted. What changed?" |
| Shorter meetings than scheduled | Disengagement | Start with: "I want to make sure this is the best use of your time." |
| Bringing in junior team members instead of attending | Delegating down = deprioritizing | Request the senior person's participation for a specific agenda item |
| Asking the same questions already answered | Not retaining information = not invested | Summarize in writing and ask: "Is there a concern behind this that I haven't addressed?" |

---

## Buying Signal Phrases

Buying signals indicate the prospect is mentally moving toward purchase. They are imagining implementation, usage, or ownership.

### Strong Buying Signals (High Intent)

| Pattern | Example | What It Means |
|---------|---------|---------------|
| "How does implementation work?" | "Walk me through the implementation process" | They are planning for ownership |
| "What does onboarding look like?" | "How would we onboard our team?" | They are imagining adoption |
| "Can we get a pilot set up?" | "What would a pilot look like for us?" | They want proof before committing |
| "Who else on our team should see this?" | "I want to get my director in front of this" | They are building internal support |
| "What's the pricing for [specific scope]?" | "What does it cost for 200 users?" | They are sizing the purchase |
| "How quickly can we get started?" | "If we sign this month, when could we go live?" | Urgency and commitment signals |
| "What support do we get?" | "What does the customer success experience look like?" | They are evaluating the long-term relationship |

### Moderate Buying Signals (Medium Intent)

| Pattern | Example | What It Means |
|---------|---------|---------------|
| "That's interesting" (followed by a specific question) | "That's interesting -- can it also do X?" | Engaged and exploring deeper |
| "We've been looking for something like this" | "We've been looking for a solution to this for months" | Active search confirms pain |
| "How does it compare to [current tool]?" | "How is this better than what we use today?" | They are evaluating a switch |
| "My team would love this" | "Our SDR team would really benefit from this" | They are imagining team adoption |
| "Can you send me the proposal?" | Unprompted request for commercial documents | They are ready to evaluate terms |

---

## Authority Indicators

Authority patterns reveal who holds decision-making power, who influences, and who defers.

### High Authority Indicators

| Pattern | Example | What It Reveals |
|---------|---------|----------------|
| "I can approve up to [amount]" | "I can approve up to $100K without board sign-off" | Budget authority level |
| "That's my call" | "Vendor selection? That's my call." | Final decision-maker |
| "I'll authorize [action]" | "I'll authorize the team to start the evaluation" | Decision delegation power |
| Others defer: "[Name], what do you think?" | When the room looks to one person | De facto authority (may differ from title) |
| "I'll sign off on this" | "If the numbers work, I'll sign off" | Signature authority |

### Low Authority Indicators

| Pattern | Example | What It Reveals |
|---------|---------|----------------|
| "I'd need to check with [person]" | "I'd need to run this by my VP" | Not the final decision-maker |
| "That's above my pay grade" | "Budget decisions are above my pay grade" | Lacks budget authority |
| "I'll recommend it, but [person] decides" | "I can recommend, but the CTO makes the call" | Influencer, not buyer |
| "Let me find out" (on basic process questions) | "Let me find out how procurement works here" | New to role or not in the decision chain |
| Looking at another person before answering | Visual cue in video meetings | Defers to the person they look at |

---

## Sentiment Shift Patterns

Track sentiment changes within a single meeting. A shift from positive to negative (or vice versa) is more informative than static sentiment.

### Positive Shifts (Improving Sentiment)

| From | To | Example | Meaning |
|------|-----|---------|---------|
| Skeptical questions | Specific implementation questions | "I wasn't sure about this, but... how would we set it up?" | Won them over. Follow the thread. |
| Formal and brief | Relaxed and detailed | Shifts from one-word answers to sharing stories | Rapport established. Trust building. |
| "I'm not sure" | "Let me check if [budget/timeline] works" | Moved from uncertainty to action planning | Crossed a psychological threshold. |

### Negative Shifts (Deteriorating Sentiment)

| From | To | Example | Meaning |
|------|-----|---------|---------|
| Engaged and asking questions | Quiet and brief | Was asking detailed questions, now giving one-word answers | Lost them. Something triggered disengagement. |
| Specific praise | Generic responses | "This is great" became "That's fine" | Enthusiasm dropped. Investigate what changed. |
| Forward-looking language | Past-tense language | "When we implement" became "If we were to implement" | Commitment weakening. Deal at risk. |

---

## Champion Health Indicators

Your champion's health directly predicts deal outcome. Monitor these signals.

| Signal | Health Level | Action |
|--------|-------------|--------|
| "I've already briefed [executive] on this" | Strong | Reinforce and equip with more materials |
| "I'll set up the meeting with [decision-maker]" | Strong | Prepare them for the meeting |
| "I'm excited about this" | Moderate | Convert enthusiasm into specific actions |
| "I like it but I'm not sure others will" | Weakening | Identify objectors and build a coalition |
| "I've been getting pushback" | Weak | Emergency: address the pushback source directly |
| "I might be moving to a new role" | Critical | Immediately identify a backup champion |
| Stops responding to emails | Critical | Escalate through alternate channels |

---

## Competitive Intelligence Phrases

| Pattern | Example | Intelligence Value |
|---------|---------|-------------------|
| "We're also looking at [name]" | "We're evaluating Gong and Chorus" | Named competitors in evaluation |
| "[Competitor] offered us [terms]" | "They offered a 40% discount" | Competitive pricing intel |
| "With [competitor], we can [capability]" | "With them we get native Salesforce integration" | Feature comparison leverage |
| "Our team liked [competitor] because [reason]" | "The team liked their mobile app" | Competitive preference driver |
| "We're thinking about building this ourselves" | "Engineering thinks they can build it in 3 months" | Build-vs-buy competitor |
| "We might just stick with what we have" | "Excel has been working fine for us" | Status quo as competitor |

---

## Pattern Interaction Rules

When multiple patterns appear together, they modify each other.

| Combination | Interpretation |
|-------------|---------------|
| Strong commitment + hedge word | Downgrade to moderate commitment. "I will... probably" |
| Buying signal + risk indicator | Engaged but concerned. Address the risk to unlock the signal. |
| Authority indicator + commitment | High-value extraction. Decision-maker is making a promise. |
| Stall indicator + buying signal | Mixed signals. They want to buy but something is blocking them. |
| Champion health (weak) + competitive mention | Critical risk. Champion is losing the internal argument to a competitor. |
| Decision + condition | Track both. Decision is not final until condition is met. |

---

## Confidence Calibration Guide

| Confidence Level | Criteria | Example |
|-----------------|----------|---------|
| **High (0.85-1.0)** | Explicit statement, decision-maker authority, no hedges, specific details | "I'm approving the $150K budget. Sarah, send the PO." |
| **Medium (0.60-0.84)** | Clear intent but hedged, conditional, or from non-decision-maker | "I think we're going to move forward, pending legal review." |
| **Low (0.40-0.59)** | Vague language, no specifics, from unknown authority level | "We're definitely interested in exploring this further." |
| **Very Low (0.20-0.39)** | Aspirational, hypothetical, or contradicted later in the conversation | "It would be great if we could make this work somehow." |

---

## Sources and References

- Gong Labs (2023): Linguistic analysis of 1.2M sales conversations -- commitment and buying signal correlation
- Chorus.ai (2024): Conversation intelligence patterns -- risk indicator detection accuracy study
- Harvard Business Review (2022): Verbal commitment reliability in business negotiations
- Ebbinghaus Forgetting Curve: Applied to meeting recall in SalesHacker study (2023)
- Sandler Training: Commitment language framework and qualification methodology
- MEDDICC Group: Decision-maker identification through conversational signals
- CEB/Gartner: B2B buying committee dynamics and communication patterns
