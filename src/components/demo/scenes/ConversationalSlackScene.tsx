import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Info,
  MessageCircle,
  Bot,
  User,
  ChevronDown,
  ChevronRight,
  AlertTriangle,
  Calculator,
  Shield,
  BarChart3,
  Brain,
  FileEdit,
} from 'lucide-react';

const TOOLTIP_TEXT =
  'Powered by Conversational Slack Interface \u2014 natural language deal queries backed by all intelligence layers: risk scorer, pipeline math, competitive intel, relationship graph, and copilot memory';

const ACCENT = '#6C5CE7';

interface ExampleQuery {
  query: string;
  layers: string[];
  layerIcon: typeof AlertTriangle;
  response: string;
}

const exampleQueries: ExampleQuery[] = [
  {
    query: 'Which deals are most at risk?',
    layers: ['Risk Scorer', 'Engagement Signals'],
    layerIcon: AlertTriangle,
    response:
      'Apex Partners ($95K, Negotiation) \u2014 Champion David Kim silent 12 days. TechVault ($65K, Discovery) \u2014 Zendesk contract expires March 31, no legal review started. Vertex AI ($45K) \u2014 Ghost deal, 25 days no activity.',
  },
  {
    query: 'Am I on track for Q1?',
    layers: ['Pipeline Math', 'Temporal Analysis'],
    layerIcon: Calculator,
    response:
      'Q1 target: $120K. Closed: $47.2K (39%). Weighted pipeline: $89.4K. Coverage ratio: 2.1x (target 3.0x). At current close rate (34%), you need $72.8K more. Most likely path: CloudBase ($120K, 85% probability) closes this week, putting you at 94% attainment.',
  },
  {
    query: 'What works when people push back on pricing?',
    layers: ['Competitive Intel', 'Org Learning'],
    layerIcon: Shield,
    response:
      'From 6 pricing objections across your deals: TCO comparison wins 71% of the time. Lead with: "Including agent productivity savings (22% avg improvement) and eliminated point-solution costs, our TCO is 40% lower." Top performers address pricing in Discovery, not Proposal.',
  },
  {
    query: 'Show my pipeline coverage',
    layers: ['Pipeline Math'],
    layerIcon: BarChart3,
    response:
      'Total pipeline: $2.4M. Weighted: $1.35M. Q1 target: $120K. Coverage: 2.1x (need 3.0x). Gap analysis: need $108K in new pipeline or 1 additional deal advancing to Negotiation. Strongest bet: DataFlow ($180K, 65% probability).',
  },
  {
    query: 'Why did we lose the DataBridge deal?',
    layers: ['Deal Memory', 'Pattern Analysis'],
    layerIcon: Brain,
    response:
      'DataBridge ($85K, lost Nov 2025). Root cause: single-threaded \u2014 only one contact engaged (VP Ops). When she went on leave, deal stalled with no backup champion. Contributing: competitor Zendesk was incumbent, and migration risk was never addressed. Pattern match: 3 of your last 4 losses were single-threaded.',
  },
  {
    query: 'Draft a break-up email for CloudBase',
    layers: ['Writing Style', 'Deal Context'],
    layerIcon: FileEdit,
    response:
      'Subject: Next steps for CloudBase?\n\nHi Maria, I wanted to check in \u2014 I know things have been busy on your end. If the timing isn\'t right for Meridian, I completely understand. I\'d rather know now so I can adjust, and we can always revisit when it makes sense. Either way, it\'s been great getting to know your team. Let me know.',
  },
];

