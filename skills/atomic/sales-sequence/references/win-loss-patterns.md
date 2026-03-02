# Win/Loss Patterns — RAG-Driven Outreach Intelligence

How to use historical transcript data, CRM signals, and competitive intelligence to write sequences that convert. Reference this file when Layer 3 (Historical Context) or Layer 4 (Intelligence Signals) return data.

---

## 1. Using RAG Transcript Data to Inform Sequences

### What to Search For

Before writing any sequence, query meeting transcripts for these categories:

**Company-level queries:**
- Previous outreach to this company (any contact)
- Deals won/lost with companies in the same industry + size band
- Mentions of the prospect's company name by existing customers
- Competitive displacement stories involving this prospect's current vendor

**Persona-level queries:**
- Past conversations with same job title / seniority level
- Objections raised by this persona type and how they were handled
- What messaging resonated vs. fell flat for this role
- Decision-making patterns (consensus buyer vs. lone decision maker)

**Industry-level queries:**
- Win/loss ratio for this vertical over the past 6-12 months
- Common pain points surfaced during discovery calls in this industry
- Seasonal patterns (budget cycles, planning periods, buying windows)
- Regulatory or compliance concerns that shaped past deal conversations

### How to Apply RAG Results

| RAG Signal | How It Changes the Sequence |
|-----------|---------------------------|
| Previous outreach to this company (no reply) | Acknowledge prior touch. New angle, not repeat. Reference time elapsed. |
| Won deal with similar company | Lead with the social proof. "We helped [similar company] with [specific result]." |
| Lost deal in same industry | Avoid the messaging that failed. Use the objection that killed it as an upfront acknowledgment. |
| Prospect's company mentioned by customer | Use the referral angle: "{Customer} mentioned you're dealing with {problem}." |
| Common objection for this persona | Pre-handle it in Email 2 or 3. Don't wait for them to raise it. |
| No RAG results at all | Flag as "first interaction" — lean harder on web research and personalization. |

### Grounding Rules

1. **Never fabricate context.** If RAG returns nothing, say "Based on our research" not "Based on our previous conversations."
2. **Cite specifics.** "When we worked with a 200-person logistics company last quarter" is grounded. "Companies like yours" is not.
3. **Recency matters.** Prioritize transcripts from the last 6 months. Older data may reference deprecated products or outdated positioning.
4. **Sentiment check.** If past interactions were negative (lost deal, churned customer), acknowledge the history honestly. Pretending it didn't happen destroys trust.

---

## 2. Messaging Patterns by Win/Loss Outcome

### Patterns That Correlate with Wins

**By Industry:**

| Industry | Winning Message Pattern | Why It Works |
|----------|----------------------|--------------|
| SaaS / Tech | Problem-first, ROI-specific: "Your team of 15 AEs is probably spending 3hrs/day on admin" | Tech buyers want quantified impact, not feature lists |
| Professional Services | Peer credibility + case study: "We helped [similar firm] cut proposal time from 2 days to 40 minutes" | Services buyers trust peer outcomes over product claims |
| Manufacturing / Industrial | Operational efficiency angle: "Your plant managers are tracking [process] manually — here's what automation looks like" | Pragmatic buyers want operational proof, not vision |
| Financial Services | Risk reduction + compliance: "Three firms your size got flagged for [specific issue] last quarter" | Risk-averse buyers move faster on threat avoidance |
| Healthcare | Patient outcome + compliance tie: "Your clinical team is spending X hours on documentation instead of patients" | Mission-driven framing outperforms cost savings |
| Retail / E-commerce | Revenue attribution: "Brands your size are leaving $X/month on the table with [specific gap]" | Revenue-focused, fast-cycle buyers want immediate impact |

**Universal Win Patterns:**
- Emails that reference a specific, verifiable observation about the prospect (2.3x reply rate vs. generic)
- Sequences where Email 2 adds new value instead of "checking in" (60% higher conversion to meeting)
- Subject lines that reference something the prospect said, wrote, or did publicly
- CTAs that offer something before asking for something ("Want me to send the breakdown?")

### Patterns That Correlate with Losses

**The Silent Killers:**

