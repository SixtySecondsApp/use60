---
name: frontend-design
description: Create distinctive, production-grade frontend interfaces with high design quality. Use this skill when the user asks to build web components, pages, landing pages, or applications. Triggers on frontend development, UI styling, component creation, page building, landing page design, hero sections, and any visual interface work.
---

# Frontend Design Skill

Production-grade frontend generation with adaptive animation tiers, anti-AI-slop enforcement, and discovery-first workflow. Built for React 18 + TypeScript + Tailwind CSS + Framer Motion.

---

## PHASE 1: DISCOVER

Before writing ANY code, ask 3-5 discovery questions using `AskUserQuestion`. Adapt questions to what the user already provided.

### Required Context (ask what's missing)

1. **What are you building?**
   - Landing page (full page or specific section)
   - App view / dashboard page
   - Individual component or component set
   - Marketing section (hero, pricing, features, etc.)

2. **What's the aesthetic direction?**
   - Reference sites (Linear, Vercel, Stripe, Clerk, Resend, Apple, etc.)
   - Mood: premium minimal / bold immersive / data-dense / editorial / brutalist / playful
   - Or: "match our existing sixty app style"

3. **Animation tier?**
   - Micro-interactions only (app UI default)
   - Scroll reveals + transitions (standard landing)
   - Full cinematic (parallax, aurora, spotlight, timelines)
   - Auto-detect based on context (recommended)

4. **Theme mode?**
   - Dark mode only (landing pages default)
   - Light mode only
   - Both with dark: variants (app UI default)

5. **Scope?**
   - Single section (hero, pricing, FAQ, etc.)
   - Full page (auto-assembles sections with flow + spacing)
   - Component library (multiple variants)

### Skip discovery when:
- User provided a detailed spec or mockup
- User said "just build it" with clear context
- Iterating on existing work (follow established direction)

---

## PHASE 2: DESIGN DIRECTION

Before coding, commit to a BOLD aesthetic direction. State it explicitly.

### Mandatory Design Decisions (write these out before any code)

```
AESTHETIC: [e.g., "Premium dark SaaS — Linear meets Vercel"]
TYPOGRAPHY: [e.g., "Clash Display 700 for headings, Inter 400 for body"]
COLOR PALETTE: [e.g., "zinc-950 base, violet-500 accent, cyan-400 secondary"]
ANIMATION TIER: [1/2/3 — see animation-tiers.md]
LAYOUT APPROACH: [e.g., "Centered hero → bento grid → full-width CTA"]
```

### Anti-Convergence Rules (CRITICAL)

These rules prevent generic "AI slop" output. Violating them produces forgettable designs.

