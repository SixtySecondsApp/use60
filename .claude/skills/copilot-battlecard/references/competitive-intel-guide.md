# Competitive Intelligence Guide

A comprehensive guide for gathering, validating, and maintaining competitive intelligence. Covers web research methodology, review site extraction, handling incomplete data, detecting competitive signals from meetings, freshness management, and multi-competitor dynamics.

## Table of Contents

1. [Web Research Methodology](#web-research-methodology)
2. [Review Site Extraction Patterns](#review-site-extraction-patterns)
3. [Handling Incomplete Data](#handling-incomplete-data)
4. [Competitive Signal Detection from Meetings](#competitive-signal-detection-from-meetings)
5. [Battlecard Freshness](#battlecard-freshness)
6. [Multi-Competitor Deals](#multi-competitor-deals)

---

## Web Research Methodology

### What to Search

Run searches in parallel for speed. Each search targets a different intelligence dimension.

| # | Search Query Pattern | Intelligence Target | Expected Sources |
|---|---|---|---|
| 1 | `"[Competitor]" product features pricing` | Product capability and cost | Competitor website, pricing pages, comparison sites |
| 2 | `"[Competitor]" vs OR "compared to" OR alternative` | Head-to-head comparisons | Blog posts, comparison articles, G2 compare pages |
| 3 | `"[Competitor]" review G2 OR Capterra OR TrustRadius` | Customer sentiment | Review platforms |
| 4 | `"[Competitor]" news OR announcement [current year]` | Recent developments | Press releases, tech news, funding announcements |
| 5 | `"${company_name}" vs "[Competitor]"` | Direct comparison content | Your own content, third-party comparisons |
| 6 | `"[Competitor]" complaints OR problems OR "switched to"` | Churn signals and dissatisfaction | Reddit, forums, review sites, social media |

### Where to Look (by source reliability)

#### Tier 1: High Reliability
- **Competitor's own website**: Pricing, features, case studies. These are facts (though spun favorably).
- **G2, Capterra, TrustRadius**: Verified reviews from real users. Look for patterns, not individual complaints.
- **Crunchbase, PitchBook**: Funding, valuation, employee count. Factual data.
- **SEC filings / annual reports**: For public companies -- revenue, growth, strategy.

#### Tier 2: Moderate Reliability
- **Industry analyst reports**: Gartner, Forrester, IDC. Authoritative but sometimes lag behind reality. Check publication date.
- **Tech blogs and news sites**: TechCrunch, SaaStr, industry publications. Current but may lack depth.
- **LinkedIn company page**: Employee count, recent hires, posted content. Good for signals.
- **Job postings**: Reveal what they are building and where they have gaps. If they are hiring 5 data engineers, their data pipeline probably needs work.

#### Tier 3: Use with Caution
- **Reddit and forums**: Unverified but often brutally honest. Good for sentiment, bad for facts.
- **Social media posts**: Anecdotal. Use to identify themes, not as evidence.
- **Competitor employee blog posts**: Revealing but may be outdated or aspirational.
- **Quora and Stack Overflow**: Community perspective. Useful for technical products.

### How to Validate

Every claim from web research needs validation before it enters a battlecard:

1. **Cross-reference**: Does more than one source say the same thing? If only one blog post mentions it, tag as Low confidence.
2. **Check recency**: When was the source published? Anything older than 12 months gets an automatic Low confidence tag. Competitor products change fast.
3. **Check motivation**: Is the source neutral or biased? A competitor's own case study is biased. An independent review site is more neutral.
4. **Verify specificity**: "Their product is slow" is vague. "Response times exceed 3 seconds on dashboards with 10K+ records per G2 reviews" is specific and usable.
5. **Test the opposite**: Search for positive claims about the competitor in the same area. If G2 reviews say the UI is bad, but their recent reviews (last 3 months) say the UI improved, the claim may be outdated.

---

## Review Site Extraction Patterns

Review sites contain the richest competitive intelligence, but you need to extract signal from noise.

### G2 Extraction

**Where to look**:
- Overall rating and trend (improving or declining?)
- "What do you like best?" and "What do you dislike?" sections
- Category-specific ratings (ease of use, support quality, setup, features)
- Comparison pages (G2 Compare)

**What to extract**:
- Repeated complaints (3+ reviews mentioning the same issue = pattern, not anecdote)
- Version-specific issues ("Since the V3 update, reporting has been broken")
- Support quality patterns ("Takes 48+ hours to get a response" mentioned by multiple users)
- Switching signals ("We switched from [Competitor] because...")
- Industry-specific feedback (filter by industry if available)

**Red flags in G2 data**:
- Reviews from 2+ years ago -- product may have changed significantly
- Reviews from employees (check reviewer profile)
- Suspiciously uniform 5-star reviews posted in a short time window (incentivized reviews)
- Very short reviews with no detail ("Great product!") -- no useful signal

### Capterra Extraction

**Focus on**:
- "Pros" and "Cons" sections (structured format makes extraction easier)
- "Overall" vs. "Ease of Use" vs. "Customer Service" vs. "Value for Money" ratings
- Reviewer company size (enterprise feedback is different from SMB feedback)
- "Alternatives Considered" field -- reveals who they compared

### TrustRadius Extraction

**Focus on**:
- TrustMap positioning (Leaders, Top Rated, etc.)
- "What is most valuable?" and "What needs improvement?" sections
- Feature-specific ratings (TrustRadius breaks down by capability)
- "Likelihood to Recommend" scores and comments

### Pattern Recognition Across Sites

When the same complaint appears on 2+ review sites, confidence goes to High:

| Pattern | Meaning | Confidence |
|---|---|---|
| Same complaint on G2 + Capterra + TrustRadius | Systemic issue | High |
| Same complaint on G2 + Capterra only | Likely real issue | Medium-High |
| Complaint on one site only, 5+ mentions | Real but possibly localized | Medium |
| Complaint on one site only, 1-2 mentions | Anecdotal | Low |
| Complaint contradicted by recent reviews | Possibly fixed | Low (verify) |

---

## Handling Incomplete Data

Not every competitor has a rich data profile. Here is how to handle gaps.

### Smaller Competitor (Limited Web Presence)

**Situation**: Few reviews, limited press coverage, sparse website.

**Strategy**:
1. Focus on what IS available: website, LinkedIn company page, job postings, any existing reviews
2. Use job postings as proxy intelligence: What roles are they hiring? What tech stack do their engineering posts mention? What problems are they trying to solve?
3. Check their customers: If they list case studies or logos, research those companies for context
4. Monitor their content: Blog posts, webinars, and social media reveal product direction
5. **Be honest**: Tag most claims as Low confidence. Tell the rep: "Limited public information available for this competitor. Recommend asking the prospect what they specifically like about [Competitor] to build targeted counter-positioning."

### Private Company (No Financial Data)

**Strategy**:
1. Employee count from LinkedIn as a proxy for company size
2. Crunchbase for funding rounds (even if not current)
3. Job posting volume as a proxy for growth
4. Customer logos and case studies for market positioning
5. Do NOT guess at revenue or valuation -- say "not publicly available"

### New Market Entrant (No Track Record)

**Strategy**:
1. Analyze the team: Where did founders come from? What problem are they solving?
2. Check their funding: Who invested and how much?
3. Analyze their positioning: How do they describe themselves vs. incumbents?
4. Acknowledge the unknown: "As a newer entrant, long-term stability and support track record are unproven. This is worth discussing with the prospect."
5. Focus on proven vs. unproven: Your track record is an advantage against unknowns

### Competitor in a Different Category

**Situation**: Prospect is comparing you to a tool that is not a direct competitor (e.g., comparing your CRM to a spreadsheet, or your analytics tool to an all-in-one platform).

**Strategy**:
1. Understand why the comparison is happening: What need does the prospect think both tools serve?
2. Reframe the comparison: "They solve a different problem. The question is which problem you need solved first."
3. Acknowledge overlap honestly: Where do the tools overlap? Where do they diverge?
4. Focus on the specific use case: Not "which is better" but "which is better for what you need"

---

## Competitive Signal Detection from Meetings

Meeting transcripts contain the most valuable competitive intelligence because it comes directly from the buyer. Learn to detect and extract it.

### Direct Mentions

These are explicit competitor references. Easy to find, high value.

| Signal | Example | Intelligence Value |
|---|---|---|
| Named competitor | "We are also looking at Gong" | Active evaluation -- need to know who and how far along |
| Feature comparison | "Gong showed us their revenue intelligence dashboard" | Know what features they are comparing on |
| Pricing reference | "Their pricing is per seat, around $100/month" | Critical pricing intelligence |
| Timeline reference | "We have a demo with them next week" | Urgency signal -- may need to accelerate |
| Preference statement | "We liked their reporting but found it complex" | Both a strength and weakness to exploit |

### Indirect Mentions

These require interpretation. The buyer does not name a competitor but references one.

| Signal | Example | How to Interpret |
|---|---|---|
| "Another vendor" | "Another vendor showed us a feature that..." | Ask: "Would you mind sharing which vendor? It helps us tailor our comparison." |
| "What we have seen" | "We have seen other tools that do X automatically" | Competitor has a feature they liked. Note it. |
| "Someone told us" | "Someone told us your API has limitations" | Competitor sales rep is positioning against you. Address directly. |
| "Industry standard" | "We expected this to be standard" | Competitor positioned a feature as table stakes. Validate or counter. |

### Implied Mentions

The buyer asks about a capability that is suspiciously specific -- likely because a competitor demonstrated it.

| Signal | Example | How to Interpret |
|---|---|---|
| Specific feature request | "Can you do real-time coaching during calls?" | They saw this somewhere. Ask: "Is that a priority? What prompted the question?" |
| Unusual requirement | "We need HIPAA compliance for our data" | May be a competitor's strength or a general requirement. Clarify. |
| Benchmark question | "What is your typical response time for support tickets?" | They have a number to compare against. Ask what they are benchmarking against. |
| Process question | "How long does implementation typically take?" | They have a competitor's answer. Share your number and context. |

### Extraction Rules for RAG Queries

When searching transcripts for competitive intelligence, use these query patterns:

1. **Direct name search**: `"[Competitor Name]"` -- catches all explicit mentions
2. **Comparison language**: `"compared to" OR "versus" OR "vs" OR "better than" OR "worse than"` -- catches comparison discussions
3. **Evaluation language**: `"evaluation" OR "evaluating" OR "shortlist" OR "considering"` -- catches process discussions
4. **Feature probing**: `"can you do" OR "does it support" OR "do you have"` -- catches competitor-inspired questions
5. **Pricing language**: `"pricing" OR "cost" OR "budget" OR "per seat" OR "per user"` -- catches pricing comparisons
6. **Dissatisfaction language**: `"frustrated" OR "problem with" OR "issue with" OR "switching from"` -- catches pain with current/other tools

### Weighting Transcript Evidence

Evidence from the buyer's own words carries more weight than web research:

| Source | Weight | Why |
|---|---|---|
| Buyer states preference in a meeting | Highest | Direct signal of what they value |
| Buyer quotes competitor pricing | High | Actionable competitive data |
| Buyer describes competitor demo | High | Reveals what they saw and liked/disliked |
| Buyer asks competitor-inspired question | Medium | Implies comparison but needs clarification |
| Buyer mentions "another vendor" without naming | Medium | Useful but incomplete |
| Web research from review sites | Medium | Credible but not buyer-specific |
| Single blog post or article | Low | Unverified, possibly outdated |

---

## Battlecard Freshness

A battlecard is a living document. Stale competitive intelligence is worse than no intelligence because it creates false confidence.

### When to Regenerate

| Trigger | Urgency | Action |
|---|---|---|
| Competitor announces major product update | High | Regenerate within 24 hours. Feature comparisons may be invalid. |
| Competitor changes pricing | High | Update pricing section immediately. TCO analysis may need revision. |
| New batch of G2/Capterra reviews shifts sentiment | Medium | Regenerate within 1 week. Check if weakness claims are still valid. |
| Competitor raises funding or makes acquisition | Medium | Update competitor overview. May signal new capabilities or market shift. |
| 90 days since last generation | Medium | Routine refresh. Web research results will have changed. |
| New deal enters evaluation stage | Low | Regenerate with deal-specific context (Layer 1 + Layer 3). |
| Prospect mentions competitor capability not in battlecard | High | Ad-hoc update. The gap in your battlecard was just exposed. |

### Freshness Indicators

Include these in the battlecard output so reps know what to trust:

```
BATTLECARD FRESHNESS
Generated: [Date]
Web research date: [Date]
Most recent G2 review checked: [Date]
RAG transcript search date: [Date]
Competitor website last crawled: [Date]

STALENESS WARNINGS:
- [Any claims older than 90 days]
- [Any pricing data older than 60 days]
- [Any feature claims from a single source]
```

---

## Multi-Competitor Deals

When the buyer is evaluating 3+ vendors simultaneously, the dynamics change fundamentally.

### Positioning Strategy

**Do not**: Try to win against every competitor on every dimension. You will dilute your message.

**Do**: Identify the 2-3 criteria where you win and make THOSE the evaluation framework.

### Multi-Competitor Framework

1. **Map the field**: List all known competitors in the evaluation. For each, identify their primary strength (what they will lead with).
2. **Find your unique position**: What do you offer that NONE of the others do? This is your differentiation anchor.
3. **Identify the closest threat**: Which competitor are you most likely to lose to? Focus your battlecard energy there.
4. **Position against the category, not individuals**: "Unlike tools built for [use case A], we were designed from the ground up for [use case B]" positions against a category rather than naming names.
5. **Control the criteria**: If the buyer is using a vendor scorecard, understand what is on it and influence the weights. Your champion can help here.

### Common Multi-Vendor Dynamics

| Dynamic | What Happens | Your Response |
|---|---|---|
| "Bake-off" evaluation | All vendors demo the same scenarios | Win on the scenario, not the feature list |
| RFP/RFI process | Structured comparison on predefined criteria | Ensure criteria include your strengths; work with champion to weight them |
| Free trial comparison | Buyer tests 2-3 tools in parallel | Focus on time-to-value and ease of setup -- first good impression wins |
| Price-driven selection | Procurement is running a cost comparison | Shift conversation to TCO and value -- get to the economic buyer |
| Champion-driven | Your champion is advocating internally | Equip them with competitive sound bites they can repeat |

### Handling the "We Are Comparing You to X and Y" Conversation

1. **Thank them for transparency**: "I appreciate you sharing that. It helps us make sure our conversations are relevant."
2. **Ask about criteria**: "What criteria are most important to your evaluation? I want to make sure we address what matters most."
3. **Listen more than talk**: The buyer will reveal what the other vendors are saying. This is free intelligence.
4. **Do not bash**: "I will let our product speak for itself on those criteria. Here is how we approach [key area]."
5. **Offer to help structure the evaluation**: "Would it be helpful if I shared a framework for comparing solutions in this space? It might save your team time." This is a power move -- you shape the criteria.

### Battlecard Adaptation for Multi-Competitor Deals

When generating a battlecard for a deal with multiple competitors:
- Focus 70% of content on the primary threat (closest competitor)
- Include a brief "landscape" section positioning all known competitors
- Highlight capabilities that are unique to you vs. ALL competitors (not just one)
- Provide a simplified comparison matrix that includes all vendors
- Note where different competitors have different strengths -- the buyer is weighing trade-offs

---

## Sources and References

- Gong Labs (2023): Competitive mention patterns in 2.1M sales calls
- Klue (2024): Competitive intelligence program benchmarking study
- Crayon (2024): State of Competitive Intelligence report
- G2 Research (2024): Review authenticity and extraction methodology
- Forrester (2024): Multi-vendor evaluation dynamics in B2B procurement
- TOPO Group: Competitive positioning in multi-threaded deals
- Corporate Visions: Messaging effectiveness in competitive situations
