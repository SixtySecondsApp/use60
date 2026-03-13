import { motion } from 'framer-motion';

const fadeUp = {
  hidden: { opacity: 0, y: 24 },
  show: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.6, ease: [0.22, 1, 0.36, 1] },
  },
};

export function ValuePropV11() {
  return (
    <section className="bg-gray-50 dark:bg-[#111] py-24 md:py-32">
      <motion.div
        variants={fadeUp}
        initial="hidden"
        whileInView="show"
        viewport={{ once: true, margin: '-60px' }}
        className="max-w-3xl mx-auto px-6 text-center"
      >
        <span className="inline-block text-sm font-medium text-blue-600 dark:text-emerald-500 mb-6 tracking-wide uppercase">
          The Problem
        </span>
        <h2 className="font-display font-bold text-3xl md:text-4xl text-gray-900 dark:text-white tracking-tight leading-tight">
          Your sales stack is broken. Your team is stuck in the cracks.
        </h2>
        <p className="mt-6 text-gray-500 dark:text-gray-400 text-lg leading-relaxed font-body">
          Your CRM doesn't know what happened on the call. Your notetaker doesn't know what's in your pipeline.
          Your outreach tool doesn't know who's worth reaching out to. And you're paying for 6 different tools
          that don't talk to each other.
        </p>
        <p className="mt-4 text-gray-500 dark:text-gray-400 text-lg leading-relaxed font-body">
          60 is the command center that connects everything — CRM, email, calendar, LinkedIn, outreach — into
          one AI-powered system. It doesn't just show you data. It finds leads, writes sequences, preps meetings,
          follows up, generates proposals, and keeps your pipeline clean. All before you think about it.
        </p>
      </motion.div>
    </section>
  );
}
