import { useState } from 'react';
import { motion } from 'framer-motion';
import { Info, ShieldAlert, UserX, TrendingDown } from 'lucide-react';
import { SlackMessagePreview } from '../SlackMessagePreview';
import type { SlackMessage } from '../SlackMessagePreview';

const TOOLTIP_TEXT =
  'Powered by Deal Risk Scorer \u2014 4-dimension analysis (Engagement, Champion, Momentum, Sentiment) with intervention suggestions';

// Risk dimension mini-bars rendered as a custom card above the Slack message
const riskDimensions: Array<{
  label: string;
  level: 'low' | 'medium' | 'high';
  color: string;
  bgColor: string;
  width: string;
}> = [
  { label: 'Engagement', level: 'low', color: 'bg-emerald-500', bgColor: 'bg-emerald-100', width: 'w-1/4' },
  { label: 'Champion', level: 'high', color: 'bg-red-500', bgColor: 'bg-red-100', width: 'w-3/4' },
  { label: 'Momentum', level: 'high', color: 'bg-red-500', bgColor: 'bg-red-100', width: 'w-4/5' },
  { label: 'Sentiment', level: 'medium', color: 'bg-amber-500', bgColor: 'bg-amber-100', width: 'w-1/2' },
];

const riskSignals: Array<{
  icon: typeof UserX;
  title: string;
  badge: string;
  badgeColor: string;
}> = [
  {
    icon: UserX,
    title: 'Champion Silent (14 days)',
    badge: 'Champion',
    badgeColor: 'bg-orange-100 text-orange-700',
  },
  {
    icon: TrendingDown,
    title: 'Timeline Slip \u2014 close date pushed twice',
    badge: 'Momentum',
    badgeColor: 'bg-red-100 text-red-700',
  },
];

const slackMessage: SlackMessage = {
  timestamp: '4:30 PM',
  blocks: [
    { type: 'header', text: 'Risk Alert: CloudBase Technologies' },
    {
      type: 'section',
      text: '',
      fields: [
        { label: 'Deal Value', value: '$72,000' },
        { label: 'Stage', value: 'Proposal' },
        { label: 'Days in Stage', value: '18' },
      ],
    },
    { type: 'divider' },
    {
      type: 'rich_text',
      content: `**Recommendation:** Consider reaching out to secondary contact Maria Chen's manager, or try a different channel (LinkedIn/phone). Maria's average response time was 3.2 hours \u2014 current silence is 14 days.`,
    },
    {
      type: 'actions',
      buttons: [
        { text: 'View Deal', style: 'primary' },
        { text: 'Snooze 7 Days', style: 'default' },
        { text: 'Dismiss', style: 'default' },
      ],
    },
  ],
};

export default function DealRiskScene() {
  const [showTooltip, setShowTooltip] = useState(false);

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
      className="space-y-3"
    >
      {/* Timestamp header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <ShieldAlert className="w-4 h-4 text-red-500" />
          <span className="text-sm font-semibold text-gray-600">4:30 PM — Deal Risk Alert</span>
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

      {/* Enhanced Slack message with custom risk cards embedded */}
      <div
        className="bg-white rounded-lg shadow-sm border border-gray-200 max-w-[600px] overflow-hidden"
        style={{ borderLeft: '3px solid #6C5CE7' }}
      >
        <div className="p-4">
          {/* Bot header */}
          <div className="flex items-center gap-2 mb-3">
            <div className="w-8 h-8 rounded-full flex items-center justify-center text-white shrink-0 bg-[#6C5CE7]">
              <ShieldAlert className="w-4 h-4" />
            </div>
            <span className="font-bold text-sm text-gray-900">60 Sales Copilot</span>
            <span className="text-xs text-gray-400">4:30 PM</span>
          </div>

          {/* Header */}
          <p className="text-base font-bold text-gray-900 mt-1 mb-1">
            Risk Alert: CloudBase Technologies
          </p>

          {/* Fields */}
          <div className="grid grid-cols-2 gap-x-4 gap-y-1 mt-2 mb-2">
            {[
              { label: 'Deal Value', value: '$72,000' },
              { label: 'Stage', value: 'Proposal' },
              { label: 'Days in Stage', value: '18' },
            ].map((f) => (
              <div key={f.label}>
                <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                  {f.label}
                </span>
                <p className="text-sm text-gray-800">{f.value}</p>
              </div>
            ))}
          </div>

          <hr className="my-2 border-gray-200" />

          {/* Risk Signals */}
          <p className="text-sm font-semibold text-gray-700 mb-2">Risk Signals Detected</p>
          <div className="space-y-2 mb-3">
            {riskSignals.map((signal) => {
              const Icon = signal.icon;
              return (
                <div
                  key={signal.title}
                  className="flex items-center gap-3 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2"
                >
                  <Icon className="w-4 h-4 text-red-500 shrink-0" />
                  <span className="text-xs text-gray-700 flex-1">{signal.title}</span>
                  <span
                    className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${signal.badgeColor}`}
                  >
                    {signal.badge}
                  </span>
                </div>
              );
            })}
          </div>

          {/* Risk dimension mini-bars */}
          <div className="grid grid-cols-2 gap-x-4 gap-y-2 mb-3">
            {riskDimensions.map((dim) => (
              <div key={dim.label}>
                <div className="flex items-center justify-between mb-0.5">
                  <span className="text-[10px] font-medium text-gray-500">{dim.label}</span>
                  <span
                    className={`text-[9px] font-semibold uppercase ${
                      dim.level === 'low'
                        ? 'text-emerald-600'
                        : dim.level === 'medium'
                          ? 'text-amber-600'
                          : 'text-red-600'
                    }`}
                  >
                    {dim.level}
                  </span>
                </div>
                <div className={`h-1.5 rounded-full ${dim.bgColor}`}>
                  <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: '100%' }}
                    transition={{ duration: 0.8, delay: 0.3 }}
                    className={`h-full rounded-full ${dim.color} ${dim.width}`}
                  />
                </div>
              </div>
            ))}
          </div>

          <hr className="my-2 border-gray-200" />

          {/* Recommendation */}
          <p className="text-sm text-gray-700">
            <strong className="font-semibold">Recommendation:</strong> Consider reaching out to
            secondary contact Maria Chen's manager, or try a different channel (LinkedIn/phone).
            Maria's average response time was 3.2 hours — current silence is 14 days.
          </p>

          {/* Actions */}
          <div className="flex flex-wrap gap-2 my-2">
            <button
              className="px-3 py-1.5 rounded text-sm font-medium text-white cursor-pointer"
              style={{ backgroundColor: '#6C5CE7' }}
            >
              View Deal
            </button>
            <button className="px-3 py-1.5 rounded text-sm font-medium text-gray-700 border border-gray-300 bg-white hover:bg-gray-50 cursor-pointer">
              Snooze 7 Days
            </button>
            <button className="px-3 py-1.5 rounded text-sm font-medium text-gray-700 border border-gray-300 bg-white hover:bg-gray-50 cursor-pointer">
              Dismiss
            </button>
          </div>
        </div>
      </div>
    </motion.div>
  );
}
