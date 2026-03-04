/**
 * CRMFieldRulesEditor — CRM-CFG-001 + CRM-CFG-002
 *
 * Per-field auto-update rules:
 *   - Mode: auto / approve / never
 *   - Confidence threshold slider (0-100)
 *
 * Reads/writes to crm_field_rules table via useCRMFieldRules + useSaveCRMFieldRules.
 */

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Slider } from '@/components/ui/slider';
import { Loader2, Save, Zap, ChevronDown, ChevronRight } from 'lucide-react';
import { useOrg } from '@/lib/contexts/OrgContext';
import { useUserPermissions } from '@/contexts/UserPermissionsContext';
import {
  useCRMFieldRules,
  useSaveCRMFieldRules,
  type CRMFieldRule,
  type CRMFieldMode,
} from '@/lib/hooks/useCRMFieldMapping';
import { useActiveOrgId } from '@/lib/stores/orgStore';
import { cn } from '@/lib/utils';

// ============================================================
// Field definitions per object (drives rows in the table)
// ============================================================

type CRMObject = 'contact' | 'deal' | 'company' | 'activity';

interface FieldDef {
  field_name: string;
  label: string;
  description?: string;
}

const FIELD_DEFS: Record<CRMObject, FieldDef[]> = {
  deal: [
    { field_name: 'notes', label: 'Notes', description: 'Meeting notes appended to deal' },
    { field_name: 'next_steps', label: 'Next Steps', description: 'Extracted action items' },
    { field_name: 'activity_log', label: 'Activity Log', description: 'Meeting summary log entry' },
    { field_name: 'stakeholders', label: 'Stakeholders', description: 'New contacts mentioned' },
    { field_name: 'blockers', label: 'Blockers', description: 'Risk or blocker notes' },
    { field_name: 'stage', label: 'Stage', description: 'Deal stage change' },
    { field_name: 'close_date', label: 'Close Date', description: 'Expected close date update' },
    { field_name: 'deal_value', label: 'Deal Value', description: 'Revenue amount update' },
    { field_name: 'description', label: 'Description', description: 'Deal description' },
    { field_name: 'summary', label: 'Summary', description: 'AI-generated deal summary' },
  ],
  contact: [
    { field_name: 'job_title', label: 'Job Title' },
    { field_name: 'phone', label: 'Phone' },
    { field_name: 'mobile_phone', label: 'Mobile Phone' },
    { field_name: 'company_name', label: 'Company' },
    { field_name: 'linkedin_url', label: 'LinkedIn URL' },
    { field_name: 'city', label: 'City' },
    { field_name: 'country', label: 'Country' },
  ],
  company: [
    { field_name: 'industry', label: 'Industry' },
    { field_name: 'employee_count', label: 'Employees' },
    { field_name: 'website', label: 'Website' },
    { field_name: 'city', label: 'City' },
    { field_name: 'country', label: 'Country' },
  ],
  activity: [
    { field_name: 'subject', label: 'Subject' },
    { field_name: 'body', label: 'Body' },
    { field_name: 'activity_type', label: 'Type' },
  ],
};

// ============================================================
// Defaults
// ============================================================

const DEFAULT_MODES: Record<string, CRMFieldMode> = {
  notes: 'auto',
  next_steps: 'auto',
  activity_log: 'auto',
  stakeholders: 'auto',
  blockers: 'auto',
  stage: 'approve',
  close_date: 'approve',
  deal_value: 'approve',
};

const MODE_CONFIG: Array<{ value: CRMFieldMode; label: string; color: string; bg: string }> = [
  {
    value: 'auto',
    label: 'Auto',
    color: 'text-emerald-700 dark:text-emerald-400',
    bg: 'bg-emerald-100 dark:bg-emerald-900/30',
  },
  {
    value: 'approve',
    label: 'Approve',
    color: 'text-blue-700 dark:text-blue-400',
    bg: 'bg-blue-100 dark:bg-blue-900/30',
  },
  {
    value: 'never',
    label: 'Never',
    color: 'text-gray-600 dark:text-gray-400',
    bg: 'bg-gray-100 dark:bg-gray-800/50',
  },
];

// ============================================================
// Row state
// ============================================================

interface RuleRow {
  crm_field: string;
  mode: CRMFieldMode;
  confidence_threshold: number;
}

// ============================================================
// Component
// ============================================================

interface CRMFieldRulesEditorProps {
  crm_object: CRMObject;
}

