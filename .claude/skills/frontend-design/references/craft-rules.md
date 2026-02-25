# Craft Rules Reference

Production polish checklist synthesized from ibelick/ui-skills, v0 system prompt, and Lovable agent patterns. Apply after generating code.

---

## Code Completeness

**MUST**: Write COMPLETE code that can be copied and pasted directly. Never:
- Write partial snippets with `// ... rest of component`
- Include `TODO` or `FIXME` comments for the user to fill in
- Reference functions/components without defining them
- Leave placeholder data without making it obvious (use realistic example data)

**MUST**: Include all imports at the top of each file.

**MUST**: Export components with proper TypeScript interfaces.

---

## Stack Rules

### Styling
- **MUST** use Tailwind CSS utilities — no inline `style={{}}` except for truly dynamic values
- **MUST** use `cn()` utility (`clsx` + `tailwind-merge`) for conditional classes
- **NEVER** write custom CSS classes in component files — define in Tailwind config or global CSS
- **MUST** use Tailwind CSS variable-based colors (`bg-primary`, `text-primary-foreground`) when building within an existing design system
- **SHOULD** use HSL color system in `index.css` for theme consistency

### Components
- **MUST** use Radix UI primitives (via shadcn/ui) for interactive components (Dialog, Popover, Select, Accordion, etc.)
- **NEVER** mix primitive systems (don't use Radix Dialog with HeadlessUI Popover)
- **MUST** add `aria-label` to icon-only buttons
- **MUST** use Lucide React for all icons — never emoji, never inline SVG for standard icons

### Animation
- **MUST** use `motion/react` (formerly `framer-motion`) for JS-driven animation
- **SHOULD** prefer CSS transitions for simple hover/focus states
- **NEVER** add animation unless the context calls for it (app UI = minimal)
- **MUST** animate only compositor properties (`transform`, `opacity`)
- **NEVER** animate layout properties (`width`, `height`, `top`, `left`, `margin`, `padding`)
- **SHOULD** use `ease-out` on entrance, `ease-in` on exit
- **NEVER** exceed 200ms for interaction feedback (hover, click, toggle)
- **MUST** pause looping animations when off-screen (IntersectionObserver or `viewport` prop)
- **MUST** respect `prefers-reduced-motion` — add `motion-reduce:transition-none motion-reduce:animate-none`

---

## Typography Craft

- **MUST** use `text-balance` on headings (prevents orphaned last words)
- **MUST** use `text-pretty` on body paragraphs and descriptions
- **MUST** use `tabular-nums` on numbers, prices, statistics, data tables
- **SHOULD** use `truncate` or `line-clamp-*` for text that could overflow in dense UI
- **SHOULD** use `tracking-tight` on headings `text-3xl` and above
- **SHOULD** use `leading-relaxed` on body text for readability
- **MUST** use `antialiased` (usually via Tailwind's `antialiased` on body)

---

## Visual Design Rules

### Anti-Slop Enforcement
- **NEVER** use gradients unless the design direction explicitly calls for them
- **NEVER** use purple or multicolor gradients as default decoration
- **NEVER** use glow effects as primary affordances (buttons should work without glow)
- **SHOULD** limit accent color to ONE per view
- **NEVER** use more than 2-3 colors in a single gradient
- **NEVER** center-align body text (headings are fine centered)
- **NEVER** use rounded-full on cards (rounded-xl or rounded-2xl max)

### Empty States
- **MUST** include one clear next-action in every empty state
- **SHOULD** use illustration or icon to indicate the empty state visually
- **NEVER** just show "No data" without guidance on what to do

### Loading States
- **SHOULD** use shimmer skeletons over spinner animations
- **MUST** match skeleton shapes to the content they replace
- **NEVER** show a blank white/black screen during loading

### Dark Mode
- **MUST** use opacity-based borders on glass surfaces (`border-white/10` not `border-gray-700`)
- **MUST** use `shadow-none` on cards in dark mode (glass replaces shadows)
- **SHOULD** use `backdrop-blur-sm` (4px) for standard cards, `backdrop-blur-xl` (24px) for premium
- **NEVER** stack more than 2-3 glass layers (performance)
- **MUST** include `-webkit-backdrop-filter` alongside `backdrop-filter` for Safari

---

## Responsive Rules

- **MUST** design mobile-first (base styles for mobile, add `sm:`, `md:`, `lg:`, `xl:` for larger)
- **MUST** test layouts at: 375px (mobile), 768px (tablet), 1024px (laptop), 1280px (desktop)
- **SHOULD** use `max-w-2xl` for body text blocks (readability)
- **SHOULD** use `max-w-6xl` or `max-w-7xl` for page containers
- **MUST** stack grid columns to single column on mobile
- **SHOULD** use `flex-col sm:flex-row` for horizontal layouts that stack on mobile
- **SHOULD** adjust heading sizes responsively: `text-3xl md:text-5xl lg:text-6xl`
- **SHOULD** adjust padding responsively: `px-4 sm:px-6 lg:px-8`

---

## Accessibility Rules (Responsive-First)

While not enforcing full WCAG 2.1 AA, these are non-negotiable:

- **MUST** use semantic HTML (`<section>`, `<nav>`, `<header>`, `<main>`, `<footer>`, `<article>`)
- **MUST** add `alt` text to all images (empty `alt=""` for decorative images)
- **MUST** ensure all interactive elements are keyboard reachable (no div-buttons without `tabIndex` and `onKeyDown`)
- **MUST** add visible focus indicators (`focus-visible:ring-2 focus-visible:ring-blue-500`)
- **MUST** use `sr-only` class for screen reader text on icon-only actions
- **SHOULD** ensure text contrast meets 4.5:1 minimum against backgrounds
- **SHOULD** use `role` and `aria-*` attributes on custom interactive components

---

## Performance Rules

### Animation Performance
- Only animate `transform` and `opacity` — these run on the GPU compositor
- Never animate `width`, `height`, `top`, `left`, `margin`, `padding` continuously
- Use Framer Motion's `layout` prop for layout changes (it uses FLIP internally)
- Never use `requestAnimationFrame` loops without stop conditions
- Prefer CSS `transition` for simple state changes, Motion for complex choreography

### Blur Performance
- Max `backdrop-blur-xl` (24px) — never higher
- Max 2-3 overlapping glass layers
- Test on throttled CPU (Chrome DevTools → 4x slowdown)
- Consider removing blur on low-powered devices via media query

### Bundle Performance
- Use `LazyMotion` + `m` components to reduce Motion from ~32KB to ~4.6KB
- Only import GSAP when scroll-scrubbing or SVG morphing is needed
- Tree-shake Lucide icons by importing individually: `import { ArrowRight } from "lucide-react"`
- Lazy load below-fold sections with `React.lazy()` or route-based splitting

### Image Performance
- Always set `width` and `height` on images to prevent layout shift
- Use `loading="lazy"` on below-fold images
- Use WebP/AVIF formats where possible
- Use `<picture>` element for responsive images at different breakpoints

---

## File Organization

### Component Size Limits
- **Max 200 lines per component file** — extract sub-components if larger
- **Max 5 props** before considering a config object pattern
- **One exported component per file** (internal helper components are fine)

### Naming
- PascalCase for component files: `HeroSection.tsx`
- camelCase for utility files: `useScrollAnimation.ts`
- kebab-case for CSS/style files: `global-styles.css`
- Prefix hooks with `use`: `useInView`, `useScrollProgress`

### Co-location
- Keep section components self-contained: props in, JSX out
- Hooks used by one component live in the same file
- Shared hooks go in `hooks/` or `lib/hooks/`
- Types used by one component: defined above the component
- Shared types: `types/` directory

---

## Pre-Delivery Checklist

Before presenting generated code, verify:

- [ ] All imports are present and correct
- [ ] TypeScript interfaces are defined and exported
- [ ] No `any` types
- [ ] All text uses `text-balance` (headings) or `text-pretty` (body)
- [ ] Responsive: works at 375px, 768px, 1024px, 1280px
- [ ] Dark mode: all elements have appropriate `dark:` variants (if applicable)
- [ ] Animations: only `transform` and `opacity`, with `viewport={{ once: true }}`
- [ ] `motion-reduce:transition-none` on animated elements
- [ ] Semantic HTML structure
- [ ] `alt` text on images
- [ ] Focus rings on interactive elements
- [ ] No placeholder text like "Lorem ipsum" without being obvious example data
- [ ] `cn()` used for conditional classes (not string concatenation)
- [ ] Lucide React icons (not emoji, not raw SVG)
