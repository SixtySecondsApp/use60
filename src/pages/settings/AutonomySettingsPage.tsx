/**
 * AutonomySettingsPage
 *
 * Org admin page for configuring AI autonomy policies:
 * - Preset selector (Conservative / Balanced / Autonomous / Custom)
 * - Per-action-type policy toggle grid
 * - User-level override permissions section
 */

import { useState, useEffect } from 'react';
import SettingsPageWrapper from '@/components/SettingsPageWrapper';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Loader2,
  ShieldCheck,
  Zap,
  CheckCircle,
  Lightbulb,
  Save,
  AlertCircle,
  Users,
} from 'lucide-react';
import { useOrg } from '@/lib/contexts/OrgContext';
import { useUserPermissions } from '@/contexts/UserPermissionsContext';
import { useActiveOrgId } from '@/lib/stores/orgStore';
import { supabase } from '@/lib/supabase/clientV2';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { ActionPolicyGrid, type PolicyValue, type ActionType } from '@/components/agent/ActionPolicyGrid';
import { UserOverridePermissions } from '@/components/agent/UserOverridePermissions';
import { ManagerAutonomyControls } from '@/components/settings/ManagerAutonomyControls';
import { AutonomyProgressionDashboard } from '@/components/settings/AutonomyProgressionDashboard';

// ============================================================================
// Types
// ============================================================================

type PresetName = 'conservative' | 'balanced' | 'autonomous' | 'custom';

interface PresetDefinition {
  key: PresetName;
  label: string;
  description: string;
  icon: React.ElementType;
  policies: Record<string, PolicyValue>;
}

// ============================================================================
// Preset definitions (mirrors migration seed)
// ============================================================================

const PRESETS: PresetDefinition[] = [
  {
    key: 'conservative',
    label: 'Conservative',
    description: 'Require human approval for all AI-initiated actions. Maximum oversight.',
    icon: ShieldCheck,
    policies: {
      crm_stage_change: 'approve',
      crm_field_update: 'approve',
      crm_contact_create: 'approve',
      send_email: 'approve',
      send_slack: 'approve',
      create_task: 'approve',
      enrich_contact: 'suggest',
      draft_proposal: 'suggest',
    },
  },
  {
    key: 'balanced',
    label: 'Balanced',
    description: 'Auto-approve low-risk actions. Require approval for high-risk actions.',
    icon: CheckCircle,
    policies: {
      crm_stage_change: 'approve',
      crm_field_update: 'suggest',
      crm_contact_create: 'suggest',
      send_email: 'approve',
      send_slack: 'auto',
      create_task: 'auto',
      enrich_contact: 'auto',
      draft_proposal: 'suggest',
    },
  },
  {
    key: 'autonomous',
    label: 'Autonomous',
    description: 'Maximize automation. Only destructive actions require review.',
    icon: Zap,
    policies: {
      crm_stage_change: 'auto',
      crm_field_update: 'auto',
      crm_contact_create: 'auto',
      send_email: 'approve',
      send_slack: 'auto',
      create_task: 'auto',
      enrich_contact: 'auto',
      draft_proposal: 'approve',
    },
  },
  {
    key: 'custom',
    label: 'Custom',
    description: 'Manually configure each action type individually.',
    icon: Lightbulb,
    policies: {},
  },
];

// ============================================================================
// Action type catalog (mirrors migration seed)
// ============================================================================

const ACTION_TYPES: ActionType[] = [
  {
    key: 'crm_stage_change',
    label: 'CRM Stage Change',
    description: 'Move deals between pipeline stages',
    risk_level: 'high',
  },
  {
    key: 'crm_field_update',
    label: 'CRM Field Update',
    description: 'Update contact, deal, or company fields',
    risk_level: 'medium',
  },
  {
    key: 'crm_contact_create',
    label: 'Create CRM Contact',
    description: 'Create new contacts or companies in CRM',
    risk_level: 'medium',
  },
  {
    key: 'send_email',
    label: 'Send Email',
    description: 'Send emails on behalf of the rep',
    risk_level: 'high',
  },
  {
    key: 'send_slack',
    label: 'Send Slack Message',
    description: 'Send notifications and messages via Slack',
    risk_level: 'low',
  },
  {
    key: 'create_task',
    label: 'Create Task',
    description: 'Create follow-up tasks and reminders',
    risk_level: 'low',
  },
  {
    key: 'enrich_contact',
    label: 'Enrich Contact',
    description: 'Look up and fill in contact details from external sources',
    risk_level: 'low',
  },
  {
    key: 'draft_proposal',
    label: 'Draft Proposal',
    description: 'Generate sales proposal or quote documents',
    risk_level: 'medium',
  },
];

