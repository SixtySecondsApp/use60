# Intent Patterns -- Commitment Phrase Taxonomy

This reference document provides a comprehensive taxonomy of commitment phrases organized by intent type. It is used by the Detect Intents skill to classify spoken commitments and map them to platform automation actions.

## How to Use This Reference

1. **Pattern matching**: Scan the transcript for phrases that match patterns in each category.
2. **Confidence assignment**: Use the confidence guidelines within each category to score the match.
3. **Automation mapping**: Each category has a corresponding platform action listed in the header.
4. **False positive filtering**: Check the "False Positives" section at the end of each category before finalizing a match.

---

## Category 1: Send Proposal / Pricing

**Automation Action**: `proposal_generation`
**Confidence Baseline**: 0.85

### Explicit Commitment Phrases (confidence 0.9+)

- "I'll send you the proposal by [date]"
- "You'll have the pricing by end of [day/week]"
- "I'll put together a proposal for you"
- "Let me draft up the pricing and send it over"
- "We'll have a formal proposal to you by [date]"
- "I'm going to put together a quote for this"
- "I'll send over the investment summary"
- "Expect the proposal in your inbox by [time]"
- "I'll package up the pricing options we discussed"
- "We'll formalize this into a proposal"
- "I'll get you the numbers by [date]"
- "Let me work up the pricing and circle back"
- "I'll have a quote ready for you [timeframe]"
- "We'll draft the SOW and send it for review"
- "I'm going to put together three options for you"
- "Let me build out the proposal with the tiers we discussed"

### Implied Commitment Phrases (confidence 0.75-0.89)

- "We should get you a proposal on this"
- "I can put some numbers together"
- "Let me see what I can do on pricing"
- "I'll work with our team on a quote"
- "We could probably get you something by [date]"

### False Positive Warnings

- "We don't usually send proposals at this stage" -- This is a REFUSAL, not a commitment.
- "Let me think about the pricing" -- This is deliberation, not a delivery promise.
- "We should talk about pricing" -- This is a topic opener, not a commitment to send.
- "I'll need to check with my manager on pricing" -- This is a DEPENDENCY, not a delivery commitment. Map to `internal_followup` instead.

---

## Category 2: Schedule Meeting / Follow-Up Call

**Automation Action**: `calendar_find_times`
**Confidence Baseline**: 0.80

### Explicit Commitment Phrases (confidence 0.9+)

- "Let's schedule a follow-up for next week"
- "I'll send over some times for a next meeting"
- "Can we get something on the calendar for [date/timeframe]"
- "I'll set up a call with [person/team]"
- "Let's book a technical review"
- "I'll send a calendar invite for [day]"
- "We should schedule a demo for your team"
- "I'll coordinate a meeting with [internal person] and you"
- "Let's lock in a time for the next step"
- "I'll reach out to schedule the [meeting type]"
- "Let me get a time on [person]'s calendar for you"
- "We need to set up a call with your [role]"
- "I'll find some times that work for everyone"
- "Let's plan for a working session next [week/month]"
- "I'll get a meeting scheduled with our implementation team"
- "Can we reconvene [timeframe] to review?"
- "I'll send a Calendly link so you can grab a time"
- "Let's get the stakeholders together [timeframe]"

### Implied Commitment Phrases (confidence 0.75-0.89)

- "We should probably get the teams together"
- "It would be good to have a follow-up"
- "Let's plan to reconnect [vague timeframe]"
- "We need to loop in [person] -- maybe a joint call"
- "I'll try to get something on the calendar"

### False Positive Warnings

- "We should meet again someday" -- Vague future statement, not a scheduling commitment.
- "Let me check my calendar and get back to you" -- Dependency on availability check. This is a WEAKER commitment -- map with reduced confidence (0.70).
- "Maybe we could do a follow-up" -- "Maybe" is a hedge word. Score at 0.60 max.
- "I'll have my assistant reach out" -- Delegation, not direct commitment. Still valid but note the dependency.

