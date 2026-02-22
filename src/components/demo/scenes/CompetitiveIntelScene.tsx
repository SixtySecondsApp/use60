import { useState } from 'react';
import { motion } from 'framer-motion';
import { Info, Shield, TrendingUp, ArrowUpRight, ArrowDownRight } from 'lucide-react';
import { competitors, crossDealPatterns } from '../data/competitiveIntel';

const TOOLTIP_TEXT =
  'Powered by Competitive Intelligence System \u2014 accumulates from every sales call, builds org-specific battlecards, surfaces counter-positioning from winning deals';

type TabId = 'comp-intercom' | 'comp-zendesk' | 'comp-ada';

const tabLabels: Record<TabId, string> = {
  'comp-intercom': 'Intercom',
  'comp-zendesk': 'Zendesk AI',
  'comp-ada': 'Ada',
};

function StrengthBar({
  label,
  count,
  total,
  color,
}: {
  label: string;
  count: number;
  total: number;
  color: string;
}) {
  const pct = Math.round((count / total) * 100);
  return (
    <div>
      <div className="flex items-center justify-between mb-0.5">
        <span className="text-xs text-gray-600">{label}</span>
        <span className="text-[10px] text-gray-400">
          {count}/{total}
        </span>
      </div>
      <div className="h-1.5 rounded-full bg-gray-100 overflow-hidden">
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${pct}%` }}
          transition={{ duration: 0.6, delay: 0.2 }}
          className={`h-full rounded-full ${color}`}
        />
      </div>
    </div>
  );
}

export default function CompetitiveIntelScene() {
  const [showTooltip, setShowTooltip] = useState(false);
  const [activeTab, setActiveTab] = useState<TabId>('comp-intercom');

  const comp = competitors.find((c) => c.id === activeTab)!;
  const totalEncounters = competitors.reduce((sum, c) => sum + c.totalEncounters, 0);

  const latestMonth = comp.monthlyTrend[comp.monthlyTrend.length - 1];
  const prevMonth = comp.monthlyTrend[comp.monthlyTrend.length - 2];
  const trendUp = latestMonth && prevMonth && latestMonth.encounters > prevMonth.encounters;

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
          <Shield className="w-4 h-4 text-violet-500" />
          <span className="text-sm font-semibold text-gray-600">
            Competitive Intelligence — Accumulated from {totalEncounters} encounters
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

      {/* Main card */}
      <div className="rounded-lg border border-gray-200 bg-white overflow-hidden">
        {/* Tab bar */}
        <div className="flex border-b border-gray-200">
          {(Object.entries(tabLabels) as [TabId, string][]).map(([id, label]) => (
            <button
              key={id}
              onClick={() => setActiveTab(id)}
              className={`flex-1 px-4 py-2.5 text-sm font-medium transition-colors ${
                activeTab === id
                  ? 'text-violet-700 border-b-2 border-violet-500 bg-violet-50/40'
                  : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="p-4 space-y-4">
          {/* Stats row */}
          <div className="grid grid-cols-3 gap-3">
            <div className="text-center p-2 rounded-lg bg-gray-50">
              <p className="text-lg font-bold text-gray-900">{comp.totalEncounters}</p>
              <p className="text-[10px] text-gray-500 uppercase font-medium">Encounters</p>
            </div>
            <div className="text-center p-2 rounded-lg bg-gray-50">
              <p className="text-lg font-bold text-gray-900">
                {Math.round(comp.winRate * 100)}%
              </p>
              <p className="text-[10px] text-gray-500 uppercase font-medium">Win Rate</p>
            </div>
            <div className="text-center p-2 rounded-lg bg-gray-50">
              <p className="text-lg font-bold text-gray-900">{comp.activeDeals.length}</p>
              <p className="text-[10px] text-gray-500 uppercase font-medium">Active Deals</p>
            </div>
          </div>

          {/* Strengths vs advantages */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-xs font-semibold text-red-600 uppercase tracking-wide mb-2">
                Their Strengths
              </p>
              <div className="space-y-2.5">
                {comp.strengths.slice(0, 2).map((s) => (
                  <StrengthBar
                    key={s.name}
                    label={s.name}
                    count={s.encounters}
                    total={comp.totalEncounters}
                    color="bg-red-400"
                  />
                ))}
              </div>
            </div>
            <div>
              <p className="text-xs font-semibold text-emerald-600 uppercase tracking-wide mb-2">
                Our Advantages
              </p>
              <div className="space-y-2.5">
                {comp.weaknesses.slice(0, 2).map((w) => (
                  <StrengthBar
                    key={w.name}
                    label={w.name}
                    count={w.encounters}
                    total={comp.totalEncounters}
                    color="bg-emerald-400"
                  />
                ))}
              </div>
            </div>
          </div>

          {/* Counter-positioning */}
          <div className="rounded-lg border border-violet-200 bg-violet-50/50 p-3">
            <p className="text-xs font-semibold text-violet-700 uppercase tracking-wide mb-1">
              Winning Counter-Position
            </p>
            <p className="text-xs text-gray-700 leading-relaxed">
              {comp.bestCounterPositioning.length > 280
                ? comp.bestCounterPositioning.slice(0, 280) + '...'
                : comp.bestCounterPositioning}
            </p>
          </div>

          {/* Monthly trend */}
          {latestMonth && (
            <div className="flex items-center gap-2 text-xs text-gray-500">
              <TrendingUp className="w-3.5 h-3.5" />
              <span>
                {latestMonth.encounters} mentions this month
              </span>
              {prevMonth && (
                <span className="flex items-center gap-0.5">
                  {trendUp ? (
                    <ArrowUpRight className="w-3 h-3 text-red-500" />
                  ) : (
                    <ArrowDownRight className="w-3 h-3 text-emerald-500" />
                  )}
                  <span className={trendUp ? 'text-red-500' : 'text-emerald-500'}>
                    {trendUp ? 'up' : 'down'} from {prevMonth.encounters} last month
                  </span>
                </span>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Cross-deal patterns summary */}
      <div className="rounded-lg border border-gray-200 bg-white p-4">
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">
          Cross-Deal Patterns
        </p>
        <div className="space-y-2">
          {crossDealPatterns.winLossFactors.slice(0, 3).map((factor) => (
            <div
              key={factor.factor}
              className="flex items-center justify-between rounded-lg border border-gray-100 bg-gray-50 px-3 py-2"
            >
              <span className="text-xs text-gray-700">{factor.factor}</span>
              <span className="text-xs font-bold text-violet-600">
                {Math.round(factor.winCorrelation * 100)}% win rate
              </span>
            </div>
          ))}
        </div>
      </div>
    </motion.div>
  );
}
