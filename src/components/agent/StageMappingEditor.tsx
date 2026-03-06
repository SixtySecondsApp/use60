/**
 * StageMappingEditor
 *
 * Two-column layout mapping CRM deal stages (left) to agent stage definitions (right).
 * Saves to agent_config_org_overrides with key 'stage_mapping'.
 */

import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, Loader2, Save } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { supabase } from '@/lib/supabase/clientV2';
import { useSetOrgOverride, useAgentConfig } from '@/lib/hooks/useAgentConfig';

// Agent stage definitions (methodology-agnostic labels)
const AGENT_STAGES = [
  { key: 'prospecting', label: 'Prospecting', hint: 'Initial outreach and lead generation' },
  { key: 'qualification', label: 'Qualification', hint: 'Assessing fit and budget' },
  { key: 'discovery', label: 'Discovery', hint: 'Understanding needs and pain points' },
  { key: 'proposal', label: 'Proposal / Demo', hint: 'Presenting your solution' },
  { key: 'negotiation', label: 'Negotiation', hint: 'Terms, pricing, and contracts' },
  { key: 'closing', label: 'Closing', hint: 'Final steps to win the deal' },
  { key: 'won', label: 'Won', hint: 'Deal closed successfully' },
  { key: 'lost', label: 'Lost / Churned', hint: 'Deal lost or customer churned' },
  { key: 'unclassified', label: 'Unclassified', hint: 'Stage doesn\'t map to a standard phase' },
];

interface DealStage {
  id: string;
  name: string;
  order_position: number;
  color: string;
}

interface StageMappingEditorProps {
  orgId: string;
  disabled?: boolean;
}

export function StageMappingEditor({ orgId, disabled = false }: StageMappingEditorProps) {
  const setOrgOverride = useSetOrgOverride();
  const { data: config } = useAgentConfig(orgId, 'global');

  // Fetch CRM stages
  const { data: crmStages, isLoading } = useQuery({
    queryKey: ['deal-stages'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('deal_stages')
        .select('id, name, order_position, color')
        .order('order_position');
      if (error) throw error;
      return (data ?? []) as DealStage[];
    },
    staleTime: 5 * 60 * 1000,
  });

  // Local mapping state: crmStageId -> agentStageKey
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [dirty, setDirty] = useState(false);

  // Initialise from saved config
  useEffect(() => {
    const saved = config?.entries?.['stage_mapping']?.config_value as Record<string, string> | undefined;
    if (saved) {
      setMapping(saved);
    }
  }, [config]);

  function handleChange(crmStageId: string, agentStageKey: string) {
    setMapping((prev) => ({ ...prev, [crmStageId]: agentStageKey }));
    setDirty(true);
  }

  async function handleSave() {
    try {
      await setOrgOverride.mutateAsync({
        orgId,
        agentType: 'global',
        configKey: 'stage_mapping',
        configValue: mapping,
      });
      setDirty(false);
    } catch {
      // error toast from mutation
    }
  }

  const unmappedCount = (crmStages ?? []).filter((s) => !mapping[s.id]).length;

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 py-8 text-gray-500">
        <Loader2 className="w-5 h-5 animate-spin" />
        <span className="text-sm">Loading CRM stages…</span>
      </div>
    );
  }

  return (
    <Card className="bg-white/80 dark:bg-gray-900/40 backdrop-blur-xl border-gray-200 dark:border-gray-800/60">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-base">Stage Mapping</CardTitle>
            <CardDescription>
              Map your CRM pipeline stages to agent stage definitions used for coaching and risk scoring.
            </CardDescription>
          </div>
          {unmappedCount > 0 && (
            <Badge variant="outline" className="text-amber-600 border-amber-400 gap-1">
              <AlertTriangle className="w-3 h-3" />
              {unmappedCount} unmapped
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="mb-4 p-3 bg-blue-50 dark:bg-blue-900/10 border border-blue-100 dark:border-blue-800/30 rounded-xl">
          <p className="text-xs text-blue-700 dark:text-blue-300 leading-relaxed">
            <span className="font-medium">Why map stages?</span> When a deal moves in your CRM, 60 needs to understand what that means for coaching and risk scoring. For example, if your CRM stage &quot;Proposal Sent&quot; maps to &quot;Proposal / Demo&quot;, 60 knows to check if you&apos;ve covered pricing objections and decision criteria.
          </p>
        </div>
        {/* Column headers */}
        <div className="grid grid-cols-2 gap-4 text-xs font-medium text-gray-500 dark:text-gray-400 px-1">
          <span>CRM Stage</span>
          <span>Agent Stage</span>
        </div>

        {(crmStages ?? []).map((stage) => (
          <div key={stage.id} className="grid grid-cols-2 gap-4 items-center">
            {/* CRM stage */}
            <div className="flex items-center gap-2 min-w-0">
              <span
                className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                style={{ backgroundColor: stage.color ?? '#94a3b8' }}
              />
              <span className="text-sm text-gray-700 dark:text-gray-300 truncate">
                {stage.name}
              </span>
              {!mapping[stage.id] && (
                <Badge variant="outline" className="text-amber-600 border-amber-400 text-xs ml-auto">
                  Unmapped
                </Badge>
              )}
            </div>

            {/* Agent stage select */}
            <Select
              value={mapping[stage.id] ?? ''}
              onValueChange={(val) => handleChange(stage.id, val)}
              disabled={disabled}
            >
              <SelectTrigger className="h-8 text-sm">
                <SelectValue placeholder="Select agent stage…" />
              </SelectTrigger>
              <SelectContent>
                {AGENT_STAGES.map((as) => (
                  <SelectItem key={as.key} value={as.key}>
                    <div>
                      <span>{as.label}</span>
                      <span className="block text-xs text-gray-400">{as.hint}</span>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        ))}

        {!disabled && dirty && (
          <div className="flex justify-end pt-2">
            <Button
              size="sm"
              className="bg-emerald-500 hover:bg-emerald-600 text-white"
              onClick={handleSave}
              disabled={setOrgOverride.isPending}
            >
              {setOrgOverride.isPending ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <Save className="w-4 h-4 mr-2" />
              )}
              Save Mapping
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