1. **Feature-leading openers.** Emails that start with what your product does instead of what the prospect needs. Win rate drops 40% when Email 1 mentions more than one feature.
2. **Generic social proof.** "Trusted by 500+ companies" converts at 1/3 the rate of "We helped [specific company in their industry] achieve [specific result]."
3. **Premature meeting requests.** Asking for a call in Email 1 to cold prospects correlates with 55% lower sequence completion. Interest-first CTAs outperform.
4. **Identical follow-up angles.** Sequences where Email 2-3 repeat Email 1's value prop have 70% lower reply rates than angle-shifting sequences.
5. **Over-personalization that feels invasive.** Referencing personal social media, family details, or non-professional information. Creepy kills deals.
6. **Ignoring previous negative interactions.** If a prospect or their colleague declined before, pretending that interaction didn't happen reduces trust to near-zero.

---

## 3. Subject Line Effectiveness from Historical Data

### What the Data Shows

Analyze subject lines from won vs. lost sequences. Pattern clusters:

**High-performing subject line structures (from won deals):**
- **Name + context:** "quick question, Sarah" / "your Austin team" — 47% average open rate
- **Mutual connection:** "Dave suggested I reach out" — 52% open rate when genuine
- **Specific observation:** "saw your SDR job posting" / "your Q3 earnings call" — 44% open rate
- **Value-forward:** "3 ideas for your pipeline gap" — 41% open rate

**Low-performing structures (from lost/no-reply sequences):**
- **Company name + generic:** "Opportunity for Acme Corp" — 19% open rate
- **Benefit-claiming:** "Increase your revenue by 40%" — 22% open rate (feels spammy)
- **Long and formal:** "Introduction and Partnership Exploration" — 15% open rate
- **Question-only:** "Struggling with sales?" — 24% open rate (too broad, feels automated)

### Applying Historical Subject Line Data

When RAG returns won-deal transcripts from similar prospects:
1. Extract the subject line that got the reply
2. Use the same structure (not the same words) for the new sequence
3. If you have 3+ data points for a persona type, use the pattern that won most often
4. For A/B testing, pit the historically-winning structure against a new hypothesis

---

## 4. Optimal Sequence Timing by Prospect Segment

### Timing Patterns from Historical Data

| Prospect Segment | Optimal Email 1 Send | Email 2 Gap | Email 3 Gap | Notes |
|-----------------|---------------------|-------------|-------------|-------|
| C-suite / Exec | Tuesday-Thursday 7-8 AM local | 5-7 days | 14 days | Execs read early. Longer gaps = respect for time. |
| VP / Director | Tuesday-Wednesday 9-11 AM local | 3-4 days | 10 days | Mid-morning, mid-week. Standard pacing. |
| Manager / IC | Monday-Thursday 10 AM-2 PM local | 2-3 days | 7 days | More flexible. Faster follow-up acceptable. |
| Startup / Founder | Any weekday, evenings OK | 2-3 days | 7-10 days | Founders read at odd hours. Speed matters. |
| Enterprise (10k+) | Tuesday-Wednesday 10-11 AM local | 5-7 days | 14-21 days | Longer cycles. Patience over persistence. |
| SMB (50-500) | Monday-Thursday, morning | 3 days | 10 days | Standard cadence. These are the most responsive. |

### When RAG Shows Timing Patterns

If historical data shows a prospect or their company typically:
- **Responds within 24 hours:** Shorten gaps. They're active email users.
- **Responds after Email 3+:** They need nurturing. Add an Email 4 with a different angle.
- **Responds to specific day/time:** Mirror that pattern for the new sequence.
- **Never responds to email but takes calls:** Suggest a phone-first approach. Flag in strategy notes.

---

## 5. Personalization Depth vs. Reply Rate

### The Personalization Spectrum

| Level | What It Looks Like | Reply Rate Impact | When to Use |
|-------|-------------------|-------------------|-------------|
| 0 — None | "Dear Decision Maker" | Baseline (2-3%) | Never. This is spam. |
| 1 — Basic | Name + company + title | +40% over baseline | Minimum acceptable for any outreach |
| 2 — Contextual | Recent company news, job posting, funding round | +80% over baseline | Standard for quality outreach |
| 3 — Insightful | Specific observation + implication for their role | +140% over baseline | When you have 10+ minutes per prospect |
| 4 — RAG-enriched | All above + reference to past interactions, win/loss patterns, persona insights | +200%+ over baseline | When historical data is available |

