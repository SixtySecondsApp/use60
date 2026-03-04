/**
 * SafetyRulesConfig — AE2-015
 *
 * Admin-only safety rules configuration panel for the Autonomy Settings page.
 *
 * Sections:
 *   1. Deal value thresholds — configurable low/medium/high boundaries per org
 *   2. Action reversibility table — read-only, platform-defined ratings
 *   3. Impact demotion explanation — shows how factors combine into the multiplier
 *
 * Stores deal value thresholds in agent_config_org_overrides with config keys:
 *   - safety.deal_value_threshold_low
 *   - safety.deal_value_threshold_high
 *
 * The demotion engine (demotionEngine.ts) already calculates the impact multiplier;
 * this component provides visibility into the weights and configuration.
 */

import { useState, useEffect } from 'react';
import {
  Shield,
  DollarSign,
  ArrowUpDown,
  Loader2,
  Save,
  Info,
  AlertTriangle,
  RotateCcw,
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { supabase } from '@/lib/supabase/clientV2';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

// =============================================================================
// Types
// =============================================================================

interface SafetyRulesConfigProps {
  orgId: string;
}

interface DealValueThresholds {
  low: number;   // Below this = low value (factor 0.0)
  high: number;  // Above this = high value (factor 1.0); between = medium (factor 0.5)
}

// =============================================================================
// Constants — mirrors demotionEngine.ts ACTION_REVERSIBILITY
// =============================================================================

const ACTION_REVERSIBILITY: {
  action: string;
  label: string;
  reversibility: number;
  category: string;
}[] = [
  { action: 'task.create', label: 'Task Creation', reversibility: 0.0, category: 'Tasks' },
  { action: 'task.assign', label: 'Task Assignment', reversibility: 0.1, category: 'Tasks' },
  { action: 'crm.note_add', label: 'CRM Note Add', reversibility: 0.1, category: 'CRM' },
  { action: 'crm.activity_log', label: 'Activity Logging', reversibility: 0.1, category: 'CRM' },
  { action: 'crm.contact_enrich', label: 'Contact Enrichment', reversibility: 0.2, category: 'CRM' },
  { action: 'crm.next_steps_update', label: 'Next Steps Update', reversibility: 0.2, category: 'CRM' },
  { action: 'crm.deal_field_update', label: 'Deal Field Update', reversibility: 0.3, category: 'CRM' },
  { action: 'crm.deal_stage_change', label: 'Deal Stage Change', reversibility: 0.3, category: 'CRM' },
  { action: 'crm.deal_amount_change', label: 'Deal Amount Change', reversibility: 0.4, category: 'CRM' },
  { action: 'crm.deal_close_date_change', label: 'Close Date Change', reversibility: 0.4, category: 'CRM' },
  { action: 'calendar.create_event', label: 'Meeting Scheduling', reversibility: 0.3, category: 'Calendar' },
  { action: 'calendar.reschedule', label: 'Meeting Rescheduling', reversibility: 0.4, category: 'Calendar' },
  { action: 'slack.briefing_send', label: 'Slack Briefing', reversibility: 0.3, category: 'Messaging' },
  { action: 'slack.notification_send', label: 'Slack Notification', reversibility: 0.5, category: 'Messaging' },
  { action: 'sequence.start', label: 'Sequence Start', reversibility: 0.6, category: 'Outreach' },
  { action: 'email.draft_save', label: 'Email Draft Save', reversibility: 0.0, category: 'Email' },
  { action: 'email.check_in_send', label: 'Check-In Email Send', reversibility: 0.7, category: 'Email' },
  { action: 'email.send', label: 'Email Send', reversibility: 0.8, category: 'Email' },
  { action: 'email.follow_up_send', label: 'Follow-Up Email Send', reversibility: 0.8, category: 'Email' },
  { action: 'proposal.generate', label: 'Proposal Generate', reversibility: 0.2, category: 'Proposals' },
  { action: 'proposal.send', label: 'Proposal Send', reversibility: 0.9, category: 'Proposals' },
];

const DEFAULT_THRESHOLDS: DealValueThresholds = {
  low: 25000,
  high: 100000,
};

function reversibilityBadge(value: number): { label: string; className: string } {
  if (value <= 0.1) return { label: 'Fully Reversible', className: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' };
  if (value <= 0.3) return { label: 'Low Risk', className: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400' };
  if (value <= 0.5) return { label: 'Medium Risk', className: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400' };
  if (value <= 0.7) return { label: 'High Risk', className: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400' };
  return { label: 'Irreversible', className: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400' };
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(value);
}

// =============================================================================
// Component
// =============================================================================

export function SafetyRulesConfig({ orgId }: SafetyRulesConfigProps) {
  const [thresholds, setThresholds] = useState<DealValueThresholds>(DEFAULT_THRESHOLDS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);

  // ---------------------------------------------------------------------------
  // Load thresholds from agent_config_org_overrides
  // ---------------------------------------------------------------------------
  useEffect(() => {
    if (!orgId) return;

    const load = async () => {
      setLoading(true);
      try {
        const { data, error } = await supabase
          .from('agent_config_org_overrides')
          .select('config_key, config_value')
          .eq('org_id', orgId)
          .eq('agent_type', 'global')
          .in('config_key', [
            'safety.deal_value_threshold_low',
            'safety.deal_value_threshold_high',
          ]);

        if (error) throw error;

        const loaded = { ...DEFAULT_THRESHOLDS };
        for (const row of data ?? []) {
          const val = Number(row.config_value);
          if (!isNaN(val) && val >= 0) {
            if (row.config_key === 'safety.deal_value_threshold_low') loaded.low = val;
            if (row.config_key === 'safety.deal_value_threshold_high') loaded.high = val;
          }
        }
        setThresholds(loaded);
        setDirty(false);
      } catch (err) {
        console.error('[SafetyRulesConfig] load error:', err);
      } finally {
        setLoading(false);
      }
    };

    load();
  }, [orgId]);

  // ---------------------------------------------------------------------------
  // Save thresholds
  // ---------------------------------------------------------------------------
  const handleSave = async () => {
    if (!orgId) return;

    // Validate: low must be less than high
    if (thresholds.low >= thresholds.high) {
      toast.error('Low threshold must be less than high threshold');
      return;
    }

    setSaving(true);
    try {
      const rows = [
        {
          org_id: orgId,
          agent_type: 'global',
          config_key: 'safety.deal_value_threshold_low',
          config_value: thresholds.low,
          updated_at: new Date().toISOString(),
        },
        {
          org_id: orgId,
          agent_type: 'global',
          config_key: 'safety.deal_value_threshold_high',
          config_value: thresholds.high,
          updated_at: new Date().toISOString(),
        },
      ];

      const { error } = await supabase
        .from('agent_config_org_overrides')
        .upsert(rows, { onConflict: 'org_id,agent_type,config_key' });

      if (error) throw error;

      toast.success('Safety thresholds saved');
      setDirty(false);
    } catch (err) {
      console.error('[SafetyRulesConfig] save error:', err);
      toast.error('Failed to save safety thresholds');
    } finally {
      setSaving(false);
    }
  };

  const handleReset = () => {
    setThresholds(DEFAULT_THRESHOLDS);
    setDirty(true);
  };

  const handleThresholdChange = (key: keyof DealValueThresholds, value: string) => {
    const numVal = parseInt(value.replace(/[^0-9]/g, ''), 10);
    if (isNaN(numVal)) return;
    setThresholds((prev) => ({ ...prev, [key]: numVal }));
    setDirty(true);
  };

  if (loading) {
    return (
      <div className="flex items-center gap-2 py-8 justify-center text-sm text-gray-500">
        <Loader2 className="h-4 w-4 animate-spin" />
        Loading safety rules...
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* --- Deal Value Thresholds --- */}
      <Card className="border-gray-200 dark:border-gray-800">
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <DollarSign className="h-4 w-4 text-gray-500" />
            <CardTitle className="text-sm font-semibold">Deal Value Thresholds</CardTitle>
          </div>
          <CardDescription className="text-xs">
            Configure the deal value boundaries that determine the impact factor during
            demotion evaluation. Deals below the low threshold are considered low-impact;
            deals above the high threshold are high-impact.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="threshold-low" className="text-sm font-medium text-gray-700 dark:text-gray-300">
                Low Threshold
              </Label>
              <div className="relative">
                <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                <Input
                  id="threshold-low"
                  type="text"
                  value={thresholds.low.toLocaleString()}
                  onChange={(e) => handleThresholdChange('low', e.target.value)}
                  className="pl-9"
                  placeholder="25,000"
                />
              </div>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Below this: impact factor = 0.0 (low stakes)
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="threshold-high" className="text-sm font-medium text-gray-700 dark:text-gray-300">
                High Threshold
              </Label>
              <div className="relative">
                <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                <Input
                  id="threshold-high"
                  type="text"
                  value={thresholds.high.toLocaleString()}
                  onChange={(e) => handleThresholdChange('high', e.target.value)}
                  className="pl-9"
                  placeholder="100,000"
                />
              </div>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Above this: impact factor = 1.0 (high stakes)
              </p>
            </div>
          </div>

          {/* Visual scale */}
          <div className="bg-gray-50 dark:bg-gray-800/30 rounded-lg p-3 border border-gray-100 dark:border-gray-800">
            <div className="flex items-center gap-2 mb-2">
              <Info className="h-3.5 w-3.5 text-gray-400" />
              <span className="text-xs font-medium text-gray-500 dark:text-gray-400">
                Deal Value Impact Scale
              </span>
            </div>
            <div className="flex items-center gap-1 h-6">
              <div className="flex-1 rounded-l-md bg-green-200 dark:bg-green-900/40 h-full flex items-center justify-center">
                <span className="text-xs font-medium text-green-700 dark:text-green-400">
                  0.0
                </span>
              </div>
              <div className="flex-1 bg-yellow-200 dark:bg-yellow-900/40 h-full flex items-center justify-center">
                <span className="text-xs font-medium text-yellow-700 dark:text-yellow-400">
                  0.5
                </span>
              </div>
              <div className="flex-1 rounded-r-md bg-red-200 dark:bg-red-900/40 h-full flex items-center justify-center">
                <span className="text-xs font-medium text-red-700 dark:text-red-400">
                  1.0
                </span>
              </div>
            </div>
            <div className="flex justify-between mt-1">
              <span className="text-xs text-gray-500 dark:text-gray-400">
                &lt; {formatCurrency(thresholds.low)}
              </span>
              <span className="text-xs text-gray-500 dark:text-gray-400">
                {formatCurrency(thresholds.low)} - {formatCurrency(thresholds.high)}
              </span>
              <span className="text-xs text-gray-500 dark:text-gray-400">
                &gt; {formatCurrency(thresholds.high)}
              </span>
            </div>
          </div>

          {/* Save / Reset buttons */}
          <div className="flex items-center justify-end gap-2 pt-1">
            <Button
              variant="outline"
              size="sm"
              onClick={handleReset}
              disabled={saving}
            >
              <RotateCcw className="h-3.5 w-3.5 mr-1.5" />
              Reset to Defaults
            </Button>
            <Button
              size="sm"
              onClick={handleSave}
              disabled={saving || !dirty}
            >
              {saving ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                  Saving...
                </>
              ) : (
                <>
                  <Save className="h-3.5 w-3.5 mr-1.5" />
                  Save Thresholds
                </>
              )}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* --- Action Reversibility Table --- */}
      <Card className="border-gray-200 dark:border-gray-800">
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <ArrowUpDown className="h-4 w-4 text-gray-500" />
            <CardTitle className="text-sm font-semibold">Action Reversibility Ratings</CardTitle>
            <Badge variant="outline" className="text-xs ml-auto">
              Platform-Defined
            </Badge>
          </div>
          <CardDescription className="text-xs">
            Each action type has a reversibility factor from 0.0 (fully reversible, easy to undo)
            to 1.0 (irreversible, cannot be undone). These are platform-defined and cannot be changed.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="rounded-lg border border-gray-200 dark:border-gray-800 overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Action</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead className="text-center">Rating</TableHead>
                  <TableHead className="text-right">Risk Level</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {ACTION_REVERSIBILITY.map((item) => {
                  const badge = reversibilityBadge(item.reversibility);
                  return (
                    <TableRow key={item.action}>
                      <TableCell className="font-medium text-sm text-gray-900 dark:text-gray-100">
                        {item.label}
                      </TableCell>
                      <TableCell>
                        <span className="text-xs text-gray-500 dark:text-gray-400">
                          {item.category}
                        </span>
                      </TableCell>
                      <TableCell className="text-center">
                        <div className="flex items-center justify-center gap-2">
                          {/* Visual bar */}
                          <div className="w-16 h-1.5 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                            <div
                              className={cn(
                                'h-full rounded-full transition-all',
                                item.reversibility <= 0.3
                                  ? 'bg-green-500'
                                  : item.reversibility <= 0.6
                                    ? 'bg-yellow-500'
                                    : 'bg-red-500'
                              )}
                              style={{ width: `${item.reversibility * 100}%` }}
                            />
                          </div>
                          <span className="text-xs font-mono text-gray-600 dark:text-gray-300 w-6 text-right">
                            {item.reversibility.toFixed(1)}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell className="text-right">
                        <span
                          className={cn(
                            'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium',
                            badge.className
                          )}
                        >
                          {badge.label}
                        </span>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* --- Impact Demotion Explanation --- */}
      <Card className="border-gray-200 dark:border-gray-800">
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-gray-500" />
            <CardTitle className="text-sm font-semibold">Impact-Weighted Demotion</CardTitle>
          </div>
          <CardDescription className="text-xs">
            When the AI agent is demoted from auto-execute mode, the severity is weighted by
            the deal context. High-value deals involving senior contacts with irreversible actions
            trigger more aggressive safety responses.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Formula explanation */}
          <div className="bg-gray-50 dark:bg-gray-800/30 rounded-lg p-4 border border-gray-100 dark:border-gray-800">
            <div className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-3">
              Impact Multiplier Formula
            </div>
            <div className="font-mono text-sm text-gray-900 dark:text-gray-100 mb-4 bg-white dark:bg-gray-900/50 rounded-md p-3 border border-gray-200 dark:border-gray-700">
              multiplier = 1.0 + deal_value_factor + seniority_factor + reversibility_factor
            </div>
            <div className="text-xs text-gray-500 dark:text-gray-400">
              Range: 1.0 (no amplification) to 4.0 (maximum amplification).
              When the multiplier exceeds 2.0, demotion severity escalates to EMERGENCY.
            </div>
          </div>

          {/* Factor breakdown */}
          <TooltipProvider>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {/* Deal Value Factor */}
              <div className="rounded-lg border border-gray-200 dark:border-gray-800 p-3 bg-white dark:bg-gray-900/30">
                <div className="flex items-center gap-1.5 mb-2">
                  <DollarSign className="h-3.5 w-3.5 text-gray-400" />
                  <span className="text-xs font-semibold text-gray-700 dark:text-gray-300">
                    Deal Value Factor
                  </span>
                  <Tooltip>
                    <TooltipTrigger>
                      <Info className="h-3 w-3 text-gray-400" />
                    </TooltipTrigger>
                    <TooltipContent side="top" className="max-w-xs text-xs">
                      Based on the deal value tied to the action. Configure thresholds above.
                    </TooltipContent>
                  </Tooltip>
                </div>
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-gray-500 dark:text-gray-400">
                      &lt; {formatCurrency(thresholds.low)}
                    </span>
                    <Badge variant="outline" className="text-xs font-mono">0.0</Badge>
                  </div>
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-gray-500 dark:text-gray-400">
                      {formatCurrency(thresholds.low)} - {formatCurrency(thresholds.high)}
                    </span>
                    <Badge variant="outline" className="text-xs font-mono">0.5</Badge>
                  </div>
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-gray-500 dark:text-gray-400">
                      &gt; {formatCurrency(thresholds.high)}
                    </span>
                    <Badge variant="outline" className="text-xs font-mono">1.0</Badge>
                  </div>
                </div>
              </div>

              {/* Seniority Factor */}
              <div className="rounded-lg border border-gray-200 dark:border-gray-800 p-3 bg-white dark:bg-gray-900/30">
                <div className="flex items-center gap-1.5 mb-2">
                  <Shield className="h-3.5 w-3.5 text-gray-400" />
                  <span className="text-xs font-semibold text-gray-700 dark:text-gray-300">
                    Seniority Factor
                  </span>
                  <Tooltip>
                    <TooltipTrigger>
                      <Info className="h-3 w-3 text-gray-400" />
                    </TooltipTrigger>
                    <TooltipContent side="top" className="max-w-xs text-xs">
                      Based on the contact's title. Higher seniority = higher impact when something goes wrong.
                    </TooltipContent>
                  </Tooltip>
                </div>
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-gray-500 dark:text-gray-400">C-Suite (CEO, CTO, etc.)</span>
                    <Badge variant="outline" className="text-xs font-mono">1.0</Badge>
                  </div>
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-gray-500 dark:text-gray-400">VP / Vice President</span>
                    <Badge variant="outline" className="text-xs font-mono">0.7</Badge>
                  </div>
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-gray-500 dark:text-gray-400">Director</span>
                    <Badge variant="outline" className="text-xs font-mono">0.5</Badge>
                  </div>
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-gray-500 dark:text-gray-400">Manager / Head of</span>
                    <Badge variant="outline" className="text-xs font-mono">0.3</Badge>
                  </div>
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-gray-500 dark:text-gray-400">Other / Unknown</span>
                    <Badge variant="outline" className="text-xs font-mono">0.0</Badge>
                  </div>
                </div>
              </div>

              {/* Reversibility Factor */}
              <div className="rounded-lg border border-gray-200 dark:border-gray-800 p-3 bg-white dark:bg-gray-900/30">
                <div className="flex items-center gap-1.5 mb-2">
                  <ArrowUpDown className="h-3.5 w-3.5 text-gray-400" />
                  <span className="text-xs font-semibold text-gray-700 dark:text-gray-300">
                    Reversibility Factor
                  </span>
                  <Tooltip>
                    <TooltipTrigger>
                      <Info className="h-3 w-3 text-gray-400" />
                    </TooltipTrigger>
                    <TooltipContent side="top" className="max-w-xs text-xs">
                      Based on how hard it is to undo the action. See the table above for per-action ratings.
                    </TooltipContent>
                  </Tooltip>
                </div>
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-gray-500 dark:text-gray-400">Fully reversible</span>
                    <Badge variant="outline" className="text-xs font-mono">0.0</Badge>
                  </div>
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-gray-500 dark:text-gray-400">Mostly reversible</span>
                    <Badge variant="outline" className="text-xs font-mono">0.1 - 0.3</Badge>
                  </div>
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-gray-500 dark:text-gray-400">Partially reversible</span>
                    <Badge variant="outline" className="text-xs font-mono">0.4 - 0.6</Badge>
                  </div>
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-gray-500 dark:text-gray-400">Hard to reverse</span>
                    <Badge variant="outline" className="text-xs font-mono">0.7 - 0.8</Badge>
                  </div>
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-gray-500 dark:text-gray-400">Irreversible</span>
                    <Badge variant="outline" className="text-xs font-mono">0.9 - 1.0</Badge>
                  </div>
                </div>
              </div>
            </div>
          </TooltipProvider>

          {/* Escalation threshold callout */}
          <div className="flex items-start gap-3 p-3 rounded-lg bg-amber-50 dark:bg-amber-900/10 border border-amber-200 dark:border-amber-800/50">
            <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400 mt-0.5 shrink-0" />
            <div>
              <div className="text-xs font-semibold text-amber-800 dark:text-amber-300 mb-0.5">
                Emergency Escalation Threshold
              </div>
              <p className="text-xs text-amber-700 dark:text-amber-400 leading-relaxed">
                When the impact multiplier exceeds 2.0, demotion severity automatically escalates to
                EMERGENCY. This triggers a 60-day cooldown, +25 extra required approval signals, and
                an immediate Slack DM notification to the affected user.
              </p>
            </div>
          </div>

          {/* Example scenarios */}
          <div>
            <div className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-2">
              Example Scenarios
            </div>
            <div className="space-y-2">
              <ExampleScenario
                description={`Low-value deal (< ${formatCurrency(thresholds.low)}), unknown contact, task creation`}
                dealFactor={0.0}
                seniorityFactor={0.0}
                reversibilityFactor={0.0}
              />
              <ExampleScenario
                description={`Mid-value deal (${formatCurrency(thresholds.low)}-${formatCurrency(thresholds.high)}), Director contact, CRM field update`}
                dealFactor={0.5}
                seniorityFactor={0.5}
                reversibilityFactor={0.3}
              />
              <ExampleScenario
                description={`High-value deal (> ${formatCurrency(thresholds.high)}), CEO contact, email send`}
                dealFactor={1.0}
                seniorityFactor={1.0}
                reversibilityFactor={0.8}
                isEscalated
              />
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// =============================================================================
// Example Scenario Sub-Component
// =============================================================================

function ExampleScenario({
  description,
  dealFactor,
  seniorityFactor,
  reversibilityFactor,
  isEscalated,
}: {
  description: string;
  dealFactor: number;
  seniorityFactor: number;
  reversibilityFactor: number;
  isEscalated?: boolean;
}) {
  const multiplier = Math.min(4.0, 1 + dealFactor + seniorityFactor + reversibilityFactor);

  return (
    <div
      className={cn(
        'rounded-lg border p-3 text-xs',
        isEscalated
          ? 'border-red-200 dark:border-red-800/50 bg-red-50/50 dark:bg-red-900/10'
          : 'border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900/30'
      )}
    >
      <div className="flex items-center justify-between mb-1.5">
        <span className="font-medium text-gray-700 dark:text-gray-300">{description}</span>
        <div className="flex items-center gap-1.5">
          <span className="font-mono font-semibold text-gray-900 dark:text-gray-100">
            {multiplier.toFixed(1)}x
          </span>
          {isEscalated && (
            <Badge variant="destructive" className="text-xs px-1.5 py-0">
              EMERGENCY
            </Badge>
          )}
        </div>
      </div>
      <div className="flex items-center gap-3 text-gray-500 dark:text-gray-400">
        <span>1.0</span>
        <span>+</span>
        <span>deal: {dealFactor.toFixed(1)}</span>
        <span>+</span>
        <span>seniority: {seniorityFactor.toFixed(1)}</span>
        <span>+</span>
        <span>reversibility: {reversibilityFactor.toFixed(1)}</span>
        <span>=</span>
        <span className="font-semibold">{multiplier.toFixed(1)}</span>
      </div>
    </div>
  );
}
