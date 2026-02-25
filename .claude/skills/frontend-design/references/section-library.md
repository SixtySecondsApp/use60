# Section Library

Production-ready landing page sections. Copy, customize, compose.

All sections assume: dark mode (`bg-zinc-950` or `bg-black`), Framer Motion available, Tailwind CSS, Lucide React icons.

---

## 1. Hero — Centered (Linear/Vercel Style)

The most common premium SaaS hero. Centered text, sequenced entrance, radial glow.

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

---

## 2. Social Proof — Logo Marquee

Infinite scrolling logos with fade masks. Immediate credibility after hero.

```tsx
interface LogoMarqueeProps {
  title?: string;
  logos: { name: string; src: string }[];
  speed?: number;
}

function LogoMarquee({ title = "Trusted by teams at", logos, speed = 30 }: LogoMarqueeProps) {
  return (
    <section className="py-16 border-y border-white/5">
      <p className="text-center text-sm text-zinc-500 uppercase tracking-wider mb-10">
        {title}
      </p>
      <div className="flex overflow-hidden
        [mask-image:linear-gradient(to_right,transparent,white_15%,white_85%,transparent)]">
        {[0, 1].map((copy) => (
          <div
            key={copy}
            className="flex shrink-0 animate-marquee items-center gap-16 pr-16"
            style={{ animationDuration: `${speed}s` }}
            aria-hidden={copy === 1}
          >
            {logos.map((logo) => (
              <img
                key={logo.name}
                src={logo.src}
                alt={logo.name}
                className="h-8 opacity-40 grayscale hover:opacity-100 hover:grayscale-0
                  transition-all duration-300"
              />
            ))}
          </div>
        ))}
      </div>
    </section>
  );
}
```

---

## 3. Feature Showcase — Bento Grid

Varied card sizes with hover effects. Replaces boring 3-column grids.

```tsx
import { motion } from "motion/react";

interface Feature {
  title: string;
  description: string;
  icon: React.ReactNode;
  span?: "wide" | "tall" | "default";
}

function BentoGrid({ features }: { features: Feature[] }) {
  const container = { hidden: {}, visible: { transition: { staggerChildren: 0.08 } } };
  const item = {
    hidden: { opacity: 0, y: 20 },
    visible: { opacity: 1, y: 0, transition: { duration: 0.5, ease: "easeOut" } },
  };

  return (
    <section className="py-24 px-4">
      <div className="max-w-6xl mx-auto">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="text-center mb-16"
        >
          <h2 className="text-4xl md:text-5xl font-bold tracking-tight text-white text-balance">
            Everything you need
          </h2>
          <p className="mt-4 text-lg text-zinc-400 max-w-2xl mx-auto">
            Built for modern teams that move fast.
          </p>
        </motion.div>

        <motion.div
          variants={container}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true }}
          className="grid grid-cols-1 md:grid-cols-3 gap-4"
        >
          {features.map((feature, i) => (
            <motion.div
              key={i}
              variants={item}
              className={`group relative rounded-2xl border border-white/10 bg-white/[0.02] p-8
                overflow-hidden transition-colors duration-300 hover:border-white/20
                ${feature.span === "wide" ? "md:col-span-2" : ""}
                ${feature.span === "tall" ? "md:row-span-2" : ""}`}
            >
              {/* Hover glow */}
              <div className="absolute inset-0 bg-gradient-to-br from-violet-500/10 via-transparent to-transparent
                opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none" />

              <div className="relative z-10">
                <div className="mb-4 inline-flex items-center justify-center w-10 h-10 rounded-lg
                  bg-violet-500/10 border border-violet-500/20 text-violet-400">
                  {feature.icon}
                </div>
                <h3 className="text-lg font-semibold text-white mb-2">{feature.title}</h3>
                <p className="text-zinc-400 text-pretty">{feature.description}</p>
              </div>
            </motion.div>
          ))}
        </motion.div>
      </div>
    </section>
  );
}
```

---

## 4. How It Works — 3-Step Process

Clean numbered steps with connecting lines.

