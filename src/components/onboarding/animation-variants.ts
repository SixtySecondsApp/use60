import type { Variants, MotionProps } from 'framer-motion';

// Violet-600 design token
const VIOLET_600 = '#7c3aed';

export const staggerContainer: Variants = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: {
      staggerChildren: 0.15,
      delayChildren: 0.2,
    },
  },
};

export const slideUp: Variants = {
  hidden: { opacity: 0, y: 20 },
  show: {
    opacity: 1,
    y: 0,
    transition: {
      duration: 0.5,
      ease: [0.25, 0.46, 0.45, 0.94],
    },
  },
};

export const fadeIn: Variants = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: { duration: 0.4 },
  },
};

export const scaleIn: Variants = {
  hidden: { opacity: 0, scale: 0.9 },
  show: {
    opacity: 1,
    scale: 1,
    transition: {
      duration: 0.4,
      ease: [0.25, 0.46, 0.45, 0.94],
    },
  },
};

/**
 * shimmerBar — MotionProps for a gradient shimmer loading bar.
 * Apply to a <motion.div> with a gradient background class.
 *
 * Usage:
 *   <motion.div
 *     className="h-1 rounded-full bg-gradient-to-r from-violet-600/20 via-violet-400/60 to-violet-600/20 bg-[length:200%_100%]"
 *     {...shimmerBar}
 *   />
 */
export const shimmerBar: MotionProps = {
  initial: { backgroundPosition: '200% center' },
  animate: { backgroundPosition: '-200% center' },
  transition: {
    duration: 1.8,
    ease: 'linear',
    repeat: Infinity,
  },
  style: {
    backgroundSize: '200% 100%',
    backgroundImage: `linear-gradient(90deg, ${VIOLET_600}33 0%, ${VIOLET_600}99 50%, ${VIOLET_600}33 100%)`,
  },
};

/**
 * glowPulse — MotionProps for a violet box-shadow glow pulse.
 *
 * Usage:
 *   <motion.div {...glowPulse} />
 */
export const glowPulse: MotionProps = {
  animate: {
    boxShadow: [
      `0 0 0px 0px ${VIOLET_600}00`,
      `0 0 16px 4px ${VIOLET_600}66`,
      `0 0 0px 0px ${VIOLET_600}00`,
    ],
  },
  transition: {
    duration: 2.4,
    ease: 'easeInOut',
    repeat: Infinity,
  },
};
