/**
 * Organization Activity Feed Component
 * Displays recent organization-wide activity and notifications for admins/owners
 * Story: ORG-NOTIF-009
 */

import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useOrgContext } from '@/lib/contexts/OrgContext';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Bell, Users, DollarSign, Settings, AlertTriangle } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { cn } from '@/lib/utils';

interface Notification {
  id: string;
  title: string;
  message: string;
  type: 'info' | 'success' | 'warning' | 'error';
  category: 'team' | 'deal' | 'system' | 'digest';
  action_url: string | null;
  is_org_wide: boolean;
  created_at: string;
  read_at: string | null;
  metadata: Record<string, any>;
}

const iconMap = {
  team: Users,
  deal: DollarSign,
  system: Settings,
  digest: Bell,
};

const typeColorMap = {
  info: 'bg-blue-500/10 text-blue-500',
  success: 'bg-green-500/10 text-green-500',
  warning: 'bg-yellow-500/10 text-yellow-500',
  error: 'bg-red-500/10 text-red-500',
};

export function OrgActivityFeed() {
  const { activeOrgId, isAdmin } = useOrgContext();

  // Only show for admins/owners
  if (!isAdmin) {
    return null;
  }

  const { data: activities, isLoading } = useQuery({
    queryKey: ['org-activity-feed', activeOrgId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('notifications')
        .select('id, title, message, type, category, action_url, is_org_wide, created_at, read_at, metadata')
        .eq('org_id', activeOrgId)
        .eq('is_org_wide', true)
        .order('created_at', { ascending: false })
        .limit(20);

      if (error) throw error;
      return data as Notification[];
    },
    enabled: !!activeOrgId && isAdmin,
  });

  if (isLoading) {
    return (
      <Card className="p-6">
        <div className="flex items-center gap-2 mb-4">
          <Bell className="w-5 h-5" />
          <h3 className="text-lg font-semibold">Organization Activity</h3>
        </div>
        <div className="space-y-3">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="animate-pulse">
              <div className="h-4 bg-muted rounded w-3/4 mb-2" />
              <div className="h-3 bg-muted rounded w-1/2" />
            </div>
          ))}
        </div>
      </Card>
    );
  }

  if (!activities || activities.length === 0) {
    return (
      <Card className="p-6">
        <div className="flex items-center gap-2 mb-4">
          <Bell className="w-5 h-5" />
          <h3 className="text-lg font-semibold">Organization Activity</h3>
        </div>
        <p className="text-sm text-muted-foreground">
          No recent organization activity to display.
        </p>
      </Card>
    );
  }

  return (
    <Card className="p-6">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Bell className="w-5 h-5" />
          <h3 className="text-lg font-semibold">Organization Activity</h3>
          <Badge variant="secondary" className="ml-2">
            {activities.filter(a => !a.read_at).length} new
          </Badge>
        </div>
        <Button variant="ghost" size="sm">
          View All
        </Button>
      </div>

      <div className="space-y-3">
        {activities.map((activity) => {
          const Icon = iconMap[activity.category] || Bell;
          const isUnread = !activity.read_at;

          return (
            <div
              key={activity.id}
              className={cn(
                'flex gap-3 p-3 rounded-lg transition-colors hover:bg-muted/50 cursor-pointer',
                isUnread && 'bg-muted/30'
              )}
              onClick={() => {
                if (activity.action_url) {
                  window.location.href = activity.action_url;
                }
              }}
            >
              <div className={cn('p-2 rounded-full h-fit', typeColorMap[activity.type])}>
                <Icon className="w-4 h-4" />
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex items-start justify-between gap-2">
                  <p className="text-sm font-medium line-clamp-1">
                    {activity.title}
                  </p>
                  <span className="text-xs text-muted-foreground whitespace-nowrap">
                    {formatDistanceToNow(new Date(activity.created_at), { addSuffix: true })}
                  </span>
                </div>

                <p className="text-sm text-muted-foreground line-clamp-2 mt-1">
                  {activity.message}
                </p>

                {activity.type === 'warning' && (
                  <div className="flex items-center gap-1 mt-2 text-xs text-yellow-500">
                    <AlertTriangle className="w-3 h-3" />
                    <span>Requires attention</span>
                  </div>
                )}

                {isUnread && (
                  <div className="mt-2">
                    <div className="w-2 h-2 bg-blue-500 rounded-full" />
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
}
