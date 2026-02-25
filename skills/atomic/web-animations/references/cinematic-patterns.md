# Cinematic Animation Patterns

Premium animation recipes that rival Framer, Linear, Vercel, and Apple. These patterns are what separate a good website from a great one.

---

## Hero Entrances

### Sequenced Hero (The Gold Standard)

Badge → Heading → Description → CTA, staggered with 100ms delays.

```tsx
import { motion } from "motion/react";

function SequencedHero() {
  const elements = [
    { delay: 0, content: (
      <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full border border-white/10 bg-white/5 text-sm text-zinc-400 mb-6">
        <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
        Now in beta
      </div>
    )},
    { delay: 0.1, content: (
      <h1 className="text-5xl md:text-7xl font-bold tracking-tight text-balance bg-clip-text text-transparent bg-gradient-to-b from-white via-white to-zinc-500">
        Your headline here
      </h1>
    )},
    { delay: 0.2, content: (
      <p className="mt-6 text-lg text-zinc-400 max-w-2xl mx-auto text-pretty">
        Supporting description text
      </p>
    )},
    { delay: 0.3, content: (
      <div className="mt-10 flex gap-4 justify-center">
        <button className="px-8 py-3 rounded-full bg-white text-black font-medium">Get Started</button>
        <button className="px-8 py-3 rounded-full border border-white/20 text-white font-medium">Learn More</button>
      </div>
    )},
  ];

  return (
    <section className="relative min-h-screen flex items-center justify-center text-center px-4">
      <div>
        {elements.map((el, i) => (
          <motion.div
            key={i}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: el.delay, ease: [0.16, 1, 0.3, 1] }}
            className="motion-reduce:transform-none"
          >
            {el.content}
          </motion.div>
        ))}
      </div>
    </section>
  );
}
```

### GSAP Timeline Hero

For complex multi-element choreography with precise control.

```tsx
import { useRef } from "react";
import gsap from "gsap";
import { useGSAP } from "@gsap/react";

function CinematicHero() {
  const containerRef = useRef<HTMLDivElement>(null);

  useGSAP(() => {
    const tl = gsap.timeline({ defaults: { ease: "power3.out" } });
    tl.from(".hero-badge", { y: -20, opacity: 0, duration: 0.5 })
      .from(".hero-title", { y: 40, opacity: 0, duration: 0.7 }, "-=0.2")
      .from(".hero-title .word", { y: 30, opacity: 0, stagger: 0.05 }, "-=0.5")
      .from(".hero-desc", { y: 30, opacity: 0, duration: 0.6 }, "-=0.3")
      .from(".hero-cta > *", { y: 20, opacity: 0, stagger: 0.1, duration: 0.5 }, "-=0.2")
      .from(".hero-visual", { scale: 0.95, opacity: 0, duration: 0.8 }, "-=0.4");
  }, { scope: containerRef });

  return <div ref={containerRef}>{/* elements with matching classes */}</div>;
}
```

---

## Scroll Animations

### Parallax Hero (Scroll-Linked)

```tsx
import { motion, useScroll, useTransform } from "motion/react";
import { useRef } from "react";

function ParallaxHero() {
  const ref = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ["start start", "end start"],
  });

  const y = useTransform(scrollYProgress, [0, 1], [0, -200]);
  const opacity = useTransform(scrollYProgress, [0, 0.5], [1, 0]);
  const scale = useTransform(scrollYProgress, [0, 1], [1, 0.85]);

  return (
    <section ref={ref} className="relative h-screen overflow-hidden">
      <motion.div style={{ y, opacity, scale }} className="absolute inset-0 flex items-center justify-center">
        <h1 className="text-7xl font-bold">Parallax Hero</h1>
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

### Horizontal Scroll Panels (GSAP)

```tsx
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { useGSAP } from "@gsap/react";

gsap.registerPlugin(ScrollTrigger);

