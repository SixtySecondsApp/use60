import { motion } from 'framer-motion';
import { Star, Quote } from 'lucide-react';

export function TestimonialSection() {
  const testimonials = [
    {
      quote: "Sixty's meeting intelligence cut our follow-up time by 60%. Action items sync automatically—it's like having an assistant in every call.",
      name: 'Sarah Chen',
      title: 'VP of Sales',
      company: 'TechScale',
      avatar: 'SC',
      rating: 5,
      color: 'blue',
    },
    {
      quote: "The sentiment analysis helps us coach junior reps on what language actually closes deals. We've seen a 23% improvement in close rates.",
      name: 'Marcus Johnson',
      title: 'Sales Director',
      company: 'GrowthForce',
      avatar: 'MJ',
      rating: 5,
      color: 'emerald',
    },
    {
      quote: "Semantic search is a game-changer. I can instantly find every objection we've faced this quarter and build better battle cards.",
      name: 'Amanda Rodriguez',
      title: 'Head of Enablement',
      company: 'CloudFirst',
      avatar: 'AR',
      rating: 5,
      color: 'purple',
    },
  ];

  return (
    <section id="testimonials" className="relative py-24 lg:py-32 bg-[#0a0d14] overflow-hidden">
      {/* Background */}
      <div className="absolute inset-0 opacity-30">
        <div className="absolute top-1/4 left-0 w-96 h-96 rounded-full bg-blue-500/10 blur-3xl" />
        <div className="absolute bottom-1/4 right-0 w-96 h-96 rounded-full bg-purple-500/10 blur-3xl" />
      </div>

      <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Section Header */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="text-center max-w-3xl mx-auto mb-16"
        >
          <motion.span
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            viewport={{ once: true }}
            className="inline-block px-4 py-1.5 rounded-full bg-amber-500/10 border border-amber-500/20 text-amber-400 text-sm font-medium mb-4"
          >
            Testimonials
          </motion.span>
          <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-white mb-6">
            Trusted by{' '}
            <span className="bg-gradient-to-r from-amber-400 to-orange-400 bg-clip-text text-transparent">
              Sales Teams
            </span>{' '}
            Everywhere
          </h2>
          <p className="text-lg text-gray-400">
            See what revenue leaders are saying about Sixty's meeting intelligence.
          </p>
        </motion.div>

        {/* Testimonials Grid */}
        <div className="grid md:grid-cols-3 gap-6 lg:gap-8">
          {testimonials.map((testimonial, idx) => (
            <motion.div
              key={idx}
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: idx * 0.15, duration: 0.6 }}
              className="relative group"
            >
              <div className="relative h-full p-6 lg:p-8 rounded-2xl bg-gradient-to-br from-white to-gray-50 dark:from-gray-900/80 dark:to-gray-900/40 border border-gray-200 dark:border-white/10 hover:border-gray-300 dark:hover:border-white/20 transition-all duration-300 backdrop-blur-sm">
                {/* Quote Icon */}
                <div className={`absolute -top-3 -left-3 p-2 rounded-xl bg-${testimonial.color}-500/20 border border-${testimonial.color}-500/30`}>
                  <Quote className={`w-5 h-5 text-${testimonial.color}-400`} />
                </div>

                {/* Rating */}
                <div className="flex gap-1 mb-4">
                  {Array.from({ length: testimonial.rating }).map((_, i) => (
                    <Star key={i} className="w-4 h-4 text-amber-400 fill-amber-400" />
                  ))}
                </div>

                {/* Quote */}
                <p className="text-gray-300 leading-relaxed mb-6 text-lg">
                  "{testimonial.quote}"
                </p>

                {/* Author */}
                <div className="flex items-center gap-4">
                  <div className={`w-12 h-12 rounded-full bg-gradient-to-br from-${testimonial.color}-500 to-${testimonial.color}-700 flex items-center justify-center text-white font-bold`}>
                    {testimonial.avatar}
                  </div>
                  <div>
                    <div className="font-semibold text-white">{testimonial.name}</div>
                    <div className="text-sm text-gray-500">
                      {testimonial.title}, {testimonial.company}
                    </div>
                  </div>
                </div>

                {/* Decorative Glow */}
                <div className={`absolute inset-0 rounded-2xl bg-${testimonial.color}-500/5 opacity-0 group-hover:opacity-100 transition-opacity duration-300`} />
              </div>
            </motion.div>
          ))}
        </div>

        {/* Stats Banner */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ delay: 0.6, duration: 0.6 }}
          className="mt-16 grid grid-cols-2 md:grid-cols-4 gap-6 p-6 lg:p-8 rounded-2xl bg-gradient-to-r from-blue-500/5 via-purple-500/5 to-emerald-500/5 border border-white/10"
        >
          {[
            { value: '4.9/5', label: 'Average Rating' },
            { value: '500+', label: 'Happy Teams' },
            { value: '40%', label: 'Faster Deals' },
            { value: '60%', label: 'Time Saved' },
          ].map((stat, idx) => (
            <div key={idx} className="text-center">
              <div className="text-2xl lg:text-3xl font-bold bg-gradient-to-r from-white to-gray-400 bg-clip-text text-transparent">
                {stat.value}
              </div>
              <div className="text-sm text-gray-500">{stat.label}</div>
            </div>
          ))}
        </motion.div>
      </div>
    </section>
  );
}

