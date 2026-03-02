import { useRef } from 'react';
import { motion, useScroll, useTransform } from 'framer-motion';
import { easings, staggers, transitions } from '../../lib/animation-tokens';
import { SvgWrapper } from './SvgWrapper';
import stepListenSvg from '../../svg/step-listen.svg?raw';
import stepDetectSvg from '../../svg/step-detect.svg?raw';
import stepExecuteSvg from '../../svg/step-execute.svg?raw';

const steps = [
  {
    number: '01',
    title: '60 listens',
    description:
      'Joins every meeting silently. Captures every word, every nuance, every commitment.',
    svg: stepListenSvg,
    ariaLabel: 'Step 1: 60 listens to your meetings',
  },
  {
    number: '02',
    title: '60 detects',
    description:
      'Finds buying signals, objections, action items, and risks. Tags everything.',
    svg: stepDetectSvg,
    ariaLabel: 'Step 2: 60 detects signals and action items',
  },
  {
    number: '03',
    title: '60 executes',
    description:
      'Follow-ups sent. Briefs built. Pipeline updated. Tasks created. Before you finish your coffee.',
    svg: stepExecuteSvg,
    ariaLabel: 'Step 3: 60 executes tasks automatically',
  },
];

export function HowItWorksV5() {
  const timelineRef = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({
    target: timelineRef,
    offset: ['start end', 'end start'],
  });
  const lineHeight = useTransform(scrollYProgress, [0, 1], ['0%', '100%']);

  return (
    <section className="py-20 sm:py-28 px-5 sm:px-6">
      <div className="max-w-5xl mx-auto">
        {/* Header */}
        <motion.h2
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-40px' }}
          transition={transitions.reveal}
          className="text-3xl sm:text-4xl md:text-5xl font-bold tracking-tight text-center mb-16 sm:mb-20 bg-gradient-to-b from-white via-white to-zinc-500 bg-clip-text text-transparent"
        >
          After the call, 60 takes over.
        </motion.h2>

        {/* Timeline */}
        <div ref={timelineRef} className="relative">
          {/* Vertical line (center on md+, left-aligned on mobile) */}
          <div className="absolute left-5 md:left-1/2 md:-translate-x-px top-0 bottom-0 w-px bg-white/[0.06]">
            <motion.div
              className="w-full bg-gradient-to-b from-violet-500/60 to-teal-500/60"
              style={{ height: lineHeight }}
            />
          </div>

          {/* Steps */}
          <div className="flex flex-col gap-16 sm:gap-20">
            {steps.map((step, i) => {
              const isEven = i % 2 === 0;
              return (
                <motion.div
                  key={step.number}
                  initial={{ opacity: 0, y: 24 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true, margin: '-60px' }}
                  transition={{
                    ...transitions.reveal,
                    delay: i * staggers.slow,
                  }}
                  className="relative grid grid-cols-[40px_1fr] md:grid-cols-[1fr_40px_1fr] items-center gap-4 md:gap-8"
                >
                  {/* Step number circle */}
                  <div
                    className={`
                      md:col-start-2 md:row-start-1
                      flex items-center justify-center w-10 h-10 rounded-full
                      border border-white/[0.08] bg-zinc-950 text-xs font-semibold text-zinc-400
                      z-10
                    `}
                  >
                    {step.number}
                  </div>

                  {/* Text content */}
                  <div
                    className={`
                      md:row-start-1
                      ${isEven ? 'md:col-start-1 md:text-right' : 'md:col-start-3 md:text-left'}
                    `}
                  >
                    <h3 className="text-xl sm:text-2xl font-bold text-white mb-2">
                      {step.title}
                    </h3>
                    <p className="text-sm sm:text-base text-zinc-400 max-w-sm inline-block">
                      {step.description}
                    </p>
                  </div>

                  {/* SVG illustration */}
                  <div
                    className={`
                      hidden md:flex
                      md:row-start-1
                      ${isEven ? 'md:col-start-3 md:justify-start' : 'md:col-start-1 md:justify-end'}
                    `}
                  >
                    <SvgWrapper
                      svg={step.svg}
                      ariaLabel={step.ariaLabel}
                      className="w-[200px] h-[120px]"
                    />
                  </div>
                </motion.div>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
}
