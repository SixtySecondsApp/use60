# Motion API Reference (formerly Framer Motion)

Complete API reference for `motion/react` — the animation library for React.

**Install**: `npm install motion` (or legacy `npm install framer-motion`)
**Import**: `import { motion, AnimatePresence, useAnimate, useScroll, useTransform, useInView, useSpring } from "motion/react";`

---

## Core: The `motion` Component

Every HTML/SVG element has a `motion` equivalent: `motion.div`, `motion.span`, `motion.button`, etc.

### Props Reference

| Prop | Type | Description |
|------|------|-------------|
| `initial` | Target \| `false` | State on mount (`false` disables mount animation) |
| `animate` | Target | Target animation state |
| `exit` | Target | Animation when removed (needs `AnimatePresence`) |
| `transition` | Transition | Animation config (type, duration, ease, spring) |
| `variants` | Record<string, Target> | Named animation states |
| `whileHover` | Target \| string | Animation while hovered |
| `whileTap` | Target \| string | Animation while pressed |
| `whileDrag` | Target \| string | Animation while dragging |
| `whileFocus` | Target \| string | Animation while focused |
| `whileInView` | Target \| string | Animation while in viewport |
| `viewport` | ViewportOptions | Config for `whileInView` |
| `layout` | boolean \| "position" \| "size" | Animate layout changes |
| `layoutId` | string | Shared layout animation identifier |
| `drag` | boolean \| "x" \| "y" | Enable dragging |
| `style` | MotionStyle | Supports motion values |

### Basic Usage

```tsx
<motion.div
  initial={{ opacity: 0, y: 20 }}
  animate={{ opacity: 1, y: 0 }}
  transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
/>
```

---

## Transition Types

### Tween (Duration + Easing)

```tsx
transition={{
  type: "tween",        // default for non-transform values
  duration: 0.5,        // seconds
  ease: [0.22, 1, 0.36, 1],  // cubic-bezier array
  delay: 0.1,           // seconds
}}
```

Built-in easing: `"linear"`, `"easeIn"`, `"easeOut"`, `"easeInOut"`, `"circIn"`, `"circOut"`, `"circInOut"`, `"backIn"`, `"backOut"`, `"backInOut"`, `"anticipate"`

### Spring (Physics-Based)

```tsx
// Physics spring — incorporates velocity from gestures
transition={{
  type: "spring",
  stiffness: 300,   // Higher = more sudden (default: 1)
  damping: 30,      // Higher = less oscillation (default: 10)
  mass: 0.8,        // Higher = more lethargic (default: 1)
  velocity: 0,      // Initial velocity
  restSpeed: 0.1,   // Stop threshold
}}

// Duration spring — easier to reason about
transition={{
  type: "spring",
  duration: 0.4,    // seconds
  bounce: 0.2,      // 0 = no bounce, 1 = very bouncy
}}
```

### Per-Property Transitions

```tsx
transition={{
  opacity: { duration: 0.3, ease: "easeOut" },
  y: { type: "spring", stiffness: 300, damping: 25 },
}}
```

---

## AnimatePresence

Animates components when they unmount from the React tree. Keeps removed components in the DOM until exit animation completes.

```tsx
import { AnimatePresence, motion } from "motion/react";

<AnimatePresence mode="wait">
  {isOpen && (
    <motion.div
      key="modal"
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.95 }}
      transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
    />
  )}
</AnimatePresence>
```

**Rules:**
- Removed component MUST be a direct child of `AnimatePresence`
- Each direct child MUST have a unique `key`
- `mode="wait"` — wait for exit to complete before entering new child
- `mode="popLayout"` — new child enters immediately, exiting child pops out of layout
- `mode="sync"` — enter and exit happen simultaneously (default)

---

## Variants

Named animation states that propagate through the component tree.

