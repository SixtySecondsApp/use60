import { useState } from 'react';
import { motion } from 'framer-motion';
import {
  Info,
  ArrowRight,
  Database,
  FileText,
  BarChart3,
  Bell,
  GraduationCap,
  Target,
  Settings,
} from 'lucide-react';

const TOOLTIP_TEXT =
  'Powered by Always-On Intelligence \u2014 the cumulative impact of 9 specialized agents running continuously for 30 days';

interface ComparisonRow {
  capability: string;
  icon: typeof Database;
  before: string;
  after: string;
}

const rows: ComparisonRow[] = [
  {
    capability: 'CRM Updates',
    icon: Database,
    before: 'Manual entry, 20 min/day',
    after: 'Auto-applied (92% accuracy), <2 min review',
  },
  {
    capability: 'Meeting Prep',
    icon: FileText,
    before: 'Google the company 5 min before',
    after: 'Full brief 30 min early with battlecards',
  },
  {
    capability: 'Pipeline Visibility',
    icon: BarChart3,
    before: 'Weekly Excel export',
    after: 'Real-time health scores, temperature, signals',
  },
  {
    capability: 'Follow-ups',
    icon: Bell,
    before: 'Forgotten 40% of the time',
    after: '100% tracked, re-engagement auto-drafted',
  },
  {
    capability: 'Coaching',
    icon: GraduationCap,
    before: 'Quarterly manager ride-along',
    after: 'Weekly AI digest with SPIN analysis',
  },
  {
    capability: 'Forecasting',
    icon: Target,
    before: 'Gut feeling',
    after: 'Data-backed with deal risk signals',
  },
  {
    capability: 'Configuration',
    icon: Settings,
    before: 'One-time static setup',
    after: 'Continuously learning, 94% completeness',
  },
];

export default function BeforeAfterRevealScene() {
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
          <ArrowRight className="w-4 h-4 text-violet-500" />
          <span className="text-sm font-semibold text-gray-600">
            The Transformation — Before vs. After (Month 1)
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

      {/* Comparison table */}
      <div className="rounded-lg border border-gray-200 bg-white overflow-hidden">
        {/* Table header */}
        <div className="grid grid-cols-[1fr_1fr_1fr] bg-gray-50 border-b border-gray-200 px-4 py-2">
          <span className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">
            Capability
          </span>
          <span className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">
            Before
          </span>
          <span className="text-[10px] font-bold text-violet-600 uppercase tracking-wider">
            After (Month 1)
          </span>
        </div>

        {/* Rows */}
        {rows.map((row, idx) => {
          const Icon = row.icon;
          return (
            <motion.div
              key={row.capability}
              initial={{ opacity: 0, x: -12 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.35, delay: idx * 0.1 }}
              className={`grid grid-cols-[1fr_1fr_1fr] px-4 py-3 items-start ${
                idx < rows.length - 1 ? 'border-b border-gray-100' : ''
              }`}
            >
              {/* Capability */}
              <div className="flex items-center gap-2">
                <Icon className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                <span className="text-xs font-semibold text-gray-800">{row.capability}</span>
              </div>

              {/* Before */}
              <span className="text-xs text-gray-500">{row.before}</span>

              {/* After */}
              <span className="text-xs text-violet-700 font-medium">{row.after}</span>
            </motion.div>
          );
        })}
      </div>

      {/* Completeness card */}
      <motion.div
        initial={{ opacity: 0, scale: 0.97 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.5, delay: 0.8 }}
        className="rounded-lg border border-amber-200 bg-gradient-to-r from-amber-50 to-white p-5"
      >
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-semibold text-gray-700">Configuration Completeness</p>
            <p className="text-xs text-gray-500 mt-0.5">Your AI teammate knows how you sell.</p>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-xs font-bold px-2.5 py-1 rounded-full border bg-amber-100 text-amber-700 border-amber-200">
              Learning
            </span>
            <span className="text-3xl font-bold text-gray-900">94%</span>
          </div>
        </div>
        <div className="mt-3 h-2.5 rounded-full bg-gray-100 overflow-hidden">
          <motion.div
            className="h-full rounded-full bg-gradient-to-r from-violet-500 via-amber-400 to-emerald-500"
            initial={{ width: 0 }}
            animate={{ width: '94%' }}
            transition={{ duration: 1, delay: 1.0 }}
          />
        </div>
      </motion.div>
    </motion.div>
  );
}
