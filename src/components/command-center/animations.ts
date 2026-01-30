import type { Variants, Transition } from 'framer-motion';

// Spring configurations tuned per state
export const springConfig = {
  compact: { type: 'spring', stiffness: 300, damping: 30 } as Transition,
  medium: { type: 'spring', stiffness: 280, damping: 28 } as Transition,
  full: { type: 'spring', stiffness: 260, damping: 26 } as Transition,
};

// Modal container variants - drives width/opacity/shape transitions
// Height is handled via CSS classes (not framer motion) because
// framer motion cannot interpolate between 'auto' and fixed values.
export const modalVariants: Variants = {
  closed: {
    opacity: 0,
    scale: 0.95,
    y: 20,
  },
  compact: {
    opacity: 1,
    scale: 1,
    y: 0,
    width: 'min(42rem, 95vw)',
    borderRadius: '1.5rem',
    transition: springConfig.compact,
  },
  medium: {
    opacity: 1,
    scale: 1,
    y: 0,
    width: 'min(42rem, 95vw)',
    borderRadius: '1rem',
    transition: springConfig.medium,
  },
  full: {
    opacity: 1,
    scale: 1,
    y: 0,
    width: 'min(95vw, 1400px)',
    borderRadius: '1rem',
    transition: springConfig.full,
  },
};

// Backdrop variants - opacity scales with state
export const backdropVariants: Variants = {
  closed: { opacity: 0 },
  compact: {
    opacity: 1,
    transition: { duration: 0.3 },
  },
  medium: {
    opacity: 1,
    transition: { duration: 0.3 },
  },
  full: {
    opacity: 1,
    transition: { duration: 0.3 },
  },
};

// Content swap animation (used by inner views on enter/exit)
export const contentVariants: Variants = {
  initial: { opacity: 0, y: 10, scale: 0.98 },
  animate: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: { duration: 0.25, ease: [0.25, 0.46, 0.45, 0.94] },
  },
  exit: {
    opacity: 0,
    y: -10,
    scale: 0.98,
    transition: { duration: 0.2, ease: [0.25, 0.46, 0.45, 0.94] },
  },
};

// Quick-add form slide-in
export const quickAddFormVariants: Variants = {
  hidden: { opacity: 0, x: 50, scale: 0.95 },
  visible: {
    opacity: 1,
    x: 0,
    scale: 1,
    transition: { type: 'spring', stiffness: 350, damping: 30 },
  },
  exit: {
    opacity: 0,
    x: -50,
    scale: 0.95,
    transition: { duration: 0.2 },
  },
};

// Right panel slide from right
export const rightPanelVariants: Variants = {
  hidden: { x: '100%', opacity: 0 },
  visible: {
    x: 0,
    opacity: 1,
    transition: { type: 'spring', stiffness: 300, damping: 30 },
  },
  exit: {
    x: '100%',
    opacity: 0,
    transition: { duration: 0.2 },
  },
};
