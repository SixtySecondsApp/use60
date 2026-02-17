/**
 * useCopilotAlerts Hook
 * Story: PIPE-020 - In-app copilot proactive health messages
 *
 * Subscribes to deal_health_alerts via Realtime and manages alert state
 */

import { useEffect, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase/clientV2';
import { useAuth } from '@clerk/clerk-react';
import type { RealtimeChannel } from '@supabase/supabase-js';

// =============================================================================
// Types
// =============================================================================

export interface DealHealthAlert {
  id: string;
  deal_id: string;
  user_id: string;
  alert_type: 'health_drop' | 'ghost_risk' | 'no_activity' | 'stage_stall' | 'sentiment_decline' | 'close_date_risk';
  severity: 'info' | 'warning' | 'critical';
  title: string;
  message: string;
  suggested_actions: string[];
  action_priority: 'low' | 'medium' | 'high' | 'urgent';
  status: 'active' | 'acknowledged' | 'resolved' | 'dismissed';
  acknowledged_at: string | null;
  metadata: Record<string, any>;
  created_at: string;
  updated_at: string;
}

// =============================================================================
// Query Key
// =============================================================================

const QUERY_KEY = 'deal-health-alerts';

// =============================================================================
// Hook
// =============================================================================

export function useCopilotAlerts() {
  const { userId } = useAuth();
  const queryClient = useQueryClient();
  const [realtimeChannel, setRealtimeChannel] = useState<RealtimeChannel | null>(null);

  // Fetch existing unread alerts on mount
  const { data: alerts = [], isLoading } = useQuery({
    queryKey: [QUERY_KEY, userId],
    queryFn: async () => {
      if (!userId) return [];

      const { data, error } = await supabase
        .from('deal_health_alerts')
        .select('*')
        .eq('user_id', userId)
        .eq('status', 'active')
        .order('created_at', { ascending: false })
        .limit(20);

      if (error) throw error;
      return (data || []) as DealHealthAlert[];
    },
    enabled: !!userId,
  });

  // Subscribe to Realtime updates
  useEffect(() => {
    if (!userId) return;

    // Create Realtime subscription
    const channel = supabase
      .channel(`deal-health-alerts:${userId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'deal_health_alerts',
          filter: `user_id=eq.${userId}`,
        },
        (payload) => {
          console.log('[useCopilotAlerts] New alert received:', payload.new);
          // Add new alert to cache
          queryClient.setQueryData<DealHealthAlert[]>([QUERY_KEY, userId], (old = []) => {
            return [payload.new as DealHealthAlert, ...old];
          });
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'deal_health_alerts',
          filter: `user_id=eq.${userId}`,
        },
        (payload) => {
          console.log('[useCopilotAlerts] Alert updated:', payload.new);
          // Update alert in cache
          queryClient.setQueryData<DealHealthAlert[]>([QUERY_KEY, userId], (old = []) => {
            return old.map((alert) =>
              alert.id === (payload.new as DealHealthAlert).id ? (payload.new as DealHealthAlert) : alert
            );
          });
        }
      )
      .subscribe();

    setRealtimeChannel(channel);

    return () => {
      console.log('[useCopilotAlerts] Unsubscribing from Realtime');
      channel.unsubscribe();
    };
  }, [userId, queryClient]);

  // Mark alert as read/acknowledged
  const markAsRead = useMutation({
    mutationFn: async (alertId: string) => {
      const { error } = await supabase
        .from('deal_health_alerts')
        .update({
          status: 'acknowledged',
          acknowledged_at: new Date().toISOString(),
          acknowledged_by: userId,
        })
        .eq('id', alertId)
        .eq('user_id', userId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [QUERY_KEY, userId] });
    },
  });

  // Dismiss alert
  const dismissAlert = useMutation({
    mutationFn: async (alertId: string) => {
      const { error } = await supabase
        .from('deal_health_alerts')
        .update({
          status: 'dismissed',
          dismissed_at: new Date().toISOString(),
        })
        .eq('id', alertId)
        .eq('user_id', userId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [QUERY_KEY, userId] });
    },
  });

  // Resolve alert
  const resolveAlert = useMutation({
    mutationFn: async (alertId: string) => {
      const { error } = await supabase
        .from('deal_health_alerts')
        .update({
          status: 'resolved',
          resolved_at: new Date().toISOString(),
        })
        .eq('id', alertId)
        .eq('user_id', userId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [QUERY_KEY, userId] });
    },
  });

  // Calculate unread count
  const unreadCount = alerts.filter((alert) => alert.status === 'active').length;

  // Get recent alerts (last 5)
  const recentAlerts = alerts.slice(0, 5);

  return {
    alerts,
    recentAlerts,
    unreadCount,
    isLoading,
    markAsRead: markAsRead.mutate,
    dismissAlert: dismissAlert.mutate,
    resolveAlert: resolveAlert.mutate,
    isMarkingAsRead: markAsRead.isPending,
    isDismissing: dismissAlert.isPending,
    isResolving: resolveAlert.isPending,
  };
}
