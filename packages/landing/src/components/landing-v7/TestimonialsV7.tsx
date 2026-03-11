import { motion } from 'framer-motion';
import { Quote } from 'lucide-react';

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

interface Testimonial {
  quote: string;
  name: string;
  role: string;
}

const TESTIMONIALS: Testimonial[] = [
  {
    quote:
      'I used to spend Sunday nights prepping for Monday meetings. Now I show up with better notes than I ever wrote myself \u2014 and I didn\u2019t do anything.',
    name: 'Jamie K.',
    role: 'Founder, SaaS startup',
  },
  {
    quote:
      'I was skeptical about AI writing my follow-ups. Then a prospect replied \u2018this is the most thoughtful follow-up email I\u2019ve ever received.\u2019 It was a 60 draft I sent in one tap.',
    name: 'Rachel M.',
    role: 'Account Executive',
  },
  {
    quote:
      'Three deals were about to die. 60 flagged all three before I even noticed. Two of them closed. The third got a rescue plan that bought us another month.',
    name: 'Daniel S.',
    role: 'Sales Manager',
  },
  {
    quote:
      'The morning brief changed my mornings. I used to open 4 tabs and scramble. Now I read one Slack message and I\u2019m ready.',
    name: 'Priya T.',
    role: 'Founder',
  },
];

export function TestimonialsV7() {
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
            From early users
          </motion.p>
        </motion.div>

        {/* Grid */}
        <motion.div
          variants={stagger}
          initial="hidden"
          whileInView="show"
          viewport={{ once: true, margin: '-60px' }}
          className="grid grid-cols-1 md:grid-cols-2 gap-4"
        >
          {TESTIMONIALS.map((testimonial) => (
            <motion.div
              key={testimonial.name}
              variants={fadeUp}
              className="bg-[#161616] border border-white/[0.08] rounded-xl p-6
                hover:border-white/[0.14] transition-colors"
            >
              <Quote className="w-5 h-5 text-stone-500 mb-4" />

              <p className="text-stone-300 text-base leading-relaxed italic mb-4">
                &ldquo;{testimonial.quote}&rdquo;
              </p>

              <p className="text-stone-500 text-sm">
                {testimonial.name} &middot; {testimonial.role}
              </p>
            </motion.div>
          ))}
        </motion.div>
      </div>
    </section>
  );
}
