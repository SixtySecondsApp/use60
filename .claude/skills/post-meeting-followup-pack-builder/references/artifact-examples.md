# Follow-Up Artifact Examples — Complete Reference

Annotated real-world examples of excellent and poor follow-up packs. Each example includes what makes it work (or fail), industry-specific tone adjustments, and meeting outcome variations. Use these to calibrate pack quality.

## Table of Contents

1. [Annotation Key](#annotation-key)
2. [5 Excellent Follow-Up Pack Examples](#5-excellent-follow-up-pack-examples)
3. [3 Poor Follow-Up Pack Examples](#3-poor-follow-up-pack-examples)
4. [Before/After Comparisons](#beforeafter-comparisons)
5. [Industry-Specific Tone Adjustments](#industry-specific-tone-adjustments)
6. [Meeting Outcome Variations](#meeting-outcome-variations)

---

## Annotation Key

Annotations are marked with **[A]** tags throughout:

- **[A-WHAT-WE-HEARD]**: "What we heard" technique — buyer's words, not yours
- **[A-SPECIFICITY]**: Specific detail proving personalization
- **[A-ATTRIBUTION]**: Point attributed to a specific person by name
- **[A-OWNER-DEADLINE]**: Clear ownership and deadline assignment
- **[A-SINGLE-CTA]**: One clear call-to-action (not multiple asks)
- **[A-MOMENTUM]**: Element that preserves deal momentum
- **[A-TONE]**: Tone calibration matching meeting outcome
- **[A-TRUST]**: Trust-building element (honesty, vulnerability, ownership)
- **[A-RISK]**: Honest risk identification (internal only)
- **[A-ACTIONABLE]**: Specific, actionable language (not vague)
- **[A-RAG]**: Historical context from previous meetings (Layer 3)
- **[A-ENRICHMENT]**: Web search enrichment woven in (Layer 2)
- **[A-CONFIDENCE]**: Outcome confidence signal detected (Layer 4)

---

## 5 Excellent Follow-Up Pack Examples

### Example 1: Post-Discovery — SaaS Mid-Market ($80K deal)

**Context**: Discovery call with 200-person SaaS company. VP of Engineering and 2 senior engineers. Competitive evaluation with ConnectHub. First meeting — no RAG history.

**Buyer Email (167 words)**:
```
Subject: DataFlow x Acme — Integration Deep Dive + Demo Setup

Hi Sarah,

Thanks for the thorough walkthrough of Acme's data pipeline today.     [A-SPECIFICITY]
Hearing directly from James and Priya about the manual reconciliation  [A-ATTRIBUTION]
bottleneck gave us exactly the context we needed.

What we heard from your team:                                          [A-WHAT-WE-HEARD]
- Manual data reconciliation consuming 15+ hrs/week across             [A-SPECIFICITY]
  3 engineers (James)                                                  [A-ATTRIBUTION]
- SOC 2 compliance by Q3 is non-negotiable for any new vendor (Sarah)  [A-ATTRIBUTION]
- ConnectHub's API documentation didn't meet your custom schema        [A-SPECIFICITY]
  requirements (Priya)
- Budget approval requires VP Engineering sign-off by end of month     [A-SPECIFICITY]

Next steps:
1. [DataFlow] Prepare tailored demo with custom schema mapping         [A-OWNER-DEADLINE]
   and SOC 2 compliance walkthrough — by Friday EOD
2. [Acme] Share sample API schema and test credentials — by Thursday   [A-OWNER-DEADLINE]
3. [Both] Demo walkthrough — Monday Feb 17 at 2pm EST                  [A-MOMENTUM]

Could you share those API credentials by Thursday so we can            [A-SINGLE-CTA]
configure the demo for your exact schema?

Best,
Alex
```

**Slack Update (148 words)**:
```
*Acme Corp — Discovery Call Update*
*Signal*: :green_circle: Advancing

*TL;DR*: Strong discovery. VP Eng (Sarah Chen) is champion.
Budget approved in principle, needs VP sign-off by month-end.

*Key Intel*:
- 15+ hrs/week on manual reconciliation — 3 engineers full-time.
  This is real pain, not hypothetical.
- Evaluated ConnectHub, unhappy with API docs. Opening for us
  if we nail the demo.
- Budget: ~$80K range. VP Eng sign-off, month-end deadline.

*Risks*:
- :warning: SOC 2 is a hard gate (Q3 deadline). Compliance brief
  must be ready for demo.
- :warning: Priya (Sr Eng) was skeptical about migration effort.
  @David: address this specifically in demo.                           [A-RISK]

*Asks*:
- @David (SE): Tailored demo with schema mapping by Friday EOD
- @Lisa (CSM): Can we commit Q2 go-live for Q3 SOC 2?

*Next*: Demo Monday Feb 17, 2pm EST.
```

**Why this is excellent**: 4 personalization signals. Every point attributed. Competitive intel surfaced without aggression. CTA maps directly to a task. Slack is candid about risks. Team has specific asks with deadlines.

---

### Example 2: Post-Demo — Enterprise Manufacturing ($250K deal)

**Context**: Product demo for Fortune 500 manufacturer. 6 attendees including Director of IT and security architect. Data residency concern raised. This is their 3rd meeting — RAG shows previous commitment about providing test data that was fulfilled.

**Buyer Email (184 words)**:
```
Subject: TechCorp Demo Recap — Data Residency Addressed + POC Plan

Hi David,

Great session today — your team's technical rigor was impressive,      [A-TONE]
and Marcus's questions about EU data residency were exactly the        [A-ATTRIBUTION]
ones we expected at this stage.                                        [A-TRUST]

What resonated:
- Real-time bi-directional sync with your SAP ERP (the 200ms          [A-SPECIFICITY]
  latency demo caught your team's attention)
- Native SAML/SSO integration — no middleware required                 [A-SPECIFICITY]

Concern raised by Marcus: EU data residency for GDPR compliance        [A-ATTRIBUTION]
- Our response: We operate EU-West (Frankfurt) and EU-North            [A-SPECIFICITY]
  (Stockholm) data centers. Attached: data residency architecture      [A-TRUST]
  doc with GDPR compliance certifications.

Decisions:
- Proceed with 4-week POC focused on SAP sync module                   [A-MOMENTUM]
- Scope: 3 data feeds, production-like volume (50K records/day)        [A-SPECIFICITY]

Next steps:
1. [Our team] POC environment with EU-West residency — Wednesday EOD   [A-OWNER-DEADLINE]
2. [TechCorp] VPN credentials and SAP sandbox access — Friday          [A-OWNER-DEADLINE]
3. [Both] POC kickoff — Tuesday Feb 25 at 10am CET                     [A-MOMENTUM]

Does Tuesday at 10am CET work for the kickoff?                         [A-SINGLE-CTA]

Best,
Jennifer
```

**Why this is excellent**: Addresses the security concern head-on with a dedicated section. Attaches supporting evidence proactively. POC scope is enterprise-precise ("3 data feeds, 50K records/day"). Technical details at the right level of specificity.

---

### Example 3: Post-Renewal Discussion — Customer Success ($120K/year)

**Context**: Renewal discussion with 2-year customer. Account value $120K/year. Customer shared satisfaction and frustration. RAG shows support ticket complaints mentioned in 2 previous meetings.

**Buyer Email (194 words)**:
```
Subject: Meridian Renewal — Your Feedback + Proposed Enhancements

Hi Lisa,

Thank you for the candid conversation today. Your team's honesty       [A-TONE]
about both what's working and where we're falling short is exactly
what helps us serve you better.                                        [A-TRUST]

What's working well:
- Pipeline automation saved your team 12 hrs/week (your words:         [A-WHAT-WE-HEARD]
  "game-changer for our SDR team")                                     [A-ATTRIBUTION]
- Custom reporting dashboard — used daily by leadership                [A-SPECIFICITY]

Where we need to improve:
- Response time on support tickets (your team flagged 48-hour          [A-WHAT-WE-HEARD]
  waits — that's not acceptable and we own it)                         [A-TRUST]
- Mobile app performance on Android (Rachel mentioned crashes          [A-ATTRIBUTION]
  during field visits)

I should note — this is the third time support response times          [A-RAG]
have come up in our conversations. We hear you, and this time
we're putting a structural fix in place, not just a patch.

What we're doing about it:
- Dedicated support channel with 4-hour SLA — effective immediately    [A-ACTIONABLE]
- Android app fix shipped in next release (March 1 target)             [A-SPECIFICITY]

Renewal structure:
- 2-year renewal at current rate with dedicated CSM
- Added: Priority support tier (4-hour SLA) at no additional cost      [A-MOMENTUM]

Shall we schedule the review for [date]?                               [A-SINGLE-CTA]

Best,
Sarah
```

**Why this is excellent**: Acknowledges both positive and negative. "We own it" builds trust. RAG context surfaces the recurring theme — "this is the third time" shows the rep has long-term memory. Immediate remediation demonstrates action. Concession directly addresses the stated concern.

---

### Example 4: Post-Executive Briefing — Tech Startup ($45K deal)

**Context**: 30-minute briefing with CEO of 50-person startup. CEO was direct, made fast decisions. Web search revealed they just closed a $15M Series B last week.

**Buyer Email (92 words)**:
```
Subject: Nexus AI Briefing — Decision + Next Steps

Hi Chen,

Congratulations again on the Series B — exciting momentum.             [A-ENRICHMENT]
Three takeaways from today:

1. You want sales automation live before Q2 hiring push (your          [A-WHAT-WE-HEARD]
   words: "we're tripling the team and need systems before people")    [A-ATTRIBUTION]
2. Annual commitment approved — procurement to handle contract         [A-CONFIDENCE]
3. Target go-live: 6 weeks from contract signature                     [A-SPECIFICITY]

We'll deliver:
- Implementation timeline + onboarding plan — by Thursday              [A-OWNER-DEADLINE]

Next: Your procurement team and our legal will coordinate.             [A-MOMENTUM]
Julia will reach out to [procurement contact] tomorrow.

Best,
Mark
```

**Why this is excellent**: 92 words — perfectly calibrated for an executive who values brevity. Web enrichment (Series B) shows the rep pays attention to their world. High confidence outcome — assumptive language because the CEO personally committed. No hedging, no extra asks.

---

### Example 5: Post-Technical Deep-Dive — Healthcare IT ($180K deal)

**Context**: Architecture review with hospital system IT team. HIPAA compliance is non-negotiable. 4 engineers + CISO attended. RAG shows this is the 5th meeting — deal has been progressing steadily for 8 weeks.

**Buyer Email (176 words)**:
```
Subject: HealthBridge Technical Review — HIPAA Architecture + POC Scope

Hi Dr. Martinez,

Thank you for the thorough architecture review today. Having your
CISO Rebecca validate our encryption-at-rest approach was a key        [A-ATTRIBUTION]
milestone — we understand the stakes in healthcare IT.                 [A-TONE]

Technical alignment confirmed:
- HL7 FHIR R4 integration with your Epic EHR via direct connector      [A-SPECIFICITY]
- End-to-end encryption: AES-256 at rest, TLS 1.3 in transit          [A-SPECIFICITY]
- Data residency: US-East (Virginia) — BAA-covered region              [A-SPECIFICITY]

Rebecca's remaining question: audit logging granularity for HIPAA      [A-ATTRIBUTION]
- We're preparing a detailed audit log specification document
  with sample outputs by Monday                                        [A-ACTIONABLE]

POC scope agreed:
- 3-week POC with de-identified patient data (500 records/day)
- Success criteria: <100ms API response, zero data leakage events      [A-SPECIFICITY]

Next steps:
1. [Our team] Audit log spec + POC environment — by Monday EOD         [A-OWNER-DEADLINE]
2. [HealthBridge] VPN access + test data set — by Wednesday            [A-OWNER-DEADLINE]
3. [Both] POC kickoff — Thursday Mar 6 at 9am ET                       [A-MOMENTUM]

Can your team have the test data ready by Wednesday?                   [A-SINGLE-CTA]

Best,
Amanda
```

**Why this is excellent**: Healthcare-appropriate formality (Dr. Martinez, not "hi there"). HIPAA-specific technical details at the right depth. CISO validation called out as a milestone. Success criteria are measurable. De-identified data shows compliance awareness.

---

## 3 Poor Follow-Up Pack Examples

### Poor Example 1: The Generic Template

**Buyer Email**:
```
Subject: Follow-up from our meeting

Hi,

Thanks for the meeting today. We discussed your needs and how
our platform can help. Our solution offers real-time sync, custom
connectors, and enterprise security.

I've attached some materials for your review. Let me know if you
have any questions or would like to schedule a follow-up.

Best regards,
Alex
```

**Slack Update**:
```
Had a good meeting with Acme. They're interested. Going to
schedule a demo next week. Will follow up.
```

**Tasks**:
```
1. "Follow up with Acme" — due: next week
2. "Update CRM" — due: soon
3. "Prepare demo" — due: TBD
```

**What went wrong**:
- **Zero personalization**: No buyer quotes, no specific references, no attribution. This email could be for any company after any meeting.
- **Re-pitches features not discussed**: "real-time sync, custom connectors" may not have been mentioned. This makes the rep look like they are on autopilot.
- **Dead-end CTA**: "Let me know if you have questions" invites silence. No specific ask, no specific date.
- **Slack has no structure**: No signal icon, no risks, no asks, no specifics. Team is completely blind.
- **Tasks are intentions, not tasks**: "Follow up" is not actionable. "Soon" is not a deadline. "TBD" is a confession that nothing was planned.
- **Momentum score: 1/5** — This pack will not prevent deal stall.

---

### Poor Example 2: The Information Dump

**Buyer Email (347 words)**:
```
Subject: Comprehensive recap of today's discussion and next steps
  for the evaluation process

Hi Sarah,

Thank you so much for taking the time to meet with us today. We
really enjoyed the conversation and are excited about the potential
partnership between our companies.

During our meeting, we covered a lot of ground. First, we discussed
your current data pipeline architecture, including the manual
reconciliation process that James mentioned is taking significant
time. We also talked about your SOC 2 compliance requirements and
the timeline for that. Priya raised some excellent points about API
documentation quality, which is something we take very seriously.

Let me share some additional context about our platform that I think
will be relevant. Our data integration engine supports over 200
connectors out of the box, with custom connector development available
for enterprise clients. We also recently achieved SOC 2 Type II
certification and our median API response time is under 50ms.

Additionally, I wanted to mention that we just released our new
real-time monitoring dashboard, which several of our enterprise
clients have found extremely valuable. We also have a partnership
with [Company X] that enables...

[continues for 3 more paragraphs]

Next steps:
- We'll send over some materials
- Let's find a time for a demo
- Happy to loop in our technical team

Best,
Alex
```

**What went wrong**:
- **347 words — 73% over the 200-word maximum**. Nobody reads this.
- **Narrative format, not scannable**: Walls of text. No bullets until the very end.
- **Feature dump**: 3 paragraphs of capabilities the buyer did not ask about. This damages credibility.
- **"What we heard" is absent**: The email talks about what the rep wants to say, not what the buyer said.
- **Vague next steps**: "Send some materials" and "find a time" have no owners, no deadlines, no specificity.
- **Momentum score: 2/5** — The buyer gets information but no clear path forward.

---

### Poor Example 3: The Copy-Paste Accident

**Buyer Email**:
```
Subject: Meeting follow-up — [COMPANY NAME]

Hi [CONTACT NAME],

Great meeting today about [TOPIC]. As discussed, here are the
next steps:

1. [OUR TEAM] — [DELIVERABLE] by [DATE]
2. [THEIR TEAM] — [DELIVERABLE] by [DATE]
3. Both — [MEETING TYPE] on [DATE]

[PERSONALIZATION NOTE]

Would [DAY] at [TIME] work?

Best,
[REP NAME]
```

**What went wrong**:
- **Template placeholders not filled in**: "[COMPANY NAME]", "[CONTACT NAME]", "[TOPIC]" — this is the cardinal sin. It tells the buyer you did not care enough to even fill in the blanks.
- **Instant trust destroyer**: This single mistake can kill a deal. The buyer will question everything else you say.
- **Prevention**: The skill should validate that no bracket-enclosed placeholder text remains in any artifact before finalizing. Add a regex check: `/\[[A-Z_\s]+\]/` should return zero matches.

---

## Before/After Comparisons

### Comparison 1: Discovery Follow-Up

**Before (Mediocre)**:
```
Subject: Follow-up

Hi Sarah,

Thanks for the meeting. We're excited about the opportunity to
work together. Let me know if you have questions.

Best,
Alex
```
**Score: 52 words. 0 personalization. 0 specific next steps. Dead-end CTA. Momentum: 1/5.**

**After (Excellent)**:
```
Subject: Acme x DataFlow — Discovery Recap + Demo Monday

Hi Sarah,

Thanks for walking us through Acme's data pipeline today. James's
insight about the 15-hour-per-week reconciliation bottleneck was
eye-opening — that's a significant engineering cost.

What we heard:
- Manual data reconciliation: 15+ hrs/week across 3 engineers (James)
- SOC 2 compliance by Q3 is non-negotiable (Sarah)
- ConnectHub's API docs didn't meet custom schema needs (Priya)
- VP Engineering sign-off required, targeting end of month

Next steps:
1. [DataFlow] Tailored demo + SOC 2 walkthrough — Friday EOD
2. [Acme] Sample API schema and test credentials — Thursday
3. [Both] Demo — Monday Feb 17 at 2pm EST

Could you share those API credentials by Thursday?

Best,
Alex
```
**Score: 167 words. 4 personalization signals. 3 specific next steps with owners and dates. Specific CTA. Momentum: 4/5.**

### What Changed

| Element | Before | After |
|---------|--------|-------|
| Buyer quotes | 0 | 4 attributed quotes |
| Specific details | 0 | 7 specifics |
| Deadlines | 0 | 5 specific dates |
| CTA type | "Let me know" (passive) | "Share credentials by Thursday" (specific) |
| Word count | 52 (too short) | 167 (right-sized) |
| Time to write | 2 minutes | 15 minutes (with this skill: 60 seconds) |

---

### Comparison 2: Post-Negotiation Slack Update

**Before**:
```
Meridian renewal chat went OK. They have some concerns about
support but I think we can work it out. Will send proposal Friday.
```

**After**:
```
*Meridian Corp — Negotiation Update*
*Signal*: :red_circle: At Risk — budget pushback, timeline slipping

*TL;DR*: Renewal at risk. Lisa flagged 48-hour support ticket waits
and Android app crashes. Internal pressure to evaluate alternatives.

*Key Intel*:
- Lisa's VP asked her to "make sure we're getting best value"
  — code for "get competitive quotes." Urgent response needed.
- They WANT to stay — pipeline automation is a "game-changer"
  — but support issues give ammunition to internal skeptics.

*Risks*:
- :warning: CRITICAL: 48-hour support waits are our fault, not
  a negotiation tactic. @Support Lead: need root cause by Wed EOD.
- :warning: Android crashes during field visits. Rachel uses daily.

*Asks*:
- @Support Lead: Meridian ticket root cause analysis by Wed EOD
- @Product: Android fix timeline — is March 1 realistic?
- @Manager: Approve adding priority support (4-hr SLA) at no cost

*Next*: Proposal Friday. Need all inputs by Thursday EOD.
```

**What Changed**: Before version gives the team nothing to act on. After version maps power dynamics, surfaces the real risk, requests specific help with deadlines, and gives the manager the information needed to approve a concession.

---

## Industry-Specific Tone Adjustments

### Technology / SaaS
- **Tone**: Direct, efficient, jargon-comfortable
- **Email style**: Technical specifics welcome. Reference integrations, APIs, performance metrics.
- **Caution**: Do not over-explain basic concepts. Tech buyers find condescension worse than complexity.
- **Example opener**: "Thanks for the deep dive on your event-driven architecture today."

### Financial Services
- **Tone**: Formal, precise, risk-aware
- **Email style**: Compliance references mandatory. Use exact terms (not approximations). Reference regulatory frameworks by name.
- **Caution**: Never use casual language. "Hey" is inappropriate. Avoid exclamation marks. Numbers must be exact.
- **Example opener**: "Thank you for the thorough discussion on regulatory requirements today."

### Healthcare
- **Tone**: Professional, empathetic, compliance-first
- **Email style**: Reference HIPAA, BAAs, patient data handling explicitly. Use proper titles (Dr., not first name, unless they initiate).
- **Caution**: Never reference patient data casually. Always mention de-identification when discussing test data. Data residency is not optional — state it explicitly.
- **Example opener**: "Thank you for walking us through HealthBridge's integration requirements and compliance framework today."

### Manufacturing
- **Tone**: Practical, results-oriented, ROI-focused
- **Email style**: Emphasize operational efficiency gains. Use their language (throughput, yield, downtime, OEE). Reference plant-floor reality.
- **Caution**: Manufacturing buyers are practical. Avoid abstract benefits. Show specific operational improvements with numbers.
- **Example opener**: "Thanks for the plant walkthrough today — seeing the line in operation gave us much better context for the integration."

---

## Meeting Outcome Variations

How the follow-up pack adapts based on the detected meeting outcome and confidence level.

### Positive Outcome (High Confidence)
- **Email tone**: Confident, warm, forward-looking
- **CTA style**: Assumptive — "I'll send the contract Thursday" or "Here's the calendar invite for the kickoff"
- **Slack signal**: :green_circle: Advancing
- **Task emphasis**: Execution-focused. All tasks oriented toward delivering what was committed.
- **Example CTA**: "I'll have the POC environment ready by Wednesday — does Thursday at 10am work for the kickoff?"

### Neutral Outcome (Medium Confidence)
- **Email tone**: Professional, helpful, value-adding
- **CTA style**: Confirmatory — "Does this align with what you had in mind?" or "Would a comparison document be helpful?"
- **Slack signal**: :yellow_circle: Neutral
- **Task emphasis**: Balanced. Include a re-confirmation task alongside execution tasks.
- **Example CTA**: "Would it be helpful if we prepared a comparison of both approaches before your team decides?"

### Difficult Outcome (Low Confidence)
- **Email tone**: Empathetic, solution-oriented, patient
- **CTA style**: Low-friction — "Happy to connect your team with our [role]" or "No pressure — here's a resource that might help"
- **Slack signal**: :yellow_circle: or :red_circle: depending on severity
- **Task emphasis**: Alignment-focused. Prioritize a "get stakeholder alignment" task. De-prioritize execution tasks.
- **Example CTA**: "I heard the concerns about [specific issue]. Would it help if our security team spoke directly with Marcus?"

### No-Show Variation
- **Email tone**: Gracious, brief, zero guilt
- **CTA style**: Easy reschedule — "Would any of these times work?" with 3 specific options
- **Slack signal**: :yellow_circle: with note on no-show context
- **Task emphasis**: Single task — reschedule. Do not create execution tasks for a meeting that did not happen.
- **Example CTA**: "I know schedules shift. Would Tuesday at 2pm or Thursday at 10am work better?"
- **Note**: Use the `no-show-followup` skill for dedicated no-show handling. The follow-up pack builder should only handle no-shows if specifically asked for a full pack format.
