/**
 * AgentDemoPage — Visual demo of Always-On Agent components
 *
 * Self-contained demo with mock data to evaluate the new agent UX
 * before wiring into production routes. Shows:
 * - Activation flow wizard
 * - Agent persona settings
 * - Notification preferences
 * - Analytics dashboard
 * - Activity feed with filters
 *
 * Route: /platform/agent-demo (platform admin only)
 */

import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Input } from '@/components/ui/input';
import {
  Bot,
  Bell,
  BellOff,
  Clock,
  Layers,
  TrendingUp,
  Video,
  AlertTriangle,
  RefreshCw,
  GraduationCap,
  Mail,
  Sparkles,
  Settings,
  BarChart3,
} from 'lucide-react';
import { cn } from '@/lib/utils';

// ============================================================================
// Mock Data
// ============================================================================

const MOCK_ACTIVITIES = [
  {
    id: '1',
    type: 'morning_briefing',
    title: "Sixty's Morning Briefing",
    summary: 'You have 3 meetings today. Acme Corp deal ($45K) needs follow-up — last activity was 8 days ago. 2 overdue tasks need attention.',
    created_at: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
    category: 'admin',
  },
  {
    id: '2',
    type: 'pre_meeting_90min',
    title: 'Meeting Prep: Acme Corp Demo',
    summary: 'Demo with Sarah Chen (VP Sales) in 90 min. Key points: they asked about API integrations last call. Competitor mentioned: HubSpot.',
    created_at: new Date(Date.now() - 4 * 60 * 60 * 1000).toISOString(),
    category: 'meetings',
  },
  {
    id: '3',
    type: 'deal_risk_scan',
    title: 'Deal Risk: TechStart Series B',
    summary: 'Champion went quiet 5 days ago. No response to last 2 emails. Deal value: $120K. Recommend: multi-thread to the CTO.',
    created_at: new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString(),
    category: 'deals',
  },
  {
    id: '4',
    type: 'meeting_ended',
    title: 'Post-Call Debrief: Widget Co',
    summary: 'Good discovery call. Budget confirmed at $30K. Next step: send proposal by Friday. Action items: 1) ROI calculator, 2) Security docs.',
    created_at: new Date(Date.now() - 8 * 60 * 60 * 1000).toISOString(),
    category: 'meetings',
  },
  {
    id: '5',
    type: 'stale_deal_revival',
    title: 'Stale Deal: CloudNet Migration',
    summary: 'No activity for 14 days. Last stage: Proposal. Suggest re-engagement email with updated pricing.',
    created_at: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
    category: 'deals',
  },
];

const MOCK_TRIAGE_STATS = {
  total: 47,
  delivered: 28,
  suppressed: 12,
  batched: 5,
  failed: 2,
};

const TONE_SAMPLES: Record<string, string> = {
  concise: "3 meetings today. Acme deal stale (8 days). TechStart champion quiet — multi-thread to CTO. 2 overdue tasks.",
  conversational: "Good morning! You've got a busy day with 3 meetings lined up. Heads up — the Acme deal hasn't had activity in over a week. Worth a quick check-in?",
  direct: "Priority: TechStart ($120K) is at risk. Champion ghosted. Action needed: reach out to CTO today. Also: Acme Corp is going stale.",
};

// ============================================================================
// Sub-Components (self-contained with mock data)
// ============================================================================

