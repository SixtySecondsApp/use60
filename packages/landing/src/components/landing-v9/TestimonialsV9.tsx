import { motion } from 'framer-motion';

interface Testimonial {
  quote: string;
  author: string;
  role: string;
}

const TESTIMONIALS: Testimonial[] = [
  {
    quote:
      "I used to spend Sunday nights prepping for Monday meetings. Now I show up with better notes than I ever wrote myself — and I didn't do anything.",
    author: 'Jamie K.',
    role: 'Founder, SaaS startup',
  },
  {
    quote:
      "I was skeptical about AI writing my follow-ups. Then a prospect replied 'this is the most thoughtful follow-up email I've ever received.' It was a 60 draft I sent in one tap.",
    author: 'Rachel M.',
    role: 'Account Executive',
  },
  {
    quote:
      'Three deals were about to die. 60 flagged all three before I even noticed. Two of them closed. The third got a rescue plan that bought us another month.',
    author: 'Daniel S.',
    role: 'Sales Manager',
  },
  {
    quote:
      "The morning brief changed my mornings. I used to open 4 tabs and scramble. Now I read one Slack message and I'm ready.",
    author: 'Priya T.',
    role: 'Founder doing her own sales',
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

export function TestimonialsV9() {
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
          {TESTIMONIALS.map((t, i) => (
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