```tsx
const container = {
  hidden: {},
  visible: {
    transition: {
      staggerChildren: 0.06,      // delay between each child
      delayChildren: 0.1,         // delay before first child
      staggerDirection: 1,         // 1 = forward, -1 = reverse
    },
  },
};

const item = {
  hidden: { opacity: 0, y: 20 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.5, ease: [0.22, 1, 0.36, 1] },
  },
};

<motion.ul variants={container} initial="hidden" animate="visible">
  <motion.li variants={item} />
  <motion.li variants={item} />
  <motion.li variants={item} />
</motion.ul>
```

---

## Scroll Animations

### useScroll

Returns motion values for scroll progress.

```tsx
import { useScroll, useTransform, motion } from "motion/react";

function ParallaxHero() {
  const ref = useRef<HTMLDivElement>(null);

  // Track element scroll progress
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ["start start", "end start"],  // when element top hits viewport top → element bottom hits viewport top
  });

  const y = useTransform(scrollYProgress, [0, 1], [0, -200]);
  const opacity = useTransform(scrollYProgress, [0, 0.5], [1, 0]);
  const scale = useTransform(scrollYProgress, [0, 1], [1, 0.85]);

  return (
    <section ref={ref} className="relative h-screen overflow-hidden">
      <motion.div style={{ y, opacity, scale }} className="absolute inset-0">
        {children}
      </motion.div>
    </section>
  );
}
```

**useScroll returns:**
- `scrollX` / `scrollY` — pixel position
- `scrollXProgress` / `scrollYProgress` — 0 to 1 progress

**Options:**
- `target` — ref to track (default: page)
- `container` — scrollable container ref (default: window)
- `offset` — `[start, end]` defining scroll range

**Offset values:** `"start"`, `"center"`, `"end"`, pixel values, percentages
- `["start end", "end start"]` — full viewport traverse
- `["start start", "end start"]` — from top of viewport to scrolled out

### useTransform

Maps one motion value range to another.

```tsx
const opacity = useTransform(scrollYProgress, [0, 0.5, 1], [0, 1, 0]);
const scale = useTransform(scrollYProgress, [0, 1], [1, 1.5]);
const color = useTransform(scrollYProgress, [0, 1], ["#ff0000", "#0000ff"]);

// With transform function
const rounded = useTransform(motionValue, (v) => Math.round(v * 100));
```

### useSpring

Wraps a motion value with spring physics.

```tsx
import { useSpring, useScroll, useTransform } from "motion/react";

const { scrollYProgress } = useScroll();
const smoothProgress = useSpring(scrollYProgress, {
  stiffness: 100,
  damping: 30,
  restDelta: 0.001,
});
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

---

## useInView

Returns boolean when element enters viewport.

```tsx
import { useInView } from "motion/react";

const ref = useRef(null);
const isInView = useInView(ref, {
  once: true,            // only trigger once
  margin: "-100px",      // trigger 100px before entering
  amount: 0.5,           // 50% visible before triggering
});
```

---

## useAnimate

Imperative animation control with scoped selectors.

```tsx
import { useAnimate } from "motion/react";

function Component() {
  const [scope, animate] = useAnimate();

  const handleClick = async () => {
    // Animate the scope element
    await animate(scope.current, { scale: 1.1 }, { duration: 0.2 });
    // Animate children by selector
    await animate("li", { opacity: 1, x: 0 }, { delay: stagger(0.05) });
  };

  return <ul ref={scope}>{/* ... */}</ul>;
}
```

**With usePresence for exit animations:**
```tsx
const [isPresent, safeToRemove] = usePresence();
const [scope, animate] = useAnimate();

useEffect(() => {
  if (!isPresent) {
    const exit = async () => {
      await animate("li", { opacity: 0, x: -100 });
      await animate(scope.current, { opacity: 0 });
      safeToRemove();
    };
    exit();
  }
}, [isPresent]);
```

---

## Layout Animations

### Auto Layout

```tsx
// Animates position and size changes automatically
<motion.div layout>
  {isExpanded ? <LargeContent /> : <SmallContent />}
