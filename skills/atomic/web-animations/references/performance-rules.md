# Animation Performance Rules

Non-negotiable rules for maintaining 60fps animations. Every animation must be performant on mid-range devices.

---

## The Golden Rule

**Only animate `transform` and `opacity`.** These are compositor-only properties that run on the GPU without triggering layout or paint.

### Safe to Animate (compositor-only)
- `transform` (translate, scale, rotate, skew)
- `opacity`
- `filter` (blur, brightness — but has limits, see below)
- `clip-path` (GPU-accelerated in modern browsers)
- `background-position` (for gradient animations)

### NEVER Animate Continuously
- `width`, `height` — triggers layout
- `top`, `left`, `right`, `bottom` — triggers layout
- `margin`, `padding` — triggers layout
- `border-width` — triggers layout + paint
- `font-size` — triggers layout
- `box-shadow` — triggers paint (use `filter: drop-shadow` for animated shadows)

### Use `layout` Prop for Size Changes
When you need to animate element size, use Motion's `layout` prop. It uses the FLIP technique (First, Last, Invert, Play) to animate layout changes using only `transform`.

```tsx
<motion.div layout className={isExpanded ? "w-96 h-96" : "w-48 h-48"}>
  {content}
</motion.div>
```

---

## Blur Performance

Blur is the most expensive commonly-used filter.

| Rule | Limit |
|------|-------|
| Max blur value | `blur(24px)` / `backdrop-blur-xl` |
| Max overlapping blur layers | 2-3 |
| Max backdrop-blur elements on screen | 5-6 |
| Test at | Chrome DevTools → Performance → 4x CPU throttle |

### Blur Mitigation

```tsx
// GOOD: Static blur on background, not animated
<div className="absolute inset-0 backdrop-blur-sm bg-gray-900/80" />

// BAD: Animating blur value
<motion.div animate={{ filter: "blur(0px)" }} initial={{ filter: "blur(20px)" }} />
// ↑ This is ok for ONE-TIME entrance, but never for continuous/looping animations

// GOOD: Blur text entrance (one-time, with limit)
<motion.div
  initial={{ opacity: 0, filter: "blur(8px)" }}
  animate={{ opacity: 1, filter: "blur(0px)" }}
  transition={{ duration: 0.5 }}
/>
```

### Safari Compatibility

```css
/* Always include both */
.glass {
  -webkit-backdrop-filter: blur(8px);
  backdrop-filter: blur(8px);
}
```

---

## Bundle Optimization

### Motion (Framer Motion)

| Approach | Size | Use When |
|----------|------|----------|
| Full `motion` import | ~32KB | Tier 3 cinematic, drag, layout animations |
| `LazyMotion` + `domAnimation` | ~4.6KB | Tier 2 scroll reveals, basic animations |
| `LazyMotion` + `domMax` | ~15KB | Tier 2 + drag + layout |
| CSS-only (Tier 1) | 0KB | App UI, hovers, loading states |

```tsx
// Tier 2: LazyMotion setup (4.6KB)
import { LazyMotion, domAnimation, m } from "motion/react";

function LandingLayout({ children }: { children: React.ReactNode }) {
  return <LazyMotion features={domAnimation}>{children}</LazyMotion>;
}

// Use `m` instead of `motion`
<m.div animate={{ opacity: 1 }} />
```

### GSAP

| Package | Size |
|---------|------|
| `gsap` core | ~23KB |
| `ScrollTrigger` | ~12KB |
| Total | ~35KB |

Only import GSAP when you need scroll-scrubbing, complex timelines, or SVG morphing. Motion handles most scroll animations.

### Rive

| Component | Size |
|-----------|------|
| WASM runtime | ~78KB |
| Per `.riv` file | 10-200KB depending on complexity |

Preload hero `.riv` files. Lazy-load below-fold Rive components.

### Tree-Shaking

```tsx
// GOOD: Named import
import { ArrowRight } from "lucide-react";

// BAD: Barrel import
import * as Icons from "lucide-react";
```

---

## Scroll Animation Rules

### viewport={{ once: true }}

Always use on scroll-triggered animations to prevent re-triggering.

```tsx
<motion.div
  whileInView={{ opacity: 1, y: 0 }}
  viewport={{ once: true, margin: "-80px" }}
/>
```

