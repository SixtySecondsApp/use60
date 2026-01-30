import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Brain, X, Minimize2, PanelRightClose, PanelRightOpen } from 'lucide-react';
import { AssistantShell } from '@/components/assistant/AssistantShell';
import { CopilotRightPanel } from '@/components/copilot/CopilotRightPanel';
import { useCopilot } from '@/lib/contexts/CopilotContext';
import { useCopilotContextData } from '@/lib/hooks/useCopilotContextData';
import { rightPanelVariants } from './animations';
import type { QuickAddAction } from './useCommandCenterState';

interface CommandCenterFullProps {
  onClose: () => void;
  onCollapse: () => void;
  onOpenQuickAdd: (action: QuickAddAction, prefill?: { preselectAction?: string; initialData?: Record<string, unknown> }) => void;
}

export function CommandCenterFull({ onClose, onCollapse, onOpenQuickAdd }: CommandCenterFullProps) {
  const { progressSteps, isLoading, conversationId } = useCopilot();
  const { contextItems, contextSummary, isLoading: isContextLoading } = useCopilotContextData();
  const [showRightPanel, setShowRightPanel] = useState(true);

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-gray-800/50 bg-gray-900/80 backdrop-blur-sm">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center shadow-lg shadow-violet-500/25">
            <Brain className="w-5 h-5 text-white" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-gray-100">Command Center</h2>
            <div className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              <span className="text-xs text-gray-400">Full workspace mode</span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Toggle right panel (mobile) */}
          <button
            type="button"
            onClick={() => setShowRightPanel((v) => !v)}
            className="p-2 rounded-lg text-gray-400 hover:text-gray-200 hover:bg-gray-800/50 transition-colors lg:hidden"
          >
            {showRightPanel ? <PanelRightClose className="w-5 h-5" /> : <PanelRightOpen className="w-5 h-5" />}
          </button>

          {/* Collapse to medium */}
          <button
            type="button"
            onClick={onCollapse}
            className="p-2 rounded-lg text-gray-400 hover:text-gray-200 hover:bg-gray-800/50 transition-colors"
          >
            <Minimize2 className="w-5 h-5" />
          </button>

          {/* Close */}
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-lg text-gray-500 hover:text-gray-300 hover:bg-gray-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Two-panel body */}
      <div className="flex-1 flex min-h-0">
        {/* Left panel - Chat */}
        <div className="flex-1 min-w-0">
          <AssistantShell
            mode="overlay"
            onOpenQuickAdd={(opts) => {
              onOpenQuickAdd(opts.preselectAction as QuickAddAction, opts);
            }}
          />
        </div>

        {/* Right panel - Desktop (always visible) */}
        <div className="hidden lg:block w-[380px] flex-shrink-0 border-l border-gray-800/50">
          <CopilotRightPanel
            contextItems={contextItems}
            contextSummary={contextSummary}
            isContextLoading={isContextLoading}
            progressSteps={progressSteps}
            isProcessing={isLoading}
            currentConversationId={conversationId}
          />
        </div>
      </div>

      {/* Right panel - Mobile overlay */}
      <AnimatePresence>
        {showRightPanel && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="lg:hidden fixed inset-0 z-50 bg-black/50 backdrop-blur-sm"
            onClick={() => setShowRightPanel(false)}
          >
            <motion.div
              variants={rightPanelVariants}
              initial="hidden"
              animate="visible"
              exit="exit"
              onClick={(e) => e.stopPropagation()}
              className="absolute right-0 top-0 bottom-0 w-[85vw] max-w-[380px] bg-gray-900 shadow-2xl border-l border-gray-800/50"
            >
              <CopilotRightPanel
                contextItems={contextItems}
                contextSummary={contextSummary}
                isContextLoading={isContextLoading}
                progressSteps={progressSteps}
                isProcessing={isLoading}
                currentConversationId={conversationId}
              />
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
