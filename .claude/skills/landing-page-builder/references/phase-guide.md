# Landing Page Builder — Phase Guide

Detailed gate formats, copy frameworks, iteration patterns, and quality standards for the 6-phase landing page pipeline.

---

## Gate Presentation Format

Every approval gate follows the same structure:

```
## Phase [N] Complete: [Phase Name]

### Deliverable Summary
[2-3 sentence summary of what was produced]

### Key Decisions Made
| Decision | Choice | Rationale |
|----------|--------|-----------|
| [Decision 1] | [Choice] | [Why] |
| [Decision 2] | [Choice] | [Why] |

### The Deliverable
[Full deliverable content — section stack, wireframe, copy deck, etc.]

### What's Next
Phase [N+1] will [brief description of next phase].

---

**Ready to proceed?**
- **Approve** — move to Phase [N+1]
- **Iterate** — tell me what to change (I'll re-run this phase)
- **Go back** — return to Phase [N-1] with feedback
```

---

## Iteration Patterns

### Same-Phase Iteration

When the user says "change X" at a gate, re-run only the affected step within that phase. Preserve everything else.

**Examples:**
- Gate 1: "Move the FAQ above the final CTA" → reorder section stack, keep everything else
- Gate 2: "Use tabs instead of bento grid for features" → change that section's layout, keep other sections
- Gate 3: "Warmer colors" → regenerate moodboard with warm constraint, keep brief and wireframe
- Gate 4: "Sharper headlines" → rewrite headlines only, keep body copy and CTAs
- Gate 5: "The hero image doesn't match" → regenerate hero only, keep other assets

### Cross-Phase Iteration

When feedback at a later gate invalidates an earlier decision:

| Feedback | Impact | Action |
|----------|--------|--------|
| "I don't like the section order" at Gate 4 | Invalidates wireframe | Go back to Phase 2, re-approve, then re-run Phases 3-4 |
| "Wrong audience" at Gate 4 | Invalidates everything | Go back to Phase 1 |
| "Style doesn't match the copy tone" at Gate 5 | Style-copy mismatch | Re-run Phase 3 with copy tone as constraint |
| "Different product positioning" at any gate | Invalidates brief | Go back to Phase 1 |

### "Start Over" Handling

When the user says "start over" at any gate:

1. Acknowledge what was learned: "Here's what I'll carry forward from this attempt: [insights]"
2. Return to Phase 1 with those insights as context
3. Don't repeat the same discovery questions if answers haven't changed

---

## Copy Frameworks

### Hero Headline Formulas

Pick the formula that matches the product's primary value:

| Formula | Structure | Example |
|---------|-----------|---------|
| **Verb + Benefit** | [Action verb] [the outcome] | "Close more deals" |
| **Verb + Benefit + For Whom** | [Action] [outcome] [audience] | "Close more deals, faster" |
| **Eliminate + Pain** | [Remove] [the problem] | "Never miss a follow-up again" |
| **Outcome + Timeframe** | [Result] in [time] | "Pipeline clarity in 60 seconds" |
| **Question** | [Pain-point question] | "Still chasing leads manually?" |
| **Stat + Promise** | [Number] [what it means] | "10x more follow-ups. Zero extra work." |

**Rules:**
- 5-8 words maximum
- Benefit-first, not feature-first
- No jargon, no buzzwords
- Test: would a 5th grader understand what this product does from the headline alone?

### Subheadline Formulas

The subheadline expands the headline's promise with specifics:

| Formula | Structure | Example |
|---------|-----------|---------|
| **How it works** | [Product] [mechanism] so you can [benefit] | "60 monitors your pipeline and writes follow-ups so you never lose momentum" |
| **Pain → Solution** | Stop [pain]. Start [benefit]. | "Stop forgetting follow-ups. Start closing deals on autopilot." |
| **Audience + Value** | For [audience] who [situation], [product] [benefit] | "For founders who sell, 60 handles the admin so you focus on conversations" |

**Rules:**
- 1-2 sentences maximum
- Must add NEW information (not restate the headline)
- Include one specific detail (number, mechanism, or proof point)

### Feature Description Framework

