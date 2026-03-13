import { motion } from 'framer-motion';
import { Rocket, Target, Users } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

/* ------------------------------------------------------------------ */
/*  Persona data                                                       */
/* ------------------------------------------------------------------ */

interface Persona {
  icon: LucideIcon;
  title: string;
  pain: string;
  solution: string;
  feature: string;
}

const PERSONAS: Persona[] = [
  {
    icon: Rocket,
    title: 'Solo Founders',
    pain: 'Too busy building to do sales admin. Lives in the calendar, neglects everything else.',
    solution:
      '60 handles meeting prep, follow-ups, and pipeline hygiene automatically. You focus on closing.',
    feature: 'AI follow-ups drafted before you think about them',
  },
  {
    icon: Target,
    title: 'Sales Reps',
    pain: 'Toggling between 6 tools. Half the day is admin, not selling.',
    solution:
      '60 connects your CRM, email, and calendar into one view. Every deal, every signal, every action \u2014 in one place.',
    feature: 'Meeting prep delivered to Slack, automatically',
  },
  {
    icon: Users,
    title: 'Sales Managers',
    pain: "Can't see what reps are doing. Deals slip without warning. Coaching takes hours.",
    solution:
      '60 surfaces deal risks, tracks team activity, and generates coaching insights from every call.',
    feature: 'Team coaching dashboard with call analysis',
  },
];

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
  show: { transition: { staggerChildren: 0.12 } },
};

/* ------------------------------------------------------------------ */
/*  PersonaCard                                                        */
/* ------------------------------------------------------------------ */

function PersonaCard({ persona }: { persona: Persona }) {
  const Icon = persona.icon;

  return (
    <motion.div
      variants={fadeUp}
      className="bg-gray-50 dark:bg-[#111] rounded-2xl p-8 border border-gray-100 dark:border-white/5"
    >
      {/* Icon */}
      <div className="w-12 h-12 bg-blue-50 dark:bg-emerald-500/10 rounded-xl flex items-center justify-center mb-5">
        <Icon className="w-6 h-6 text-blue-600 dark:text-emerald-400" />
      </div>

      {/* Title */}
      <h3 className="font-display font-bold text-xl text-gray-900 dark:text-white mb-3">
        {persona.title}
      </h3>

      {/* Pain point */}
      <p className="text-sm text-gray-400 dark:text-zinc-500 italic leading-relaxed mb-4">
        {persona.pain}
      </p>

      {/* Solution */}
      <p className="text-sm text-gray-600 dark:text-zinc-300 leading-relaxed mb-5">
        {persona.solution}
      </p>

      {/* Key feature badge */}
      <span className="inline-block bg-blue-50 dark:bg-emerald-500/10 text-blue-600 dark:text-emerald-400 text-xs px-3 py-1 rounded-full">
        {persona.feature}
      </span>
    </motion.div>
  );
}

/* ------------------------------------------------------------------ */
/*  PersonasV10                                                        */
/* ------------------------------------------------------------------ */

export function PersonasV10() {
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
            Built for your role
          </p>
          <h2 className="font-display font-bold text-3xl md:text-5xl text-gray-900 dark:text-white tracking-tight">
            Whether you're closing deals or coaching reps.
          </h2>
          <p className="mt-4 text-gray-500 dark:text-zinc-400 text-lg font-body max-w-2xl mx-auto">
            60 adapts to how you work.
          </p>
        </motion.div>

        {/* Persona cards */}
        <motion.div
          variants={stagger}
          initial="hidden"
          whileInView="show"
          viewport={{ once: true, margin: '-60px' }}
          className="grid grid-cols-1 md:grid-cols-3 gap-6"
        >
          {PERSONAS.map((persona) => (
            <PersonaCard key={persona.title} persona={persona} />
          ))}
        </motion.div>
      </div>
    </section>
  );
}
