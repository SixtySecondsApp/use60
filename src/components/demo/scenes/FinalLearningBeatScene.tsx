import { useState } from 'react';
import { motion } from 'framer-motion';
import {
  Info,
  Sparkles,
  CheckCircle2,
  Database,
  FileText,
  Send,
  Clock,
  Award,
} from 'lucide-react';
import { SlackMessagePreview } from '../SlackMessagePreview';
import type { SlackMessage } from '../SlackMessagePreview';

const ACCENT = '#6C5CE7';

const TOOLTIP_TEXT =
  'Powered by Graduated Autonomy + Behavioral Learning \u2014 the AI earns trust over time, learns from patterns (not just explicit config), and grows its capabilities autonomously';

const behavioralMessage: SlackMessage = {
  timestamp: 'Day 26',
  blocks: [
    { type: 'header', text: 'Quick question, Sarah' },
    {
      type: 'section',
      text: "I noticed you always edit my email drafts to be shorter and remove the formal sign-off. Should I default to a more concise writing style going forward?",
    },
    {
      type: 'actions',
      buttons: [
        { text: 'Yes, shorter is better', style: 'primary' },
        { text: 'Keep as is', style: 'default' },
      ],
    },
    {
      type: 'context',
      text: 'This insight was learned from observing 12 email edits over 3 weeks \u2014 not from a direct question.',
    },
  ],
};

interface Milestone {
  day: number;
  label: string;
  color: string;
  bgColor: string;
}

const milestones: Milestone[] = [
  { day: 1, label: 'Conservative', color: 'bg-gray-400', bgColor: 'bg-gray-100' },
  { day: 8, label: 'Balanced', color: 'bg-blue-500', bgColor: 'bg-blue-100' },
  { day: 18, label: 'Auto-approve CRM', color: 'bg-violet-500', bgColor: 'bg-violet-100' },
  { day: 22, label: 'Auto-send prep', color: 'bg-emerald-500', bgColor: 'bg-emerald-100' },
];

const stats = [
  { icon: CheckCircle2, label: 'Actions taken', value: '142' },
  { icon: Database, label: 'CRM updates auto-approved', value: '47' },
  { icon: Send, label: 'Meeting preps auto-sent', value: '28' },
  { icon: Clock, label: 'Corrections needed', value: '0' },
];

export default function FinalLearningBeatScene() {
  const [showTooltip, setShowTooltip] = useState(false);

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
      className="space-y-5"
    >
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-violet-500" />
          <span className="text-sm font-semibold text-gray-600">
            The Learning Never Stops
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

      {/* Part 1: Behavioral learning Slack DM */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.15 }}
      >
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
          Behavioral Learning
        </p>
        <SlackMessagePreview {...behavioralMessage} />
      </motion.div>

      {/* Part 2: Graduated Autonomy summary */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3 }}
        className="rounded-lg border border-gray-200 bg-white overflow-hidden"
      >
        <div className="p-4">
          <div className="flex items-center gap-2 mb-4">
            <Award className="w-4 h-4 text-amber-500" />
            <p className="text-sm font-semibold text-gray-900">
              Your AI Teammate — 30 Day Journey
            </p>
          </div>

          {/* Horizontal timeline */}
          <div className="relative mb-4">
            {/* Track */}
            <div className="h-1.5 rounded-full bg-gray-100 mx-2">
              <motion.div
                className="h-full rounded-full bg-gradient-to-r from-gray-400 via-violet-500 to-emerald-500"
                initial={{ width: 0 }}
                animate={{ width: '100%' }}
                transition={{ duration: 1.2, delay: 0.5 }}
              />
            </div>

            {/* Milestone dots */}
            <div className="flex justify-between mt-2 px-0">
              {milestones.map((m, idx) => (
                <motion.div
                  key={m.day}
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: 0.6 + idx * 0.15 }}
                  className="flex flex-col items-center"
                  style={{ width: '25%' }}
                >
                  <div
                    className={`w-4 h-4 rounded-full ${m.color} border-2 border-white shadow-sm -mt-[13px]`}
                  />
                  <span className="text-[10px] font-bold text-gray-700 mt-1.5">Day {m.day}</span>
                  <span
                    className={`text-[9px] font-medium px-1.5 py-0.5 rounded-full ${m.bgColor} text-gray-600 mt-0.5`}
                  >
                    {m.label}
                  </span>
                </motion.div>
              ))}
            </div>
          </div>

          {/* Stats grid */}
          <div className="grid grid-cols-4 gap-2 mt-4">
            {stats.map((s) => {
              const Icon = s.icon;
              return (
                <div
                  key={s.label}
                  className="text-center rounded-lg bg-gray-50 border border-gray-100 py-2 px-1"
                >
                  <Icon className="w-3.5 h-3.5 text-gray-400 mx-auto mb-1" />
                  <p className="text-sm font-bold text-gray-900">{s.value}</p>
                  <p className="text-[9px] text-gray-500 leading-tight mt-0.5">{s.label}</p>
                </div>
              );
            })}
          </div>

          {/* Final completeness */}
          <div className="flex items-center justify-between mt-4 pt-3 border-t border-gray-100">
            <div className="flex items-center gap-2">
              <FileText className="w-3.5 h-3.5 text-gray-400" />
              <span className="text-xs text-gray-600">Final Config Completeness</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold px-2 py-0.5 rounded-full border bg-amber-100 text-amber-700 border-amber-200">
                Learning
              </span>
              <span className="text-sm font-bold text-gray-900">94%</span>
            </div>
          </div>
        </div>
      </motion.div>

      {/* Part 3: Closing CTA */}
      <motion.div
        initial={{ opacity: 0, scale: 0.96 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ delay: 0.8, duration: 0.6 }}
        className="rounded-xl overflow-hidden"
        style={{
          background: 'linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%)',
        }}
      >
        <div className="relative p-6 text-center">
          {/* Accent glow */}
          <div
            className="absolute inset-0 opacity-20"
            style={{
              background:
                'radial-gradient(circle at 50% 50%, #6C5CE7 0%, transparent 60%)',
            }}
          />

          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 1.0, duration: 0.5 }}
            className="relative z-10"
          >
            <div
              className="w-10 h-10 rounded-full mx-auto mb-4 flex items-center justify-center"
              style={{ backgroundColor: ACCENT }}
            >
              <Sparkles className="w-5 h-5 text-white" />
            </div>
            <h3 className="text-lg font-bold text-white mb-2">
              This is 60. Always on. Always learning. Always your teammate.
            </h3>
            <p className="text-sm text-gray-400 max-w-lg mx-auto leading-relaxed">
              From zero configuration to full autopilot in 30 days — learning from every meeting,
              every email, every interaction.
            </p>
          </motion.div>
        </div>
      </motion.div>
    </motion.div>
  );
}
