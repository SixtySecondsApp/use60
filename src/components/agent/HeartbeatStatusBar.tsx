import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase/clientV2';
import { Activity } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';

interface HeartbeatData {
  lastRunAt: string | null;
  totalRuns24h: number;
  failures24h: number;
}

const formatRelativeTime = (dateString: string | null): string => {
  if (!dateString) return 'Never';

  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMinutes = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMinutes < 1) return 'Just now';
  if (diffMinutes < 60) return `${diffMinutes} min ago`;
  if (diffHours < 24) return `${diffHours} hour${diffHours === 1 ? '' : 's'} ago`;
  return `${diffDays} day${diffDays === 1 ? '' : 's'} ago`;
};

const HeartbeatStatusBar = () => {
  const { data, isLoading } = useQuery({
    queryKey: ['orchestrator-heartbeat'],
    queryFn: async (): Promise<HeartbeatData> => {
      // Calculate 24 hours ago timestamp
      const twentyFourHoursAgo = new Date();
      twentyFourHoursAgo.setHours(twentyFourHoursAgo.getHours() - 24);
      const twentyFourHoursAgoISO = twentyFourHoursAgo.toISOString();

      // Fetch last run timestamp (most recent job)
      const { data: lastRunData } = await supabase
        .from('sequence_jobs')
        .select('created_at')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      // Fetch 24h stats (all jobs in the last 24 hours)
      const { data: stats24h } = await supabase
        .from('sequence_jobs')
        .select('id, status')
        .gte('created_at', twentyFourHoursAgoISO);

      const totalRuns24h = stats24h?.length || 0;
      const failures24h = stats24h?.filter(job => job.status === 'failed').length || 0;

      return {
        lastRunAt: lastRunData?.created_at || null,
        totalRuns24h,
        failures24h,
      };
    },
    refetchInterval: 30000, // Auto-refresh every 30 seconds
  });

  if (isLoading) {
    return (
      <Card>
        <CardContent className="p-4">
          <div className="flex items-center justify-between gap-6">
            <div className="flex items-center gap-2">
              <div className="h-2.5 w-2.5 rounded-full bg-gray-300 dark:bg-gray-600" />
              <span className="text-xs text-gray-500 dark:text-gray-400">Loading...</span>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center justify-between gap-6">
          {/* Heartbeat indicator */}
          <div className="flex items-center gap-2">
            <div className="relative">
              <div className="h-2.5 w-2.5 rounded-full bg-green-500 animate-pulse" />
              <div className="absolute inset-0 h-2.5 w-2.5 rounded-full bg-green-500 opacity-50 blur-sm" />
            </div>
            <span className="text-xs text-gray-500 dark:text-gray-400">Orchestrator Active</span>
          </div>

          {/* Last run */}
          <div className="flex items-center gap-2">
            <Activity className="h-3.5 w-3.5 text-gray-400" />
            <div className="flex flex-col">
              <span className="text-xs text-gray-500 dark:text-gray-400">Last run</span>
              <span className="text-sm font-medium text-gray-900 dark:text-gray-100">
                {formatRelativeTime(data?.lastRunAt || null)}
              </span>
            </div>
          </div>

          {/* 24h total runs */}
          <div className="flex flex-col">
            <span className="text-xs text-gray-500 dark:text-gray-400">24h runs</span>
            <span className="text-sm font-medium text-gray-900 dark:text-gray-100">
              {data?.totalRuns24h || 0}
            </span>
          </div>

          {/* 24h failures */}
          <div className="flex flex-col">
            <span className="text-xs text-gray-500 dark:text-gray-400">24h failures</span>
            <span className={`text-sm font-medium ${
              (data?.failures24h || 0) > 0
                ? 'text-red-600 dark:text-red-400'
                : 'text-green-600 dark:text-green-400'
            }`}>
              {data?.failures24h || 0}
            </span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

export default HeartbeatStatusBar;
