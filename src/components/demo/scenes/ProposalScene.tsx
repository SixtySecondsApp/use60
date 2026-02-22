import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Info,
  FileText,
  Link,
  Check,
  Loader2,
  Sparkles,
  Search,
  Target,
  LayoutTemplate,
  Palette,
  PenTool,
  Star,
} from 'lucide-react';
import { SlackMessagePreview } from '../SlackMessagePreview';
import type { SlackMessage } from '../SlackMessagePreview';

const TOOLTIP_TEXT =
  'Powered by Proposal Generation \u2014 AI writes proposals from meeting context, with PDF/DOCX export and Slack HITL review';

const ACCENT = '#6C5CE7';

// Wizard steps for the proposal generation stepper
const wizardSteps = [
  {
    icon: Search,
    loading: 'Selecting meetings...',
    done: 'DataFlow Platform Demo selected',
  },
  {
    icon: Target,
    loading: 'Extracting focus areas...',
    done: 'API integration, Jira compatibility, 99.9% uptime',
  },
  {
    icon: Sparkles,
    loading: 'Generating goals...',
    done: '3 pain points + solutions identified',
  },
  {
    icon: LayoutTemplate,
    loading: 'Selecting template...',
    done: 'Enterprise template (auto-detected from $95K deal)',
  },
  {
    icon: Palette,
    loading: 'Applying brand...',
    done: 'Meridian AI purple, Inter font',
  },
  {
    icon: PenTool,
    loading: 'Generating proposal...',
    done: '8 sections, 3 pricing tiers',
  },
];

const proposalSections = [
  { name: 'Executive Summary', highlighted: false },
  { name: 'Problem Statement', highlighted: false },
  { name: 'Solution Overview', highlighted: false },
  { name: 'Approach', highlighted: false },
  { name: 'Timeline', highlighted: false },
  { name: 'Pricing', highlighted: true },
  { name: 'Terms & Next Steps', highlighted: false },
];

const pricingTiers = [
  { name: 'Starter', price: '$45K', recommended: false },
  { name: 'Professional', price: '$95K', recommended: false },
  { name: 'Enterprise', price: '$150K', recommended: true },
];

const slackMessage: SlackMessage = {
  timestamp: '2:35 PM',
  blocks: [
    { type: 'header', text: 'Proposal Ready: DataFlow AI Support Transformation' },
    {
      type: 'section',
      text: '',
      fields: [
        { label: 'Deal', value: 'DataFlow Inc' },
        { label: 'Contact', value: 'Jake Torres' },
        { label: 'Total Value', value: '$95K \u2014 $150K range' },
      ],
    },
    {
      type: 'context',
      text: '8 sections generated with 3 pricing tiers. Highest tier anchored at $150K.',
    },
    {
      type: 'section',
      text: '**Preview**\n\u2022 **Executive Summary:** DataFlow Systems is scaling rapidly after a successful Series C ($45M), and your engineering-led team needs a customer success platform that integrates...\n\u2022 **Problem Statement:** DataFlow\u2019s customer success operations face three interconnected problems: the engineering-support disconnect, reactive health management...',
    },
    {
      type: 'actions',
      buttons: [
        { text: 'Approve & Send', style: 'primary' },
        { text: 'Edit First', style: 'default' },
        { text: 'Share Link', style: 'default' },
        { text: 'Skip', style: 'default' },
      ],
    },
  ],
};

