# Buying Signals -- MEDDICC-Based Signal Classification Framework

This reference document provides a comprehensive framework for detecting and classifying buying signals from meeting transcripts using the MEDDICC qualification methodology. Each signal is scored on a -1.0 to +1.0 scale.

## Signal Strength Scoring Rubric

### How to Score

1. **Identify the signal phrase** in the transcript.
2. **Classify by MEDDICC category** (see sections below).
3. **Determine polarity**: positive (toward purchase), negative (away from purchase), or neutral (information only).
4. **Assign base strength** from the category-specific tables.
5. **Apply context modifiers** (see Section 7).
6. **Record the final score** with justification.

### Scoring Scale Reference

| Score | Label | Behavioral Indicator |
|---|---|---|
| +1.0 | Maximum Positive | Verbal purchase commitment, signature intent |
| +0.8 | Strong Positive | Active planning around implementation, budget allocated |
| +0.6 | Moderate Positive | Engaged evaluation, specific requirements shared |
| +0.4 | Mild Positive | Interest expressed, questions asked, follow-up welcomed |
| +0.2 | Weak Positive | Passive interest, polite engagement |
| 0.0 | Neutral | Informational exchange, no directional signal |
| -0.2 | Weak Negative | Mild hesitation, vague concerns |
| -0.4 | Mild Negative | Specific concerns raised, comparison shopping mentioned |
| -0.6 | Moderate Negative | Budget objection, timeline doubt, stakeholder resistance |
| -0.8 | Strong Negative | Active resistance, competitive preference stated |
| -1.0 | Maximum Negative | Explicit rejection, deal declared dead |

---

## Section 1: Metrics (M)

Metrics signals reveal whether the prospect has quantified their problem and defined success criteria. Strong metrics signals indicate a mature buyer who knows what they need and can justify the purchase internally.

### Positive Signals

| Signal Phrase | Strength | Interpretation |
|---|---|---|
| "We need to reduce [metric] by [number]%" | +0.8 | Quantified pain with specific target |
| "Our goal is [specific KPI] by [date]" | +0.7 | Time-bound success criteria |
| "We're currently losing $[amount] per [period] on this" | +0.9 | Quantified cost of inaction |
| "If we could improve [metric] by even [number], that would pay for itself" | +0.8 | Self-articulated ROI |
| "Our board is tracking [specific metric]" | +0.7 | Executive visibility on the problem |
| "We benchmarked against industry and we're at [number] vs [target]" | +0.6 | Data-driven evaluation |
| "The current process costs us [time/money] per [unit]" | +0.7 | Operational pain quantified |
| "We need to get from [current state] to [target state]" | +0.6 | Clear gap identified |
| "What ROI have your other customers seen?" | +0.5 | Seeking justification data (pre-purchase behavior) |

### Negative Signals

| Signal Phrase | Strength | Interpretation |
|---|---|---|
| "We don't really measure that" | -0.6 | No quantified pain, hard to build business case |
| "I'm not sure what the numbers look like" | -0.4 | Prospect hasn't done the analysis |
| "It's hard to put a number on it" | -0.3 | Qualitative pain only, weak business case |
| "We don't have baseline metrics for this" | -0.5 | No measurement framework, ROI proof will be difficult |
| "The impact is more qualitative than quantitative" | -0.3 | Harder to justify spend internally |
| "We haven't really calculated the cost" | -0.4 | Early-stage awareness, not ready to buy |

### Neutral Signals

| Signal Phrase | Strength | Interpretation |
|---|---|---|
| "We track [metric] but haven't set targets yet" | 0.0 | Awareness without commitment to improvement |
| "Those are interesting numbers" | 0.0 | Polite acknowledgment, not indicative |

---

## Section 2: Economic Buyer (E)

Economic buyer signals reveal whether the person with budget authority is engaged, identified, and accessible. Deals without economic buyer engagement stall at the negotiation stage.

