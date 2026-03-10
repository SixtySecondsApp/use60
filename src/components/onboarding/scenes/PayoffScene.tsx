import { motion } from 'framer-motion';
import { BarChart3, Mail, Brain, ListChecks, ChevronRight } from 'lucide-react';
import { useTypewriter } from '../useTypewriter';
import { fadeIn, slideUp, staggerContainer } from '../animation-variants';
import type { WalkthroughData } from '../walkthrough-data';

const ICON_MAP = {
  BarChart3,
  Mail,
  Brain,
  ListChecks,
} as const;

type IconName = keyof typeof ICON_MAP;

interface PayoffSceneProps {
  data: WalkthroughData['payoff'];
  companyName: string;
  onFinish: () => void;
  onSkip: () => void;
}

export function PayoffScene({ data, companyName, onFinish, onSkip }: PayoffSceneProps) {
  const TYPEWRITER_SPEED = 40;
  const { displayText: headlineText, isComplete: headlineComplete } = useTypewriter(
    'This happens automatically.',
    TYPEWRITER_SPEED,
    0
  );

  const subline = `Every meeting. Every follow-up. Every deal — while you focus on closing revenue for ${companyName}.`;

  return (
    <div className="flex flex-col items-center justify-center gap-6 w-full px-4 py-8">
      {/* 1. Typewriter headline */}
      <div className="text-xl font-bold text-white text-center min-h-[2rem]">
        {headlineText}
        {!headlineComplete && (
          <motion.span
            animate={{ opacity: [1, 0] }}
            transition={{ duration: 0.5, repeat: Infinity, repeatType: 'reverse' }}
            className="inline-block w-0.5 h-5 bg-white ml-0.5 align-middle"
          />
        )}
      </div>

      {/* 2. Subline fade-in after typewriter */}
      <motion.p
        className="text-sm text-gray-400 text-center max-w-sm"
        variants={fadeIn}
        initial="hidden"
        animate={headlineComplete ? 'show' : 'hidden'}
        transition={{ delay: 0.3 }}
      >
        {subline}
      </motion.p>

      {/* 3. Capability grid fades in as a group after subline */}
      <motion.div
        className="grid grid-cols-2 gap-3 w-full max-w-sm"
        variants={staggerContainer}
        initial="hidden"
        animate={headlineComplete ? 'show' : 'hidden'}
        transition={{ delayChildren: 0.8, staggerChildren: 0.1 }}
      >
        {data.capabilities.map((cap) => {
          const IconComponent = ICON_MAP[cap.icon as IconName];
          return (
            <motion.div
              key={cap.label}
              className="rounded-lg bg-gray-800/40 p-3 text-center"
              variants={slideUp}
            >
              {IconComponent && (
                <IconComponent className="w-5 h-5 text-violet-400 mx-auto mb-1" />
              )}
              <div className="text-xs font-medium text-gray-200">{cap.label}</div>
              <div className="text-xs text-gray-500 mt-0.5">{cap.detail}</div>
            </motion.div>
          );
        })}
      </motion.div>

      {/* 4. CTA button with gradient shimmer */}
      <motion.div
        className="w-full max-w-sm flex flex-col items-center gap-3"
        variants={fadeIn}
        initial="hidden"
        animate={headlineComplete ? 'show' : 'hidden'}
        transition={{ delay: 1.4 }}
      >
        <div className="relative w-full overflow-hidden rounded-lg">
          <button
            onClick={onFinish}
            className="relative w-full bg-violet-600 hover:bg-violet-700 text-white rounded-lg py-3 px-6 font-medium flex items-center justify-center gap-2 transition-colors"
          >
            <span>Enter Your Command Centre</span>
            <ChevronRight className="w-4 h-4" />
          </button>
          {/* Gradient shimmer overlay */}
          <motion.div
            className="absolute inset-0 pointer-events-none rounded-lg"
            style={{
              backgroundImage:
                'linear-gradient(105deg, transparent 40%, rgba(255,255,255,0.18) 50%, transparent 60%)',
              backgroundSize: '200% 100%',
            }}
            initial={{ backgroundPosition: '200% center' }}
            animate={{ backgroundPosition: '-200% center' }}
            transition={{
              duration: 2.2,
              ease: 'linear',
              repeat: Infinity,
              repeatDelay: 1.2,
            }}
          />
        </div>

        {/* 5. Skip link */}
        <button
          onClick={onSkip}
          className="text-xs text-gray-500 hover:text-gray-400 transition-colors"
        >
          Skip — I'll explore on my own
        </button>
      </motion.div>
    </div>
  );
}
