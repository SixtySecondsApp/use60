/**
 * ForecastCategorySelector (FORE-006)
 * Dropdown to set deal forecast_category: Commit, Best Case, Pipeline, Omitted.
 * Saves to deals.forecast_category column.
 */

import React from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { supabase } from '@/lib/supabase/clientV2';
import { toast } from 'sonner';

export type ForecastCategory = 'commit' | 'best_case' | 'pipeline' | 'omitted';

interface ForecastCategorySelectorProps {
  dealId: string;
  currentCategory?: ForecastCategory | null;
  onUpdate?: (category: ForecastCategory | null) => void;
  compact?: boolean;
}

const CATEGORY_OPTIONS: { value: ForecastCategory; label: string; description: string }[] = [
  { value: 'commit', label: 'Commit', description: 'Will close this period' },
  { value: 'best_case', label: 'Best Case', description: 'Likely if things go well' },
  { value: 'pipeline', label: 'Pipeline', description: 'Tracking but not committed' },
  { value: 'omitted', label: 'Omitted', description: 'Exclude from forecast' },
];

const CATEGORY_COLORS: Record<ForecastCategory, string> = {
  commit: 'text-emerald-500',
  best_case: 'text-blue-500',
  pipeline: 'text-purple-500',
  omitted: 'text-muted-foreground',
};

export function ForecastCategorySelector({
  dealId,
  currentCategory,
  onUpdate,
  compact = false,
}: ForecastCategorySelectorProps) {
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: async (category: ForecastCategory | null) => {
      const { error } = await supabase
        .from('deals')
        .update({ forecast_category: category })
        .eq('id', dealId);
      if (error) throw error;
      return category;
    },
    onSuccess: (category) => {
      queryClient.invalidateQueries({ queryKey: ['forecast-totals'] });
      queryClient.invalidateQueries({ queryKey: ['deals'] });
      onUpdate?.(category);
      const label = category
        ? CATEGORY_OPTIONS.find((o) => o.value === category)?.label
        : 'Pipeline';
      toast.success(`Forecast category set to ${label}`);
    },
    onError: () => {
      toast.error('Failed to update forecast category');
    },
  });

  const handleChange = (value: string) => {
    const category = value === 'pipeline_default' ? null : (value as ForecastCategory);
    mutation.mutate(category);
  };

  const displayValue = currentCategory || 'pipeline_default';

  return (
    <Select
      value={displayValue}
      onValueChange={handleChange}
      disabled={mutation.isPending}
    >
      <SelectTrigger
        className={`${compact ? 'h-7 text-xs px-2 py-0' : 'h-9 text-sm'} min-w-[120px] bg-transparent`}
      >
        <SelectValue>
          <span className={currentCategory ? CATEGORY_COLORS[currentCategory] : 'text-muted-foreground'}>
            {currentCategory
              ? CATEGORY_OPTIONS.find((o) => o.value === currentCategory)?.label
              : 'Pipeline'}
          </span>
        </SelectValue>
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="pipeline_default">
          <div>
            <div className="font-medium text-muted-foreground">Pipeline</div>
            <div className="text-xs text-muted-foreground">Default (unset)</div>
          </div>
        </SelectItem>
        {CATEGORY_OPTIONS.map((opt) => (
          <SelectItem key={opt.value} value={opt.value}>
            <div>
              <div className={`font-medium ${CATEGORY_COLORS[opt.value]}`}>{opt.label}</div>
              <div className="text-xs text-muted-foreground">{opt.description}</div>
            </div>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
