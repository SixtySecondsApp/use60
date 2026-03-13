import { motion } from 'framer-motion';

interface Testimonial {
  quote: string;
  author: string;
  role: string;
}

const TESTIMONIALS: Testimonial[] = [
  {
    quote:
      "We were spending 3 hours a day on meeting prep and follow-ups. 60 cut that to minutes. It's not a tool — it's a teammate.",
    author: 'Rachel M.',
    role: 'Account Executive, B2B SaaS (12-person team)',
  },
  {
    quote:
      "I used to dread Monday pipeline reviews. Now 60 flags the risks before I even open my CRM. Game-changer for a founder doing sales solo.",
    author: 'Jamie K.',
    role: 'Founder & CEO, Series A startup',
  },
  {
    quote:
      "The meeting prep is scary good. My reps walk into calls knowing things the prospect hasn't even told us yet.",
    author: 'David L.',
    role: 'VP Sales, 40-person sales org',
  },
  {
    quote:
      "We tried Clay, Apollo, and three other tools. 60 is the only one that actually does the work instead of just showing you data.",
    author: 'Sarah T.',
    role: 'Head of Revenue, Growth-stage SaaS',
  },
];

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
  show: { transition: { staggerChildren: 0.08 } },
};

export function TestimonialsV10() {
  return (
    <section className="bg-white dark:bg-[#0a0a0a] py-24 md:py-32">
      <div className="max-w-6xl mx-auto px-6">
        <motion.div
          variants={fadeUp}
          initial="hidden"
          whileInView="show"
          viewport={{ once: true, margin: '-60px' }}
          className="text-center mb-16"
        >
          <p className="text-sm font-medium text-blue-600 dark:text-emerald-500 mb-4 tracking-wide uppercase">
            From early users
          </p>
          <h2 className="font-display font-bold text-3xl md:text-4xl text-gray-900 dark:text-white tracking-tight">
            Teams building pipeline faster with 60
          </h2>
        </motion.div>

        <motion.div
          variants={stagger}
          initial="hidden"
          whileInView="show"
          viewport={{ once: true, margin: '-60px' }}
          className="grid grid-cols-1 md:grid-cols-2 gap-6"
        >
          {TESTIMONIALS.map((t) => (
            <motion.div
              key={t.author}
              variants={fadeUp}
              className="bg-gray-50 dark:bg-[#111] border border-gray-100 dark:border-white/5 rounded-xl p-8"
            >
              <p className="text-gray-700 dark:text-gray-300 text-base leading-relaxed font-body mb-6 italic">
                "{t.quote}"
              </p>
              <div>
                <p className="font-medium text-gray-900 dark:text-white text-sm">{t.author}</p>
                <p className="text-gray-400 dark:text-gray-500 text-sm">{t.role}</p>
              </div>
            </motion.div>
          ))}
        </motion.div>
      </div>
    </section>
  );
}
