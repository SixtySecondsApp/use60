/**
 * ActionCentreNavBadge Component
 *
 * AC-004: Badge showing pending count in navigation.
 *
 * Features:
 * - Real-time updates via React Query
 * - Zero state hides badge
 * - Pulse animation for new items
 *
 * @see docs/project-requirements/PRD_ACTION_CENTRE.md
 */

import { useQuery } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';
import { supabase } from '@/lib/supabase/clientV2';
import { useAuth } from '@/lib/contexts/AuthContext';

// ============================================================================
// Component
// ============================================================================

interface ActionCentreNavBadgeProps {
  className?: string;
}

export function ActionCentreNavBadge({ className }: ActionCentreNavBadgeProps) {
  const { user } = useAuth();
  const userId = user?.id;

  const { data: count } = useQuery({
    queryKey: ['action-centre-pending-count', userId],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_action_centre_pending_count', {
        p_user_id: userId,
      });

      if (error) {
        console.error('Error fetching pending count:', error);
        return 0;
      }

      return data as number;
    },
    enabled: !!userId,
    refetchInterval: 30000, // Refetch every 30 seconds
    staleTime: 10000, // Consider stale after 10 seconds
  });

  // Don't render if no pending items
  if (!count || count === 0) {
    return null;
  }

  return (
    <AnimatePresence>
      <motion.span
        initial={{ scale: 0, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0, opacity: 0 }}
        className={cn(
          'inline-flex items-center justify-center',
          'min-w-[18px] h-[18px] px-1.5',
          'text-[10px] font-bold text-white',
          'bg-blue-500 rounded-full',
          'shadow-sm',
          className
        )}
      >
        {count > 99 ? '99+' : count}
      </motion.span>
    </AnimatePresence>
  );
}

// ============================================================================
// Hook for programmatic access
// ============================================================================

export function useActionCentrePendingCount() {
  const { user } = useAuth();
  const userId = user?.id;

  const { data: count, isLoading, refetch } = useQuery({
    queryKey: ['action-centre-pending-count', userId],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_action_centre_pending_count', {
        p_user_id: userId,
      });

      if (error) {
        console.error('Error fetching pending count:', error);
        return 0;
      }

      return data as number;
    },
    enabled: !!userId,
    refetchInterval: 30000,
    staleTime: 10000,
  });

  return {
    count: count ?? 0,
    isLoading,
    refetch,
  };
}
