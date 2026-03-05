/**
 * CompetitorProfileView
 *
 * Right-side detail panel for a selected competitor:
 * - Win/loss ratio stats (COMP-005)
 * - Auto-generated or admin battlecard (COMP-002)
 * - Mention frequency chart (COMP-003)
 * - Mentioned in deals (COMP-004)
 *
 * Stories: COMP-002, COMP-003, COMP-004, COMP-005
 */

import { useState } from 'react';
import {
  Swords,
  TrendingUp,
  TrendingDown,
  Trophy,
  AlertCircle,
  ChevronDown,
  ChevronUp,
  Zap,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import type { CompetitorProfile } from '@/lib/hooks/useCompetitiveIntel';
import { BattlecardViewer } from './BattlecardViewer';
import { MentionFrequencyChart } from './MentionFrequencyChart';
import { MentionedInDeals } from './MentionedInDeals';

// ============================================================================
// Helpers
// ============================================================================

function winRateCls(rate: number | null): string {
  if (rate === null) return 'text-gray-500 dark:text-gray-500';
  if (rate >= 60) return 'text-emerald-600 dark:text-emerald-400';
  if (rate >= 40) return 'text-amber-600 dark:text-amber-400';
  return 'text-red-600 dark:text-red-400';
}

function StrengthsWeaknessesSection({
  items,
  label,
  isStrength,
}: {
  items: Array<{ strength?: string; weakness?: string; count: number }>;
  label: string;
  isStrength: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const PREVIEW = 4;
  const visible = expanded ? items : items.slice(0, PREVIEW);

  if (!items.length) return null;

  return (
    <div className="space-y-2">
      <h4 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">{label}</h4>
      <div className="space-y-1">
        {visible.map((item, i) => {
          const text = item.strength ?? item.weakness ?? '';
          const maxCount = items[0].count || 1;
          const pct = Math.round((item.count / maxCount) * 100);
          return (
            <div key={i} className="flex items-center gap-2">
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between mb-0.5">
                  <span className="text-xs text-gray-700 dark:text-gray-300 truncate capitalize">{text}</span>
                  <span className="text-[10px] text-gray-400 dark:text-gray-600 flex-shrink-0 ml-2">{item.count}x</span>
                </div>
                <div className="h-1 w-full rounded-full bg-gray-200 dark:bg-gray-800 overflow-hidden">
                  <div
                    className={cn('h-full rounded-full', isStrength ? 'bg-red-500/70' : 'bg-emerald-500/70')}
                    style={{ width: `${pct}%` }}
                  />
                </div>
              </div>
            </div>
          );
        })}
      </div>
      {items.length > PREVIEW && (
        <button
          onClick={() => setExpanded(!expanded)}
          className="flex items-center gap-1 text-[10px] text-gray-400 dark:text-gray-600 hover:text-gray-600 dark:hover:text-gray-400 transition-colors"
        >
          {expanded
            ? <><ChevronUp className="h-3 w-3" />Show less</>
            : <><ChevronDown className="h-3 w-3" />+{items.length - PREVIEW} more</>
          }
        </button>
      )}
    </div>
  );
}

// ============================================================================
// Main component
// ============================================================================

interface CompetitorProfileViewProps {
  profile: CompetitorProfile;
  isAdmin?: boolean;
}

export function CompetitorProfileView({ profile, isAdmin = false }: CompetitorProfileViewProps) {
  const totalOutcomes = profile.win_count + profile.loss_count;

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-red-50 dark:bg-gradient-to-br dark:from-red-500/20 dark:to-orange-500/20 flex items-center justify-center flex-shrink-0">
            <Swords className="h-5 w-5 text-red-500 dark:text-red-400" />
          </div>
          <div>
            <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100">{profile.competitor_name}</h2>
            <p className="text-xs text-gray-500">
              {profile.mention_count} mention{profile.mention_count !== 1 ? 's' : ''}
              {profile.last_mentioned_at && (
                <> · Last {new Date(profile.last_mentioned_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}</>
              )}
            </p>
          </div>
        </div>
        {(profile.battlecard_content || profile.auto_battlecard) && (
          <Badge variant="outline" className="border-blue-200 dark:border-blue-800 text-blue-600 dark:text-blue-400 text-[10px] flex-shrink-0">
            <Zap className="h-3 w-3 mr-0.5" />
            Battlecard
          </Badge>
        )}
      </div>

      {/* Win/loss stats — COMP-005 */}
      {totalOutcomes > 0 ? (
        <Card className="border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-900/40">
          <CardContent className="p-4">
            <div className="grid grid-cols-3 gap-4 text-center">
              {/* Win rate */}
              <div>
                <div className={cn('text-2xl font-bold', winRateCls(profile.win_rate))}>
                  {profile.win_rate !== null ? `${profile.win_rate}%` : 'N/A'}
                </div>
                <div className="text-[10px] text-gray-500 mt-0.5 flex items-center justify-center gap-0.5">
                  <Trophy className="h-3 w-3" />
                  Win rate
                </div>
              </div>

              {/* Wins */}
              <div>
                <div className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">{profile.win_count}</div>
                <div className="text-[10px] text-gray-500 mt-0.5 flex items-center justify-center gap-0.5">
                  <TrendingUp className="h-3 w-3" />
                  Won
                </div>
              </div>

              {/* Losses */}
              <div>
                <div className="text-2xl font-bold text-red-600 dark:text-red-400">{profile.loss_count}</div>
                <div className="text-[10px] text-gray-500 mt-0.5 flex items-center justify-center gap-0.5">
                  <TrendingDown className="h-3 w-3" />
                  Lost
                </div>
              </div>
            </div>

            {/* Win rate bar */}
            {profile.win_rate !== null && (
              <div className="mt-3 h-1.5 w-full rounded-full bg-gray-200 dark:bg-gray-800 overflow-hidden">
                <div
                  className="h-full rounded-full bg-emerald-500"
                  style={{ width: `${profile.win_rate}%` }}
                />
              </div>
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="flex items-center gap-2 rounded-lg border border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-900/40 px-4 py-3">
          <AlertCircle className="h-4 w-4 text-gray-400 dark:text-gray-600 flex-shrink-0" />
          <p className="text-xs text-gray-500">No closed deals with this competitor yet — win/loss ratio unavailable</p>
        </div>
      )}

      {/* Strengths & weaknesses */}
      {(profile.common_strengths?.length > 0 || profile.common_weaknesses?.length > 0) && (
        <Card className="border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-900/40">
          <CardHeader className="pb-2 pt-4 px-4">
            <CardTitle className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">
              Common patterns
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4 space-y-4">
            {profile.common_strengths?.length > 0 && (
              <StrengthsWeaknessesSection
                items={profile.common_strengths}
                label="Their strengths (watch out)"
                isStrength={true}
              />
            )}
            {profile.common_weaknesses?.length > 0 && (
              <StrengthsWeaknessesSection
                items={profile.common_weaknesses}
                label="Their weaknesses (our advantage)"
                isStrength={false}
              />
            )}
          </CardContent>
        </Card>
      )}

      {/* Mention frequency chart — COMP-003 */}
      <Card className="border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-900/40">
        <CardContent className="p-4">
          <MentionFrequencyChart competitorName={profile.competitor_name} />
        </CardContent>
      </Card>

      {/* Battlecard — COMP-002 */}
      <BattlecardViewer
        competitorName={profile.competitor_name}
        profileId={profile.id}
        battlecardContent={profile.battlecard_content}
        autoBattlecard={profile.auto_battlecard}
        isAdmin={isAdmin}
      />

      {/* Mentioned in deals — COMP-004 */}
      <Card className="border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-900/40">
        <CardContent className="p-4">
          <MentionedInDeals competitorName={profile.competitor_name} />
        </CardContent>
      </Card>
    </div>
  );
}