### Positive Signals

| Signal Phrase | Strength | Interpretation |
|---|---|---|
| "I can approve this" / "I have budget authority" | +0.9 | Economic buyer is present and engaged |
| "I've already set aside budget for this" | +0.9 | Pre-allocated funding, strong buying intent |
| "Let me introduce you to [name], our CFO/VP" | +0.7 | Facilitating access to economic buyer |
| "Our [executive] is very interested in solving this" | +0.6 | Executive sponsorship exists |
| "Budget isn't really the issue here" | +0.5 | Financial barrier removed (but verify) |
| "We have a discretionary budget for tools like this" | +0.7 | Allocated spending category exists |
| "I can get [amount] approved without going to the board" | +0.8 | Known spending authority with threshold |
| "Our fiscal year starts in [month], and this is in the plan" | +0.7 | Budgeted initiative |
| "[Executive name] asked me to look into solutions for this" | +0.8 | Top-down initiative, executive mandate |

### Negative Signals

| Signal Phrase | Strength | Interpretation |
|---|---|---|
| "I don't have budget authority for this" | -0.7 | Wrong contact, need to find economic buyer |
| "This would need board approval" | -0.5 | High approval bar, long timeline |
| "We've already spent our budget for this year" | -0.8 | Fiscal constraint, possible delayed close |
| "I'd need to find budget from somewhere" | -0.6 | No allocated budget, creative funding needed |
| "That's above my pay grade" | -0.5 | Contact lacks authority, need escalation |
| "Procurement handles all vendor decisions" | -0.4 | Gatekeeper involvement, process complexity |
| "We're in a budget freeze right now" | -0.9 | Organizational spending halt |
| "I'm not sure who would approve this" | -0.6 | Unclear buying process, immature opportunity |
| "We'd need to justify this against other priorities" | -0.5 | Competing budget allocation |

### Neutral Signals

| Signal Phrase | Strength | Interpretation |
|---|---|---|
| "We have a process for vendor evaluation" | 0.0 | Standard procurement, neither positive nor negative |
| "I'll need to loop in finance" | +0.1 | Slight positive -- they are considering moving forward |

---

## Section 3: Decision Criteria (D1)

Decision criteria signals indicate what the prospect uses to evaluate and select a solution. When a prospect shares specific criteria, they are mentally purchasing. When criteria are absent or vague, the deal is early-stage.

### Positive Signals

| Signal Phrase | Strength | Interpretation |
|---|---|---|
| "Our must-haves are [specific list]" | +0.8 | Active evaluation with defined criteria |
| "We need [feature] -- does your platform do that?" | +0.7 | Testing against specific requirements |
| "How does this compare to [Competitor] on [dimension]?" | +0.6 | Active comparison shopping (engaged buyer) |
| "Can you support [specific integration/requirement]?" | +0.7 | Technical validation in progress |
| "We've built an evaluation matrix" | +0.8 | Formal evaluation, late-stage signal |
| "Security/compliance is our top priority" | +0.5 | Clear criterion shared, can be addressed |
| "What we really care about is [specific outcome]" | +0.6 | Priority signal, useful for positioning |
| "We've narrowed it down to [number] vendors" | +0.7 | Active shortlist, competitive evaluation |
| "That checks a major box for us" | +0.7 | Criterion satisfied, positive momentum |
| "That's exactly what we've been looking for" | +0.8 | Strong alignment signal |

### Negative Signals

| Signal Phrase | Strength | Interpretation |
|---|---|---|
| "We're not sure what we need yet" | -0.5 | Too early in buying process |
| "Our requirements keep changing" | -0.6 | Unstable evaluation, moving target |
| "That's a nice feature but not what we're looking for" | -0.4 | Misalignment on specific criterion |
| "We need [feature you don't have]" | -0.7 | Hard requirement gap |
| "[Competitor] handles this better" | -0.6 | Competitive disadvantage on specific criterion |
| "That's a dealbreaker for us" | -0.9 | Critical unmet requirement |
| "We're still figuring out our requirements" | -0.4 | Pre-evaluation stage |
| "Does it really need to be this complicated?" | -0.3 | Complexity concern |

