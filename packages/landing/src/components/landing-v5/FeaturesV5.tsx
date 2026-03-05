import { motion } from 'framer-motion';
import { easings, staggers, transitions } from '../../lib/animation-tokens';
import { SvgWrapper } from './SvgWrapper';
import featureFollowupSvg from '../../svg/feature-followup.svg?raw';
import featurePrepSvg from '../../svg/feature-prep.svg?raw';
import featurePipelineSvg from '../../svg/feature-pipeline.svg?raw';

const features = [
  {
    svg: featureFollowupSvg,
    ariaLabel: 'Follow-up automation illustration',
    title: 'Follow-ups that actually happen',
    description:
      "Every email drafted, personalized, and ready to send. No more 'I forgot to reply.'",
  },
  {
    svg: featurePrepSvg,
    ariaLabel: 'Meeting prep illustration',
    title: 'Meeting prep in 30 seconds',
    description:
      'Stakeholder history, deal context, talking points \u2014 all synthesized before you open your calendar.',
  },
  {
    svg: featurePipelineSvg,
    ariaLabel: 'Pipeline automation illustration',
    title: 'Pipeline that updates itself',
    description:
      'Deals move, stages change, risks flag \u2014 automatically. Your CRM is always current.',
  },
];

export function FeaturesV5() {
  return (
    <section className="border-t border-white/[0.04] py-20 sm:py-28 px-5 sm:px-6">
      <div className="max-w-5xl mx-auto">
        {/* Header */}
        <motion.h2
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-40px' }}
          transition={transitions.reveal}
          className="text-3xl sm:text-4xl md:text-5xl font-bold tracking-tight text-center mb-14 sm:mb-16 bg-gradient-to-b from-white via-white to-zinc-500 bg-clip-text text-transparent"
        >
          Everything before and after the call.
        </motion.h2>

        {/* Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 sm:gap-6">
          {features.map((feature, i) => (
            <motion.div
              key={feature.title}
              initial={{ opacity: 0, y: 24 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: '-40px' }}
              transition={{
                ...transitions.reveal,
                delay: i * staggers.slow,
              }}
              className="bg-white/[0.02] border border-white/[0.06] rounded-xl p-6 sm:p-8"
            >
              <SvgWrapper
                svg={feature.svg}
                ariaLabel={feature.ariaLabel}
                className="w-[120px] h-[120px] mb-5"
              />
              <h3 className="text-lg sm:text-xl font-semibold text-white mb-2">
                {feature.title}
              </h3>
              <p className="text-sm text-zinc-400 leading-relaxed">
                {feature.description}
              </p>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
