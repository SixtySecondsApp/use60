/**
 * BrainSuggestedSkills — Skill suggestion cards in the Brain page header
 *
 * Renders 2-3 suggested skill cards in a horizontal row based on
 * current Brain state (overdue commitments, decaying contacts, etc.).
 * Each card shows urgency via a left accent bar, skill name, reason,
 * and a "Run" button that navigates to the copilot with a pre-filled message.
 *
 * Returns null when there are no suggestions (hidden entirely).
 *
 * SBI-007
 */

import { useNavigate } from 'react-router-dom';
import { Sparkles, Play } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useSuggestedSkills, type SkillSuggestion } from '@/lib/hooks/useSuggestedSkills';

// ============================================================================
// Styling maps
// ============================================================================

const URGENCY_ACCENT: Record<SkillSuggestion['urgency'], string> = {
  high: 'border-l-red-500',
  medium: 'border-l-amber-500',
  low: 'border-l-green-500',
};

// ============================================================================
// Single skill card
// ============================================================================

function SkillCard({ suggestion }: { suggestion: SkillSuggestion }) {
  const navigate = useNavigate();

  const handleRun = () => {
    const parts = ['Run', suggestion.skillName];
    if (suggestion.entityName) {
      parts.push('for', suggestion.entityName);
    }
    const message = encodeURIComponent(parts.join(' '));
    navigate(`/copilot?message=${message}`);
  };

  return (
    <Card
      className={`animate-in fade-in duration-300 border-l-4 ${URGENCY_ACCENT[suggestion.urgency]} p-3 min-w-[200px] max-w-[280px] flex flex-col gap-2`}
    >
      {/* Header: icon + skill name */}
      <div className="flex items-center gap-1.5">
        <Sparkles className="h-3.5 w-3.5 text-slate-500 dark:text-gray-400 shrink-0" />
        <span className="text-sm font-bold text-slate-800 dark:text-gray-100 truncate">
          {suggestion.skillName}
        </span>
      </div>

      {/* Reason text */}
      <p className="text-xs text-muted-foreground line-clamp-2 leading-relaxed">
        {suggestion.reason}
      </p>

      {/* Footer: entity badge + run button */}
      <div className="flex items-center justify-between gap-2 mt-auto">
        {suggestion.entityName ? (
          <Badge variant="secondary" className="text-[10px] px-1.5 py-0 truncate max-w-[140px]">
            {suggestion.entityName}
          </Badge>
        ) : (
          <span />
        )}
        <Button
          size="sm"
          className="h-7 px-2.5 text-xs gap-1 shrink-0"
          onClick={handleRun}
        >
          <Play className="h-3 w-3" />
          Run
        </Button>
      </div>
    </Card>
  );
}

// ============================================================================
// Main component
// ============================================================================

export default function BrainSuggestedSkills() {
  const { data: suggestions } = useSuggestedSkills();

  // Nothing to show — hide entirely
  if (!suggestions || suggestions.length === 0) return null;

  return (
    <div className="px-6 py-2 border-b border-slate-200 dark:border-gray-800/60 bg-white dark:bg-gray-900/80">
      <div className="flex gap-3 overflow-x-auto">
        {suggestions.map((suggestion) => (
          <SkillCard key={suggestion.skillKey} suggestion={suggestion} />
        ))}
      </div>
    </div>
  );
}
