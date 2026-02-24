/**
 * WritePolicyEditor
 *
 * Shows a grid of CRM fields with radio buttons for write policy per field:
 * Auto | Approval | Suggest | Disabled
 *
 * Includes bulk actions and grouped by CRM object section.
 */

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Loader2, Save, Shield, ChevronDown, ChevronRight } from 'lucide-react';
import { useOrg } from '@/lib/contexts/OrgContext';
import { useUserPermissions } from '@/contexts/UserPermissionsContext';
import {
  useCRMWritePolicies,
  useSaveCRMWritePolicies,
  type CRMWritePolicy,
} from '@/lib/hooks/useCRMFieldMapping';
import { useActiveOrgId } from '@/lib/stores/orgStore';
import { cn } from '@/lib/utils';

// ============================================================
// Default field definitions per object
// ============================================================

type WritePolicy = 'auto' | 'approval' | 'suggest' | 'disabled';
type CRMObject = 'contact' | 'deal' | 'company' | 'activity';

interface FieldDef {
  field_name: string;
  label: string;
}

const FIELD_DEFS: Record<CRMObject, FieldDef[]> = {
  contact: [
    { field_name: 'email', label: 'Email' },
    { field_name: 'first_name', label: 'First Name' },
    { field_name: 'last_name', label: 'Last Name' },
    { field_name: 'phone', label: 'Phone' },
    { field_name: 'mobile_phone', label: 'Mobile Phone' },
    { field_name: 'company_name', label: 'Company' },
    { field_name: 'job_title', label: 'Job Title' },
    { field_name: 'linkedin_url', label: 'LinkedIn URL' },
    { field_name: 'city', label: 'City' },
    { field_name: 'country', label: 'Country' },
  ],
  deal: [
    { field_name: 'name', label: 'Deal Name' },
    { field_name: 'value', label: 'Deal Value' },
    { field_name: 'stage', label: 'Stage' },
    { field_name: 'expected_close_date', label: 'Close Date' },
    { field_name: 'next_steps', label: 'Next Steps' },
    { field_name: 'notes', label: 'Notes' },
    { field_name: 'description', label: 'Description' },
    { field_name: 'pipeline', label: 'Pipeline' },
  ],
  company: [
    { field_name: 'name', label: 'Company Name' },
    { field_name: 'website', label: 'Website' },
    { field_name: 'industry', label: 'Industry' },
    { field_name: 'employee_count', label: 'Employees' },
    { field_name: 'city', label: 'City' },
    { field_name: 'country', label: 'Country' },
  ],
  activity: [
    { field_name: 'subject', label: 'Subject' },
    { field_name: 'body', label: 'Body' },
    { field_name: 'activity_date', label: 'Activity Date' },
    { field_name: 'activity_type', label: 'Type' },
  ],
};

const POLICY_OPTIONS: Array<{ value: WritePolicy; label: string; color: string }> = [
  { value: 'auto', label: 'Auto', color: 'text-emerald-600 dark:text-emerald-400' },
  { value: 'approval', label: 'Approval', color: 'text-blue-600 dark:text-blue-400' },
  { value: 'suggest', label: 'Suggest', color: 'text-amber-600 dark:text-amber-400' },
  { value: 'disabled', label: 'Disabled', color: 'text-red-500 dark:text-red-400' },
];

// ============================================================
// Component
// ============================================================

interface WritePolicyEditorProps {
  crm_object: CRMObject;
}

