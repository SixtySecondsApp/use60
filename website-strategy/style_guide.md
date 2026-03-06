# 60 Website Style Guide

## Brand Identity

**Tagline:** "You sell. We do the rest."
**Voice:** Warm, human, confident. A smart friend who happens to be brilliant at sales ops.
**Personality:** Helpful but not corporate. Direct but not cold. Clever but not smug.

---

## Color System

### System-Aware Theme

The website respects `prefers-color-scheme` by default with a manual toggle. Both modes are first-class citizens.

### Core Palette

#### Dark Mode (Premium / Default for tech-savvy)

| Token | Hex | Usage |
|-------|-----|-------|
| `bg-primary` | `#0a0a0a` | Page background |
| `bg-secondary` | `#111111` | Cards, panels |
| `bg-tertiary` | `#1a1a1a` | Nested surfaces, code blocks |
| `bg-elevated` | `#222222` | Modals, dropdowns |
| `border-default` | `rgba(255,255,255,0.06)` | Subtle dividers |
| `border-hover` | `rgba(255,255,255,0.12)` | Interactive borders |
| `text-primary` | `#ededed` | Headlines, body |
| `text-secondary` | `#a0a0a0` | Descriptions, labels |
| `text-muted` | `#666666` | Timestamps, hints |

#### Light Mode (Accessible / Friendly)

| Token | Hex | Usage |
|-------|-----|-------|
| `bg-primary` | `#ffffff` | Page background |
| `bg-secondary` | `#f8fafc` | Cards, panels |
| `bg-tertiary` | `#f1f5f9` | Nested surfaces |
| `bg-elevated` | `#ffffff` | Modals (with shadow) |
| `border-default` | `rgba(0,0,0,0.08)` | Subtle dividers |
| `border-hover` | `rgba(0,0,0,0.15)` | Interactive borders |
| `text-primary` | `#0f172a` | Headlines, body |
| `text-secondary` | `#475569` | Descriptions, labels |
| `text-muted` | `#94a3b8` | Timestamps, hints |

### Accent Colors (Both Modes)

| Token | Dark Value | Light Value | Usage |
|-------|-----------|-------------|-------|
| `accent-indigo` | `#6366f1` | `#4f46e5` | Primary actions, links |
| `accent-violet` | `#8b5cf6` | `#7c3aed` | AI indicators, highlights |
| `accent-teal` | `#06b6d4` | `#0891b2` | Success states, data viz |
| `accent-gradient` | `indigo-500 → violet-500` | `indigo-600 → violet-600` | CTAs, hero elements |
| `success` | `#22c55e` | `#16a34a` | Positive states |
| `warning` | `#f59e0b` | `#d97706` | Caution states |
| `error` | `#f43f5e` | `#e11d48` | Error states |

### Surface Glow Effects (Dark Mode Only)

```css
/* Subtle glow behind interactive elements */
.surface-glow {
  box-shadow: 0 0 80px rgba(99, 102, 241, 0.08);
}

/* Accent glow on hover */
.surface-glow-hover:hover {
  box-shadow: 0 0 60px rgba(99, 102, 241, 0.12);
}

/* In light mode, use shadow instead */
@media (prefers-color-scheme: light) {
  .surface-glow {
    box-shadow: 0 4px 24px rgba(0, 0, 0, 0.06);
  }
}
```

---

## Typography

### Font Stack

```css
--font-sans: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
--font-mono: 'JetBrains Mono', 'Fira Code', 'Consolas', monospace;
```

### Scale

