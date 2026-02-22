import { useState } from 'react';
import { motion } from 'framer-motion';
import { Info, FileText, Plus } from 'lucide-react';
import { SlackMessagePreview } from '../SlackMessagePreview';
import type { SlackMessage } from '../SlackMessagePreview';

const TOOLTIP_TEXT =
  'Powered by Meeting Debrief \u2014 automatic coaching scores, action item extraction, and buying signal detection';

const postMeetingDebrief: SlackMessage = {
  timestamp: '11:05 AM',
  blocks: [
    { type: 'header', text: 'Meeting Complete: DataFlow Platform Demo' },
    {
      type: 'section',
      text: '**Meeting Summary**',
      fields: [
        { label: 'Duration', value: '58 min' },
        { label: 'Sentiment', value: 'Positive \u2014 0.82' },
        { label: 'Talk Ratio', value: '38% \u2014 target 43%' },
      ],
    },
    {
      type: 'context',
      text: 'Good listening ratio \u2014 slightly under target but appropriate for a demo call',
    },
    { type: 'divider' },
    {
      type: 'section',
      text: '**3 Action Items Detected**\n\u2022 1. Send Jira integration documentation to Jake\n\u2022 2. Schedule follow-up technical deep-dive with Sophie\n\u2022 3. Prepare pricing breakdown for enterprise tier',
    },
    {
      type: 'actions',
      buttons: [
        { text: 'Add Task: Jira Docs', style: 'default' },
        { text: 'Add Task: Deep-Dive', style: 'default' },
        { text: 'Add Task: Pricing', style: 'default' },
      ],
    },
    { type: 'divider' },
    {
      type: 'section',
      text: '**Key Quote**\nJake said: *"If you can integrate with our Jira, this is a no-brainer"*',
    },
    {
      type: 'context',
      text: 'This buying signal has been logged and the deal temperature has been updated (+0.15)',
    },
    {
      type: 'actions',
      buttons: [
        { text: 'View Full Debrief', style: 'primary' },
        { text: 'Open Deal', style: 'default' },
      ],
    },
  ],
};

export default function PostMeetingDebriefScene() {
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
          <FileText className="w-4 h-4 text-emerald-500" />
          <span className="text-sm font-semibold text-gray-600">11:05 AM</span>
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

      <SlackMessagePreview {...postMeetingDebrief} />
    </motion.div>
  );
}
