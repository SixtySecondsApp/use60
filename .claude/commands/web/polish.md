---
name: web-polish
invoke: /web/polish
description: Quality audit — accessibility, performance, craft pass, UX rules enforcement via ui-ux-pro-max
---

# /web/polish — Quality Audit

**Purpose**: Final quality pass before shipping. Audits the built page against ui-ux-pro-max's 99 UX guidelines, `/frontend-design` craft checklist, WCAG 2.1 AA accessibility, and Core Web Vitals targets. Fixes issues found.

**Input**: $ARGUMENTS

---

## EXECUTION

### Step 1: Read Built Code

Read all generated components and the assembled page. Identify:
- Component file paths
- Total line count per component (flag if > 200 lines)
- Dependencies (Framer Motion, Lucide icons, etc.)
- Assets referenced

### Step 2: UX Audit (ui-ux-pro-max Priority 1-10)

Run through all 10 rule categories in priority order. For each, check the built code and flag violations:

#### Priority 1: Accessibility (CRITICAL)
- [ ] Color contrast 4.5:1 for normal text, 3:1 for large text
- [ ] Visible focus rings on all interactive elements (2-4px)
- [ ] Descriptive alt text on meaningful images
- [ ] `aria-label` on icon-only buttons
- [ ] Tab order matches visual order
- [ ] `<label>` with `for` attribute on form inputs
- [ ] Skip-to-main-content link
- [ ] Sequential heading hierarchy (h1 → h2 → h3, no level skip)
- [ ] Color not the only way to convey information
- [ ] `prefers-reduced-motion` respected

#### Priority 2: Touch & Interaction (CRITICAL)
- [ ] Minimum touch target 44x44px
- [ ] 8px+ spacing between interactive elements
- [ ] Loading feedback on all async actions
- [ ] No hover-only interactions (all have tap/click equivalent)

#### Priority 3: Performance (HIGH)
- [ ] Images use WebP/AVIF format
- [ ] Below-fold images lazy loaded
- [ ] Space reserved for dynamic content (CLS < 0.1)
- [ ] No layout thrashing

#### Priority 4: Style Selection (HIGH)
- [ ] Style matches product type (from brief)
- [ ] Visual consistency throughout
- [ ] SVG icons only (no emoji)

#### Priority 5: Layout & Responsive (HIGH)
- [ ] Mobile-first breakpoints
- [ ] Viewport meta tag
- [ ] No horizontal scroll at any breakpoint
- [ ] Test at 375px, 768px, 1024px, 1280px

#### Priority 6: Typography & Color (MEDIUM)
- [ ] Base font 16px minimum
- [ ] Line-height 1.5 on body text
- [ ] Semantic color tokens (not raw hex in components)
- [ ] No text below 12px

#### Priority 7: Animation (MEDIUM)
- [ ] Duration 150-300ms for micro-interactions
- [ ] Motion conveys meaning (not decorative-only)
- [ ] No animating `width`, `height`, `top`, `left`
- [ ] `motion-reduce` respected

#### Priority 8: Forms & Feedback (MEDIUM)
- [ ] Visible labels (not placeholder-only)
- [ ] Error messages near the field
- [ ] Helper text where needed
- [ ] Progressive disclosure

#### Priority 9: Navigation (HIGH)
- [ ] Predictable back behavior
- [ ] Bottom nav ≤ 5 items (if applicable)
- [ ] Deep linking works

#### Priority 10: Charts & Data (if applicable)
- [ ] Legends present
- [ ] Tooltips on data points
- [ ] Color not the only way to distinguish series

### Step 3: Frontend Design Craft Checklist

Run the `/frontend-design` Phase 4 + Phase 5 checklists:

**Typography Craft:**
- [ ] `text-balance` on all headings
- [ ] `text-pretty` on body paragraphs
- [ ] `tabular-nums` on numbers/data
- [ ] `truncate` or `line-clamp-*` on dynamic text
- [ ] `tracking-tight` on text-3xl+
- [ ] `leading-relaxed` on body text

**Animation Craft:**
- [ ] Only `transform` and `opacity` animated
- [ ] Correct easing (entrance: ease-out, exit: ease-in, movement: ease-in-out)
- [ ] `viewport={{ once: true }}` on scroll-triggered
- [ ] Looping animations pause off-screen

