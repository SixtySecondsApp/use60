import { useState, useEffect, useRef } from 'react';
import { motion, useInView } from 'framer-motion';

/* ------------------------------------------------------------------ */
/*  useCountUp hook                                                    */
/* ------------------------------------------------------------------ */

function useCountUp(target: number, duration: number, isActive: boolean) {
  const [value, setValue] = useState(0);
  const frameRef = useRef<number>();

  useEffect(() => {
    if (!isActive) {
      setValue(0);
      return;
    }

    const start = performance.now();
    const tick = (now: number) => {
      const elapsed = now - start;
      const progress = Math.min(elapsed / duration, 1);
      // ease-out cubic
      const eased = 1 - Math.pow(1 - progress, 3);
      setValue(Math.round(eased * target));
      if (progress < 1) {
        frameRef.current = requestAnimationFrame(tick);
      }
    };
    frameRef.current = requestAnimationFrame(tick);
    return () => {
      if (frameRef.current) cancelAnimationFrame(frameRef.current);
    };
  }, [target, duration, isActive]);

  return value;
}

/* ------------------------------------------------------------------ */
/*  StatsCalloutV12                                                    */
/* ------------------------------------------------------------------ */

export function StatsCalloutV12() {
  const ref = useRef<HTMLDivElement>(null);
  const isInView = useInView(ref, { once: true, margin: '-100px' });
  const count = useCountUp(15247, 2000, isInView);

  return (
    <section className="bg-white dark:bg-[#070b1a] py-24 md:py-32">
      <div ref={ref} className="max-w-4xl mx-auto px-6 text-center">
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-60px' }}
          transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
        >
          {/* Big number with gradient text */}
          <div className="font-display font-extrabold text-6xl md:text-8xl bg-gradient-to-r from-violet-600 to-blue-500 bg-clip-text text-transparent tabular-nums">
            {count.toLocaleString()}
          </div>
          <p className="mt-4 text-xl md:text-2xl font-display font-semibold text-gray-900 dark:text-[#e1f0ff]">
            follow-ups sent automatically by 60 this month
          </p>
          <p className="mt-3 text-gray-500 dark:text-[#8891b0] text-lg font-body">
            Every one personalized. Every one on time. Zero manual work.
          </p>
        </motion.div>
      </div>
    </section>
  );
}