| Level | Size | Weight | Line Height | Letter Spacing | Usage |
|-------|------|--------|-------------|----------------|-------|
| Display | 72px / 4.5rem | 800 | 1.1 | -0.03em | Hero headline only |
| H1 | 48px / 3rem | 700 | 1.15 | -0.025em | Section headlines |
| H2 | 36px / 2.25rem | 700 | 1.2 | -0.02em | Sub-section headlines |
| H3 | 24px / 1.5rem | 600 | 1.3 | -0.015em | Card titles |
| H4 | 20px / 1.25rem | 600 | 1.4 | -0.01em | Feature labels |
| Body L | 18px / 1.125rem | 400 | 1.625 | 0 | Hero subhead, key paragraphs |
| Body | 16px / 1rem | 400 | 1.625 | 0 | Standard body text |
| Body S | 14px / 0.875rem | 400 | 1.5 | 0 | Captions, meta text |
| Label | 12px / 0.75rem | 500 | 1.4 | 0.04em | Tags, badges (uppercase) |

### Responsive Typography

```css
/* Hero headline scales */
.display {
  font-size: clamp(2rem, 5vw + 1rem, 4.5rem);
}

/* Section headlines scale */
.h1 {
  font-size: clamp(1.75rem, 3vw + 0.5rem, 3rem);
}
```

### Text Color Rules

- Headlines: `text-primary` always
- Body text: `text-secondary` for descriptions
- Interactive text (links, buttons): `accent-indigo`
- Gradient text (hero only): `bg-gradient-to-r from-white via-white to-accent-violet` (dark) / `from-slate-900 to-indigo-600` (light)

---

## Spacing System

Based on 4px grid. Use Tailwind spacing scale.

| Token | Value | Usage |
|-------|-------|-------|
| `space-1` | 4px | Tight inline gaps |
| `space-2` | 8px | Icon-to-text gaps |
| `space-3` | 12px | Small component padding |
| `space-4` | 16px | Standard padding |
| `space-6` | 24px | Card padding |
| `space-8` | 32px | Section inner padding |
| `space-12` | 48px | Between content blocks |
| `space-16` | 64px | Between sections (mobile) |
| `space-24` | 96px | Between sections (desktop) |
| `space-32` | 128px | Major section breaks |

### Container Widths

```css
--container-sm: 640px;   /* Signup forms, text content */
--container-md: 768px;   /* Feature panels */
--container-lg: 1024px;  /* Standard content */
--container-xl: 1280px;  /* Full-width sections */
--container-2xl: 1440px; /* Maximum content width */
```

---

## Component Patterns

### Buttons

#### Primary CTA
```css
.btn-primary {
  background: linear-gradient(135deg, var(--accent-indigo), var(--accent-violet));
  color: white;
  padding: 12px 24px;
  border-radius: 12px;
  font-weight: 600;
  font-size: 16px;
  transition: transform 200ms ease, box-shadow 200ms ease;
}
.btn-primary:hover {
  transform: translateY(-1px) scale(1.02);
  box-shadow: 0 8px 24px rgba(99, 102, 241, 0.3);
}
```

#### Secondary CTA
```css
.btn-secondary {
  background: transparent;
  border: 1px solid var(--border-hover);
  color: var(--text-primary);
  padding: 12px 24px;
  border-radius: 12px;
  font-weight: 500;
  backdrop-filter: blur(8px);
}
```

#### Ghost Button
```css
.btn-ghost {
  background: transparent;
  color: var(--accent-indigo);
  padding: 8px 16px;
  font-weight: 500;
}
```

### Cards

```css
.card {
  background: var(--bg-secondary);
  border: 1px solid var(--border-default);
  border-radius: 16px;
  padding: 24px;
  transition: border-color 200ms ease, box-shadow 200ms ease;
}
.card:hover {
  border-color: var(--border-hover);
}

/* Dark mode glow */
@media (prefers-color-scheme: dark) {
  .card:hover {
    box-shadow: 0 0 40px rgba(99, 102, 241, 0.06);
  }
}

/* Light mode shadow */
@media (prefers-color-scheme: light) {
  .card:hover {
    box-shadow: 0 4px 16px rgba(0, 0, 0, 0.08);
  }
}
```

### Input Fields

```css
.input {
  background: var(--bg-tertiary);
  border: 1px solid var(--border-default);
  border-radius: 12px;
  padding: 12px 16px;
  color: var(--text-primary);
  font-size: 16px;
  transition: border-color 200ms ease, box-shadow 200ms ease;
}
.input:focus {
  border-color: var(--accent-indigo);
  box-shadow: 0 0 0 3px rgba(99, 102, 241, 0.15);
  outline: none;
}
```

