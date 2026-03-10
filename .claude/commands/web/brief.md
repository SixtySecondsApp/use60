---
name: web-brief
invoke: /web/brief
description: Strategic website brief — audience, conversion architecture, SEO plan, section stack, competitive intel
---

# /web/brief — Strategic Brief

**Purpose**: Produce a strategic blueprint for a website or page. Combines `/website-strategist` strategy with `ui-ux-pro-max` product-type intelligence. Output feeds directly into `/web/design` and `/web/build`.

**Input**: $ARGUMENTS

---

## EXECUTION

### Step 1: Load Product Intelligence

Before any strategy work, query the ui-ux-pro-max databases for product-type-matched guidance:

```bash
# Find matching product type rules
python3 ~/.claude/skills/ui-ux-pro-max/scripts/search.py "$PRODUCT_TYPE" --domain product

# Get industry-specific UX guidelines
python3 ~/.claude/skills/ui-ux-pro-max/scripts/search.py "$INDUSTRY" --domain ux
```

If scripts are unavailable, use the SKILL.md rule categories as fallback (Priority 1-10 from ui-ux-pro-max).

### Step 2: Run Website Strategist

Execute the full `/website-strategist` skill workflow:

1. **DIAGNOSE** — What are we strategizing? Who is the buyer? What's the aha moment? Primary conversion action? Current performance?
2. **COMPETITIVE INTELLIGENCE** — Research 3-5 competitors. Hero patterns, CTA strategies, social proof placement, SEO footprint.
3. **STRATEGIZE** — Section stack with strategic rationale. Hero pattern, CTA strategy, demo strategy, color mode, content depth, mobile strategy, navigation.
4. **SEO ARCHITECTURE** — Page types to build, keyword targets, LLM optimization, content plan.
5. **PERFORMANCE TARGETS** — Core Web Vitals targets, technical requirements.

### Step 3: Enrich with Product-Type Rules

Cross-reference the strategy against ui-ux-pro-max findings:

- **Style recommendation**: Does the product type suggest a specific style (glassmorphism for fintech, minimalism for dev tools, etc.)?
- **Color psychology**: What palettes align with the industry and audience?
- **Typography direction**: What font categories suit the product positioning?
- **UX patterns**: What navigation, form, and interaction patterns does ui-ux-pro-max recommend for this product type?

### Step 4: Produce Brief

Output a strategic brief in this format and save to `.web/brief.md`:

```markdown
# Web Brief: [Page/Site Name]

## Executive Summary
[2-3 sentences: what, who, why]

## Audience & Awareness
[Persona, awareness level, traffic sources]

## Competitive Landscape
[Key findings, opportunities, gaps]

## Section Stack
[Ordered sections with strategic purpose — HOOK → SHOW → PROVE → DIFFERENTIATE → CONVERT]

## Conversion Strategy
[Hero pattern, CTA strategy, social proof plan, demo approach]

## SEO Architecture
[Page types, keyword targets, LLM optimization]

## Product-Type Intelligence
[ui-ux-pro-max recommendations: style, color direction, typography, UX patterns]

## Performance Targets
[Core Web Vitals, technical requirements]

## Design Direction Notes
[Guidance for /web/design phase: aesthetic direction, mood, references]

## Build Notes
[Guidance for /web/build phase: tech stack, animation tier, responsive strategy]
```

### Step 5: Update Pipeline State

```json
// .web/pipeline.json
{
  "phase": "brief",
  "phaseGates": {
    "brief": { "status": "complete", "completedAt": "<ISO>" },
    "design": { "status": "pending" },
    "build": { "status": "pending" },
    "assets": { "status": "pending" },
    "polish": { "status": "pending" }
  }
}
```

---

## SKIP DISCOVERY WHEN

- User provides a detailed spec covering audience, conversion goal, and section structure
- User says "just do it" — use reasonable defaults and state assumptions
- This is a follow-up to a previous brief session
- `.web/brief.md` already exists and user wants to iterate

---

## THE 14 LAWS

Non-negotiable rules from `/website-strategist`. Every brief must honor these:

1. Optimize for LLMs, not just Google
2. Build comparison pages for every competitor
3. Create programmatic SEO pages
4. The product IS the landing page
5. One page, one action
6. Social proof is a layer, not a section
7. Write at 5th-grade reading level
8. Price with anchoring (3 tiers max)
9. Dark mode signals premium
10. Speed is a feature (LCP < 2.0s)
11. Hero pattern must match product type
12. Design for the traffic source
13. Every page earns its place
14. Measure, don't guess

---

## OUTPUT

The brief is the single source of truth for all downstream phases. `/web/design` reads it for aesthetic direction. `/web/build` reads it for section structure and tech requirements. `/web/assets` reads it for brand context.

After completing the brief, suggest next step:

```
Brief complete → saved to .web/brief.md

Next: /web/design to lock in the visual direction (palette, fonts, moodboard)
  or: /web/ship to run the full pipeline from here
```
