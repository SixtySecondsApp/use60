---
name: web-animations
description: |
  World-class web animation expert specializing in Motion (Framer Motion), Rive, CSS animations,
  and GSAP for React. Creates premium, performant animations that rival Framer, Linear, Vercel,
  and Apple. Use when building hero sections, scroll animations, page transitions, micro-interactions,
  interactive illustrations, or any visual motion work. Born from a video production company —
  every animation must be cinema-grade.
metadata:
  author: sixty-ai
  version: "1"
  category: frontend
  skill_type: atomic
  is_active: true
  command_centre:
    enabled: true
    label: "/animate"
    description: "Create world-class web animations"
    icon: "sparkles"
  agent_affinity:
    - frontend
    - design
    - landing
  triggers:
    - pattern: "animate"
      intent: "create_animation"
      confidence: 0.90
      examples:
        - "animate this section"
        - "add animation to"
        - "make this animated"
    - pattern: "framer motion"
      intent: "motion_animation"
      confidence: 0.95
      examples:
        - "use framer motion"
        - "framer motion animation"
        - "motion animation"
    - pattern: "rive"
      intent: "rive_animation"
      confidence: 0.95
      examples:
        - "add a rive animation"
        - "rive interactive"
        - "use rive for"
    - pattern: "scroll animation"
      intent: "scroll_animation"
      confidence: 0.90
      examples:
        - "scroll-linked animation"
        - "parallax scroll"
        - "animate on scroll"
    - pattern: "page transition"
      intent: "page_transition"
      confidence: 0.90
      examples:
        - "route transition"
        - "page animation"
        - "view transition"
    - pattern: "hero animation"
      intent: "hero_animation"
      confidence: 0.85
      examples:
        - "animate the hero"
        - "hero section animation"
        - "cinematic hero"
    - pattern: "micro-interaction"
      intent: "micro_interaction"
      confidence: 0.85
      examples:
        - "button animation"
        - "hover effect"
        - "interactive feedback"
    - pattern: "loading animation"
      intent: "loading_animation"
      confidence: 0.80
      examples:
        - "skeleton loader"
        - "loading state"
        - "shimmer effect"
  keywords:
    - "animation"
    - "motion"
    - "framer motion"
    - "rive"
    - "gsap"
    - "scroll"
    - "parallax"
    - "transition"
    - "hover"
    - "spring"
    - "easing"
    - "keyframe"
    - "stagger"
    - "cinematic"
    - "interactive"
  inputs:
    - name: animation_type
      type: string
      description: "Type of animation (hero, scroll, micro, page-transition, interactive, loading)"
      required: false
    - name: tier
      type: number
      description: "Animation tier 1-4 (1=CSS only, 2=Motion, 3=Cinematic, 4=Rive interactive)"
      required: false
    - name: target_element
      type: string
      description: "What element or section to animate"
      required: false
  outputs:
    - name: animation_code
      type: string
      description: "Complete, production-ready animation code"
    - name: performance_notes
      type: string
      description: "Performance considerations and optimization tips"
---

# Web Animations Skill

World-class animation engineering for React. Four progressive tiers from CSS micro-interactions to Rive interactive illustrations. Every animation must feel premium — fast, intentional, and physically grounded.

**Philosophy**: We're a video production company at heart. Our animations must be cinema-grade. No lazy fades. No generic bounces. Every motion tells a story and has purpose.

---

## TIER SYSTEM

Auto-select the right tier based on context. When in doubt, go one tier higher than expected — we're a video company.

| Tier | Name | Tools | Bundle | When |
|------|------|-------|--------|------|
| 1 | Micro-Interactions | Tailwind CSS | 0KB | App UI, buttons, hovers, toggles |
| 2 | Motion Choreography | `motion/react` | 4.6-32KB | Landing sections, reveals, layout |
| 3 | Cinematic | Motion + GSAP | 32-55KB | Hero sections, showcases, marketing |
| 4 | Interactive Illustration | Rive | +50-200KB per .riv | Complex state-driven visuals, characters |

### Tier Decision Tree

```
Is it app UI (dashboard, settings, data views)?
  → Tier 1 (CSS only)

Is it a landing page section (features, pricing, about)?
  → Tier 2 (Motion scroll reveals)

Is it a hero section, product showcase, or marketing splash?
  → Tier 3 (Cinematic)

Does it need complex illustration, character animation, or interactive state machines?
  → Tier 4 (Rive)

Combining tiers is encouraged:
  Tier 3 hero + Tier 4 Rive illustration = peak quality
  Tier 2 scroll reveals + Tier 1 micro-interactions = standard landing
```

---

## REFERENCE FILES

Read these before generating animation code:

| File | Contents |
|------|----------|
| `references/motion-api.md` | Motion (Framer Motion) complete API — hooks, components, patterns |
| `references/rive-guide.md` | Rive for React — setup, state machines, MCP, performance |
| `references/animation-tokens.md` | Springs, easing curves, durations, stagger patterns — the exact numbers |
| `references/cinematic-patterns.md` | Premium animation recipes — hero, scroll, text, parallax, 3D |
| `references/performance-rules.md` | GPU optimization, blur limits, bundle budgets, accessibility |

Also reference from `frontend-design` skill:
- `../frontend-design/references/animation-tiers.md` — Tier 1-3 code examples
- `../frontend-design/references/craft-rules.md` — Production polish checklist
- `../frontend-design/references/aesthetics.md` — Typography, color, atmosphere effects

---

## WORKFLOW

### Step 1: Classify the Animation Need