### Neutral Signals

| Signal Phrase | Strength | Interpretation |
|---|---|---|
| "Walk me through the features" | 0.0 | Information gathering, no directional signal |
| "How do you typically handle [scenario]?" | +0.1 | Slight positive -- exploring practical use |

---

## Section 4: Decision Process (D2)

Decision process signals reveal how the prospect makes buying decisions -- the timeline, the approval chain, and the steps required. Clear process signals are among the strongest late-stage indicators.

### Positive Signals

| Signal Phrase | Strength | Interpretation |
|---|---|---|
| "We want to make a decision by [specific date]" | +0.8 | Timeline commitment |
| "The next step would be [specific action]" | +0.7 | Clear process progression |
| "If the pilot goes well, we can move to full deployment" | +0.7 | Conditional but structured path forward |
| "We need to get this done before [event/deadline]" | +0.8 | External deadline driving urgency |
| "Let's plan the implementation for [timeframe]" | +0.9 | Assuming the purchase, planning execution |
| "Who would we need to involve from your side?" | +0.7 | Planning mutual execution |
| "What does your onboarding process look like?" | +0.8 | Post-purchase planning (strong intent) |
| "Can you do a pilot with [number] users?" | +0.7 | Evaluation path defined |
| "We'd want to start with [department/team]" | +0.7 | Deployment planning, strong intent |
| "How quickly can we go live?" | +0.9 | Urgency signal, ready to commit |
| "What does the contract look like?" | +0.8 | Legal/commercial evaluation (late-stage) |
| "Can we do a month-to-month to start?" | +0.6 | Risk mitigation but active purchasing |

### Negative Signals

| Signal Phrase | Strength | Interpretation |
|---|---|---|
| "We'll get back to you" (no date) | -0.5 | Vague timeline, possible stall |
| "There's no rush on this" | -0.6 | No urgency, low priority internally |
| "We're just exploring options right now" | -0.4 | Early stage, not in active buying mode |
| "We have a lot of approvals to go through" | -0.4 | Long process ahead |
| "Let's revisit this next quarter" | -0.7 | Explicit delay |
| "I need to talk to a few more vendors first" | -0.3 | Still evaluating, not close to decision |
| "We're not ready to commit to a timeline" | -0.6 | No urgency, no internal pressure |
| "These things usually take 6-9 months for us" | -0.5 | Long sales cycle warning |
| "We have other priorities right now" | -0.7 | Competing for attention and resources |

### Neutral Signals

| Signal Phrase | Strength | Interpretation |
|---|---|---|
| "Walk me through your typical process" | 0.0 | Information request |
| "How long does implementation usually take?" | +0.2 | Slight positive -- scoping the effort |

---

## Section 5: Identify Pain (I)

Pain signals are the foundation of the entire sale. No pain = no urgency = no deal. The strength of pain signals directly correlates with deal velocity and close rate.

### Positive Signals

| Signal Phrase | Strength | Interpretation |
|---|---|---|
| "We're losing [money/customers/time] because of this" | +0.9 | Quantified, urgent pain |
| "This is our number one priority right now" | +0.8 | Top organizational priority |
| "Our CEO is frustrated with [problem]" | +0.8 | Executive-level pain visibility |
| "We tried to solve this ourselves and failed" | +0.7 | Failed DIY attempt, ready for external solution |
| "This is costing us [specific amount/metric]" | +0.8 | Quantified cost of inaction |
| "We can't scale without solving this" | +0.8 | Growth-blocking pain |
| "Our team is burning out from [manual process]" | +0.6 | Human impact, emotional driver |
| "We've been dealing with this for [long time]" | +0.5 | Chronic pain, accumulated frustration |
| "This keeps coming up in every team meeting" | +0.6 | Recurring, visible pain |
| "We almost lost a customer because of this" | +0.8 | Business-impacting pain event |
| "I personally spend [time] every [period] on this" | +0.6 | Individual pain, personal motivation |
| "The current process is broken" | +0.5 | Acknowledged failure of status quo |

