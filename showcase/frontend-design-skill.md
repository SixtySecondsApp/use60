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
ANIMATION TIER: [1/2/3 — see animation tiers section]
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
- Choose a distinctive display font (see Aesthetics Reference below)
- Commit to a dominant color with sharp accents — not evenly distributed palettes
- Use at least one spatial surprise: asymmetry, overlap, diagonal flow, or grid-breaking element
- Add atmosphere: gradient meshes, noise textures, radial glows, or layered transparencies
- Make typography dramatic: extreme weight contrasts (200 vs 800), 3x+ size jumps

**For app UI (sixty product):**
- Follow existing sixty-design-system tokens
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

## Quick Start Examples

### "Build me a landing page hero"
→ Ask aesthetic direction → Commit to Tier 3 → Generate hero from section library → Apply craft pass

### "Add a settings page to the app"
→ Skip discovery (app context clear) → Use sixty-tokens → Tier 1 animations → Generate → Craft pass

### "Create an animated pricing section"
→ Ask theme preference → Tier 2 → Generate pricing from section library → Craft pass

### "Make this page look better"
→ Read existing code → Identify what's generic → Apply anti-convergence rules → Upgrade typography + spacing + animation

---
---

# Reference: Aesthetics

Typography, color, spatial composition, and anti-convergence guidance.

---

## Typography

Typography is the single highest-leverage design decision. The right font choice instantly signals quality.

### Font Recommendations by Aesthetic

**Premium SaaS / Dev Tools** (Linear, Vercel, Resend):
- Display: **Clash Display**, **Cabinet Grotesk**, **Satoshi**, **General Sans**
- Body: **Inter**, **IBM Plex Sans**, **Source Sans 3**
- Mono: **JetBrains Mono**, **Fira Code**, **IBM Plex Mono**

**Editorial / Magazine** (blogs, content sites):
- Display: **Playfair Display**, **Crimson Pro**, **Fraunces**, **Newsreader**
- Body: **Merriweather**, **Source Serif 4**, **Lora**

**Bold / Experimental** (awwwards-style):
- Display: **Bricolage Grotesque**, **Obviously**, **Space Grotesk** (only if paired unusually)
- Body: **Outfit**, **Sora**, **DM Sans**

**Startup / Friendly**:
- Display: **Cal Sans**, **Gilroy** (non-Google), **Plus Jakarta Sans**
- Body: **Nunito Sans**, **Rubik**, **Wix Madefor Text**

**Sixty App UI** (existing system):
- All text: **Inter** (the established app font — acceptable for app UI only)
- Landing pages: Use a distinctive display font from above

