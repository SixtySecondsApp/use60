/**
 * AutonomySettingsPage
 *
 * Org admin page for configuring AI autonomy policies:
 * - Two-step role-based preset selector (Role + Style) — AE2-011
 * - Per-action-type policy toggle grid
 * - User-level override permissions section
 * - Safety rules: impact weight config & demotion explanation (AE2-015)
 *
 * Preset name stored as "role:<role>/<style>" (e.g. "role:sdr/balanced")
 * or legacy style names for backward compatibility.
 */

import { useState, useEffect, useCallback } from 'react';
import SettingsPageWrapper from '@/components/SettingsPageWrapper';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Loader2,
  Save,
  Users,
  Shield,
  History,
} from 'lucide-react';
import { useOrg } from '@/lib/contexts/OrgContext';
import { useUserPermissions } from '@/contexts/UserPermissionsContext';
import { useActiveOrgId } from '@/lib/stores/orgStore';
import { supabase } from '@/lib/supabase/clientV2';
import { toast } from 'sonner';
import { ActionPolicyGrid, type PolicyValue, type ActionType } from '@/components/agent/ActionPolicyGrid';
import { RolePresetSelector, type RoleName, type StyleName } from '@/components/agent/RolePresetSelector';
import { UserOverridePermissions } from '@/components/agent/UserOverridePermissions';
import { ManagerAutonomyControls } from '@/components/settings/ManagerAutonomyControls';
import { AutonomyProgressionDashboard } from '@/components/settings/AutonomyProgressionDashboard';
import AutopilotDashboard from '@/components/platform/autopilot/AutopilotDashboard';
import TeamAutopilotView from '@/components/platform/autopilot/TeamAutopilotView';
import { SafetyRulesConfig } from '@/components/agent/SafetyRulesConfig';
import { AutonomyTimeline } from '@/components/agent/AutonomyTimeline';
import { ShadowExecutionInsight } from '@/components/agent/ShadowExecutionInsight';

// ============================================================================
// Types & helpers
// ============================================================================

/** Stored preset_name: "role:<role>/<style>" | legacy style name | null */
type PresetNameStored = string | null;

const VALID_ROLES: RoleName[] = ['sdr', 'ae', 'vp_sales', 'cs'];
const VALID_STYLES: StyleName[] = ['conservative', 'balanced', 'autonomous'];

/** Parse a stored preset_name into role + style. Returns nulls if legacy or custom. */
function parsePresetName(preset: string | null): { role: RoleName | null; style: StyleName | null } {
  if (!preset) return { role: null, style: null };

  // New format: "role:sdr/balanced"
  const match = preset.match(/^role:(\w+)\/(\w+)$/);
  if (match) {
    const role = match[1] as RoleName;
    const style = match[2] as StyleName;
    if (VALID_ROLES.includes(role) && VALID_STYLES.includes(style)) {
      return { role, style };
    }
  }

  // Legacy format: bare style name like "conservative" / "balanced" / "autonomous"
  if (VALID_STYLES.includes(preset as StyleName)) {
    return { role: null, style: preset as StyleName };
  }

  return { role: null, style: null };
}

/** Serialize role + style into the stored preset_name format. */
function serializePresetName(role: RoleName | null, style: StyleName | null): PresetNameStored {
  if (role && style) return `role:${role}/${style}`;
  if (style) return style; // legacy style-only
  return null; // custom
}

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
// Default policies (balanced style) used before DB load
// ============================================================================

const DEFAULT_POLICIES: Record<string, PolicyValue> = {
  crm_stage_change: 'approve',
  crm_field_update: 'suggest',
  crm_contact_create: 'suggest',
  send_email: 'approve',
  send_slack: 'auto',
  create_task: 'auto',
  enrich_contact: 'auto',
  draft_proposal: 'suggest',
};

// ============================================================================
// Component
// ============================================================================

