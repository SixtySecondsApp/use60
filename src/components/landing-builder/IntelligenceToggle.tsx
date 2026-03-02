/**
 * IntelligenceToggle — 3-segment model tier selector for landing builder.
 *
 * Segments: Fast (Haiku) / Balanced (Sonnet) / Creative (Opus)
 */

import React from 'react';
import { Brain } from 'lucide-react';
import { cn } from '@/lib/utils';

export type ModelTier = 'fast' | 'balanced' | 'creative';

interface IntelligenceToggleProps {
  value: ModelTier;
  onChange: (tier: ModelTier) => void;
  className?: string;
}

const TIERS: Array<{ id: ModelTier; label: string; sublabel: string }> = [
  { id: 'fast', label: 'Fast', sublabel: 'Haiku' },
  { id: 'balanced', label: 'Balanced', sublabel: 'Sonnet' },
  { id: 'creative', label: 'Creative', sublabel: 'Opus' },
];

export function IntelligenceToggle({ value, onChange, className = '' }: IntelligenceToggleProps) {
  return (
    <div className={cn('flex items-center gap-2', className)}>
      <Brain className="w-3.5 h-3.5 text-gray-400" />
      <div className="flex rounded-lg bg-white/5 border border-white/10 p-0.5">
        {TIERS.map((tier) => (
          <button
            key={tier.id}
            type="button"
            onClick={() => onChange(tier.id)}
            className={cn(
              'px-3 py-1 rounded-md text-xs font-medium transition-all duration-200',
              value === tier.id
                ? 'bg-white/10 text-white shadow-sm'
                : 'text-gray-500 hover:text-gray-300',
            )}
            title={tier.sublabel}
          >
            {tier.label}
          </button>
        ))}
      </div>
    </div>
  );
}
