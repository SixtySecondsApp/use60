/**
 * OI-005: Workflow List
 *
 * Shows all saved workflows with run/edit/toggle/delete actions
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Play, Edit, Trash2, ToggleLeft, ToggleRight, Tag, Bell, Sparkles, RefreshCw, ChevronRight, Zap } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { useServices } from '@/lib/services/ServiceLocator';
import { formatDistanceToNow } from 'date-fns';

interface WorkflowListProps {
  tableId: string;
  onEdit: (workflow: any) => void;
}

const workflowSuggestions = [
  {
    icon: Tag,
    title: 'Auto-tag new rows',
    description: 'Categorize rows based on job title, company, or other fields',
    color: 'violet',
    gradient: 'from-violet-500 to-purple-600',
    glow: 'shadow-violet-500/20',
    hoverBorder: 'hover:border-violet-500/40',
    bg: 'bg-violet-500/10',
  },
  {
    icon: Bell,
    title: 'Alert on high-value leads',
    description: 'Slack notification when a row matches your ICP criteria',
    color: 'amber',
    gradient: 'from-amber-500 to-orange-600',
    glow: 'shadow-amber-500/20',
    hoverBorder: 'hover:border-amber-500/40',
    bg: 'bg-amber-500/10',
  },
  {
    icon: Sparkles,
    title: 'Enrich on sync',
    description: 'Run AI enrichment automatically when new rows land',
    color: 'emerald',
    gradient: 'from-emerald-500 to-teal-600',
    glow: 'shadow-emerald-500/20',
    hoverBorder: 'hover:border-emerald-500/40',
    bg: 'bg-emerald-500/10',
  },
  {
    icon: RefreshCw,
    title: 'Sync to HubSpot',
    description: 'Push updates back to HubSpot when cells are edited',
    color: 'blue',
    gradient: 'from-blue-500 to-indigo-600',
    glow: 'shadow-blue-500/20',
    hoverBorder: 'hover:border-blue-500/40',
    bg: 'bg-blue-500/10',
  },
];

export function WorkflowList({ tableId, onEdit }: WorkflowListProps) {
  const { opsTableService } = useServices();
  const queryClient = useQueryClient();

  const { data: workflows = [] } = useQuery({
    queryKey: ['workflows', tableId],
    queryFn: () => opsTableService.getWorkflows(tableId),
  });

  const executeMutation = useMutation({
    mutationFn: (workflowId: string) =>
      opsTableService.executeWorkflow(workflowId, tableId),
    onSuccess: () => {
      toast.success('Workflow executed successfully');
    },
  });

  const toggleMutation = useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) =>
      opsTableService.toggleWorkflow(id, !isActive),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['workflows', tableId] });
    },
  });

  if (workflows.length === 0) {
    return (
      <div className="space-y-5">
        {/* Empty state header */}
        <div className="rounded-xl border border-white/[0.06] bg-gradient-to-br from-white/[0.03] to-transparent p-5">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center shadow-lg shadow-violet-500/20">
              <Zap className="w-4 h-4 text-white" />
            </div>
            <div>
              <p className="text-sm font-medium text-gray-200">Automate your table</p>
              <p className="text-xs text-gray-500">Workflows run actions when conditions are met</p>
            </div>
          </div>
        </div>

        {/* Suggestion cards */}
        <div className="space-y-2">
          <p className="text-[11px] font-medium uppercase tracking-wider text-gray-500 px-1">Suggestions</p>
          <div className="space-y-2">
            {workflowSuggestions.map((s) => (
              <button
                key={s.title}
                onClick={() => onEdit(null as any)}
                className={`group flex w-full items-center gap-3 rounded-xl border border-white/[0.06] bg-white/[0.02] p-3.5 text-left transition-all duration-200 ${s.hoverBorder} hover:bg-white/[0.05]`}
              >
                <div className={`w-8 h-8 shrink-0 rounded-lg bg-gradient-to-br ${s.gradient} flex items-center justify-center shadow-lg ${s.glow} transition-transform duration-200 group-hover:scale-110`}>
                  <s.icon className="w-4 h-4 text-white" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-200">{s.title}</p>
                  <p className="text-xs text-gray-500 mt-0.5 line-clamp-1">{s.description}</p>
                </div>
                <ChevronRight className="w-4 h-4 text-gray-600 shrink-0 transition-transform duration-200 group-hover:translate-x-0.5 group-hover:text-gray-400" />
              </button>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {workflows.map((workflow: any) => (
        <div
          key={workflow.id}
          className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4 space-y-3 transition-colors hover:bg-white/[0.04]"
        >
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h3 className="text-sm font-semibold text-gray-200 truncate">{workflow.name}</h3>
              {workflow.description && (
                <p className="text-xs text-gray-500 mt-1 line-clamp-2">
                  {workflow.description}
                </p>
              )}
            </div>
            <button
              onClick={() => toggleMutation.mutate({ id: workflow.id, isActive: workflow.is_active })}
              className="shrink-0 p-1 rounded-md transition-colors hover:bg-white/5"
            >
              {workflow.is_active ? (
                <ToggleRight className="h-5 w-5 text-emerald-400" />
              ) : (
                <ToggleLeft className="h-5 w-5 text-gray-600" />
              )}
            </button>
          </div>

          <div className="flex items-center gap-2 text-xs">
            <Badge variant="outline" className="border-white/10 text-gray-400 bg-white/[0.03] text-[10px] px-1.5 py-0">
              {workflow.trigger_type}
            </Badge>
            <span className="text-gray-600">·</span>
            <span className="text-gray-500">{workflow.steps?.length || 0} steps</span>
            {workflow.last_run_at && (
              <>
                <span className="text-gray-600">·</span>
                <span className="text-gray-500">
                  {formatDistanceToNow(new Date(workflow.last_run_at), { addSuffix: true })}
                </span>
              </>
            )}
          </div>

          <div className="flex gap-2 pt-1">
            <Button
              size="sm"
              onClick={() => executeMutation.mutate(workflow.id)}
              disabled={executeMutation.isPending}
              className="h-7 text-xs bg-gradient-to-r from-violet-500 to-purple-600 hover:from-violet-400 hover:to-purple-500 text-white border-0 shadow-lg shadow-violet-500/20"
            >
              <Play className="h-3 w-3 mr-1" />
              Run
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => onEdit(workflow)}
              className="h-7 text-xs border-white/10 text-gray-400 bg-white/[0.03] hover:bg-white/[0.06] hover:text-gray-200"
            >
              <Edit className="h-3 w-3 mr-1" />
              Edit
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                if (confirm('Delete this workflow?')) {
                  // Delete would go here
                }
              }}
              className="h-7 text-xs border-white/10 text-gray-500 bg-white/[0.03] hover:bg-red-500/10 hover:text-red-400 hover:border-red-500/30"
            >
              <Trash2 className="h-3 w-3" />
            </Button>
          </div>
        </div>
      ))}
    </div>
  );
}
