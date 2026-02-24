import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase/clientV2';
import { toast } from 'sonner';

interface ExecuteSkillVariables {
  taskId: string;
  skillKey: string;
}

/**
 * Mutation hook that calls unified-task-ai-worker with a skill_key
 * to execute a specific skill for a task.
 */
export function useExecuteSkillForTask() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ taskId, skillKey }: ExecuteSkillVariables) => {
      // Optimistically update ai_status to 'working'
      await supabase
        .from('tasks')
        .update({ ai_status: 'working', updated_at: new Date().toISOString() })
        .eq('id', taskId);

      const { data, error } = await supabase.functions.invoke(
        'unified-task-ai-worker',
        {
          body: { task_id: taskId, skill_key: skillKey },
        }
      );

      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      return data;
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['command-centre-tasks'], type: 'all' });
      queryClient.invalidateQueries({ queryKey: ['command-centre-task-counts'] });
      toast.success('AI draft ready');
    },
    onError: (error: Error, variables) => {
      // Revert ai_status on failure
      supabase
        .from('tasks')
        .update({ ai_status: 'failed', updated_at: new Date().toISOString() })
        .eq('id', variables.taskId);

      toast.error(`AI execution failed: ${error.message}`);
    },
  });
}