export default function ProposalScene() {
  const [showTooltip, setShowTooltip] = useState(false);
  const [completedSteps, setCompletedSteps] = useState<number[]>([]);
  const [activeStep, setActiveStep] = useState(0);

  useEffect(() => {
    const timers: ReturnType<typeof setTimeout>[] = [];
    wizardSteps.forEach((_, idx) => {
      // Start each step, then complete it after a delay
      timers.push(
        setTimeout(() => {
          setActiveStep(idx);
        }, idx * 800),
      );
      timers.push(
        setTimeout(() => {
          setCompletedSteps((prev) => [...prev, idx]);
          if (idx < wizardSteps.length - 1) {
            setActiveStep(idx + 1);
          }
        }, idx * 800 + 600),
      );
    });
    return () => timers.forEach(clearTimeout);
  }, []);

  const allDone = completedSteps.length === wizardSteps.length;

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
          <FileText className="w-4 h-4 text-purple-500" />
          <span className="text-sm font-semibold text-gray-600">2:30 PM — Proposal Generation</span>
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

      {/* Part 1: Copilot Command + Stepper */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden max-w-[600px]">
        {/* Mock copilot input */}
        <div className="px-4 pt-4 pb-3 border-b border-gray-100">
          <div className="flex items-center gap-2 mb-3">
            <div
              className="w-6 h-6 rounded-full flex items-center justify-center text-white shrink-0"
              style={{ backgroundColor: ACCENT }}
            >
              <Sparkles className="w-3 h-3" />
            </div>
            <span className="text-xs font-semibold text-gray-400 uppercase tracking-wide">
              Copilot Command
            </span>
          </div>
          <div className="bg-gray-50 rounded-lg border border-gray-200 px-3 py-2">
            <p className="text-sm text-gray-700 font-mono">
              Write a proposal for DataFlow based on today's call
            </p>
          </div>
        </div>

        {/* Stepper */}
        <div className="px-4 py-3 space-y-2">
          {wizardSteps.map((step, idx) => {
            const isCompleted = completedSteps.includes(idx);
            const isActive = activeStep === idx && !isCompleted;
            const Icon = step.icon;

            return (
              <motion.div
                key={idx}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: idx * 0.1, duration: 0.3 }}
                className="flex items-center gap-3"
              >
                <div className="shrink-0">
                  {isCompleted ? (
                    <motion.div
                      initial={{ scale: 0.5 }}
                      animate={{ scale: 1 }}
                      className="w-5 h-5 rounded-full bg-emerald-500 flex items-center justify-center"
                    >
                      <Check className="w-3 h-3 text-white" />
                    </motion.div>
                  ) : isActive ? (
                    <div
                      className="w-5 h-5 rounded-full flex items-center justify-center"
                      style={{ backgroundColor: `${ACCENT}20` }}
                    >
                      <Loader2
                        className="w-3 h-3 animate-spin"
                        style={{ color: ACCENT }}
                      />
                    </div>
                  ) : (
                    <div className="w-5 h-5 rounded-full bg-gray-100 flex items-center justify-center">
                      <Icon className="w-3 h-3 text-gray-400" />
                    </div>
                  )}
                </div>
                <p
                  className={`text-xs ${
                    isCompleted
                      ? 'text-gray-700'
                      : isActive
                        ? 'text-gray-600 font-medium'
                        : 'text-gray-400'
                  }`}
                >
                  {isCompleted ? step.done : step.loading}
                </p>
              </motion.div>
            );
          })}
        </div>
      </div>

      {/* Part 2: Proposal Preview Card (appears after steps complete) */}
      <AnimatePresence>
        {allDone && (
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="bg-white rounded-xl border border-gray-200 overflow-hidden max-w-[600px]"
          >
            {/* Cover section with accent stripe */}
            <div className="relative">
              <div
                className="absolute left-0 top-0 bottom-0 w-1.5"
                style={{ backgroundColor: ACCENT }}
              />
              <div className="pl-5 pr-4 pt-4 pb-3">
                <p className="text-base font-bold text-gray-900">
                  DataFlow Inc — AI-Powered Support Transformation
                </p>
                <p className="text-xs text-gray-400 mt-1">
                  Prepared by Sarah Chen | March 3, 2026 | Proposal #MER-2026-0847
                </p>
              </div>
            </div>

            {/* Section list */}
            <div className="px-4 pb-3 border-b border-gray-100">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">
                Sections
              </p>
              <div className="space-y-1">
                {proposalSections.map((s) => (
                  <div
                    key={s.name}
                    className={`flex items-center gap-2 px-2 py-1 rounded text-xs ${
                      s.highlighted
                        ? 'bg-purple-50 text-purple-700 font-semibold'
                        : 'text-gray-600'
                    }`}
                  >
                    <FileText className="w-3 h-3 shrink-0" />
                    <span>{s.name}</span>
                    {s.highlighted && (
                      <span
                        className="ml-auto text-[10px] px-1.5 py-0.5 rounded-full text-white"
                        style={{ backgroundColor: ACCENT }}
                      >
                        Expanded
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* Pricing tiers */}
            <div className="px-4 py-3 border-b border-gray-100">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">
                Pricing Tiers
              </p>
              <div className="grid grid-cols-3 gap-2">
                {pricingTiers.map((tier) => (
                  <div
                    key={tier.name}
                    className={`relative rounded-lg border p-3 text-center ${
                      tier.recommended
                        ? 'border-purple-300 bg-purple-50'
                        : 'border-gray-200 bg-gray-50'
                    }`}
                  >
                    {tier.recommended && (
                      <div className="absolute -top-2 left-1/2 -translate-x-1/2">
                        <span
                          className="flex items-center gap-1 text-[9px] font-bold text-white px-2 py-0.5 rounded-full"
                          style={{ backgroundColor: ACCENT }}
                        >
                          <Star className="w-2.5 h-2.5" />
                          Recommended
                        </span>
                      </div>
                    )}
                    <p className="text-xs font-semibold text-gray-700 mt-1">{tier.name}</p>
                    <p
                      className={`text-lg font-bold ${
                        tier.recommended ? 'text-purple-700' : 'text-gray-900'
                      }`}
                    >
                      {tier.price}
                    </p>
                    <p className="text-[10px] text-gray-400">/year</p>
                  </div>
                ))}
              </div>
            </div>

            {/* Export buttons */}
            <div className="px-4 py-3 flex gap-2">
              <button className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-gray-200 text-xs font-medium text-gray-600 hover:bg-gray-50 transition-colors">
                <FileText className="w-3.5 h-3.5" />
                Download PDF
              </button>
              <button className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-gray-200 text-xs font-medium text-gray-600 hover:bg-gray-50 transition-colors">
                <FileText className="w-3.5 h-3.5" />
                Download DOCX
              </button>
              <button className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-gray-200 text-xs font-medium text-gray-600 hover:bg-gray-50 transition-colors">
                <Link className="w-3.5 h-3.5" />
                Share Link
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Part 3: Slack DM */}
      <AnimatePresence>
        {allDone && (
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.3 }}
          >
            <SlackMessagePreview {...slackMessage} />
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
