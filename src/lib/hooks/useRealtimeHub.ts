/**
 * Centralized Realtime Hub
 *
 * This hook consolidates all Supabase realtime subscriptions into a single
 * managed hub to reduce connection overhead by ~60-80%.
 *
 * BEFORE: 35+ individual channels, each polling realtime.list_changes
 * AFTER: 3-5 consolidated channels with proper filters
 *
 * WORKING HOURS AWARENESS (API Optimization):
 * - During working hours: Full subscriptions (high + medium priority)
 * - During off-hours/weekends: Notifications only (minimal mode)
 * - Reduces realtime connections by ~67% during off-hours
 *
 * Usage:
 * 1. Import useRealtimeHub in your component
 * 2. Subscribe to specific events using the returned subscribe function
 * 3. The hub automatically manages connection lifecycle
 */

import { useEffect, useRef, useCallback, useState } from 'react';
import { RealtimeChannel } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase/clientV2';
import { useAuth } from '@/lib/contexts/AuthContext';
import { useWorkingHours } from './useWorkingHours';

// Types for subscription management
type EventType = 'INSERT' | 'UPDATE' | 'DELETE' | '*';
type SubscriptionCallback = (payload: any) => void;

interface Subscription {
  id: string;
  table: string;
  event: EventType;
  filter?: string;
  callback: SubscriptionCallback;
}

interface RealtimeHubState {
  subscriptions: Map<string, Subscription>;
  channels: Map<string, RealtimeChannel>;
  isConnected: boolean;
}

// Tables grouped by update frequency and importance
const TABLE_GROUPS = {
  // HIGH priority - user's core data, needs immediate updates
  high: [
    'activities',
    'deals',
    'tasks',
    'notifications',
    'user_notifications',
  ],
  // MEDIUM priority - important but less frequent
  medium: [
    'meetings',
    'meeting_classifications',
    'deal_health_scores',
    'deal_health_alerts',
    'relationship_health_scores',
    'next_action_suggestions',
    'communication_events',
  ],
  // LOW priority - can use polling instead
  low: [
    'fathom_integrations',
    'fathom_sync_state',
    'fathom_org_integrations',
    'fathom_org_sync_state',
    'google_integrations',
    'branding_settings',
    'onboarding_progress',
    'roadmap_suggestions',
  ],
  // GLOBAL - no user filter needed (public data)
  global: [
    'meetings_waitlist', // Leaderboard - but should throttle
  ],
};

// Singleton to track active hub instance
let hubInstance: RealtimeHubState | null = null;
let hubRefCount = 0;

// Channel mode types for working hours awareness
type ChannelMode = 'full' | 'minimal';

/**
 * Main hook for centralized realtime subscriptions
 *
 * Working Hours Awareness:
 * - During working hours (8 AM - 6 PM local, weekdays): Full subscriptions
 * - During off-hours or weekends: Notifications only (minimal mode)
 */
