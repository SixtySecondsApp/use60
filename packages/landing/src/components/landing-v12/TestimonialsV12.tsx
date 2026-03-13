import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Star } from 'lucide-react';

/* ------------------------------------------------------------------ */
/*  Data                                                               */
/* ------------------------------------------------------------------ */

interface Testimonial {
  quote: string;
  author: string;
  role: string;
  stars: number;
}

const AUDIENCES = ['Solo Founders', 'Sales Teams', 'Revenue Leaders'] as const;
type Audience = (typeof AUDIENCES)[number];

const TESTIMONIALS: Record<Audience, Testimonial[]> = {
  'Solo Founders': [
    {
      quote:
        'I was doing everything manually \u2014 prep, follow-ups, CRM updates. Now 60 handles it all. I just show up and close.',
      author: 'Jamie K.',
      role: 'Founder & CEO, Series A startup',
      stars: 5,
    },
    {
      quote:
        '60 is like having a sales ops team without hiring one. The follow-ups alone saved us from losing 3 deals last month.',
      author: 'Marcus R.',
      role: 'Solo Founder, B2B SaaS',
      stars: 5,
    },
  ],
  'Sales Teams': [
    {
      quote:
        "We were spending 3 hours a day on meeting prep and follow-ups. 60 cut that to minutes. It\u2019s not a tool \u2014 it\u2019s a teammate.",
      author: 'Rachel M.',
      role: 'Account Executive, 12-person sales team',
      stars: 5,
    },
    {
      quote:
        "The meeting prep is scary good. My reps walk into calls knowing things the prospect hasn\u2019t even told us yet.",
      author: 'David L.',
      role: 'VP Sales, 40-person sales org',
      stars: 5,
    },
  ],
  'Revenue Leaders': [
    {
      quote:
        'I used to dread Monday pipeline reviews. Now 60 flags risks before I even open my CRM. Game-changer for visibility.',
      author: 'Sarah T.',
      role: 'Head of Revenue, Growth-stage SaaS',
      stars: 5,
    },
    {
      quote:
        'We tried Clay, Apollo, and three other tools. 60 is the only one that actually does the work instead of just showing you data.',
      author: 'Alex P.',
      role: 'CRO, Mid-market SaaS',
      stars: 5,
    },
  ],
};

/* ------------------------------------------------------------------ */
/*  Animation variants                                                 */
/* ------------------------------------------------------------------ */

const fadeUp = {
  hidden: { opacity: 0, y: 24 },
  show: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.5, ease: [0.22, 1, 0.36, 1] },
  },
};

const stagger = {
  hidden: {},
  show: { transition: { staggerChildren: 0.1 } },
};

/* ------------------------------------------------------------------ */
/*  Star rating                                                        */
/* ------------------------------------------------------------------ */

function StarRating({ count }: { count: number }) {
  return (
    <div className="flex gap-0.5 mb-4">
      {Array.from({ length: count }).map((_, i) => (
        <Star
          key={i}
          className="w-4 h-4 fill-yellow-400 text-yellow-400"
        />
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Testimonial card                                                   */
/* ------------------------------------------------------------------ */

function TestimonialCard({ testimonial }: { testimonial: Testimonial }) {
  return (
    <motion.div
      variants={fadeUp}
      className="bg-white border border-gray-200 rounded-2xl p-8
        dark:bg-gradient-to-b dark:from-violet-500/[0.07] dark:to-transparent
        dark:border-white/[0.08]"
    >
      <StarRating count={testimonial.stars} />
      <p className="text-lg font-body italic text-gray-700 dark:text-gray-300 leading-relaxed mb-6">
        &ldquo;{testimonial.quote}&rdquo;
      </p>
      <div>
        <p className="font-semibold text-gray-900 dark:text-[#e1f0ff]">
          {testimonial.author}
        </p>
        <p className="text-sm text-gray-500 dark:text-[#8891b0]">
          {testimonial.role}
        </p>
      </div>
    </motion.div>
  );
}

/* ------------------------------------------------------------------ */
/*  TestimonialsV12                                                    */
/* ------------------------------------------------------------------ */

export function TestimonialsV12() {
  const [activeTab, setActiveTab] = useState<Audience>('Solo Founders');

  return (
    <section className="bg-white dark:bg-[#070b1a] py-24 md:py-32">
      <div className="max-w-6xl mx-auto px-6">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-60px' }}
          transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
          className="text-center mb-14"
        >
          <p className="text-sm font-medium text-violet-600 dark:text-violet-400 mb-4 tracking-wide uppercase">
            What teams are saying
          </p>
          <h2 className="font-display font-bold text-3xl md:text-4xl text-gray-900 dark:text-[#e1f0ff] tracking-tight">
            Sales teams that ship faster with 60
          </h2>
        </motion.div>

        {/* Tabs */}
        <div className="flex justify-center mb-12">
          <div className="relative flex gap-8">
            {AUDIENCES.map((audience) => (
              <button
                key={audience}
                onClick={() => setActiveTab(audience)}
                className={`relative pb-3 text-sm font-medium transition-colors cursor-pointer ${
                  activeTab === audience
                    ? 'text-gray-900 dark:text-white'
                    : 'text-gray-400 dark:text-[#8891b0] hover:text-gray-600 dark:hover:text-gray-300'
                }`}
              >
                {audience}
                {activeTab === audience && (
                  <motion.div
                    layoutId="testimonial-tab-indicator"
                    className="absolute bottom-0 left-0 right-0 h-0.5 bg-gradient-to-r from-violet-600 to-blue-500 rounded-full"
                    transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                  />
                )}
              </button>
            ))}
          </div>
        </div>

        {/* Cards */}
        <AnimatePresence mode="wait">
          <motion.div
            key={activeTab}
            variants={stagger}
            initial="hidden"
            animate="show"
            exit="hidden"
            className="grid grid-cols-1 md:grid-cols-2 gap-6"
          >
            {TESTIMONIALS[activeTab].map((t) => (
              <TestimonialCard key={t.author} testimonial={t} />
            ))}
          </motion.div>
        </AnimatePresence>
      </div>
    </section>
  );
}