---

## Category 3: Send Content / Resources

**Automation Action**: `content_delivery`
**Confidence Baseline**: 0.82

### Explicit Commitment Phrases (confidence 0.9+)

- "I'll send you the case study on [topic]"
- "Let me share our whitepaper on [topic]"
- "I'll forward the technical documentation"
- "You'll get the deck in your inbox today"
- "I'll send over the integration guide"
- "Let me share some customer references"
- "I'll get you the ROI calculator"
- "I'll send the security compliance docs"
- "You'll have the implementation guide by [time]"
- "Let me send you a recording of the demo"
- "I'll share the onboarding checklist"
- "I'll forward the API documentation"
- "Let me pull together some relevant case studies"
- "I'll send the comparison sheet you asked about"
- "I'll get you access to our resource library"
- "Let me share the data sheet for [product]"

### Implied Commitment Phrases (confidence 0.75-0.89)

- "We have a case study that might be relevant"
- "I think we have a whitepaper on that"
- "There's some documentation I could share"
- "I should be able to get you that information"
- "We have resources on that topic"

### False Positive Warnings

- "We have tons of resources on our website" -- This is a redirect to self-serve, not a delivery commitment.
- "I'd have to check if that's public" -- Conditional on access permissions. Map to `internal_followup` until confirmed.
- "We used to have something on that" -- Uncertain availability. Not a commitment.

---

## Category 4: Prospect Follow-Up (Buyer-Side Commitments)

**Automation Action**: `buyer_followup_tracker`
**Confidence Baseline**: 0.75

### Explicit Commitment Phrases (confidence 0.85+)

- "I'll talk to my team about this"
- "Let me bring this to our leadership"
- "I'll run this by our CTO"
- "We'll discuss this internally and get back to you"
- "I'll present this at our next team meeting"
- "Let me share this with our stakeholders"
- "I'll get feedback from the technical team"
- "We'll review the proposal and respond by [date]"
- "I'll check with procurement on the process"
- "Let me run the numbers on our side"
- "I'll get approval from [person/department]"
- "We'll do an internal evaluation and let you know"
- "I'll loop in our security team for review"
- "Let me talk to finance about the budget"
- "I'll champion this internally"
- "We'll put together our requirements document"
- "I'll schedule an internal demo for the broader team"

### Implied Commitment Phrases (confidence 0.65-0.84)

- "I need to think about this"
- "Let me sit with this for a bit"
- "We'll need to discuss this on our end"
- "I'll see what the team thinks"
- "This is something we'd need to evaluate"

### Tracking Guidelines

Buyer commitments require a different handling pattern than seller commitments:
1. **Create a tracking task** for the seller to monitor, not a task for the buyer.
2. **Set a follow-up reminder** at an appropriate interval (typically 3-5 business days for internal reviews).
3. **Draft a nudge email** that can be sent if the buyer misses their implied deadline.
4. **Note the specific person or group** the buyer committed to consult -- this reveals the buying committee.

### False Positive Warnings

- "That's interesting" -- Polite acknowledgment, not a commitment to act.
- "We'll keep you posted" -- Vague promise. Track but score at 0.55 max.
- "I'll think about it" -- Delay tactic in most contexts. Score at 0.50 max.
- "We're not ready to move forward yet" -- This is a STALL, not a commitment. Do not map to follow-up tracker. Flag as a negative buying signal instead.

---

## Category 5: Introduction / Warm Referral

**Automation Action**: `warm_intro_draft`
**Confidence Baseline**: 0.80

### Explicit Commitment Phrases (confidence 0.9+)

- "I'll introduce you to [person]"
- "Let me connect you with our [role]"
- "I'll make an email introduction to [name]"
- "I'll loop you in with [person] who handles that"
- "Let me get you in touch with the right person"
- "I'll set up an intro with [person] on my team"
- "Let me CC you on an email to [person]"
- "I'll have [person] reach out to you directly"

