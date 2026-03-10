import { motion, AnimatePresence } from 'framer-motion';
import { glowPulse } from './animation-variants';

const ACTS = ['Prep', 'Brief', 'Results', 'Ready'] as const;

interface WalkthroughTimelineProps {
  currentAct: number;
}

export function WalkthroughTimeline({ currentAct }: WalkthroughTimelineProps) {
  return (
    <div className="flex items-center w-full max-w-xs mx-auto" style={{ height: 40 }}>
      {ACTS.map((label, index) => {
        const isCompleted = index < currentAct;
        const isActive = index === currentAct;
        const isPending = index > currentAct;

        return (
          <div key={label} className="flex items-center" style={{ flex: index < ACTS.length - 1 ? '1 1 auto' : '0 0 auto' }}>
            {/* Dot + label */}
            <div className="flex flex-col items-center gap-1">
              <AnimatePresence mode="wait">
                {isActive ? (
                  <motion.div
                    key="active"
                    className="w-3 h-3 rounded-full bg-violet-500"
                    initial={{ scale: 0.8 }}
                    animate={{ scale: 1 }}
                    transition={{ type: 'spring', stiffness: 400, damping: 20 }}
                    {...glowPulse}
                  />
                ) : isCompleted ? (
                  <motion.div
                    key="completed"
                    className="w-3 h-3 rounded-full bg-green-400"
                    initial={{ scale: 0.8 }}
                    animate={{ scale: 1 }}
                    transition={{ type: 'spring', stiffness: 400, damping: 20 }}
                  />
                ) : (
                  <motion.div
                    key="pending"
                    className="w-3 h-3 rounded-full bg-gray-600 border border-gray-500"
                    initial={{ scale: 0.8 }}
                    animate={{ scale: 1 }}
                    transition={{ type: 'spring', stiffness: 400, damping: 20 }}
                  />
                )}
              </AnimatePresence>
              <span
                className={`text-[10px] leading-none whitespace-nowrap ${
                  isActive
                    ? 'text-violet-400'
                    : isCompleted
                    ? 'text-gray-400'
                    : 'text-gray-500'
                }`}
              >
                {label}
              </span>
            </div>

            {/* Connector line (not after last dot) */}
            {index < ACTS.length - 1 && (
              <div className="h-0.5 flex-1 mx-1 mb-3 overflow-hidden bg-gray-700 rounded-full">
                <motion.div
                  className="h-full bg-violet-500/60 rounded-full"
                  initial={{ width: '0%' }}
                  animate={{ width: isCompleted ? '100%' : '0%' }}
                  transition={{ duration: 0.4, ease: 'easeOut' }}
                />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
