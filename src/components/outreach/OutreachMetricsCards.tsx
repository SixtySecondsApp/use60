import React from 'react';
import { Send, Eye, MousePointerClick, MessageSquare, AlertTriangle, Layers } from 'lucide-react';
import type { OutreachMetrics } from '@/lib/types/outreachAnalytics';

interface Props {
  metrics: OutreachMetrics;
}

interface CardProps {
  label: string;
  value: string | number;
  sub?: string;
  icon: React.ElementType;
  color: string;
  bgColor: string;
}

function MetricCard({ label, value, sub, icon: Icon, color, bgColor }: CardProps) {
  return (
    <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900/50 p-4">
      <div className="flex items-start justify-between">
        <div className="min-w-0">
          <p className="text-xs text-gray-500 dark:text-gray-500 mb-1">{label}</p>
          <p className="text-2xl font-bold text-gray-900 dark:text-white">{value}</p>
          {sub && <p className="text-xs text-gray-500 dark:text-gray-500 mt-0.5">{sub}</p>}
        </div>
        <div className={`rounded-lg p-2 ${bgColor}`}>
          <Icon className={`h-5 w-5 ${color}`} />
        </div>
      </div>
    </div>
  );
}

export function OutreachMetricsCards({ metrics }: Props) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
      <MetricCard
        label="Emails Sent"
        value={metrics.totalSent.toLocaleString()}
        sub={`${metrics.campaignCount} campaign${metrics.campaignCount !== 1 ? 's' : ''}`}
        icon={Send}
        color="text-violet-400"
        bgColor="bg-violet-400/10"
      />
      <MetricCard
        label="Opened"
        value={metrics.totalOpened.toLocaleString()}
        sub={`${metrics.openRate}% open rate`}
        icon={Eye}
        color="text-amber-400"
        bgColor="bg-amber-400/10"
      />
      <MetricCard
        label="Clicked"
        value={metrics.totalClicked.toLocaleString()}
        sub={`${metrics.clickRate}% click rate`}
        icon={MousePointerClick}
        color="text-blue-400"
        bgColor="bg-blue-400/10"
      />
      <MetricCard
        label="Replied"
        value={metrics.totalReplied.toLocaleString()}
        sub={`${metrics.replyRate}% reply rate`}
        icon={MessageSquare}
        color="text-emerald-400"
        bgColor="bg-emerald-400/10"
      />
      <MetricCard
        label="Bounced"
        value={metrics.totalBounced.toLocaleString()}
        sub={`${metrics.bounceRate}% bounce rate`}
        icon={AlertTriangle}
        color="text-red-400"
        bgColor="bg-red-400/10"
      />
      <MetricCard
        label="Campaigns"
        value={metrics.campaignCount}
        icon={Layers}
        color="text-indigo-400"
        bgColor="bg-indigo-400/10"
      />
    </div>
  );
}
