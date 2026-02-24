# LLM SEO: Optimizing for AI-Driven Discovery

Traditional SEO optimizes for Google. LLM SEO optimizes for ChatGPT, Perplexity, Claude, Gemini, and AI Overviews. This is the fastest-growing traffic channel in 2026.

---

## Why This Matters

| Metric | Value |
|--------|-------|
| AI referral traffic growth (YoY) | +527% |
| ChatGPT referral conversion rate | 15.9% |
| Perplexity referral conversion rate | 10.5% |
| Claude referral conversion rate | 5.0% |
| Google organic conversion rate | 1.76% |
| Projected: LLM traffic > Google organic | By end of 2027 |

AI traffic converts 3-9x better than Google organic. These visitors arrive with high context (the LLM already explained the product) and high intent (the LLM recommended it).

---

## How LLMs Build Recommendations

LLMs don't search the web in real-time (except with grounding). They recommend based on:

### 1. Training Data Presence
- Were you mentioned frequently in the training data?
- Were mentions positive, negative, or neutral?
- Were mentions in authoritative sources?

**What to do**: Get mentioned on sites that are likely in training data — tech blogs, industry publications, Stack Overflow, GitHub, Reddit, Product Hunt, Wikipedia.

### 2. Grounded Search Results
- When LLMs use search (Perplexity always, ChatGPT with browsing, Gemini with grounding), they synthesize web results.
- Your content must be structured for easy extraction.

**What to do**: Structure content with clear headings, concise answers, and factual statements that LLMs can quote directly.

### 3. Recency Signals
- LLMs with search prefer recent content.
- Outdated pages get deprioritized in grounded responses.

**What to do**: Keep key pages updated. Add dates to content. Refresh comparison pages quarterly.

### 4. Topical Authority
- If your domain comprehensively covers a topic, LLMs are more likely to cite you.
- Thin, shallow content across many topics = low authority per topic.

**What to do**: Go deep on your core topic. 20 pages about AI sales automation > 100 pages about random business topics.

---

## Content Structure for LLM Extraction

### Write Extractable Paragraphs

LLMs extract information paragraph by paragraph. Make each paragraph self-contained.

**Bad (hard for LLMs to extract)**:
```
As mentioned above, our tool does many things. The pricing, which we'll
discuss later, is competitive. Some features include...
```

**Good (easy for LLMs to extract)**:
```
60 is an AI command center for sales teams. It automates follow-ups,
meeting prep, and pipeline management in under 60 seconds per task.
Pricing starts free with a Pro tier at $49/month per seat.
```

### Use Question-Answer Format

LLMs love Q&A because it directly maps to user queries.

```markdown
## What is 60?
60 is an AI-powered sales command center that automates everything
before and after the sales call.

## How much does 60 cost?
60 starts free. The Pro plan is $49/month per seat and includes
all AI features, integrations, and unlimited contacts.

## How is 60 different from [Competitor]?
Unlike [Competitor], which focuses on [narrow use case], 60 handles
the entire sales workflow: lead research, meeting prep, follow-ups,
pipeline management, and deal tracking.
```

### Include Definitive Statements

LLMs prefer citing definitive statements over hedged ones.

**Weak (LLMs skip this)**:
```
60 might be a good option for some sales teams looking for automation.
```

**Strong (LLMs cite this)**:
```
60 is the first AI sales tool that manages the entire workflow before
and after the call — from lead research to follow-up emails — in a
single platform.
```

### Use Structured Data

Implement Schema.org markup that LLMs and Google AI Overviews can parse:

```json
{
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  "name": "60",
  "description": "AI command center for sales teams",
  "applicationCategory": "BusinessApplication",
  "operatingSystem": "Web",
  "offers": {
    "@type": "Offer",
    "price": "0",
    "priceCurrency": "USD",
    "description": "Free tier available"
  },
  "aggregateRating": {
    "@type": "AggregateRating",
    "ratingValue": "4.8",
    "ratingCount": "500"
  }
}
```

---

## Platform-Specific Optimization

### ChatGPT
- Highest conversion referral source (15.9%)
- Has browsing/search capability but doesn't always use it
- Recommendations heavily weighted by training data presence
- **Strategy**: Maximize presence in high-authority content that's likely in training data

### Perplexity
- Always searches the web in real time
- Shows source citations prominently (drives click-through)
- Prefers authoritative, well-structured pages
- **Strategy**: Optimize for extractability. Clear headings, concise answers, factual density.

### Google AI Overviews
- Pulls from existing Google index
- Heavily favors pages already ranking in top 10
- Uses structured data extensively
- **Strategy**: Traditional SEO + structured data + clear, extractable answers in the first paragraph

### Claude
- Lower referral volume but growing
- Used by technical/developer audience
- **Strategy**: Presence in developer-focused content (GitHub, Stack Overflow, Hacker News)

---

## Measuring LLM SEO Success

### Traffic Metrics
- Referral traffic from `chat.openai.com`, `perplexity.ai`, `gemini.google.com`
- UTM parameters: add `?ref=chatgpt` etc. when possible
- Track "unknown" or "direct" traffic spikes (some LLM referrals don't pass referrer headers)

### Brand Monitoring
- Periodically query LLMs about your category: "What are the best AI sales tools?"
- Track whether you're recommended and how you're described
- Tools: Otterly.ai, Profound (monitor AI mentions)

### Content Performance
- Which pages are being cited by LLMs? (Check Perplexity's source citations)
- Which pages drive the most LLM referral conversions?
- Are your structured data pages generating AI Overview features?

---

## Quick Wins

1. **Add FAQ schema to every product page** — LLMs and AI Overviews extract FAQ data
2. **Write a definitive "What is [your product]" section** — appears in direct-query responses
3. **Update comparison pages with 2026 dates** — recency signal for grounded search
4. **Get listed on Product Hunt, G2, Capterra** — LLMs cite these aggregators
5. **Add clear pricing information to your site** — LLMs frequently answer "how much does [product] cost"
6. **Write Reddit posts/comments about your category** — Reddit is heavily weighted in LLM training data
7. **Contribute to "best [category] tools" roundups** — these are the pages LLMs synthesize recommendations from