export function WritePolicyEditor({ crm_object }: WritePolicyEditorProps) {
  const orgId = useActiveOrgId();
  const { permissions } = useOrg();
  const { isPlatformAdmin } = useUserPermissions();
  const isAdmin = permissions.canManageSettings || permissions.canManageTeam || isPlatformAdmin;

  const [expanded, setExpanded] = useState(true);
  const [policies, setPolicies] = useState<Record<string, WritePolicy>>({});

  const { data: savedPolicies } = useCRMWritePolicies(crm_object);
  const { mutateAsync: savePolicies, isPending: saving } = useSaveCRMWritePolicies();

  const fieldDefs = FIELD_DEFS[crm_object] ?? [];

  // Load from DB
  useEffect(() => {
    if (savedPolicies && savedPolicies.length > 0) {
      const map: Record<string, WritePolicy> = {};
      for (const p of savedPolicies) {
        map[p.field_name] = p.policy;
      }
      setPolicies(map);
    } else {
      // Default all to 'auto'
      const defaults: Record<string, WritePolicy> = {};
      for (const f of fieldDefs) {
        defaults[f.field_name] = 'auto';
      }
      setPolicies(defaults);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [savedPolicies, crm_object]);

  function setFieldPolicy(fieldName: string, policy: WritePolicy) {
    setPolicies((prev) => ({ ...prev, [fieldName]: policy }));
  }

  function setAllPolicies(policy: WritePolicy) {
    const all: Record<string, WritePolicy> = {};
    for (const f of fieldDefs) {
      all[f.field_name] = policy;
    }
    setPolicies(all);
  }

  async function handleSave() {
    if (!orgId) return;
    const rows: CRMWritePolicy[] = fieldDefs.map((f) => ({
      org_id: orgId,
      crm_object: crm_object,
      field_name: f.field_name,
      policy: policies[f.field_name] ?? 'auto',
    }));
    await savePolicies(rows);
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
            <Shield className="w-4 h-4 text-blue-500" />
            <div>
              <CardTitle className="text-base">{objectLabel} Write Policies</CardTitle>
              <CardDescription className="text-xs mt-0.5">
                Control how sixty writes each {objectLabel.toLowerCase()} field back to HubSpot
              </CardDescription>
            </div>
            {expanded ? (
              <ChevronDown className="w-4 h-4 text-gray-400 ml-2" />
            ) : (
              <ChevronRight className="w-4 h-4 text-gray-400 ml-2" />
            )}
          </button>
          <div className="flex items-center gap-2">
            {/* Bulk actions */}
            {isAdmin && expanded && (
              <>
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-xs h-7 px-2"
                  onClick={() => setAllPolicies('auto')}
                >
                  All Auto
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-xs h-7 px-2"
                  onClick={() => setAllPolicies('approval')}
                >
                  All Approval
                </Button>
                <Button
                  size="sm"
                  className="h-7 px-3"
                  onClick={handleSave}
                  disabled={saving || !isAdmin}
                >
                  {saving ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Save className="w-3.5 h-3.5" />
                  )}
                  <span className="ml-1">{saving ? 'Saving...' : 'Save'}</span>
                </Button>
              </>
            )}
          </div>
        </div>
      </CardHeader>

      {expanded && (
        <CardContent>
          {/* Legend */}
          <div className="flex items-center gap-4 mb-4 text-xs text-gray-500 dark:text-gray-400">
            <span className="font-medium text-gray-600 dark:text-gray-300">Policy legend:</span>
            <span className="text-emerald-600 dark:text-emerald-400">Auto — write immediately</span>
            <span className="text-blue-600 dark:text-blue-400">Approval — require confirmation</span>
            <span className="text-amber-600 dark:text-amber-400">Suggest — show suggestion only</span>
            <span className="text-red-500 dark:text-red-400">Disabled — never write</span>
          </div>

          {/* Policy grid */}
          <div className="overflow-x-auto rounded-xl border border-gray-200 dark:border-gray-800">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 dark:bg-gray-900/50 text-left">
                  <th className="px-4 py-3 font-medium text-gray-600 dark:text-gray-400 w-[200px]">
                    Field
                  </th>
                  {POLICY_OPTIONS.map((opt) => (
                    <th
                      key={opt.value}
                      className={cn(
                        'px-4 py-3 font-medium text-center w-[110px]',
                        opt.color
                      )}
                    >
                      {opt.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                {fieldDefs.map((field) => {
                  const currentPolicy = policies[field.field_name] ?? 'auto';
                  return (
                    <tr
                      key={field.field_name}
                      className="bg-white dark:bg-gray-900/0 hover:bg-gray-50/50 dark:hover:bg-gray-900/20 transition-colors"
                    >
                      <td className="px-4 py-3">
                        <div className="text-sm font-medium text-gray-800 dark:text-gray-200">
                          {field.label}
                        </div>
                        <div className="text-xs font-mono text-gray-400 dark:text-gray-500 mt-0.5">
                          {field.field_name}
                        </div>
                      </td>
                      {POLICY_OPTIONS.map((opt) => (
                        <td key={opt.value} className="px-4 py-3 text-center">
                          <div className="flex justify-center">
                            <input
                              type="radio"
                              name={`policy-${field.field_name}`}
                              value={opt.value}
                              checked={currentPolicy === opt.value}
                              onChange={() =>
                                isAdmin && setFieldPolicy(field.field_name, opt.value)
                              }
                              disabled={!isAdmin}
                              className="cursor-pointer accent-emerald-500 w-4 h-4"
                              aria-label={`${field.label} ${opt.label}`}
                            />
                          </div>
                        </td>
                      ))}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </CardContent>
      )}
    </Card>
  );
}
