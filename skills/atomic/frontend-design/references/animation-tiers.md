# Animation Tiers Reference

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

// Inline spinner (for buttons)
<svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
</svg>
```

### Focus States
```tsx
// Standard focus ring
"focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-gray-900"

// Subtle focus (for inline elements)
"focus-visible:outline-none focus-visible:bg-blue-50 dark:focus-visible:bg-blue-500/10 focus-visible:rounded"
```

### Transitions
```tsx
// Color transitions (most common)
"transition-colors duration-200"

// All properties (when multiple things change)
"transition-all duration-200"

// Transform only (for movement)
"transition-transform duration-200"

// Opacity (for show/hide)
"transition-opacity duration-300"
```

### Accordion / Expand (CSS-only via Radix)
```tsx
// Radix accordion animation
"data-[state=open]:animate-accordion-down data-[state=closed]:animate-accordion-up"

// Tailwind config:
// keyframes: {
//   "accordion-down": { from: { height: "0" }, to: { height: "var(--radix-accordion-content-height)" } },
//   "accordion-up": { from: { height: "var(--radix-accordion-content-height)" }, to: { height: "0" } },
// }
```

### Reduced Motion
```tsx
// Always add to animated elements
"motion-reduce:transition-none motion-reduce:animate-none"
```

---

## Tier 2: Scroll Reveals + Transitions (Standard Landing)

**Dependencies**: `motion/react` (Framer Motion)
**Bundle impact**: ~4.6KB with LazyMotion, ~32KB full
**Use when**: Landing page sections, feature showcases, about pages

### Setup: LazyMotion for Smaller Bundle
```tsx
import { LazyMotion, domAnimation } from "motion/react";

// Wrap your landing page layout
function LandingLayout({ children }: { children: React.ReactNode }) {
  return <LazyMotion features={domAnimation}>{children}</LazyMotion>;
}
```

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

  <motion.div
    initial={{ opacity: 0, y: 20 }}
    animate={{ opacity: 1, y: 0 }}
    transition={{ duration: 0.5, delay: 0.3 }}
    className="mt-10 flex gap-4 justify-center"
  >
    {/* CTA buttons */}
  </motion.div>
</div>
```

### AnimatePresence (Mount/Unmount)
```tsx
import { AnimatePresence, motion } from "motion/react";

<AnimatePresence mode="wait">
  {isOpen && (
    <motion.div
      key="panel"
      initial={{ opacity: 0, x: 300 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 300 }}
      transition={{ type: "spring", damping: 25, stiffness: 200 }}
    >
      {children}
    </motion.div>
  )}
</AnimatePresence>
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

### Shared Layout Animation (Tab indicator)
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

### Scroll Progress Bar
```tsx
function ScrollProgress() {
  const { scrollYProgress } = useScroll();
  return (
    <motion.div
      className="fixed top-0 left-0 right-0 h-0.5 bg-violet-500 origin-left z-50"
      style={{ scaleX: scrollYProgress }}
    />
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

// Tailwind config:
// keyframes: { aurora: { "0%,100%": { backgroundPosition: "50% 50%" }, "50%": { backgroundPosition: "350% 50%" } } }
// animation: { aurora: "aurora 60s linear infinite" }
```

### Spotlight Effect
```tsx
function Spotlight() {
  return (
    <div className="pointer-events-none absolute inset-0 z-30">
      <div className="absolute -top-40 left-0 h-[560px] w-[560px]
        animate-spotlight rounded-full
        bg-[radial-gradient(ellipse,rgba(120,119,198,0.15),transparent_60%)]
        blur-3xl" />
    </div>
  );
}

// Tailwind config:
// keyframes: { spotlight: { "0%": { opacity: "0", transform: "translateY(-40px) scale(0.8)" }, "100%": { opacity: "1", transform: "translateY(0) scale(1)" } } }
// animation: { spotlight: "spotlight 2s ease .75s 1 forwards" }
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

### GSAP Timeline (Sequenced Complex Animation)
```tsx
import gsap from "gsap";
import { useGSAP } from "@gsap/react";
import { ScrollTrigger } from "gsap/ScrollTrigger";

gsap.registerPlugin(ScrollTrigger);

function CinematicHero() {
  const containerRef = useRef<HTMLDivElement>(null);

  useGSAP(() => {
    const tl = gsap.timeline({ defaults: { ease: "power3.out" } });
    tl.from(".hero-badge", { y: -20, opacity: 0, duration: 0.5 })
      .from(".hero-title", { y: 40, opacity: 0, duration: 0.7 }, "-=0.2")
      .from(".hero-description", { y: 30, opacity: 0, duration: 0.6 }, "-=0.3")
      .from(".hero-cta", { y: 20, opacity: 0, duration: 0.5 }, "-=0.2")
      .from(".hero-visual", { scale: 0.95, opacity: 0, duration: 0.8 }, "-=0.4");
  }, { scope: containerRef });

  return <div ref={containerRef}>{/* ... */}</div>;
}
```

### GSAP Scroll-Scrubbed Horizontal Panels
```tsx
useGSAP(() => {
  const panels = gsap.utils.toArray<HTMLElement>(".panel");
  gsap.to(panels, {
    xPercent: -100 * (panels.length - 1),
    ease: "none",
    scrollTrigger: {
      trigger: ".panel-container",
      pin: true,
      scrub: 1,
      end: () => "+=" + document.querySelector(".panel-container")!.scrollWidth,
    },
  });
}, { scope: containerRef });
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

// Tailwind config:
// keyframes: { marquee: { "0%": { transform: "translateX(0)" }, "100%": { transform: "translateX(-100%)" } } }
// animation: { marquee: "marquee var(--duration, 30s) linear infinite" }
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
