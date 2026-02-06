import { motion } from 'framer-motion';
import { Search, Clock, TrendingDown } from 'lucide-react';

export function ProblemSection() {
  const painPoints = [
    {
      icon: Search,
      title: 'Lost Insights',
      stat: '73%',
      description: 'of action items are forgotten within 24 hours of a meeting. Critical follow-ups slip through the cracks.',
      color: 'rose',
      gradient: 'from-rose-500/20 to-rose-500/5',
      borderColor: 'border-rose-500/30',
    },
    {
      icon: Clock,
      title: 'Manual Work',
      stat: '4 hrs/week',
      description: 'spent on meeting notes, follow-up emails, and CRM updates. Time that should be selling.',
      color: 'amber',
      gradient: 'from-amber-500/20 to-amber-500/5',
      borderColor: 'border-amber-500/30',
    },
    {
      icon: TrendingDown,
      title: 'No Coaching',
      stat: '0%',
      description: 'of reps get real-time feedback on their talk-time ratios. They wing it without data.',
      color: 'red',
      gradient: 'from-red-500/20 to-red-500/5',
      borderColor: 'border-red-500/30',
    },
  ];

  return (
    <section className="relative py-24 lg:py-32 bg-[#0a0d14] overflow-hidden">
      {/* Background Pattern */}
      <div className="absolute inset-0 opacity-[0.015]">
        <svg width="100%" height="100%">
          <defs>
            <pattern id="problem-pattern" x="0" y="0" width="40" height="40" patternUnits="userSpaceOnUse">
              <circle cx="1" cy="1" r="1" fill="white" />
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#problem-pattern)" />
        </svg>
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
            className="inline-block px-4 py-1.5 rounded-full bg-rose-500/10 border border-rose-500/20 text-rose-400 text-sm font-medium mb-4"
          >
            The Problem
          </motion.span>
          <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-white mb-6">
            Sales meetings are your biggest revenue opportunity—
            <span className="bg-gradient-to-r from-rose-400 to-orange-400 bg-clip-text text-transparent">
              and biggest time sink
            </span>
          </h2>
          <p className="text-lg text-gray-400">
            Sales reps spend only 28% of their week actively selling. The rest? Drowning in admin work and missed follow-ups.
          </p>
        </motion.div>

        {/* Pain Point Cards */}
        <div className="grid md:grid-cols-3 gap-6 lg:gap-8">
          {painPoints.map((point, idx) => (
            <motion.div
              key={idx}
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: idx * 0.15, duration: 0.6 }}
              className={`group relative p-6 lg:p-8 rounded-2xl bg-gradient-to-br ${point.gradient} border ${point.borderColor} hover:border-opacity-60 transition-all duration-300`}
            >
              {/* Icon */}
              <div className={`inline-flex items-center justify-center w-14 h-14 rounded-xl bg-${point.color}-500/20 border border-${point.color}-500/30 mb-6`}>
                <point.icon className={`w-7 h-7 text-${point.color}-400`} />
              </div>

              {/* Stat */}
              <div className={`text-4xl lg:text-5xl font-bold text-${point.color}-400 mb-2`}>
                {point.stat}
              </div>

              {/* Title */}
              <h3 className="text-xl font-semibold text-white mb-3">
                {point.title}
              </h3>

              {/* Description */}
              <p className="text-gray-400 leading-relaxed">
                {point.description}
              </p>

              {/* Decorative Element */}
              <div className={`absolute top-6 right-6 w-20 h-20 rounded-full bg-${point.color}-500/5 blur-2xl group-hover:bg-${point.color}-500/10 transition-all duration-500`} />
            </motion.div>
          ))}
        </div>

        {/* Bottom Stats */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ delay: 0.6, duration: 0.6 }}
          className="mt-16 p-6 lg:p-8 rounded-2xl bg-gradient-to-r from-white to-gray-50 dark:from-gray-900/80 dark:to-gray-900/40 border border-gray-200 dark:border-white/10"
        >
          <div className="flex flex-col md:flex-row items-center justify-between gap-6">
            <div className="text-center md:text-left">
              <div className="text-sm text-gray-500 uppercase tracking-wider mb-1">Industry Average</div>
              <div className="text-2xl font-bold text-white">
                Sales reps spend only <span className="text-rose-400">28%</span> of their week selling
              </div>
              <div className="text-sm text-gray-500 mt-1">Source: Salesforce State of Sales Report</div>
            </div>
            <div className="flex items-center gap-4">
              <div className="w-32 h-2 rounded-full bg-gray-800 overflow-hidden">
                <motion.div
                  initial={{ width: 0 }}
                  whileInView={{ width: '28%' }}
                  viewport={{ once: true }}
                  transition={{ delay: 0.8, duration: 1, ease: 'easeOut' }}
                  className="h-full bg-gradient-to-r from-rose-500 to-orange-500 rounded-full"
                />
              </div>
              <span className="text-rose-400 font-bold">28%</span>
            </div>
          </div>
        </motion.div>
      </div>
    </section>
  );
}