### Negative Signals

| Signal Phrase | Strength | Interpretation |
|---|---|---|
| "It's not a huge problem, more of a nice-to-have" | -0.6 | Low urgency, low priority |
| "We've been getting by with what we have" | -0.5 | Status quo is acceptable |
| "It's annoying but manageable" | -0.4 | Pain exists but below action threshold |
| "We have bigger fish to fry right now" | -0.7 | Problem is deprioritized |
| "It works well enough" | -0.6 | Status quo bias, inertia |
| "We built a workaround that handles most of it" | -0.5 | DIY solution in place, reduces urgency |
| "I'm not sure this is a problem worth solving right now" | -0.7 | Explicit deprioritization |

### Neutral Signals

| Signal Phrase | Strength | Interpretation |
|---|---|---|
| "Tell me more about how you solve [problem]" | +0.1 | Exploratory interest |
| "That's an interesting approach" | 0.0 | Polite acknowledgment |

---

## Section 6: Champion (C1)

Champion signals indicate whether someone inside the prospect organization is actively advocating for your solution. A strong champion sells when you are not in the room. Champion signals are the strongest predictor of closed-won deals.

### Positive Signals

| Signal Phrase | Strength | Interpretation |
|---|---|---|
| "I'll champion this internally" | +0.9 | Explicit self-identification as champion |
| "I already mentioned your solution to our [executive]" | +0.8 | Pre-selling internally |
| "I'll bring this to the leadership meeting" | +0.7 | Active internal advocacy |
| "This would make my team's life so much better" | +0.6 | Personal stake in the outcome |
| "I want to make this work" | +0.7 | Emotional investment in success |
| "Let me set up a meeting with the decision-makers" | +0.8 | Facilitating access to power |
| "I'll build the internal business case for this" | +0.9 | Champion taking ownership of internal sale |
| "What do you need from me to make this happen?" | +0.8 | Champion asking for seller support |
| "I can help you navigate our approval process" | +0.7 | Sharing internal intelligence |
| "Between us, the real decision-maker is [name]" | +0.7 | Sharing power dynamics (trust signal) |
| "I'll handle the pushback from [department]" | +0.8 | Champion anticipating and managing resistance |
| "Send me the materials and I'll distribute them internally" | +0.7 | Champion acting as content distributor |
| "I've been looking for a solution like this for months" | +0.6 | Pre-existing need, personal motivation |
| "Can I get a recording of this demo to share with my team?" | +0.7 | Active internal evangelism |

### Negative Signals

| Signal Phrase | Strength | Interpretation |
|---|---|---|
| "I like it personally, but I'm not sure the team will go for it" | -0.4 | Weak champion, not willing to fight for it |
| "I can't really influence the decision" | -0.7 | Self-identified lack of influence |
| "I'm just gathering information for someone else" | -0.5 | Researcher, not champion |
| "I wouldn't want to stick my neck out on this" | -0.7 | Unwilling to advocate, risk averse |
| "I've been burned before recommending new tools" | -0.6 | Historical negative experience, gun-shy |
| "My boss usually goes with whatever [person] recommends" | -0.4 | Champion is not the influencer in the room |
| "I'm interested but I can't promise anything" | -0.3 | Passive interest, no advocacy commitment |
| "I've been getting pushback from [department]" | -0.5 | Champion facing internal resistance |
| "I might be moving to a different role soon" | -0.8 | Champion departure risk |

### Neutral Signals

| Signal Phrase | Strength | Interpretation |
|---|---|---|
| "I'll think about it" | -0.1 | Slight negative -- no action commitment |
| "It's on my radar" | 0.0 | Acknowledged but not prioritized |

