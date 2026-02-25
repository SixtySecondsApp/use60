/**
 * useMeetingBaaSCalendar Hook
 *
 * Manages the connection between user's Google Calendar and MeetingBaaS.
 * This enables automatic bot deployment for calendar events.
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase/clientV2';
import { useAuth } from '@/lib/contexts/AuthContext';
import { toast } from 'sonner';

// =============================================================================
// Types
// =============================================================================

export interface MeetingBaaSCalendar {
  id: string;
  user_id: string;
  org_id: string | null;
  meetingbaas_calendar_id: string;
  raw_calendar_id: string;
  platform: 'google' | 'microsoft';
  email: string | null;
  name: string | null;
  is_active: boolean;
  last_sync_at: string | null;
  sync_error: string | null;
  created_at: string;
  updated_at: string;
}

interface ConnectCalendarResponse {
  success: boolean;
  message?: string;
  error?: string;
  calendar?: {
    id: string;
    platform: string;
    raw_calendar_id: string;
    email?: string;
  };
}

// =============================================================================
// Query Keys
// =============================================================================

const meetingBaaSKeys = {
  all: ['meetingbaas'] as const,
  calendars: (userId: string) => [...meetingBaaSKeys.all, 'calendars', userId] as const,
};

// =============================================================================
// Hook
// =============================================================================

export function useMeetingBaaSCalendar() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const userId = user?.id;

  // Fetch the user's MeetingBaaS calendar connections
  const {
    data: calendars,
    isLoading,
    error,
    refetch,
  } = useQuery<MeetingBaaSCalendar[]>({
    queryKey: meetingBaaSKeys.calendars(userId || ''),
    queryFn: async () => {
      if (!userId) return [];

      const { data, error } = await supabase
        .from('meetingbaas_calendars')
        .select('*')
        .eq('user_id', userId)
        .eq('is_active', true)
        .order('created_at', { ascending: false });

      if (error) {
        // Table might not exist yet
        if (error.code === '42P01') {
          console.log('[useMeetingBaaSCalendar] meetingbaas_calendars table does not exist yet');
          return [];
        }
        console.error('[useMeetingBaaSCalendar] Error fetching calendars:', error);
        throw error;
      }

      return (data as MeetingBaaSCalendar[]) || [];
    },
    enabled: !!userId,
    staleTime: 30000, // 30 seconds
  });

  // Connect calendar to MeetingBaaS
  const connectMutation = useMutation({
    mutationFn: async (calendarId: string = 'primary'): Promise<ConnectCalendarResponse> => {
      if (!userId) throw new Error('Not authenticated');

      const { data: sessionData } = await supabase.auth.getSession();
      const accessToken = sessionData?.session?.access_token;

      if (!accessToken) {
        throw new Error('No access token available. Please log in again.');
      }

      // Get the Supabase project URL for the edge function
      const supabaseUrl = (import.meta.env.VITE_SUPABASE_URL || import.meta.env.SUPABASE_URL);
      const functionUrl = `${supabaseUrl}/functions/v1/meetingbaas-connect-calendar`;

      console.log('[useMeetingBaaSCalendar] Connecting calendar:', {
        calendarId,
        userId,
        hasAccessToken: !!accessToken,
        tokenLength: accessToken?.length,
        functionUrl,
      });

      // Use direct fetch to have complete control over the request
      const response = await fetch(functionUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          user_id: userId,
          calendar_id: calendarId,
        }),
      });

      const result = await response.json();

      console.log('[useMeetingBaaSCalendar] Edge function response:', {
        status: response.status,
        ok: response.ok,
        resultSuccess: result?.success,
      });

      if (!response.ok) {
        console.error('[useMeetingBaaSCalendar] Edge function error:', result);

        let errorMessage = result?.error || result?.message || 'Failed to connect calendar';

        // Check if this is a refresh token missing error
        if (errorMessage.includes('refresh token')) {
          errorMessage = 'Please reconnect Google Calendar to enable offline access for automatic recording setup';
        }

        throw new Error(errorMessage);
      }

      if (!result || !result.success) {
        const errorMsg = result?.error || 'Failed to connect calendar';
        console.error('[useMeetingBaaSCalendar] Success=false:', errorMsg);
        throw new Error(errorMsg);
      }

      console.log('[useMeetingBaaSCalendar] Success:', result);
      return result as ConnectCalendarResponse;
    },
    onSuccess: (data) => {
      toast.success('Calendar connected to MeetingBaaS', {
        description: data.message || 'Your calendar events will now be monitored for automatic recording.',
      });
      console.log('[useMeetingBaaSCalendar] Invalidating queries for userId:', userId);
      // Invalidate and refetch to ensure UI updates
      queryClient.invalidateQueries({ queryKey: meetingBaaSKeys.calendars(userId || '') });
      // Also invalidate the base key to catch any related queries
      queryClient.invalidateQueries({ queryKey: meetingBaaSKeys.all });
      // Force refetch after a short delay to ensure DB has committed
      setTimeout(() => {
        queryClient.refetchQueries({ queryKey: meetingBaaSKeys.calendars(userId || '') });
      }, 500);
    },
    onError: (error) => {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';

      // Check if this is a refresh token error that needs recovery
      if (errorMessage.includes('refresh token')) {
        toast.error('Google Calendar reconnection needed', {
          description: 'Please reconnect your Google Calendar in the Integrations page to enable offline access for automatic recording setup.',
          duration: 6000,
        });
      } else {
        toast.error('Failed to connect calendar', {
          description: errorMessage,
        });
      }
    },
  });

  // Disconnect calendar from MeetingBaaS
  const disconnectMutation = useMutation({
    mutationFn: async (_calendarId: string) => {
      if (!userId) throw new Error('Not authenticated');

      const { data: sessionData } = await supabase.auth.getSession();
      const accessToken = sessionData?.session?.access_token;
      if (!accessToken) {
        throw new Error('No access token available. Please log in again.');
      }

      const supabaseUrl = (import.meta.env.VITE_SUPABASE_URL || import.meta.env.SUPABASE_URL);
      const functionUrl = `${supabaseUrl}/functions/v1/meetingbaas-disconnect-calendar`;

      const response = await fetch(functionUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${accessToken}`,
        },
        body: JSON.stringify({}),
      });

      const result = await response.json();

      if (!response.ok || !result?.success) {
        throw new Error(result?.error || 'Failed to disconnect calendar');
      }

      return result;
    },
    onSuccess: () => {
      toast.success('Calendar disconnected', {
        description: 'Bot scheduling has been stopped. You can reconnect at any time.',
      });
      queryClient.invalidateQueries({ queryKey: meetingBaaSKeys.calendars(userId || '') });
      queryClient.invalidateQueries({ queryKey: meetingBaaSKeys.all });
      queryClient.invalidateQueries({ queryKey: ['notetaker'] });
    },
    onError: (error) => {
      toast.error('Failed to disconnect calendar', {
        description: error instanceof Error ? error.message : 'Unknown error',
      });
    },
  });

  // Computed states
  const hasConnectedCalendar = (calendars?.length ?? 0) > 0;
  const primaryCalendar = calendars?.find((c) => c.raw_calendar_id === 'primary') || calendars?.[0];

  return {
    // Data
    calendars,
    primaryCalendar,
    hasConnectedCalendar,

    // Loading states
    isLoading,
    error,

    // Actions
    connect: connectMutation.mutateAsync,
    disconnect: disconnectMutation.mutateAsync,
    refetch,

    // Mutation states
    isConnecting: connectMutation.isPending,
    isDisconnecting: disconnectMutation.isPending,
  };
}
