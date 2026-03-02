// Springs (Framer Motion)
export const springs = {
  stiff:      { type: "spring" as const, stiffness: 400, damping: 35, mass: 0.5 },
  snappy:     { type: "spring" as const, stiffness: 500, damping: 30, mass: 0.5 },
  responsive: { type: "spring" as const, stiffness: 300, damping: 30, mass: 0.8 },
  smooth:     { type: "spring" as const, stiffness: 200, damping: 25, mass: 1 },
  gentle:     { type: "spring" as const, stiffness: 100, damping: 20, mass: 1 },
  bouncy:     { type: "spring" as const, stiffness: 200, damping: 10, mass: 1 },
  heavy:      { type: "spring" as const, stiffness: 50,  damping: 14, mass: 1.5 },
  press:      { type: "spring" as const, stiffness: 400, damping: 17 },
};

// Easing curves (cubic-bezier as tuples for Framer Motion)
export const easings = {
  default:    [0.22, 1, 0.36, 1] as [number, number, number, number],
  emphasized: [0.16, 1, 0.3, 1] as [number, number, number, number],
  decelerate: [0.0, 0, 0, 1] as [number, number, number, number],
  accelerate: [0.3, 0, 0.8, 0.15] as [number, number, number, number],
  standard:   [0.2, 0, 0, 1] as [number, number, number, number],
  gentle:     [0.37, 0, 0.63, 1] as [number, number, number, number],
};

// Durations (seconds for Framer Motion)
export const durations = {
  instant:  0,
  fast:     0.1,
  normal:   0.15,
  moderate: 0.2,
  medium:   0.3,
  slow:     0.4,
  slower:   0.6,
  slowest:  1.0,
};

// Stagger delays
export const staggers = {
  fast:     0.03,
  normal:   0.05,
  slow:     0.08,
  dramatic: 0.12,
};

// Compound transitions ready to spread
export const transitions = {
  micro:  { duration: 0.15, ease: [0.22, 1, 0.36, 1] as [number, number, number, number] },
  reveal: { duration: 0.6, ease: [0.22, 1, 0.36, 1] as [number, number, number, number] },
  modal:  { duration: 0.3, ease: [0.16, 1, 0.3, 1] as [number, number, number, number] },
  hero:   { duration: 0.7, ease: [0.16, 1, 0.3, 1] as [number, number, number, number] },
  exit:   { duration: 0.2, ease: [0.3, 0, 0.8, 0.15] as [number, number, number, number] },
};

// Entrance presets (spread onto motion components)
export const entrances = {
  fadeUp: {
    initial: { opacity: 0, y: 24 },
    animate: { opacity: 1, y: 0 },
    transition: { duration: 0.6, ease: [0.22, 1, 0.36, 1] as [number, number, number, number] },
  },
  fadeDown: {
    initial: { opacity: 0, y: -12 },
    animate: { opacity: 1, y: 0 },
    transition: { duration: 0.5, ease: [0.22, 1, 0.36, 1] as [number, number, number, number] },
  },
  fadeIn: {
    initial: { opacity: 0 },
    animate: { opacity: 1 },
    transition: { duration: 0.4, ease: "easeOut" as const },
  },
  scaleUp: {
    initial: { opacity: 0, scale: 0.95 },
    animate: { opacity: 1, scale: 1 },
    transition: { duration: 0.3, ease: [0.16, 1, 0.3, 1] as [number, number, number, number] },
  },
};

// Helper to calculate stagger delay within a budget
export const getStaggerDelay = (itemCount: number, budget = 0.4) =>
  Math.min(0.12, budget / itemCount);