---

## Section 7: Context Modifiers

These modifiers adjust signal strength based on conversational context, regardless of MEDDICC category.

### Positive Context Modifiers (+0.05 to +0.15)

- **Signal comes from a senior stakeholder** (VP+): +0.10. Authority amplifies signal strength.
- **Signal is repeated or reinforced during the meeting**: +0.10. Consistency indicates genuine intent.
- **Signal is accompanied by a concrete next step**: +0.10. "I'll get you budget info" + "by Thursday" = stronger than either alone.
- **Signal comes near the end of the meeting** (commitment zone): +0.05. End-of-meeting statements are more deliberate.
- **Multiple people on the buyer side express the same signal**: +0.15. Organizational consensus.
- **Signal references an external deadline** (fiscal year, board meeting, regulatory): +0.10. External pressure adds urgency.

### Negative Context Modifiers (-0.05 to -0.15)

- **Signal is contradicted later in the same meeting**: -0.15. The later statement carries more weight, but the contradiction itself is a negative signal.
- **Signal comes from a junior contact without authority**: -0.10. Enthusiasm without power to act.
- **Signal is followed by "but"**: -0.10. "I love the product, BUT..." negates the positive.
- **Signal is given in response to direct selling pressure**: -0.05. May be social compliance rather than genuine intent.
- **Meeting has low overall engagement** (short, few questions): -0.10. Positive signals in a disengaged meeting are less reliable.
- **Signal is qualified with "I think" or "in my opinion"**: -0.05. Personal view, not organizational position.

### Deal Stage Context

The same signal carries different weight depending on deal stage:

| Signal Type | Discovery | Evaluation | Negotiation | Closing |
|---|---|---|---|---|
| Pain quantification | +0.2 bonus | Normal | Normal | Already captured |
| Budget mention | Normal | +0.1 bonus | +0.15 bonus | Expected |
| Timeline commitment | +0.1 bonus | +0.15 bonus | +0.2 bonus | Expected |
| Competitive mention | Normal | Normal | -0.1 penalty | -0.15 penalty |
| Implementation planning | Premature | +0.1 bonus | +0.15 bonus | +0.2 bonus |
| Contract questions | Premature | +0.15 bonus | Normal | Expected |

---

## Section 8: Aggregate Signal Analysis

### Computing the Net Score

1. Collect all signals with their final scores (after context modifiers).
2. Weight by speaker authority: Economic buyer signals get 1.5x weight. Champion signals get 1.25x. End users get 0.75x.
3. Sum all weighted scores.
4. Normalize to the -1.0 to +1.0 range: `net_score = sum / (count * max_possible_per_signal)`.
5. Apply recency bias: signals from the last 10 minutes of the meeting get 1.2x weight.

### Assessment Categories

| Net Score Range | Assessment | Recommended Action |
|---|---|---|
| +0.6 to +1.0 | Strong Buy Intent | Accelerate: send proposal, schedule close |
| +0.3 to +0.59 | Moderate Interest | Nurture: address gaps, build champion |
| 0.0 to +0.29 | Early / Tepid | Qualify: validate pain, find champion |
| -0.29 to -0.01 | Cooling Off | Re-engage: new angle, executive sponsor |
| -0.59 to -0.3 | At Risk | Rescue: address objections, reset expectations |
| -1.0 to -0.6 | Dead / Lost | Disengage or radically reposition |

### Signal Density as Health Indicator

Signal density = total signals / meeting duration in minutes.

| Density | Interpretation |
|---|---|
| > 2.0 | Highly engaged meeting, rich signal environment |
| 1.0 - 2.0 | Normal engagement, adequate signal data |
| 0.5 - 0.99 | Low engagement, may indicate disinterest or early stage |
| < 0.5 | Very low engagement, consider whether the right people were in the room |