```tsx
import { motion } from "motion/react";

interface Step {
  number: string;
  title: string;
  description: string;
  icon: React.ReactNode;
}

function HowItWorks({ steps }: { steps: Step[] }) {
  return (
    <section className="py-24 px-4">
      <div className="max-w-5xl mx-auto">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="text-center mb-16"
        >
          <h2 className="text-4xl md:text-5xl font-bold tracking-tight text-white text-balance">
            How it works
          </h2>
          <p className="mt-4 text-lg text-zinc-400">Three steps to get started.</p>
        </motion.div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 md:gap-12 relative">
          {/* Connecting line (desktop only) */}
          <div className="hidden md:block absolute top-12 left-[16.67%] right-[16.67%] h-px bg-gradient-to-r from-transparent via-white/10 to-transparent" />

          {steps.map((step, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, delay: i * 0.15 }}
              className="text-center relative"
            >
              <div className="inline-flex items-center justify-center w-12 h-12 rounded-full
                bg-white/5 border border-white/10 text-white font-bold text-lg mb-6
                relative z-10">
                {step.number}
              </div>
              <h3 className="text-xl font-semibold text-white mb-3">{step.title}</h3>
              <p className="text-zinc-400 text-pretty">{step.description}</p>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
```

---

## 5. Testimonials — Card Grid

Three testimonials with avatar and role.

```tsx
import { motion } from "motion/react";
import { Star } from "lucide-react";

interface Testimonial {
  quote: string;
  name: string;
  role: string;
  avatar: string;
  stars?: number;
}

function TestimonialGrid({ testimonials }: { testimonials: Testimonial[] }) {
  const container = { hidden: {}, visible: { transition: { staggerChildren: 0.1 } } };
  const item = {
    hidden: { opacity: 0, y: 20 },
    visible: { opacity: 1, y: 0, transition: { duration: 0.5 } },
  };

  return (
    <section className="py-24 px-4">
      <div className="max-w-6xl mx-auto">
        <motion.h2
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="text-4xl md:text-5xl font-bold tracking-tight text-white text-center mb-16 text-balance"
        >
          Loved by teams everywhere
        </motion.h2>

        <motion.div
          variants={container}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true }}
          className="grid grid-cols-1 md:grid-cols-3 gap-6"
        >
          {testimonials.map((t, i) => (
            <motion.div
              key={i}
              variants={item}
              className="rounded-2xl border border-white/10 bg-white/[0.02] p-6"
            >
              {t.stars && (
                <div className="flex gap-1 mb-4">
                  {Array.from({ length: t.stars }).map((_, j) => (
                    <Star key={j} className="w-4 h-4 fill-amber-400 text-amber-400" />
                  ))}
                </div>
              )}
              <p className="text-zinc-300 text-pretty mb-6">"{t.quote}"</p>
              <div className="flex items-center gap-3">
                <img src={t.avatar} alt={t.name} className="w-10 h-10 rounded-full" />
                <div>
                  <p className="text-sm font-medium text-white">{t.name}</p>
                  <p className="text-sm text-zinc-500">{t.role}</p>
                </div>
              </div>
            </motion.div>
          ))}
        </motion.div>
      </div>
    </section>
  );
}
```

---

## 6. Pricing — 3-Tier Table

Centered pricing with highlighted recommended tier.

```tsx
import { motion } from "motion/react";
import { Check } from "lucide-react";

interface PricingTier {
  name: string;
  price: string;
  period?: string;
  description: string;
  features: string[];
  cta: string;
  highlighted?: boolean;
}

function PricingSection({ tiers }: { tiers: PricingTier[] }) {
  return (
    <section className="py-24 px-4">
      <div className="max-w-5xl mx-auto">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="text-center mb-16"
        >
          <h2 className="text-4xl md:text-5xl font-bold tracking-tight text-white text-balance">
            Simple, transparent pricing
          </h2>
          <p className="mt-4 text-lg text-zinc-400">No hidden fees. Cancel anytime.</p>
        </motion.div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {tiers.map((tier, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.1 }}
              className={`relative rounded-2xl p-8 ${
                tier.highlighted
                  ? "border-2 border-violet-500/50 bg-violet-500/5"
                  : "border border-white/10 bg-white/[0.02]"
              }`}
            >
              {tier.highlighted && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-1 rounded-full
                  bg-violet-500 text-white text-xs font-medium">
                  Most Popular
                </div>
              )}

              <h3 className="text-lg font-semibold text-white">{tier.name}</h3>
              <p className="text-sm text-zinc-400 mt-1">{tier.description}</p>

              <div className="mt-6 mb-8">
                <span className="text-4xl font-bold text-white">{tier.price}</span>
                {tier.period && <span className="text-zinc-500 ml-1">/{tier.period}</span>}
              </div>

              <ul className="space-y-3 mb-8">
                {tier.features.map((feature, j) => (
                  <li key={j} className="flex items-start gap-3 text-sm text-zinc-300">
                    <Check className="w-4 h-4 text-emerald-400 mt-0.5 shrink-0" />
                    {feature}
                  </li>
                ))}
              </ul>

              <button className={`w-full py-3 rounded-lg font-medium transition-colors ${
                tier.highlighted
                  ? "bg-white text-black hover:bg-zinc-200"
                  : "border border-white/20 text-white hover:bg-white/5"
              }`}>
                {tier.cta}
              </button>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
```