Determine:
1. **What's being animated?** (element, section, page, illustration)
2. **What triggers it?** (mount, scroll, hover, click, state change, time)
3. **What tier?** (auto-detect or user-specified)
4. **What feeling?** (snappy, smooth, bouncy, luxurious, dramatic)

### Step 2: Select the Right Tool

```
CSS transition/animation     → Simple state changes, hovers, loading
motion/react                 → Scroll reveals, layout, mount/unmount, gestures
GSAP + ScrollTrigger         → Complex timelines, scroll-scrubbing, SVG morph
Rive                         → Interactive illustrations, characters, complex state machines
CSS @keyframes               → Infinite loops (marquee, pulse, aurora, float)
Web Animations API           → Programmatic CSS-level animations
```

### Step 3: Apply the Animation Tokens

Always use the token system from `references/animation-tokens.md`. Never guess timing values.

```typescript
// WRONG — arbitrary values
transition={{ duration: 0.4, ease: "easeOut" }}

// RIGHT — token-based values
transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}  // duration-slower + ease-default
```

### Step 4: Performance Check

Before delivering, verify against `references/performance-rules.md`:
- [ ] Only animating `transform` and `opacity`
- [ ] `viewport={{ once: true }}` on scroll animations
- [ ] `motion-reduce:transition-none` on all animated elements
- [ ] Blur max 24px, max 2-3 glass layers
- [ ] Looping animations pause when off-screen
- [ ] LazyMotion used for Tier 2 (bundle optimization)

### Step 5: Polish

Apply the craft rules from `../frontend-design/references/craft-rules.md`:
- Semantic HTML
- Responsive at 375/768/1024/1280px
- Accessibility (aria, focus, reduced motion)
- Complete code — no TODOs, no partial snippets

---

## QUICK REFERENCE: MOST-USED PATTERNS

### The #1 Animation: Fade Up on Scroll

```tsx
import { motion } from "motion/react";

<motion.div
  initial={{ opacity: 0, y: 24 }}
  whileInView={{ opacity: 1, y: 0 }}
  viewport={{ once: true, margin: "-80px" }}
  transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
>
  {children}
</motion.div>
```

### The #2 Animation: Staggered Grid Reveal

```tsx
const container = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.06 } },
};
const item = {
  hidden: { opacity: 0, y: 20 },
  visible: {
    opacity: 1, y: 0,
    transition: { duration: 0.5, ease: [0.22, 1, 0.36, 1] }
  },
};

<motion.div variants={container} initial="hidden" whileInView="visible" viewport={{ once: true }}>
  {items.map((i) => <motion.div key={i.id} variants={item}>{/* ... */}</motion.div>)}
</motion.div>
```

### The #3 Animation: Spring Button

```tsx
<motion.button
  whileHover={{ scale: 1.03 }}
  whileTap={{ scale: 0.97 }}
  transition={{ type: "spring", stiffness: 400, damping: 17 }}
  className="motion-reduce:transform-none"
>
  Get Started
</motion.button>
```

### The #4 Animation: Sequenced Hero Entrance

```tsx
<div className="text-center">
  {[badge, heading, description, cta].map((el, i) => (
    <motion.div
      key={i}
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6, delay: i * 0.1, ease: [0.16, 1, 0.3, 1] }}
    >
      {el}
    </motion.div>
  ))}
</div>
```

### The #5 Animation: Shared Layout Tab Indicator

```tsx
{tabs.map((tab) => (
  <button key={tab.id} onClick={() => setActive(tab.id)} className="relative px-4 py-2">
    {tab.label}
    {active === tab.id && (
      <motion.div
        layoutId="active-tab"
        className="absolute inset-0 bg-white/10 rounded-lg"
        transition={{ type: "spring", stiffness: 380, damping: 30 }}
      />
    )}
  </button>
))}
```

---

## ANTI-PATTERNS (NEVER DO)

1. **Never animate layout properties** — `width`, `height`, `top`, `left`, `margin`, `padding` cause layout thrashing
2. **Never use `ease-in` for entrances** — things entering should decelerate (`ease-out`), not accelerate
3. **Never use CSS `linear` for UI** — nothing in the physical world moves at constant velocity
4. **Never exceed 200ms for hover feedback** — above this feels laggy
5. **Never stagger more than 600ms total** — the full reveal should complete quickly
6. **Never use `animate-bounce`** — Tailwind's default bounce looks cheap. Use springs.
7. **Never animate without `motion-reduce`** — accessibility is non-negotiable
8. **Never use `will-change` permanently** — only during active animation, remove after
9. **Never stack >3 blur layers** — kills performance on mid-range devices
10. **Never use spring for exit animations** — springs can oscillate; use tween for exits

---

## COMBINING TIERS

The best animations layer multiple tiers:

### Landing Page Formula
```
Hero Section:        Tier 3 (cinematic entrance) + Tier 4 (Rive interactive illustration)
Feature Sections:    Tier 2 (scroll reveals) + Tier 1 (hover micro-interactions)
Social Proof:        Tier 2 (marquee) + Tier 1 (hover cards)
CTA Section:         Tier 2 (entrance) + Tier 1 (button spring)
Footer:              Tier 1 only
```

### App Dashboard Formula
```
Page Load:           Tier 1 (skeleton shimmer)
Data Tables:         Tier 1 (row hover, sort transition)
Charts:              Tier 2 (animate on mount)
Modals/Sheets:       Tier 2 (AnimatePresence)
Notifications:       Tier 2 (slide in/out)
Everything else:     Tier 1 (CSS transitions)
```
