/**
 * Shared SectionHeader component for copilot response components.
 *
 * Based on DailyBriefResponse's Section component (the best existing pattern),
 * standardized for reuse across all response components.
 *
 * Features:
 * - Collapsible with Framer Motion animation
 * - Optional icon with configurable color
 * - Count badge (shown in a pill)
 * - Status badge (colored label)
 * - Preview text when collapsed
 * - Consistent styling: text-sm font-semibold title, 4x4 icon
 */

import React, { useState } from 'react';
import { ChevronDown, ChevronUp, type LucideIcon } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';

interface SectionHeaderProps {
  title: string;
  icon?: LucideIcon;
  iconColor?: string;
  count?: number;
  badge?: { text: string; color: string };
  collapsible?: boolean;
  defaultOpen?: boolean;
  children?: React.ReactNode;
  preview?: string;
  className?: string;
}

export function SectionHeader({
  title,
  icon: Icon,
  iconColor = 'text-gray-400',
  count,
  badge,
  collapsible = false,
  defaultOpen = true,
  children,
  preview,
  className,
}: SectionHeaderProps) {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  // Non-collapsible: render as a simple header with optional children below
  if (!collapsible) {
    return (
      <div className={cn('space-y-3', className)}>
        <div className="flex items-center gap-2">
          {Icon && <Icon className={cn('w-4 h-4 shrink-0', iconColor)} />}
          <span className="text-sm font-semibold text-white">{title}</span>
          {typeof count === 'number' && (
            <span className="text-xs text-gray-400 bg-gray-800/50 px-2 py-0.5 rounded-full shrink-0">
              {count}
            </span>
          )}
          {badge && (
            <span className={cn('text-xs px-1.5 py-0.5 rounded shrink-0', badge.color)}>
              {badge.text}
            </span>
          )}
        </div>
        {children}
      </div>
    );
  }

  // Collapsible: render with toggle button and animated content
  return (
    <div className={cn('rounded-xl border border-gray-800/60 bg-gray-900/30 overflow-hidden', className)}>
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between p-3 hover:bg-gray-800/30 transition-colors text-left"
      >
        <div className="flex items-center gap-3 min-w-0 flex-1">
          {Icon && <Icon className={cn('w-4 h-4 shrink-0', iconColor)} />}
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold text-white">{title}</span>
              {typeof count === 'number' && (
                <span className="text-xs text-gray-400 bg-gray-800/50 px-2 py-0.5 rounded-full shrink-0">
                  {count}
                </span>
              )}
              {badge && (
                <span className={cn('text-xs px-1.5 py-0.5 rounded shrink-0', badge.color)}>
                  {badge.text}
                </span>
              )}
            </div>
            {!isOpen && preview && (
              <p className="text-xs text-gray-400 truncate mt-0.5">{preview}</p>
            )}
          </div>
        </div>
        {isOpen ? (
          <ChevronUp className="w-4 h-4 text-gray-400 shrink-0 ml-2" />
        ) : (
          <ChevronDown className="w-4 h-4 text-gray-400 shrink-0 ml-2" />
        )}
      </button>

      <AnimatePresence initial={false}>
        {isOpen && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: 'easeInOut' }}
            className="overflow-hidden"
          >
            <div className="px-3 pb-3 pt-1">{children}</div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export type { SectionHeaderProps };
