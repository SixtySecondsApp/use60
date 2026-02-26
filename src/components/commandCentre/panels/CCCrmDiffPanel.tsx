/**
 * CCCrmDiffPanel — CC-013
 *
 * Typed detail panel for CRM field update items.
 * Renders a before/after diff table, confidence bar, reasoning, and
 * a "View in HubSpot" link when a hubspot_deal_id is present.
 */

import { ExternalLink } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { CCItem } from '@/lib/services/commandCentreItemsService';

// ============================================================================
// Types
// ============================================================================

interface CrmChange {
  field: string;
  before: string;
  after: string;
}

interface CrmDiffData {
  changes: CrmChange[];
  reasoning?: string;
  confidence?: number;
  hubspot_deal_id?: string;
}

// ============================================================================
// Props
// ============================================================================

export interface CCCrmDiffPanelProps {
  item: CCItem;
}

// ============================================================================
// Helpers
// ============================================================================

function extractCrmDiffData(item: CCItem): CrmDiffData {
  const draftedAction = (item.drafted_action as Record<string, unknown>) ?? {};
  const enrichmentContext = (item.enrichment_context as Record<string, unknown>) ?? {};

  // Prefer drafted_action, fall back to enrichment_context
  const source: Record<string, unknown> =
    Array.isArray(draftedAction.changes) ? draftedAction : enrichmentContext;

  const rawChanges = Array.isArray(source.changes) ? source.changes : [];
  const changes: CrmChange[] = rawChanges
    .filter(
      (c): c is Record<string, unknown> =>
        c !== null && typeof c === 'object' && !Array.isArray(c),
    )
    .map((c) => ({
      field: String(c.field ?? ''),
      before: String(c.before ?? '—'),
      after: String(c.after ?? '—'),
    }));

  const confidence =
    typeof source.confidence === 'number' ? source.confidence : undefined;
  const reasoning =
    typeof source.reasoning === 'string' ? source.reasoning : undefined;
  const hubspot_deal_id =
    typeof source.hubspot_deal_id === 'string' ? source.hubspot_deal_id : undefined;

  return { changes, confidence, reasoning, hubspot_deal_id };
}

// ============================================================================
// Component
// ============================================================================

export function CCCrmDiffPanel({ item }: CCCrmDiffPanelProps) {
  const { changes, confidence, reasoning, hubspot_deal_id } = extractCrmDiffData(item);

  const confidencePct = confidence != null ? Math.round(confidence * 100) : null;
  const confidenceBarColor =
    confidencePct == null
      ? 'bg-slate-300 dark:bg-gray-600'
      : confidencePct >= 80
      ? 'bg-emerald-500'
      : confidencePct >= 50
      ? 'bg-amber-500'
      : 'bg-red-500';
  const confidenceTextColor =
    confidencePct == null
      ? 'text-slate-500 dark:text-gray-400'
      : confidencePct >= 80
      ? 'text-emerald-600 dark:text-emerald-400'
      : confidencePct >= 50
      ? 'text-amber-600 dark:text-amber-400'
      : 'text-red-500';

  return (
    <div className="space-y-4">
      {/* ---- Diff table ---- */}
      {changes.length > 0 ? (
        <div className="rounded-lg border border-slate-200 dark:border-gray-700/60 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 dark:bg-gray-800/60">
                <th className="text-left px-3 py-2 text-xs font-medium text-slate-500 dark:text-gray-400">
                  Field
                </th>
                <th className="text-left px-3 py-2 text-xs font-medium text-slate-500 dark:text-gray-400">
                  Before
                </th>
                <th className="text-left px-3 py-2 text-xs font-medium text-slate-500 dark:text-gray-400">
                  After
                </th>
              </tr>
            </thead>
            <tbody>
              {changes.map((change) => (
                <tr
                  key={change.field}
                  className="border-t border-slate-100 dark:border-gray-800/40"
                >
                  <td className="px-3 py-2 text-xs font-medium text-slate-700 dark:text-gray-200">
                    {change.field}
                  </td>
                  <td className="px-3 py-2 text-xs text-red-500 line-through">
                    {change.before}
                  </td>
                  <td className="px-3 py-2 text-xs text-emerald-600 dark:text-emerald-400 font-medium">
                    {change.after}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="text-xs text-slate-400 dark:text-gray-500 italic">
          No field changes available.
        </p>
      )}

      {/* ---- Confidence bar ---- */}
      {confidencePct != null && (
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-xs text-slate-500 dark:text-gray-400">AI confidence</span>
            <span className={cn('text-xs font-semibold tabular-nums', confidenceTextColor)}>
              {confidencePct}%
            </span>
          </div>
          <div className="h-2 rounded-full bg-slate-100 dark:bg-gray-800 overflow-hidden">
            <div
              className={cn('h-full rounded-full transition-all', confidenceBarColor)}
              style={{ width: `${confidencePct}%` }}
            />
          </div>
        </div>
      )}

      {/* ---- Reasoning ---- */}
      {reasoning && (
        <div className="rounded-lg bg-slate-50 dark:bg-gray-800/40 border border-slate-200 dark:border-gray-700/60 px-3 py-3">
          <p className="text-xs font-medium text-slate-500 dark:text-gray-400 mb-1 uppercase tracking-wide">
            Reasoning
          </p>
          <p className="text-sm text-slate-600 dark:text-gray-300 leading-relaxed">{reasoning}</p>
        </div>
      )}

      {/* ---- View in HubSpot ---- */}
      {hubspot_deal_id && (
        <a
          href={`https://app.hubspot.com/contacts/deal/${hubspot_deal_id}`}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1.5 text-xs text-blue-600 dark:text-blue-400 hover:underline"
        >
          <ExternalLink className="h-3.5 w-3.5" />
          View in HubSpot
        </a>
      )}
    </div>
  );
}
