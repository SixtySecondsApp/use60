/**
 * CompetitorProfileCard Component (KNW-008)
 *
 * Shows competitor name, mention count, win rate gauge, and top insights.
 * Used in the Competitive Intelligence page and deal detail views.
 */

import React from 'react';
import { Swords, TrendingUp, TrendingDown, Trophy, Target } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

interface CompetitorProfileCardProps {
  competitorName: string;
  mentionCount: number;
  winCount: number;
  lossCount: number;
  winRate: number | null;
  lastMentionedAt: string | null;
  hasBattlecard: boolean;
  onClick?: () => void;
}

function winRateColor(rate: number | null): string {
  if (rate === null) return 'text-gray-500';
  if (rate >= 60) return 'text-emerald-600 dark:text-emerald-400';
  if (rate >= 40) return 'text-amber-600 dark:text-amber-400';
  return 'text-red-600 dark:text-red-400';
}

export function CompetitorProfileCard({
  competitorName,
  mentionCount,
  winCount,
  lossCount,
  winRate,
  lastMentionedAt,
  hasBattlecard,
  onClick,
}: CompetitorProfileCardProps) {
  const totalOutcomes = winCount + lossCount;

  return (
    <Card
      className="bg-white/80 dark:bg-gray-900/40 backdrop-blur-xl border-white/20 dark:border-white/10 hover:shadow-md transition-shadow cursor-pointer"
      onClick={onClick}
    >
      <CardContent className="p-4">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-2">
            <div className="h-9 w-9 rounded-lg bg-gradient-to-br from-red-500/20 to-orange-500/20 flex items-center justify-center">
              <Swords className="h-4 w-4 text-red-600 dark:text-red-400" />
            </div>
            <div>
              <h3 className="text-sm font-semibold">{competitorName}</h3>
              <p className="text-xs text-muted-foreground">
                {mentionCount} mention{mentionCount !== 1 ? 's' : ''}
                {lastMentionedAt && ` · Last ${new Date(lastMentionedAt).toLocaleDateString()}`}
              </p>
            </div>
          </div>
          {hasBattlecard && (
            <Badge variant="secondary" className="text-[10px]">
              <Target className="h-3 w-3 mr-0.5" />
              Battlecard
            </Badge>
          )}
        </div>

        {totalOutcomes > 0 && (
          <div className="mt-3 flex items-center gap-4">
            {/* Win rate */}
            <div className="flex items-center gap-1.5">
              <Trophy className="h-3.5 w-3.5 text-muted-foreground" />
              <span className={`text-sm font-semibold ${winRateColor(winRate)}`}>
                {winRate !== null ? `${winRate}%` : 'N/A'}
              </span>
              <span className="text-xs text-muted-foreground">win rate</span>
            </div>

            {/* Win/Loss counts */}
            <div className="flex items-center gap-2 text-xs">
              <span className="flex items-center gap-0.5 text-emerald-600 dark:text-emerald-400">
                <TrendingUp className="h-3 w-3" />
                {winCount}W
              </span>
              <span className="flex items-center gap-0.5 text-red-600 dark:text-red-400">
                <TrendingDown className="h-3 w-3" />
                {lossCount}L
              </span>
            </div>
          </div>
        )}

        {/* Win rate bar */}
        {totalOutcomes > 0 && winRate !== null && (
          <div className="mt-2 h-1.5 w-full rounded-full bg-gray-200 dark:bg-gray-700 overflow-hidden">
            <div
              className="h-full rounded-full bg-emerald-500"
              style={{ width: `${winRate}%` }}
            />
          </div>
        )}
      </CardContent>
    </Card>
  );
}
