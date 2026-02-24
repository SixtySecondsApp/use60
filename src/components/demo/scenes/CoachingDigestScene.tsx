import { useState } from 'react';
import { motion } from 'framer-motion';
import { Info, GraduationCap, TrendingUp, ArrowUp } from 'lucide-react';
import { SlackMessagePreview } from '../SlackMessagePreview';
import type { SlackMessage } from '../SlackMessagePreview';
import { sarahChen } from '../data/sarahChen';

const TOOLTIP_TEXT =
  'Powered by Coaching Digest + Org-Wide Learning \u2014 weekly scores, SPIN analysis, data-backed insights, and anonymized team intelligence';

const coachingMessage: SlackMessage = {
  timestamp: 'Monday 9:00 AM',
  blocks: [
    { type: 'header', text: 'Weekly Coaching Digest \u2014 Week of March 3rd' },
    {
      type: 'section',
      text: '',
      fields: [
        { label: 'Meetings Analyzed', value: '4' },
        { label: 'Overall Score', value: `${sarahChen.coaching.overallScore}/100 \u2191 improving` },
      ],
    },
    { type: 'divider' },
    {
      type: 'section',
      text: '**Performance Metrics**',
      fields: [
        { label: 'Talk Ratio', value: `${sarahChen.coaching.talkRatio}% (target: ${sarahChen.coaching.talkRatioTarget}%)` },
        { label: 'Question Quality', value: `${sarahChen.coaching.questionQuality}%` },
        { label: 'Objection Handling', value: `${sarahChen.coaching.objectionHandling}%` },
        { label: 'Discovery Depth', value: `${sarahChen.coaching.discoveryDepth}%` },
      ],
    },
    {
      type: 'context',
      text: `SPIN Breakdown: ${sarahChen.coaching.spin.situation} Situation | ${sarahChen.coaching.spin.problem} Problem | ${sarahChen.coaching.spin.implication} Implication | ${sarahChen.coaching.spin.needPayoff} Need-Payoff \u2014 strong on Situation, room to grow on Implication questions`,
    },
    { type: 'divider' },
    {
      type: 'section',
      text: '**Weekly Win**\nDataFlow demo had excellent discovery \u2014 Jake volunteered budget info unprompted. Your pause-and-listen technique after the pricing question was textbook.',
    },
    {
      type: 'section',
      text: '**Data-Backed Insight**\nYour deals with 3+ stakeholder contacts close at 2.3x the rate. CloudBase has only 1 contact \u2014 multi-threading here could save the deal.',
    },
    {
      type: 'section',
      text: '**Team Intelligence**\nTip from your org\'s winning patterns: Top performers address pricing in Discovery, not Proposal. Consider bringing up budget earlier.',
    },
    {
      type: 'actions',
      buttons: [
        { text: 'View Full Report', style: 'primary' },
        { text: 'Dismiss', style: 'default' },
      ],
    },
  ],
};

function MetricBar({
  label,
  value,
  max,
  color,
}: {
  label: string;
  value: number;
  max: number;
  color: string;
}) {
  const pct = Math.round((value / max) * 100);
  return (
    <div>
      <div className="flex items-center justify-between mb-0.5">
        <span className="text-xs text-gray-600">{label}</span>
        <span className="text-xs font-semibold text-gray-800">{value}%</span>
      </div>
      <div className="h-1.5 rounded-full bg-gray-100 overflow-hidden">
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${pct}%` }}
          transition={{ duration: 0.6, delay: 0.3 }}
          className={`h-full rounded-full ${color}`}
        />
      </div>
    </div>
  );
}

export default function CoachingDigestScene() {
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
          <GraduationCap className="w-4 h-4 text-violet-500" />
          <span className="text-sm font-semibold text-gray-600">
            Weekly Coaching Digest — Slack DM
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

      {/* Score overview card */}
      <div className="rounded-lg border border-gray-200 bg-white p-4">
        <div className="flex items-center justify-between mb-3">
          <div>
            <p className="text-sm font-semibold text-gray-900">Overall Coaching Score</p>
            <p className="text-xs text-gray-500">Week of March 3rd, 4 meetings analyzed</p>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1 text-emerald-600">
              <ArrowUp className="w-3.5 h-3.5" />
              <span className="text-xs font-medium">improving</span>
            </div>
            <span className="text-2xl font-bold text-gray-900">
              {sarahChen.coaching.overallScore}
            </span>
            <span className="text-sm text-gray-400">/100</span>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <MetricBar
            label="Talk Ratio"
            value={sarahChen.coaching.talkRatio}
            max={100}
            color="bg-emerald-400"
          />
          <MetricBar
            label="Question Quality"
            value={sarahChen.coaching.questionQuality}
            max={100}
            color="bg-blue-400"
          />
          <MetricBar
            label="Objection Handling"
            value={sarahChen.coaching.objectionHandling}
            max={100}
            color="bg-violet-400"
          />
          <MetricBar
            label="Discovery Depth"
            value={sarahChen.coaching.discoveryDepth}
            max={100}
            color="bg-amber-400"
          />
        </div>

        {/* SPIN breakdown */}
        <div className="mt-3 pt-3 border-t border-gray-100">
          <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide mb-2">
            SPIN Breakdown
          </p>
          <div className="flex items-center gap-3">
            {[
              { label: 'S', value: sarahChen.coaching.spin.situation, color: 'bg-blue-500' },
              { label: 'P', value: sarahChen.coaching.spin.problem, color: 'bg-amber-500' },
              { label: 'I', value: sarahChen.coaching.spin.implication, color: 'bg-orange-500' },
              { label: 'N', value: sarahChen.coaching.spin.needPayoff, color: 'bg-emerald-500' },
            ].map((s) => (
              <div key={s.label} className="flex items-center gap-1.5">
                <div className={`w-5 h-5 rounded ${s.color} flex items-center justify-center`}>
                  <span className="text-[10px] font-bold text-white">{s.label}</span>
                </div>
                <span className="text-xs font-semibold text-gray-700">{s.value}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Full Slack message */}
      <SlackMessagePreview {...coachingMessage} />
    </motion.div>
  );
}
