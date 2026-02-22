import { useState } from 'react';
import { motion } from 'framer-motion';
import { Info, Moon } from 'lucide-react';
import { SlackMessagePreview } from '../SlackMessagePreview';
import type { SlackMessage } from '../SlackMessagePreview';

const TOOLTIP_TEXT =
  'Powered by EOD Synthesis \u2014 daily scorecard, open items, tomorrow preview, and overnight work plan. Creates a continuous morning\u2192day\u2192evening\u2192overnight\u2192morning loop.';

const eodMessage: SlackMessage = {
  timestamp: '6:00 PM',
  blocks: [
    { type: 'header', text: 'End of Day \u2014 Tuesday, March 3rd' },
    {
      type: 'section',
      text: '**Today\u2019s Scorecard**',
      fields: [
        { label: 'Meetings', value: '4 completed, 0 no-shows' },
        { label: 'Emails Sent', value: '12' },
        { label: 'CRM Updates', value: '4 fields approved' },
        { label: 'Tasks Completed', value: '3' },
        { label: 'Deals Progressed', value: '1 \u2014 DataFlow to Negotiation' },
        { label: 'Pipeline Value', value: '+\u00a395K today' },
      ],
    },
    { type: 'divider' },
    {
      type: 'rich_text',
      content: `**Open Items**
\u2022 Reply to Jake Torres \u2014 Jira docs request (3 hours waiting)
\u2022 Reply to Maria Chen \u2014 follow-up email drafted but not sent (14 days waiting)
\u2022 Action item: Send case study to Tom Richards (overdue 3 days)`,
    },
    { type: 'divider' },
    {
      type: 'rich_text',
      content: `**Tomorrow Preview**
\u2022 9:30 AM \u2014 Intro call with new lead (Apex Systems)
\u2022 11:00 AM \u2014 Team standup
\u2022 2:00 PM \u2014 1:1 with James (Manager)`,
    },
    {
      type: 'context',
      text: 'Prep will be delivered at 7:45 AM',
    },
    { type: 'divider' },
    {
      type: 'rich_text',
      content: `**Overnight Plan**
\u2022 Prep briefs for tomorrow\u2019s 3 meetings
\u2022 Monitor CloudBase for email opens or website visits
\u2022 Run weekly pipeline pattern analysis
\u2022 Process 2 new Instantly campaign replies
\u2022 Enrich 3 new contacts from today\u2019s meetings`,
    },
    {
      type: 'actions',
      buttons: [
        { text: 'Looks Good', style: 'primary' },
        { text: 'Adjust Priorities', style: 'default' },
        { text: 'Add a Task', style: 'default' },
      ],
    },
  ],
};

export default function EODSynthesisScene() {
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
          <Moon className="w-4 h-4 text-indigo-500" />
          <span className="text-sm font-semibold text-gray-600">6:00 PM — End of Day</span>
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

      <SlackMessagePreview {...eodMessage} />
    </motion.div>
  );
}
