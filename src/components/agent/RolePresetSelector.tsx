/**
 * RolePresetSelector
 *
 * Two-step autonomy preset selector:
 *   Step 1 — Choose your role (SDR / AE / VP Sales / CS)
 *   Step 2 — Fine-tune style (Conservative / Balanced / Autonomous)
 *
 * Role selection pre-fills the action policy grid with role-appropriate
 * defaults. Style adjusts intensity across the board.
 *
 * First-time setup: role selector shown prominently.
 * Returning users: current role displayed with a "Change" button.
 *
 * Data source: `get_autonomy_presets` RPC from AE2-010 migration.
 */

import { useState, useEffect, useCallback, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Loader2,
  Phone,
  Briefcase,
  BarChart3,
  HeartHandshake,
  ShieldCheck,
  CheckCircle,
  Zap,
  ChevronRight,
  ArrowLeft,
  Sparkles,
  UserCheck,
} from 'lucide-react';
import { supabase } from '@/lib/supabase/clientV2';
import { cn } from '@/lib/utils';
import type { PolicyValue } from '@/components/agent/ActionPolicyGrid';

// ============================================================================
// Types
// ============================================================================

export type RoleName = 'sdr' | 'ae' | 'vp_sales' | 'cs';
export type StyleName = 'conservative' | 'balanced' | 'autonomous';

export interface RolePreset {
  config_key: string;
  preset_type: 'role';
  label: string;
  full_label: string;
  description: string;
  policies: Record<string, PolicyValue>;
}

export interface RolePresetSelectorProps {
  /** Currently active role (null if first-time or custom) */
  activeRole: RoleName | null;
  /** Currently active style */
  activeStyle: StyleName | null;
  /** Called when user confirms a role + style selection */
  onSelect: (role: RoleName, style: StyleName, policies: Record<string, PolicyValue>) => void;
  /** Whether the user is an admin (non-admins see a read-only view) */
  isAdmin: boolean;
}

// ============================================================================
// Role metadata (icons, recommended-for text)
// ============================================================================

const ROLE_META: Record<
  RoleName,
  {
    icon: React.ElementType;
    color: string;
    bgColor: string;
    borderColor: string;
    recommendedFor: string;
  }
> = {
  sdr: {
    icon: Phone,
    color: 'text-violet-600 dark:text-violet-400',
    bgColor: 'bg-violet-100 dark:bg-violet-900/30',
    borderColor: 'border-violet-300 dark:border-violet-700',
    recommendedFor: 'Outbound reps doing high-volume prospecting and lead qualification.',
  },
  ae: {
    icon: Briefcase,
    color: 'text-blue-600 dark:text-blue-400',
    bgColor: 'bg-blue-100 dark:bg-blue-900/30',
    borderColor: 'border-blue-300 dark:border-blue-700',
    recommendedFor: 'Deal-focused reps managing pipeline and closing revenue.',
  },
  vp_sales: {
    icon: BarChart3,
    color: 'text-amber-600 dark:text-amber-400',
    bgColor: 'bg-amber-100 dark:bg-amber-900/30',
    borderColor: 'border-amber-300 dark:border-amber-700',
    recommendedFor: 'Sales leaders who need full visibility and approve all key actions.',
  },
  cs: {
    icon: HeartHandshake,
    color: 'text-emerald-600 dark:text-emerald-400',
    bgColor: 'bg-emerald-100 dark:bg-emerald-900/30',
    borderColor: 'border-emerald-300 dark:border-emerald-700',
    recommendedFor: 'Customer success managers focused on renewals, expansion, and health.',
  },
};

const STYLE_META: Record<
  StyleName,
  {
    icon: React.ElementType;
    label: string;
    description: string;
    intensity: string;
  }
> = {
  conservative: {
    icon: ShieldCheck,
    label: 'Conservative',
    description: 'Maximum oversight. Most actions require approval.',
    intensity: 'low',
  },
  balanced: {
    icon: CheckCircle,
    label: 'Balanced',
    description: 'Low-risk actions auto-run. High-risk actions need approval.',
    intensity: 'medium',
  },
  autonomous: {
    icon: Zap,
    label: 'Autonomous',
    description: 'Maximize automation. Only critical actions need review.',
    intensity: 'high',
  },
};

