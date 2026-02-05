/**
 * OI-005: Workflow List
 *
 * Shows all saved workflows with run/edit/toggle/delete actions
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Play, Edit, Trash2, ToggleLeft, ToggleRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { useServices } from '@/lib/services/ServiceLocator';
import { formatDistanceToNow } from 'date-fns';

interface WorkflowListProps {
  tableId: string;
  onEdit: (workflow: any) => void;
}

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
      <div className="text-center py-12 text-muted-foreground">
        <p>No workflows yet</p>
        <p className="text-sm mt-2">Create one to automate your table operations</p>
      </div>
    );
  }

  return (
    <div className="grid gap-4 md:grid-cols-2">
      {workflows.map((workflow: any) => (
        <div key={workflow.id} className="border rounded-lg p-4 space-y-3">
          <div className="flex items-start justify-between">
            <div>
              <h3 className="font-semibold">{workflow.name}</h3>
              <p className="text-sm text-muted-foreground mt-1">
                {workflow.description}
              </p>
            </div>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => toggleMutation.mutate({ id: workflow.id, isActive: workflow.is_active })}
            >
              {workflow.is_active ? (
                <ToggleRight className="h-5 w-5 text-green-500" />
              ) : (
                <ToggleLeft className="h-5 w-5 text-gray-400" />
              )}
            </Button>
          </div>

          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Badge variant="outline">{workflow.trigger_type}</Badge>
            <span>·</span>
            <span>{workflow.steps?.length || 0} steps</span>
            {workflow.last_run_at && (
              <>
                <span>·</span>
                <span>
                  Last run {formatDistanceToNow(new Date(workflow.last_run_at), { addSuffix: true })}
                </span>
              </>
            )}
          </div>

          <div className="flex gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => executeMutation.mutate(workflow.id)}
              disabled={executeMutation.isPending}
            >
              <Play className="h-4 w-4 mr-1" />
              Run Now
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => onEdit(workflow)}
            >
              <Edit className="h-4 w-4 mr-1" />
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
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        </div>
      ))}
    </div>
  );
}
