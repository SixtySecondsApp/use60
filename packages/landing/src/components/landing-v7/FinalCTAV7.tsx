import { motion } from 'framer-motion';
import { ArrowRight } from 'lucide-react';

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

interface FinalCTAV7Props {
  onTryFree: () => void;
}

export function FinalCTAV7({ onTryFree }: FinalCTAV7Props) {
  return (
    <section className="bg-[#0c0c0c] py-28 md:py-36">
      <motion.div
        variants={stagger}
        initial="hidden"
        whileInView="show"
        viewport={{ once: true, margin: '-60px' }}
        className="max-w-6xl mx-auto px-6 flex flex-col items-center text-center"
      >
        <motion.h2
          variants={fadeUp}
          className="font-display font-bold text-4xl md:text-5xl tracking-tight text-stone-100 leading-[1.1]"
        >
          Your next follow-up is 60 seconds away.
        </motion.h2>

        <motion.p
          variants={fadeUp}
          className="mt-6 text-stone-400 text-lg leading-relaxed"
        >
          Enter a website, watch 60 work. No signup, no credit card, no sales
          call.
        </motion.p>

        <motion.button
          variants={fadeUp}
          onClick={onTryFree}
          className="mt-10 inline-flex items-center gap-2 bg-stone-100 text-[#0c0c0c] hover:bg-white
            rounded-lg px-8 py-3 font-medium text-lg transition-colors
            focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-400
            focus-visible:ring-offset-2 focus-visible:ring-offset-[#0c0c0c]"
        >
          Try it free
          <ArrowRight className="w-5 h-5" />
        </motion.button>

        <motion.p
          variants={fadeUp}
          className="mt-4 text-stone-500 text-sm"
        >
          Just results.
        </motion.p>
      </motion.div>
    </section>
  );
}
