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
/*  FinalCTAV12                                                        */
/* ------------------------------------------------------------------ */

export function FinalCTAV12() {
  const { ref, offset, handleMouseMove, handleMouseLeave } = useMagneticButton(0.3);

  const scrollToTop = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.preventDefault();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <section className="relative bg-gray-50 dark:bg-[#070b1a] py-24 md:py-32 overflow-hidden">
      {/* Radial gradient glow */}
      <div className="absolute inset-0 pointer-events-none" aria-hidden="true">
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[700px] h-[700px] rounded-full opacity-[0.08] blur-[140px] bg-violet-600" />
      </div>

      <motion.div
        initial={{ opacity: 0, y: 24 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: '-60px' }}
        transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
        className="relative z-10 max-w-2xl mx-auto px-6 text-center"
      >
        <h2 className="font-display font-bold text-3xl md:text-5xl text-gray-900 dark:text-[#e1f0ff] tracking-tight">
          Your next follow-up is 60 seconds away
        </h2>
        <p className="mt-6 text-gray-500 dark:text-[#8891b0] text-lg font-body">
          Start automating meeting prep, follow-ups, and pipeline hygiene today.
        </p>

        {/* Primary CTA — magnetic hover */}
        <div className="mt-10" onMouseMove={handleMouseMove} onMouseLeave={handleMouseLeave}>
          <motion.a
            ref={ref}
            href="https://app.use60.com/auth/signup"
            animate={{ x: offset.x, y: offset.y }}
            transition={{ type: 'spring', stiffness: 300, damping: 20, mass: 0.5 }}
            className="inline-flex items-center gap-2 px-8 py-4 rounded-xl text-base font-semibold
              bg-gradient-to-r from-violet-600 to-blue-500 text-white
              hover:shadow-[0_0_30px_-5px_rgba(124,58,237,0.5)]
              transition-all
              focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:ring-offset-2
              dark:focus-visible:ring-offset-[#070b1a]"
          >
            Get Started
            <ArrowRight className="w-5 h-5" />
          </motion.a>
        </div>

        {/* Secondary link */}
        <button
          onClick={scrollToTop}
          className="mt-4 text-sm text-gray-400 dark:text-[#8891b0] hover:text-violet-600 dark:hover:text-violet-400 transition-colors font-body cursor-pointer"
        >
          Or try the demo &mdash; enter any company domain above
        </button>
      </motion.div>
    </section>
  );
}