function DemoAnalytics() {
  const stats = MOCK_TRIAGE_STATS;
  const suppressionRate = Math.round(((stats.suppressed + stats.batched) / stats.total) * 100);
  const timeSavedMinutes = stats.suppressed * 2;
  const timeSavedDisplay = timeSavedMinutes >= 60
    ? `${Math.round(timeSavedMinutes / 60)}h ${timeSavedMinutes % 60}m`
    : `${timeSavedMinutes}m`;

  const metricCards = [
    { label: 'Delivered', value: stats.delivered, Icon: Bell, color: 'text-blue-600 dark:text-blue-400', bg: 'bg-blue-50 dark:bg-blue-950/30' },
    { label: 'Suppressed', value: stats.suppressed, Icon: BellOff, color: 'text-gray-600 dark:text-gray-400', bg: 'bg-gray-50 dark:bg-gray-800/50' },
    { label: 'Batched', value: stats.batched, Icon: Layers, color: 'text-purple-600 dark:text-purple-400', bg: 'bg-purple-50 dark:bg-purple-950/30' },
    { label: 'Time Saved', value: timeSavedDisplay, Icon: Clock, color: 'text-emerald-600 dark:text-emerald-400', bg: 'bg-emerald-50 dark:bg-emerald-950/30' },
  ];

  return (
    <div className="space-y-4">
      {/* Headline */}
      <Card className="border-emerald-200 dark:border-emerald-800/50">
        <CardContent className="pt-6">
          <div className="flex items-center gap-4">
            <div className="p-3 rounded-xl bg-emerald-100 dark:bg-emerald-900/30">
              <TrendingUp className="w-6 h-6 text-emerald-600 dark:text-emerald-400" />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900 dark:text-white">
                Your agent saved you ~{timeSavedDisplay} this week
              </p>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                {suppressionRate}% of raw notifications were intelligently suppressed or batched
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Metric grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {metricCards.map(m => (
          <Card key={m.label}>
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <div className={cn('p-2 rounded-lg', m.bg)}>
                  <m.Icon className={cn('w-4 h-4', m.color)} />
                </div>
                <div>
                  <p className="text-xl font-bold text-gray-900 dark:text-white">{m.value}</p>
                  <p className="text-xs text-gray-500">{m.label}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

function DemoActivityFeed() {
  const [filter, setFilter] = useState('all');
  const FILTERS = [
    { key: 'all', label: 'All' },
    { key: 'meetings', label: 'Meetings' },
    { key: 'deals', label: 'Deals' },
    { key: 'admin', label: 'Admin' },
  ];

  const TYPE_ICONS: Record<string, typeof Video> = {
    morning_briefing: Sparkles,
    pre_meeting_90min: Clock,
    deal_risk_scan: AlertTriangle,
    meeting_ended: Video,
    stale_deal_revival: RefreshCw,
  };

  const TYPE_COLORS: Record<string, string> = {
    morning_briefing: 'bg-amber-100 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400',
    pre_meeting_90min: 'bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400',
    deal_risk_scan: 'bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400',
    meeting_ended: 'bg-purple-100 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400',
    stale_deal_revival: 'bg-orange-100 dark:bg-orange-900/30 text-orange-600 dark:text-orange-400',
  };

  const filtered = filter === 'all' ? MOCK_ACTIVITIES : MOCK_ACTIVITIES.filter(a => a.category === filter);

  const formatTime = (iso: string) => {
    const diff = Date.now() - new Date(iso).getTime();
    const hours = Math.floor(diff / (1000 * 60 * 60));
    if (hours < 1) return 'Just now';
    if (hours < 24) return `${hours}h ago`;
    return `${Math.floor(hours / 24)}d ago`;
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Bot className="w-5 h-5" />
          Agent Activity Feed
        </CardTitle>
        <CardDescription>What your agent has been doing</CardDescription>
      </CardHeader>
      <CardContent>
        {/* Filters */}
        <div className="flex gap-1 mb-4">
          {FILTERS.map(f => (
            <button
              key={f.key}
              onClick={() => setFilter(f.key)}
              className={cn(
                'px-3 py-1.5 rounded-full text-xs font-medium transition-all',
                filter === f.key
                  ? 'bg-gray-900 dark:bg-white text-white dark:text-gray-900'
                  : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700'
              )}
            >
              {f.label}
            </button>
          ))}
        </div>

        {/* Feed items */}
        <div className="space-y-3">
          {filtered.map(activity => {
            const Icon = TYPE_ICONS[activity.type] || Bot;
            const colorClass = TYPE_COLORS[activity.type] || 'bg-gray-100 dark:bg-gray-800 text-gray-600';
            return (
              <div key={activity.id} className="flex gap-3 p-3 rounded-lg border border-gray-100 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-900/50 transition-colors">
                <div className={cn('p-2 rounded-lg flex-shrink-0', colorClass)}>
                  <Icon className="w-4 h-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-sm font-medium text-gray-900 dark:text-white">{activity.title}</p>
                    <span className="text-xs text-gray-400 flex-shrink-0">{formatTime(activity.created_at)}</span>
                  </div>
                  <p className="text-xs text-gray-500 mt-1 line-clamp-2">{activity.summary}</p>
                </div>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}

function DemoPersonaSettings() {
  const [tone, setTone] = useState('concise');
  const [name, setName] = useState('Sixty');

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Settings className="w-5 h-5" />
          Agent Persona
        </CardTitle>
        <CardDescription>How your agent communicates</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Agent Name</label>
          <Input value={name} onChange={e => setName(e.target.value)} maxLength={30} />
        </div>

        <div className="space-y-2">
          <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Tone</label>
          <div className="grid grid-cols-3 gap-2">
            {[
              { value: 'concise', label: 'Concise' },
              { value: 'conversational', label: 'Friendly' },
              { value: 'direct', label: 'Direct' },
            ].map(t => (
              <button
                key={t.value}
                onClick={() => setTone(t.value)}
                className={cn(
                  'p-2 rounded-lg border text-sm font-medium transition-all',
                  tone === t.value
                    ? 'border-blue-500 bg-blue-50 dark:bg-blue-950/30 text-blue-700 dark:text-blue-300'
                    : 'border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:border-gray-300'
                )}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>

        {/* Live preview */}
        <div className="p-3 rounded-lg bg-gray-50 dark:bg-gray-800/50 border border-gray-200 dark:border-gray-700">
          <p className="text-xs font-medium text-gray-500 mb-1">Preview: Morning Briefing</p>
          <p className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed">
            {TONE_SAMPLES[tone]}
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

function DemoNotificationPrefs() {
  const [enabled, setEnabled] = useState<Record<string, boolean>>({
    meeting_ended: true,
    pre_meeting_90min: true,
    deal_risk_scan: true,
    stale_deal_revival: false,
    coaching_weekly: false,
    campaign_daily_check: false,
  });

  const TYPES = [
    { key: 'meeting_ended', label: 'Post-Meeting Debrief', Icon: Video },
    { key: 'pre_meeting_90min', label: 'Meeting Prep', Icon: Clock },
    { key: 'deal_risk_scan', label: 'Deal Risk Alerts', Icon: AlertTriangle },
    { key: 'stale_deal_revival', label: 'Stale Deal Revival', Icon: RefreshCw },
    { key: 'coaching_weekly', label: 'Weekly Coaching', Icon: GraduationCap },
    { key: 'campaign_daily_check', label: 'Campaign Alerts', Icon: Mail },
  ];

  const [volume, setVolume] = useState('balanced');
  const VOLUMES = [
    { value: 'aggressive', label: 'High' },
    { value: 'balanced', label: 'Balanced' },
    { value: 'quiet', label: 'Low' },
  ];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Bell className="w-5 h-5" />
          Notification Preferences
        </CardTitle>
        <CardDescription>Control what your agent tells you about</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Volume */}
        <div className="grid grid-cols-3 gap-2">
          {VOLUMES.map(v => (
            <button
              key={v.value}
              onClick={() => setVolume(v.value)}
              className={cn(
                'p-2 rounded-lg border text-sm font-medium transition-all',
                volume === v.value
                  ? 'border-blue-500 bg-blue-50 dark:bg-blue-950/30 text-blue-700 dark:text-blue-300'
                  : 'border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400'
              )}
            >
              {v.label}
            </button>
          ))}
        </div>

        {/* Per-type toggles */}
        <div className="space-y-3">
          {TYPES.map(type => (
            <div key={type.key} className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <type.Icon className="w-4 h-4 text-gray-400" />
                <span className="text-sm text-gray-700 dark:text-gray-300">{type.label}</span>
              </div>
              <Switch
                checked={enabled[type.key] ?? false}
                onCheckedChange={v => setEnabled(prev => ({ ...prev, [type.key]: v }))}
              />
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

// ============================================================================
// Main Demo Page
// ============================================================================

export default function AgentDemoPage() {
  return (
    <div className="p-4 sm:p-6 lg:p-8">
      <div className="max-w-6xl mx-auto space-y-8">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-3">
            <div className="p-2 rounded-xl bg-gradient-to-br from-blue-500 to-purple-600">
              <Bot className="w-6 h-6 text-white" />
            </div>
            Always-On Agent — Component Demo
          </h1>
          <p className="text-gray-500 dark:text-gray-400 mt-2 max-w-2xl">
            Visual preview of AOA components with mock data. Nothing here calls real APIs.
          </p>
        </div>

        {/* Analytics Dashboard */}
        <div>
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
            <BarChart3 className="w-5 h-5" />
            Triage Analytics
          </h2>
          <DemoAnalytics />
        </div>

        {/* Two-column layout: Feed + Settings */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Activity Feed (takes 2 cols) */}
          <div className="lg:col-span-2">
            <DemoActivityFeed />
          </div>

          {/* Settings sidebar */}
          <div className="space-y-6">
            <DemoPersonaSettings />
            <DemoNotificationPrefs />
          </div>
        </div>

        {/* Architecture note */}
        <Card className="border-amber-200 dark:border-amber-800/50 bg-amber-50/50 dark:bg-amber-950/10">
          <CardContent className="pt-6">
            <h3 className="text-sm font-semibold text-amber-800 dark:text-amber-300 mb-2">Complexity Assessment</h3>
            <div className="text-sm text-amber-700 dark:text-amber-400 space-y-2">
              <p><strong>What's solid:</strong> Triage rules engine, orchestrator integration (feature-flagged), persona table + RPCs, Slack persona injection, test coverage (24 tests).</p>
              <p><strong>What's overcomplicated:</strong> AgentPersonaSettings duplicates ProactiveAgentSettings. NotificationPreferences overlaps with sequence toggles already there. Two separate settings UIs for the same agent.</p>
              <p><strong>Recommendation:</strong> Merge persona settings INTO the existing ProactiveAgentSettings page (add a "Persona" section). Don't create a separate settings page. The activation flow and analytics dashboard are genuinely new value — keep those.</p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