For every feature on the page, follow this structure:

```
[Section Headline]: Benefit-first (what the user gets)
[Subheadline]: One sentence expanding the benefit

[Feature 1]:
  - What it does: [mechanism — 1 sentence]
  - Why it matters: [benefit — 1 sentence]
  - Proof: [metric, testimonial snippet, or "how" detail]

[Feature 2]:
  - What it does: ...
  - Why it matters: ...
  - Proof: ...
```

**Example:**
```
Headline: Follow-ups that write themselves
Subheadline: Every deal gets the right message at the right time — without you lifting a finger.

Feature: AI Follow-Up Writer
  - What: Drafts follow-up emails using your deal context, meeting notes, and tone
  - Why: You'll never lose a deal because you forgot to reply
  - Proof: "It wrote a follow-up that closed a $40K deal I'd forgotten about" — Sarah K., Founder
```

### CTA Text Framework

| CTA Type | Formula | Examples |
|----------|---------|---------|
| **Primary** | [Action verb] + [benefit] | "Start closing more deals", "Get your first follow-up" |
| **Free signup** | Start + free | "Start free", "Try free for 14 days" |
| **Demo** | [Action] + [deliverable] | "See it in action", "Watch the 2-min demo" |
| **Waitlist** | [Action] + [exclusivity] | "Join the waitlist", "Get early access" |

**Never use:** "Learn more", "Submit", "Click here", "Get started", "Sign up for free"

**Supporting micro-copy below CTA:**
- "No credit card required"
- "2-minute setup"
- "Cancel anytime"
- "Free forever for solo users"
- "Join 5,000+ teams"

### FAQ Framework

Every FAQ question addresses a purchase objection, not a product feature:

| Objection Category | Example Questions |
|-------------------|-------------------|
| **Trust** | "Is my data secure?", "Who's behind this?" |
| **Risk** | "Can I cancel anytime?", "What happens when my trial ends?" |
| **Fit** | "Is this for [my company size/industry]?", "Do you integrate with [tool]?" |
| **Value** | "How is this different from [competitor]?", "Why should I switch from [current solution]?" |
| **Effort** | "How long does setup take?", "Do I need to change my workflow?" |

**Answer rules:**
- 2-3 sentences maximum per answer
- Conversational tone (not legal/corporate)
- End with a reassurance or proof point when possible
- If the answer is "yes" or "no", lead with that word

### Final CTA Headline

This section speaks to the visitor who scrolled the ENTIRE page. They're informed but not yet convinced.

| Approach | Example |
|----------|---------|
| **Address hesitation** | "Still on the fence? Start free — you'll know in 60 seconds." |
| **Restate core benefit** | "Every deal deserves a follow-up. Let 60 handle it." |
| **Loss framing** | "Your competitors are already using AI for sales. Don't get left behind." |
| **Social proof close** | "Join 5,000+ founders who stopped losing deals to bad follow-up." |

---

## Asset Checklist Generator

Derive the asset list from the approved wireframe. For each section type:

| Section Type | Assets Needed |
|-------------|---------------|
| **Hero (screenshot)** | 1 product screenshot (1280x720 or 1440x900), styled in browser frame |
| **Hero (illustration)** | 1 hero illustration (landscape, 16:9), supporting the headline's concept |
| **Hero (video)** | 1 hero video or animated loop (< 10s, autoplay muted) |
| **Logo bar** | 5-8 company logos (SVG, grayscale) |
| **Feature bento** | 1 icon/illustration per feature card (square, consistent style) |
| **Feature deep-dive** | 1 product screenshot or illustration per feature (alternating sides) |
| **How it works** | 1 icon per step (3 icons, consistent style) |
| **Testimonials** | 1 headshot per testimonial (square, 80x80px minimum) |
| **Case study** | 1 company logo + 1 metric visualization |
| **Pricing** | No images (pure UI), but may need comparison icons |
| **FAQ** | No images |
| **Final CTA** | Optional background texture/gradient (decorative) |
| **Background** | Gradient mesh, noise texture, or decorative SVG pattern |

---

## Handoff Document Format

Each phase produces a structured context object passed to the next phase.