**Visual Craft:**
- [ ] No orphaned gradients
- [ ] Accent color max 1 per view
- [ ] Empty states have clear next action
- [ ] Loading states use shimmer skeletons
- [ ] Focus rings visible (`focus-visible:ring-2`)
- [ ] Dark mode borders use opacity (`border-white/10`)

**Code Craft:**
- [ ] No unused imports
- [ ] Components under 200 lines
- [ ] All interactive elements keyboard accessible
- [ ] Images have `alt` text
- [ ] Links have descriptive text (not "click here")

**Performance (Tier 3 cinematic only):**
- [ ] `LazyMotion` + `m` components (4.6KB bundle)
- [ ] Max `blur(24px)`, max 2-3 overlapping glass layers
- [ ] No `requestAnimationFrame` loops without stop conditions

### Step 3.5: Content Completeness Check

Verify the page has real, complete content — not placeholder text:

- [ ] Zero instances of "Lorem ipsum", "TODO", "placeholder", "coming soon" in rendered text
- [ ] All headlines are specific to THIS product (would fail if you swapped the product name)
- [ ] All code examples are syntactically valid (test with a quick mental parse)
- [ ] All data tables have complete rows — no empty cells, no "TBD"
- [ ] All links have `href` values (even if `#section` for now)
- [ ] Feature descriptions are specific, not generic ("8-type memory graph" not "advanced memory")
- [ ] Numbers and specs are accurate (cross-check against `.web/copy.md` if available)
- [ ] Copy tone is consistent across all sections
- [ ] CTAs match the conversion strategy from the brief
- [ ] If `.web/reference.md` exists, content density matches or exceeds the reference

### Step 4: Anti-Convergence Check

Verify the page doesn't feel like generic AI output:

- [ ] Display font is NOT Inter/Roboto/Arial/Open Sans/Lato/Space Grotesk
- [ ] NOT a predictable 3-column card grid
- [ ] Has at least one spatial surprise (asymmetry, overlap, diagonal flow, grid-break)
- [ ] Has atmosphere effects (gradient mesh, noise, radial glow, or layered transparency)
- [ ] Typography has extreme weight contrast (200 vs 800, not 400 vs 600)
- [ ] Size jumps are 3x+ between heading and body

### Step 5: Performance Targets Check

From the brief's performance targets:

| Metric | Target | Status |
|--------|--------|--------|
| LCP | < 2.0s | ? |
| INP | < 150ms | ? |
| CLS | < 0.05 | ? |
| Total page weight | < 1MB initial | ? |
| Time to interactive | < 3s | ? |

Flag any likely violations based on code analysis (heavy animations, unoptimized images, excessive JS).

### Step 6: Fix Issues

For each violation found:
1. Fix it directly in the code
2. Log what was fixed

Do NOT ask the user about each fix — just fix them. Only pause for decisions that could change the design direction (e.g., removing an animation that was intentionally cinematic).

### Step 7: Report

```
POLISH REPORT
=============

Content:        X/10 completeness checks passing (Y fixed)
Accessibility:  X/10 checks passing (Y fixed)
UX Rules:       X/10 categories clean
Craft:          X/X checklist items passing
Anti-Convergence: PASS/FAIL
Performance:    X/5 targets met
Reference Match: [N/A or density comparison]

Issues fixed:
  - Added aria-label to icon button in Hero.tsx
  - Added text-balance to h2 in Features.tsx
  - Replaced animate-bounce with transform-only animation
  - Added motion-reduce:transition-none to scroll reveals
  - Replaced placeholder text in Features.tsx with copy from copy.md

Remaining (need design decision):
  - None / [list any that need user input]
```

### Step 8: Update Pipeline State

```json
{
  "phase": "polish",
  "phaseGates": {
    "brief": { "status": "complete" },
    "design": { "status": "complete" },
    "build": { "status": "complete" },
    "assets": { "status": "complete" },
    "polish": { "status": "complete", "completedAt": "<ISO>" }
  }
}
```

---

## STANDALONE USE

`/web/polish` works on any existing code:

```
/web/polish                          # Audit current .web/ build
/web/polish src/pages/landing.tsx    # Audit a specific file
/web/polish --fix                    # Auto-fix everything (default)
/web/polish --report-only            # Report without fixing
```

---

## OUTPUT

```
Polish complete. All checks passing.

The page is ready to deploy.
```
