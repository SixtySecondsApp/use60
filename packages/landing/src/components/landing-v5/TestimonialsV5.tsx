import { motion } from 'framer-motion';
import { easings, staggers, transitions } from '../../lib/animation-tokens';
import { SvgWrapper } from './SvgWrapper';
import quoteAccentSvg from '../../svg/quote-accent.svg?raw';

const testimonials = [
  {
    quote:
      'I used to spend Sunday nights prepping for Monday meetings. Now I show up with better notes than I ever wrote myself.',
    name: 'Early access user',
    title: 'Founder',
  },
  {
    quote:
      "I was skeptical about AI writing my follow-ups. Then a prospect replied 'this is the most thoughtful email I've gotten.' It was 60.",
    name: 'Early access user',
    title: 'Head of Sales',
  },
  {
    quote:
      'Three deals were about to die. 60 flagged all three before I noticed. Two of them closed.',
    name: 'Early access user',
    title: 'CEO',
  },
];

export function TestimonialsV5() {
  return (
    <section className="border-t border-white/[0.04] py-20 sm:py-28 px-5 sm:px-6">
      <div className="max-w-5xl mx-auto">
        {/* Overline */}
        <motion.p
          initial={{ opacity: 0, y: 12 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-40px' }}
          transition={transitions.reveal}
          className="text-xs uppercase tracking-widest text-zinc-600 text-center mb-10 sm:mb-14"
        >
          From early users
        </motion.p>

        {/* Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 sm:gap-6">
          {testimonials.map((testimonial, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, y: 24 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: '-40px' }}
              transition={{
                ...transitions.reveal,
                delay: i * staggers.slow,
              }}
              className="relative bg-white/[0.02] border border-white/[0.06] rounded-xl p-5 sm:p-6"
            >
              {/* Quote accent */}
              <div className="absolute top-3 left-3 opacity-30 pointer-events-none">
                <SvgWrapper
                  svg={quoteAccentSvg}
                  ariaLabel=""
                  className="w-8 h-8"
                />
              </div>

              {/* Quote */}
              <p className="relative text-sm text-zinc-300 leading-relaxed mb-5 pt-6">
                {testimonial.quote}
              </p>

              {/* Attribution */}
              <div className="text-xs">
                <span className="text-zinc-400 font-medium">
                  {testimonial.name}
                </span>
                <span className="text-zinc-600"> &middot; </span>
                <span className="text-zinc-500">{testimonial.title}</span>
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
