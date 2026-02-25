# Section Strategy Framework

Every landing page is a sequence of sections. Each section has a strategic purpose. This reference defines the section types, when to use them, and how they contribute to conversion.

---

## The Section Taxonomy

### HOOK Sections (Stop the scroll)

#### Hero — Product-as-Hero
**When**: Your product can be experienced instantly (AI chat, code gen, search)
**Structure**: Bold headline + subheadline + embedded product input (prompt field, search bar)
**Why it works**: Delivers the aha moment before signup. Eliminates all friction between "landing" and "using."
**Used by**: v0, Perplexity, Claude, ChatGPT
**Conversion impact**: Highest of all hero patterns for AI tools
**Requirements**: Product must respond in < 3 seconds. Output must be impressive on first try.

```
┌─────────────────────────────────────────────────┐
│  [Logo]                          [Sign In] [CTA]│
│                                                  │
│           Bold benefit headline                  │
│         One-line supporting subtext              │
│                                                  │
│  ┌─────────────────────────────────────────────┐│
│  │  Type something to get started...        → ││
│  └─────────────────────────────────────────────┘│
│                                                  │
│  "No signup required" or "Start free"           │
└─────────────────────────────────────────────────┘
```

#### Hero — Screenshot / Product Shot
**When**: Your UI is the selling point (project management, dashboards, dev tools)
**Structure**: Headline left or centered + product screenshot right or below
**Why it works**: Shows exactly what the user gets. Reduces uncertainty.
**Used by**: Linear, Notion, Cursor
**Requirements**: Screenshot must be clean, well-lit, and show real (not placeholder) data.

```
┌─────────────────────────────────────────────────┐
│  [Logo]                          [Sign In] [CTA]│
│                                                  │
│           Bold benefit headline                  │
│         One-line supporting subtext              │
│              [Primary CTA]                       │
│                                                  │
│  ┌─────────────────────────────────────────────┐│
│  │                                              ││
│  │          Product Screenshot                  ││
│  │          (real data, not lorem ipsum)         ││
│  │                                              ││
│  └─────────────────────────────────────────────┘│
└─────────────────────────────────────────────────┘
```

#### Hero — Video / Animation
**When**: Your product's output is visual (video gen, image gen, design tools)
**Structure**: Minimal text overlay on full-screen video/animation
**Why it works**: The output IS the pitch. Shows capability without explaining it.
**Used by**: Runway, Midjourney, ElevenLabs
**Requirements**: Video must autoplay (muted), load fast (< 2s), and look stunning.

#### Hero — Stat-Led
**When**: You have impressive adoption numbers
**Structure**: Big number + context + CTA
**Example**: "Join 360,000 developers" or "1B+ API calls processed"
**Why it works**: Social proof as the hook. Consensus trigger.
**Used by**: Jasper ("100K+ marketers"), Stripe, Twilio

#### Hero — Minimal / Mystery
**When**: Brand is strong enough to not explain. Artistic/creative products.
**Structure**: Minimal text, striking visual, no explanation
**Why it works**: Creates curiosity. Signals confidence. Stands out from over-explained competitors.
**Used by**: Midjourney, Apple
**Risk**: Only works with established brand recognition.

---

### SHOW Sections (Demonstrate value)

#### Interactive Demo
**Strategic purpose**: Let the visitor experience the product without signing up.
**When to use**: Complex products where screenshots aren't enough.
**Conversion impact**: +65% paid trial conversions (Wrike case study)
**Options**:
- Embedded playground (best for AI tools)
- Guided interactive tour (best for workflow tools)
- Before/after comparison (best for enhancement tools)
- Video walkthrough (fallback for any product type)

#### How It Works (3-Step)
**Strategic purpose**: Reduce perceived complexity. Make the path clear.
**When to use**: When the product requires multiple steps or setup.
**Structure**: 3 steps (never more than 4). Each: number + headline + one line + icon/visual.
**Rule**: If your product genuinely takes 1 step, show 1 step. Don't fabricate 3 steps for aesthetics.

```
1. Connect your tools    →    2. AI learns your workflow    →    3. Ship 10x faster
   [icon]                      [icon]                            [icon]
   One-line description        One-line description              One-line description
```

#### Feature Showcase — Bento Grid
**Strategic purpose**: Communicate breadth of capability without overwhelming.
**When to use**: Product has 4-8 key features worth highlighting.
**Structure**: Asymmetric card grid. Each card: icon + headline + 1-2 line description.
**Why bento**: 67% of SaaS landing pages now use bento grids. Users understand the pattern.
**Rule**: Each card communicates a BENEFIT, not a feature. "Save 10 hours/week on follow-ups" not "Automated email sequences."

#### Feature Deep-Dive
**Strategic purpose**: Explain a single high-value feature in detail.
**When to use**: When one feature is the primary differentiator.
**Structure**: Left/right alternating layout. Text one side, visual/demo other side.
**Rule**: Max 3 deep-dives per page. More than that = feature dump.

---

### PROVE Sections (Build trust)

