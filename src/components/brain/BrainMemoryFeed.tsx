/**
 * BrainMemoryFeed — Memory Feed tab content for the Brain page
 *
 * Shows a filterable, realtime-updated list of copilot_memories.
 * Each card displays category, subject, content preview, decay bar, and timestamps.
 *
 * TRINITY-005
 */

import { useState } from 'react';
import { Brain, Clock, CalendarPlus } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import {
  useBrainMemories,
  useBrainMemoriesRealtime,
  type CopilotMemory,
  type BrainMemoriesFilters,
} from '@/lib/hooks/useBrainMemories';

// ============================================================================
// Category config
// ============================================================================

const CATEGORIES = [
  { id: undefined, label: 'All' },
  { id: 'deal' as const, label: 'Deal' },
  { id: 'relationship' as const, label: 'Relationship' },
  { id: 'preference' as const, label: 'Preference' },
  { id: 'commitment' as const, label: 'Commitment' },
  { id: 'fact' as const, label: 'Fact' },
] as const;

type CategoryId = CopilotMemory['category'] | undefined;

/** Badge variant + extra classes per category */
const CATEGORY_STYLES: Record<
  CopilotMemory['category'],
  { variant: 'default' | 'success' | 'warning' | 'destructive' | 'secondary'; label: string }
> = {
  deal: { variant: 'default', label: 'Deal' },
  relationship: { variant: 'success', label: 'Relationship' },
  preference: { variant: 'warning', label: 'Preference' },
  commitment: { variant: 'destructive', label: 'Commitment' },
  fact: { variant: 'secondary', label: 'Fact' },
};

// ============================================================================
// Decay bar helper
// ============================================================================

function decayColor(score: number): string {
  if (score > 0.7) return 'bg-emerald-500';
  if (score > 0.3) return 'bg-yellow-500';
  return 'bg-red-500';
}

// ============================================================================
// Sub-components
// ============================================================================

function MemoryCard({ memory }: { memory: CopilotMemory }) {
  const style = CATEGORY_STYLES[memory.category];
  const decayScore = memory.decay_score ?? 1;

  return (
    <Card className="p-4 space-y-3">
      {/* Top row: badge + subject */}
      <div className="flex items-start gap-2">
        <Badge variant={style.variant} className="shrink-0">
          {style.label}
        </Badge>
        <span className="text-sm font-semibold text-slate-800 dark:text-gray-100 leading-tight">
          {memory.subject}
        </span>
      </div>

      {/* Content preview — truncated to 2 lines */}
      <p className="text-sm text-slate-600 dark:text-gray-400 line-clamp-2 leading-relaxed">
        {memory.content}
      </p>

      {/* Decay bar */}
      <div className="flex items-center gap-2">
        <span className="text-[11px] text-slate-400 dark:text-gray-500 shrink-0">Decay</span>
        <div className="flex-1 h-1.5 rounded-full bg-slate-100 dark:bg-gray-800 overflow-hidden">
          <div
            className={`h-full rounded-full transition-all ${decayColor(decayScore)}`}
            style={{ width: `${Math.round(decayScore * 100)}%` }}
          />
        </div>
        <span className="text-[11px] tabular-nums text-slate-400 dark:text-gray-500 shrink-0">
          {Math.round(decayScore * 100)}%
        </span>
      </div>

      {/* Timestamps */}
      <div className="flex items-center gap-4 text-[11px] text-slate-400 dark:text-gray-500">
        <span className="inline-flex items-center gap-1">
          <CalendarPlus className="h-3 w-3" />
          {formatDistanceToNow(new Date(memory.created_at), { addSuffix: true })}
        </span>
        {memory.last_accessed_at && (
          <span className="inline-flex items-center gap-1">
            <Clock className="h-3 w-3" />
            Accessed {formatDistanceToNow(new Date(memory.last_accessed_at), { addSuffix: true })}
          </span>
        )}
      </div>
    </Card>
  );
}

function LoadingSkeleton() {
  return (
    <div className="space-y-3">
      {Array.from({ length: 4 }).map((_, i) => (
        <Card key={i} className="p-4 space-y-3">
          <div className="flex items-center gap-2">
            <Skeleton className="h-5 w-20 rounded-full" />
            <Skeleton className="h-4 w-48" />
          </div>
          <Skeleton className="h-8 w-full" />
          <Skeleton className="h-1.5 w-full rounded-full" />
          <div className="flex gap-4">
            <Skeleton className="h-3 w-24" />
            <Skeleton className="h-3 w-28" />
          </div>
        </Card>
      ))}
    </div>
  );
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center py-24">
      <div className="w-14 h-14 rounded-2xl bg-slate-100 dark:bg-gray-800/50 flex items-center justify-center mb-4">
        <Brain className="h-7 w-7 text-slate-400 dark:text-gray-500" />
      </div>
      <p className="text-sm font-medium text-slate-600 dark:text-gray-300 mb-1">
        No memories yet
      </p>
      <p className="text-xs text-slate-400 dark:text-gray-500 max-w-xs text-center">
        Memories are created automatically as you interact with the copilot. They help the AI
        remember your preferences, deals, and relationships.
      </p>
    </div>
  );
}

// ============================================================================
// Main component
// ============================================================================

export default function BrainMemoryFeed() {
  const [activeCategory, setActiveCategory] = useState<CategoryId>(undefined);

  const filters: BrainMemoriesFilters = {
    category: activeCategory,
  };

  const { data: memories, isLoading } = useBrainMemories(filters);

  // Wire up realtime — prepends new INSERTs into the cache
  useBrainMemoriesRealtime(filters);

  return (
    <div className="space-y-4">
      {/* Category filter buttons */}
      <div className="flex flex-wrap gap-2">
        {CATEGORIES.map((cat) => (
          <Button
            key={cat.label}
            variant={activeCategory === cat.id ? 'default' : 'outline'}
            size="sm"
            onClick={() => setActiveCategory(cat.id as CategoryId)}
          >
            {cat.label}
          </Button>
        ))}
      </div>

      {/* Feed content */}
      {isLoading ? (
        <LoadingSkeleton />
      ) : !memories || memories.length === 0 ? (
        <EmptyState />
      ) : (
        <div className="space-y-3">
          {memories.map((memory) => (
            <MemoryCard key={memory.id} memory={memory} />
          ))}
        </div>
      )}
    </div>
  );
}
