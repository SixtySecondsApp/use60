# Reply Classification Framework

A systematic framework for classifying cold email replies by intent, sentiment, and priority. Used by the Campaign Performance Monitor skill to triage replies and recommend follow-up actions.

## Table of Contents
1. [Classification Categories](#classification-categories)
2. [Priority Scoring](#priority-scoring)
3. [Sentiment Indicators](#sentiment-indicators)
4. [Recommended Actions per Classification](#recommended-actions-per-classification)
5. [Edge Cases](#edge-cases)
6. [CRM Update Rules](#crm-update-rules)

---

## Classification Categories

### Category 1: Positive Interest (P1)

**Definition**: The reply expresses clear interest in learning more, scheduling a meeting, or continuing the conversation. The lead is actively engaged and moving forward.

**Confidence threshold**: Assign P1 when the reply contains a direct expression of interest, a willingness to talk, or a request for next steps.

**Example phrases** (15+):
1. "This sounds interesting, tell me more"
2. "Can you send me some more information?"
3. "Let's set up a call to discuss"
4. "I'd be open to a quick chat"
5. "Yes, I'm interested"
6. "When are you available to meet?"
7. "Send me a calendar invite"
8. "We've actually been looking into this"
9. "Perfect timing -- we were just discussing this internally"
10. "I'd love to see a demo"
11. "Can you walk me through how this works?"
12. "Let me loop in my colleague who handles this"
13. "We have budget for this -- what's the next step?"
14. "I'll forward this to our team"
15. "This aligns with what we're trying to do this quarter"
16. "Sounds like it could be a fit -- what does onboarding look like?"
17. "We're evaluating solutions in this space right now"

**Sentiment**: Positive

**Urgency**: Respond within 1 hour. These leads are warm and will cool quickly.

---

### Category 2: Question / Information Request (P2)

**Definition**: The reply asks a question or requests specific information before committing to a conversation. The lead is interested enough to engage but needs more data to move forward.

**Confidence threshold**: Assign P2 when the reply contains a question about the product, pricing, process, or company -- but does not yet express commitment to a meeting or next step.

**Example phrases** (15+):
1. "What's the pricing for this?"
2. "How does this differ from [competitor]?"
3. "Do you work with companies in [industry]?"
4. "What's the typical ROI your clients see?"
5. "How long does implementation take?"
6. "Can you send a case study?"
7. "What integrations do you support?"
8. "Who else in [industry] uses this?"
9. "How many people would we need on our side?"
10. "What's the contract length?"
11. "Do you offer a free trial?"
12. "What kind of support is included?"
13. "How does this handle [specific use case]?"
14. "Can this work with our existing [tool/system]?"
15. "What data do you need from us to get started?"
16. "Is this cloud-based or on-premise?"
17. "What security certifications do you have?"

**Sentiment**: Neutral to positive (curiosity)

**Urgency**: Respond within 4 hours with the requested information. Include a soft CTA for a meeting.

---

### Category 3: Neutral / Acknowledgment (P3)

**Definition**: The reply acknowledges receipt of the email without expressing clear interest or disinterest. The lead is neither advancing nor declining. These replies require careful interpretation -- some are polite brush-offs, others are genuine acknowledgments from busy people.

**Confidence threshold**: Assign P3 when the reply is brief, non-committal, and doesn't contain questions or clear interest signals.

**Example phrases** (15+):
1. "Thanks for reaching out"
2. "Got it, thanks"
3. "Noted"
4. "I'll take a look"
5. "Will review when I have a chance"
6. "Thanks for the info"
7. "Appreciate you sending this over"
8. "Let me think about it"
9. "I'll get back to you"
10. "Maybe later"
11. "Interesting"
12. "OK"
13. "Received, thank you"
14. "I'll keep this on file"
15. "Good to know"
16. "We might look at this down the road"
17. "Thanks, not a priority right now but I'll keep you in mind"

**Sentiment**: Neutral

**Urgency**: No immediate action required. Continue the sequence. If the lead replied with a soft "maybe later," consider a tailored follow-up in 2-3 weeks.

---

### Category 4: Negative / Not Interested (P4)

**Definition**: The reply clearly declines interest, requests no further contact, or expresses displeasure. Respect the response and remove from the active sequence.

**Confidence threshold**: Assign P4 when the reply contains an explicit decline, an expression of disinterest, or a request to stop emailing. Be careful to distinguish "not now" (which is P3 or an edge case) from "not ever" (which is P4).

**Example phrases** (15+):
1. "Not interested, thanks"
2. "We're all set with our current solution"
3. "Please don't contact me again"
4. "This isn't relevant to us"
5. "We're not looking for this right now"
6. "No thanks"
7. "Stop emailing me"
8. "Not a fit for our organization"
9. "We just signed with [competitor]"
10. "We don't have budget for this"
11. "We're locked into a contract for the next 2 years"
12. "Our team is too small for this"
13. "I'm the wrong person for this"
14. "This doesn't apply to our business"
15. "Please remove me from your list"
16. "How did you get my email?"
17. "This is spam"
18. "We tried something similar and it didn't work"

**Sentiment**: Negative

**Urgency**: Remove from sequence immediately. Do NOT send further emails in this campaign. Log the reason for future reference.

**Special handling for "wrong person" replies**: If the lead says "I'm not the right person" but doesn't indicate hostility, reclassify as P2 and ask for a referral: "Totally understand -- who on your team would be the best person to speak with about this?"

---

### Category 5: Auto-Reply / Out of Office (P5-Auto)

**Definition**: An automated response indicating the recipient is unavailable. Not a human decision -- requires scheduling logic, not messaging changes.

**Confidence threshold**: Assign P5-Auto when the reply contains hallmarks of automated messages: "out of the office," return dates, alternative contacts, or auto-reply headers.

**Example phrases** (15+):
1. "I'm currently out of the office until [date]"
2. "Thank you for your email. I am away and will return on [date]"
3. "This is an automated response"
4. "I have limited access to email until [date]"
5. "For urgent matters, please contact [name]"
6. "I am on PTO and will respond when I return"
7. "I'm traveling and will have intermittent email access"
8. "Auto-reply: I'm out of office"
9. "Thank you for reaching out. I'm currently on leave"
10. "I will respond to your email after [date]"
11. "I'm on maternity/paternity leave until [date]"
12. "This inbox is no longer monitored. Please contact [email]"
13. "I've moved to a new role. My new email is [email]"
14. "This email address is no longer active"
15. "I'll be back in the office on [date] and will review your message then"
16. "Delivery notification: Your message has been received and will be reviewed"

**Sentiment**: Neutral (not a human response)

**Urgency**: Extract the return date if available. Pause the sequence for this lead and schedule a re-send for 1-2 days after their return date. If no return date is given, pause for 2 weeks and retry.

**Special handling**: If the auto-reply mentions an alternative contact (e.g., "For sales inquiries, contact Jane Smith"), flag this as an opportunity to redirect outreach to the alternative contact.

---

### Category 6: Unsubscribe Request (P5-Unsub)

**Definition**: The reply explicitly requests removal from the mailing list or future communications. This is a compliance-critical category -- unsubscribe requests must be honored immediately regardless of tone or phrasing.

**Confidence threshold**: Assign P5-Unsub when the reply contains any language requesting removal, opt-out, or cessation of emails. When in doubt between P4 (not interested) and P5-Unsub, choose P5-Unsub -- it's safer from a compliance perspective.

**Example phrases** (15+):
1. "Unsubscribe"
2. "Remove me from your list"
3. "Please stop emailing me"
4. "Take me off this list"
5. "Opt out"
6. "I don't want to receive these emails"
7. "Remove my email address"
8. "Do not contact me again"
9. "Unsubscribe me immediately"
10. "Please delete my information"
11. "I never signed up for this"
12. "GDPR removal request"
13. "This is unsolicited -- remove me"
14. "I want to be removed from all communications"
15. "How do I opt out of these emails?"
16. "Stop"

**Sentiment**: Negative

**Urgency**: Process immediately. Remove from all active campaigns and add to the organization-wide suppression list. This is not optional -- it's a compliance requirement.

---

## Priority Scoring

### Priority Levels

| Priority | Category | Score Weight | Response SLA | Business Value |
|----------|----------|-------------|-------------|----------------|
| **P1** | Positive Interest | 5 | 1 hour | Highest -- direct pipeline potential |
| **P2** | Question / Request | 3 | 4 hours | High -- engaged lead, needs nurturing |
| **P3** | Neutral | 1 | Next sequence step | Low -- monitor, don't invest time |
| **P4** | Negative | 0 | Immediate removal | None -- respect the decline |
| **P5-Auto** | Auto-Reply / OOO | 0 | Reschedule | None now -- future potential |
| **P5-Unsub** | Unsubscribe | 0 | Immediate removal | None -- compliance action |

### Reply Quality Score Formula

```
Reply Quality Score = (P1_count x 5 + P2_count x 3 + P3_count x 1) / total_replies x 20
```

This produces a score from 0 to 100:
- **80-100**: Exceptional. Most replies are positive interest or active questions.
- **60-79**: Good. Healthy mix of interested and curious leads.
- **40-59**: Average. Many neutral or auto-replies diluting quality.
- **20-39**: Below average. Mostly neutral or negative. Review targeting.
- **0-19**: Poor. Predominantly negative or auto-replies. Campaign needs overhaul.

### Distribution Benchmarks

A healthy cold email campaign should have approximately this reply distribution:

| Category | Percentage of Replies | Notes |
|----------|----------------------|-------|
| P1 (Positive) | 15-25% | Target: 20%+ |
| P2 (Question) | 10-20% | Shows messaging creates curiosity |
| P3 (Neutral) | 20-30% | Expected for cold outreach |
| P4 (Negative) | 15-25% | Some rejection is normal and healthy |
| P5-Auto (OOO) | 10-20% | Varies by season; higher in summer/holidays |
| P5-Unsub | 2-5% | Should be lowest category |

If P4 + P5-Unsub exceeds 40% of total replies, the campaign has a targeting or messaging problem.

---

## Sentiment Indicators

### Positive Sentiment Signals

Look for these indicators when a reply could go either way:

- **Exclamation marks used positively**: "Sounds great!" vs. "Stop emailing me!"
- **Questions about specifics**: Asking about pricing, timelines, or features shows engagement
- **Forward references**: "Let me loop in..." or "I'll share with my team..."
- **Time commitment**: Mentioning availability or asking about scheduling
- **Problem acknowledgment**: "We've been struggling with this" or "That's exactly our issue"
- **Company context sharing**: "We currently use [tool] and it's not working well"
- **Budget signals**: "What does this cost?" or "Do you have packages for small teams?"

### Negative Sentiment Signals

- **Caps lock or exclamation marks used aggressively**: "STOP EMAILING ME!!"
- **Threats**: "I'll report you as spam" or "This is going to legal"
- **Hostile questions**: "How did you get my email?" or "Who gave you my information?"
- **Dismissive brevity**: Single-word replies like "No" or "Pass"
- **Competitor loyalty**: "We love [competitor] and will never switch"
- **Absolute language**: "Never," "absolutely not," "under no circumstances"

### Ambiguous Sentiment (Requires Judgment)

These require reading the full context:

- **"Maybe"** -- could be polite disinterest or genuine consideration
- **"We'll see"** -- often a brush-off; treat as P3 unless other positive signals exist
- **"Send me info"** -- could be genuine curiosity (P2) or a way to end the conversation (P3)
- **"Interesting"** -- one word with no follow-up is usually P3, not P1
- **"Let me think about it"** -- genuine if they asked questions; brush-off if they didn't

**Rule of thumb**: When sentiment is ambiguous, classify based on the most likely interpretation AND recommend a test action. For example: "Classified as P3 (Neutral), but could be P2. Recommend: send a low-pressure follow-up with a specific case study to test engagement."

---

## Recommended Actions per Classification

### P1: Positive Interest

| Action | Timeline | Details |
|--------|----------|---------|
| **Respond personally** | Within 1 hour | Drop the sequence; this is a human conversation now |
| **Send calendar link** | With response | Include specific time suggestions, not just a generic link |
| **Research the lead** | Before responding | Check CRM, LinkedIn, company site for context |
| **Notify account owner** | Immediately | If the lead belongs to another rep's territory |
| **Update CRM** | With response | Status: Engaged, create meeting task |
| **Prepare meeting brief** | Before the call | Use meeting-prep-brief skill if a meeting is scheduled |

### P2: Question / Info Request

| Action | Timeline | Details |
|--------|----------|---------|
| **Answer the question directly** | Within 4 hours | Lead with the answer, then expand |
| **Include a soft CTA** | With response | "Happy to walk through this on a quick call if helpful" |
| **Attach relevant resources** | With response | Case study, one-pager, or demo link |
| **Continue sequence (modified)** | After response | If no reply to your answer within 3 days, resume sequence |
| **Update CRM** | With response | Log the question and your answer |

### P3: Neutral / Acknowledgment

| Action | Timeline | Details |
|--------|----------|---------|
| **Continue sequence** | Normal timing | Don't break the sequence cadence |
| **Consider a soft check-in** | 2-3 weeks later | Only if they said "maybe later" or "keep me posted" |
| **Update CRM** | Same day | Log the reply, no status change |
| **Monitor for re-engagement** | Ongoing | If they open future emails, they may still convert |

### P4: Negative / Not Interested

| Action | Timeline | Details |
|--------|----------|---------|
| **Remove from sequence** | Immediately | Do NOT send any more emails in this campaign |
| **Send graceful close** | Optional | "Totally understand -- thanks for letting me know" (only if tone allows) |
| **Update CRM** | Immediately | Status: Not Interested, log reason |
| **Add to suppression** | Immediately | For THIS campaign type. May still be contactable for different offers later |
| **Note the reason** | With CRM update | "Already using competitor," "No budget," etc. -- useful for future campaigns |

### P5-Auto: Out of Office

| Action | Timeline | Details |
|--------|----------|---------|
| **Pause sequence** | Immediately | Do not send the next email while they're away |
| **Extract return date** | Immediately | Parse the auto-reply for return date |
| **Reschedule send** | Return date + 1-2 days | Give them time to clear their inbox |
| **Note alternative contacts** | If mentioned | Potential lead to redirect outreach |
| **Update CRM** | Same day | Note: OOO until [date] |

### P5-Unsub: Unsubscribe

| Action | Timeline | Details |
|--------|----------|---------|
| **Remove from ALL active campaigns** | Immediately | Not just this one -- all of them |
| **Add to global suppression list** | Immediately | Prevent re-addition from future imports |
| **Confirm removal** | Optional | "You've been removed -- sorry for the inconvenience" |
| **Update CRM** | Immediately | Status: Do Not Contact, add suppression flag |
| **Audit list source** | Same day | If multiple unsubs from same source, flag the list quality |

---

## Edge Cases

### "Interested But Not Now"

**Examples**: "This looks interesting but we're locked into a contract until June," "Not a priority this quarter but maybe next year," "We're in the middle of a migration -- bad timing."

**Classification**: P3 (Neutral) with a P1 flag for future re-engagement.

**Action**: Remove from the current sequence. Create a CRM task to re-engage at the indicated time (e.g., "Follow up with [name] in June when contract expires"). Log the specific timing signal. These are often the highest-quality future pipeline leads.

### Sarcasm Detection

**Examples**: "Oh great, another cold email," "Just what I needed today -- more spam," "Wow, really personalized outreach (not)."

**Classification**: P4 (Negative). Sarcasm in response to cold email is always a rejection signal, even if the literal words could be interpreted positively.

**Action**: Remove from sequence. Do NOT reply with a cute or matching sarcastic tone. Log as not interested.

**Detection signals**: Quotation marks around positive words ("very helpful"), obvious contradictions, "/s" or explicit sarcasm markers, excessive ellipses after positive statements ("Great...").

### Internal Forwards

**Examples**: "Forwarding this to Sarah who handles vendor relationships," "CC'ing our head of [department]," "Let me pass this to the right person."

**Classification**: P1 (Positive Interest). An internal forward is one of the strongest buying signals in cold email -- the original recipient found the message relevant enough to route it internally.

**Action**: Treat as P1. Research the person they're forwarding to. When that person reaches out, reference the original contact: "Thanks for connecting with me -- [original name] mentioned this might be relevant for your team." Add the new contact to CRM.

### "Who Are You?" / "How Did You Get My Email?"

**Examples**: "I don't recognize your company -- who is this?" "How did you find my email?" "Where did you get my information?"

**Classification**: P3 or P4 depending on tone.
- **Curious tone** (P3): They're interested enough to ask. Respond with a brief, honest explanation and pivot to value.
- **Hostile tone** (P4): They're upset. Apologize, explain briefly, offer to remove them.

**Action**: Always answer honestly. "I found your profile on LinkedIn and thought [specific reason] might resonate given [something specific about their role/company]." Never be evasive about data sources.

### Referral Replies

**Examples**: "I'm not the right person but try reaching out to [name]," "You should talk to our [title] about this," "My colleague [name] handles this -- their email is [email]."

**Classification**: P1 (Positive Interest) for the referral target. P3 for the original contact.

**Action**: Add the referred contact to CRM immediately. When reaching out, lead with the referral: "Hi [name], [referrer name] suggested I connect with you about..." Referral-initiated outreach converts 3-5x higher than cold outreach.

### Delayed Positive Response

**Examples**: A lead who was classified as P3 two weeks ago suddenly replies with "Actually, I've been thinking about this -- do you have time this week?"

**Classification**: Reclassify to P1 immediately.

**Action**: Treat with P1 urgency (respond within 1 hour). Note in CRM that this lead has a longer consideration cycle. Prioritize highly -- delayed positive responses often come from senior decision-makers who needed time to evaluate internally.

### Multi-Intent Replies

**Examples**: "Interesting, but how much does it cost? Also, is there a free trial? My boss would need to approve this." (Contains: positive interest + pricing question + process question)

**Classification**: Assign the highest applicable priority. In this case, P1 (positive interest) with P2 elements (questions).

**Action**: Address all elements in your response. Lead with the strongest signal (interest), then answer each question. The multi-intent reply indicates genuine evaluation -- this is a high-quality lead.

### Complaint About Email Frequency

**Examples**: "You've sent me 4 emails in 2 weeks -- that's too many," "I keep getting emails from your company," "How many more of these will I get?"

**Classification**: P4 if hostile, P3 if neutral.

**Action**: Apologize and adjust. If they're complaining but not asking to be removed, reduce the sequence cadence for this lead (e.g., double the delay between steps). If they're explicitly asking to stop, treat as P5-Unsub. Either way, review your sequence timing -- if multiple people complain, the cadence is too aggressive for your audience.

### Reply in a Different Language

**Examples**: Reply is in Spanish, German, Japanese, etc., but the outreach was in English.

**Classification**: Classify the content normally (translate first), then note the language preference.

**Action**: If the content is positive (P1/P2), respond in their language if possible, or acknowledge and offer to connect them with someone who speaks their language. If negative (P4/P5), honor the request regardless of language.

---

## CRM Update Rules

### Field Updates by Classification

| Classification | Contact Status | Deal Action | Task Created | Sequence Action |
|---------------|---------------|-------------|-------------|----------------|
| **P1 (Positive)** | "Engaged" | Create/update deal if criteria met | "Follow up with [name]" -- due: 1 hour | Remove from sequence |
| **P2 (Question)** | "Responded" | No change | "Answer [name]'s question" -- due: 4 hours | Pause sequence |
| **P3 (Neutral)** | No change | No change | None | Continue sequence |
| **P4 (Negative)** | "Not Interested" | Close lost if associated | None | Remove from sequence |
| **P5-Auto** | No change | No change | "Re-engage [name] after [date]" | Pause sequence |
| **P5-Unsub** | "Do Not Contact" | Close lost if associated | None | Remove from all sequences |

### Activity Logging

Every classified reply should generate an activity record with:
- **Type**: "Email Reply"
- **Source**: Campaign name + step number
- **Classification**: P1/P2/P3/P4/P5
- **Sentiment**: Positive/Neutral/Negative
- **Reply snippet**: First 200 characters of the reply
- **Recommended action**: From the action tables above
- **Timestamp**: When the reply was received

### Suppression List Rules

| Event | Suppression Scope | Duration |
|-------|------------------|----------|
| P4 (Not Interested) | This campaign type | 6 months |
| P4 (hostile / "stop emailing") | All campaigns | 12 months |
| P5-Unsub (explicit request) | All campaigns | Permanent |
| Multiple P3 with no conversion (3+) | This campaign type | 3 months |
| Hard bounce | All campaigns | Permanent (until re-verified) |

### Re-engagement Eligibility

Contacts can be re-engaged under these conditions:

| Original Classification | Re-engage After | Condition |
|------------------------|----------------|-----------|
| P3 (Neutral) | 30 days | Different campaign angle or offer |
| P4 ("not now") | 90 days or when timing trigger fires | Different value prop; reference their timing signal |
| P4 ("wrong person") | Immediately | Contact the referred person instead |
| P4 (hostile) | 12 months | Only with a genuinely new, relevant offer |
| P5-Auto (OOO) | Return date + 2 days | Same sequence, resumed |
| P5-Unsub | Never | Permanent suppression |
