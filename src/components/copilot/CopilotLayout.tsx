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
      {/* Right Panel Toggle Button (only shown on small screens) */}
      {rightPanel && (
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setShowRightPanel(!showRightPanel)}
          className={cn(
            'absolute top-4 z-20 h-9 px-3 gap-2',
            'bg-white/80 dark:bg-gray-900/80 backdrop-blur-sm',
            'border border-gray-200 dark:border-gray-700/50',
            'hover:bg-gray-50 dark:hover:bg-gray-800/80',
            'text-gray-600 dark:text-gray-400',
            // Position depends on whether the panel is visible
            showRightPanel ? 'right-[21rem] md:hidden' : 'right-4 md:hidden',
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
          {/* Mobile overlay backdrop */}
          {showRightPanel && (
            <div
              className="fixed inset-0 bg-black/20 z-[5] md:hidden"
              onClick={() => setShowRightPanel(false)}
            />
          )}

          {/* Right panel container — always visible on md+ */}
          <div
            className={cn(
              'z-10 h-full transition-all duration-300 ease-in-out flex-shrink-0',
              'bg-white/[0.02] dark:bg-gray-900/50 backdrop-blur-xl',
              'border-l border-gray-200 dark:border-white/5',
              // Mobile: absolute overlay. md+: static in flex layout
              'absolute md:relative right-0',
              showRightPanel
                ? 'w-[85vw] sm:w-80 md:w-72 lg:w-80 opacity-100 translate-x-0'
                : 'w-0 opacity-0 overflow-hidden translate-x-full md:translate-x-0 md:w-72 md:opacity-100 md:overflow-visible lg:w-80'
            )}
          >
            <div className="w-full h-full overflow-y-auto overflow-x-hidden">
              {rightPanel}
            </div>
          </div>
        </>
      )}
    </div>
  );
};

export default CopilotLayout;