### Where RAG Adds Personalization Depth

- **"We've worked with 3 companies in your space"** — generic Level 1 claim
- **"When we worked with [Company X] last quarter, their VP of Sales had the same concern about pipeline visibility"** — Level 4, grounded in real data

The jump from Level 2 to Level 4 is where RAG earns its value. It transforms generic outreach into contextually aware communication that feels like it came from someone who genuinely knows the prospect's world.

### Diminishing Returns Warning

Past Level 4, more personalization can hurt:
- Referencing information that feels private or surveilled
- Spending so long personalizing that volume drops below viable
- Over-researching delays sending — the trigger event goes stale
- The golden ratio: 3-5 personalization signals per email, each from a different source (company, person, industry, history)

---

## 6. Common Outreach Failures from Transcript Analysis

### The Failure Taxonomy

Analyzing lost-deal transcripts reveals consistent outreach failure patterns. When writing sequences, actively avoid these:

**1. The Echo Chamber**
Writing the same value prop that every competitor leads with. If RAG shows competitors using "save time" or "increase productivity," find a different angle. The prospect has seen that email 50 times.

**2. The Authority Assumption**
Sending exec-level messaging to someone who can't make the decision. RAG transcript analysis often reveals the real decision maker. Target correctly.

**3. The Premature Close**
Jumping from "nice to meet you" to "sign this proposal" without earning the right to ask. Transcript data shows the average cold-to-close journey is 5-8 meaningful touches. Your sequence is touches 1-3. Act accordingly.

**4. The Feature Dump**
Listing 5+ features in Email 1 because you're not sure which one matters. Better: pick the ONE feature that matters most based on RAG analysis of what resonated with similar prospects.

**5. The Ghosted Follow-Up**
"Just checking in" / "Bumping this to the top." Historical data consistently shows these have 3% reply rates. Every follow-up must introduce a new reason to engage.

**6. The Stale Trigger**
Referencing a funding round, job change, or news article from 3+ months ago. The prospect has been contacted by 20 other salespeople about that same trigger. If the event is older than 6 weeks, find a fresher angle.

---

## 7. Adapting Sequences Based on Competitive Intelligence

### What Past Deals Reveal About Competitors

RAG transcript search for competitor names surfaces:
- Which competitors prospects evaluate alongside you
- What prospects like about the competitor (don't attack their strengths)
- What frustrated prospects about the competitor (your opening)
- Switching triggers (what made past customers finally move)

### Competitive Adaptation Matrix

| Competitive Signal | Sequence Adaptation |
|-------------------|-------------------|
| Prospect currently uses Competitor X | Don't attack X directly. Lead with a gap X doesn't fill. Reference a specific limitation discovered in past deal transcripts. |
| Prospect evaluated you + competitor, chose competitor | Acknowledge the history. "I know you looked at us back in [timeframe]. A few things have changed..." Lead with what's new. |
| Prospect's industry trending away from incumbent | Use market movement as the hook. "3 companies in [industry] switched from [category] to [approach] this quarter." |
| No competitive signal | Don't mention competitors at all. Focus entirely on the prospect's problem. Introducing competitor names creates comparison shopping. |
| Multiple competitor mentions in transcripts | Prospect is in active evaluation. Speed matters. Shorten sequence gaps. Offer a comparison asset in Email 2. |

### The Cardinal Rule

Never disparage competitors in outreach emails. The data from transcript analysis is clear: negative competitor mentions in Email 1 correlate with 35% lower reply rates. Prospects see it as desperate. Instead, use competitive intelligence to position around gaps, not against companies.

---

## Integration Checklist

When applying win/loss patterns to a new sequence:

- [ ] Searched RAG for: company name, industry + deal outcome, persona + objections
- [ ] Identified at least 1 grounded data point to include in Email 1
- [ ] Checked for prior outreach to this company (avoid duplicating angles)
- [ ] Applied industry-specific messaging pattern from win data
- [ ] Used historically-winning subject line structure for this persona
- [ ] Timing aligned to prospect segment defaults (or overridden by RAG data)
- [ ] Personalization at Level 3+ (Level 4 if RAG data available)
- [ ] Competitive intelligence integrated without direct competitor attacks
- [ ] Follow-up angles differ from historically-failed approaches
- [ ] Flagged confidence level based on data richness (high/medium/low)
