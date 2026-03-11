import { motion } from 'framer-motion';
import { Quote } from 'lucide-react';
import { staggers, transitions } from '../../lib/animation-tokens';

const testimonials = [
  {
    quote: 'I used to spend Sunday nights prepping for Monday meetings. Now I show up with better notes than I ever wrote myself.',
    name: 'Early access user',
    title: 'Founder',
  },
  {
    quote: "I was skeptical about AI writing my follow-ups. Then a prospect replied 'this is the most thoughtful email I\u2019ve gotten.' It was 60.",
    name: 'Early access user',
    title: 'Head of Sales',
  },
  {
    quote: 'Three deals were about to die. 60 flagged all three before I noticed. Two of them closed.',
    name: 'Early access user',
    title: 'CEO',
  },
];

const viewport = { once: true, margin: '-40px' as const };

export function TestimonialsV6() {
  return (
    <section className="border-t border-zinc-800 py-24 sm:py-32 px-5 sm:px-6">
      <div className="max-w-5xl mx-auto">
        {/* Overline */}
        <motion.p
          initial={{ opacity: 0, y: 12 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={viewport}
          transition={transitions.reveal}
          className="text-xs uppercase tracking-widest text-zinc-600 text-center mb-12 sm:mb-14 font-medium"
        >
          From early users
        </motion.p>

        {/* Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 sm:gap-5">
          {testimonials.map((testimonial, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, y: 24 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={viewport}
              transition={{
                ...transitions.reveal,
                delay: i * staggers.slow,
              }}
              className="relative rounded-xl border border-zinc-800 bg-white/[0.02] p-6
                hover:border-zinc-700 hover:bg-white/[0.03] transition-colors duration-200"
            >
              {/* Quote icon */}
              <Quote className="w-6 h-6 text-zinc-700 mb-4" aria-hidden="true" />

              {/* Quote text */}
              <p className="text-sm text-zinc-300 leading-relaxed mb-6 text-pretty">
                {testimonial.quote}
              </p>

              {/* Attribution */}
              <div className="flex items-center gap-3">
                {/* Avatar placeholder — gradient circle */}
                <div className="w-8 h-8 rounded-full bg-gradient-to-br from-violet-500/20 to-teal-500/20 border border-zinc-800" />
                <div className="text-xs">
                  <span className="text-zinc-400 font-medium">{testimonial.name}</span>
                  <span className="text-zinc-600"> &middot; </span>
                  <span className="text-zinc-400">{testimonial.title}</span>
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
