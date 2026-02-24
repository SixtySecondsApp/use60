import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase/clientV2';
import { useAuth } from '@/lib/contexts/AuthContext';
import { useEffect, useMemo } from 'react';
import logger from '@/lib/utils/logger';
import type { CommandCentreSortField, CommandCentreSortOrder } from '@/components/command-centre/types';

// Filter parameters for the Command Centre tasks query
export interface CommandCentreTaskFilters {
  status?: string[];
  task_type?: string[];
  source?: string[];
  priority?: string[];
  ai_status?: string[];
  company_id?: string;
  due_date_start?: string;
  due_date_end?: string;
  search?: string;
  activeFilter?: 'all' | 'review' | 'drafts' | 'working' | 'done';
  sortField?: CommandCentreSortField;
  sortOrder?: CommandCentreSortOrder;
}

function calculateUrgencyScore(task: any): number {
  let score = 0;

  // Time sensitivity (highest weight)
  if (task.due_date) {
    const hoursUntilDue = (new Date(task.due_date).getTime() - Date.now()) / (1000 * 60 * 60);
    if (hoursUntilDue < 0) score += 100;       // Overdue
    else if (hoursUntilDue < 24) score += 80;   // Due today
    else if (hoursUntilDue < 72) score += 50;   // Due in 3 days
    else if (hoursUntilDue < 168) score += 30;  // Due this week
  }

  // Task type priority
  const typePriority: Record<string, number> = {
    follow_up: 25,
    proposal: 20,
    meeting_prep: 15,
    research_brief: 10,
    crm_update: 5,
  };
  score += typePriority[task.task_type] || 0;

  // Signal freshness (newer = more urgent)
  const hoursOld = (Date.now() - new Date(task.created_at).getTime()) / (1000 * 60 * 60);
  if (hoursOld < 4) score += 15;
  else if (hoursOld < 24) score += 10;
  else if (hoursOld < 72) score += 5;

  // Priority boost
  if (task.priority === 'urgent') score += 30;
  else if (task.priority === 'high') score += 15;

  // AI readiness boost
  if (task.ai_status === 'draft_ready') score += 10;

  return score;
}

function sortTasks(
  tasks: any[],
  sortField: CommandCentreSortField,
  sortOrder: CommandCentreSortOrder
): any[] {
  const sorted = [...tasks];
  const dir = sortOrder === 'asc' ? 1 : -1;

  sorted.sort((a, b) => {
    switch (sortField) {
      case 'urgency':
        return (calculateUrgencyScore(b) - calculateUrgencyScore(a)) * dir;
      case 'due_date': {
        const aDate = a.due_date ? new Date(a.due_date).getTime() : Infinity;
        const bDate = b.due_date ? new Date(b.due_date).getTime() : Infinity;
        return (aDate - bDate) * dir;
      }
      case 'priority': {
        const priorityRank: Record<string, number> = { urgent: 4, high: 3, medium: 2, low: 1 };
        return ((priorityRank[b.priority] || 0) - (priorityRank[a.priority] || 0)) * dir;
      }
      case 'ai_status': {
        const statusRank: Record<string, number> = { draft_ready: 3, working: 2, queued: 1, none: 0 };
        return ((statusRank[b.ai_status] || 0) - (statusRank[a.ai_status] || 0)) * dir;
      }
      case 'created_at':
      default:
        return (new Date(b.created_at).getTime() - new Date(a.created_at).getTime()) * dir;
    }
  });

  return sorted;
}

/**
 * Fetch all tasks for a user (unfiltered by activeFilter) to compute counts
 */
async function fetchAllTasks(userId: string) {
  if (!userId) {
    return [];
  }

  try {
    const { data, error } = await supabase
      .from('tasks')
      .select(
        `id, title, description, status, priority, task_type, due_date, assigned_to, created_by,
        company_id, deal_id, contact_id, contact_email, contact_name, source, ai_status,
        deliverable_type, deliverable_data, risk_level, confidence_score, reasoning, trigger_event,
        expires_at, actioned_at, auto_group, parent_task_id, created_at, updated_at, completed_at, metadata,
        companies(id, name),
        contacts(id, first_name, last_name, email),
        deals(id, name, value)`
      )
      .eq('assigned_to', userId)
      .order('created_at', { ascending: false });

    if (error) {
      logger.error('[fetchAllTasks] Error:', error);
      throw error;
    }

    return data || [];
  } catch (err) {
    logger.error('[fetchAllTasks] Exception:', err);
    throw err;
  }
}

/**
 * Fetch filtered tasks for the Command Centre based on filter params
 */
