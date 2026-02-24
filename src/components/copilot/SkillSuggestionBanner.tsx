/**
 * SkillSuggestionBanner (POL-001)
 *
 * A small, non-intrusive banner that appears above the chat input
 * when a skill intent is detected in the user's plain text message.
 * Suggests the matching /command with accept and dismiss actions.
 */

import { Sparkles, X } from 'lucide-react';
import { cn } from '@/lib/utils';

interface SkillSuggestionBannerProps {
  suggestion: {
    command: string;
    skillName: string;
    confidence: number;
  } | null;
  onAccept: (command: string) => void;
  onDismiss: () => void;
}

export function SkillSuggestionBanner({
  suggestion,
  onAccept,
  onDismiss,
}: SkillSuggestionBannerProps) {
  if (!suggestion) return null;

  return (
    <div
      className={cn(
        'flex items-center gap-2 rounded-lg border px-3 py-2 text-sm',
        'bg-violet-500/10 border-violet-500/20 text-violet-300',
        'animate-in fade-in slide-in-from-bottom-2 duration-200',
      )}
    >
      <Sparkles className="h-4 w-4 flex-shrink-0 text-violet-400" />

      <span className="flex-1 min-w-0 truncate">
        Try <span className="font-medium">/{suggestion.command}</span> for a structured output
      </span>

      <button
        type="button"
        onClick={() => onAccept(suggestion.command)}
        className={cn(
          'flex-shrink-0 rounded-md px-2.5 py-1 text-xs font-medium',
          'bg-violet-500/20 text-violet-300 hover:bg-violet-500/30',
          'transition-colors',
        )}
      >
        Use /{suggestion.command}
      </button>

      <button
        type="button"
        onClick={onDismiss}
        className="flex-shrink-0 rounded p-0.5 text-violet-400 hover:text-violet-300 transition-colors"
        aria-label="Dismiss suggestion"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

export default SkillSuggestionBanner;
