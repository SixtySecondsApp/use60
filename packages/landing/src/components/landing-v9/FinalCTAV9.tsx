import { useRef, useState, useCallback } from 'react';
import { motion } from 'framer-motion';
import { ArrowRight } from 'lucide-react';

/* ------------------------------------------------------------------ */
/*  Magnetic button hook                                               */
/* ------------------------------------------------------------------ */

function useMagneticButton(strength = 0.3) {
  const ref = useRef<HTMLAnchorElement>(null);
  const [offset, setOffset] = useState({ x: 0, y: 0 });

  const handleMouseMove = useCallback(
    (e: React.MouseEvent) => {
      if (!ref.current) return;
      const rect = ref.current.getBoundingClientRect();
      const centerX = rect.left + rect.width / 2;
      const centerY = rect.top + rect.height / 2;
      const dx = (e.clientX - centerX) * strength;
      const dy = (e.clientY - centerY) * strength;
      setOffset({ x: dx, y: dy });
    },
    [strength],
  );

  const handleMouseLeave = useCallback(() => {
    setOffset({ x: 0, y: 0 });
  }, []);

  return { ref, offset, handleMouseMove, handleMouseLeave };
}

/* ------------------------------------------------------------------ */
/*  FinalCTAV9                                                         */
/* ------------------------------------------------------------------ */

export function FinalCTAV9() {
  const { ref, offset, handleMouseMove, handleMouseLeave } = useMagneticButton(0.3);

  const scrollToTop = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.preventDefault();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <section className="relative bg-gray-50 dark:bg-[#111] py-24 md:py-32 overflow-hidden">
      {/* Gradient background */}
      <div className="absolute inset-0 pointer-events-none" aria-hidden="true">
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] rounded-full opacity-10 dark:opacity-[0.06] blur-[120px] bg-blue-500 dark:bg-emerald-500" />
      </div>

      <motion.div
        initial={{ opacity: 0, y: 24 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: '-60px' }}
        transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
        className="relative z-10 max-w-2xl mx-auto px-6 text-center"
      >
        <h2 className="font-display font-bold text-3xl md:text-5xl text-gray-900 dark:text-white tracking-tight">
          Your next follow-up is
          <br />
          60 seconds away
        </h2>
        <p className="mt-6 text-gray-500 dark:text-gray-400 text-lg font-body">
          Start automating meeting prep, follow-ups, and pipeline hygiene today.
        </p>

        {/* Primary CTA — magnetic hover */}
        <div className="mt-10" onMouseMove={handleMouseMove} onMouseLeave={handleMouseLeave}>
          <motion.a
            ref={ref}
            href="https://app.use60.com/signup"
            animate={{ x: offset.x, y: offset.y }}
            transition={{ type: 'spring', stiffness: 300, damping: 20, mass: 0.5 }}
            className="inline-flex items-center gap-2 px-8 py-4 rounded-xl text-base font-semibold
              bg-blue-600 dark:bg-emerald-500 text-white hover:bg-blue-700 dark:hover:bg-emerald-600
              transition-colors hover:shadow-lg
              focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 dark:focus-visible:ring-emerald-500 focus-visible:ring-offset-2"
          >
            Get Started
            <ArrowRight className="w-5 h-5" />
          </motion.a>
        </div>

        {/* Secondary link */}
        <button
          onClick={scrollToTop}
          className="mt-4 text-sm text-gray-400 dark:text-gray-500 hover:text-blue-600 dark:hover:text-emerald-400 transition-colors font-body cursor-pointer"
        >
          or try the demo first
        </button>
      </motion.div>
    </section>
  );
}
