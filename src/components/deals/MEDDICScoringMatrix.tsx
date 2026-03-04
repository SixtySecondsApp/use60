/**
 * MEDDICScoringMatrix — MEDDIC-002
 *
 * Visual 7×5 matrix: rows = MEDDIC fields, columns = score levels (0-4).
 * Current score highlighted per field with colour coding.
 * Overall MEDDIC score with health assessment shown in footer.
 *
 * Light + dark mode. Lucide icons only.
 */

import { cn } from '@/lib/utils';
import { MEDDIC_FIELDS, SCORE_CONFIG, getScoreConfig, type MEDDICScore } from './MEDDICPanel';

// =============================================================================
// Props
// =============================================================================

interface MEDDICScoringMatrixProps {
  scores: MEDDICScore[];
  totalScore: number;
}

// =============================================================================
// Component
// =============================================================================

export function MEDDICScoringMatrix({ scores, totalScore }: MEDDICScoringMatrixProps) {
  const scoreMap = new Map<string, MEDDICScore>();
  for (const s of scores) {
    scoreMap.set(s.field, s);
  }

  const maxScore = MEDDIC_FIELDS.length * 4; // 28

  function getAssessment(score: number): { label: string; color: string; barColor: string } {
    if (score <= 7)
      return {
        label: 'Critical',
        color: 'text-red-600 dark:text-red-400',
        barColor: 'bg-red-500',
      };
    if (score <= 14)
      return {
        label: 'At Risk',
        color: 'text-amber-600 dark:text-amber-400',
        barColor: 'bg-amber-500',
      };
    if (score <= 21)
      return {
        label: 'Healthy',
        color: 'text-emerald-600 dark:text-emerald-400',
        barColor: 'bg-emerald-500',
      };
    return {
      label: 'Strong',
      color: 'text-blue-600 dark:text-blue-400',
      barColor: 'bg-blue-500',
    };
  }

  const assessment = getAssessment(totalScore);
  const pct = Math.round((totalScore / maxScore) * 100);

  return (
    <div className="rounded-xl border border-gray-200/80 dark:border-white/[0.06] bg-white/60 dark:bg-white/[0.02] overflow-hidden">
      {/* Matrix header */}
      <div className="grid grid-cols-[120px_repeat(5,1fr)] border-b border-gray-100 dark:border-white/[0.05] bg-gray-50/80 dark:bg-white/[0.01]">
        <div className="px-3 py-2 text-[10px] font-bold text-gray-400 dark:text-gray-500 uppercase tracking-wider">
          Field
        </div>
        {SCORE_CONFIG.map((s) => (
          <div
            key={s.score}
            className={cn(
              'px-1 py-2 text-center text-[10px] font-medium',
              s.textColor
            )}
          >
            {s.score}
            <div className="text-[9px] font-normal text-gray-400 dark:text-gray-500 hidden sm:block">
              {s.shortLabel === '0' ? 'Unknown' : s.label.slice(0, 4)}
            </div>
          </div>
        ))}
      </div>

      {/* Matrix rows */}
      <div className="divide-y divide-gray-100 dark:divide-white/[0.04]">
        {MEDDIC_FIELDS.map((fieldDef) => {
          const row = scoreMap.get(fieldDef.field);
          const currentScore = row?.score ?? 0;

          return (
            <div
              key={fieldDef.field}
              className="grid grid-cols-[120px_repeat(5,1fr)] hover:bg-gray-50/50 dark:hover:bg-white/[0.01] transition-colors"
            >
              {/* Field label */}
              <div className="px-3 py-2.5 flex items-center">
                <span className="text-[11.5px] font-medium text-gray-700 dark:text-gray-300 leading-tight">
                  {fieldDef.label}
                </span>
              </div>

              {/* Score cells */}
              {SCORE_CONFIG.map((s) => {
                const isActive = currentScore === s.score;
                const cfg = getScoreConfig(s.score);
                return (
                  <div
                    key={s.score}
                    className="flex items-center justify-center py-2.5 px-1"
                  >
                    <div
                      className={cn(
                        'w-5 h-5 rounded-full flex items-center justify-center transition-all text-[10px] font-bold',
                        isActive
                          ? `${cfg.bgColor} ${cfg.textColor} ring-2 ring-offset-1 ring-offset-white dark:ring-offset-gray-950 ring-current/30 shadow-sm`
                          : 'bg-gray-100 dark:bg-white/[0.04] text-gray-300 dark:text-gray-600'
                      )}
                    >
                      {isActive ? s.score : ''}
                    </div>
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>

      {/* Footer: overall score */}
      <div className="px-3 py-3 border-t border-gray-100 dark:border-white/[0.05] bg-gray-50/80 dark:bg-white/[0.01]">
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-[11px] font-medium text-gray-600 dark:text-gray-400">
            Overall MEDDIC Score
          </span>
          <div className="flex items-center gap-2">
            <span className={cn('text-[13px] font-bold tabular-nums', assessment.color)}>
              {totalScore} / {maxScore}
            </span>
            <span
              className={cn(
                'text-[10px] font-semibold px-2 py-0.5 rounded-full',
                assessment.label === 'Critical'
                  ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
                  : assessment.label === 'At Risk'
                  ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400'
                  : assessment.label === 'Healthy'
                  ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400'
                  : 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400'
              )}
            >
              {assessment.label}
            </span>
          </div>
        </div>
        <div className="h-1.5 rounded-full bg-gray-200 dark:bg-white/[0.06] overflow-hidden">
          <div
            className={cn('h-full rounded-full transition-all duration-500', assessment.barColor)}
            style={{ width: `${pct}%` }}
          />
        </div>
        <div className="flex justify-between mt-1 text-[9px] text-gray-400 dark:text-gray-500">
          <span>0 — Critical</span>
          <span>8 — At Risk</span>
          <span>15 — Healthy</span>
          <span>22 — Strong</span>
        </div>
      </div>
    </div>
  );
}
