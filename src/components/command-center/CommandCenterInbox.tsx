import { useEffect, useState, useCallback } from 'react';
import { Inbox } from 'lucide-react';
import { supabase } from '@/lib/supabase/clientV2';
import { useAuth } from '@/lib/contexts/AuthContext';
import { useActiveOrgId } from '@/lib/stores/orgStore';
import { useCommandCentreStore } from '@/lib/stores/commandCentreStore';
import { realtimeMonitor } from '@/lib/utils/realtimeMonitor';
import { Skeleton } from '@/components/ui/skeleton';
import { CCItemCard } from './CCItemCard';
import { PromotionNudgeBanner } from './PromotionNudgeBanner';
import type { CommandCentreItem, CCItemStatus } from './CCItemCard';

const CHANNEL_NAME = 'cc-inbox-realtime';

export function CommandCenterInbox() {
  const { userId } = useAuth();
  const orgId = useActiveOrgId();
  const setInboxPendingCount = useCommandCentreStore((s) => s.setInboxPendingCount);

  const [items, setItems] = useState<CommandCentreItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // ── Fetch items ──────────────────────────────────────────────────

  const fetchItems = useCallback(async () => {
    if (!userId || !orgId) return;

    try {
      const { data, error: fetchError } = await supabase
        .from('command_centre_items')
        .select(
          'id, org_id, user_id, source_agent, source_event_id, item_type, title, summary, context, priority_score, urgency, due_date, enrichment_status, drafted_action, confidence_score, status, resolution_channel, deal_id, contact_id, created_at, updated_at, resolved_at'
        )
        .eq('user_id', userId)
        .eq('org_id', orgId)
        .in('status', ['open', 'ready'])
        .order('priority_score', { ascending: false })
        .order('created_at', { ascending: false });

      if (fetchError) {
        setError(fetchError.message);
        return;
      }

      const sorted = sortItems(data ?? []);
      setItems(sorted);
      setInboxPendingCount(sorted.length);
      setError(null);
    } catch {
      setError('Failed to load inbox');
    } finally {
      setLoading(false);
    }
  }, [userId, orgId, setInboxPendingCount]);

  // Initial fetch
  useEffect(() => {
    setLoading(true);
    fetchItems();
  }, [fetchItems]);

  // ── Realtime subscription ────────────────────────────────────────

  useEffect(() => {
    if (!userId || !orgId) return;

    const channelName = `${CHANNEL_NAME}:${orgId}:${userId}`;
    const channel = supabase
      .channel(channelName)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'command_centre_items',
          filter: `user_id=eq.${userId}`,
        },
        (payload) => {
          const newItem = payload.new as CommandCentreItem;
          if (newItem.org_id !== orgId) return;
          if (newItem.status !== 'open' && newItem.status !== 'ready') return;

          setItems((prev) => {
            const updated = [newItem, ...prev.filter((i) => i.id !== newItem.id)];
            const sorted = sortItems(updated);
            setInboxPendingCount(sorted.length);
            return sorted;
          });
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'command_centre_items',
          filter: `user_id=eq.${userId}`,
        },
        (payload) => {
          const updated = payload.new as CommandCentreItem;
          if (updated.org_id !== orgId) return;

          setItems((prev) => {
            // Remove if no longer open/ready
            if (updated.status !== 'open' && updated.status !== 'ready') {
              const filtered = prev.filter((i) => i.id !== updated.id);
              setInboxPendingCount(filtered.length);
              return filtered;
            }
            // Upsert + re-sort
            const merged = prev.map((i) => (i.id === updated.id ? updated : i));
            // If it wasn't in the list, add it
            if (!prev.some((i) => i.id === updated.id)) {
              merged.push(updated);
            }
            const sorted = sortItems(merged);
            setInboxPendingCount(sorted.length);
            return sorted;
          });
        }
      )
      .subscribe();

    realtimeMonitor.track(channelName, 'command_centre_items', 'CommandCenterInbox');

    return () => {
      realtimeMonitor.untrack(channelName);
      supabase.removeChannel(channel);
    };
  }, [userId, orgId, setInboxPendingCount]);

  // ── Handle local status change (optimistic) ─────────────────────

  const handleStatusChange = useCallback(
    (id: string, newStatus: CCItemStatus) => {
      if (newStatus === 'approved' || newStatus === 'dismissed') {
        setItems((prev) => {
          const filtered = prev.filter((i) => i.id !== id);
          setInboxPendingCount(filtered.length);
          return filtered;
        });
      }
    },
    [setInboxPendingCount]
  );

  // ── Render ───────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="space-y-3 p-1">
        {[1, 2, 3].map((i) => (
          <div key={i} className="rounded-xl border border-gray-800/60 p-4 space-y-2">
            <div className="flex items-center gap-3">
              <Skeleton className="w-5 h-5 rounded" />
              <Skeleton className="h-4 w-2/3" />
            </div>
            <Skeleton className="h-3 w-full" />
            <Skeleton className="h-3 w-1/2" />
          </div>
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center px-4">
        <p className="text-sm text-red-400">{error}</p>
        <button
          type="button"
          onClick={() => {
            setLoading(true);
            fetchItems();
          }}
          className="mt-3 text-xs text-violet-400 hover:text-violet-300 underline"
        >
          Retry
        </button>
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center px-4">
        <div className="w-12 h-12 rounded-2xl bg-gray-800/60 flex items-center justify-center mb-4">
          <Inbox className="w-6 h-6 text-gray-500" />
        </div>
        <p className="text-sm font-medium text-gray-300">All clear</p>
        <p className="text-xs text-gray-500 mt-1 max-w-[240px] leading-relaxed">
          Your AI is watching — items will appear as events happen
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-2 p-1">
      {/* US-025: Promotion nudge banner */}
      <PromotionNudgeBanner />

      {items.map((item) => (
        <CCItemCard
          key={item.id}
          item={item}
          onStatusChange={handleStatusChange}
        />
      ))}
    </div>
  );
}

// ── Helpers ────────────────────────────────────────────────────────

const URGENCY_ORDER: Record<string, number> = {
  critical: 0,
  high: 1,
  normal: 2,
  low: 3,
};

function sortItems(items: CommandCentreItem[]): CommandCentreItem[] {
  return [...items].sort((a, b) => {
    // Primary: priority_score DESC
    if (b.priority_score !== a.priority_score) return b.priority_score - a.priority_score;
    // Secondary: urgency (critical > high > normal > low)
    const ua = URGENCY_ORDER[a.urgency] ?? 2;
    const ub = URGENCY_ORDER[b.urgency] ?? 2;
    if (ua !== ub) return ua - ub;
    // Tertiary: created_at DESC
    return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
  });
}
