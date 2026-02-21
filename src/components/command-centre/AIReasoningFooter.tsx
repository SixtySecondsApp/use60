import { Brain } from 'lucide-react';

interface AIReasoningFooterProps {
  reasoning: string;
  confidenceScore?: number;
}

export function AIReasoningFooter({ reasoning, confidenceScore }: AIReasoningFooterProps) {
  return (
    <div className="border-t border-slate-200 dark:border-gray-700/50 bg-slate-50/80 dark:bg-gray-800/30 px-4 py-2.5">
      <div className="max-w-4xl mx-auto flex items-center gap-3">
        <div className="shrink-0 w-7 h-7 rounded-full bg-violet-100 dark:bg-violet-500/10 flex items-center justify-center">
          <Brain className="w-3.5 h-3.5 text-violet-600 dark:text-violet-400" />
        </div>
        <div className="flex-1 min-w-0 flex items-center gap-3">
          <span className="text-xs font-semibold text-violet-700 dark:text-violet-300 shrink-0">
            AI Reasoning
          </span>
          {confidenceScore !== undefined && (
            <div className="flex items-center gap-1.5 shrink-0">
              <div className="w-12 h-1.5 bg-violet-200 dark:bg-violet-500/20 rounded-full overflow-hidden">
                <div
                  className="h-full bg-violet-500 dark:bg-violet-400 rounded-full transition-all"
                  style={{ width: `${confidenceScore * 100}%` }}
                />
              </div>
              <span className="text-[10px] text-violet-600 dark:text-violet-400 font-medium">
                {Math.round(confidenceScore * 100)}%
              </span>
            </div>
          )}
          <p className="text-xs text-violet-900 dark:text-violet-200 truncate">
            {reasoning}
          </p>
        </div>
      </div>
    </div>
  );
}
