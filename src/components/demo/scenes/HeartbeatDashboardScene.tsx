import { useState } from 'react';
import { motion } from 'framer-motion';
import {
  Info,
  Activity,
  Database,
  AlertTriangle,
  RefreshCcw,
  Sun,
  Moon,
  Calendar,
  Mail,
  TrendingUp,
  Users,
} from 'lucide-react';

const TOOLTIP_TEXT =
  'Powered by Fleet Orchestrator \u2014 9 specialized agents running on configurable schedules with heartbeat monitoring, circuit breakers, and error recovery';

interface AgentCard {
  name: string;
  icon: typeof Database;
  lastRun: string;
  nextRun: string;
  actionsThisWeek: number;
  delay: number; // stagger for pulsing dot
}

const agents: AgentCard[] = [
  {
    name: 'CRM Update',
    icon: Database,
    lastRun: '5m ago',
    nextRun: 'in 10m',
    actionsThisWeek: 47,
    delay: 0,
  },
  {
    name: 'Deal Risk',
    icon: AlertTriangle,
    lastRun: '2h ago',
    nextRun: 'in 1h',
    actionsThisWeek: 12,
    delay: 0.3,
  },
  {
    name: 'Re-engagement',
    icon: RefreshCcw,
    lastRun: '6h ago',
    nextRun: 'in 2h',
    actionsThisWeek: 3,
    delay: 0.6,
  },
  {
    name: 'Morning Briefing',
    icon: Sun,
    lastRun: '7:45 AM',
    nextRun: 'Tomorrow 7:30',
    actionsThisWeek: 5,
    delay: 0.15,
  },
  {
    name: 'EOD Synthesis',
    icon: Moon,
    lastRun: '6:00 PM',
    nextRun: 'Today 6:00',
    actionsThisWeek: 5,
    delay: 0.45,
  },
  {
    name: 'Meeting Prep',
    icon: Calendar,
    lastRun: '30m ago',
    nextRun: 'in 45m',
    actionsThisWeek: 8,
    delay: 0.75,
  },
  {
    name: 'Email Signals',
    icon: Mail,
    lastRun: '15m ago',
    nextRun: 'in 15m',
    actionsThisWeek: 34,
    delay: 0.2,
  },
  {
    name: 'Coaching Digest',
    icon: TrendingUp,
    lastRun: 'Monday',
    nextRun: 'Next Monday',
    actionsThisWeek: 1,
    delay: 0.5,
  },
  {
    name: 'Internal Prep',
    icon: Users,
    lastRun: '3:30 PM',
    nextRun: 'Tomorrow',
    actionsThisWeek: 4,
    delay: 0.8,
  },
];

const totalActions = agents.reduce((sum, a) => sum + a.actionsThisWeek, 0);

export default function HeartbeatDashboardScene() {
  const [showTooltip, setShowTooltip] = useState(false);

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
      className="space-y-4"
    >
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Activity className="w-4 h-4 text-emerald-500" />
          <span className="text-sm font-semibold text-gray-600">
            Agent Fleet Status — Always On
          </span>
        </div>
        <div className="relative">
          <button
            onMouseEnter={() => setShowTooltip(true)}
            onMouseLeave={() => setShowTooltip(false)}
            className="p-1 rounded hover:bg-gray-100 transition-colors"
          >
            <Info className="w-4 h-4 text-gray-400" />
          </button>
          {showTooltip && (
            <motion.div
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              className="absolute right-0 top-8 z-50 w-72 rounded-lg bg-gray-900 px-3 py-2 text-xs text-gray-100 shadow-lg"
            >
              {TOOLTIP_TEXT}
            </motion.div>
          )}
        </div>
      </div>

      {/* Summary stats */}
      <div className="grid grid-cols-4 gap-3">
        {[
          { label: 'Actions This Week', value: totalActions.toString(), color: 'text-violet-600' },
          { label: 'Pending Approval', value: '3', color: 'text-amber-600' },
          { label: 'Errors', value: '0', color: 'text-emerald-600' },
          { label: 'Uptime', value: '99.8%', color: 'text-emerald-600' },
        ].map((stat) => (
          <div
            key={stat.label}
            className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-center"
          >
            <p className={`text-lg font-bold ${stat.color}`}>{stat.value}</p>
            <p className="text-[10px] text-gray-500 uppercase font-medium">{stat.label}</p>
          </div>
        ))}
      </div>

      {/* 3x3 agent grid */}
      <div className="grid grid-cols-3 gap-3">
        {agents.map((agent, idx) => {
          const Icon = agent.icon;
          return (
            <motion.div
              key={agent.name}
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.3, delay: idx * 0.06 }}
              className="rounded-lg border border-gray-200 bg-white p-3"
            >
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <div className="w-7 h-7 rounded-lg bg-gray-50 flex items-center justify-center">
                    <Icon className="w-3.5 h-3.5 text-gray-500" />
                  </div>
                  <span className="text-xs font-semibold text-gray-800">{agent.name}</span>
                </div>
                {/* Pulsing green dot */}
                <motion.div
                  className="w-2.5 h-2.5 rounded-full bg-emerald-500"
                  animate={{
                    scale: [1, 1.4, 1],
                    opacity: [1, 0.5, 1],
                  }}
                  transition={{
                    duration: 2,
                    repeat: Infinity,
                    delay: agent.delay,
                  }}
                />
              </div>
              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] text-gray-400">Last run</span>
                  <span className="text-[10px] text-gray-600 font-medium">{agent.lastRun}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-[10px] text-gray-400">Next</span>
                  <span className="text-[10px] text-gray-600 font-medium">{agent.nextRun}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-[10px] text-gray-400">This week</span>
                  <span className="text-[10px] text-violet-600 font-bold">
                    {agent.actionsThisWeek} actions
                  </span>
                </div>
              </div>
            </motion.div>
          );
        })}
      </div>
    </motion.div>
  );
}
