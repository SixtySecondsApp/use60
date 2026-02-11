# Email Rules — Data-Backed Evidence

Every rule in the main SKILL.md is backed by hard data. Reference this file when you need to explain WHY a rule exists or when a user pushes back.

## Table of Contents
1. [Word Count & Length](#word-count--length)
2. [Reading Level](#reading-level)
3. [CTA Performance](#cta-performance)
4. [Subject Lines](#subject-lines)
5. [Personalization Impact](#personalization-impact)
6. [Sequence Timing](#sequence-timing)
7. [Hook Types](#hook-types)
8. [Technical Factors](#technical-factors)

---

## Word Count & Length

**Boomerang study (40 million emails):**
- 75-100 words: 51% response rate (highest)
- Under 50 words: response drops to ~44%
- 500 words: drops to 44% then plateaus
- Above 2,500 words: below 35%

**Lavender data:**
- Initial cold emails: 25-50 words is the sweet spot for openers
- Follow-up emails: 4+ sentences generate 15x more meetings vs 3 or fewer (Gong data)
- Critical distinction: short for openers, slightly longer for follow-ups

**30MPC / Kyle Coleman:**
- Under 100 words maximum for cold
- 3-4 sentences only
- Must be digestible on mobile WITHOUT scrolling

**Key insight:** Initial emails and follow-ups have different optimal lengths. Don't apply follow-up data to first touches.

---

## Reading Level

**Lavender data:**
- 70% of cold emails are written at 10th+ grade level
- Writing at 3rd-5th grade level gets 67% more replies
- Tested across different personas and industries — holds universally

**Boomerang study:**
- Emails at 3rd grade reading level: 36% lift over college-level
- 17% higher response rate vs high school level
- Optimal: aim for Flesch score of 70+ (7th grade or below)

**Average cold email:** Flesch score of 47 ("very difficult") = 10-12 grade level

**Why this works (processing fluency research):**
- Information that feels easy to process is judged as more true, more trustworthy, and more likeable
- Simple words and short sentences reduce cognitive load, making the message more persuasive at ANY education level
- Not about dumbing down — about removing friction from the reading experience

---

## CTA Performance

**Interest-based vs. meeting requests (cold stage):**
- Interest-based CTAs: 12% reply rate, 68% positive
- Meeting request CTAs: 7% reply rate, 41% positive
- Meeting requests perform 44% worse in reply rates
- At 1,000 emails/month: 82 positive conversations (interest) vs 29 (meeting request)

**Offer-based CTAs (Jason Bay, 85M emails):**
- Outperform interest-based by 4x in reply rate
- 28% improvement when CTA provides specific value
- Example: "Can I send you the case study? Reply yes."

**Single CTA data:**
- Single CTA: 371% more clicks than multiple CTAs
- Single CTA increased conversions by 266% in one study
- 3+ CTAs: measurable click-through rate drop (Omnisend, 229M emails)

**Questions in emails (Boomerang):**
- 1-3 questions: 50% more likely to get a response vs no questions
- Binary questions (yes/no) outperform open-ended ones

**Stage matters:** Once prospects enter active evaluation, specific CTAs with time requests convert at 37% — 2.5x better than soft CTAs. Interest-based wins for cold; specific wins for warm.

---

## Subject Lines

**Optimal length:**
- 21-40 characters: highest average open rate at 49.1%
- 3-4 words (excluding Re:/Fwd:) get most responses (Boomerang)
- 68% of email opens happen on mobile — must display fully on small screens

**Performance data:**
- Personalization in subject lines boosts open rates by 29%
- Addressing specific challenges: 202% better than generic
- No subject line: only 14% response rate

**What works:**
- Lowercase feels personal, not promotional
- Specific to recipient: "your bristol event" > "exciting opportunity"
- Curiosity without clickbait: "quick question" > "YOU WON'T BELIEVE THIS"

---

## Personalization Impact

**Depth matters:**
- Shallow personalization (merge tags only): 20-25% reply lift
- Deep personalization (research + context): 52%+ reply lift
- Personalization boosts replies by 5x overall (30MPC data)

**Segmentation effect:**
- 50-person cohorts: 5.8% reply rate
- 1,000+ person blasts: 2.1% reply rate
- That's a 2.76x lift from smaller, targeted lists

**What to personalize (ranked by impact for director+ prospects):**
1. Activity-based signals (email opens, content downloads, webinar attendance)
2. Company-based signals (company priorities matter more than personal details)
3. Industry-specific context

**Pitching vs. leading with problems (30MPC):**
- Pitching reduces reply rates by up to 57%
- Leading with prospect priorities/problems: +20% replies
- Following with solution + social proof: +41% replies

---

## Sequence Timing

**Optimal cadence (3-7-7 pattern):**
- Day 0: Initial email (~3.0% reply rate baseline)
- Day 3: First follow-up (+60% cumulative lift → 4.8%)
- Day 10: Second follow-up (93% of total replies captured → 5.8%)
- Day 17: Third follow-up (diminishing returns, -0.2%)

**Key thresholds:**
- 1 email only: 3.0% reply rate
- 2 emails: 4.8% (+60%)
- 3 emails: 5.8% (plateau — 93% captured)
- 4+ emails: marginal gains, risk of spam complaints

**Spacing:** 3-4 day minimum gaps between sends for deliverability and human feel.

---

## Hook Types

**Performance by hook type (Digital Bloom benchmarks):**

| Hook Type | Reply Rate | Positive Reply % | Meeting Rate |
|-----------|-----------|-----------------|-------------|
| Timeline | 10.01% | 65.36% | 2.34% |
| Numbers | 8.57% | 61.76% | 1.86% |
| Social Proof | 6.53% | 53.44% | 1.25% |
| Problem | 4.39% | 48.30% | 0.69% |

Timeline hooks deliver 2.3x higher reply rates and 3.4x more meetings than problem-based approaches.

**By prospect role:**

| Role | Avg Reply | Timeline Hook | Problem Hook |
|------|----------|--------------|-------------|
| CEO/Founder | 7.63% | 10.44% | 4.26% |
| CFO | 7.59% | 10.16% | 4.54% |
| CTO/VP Tech | 7.68% | 10.47% | 4.80% |
| Head of Sales | 6.60% | 8.98% | 3.96% |

C-level executives reply to 6.4% of cold emails vs 5.2% for non-C-suite (23% uplift).

**By industry:**

| Industry | Avg Reply | Best Hook |
|----------|----------|-----------|
| Consulting | 7.88% | Timeline (10.67%) |
| Healthcare | 7.49% | Timeline (10.21%) |
| SaaS | 7.42% | Timeline (9.91%) |
| Financial Services | 6.72% | Timeline (9.26%) |

---

## Technical Factors

**Email setup impact on reply rates:**
- Custom domain + Outlook (SPF/DKIM): 5.9%
- Custom domain + Gmail (SPF/DKIM): 3.5%
- Webmail (@gmail.com/@outlook.com): 1.2-2.1%

**Tracking pixels:** -10% to -15% reply rate reduction. Consider disabling for cold outreach.

**Compliance thresholds:**
- Gmail 2025 spam complaint threshold: 0.1% (down from 0.3%)
- Average unsubscribe rate: 0.17%

**Social proof in emails:**
- Mentioning customers increases reply rates by 15%
- Credibility signals (title, company) boost by 12%
- Peer-specific proof beats prestige proof for SMBs

**Send timing:**
- Best days: Tuesday-Thursday
- Best hours: 8-11 AM recipient's local time
- Cognitive load is lowest early morning and just after lunch

---

## Personalization Signal Hierarchy

When multiple data points are available about a prospect, prioritize them in this order:

1. **Person trigger** (job change in last 90 days, relevant LinkedIn post) — highest reply rate lift
2. **Company trigger** (funding round, hiring surge, tech stack change) — strong relevance
3. **Industry trigger** (regulatory change, competitor move) — good supporting context
4. **Timing alignment** (budget cycle, fiscal year, seasonal) — baseline optimization
5. **Static firmographic fit** (company size, industry match) — necessary but not sufficient

Use the top 1-2 signals only. More than two feels like surveillance, not research.

**The 90-day rule:** Someone who started a new role in the last 90 days is the single highest-propensity prospect. New leaders evaluate tools and vendors immediately. The hook: "New [title] roles usually mean re-evaluating [area you help with]."

**Signal freshness matters:** A signal from this week is 10x more powerful than one from last quarter. Reference recent events, not stale ones.

---

## You-to-Me Ratio

Count references to the recipient's situation vs. your product. Aim for 3:1 or higher.

- **Bad ratio (1:3):** "We help companies optimize... Our platform features... We recently launched..."
- **Good ratio (3:1):** "Your team is scaling... Fleet managers are hard to reach... One thing we're seeing work..."

Emails that talk about the sender's company more than the recipient's problem consistently underperform.
