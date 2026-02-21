import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase/clientV2';
import { useAuth } from '@/lib/contexts/AuthContext';
import { toast } from 'sonner';

interface ApproveTaskVariables {
  taskId: string;
}

interface DismissTaskVariables {
  taskId: string;
  dismiss_reason?: string;
}

interface UpdateDeliverableVariables {
  taskId: string;
  deliverable_data: Record<string, unknown>;
}

interface CreateTaskVariables {
  title: string;
  description?: string;
  priority?: string;
  task_type?: string;
  due_date?: string;
  source?: string;
  metadata?: Record<string, unknown>;
}

interface AddCommentVariables {
  taskId: string;
  content: string;
  isAI?: boolean;
}

interface UpdateTaskStatusVariables {
  taskId: string;
  status: string;
}

interface Comment {
  id: string;
  author: string;
  content: string;
  is_ai: boolean;
  created_at: string;
}

async function triggerChainPreWork(completedTaskId: string) {
  try {
    // Get the completed task to find its chain
    const { data: completedTask } = await supabase
      .from('tasks')
      .select('id, parent_task_id, assigned_to')
      .eq('id', completedTaskId)
      .maybeSingle();

    if (!completedTask?.parent_task_id) return;

    // Find next pending tasks in the same chain
    const { data: nextTasks } = await supabase
      .from('tasks')
      .select('id, ai_status, task_type, deliverable_type')
      .eq('parent_task_id', completedTask.parent_task_id)
      .in('status', ['pending'])
      .eq('ai_status', 'none')
      .order('created_at', { ascending: true })
      .limit(2); // Rate limit: max 2 per completion

    if (!nextTasks || nextTasks.length === 0) return;

    // Trigger AI worker for each (fire-and-forget, don't await)
    for (const task of nextTasks) {
      supabase.functions.invoke('unified-task-ai-worker', {
        body: {
          task_id: task.id,
          action: 'generate_deliverable',
          background: true,
        }
      }).catch(() => {}); // Silently fail
    }
  } catch {
    // Silent failure - this is background work
  }
}

export function useApproveTask() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ taskId }: ApproveTaskVariables) => {
      const { data, error } = await supabase
        .from('tasks')
        .update({
          status: 'approved',
          actioned_at: new Date().toISOString(),
        })
        .eq('id', taskId)
        .select('id, title, status, actioned_at')
        .maybeSingle();

      if (error) throw error;
      if (!data) throw new Error('Task not found');

      return data;
    },
    onSuccess: (_data, { taskId }) => {
      queryClient.invalidateQueries({ queryKey: ['command-centre-tasks'], type: 'all' });
      queryClient.invalidateQueries({ queryKey: ['command-centre-task-counts'] });
      toast.success('Task approved');

      // Trigger background AI pre-work for next chain tasks
      triggerChainPreWork(taskId);
    },
    onError: (error: Error) => {
      toast.error(`Failed to approve task: ${error.message}`);
    },
  });
}

export function useDismissTask() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ taskId, dismiss_reason }: DismissTaskVariables) => {
      const updateData: Record<string, unknown> = {
        status: 'dismissed',
        actioned_at: new Date().toISOString(),
      };

      const { data, error } = await supabase
        .from('tasks')
        .update(updateData)
        .eq('id', taskId)
        .select('id, title, status, actioned_at')
        .maybeSingle();

      if (error) throw error;
      if (!data) throw new Error('Task not found');

      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['command-centre-tasks'], type: 'all' });
      queryClient.invalidateQueries({ queryKey: ['command-centre-task-counts'] });
      toast.success('Task dismissed');
    },
    onError: (error: Error) => {
      toast.error(`Failed to dismiss task: ${error.message}`);
    },
  });
}

export function useUpdateDeliverable() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ taskId, deliverable_data }: UpdateDeliverableVariables) => {
      const { data, error } = await supabase
        .from('tasks')
        .update({
          deliverable_data,
        })
        .eq('id', taskId)
        .select('id, title, deliverable_data')
        .maybeSingle();

      if (error) throw error;
      if (!data) throw new Error('Task not found');

      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['command-centre-tasks'], type: 'all' });
      queryClient.invalidateQueries({ queryKey: ['command-centre-task-counts'] });
      toast.success('Deliverable updated');
    },
    onError: (error: Error) => {
      toast.error(`Failed to update deliverable: ${error.message}`);
    },
  });
}

