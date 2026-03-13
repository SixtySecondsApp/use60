import { motion } from 'framer-motion';

const fadeUp = {
  hidden: { opacity: 0, y: 24 },
  show: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.6, ease: [0.22, 1, 0.36, 1] },
  },
};

export function ValuePropV8() {
  return (
    <section className="bg-gray-50 dark:bg-[#111] py-24 md:py-32">
      <motion.div
        variants={fadeUp}
        initial="hidden"
        whileInView="show"
        viewport={{ once: true, margin: '-60px' }}
        className="max-w-3xl mx-auto px-6 text-center"
      >
        <h2 className="font-display font-bold text-3xl md:text-4xl text-gray-900 dark:text-white tracking-tight leading-tight">
          60 is the command center for your sales stack
        </h2>
        <p className="mt-6 text-gray-500 dark:text-gray-400 text-lg leading-relaxed font-body">
          Your CRM doesn't know what happened in the meeting. Your notetaker doesn't know what's in your pipeline.
          Your email doesn't know what's due. 60 connects to everything, builds a unified picture of every deal,
          and acts on it — follow-ups drafted, meetings prepped, stale deals flagged. All in your Slack,
          before you think about it.
        </p>
      </motion.div>
    </section>
  );
}