// ============================================================================
// Component
// ============================================================================

export default function AutonomySettingsPage() {
  const orgId = useActiveOrgId();
  const { permissions } = useOrg();
  const { isPlatformAdmin } = useUserPermissions();
  const isAdmin = permissions.canManageSettings || permissions.canManageTeam || isPlatformAdmin;

  const [selectedPreset, setSelectedPreset] = useState<PresetName>('balanced');
  const [policies, setPolicies] = useState<Record<string, PolicyValue>>({
    ...PRESETS.find((p) => p.key === 'balanced')!.policies,
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Load existing org-level policies from DB
  useEffect(() => {
    if (!orgId) return;

    const load = async () => {
      setLoading(true);
      try {
        const { data, error } = await supabase
          .from('autonomy_policies')
          .select('action_type, policy, preset_name')
          .eq('org_id', orgId)
          .is('user_id', null);

        if (error) throw error;

        if (data && data.length > 0) {
          const loaded: Record<string, PolicyValue> = {};
          for (const row of data) {
            loaded[row.action_type] = row.policy as PolicyValue;
          }
          setPolicies(loaded);

          // Detect which preset is active (or custom)
          const presetRow = data.find((r) => r.preset_name);
          if (presetRow?.preset_name) {
            setSelectedPreset(presetRow.preset_name as PresetName);
          } else {
            setSelectedPreset('custom');
          }
        }
      } catch (err) {
        console.error('[AutonomySettingsPage] load error:', err);
      } finally {
        setLoading(false);
      }
    };

    load();
  }, [orgId]);

  const handlePresetSelect = (preset: PresetDefinition) => {
    if (preset.key === 'custom') {
      setSelectedPreset('custom');
      return;
    }
    setSelectedPreset(preset.key);
    setPolicies({ ...preset.policies });
  };

  const handlePolicyChange = (actionKey: string, policy: PolicyValue) => {
    setPolicies((prev) => ({ ...prev, [actionKey]: policy }));
    // Any individual toggle => custom
    setSelectedPreset('custom');
  };

  const handleSave = async () => {
    if (!orgId || !isAdmin) return;
    setSaving(true);
    try {
      // Upsert one row per action type
      const rows = ACTION_TYPES.map((at) => ({
        org_id: orgId,
        user_id: null,
        action_type: at.key,
        policy: policies[at.key] ?? 'approve',
        preset_name: selectedPreset !== 'custom' ? selectedPreset : null,
      }));

      const { error } = await supabase
        .from('autonomy_policies')
        .upsert(rows, { onConflict: 'org_id,user_id,action_type', ignoreDuplicates: false });

      if (error) throw error;
      toast.success('Autonomy policies saved');
    } catch (err) {
      console.error('[AutonomySettingsPage] save error:', err);
      toast.error('Failed to save policies');
    } finally {
      setSaving(false);
    }
  };

  if (!isAdmin) {
    return (
      <SettingsPageWrapper
        title="Autonomy & Approvals"
        description="Configure how the AI agent executes actions on your team's behalf."
      >
        <div className="flex items-center gap-3 p-4 rounded-lg bg-yellow-50 dark:bg-yellow-900/20 text-yellow-800 dark:text-yellow-300">
          <AlertCircle className="h-5 w-5 flex-shrink-0" />
          <p className="text-sm">You need org admin permissions to manage autonomy settings.</p>
        </div>
      </SettingsPageWrapper>
    );
  }

  return (
    <SettingsPageWrapper
      title="Autonomy & Approvals"
      description="Control how the AI agent executes actions. Choose a preset or configure each action type individually."
    >
      <div className="space-y-8">
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
          </div>
        ) : (
          <>
            {/* Preset Selector */}
            <section>
              <div className="mb-4">
                <h2 className="text-base font-semibold text-gray-900 dark:text-white">Autonomy Preset</h2>
                <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                  Select a preset to configure all actions at once, or switch to Custom to adjust individually.
                </p>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {PRESETS.map((preset) => {
                  const Icon = preset.icon;
                  const isSelected = selectedPreset === preset.key;
                  return (
                    <button
                      key={preset.key}
                      onClick={() => handlePresetSelect(preset)}
                      className={cn(
                        'flex flex-col items-start gap-2 p-4 rounded-xl border-2 text-left transition-all',
                        isSelected
                          ? 'border-blue-600 bg-blue-50 dark:border-blue-400 dark:bg-blue-900/20'
                          : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900/20 hover:border-gray-300 dark:hover:border-gray-600'
                      )}
                    >
                      <div className={cn(
                        'h-8 w-8 rounded-lg flex items-center justify-center',
                        isSelected
                          ? 'bg-blue-600 dark:bg-blue-500 text-white'
                          : 'bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400'
                      )}>
                        <Icon className="h-4 w-4" />
                      </div>
                      <div>
                        <div className="flex items-center gap-1.5">
                          <span className="text-sm font-semibold text-gray-900 dark:text-white">
                            {preset.label}
                          </span>
                          {isSelected && (
                            <Badge className="text-xs px-1.5 py-0 h-4 bg-blue-600 text-white dark:bg-blue-500">
                              Active
                            </Badge>
                          )}
                        </div>
                        <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 leading-snug">
                          {preset.description}
                        </p>
                      </div>
                    </button>
                  );
                })}
              </div>
            </section>

            {/* Action Toggle Grid */}
            <section>
              <div className="mb-4">
                <h2 className="text-base font-semibold text-gray-900 dark:text-white">Action Policies</h2>
                <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                  Configure the policy for each action type. Changes switch the preset to Custom.
                </p>
              </div>
              <div className="bg-gray-50/50 dark:bg-gray-800/20 rounded-xl p-4 border border-gray-100 dark:border-gray-800">
                <ActionPolicyGrid
                  actionTypes={ACTION_TYPES}
                  policies={policies}
                  onChange={handlePolicyChange}
                />
              </div>
            </section>

            {/* User Override Permissions */}
            <section>
              <div className="mb-4 flex items-center gap-2">
                <Users className="h-4 w-4 text-gray-500" />
                <h2 className="text-base font-semibold text-gray-900 dark:text-white">User Override Permissions</h2>
              </div>
              <UserOverridePermissions orgId={orgId!} />
            </section>

            {/* Graduated Autonomy Progression */}
            <section>
              <div className="mb-4">
                <h2 className="text-base font-semibold text-gray-900 dark:text-white">Autonomy Progression</h2>
                <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                  Track approval patterns and manage graduated autonomy promotions.
                </p>
              </div>
              <AutonomyProgressionDashboard />
            </section>

            {/* Manager Controls */}
            <section>
              <div className="mb-4">
                <h2 className="text-base font-semibold text-gray-900 dark:text-white">Manager Controls</h2>
                <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                  Set autonomy ceilings, control auto-promotion eligibility, and view team analytics.
                </p>
              </div>
              <ManagerAutonomyControls />
            </section>

            {/* Save Button */}
            <div className="flex justify-end pt-2 border-t border-gray-100 dark:border-gray-800">
              <Button onClick={handleSave} disabled={saving || !isAdmin}>
                {saving ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Saving...
                  </>
                ) : (
                  <>
                    <Save className="h-4 w-4 mr-2" />
                    Save Policies
                  </>
                )}
              </Button>
            </div>
          </>
        )}
      </div>
    </SettingsPageWrapper>
  );
}
