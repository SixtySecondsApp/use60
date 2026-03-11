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

interface IntegrationCategory {
  label: string;
  items: string[];
}

const CATEGORIES: IntegrationCategory[] = [
  {
    label: 'CRM',
    items: ['HubSpot', 'Attio', 'Bullhorn'],
  },
  {
    label: 'Email & Calendar',
    items: ['Gmail', 'Outlook', 'Google Calendar'],
  },
  {
    label: 'Meeting Intelligence',
    items: ['Fathom'],
  },
  {
    label: 'Outreach & Data',
    items: ['Apollo', 'Instantly', 'AI Ark', 'Explorium', 'Apify'],
  },
  {
    label: 'Communication',
    items: ['Slack'],
  },
];

export function IntegrationGridV7() {
  return (
    <section id="integrations" className="bg-[#0c0c0c] py-28 md:py-36">
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
            Integrations
          </motion.p>

          <motion.h2
            variants={fadeUp}
            className="font-display font-bold text-4xl md:text-5xl tracking-tight text-stone-100 leading-[1.1]"
          >
            Connects to everything. Replaces nothing.
          </motion.h2>

          <motion.p
            variants={fadeUp}
            className="mt-6 text-stone-400 text-lg leading-relaxed max-w-3xl"
          >
            60 doesn&apos;t replace your CRM or your calendar. It connects to them,
            reads the context, and adds intelligence on top. Keep your stack. Add a
            brain.
          </motion.p>
        </motion.div>

        {/* Category groups */}
        <motion.div
          variants={stagger}
          initial="hidden"
          whileInView="show"
          viewport={{ once: true, margin: '-60px' }}
          className="space-y-8"
        >
          {CATEGORIES.map((category) => (
            <motion.div key={category.label} variants={fadeUp}>
              <p className="text-stone-500 text-xs uppercase tracking-wide font-medium mb-3">
                {category.label}
              </p>
              <div className="flex flex-wrap gap-3">
                {category.items.map((item) => (
                  <div
                    key={item}
                    className="bg-[#161616] border border-white/[0.08] rounded-lg px-4 py-3
                      text-stone-100 text-sm font-medium
                      hover:border-white/[0.14] transition-colors"
                  >
                    {item}
                  </div>
                ))}
              </div>
            </motion.div>
          ))}
        </motion.div>
      </div>
    </section>
  );
}
