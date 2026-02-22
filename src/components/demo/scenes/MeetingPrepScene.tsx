import { useState } from 'react';
import { motion } from 'framer-motion';
import { Info, Clock, AlertTriangle } from 'lucide-react';
import { SlackMessagePreview } from '../SlackMessagePreview';
import type { SlackMessage } from '../SlackMessagePreview';

const TOOLTIP_TEXT =
  'Powered by Pre-Meeting Intelligence \u2014 auto-preps 30 minutes before calls with attendee profiles, risk signals, and talking points';

const meetingPrep: SlackMessage = {
  timestamp: '9:30 AM',
  blocks: [
    { type: 'header', text: 'Heads up \u2014 DataFlow Inc demo in 30 minutes' },
    {
      type: 'section',
      text: '**Meeting Details**',
      fields: [
        { label: 'Meeting', value: 'DataFlow Platform Demo \u00b7 10:00 AM' },
        { label: 'Duration', value: '60 min' },
      ],
    },
    {
      type: 'section',
      text: '**Attendees**\n\u2022 **Jake Torres** \u2014 VP Engineering \u00b7 Decision Maker \u00b7 4 meetings\n\u2022 **Lisa Park** \u2014 Head of CX \u00b7 Champion \u00b7 6 meetings\n\u2022 **Sophie Wright** \u2014 Product Manager \u00b7 1st meeting',
    },
    {
      type: 'section',
      text: '**Deal Context**',
      fields: [
        { label: 'Value', value: '$95,000' },
        { label: 'Stage', value: 'Proposal' },
        { label: 'Days in Pipeline', value: '45' },
        { label: 'Close Date', value: 'April 5' },
      ],
    },
    { type: 'divider' },
    {
      type: 'section',
      text: '**Talking Points**\n\u2022 Jake cares about API latency \u2014 reference your 99.9% uptime SLA\n\u2022 Lisa is your champion \u2014 she used a competitor at her last company and wasn\u2019t happy\n\u2022 Sophie is new \u2014 build rapport, understand her product priorities',
    },
    {
      type: 'context',
      text: '\u26a0\ufe0f Risk Signal: Competitor mention (Intercom) in Jake\u2019s last email \u2014 prepare battlecard positioning',
    },
    {
      type: 'actions',
      buttons: [
        { text: 'View Full Brief', style: 'primary' },
        { text: 'Open Deal', style: 'default' },
        { text: 'Snooze', style: 'default' },
      ],
    },
  ],
};

export default function MeetingPrepScene() {
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
          <Clock className="w-4 h-4 text-blue-500" />
          <span className="text-sm font-semibold text-gray-600">9:30 AM</span>
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

      <SlackMessagePreview {...meetingPrep} />
    </motion.div>
  );
}
