# SEO Playbook for AI SaaS

Data-backed SEO strategies specific to AI/SaaS products. Not generic SEO advice — every tactic here is proven by companies doing $1M+ ARR from organic traffic.

---

## The Page Type Hierarchy

Build pages in this order. Each type has a different intent level, and higher intent = higher conversion.

### Tier 1: Core Pages (build first)

These are your foundation. Every SaaS needs these.

| Page | Primary Keyword Pattern | Intent Level | Conversion Role |
|------|------------------------|-------------|----------------|
| Homepage | `[brand name]` | Navigational | Convert direct + branded traffic |
| Pricing | `[brand] pricing` | Transactional | Convert high-intent visitors |
| Features | `[brand] features` | Commercial | Educate solution-aware visitors |
| About | `[brand] company` | Navigational | Build trust for enterprise |

### Tier 2: Comparison Pages (build second — highest ROI)

These target the highest-intent organic keywords. Someone searching "[you] vs [competitor]" is actively making a purchase decision.

**Why they work**: 5-10x higher conversion than informational content.

**How to build them**:

```markdown
# [Your Product] vs [Competitor]: Honest Comparison

## Quick Summary
[One paragraph: who should use what]

## Side-by-Side Comparison
| Feature | [You] | [Competitor] |
|---------|-------|-------------|
| [Feature 1] | [Your approach] | [Their approach] |
| ... | ... | ... |

## Where [You] Wins
[Be specific. Cite real capabilities.]

## Where [Competitor] Wins
[Be honest. This builds trust AND ranks better.]

## Who Should Choose [You]
[Specific persona/use case fit]

## Who Should Choose [Competitor]
[Specific persona/use case fit]

## Try [Your Product] Free
[CTA]
```

**Key rule**: Never declare a winner. Recommend each product for different situations. Honesty ranks better and converts better.

**Case study**: Missive (email tool) CEO attributed reaching $2.1M ARR partly to honest comparison pages. They even admit where Spark Mail is better.

**Build one for every competitor**: Even small ones. These pages compound over time as search volume grows.

### Tier 3: Alternative Pages (build third)

Target "[Competitor] alternatives" keywords. These visitors are actively unhappy with a competitor.

**Keyword patterns**:
- `[competitor] alternatives`
- `best [competitor] alternative`
- `[competitor] alternative for [use case]`
- `tools like [competitor]`
- `[competitor] replacement`

**Structure**:
```markdown
# 10 Best [Competitor] Alternatives in 2026

## Why People Switch from [Competitor]
[Common complaints — research these from G2/Capterra reviews]

## The Best Alternatives

### 1. [Your Product] (Best for [your strength])
[Position yourself first. Be specific about why.]

### 2-10. [Other alternatives]
[Include real alternatives. This builds trust and SEO authority.]

## How to Choose
[Decision framework based on use case]
```

**Rule**: Include 7-10 real alternatives, not just yourself. Google ranks comprehensive pages higher. Put yourself first with the strongest positioning.

### Tier 4: Use-Case Pages (programmatic SEO opportunity)

One page per use case, persona, or industry your product serves.

**Keyword patterns**:
- `AI [use case] tool` (e.g., "AI sales follow-up tool")
- `[use case] software for [persona]` (e.g., "sales automation for founders")
- `[industry] [solution]` (e.g., "SaaS sales automation")
- `how to automate [task]` (e.g., "how to automate sales follow-ups")

**Programmatic approach**: Create a template, then generate pages for every combination:
- 10 use cases × 5 personas = 50 pages
- 10 use cases × 8 industries = 80 pages
- Each page has unique content for that specific combination

**Case study**: Zapier gets 16.2M organic visitors/month from templated integration pages. Each page follows the same template but targets a unique keyword.

### Tier 5: Integration Pages

One page per integration your product supports.

**Keyword patterns**:
- `[your product] [integration] integration`
- `connect [tool A] to [tool B]`
- `[integration] automation`

**Structure**: What the integration does + how to set it up + use cases + CTA.

### Tier 6: Blog / Thought Leadership

Build topical authority. Target informational keywords. Support EEAT signals.

**Content priorities** (in order):
1. "How to [solve problem your product solves]" — captures problem-aware traffic
2. "[Topic] best practices for [year]" — captures solution-aware traffic
3. "[Topic] benchmarks/statistics" — earns backlinks and citations
4. Original research / data — strongest EEAT signal
5. Thought leadership / opinion — builds brand authority

**Rule**: Every blog post must link to a relevant product page or use-case page. Informational content without conversion paths is wasted effort.

---