export default function ConversationalSlackScene() {
  const [showTooltip, setShowTooltip] = useState(false);
  const [expandedQuery, setExpandedQuery] = useState<number | null>(null);

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
          <MessageCircle className="w-4 h-4 text-violet-500" />
          <span className="text-sm font-semibold text-gray-600">
            Conversational Interface — Natural Language Queries
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

      {/* Slack thread */}
      <div className="rounded-lg border border-gray-200 bg-gray-50 overflow-hidden">
        <div className="px-4 py-2 border-b border-gray-200 bg-white">
          <span className="text-xs font-semibold text-gray-500">Thread in #sarah-copilot</span>
        </div>

        <div className="p-4 space-y-4">
          {/* Message 1: Sarah */}
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="flex items-start gap-3"
          >
            <div className="w-8 h-8 rounded-full bg-gray-200 flex items-center justify-center shrink-0">
              <User className="w-4 h-4 text-gray-500" />
            </div>
            <div>
              <div className="flex items-center gap-2 mb-0.5">
                <span className="text-sm font-bold text-gray-900">Sarah Chen</span>
                <span className="text-xs text-gray-400">2:15 PM</span>
              </div>
              <p className="text-sm text-gray-700">What&apos;s happening with the Acme deal?</p>
            </div>
          </motion.div>

          {/* Message 2: Bot response */}
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
            className="flex items-start gap-3"
          >
            <div
              className="w-8 h-8 rounded-full flex items-center justify-center text-white shrink-0"
              style={{ backgroundColor: ACCENT }}
            >
              <Bot className="w-4 h-4" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-0.5">
                <span className="text-sm font-bold text-gray-900">60 Sales Copilot</span>
                <span className="text-xs text-gray-400">2:15 PM</span>
              </div>
              <div className="text-sm text-gray-700 space-y-2">
                <p>
                  <strong>CloudBase Technologies</strong> ($72K, Proposal stage, 52 days in
                  pipeline)
                </p>
                <p>
                  Your last meeting was Feb 14 with Maria Chen. She agreed to set up an internal
                  demo with their tech team. You sent a follow-up email Feb 15 — she opened it
                  twice but hasn&apos;t replied.
                </p>
                <p>
                  Her response time has slowed from an average of 3.2 hours to 72+ hours over the
                  last two interactions. Risk score is{' '}
                  <strong>High (68/100)</strong>, mainly due to engagement decay and
                  single-threaded contact.
                </p>
                <p>
                  One thing worth noting — an unknown visitor from cloudbase.tech viewed your
                  pricing page yesterday. This could be Maria&apos;s colleague doing research,
                  which would be a positive signal.
                </p>
                <div className="rounded-lg bg-violet-50 border border-violet-200 px-3 py-2 mt-1">
                  <p className="text-xs text-violet-800">
                    <strong>Suggestion:</strong> Try a low-pressure touchpoint — share that case
                    study she mentioned being interested in, rather than asking for a status update.
                  </p>
                </div>
              </div>
            </div>
          </motion.div>

          {/* Message 3: Sarah */}
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.5 }}
            className="flex items-start gap-3"
          >
            <div className="w-8 h-8 rounded-full bg-gray-200 flex items-center justify-center shrink-0">
              <User className="w-4 h-4 text-gray-500" />
            </div>
            <div>
              <div className="flex items-center gap-2 mb-0.5">
                <span className="text-sm font-bold text-gray-900">Sarah Chen</span>
                <span className="text-xs text-gray-400">2:16 PM</span>
              </div>
              <p className="text-sm text-gray-700">Draft that email</p>
            </div>
          </motion.div>

          {/* Message 4: Bot email draft */}
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.7 }}
            className="flex items-start gap-3"
          >
            <div
              className="w-8 h-8 rounded-full flex items-center justify-center text-white shrink-0"
              style={{ backgroundColor: ACCENT }}
            >
              <Bot className="w-4 h-4" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-0.5">
                <span className="text-sm font-bold text-gray-900">60 Sales Copilot</span>
                <span className="text-xs text-gray-400">2:16 PM</span>
              </div>
              {/* Email draft card */}
              <div className="rounded-lg border border-gray-200 bg-white p-3 mt-1">
                <div className="flex items-center gap-2 mb-2">
                  <FileEdit className="w-3.5 h-3.5 text-violet-500" />
                  <span className="text-xs font-semibold text-gray-500 uppercase">
                    Draft Email
                  </span>
                </div>
                <p className="text-xs font-semibold text-gray-800 mb-2">
                  Subject: Thought you&apos;d find this useful, Maria
                </p>
                <div className="text-xs text-gray-600 space-y-2 leading-relaxed">
                  <p>Hi Maria,</p>
                  <p>
                    Hope you&apos;re well. I came across our latest case study on how [similar
                    company] reduced their support resolution time by 45% — reminded me of the
                    challenges you mentioned with your tier-1 queue.
                  </p>
                  <p>Worth a quick look: [Case Study Link]</p>
                  <p>
                    No rush on the proposal review — happy to discuss whenever works for you.
                  </p>
                  <p>
                    Best,
                    <br />
                    Sarah
                  </p>
                </div>
                <div className="flex gap-2 mt-3 pt-2 border-t border-gray-100">
                  <button
                    className="px-3 py-1 rounded text-xs font-medium text-white"
                    style={{ backgroundColor: ACCENT }}
                  >
                    Send Email
                  </button>
                  <button className="px-3 py-1 rounded text-xs font-medium text-gray-600 border border-gray-200 bg-white hover:bg-gray-50">
                    Edit Draft
                  </button>
                </div>
              </div>
            </div>
          </motion.div>
        </div>
      </div>

      {/* Example queries */}
      <div>
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
          Example Queries
        </p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
          {exampleQueries.map((eq, idx) => {
            const isExpanded = expandedQuery === idx;
            const Icon = eq.layerIcon;
            return (
              <motion.div
                key={idx}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.8 + idx * 0.06 }}
                className="rounded-lg border border-gray-200 bg-white overflow-hidden"
              >
                <button
                  onClick={() => setExpandedQuery(isExpanded ? null : idx)}
                  className="w-full flex items-center gap-2 px-3 py-2.5 text-left hover:bg-gray-50 transition-colors"
                >
                  {isExpanded ? (
                    <ChevronDown className="w-3 h-3 text-gray-400 shrink-0" />
                  ) : (
                    <ChevronRight className="w-3 h-3 text-gray-400 shrink-0" />
                  )}
                  <span className="text-xs text-gray-700 font-medium flex-1">
                    &ldquo;{eq.query}&rdquo;
                  </span>
                  <Icon className="w-3 h-3 text-gray-400 shrink-0" />
                </button>

                <AnimatePresence>
                  {isExpanded && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.2 }}
                      className="overflow-hidden"
                    >
                      <div className="px-3 pb-3 border-t border-gray-100 pt-2">
                        <p className="text-xs text-gray-600 leading-relaxed">{eq.response}</p>
                        <div className="flex flex-wrap gap-1.5 mt-2">
                          {eq.layers.map((layer) => (
                            <span
                              key={layer}
                              className="text-[10px] font-medium text-violet-600 bg-violet-50 border border-violet-200 px-1.5 py-0.5 rounded"
                            >
                              {layer}
                            </span>
                          ))}
                        </div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.div>
            );
          })}
        </div>
      </div>
    </motion.div>
  );
}
