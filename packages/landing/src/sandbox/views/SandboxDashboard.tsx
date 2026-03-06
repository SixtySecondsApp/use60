/**
 * SandboxDashboard
 *
 * Pixel-perfect replica of the real 60 Dashboard page.
 * 4 MetricCards with targets/trends/progress bars, tab bar, activity feed.
 */

import { motion } from 'framer-motion';
import {
  PoundSterling,
  Phone,
  Users,
  FileText,
  TrendingUp,
  TrendingDown,
  Mail,
  Video,
  CheckCircle2,
  ArrowRight,
} from 'lucide-react';
import { useSandboxData } from '../data/SandboxDataProvider';
import type { SandboxMetricCard, SandboxActivity, ActivityType } from '../data/sandboxTypes';
import { getLogoDevUrl } from '../data/sandboxTypes';

const METRIC_ICONS: Record<string, React.ElementType> = {
  revenue: PoundSterling,
  outbound: Phone,
  meetings: Users,
  proposals: FileText,
};

const METRIC_COLORS: Record<string, { bg: string; text: string; border: string; progress: string }> = {
  emerald: { bg: 'bg-emerald-500/10', text: 'text-emerald-400', border: 'border-emerald-500/20', progress: 'bg-emerald-500/80' },
  blue: { bg: 'bg-blue-500/10', text: 'text-blue-400', border: 'border-blue-500/20', progress: 'bg-blue-500/80' },
  violet: { bg: 'bg-violet-500/10', text: 'text-violet-400', border: 'border-violet-500/20', progress: 'bg-violet-500/80' },
  orange: { bg: 'bg-orange-500/10', text: 'text-orange-400', border: 'border-orange-500/20', progress: 'bg-orange-500/80' },
};

const ACTIVITY_ICONS: Record<ActivityType, React.ElementType> = {
  call: Phone,
  email: Mail,
  meeting: Video,
  task: CheckCircle2,
  note: FileText,
  deal_update: TrendingUp,
};

const ACTIVITY_COLORS: Record<ActivityType, string> = {
  call: 'bg-blue-500/10 text-blue-400',
  email: 'bg-violet-500/10 text-violet-400',
  meeting: 'bg-teal-500/10 text-teal-400',
  task: 'bg-amber-500/10 text-amber-400',
  note: 'bg-gray-500/10 text-gray-400',
  deal_update: 'bg-emerald-500/10 text-emerald-400',
};

function MetricCard({ metric, index }: { metric: SandboxMetricCard; index: number }) {
  const Icon = METRIC_ICONS[metric.icon] ?? PoundSterling;
  const colors = METRIC_COLORS[metric.color] ?? METRIC_COLORS.emerald;
  const progress = Math.min(100, (metric.value / metric.target) * 100);
  const isCurrency = metric.icon === 'revenue';

  const formatValue = (v: number) => {
    if (isCurrency) return `$${(v / 1000).toFixed(0)}K`;
    return v.toString();
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.08, duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
      className="rounded-3xl p-6 sm:p-7 border cursor-pointer shadow-none bg-gradient-to-br from-gray-900/80 to-gray-900/40 backdrop-blur-xl border-gray-800/50 hover:border-gray-700/50 transition-colors flex flex-col"
    >
      {/* Header: Icon + Title + Trends */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className={`p-2.5 rounded-xl ${colors.bg} border ${colors.border}`}>
            <Icon className={`w-5 h-5 ${colors.text}`} />
          </div>
          <div>
            <span className="text-sm font-medium text-white">{metric.title}</span>
            <p className="text-xs text-gray-500">vs target</p>
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          <TrendBadge value={metric.trend} label="" />
          {metric.totalTrend !== undefined && (
            <TrendBadge value={metric.totalTrend} label="" />
          )}
        </div>
      </div>

      {/* Value vs Target */}
      <div className="flex items-baseline gap-2 mb-3">
        <span className="text-2xl sm:text-3xl font-bold text-white tracking-tight">{formatValue(metric.value)}</span>
        <span className="text-sm text-gray-500">/ {formatValue(metric.target)}</span>
      </div>

      {/* Progress bar — h-2 sm:h-2.5 matching real Dashboard */}
      <div className="h-2 sm:h-2.5 bg-gray-900/80 rounded-full overflow-hidden">
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${progress}%` }}
          transition={{ delay: 0.3 + index * 0.1, duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
          className={`h-full rounded-full ${colors.progress}`}
        />
      </div>
    </motion.div>
  );
}

function TrendBadge({ value, label }: { value: number; label: string }) {
  const isPositive = value >= 0;
  return (
    <div
      className={`flex items-center gap-1 p-2 rounded-lg text-[11px] font-medium backdrop-blur-sm shadow-lg ${
        isPositive ? 'bg-emerald-500/10 text-emerald-400' : 'bg-red-500/10 text-red-400'
      }`}
    >
      {isPositive ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
      {Math.abs(value)}%{label ? ` ${label}` : ''}
    </div>
  );
}

function ActivityItem({ activity, index }: { activity: SandboxActivity; index: number }) {
  const Icon = ACTIVITY_ICONS[activity.type];
  const colorClass = ACTIVITY_COLORS[activity.type];
  const timeAgo = getTimeAgo(activity.created_at);

  return (
    <motion.div
      initial={{ opacity: 0, x: -8 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: 0.3 + index * 0.05, duration: 0.3 }}
      className="flex items-start gap-3 py-3 border-b border-gray-800/30 last:border-0"
    >
      <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${colorClass}`}>
        <Icon className="w-3.5 h-3.5" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm text-gray-200 truncate">{activity.subject}</p>
        {activity.company_name && (
          <p className="text-xs text-gray-500 mt-0.5">
            {activity.contact_name && `${activity.contact_name} · `}
            {activity.company_name}
          </p>
        )}
      </div>
      <span className="text-[11px] text-gray-600 flex-shrink-0 mt-0.5">{timeAgo}</span>
    </motion.div>
  );
}

