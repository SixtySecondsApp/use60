/**
 * Copilot Layout Component
 * Two-panel layout: Chat (center) + Right Sidebar (Action Items, Context, Connected, History)
 *
 * Key constraints:
 * - 100vh viewport compliance (no page scroll)
 * - Chat input always visible at bottom
 * - Messages scroll within their container
 * - Right panel scrolls independently
 */

import React, { useState } from 'react';
import { PanelRightClose, PanelRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface CopilotLayoutProps {
  children: React.ReactNode;
  /** Optional right panel content - renders Action Items, Context, Connected, History sections */
  rightPanel?: React.ReactNode;
}

export const CopilotLayout: React.FC<CopilotLayoutProps> = ({ children, rightPanel }) => {
  const [showRightPanel, setShowRightPanel] = useState(true);

  return (
    // Main container: 100% of available height, no overflow (page doesn't scroll)
    <div className="flex h-full min-h-0 relative overflow-hidden">
      {/* Right Panel Toggle Button (only shown when rightPanel is provided) */}
      {rightPanel && (
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setShowRightPanel(!showRightPanel)}
          className={cn(
            'absolute top-4 right-4 z-20 h-9 px-3 gap-2',
            'bg-white/80 dark:bg-gray-900/80 backdrop-blur-sm',
            'border border-gray-200 dark:border-gray-700/50',
            'hover:bg-gray-50 dark:hover:bg-gray-800/80',
            'text-gray-600 dark:text-gray-400',
            'lg:hidden' // Only show on mobile/tablet, right panel always visible on desktop
          )}
        >
          {showRightPanel ? (
            <PanelRightClose className="w-4 h-4" />
          ) : (
            <PanelRight className="w-4 h-4" />
          )}
        </Button>
      )}

      {/* Main Chat Area - flex-1 to take remaining space */}
      <div className="flex-1 min-h-0 min-w-0 flex flex-col">
        {children}
      </div>

      {/* Right Panel - Action Items, Context, Connected */}
      {rightPanel && (
        <>
          {/* Mobile/Tablet overlay */}
          {showRightPanel && (
            <div
              className="fixed inset-0 bg-black/20 z-[5] lg:hidden"
              onClick={() => setShowRightPanel(false)}
            />
          )}

          {/* Right panel container */}
          <div
            className={cn(
              'absolute lg:relative z-10 right-0 h-full transition-all duration-300 ease-in-out',
              'bg-white/[0.02] dark:bg-gray-900/50 backdrop-blur-xl',
              'border-l border-gray-200 dark:border-white/5',
              // Width and visibility - responsive widths for mobile
              showRightPanel
                ? 'w-[85vw] sm:w-80 max-w-80 opacity-100'
                : 'w-0 opacity-0 overflow-hidden lg:w-0'
            )}
          >
            {/* Inner container - use full width on mobile, fixed on larger screens */}
            <div className="w-full sm:w-80 h-full overflow-y-auto overflow-x-hidden">
              {rightPanel}
            </div>
          </div>
        </>
      )}
    </div>
  );
};

export default CopilotLayout;