export function useCreateTask() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async (variables: CreateTaskVariables) => {
      if (!user?.id) throw new Error('User not authenticated');

      const { data, error } = await supabase
        .from('tasks')
        .insert({
          title: variables.title,
          description: variables.description,
          priority: variables.priority || 'medium',
          task_type: variables.task_type || 'general',
          due_date: variables.due_date,
          source: variables.source || 'manual',
          ai_status: 'none',
          assigned_to: user.id,
          created_by: user.id,
          status: 'pending',
          metadata: variables.metadata || {},
        })
        .select('id, title, description, priority, task_type, due_date, source, ai_status, assigned_to, created_by, status, metadata, created_at')
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['command-centre-tasks'], type: 'all' });
      queryClient.invalidateQueries({ queryKey: ['command-centre-task-counts'] });
      toast.success('Task created');
    },
    onError: (error: Error) => {
      toast.error(`Failed to create task: ${error.message}`);
    },
  });
}

export function useAddComment() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async ({ taskId, content, isAI = false }: AddCommentVariables) => {
      if (!user?.email) throw new Error('User not authenticated');

      // Fetch current task to get existing metadata
      const { data: task, error: fetchError } = await supabase
        .from('tasks')
        .select('metadata')
        .eq('id', taskId)
        .maybeSingle();

      if (fetchError) throw fetchError;
      if (!task) throw new Error('Task not found');

      const metadata = (task.metadata as Record<string, unknown>) || {};
      const existingComments = (metadata.comments as Comment[]) || [];

      const newComment: Comment = {
        id: crypto.randomUUID(),
        author: user.email,
        content,
        is_ai: isAI,
        created_at: new Date().toISOString(),
      };

      const updatedMetadata = {
        ...metadata,
        comments: [...existingComments, newComment],
      };

      // Update task with new comment
      const { data, error } = await supabase
        .from('tasks')
        .update({ metadata: updatedMetadata })
        .eq('id', taskId)
        .select('id, title, metadata')
        .maybeSingle();

      if (error) throw error;
      if (!data) throw new Error('Task not found');

      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['command-centre-tasks'], type: 'all' });
      queryClient.invalidateQueries({ queryKey: ['command-centre-task-counts'] });
      toast.success('Comment added');
    },
    onError: (error: Error) => {
      toast.error(`Failed to add comment: ${error.message}`);
    },
  });
}

export function useDeleteTask() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (taskId: string) => {
      const { error } = await supabase
        .from('tasks')
        .delete()
        .eq('id', taskId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['command-centre-tasks'], type: 'all' });
      queryClient.invalidateQueries({ queryKey: ['command-centre-task-counts'] });
      toast.success('Task deleted');
    },
    onError: (error: Error) => {
      toast.error(`Failed to delete task: ${error.message}`);
    },
  });
}

export function useUpdateTaskStatus() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ taskId, status }: UpdateTaskStatusVariables) => {
      const { data, error } = await supabase
        .from('tasks')
        .update({ status })
        .eq('id', taskId)
        .select('id, title, status')
        .maybeSingle();

      if (error) throw error;
      if (!data) throw new Error('Task not found');

      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['command-centre-tasks'], type: 'all' });
      queryClient.invalidateQueries({ queryKey: ['command-centre-task-counts'] });
      toast.success('Task status updated');
    },
    onError: (error: Error) => {
      toast.error(`Failed to update task status: ${error.message}`);
    },
  });
}

interface UpdateTaskFieldVariables {
  taskId: string;
  field: string;
  value: unknown;
}

export function useUpdateTaskField() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ taskId, field, value }: UpdateTaskFieldVariables) => {
      const { data, error } = await supabase
        .from('tasks')
        .update({ [field]: value, updated_at: new Date().toISOString() })
        .eq('id', taskId)
        .select('id, title')
        .maybeSingle();

      if (error) throw error;
      if (!data) throw new Error('Task not found');
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['command-centre-tasks'], type: 'all' });
      queryClient.invalidateQueries({ queryKey: ['command-centre-task-counts'] });
    },
    onError: (error: Error) => {
      toast.error(`Failed to update task: ${error.message}`);
    },
  });
}