async function fetchFilteredTasks(userId: string, filters: CommandCentreTaskFilters) {
  if (!userId) {
    return [];
  }

  try {
    let query = supabase
      .from('tasks')
      .select(
        `id, title, description, status, priority, task_type, due_date, assigned_to, created_by,
        company_id, deal_id, contact_id, contact_email, contact_name, source, ai_status,
        deliverable_type, deliverable_data, risk_level, confidence_score, reasoning, trigger_event,
        expires_at, actioned_at, auto_group, parent_task_id, created_at, updated_at, completed_at, metadata,
        companies(id, name),
        contacts(id, first_name, last_name, email),
        deals(id, name, value)`
      )
      .eq('assigned_to', userId);

    // Apply activeFilter mapping
    if (filters.activeFilter === 'review') {
      query = query.or('status.eq.pending_review,ai_status.eq.draft_ready');
    } else if (filters.activeFilter === 'drafts') {
      query = query.eq('ai_status', 'draft_ready');
    } else if (filters.activeFilter === 'working') {
      query = query.eq('ai_status', 'working');
    } else if (filters.activeFilter === 'done') {
      query = query.in('status', ['completed', 'approved']);
    }
    // 'all' - no additional filter

    // Apply other filters
    if (filters.status && filters.status.length > 0) {
      query = query.in('status', filters.status);
    }

    if (filters.task_type && filters.task_type.length > 0) {
      query = query.in('task_type', filters.task_type);
    }

    if (filters.source && filters.source.length > 0) {
      query = query.in('source', filters.source);
    }

    if (filters.priority && filters.priority.length > 0) {
      query = query.in('priority', filters.priority);
    }

    if (filters.ai_status && filters.ai_status.length > 0) {
      query = query.in('ai_status', filters.ai_status);
    }

    if (filters.company_id) {
      query = query.eq('company_id', filters.company_id);
    }

    if (filters.due_date_start) {
      query = query.gte('due_date', filters.due_date_start);
    }

    if (filters.due_date_end) {
      query = query.lte('due_date', filters.due_date_end);
    }

    if (filters.search) {
      query = query.ilike('title', `%${filters.search}%`);
    }

    // Always fetch by created_at desc from DB; client-side sort applied after
    query = query.order('created_at', { ascending: false });

    const { data, error } = await query;

    if (error) {
      logger.error('[fetchFilteredTasks] Error:', error);
      throw error;
    }

    return data || [];
  } catch (err) {
    logger.error('[fetchFilteredTasks] Exception:', err);
    throw err;
  }
}

/**
 * React Query hook for fetching unified tasks with AI fields for the Command Centre
 */
export function useCommandCentreTasks(filters: CommandCentreTaskFilters = {}) {
  const { userId } = useAuth();
  const queryClient = useQueryClient();

  const { sortField = 'urgency', sortOrder = 'desc', ...queryFilters } = filters;

  // Query for all tasks (unfiltered) to compute counts
  const allTasksQuery = useQuery({
    queryKey: ['command-centre-task-counts', userId],
    queryFn: () => fetchAllTasks(userId!),
    enabled: !!userId,
    staleTime: 30_000,
  });

  // Query for filtered tasks based on filter params (exclude sort from query key so sorting is client-side)
  const filteredTasksQuery = useQuery({
    queryKey: ['command-centre-tasks', userId, queryFilters],
    queryFn: () => fetchFilteredTasks(userId!, queryFilters),
    enabled: !!userId,
    staleTime: 30_000,
  });

  // Compute counts from all tasks
  const counts = useMemo(() => {
    const allTasks = allTasksQuery.data || [];
    return {
      all: allTasks.length,
      review: allTasks.filter(t => t.status === 'pending_review' || t.ai_status === 'draft_ready').length,
      drafts: allTasks.filter(t => t.ai_status === 'draft_ready').length,
      working: allTasks.filter(t => t.ai_status === 'working').length,
      done: allTasks.filter(t => t.status === 'completed' || t.status === 'approved').length,
    };
  }, [allTasksQuery.data]);

  // Apply client-side sort
  const sortedData = useMemo(() => {
    if (!filteredTasksQuery.data) return filteredTasksQuery.data;
    return sortTasks(filteredTasksQuery.data, sortField, sortOrder);
  }, [filteredTasksQuery.data, sortField, sortOrder]);

  // Set up realtime subscription to invalidate queries on task changes
  useEffect(() => {
    if (!userId) return;

    logger.log('[useCommandCentreTasks] Setting up realtime subscription for user:', userId);

    const channel = supabase
      .channel('command-centre-tasks-realtime')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'tasks',
          filter: `assigned_to=eq.${userId}`,
        },
        (payload) => {
          logger.log('[useCommandCentreTasks] Realtime event:', payload.eventType);
          // Invalidate both queries on any task change
          queryClient.invalidateQueries({ queryKey: ['command-centre-tasks', userId] });
          queryClient.invalidateQueries({ queryKey: ['command-centre-task-counts', userId] });
        }
      )
      .subscribe();

    return () => {
      logger.log('[useCommandCentreTasks] Cleaning up realtime subscription');
      supabase.removeChannel(channel);
    };
  }, [userId, queryClient]);

  return {
    ...filteredTasksQuery,
    data: sortedData,
    counts,
  };
}