### BANNED Fonts (for landing pages / marketing)
- Inter (as display font)
- Roboto
- Arial
- Open Sans
- Lato
- System default fonts
- Space Grotesk (Claude's convergence default — avoid unless deliberately paired)

### Typography Rules

**Weight contrast**: Use extremes. `font-extralight` (200) vs `font-extrabold` (800), not `font-normal` (400) vs `font-semibold` (600).

**Size jumps**: 3x minimum between heading and body. `text-6xl` heading with `text-base` body, not `text-2xl` with `text-lg`.

**Tracking**: Tight on large text (`tracking-tight` or `tracking-tighter` on `text-3xl`+), normal or loose on small text.

**Line height**: Tight on headings (`leading-tight` or `leading-none`), relaxed on body (`leading-relaxed`).

**Utility classes**:
- `text-balance` on all headings (prevents orphaned last words)
- `text-pretty` on body paragraphs (better line breaks)
- `tabular-nums` on numbers and data
- `font-feature-settings: 'ss01'` for stylistic alternates when available

### Loading Fonts

Always load from Google Fonts with `display=swap`:

```html
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Clash+Display:wght@200;400;600;700&family=Inter:wght@400;500;600&display=swap" rel="stylesheet">
```

Tailwind config:
```js
fontFamily: {
  display: ['Clash Display', 'sans-serif'],
  sans: ['Inter', 'system-ui', 'sans-serif'],
  mono: ['JetBrains Mono', 'monospace'],
}
```

---

## Color Palettes

### The "Linear Dark" Palette (most requested)
```
Background:  zinc-950 (#09090b)
Surface:     white/5 with backdrop-blur
Border:      white/10
Text primary: white
Text secondary: zinc-400
Accent 1:    violet-500 (#8b5cf6)
Accent 2:    cyan-400 (#22d3ee)
CTA:         white bg, black text
```

### The "Vercel Mono" Palette
```
Background:  black (#000000)
Surface:     zinc-900/80
Border:      zinc-800
Text primary: white
Text secondary: zinc-400
Accent:      white (yes, white as accent on black)
CTA:         white bg, black text / gradient border
```

### The "Stripe Warm" Palette
```
Background:  slate-950 (#020617)
Surface:     slate-900/60
Border:      slate-700/30
Text primary: white
Text secondary: slate-300
Accent 1:    indigo-400 (#818cf8)
Accent 2:    emerald-400 (#34d399)
Accent 3:    amber-400 (#fbbf24)
CTA:         indigo-500 bg, white text
```

### The "Sixty Product" Palette (for app UI)
```
Light:
  Background:  white (#FFFFFF)
  Surface:     white + shadow-sm
  Border:      gray-200
  Text primary: gray-900
  Text secondary: gray-700
  Accent:      blue-600

Dark:
  Background:  gray-950 (#030712)
  Surface:     gray-900/80 + backdrop-blur-sm
  Border:      gray-700/50
  Text primary: gray-100
  Text secondary: gray-300
  Accent:      blue-500
```

### Color Rules

1. **One dominant, one accent** — not 5 equally-weighted colors
2. **Dark mode gradients**: use radial gradients with accent color at 10-20% opacity for atmosphere
3. **Never** evenly distribute colors — one should dominate 80%+
4. **Semantic colors** stay consistent: emerald=success, red=error, amber=warning
5. **Glass borders**: `border-white/10` in dark mode, never solid gray borders on glass surfaces

---

## Spatial Composition

### Break the Grid

Generic AI output creates perfectly symmetrical layouts. Premium design breaks this:

**Asymmetric hero**: Title left-aligned at 60% width, image/graphic right at 40%, overlapping
```tsx
<div className="grid grid-cols-1 lg:grid-cols-5 gap-0 items-center">
  <div className="lg:col-span-3 pr-0 lg:pr-12">{/* Title + CTA */}</div>
  <div className="lg:col-span-2 lg:-ml-12">{/* Visual, overlapping */}</div>
</div>
```

**Bento grid** (varied card sizes):
```tsx
<div className="grid grid-cols-1 md:grid-cols-3 gap-4">
  <div className="md:col-span-2 md:row-span-2">{/* Large feature */}</div>
  <div>{/* Small feature */}</div>
  <div>{/* Small feature */}</div>
  <div className="md:col-span-3">{/* Full-width feature */}</div>
</div>
```

**Offset sections**: Alternate padding sides
```tsx
<section className="pl-8 pr-4 md:pl-24 md:pr-12">{/* Left-heavy */}</section>
<section className="pl-4 pr-8 md:pl-12 md:pr-24">{/* Right-heavy */}</section>
```

### Negative Space

- Hero sections: generous vertical padding (`py-24 md:py-32 lg:py-40`)
- Between sections: `py-16 md:py-24` minimum
- Max width for text: `max-w-2xl` for readability (never full-width body text)
- Let content breathe — white space is not wasted space

### Depth & Layering

Create visual depth without 3D:

1. **Background layer**: Radial glow, grid pattern, noise texture
2. **Content layer**: Cards, text, images
3. **Accent layer**: Floating badges, gradient borders, spotlight effects
4. **Foreground layer**: Cursor effects, tooltip overlays (Tier 3 only)

```tsx
<section className="relative overflow-hidden">
  {/* Background: radial glow */}
  <div className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-1/3
    w-[800px] h-[600px] rounded-full
    bg-[radial-gradient(ellipse,rgba(139,92,246,0.15),transparent_70%)]
    blur-3xl pointer-events-none" />

  {/* Background: grid pattern */}
  <div className="absolute inset-0
    bg-[linear-gradient(rgba(255,255,255,0.03)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.03)_1px,transparent_1px)]
    bg-[size:64px_64px]" />

  {/* Content */}
  <div className="relative z-10 max-w-6xl mx-auto px-4">
    {children}
  </div>
</section>
```

### Gradient Text

The signature move of premium dark SaaS sites:

```tsx
// Top-to-bottom fade (most common — Linear/Vercel style)
<h1 className="text-5xl md:text-7xl font-bold tracking-tight
  bg-clip-text text-transparent
  bg-gradient-to-b from-white via-white to-zinc-500">
  Build something amazing
</h1>

// Left-to-right accent gradient
<span className="bg-clip-text text-transparent
  bg-gradient-to-r from-violet-400 to-cyan-400">
  highlighted text
</span>
```

---

## Atmosphere Effects

### Noise Texture Overlay (adds tactile quality)
```tsx
<div className="relative">
  {children}
  <div className="absolute inset-0 pointer-events-none opacity-[0.03]
    [background-image:url('data:image/svg+xml,...')]
    mix-blend-mode-overlay" />
</div>
```

### Dot Grid Background
```tsx
<div className="absolute inset-0
  bg-[radial-gradient(circle,rgba(255,255,255,0.06)_1px,transparent_1px)]
  bg-[size:24px_24px]" />
```

### Radial Glow (hero atmosphere)
```tsx
<div className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-1/2
  h-[600px] w-[600px] rounded-full opacity-20
  bg-[radial-gradient(ellipse,rgba(124,58,237,0.5),transparent_70%)]
  blur-3xl pointer-events-none" />
```

### Animated Gradient Border
```tsx
<div className="relative rounded-xl p-px
  bg-gradient-to-r from-violet-500 via-cyan-500 to-violet-500
  bg-[length:200%_auto] animate-gradient">
  <div className="rounded-[11px] bg-zinc-950 p-6">{children}</div>
</div>
```

---
---

# Reference: Animation Tiers

Three progressive tiers of animation complexity. Auto-select based on context, or let the user choose.

---

## Tier 1: Micro-Interactions (App UI Default)

**Dependencies**: Tailwind CSS only (zero extra JS)
**Bundle impact**: 0KB
**Use when**: Building app components, dashboards, settings pages, data views

### Hover States
```tsx
// Card lift
"transition-all duration-200 hover:shadow-md hover:-translate-y-0.5"

// Card with border highlight
"transition-all duration-200 hover:border-blue-500/30 dark:hover:border-blue-400/30"

// Button press
"transition-transform duration-150 active:scale-[0.98]"

// Ghost button
"transition-colors duration-150 hover:bg-gray-100 dark:hover:bg-gray-800/50"

// Icon button
"transition-all duration-150 hover:bg-gray-100 dark:hover:bg-white/10 hover:text-gray-900 dark:hover:text-white"

// Row hover
"transition-colors duration-100 hover:bg-gray-50 dark:hover:bg-gray-800/30"
```

### Loading States
```tsx
// Skeleton pulse
<div className="h-4 w-3/4 rounded bg-gray-200 dark:bg-gray-800 animate-pulse" />

// Shimmer skeleton (premium feel)
<div className="relative overflow-hidden rounded-lg bg-gray-200 dark:bg-white/5">
  <div className="absolute inset-0 -translate-x-full animate-[shimmer_2s_infinite]
    bg-gradient-to-r from-transparent via-white/20 dark:via-white/5 to-transparent" />
</div>
```

### Focus States
```tsx
// Standard focus ring
"focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-gray-900"
```

### Reduced Motion
```tsx
"motion-reduce:transition-none motion-reduce:animate-none"
```

---

## Tier 2: Scroll Reveals + Transitions (Standard Landing)

**Dependencies**: `motion/react` (Framer Motion)
**Bundle impact**: ~4.6KB with LazyMotion, ~32KB full
**Use when**: Landing page sections, feature showcases, about pages

### Fade Up on Scroll (the #1 most impactful animation)
```tsx
import { motion } from "motion/react";

<motion.div
  initial={{ opacity: 0, y: 30 }}
  whileInView={{ opacity: 1, y: 0 }}
  viewport={{ once: true, margin: "-80px" }}
  transition={{ duration: 0.6, ease: "easeOut" }}
>
  {children}
</motion.div>
```

### Staggered Children Reveal
```tsx
const container = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.1 } },
};

const item = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.5, ease: "easeOut" } },
};

<motion.div
  variants={container}
  initial="hidden"
  whileInView="visible"
  viewport={{ once: true }}
  className="grid grid-cols-1 md:grid-cols-3 gap-6"
>
  {features.map((f) => (
    <motion.div key={f.id} variants={item}>
      <FeatureCard {...f} />
    </motion.div>
  ))}
</motion.div>
```

### Sequenced Hero Entrance
```tsx
<div className="text-center">
  <motion.div
    initial={{ opacity: 0, y: -10 }}
    animate={{ opacity: 1, y: 0 }}
    transition={{ duration: 0.5 }}
    className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full
      border border-white/10 bg-white/5 text-sm text-zinc-400 mb-6"
  >
    <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
    New in v2.0
  </motion.div>

  <motion.h1
    initial={{ opacity: 0, y: 20 }}
    animate={{ opacity: 1, y: 0 }}
    transition={{ duration: 0.6, delay: 0.1 }}
    className="text-5xl md:text-7xl font-bold tracking-tight ..."
  >
    Heading
  </motion.h1>

  <motion.p
    initial={{ opacity: 0, y: 20 }}
    animate={{ opacity: 1, y: 0 }}
    transition={{ duration: 0.5, delay: 0.2 }}
    className="mt-6 text-lg text-zinc-400 max-w-2xl mx-auto"
  >
    Subtitle
  </motion.p>
</div>
```

### Hover Interactions (Motion)
```tsx
// Button with spring
<motion.button
  whileHover={{ scale: 1.03 }}
  whileTap={{ scale: 0.97 }}
  transition={{ type: "spring", stiffness: 400, damping: 17 }}
  className="px-8 py-3 rounded-full bg-white text-black font-medium"
>
  Get Started
</motion.button>

// Card with subtle lift
<motion.div
  whileHover={{ y: -4 }}
  transition={{ type: "spring", stiffness: 300, damping: 20 }}
  className="rounded-2xl border border-white/10 bg-white/5 p-8"
>
  {children}
</motion.div>
```

---

## Tier 3: Cinematic (Premium Landing / Marketing)

**Dependencies**: `motion/react` + optional `gsap` for complex timelines
**Bundle impact**: ~32KB Motion + ~23KB GSAP (if used)
**Use when**: Hero sections, product launches, marketing showcases, awwwards-quality builds

### Scroll-Linked Parallax
```tsx
import { motion, useScroll, useTransform } from "motion/react";

function ParallaxHero() {
  const ref = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ["start start", "end start"],
  });

  const y = useTransform(scrollYProgress, [0, 1], [0, -200]);
  const opacity = useTransform(scrollYProgress, [0, 0.5], [1, 0]);
  const scale = useTransform(scrollYProgress, [0, 1], [1, 0.9]);

  return (
    <section ref={ref} className="relative h-screen overflow-hidden">
      <motion.div style={{ y, opacity, scale }} className="absolute inset-0 flex items-center justify-center">
        <h1 className="text-7xl font-bold">Hero Content</h1>
      </motion.div>
    </section>
  );
}
```

### Aurora Background
```tsx
function AuroraBackground({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative overflow-hidden bg-zinc-950">
      <div className="absolute inset-0
        [background:radial-gradient(ellipse_80%_50%_at_50%_-20%,rgba(120,119,198,0.3),transparent)]" />
      <div className="absolute inset-0 animate-aurora opacity-50
        [background-image:repeating-linear-gradient(100deg,#7b7bf6_10%,#a855f7_15%,#2dd4bf_20%,#7b7bf6_25%)]
        [background-size:200%] blur-[100px]" />
      <div className="relative z-10">{children}</div>
    </div>
  );
}
```

### 3D Card on Mouse Move
```tsx
function ThreeDCard({ children }: { children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);

  const handleMouseMove = (e: React.MouseEvent) => {
    const el = ref.current!;
    const rect = el.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width - 0.5;
    const y = (e.clientY - rect.top) / rect.height - 0.5;
    el.style.transform = `perspective(1000px) rotateY(${x * 15}deg) rotateX(${-y * 15}deg)`;
  };

  const handleMouseLeave = () => {
    ref.current!.style.transform = "perspective(1000px) rotateY(0deg) rotateX(0deg)";
  };

  return (
    <div
      ref={ref}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      className="transition-transform duration-200 ease-out [transform-style:preserve-3d]"
    >
      {children}
    </div>
  );
}
```

### Infinite Marquee
```tsx
function Marquee({ children, speed = 30 }: { children: React.ReactNode; speed?: number }) {
  return (
    <div className="flex overflow-hidden [mask-image:linear-gradient(to_right,transparent,white_20%,white_80%,transparent)]">
      {[0, 1].map((copy) => (
        <div
          key={copy}
          className="flex shrink-0 animate-marquee items-center gap-12 pr-12"
          style={{ animationDuration: `${speed}s` }}
          aria-hidden={copy === 1}
        >
          {children}
        </div>
      ))}
    </div>
  );
}
```

---

## Animation Timing Reference

| Context | Duration | Easing |
|---------|----------|--------|
| Hover feedback | 150ms | `ease-out` |
| Button press | 100ms | `ease-in` |
| Tooltip appear | 150ms | `ease-out` |
| Dropdown open | 200ms | `ease-out` |
| Modal entrance | 300ms | `[0.16, 1, 0.3, 1]` (custom spring) |
| Page transition | 400ms | `ease-in-out` |
| Scroll reveal | 500-700ms | `ease-out` |
| Hero sequence | 500-800ms per element | `power3.out` |
| Stagger delay | 80-120ms between items | — |

### Spring Presets

```tsx
// Snappy (buttons, toggles)
{ type: "spring", stiffness: 400, damping: 17 }

// Smooth (cards, panels)
{ type: "spring", stiffness: 300, damping: 25 }

// Bouncy (fun, playful)
{ type: "spring", stiffness: 260, damping: 12 }

// Gentle (large surfaces)
{ type: "spring", stiffness: 200, damping: 30 }
```

---

## Performance Rules

1. **Only animate `transform` and `opacity`** — these are compositor-only and run at 60fps
2. **Never animate**: `width`, `height`, `top`, `left`, `margin`, `padding`, `border-width`
3. **Use `layout` prop** for layout changes — Framer Motion uses FLIP internally
4. **`viewport={{ once: true }}`** — prevent scroll animations from re-triggering
5. **Pause off-screen**: looping animations should use IntersectionObserver to pause
6. **Blur limits**: max `blur(24px)`, max 2-3 overlapping glass layers
7. **`will-change: transform`** only when actively animating, remove after
8. **LazyMotion**: use `<LazyMotion features={domAnimation}>` + `<m.div>` to cut bundle to 4.6KB

---
---

# Reference: Section Library

Production-ready landing page sections. All sections assume: dark mode (`bg-zinc-950` or `bg-black`), Framer Motion available, Tailwind CSS, Lucide React icons.

---

## 1. Hero — Centered (Linear/Vercel Style)

```tsx
import { motion } from "motion/react";

interface HeroProps {
  badge?: string;
  title: string;
  subtitle: string;
  ctaPrimary: { label: string; href: string };
  ctaSecondary?: { label: string; href: string };
}

function HeroCentered({ badge, title, subtitle, ctaPrimary, ctaSecondary }: HeroProps) {
  return (
    <section className="relative min-h-screen flex flex-col items-center justify-center text-center px-4 overflow-hidden">
      {/* Radial glow */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-1/3
        w-[800px] h-[600px] rounded-full
        bg-[radial-gradient(ellipse,rgba(139,92,246,0.15),transparent_70%)]
        blur-3xl pointer-events-none" />

      {/* Grid pattern */}
      <div className="absolute inset-0
        bg-[linear-gradient(rgba(255,255,255,0.03)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.03)_1px,transparent_1px)]
        bg-[size:64px_64px]
        [mask-image:radial-gradient(ellipse_50%_50%_at_50%_50%,black_40%,transparent_100%)]" />

      <div className="relative z-10 max-w-4xl mx-auto">
        {badge && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full
              border border-white/10 bg-white/5 text-sm text-zinc-400 mb-8"
          >
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
            {badge}
          </motion.div>
        )}

        <motion.h1
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.1 }}
          className="text-5xl md:text-7xl font-bold tracking-tight text-balance
            bg-clip-text text-transparent
            bg-gradient-to-b from-white via-white to-zinc-500"
        >
          {title}
        </motion.h1>

        <motion.p
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.2 }}
          className="mt-6 text-lg md:text-xl text-zinc-400 max-w-2xl mx-auto text-pretty"
        >
          {subtitle}
        </motion.p>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.3 }}
          className="mt-10 flex flex-col sm:flex-row gap-4 justify-center"
        >
          <a href={ctaPrimary.href}
            className="px-8 py-3 rounded-full bg-white text-black font-medium
              hover:bg-zinc-200 transition-colors">
            {ctaPrimary.label}
          </a>
          {ctaSecondary && (
            <a href={ctaSecondary.href}
              className="px-8 py-3 rounded-full border border-white/20 text-white
                hover:bg-white/5 transition-colors">
              {ctaSecondary.label}
            </a>
          )}
        </motion.div>
      </div>
    </section>
  );
}
```

## 2. Social Proof — Logo Marquee

## 3. Feature Showcase — Bento Grid

## 4. How It Works — 3-Step Process

## 5. Testimonials — Card Grid

## 6. Pricing — 3-Tier Table

## 7. FAQ — Animated Accordion

## 8. CTA — Final Conversion

*(Full code for sections 2-8 available in the codebase at `.claude/skills/frontend-design/references/section-library.md`)*

---
---

# Reference: Craft Rules

Production polish checklist synthesized from ibelick/ui-skills, v0 system prompt, and Lovable agent patterns.

## Code Completeness
- Write COMPLETE code that can be copied and pasted directly
- Never write partial snippets with `// ... rest of component`
- Never include `TODO` or `FIXME` comments
- Include all imports at the top of each file
- Export components with proper TypeScript interfaces

## Stack Rules
- **Styling**: Tailwind CSS utilities only, `cn()` for conditional classes
- **Components**: Radix UI primitives (via shadcn/ui) for interactive components
- **Animation**: `motion/react` for JS-driven animation, CSS transitions for simple states
- **Icons**: Lucide React only — never emoji, never inline SVG

## Anti-Slop Enforcement
- NEVER use gradients unless the design direction explicitly calls for them
- NEVER use purple or multicolor gradients as default decoration
- Limit accent color to ONE per view
- NEVER center-align body text
- NEVER use rounded-full on cards

## Responsive Rules
- Design mobile-first (base → `sm:` → `md:` → `lg:` → `xl:`)
- Test at: 375px, 768px, 1024px, 1280px
- `max-w-2xl` for body text, `max-w-6xl` or `max-w-7xl` for page containers

## Accessibility (Non-Negotiable)
- Semantic HTML (`<section>`, `<nav>`, `<header>`, `<main>`, `<footer>`)
- `alt` text on all images
- Keyboard reachable interactive elements
- Visible focus indicators (`focus-visible:ring-2`)
- `sr-only` for screen reader text on icon-only actions

## Performance
- Only animate `transform` and `opacity`
- Max `backdrop-blur-xl` (24px), max 2-3 overlapping glass layers
- `LazyMotion` + `m` components to reduce Motion bundle
- Lazy load below-fold sections

## Pre-Delivery Checklist
- [ ] All imports present and correct
- [ ] No `any` types
- [ ] `text-balance` on headings, `text-pretty` on body
- [ ] Responsive at all breakpoints
- [ ] Dark mode variants on all elements
- [ ] `viewport={{ once: true }}` on scroll animations
- [ ] `motion-reduce:transition-none` on animated elements
- [ ] `cn()` for conditional classes
- [ ] Lucide React icons only

---
---

# Reference: Sixty Design Tokens

Design tokens for the Sixty product (app.use60.com). Use these when building app UI (not landing pages).

## Color Tokens

### Backgrounds

| Context | Light | Dark | Tailwind |
|---------|-------|------|----------|
| Page | `#FFFFFF` | `#030712` (gray-950) | `bg-white dark:bg-gray-950` |
| Card | `white` + shadow-sm | `gray-900/80` + blur | `bg-white dark:bg-gray-900/80 dark:backdrop-blur-sm` |
| Secondary | `#FCFCFC` | `gray-900` | `bg-[#FCFCFC] dark:bg-gray-900` |
| Tertiary | `gray-50` | `gray-800` | `bg-gray-50 dark:bg-gray-800` |
| Input | `white` | `gray-800/50` | `bg-white dark:bg-gray-800/50` |
| Hover | `gray-50` | `gray-800/30` | `hover:bg-gray-50 dark:hover:bg-gray-800/30` |

### Text

| Context | Light | Dark | Tailwind |
|---------|-------|------|----------|
| Primary | `gray-900` | `gray-100` | `text-gray-900 dark:text-gray-100` |
| Secondary | `gray-700` | `gray-300` | `text-gray-700 dark:text-gray-300` |
| Tertiary | `gray-500` | `gray-400` | `text-gray-500 dark:text-gray-400` |
| Muted | `gray-400` | `gray-500` | `text-gray-400 dark:text-gray-500` |

### Borders

| Context | Light | Dark | Tailwind |
|---------|-------|------|----------|
| Standard | `gray-200` | `gray-700/50` | `border-gray-200 dark:border-gray-700/50` |
| Subtle | `gray-100` | `gray-800/50` | `border-gray-100 dark:border-gray-800/50` |
| Emphasis | `gray-300` | `gray-600/50` | `border-gray-300 dark:border-gray-600/50` |

### Semantic Colors

| Color | Use | Light bg | Light text | Dark bg | Dark text |
|-------|-----|----------|-----------|---------|-----------|
| Blue | Primary/Action | `blue-50` | `blue-700` | `blue-500/10` | `blue-400` |
| Emerald | Success | `emerald-50` | `emerald-700` | `emerald-500/10` | `emerald-400` |
| Red | Error/Danger | `red-50` | `red-700` | `red-500/10` | `red-400` |
| Amber | Warning | `amber-50` | `amber-700` | `amber-500/10` | `amber-400` |
| Violet | Brand accent | `violet-50` | `violet-700` | `violet-500/10` | `violet-400` |

### Brand Colors
```
brand-violet: #8129D7
brand-blue:   #2A5EDB
brand-teal:   #03AD9C
```

## Component Patterns

### Card
```tsx
<div className="bg-white dark:bg-gray-900/80 dark:backdrop-blur-sm
  border border-gray-200 dark:border-gray-700/50
  rounded-xl p-6 shadow-sm dark:shadow-none">
  {children}
</div>
```

### Button Variants
```tsx
// Primary
"bg-blue-600 hover:bg-blue-700 text-white rounded-lg px-4 py-2.5 font-medium transition-colors"

// Secondary
"bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700
  text-gray-900 dark:text-gray-100 rounded-lg px-4 py-2.5 font-medium transition-colors"

// Ghost
"bg-transparent hover:bg-gray-100 dark:hover:bg-gray-800/50
  text-gray-700 dark:text-gray-300 rounded-lg px-4 py-2.5 transition-colors"
```

### Input
```tsx
"w-full bg-white dark:bg-gray-800/50
  border border-gray-300 dark:border-gray-700/50
  text-gray-900 dark:text-gray-100
  placeholder-gray-400 dark:placeholder-gray-500
  rounded-lg px-4 py-2.5
  focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
```

## Glassmorphism Rules

**DO:**
- `backdrop-blur-sm` (4px) for standard cards, `backdrop-blur-xl` (24px) for premium
- Combine blur with semi-transparent backgrounds: `bg-gray-900/80`
- Add inset highlight: `inset 0 1px 0 rgba(255,255,255,0.05)`
- Include `-webkit-backdrop-filter` for Safari
- `shadow-none` in dark mode

**DON'T:**
- Blur without semi-transparent backgrounds
- Stack more than 2-3 glass layers
- Heavy shadows with glass effects
- Glassmorphism in light mode
- Exceed `blur(24px)`

## Spacing

| Context | Value | Tailwind |
|---------|-------|----------|
| Card padding | 24px | `p-6` |
| Button padding | 16px x 10px | `px-4 py-2.5` |
| Gap (tight) | 8px | `gap-2` |
| Gap (default) | 16px | `gap-4` |
| Gap (loose) | 24px | `gap-6` |

## Sheets & Panels (Critical)

The app has a fixed top bar (`h-16` / 4rem). All `<SheetContent>` and side panels MUST include:
```tsx
className="!top-16 !h-[calc(100vh-4rem)]"
```

## Icons
- ALWAYS use `lucide-react`
- NEVER use emoji icons
- NEVER use the `Sparkles` icon — use `Wand2`, `Stars`, or `Zap` instead
- Standard icon size: `w-5 h-5` inline, `w-4 h-4` small, `w-6 h-6` headers
