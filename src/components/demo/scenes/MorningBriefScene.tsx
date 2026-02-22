import { useState } from 'react';
import { motion } from 'framer-motion';
import { Info, Sun } from 'lucide-react';
import { SlackMessagePreview } from '../SlackMessagePreview';
import type { SlackMessage } from '../SlackMessagePreview';

const TOOLTIP_TEXT =
  'Powered by Enhanced Morning Briefing \u2014 delivers at your preferred time with pipeline math, quarter context, and AI-prioritized actions';

const morningBrief: SlackMessage = {
  timestamp: '7:45 AM',
  blocks: [
    { type: 'header', text: 'Good morning, Sarah! Tuesday, March 3rd' },
    {
      type: 'section',
      text: '**Today\u2019s Meetings (4)**\n\u2022 10:00 AM \u2014 DataFlow Platform Demo \u00b7 Jake Torres \u00b7 $95K \u00b7 Negotiation\n\u2022 11:00 AM \u2014 Team Standup \u00b7 Pipeline & Priorities\n\u2022 11:30 AM \u2014 CloudBase Contract Follow-Up \u00b7 Maria Chen \u00b7 $72K \u00b7 Proposal\n\u2022 2:00 PM \u2014 TechVault Discovery Call \u00b7 Rachel Adams \u00b7 $38K \u00b7 Discovery',
    },
    { type: 'divider' },
    {
      type: 'section',
      text: '**Overdue Tasks (2)**\n\u2022 Send case study to Tom Richards \u2014 `3 days overdue`\n\u2022 Update CloudBase proposal \u2014 `5 days overdue`',
    },
    {
      type: 'section',
      text: '**Deals Closing This Week**\n\u2022 DataFlow Inc \u2014 $95K \u00b7 Stage changed to Negotiation \u00b7 `NEW STAGE`\n\u2022 Meridian Group \u2014 $22K \u00b7 Proposal for 18 days \u00b7 `STALE`',
    },
    { type: 'divider' },
    {
      type: 'section',
      text: '**Signal Watch**\n\u2022 DataFlow Inc heating up (+0.3)\n\u2022 CloudBase Technologies cooling (-0.22)',
    },
    {
      type: 'section',
      text: '**AI Priorities**\n\u2022 **Priority 1:** Prep for DataFlow demo at 10am \u2014 they just raised Series A\n\u2022 **Priority 2:** Re-engage Maria Chen at CloudBase \u2014 14 days silent\n\u2022 **Priority 3:** Schedule TechVault technical deep-dive',
    },
    {
      type: 'actions',
      buttons: [
        { text: 'View Dashboard', style: 'primary' },
        { text: 'Open Pipeline', style: 'default' },
      ],
    },
  ],
};

export default function MorningBriefScene() {
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
          <Sun className="w-4 h-4 text-amber-500" />
          <span className="text-sm font-semibold text-gray-600">7:45 AM</span>
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

      <SlackMessagePreview {...morningBrief} />
    </motion.div>
  );
}
