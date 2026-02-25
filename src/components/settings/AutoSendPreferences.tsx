/**
 * AutoSendPreferences
 *
 * Settings panel for configuring which action types the Copilot is allowed
 * to auto-execute without manual approval.
 *
 * All toggles default to OFF — the user must explicitly opt in per action type.
 * Preferences are stored in user_settings.auto_send_types as a {type: boolean} map.
 *
 * Story: CC-012
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase/clientV2';
import { useAuthUser } from '@/lib/hooks/useAuthUser';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import {
  Mail,
  FileText,
  CalendarClock,
  ListTodo,
  Send,
  ClipboardList,
  BrainCircuit,
  AlertTriangle,
} from 'lucide-react';

// ============================================================================
// Action type catalogue
// ============================================================================

interface ActionTypeMeta {
  type: string;
  label: string;
  description: string;
  icon: React.ElementType;
  isExternal: boolean;
}

const ACTION_TYPES: ActionTypeMeta[] = [
  {
    type: 'follow_up',
    label: 'Follow-up Emails',
    description: 'Send follow-up emails automatically after meetings',
    icon: Mail,
    isExternal: false,
  },
  {
    type: 'meeting_prep',
    label: 'Meeting Prep Briefs',
    description: 'Generate and send meeting preparation briefs before calls',
    icon: BrainCircuit,
    isExternal: false,
  },
  {
    type: 'crm_update',
    label: 'CRM Updates',
    description: 'Apply CRM field updates from meeting insights automatically',
    icon: ClipboardList,
    isExternal: false,
  },
  {
    type: 'task_create',
    label: 'Task Creation',
    description: 'Create tasks from meeting action items without approval',
    icon: ListTodo,
    isExternal: false,
  },
  {
    type: 'send_email',
    label: 'Direct Email Sending',
    description: 'Send emails on your behalf without review',
    icon: Send,
    isExternal: true,
  },
  {
    type: 'send_proposal',
    label: 'Proposal Sending',
    description: 'Send proposal documents directly to prospects',
    icon: FileText,
    isExternal: true,
  },
  {
    type: 'schedule_meeting',
    label: 'Meeting Scheduling',
    description: 'Schedule meetings with contacts on your behalf',
    icon: CalendarClock,
    isExternal: true,
  },
];

// ============================================================================
// Query helpers
// ============================================================================

async function fetchAutoSendTypes(userId: string): Promise<Record<string, boolean>> {
  const { data, error } = await supabase
    .from('user_settings')
    .select('auto_send_types')
    .eq('user_id', userId)
    .maybeSingle();

  if (error) throw error;
  return (data?.auto_send_types as Record<string, boolean>) ?? {};
}

async function updateAutoSendType(
  userId: string,
  type: string,
  enabled: boolean,
  current: Record<string, boolean>,
): Promise<void> {
  const updated = { ...current, [type]: enabled };
  const { error } = await supabase
    .from('user_settings')
    .update({ auto_send_types: updated })
    .eq('user_id', userId);
  if (error) throw error;
}

// ============================================================================
// Component
// ============================================================================

export function AutoSendPreferences() {
  const { data: user, isLoading: userLoading } = useAuthUser();
  const queryClient = useQueryClient();

  const userId = user?.id ?? null;

  const { data: autoSendTypes, isLoading: prefsLoading } = useQuery({
    queryKey: ['auto-send-types', userId],
    queryFn: () => fetchAutoSendTypes(userId!),
    enabled: !!userId,
  });

  const mutation = useMutation({
    mutationFn: ({
      type,
      enabled,
    }: {
      type: string;
      enabled: boolean;
    }) => {
      if (!userId) throw new Error('Not authenticated');
      return updateAutoSendType(userId, type, enabled, autoSendTypes ?? {});
    },
    onMutate: async ({ type, enabled }) => {
      // Optimistic update
      await queryClient.cancelQueries({ queryKey: ['auto-send-types', userId] });
      const previous = queryClient.getQueryData<Record<string, boolean>>(['auto-send-types', userId]);
      queryClient.setQueryData<Record<string, boolean>>(['auto-send-types', userId], (old) => ({
        ...(old ?? {}),
        [type]: enabled,
      }));
      return { previous };
    },
    onError: (err: Error, _vars, context) => {
      // Roll back on error
      if (context?.previous !== undefined) {
        queryClient.setQueryData(['auto-send-types', userId], context.previous);
      }
      toast.error(`Failed to save preference: ${err.message}`);
    },
    onSuccess: (_data, { enabled }, _context) => {
      toast.success(enabled ? 'Auto-send enabled' : 'Auto-send disabled');
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['auto-send-types', userId] });
    },
  });

  const isLoading = userLoading || prefsLoading;

  if (isLoading) {
    return (
      <div className="space-y-4">
        {ACTION_TYPES.map((at) => (
          <div key={at.type} className="flex items-center justify-between py-3">
            <div className="flex items-start gap-3 flex-1">
              <Skeleton className="h-8 w-8 rounded-md flex-shrink-0" />
              <div className="space-y-1.5 flex-1">
                <Skeleton className="h-4 w-40" />
                <Skeleton className="h-3 w-64" />
              </div>
            </div>
            <Skeleton className="h-6 w-11 rounded-full flex-shrink-0" />
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-1">
      {/* Info banner */}
      <div className="flex items-start gap-2.5 px-4 py-3 mb-4 rounded-lg bg-amber-500/10 border border-amber-500/20">
        <AlertTriangle className="h-4 w-4 text-amber-400 flex-shrink-0 mt-0.5" />
        <p className="text-xs text-amber-300 leading-relaxed">
          Auto-send actions execute without your approval. All external actions are irreversible.
          Start with internal actions and enable external ones only when you trust the AI&apos;s output.
        </p>
      </div>

      {/* Toggle rows */}
      <div className="divide-y divide-gray-800">
        {ACTION_TYPES.map((at) => {
          const Icon = at.icon;
          const isEnabled = autoSendTypes?.[at.type] ?? false;
          const isPending = mutation.isPending && mutation.variables?.type === at.type;

          return (
            <div
              key={at.type}
              className={cn(
                'flex items-center justify-between gap-4 py-3.5 px-1',
                isEnabled && 'opacity-100',
                !isEnabled && 'opacity-80',
              )}
            >
              {/* Left: icon + label + description */}
              <div className="flex items-start gap-3 flex-1 min-w-0">
                <div
                  className={cn(
                    'flex-shrink-0 w-8 h-8 rounded-md flex items-center justify-center transition-colors',
                    isEnabled
                      ? 'bg-emerald-500/20 text-emerald-400'
                      : 'bg-gray-800 text-gray-500',
                  )}
                >
                  <Icon className="h-4 w-4" />
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Label
                      htmlFor={`auto-send-${at.type}`}
                      className="text-sm font-medium text-gray-100 cursor-pointer"
                    >
                      {at.label}
                    </Label>
                    {at.isExternal && (
                      <span className="inline-flex items-center gap-1 text-xs px-1.5 py-0 rounded border border-amber-500/30 bg-amber-500/10 text-amber-400">
                        <AlertTriangle className="h-2.5 w-2.5" />
                        External action — sends on your behalf
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-gray-500 mt-0.5">{at.description}</p>
                </div>
              </div>

              {/* Right: toggle */}
              <Switch
                id={`auto-send-${at.type}`}
                checked={isEnabled}
                disabled={isPending || !userId}
                onCheckedChange={(checked) =>
                  mutation.mutate({ type: at.type, enabled: checked })
                }
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default AutoSendPreferences;