function HorizontalScroll() {
  const containerRef = useRef<HTMLDivElement>(null);

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

  return (
    <div ref={containerRef}>
      <div className="panel-container flex h-screen">
        <div className="panel w-screen h-screen shrink-0 flex items-center justify-center">Panel 1</div>
        <div className="panel w-screen h-screen shrink-0 flex items-center justify-center">Panel 2</div>
        <div className="panel w-screen h-screen shrink-0 flex items-center justify-center">Panel 3</div>
      </div>
    </div>
  );
}
```

### Sticky Scroll Sections

```tsx
function StickyReveal() {
  const sections = [
    { title: "Feature 1", description: "Description 1" },
    { title: "Feature 2", description: "Description 2" },
    { title: "Feature 3", description: "Description 3" },
  ];

  return (
    <div className="relative">
      {sections.map((section, i) => (
        <div key={i} className="h-screen sticky top-0 flex items-center justify-center"
          style={{ zIndex: i }}>
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            whileInView={{ opacity: 1, scale: 1 }}
            viewport={{ once: true, amount: 0.5 }}
            transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
            className="max-w-2xl p-12 rounded-2xl bg-zinc-900 border border-white/10"
          >
            <h2 className="text-3xl font-bold">{section.title}</h2>
            <p className="mt-4 text-zinc-400">{section.description}</p>
          </motion.div>
        </div>
      ))}
    </div>
  );
}
```

---

## Text Animations

### Split Text Reveal (Word by Word)

```tsx
function SplitTextReveal({ text, className }: { text: string; className?: string }) {
  const words = text.split(" ");
  return (
    <motion.h1
      className={className}
      initial="hidden"
      whileInView="visible"
      viewport={{ once: true }}
      variants={{
        hidden: {},
        visible: { transition: { staggerChildren: 0.08 } },
      }}
    >
      {words.map((word, i) => (
        <motion.span
          key={i}
          className="inline-block mr-[0.25em]"
          variants={{
            hidden: { opacity: 0, y: 20, filter: "blur(4px)" },
            visible: {
              opacity: 1, y: 0, filter: "blur(0px)",
              transition: { duration: 0.5, ease: [0.22, 1, 0.36, 1] },
            },
          }}
        >
          {word}
        </motion.span>
      ))}
    </motion.h1>
  );
}
```

### Character-by-Character Typewriter

```tsx
function Typewriter({ text, speed = 30 }: { text: string; speed?: number }) {
  const [displayed, setDisplayed] = useState("");

  useEffect(() => {
    let i = 0;
    const interval = setInterval(() => {
      setDisplayed(text.slice(0, i + 1));
      i++;
      if (i >= text.length) clearInterval(interval);
    }, speed);
    return () => clearInterval(interval);
  }, [text, speed]);

  return (
    <span>
      {displayed}
      <span className="animate-pulse">|</span>
    </span>
  );
}
```

### Counter Animation

```tsx
import { useMotionValue, useTransform, motion, animate } from "motion/react";
import { useEffect } from "react";

function AnimatedCounter({ value, duration = 2 }: { value: number; duration?: number }) {
  const count = useMotionValue(0);
  const rounded = useTransform(count, (v) => Math.round(v).toLocaleString());

  useEffect(() => {
    const controls = animate(count, value, { duration });
    return controls.stop;
  }, [value]);

  return <motion.span className="tabular-nums">{rounded}</motion.span>;
}
```

### Text Blur Unblur

```tsx
<motion.h1
  initial={{ opacity: 0, filter: "blur(10px)" }}
  animate={{ opacity: 1, filter: "blur(0px)" }}
  transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
>
  Crystal Clear
</motion.h1>
```

---

## Background Effects

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

/* Tailwind config:
keyframes: {
  aurora: {
    "0%,100%": { backgroundPosition: "50% 50%" },
    "50%": { backgroundPosition: "350% 50%" }
  }
}
animation: { aurora: "aurora 60s linear infinite" }
*/
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

/* Tailwind config:
keyframes: {
  spotlight: {
    "0%": { opacity: "0", transform: "translateY(-40px) scale(0.8)" },
    "100%": { opacity: "1", transform: "translateY(0) scale(1)" }
  }
}
animation: { spotlight: "spotlight 2s ease .75s 1 forwards" }
*/
```

### Grid Pattern

```tsx
<div className="absolute inset-0
  bg-[linear-gradient(rgba(255,255,255,0.03)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.03)_1px,transparent_1px)]
  bg-[size:64px_64px]" />
```

### Dot Grid

```tsx
<div className="absolute inset-0
  bg-[radial-gradient(circle,rgba(255,255,255,0.06)_1px,transparent_1px)]
  bg-[size:24px_24px]" />
```

### Radial Glow

```tsx
<div className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-1/3
  w-[800px] h-[600px] rounded-full
  bg-[radial-gradient(ellipse,rgba(139,92,246,0.15),transparent_70%)]
  blur-3xl pointer-events-none" />
```

### Animated Gradient Border

```tsx
<div className="relative rounded-xl p-px
  bg-gradient-to-r from-violet-500 via-cyan-500 to-violet-500
  bg-[length:200%_auto] animate-gradient">
  <div className="rounded-[11px] bg-zinc-950 p-6">{children}</div>
</div>

/* Tailwind config:
keyframes: { gradient: { "0%,100%": { backgroundPosition: "0% center" }, "50%": { backgroundPosition: "200% center" } } }
animation: { gradient: "gradient 3s linear infinite" }
*/
```

