import { useState, useRef } from 'react';
import { motion, useScroll, useTransform } from 'framer-motion';
import { ArrowRight, Globe, Check } from 'lucide-react';
import { AuroraBackground } from './AuroraBackground';
import { ConfettiService } from '../../lib/services/confettiService';

interface HeroV10Props {
  onTryDemo: (url: string) => void;
}

const stagger = {
  hidden: {},
  show: { transition: { staggerChildren: 0.08 } },
};

const fadeUp = {
  hidden: { opacity: 0, y: 24 },
  show: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.6, ease: [0.22, 1, 0.36, 1] },
  },
};

const exampleDomains = ['stripe.com', 'notion.com', 'linear.app', 'figma.com'];

export function HeroV10({ onTryDemo }: HeroV10Props) {
  const [demoUrl, setDemoUrl] = useState('');
  const sectionRef = useRef<HTMLElement>(null);

  const { scrollYProgress } = useScroll({
    target: sectionRef,
    offset: ['start start', 'end start'],
  });

  // Parallax transforms for decorative bricks
  const brick1Y = useTransform(scrollYProgress, [0, 1], [0, -60]);
  const brick2Y = useTransform(scrollYProgress, [0, 1], [0, -40]);
  const brick3Y = useTransform(scrollYProgress, [0, 1], [0, -80]);
  const brick4Y = useTransform(scrollYProgress, [0, 1], [0, -30]);

  const handleDemoSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (demoUrl.trim()) {
      ConfettiService.subtle();
      setTimeout(() => onTryDemo(demoUrl.trim()), 200);
    }
  };

  const handleExampleClick = (domain: string) => {
    setDemoUrl(domain);
    ConfettiService.subtle();
    setTimeout(() => onTryDemo(domain), 200);
  };

  return (
    <section ref={sectionRef} className="relative bg-white dark:bg-[#0a0a0a] overflow-hidden">
      <AuroraBackground />

      {/* Subtle decorative elements — Harmonic-style colored bricks with parallax */}
      <motion.div
        style={{ y: brick1Y }}
        className="absolute top-32 left-8 w-3 h-12 bg-blue-500/20 dark:bg-emerald-500/10 rounded-sm hidden lg:block"
        aria-hidden="true"
      />
      <motion.div
        style={{ y: brick2Y }}
        className="absolute top-48 left-14 w-2 h-8 bg-gray-300/30 dark:bg-gray-500/10 rounded-sm hidden lg:block"
        aria-hidden="true"
      />
      <motion.div
        style={{ y: brick3Y }}
        className="absolute top-36 right-12 w-3 h-10 bg-rose-400/15 dark:bg-rose-400/10 rounded-sm hidden lg:block"
        aria-hidden="true"
      />
      <motion.div
        style={{ y: brick4Y }}
        className="absolute top-52 right-20 w-2 h-6 bg-gray-300/20 dark:bg-gray-500/[0.08] rounded-sm hidden lg:block"
        aria-hidden="true"
      />

      <div className="relative max-w-6xl mx-auto px-6 pt-28 pb-12 md:pt-36 md:pb-16">
        <motion.div
          variants={stagger}
          initial="hidden"
          animate="show"
          className="flex flex-col items-center text-center"
        >
          {/* Headline */}
          <motion.h1
            variants={fadeUp}
            className="font-display font-extrabold text-5xl md:text-7xl tracking-tight text-gray-900 dark:text-white leading-[1.08]"
          >
            Everything before and
            <br />
            after the call
          </motion.h1>

          {/* Subheadline */}
          <motion.p
            variants={fadeUp}
            className="mt-6 text-gray-500 dark:text-gray-400 text-xl font-body max-w-2xl leading-relaxed"
          >
            60 is the AI command center for sales. Follow-ups, meeting prep,
            pipeline hygiene — handled before you think about it.
          </motion.p>

          {/* Demo URL form */}
          <motion.form
            variants={fadeUp}
            onSubmit={handleDemoSubmit}
            className="mt-10 flex flex-col sm:flex-row gap-3 w-full max-w-md"
          >
            <div className="relative flex-1">
              <Globe className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 dark:text-gray-500" />
              <input
                type="text"
                value={demoUrl}
                onChange={(e) => setDemoUrl(e.target.value)}
                placeholder="yourcompany.com"
                className="w-full pl-10 pr-4 py-3 rounded-lg border text-sm font-body
                  bg-gray-50 border-gray-200 text-gray-900 placeholder:text-gray-400
                  focus:outline-none focus:ring-2 focus:ring-blue-500 dark:focus:ring-emerald-500 focus:border-transparent focus:bg-white
                  dark:bg-white/5 dark:border-white/10 dark:text-white dark:placeholder:text-gray-500
                  dark:focus:bg-white/10
                  transition-all"
              />
            </div>
            <button
              type="submit"
              className="px-6 py-3 rounded-lg text-sm font-semibold
                bg-blue-600 text-white hover:bg-blue-700
                dark:bg-emerald-500 dark:hover:bg-emerald-600
                transition-all hover:translate-y-[-1px] hover:shadow-lg
                focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 dark:focus-visible:ring-emerald-500 focus-visible:ring-offset-2
                dark:focus-visible:ring-offset-[#0a0a0a]
                flex items-center justify-center gap-2"
            >
              Try the demo
              <ArrowRight className="w-4 h-4" />
            </button>
          </motion.form>

          {/* Example domain buttons */}
          <motion.div
            variants={fadeUp}
            className="mt-3 flex flex-wrap items-center justify-center gap-2"
          >
            <span className="text-xs text-gray-400 dark:text-gray-500">Try:</span>
            {exampleDomains.map((domain) => (
              <button
                key={domain}
                type="button"
                onClick={() => handleExampleClick(domain)}
                className="px-2.5 py-1 rounded-md text-xs font-medium border
                  border-gray-200 text-gray-500 hover:border-blue-300 hover:text-blue-600
                  dark:border-white/10 dark:text-gray-400 dark:hover:border-emerald-500/30 dark:hover:text-emerald-400
                  transition-colors"
              >
                {domain}
              </button>
            ))}
          </motion.div>

          {/* Trust micro-copy */}
          <motion.div
            variants={fadeUp}
            className="mt-4 flex items-center justify-center gap-6 text-xs text-gray-400 dark:text-gray-500"
          >
            <span className="flex items-center gap-1.5"><Check className="w-3 h-3 text-blue-500 dark:text-emerald-400" /> No signup required</span>
            <span className="flex items-center gap-1.5"><Check className="w-3 h-3 text-blue-500 dark:text-emerald-400" /> 30-second setup</span>
            <span className="flex items-center gap-1.5"><Check className="w-3 h-3 text-blue-500 dark:text-emerald-400" /> Free forever</span>
          </motion.div>

          {/* Secondary CTA */}
          <motion.p
            variants={fadeUp}
            className="mt-4 text-sm font-body"
          >
            <span className="text-gray-400 dark:text-gray-500">or </span>
            <a
              href="https://app.use60.com/signup"
              className="text-blue-600 dark:text-emerald-400 hover:text-blue-700 dark:hover:text-emerald-300 font-medium transition-colors"
            >
              Get Started free <ArrowRight className="inline w-3.5 h-3.5" />
            </a>
          </motion.p>
        </motion.div>
      </div>
    </section>
  );
}