export default function AutonomySettingsPage() {
  const orgId = useActiveOrgId();
  const { permissions } = useOrg();
  const { isPlatformAdmin } = useUserPermissions();
  const isAdmin = permissions.canManageSettings || permissions.canManageTeam || isPlatformAdmin;

  // Role + style state (parsed from stored preset_name)
  const [activeRole, setActiveRole] = useState<RoleName | null>(null);
  const [activeStyle, setActiveStyle] = useState<StyleName | null>(null);
  const [isCustom, setIsCustom] = useState(false);

  const [policies, setPolicies] = useState<Record<string, PolicyValue>>({ ...DEFAULT_POLICIES });
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

          // Parse preset_name from any row that has one
          const presetRow = data.find((r) => r.preset_name);
          const { role, style } = parsePresetName(presetRow?.preset_name ?? null);
          setActiveRole(role);
          setActiveStyle(style);
          setIsCustom(!presetRow?.preset_name);
        }
      } catch (err) {
        console.error('[AutonomySettingsPage] load error:', err);
      } finally {
        setLoading(false);
      }
    };

    load();
  }, [orgId]);

  // Handle role+style selection from the RolePresetSelector
  const handleRoleSelect = useCallback(
    (role: RoleName, style: StyleName, newPolicies: Record<string, PolicyValue>) => {
      setActiveRole(role);
      setActiveStyle(style);
      setIsCustom(false);
      setPolicies(newPolicies);
    },
    []
  );

  // Handle individual policy toggle in the grid
  const handlePolicyChange = useCallback((actionKey: string, policy: PolicyValue) => {
    setPolicies((prev) => ({ ...prev, [actionKey]: policy }));
    // Any individual toggle switches to custom mode
    setIsCustom(true);
  }, []);

  // Save to DB
  const handleSave = useCallback(async () => {
    if (!orgId || !isAdmin) return;
    setSaving(true);
    try {
      const presetName = isCustom ? null : serializePresetName(activeRole, activeStyle);

      const rows = ACTION_TYPES.map((at) => ({
        org_id: orgId,
        user_id: null,
        action_type: at.key,
        policy: policies[at.key] ?? 'approve',
        preset_name: presetName,
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
  }, [orgId, isAdmin, isCustom, activeRole, activeStyle, policies]);

  // ---- Non-admin view: personal autonomy only ----
  if (!isAdmin) {
    return (
      <SettingsPageWrapper
        title="Autonomy & Approvals"
        description="Your personal autonomy profile — track which actions the AI agent handles automatically for you."
      >
        <div className="space-y-8">
          <AutopilotDashboard />

          {/* Non-admin role selection (read-only summary) */}
          <section>
            <div className="mb-4">
              <h2 className="text-base font-semibold text-gray-900 dark:text-white">Your Role Preset</h2>
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                Your organization's active role preset determines the baseline autonomy policies.
              </p>
            </div>
            <RolePresetSelector
              activeRole={activeRole}
              activeStyle={activeStyle}
              onSelect={() => {}}
              isAdmin={false}
            />
          </section>
        </div>
      </SettingsPageWrapper>
    );
  }

  // ---- Admin view ----
  return (
    <SettingsPageWrapper
      title="Autonomy & Approvals"
      description="Control how the AI agent executes actions. Choose a role preset or configure each action type individually."
    >
      <div className="space-y-8">
        {/* Per-rep autonomy dashboard — always visible for the current user */}
        <section>
          <div className="mb-4">
            <h2 className="text-base font-semibold text-gray-900 dark:text-white">My Autonomy Profile</h2>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
              Your personal autonomy level — how much the AI agent acts on your behalf without review.
            </p>
          </div>
          <AutopilotDashboard />
        </section>

        {/* Shadow execution promotion nudge — AE2-013 */}
        <ShadowExecutionInsight mode="banner" />

        {/* Team-wide autonomy view */}
        <section>
          <div className="mb-4 flex items-center gap-2">
            <Users className="h-4 w-4 text-gray-500" />
            <h2 className="text-base font-semibold text-gray-900 dark:text-white">Team Autonomy</h2>
          </div>
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
            Overview of autonomy levels, time saved, and ceiling settings across your team.
          </p>
          {orgId && <TeamAutopilotView orgId={orgId} />}
        </section>

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
          </div>
        ) : (
          <>
            {/* Role-Based Preset Selector — AE2-011 */}
            <section>
              <div className="mb-4">
                <h2 className="text-base font-semibold text-gray-900 dark:text-white">
                  Role Preset
                </h2>
                <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                  Choose your team's role to apply role-appropriate automation defaults, then fine-tune the intensity style.
                </p>
              </div>
              <RolePresetSelector
                activeRole={activeRole}
                activeStyle={activeStyle}
                onSelect={handleRoleSelect}
                isAdmin={isAdmin}
              />
              {isCustom && activeRole && (
                <div className="mt-3">
                  <Badge variant="warning" className="text-xs">
                    Custom overrides active — individual policy changes below override the role preset.
                  </Badge>
                </div>
              )}
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

            {/* Safety Rules — AE2-015 */}
            <section>
              <div className="mb-4 flex items-center gap-2">
                <Shield className="h-4 w-4 text-gray-500" />
                <h2 className="text-base font-semibold text-gray-900 dark:text-white">Safety Rules</h2>
              </div>
              <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
                Configure impact weights that determine how aggressively the agent responds when actions are undone.
                Higher-impact situations trigger stricter safety measures.
              </p>
              {orgId && <SafetyRulesConfig orgId={orgId} />}
            </section>

            {/* Audit Trail — AE2-009 */}
            <section>
              <div className="mb-4 flex items-center gap-2">
                <History className="h-4 w-4 text-gray-500" />
                <h2 className="text-base font-semibold text-gray-900 dark:text-white">Audit Trail</h2>
              </div>
              <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
                Complete history of autonomy tier changes from org-level policies and per-user signals.
              </p>
              <AutonomyTimeline />
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