---

## 7. FAQ — Animated Accordion

Click-to-expand with smooth height animation.

```tsx
import { useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { Plus } from "lucide-react";

interface FAQItem {
  question: string;
  answer: string;
}

function FAQSection({ items }: { items: FAQItem[] }) {
  const [openIndex, setOpenIndex] = useState<number | null>(null);

  return (
    <section className="py-24 px-4">
      <div className="max-w-3xl mx-auto">
        <motion.h2
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="text-4xl md:text-5xl font-bold tracking-tight text-white text-center mb-16 text-balance"
        >
          Frequently asked questions
        </motion.h2>

        <div className="space-y-2">
          {items.map((item, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, y: 10 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.05 }}
              className="border border-white/10 rounded-xl overflow-hidden"
            >
              <button
                onClick={() => setOpenIndex(openIndex === i ? null : i)}
                className="w-full flex items-center justify-between p-5 text-left
                  hover:bg-white/[0.02] transition-colors"
              >
                <span className="font-medium text-white pr-4">{item.question}</span>
                <Plus className={`w-5 h-5 text-zinc-400 shrink-0 transition-transform duration-200
                  ${openIndex === i ? "rotate-45" : ""}`} />
              </button>

              <AnimatePresence initial={false}>
                {openIndex === i && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.3, ease: [0.04, 0.62, 0.23, 0.98] }}
                    className="overflow-hidden"
                  >
                    <p className="px-5 pb-5 text-zinc-400 text-pretty">{item.answer}</p>
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
```

---

## 8. CTA — Final Conversion

Strong closing section with gradient background.

```tsx
import { motion } from "motion/react";
import { ArrowRight } from "lucide-react";

interface CTAProps {
  title: string;
  subtitle: string;
  ctaLabel: string;
  ctaHref: string;
}

function CTASection({ title, subtitle, ctaLabel, ctaHref }: CTAProps) {
  return (
    <section className="py-24 px-4">
      <div className="max-w-4xl mx-auto">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="relative rounded-3xl border border-white/10 overflow-hidden"
        >
          {/* Background gradient */}
          <div className="absolute inset-0
            bg-gradient-to-br from-violet-500/20 via-transparent to-cyan-500/10" />

          {/* Grid overlay */}
          <div className="absolute inset-0
            bg-[linear-gradient(rgba(255,255,255,0.03)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.03)_1px,transparent_1px)]
            bg-[size:32px_32px]" />

          <div className="relative z-10 text-center px-8 py-16 md:py-24">
            <h2 className="text-4xl md:text-5xl font-bold tracking-tight text-white text-balance">
              {title}
            </h2>
            <p className="mt-4 text-lg text-zinc-400 max-w-xl mx-auto text-pretty">
              {subtitle}
            </p>
            <div className="mt-10">
              <a
                href={ctaHref}
                className="inline-flex items-center gap-2 px-8 py-3 rounded-full
                  bg-white text-black font-medium hover:bg-zinc-200 transition-colors group"
              >
                {ctaLabel}
                <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-1" />
              </a>
            </div>
          </div>
        </motion.div>
      </div>
    </section>
  );
}
```

---

## Tailwind Config Additions

Add these to your `tailwind.config.js` for the section library to work:

```js
module.exports = {
  theme: {
    extend: {
      animation: {
        "marquee": "marquee var(--duration, 30s) linear infinite",
        "shimmer": "shimmer 2s infinite",
        "gradient": "gradient 3s linear infinite",
        "spotlight": "spotlight 2s ease .75s 1 forwards",
        "aurora": "aurora 60s linear infinite",
      },
      keyframes: {
        marquee: {
          "0%": { transform: "translateX(0)" },
          "100%": { transform: "translateX(-100%)" },
        },
        shimmer: {
          "100%": { transform: "translateX(100%)" },
        },
        gradient: {
          "0%,100%": { backgroundPosition: "0% center" },
          "50%": { backgroundPosition: "200% center" },
        },
        spotlight: {
          "0%": { opacity: "0", transform: "translateY(-40px) scale(0.8)" },
          "100%": { opacity: "1", transform: "translateY(0) scale(1)" },
        },
        aurora: {
          "0%,100%": { backgroundPosition: "50% 50%" },
          "50%": { backgroundPosition: "350% 50%" },
        },
      },
    },
  },
};
```