export function CRMFieldRulesEditor({ crm_object }: CRMFieldRulesEditorProps) {
  const orgId = useActiveOrgId();
  const { permissions } = useOrg();
  const { isPlatformAdmin } = useUserPermissions();
  const isAdmin = permissions.canManageSettings || permissions.canManageTeam || isPlatformAdmin;

  const [expanded, setExpanded] = useState(true);
  const [rows, setRows] = useState<RuleRow[]>([]);

  const { data: savedRules } = useCRMFieldRules(crm_object);
  const { mutateAsync: saveRules, isPending: saving } = useSaveCRMFieldRules();

  const fieldDefs = FIELD_DEFS[crm_object] ?? [];

  // Load saved rules or defaults
  useEffect(() => {
    const ruleMap = new Map<string, CRMFieldRule>();
    for (const r of savedRules ?? []) {
      ruleMap.set(r.crm_field, r);
    }

    setRows(
      fieldDefs.map((f) => {
        const saved = ruleMap.get(f.field_name);
        return {
          crm_field: f.field_name,
          mode: saved?.mode ?? DEFAULT_MODES[f.field_name] ?? 'approve',
          confidence_threshold: saved?.confidence_threshold ?? 75,
        };
      })
    );
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [savedRules, crm_object]);

  function updateRow(index: number, patch: Partial<RuleRow>) {
    setRows((prev) => prev.map((r, i) => (i === index ? { ...r, ...patch } : r)));
  }

  async function handleSave() {
    if (!orgId) return;
    const rules: CRMFieldRule[] = rows.map((r) => ({
      org_id: orgId,
      crm_field: r.crm_field,
      crm_object,
      mode: r.mode,
      confidence_threshold: r.confidence_threshold,
    }));
    await saveRules(rules);
  }

  function setAllModes(mode: CRMFieldMode) {
    setRows((prev) => prev.map((r) => ({ ...r, mode })));
  }

  const objectLabel = crm_object.charAt(0).toUpperCase() + crm_object.slice(1);

  return (
    <Card className="bg-white/80 dark:bg-gray-900/40 backdrop-blur-xl rounded-2xl border border-gray-200/60 dark:border-gray-700/40">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <button
            className="flex items-center gap-2 text-left"
            onClick={() => setExpanded((v) => !v)}
          >
            <Zap className="w-4 h-4 text-amber-500" />
            <div>
              <CardTitle className="text-base">{objectLabel} Auto-Update Rules</CardTitle>
              <CardDescription className="text-xs mt-0.5">
                Per-field mode and confidence threshold for AI-driven CRM updates
              </CardDescription>
            </div>
            {expanded ? (
              <ChevronDown className="w-4 h-4 text-gray-400 ml-2" />
            ) : (
              <ChevronRight className="w-4 h-4 text-gray-400 ml-2" />
            )}
          </button>

          {isAdmin && expanded && (
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="sm"
                className="text-xs h-7 px-2"
                onClick={() => setAllModes('auto')}
              >
                All Auto
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="text-xs h-7 px-2"
                onClick={() => setAllModes('approve')}
              >
                All Approve
              </Button>
              <Button
                size="sm"
                className="h-7 px-3"
                onClick={handleSave}
                disabled={saving}
              >
                {saving ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Save className="w-3.5 h-3.5" />
                )}
                <span className="ml-1">{saving ? 'Saving...' : 'Save'}</span>
              </Button>
            </div>
          )}
        </div>
      </CardHeader>

      {expanded && (
        <CardContent>
          {/* Legend */}
          <div className="flex flex-wrap items-center gap-4 mb-4 text-xs text-gray-500 dark:text-gray-400">
            <span className="font-medium text-gray-600 dark:text-gray-300">Mode:</span>
            <span className="text-emerald-700 dark:text-emerald-400">
              Auto — write immediately above threshold
            </span>
            <span className="text-blue-700 dark:text-blue-400">
              Approve — require human confirmation
            </span>
            <span className="text-gray-600 dark:text-gray-400">
              Never — always skip this field
            </span>
          </div>

          <div className="space-y-2">
            {rows.map((row, i) => {
              const def = fieldDefs.find((f) => f.field_name === row.crm_field);
              return (
                <div
                  key={row.crm_field}
                  className="grid grid-cols-[1fr_auto_200px] gap-4 items-center py-3 px-4 rounded-xl bg-gray-50 dark:bg-gray-900/20 hover:bg-gray-100/60 dark:hover:bg-gray-900/30 transition-colors"
                >
                  {/* Field label */}
                  <div>
                    <div className="text-sm font-medium text-gray-800 dark:text-gray-200">
                      {def?.label ?? row.crm_field}
                    </div>
                    {def?.description && (
                      <div className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">
                        {def.description}
                      </div>
                    )}
                  </div>

                  {/* Mode selector (pill buttons) */}
                  <div className="flex items-center gap-1">
                    {MODE_CONFIG.map((m) => (
                      <button
                        key={m.value}
                        onClick={() => isAdmin && updateRow(i, { mode: m.value })}
                        disabled={!isAdmin}
                        className={cn(
                          'px-3 py-1 rounded-full text-xs font-medium transition-all',
                          row.mode === m.value
                            ? `${m.bg} ${m.color} ring-1 ring-inset ring-current/20`
                            : 'text-gray-400 dark:text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800'
                        )}
                      >
                        {m.label}
                      </button>
                    ))}
                  </div>

                  {/* Confidence threshold slider (hidden when mode=never) */}
                  <div className="flex items-center gap-3">
                    {row.mode !== 'never' ? (
                      <>
                        <Slider
                          min={0}
                          max={100}
                          step={5}
                          value={[row.confidence_threshold]}
                          onValueChange={([v]) =>
                            isAdmin && updateRow(i, { confidence_threshold: v })
                          }
                          disabled={!isAdmin}
                          className="flex-1"
                        />
                        <Badge
                          className={cn(
                            'text-xs border-0 w-10 justify-center shrink-0',
                            row.confidence_threshold >= 80
                              ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400'
                              : row.confidence_threshold >= 50
                              ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400'
                              : 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
                          )}
                        >
                          {row.confidence_threshold}%
                        </Badge>
                      </>
                    ) : (
                      <span className="text-xs text-gray-400 dark:text-gray-500 italic">
                        Threshold N/A
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      )}
    </Card>
  );
}
