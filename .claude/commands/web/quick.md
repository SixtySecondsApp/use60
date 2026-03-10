---
name: web-quick
invoke: /web/quick
description: Fast-path — build a single section, component, or quick UI tweak without the full pipeline
---

# /web/quick — Fast-Path Build

**Purpose**: Build a single section, component, or make a quick UI change without spinning up the full pipeline. Straight to design direction → code → craft pass. No brief, no moodboard, no asset generation.

**Input**: $ARGUMENTS

---

## WHEN TO USE

- Single landing page section (hero, pricing, FAQ, CTA, etc.)
- Individual component (card, button, modal, form)
- Quick visual tweak ("make this darker", "add animation", "fix spacing")
- Style override on existing page
- Adding a section to an existing page
- "Just build it" energy

**When NOT to use** (use `/web/ship` instead):
- Full page from scratch
- Need strategy/competitive research
- Multiple sections that need cohesive design
- Brand new site architecture

---

## EXECUTION

### Step 1: Check for Existing Style

```
HAS .web/style-guide.json?
  → Use locked style. Skip design questions.

HAS existing code in the target location?
  → Match existing style. Read the code first.

NEITHER?
  → Ask 2 quick questions:
    1. Dark or light?
    2. Any reference site or aesthetic keyword? (e.g., "like Linear", "minimal", "bold")
  → Infer everything else.
```

### Step 2: Load Intelligence

Quick-load relevant ui-ux-pro-max rules based on what's being built:

| Building | Load |
|----------|------|
| Hero section | Style + Typography + Animation rules |
| Pricing | Layout + Forms + Accessibility rules |
| Navigation | Navigation + Touch + Responsive rules |
| Card/component | Style + Touch + Animation rules |
| Form | Forms + Accessibility + Touch rules |
| Data table | Charts & Data + Layout + Accessibility |

```bash
python3 ~/.claude/skills/ui-ux-pro-max/scripts/search.py "$COMPONENT_TYPE" --domain ux
```

Also load `/frontend-design` anti-convergence rules for landing page sections. For app UI, load sixty-design-system tokens instead.

### Step 3: Design Direction (1 line)

State the direction in one line, then build:

```
Building: Dark hero section — Clash Display 700, zinc-950 bg, violet-500 accent, Tier 3 cinematic entrance
```

### Step 4: Generate

Write COMPLETE, production-ready code following `/frontend-design` rules:

- TypeScript strict, no `any`
- Tailwind only
- Lucide React icons
- `cn()` for conditional classes
- Semantic HTML
- Responsive (mobile-first)
- Animation tier appropriate to component type
- Dark mode variants if building for both modes

### Step 5: Inline Craft Pass

Apply the craft checklist as you write (don't do a separate pass):

- `text-balance` on headings, `text-pretty` on body
- `tracking-tight` on large headings
- Only animate `transform` and `opacity`
- `viewport={{ once: true }}` on scroll animations
- `motion-reduce:transition-none` on animated elements
- `focus-visible:ring-2` on interactive elements
- `aria-label` on icon-only buttons
- Contrast 4.5:1 minimum

### Step 6: Asset Hints

If the section needs visual assets, suggest them but don't generate automatically:

```
Component complete. Needs:
  - Hero background image → run /web/assets "hero image for [description]"
  - Animated accent SVG → run /web/assets "animated [description]"
```

---

## EXAMPLES

```bash
/web/quick "dark hero section with gradient text and floating badges"
/web/quick "pricing table — 3 tiers, annual/monthly toggle, dark mode"
/web/quick "animated FAQ accordion with smooth expand"
/web/quick "logo marquee with infinite scroll and fade edges"
/web/quick "make the features section use a bento grid instead of 3-column"
/web/quick "add a CTA section to the bottom of the landing page"
/web/quick src/pages/landing.tsx "improve the hero — it looks generic"
```

---

## OPTIONS

| Flag | Effect |
|------|--------|
| `--app` | Use sixty-design-system tokens instead of landing page aesthetics |
| `--tier N` | Override animation tier (1=micro, 2=scroll reveals, 3=cinematic) |
| `--light` | Force light mode |
| `--dark` | Force dark mode (default for landing sections) |

---

## OUTPUT

Deliver the component code directly. No pipeline state, no `.web/` artifacts. Just the code.

```tsx
// Complete component code here — ready to copy-paste
```

If the user wants to iterate: they can keep calling `/web/quick` with modifications.
If this grows into a full page: suggest upgrading to `/web/ship`.
