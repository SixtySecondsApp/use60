import { useState } from 'react';
import { motion } from 'framer-motion';
import { Info, Users } from 'lucide-react';
import { SlackMessagePreview } from '../SlackMessagePreview';
import type { SlackMessage } from '../SlackMessagePreview';

const TOOLTIP_TEXT =
  'Powered by Internal Meeting Prep \u2014 detects same-domain meetings and builds context for 1:1s, pipeline reviews, QBRs, and standups';

const meetingPrepMessage: SlackMessage = {
  timestamp: '3:45 PM',
  blocks: [
    { type: 'header', text: '1:1 Prep: Meeting with James at 4:00 PM' },
    {
      type: 'context',
      text: "Here's your prep for your manager 1:1",
    },
    { type: 'divider' },
    {
      type: 'rich_text',
      content: `**Since your last 1:1 (Feb 14):**
\u2022 **Closed:** DataBridge \u2014 \u00a312,000 (3 days ahead of schedule)
\u2022 **Progressed:** DataFlow Discovery \u2192 Negotiation (+$95K)
\u2022 **At risk:** CloudBase \u2014 18 days in Proposal, champion quiet
\u2022 **New:** TechVault \u2014 \u00a338K, Discovery stage`,
    },
    { type: 'divider' },
    {
      type: 'rich_text',
      content: `**Coaching Note**
Your talk-to-listen ratio improved this week (42% vs 55% last week). Your discovery questions are getting stronger \u2014 the DataFlow demo was a great example.`,
    },
    { type: 'divider' },
    {
      type: 'rich_text',
      content: `**Suggested Topics to Raise**
\u2022 Need manager help with CloudBase (executive sponsor intro?)
\u2022 TechVault deal \u2014 they want a reference customer. Do we have one in their vertical?
\u2022 Capacity \u2014 3 new meetings booked next week, pipeline review Thursday`,
    },
    {
      type: 'actions',
      buttons: [
        { text: 'Edit Prep', style: 'default' },
        { text: 'Send to James as Pre-read', style: 'primary' },
        { text: 'Dismiss', style: 'default' },
      ],
    },
  ],
};

export default function InternalMeetingPrepScene() {
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
          <Users className="w-4 h-4 text-blue-500" />
          <span className="text-sm font-semibold text-gray-600">3:45 PM — 1:1 Prep</span>
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

      <SlackMessagePreview {...meetingPrepMessage} />
    </motion.div>
  );
}
