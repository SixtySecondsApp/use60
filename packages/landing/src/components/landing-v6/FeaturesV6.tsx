import { motion } from 'framer-motion';
import { staggers, transitions } from '../../lib/animation-tokens';
import { SvgWrapper } from '../landing-v5/SvgWrapper';
import featureFollowupSvg from '../../svg/feature-followup.svg?raw';
import featurePrepSvg from '../../svg/feature-prep.svg?raw';
import featurePipelineSvg from '../../svg/feature-pipeline.svg?raw';

const features = [
  {
    svg: featureFollowupSvg,
    ariaLabel: 'Follow-up automation illustration',
    title: 'Follow-ups that actually happen',
    description: "Every email drafted, personalized, and ready to send. No more 'I forgot to reply.'",
  },
  {
    svg: featurePrepSvg,
    ariaLabel: 'Meeting prep illustration',
    title: 'Meeting prep in 30 seconds',
    description: 'Stakeholder history, deal context, talking points — all synthesized before you open your calendar.',
  },
  {
    svg: featurePipelineSvg,
    ariaLabel: 'Pipeline automation illustration',
    title: 'Pipeline that updates itself',
    description: 'Deals move, stages change, risks flag — automatically. Your CRM is always current.',
  },
];

const viewport = { once: true, margin: '-40px' as const };

export function FeaturesV6() {
  return (
    <section className="border-t border-zinc-800 py-24 sm:py-32 px-5 sm:px-6">
      <div className="max-w-5xl mx-auto">
        {/* Header */}
        <motion.p
          initial={{ opacity: 0, y: 12 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={viewport}
          transition={transitions.reveal}
          className="text-xs uppercase tracking-widest text-zinc-600 font-medium text-center"
        >
          Features
        </motion.p>

        <motion.h2
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={viewport}
          transition={{ ...transitions.reveal, delay: 0.08 }}
          className="mt-4 font-display text-3xl sm:text-4xl md:text-5xl font-bold tracking-tight text-center mb-14 sm:mb-16
            bg-gradient-to-b from-white via-white to-zinc-600 bg-clip-text text-transparent text-balance"
        >
          Everything before and after the call.
        </motion.h2>

        {/* Feature cards — each gets SVG + text stacked vertically */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {features.map((feature, i) => (
            <motion.div
              key={feature.title}
              initial={{ opacity: 0, y: 24 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={viewport}
              transition={{
                ...transitions.reveal,
                delay: i * staggers.slow,
              }}
              className="group rounded-xl border border-zinc-800 bg-white/[0.02] p-6 sm:p-8 flex flex-col
                hover:border-zinc-700 hover:bg-white/[0.03] transition-all duration-200"
            >
              {/* SVG illustration — centered, generous size */}
              <div className="flex items-center justify-center py-4 sm:py-6">
                <SvgWrapper
                  svg={feature.svg}
                  ariaLabel={feature.ariaLabel}
                  className="w-[140px] h-[140px] sm:w-[160px] sm:h-[160px]
                    group-hover:scale-[1.05] transition-transform duration-300 motion-reduce:transform-none"
                />
              </div>

              <h3 className="font-display text-lg sm:text-xl font-semibold text-white mb-2">
                {feature.title}
              </h3>
              <p className="text-sm text-zinc-400 leading-relaxed text-pretty">
                {feature.description}
              </p>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