### Noise Texture Overlay

```tsx
<div className="absolute inset-0 pointer-events-none opacity-[0.03]
  [background-image:url('data:image/svg+xml,%3Csvg%20viewBox%3D%220%200%20256%20256%22%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%3E%3Cfilter%20id%3D%22n%22%3E%3CfeTurbulence%20type%3D%22fractalNoise%22%20baseFrequency%3D%220.9%22%20numOctaves%3D%224%22%20stitchTiles%3D%22stitch%22%2F%3E%3C%2Ffilter%3E%3Crect%20width%3D%22100%25%22%20height%3D%22100%25%22%20filter%3D%22url(%23n)%22%2F%3E%3C%2Fsvg%3E')]
  mix-blend-mode-overlay" />
```

---

## Interactive Elements

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

### Magnetic Button

```tsx
function MagneticButton({ children }: { children: React.ReactNode }) {
  const ref = useRef<HTMLButtonElement>(null);

  const handleMouseMove = (e: React.MouseEvent) => {
    const el = ref.current!;
    const rect = el.getBoundingClientRect();
    const x = e.clientX - rect.left - rect.width / 2;
    const y = e.clientY - rect.top - rect.height / 2;
    el.style.transform = `translate(${x * 0.3}px, ${y * 0.3}px)`;
  };

  const handleMouseLeave = () => {
    ref.current!.style.transform = "translate(0, 0)";
  };

  return (
    <button
      ref={ref}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      className="transition-transform duration-300 ease-out"
    >
      {children}
    </button>
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

/* Tailwind config:
keyframes: { marquee: { "0%": { transform: "translateX(0)" }, "100%": { transform: "translateX(-100%)" } } }
animation: { marquee: "marquee var(--duration, 30s) linear infinite" }
*/
```

---

## Page Transitions

### Route Transition with AnimatePresence

```tsx
import { AnimatePresence, motion } from "motion/react";
import { useLocation } from "react-router-dom";

function AnimatedRoutes() {
  const location = useLocation();

  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={location.pathname}
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -8 }}
        transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
      >
        <Routes location={location}>
          {/* routes */}
        </Routes>
      </motion.div>
    </AnimatePresence>
  );
}
```

### Shared Element Transition

```tsx
// List view
<motion.div layoutId={`card-${item.id}`} className="p-4 rounded-xl bg-zinc-900">
  <h3>{item.title}</h3>
</motion.div>

// Detail view
<motion.div layoutId={`card-${item.id}`} className="p-8 rounded-2xl bg-zinc-900">
  <h1>{item.title}</h1>
  <p>{item.description}</p>
</motion.div>
```

---

## SVG Animations

### Path Drawing

```tsx
<svg viewBox="0 0 200 200" className="w-64 h-64">
  <motion.path
    d="M 20 80 Q 100 20 180 80 Q 100 140 20 80"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    initial={{ pathLength: 0, opacity: 0 }}
    whileInView={{ pathLength: 1, opacity: 1 }}
    viewport={{ once: true }}
    transition={{ duration: 2, ease: "easeInOut" }}
  />
</svg>
```

### Animated Check Mark

```tsx
<svg viewBox="0 0 24 24" className="w-6 h-6">
  <motion.path
    d="M5 12l5 5L20 7"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    initial={{ pathLength: 0 }}
    animate={{ pathLength: 1 }}
    transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1], delay: 0.2 }}
  />
</svg>
```

---

## CSS-Only Cinematic (Zero JS)

### Floating Elements

```css
@keyframes float {
  0%, 100% { transform: translateY(0) rotate(0deg); }
  33% { transform: translateY(-10px) rotate(1deg); }
  66% { transform: translateY(-5px) rotate(-1deg); }
}

.float-1 { animation: float 4s ease-in-out infinite; }
.float-2 { animation: float 5s ease-in-out 1s infinite; }
.float-3 { animation: float 3.5s ease-in-out 0.5s infinite; }
```

### Shimmer Skeleton

```tsx
<div className="relative overflow-hidden rounded-lg bg-gray-200 dark:bg-white/5">
  <div className="absolute inset-0 -translate-x-full animate-[shimmer_2s_infinite]
    bg-gradient-to-r from-transparent via-white/20 dark:via-white/5 to-transparent" />
</div>
```

### Gradient Text Shimmer

```tsx
<span className="bg-clip-text text-transparent bg-gradient-to-r from-violet-400 via-cyan-400 to-violet-400
  bg-[length:200%_auto] animate-gradient">
  Shimmering Text
</span>
```