#### Logo Bar
**Strategic purpose**: Instant credibility signal.
**Placement**: Immediately below hero (within first viewport).
**Structure**: 5-8 company logos in a row. Grayscale (doesn't compete with hero).
**Label**: "Trusted by teams at" or "Used by engineers at" (specific to your audience).
**Rule**: Only use logos you have permission to use. Mix sizes (1 big brand + 4-5 recognizable ones). If you don't have enterprise logos yet, use aggregate metrics instead ("5,000+ teams").

#### Metrics Bar
**Strategic purpose**: Quantify impact.
**Structure**: 3-4 big numbers in a row. Each: metric + label.
**Example**: "10x faster" / "100K+ users" / "4.9/5 rating" / "50% cost reduction"
**Rule**: Every number must be real and defensible. Vague metrics ("millions served") feel dishonest.

#### Testimonial Cards
**Strategic purpose**: Third-party validation from real people.
**Placement**: After features (validates the claims just made) or near CTA (reduces last-second objection).
**Structure**: Quote + photo + name + title + company.
**Rule**: Curate manually. Never auto-pull. Choose quotes that address specific objections or highlight specific outcomes. "It saved me 4 hours every Monday" beats "Great tool, love it."

#### Case Study Snippet
**Strategic purpose**: Prove ROI with specific data from a real customer.
**When to use**: When you have strong outcome data.
**Structure**: Company logo + quote + key metric + "Read full story" link.
**Rule**: The metric must be specific and impressive. "Reduced response time from 4 hours to 12 minutes" not "improved efficiency."

#### Contextual Proof (Inline)
**Strategic purpose**: Validate specific feature claims in context.
**Placement**: Beside or below individual feature descriptions.
**Structure**: Small quote or metric related to that specific feature.
**Why it works**: Proof is most effective when it's adjacent to the claim it supports. A testimonial about speed next to your speed feature is more convincing than the same testimonial in a testimonial carousel.

---

### DIFFERENTIATE Sections (Why you, not them)

#### Comparison Table
**Strategic purpose**: Help visitors evaluate you against alternatives.
**When to use**: Dedicated comparison pages. Never on homepage (too aggressive).
**Structure**: Feature-by-feature comparison table. Check/x marks. Categories.
**Rule**: Be honest. Admit where competitors are better for certain use cases. Honest comparison pages rank higher and build more trust.

#### "Why [Product]" / Positioning Block
**Strategic purpose**: Articulate what makes you different in one clear statement.
**When to use**: Homepage, below features.
**Structure**: Bold statement + 3-4 supporting points.
**Example**: "Other tools give you pieces. 60 gives you the whole picture."
**Rule**: Position against the CATEGORY, not one competitor (unless it's a comparison page).

#### Use-Case Tabs / Persona Sections
**Strategic purpose**: Show different audiences that the product is for THEM specifically.
**When to use**: When you serve multiple personas with different pain points.
**Structure**: Tabs or segmented sections. Each shows persona-specific value props, screenshots, and proof.
**Example**: "For Founders" / "For Sales Teams" / "For Agencies"

---

### CONVERT Sections (Ask for the action)

#### Pricing Table
**Strategic purpose**: Make the purchase decision clear and guided.
**Structure**: 3 tiers max. Highlight recommended tier. Show annual by default with monthly toggle.
**Psychology**:
- Anchor with premium tier (Slack's $500 Enterprise increased mid-tier conversion 28%)
- Decoy effect: make one tier clearly inferior to push selection to target tier
- "Start free" outperforms "Start trial" for developer tools
- "No credit card required" reduces friction

#### Final CTA Block
**Strategic purpose**: Last chance to convert before the visitor leaves.
**Placement**: Bottom of page, before footer.
**Structure**: Full-width, visually distinct. Restate key benefit. One CTA button.
**Rule**: This is NOT a repeat of the hero. It should address the visitor who scrolled the ENTIRE page — they're informed but not yet convinced. Speak to their remaining hesitation.

#### FAQ Accordion
**Strategic purpose**: Address specific conversion objections.
**Placement**: Above or beside the final CTA.
**Structure**: 5-7 questions max. Each answers a real objection.
**Rule**: These are NOT product documentation questions. These are purchase-decision questions: "Is my data secure?", "Can I cancel anytime?", "What happens when my trial ends?", "Do you integrate with [tool]?"

---

## Section Stacking Rules

### The Rhythm

1. Never stack two PROVE sections back-to-back (feels desperate)
2. Never stack three SHOW sections (cognitive overload)
3. Always place a PROVE section after a SHOW section (claim → evidence)
4. CONVERT sections go last (don't ask before you've earned the right)
5. HOOK is always first (obvious but worth stating)

### Optimal Section Count by Page Type

| Page Type | Sections | Scroll Depth |
|-----------|----------|-------------|
| Product-as-hero landing page | 5-7 | 3-4 viewports |
| Feature landing page | 6-8 | 4-5 viewports |
| Homepage | 7-10 | 5-7 viewports |
| Comparison page | 4-6 | 3-4 viewports |
| Pricing page | 3-5 | 2-3 viewports |
| Use-case page | 5-7 | 3-4 viewports |

### Default Section Stack for AI SaaS Landing Page

This is the starting point. Customize based on product, audience, and awareness level.

```
1. HOOK   — Hero (product-as-hero or screenshot)
2. PROVE  — Logo bar or metrics bar
3. SHOW   — How it works (3-step) or interactive demo
4. SHOW   — Feature bento grid (4-6 features)
5. PROVE  — Testimonial cards (2-3 curated quotes)
6. DIFF   — "Why [Product]" positioning block
7. SHOW   — Use-case tabs (if multiple personas)
8. PROVE  — Case study snippet
9. CONVERT — Pricing table (if applicable)
10. CONVERT — FAQ + Final CTA block
```
