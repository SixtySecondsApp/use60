import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Info, Database, Check, CheckCircle2 } from 'lucide-react';
import { SlackMessagePreview } from '../SlackMessagePreview';
import type { SlackMessage } from '../SlackMessagePreview';

const TOOLTIP_TEXT =
  'Powered by Auto CRM Update \u2014 5-step pipeline: extract \u2192 classify \u2192 auto-apply \u2192 sync \u2192 HITL approval';

interface FieldChange {
  field: string;
  from: string;
  to: string;
  confidence: 'High' | 'Medium';
}

const fieldChanges: FieldChange[] = [
  { field: 'Deal Stage', from: 'Proposal', to: 'Negotiation', confidence: 'High' },
  { field: 'Next Step', from: '\u2014', to: 'Send Jira integration docs', confidence: 'High' },
  { field: 'Close Date', from: 'March 28', to: 'April 5', confidence: 'Medium' },
  {
    field: 'Decision Criteria',
    from: '\u2014',
    to: 'Added "Jira integration required"',
    confidence: 'Medium',
  },
];

export default function CRMUpdateScene() {
  const [showTooltip, setShowTooltip] = useState(false);
  const [approved, setApproved] = useState(false);

  const slackMessage: SlackMessage = {
    timestamp: '11:08 AM',
    blocks: [
      { type: 'header', text: 'CRM Update: DataFlow Inc' },
      {
        type: 'context',
        text: 'I detected 4 field changes from your DataFlow call',
      },
      {
        type: 'section',
        text: '**Proposed Changes**\n\u2022 **Deal Stage:** Proposal \u2192 Negotiation \u00b7 `High Confidence`\n\u2022 **Next Step:** Send Jira integration docs \u00b7 `High Confidence`\n\u2022 **Close Date:** March 28 \u2192 April 5 \u00b7 `Medium Confidence`\n\u2022 **Decision Criteria:** Added "Jira integration required" \u00b7 `Medium Confidence`',
      },
      {
        type: 'context',
        text: '2 high-confidence changes can be auto-applied. 2 medium-confidence changes need your review.',
      },
      {
        type: 'actions',
        buttons: [
          {
            text: 'Approve All',
            style: 'primary',
            onClick: () => setApproved(true),
          },
          { text: 'Edit', style: 'default' },
          { text: 'Reject', style: 'danger' },
        ],
      },
    ],
  };

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
          <Database className="w-4 h-4 text-violet-500" />
          <span className="text-sm font-semibold text-gray-600">11:08 AM</span>
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

      <AnimatePresence mode="wait">
        {!approved ? (
          <motion.div
            key="pending"
            exit={{ opacity: 0, scale: 0.98 }}
            transition={{ duration: 0.2 }}
          >
            <SlackMessagePreview {...slackMessage} />
          </motion.div>
        ) : (
          <motion.div
            key="confirmed"
            initial={{ opacity: 0, scale: 0.98 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.4 }}
            className="bg-white rounded-lg shadow-sm border border-gray-200 max-w-[600px] overflow-hidden"
            style={{ borderLeft: '3px solid #22c55e' }}
          >
            <div className="p-4">
              {/* Header with success */}
              <div className="flex items-center gap-2 mb-4">
                <motion.div
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{ type: 'spring', stiffness: 400, damping: 15, delay: 0.1 }}
                  className="w-8 h-8 rounded-full bg-emerald-100 flex items-center justify-center shrink-0"
                >
                  <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                </motion.div>
                <div>
                  <p className="text-sm font-bold text-gray-900">CRM Updated</p>
                  <p className="text-xs text-gray-400">
                    DataFlow Inc \u2014 4 fields updated at 11:08 AM
                  </p>
                </div>
              </div>

              {/* Field changes with checkmarks */}
              <div className="space-y-2">
                {fieldChanges.map((change, idx) => (
                  <motion.div
                    key={change.field}
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.2 + idx * 0.1 }}
                    className="flex items-center gap-2.5 py-1.5 px-2 rounded bg-emerald-50/50"
                  >
                    <motion.div
                      initial={{ scale: 0 }}
                      animate={{ scale: 1 }}
                      transition={{
                        type: 'spring',
                        stiffness: 500,
                        damping: 20,
                        delay: 0.3 + idx * 0.1,
                      }}
                    >
                      <Check className="w-4 h-4 text-emerald-600" />
                    </motion.div>
                    <div className="flex-1 min-w-0">
                      <span className="text-xs font-semibold text-gray-500">
                        {change.field}
                      </span>
                      <p className="text-sm text-gray-800 truncate">
                        {change.from !== '\u2014' ? (
                          <>
                            <span className="text-gray-400 line-through">{change.from}</span>
                            {' \u2192 '}
                          </>
                        ) : null}
                        <span className="font-medium">{change.to}</span>
                      </p>
                    </div>
                    <span
                      className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full shrink-0 ${
                        change.confidence === 'High'
                          ? 'bg-emerald-100 text-emerald-700'
                          : 'bg-amber-100 text-amber-700'
                      }`}
                    >
                      {change.confidence}
                    </span>
                  </motion.div>
                ))}
              </div>

              {/* Confetti-like particles */}
              <div className="relative h-0 overflow-visible">
                {[...Array(8)].map((_, i) => (
                  <motion.div
                    key={i}
                    initial={{
                      opacity: 1,
                      x: 250 + (Math.random() - 0.5) * 100,
                      y: -20,
                      scale: 1,
                    }}
                    animate={{
                      opacity: 0,
                      x: 250 + (Math.random() - 0.5) * 300,
                      y: -60 - Math.random() * 40,
                      scale: 0,
                      rotate: Math.random() * 360,
                    }}
                    transition={{ duration: 0.8, delay: 0.2 + i * 0.05, ease: 'easeOut' }}
                    className="absolute w-1.5 h-1.5 rounded-full"
                    style={{
                      backgroundColor: ['#6C5CE7', '#22c55e', '#f59e0b', '#3b82f6'][i % 4],
                    }}
                  />
                ))}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