### Phase 1 → Phase 2 Handoff

```
STRATEGY HANDOFF
================
Page type: [landing page / homepage / feature page]
Audience: [persona, awareness level, traffic source]
Conversion goal: [primary CTA action]

Section Stack:
1. [HOOK] [Section type] — [strategic purpose]
2. [SHOW] [Section type] — [strategic purpose]
...

Hero pattern: [product-as-hero / screenshot / video / stat-led / minimal]
CTA strategy: [single / dual-path / progressive]
Color mode: [dark / light / system-aware]
Demo strategy: [embedded / video / screenshot / none]

Competitive context: [key differentiation angle]
Key messages: [3-5 core messages to communicate]
```

### Phase 2 → Phase 3 Handoff

```
WIREFRAME HANDOFF
=================
Section breakdown:
1. [Section name] — [layout pattern] — [animation tier]
   Components: [list of component types]
   Grid: [columns, spacing]

2. [Section name] — ...

Responsive notes: [key mobile adaptations]
Animation budget: [overall tier, per-section assignments]
SVG needs: [list of animated SVG requirements]
```

### Phase 3 → Phase 4 Handoff

```
STYLE HANDOFF
=============
Palette: [hex codes with labels — primary, accent, background, text]
Mood: [1-2 descriptors]
Typography direction: [font family recommendations, weight contrasts]
Composition rules: [spatial preferences — dense/airy, centered/asymmetric]

Copy tone implications:
- If [dark/premium mood] → copy should be confident, direct, minimal
- If [warm/friendly mood] → copy should be conversational, relatable
- If [bold/energetic mood] → copy should be punchy, short, high-energy
```

### Phase 4 → Phase 5 Handoff

```
COPY HANDOFF
============
Hero headline: "[exact text]" → hero image should support this concept
Hero subheadline: "[exact text]"

Feature 1: "[headline]" → needs illustration showing [concept]
Feature 2: "[headline]" → needs illustration showing [concept]
...

Testimonials: [N testimonials] → need [N headshot placeholders]
Logo bar: [N logos needed]
```

### Phase 5 → Phase 6 Handoff

```
BUILD HANDOFF
=============
All prior handoffs (strategy, wireframe, style, copy) PLUS:

Asset manifest:
- /assets/hero-main.png (1440x900, hero section)
- /assets/feature-1.svg (animated, feature section)
- /assets/feature-2.svg (animated, feature section)
...

SVG components to inline: [list]
Images to lazy-load: [list — everything below fold]
Images to preload: [hero image only]
```

---

## Quality Bar

What "amazing" means at each phase:

### Phase 1: Brief
- Specific and opinionated — not generic templates
- Backed by competitive context — not guessing
- Section stack has a clear narrative flow — not just a list of sections
- Every section earns its place — no filler

### Phase 2: Wireframe
- Clear component hierarchy — you can picture the page
- Responsive strategy addresses real mobile challenges — not just "stack vertically"
- Animation plan is tied to strategic purpose — not decoration for decoration's sake
- Layout has spatial variety — not predictable grid after grid

### Phase 3: Style
- Distinctive — could not be mistaken for a generic template
- Consistent across test assets — the style lock actually works
- Appropriate for the audience — developer tool looks different from consumer app
- The prompt prefix reliably reproduces the style

### Phase 4: Copy
- Punchy — no sentence is wasted
- Benefit-first — features support benefits, not the other way around
- 5th-grade readable — anyone can understand it instantly
- Every claim has proof — no unsupported assertions
- CTAs create desire — "Start closing more deals" not "Submit form"

### Phase 5: Assets
- Stylistically unified — all assets clearly belong together
- Appropriate for context — hero image supports the headline, feature icons match descriptions
- Technically sound — correct aspect ratios, no artifacts, SVGs are clean
- The page "feels" complete — no obvious gaps

### Phase 6: Build
- Production-ready — copy-paste and deploy
- Responsive — tested at 375/768/1024/1280px
- Accessible — focus rings, alt text, semantic HTML, reduced-motion support
- Performant — LazyMotion, lazy-loaded images, no layout shifts
- No placeholders — every word, every image, every animation is final
