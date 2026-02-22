import { useState } from 'react';
import { motion } from 'framer-motion';
import { Info, RefreshCw, Mail } from 'lucide-react';
import { SlackMessagePreview } from '../SlackMessagePreview';
import type { SlackMessage } from '../SlackMessagePreview';

const TOOLTIP_TEXT =
  'Powered by Re-engagement Trigger \u2014 monitors closed-lost deals for buying signals (job changes, funding, company news) and drafts personalized outreach';

const reengagementMessage: SlackMessage = {
  timestamp: '5:15 PM',
  blocks: [
    { type: 'header', text: 'Re-engagement Opportunity: Pinnacle Partners' },
    {
      type: 'section',
      text: '',
      fields: [
        { label: 'Deal', value: '$45,000' },
        { label: 'Status', value: 'Closed Lost \u2014 32 days' },
        { label: 'Original Objection', value: 'Budget concerns' },
      ],
    },
    { type: 'divider' },
    {
      type: 'rich_text',
      content: `**Signal Detected**
David Kim (former champion) just posted on LinkedIn about scaling his customer success team. Pinnacle Partners also announced a new funding round ($15M Series B) last week.`,
    },
    {
      type: 'rich_text',
      content: `**Stall Analysis**
Original close-lost reason: budget constraints. New funding round likely removes this blocker. David was very positive about the product during evaluation \u2014 relationship strength: 72/100.`,
    },
    { type: 'divider' },
    {
      type: 'rich_text',
      content: `**Draft Re-engagement Email:**`,
    },
  ],
};

export default function ReengagementScene() {
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
          <RefreshCw className="w-4 h-4 text-teal-500" />
          <span className="text-sm font-semibold text-gray-600">
            5:15 PM — Re-engagement Signal
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

      {/* Custom Slack-style card with embedded email preview */}
      <div
        className="bg-white rounded-lg shadow-sm border border-gray-200 max-w-[600px] overflow-hidden"
        style={{ borderLeft: '3px solid #6C5CE7' }}
      >
        <div className="p-4">
          {/* Bot header */}
          <div className="flex items-center gap-2 mb-3">
            <div className="w-8 h-8 rounded-full flex items-center justify-center text-white shrink-0 bg-[#6C5CE7]">
              <RefreshCw className="w-4 h-4" />
            </div>
            <span className="font-bold text-sm text-gray-900">60 Sales Copilot</span>
            <span className="text-xs text-gray-400">5:15 PM</span>
          </div>

          {/* Header */}
          <p className="text-base font-bold text-gray-900 mt-1 mb-1">
            Re-engagement Opportunity: Pinnacle Partners
          </p>

          {/* Fields */}
          <div className="grid grid-cols-2 gap-x-4 gap-y-1 mt-2 mb-2">
            {[
              { label: 'Deal', value: '$45,000' },
              { label: 'Status', value: 'Closed Lost \u2014 32 days' },
              { label: 'Original Objection', value: 'Budget concerns' },
            ].map((f) => (
              <div key={f.label}>
                <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                  {f.label}
                </span>
                <p className="text-sm text-gray-800">{f.value}</p>
              </div>
            ))}
          </div>

          <hr className="my-2 border-gray-200" />

          {/* Signal Detected */}
          <p className="text-sm font-semibold text-gray-700 mb-1">Signal Detected</p>
          <p className="text-sm text-gray-700 mb-2">
            David Kim (former champion) just posted on LinkedIn about scaling his customer success
            team. Pinnacle Partners also announced a new funding round ($15M Series B) last week.
          </p>

          {/* Stall Analysis */}
          <p className="text-sm font-semibold text-gray-700 mb-1">Stall Analysis</p>
          <p className="text-sm text-gray-700 mb-2">
            Original close-lost reason: budget constraints. New funding round likely removes this
            blocker. David was very positive about the product during evaluation — relationship
            strength: 72/100.
          </p>

          <hr className="my-2 border-gray-200" />

          {/* Draft Email Preview */}
          <p className="text-sm font-semibold text-gray-700 mb-2">Draft Re-engagement Email:</p>
          <div className="rounded-lg border border-gray-200 bg-gray-50 overflow-hidden mb-3">
            {/* Email header */}
            <div className="px-3 py-2 border-b border-gray-200 bg-white">
              <div className="flex items-center gap-2">
                <Mail className="w-3.5 h-3.5 text-gray-400" />
                <div>
                  <p className="text-xs text-gray-400">Subject:</p>
                  <p className="text-xs font-semibold text-gray-700">
                    Congrats on the raise, David — quick thought
                  </p>
                </div>
              </div>
            </div>
            {/* Email body */}
            <div className="px-3 py-2.5 space-y-2">
              <p className="text-xs text-gray-600 leading-relaxed">
                Saw the news about Pinnacle's Series B — congrats!
              </p>
              <p className="text-xs text-gray-600 leading-relaxed">
                Given the team's growth plans you mentioned, the support automation conversation
                might be worth revisiting.
              </p>
              <p className="text-xs text-gray-600 leading-relaxed">
                Happy to share what's new since we last spoke — including the Jira integration you
                asked about.
              </p>
            </div>
          </div>

          {/* Actions */}
          <div className="flex flex-wrap gap-2 my-1">
            <button
              className="px-3 py-1.5 rounded text-sm font-medium text-white cursor-pointer"
              style={{ backgroundColor: '#6C5CE7' }}
            >
              Send Email
            </button>
            <button className="px-3 py-1.5 rounded text-sm font-medium text-gray-700 border border-gray-300 bg-white hover:bg-gray-50 cursor-pointer">
              Edit Draft
            </button>
            <button className="px-3 py-1.5 rounded text-sm font-medium text-gray-700 border border-gray-300 bg-white hover:bg-gray-50 cursor-pointer">
              Snooze 14 Days
            </button>
            <button className="px-3 py-1.5 rounded text-sm font-medium text-gray-700 border border-gray-300 bg-white hover:bg-gray-50 cursor-pointer">
              Dismiss
            </button>
          </div>
        </div>
      </div>
    </motion.div>
  );
}