### Margin for Early Trigger

Use negative margin to trigger before the element is fully visible:
- `-80px` — trigger 80px before entering (recommended default)
- `-100px` — more aggressive pre-loading
- `0px` — trigger exactly at viewport edge

### Scroll Event Performance

```tsx
// GOOD: passive listener
window.addEventListener('scroll', handler, { passive: true });

// GOOD: Motion's useScroll (already optimized)
const { scrollYProgress } = useScroll();

// BAD: Non-passive scroll listener
window.addEventListener('scroll', handler); // blocks scrolling
```

---

## Looping Animation Rules

### Pause Off-Screen

Infinite animations (marquee, aurora, pulse) MUST pause when not visible.

```tsx
// Pattern 1: IntersectionObserver
function PausableAnimation({ children }: { children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => setIsVisible(entry.isIntersecting),
      { threshold: 0 }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <div ref={ref} style={{ animationPlayState: isVisible ? "running" : "paused" }}>
      {children}
    </div>
  );
}

// Pattern 2: CSS-only with Rive
// Rive automatically pauses when canvas is off-screen
```

### `will-change` Usage

```tsx
// GOOD: Apply only during animation
<motion.div
  style={{ willChange: "transform" }}
  animate={{ x: 100 }}
  onAnimationComplete={() => {
    // Remove will-change after animation
  }}
/>

// BAD: Permanent will-change
<div className="will-change-transform" /> // Creates compositor layer permanently
```

---

## Accessibility

### prefers-reduced-motion

**Every animated element** must respect reduced motion preferences.

```tsx
// CSS approach — add to ALL animated elements
className="motion-reduce:transition-none motion-reduce:animate-none"

// Motion component approach
<motion.div
  initial={{ opacity: 0, y: 20 }}
  whileInView={{ opacity: 1, y: 0 }}
  className="motion-reduce:transform-none"
/>

// Programmatic check
const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

// Hook approach
import { useReducedMotion } from "motion/react";
const shouldReduceMotion = useReducedMotion();
```

### Focus Indicators

Interactive animated elements must have visible focus states:

```tsx
<motion.button
  whileHover={{ scale: 1.03 }}
  whileTap={{ scale: 0.97 }}
  className="focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2
    motion-reduce:transform-none"
>
  Click me
</motion.button>
```

### Screen Reader Text

```tsx
// For decorative animations
<div aria-hidden="true">
  <RiveComponent />
</div>

// For meaningful animations with alt text
<div role="img" aria-label="Interactive product demo showing the dashboard">
  <RiveComponent />
</div>
```

---

## Testing Protocol

### DevTools Performance Audit

1. Open Chrome DevTools → Performance tab
2. Enable CPU throttling → **4x slowdown**
3. Record while scrolling the page
4. Check for:
   - Frames dropping below 60fps
   - Layout thrashing (forced reflows)
   - Long tasks (>50ms)
   - Excessive paint events

### Metrics to Watch

| Metric | Target | Action if Exceeded |
|--------|--------|--------------------|
| FPS | >55fps sustained | Reduce blur layers, simplify animations |
| Layout shifts | 0 during animation | Use `transform` instead of layout properties |
| Paint events | Minimal | Check for `box-shadow`, `border-radius` animations |
| JS execution | <5ms per frame | Reduce complexity, use CSS where possible |
| Bundle size | <50KB animation JS | Use LazyMotion, code-split GSAP |

### Quick Performance Checklist

- [ ] Only animating `transform` and `opacity`
- [ ] `viewport={{ once: true }}` on scroll animations
- [ ] `motion-reduce:transition-none` on all animated elements
- [ ] Blur max 24px, max 2-3 glass layers
- [ ] `-webkit-backdrop-filter` alongside `backdrop-filter`
- [ ] Looping animations pause when off-screen
- [ ] `will-change` only during active animation
- [ ] LazyMotion used for Tier 2 (not full Motion)
- [ ] GSAP only imported when needed
- [ ] Rive `.riv` files preloaded for hero, lazy-loaded for below-fold
- [ ] Passive scroll event listeners
- [ ] No layout property animations
- [ ] Tested at 4x CPU throttle
