/**
 * Action Centre Page
 *
 * AC-002: Personal inbox for AI-generated suggestions awaiting HITL approval.
 *
 * Features:
 * - Two-panel master-detail layout
 * - Dark glassmorphic aesthetic with gradient accents
 * - Real-time updates via Supabase
 * - Type-specific action previews
 *
 * @see docs/project-requirements/PRD_ACTION_CENTRE.md
 */

import { useState, useEffect, useRef, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { motion, AnimatePresence } from 'framer-motion';
import { Search, RefreshCw, Zap, BellOff } from 'lucide-react';
import { cn } from '@/lib/utils';
import { supabase } from '@/lib/supabase/clientV2';
import { useOrg } from '@/lib/contexts/OrgContext';
import { useAuth } from '@/lib/contexts/AuthContext';
import { toast } from 'sonner';

// Components
import { ActionListItem } from '@/components/action-centre/ActionListItem';
import { DetailPanel } from '@/components/action-centre/DetailPanel';
import { RecentActivityList } from '@/components/action-centre/RecentActivityList';
import { toDisplayAction, getDateThreshold } from '@/components/action-centre/utils';
import type { ActionCentreItem, DisplayAction, TabValue, ActionTypeFilter, DateFilter } from '@/components/action-centre/types';

// Re-export types for backward compatibility
export type { ActionCentreItem };

export default function ActionCentre() {
  const { activeOrg } = useOrg();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const organizationId = activeOrg?.id;
  const userId = user?.id;

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<TabValue>('pending');
  const [searchQuery, setSearchQuery] = useState('');
  const [actionTypeFilter, setActionTypeFilter] = useState<ActionTypeFilter>('all');
  const [dateFilter, setDateFilter] = useState<DateFilter>('all');

  // Track realtime subscription
  const realtimeChannelRef = useRef<RealtimeChannel | null>(null);

  // Fetch pending items
  const {
    data: pendingItems,
    isLoading: pendingLoading,
    refetch: refetchPending,
  } = useQuery({
    queryKey: ['action-centre-pending', organizationId, userId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('action_centre_items')
        .select('*')
        .eq('user_id', userId)
        .eq('status', 'pending')
        .gt('expires_at', new Date().toISOString())
        .order('created_at', { ascending: false });

      if (error) throw error;
      return (data as ActionCentreItem[]).map(toDisplayAction);
    },
    enabled: !!organizationId && !!userId,
    refetchInterval: 30000, // Refetch every 30 seconds
  });

  // Fetch completed items (approved, dismissed, done)
  const {
    data: completedItems,
    isLoading: completedLoading,
    refetch: refetchCompleted,
  } = useQuery({
    queryKey: ['action-centre-completed', organizationId, userId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('action_centre_items')
        .select('*')
        .eq('user_id', userId)
        .in('status', ['approved', 'dismissed', 'done'])
        .order('actioned_at', { ascending: false })
        .limit(50);

      if (error) throw error;
      return (data as ActionCentreItem[]).map(toDisplayAction);
    },
    enabled: !!organizationId && !!userId && activeTab === 'completed',
  });

  // Subscribe to realtime updates for new Action Centre items
  useEffect(() => {
    if (!userId) return;

    const channel = supabase
      .channel(`action-centre-${userId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'action_centre_items',
          filter: `user_id=eq.${userId}`,
        },
        (payload) => {
          const newItem = payload.new as ActionCentreItem;
          if (newItem.status === 'pending') {
            toast.info(
              <div className="flex flex-col gap-1">
                <span className="font-medium">New Action Available</span>
                <span className="text-sm text-gray-500">{newItem.title}</span>
              </div>,
              {
                action: {
                  label: 'View',
                  onClick: () => {
                    setActiveTab('pending');
                    setSelectedId(newItem.id);
                    refetchPending();
                  },
                },
                duration: 5000,
              }
            );

            refetchPending();
            queryClient.invalidateQueries({ queryKey: ['action-centre-pending-count'] });
          }
        }
      )
      .subscribe();

    realtimeChannelRef.current = channel;

    return () => {
      if (realtimeChannelRef.current) {
        supabase.removeChannel(realtimeChannelRef.current);
      }
    };
  }, [userId, queryClient, refetchPending]);

  // Filter items based on search, type, and date
  const filterItems = (items: DisplayAction[] | undefined): DisplayAction[] => {
    if (!items) return [];

    const dateThreshold = getDateThreshold(dateFilter);

    return items.filter((item) => {
      // Type filter
      if (actionTypeFilter !== 'all' && item.action_type !== actionTypeFilter) {
        return false;
      }

      // Date filter
      if (dateThreshold) {
        const itemDate = new Date(item.created_at);
        if (itemDate < dateThreshold) {
          return false;
        }
      }

      // Search filter
      if (searchQuery) {
        const query = searchQuery.toLowerCase();
        return (
          item.title.toLowerCase().includes(query) ||
          (item.description?.toLowerCase().includes(query) ?? false)
        );
      }

      return true;
    });
  };

  const filteredPending = useMemo(() => filterItems(pendingItems), [pendingItems, searchQuery, actionTypeFilter, dateFilter]);
  const filteredCompleted = useMemo(() => filterItems(completedItems), [completedItems, searchQuery, actionTypeFilter, dateFilter]);

  // Get the selected action
  const selectedAction = useMemo(() => {
    if (!selectedId) return null;
    return filteredPending.find((a) => a.id === selectedId) || filteredCompleted.find((a) => a.id === selectedId) || null;
  }, [selectedId, filteredPending, filteredCompleted]);

  // Auto-select first item when list changes
  useEffect(() => {
    if (!selectedId && filteredPending.length > 0) {
      setSelectedId(filteredPending[0].id);
    }
  }, [filteredPending, selectedId]);

  // Approve mutation
  const approveMutation = useMutation({
    mutationFn: async ({ itemId, edits }: { itemId: string; edits?: Record<string, unknown> }) => {
      const { error } = await supabase
        .from('action_centre_items')
        .update({
          status: 'approved',
          actioned_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          ...(edits && { preview_data: edits }),
        })
        .eq('id', itemId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['action-centre-pending'] });
      queryClient.invalidateQueries({ queryKey: ['action-centre-completed'] });
      queryClient.invalidateQueries({ queryKey: ['action-centre-pending-count'] });
      toast.success('Action approved');

      // Select next item
      const currentIndex = filteredPending.findIndex((a) => a.id === selectedId);
      const remaining = filteredPending.filter((a) => a.id !== selectedId);
      if (remaining.length > 0) {
        const nextIndex = Math.min(currentIndex, remaining.length - 1);
        setSelectedId(remaining[nextIndex].id);
      } else {
        setSelectedId(null);
      }
    },
    onError: (error) => {
      toast.error('Failed to approve action');
      console.error('Approve error:', error);
    },
  });

  // Dismiss mutation
  const dismissMutation = useMutation({
    mutationFn: async (itemId: string) => {
      const { error } = await supabase
        .from('action_centre_items')
        .update({
          status: 'dismissed',
          actioned_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', itemId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['action-centre-pending'] });
      queryClient.invalidateQueries({ queryKey: ['action-centre-completed'] });
      queryClient.invalidateQueries({ queryKey: ['action-centre-pending-count'] });
      toast.success('Action dismissed');

      // Select next item
      const currentIndex = filteredPending.findIndex((a) => a.id === selectedId);
      const remaining = filteredPending.filter((a) => a.id !== selectedId);
      if (remaining.length > 0) {
        const nextIndex = Math.min(currentIndex, remaining.length - 1);
        setSelectedId(remaining[nextIndex].id);
      } else {
        setSelectedId(null);
      }
    },
    onError: (error) => {
      toast.error('Failed to dismiss action');
      console.error('Dismiss error:', error);
    },
  });

  const handleApprove = (itemId: string, edits?: Record<string, unknown>) => {
    approveMutation.mutate({ itemId, edits });
  };

  const handleDismiss = (itemId: string) => {
    dismissMutation.mutate(itemId);
  };

  const handleRefresh = () => {
    if (activeTab === 'pending') {
      refetchPending();
    } else if (activeTab === 'completed') {
      refetchCompleted();
    }
  };

  const pendingCount = filteredPending.length;
  const isLoading = approveMutation.isPending || dismissMutation.isPending;

  // Show activity tab content
  if (activeTab === 'activity') {
    return (
      <div className="h-[calc(100vh-64px)] bg-gray-950 text-gray-100 overflow-hidden">
        <BackgroundGradients />
        <div className="relative h-full flex">
          <LeftPanel
            activeTab={activeTab}
            setActiveTab={setActiveTab}
            pendingCount={pendingCount}
            searchQuery={searchQuery}
            setSearchQuery={setSearchQuery}
            onRefresh={handleRefresh}
          >
            <div className="p-4">
              <RecentActivityList />
            </div>
          </LeftPanel>
          <div className="flex-1 h-full bg-gray-900/20 backdrop-blur-sm flex items-center justify-center">
            <div className="text-center">
              <div className="p-4 rounded-2xl bg-gray-800 border border-gray-700/50 inline-block mb-4">
                <Zap className="w-8 h-8 text-purple-400" />
              </div>
              <h3 className="text-lg font-medium text-gray-400 mb-1">Activity Log</h3>
              <p className="text-sm text-gray-600">View your recent AI interactions on the left</p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const displayItems = activeTab === 'pending' ? filteredPending : filteredCompleted;
  const isListLoading = activeTab === 'pending' ? pendingLoading : completedLoading;

  return (
    <div className="h-[calc(100vh-64px)] bg-gray-950 text-gray-100 overflow-hidden">
      <BackgroundGradients />

      <div className="relative h-full flex">
        {/* Left Panel - List */}
        <LeftPanel
          activeTab={activeTab}
          setActiveTab={setActiveTab}
          pendingCount={pendingCount}
          searchQuery={searchQuery}
          setSearchQuery={setSearchQuery}
          onRefresh={handleRefresh}
        >
          {/* List */}
          <div className="flex-1 overflow-y-auto p-3 space-y-2">
            <AnimatePresence>
              {isListLoading ? (
                <LoadingSkeleton />
              ) : displayItems.length > 0 ? (
                displayItems.map((action) => (
                  <ActionListItem
                    key={action.id}
                    action={action}
                    isSelected={action.id === selectedId}
                    onClick={() => setSelectedId(action.id)}
                  />
                ))
              ) : (
                <EmptyListState activeTab={activeTab} />
              )}
            </AnimatePresence>
          </div>

          {/* Footer stats */}
          <div className="p-4 border-t border-gray-800/50 bg-gray-900/50">
            <div className="flex items-center justify-between text-xs text-gray-500">
              <span>{displayItems.length} {activeTab}</span>
              <button
                onClick={handleRefresh}
                className="flex items-center gap-1 text-gray-500 hover:text-gray-300 transition-colors"
              >
                <RefreshCw className="w-3 h-3" />
                Refresh
              </button>
            </div>
          </div>
        </LeftPanel>

        {/* Right Panel - Detail */}
        <div className="flex-1 h-full bg-gray-900/20 backdrop-blur-sm">
          <DetailPanel
            action={selectedAction}
            onApprove={handleApprove}
            onDismiss={handleDismiss}
            isLoading={isLoading}
          />
        </div>
      </div>
    </div>
  );
}

// Background gradients component
function BackgroundGradients() {
  return (
    <div className="fixed inset-0 overflow-hidden pointer-events-none">
      <div className="absolute -top-40 -right-40 w-96 h-96 bg-blue-500/10 rounded-full blur-3xl" />
      <div className="absolute -bottom-40 -left-40 w-96 h-96 bg-purple-500/10 rounded-full blur-3xl" />
      <div
        className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full h-full
                   bg-[radial-gradient(ellipse_at_center,rgba(59,130,246,0.05),transparent_70%)]"
      />
    </div>
  );
}

// Left panel component
interface LeftPanelProps {
  activeTab: TabValue;
  setActiveTab: (tab: TabValue) => void;
  pendingCount: number;
  searchQuery: string;
  setSearchQuery: (query: string) => void;
  onRefresh: () => void;
  children?: React.ReactNode;
}

function LeftPanel({
  activeTab,
  setActiveTab,
  pendingCount,
  searchQuery,
  setSearchQuery,
  onRefresh,
  children,
}: LeftPanelProps) {
  return (
    <div className="w-96 h-full flex flex-col border-r border-gray-800/50 bg-gray-900/30 backdrop-blur-xl">
      {/* Header */}
      <div className="p-6 border-b border-gray-800/50">
        <div className="flex items-center gap-3 mb-4">
          <div className="relative">
            <div className="p-2.5 rounded-xl bg-gray-800 border border-gray-700/50">
              <Zap className="w-5 h-5 text-blue-400" />
            </div>
            {pendingCount > 0 && (
              <span
                className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 rounded-full
                          flex items-center justify-center text-xs font-bold text-white
                          ring-2 ring-gray-900"
              >
                {pendingCount > 99 ? '99+' : pendingCount}
              </span>
            )}
          </div>
          <div className="flex-1">
            <h1 className="text-lg font-bold text-white">Action Centre</h1>
            <p className="text-xs text-gray-500">AI-suggested actions</p>
          </div>
          <button
            onClick={onRefresh}
            className="p-2 rounded-lg text-gray-500 hover:text-gray-300 hover:bg-gray-800/50 transition-colors"
            aria-label="Refresh actions"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
          <input
            type="text"
            placeholder="Search actions..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5
                      bg-gray-800/50 border border-gray-700/50
                      rounded-xl text-sm text-gray-200
                      placeholder-gray-500
                      focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500/50
                      transition-all"
          />
        </div>
      </div>

      {/* Tabs */}
      <div className="px-4 py-3 border-b border-gray-800/50">
        <div className="flex gap-1 p-1 bg-gray-800/50 rounded-lg">
          {[
            { id: 'pending' as const, label: 'Pending', count: pendingCount },
            { id: 'completed' as const, label: 'Done' },
            { id: 'activity' as const, label: 'Activity' },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={cn(
                'flex-1 px-3 py-1.5 rounded-md text-xs font-medium transition-all',
                'flex items-center justify-center gap-1.5',
                activeTab === tab.id
                  ? 'bg-gray-700 text-white shadow-sm'
                  : 'text-gray-500 hover:text-gray-300'
              )}
            >
              {tab.label}
              {tab.count !== undefined && tab.count > 0 && (
                <span
                  className={cn(
                    'px-1.5 py-0.5 rounded-full text-xs',
                    activeTab === tab.id ? 'bg-blue-500/20 text-blue-400' : 'bg-gray-700 text-gray-500'
                  )}
                >
                  {tab.count}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      {children}
    </div>
  );
}

// Loading skeleton component
function LoadingSkeleton() {
  return (
    <div className="space-y-2">
      {[1, 2, 3, 4].map((i) => (
        <div key={i} className="p-4 rounded-xl bg-gray-800/30 border border-gray-800/50 animate-pulse">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-xl bg-gray-700/50" />
            <div className="flex-1 space-y-2">
              <div className="flex gap-2">
                <div className="h-4 w-16 bg-gray-700/50 rounded" />
                <div className="h-4 w-8 bg-gray-700/50 rounded" />
              </div>
              <div className="h-4 w-3/4 bg-gray-700/50 rounded" />
              <div className="h-3 w-1/2 bg-gray-700/50 rounded" />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

// Empty list state component
function EmptyListState({ activeTab }: { activeTab: TabValue }) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="flex flex-col items-center justify-center py-12"
    >
      <div className="p-4 rounded-2xl bg-gray-800 border border-gray-700/50 mb-4">
        <BellOff className="w-6 h-6 text-emerald-400" />
      </div>
      <h3 className="text-sm font-medium text-gray-400 mb-1">
        {activeTab === 'pending' ? 'All caught up!' : 'No completed actions'}
      </h3>
      <p className="text-xs text-gray-600 text-center">
        {activeTab === 'pending'
          ? 'New suggestions will appear here'
          : 'Approved and dismissed actions will appear here'}
      </p>
    </motion.div>
  );
}