// ============================================================================
// Style intensity adjustments
//
// Given a role's base policies, style shifts the intensity:
//   Conservative: downgrade auto->approve, approve stays, suggest stays
//   Balanced:     use role defaults as-is (no change)
//   Autonomous:   upgrade suggest->approve, approve->auto where risk allows
// ============================================================================

const STYLE_ADJUSTMENTS: Record<StyleName, (policies: Record<string, PolicyValue>) => Record<string, PolicyValue>> = {
  conservative: (base) => {
    const adjusted: Record<string, PolicyValue> = {};
    for (const [key, value] of Object.entries(base)) {
      if (value === 'auto') {
        adjusted[key] = 'approve';
      } else {
        adjusted[key] = value;
      }
    }
    return adjusted;
  },
  balanced: (base) => {
    // Use role defaults as-is
    return { ...base };
  },
  autonomous: (base) => {
    const adjusted: Record<string, PolicyValue> = {};
    // High-risk action types that should NOT be fully auto even in autonomous style
    const highRiskActions = new Set(['send_email', 'draft_proposal', 'crm_stage_change']);
    for (const [key, value] of Object.entries(base)) {
      if (value === 'suggest') {
        adjusted[key] = highRiskActions.has(key) ? 'approve' : 'auto';
      } else if (value === 'approve' && !highRiskActions.has(key)) {
        adjusted[key] = 'auto';
      } else {
        adjusted[key] = value;
      }
    }
    return adjusted;
  },
};

// ============================================================================
// Component
// ============================================================================

