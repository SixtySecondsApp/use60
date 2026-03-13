import { useRef, useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import { X, Check, Quote } from 'lucide-react';

/* ------------------------------------------------------------------ */
/*  Animation variants                                                 */
/* ------------------------------------------------------------------ */

const fadeUp = {
  hidden: { opacity: 0, y: 24 },
  show: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.6, ease: [0.22, 1, 0.36, 1] },
  },
};

const stagger = {
  hidden: {},
  show: { transition: { staggerChildren: 0.06 } },
};

/* ------------------------------------------------------------------ */
/*  3D tilt hook                                                       */
/* ------------------------------------------------------------------ */

function useTiltCard(maxTilt = 4) {
  const cardRef = useRef<HTMLDivElement>(null);
  const [style, setStyle] = useState<React.CSSProperties>({
    transform: 'perspective(800px) rotateY(0deg) rotateX(0deg)',
    transition: 'transform 0.4s ease',
  });
  const [spotlight, setSpotlight] = useState<React.CSSProperties>({ opacity: 0 });
  const [reducedMotion, setReducedMotion] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    setReducedMotion(mq.matches);
    const handler = (e: MediaQueryListEvent) => setReducedMotion(e.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

  const handleMouseMove = useCallback(
    (e: React.MouseEvent) => {
      if (reducedMotion || !cardRef.current) return;
      const rect = cardRef.current.getBoundingClientRect();
      const x = (e.clientX - rect.left) / rect.width;
      const y = (e.clientY - rect.top) / rect.height;
      const rotateY = (x - 0.5) * maxTilt * 2;
      const rotateX = (0.5 - y) * maxTilt * 2;
      setStyle({
        transform: `perspective(800px) rotateY(${rotateY}deg) rotateX(${rotateX}deg)`,
        transition: 'transform 0.1s ease',
      });
      setSpotlight({
        opacity: 0.08,
        background: `radial-gradient(circle at ${x * 100}% ${y * 100}%, rgba(59,130,246,0.3), transparent 60%)`,
      });
    },
    [maxTilt, reducedMotion],
  );

  const handleMouseLeave = useCallback(() => {
    setStyle({
      transform: 'perspective(800px) rotateY(0deg) rotateX(0deg)',
      transition: 'transform 0.4s ease',
    });
    setSpotlight({ opacity: 0 });
  }, []);

  return { cardRef, style, spotlight, handleMouseMove, handleMouseLeave };
}

/* ------------------------------------------------------------------ */
/*  Cost line items                                                    */
/* ------------------------------------------------------------------ */

const OLD_WAY_COSTS = [
  { label: 'Sales Leader', cost: '$120K/year' },
  { label: 'SDR Team (2)', cost: '$100K/year' },
  { label: 'CRM License', cost: '$15K/year' },
  { label: 'Data Provider', cost: '$12K/year' },
  { label: 'Outreach Tool', cost: '$8K/year' },
];

const SIXTY_BENEFITS = [
  'Finds leads, writes sequences, preps meetings',
  'Follows up, keeps pipeline clean',
  'Works 24/7. Never calls in sick. Gets smarter every day.',
  'Live in 48 hours. Not 6 months.',
];

/* ------------------------------------------------------------------ */
/*  OldWayCard                                                         */
/* ------------------------------------------------------------------ */

function OldWayCard() {
  const { cardRef, style, spotlight, handleMouseMove, handleMouseLeave } = useTiltCard(4);

  return (
    <motion.div
      variants={fadeUp}
      ref={cardRef}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      style={style}
      className="relative bg-red-50/50 dark:bg-red-500/5 border border-red-200 dark:border-red-500/20 rounded-2xl p-8 overflow-hidden"
    >
      {/* Spotlight overlay */}
      <div
        className="absolute inset-0 pointer-events-none rounded-2xl transition-opacity duration-300"
        style={spotlight}
        aria-hidden="true"
      />

      <div className="relative z-10">
        <div className="flex items-center gap-2 mb-6">
          <div className="w-8 h-8 bg-red-100 dark:bg-red-500/10 rounded-lg flex items-center justify-center">
            <X className="w-4 h-4 text-red-500" />
          </div>
          <h3 className="font-display font-bold text-lg text-gray-900 dark:text-white line-through decoration-red-400/60">
            The Old Way
          </h3>
        </div>

        <div className="space-y-3 mb-6">
          {OLD_WAY_COSTS.map((item) => (
            <div key={item.label} className="flex items-center justify-between">
              <span className="text-sm text-gray-500 dark:text-zinc-400">{item.label}</span>
              <span className="text-sm font-mono text-gray-600 dark:text-zinc-300">{item.cost}</span>
            </div>
          ))}
        </div>

        <div className="border-t border-red-200 dark:border-red-500/20 pt-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-semibold text-gray-900 dark:text-white">Total</span>
            <span className="text-lg font-display font-bold text-red-500">$255K/year</span>
          </div>
          <p className="text-xs text-red-400 dark:text-red-400/80 italic">
            Still depends on humans updating the CRM
          </p>
        </div>
      </div>
    </motion.div>
  );
}

/* ------------------------------------------------------------------ */
/*  SixtyWayCard                                                       */
/* ------------------------------------------------------------------ */

function SixtyWayCard() {
  const { cardRef, style, spotlight, handleMouseMove, handleMouseLeave } = useTiltCard(4);

  return (
    <motion.div
      variants={fadeUp}
      ref={cardRef}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      style={style}
      className="relative bg-green-50/50 dark:bg-emerald-500/5 border border-green-200 dark:border-emerald-500/20 rounded-2xl p-8 overflow-hidden"
    >
      {/* Spotlight overlay */}
      <div
        className="absolute inset-0 pointer-events-none rounded-2xl transition-opacity duration-300"
        style={spotlight}
        aria-hidden="true"
      />

      <div className="relative z-10">
        <div className="flex items-center gap-2 mb-6">
          <div className="w-8 h-8 bg-green-100 dark:bg-emerald-500/10 rounded-lg flex items-center justify-center">
            <Check className="w-4 h-4 text-emerald-500" />
          </div>
          <h3 className="font-display font-bold text-lg text-gray-900 dark:text-white">
            The 60 Way
          </h3>
        </div>

        <div className="mb-6">
          <div className="bg-white dark:bg-white/[0.03] border border-green-200 dark:border-emerald-500/10 rounded-lg px-4 py-3 mb-4">
            <div className="text-sm font-semibold text-gray-900 dark:text-white mb-1">
              60 Command Center
            </div>
            <div className="text-xs text-gray-500 dark:text-zinc-400">
              Custom-built for your stack
            </div>
          </div>

          <div className="space-y-2.5">
            {SIXTY_BENEFITS.map((benefit) => (
              <div key={benefit} className="flex items-start gap-2.5 text-sm text-gray-600 dark:text-zinc-300">
                <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 mt-2 shrink-0" />
                {benefit}
              </div>
            ))}
          </div>
        </div>

        <div className="border-t border-green-200 dark:border-emerald-500/20 pt-4">
          <div className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 text-sm font-medium rounded-full">
            <Check className="w-4 h-4" />
            Fraction of the cost. Infinite scale.
          </div>
        </div>
      </div>
    </motion.div>
  );
}

/* ------------------------------------------------------------------ */
/*  SystemVsHireV11                                                    */
/* ------------------------------------------------------------------ */

export function SystemVsHireV11() {
  return (
    <section className="bg-white dark:bg-[#0a0a0a] py-24 md:py-32">
      <div className="max-w-6xl mx-auto px-6">
        {/* Header */}
        <motion.div
          variants={fadeUp}
          initial="hidden"
          whileInView="show"
          viewport={{ once: true, margin: '-60px' }}
          className="text-center mb-16"
        >
          <p className="text-sm font-medium text-blue-600 dark:text-emerald-500 mb-4 tracking-wide uppercase">
            The Business Case
          </p>
          <h2 className="font-display font-bold text-3xl md:text-5xl text-gray-900 dark:text-white tracking-tight">
            Invest in a system, not a headcount
          </h2>
          <p className="mt-4 text-gray-500 dark:text-zinc-400 text-lg font-body max-w-2xl mx-auto">
            A COO scaling from $7M to $21M chose 60 over hiring a sales leader. Here's why.
          </p>
        </motion.div>

        {/* Two columns */}
        <motion.div
          variants={stagger}
          initial="hidden"
          whileInView="show"
          viewport={{ once: true, margin: '-60px' }}
          className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-4xl mx-auto mb-16"
        >
          <OldWayCard />
          <SixtyWayCard />
        </motion.div>

        {/* Quote */}
        <motion.div
          variants={fadeUp}
          initial="hidden"
          whileInView="show"
          viewport={{ once: true, margin: '-60px' }}
          className="max-w-3xl mx-auto"
        >
          <div className="bg-gray-50 dark:bg-[#111] border border-gray-100 dark:border-white/5 rounded-2xl p-8 text-center">
            <Quote className="w-8 h-8 text-blue-600/20 dark:text-emerald-500/20 mx-auto mb-4" />
            <blockquote className="text-lg text-gray-700 dark:text-zinc-300 font-body leading-relaxed italic mb-4">
              "We had three years to triple the business. We didn't have time to keep hiring and hoping. We needed a system."
            </blockquote>
            <cite className="text-sm text-gray-400 dark:text-zinc-500 not-italic">
              — COO, $7M Financial Services Company
            </cite>
          </div>
        </motion.div>
      </div>
    </section>
  );
}
