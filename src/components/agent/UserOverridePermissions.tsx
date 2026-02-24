/**
 * UserOverridePermissions
 *
 * Section in AutonomySettingsPage that allows admins to specify which
 * action types users can override at the individual level.
 * Writes to agent_config_user_overridable table.
 */

import { useState, useEffect } from 'react';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Loader2, Users } from 'lucide-react';
import { supabase } from '@/lib/supabase/clientV2';
import { toast } from 'sonner';

interface UserOverridePermissionsProps {
  orgId: string;
}

const ACTION_TYPES = [
  { key: 'crm_stage_change', label: 'CRM Stage Change' },
  { key: 'crm_field_update', label: 'CRM Field Update' },
  { key: 'crm_contact_create', label: 'Create CRM Contact' },
  { key: 'send_email', label: 'Send Email' },
  { key: 'send_slack', label: 'Send Slack Message' },
  { key: 'create_task', label: 'Create Task' },
  { key: 'enrich_contact', label: 'Enrich Contact' },
  { key: 'draft_proposal', label: 'Draft Proposal' },
];

// We store user-overridable policy keys as agent_config_user_overridable rows
// where agent_type = 'global' and config_key = 'autonomy.action.{action_type}'
const configKeyFor = (actionKey: string) => `autonomy.action.${actionKey}`;

export function UserOverridePermissions({ orgId }: UserOverridePermissionsProps) {
  const [overridable, setOverridable] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(true);
  const [toggling, setToggling] = useState<string | null>(null);

  useEffect(() => {
    if (!orgId) return;

    const load = async () => {
      setLoading(true);
      try {
        const { data, error } = await supabase
          .from('agent_config_user_overridable')
          .select('config_key, is_overridable')
          .eq('org_id', orgId)
          .eq('agent_type', 'global');

        if (error) throw error;

        const map: Record<string, boolean> = {};
        for (const row of data ?? []) {
          // Extract action key from config_key like "autonomy.action.crm_stage_change"
          const match = row.config_key.match(/^autonomy\.action\.(.+)$/);
          if (match) {
            map[match[1]] = row.is_overridable;
          }
        }
        setOverridable(map);
      } catch (err) {
        console.error('[UserOverridePermissions] load error:', err);
      } finally {
        setLoading(false);
      }
    };

    load();
  }, [orgId]);

  const handleToggle = async (actionKey: string, enabled: boolean) => {
    setToggling(actionKey);
    try {
      const configKey = configKeyFor(actionKey);

      const { error } = await supabase
        .from('agent_config_user_overridable')
        .upsert(
          {
            org_id: orgId,
            agent_type: 'global',
            config_key: configKey,
            is_overridable: enabled,
          },
          { onConflict: 'org_id,agent_type,config_key' }
        );

      if (error) throw error;

      setOverridable((prev) => ({ ...prev, [actionKey]: enabled }));
    } catch (err) {
      console.error('[UserOverridePermissions] toggle error:', err);
      toast.error('Failed to update override permission');
    } finally {
      setToggling(null);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center gap-2 py-4 text-sm text-gray-500">
        <Loader2 className="h-4 w-4 animate-spin" />
        Loading override permissions...
      </div>
    );
  }

  return (
    <div className="bg-gray-50/50 dark:bg-gray-800/20 rounded-xl p-4 border border-gray-100 dark:border-gray-800">
      <div className="mb-3">
        <p className="text-sm text-gray-500 dark:text-gray-400">
          Choose which action types individual reps can override at their own level. Reps will only see toggles for actions you enable here.
        </p>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {ACTION_TYPES.map((action) => {
          const isEnabled = overridable[action.key] ?? false;
          const isToggling = toggling === action.key;
          return (
            <div
              key={action.key}
              className="flex items-center justify-between gap-3 p-3 rounded-lg bg-white dark:bg-gray-900/30 border border-gray-100 dark:border-gray-800"
            >
              <Label
                htmlFor={`override-${action.key}`}
                className="text-sm font-medium text-gray-900 dark:text-gray-100 cursor-pointer"
              >
                {action.label}
              </Label>
              {isToggling ? (
                <Loader2 className="h-4 w-4 animate-spin text-gray-400" />
              ) : (
                <Switch
                  id={`override-${action.key}`}
                  checked={isEnabled}
                  onCheckedChange={(checked) => handleToggle(action.key, checked)}
                />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
