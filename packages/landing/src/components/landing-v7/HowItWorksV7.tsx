import { motion } from 'framer-motion';

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

interface Step {
  number: string;
  title: string;
  description: string;
  tag: string;
}

const STEPS: Step[] = [
  {
    number: '01',
    title: 'Connect',
    description:
      'Link your CRM, calendar, and Slack. 60 builds the context graph \u2014 every deal, contact, meeting, and email in one place.',
    tag: '5 minutes',
  },
  {
    number: '02',
    title: '60 learns',
    description:
      '60 scans your pipeline, reads your meeting history, and starts working. Follow-ups drafted. Meetings prepped. Stale deals flagged. All in your Slack.',
    tag: 'First actions within 24 hours',
  },
  {
    number: '03',
    title: 'You close',
    description:
      'Review and approve from Slack. Edit when you want. Dismiss what you don\u2019t need. 60 learns from every interaction and gets sharper over time.',
    tag: 'Gets better every week',
  },
];

export function HowItWorksV7() {
  return (
    <section className="bg-[#0c0c0c] py-28 md:py-36">
      <div className="max-w-6xl mx-auto px-6">
        <motion.div
          variants={stagger}
          initial="hidden"
          whileInView="show"
          viewport={{ once: true, margin: '-60px' }}
          className="max-w-3xl mb-14"
        >
          <motion.p
            variants={fadeUp}
            className="text-stone-500 text-sm font-medium tracking-wide uppercase mb-4"
          >
            How it works
          </motion.p>

          <motion.h2
            variants={fadeUp}
            className="font-display font-bold text-4xl md:text-5xl tracking-tight text-stone-100 leading-[1.1]"
          >
            Three steps. Then it just runs.
          </motion.h2>
        </motion.div>

        <motion.div
          variants={stagger}
          initial="hidden"
          whileInView="show"
          viewport={{ once: true, margin: '-60px' }}
          className="grid grid-cols-1 md:grid-cols-3 gap-4"
        >
          {STEPS.map((step) => (
            <motion.div
              key={step.number}
              variants={fadeUp}
              className="bg-[#161616] border border-white/[0.08] rounded-xl p-6
                hover:border-white/[0.14] transition-colors"
            >
              <span className="font-mono text-purple-400 text-sm">
                {step.number}
              </span>

              <h3 className="font-display font-bold text-stone-100 text-xl mt-3 mb-3">
                {step.title}
              </h3>

              <p className="text-stone-400 text-base leading-relaxed mb-6">
                {step.description}
              </p>

              <span className="font-mono text-xs text-stone-500">
                {step.tag}
              </span>
            </motion.div>
          ))}
        </motion.div>
      </div>
    </section>
  );
}
