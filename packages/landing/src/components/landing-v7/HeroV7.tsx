import { motion } from 'framer-motion';
import { DemoUrlInput } from '../landing-v5/DemoUrlInput';

interface HeroV7Props {
  onSubmit: (url: string) => void;
  inputRef: React.RefObject<HTMLInputElement | null>;
}

const stagger = {
  hidden: {},
  show: {
    transition: {
      staggerChildren: 0.08,
    },
  },
};

const fadeUp = {
  hidden: { opacity: 0, y: 24 },
  show: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.6, ease: [0.22, 1, 0.36, 1] },
  },
};

export function HeroV7({ onSubmit, inputRef }: HeroV7Props) {
  return (
    <section className="relative min-h-[90vh] flex items-center bg-[#0c0c0c] overflow-hidden">
      {/* Subtle radial gradient atmosphere */}
      <div
        className="pointer-events-none absolute inset-0"
        aria-hidden="true"
        style={{
          background:
            'radial-gradient(ellipse 60% 40% at 50% 0%, rgba(147, 51, 234, 0.05) 0%, transparent 70%)',
        }}
      />

      <div className="relative max-w-6xl mx-auto px-6 w-full pt-32 pb-20 md:pt-40 md:pb-28">
        <motion.div
          variants={stagger}
          initial="hidden"
          animate="show"
          className="flex flex-col items-center text-center"
        >
          {/* Badge */}
          <motion.span
            variants={fadeUp}
            className="inline-flex items-center px-4 py-1.5 rounded-full text-sm font-medium font-body
              bg-purple-400/10 text-purple-400 mb-8"
          >
            Early access
          </motion.span>

          {/* Headline */}
          <motion.h1
            variants={fadeUp}
            className="font-display font-extrabold text-5xl md:text-7xl tracking-tight text-stone-100 leading-[1.08]"
          >
            You sell.
            <br />
            60 does the rest.
          </motion.h1>

          {/* Subheadline */}
          <motion.p
            variants={fadeUp}
            className="mt-6 text-stone-400 text-xl font-body max-w-2xl leading-relaxed"
          >
            The AI command center for sales. Follow-ups, meeting prep, pipeline
            — handled before you think about it.
          </motion.p>

          {/* Demo URL input */}
          <motion.div variants={fadeUp} className="mt-10 w-full max-w-lg">
            <DemoUrlInput onSubmit={onSubmit} ref={inputRef} />
          </motion.div>

          {/* Micro-copy */}
          <motion.p
            variants={fadeUp}
            className="mt-4 text-stone-500 text-sm font-body"
          >
            30 seconds. No signup required.
          </motion.p>
        </motion.div>
      </div>
    </section>
  );
}