</motion.div>

// Position only (no size animation)
<motion.div layout="position" />

// Size only
<motion.div layout="size" />
```

### Shared Layout (layoutId)

```tsx
// Two components with same layoutId animate between each other
{items.map((item) => (
  <motion.div layoutId={`card-${item.id}`} key={item.id}>
    {selected === item.id ? <ExpandedCard /> : <CompactCard />}
  </motion.div>
))}
```

### Tab Indicator Pattern

```tsx
{tabs.map((tab) => (
  <button key={tab.id} onClick={() => setActive(tab.id)} className="relative px-4 py-2">
    {tab.label}
    {active === tab.id && (
      <motion.div
        layoutId="tab-indicator"
        className="absolute bottom-0 left-0 right-0 h-0.5 bg-white"
        transition={{ type: "spring", stiffness: 380, damping: 30 }}
      />
    )}
  </button>
))}
```

---

## Gestures

### Hover and Tap

```tsx
<motion.button
  whileHover={{ scale: 1.05 }}
  whileTap={{ scale: 0.95 }}
  transition={{ type: "spring", stiffness: 400, damping: 17 }}
/>
```

### Drag

```tsx
<motion.div
  drag                              // or drag="x" or drag="y"
  dragConstraints={{ left: -100, right: 100, top: -50, bottom: 50 }}
  dragElastic={0.1}                 // 0 = rigid, 1 = free outside constraints
  dragMomentum={true}               // apply inertia after release
  dragSnapToOrigin={false}          // snap back to start on release
  whileDrag={{ scale: 1.1 }}
  onDragStart={(e, info) => {}}
  onDrag={(e, info) => {}}          // info.point, info.delta, info.offset, info.velocity
  onDragEnd={(e, info) => {}}
/>

// Constrain to parent
const constraintsRef = useRef(null);
<motion.div ref={constraintsRef}>
  <motion.div drag dragConstraints={constraintsRef} />
</motion.div>
```

---

## LazyMotion (Bundle Optimization)

Reduce bundle from ~32KB to ~4.6KB for Tier 2 animations.

```tsx
import { LazyMotion, domAnimation, m } from "motion/react";

// Wrap layout — use `m` instead of `motion`
<LazyMotion features={domAnimation}>
  <m.div animate={{ opacity: 1 }} />
</LazyMotion>

// For full feature set (drag, layout):
import { domMax } from "motion/react";
<LazyMotion features={domMax}>
```

---

## Stagger Helper

```tsx
import { stagger } from "motion";

// With useAnimate
animate("li", { opacity: 1 }, { delay: stagger(0.05) });

// Reverse stagger
animate("li", { opacity: 1 }, { delay: stagger(0.05, { startDelay: 0.1, from: "last" }) });

// Center-out stagger
animate("li", { opacity: 1 }, { delay: stagger(0.05, { from: "center" }) });
```

---

## SVG Animations

```tsx
// Path drawing
<motion.path
  d="M 0 0 L 100 100"
  initial={{ pathLength: 0 }}
  animate={{ pathLength: 1 }}
  transition={{ duration: 2, ease: "easeInOut" }}
/>

// Circle
<motion.circle
  cx="50" cy="50" r="40"
  initial={{ pathLength: 0, opacity: 0 }}
  animate={{ pathLength: 1, opacity: 1 }}
/>
```

---

## Motion Values (Reactive)

```tsx
import { useMotionValue, useTransform, motion } from "motion/react";

const x = useMotionValue(0);
const opacity = useTransform(x, [-100, 0, 100], [0, 1, 0]);
const background = useTransform(x, [-100, 100], ["#ff0000", "#0000ff"]);

<motion.div style={{ x, opacity, background }} drag="x" />
```

Motion values update without triggering React re-renders — pure performance.
