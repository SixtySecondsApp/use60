/**
 * DealOutcomeForm — WL-002
 * Won/lost form with reason code, competitor, notes.
 * Can be embedded in a deal close flow or a sheet.
 */

import React, { useEffect, useState } from 'react';
import { CheckCircle2, XCircle, Loader2 } from 'lucide-react';
import { useRecordDealOutcome, useDealOutcome } from '@/lib/services/winLossService';
import type { LossReasonCode } from '@/lib/types/winLoss';

const LOSS_REASONS: { value: LossReasonCode; label: string }[] = [
  { value: 'price',         label: 'Price / Cost' },
  { value: 'timing',        label: 'Bad Timing' },
  { value: 'competitor_won',label: 'Competitor Won' },
  { value: 'no_decision',   label: 'No Decision' },
  { value: 'feature_gap',   label: 'Feature Gap' },
  { value: 'champion_left', label: 'Champion Left' },
  { value: 'budget_cut',    label: 'Budget Cut' },
  { value: 'other',         label: 'Other' },
];

interface Props {
  orgId: string;
  dealId: string;
  /** Called after successful save */
  onSaved?: () => void;
}

export function DealOutcomeForm({ orgId, dealId, onSaved }: Props) {
  const { data: existing } = useDealOutcome(dealId);
  const { mutate: record, isPending } = useRecordDealOutcome();

  const [outcome, setOutcome]       = useState<'won' | 'lost' | null>(null);
  const [reasonCode, setReasonCode] = useState<LossReasonCode | ''>('');
  const [notes, setNotes]           = useState('');

  // Pre-populate from existing outcome
  useEffect(() => {
    if (existing) {
      setOutcome(existing.outcome);
      setReasonCode((existing.reason_code ?? '') as LossReasonCode | '');
      setNotes(existing.notes ?? '');
    }
  }, [existing]);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!outcome) return;
    record(
      {
        orgId,
        dealId,
        outcome,
        reasonCode: outcome === 'lost' && reasonCode ? reasonCode : null,
        notes: notes.trim() || null,
      },
      { onSuccess: onSaved }
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {/* Outcome toggle */}
      <div>
        <p className="text-xs font-medium text-gray-400 mb-2">Deal outcome</p>
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => setOutcome('won')}
            className={`flex items-center justify-center gap-2 rounded-lg border py-3 text-sm font-medium transition-colors ${
              outcome === 'won'
                ? 'border-emerald-500 bg-emerald-500/10 text-emerald-400'
                : 'border-gray-700 bg-gray-800/50 text-gray-400 hover:border-gray-600'
            }`}
          >
            <CheckCircle2 className="h-4 w-4" />
            Won
          </button>
          <button
            type="button"
            onClick={() => setOutcome('lost')}
            className={`flex items-center justify-center gap-2 rounded-lg border py-3 text-sm font-medium transition-colors ${
              outcome === 'lost'
                ? 'border-red-500 bg-red-500/10 text-red-400'
                : 'border-gray-700 bg-gray-800/50 text-gray-400 hover:border-gray-600'
            }`}
          >
            <XCircle className="h-4 w-4" />
            Lost
          </button>
        </div>
      </div>

      {/* Loss reason (only when lost) */}
      {outcome === 'lost' && (
        <div>
          <label className="text-xs font-medium text-gray-400 block mb-1.5">
            Loss reason
          </label>
          <select
            value={reasonCode}
            onChange={(e) => setReasonCode(e.target.value as LossReasonCode | '')}
            className="w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-white focus:border-indigo-500 focus:outline-none"
          >
            <option value="">Select a reason…</option>
            {LOSS_REASONS.map((r) => (
              <option key={r.value} value={r.value}>
                {r.label}
              </option>
            ))}
          </select>
        </div>
      )}

      {/* Notes */}
      <div>
        <label className="text-xs font-medium text-gray-400 block mb-1.5">
          Notes <span className="text-gray-600">(optional)</span>
        </label>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="What happened?"
          rows={3}
          className="w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-white placeholder-gray-600 focus:border-indigo-500 focus:outline-none resize-none"
        />
      </div>

      <button
        type="submit"
        disabled={!outcome || isPending}
        className="w-full rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
      >
        {isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
        {existing ? 'Update outcome' : 'Record outcome'}
      </button>
    </form>
  );
}
