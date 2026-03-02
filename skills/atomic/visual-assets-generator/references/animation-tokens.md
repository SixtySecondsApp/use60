# Animation Tokens Reference

The exact numbers that make animations feel premium. Never guess — use these tokens.

---

## Spring Presets

### Motion (Framer Motion) — stiffness / damping / mass

| Name | Stiffness | Damping | Mass | Feel | Use For |
|------|-----------|---------|------|------|---------|
| `spring-stiff` | 400 | 35 | 0.5 | Near-instant, minimal overshoot | Micro-interactions, toggles |
| `spring-snappy` | 500 | 30 | 0.5 | Instant feedback | Button press, chip select |
| `spring-responsive` | 300 | 30 | 0.8 | Crisp, controlled | UI controls, tab indicators |
| `spring-smooth` | 200 | 25 | 1 | Gentle deceleration | Cards, panels, modals |
| `spring-gentle` | 100 | 20 | 1 | Soft, no bounce | Page transitions, large surfaces |
| `spring-bouncy` | 200 | 10 | 1 | Playful overshoot | Fun elements, celebrations |
| `spring-heavy` | 50 | 14 | 1.5 | Slow, luxurious | Dramatic reveals, premium feel |

### Code

```tsx
// Import these as reusable constants
export const springs = {
  stiff:      { type: "spring" as const, stiffness: 400, damping: 35, mass: 0.5 },
  snappy:     { type: "spring" as const, stiffness: 500, damping: 30, mass: 0.5 },
  responsive: { type: "spring" as const, stiffness: 300, damping: 30, mass: 0.8 },
  smooth:     { type: "spring" as const, stiffness: 200, damping: 25, mass: 1 },
  gentle:     { type: "spring" as const, stiffness: 100, damping: 20, mass: 1 },
  bouncy:     { type: "spring" as const, stiffness: 200, damping: 10, mass: 1 },
  heavy:      { type: "spring" as const, stiffness: 50,  damping: 14, mass: 1.5 },
};
```

---

## Easing Curves

### Premium Easing Library

| Name | cubic-bezier | Character | Use For |
|------|-------------|-----------|---------|
| `ease-default` | `[0.22, 1, 0.36, 1]` | Fast attack, long settle (easeOutQuint) | **The workhorse** — cards, reveals, most animations |
| `ease-emphasized` | `[0.16, 1, 0.3, 1]` | Dramatic snap (easeOutExpo) | Modal reveals, hero entrances, page transitions |
| `ease-decelerate` | `[0.0, 0, 0, 1]` | Pure deceleration | Elements entering screen |
| `ease-accelerate` | `[0.3, 0, 0.8, 0.15]` | Accelerating exit | Elements leaving screen |
| `ease-standard` | `[0.2, 0, 0, 1]` | Balanced repositioning | On-screen movement, repositioning |
| `ease-gentle` | `[0.37, 0, 0.63, 1]` | Symmetric sine | Looping, breathing, pulsing |
| `ease-bounce` | `[0.34, 1.56, 0.64, 1]` | Playful overshoot | Fun, attention-grabbing |

### Code

```tsx
export const easings = {
  default:    [0.22, 1, 0.36, 1],       // easeOutQuint — the "modern SaaS" feel
  emphasized: [0.16, 1, 0.3, 1],        // easeOutExpo — dramatic entrances
  decelerate: [0.0, 0, 0, 1],           // MD3 standard decelerate
  accelerate: [0.3, 0, 0.8, 0.15],      // MD3 emphasized accelerate
  standard:   [0.2, 0, 0, 1],           // MD3 standard
  gentle:     [0.37, 0, 0.63, 1],       // easeInOutSine
  bounce:     [0.34, 1.56, 0.64, 1],    // playful overshoot
};
```

### CSS Custom Properties

```css
:root {
  --ease-default: cubic-bezier(0.22, 1, 0.36, 1);
  --ease-emphasized: cubic-bezier(0.16, 1, 0.3, 1);
  --ease-decelerate: cubic-bezier(0.0, 0, 0, 1);
  --ease-accelerate: cubic-bezier(0.3, 0, 0.8, 0.15);
  --ease-standard: cubic-bezier(0.2, 0, 0, 1);
  --ease-gentle: cubic-bezier(0.37, 0, 0.63, 1);
  --ease-bounce: cubic-bezier(0.34, 1.56, 0.64, 1);
}
```

### Brand Signatures

| Brand | Curve | Notes |
|-------|-------|-------|
| Linear / Vercel / Raycast | `[0.22, 1, 0.36, 1]` | easeOutQuint — the "premium SaaS" standard |
| Apple (CSS fallback) | `[0.25, 0.1, 0.25, 1.0]` | Close to CSS `ease`; Apple prefers springs |
| Material Design 3 | `[0.2, 0, 0, 1]` | Standard on-screen transitions |

---

## Duration Scale

| Token | Value | Use For |
|-------|-------|---------|
| `duration-instant` | 0ms | State changes with no transition |
| `duration-fast` | 100ms | Micro: hover color, focus ring |
| `duration-normal` | 150ms | Hover feedback, tooltip appear |
| `duration-moderate` | 200ms | Button press, toggle, dropdown |
| `duration-medium` | 300ms | Cards, panels, accordion |
| `duration-slow` | 400ms | Modal open, page transition |
| `duration-slower` | 600ms | Scroll reveal, dramatic entrance |
| `duration-slowest` | 1000ms | Full hero sequence, cinematic |

### Code

```tsx
export const durations = {
  instant:  0,
  fast:     0.1,
  normal:   0.15,
  moderate: 0.2,
  medium:   0.3,
  slow:     0.4,
  slower:   0.6,
  slowest:  1.0,
};
```

