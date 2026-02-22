import { useState } from 'react';
import { motion } from 'framer-motion';
import {
  Info,
  Layers,
  MessageSquareWarning,
  Clock,
  CalendarCheck,
  Users,
  ArrowRight,
} from 'lucide-react';

const TOOLTIP_TEXT =
  'Powered by Cross-Deal Pattern Recognition \u2014 weekly analysis across your entire pipeline surfaces patterns no individual deal view would catch';

interface InsightCard {
  title: string;
  icon: typeof Layers;
  accentBorder: string;
  accentBg: string;
  accentText: string;
  body: string;
  action: string;
}

const insights: InsightCard[] = [
  {
    title: 'Objection Clustering',
    icon: MessageSquareWarning,
    accentBorder: 'border-orange-200',
    accentBg: 'bg-orange-50',
    accentText: 'text-orange-600',
    body: '3 of 5 Proposal-stage deals raised "integration complexity" concerns. This wasn\'t a theme last quarter. Possible cause: your recent pitch deck removed the integration architecture slide.',
    action: 'View affected deals',
  },
  {
    title: 'Stage Bottleneck',
    icon: Clock,
    accentBorder: 'border-red-200',
    accentBg: 'bg-red-50',
    accentText: 'text-red-600',
    body: 'Your deals spend 40% longer in Proposal than team average. The 2 deals that moved fastest both had an internal champion attend the proposal review.',
    action: 'Show bottleneck details',
  },
  {
    title: 'Meeting Cadence Impact',
    icon: CalendarCheck,
    accentBorder: 'border-emerald-200',
    accentBg: 'bg-emerald-50',
    accentText: 'text-emerald-600',
    body: 'Deals with 3+ meetings: 52% close rate. Deals with 1-2 meetings: 18% close rate. You have 2 deals with only 1 meeting \u2014 schedule follow-ups.',
    action: 'View low-meeting deals',
  },
  {
    title: 'Multi-Threading Effect',
    icon: Users,
    accentBorder: 'border-blue-200',
    accentBg: 'bg-blue-50',
    accentText: 'text-blue-600',
    body: 'Multi-threaded deals (2+ contacts): 61% close rate. Single-threaded: 24%. 4 of your current deals are single-threaded \u2014 this is your highest-leverage action.',
    action: 'Show single-threaded deals',
  },
];

export default function CrossDealPatternsScene() {
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
          <Layers className="w-4 h-4 text-violet-500" />
          <span className="text-sm font-semibold text-gray-600">
            Cross-Deal Patterns — This Week&apos;s Analysis
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

      {/* 2x2 grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {insights.map((card, idx) => {
          const Icon = card.icon;
          return (
            <motion.div
              key={card.title}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, delay: idx * 0.1 }}
              className={`rounded-lg border ${card.accentBorder} bg-white overflow-hidden`}
            >
              {/* Accent top border */}
              <div className={`h-1 ${card.accentBg.replace('50', '300')}`} />

              <div className="p-4">
                {/* Card title */}
                <div className="flex items-center gap-2 mb-2">
                  <div
                    className={`w-7 h-7 rounded-lg ${card.accentBg} flex items-center justify-center`}
                  >
                    <Icon className={`w-3.5 h-3.5 ${card.accentText}`} />
                  </div>
                  <p className="text-sm font-semibold text-gray-900">{card.title}</p>
                </div>

                {/* Body */}
                <p className="text-xs text-gray-600 leading-relaxed mb-3">{card.body}</p>

                {/* Action link */}
                <button
                  className={`flex items-center gap-1 text-xs font-medium ${card.accentText} hover:underline`}
                >
                  {card.action}
                  <ArrowRight className="w-3 h-3" />
                </button>
              </div>
            </motion.div>
          );
        })}
      </div>
    </motion.div>
  );
}
