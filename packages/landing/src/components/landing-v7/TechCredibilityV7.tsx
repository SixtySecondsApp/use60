import { motion } from 'framer-motion';
import skillNetworkSvg from './svg/SkillNetwork.svg?raw';

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

interface Stat {
  value: string;
  label: string;
}

const STATS: Stat[] = [
  { value: '127', label: 'Atomic skills' },
  { value: '25', label: 'Sequences' },
  { value: '100+', label: 'Edge functions' },
  { value: '28', label: 'Cron jobs' },
  { value: '15+', label: 'Integrations' },
  { value: 'Real-time', label: 'Context refresh' },
];

interface ArchPoint {
  title: string;
  description: string;
}

const ARCH_POINTS: ArchPoint[] = [
  {
    title: 'Proactive, not reactive',
    description:
      '28 cron jobs scan your pipeline nightly. 60 finds problems before you ask.',
  },
  {
    title: 'Human-in-the-loop',
    description:
      'Every external action requires one-tap approval. Trust builds over time.',
  },
  {
    title: 'Learning loop',
    description:
      'Tracks your edits, learns your voice, improves every week.',
  },
];

export function TechCredibilityV7() {
  return (
    <section className="bg-[#0c0c0c] py-28 md:py-36">
      <div className="max-w-6xl mx-auto px-6">
        {/* Header */}
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
            Under the hood
          </motion.p>

          <motion.h2
            variants={fadeUp}
            className="font-display font-bold text-4xl md:text-5xl tracking-tight text-stone-100 leading-[1.1]"
          >
            Not a wrapper. Not a chatbot. Infrastructure.
          </motion.h2>

          <motion.p
            variants={fadeUp}
            className="mt-6 text-stone-400 text-lg leading-relaxed max-w-3xl"
          >
            60 isn&apos;t an AI assistant bolted onto a CRM. It&apos;s a
            purpose-built intelligence layer with 127 skills, 28 proactive
            agents, and a context graph that connects every deal, contact, and
            conversation.
          </motion.p>
        </motion.div>

        {/* Animated skill network visualization */}
        <motion.div
          variants={fadeUp}
          initial="hidden"
          whileInView="show"
          viewport={{ once: true, margin: '-60px' }}
          className="mb-16"
        >
          <div
            className="w-full opacity-60"
            aria-hidden="true"
            dangerouslySetInnerHTML={{ __html: skillNetworkSvg }}
          />
        </motion.div>

        {/* Stats grid */}
        <motion.div
          variants={stagger}
          initial="hidden"
          whileInView="show"
          viewport={{ once: true, margin: '-60px' }}
          className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-6 mb-16"
        >
          {STATS.map((stat) => (
            <motion.div
              key={stat.label}
              variants={fadeUp}
              className="text-center"
            >
              <p className="font-display font-bold text-3xl text-stone-100">
                {stat.value}
              </p>
              <p className="text-stone-500 text-sm mt-1">{stat.label}</p>
            </motion.div>
          ))}
        </motion.div>

        {/* Architecture points */}
        <motion.div
          variants={stagger}
          initial="hidden"
          whileInView="show"
          viewport={{ once: true, margin: '-60px' }}
          className="grid grid-cols-1 md:grid-cols-3 gap-4"
        >
          {ARCH_POINTS.map((point) => (
            <motion.div
              key={point.title}
              variants={fadeUp}
              className="bg-[#161616] border border-white/[0.08] rounded-xl p-6
                hover:border-white/[0.14] transition-colors"
            >
              <h3 className="font-display font-bold text-stone-100 text-lg mb-2">
                {point.title}
              </h3>
              <p className="text-stone-400 text-sm leading-relaxed">
                {point.description}
              </p>
            </motion.div>
          ))}
        </motion.div>
      </div>
    </section>
  );
}