export function RolePresetSelector({ activeRole, activeStyle, onSelect, isAdmin }: RolePresetSelectorProps) {
  const [rolePresets, setRolePresets] = useState<Record<RoleName, RolePreset>>({} as any);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // UI state
  const [selectedRole, setSelectedRole] = useState<RoleName | null>(activeRole);
  const [selectedStyle, setSelectedStyle] = useState<StyleName>(activeStyle ?? 'balanced');
  const [isChanging, setIsChanging] = useState(!activeRole); // First-time: show picker immediately

  // Fetch role presets from RPC
  useEffect(() => {
    const fetchPresets = async () => {
      setLoading(true);
      setError(null);
      try {
        const { data, error: rpcError } = await supabase.rpc('get_autonomy_presets', {
          p_preset_type: 'role',
        }) as { data: RolePreset[] | null; error: any };

        if (rpcError) throw rpcError;

        if (data && data.length > 0) {
          const map: Record<string, RolePreset> = {};
          for (const preset of data) {
            // Extract role key from config_key: "autonomy.presets.role.sdr" -> "sdr"
            const roleKey = preset.config_key.replace('autonomy.presets.role.', '');
            map[roleKey] = preset;
          }
          setRolePresets(map as Record<RoleName, RolePreset>);
        }
      } catch (err: any) {
        console.error('[RolePresetSelector] fetch error:', err);
        setError('Failed to load role presets');
      } finally {
        setLoading(false);
      }
    };

    fetchPresets();
  }, []);

  // Compute the final policies when role + style selection changes
  const computedPolicies = useMemo(() => {
    if (!selectedRole || !rolePresets[selectedRole]) return null;
    const basePolicies = rolePresets[selectedRole].policies;
    return STYLE_ADJUSTMENTS[selectedStyle](basePolicies);
  }, [selectedRole, selectedStyle, rolePresets]);

  const handleConfirm = useCallback(() => {
    if (!selectedRole || !computedPolicies) return;
    onSelect(selectedRole, selectedStyle, computedPolicies);
    setIsChanging(false);
  }, [selectedRole, selectedStyle, computedPolicies, onSelect]);

  // ---- Loading state ----
  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-5 w-5 animate-spin text-gray-400 mr-2" />
        <span className="text-sm text-gray-500 dark:text-gray-400">Loading role presets...</span>
      </div>
    );
  }

  // ---- Error state ----
  if (error) {
    return (
      <div className="text-sm text-red-600 dark:text-red-400 py-4">{error}</div>
    );
  }

  const roleKeys = Object.keys(rolePresets) as RoleName[];
  if (roleKeys.length === 0) {
    return (
      <div className="text-sm text-gray-500 dark:text-gray-400 py-4">
        No role presets available. Run the AE2-010 migration to seed role data.
      </div>
    );
  }

  // ---- Returning user: compact display with "Change" button ----
  if (activeRole && !isChanging) {
    const currentPreset = rolePresets[activeRole];
    const meta = ROLE_META[activeRole];
    const styleMeta = activeStyle ? STYLE_META[activeStyle] : null;
    const Icon = meta?.icon ?? UserCheck;

    return (
      <div className="bg-gray-50/50 dark:bg-gray-800/20 rounded-xl p-4 border border-gray-100 dark:border-gray-800">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <div
              className={cn(
                'h-10 w-10 rounded-xl flex items-center justify-center shrink-0',
                meta?.bgColor ?? 'bg-gray-100 dark:bg-gray-800'
              )}
            >
              <Icon className={cn('h-5 w-5', meta?.color ?? 'text-gray-500')} />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-sm font-semibold text-gray-900 dark:text-white">
                  {currentPreset?.full_label ?? activeRole.toUpperCase()}
                </span>
                {styleMeta && (
                  <Badge variant="secondary" className="text-xs">
                    {styleMeta.label}
                  </Badge>
                )}
                <Badge className="text-xs px-1.5 py-0 h-4 bg-blue-600 text-white dark:bg-blue-500">
                  Active
                </Badge>
              </div>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 truncate">
                {currentPreset?.description ?? ''}
              </p>
            </div>
          </div>
          {isAdmin && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setIsChanging(true)}
              className="shrink-0"
            >
              Change
            </Button>
          )}
        </div>
      </div>
    );
  }

  // ---- Full selector: Step 1 = Role, Step 2 = Style ----
  return (
    <div className="space-y-6">
      {/* Back button if returning user is changing */}
      {activeRole && isChanging && (
        <button
          onClick={() => {
            setIsChanging(false);
            setSelectedRole(activeRole);
            setSelectedStyle(activeStyle ?? 'balanced');
          }}
          className="flex items-center gap-1 text-sm text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 transition-colors"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Cancel
        </button>
      )}

      {/* Step 1: Role Selection */}
      <div>
        <div className="flex items-center gap-2 mb-3">
          <div className="flex items-center justify-center h-6 w-6 rounded-full bg-blue-600 text-white text-xs font-bold">
            1
          </div>
          <h3 className="text-sm font-semibold text-gray-900 dark:text-white">
            Choose your role
          </h3>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {roleKeys.map((roleKey) => {
            const preset = rolePresets[roleKey];
            const meta = ROLE_META[roleKey];
            if (!preset || !meta) return null;
            const Icon = meta.icon;
            const isSelected = selectedRole === roleKey;

            return (
              <button
                key={roleKey}
                onClick={() => {
                  if (!isAdmin) return;
                  setSelectedRole(roleKey);
                }}
                disabled={!isAdmin}
                className={cn(
                  'flex flex-col items-start gap-3 p-4 rounded-xl border-2 text-left transition-all',
                  isSelected
                    ? cn('bg-white dark:bg-gray-900/40', meta.borderColor, 'ring-1', meta.borderColor)
                    : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900/20 hover:border-gray-300 dark:hover:border-gray-600',
                  !isAdmin && 'opacity-60 cursor-not-allowed'
                )}
              >
                <div className="flex items-center gap-3 w-full">
                  <div
                    className={cn(
                      'h-9 w-9 rounded-lg flex items-center justify-center shrink-0',
                      isSelected ? meta.bgColor : 'bg-gray-100 dark:bg-gray-800'
                    )}
                  >
                    <Icon
                      className={cn(
                        'h-[18px] w-[18px]',
                        isSelected ? meta.color : 'text-gray-500 dark:text-gray-400'
                      )}
                    />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold text-gray-900 dark:text-white">
                        {preset.full_label}
                      </span>
                      <Badge variant="secondary" className="text-xs">
                        {preset.label}
                      </Badge>
                    </div>
                  </div>
                  {isSelected && (
                    <div className="shrink-0">
                      <CheckCircle className="h-[18px] w-[18px] text-blue-600 dark:text-blue-400" />
                    </div>
                  )}
                </div>
                <p className="text-xs text-gray-600 dark:text-gray-400 leading-relaxed">
                  {preset.description}
                </p>
                <div className="flex items-start gap-1.5 mt-auto">
                  <Sparkles className="h-3 w-3 text-gray-400 mt-0.5 shrink-0" />
                  <span className="text-xs text-gray-400 dark:text-gray-500 italic">
                    {meta.recommendedFor}
                  </span>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Step 2: Style Fine-Tune (only visible after role is selected) */}
      {selectedRole && (
        <div>
          <div className="flex items-center gap-2 mb-3">
            <div className="flex items-center justify-center h-6 w-6 rounded-full bg-blue-600 text-white text-xs font-bold">
              2
            </div>
            <h3 className="text-sm font-semibold text-gray-900 dark:text-white">
              Fine-tune automation style
            </h3>
          </div>
          <div className="grid grid-cols-3 gap-3">
            {(Object.keys(STYLE_META) as StyleName[]).map((styleKey) => {
              const style = STYLE_META[styleKey];
              const StyleIcon = style.icon;
              const isSelected = selectedStyle === styleKey;

              return (
                <button
                  key={styleKey}
                  onClick={() => {
                    if (!isAdmin) return;
                    setSelectedStyle(styleKey);
                  }}
                  disabled={!isAdmin}
                  className={cn(
                    'flex flex-col items-center gap-2 p-4 rounded-xl border-2 text-center transition-all',
                    isSelected
                      ? 'border-blue-600 bg-blue-50 dark:border-blue-400 dark:bg-blue-900/20'
                      : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900/20 hover:border-gray-300 dark:hover:border-gray-600',
                    !isAdmin && 'opacity-60 cursor-not-allowed'
                  )}
                >
                  <div
                    className={cn(
                      'h-8 w-8 rounded-lg flex items-center justify-center',
                      isSelected
                        ? 'bg-blue-600 dark:bg-blue-500 text-white'
                        : 'bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400'
                    )}
                  >
                    <StyleIcon className="h-4 w-4" />
                  </div>
                  <div>
                    <span className="text-sm font-semibold text-gray-900 dark:text-white block">
                      {style.label}
                    </span>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 leading-snug">
                      {style.description}
                    </p>
                  </div>
                  {isSelected && (
                    <Badge className="text-xs px-1.5 py-0 h-4 bg-blue-600 text-white dark:bg-blue-500">
                      Selected
                    </Badge>
                  )}
                </button>
              );
            })}
          </div>

          {/* Policy preview summary */}
          {computedPolicies && (
            <div className="mt-4 p-3 rounded-lg bg-gray-50 dark:bg-gray-800/30 border border-gray-100 dark:border-gray-800">
              <div className="flex items-center gap-2 mb-2">
                <UserCheck className="h-3.5 w-3.5 text-gray-400" />
                <span className="text-xs font-medium text-gray-600 dark:text-gray-300">
                  Policy preview for {rolePresets[selectedRole]?.full_label} + {STYLE_META[selectedStyle].label}
                </span>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {Object.entries(computedPolicies).map(([actionKey, policy]) => {
                  const policyColors: Record<PolicyValue, string> = {
                    auto: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
                    approve: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400',
                    suggest: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
                    disabled: 'bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-500',
                  };
                  return (
                    <span
                      key={actionKey}
                      className={cn(
                        'inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium',
                        policyColors[policy]
                      )}
                    >
                      {actionKey.replace(/_/g, ' ')}
                    </span>
                  );
                })}
              </div>
            </div>
          )}

          {/* Confirm button */}
          {isAdmin && (
            <div className="mt-4 flex justify-end">
              <Button onClick={handleConfirm} disabled={!selectedRole}>
                <CheckCircle className="h-4 w-4 mr-2" />
                Apply {rolePresets[selectedRole]?.label} / {STYLE_META[selectedStyle].label}
                <ChevronRight className="h-4 w-4 ml-1" />
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