### Rules

- **Micro-interactions (hover, focus)**: 100-150ms. Over 200ms feels laggy.
- **Small transitions (buttons, chips)**: 150-200ms.
- **Medium transitions (cards, modals)**: 200-400ms.
- **Page transitions**: 300-500ms. Over 500ms feels slow.
- **Scroll reveals**: 400-800ms. User controls pace so longer is acceptable.
- **Loading shimmer cycle**: 1500-2500ms. Slow = calm, not frantic.

---

## Stagger Patterns

### By Density

| Pattern | Delay/Item | Max Total | Use For |
|---------|-----------|-----------|---------|
| `stagger-fast` | 30ms | 400ms | Dense lists, rapid reveals, 10+ items |
| `stagger-normal` | 50ms | 400ms | Standard lists, grids, 5-8 items |
| `stagger-slow` | 80ms | 500ms | Feature sections, 3-5 items |
| `stagger-dramatic` | 120ms | 500ms | Hero pricing tiers, 2-4 items |

### Code

```tsx
export const staggers = {
  fast:     0.03,   // 30ms
  normal:   0.05,   // 50ms
  slow:     0.08,   // 80ms
  dramatic: 0.12,   // 120ms
};
```

### Grid Patterns

```tsx
// Row-by-row
delay: rowIndex * 0.06

// Diagonal cascade
delay: (rowIndex + colIndex) * 0.04

// Center-out radial
delay: Math.sqrt(Math.pow(row - centerRow, 2) + Math.pow(col - centerCol, 2)) * 0.05

// Random scatter (organic feel)
delay: Math.random() * 0.3
```

### Text Animations

| Type | Delay/Unit | Notes |
|------|-----------|-------|
| Word-by-word | 80-120ms | Headlines, hero text |
| Character-by-character | 20-40ms | Typewriter effect |
| Line-by-line | 100-150ms | Paragraphs |

### Critical Rule: Stagger Budgets

**Total reveal time should be 300-500ms regardless of item count.**

```tsx
// 4 items → 100ms stagger (400ms total)
// 8 items → 50ms stagger (400ms total)
// 20 items → 20ms stagger (400ms total)

const getStaggerDelay = (itemCount: number, budget = 0.4) =>
  Math.min(0.12, budget / itemCount);
```

---

## Compound Tokens (Ready-to-Use Transitions)

### Micro-Interactions

```tsx
export const transitions = {
  // Hover/focus feedback
  micro: { duration: 0.15, ease: [0.22, 1, 0.36, 1] },

  // Button press
  press: { type: "spring", stiffness: 400, damping: 17 } as const,

  // Card reveal on scroll
  reveal: { duration: 0.6, ease: [0.22, 1, 0.36, 1] },

  // Modal/sheet open
  modal: { duration: 0.3, ease: [0.16, 1, 0.3, 1] },

  // Page transition
  page: { duration: 0.4, ease: [0.16, 1, 0.3, 1] },

  // Tab indicator
  tab: { type: "spring", stiffness: 380, damping: 30 } as const,

  // Exit animation (always tween, never spring)
  exit: { duration: 0.2, ease: [0.3, 0, 0.8, 0.15] },

  // Dramatic hero entrance
  hero: { duration: 0.7, ease: [0.16, 1, 0.3, 1] },
};
```

### Entrance Presets

```tsx
export const entrances = {
  fadeUp: {
    initial: { opacity: 0, y: 24 },
    animate: { opacity: 1, y: 0 },
    transition: { duration: 0.6, ease: [0.22, 1, 0.36, 1] },
  },
  fadeDown: {
    initial: { opacity: 0, y: -12 },
    animate: { opacity: 1, y: 0 },
    transition: { duration: 0.5, ease: [0.22, 1, 0.36, 1] },
  },
  fadeIn: {
    initial: { opacity: 0 },
    animate: { opacity: 1 },
    transition: { duration: 0.4, ease: "easeOut" },
  },
  scaleUp: {
    initial: { opacity: 0, scale: 0.95 },
    animate: { opacity: 1, scale: 1 },
    transition: { duration: 0.3, ease: [0.16, 1, 0.3, 1] },
  },
  slideLeft: {
    initial: { opacity: 0, x: 40 },
    animate: { opacity: 1, x: 0 },
    transition: { duration: 0.5, ease: [0.22, 1, 0.36, 1] },
  },
  slideRight: {
    initial: { opacity: 0, x: -40 },
    animate: { opacity: 1, x: 0 },
    transition: { duration: 0.5, ease: [0.22, 1, 0.36, 1] },
  },
};
```

---

## Key Principles

1. **easeOutQuint `[0.22, 1, 0.36, 1]` is the premium SaaS standard.** Fast initial movement, long graceful deceleration. Linear, Vercel, Raycast all use it.

2. **Never use `ease-in` for entrances.** Things should decelerate into place, not accelerate. `ease-in` is only for exits.

3. **Never use CSS `linear` for UI transitions.** Nothing in the physical world moves at constant velocity.

4. **150ms is the magic micro-interaction duration.** Below 100ms is imperceptible. Above 250ms for hovers feels laggy.

5. **Springs > easing for interactive elements.** Springs naturally handle interruption and velocity transfer. CSS cubic-bezier is fine for triggered transitions.

6. **Never use spring for exit animations.** Springs can oscillate. Use tween with `ease-accelerate` for exits.

7. **Stagger budgets > per-item delay.** The total reveal should be 300-500ms regardless of item count.

8. **y: 20-30 is the sweet spot for fade-up distance.** Less than 12 is imperceptible. More than 40 looks jumpy.
