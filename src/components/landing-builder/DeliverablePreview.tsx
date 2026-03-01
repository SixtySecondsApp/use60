/**
 * Deliverable Preview Component
 * Shows condensed preview of each phase's deliverable in the right panel
 */

import React from 'react';
import { FileText, Layout, Palette, Type, Image, Code } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { PhaseDeliverable, DeliverableType } from './types';

interface DeliverablePreviewProps {
  deliverable: PhaseDeliverable;
  phaseNumber: number;
}

const deliverableConfig: Record<DeliverableType, { icon: typeof FileText; label: string; color: string }> = {
  strategy: { icon: FileText, label: 'Strategic Brief', color: 'text-violet-400' },
  wireframe: { icon: Layout, label: 'Wireframe', color: 'text-blue-400' },
  style: { icon: Palette, label: 'Style Direction', color: 'text-pink-400' },
  copy: { icon: Type, label: 'Copy Deck', color: 'text-emerald-400' },
  assets: { icon: Image, label: 'Asset Inventory', color: 'text-amber-400' },
  code: { icon: Code, label: 'Production Code', color: 'text-cyan-400' },
};

export const DeliverablePreview: React.FC<DeliverablePreviewProps> = ({ deliverable, phaseNumber }) => {
  const config = deliverableConfig[deliverable.type];
  const Icon = config.icon;

  return (
    <div
      className={cn(
        'rounded-lg border border-gray-200 dark:border-white/5 p-3',
        'bg-gray-50 dark:bg-white/[0.02]'
      )}
    >
      <div className="flex items-center gap-2 mb-2">
        <Icon className={cn('w-4 h-4', config.color)} />
        <span className="text-xs font-medium text-gray-900 dark:text-white">
          Phase {phaseNumber}: {config.label}
        </span>
      </div>
      <p className="text-xs text-gray-500 dark:text-slate-400 leading-relaxed line-clamp-3">
        {deliverable.summary}
      </p>
    </div>
  );
};
