/**
 * LifecycleTimeline — Horizontal stage navigator for Agent Abilities page
 *
 * Renders 5 lifecycle stages as pill buttons with ability counts.
 * Active stage gets indigo highlighting with smooth animation.
 */

import { motion } from 'framer-motion';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import {
  LIFECYCLE_STAGES,
  getAbilityCountByStage,
  type LifecycleStage,
} from '@/lib/agent/abilityRegistry';

interface LifecycleTimelineProps {
  activeStage: LifecycleStage;
  onStageChange: (stage: LifecycleStage) => void;
}

export function LifecycleTimeline({ activeStage, onStageChange }: LifecycleTimelineProps) {
  const abilityCounts = getAbilityCountByStage();

  return (
    <div className="flex flex-wrap gap-2">
      {LIFECYCLE_STAGES.map((stage) => {
        const isActive = activeStage === stage.id;
        const count = abilityCounts[stage.id];

        return (
          <motion.button
            key={stage.id}
            onClick={() => onStageChange(stage.id)}
            className={cn(
              'relative px-4 py-2 rounded-lg border text-sm font-medium transition-all cursor-pointer',
              'flex items-center gap-2',
              isActive
                ? 'bg-indigo-100 dark:bg-indigo-500/20 text-indigo-700 dark:text-indigo-300 border-indigo-300 dark:border-indigo-500/40'
                : 'bg-gray-50 dark:bg-gray-800 text-gray-600 dark:text-gray-400 border-gray-200 dark:border-gray-700 hover:bg-gray-100 dark:hover:bg-gray-700'
            )}
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
          >
            <span>{stage.label}</span>
            <Badge
              variant={isActive ? 'default' : 'secondary'}
              className={cn(
                'text-xs px-1.5 py-0',
                isActive
                  ? 'bg-indigo-200 dark:bg-indigo-400/30 text-indigo-800 dark:text-indigo-200'
                  : 'bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-300'
              )}
            >
              {count}
            </Badge>

            {/* Active stage indicator */}
            {isActive && (
              <motion.div
                layoutId="activeStage"
                className="absolute inset-0 bg-indigo-100 dark:bg-indigo-500/20 rounded-lg border border-indigo-300 dark:border-indigo-500/40 -z-10"
                transition={{
                  type: 'spring',
                  stiffness: 380,
                  damping: 30,
                }}
              />
            )}
          </motion.button>
        );
      })}
    </div>
  );
}