**NEVER use for landing pages:**
- Inter, Roboto, Arial, Open Sans, Lato, or system-ui as the display font
- Purple gradients on white backgrounds
- Blue-everything color schemes without deliberate accent contrast
- Predictable 3-column card grids with identical spacing
- Space Grotesk (Claude's most common convergence font)
- Generic hero → 3 features → testimonials → CTA without spatial variety
- Placeholder-looking stock imagery descriptions

**ALWAYS do:**
- Choose a distinctive display font (see aesthetics.md for recommendations)
- Commit to a dominant color with sharp accents — not evenly distributed palettes
- Use at least one spatial surprise: asymmetry, overlap, diagonal flow, or grid-breaking element
- Add atmosphere: gradient meshes, noise textures, radial glows, or layered transparencies
- Make typography dramatic: extreme weight contrasts (200 vs 800), 3x+ size jumps

**For app UI (sixty product):**
- Follow existing sixty-design-system tokens (see sixty-tokens.md)
- Inter is acceptable for app body text
- Prioritize clarity and data density over visual drama
- Micro-interactions only (Tier 1) unless specifically requested

---

## PHASE 3: GENERATE

Write COMPLETE, production-ready code. Never write partial snippets or TODO comments.

### Code Rules

1. **Complete files** — every component must be copy-pasteable and functional
2. **TypeScript strict** — proper interfaces, no `any`, exported types
3. **Tailwind only** — no inline styles except for dynamic values (transforms, gradients with variables)
4. **Lucide React icons** — never emoji, never raw SVG unless custom illustration
5. **`cn()` utility** — use `clsx` + `tailwind-merge` for all conditional classes
6. **Semantic HTML** — `<section>`, `<header>`, `<main>`, `<nav>`, not div soup
7. **Responsive** — mobile-first, test at `sm`, `md`, `lg`, `xl` breakpoints
8. **Dark mode** — all elements must have `dark:` variants when building for both modes

### Animation Tier Selection

Auto-detect based on what's being built:

| Building | Default Tier | Animation Approach |
|----------|-------------|-------------------|
| App component | Tier 1 | CSS transitions, hover states, skeletons |
| App page/dashboard | Tier 1 | CSS transitions + subtle fade-ins |
| Landing section | Tier 2 | Framer Motion `whileInView`, staggered reveals |
| Landing full page | Tier 2-3 | Full scroll animations, parallax optional |
| Hero section | Tier 3 | Sequenced entrance, radial glows, spotlight |
| Marketing showcase | Tier 3 | Cinematic — aurora, parallax, timeline sequences |

See `references/animation-tiers.md` for complete code patterns per tier.

### Section Assembly (Full Pages)

When generating a full landing page, follow this flow:

1. **Hero** — the single most important section. Spend 40% of effort here.
2. **Social proof** — logo marquee or stat bar. Immediate credibility.
3. **Problem/Solution** — why this exists. 2-3 pain points.
4. **Feature showcase** — bento grid or spotlight cards. Show the product.
5. **How it works** — 3-step process or timeline.
6. **Testimonials** — real quotes with names and roles.
7. **Pricing** — if applicable.
8. **CTA** — final conversion section with strong call to action.

Not every page needs all 8. The user's scope determines which sections to include.

See `references/section-library.md` for complete section templates.

---

## PHASE 4: CRAFT

After generating, apply production polish. Check every item:

### Typography Craft
- [ ] `text-balance` on all headings (prevents orphaned words)
- [ ] `text-pretty` on body paragraphs
- [ ] `tabular-nums` on any numbers/data
- [ ] `truncate` or `line-clamp-*` on dynamic text that could overflow
- [ ] `tracking-tight` on large headings (text-3xl and above)
- [ ] `leading-relaxed` or `leading-loose` on body text for readability

### Animation Craft
- [ ] Only animate `transform` and `opacity` (compositor properties)
- [ ] Never animate `width`, `height`, `top`, `left`, `margin`, `padding`
- [ ] Entrance: `ease-out`. Exit: `ease-in`. Movement: `ease-in-out`
- [ ] Micro-interactions: 150-200ms. Page transitions: 300-500ms
- [ ] `viewport={{ once: true }}` on all scroll-triggered animations
- [ ] Looping animations pause when off-screen
- [ ] Add `motion-reduce:transition-none motion-reduce:animate-none` on animated elements

### Visual Craft
- [ ] No orphaned gradients (every gradient serves a purpose)
- [ ] Accent color used sparingly — max 1 per view
- [ ] Empty states have one clear next action
- [ ] Loading states use shimmer skeletons, not spinners
- [ ] Interactive elements have visible focus rings (`focus-visible:ring-2`)
- [ ] Dark mode borders use opacity (`border-white/10` not `border-gray-700`)

### Code Craft
- [ ] No unused imports
- [ ] Components under 200 lines (extract sub-components if larger)
- [ ] All interactive elements are keyboard accessible
- [ ] Images have `alt` text
- [ ] Links have descriptive text (not "click here")

See `references/craft-rules.md` for the complete production checklist.

---

## PHASE 5: POLISH (Optional — for cinematic builds)

Only apply when building Tier 3 cinematic pages:

- [ ] Bundle audit: use `LazyMotion` + `m` components to reduce Motion from 32KB to 4.6KB
- [ ] Blur limits: max `blur(24px)`, max 2-3 overlapping glass layers
- [ ] Test on throttled CPU (Chrome DevTools → Performance → 4x slowdown)
- [ ] No `requestAnimationFrame` loops without stop conditions
- [ ] Prefer CSS `animation-timeline: view()` where browser support allows
- [ ] GSAP only when scroll-scrubbing or SVG morphing is needed

---

## Reference Files

Load these as needed based on the task:

- **[aesthetics.md](references/aesthetics.md)** — Typography recommendations, color palettes, spatial composition, font pairing guide
- **[animation-tiers.md](references/animation-tiers.md)** — Complete code patterns for all 3 animation tiers
- **[section-library.md](references/section-library.md)** — 8 production landing page sections with full code
- **[craft-rules.md](references/craft-rules.md)** — Production polish checklist (from ibelick + v0 + Lovable best practices)
- **[sixty-tokens.md](references/sixty-tokens.md)** — Sixty's design tokens, glassmorphism specs, component patterns

---

## Quick Start Examples

### "Build me a landing page hero"
→ Ask aesthetic direction → Commit to Tier 3 → Generate hero from section-library → Apply craft pass

### "Add a settings page to the app"
→ Skip discovery (app context clear) → Use sixty-tokens → Tier 1 animations → Generate → Craft pass

### "Create an animated pricing section"
→ Ask theme preference → Tier 2 → Generate pricing from section-library → Craft pass

### "Make this page look better"
→ Read existing code → Identify what's generic → Apply anti-convergence rules → Upgrade typography + spacing + animation
