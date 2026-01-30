import { Brain, X, ChevronLeft } from 'lucide-react';
import { AssistantShell } from '@/components/assistant/AssistantShell';
import type { QuickAddAction } from './useCommandCenterState';

interface CommandCenterMediumProps {
  onClose: () => void;
  onBack: () => void;
  onOpenQuickAdd: (action: QuickAddAction, prefill?: { preselectAction?: string; initialData?: Record<string, unknown> }) => void;
}

export function CommandCenterMedium({ onClose, onBack, onOpenQuickAdd }: CommandCenterMediumProps) {
  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-gray-800/50 bg-gray-900/50 backdrop-blur-sm">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onBack}
            className="p-1.5 -ml-1.5 text-gray-400 hover:text-gray-200 hover:bg-gray-800/50 rounded-lg transition-all"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center shadow-md shadow-violet-500/20">
            <Brain className="w-5 h-5 text-white" />
          </div>
          <div>
            <h2 className="text-base font-semibold text-gray-100">Sales Assistant</h2>
            <div className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              <span className="text-xs text-gray-400">Online</span>
            </div>
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="p-2 rounded-lg text-gray-400 hover:text-gray-200 hover:bg-gray-800/50 transition-colors"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Chat body - delegates entirely to AssistantShell */}
      <div className="flex-1 min-h-0">
        <AssistantShell
          mode="overlay"
          onOpenQuickAdd={(opts) => {
            onOpenQuickAdd(
              opts.preselectAction as QuickAddAction,
              opts,
            );
          }}
        />
      </div>
    </div>
  );
}