export function useRealtimeHub() {
  const { user } = useAuth();
  const { isWorkingHours, isWeekend } = useWorkingHours();
  const subscriptionsRef = useRef<Map<string, Subscription>>(new Map());
  const channelsRef = useRef<Map<string, RealtimeChannel>>(new Map());
  const isSetupRef = useRef(false);
  const currentModeRef = useRef<ChannelMode | null>(null);
  const [channelMode, setChannelMode] = useState<ChannelMode>('minimal');

  // Determine the appropriate channel mode
  const targetMode: ChannelMode = (isWorkingHours && !isWeekend) ? 'full' : 'minimal';

  // Initialize and manage channels based on working hours
  useEffect(() => {
    if (!user?.id) return;

    hubRefCount++;

    // Set up channels for the first time or when mode changes
    const needsSetup = !isSetupRef.current || currentModeRef.current !== targetMode;

    if (needsSetup) {
      // Clean up existing channels before setting up new ones
      if (isSetupRef.current) {
        cleanupChannels();
      }

      isSetupRef.current = true;
      currentModeRef.current = targetMode;
      setChannelMode(targetMode);

      // Set up channels based on current mode
      if (targetMode === 'full') {
        setupFullChannels(user.id);
      } else {
        setupMinimalChannels(user.id);
      }
    }

    return () => {
      hubRefCount--;
      if (hubRefCount === 0) {
        // Last consumer - clean up all channels
        cleanupChannels();
        isSetupRef.current = false;
        currentModeRef.current = null;
      }
    };
  }, [user?.id, targetMode]);

  /**
   * Set up full channels for working hours (high + medium priority)
   */
  const setupFullChannels = useCallback((userId: string) => {
    // Channel 1: High priority user data (always needed during work)
    const highPriorityChannel = supabase
      .channel(`user-high-priority-${userId}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'activities',
        filter: `user_id=eq.${userId}`,
      }, (payload) => notifySubscribers('activities', payload))
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'deals',
        filter: `user_id=eq.${userId}`,
      }, (payload) => notifySubscribers('deals', payload))
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'tasks',
        filter: `user_id=eq.${userId}`,
      }, (payload) => notifySubscribers('tasks', payload))
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'user_notifications',
        filter: `user_id=eq.${userId}`,
      }, (payload) => notifySubscribers('user_notifications', payload))
      .subscribe();

    channelsRef.current.set('high-priority', highPriorityChannel);

    // Channel 2: Medium priority - health scores and suggestions
    const mediumPriorityChannel = supabase
      .channel(`user-medium-priority-${userId}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'deal_health_scores',
        filter: `user_id=eq.${userId}`,
      }, (payload) => notifySubscribers('deal_health_scores', payload))
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'deal_health_alerts',
        filter: `user_id=eq.${userId}`,
      }, (payload) => notifySubscribers('deal_health_alerts', payload))
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'relationship_health_scores',
        filter: `user_id=eq.${userId}`,
      }, (payload) => notifySubscribers('relationship_health_scores', payload))
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'next_action_suggestions',
        filter: `user_id=eq.${userId}`,
      }, (payload) => notifySubscribers('next_action_suggestions', payload))
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'meetings',
        filter: `owner_user_id=eq.${userId}`,
      }, (payload) => notifySubscribers('meetings', payload))
      .subscribe();

    channelsRef.current.set('medium-priority', mediumPriorityChannel);

    // Note: LOW priority tables should use polling instead of realtime
    // See usePollingFallback hook below
  }, []);

  /**
   * Set up minimal channels for off-hours (notifications only)
   * This reduces realtime connections by ~67% during off-hours
   */
  const setupMinimalChannels = useCallback((userId: string) => {
    // Only subscribe to notifications during off-hours
    // This ensures users still get urgent alerts even when not actively working
    const notificationsChannel = supabase
      .channel(`user-notifications-only-${userId}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'user_notifications',
        filter: `user_id=eq.${userId}`,
      }, (payload) => notifySubscribers('user_notifications', payload))
      // Also listen for critical deal alerts that might need attention
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'deal_health_alerts',
        filter: `user_id=eq.${userId}`,
      }, (payload) => notifySubscribers('deal_health_alerts', payload))
      .subscribe();

    channelsRef.current.set('notifications-only', notificationsChannel);
  }, []);

  const cleanupChannels = useCallback(() => {
    channelsRef.current.forEach((channel) => {
      supabase.removeChannel(channel);
    });
    channelsRef.current.clear();
    subscriptionsRef.current.clear();
  }, []);

  const notifySubscribers = useCallback((table: string, payload: any) => {
    subscriptionsRef.current.forEach((sub) => {
      if (sub.table === table) {
        // Check event type match
        if (sub.event === '*' || sub.event === payload.eventType) {
          sub.callback(payload);
        }
      }
    });
  }, []);

  /**
   * Subscribe to table changes
   * Returns unsubscribe function
   */
  const subscribe = useCallback((
    table: string,
    callback: SubscriptionCallback,
    options?: { event?: EventType; filter?: string }
  ): (() => void) => {
    const id = `${table}-${Date.now()}-${Math.random()}`;
    const subscription: Subscription = {
      id,
      table,
      event: options?.event || '*',
      filter: options?.filter,
      callback,
    };

    subscriptionsRef.current.set(id, subscription);

    // Return unsubscribe function
    return () => {
      subscriptionsRef.current.delete(id);
    };
  }, []);

  return {
    subscribe,
    isConnected: channelsRef.current.size > 0,
    /** Current channel mode: 'full' during working hours, 'minimal' during off-hours */
    channelMode,
    /** Whether full subscriptions are active */
    isFullMode: channelMode === 'full',
    /** Whether minimal subscriptions are active (notifications only) */
    isMinimalMode: channelMode === 'minimal',
  };
}

/**
 * Hook for tables that should use polling instead of realtime
 * Use this for low-priority data that changes infrequently
 */
export function usePollingFallback(
  table: string,
  fetchFn: () => Promise<void>,
  intervalMs: number = 30000 // Default 30 seconds
) {
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    // Initial fetch
    fetchFn();

    // Set up polling
    intervalRef.current = setInterval(fetchFn, intervalMs);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [fetchFn, intervalMs]);
}

/**
 * Hook specifically for waitlist/leaderboard data
 * Uses throttled polling instead of realtime to reduce load
 */
export function useWaitlistRealtime(
  callback: () => void,
  throttleMs: number = 5000 // Throttle to max once per 5 seconds
) {
  const lastCallRef = useRef<number>(0);
  const pendingCallRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    const throttledCallback = () => {
      const now = Date.now();
      const timeSinceLastCall = now - lastCallRef.current;

      if (timeSinceLastCall >= throttleMs) {
        // Enough time has passed, call immediately
        lastCallRef.current = now;
        callback();
      } else if (!pendingCallRef.current) {
        // Schedule a call for later
        pendingCallRef.current = setTimeout(() => {
          lastCallRef.current = Date.now();
          callback();
          pendingCallRef.current = null;
        }, throttleMs - timeSinceLastCall);
      }
      // If there's already a pending call, ignore this event
    };

    // Subscribe to waitlist changes with throttling
    // Listen for both INSERT (new signups) and UPDATE (boost claims, referrals)
    const channel = supabase
      .channel('waitlist-throttled')
      .on(
        'postgres_changes',
        {
          event: 'INSERT', // New signups
          schema: 'public',
          table: 'meetings_waitlist',
        },
        throttledCallback
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE', // Boost claims, referrals, points changes
          schema: 'public',
          table: 'meetings_waitlist',
        },
        throttledCallback
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
      if (pendingCallRef.current) {
        clearTimeout(pendingCallRef.current);
      }
    };
  }, [callback, throttleMs]);
}

/**
 * Simple hook to subscribe to a specific table through the hub
 * Convenience wrapper around useRealtimeHub
 */
export function useTableSubscription(
  table: string,
  callback: SubscriptionCallback,
  options?: { event?: EventType; enabled?: boolean }
) {
  const { subscribe } = useRealtimeHub();
  const callbackRef = useRef(callback);
  callbackRef.current = callback;

  useEffect(() => {
    if (options?.enabled === false) return;

    const stableCallback = (payload: any) => callbackRef.current(payload);
    const unsubscribe = subscribe(table, stableCallback, { event: options?.event });

    return unsubscribe;
  }, [table, subscribe, options?.event, options?.enabled]);
}
