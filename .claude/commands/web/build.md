---
name: web-build
invoke: /web/build
description: Generate production-ready React/Tailwind page code from brief + style guide, powered by frontend-design + ui-ux-pro-max UX rules
---

# /web/build — Code Generation

**Purpose**: Generate complete, production-ready React + TypeScript + Tailwind CSS page code. Consumes the brief (`.web/brief.md`) for section structure and the style guide (`.web/style-guide.json`) for visual tokens. Enforces ui-ux-pro-max UX rules and `/frontend-design` craft standards.

**Input**: $ARGUMENTS

---

## EXECUTION

### Step 1: Load Context

Read all available context in this order:

1. **`.web/copy.md`** — approved content (headlines, body, code examples, tables, CTAs) — **this is the source of truth for all text on the page**
2. **`.web/style-guide.json`** — locked palette, typography, animation tier, anti-convergence rules
3. **`.web/brief.md`** — section stack, conversion strategy, build notes
4. **`.web/reference.md`** — reference site patterns (section types, information density, visual approach)
5. **`.web/assets/`** — any generated images, SVGs, or logos to wire in
6. **User input** — specific section request, overrides, or iteration instructions

If no copy exists: ask the user to run `/web/copy` first, or use `/web/quick` for one-off components. **Never generate code with placeholder copy when `.web/copy.md` should exist.**
If no style guide exists: ask the user to run `/web/design` first, or infer from context and state assumptions.
If no brief exists: infer section structure from user input or use standard landing page flow.

### Step 2: Load UX Rules

Query ui-ux-pro-max for build-time UX enforcement:

```bash
# Accessibility rules (Priority 1 — CRITICAL)
python3 ~/.claude/skills/ui-ux-pro-max/scripts/search.py "accessibility" --domain ux

# Touch & interaction rules (Priority 2 — CRITICAL)
python3 ~/.claude/skills/ui-ux-pro-max/scripts/search.py "touch interaction" --domain ux

# Layout & responsive rules (Priority 5 — HIGH)
python3 ~/.claude/skills/ui-ux-pro-max/scripts/search.py "responsive layout" --domain ux
```

If scripts unavailable, enforce from SKILL.md rule categories:
- Contrast 4.5:1, alt text, keyboard nav, aria-labels
- Min touch target 44x44px, 8px+ spacing, loading feedback
- Mobile-first breakpoints, no horizontal scroll

Also load ui-styling references:
- `~/.claude/skills/ui-styling/references/shadcn-components.md` — component catalog
- `~/.claude/skills/ui-styling/references/shadcn-accessibility.md` — ARIA patterns

### Step 3: Commit Design Direction

Before writing any code, state the design direction explicitly (from `/frontend-design` Phase 2):

```
AESTHETIC: [from style-guide.json name]
TYPOGRAPHY: [display + body fonts from style-guide.json]
COLOR PALETTE: [key colors from style-guide.json]
ANIMATION TIER: [from style-guide.json]
LAYOUT APPROACH: [from brief section stack]
```

### Step 4: Generate Code

Follow `/frontend-design` Phase 3 rules exactly:

**Code Rules:**
1. **Complete files** — every component is copy-pasteable and functional
2. **TypeScript strict** — proper interfaces, no `any`, exported types
3. **Tailwind only** — no inline styles except dynamic values
4. **Lucide React icons** — never emoji, never raw SVG
5. **`cn()` utility** — `clsx` + `tailwind-merge` for conditional classes
6. **Semantic HTML** — `<section>`, `<header>`, `<main>`, `<nav>`, not div soup
7. **Responsive** — mobile-first (`sm:`, `md:`, `lg:`, `xl:`)
8. **Dark mode** — `dark:` variants when building for both modes

**Animation by tier** (from style-guide.json):
- **Tier 1**: CSS transitions only (app UI)
- **Tier 2**: Framer Motion `whileInView`, staggered reveals (standard landing)
- **Tier 3**: Scroll-linked parallax, aurora, spotlight, cinematic sequences (hero)

**Section assembly** (from brief section stack + copy.md content):

Use the section type from the brief/reference to pick the right component pattern. The old vocabulary (hero + 3 features + pricing + CTA) produces generic pages. Rich product pages need these:

