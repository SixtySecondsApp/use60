import { useState } from 'react';
import { motion } from 'framer-motion';
import {
  Info,
  Target,
  TrendingUp,
  Scale,
  AlertTriangle,
  ArrowRight,
  BarChart3,
} from 'lucide-react';
import { sarahChen } from '../data/sarahChen';

const TOOLTIP_TEXT =
  'Powered by Temporal Intelligence + Pipeline Mathematics \u2014 quarter-aware prioritization with gap-to-target analysis';

const q = sarahChen.quota;
const closedPct = Math.round((q.closed / q.target) * 100);
const remainingPipeline = q.weighted - q.closed;
const projectedClose = Math.round(remainingPipeline * q.closeRate);
const projectedTotal = q.closed + projectedClose;
const shortfall = q.target - projectedTotal;

export default function PipelineMathScene() {
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
          <BarChart3 className="w-4 h-4 text-purple-500" />
          <span className="text-sm font-semibold text-gray-600">
            7:45 AM — Pipeline Analysis
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

      {/* Dark card */}
      <div className="bg-gray-900 rounded-xl border border-gray-800 overflow-hidden max-w-[600px]">
        {/* Header */}
        <div className="px-5 pt-5 pb-3 border-b border-gray-800">
          <div className="flex items-center gap-2">
            <div className="w-1 h-5 rounded-full bg-purple-500" />
            <h3 className="text-white font-bold text-sm">
              Q1 Pipeline Check — Week {q.weekOfQuarter} of {q.totalWeeks}
            </h3>
          </div>
        </div>

        <div className="p-5 space-y-5">
          {/* 4 Metric boxes */}
          <div className="grid grid-cols-2 gap-3">
            <MetricBox
              icon={<Target className="w-3.5 h-3.5 text-purple-400" />}
              label="Target"
              value={`\u00a3${(q.target / 1000).toFixed(0)}K`}
            />
            <MetricBox
              icon={<TrendingUp className="w-3.5 h-3.5 text-emerald-400" />}
              label="Closed"
              value={`\u00a3${(q.closed / 1000).toFixed(1)}K`}
              sub={`${closedPct}%`}
              subColor="text-emerald-400"
            />
            <MetricBox
              icon={<Scale className="w-3.5 h-3.5 text-blue-400" />}
              label="Weighted Pipeline"
              value={`\u00a3${(q.weighted / 1000).toFixed(1)}K`}
            />
            <MetricBox
              icon={<BarChart3 className="w-3.5 h-3.5 text-amber-400" />}
              label="Coverage"
              value={`${q.coverageRatio}x`}
              sub={`target ${q.coverageTarget}x`}
              subColor="text-amber-400"
            />
          </div>

          {/* Progress bar */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-xs text-gray-400">
              <span>Quota Progress</span>
              <span>{closedPct}% of target</span>
            </div>
            <div className="h-2.5 bg-gray-800 rounded-full overflow-hidden">
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${closedPct}%` }}
                transition={{ duration: 1, ease: 'easeOut', delay: 0.3 }}
                className="h-full rounded-full bg-gradient-to-r from-purple-600 to-purple-400"
              />
            </div>
          </div>

          {/* Warning section */}
          <div className="bg-amber-500/10 border border-amber-500/20 rounded-lg p-3">
            <div className="flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-400 mt-0.5 shrink-0" />
              <p className="text-xs text-amber-200 leading-relaxed">
                At your {Math.round(q.closeRate * 100)}% close rate, you'd close{' '}
                <span className="font-semibold text-white">
                  {'\u00a3'}
                  {(projectedClose / 1000).toFixed(1)}K
                </span>{' '}
                of remaining pipeline — putting you at{' '}
                <span className="font-semibold text-white">
                  {'\u00a3'}
                  {(projectedTotal / 1000).toFixed(1)}K
                </span>
                . That's{' '}
                <span className="font-semibold text-red-400">
                  {'\u00a3'}
                  {(shortfall / 1000).toFixed(1)}K short
                </span>
                .
              </p>
            </div>
          </div>

          {/* Recommendation cards */}
          <div className="space-y-2">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">
              Recommendations
            </p>
            <div className="bg-gray-800/50 rounded-lg p-3 border border-gray-700">
              <div className="flex items-start gap-2">
                <ArrowRight className="w-3.5 h-3.5 text-purple-400 mt-0.5 shrink-0" />
                <p className="text-xs text-gray-300">
                  Close <span className="text-white font-semibold">2 of your 3 Negotiation deals</span>{' '}
                  (worth {'\u00a3'}38,000 combined)
                </p>
              </div>
            </div>
            <div className="bg-gray-800/50 rounded-lg p-3 border border-gray-700">
              <div className="flex items-start gap-2">
                <ArrowRight className="w-3.5 h-3.5 text-purple-400 mt-0.5 shrink-0" />
                <p className="text-xs text-gray-300">
                  <span className="text-gray-500">OR</span> add{' '}
                  <span className="text-white font-semibold">{'\u00a3'}126K in new qualified pipeline</span>
                </p>
              </div>
            </div>
          </div>

          {/* Highlighted action */}
          <div className="bg-purple-500/10 border border-purple-500/30 rounded-lg p-3">
            <div className="flex items-start gap-2">
              <Target className="w-4 h-4 text-purple-400 mt-0.5 shrink-0" />
              <p className="text-xs text-purple-200 leading-relaxed">
                <span className="font-semibold text-white">Your highest-leverage action:</span>{' '}
                unstick the Meridian deal ({'\u00a3'}22K, 18 days in Proposal)
              </p>
            </div>
          </div>
        </div>
      </div>
    </motion.div>
  );
}

function MetricBox({
  icon,
  label,
  value,
  sub,
  subColor,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  sub?: string;
  subColor?: string;
}) {
  return (
    <div className="bg-gray-800/50 rounded-lg p-3 border border-gray-700/50">
      <div className="flex items-center gap-1.5 mb-1">
        {icon}
        <span className="text-[10px] font-medium text-gray-400 uppercase tracking-wider">
          {label}
        </span>
      </div>
      <div className="flex items-baseline gap-1.5">
        <span className="text-lg font-bold text-white">{value}</span>
        {sub && (
          <span className={`text-xs font-medium ${subColor ?? 'text-gray-400'}`}>
            {sub}
          </span>
        )}
      </div>
    </div>
  );
}