---

## Animation Specifications

### Easing Functions

```css
--ease-out-quint: cubic-bezier(0.22, 1, 0.36, 1);
--ease-out-expo: cubic-bezier(0.16, 1, 0.3, 1);
--ease-spring: cubic-bezier(0.34, 1.56, 0.64, 1);  /* For bouncy interactions */
--ease-smooth: cubic-bezier(0.4, 0, 0.2, 1);        /* Standard transitions */
```

### Duration Scale

| Category | Duration | Usage |
|----------|----------|-------|
| Micro | 100-150ms | Button states, toggles |
| Short | 200-300ms | Hovers, focus, tooltips |
| Medium | 400-600ms | Panel transitions, reveals |
| Long | 800-1200ms | Section entrances, morphs |
| Showcase | 2000-5000ms | Physics animations, hero |

### Physics-Based Animations (Framer Motion)

```typescript
// Spring configs for different purposes
const SPRING_SNAPPY = { type: 'spring', stiffness: 400, damping: 30 };
const SPRING_BOUNCY = { type: 'spring', stiffness: 300, damping: 20 };
const SPRING_SMOOTH = { type: 'spring', stiffness: 200, damping: 25 };
const SPRING_LAZY   = { type: 'spring', stiffness: 100, damping: 20 };
```

### Scroll-Triggered Reveals

```typescript
// Standard section entrance
const sectionVariants = {
  hidden: { opacity: 0, y: 30 },
  visible: {
    opacity: 1,
    y: 0,
    transition: {
      duration: 0.6,
      ease: [0.22, 1, 0.36, 1],
      staggerChildren: 0.1,
    },
  },
};
```

### Reduced Motion

```css
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    transition-duration: 0.01ms !important;
  }
}
```

All Framer Motion animations must check `useReducedMotion()` and provide instant alternatives.

---

## Product-UI Animation Standards

The website's visual content IS the product. Every animation renders real product UI components with Framer Motion spring physics — not abstract SVGs or particle systems.

### Design Language (matches the app)

```css
/* Surface tokens */
--surface-bg: #1e293b;       /* bg-gray-800 / slate-800 */
--surface-border: rgba(148, 163, 184, 0.2); /* border-gray-700/50 */
--surface-card: #0f172a;     /* bg-gray-900 / slate-900 */
--accent-violet: #6C5CE7;    /* Primary AI accent */
--accent-gradient: linear-gradient(135deg, #6366f1, #8b5cf6); /* Indigo → violet */
```

### Component Patterns

| Component | Source | Usage |
|-----------|--------|-------|
| Quick Add Modal | `QuickAdd.tsx` | Hero animation — shows AI cascade |
| Slack Block Cards | `SlackBlockKitRenderer.tsx` | Notification cascade section |
| Proposal Wizard | `ProposalScene.tsx` | Step-through generation demo |
| Agent Status Cards | App card patterns | Research agents working live |
| Autonomy Timeline | Product screenshots | Progressive trust story |

### Spring Physics (from the app)

```typescript
// Match the actual app's motion feel
const SPRING_QUICK_ADD = { type: 'spring', stiffness: 300, damping: 30, mass: 0.8 };
const SPRING_CARD_POP  = { type: 'spring', stiffness: 400, damping: 25 };
const SPRING_SLIDE_IN  = { type: 'spring', stiffness: 200, damping: 20 };
```

### Animation Rules
- Render React components with Framer Motion — not standalone SVGs
- Glassmorphism: `backdrop-blur-sm` on overlays, `bg-opacity-90` on surfaces
- Left accent bars on Slack-style cards: `border-left: 3px solid var(--accent-violet)`
- Color-coded category badges: violet (AI), teal (meetings), amber (tasks), green (complete)
- Monospace font (`JetBrains Mono`) for data readouts, stats, agent output
- Stagger children at 80-120ms intervals for cascade reveals
- Each animation section: max 15KB initial render, lazy-load below fold

