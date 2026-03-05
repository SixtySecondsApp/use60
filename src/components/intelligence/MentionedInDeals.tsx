/**
 * MentionedInDeals
 *
 * Shows which deals have referenced this competitor, with deal links,
 * stage, outcome badge, and mention context snippet.
 *
 * Story: COMP-004
 */

import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Link2, TrendingUp, TrendingDown, Minus, ChevronDown, ChevronUp } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useMentionsWithDeals } from '@/lib/hooks/useCompetitiveIntel';

// ============================================================================
// Helpers
// ============================================================================

const PREVIEW = 4;

function SentimentIcon({ sentiment }: { sentiment: 'positive' | 'negative' | 'neutral' }) {
  if (sentiment === 'positive') return <TrendingUp className="h-3 w-3 text-red-400" />;
  if (sentiment === 'negative') return <TrendingDown className="h-3 w-3 text-emerald-400" />;
  return <Minus className="h-3 w-3 text-gray-500" />;
}

function OutcomeBadge({ outcome }: { outcome: 'won' | 'lost' | null }) {
  if (!outcome) return null;
  return (
    <Badge
      variant="outline"
      className={cn(
        'text-[10px] px-1.5 py-0 border',
        outcome === 'won'
          ? 'border-emerald-700 text-emerald-400'
          : 'border-red-900 text-red-400',
      )}
    >
      {outcome === 'won' ? 'Won' : 'Lost'}
    </Badge>
  );
}

// ============================================================================
// Component
// ============================================================================

interface MentionedInDealsProps {
  competitorName: string;
}

export function MentionedInDeals({ competitorName }: MentionedInDealsProps) {
  const navigate = useNavigate();
  const { data: mentions = [], isLoading } = useMentionsWithDeals(competitorName);
  const [expanded, setExpanded] = useState(false);

  // Dedupe by deal_id keeping most recent
  const byDeal = new Map<string, typeof mentions[0]>();
  for (const m of mentions) {
    if (!m.deal_id) continue;
    if (!byDeal.has(m.deal_id)) byDeal.set(m.deal_id, m);
  }
  const dealRows = [...byDeal.values()];

  const visible = expanded ? dealRows : dealRows.slice(0, PREVIEW);
  const hasMore = dealRows.length > PREVIEW;

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <Link2 className="h-4 w-4 text-gray-400" />
        <span className="text-sm font-medium text-gray-700 dark:text-gray-200">Mentioned in deals</span>
        {dealRows.length > 0 && (
          <span className="text-xs text-gray-500">{dealRows.length} deal{dealRows.length !== 1 ? 's' : ''}</span>
        )}
      </div>

      {isLoading ? (
        <p className="text-xs text-gray-400 dark:text-gray-600 py-2">Loading...</p>
      ) : dealRows.length === 0 ? (
        <p className="text-xs text-gray-400 dark:text-gray-600 py-2">No deal mentions found</p>
      ) : (
        <>
          <div className="space-y-1.5">
            {visible.map(m => (
              <div
                key={m.deal_id}
                className="flex items-start gap-2.5 rounded-lg border border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-900/40 px-3 py-2.5 hover:bg-gray-100 dark:hover:bg-gray-800/60 transition-colors cursor-pointer group"
                onClick={() => m.deal_id && navigate(`/crm/deals/${m.deal_id}`)}
              >
                <SentimentIcon sentiment={m.sentiment} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-medium text-gray-900 dark:text-gray-100 group-hover:text-gray-700 dark:group-hover:text-white truncate">
                      {m.deal_name ?? 'Unknown deal'}
                    </span>
                    {m.deal_stage && (
                      <span className="text-xs text-gray-500">{m.deal_stage}</span>
                    )}
                    <OutcomeBadge outcome={m.deal_outcome} />
                  </div>
                  {m.mention_context && (
                    <p className="text-xs text-gray-500 mt-0.5 line-clamp-2">
                      "{m.mention_context}"
                    </p>
                  )}
                </div>
                <span className="flex-shrink-0 text-[10px] text-gray-400 dark:text-gray-600">
                  {new Date(m.created_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                </span>
              </div>
            ))}
          </div>

          {hasMore && (
            <Button
              variant="ghost"
              size="sm"
              className="w-full h-7 text-xs text-gray-500 hover:text-gray-300"
              onClick={() => setExpanded(!expanded)}
            >
              {expanded ? (
                <><ChevronUp className="h-3 w-3 mr-1" />Show less</>
              ) : (
                <><ChevronDown className="h-3 w-3 mr-1" />Show {dealRows.length - PREVIEW} more</>
              )}
            </Button>
          )}
        </>
      )}
    </div>
  );
}