| Section Type | Component Pattern | When To Use |
|-------------|-------------------|-------------|
| `hero` | Full-width, headline + sub + CTA + visual/animation | Always first. 40% of effort. |
| `architecture` | Diagram with labeled components + descriptions | System/product with multiple parts |
| `deep-dive` | Headline + body + code block + data points | Technical feature explanation |
| `integration-grid` | Icon grid with categories + names + descriptions | Supported tools/platforms |
| `feature-matrix` | Bento grid or spotlight cards with icons + copy | Feature overview |
| `code-example` | Syntax-highlighted code block + terminal styling | Usage examples, config snippets |
| `comparison-table` | Responsive table with feature rows + tier columns | Pricing, plan comparison |
| `pricing` | Tier cards with features, pricing, CTAs | Conversion section |
| `process-flow` | Numbered steps with icons + descriptions | How it works |
| `tech-stack` | Logo/icon grid with names + rationale | Build credibility |
| `deployment` | Code block (docker/CLI) + deployment options | Self-host, setup instructions |
| `taxonomy` | Categorized list with icons + descriptions | Feature categories, memory types |
| `narrative` | Large text blocks with visual breaks | Philosophy, origin story |
| `social-proof` | Logo marquee, testimonial cards, stat bars | Trust building |
| `data-table` | Structured rows with specs/limits/values | Technical specifications |
| `faq` | Accordion with smooth expand | Common questions |
| `cta` | Headline + description + primary/secondary buttons | Final conversion |

**Content source**: Pull ALL text from `.web/copy.md`. Code examples, table data, feature descriptions — everything comes from the approved copy. Never invent copy during build.

Wire in assets from `.web/assets/` where they exist (images, SVGs, logos).

### Step 5: Apply Style Guide Tokens

Map style-guide.json values into code:

```tsx
// From style-guide.json palette
const bg = "bg-zinc-950"           // palette.background.tailwind
const surface = "bg-white/5"       // palette.surface.tailwind
const border = "border-white/10"   // palette.border.tailwind
const accent = "text-violet-500"   // palette.accent1.tailwind

// From style-guide.json typography
// Load via Google Fonts link tag
// Use font-display in Tailwind config
```

Apply anti-convergence rules from style-guide.json:
- Use spatial surprises listed in `antiConvergence.requiredSurprises`
- Apply atmosphere effects from `antiConvergence.atmosphereEffects`
- Never use fonts listed in `antiConvergence.bannedFonts`

### Step 6: Craft Pass

Run the `/frontend-design` Phase 4 checklist:

**Typography:**
- [ ] `text-balance` on all headings
- [ ] `text-pretty` on body paragraphs
- [ ] `tabular-nums` on numbers
- [ ] `tracking-tight` on large headings (text-3xl+)
- [ ] `leading-relaxed` on body text

**Animation:**
- [ ] Only animate `transform` and `opacity`
- [ ] `viewport={{ once: true }}` on scroll animations
- [ ] `motion-reduce:transition-none motion-reduce:animate-none`
- [ ] Correct easing: entrance=ease-out, exit=ease-in

**Visual:**
- [ ] Accent color used sparingly (max 1 per view)
- [ ] Focus rings on interactive elements (`focus-visible:ring-2`)
- [ ] Dark mode borders use opacity (`border-white/10`)

**Accessibility (from ui-ux-pro-max Priority 1):**
- [ ] Contrast ratio 4.5:1 minimum
- [ ] Alt text on all images
- [ ] Keyboard navigable
- [ ] `aria-label` on icon-only buttons
- [ ] Sequential heading hierarchy (h1 → h2 → h3)
- [ ] `sr-only` text for screen reader context

**Performance:**
- [ ] `LazyMotion` + `m` components (4.6KB vs 32KB)
- [ ] Max `backdrop-blur-xl` (24px), max 2-3 glass layers
- [ ] Lazy load below-fold sections

### Step 7: Update Pipeline State

```json
{
  "phase": "build",
  "phaseGates": {
    "brief": { "status": "complete" },
    "design": { "status": "complete" },
    "build": { "status": "complete", "completedAt": "<ISO>" },
    "assets": { "status": "pending" },
    "polish": { "status": "pending" }
  }
}
```

---

## STANDALONE USE

`/web/build` can run without brief or style guide for simple requests:

```
/web/build "dark mode hero section with gradient text"
```

It will infer style direction, state assumptions, and generate. For full pages, run `/web/brief` and `/web/design` first.

---

## OUTPUT

```
Page code generated:
  - components/Hero.tsx (Tier 3 animations)
  - components/SocialProof.tsx (logo marquee)
  - components/Features.tsx (bento grid)
  - components/CTA.tsx (final conversion)
  - page.tsx (assembled page)

Craft pass: all checks passing
Accessibility: WCAG 2.1 AA compliant

Next: /web/assets to generate hero image + SVG animations
  or: /web/polish for final quality audit
```
