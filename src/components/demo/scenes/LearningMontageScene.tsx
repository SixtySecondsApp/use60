import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Info, Settings, Clock, CheckCircle2, ArrowRight } from 'lucide-react';
import { SlackMessagePreview } from '../SlackMessagePreview';
import type { SlackMessage } from '../SlackMessagePreview';

const TOOLTIP_TEXT =
  'Powered by Progressive Learning \u2014 contextual questions triggered by real events, delivered via Slack or in-app, with rate limiting and quiet hours';

interface QuestionCard {
  day: number;
  trigger: string;
  question: string;
  options: string[];
  selectedIndex: number;
  selectedNote?: string;
}

const questions: QuestionCard[] = [
  {
    day: 2,
    trigger: 'After morning briefing',
    question: 'What time works best for your morning brief?',
    options: ['7:00 AM', '7:30 AM', '8:00 AM', '8:30 AM'],
    selectedIndex: 1,
  },
  {
    day: 3,
    trigger: 'After meeting processed',
    question: 'Which methodology are you actually using?',
    options: ['MEDDIC', 'BANT', 'SPIN', 'Other'],
    selectedIndex: 0,
  },
  {
    day: 5,
    trigger: 'After risk alert fired',
    question: 'At what risk score should I alert you?',
    options: ['All risks', 'Medium+', 'High only'],
    selectedIndex: 2,
  },
  {
    day: 7,
    trigger: 'After coaching digest',
    question: 'How often do you want coaching insights?',
    options: ['Daily', 'Weekly', 'Biweekly'],
    selectedIndex: 1,
  },
  {
    day: 9,
    trigger: 'After EOD synthesis',
    question: 'What time should I send your EOD wrap-up?',
    options: ['5:00 PM', '5:30 PM', '6:00 PM', '6:30 PM'],
    selectedIndex: 1,
  },
  {
    day: 11,
    trigger: 'After CRM update approved',
    question: 'Should I auto-apply high-confidence CRM updates?',
    options: ['Yes', 'No', 'Ask each time'],
    selectedIndex: 0,
    selectedNote: 'Autonomy escalation applied',
  },
];

function buildSlackMessage(q: QuestionCard): SlackMessage {
  return {
    timestamp: `Day ${q.day}`,
    blocks: [
      { type: 'section', text: q.question },
      {
        type: 'actions',
        buttons: q.options.map((opt) => ({
          text: opt,
          style: 'default' as const,
        })),
      },
      { type: 'context', text: `Triggered: ${q.trigger}` },
    ],
  };
}

function getTierLabel(pct: number): { label: string; color: string } {
  if (pct < 50) return { label: 'Tuned', color: 'bg-violet-100 text-violet-700 border-violet-200' };
  if (pct < 75) return { label: 'Calibrating', color: 'bg-blue-100 text-blue-700 border-blue-200' };
  return { label: 'Optimised', color: 'bg-emerald-100 text-emerald-700 border-emerald-200' };
}

export default function LearningMontageScene() {
  const [showTooltip, setShowTooltip] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);

  const progressPct = 42 + Math.round((activeIndex / (questions.length - 1)) * (84 - 42));
  const tier = getTierLabel(progressPct);

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
          <Settings className="w-4 h-4 text-violet-500" />
          <span className="text-sm font-semibold text-gray-600">
            Days 2-11 — Progressive Configuration
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

      {/* Vertical timeline of question cards */}
      <div className="relative pl-6">
        {/* Timeline line */}
        <div className="absolute left-[11px] top-0 bottom-0 w-0.5 bg-gray-200" />

        <div className="space-y-4">
          {questions.map((q, idx) => {
            const isActive = idx <= activeIndex;
            const isCurrent = idx === activeIndex;

            return (
              <motion.div
                key={q.day}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.3, delay: idx * 0.08 }}
                className="relative"
              >
                {/* Timeline dot */}
                <div
                  className={`absolute -left-6 top-3 w-[22px] h-[22px] rounded-full border-2 flex items-center justify-center transition-colors ${
                    isActive
                      ? 'border-violet-500 bg-violet-500'
                      : 'border-gray-300 bg-white'
                  }`}
                >
                  {isActive && <CheckCircle2 className="w-3 h-3 text-white" />}
                </div>

                <button
                  onClick={() => setActiveIndex(idx)}
                  className={`w-full text-left rounded-lg border transition-all ${
                    isCurrent
                      ? 'border-violet-300 bg-violet-50/50 shadow-sm'
                      : isActive
                        ? 'border-gray-200 bg-white'
                        : 'border-gray-100 bg-gray-50 opacity-60'
                  }`}
                >
                  <div className="p-3">
                    {/* Day label + trigger */}
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-xs font-bold text-violet-600 bg-violet-100 px-2 py-0.5 rounded">
                        Day {q.day}
                      </span>
                      <div className="flex items-center gap-1 text-xs text-gray-400">
                        <Clock className="w-3 h-3" />
                        {q.trigger}
                      </div>
                    </div>

                    {/* Mini Slack card */}
                    {isCurrent ? (
                      <div className="mb-2">
                        <SlackMessagePreview {...buildSlackMessage(q)} />
                      </div>
                    ) : (
                      <p className="text-sm text-gray-700 mb-2">{q.question}</p>
                    )}

                    {/* Selected answer */}
                    {isActive && (
                      <motion.div
                        initial={{ opacity: 0, y: 4 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="flex items-center gap-2"
                      >
                        <ArrowRight className="w-3 h-3 text-emerald-500" />
                        <span className="text-xs font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full">
                          {q.options[q.selectedIndex]}
                        </span>
                        {q.selectedNote && (
                          <span className="text-[10px] text-amber-600 font-medium">
                            {q.selectedNote}
                          </span>
                        )}
                      </motion.div>
                    )}
                  </div>
                </button>
              </motion.div>
            );
          })}
        </div>
      </div>

      {/* Progress bar + tier badge */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.4 }}
        className="rounded-lg border border-gray-200 bg-white p-4"
      >
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm font-semibold text-gray-700">Configuration Completeness</span>
          <div className="flex items-center gap-2">
            <span className={`text-xs font-bold px-2 py-0.5 rounded-full border ${tier.color}`}>
              {tier.label}
            </span>
            <span className="text-sm font-bold text-gray-900">{progressPct}%</span>
          </div>
        </div>
        <div className="h-2.5 rounded-full bg-gray-100 overflow-hidden">
          <motion.div
            className="h-full rounded-full bg-gradient-to-r from-violet-500 to-emerald-500"
            initial={{ width: '42%' }}
            animate={{ width: `${progressPct}%` }}
            transition={{ duration: 0.6, ease: 'easeOut' }}
          />
        </div>
        <p className="text-xs text-gray-400 mt-1.5">
          {activeIndex + 1} of {questions.length} contextual questions answered
        </p>
      </motion.div>
    </motion.div>
  );
}
