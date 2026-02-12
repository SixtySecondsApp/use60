/**
 * SourcePreferenceSelector
 *
 * Advanced collapsible UI for selecting which data sources (LinkedIn, Apollo, AI Ark, etc.)
 * should be used for a natural language query. Integrates with org credentials to show
 * only available sources.
 *
 * Part of NLPQ-011: Natural Language Query Bar feature
 */

import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ChevronDown } from 'lucide-react';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { supabase } from '@/lib/supabase/clientV2';
import { useActiveOrgId } from '@/lib/stores/orgStore';
import { cn } from '@/lib/utils';
import type { SourcePreference } from '@/lib/types/apifyQuery';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface SourcePreferenceSelectorProps {
  /** Currently selected sources */
  selectedSources: SourcePreference[];
  /** Callback when sources change */
  onSourcesChange: (sources: SourcePreference[]) => void;
  /** Optional override for available sources (defaults to org integrations) */
  availableSources?: SourcePreference[];
  /** Disable all checkboxes (e.g., during query execution) */
  disabled?: boolean;
  /** Initial collapsed state */
  defaultOpen?: boolean;
}

interface SourceConfig {
  label: string;
  description: string;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const SOURCE_CONFIGS: Record<SourcePreference, SourceConfig> = {
  linkedin: {
    label: 'LinkedIn',
    description: 'Professional profiles and company pages',
  },
  maps: {
    label: 'Google Maps',
    description: 'Local businesses and locations',
  },
  serp: {
    label: 'Web Search',
    description: 'General web search results',
  },
  apollo: {
    label: 'Apollo',
    description: 'B2B contact and company data',
  },
  ai_ark: {
    label: 'AI Ark',
    description: 'AI-powered company intelligence',
  },
};

// ---------------------------------------------------------------------------
// Helper Functions
// ---------------------------------------------------------------------------

/**
 * Derives available sources from integration credentials
 */
function deriveAvailableSources(
  integrations: Array<{ integration_type: string }> | null | undefined
): SourcePreference[] {
  if (!integrations) return [];

  const available: SourcePreference[] = [];
  const integrationTypes = new Set(integrations.map((i) => i.integration_type));

  // Apify enables LinkedIn, Maps, SERP
  if (integrationTypes.has('apify')) {
    available.push('linkedin', 'maps', 'serp');
  }

  // Apollo
  if (integrationTypes.has('apollo')) {
    available.push('apollo');
  }

  // AI Ark
  if (integrationTypes.has('ai_ark')) {
    available.push('ai_ark');
  }

  return available;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function SourcePreferenceSelector({
  selectedSources,
  onSourcesChange,
  availableSources,
  disabled = false,
  defaultOpen = false,
}: SourcePreferenceSelectorProps) {
  const [isOpen, setIsOpen] = useState(defaultOpen);
  const activeOrgId = useActiveOrgId();

  // Fetch available sources from org integrations if not provided
  const { data: integrations } = useQuery({
    queryKey: ['org-integrations', activeOrgId],
    queryFn: async () => {
      if (!activeOrgId) return null;

      const { data, error } = await supabase
        .from('integration_credentials')
        .select('integration_type')
        .eq('organization_id', activeOrgId)
        .eq('is_active', true);

      if (error) {
        console.error('[SourcePreferenceSelector] Error fetching integrations:', error);
        return null;
      }

      return data;
    },
    enabled: !availableSources && !!activeOrgId,
    staleTime: 5 * 60 * 1000, // 5 minutes
  });

  // Use provided sources or derive from integrations
  const sources = availableSources || deriveAvailableSources(integrations);

  // Handle checkbox toggle
  const handleToggle = (source: SourcePreference, checked: boolean) => {
    if (disabled) return;

    if (checked) {
      // Add source if not already selected
      if (!selectedSources.includes(source)) {
        onSourcesChange([...selectedSources, source]);
      }
    } else {
      // Remove source
      onSourcesChange(selectedSources.filter((s) => s !== source));
    }
  };

  // If no sources available, show message
  if (sources.length === 0) {
    return (
      <div className="text-sm text-muted-foreground py-2">
        No data sources configured. Please configure integrations in Settings.
      </div>
    );
  }

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen}>
      <CollapsibleTrigger
        className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
        disabled={disabled}
      >
        <ChevronDown
          className={cn(
            'h-4 w-4 transition-transform duration-200',
            isOpen && 'rotate-180'
          )}
        />
        <span>
          Advanced: Data Sources ({selectedSources.length}/{sources.length})
        </span>
      </CollapsibleTrigger>

      <CollapsibleContent className="pt-3">
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Select which data sources to search. More sources = better coverage but higher
            credit cost.
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {sources.map((source) => {
              const config = SOURCE_CONFIGS[source];
              const isChecked = selectedSources.includes(source);

              return (
                <div
                  key={source}
                  className={cn(
                    'flex items-start space-x-3 p-3 rounded-lg border transition-colors',
                    isChecked
                      ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-950/20'
                      : 'border-gray-200 dark:border-gray-700',
                    disabled && 'opacity-50 cursor-not-allowed'
                  )}
                >
                  <Checkbox
                    id={`source-${source}`}
                    checked={isChecked}
                    onCheckedChange={(checked) => handleToggle(source, checked as boolean)}
                    disabled={disabled}
                    className="mt-0.5"
                  />
                  <div className="flex-1 min-w-0">
                    <Label
                      htmlFor={`source-${source}`}
                      className={cn(
                        'text-sm font-medium cursor-pointer',
                        disabled && 'cursor-not-allowed'
                      )}
                    >
                      {config.label}
                    </Label>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {config.description}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>

          {selectedSources.length === 0 && (
            <div className="flex items-center gap-2 p-3 rounded-lg border border-destructive bg-destructive/10 text-destructive">
              <span className="text-sm font-medium">⚠️ Select at least one source</span>
            </div>
          )}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}
