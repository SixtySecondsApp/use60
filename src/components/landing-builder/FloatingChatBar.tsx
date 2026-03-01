/**
 * FloatingChatBar — Centered bottom chat overlay for assembly mode.
 *
 * Spotlight/Command-K style: input always visible at bottom center,
 * chat history collapsed by default and expands upward on toggle.
 */

import React, { useCallback, useState } from 'react';
import { ChevronUp, ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import { AssistantShell, type QuickAction } from '@/components/assistant/AssistantShell';

interface FloatingChatBarProps {
  apiContentTransform?: (message: string) => string;
  phaseActions?: QuickAction[];
  onPhaseAction?: (prompt: string) => boolean;
  phaseComponent?: React.ReactNode;
}

export const FloatingChatBar: React.FC<FloatingChatBarProps> = ({
  apiContentTransform,
  phaseActions,
  onPhaseAction,
  phaseComponent,
}) => {
  const [expanded, setExpanded] = useState(false);

  const toggleExpanded = useCallback(() => {
    setExpanded((prev) => !prev);
  }, []);

  return (
    <div
      className={cn(
        'absolute bottom-4 left-1/2 -translate-x-1/2 z-20',
        'w-full max-w-[600px] px-4',
        'transition-all duration-300 ease-in-out',
      )}
    >
      <div
        className={cn(
          'bg-white/95 dark:bg-gray-950/95 backdrop-blur-md',
          'rounded-xl shadow-2xl border border-gray-200 dark:border-white/10',
          'overflow-hidden transition-all duration-300 ease-in-out',
          expanded ? 'h-[min(50vh,480px)]' : 'h-[120px]',
        )}
      >
        {/* Expand/collapse toggle */}
        <button
          type="button"
          onClick={toggleExpanded}
          className={cn(
            'flex items-center justify-center w-full py-1 border-b border-gray-100 dark:border-white/5',
            'text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors',
          )}
        >
          {expanded ? (
            <ChevronDown className="w-4 h-4" />
          ) : (
            <ChevronUp className="w-4 h-4" />
          )}
        </button>

        {/* Chat content */}
        <div className="flex flex-col h-[calc(100%-28px)] overflow-hidden">
          <AssistantShell
            mode="page"
            apiContentTransform={apiContentTransform}
            phaseActions={phaseActions}
            onPhaseAction={onPhaseAction}
            phaseComponent={phaseComponent}
          />
        </div>
      </div>
    </div>
  );
};

export default FloatingChatBar;