## LLM Optimization (the New SEO)

AI referral traffic is up 527% year-over-year. ChatGPT referrals convert at 15.9%. This is now a critical channel.

### How LLMs Decide What to Recommend

1. **Frequency of mention**: How often is your product mentioned across the web in relevant contexts?
2. **Quality of sources**: Are you mentioned on authoritative sites (not just your own)?
3. **Recency**: Is the content fresh? LLMs weight recent content.
4. **Structured clarity**: Can the LLM easily extract a clear answer from your content?
5. **Topical authority**: Do you have comprehensive coverage of your topic?

### How to Optimize for LLMs

#### Content Structure
- Use clear, descriptive H2/H3 headings that match likely queries
- Write concise, direct paragraphs (LLMs extract from these)
- Include structured data (Schema.org) for FAQ, Product, Review, Pricing
- Use tables and lists for comparative information (LLMs love structured data)
- Include definitive statements ("The best approach is..." not "You might consider...")

#### Authority Building
- Get mentioned in comparison articles on third-party sites
- Contribute to industry roundups and "best of" lists
- Publish original research that others cite
- Maintain active presence on platforms LLMs index (Reddit, Stack Overflow, GitHub, Product Hunt)
- Get reviews on G2, Capterra, TrustRadius — LLMs cite these

#### Technical
- Ensure your site is crawlable (no JavaScript-only rendering)
- Fast page loads (LLM crawlers have timeouts too)
- Clear site architecture with logical URL structure
- Comprehensive sitemap
- No robots.txt blocking of content pages

### Measuring LLM Traffic

- Track referral traffic from `chat.openai.com`, `perplexity.ai`, `gemini.google.com`
- Monitor brand mentions in AI-generated responses (tools like Otterly, Profound)
- Track "zero-click" branded searches that come from LLM recommendations

---

## Technical SEO Essentials

### URL Structure
```
/                           → Homepage
/pricing                    → Pricing
/features                   → Features overview
/features/[feature-slug]    → Individual feature pages
/vs/[competitor]            → Comparison pages
/alternatives/[competitor]  → Alternative pages
/use-cases/[use-case]       → Use-case pages
/integrations/[integration] → Integration pages
/blog/[slug]                → Blog posts
/customers                  → Social proof / case studies
/customers/[company]        → Individual case study
```

### Meta Tags Template
```html
<!-- Homepage -->
<title>[Product] — [Value Proposition] | [Brand]</title>
<meta name="description" content="[1-2 sentence benefit-first description. Include primary keyword naturally. 150-160 chars.]" />

<!-- Comparison page -->
<title>[Product] vs [Competitor]: Honest Comparison [Year] | [Brand]</title>
<meta name="description" content="Detailed comparison of [Product] and [Competitor]. See where each tool excels and which is right for your [use case]." />

<!-- Use-case page -->
<title>[Use Case] Software for [Persona] | [Brand]</title>
<meta name="description" content="How [Product] helps [persona] [achieve outcome]. [Specific proof point]. Start free." />
```

### Structured Data (Schema.org)

Implement for:
- `FAQPage` — on FAQ sections (enables rich snippet in Google)
- `Product` — on pricing/product pages
- `Review` / `AggregateRating` — on pages with testimonials
- `HowTo` — on "how it works" sections
- `Organization` — on about page
- `BreadcrumbList` — on all pages for navigation context

### Internal Linking Strategy
- Every page links to 2-3 related pages
- Comparison pages link to relevant feature pages
- Blog posts link to comparison and use-case pages
- Use-case pages link to pricing
- Homepage links to top 3-5 feature pages and top use cases
- Use descriptive anchor text (not "click here")

---

## Content Calendar Priority

### Month 1: Foundation
- [ ] Homepage optimized for primary keyword
- [ ] Pricing page with FAQ schema
- [ ] 3 comparison pages (top 3 competitors)
- [ ] 2 alternative pages (top 2 competitors)

### Month 2: Expansion
- [ ] 5 use-case pages
- [ ] 3 more comparison pages
- [ ] 3 integration pages
- [ ] 2 blog posts (how-to guides targeting problem-aware traffic)

### Month 3: Authority
- [ ] 5 more use-case pages
- [ ] Original research / benchmark content (link-worthy)
- [ ] 3 more blog posts
- [ ] Customer case study page
- [ ] Review presence on G2/Capterra

### Ongoing
- [ ] 2-4 new content pages per month
- [ ] Update comparison pages quarterly (competitors change)
- [ ] Refresh "best of" and benchmark content annually
- [ ] Monitor LLM mentions monthly