### Micro-Interactions
- Checkmark morph: loading spinner → green check (600ms, `SPRING_CARD_POP`)
- Typing simulation: 30-50ms per character for AI-generated text
- Progress fill: smooth `width` transition with `ease-out-quint`
- Card entrance: `translateY(20px) → 0` with opacity fade, staggered

---

## Iconography

**Library:** Lucide React (consistent with the app)

### Icon Sizing

| Context | Size | Stroke Width |
|---------|------|-------------|
| Inline with text | 16px | 2px |
| Card headers | 20px | 1.75px |
| Feature showcase | 24px | 1.5px |
| Hero / Section icons | 32-40px | 1.5px |

### Icon Containers

```css
.icon-container {
  width: 40px;
  height: 40px;
  border-radius: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(99, 102, 241, 0.1);
}
```

---

## AI-Generated Imagery (Nano Banana 2)

### Usage Rules
- Maximum 2 images on the entire site
- Always as background/accent, never as primary content
- Opacity: 0.10-0.15 (dark mode), 0.06-0.10 (light mode)
- Generate both dark and light variants
- Format: WebP primary, AVIF where supported
- Max file size: 200KB per image after compression

### Style Direction
- Abstract, atmospheric, minimal
- Color palette: Indigo/violet/teal on dark backgrounds; warm neutrals on light
- No text, no faces, no recognisable objects
- Think: NASA deep space imagery meets data visualisation
- Soft gradients, subtle noise texture, depth-of-field effect

---

## Responsive Breakpoints

```css
--breakpoint-sm: 640px;   /* Mobile landscape */
--breakpoint-md: 768px;   /* Tablet portrait */
--breakpoint-lg: 1024px;  /* Tablet landscape / small desktop */
--breakpoint-xl: 1280px;  /* Desktop */
--breakpoint-2xl: 1440px; /* Large desktop */
```

### Mobile-Specific Rules
- Touch targets: minimum 44px
- No hover-dependent interactions (hover enhances, never gates)
- Simplified animations (fewer particles, shorter durations)
- Stack all multi-column layouts to single column below `md`
- Full-width cards below `lg`
- Swipe navigation for product showcase panels

---

## Accessibility

### Color Contrast
- Text on backgrounds: Minimum WCAG AA (4.5:1 for body, 3:1 for large text)
- Interactive elements: 3:1 minimum against adjacent colors
- Focus indicators: 2px solid accent-indigo, 2px offset

### Keyboard Navigation
- All interactive elements focusable
- Visible focus indicators (not just browser default)
- Skip-to-content link
- Arrow keys for showcase panel navigation
- Escape to close modals/overlays

### Screen Readers
- Semantic HTML: `<header>`, `<nav>`, `<main>`, `<section>`, `<footer>`
- ARIA labels on interactive SVG animations
- `aria-live` regions for dynamic content (research progress, counter animations)
- All images: meaningful `alt` text or `aria-hidden` for decorative

---

## File Naming & Organisation

```
packages/landing/
├── src/
│   ├── components/
│   │   ├── ui/              # Atomic UI components (Button, Input, Card)
│   │   ├── animations/      # SVG animation components
│   │   ├── sections/        # Page sections (Hero, Showcase, etc.)
│   │   └── tracking/        # Analytics/tracking components
│   ├── hooks/               # Custom hooks (useTheme, useTracking, etc.)
│   ├── lib/                 # Utilities, constants, types
│   ├── pages/               # Route-level components
│   ├── demo-v2/             # Existing demo flow (becomes Get Started)
│   └── trynow/              # Personalised campaign experience
├── public/
│   └── images/              # Optimised static images
└── styles/
    └── tokens.css           # CSS custom properties (design tokens)
```

---

*Style guide created: March 2026*
*Complements: `website_brief.md` (strategy) + `presentation.html` (visual pitch)*