### Implied Commitment Phrases (confidence 0.70-0.89)

- "You should talk to [person] on our team"
- "[Person] would be the right contact for that"
- "I can probably connect you with someone in [department]"
- "Let me see who on our team can help with that"

### False Positive Warnings

- "[Person] handles that" -- Informational reference, not a commitment to introduce. Only becomes a commitment if followed by "I'll connect you" or similar.
- "You could reach out to [person]" -- Suggestion for the OTHER party to initiate. Not a commitment to facilitate.

---

## Category 6: Internal Follow-Up / Check-Back

**Automation Action**: `internal_followup`
**Confidence Baseline**: 0.78

### Explicit Commitment Phrases (confidence 0.85+)

- "I'll check with [internal person] and get back to you"
- "Let me verify that with our team"
- "I need to confirm that internally"
- "I'll follow up with [department] on that question"
- "Let me get an answer from [person/team]"
- "I'll find out and circle back"
- "I need to check on that -- I'll let you know by [date]"
- "Let me double-check with engineering on the timeline"
- "I'll confirm the pricing with my manager"
- "Let me validate that with our product team"

### Implied Commitment Phrases (confidence 0.65-0.84)

- "I'm not sure about that -- let me look into it"
- "Good question -- I'll find out"
- "That's something I'd need to verify"
- "I don't have that information off the top of my head"

### False Positive Warnings

- "I have no idea" -- Without a follow-up commitment, this is just an admission of not knowing. Not actionable.
- "That's a good question" -- Filler phrase. Only a commitment if followed by "I'll find out" or similar.

---

## Cross-Category Confidence Modifiers

These modifiers adjust the base confidence score up or down regardless of category.

### Confidence Boosters (+0.05 to +0.10)

- Speaker uses a specific date or time: "by Thursday" / "before 5pm" / "next Tuesday"
- Speaker includes a specific deliverable: "the pricing with volume discounts" / "the SOC2 documentation"
- Speaker names a specific recipient: "I'll send it to Sarah and Raj"
- Commitment is made at the end of the meeting (closing commitments carry higher weight)
- Commitment is restated or confirmed by the other party: "So you'll send that by Friday?" "Yes, Friday."

### Confidence Reducers (-0.05 to -0.15)

- Hedge words: "try," "might," "hopefully," "probably," "should be able to"
- Conditional language: "if," "assuming," "depending on," "as long as"
- Vague timeframes: "soon," "shortly," "in the near future," "when I get a chance"
- Passive voice: "That will be sent" (who?), "The proposal should go out" (by whom?)
- Delegation to unnamed party: "Someone from our team will..." "Our admin will handle that"

### Disqualifiers (do not map to automation)

- "I'll try my best" -- Effort, not commitment
- "No promises, but..." -- Explicit non-commitment
- "Don't hold me to this" -- Explicit non-commitment
- "In an ideal world..." -- Hypothetical
- "We should probably..." -- Suggestion, not commitment
- "If we had more time..." -- Conditional that is not met
- "I wish we could..." -- Desire, not commitment

---

## Commitment Overlap Resolution

When a single statement maps to multiple categories:

1. **Primary intent wins.** "I'll send you the proposal and we can schedule a follow-up to review it" maps primarily to `proposal_generation` (the deliverable) with a secondary `calendar_find_times` (the review meeting). Create two separate commitment records.

2. **Sequential dependencies.** If one commitment depends on another ("I'll check with my manager on the pricing, then send you the proposal"), create both but mark the dependency: `proposal_generation` depends on `internal_followup`.

3. **Compound commitments.** "I'll put together the case studies, the pricing, and the implementation timeline" is THREE commitments, not one. Split into individual items: `content_delivery` (case studies), `proposal_generation` (pricing), `content_delivery` (implementation timeline).
