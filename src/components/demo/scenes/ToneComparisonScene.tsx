import { useState } from 'react';
import { motion } from 'framer-motion';
import {
  Info,
  Briefcase,
  Heart,
  Zap,
  CheckCircle2,
  FileEdit,
  Bell,
} from 'lucide-react';

const TOOLTIP_TEXT =
  'Powered by Adaptive Voice \u2014 tone shifts from formal to casual to minimal based on user preferences configured through progressive learning';

interface ToneColumn {
  day: string;
  title: string;
  badge: string;
  badgeColor: string;
  icon: typeof Briefcase;
  iconColor: string;
  borderColor: string;
  content: React.ReactNode;
}

const columns: ToneColumn[] = [
  {
    day: 'Day 1',
    title: 'Executive Assistant',
    badge: 'Sharp & Data-Driven',
    badgeColor: 'bg-blue-100 text-blue-700 border-blue-200',
    icon: Briefcase,
    iconColor: 'text-blue-500',
    borderColor: 'border-blue-200',
    content: (
      <div className="space-y-2">
        <p className="text-sm text-gray-700 leading-relaxed">
          <strong className="font-semibold">Risk Alert: CloudBase Technologies</strong> requires
          attention. Champion contact Maria Chen has been silent for 14 days. Deal has been in
          Proposal stage for 18 days, exceeding your average cycle time. Recommend immediate
          outreach via alternative channel.
        </p>
        <div className="flex gap-2 mt-3">
          <span className="text-[10px] font-medium text-gray-400 bg-gray-50 px-2 py-0.5 rounded border border-gray-200">
            Clinical tone
          </span>
          <span className="text-[10px] font-medium text-gray-400 bg-gray-50 px-2 py-0.5 rounded border border-gray-200">
            No contractions
          </span>
        </div>
      </div>
    ),
  },
  {
    day: 'Day 7',
    title: 'Friendly Coach',
    badge: 'Warm & Encouraging',
    badgeColor: 'bg-amber-100 text-amber-700 border-amber-200',
    icon: Heart,
    iconColor: 'text-amber-500',
    borderColor: 'border-amber-200',
    content: (
      <div className="space-y-2">
        <p className="text-sm text-gray-700 leading-relaxed">
          Hey Sarah — heads up on CloudBase. Maria&apos;s gone quiet for 2 weeks, which isn&apos;t
          like her (she usually replies within 3 hours). The deal&apos;s been sitting in Proposal a
          bit long too. Want me to draft a casual check-in? Sometimes a different angle helps.
        </p>
        <div className="flex gap-2 mt-3">
          <span className="text-[10px] font-medium text-gray-400 bg-gray-50 px-2 py-0.5 rounded border border-gray-200">
            Conversational
          </span>
          <span className="text-[10px] font-medium text-gray-400 bg-gray-50 px-2 py-0.5 rounded border border-gray-200">
            Empathetic
          </span>
        </div>
      </div>
    ),
  },
  {
    day: 'Day 14',
    title: 'Invisible Operator',
    badge: 'Action-First',
    badgeColor: 'bg-emerald-100 text-emerald-700 border-emerald-200',
    icon: Zap,
    iconColor: 'text-emerald-500',
    borderColor: 'border-emerald-200',
    content: (
      <div className="space-y-2.5">
        <div className="flex items-center gap-2 rounded-lg bg-gray-50 border border-gray-200 px-3 py-2">
          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
          <span className="text-xs text-gray-600">CloudBase risk: snoozed (below threshold)</span>
        </div>
        <div className="flex items-center gap-2 rounded-lg bg-gray-50 border border-gray-200 px-3 py-2">
          <FileEdit className="w-3.5 h-3.5 text-violet-500 shrink-0" />
          <span className="text-xs text-gray-600">Re-engagement draft queued for review</span>
        </div>
        <div className="flex items-center gap-2 rounded-lg bg-amber-50 border border-amber-200 px-3 py-2">
          <Bell className="w-3.5 h-3.5 text-amber-500 shrink-0" />
          <span className="text-xs text-gray-700 font-medium">
            1 draft ready: CloudBase re-engagement
          </span>
        </div>
        <div className="flex gap-2 mt-1">
          <span className="text-[10px] font-medium text-gray-400 bg-gray-50 px-2 py-0.5 rounded border border-gray-200">
            Minimal text
          </span>
          <span className="text-[10px] font-medium text-gray-400 bg-gray-50 px-2 py-0.5 rounded border border-gray-200">
            Maximum action
          </span>
        </div>
      </div>
    ),
  },
];

export default function ToneComparisonScene() {
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
          <Heart className="w-4 h-4 text-amber-500" />
          <span className="text-sm font-semibold text-gray-600">
            Adaptive Voice — Same Alert, 3 Tones
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

      {/* 3-column comparison */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {columns.map((col, idx) => {
          const Icon = col.icon;
          return (
            <motion.div
              key={col.day}
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, delay: idx * 0.12 }}
              className={`rounded-lg border ${col.borderColor} bg-white overflow-hidden`}
            >
              {/* Card header */}
              <div className="px-4 pt-4 pb-2">
                <div className="flex items-center gap-2 mb-2">
                  <div
                    className={`w-7 h-7 rounded-full bg-gray-50 flex items-center justify-center`}
                  >
                    <Icon className={`w-3.5 h-3.5 ${col.iconColor}`} />
                  </div>
                  <div>
                    <p className="text-xs text-gray-400 font-medium">{col.day}</p>
                    <p className="text-sm font-semibold text-gray-900">{col.title}</p>
                  </div>
                </div>
                <span
                  className={`inline-block text-[10px] font-bold px-2 py-0.5 rounded-full border ${col.badgeColor}`}
                >
                  {col.badge}
                </span>
              </div>

              {/* Card body */}
              <div className="px-4 pb-4 pt-2">{col.content}</div>
            </motion.div>
          );
        })}
      </div>

      {/* Note */}
      <motion.p
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.6 }}
        className="text-xs text-gray-400 text-center italic"
      >
        Your AI teammate adapts its communication style based on your preferences and interaction
        patterns.
      </motion.p>
    </motion.div>
  );
}