export default function SandboxDashboard() {
  const { data, visitorName, isPersonalized } = useSandboxData();
  const firstName = visitorName?.split(' ')[0];
  const companyName = data.visitorCompany?.name;

  return (
    <div className="space-y-6">
      {/* Personalized welcome banner */}
      {isPersonalized && companyName && (
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
          className="rounded-2xl p-5 bg-gradient-to-r from-[#37bd7e]/10 via-[#37bd7e]/5 to-transparent border border-[#37bd7e]/20"
        >
          <div className="flex items-center gap-4">
            {data.visitorCompany?.domain && (
              <img
                src={getLogoDevUrl(data.visitorCompany.domain, 64)}
                alt=""
                className="w-10 h-10 rounded-xl object-contain bg-white/[0.06] p-1"
                onError={(e) => { e.currentTarget.style.display = 'none'; }}
              />
            )}
            <div>
              <h2 className="text-sm font-semibold text-white">
                Here is what 60 would do for {companyName}
              </h2>
              <p className="text-xs text-gray-400 mt-0.5">
                Personalized pipeline, meeting prep, and follow-ups — all powered by AI
              </p>
            </div>
          </div>
        </motion.div>
      )}

      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold text-white">
          Welcome back{firstName ? `, ${firstName}` : ''}
        </h1>
        <p className="text-sm text-gray-500 mt-1">{"Here's what's happening with your pipeline today."}</p>
      </div>

      {/* Tab bar */}
      <div className="flex items-center gap-1 p-1 rounded-xl bg-gray-900/50 backdrop-blur-xl border border-gray-800/50 w-fit">
        {['Overview', 'AI Agent', 'Activity'].map((tab, i) => (
          <button
            key={tab}
            className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              i === 0
                ? 'bg-white/[0.08] text-white'
                : 'text-gray-500 hover:text-gray-300'
            }`}
          >
            {tab}
          </button>
        ))}
      </div>

      {/* 4 Metric Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6">
        {data.kpis.metrics.map((metric, i) => (
          <MetricCard key={metric.title} metric={metric} index={i} />
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Activity Feed */}
        <div className="lg:col-span-2 rounded-3xl p-5 border bg-gradient-to-br from-gray-900/80 to-gray-900/40 backdrop-blur-xl border-gray-800/50">
          <h3 className="text-sm font-semibold text-gray-200 mb-3">Recent Activity</h3>
          <div className="space-y-0">
            {data.activities.slice(0, 8).map((activity, i) => (
              <ActivityItem key={activity.id} activity={activity} index={i} />
            ))}
          </div>
        </div>

        {/* Upcoming Meetings */}
        <div className="rounded-3xl p-5 border bg-gradient-to-br from-gray-900/80 to-gray-900/40 backdrop-blur-xl border-gray-800/50">
          <h3 className="text-sm font-semibold text-gray-200 mb-3">Upcoming Meetings</h3>
          <div className="space-y-3">
            {data.meetings.slice(0, 4).map((meeting, i) => (
              <motion.div
                key={meeting.id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2 + i * 0.08 }}
                className="p-3 rounded-xl bg-gray-900/40 border border-gray-700/30 hover:border-gray-600/40 transition-colors cursor-pointer"
              >
                <p className="text-sm font-medium text-gray-200 truncate">{meeting.title}</p>
                <div className="flex items-center gap-2 mt-1.5">
                  <span className="text-[11px] text-gray-500">
                    {formatMeetingTime(meeting.meeting_start)}
                  </span>
                  <span className="text-gray-700">·</span>
                  <span className="text-[11px] text-gray-500">{meeting.duration_minutes}m</span>
                </div>
                {meeting.company_name && (
                  <span className="inline-block mt-2 text-[10px] font-medium px-2 py-0.5 rounded-full bg-[#37bd7e]/10 text-[#37bd7e]">
                    {meeting.company_name}
                  </span>
                )}
              </motion.div>
            ))}
          </div>
        </div>
      </div>

      {/* Personalized CTA */}
      {companyName && (
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.6, duration: 0.5 }}
          className="rounded-2xl p-5 bg-gradient-to-r from-[#37bd7e]/10 via-[#37bd7e]/5 to-transparent border border-[#37bd7e]/20 flex items-center justify-between"
        >
          <div>
            <p className="text-sm font-semibold text-white">
              Get these numbers for {companyName}
            </p>
            <p className="text-xs text-gray-400 mt-0.5">
              Real pipeline metrics, AI meeting prep, and automated follow-ups — all in 60 seconds
            </p>
          </div>
          <div className="flex items-center gap-1.5 text-[#37bd7e] text-sm font-medium flex-shrink-0">
            Start free trial
            <ArrowRight className="w-4 h-4" />
          </div>
        </motion.div>
      )}
    </div>
  );
}

function getTimeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const hours = Math.floor(diff / 3600000);
  if (hours < 1) return 'Just now';
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days === 1) return 'Yesterday';
  return `${days}d ago`;
}

function formatMeetingTime(dateStr: string): string {
  const d = new Date(dateStr);
  const now = new Date();
  const diffDays = Math.ceil((d.getTime() - now.getTime()) / 86400000);
  const time = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  if (diffDays === 0) return `Today ${time}`;
  if (diffDays === 1) return `Tomorrow ${time}`;
  return `${d.toLocaleDateString('en-US', { weekday: 'short' })} ${time}`;
}
