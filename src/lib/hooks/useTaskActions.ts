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
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['command-centre-tasks'], type: 'all' });
      queryClient.invalidateQueries({ queryKey: ['command-centre-task-counts'] });
      toast.success('Task approved');
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

      if (dismiss_reason) {
        updateData.dismiss_reason = dismiss_reason;
      }

      const { data, error } = await supabase
        .from('tasks')
        .update(updateData)
        .eq('id', taskId)
        .select('id, title, status, actioned_at, dismiss_reason')
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
