import { motion } from 'framer-motion';
import {
  Clock,
  Mail,
  AlertTriangle,
  Check,
  Send,
  Edit3,
  X,
} from 'lucide-react';

/* ------------------------------------------------------------------ */
/*  Animation variants                                                 */
/* ------------------------------------------------------------------ */

const fadeUp = {
  hidden: { opacity: 0, y: 24 },
  show: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.6, ease: [0.22, 1, 0.36, 1] },
  },
};

/* ------------------------------------------------------------------ */
/*  Mockup components                                                  */
/* ------------------------------------------------------------------ */

function MeetingPrepMockup() {
  return (
    <div className="bg-white dark:bg-[#131a2e] border border-gray-200 dark:border-white/10 rounded-xl p-5 shadow-sm text-left">
      {/* Header */}
      <div className="flex items-center gap-2 mb-4">
        <div className="w-8 h-8 bg-blue-50 dark:bg-blue-500/10 rounded-lg flex items-center justify-center">
          <Clock className="w-4 h-4 text-blue-600 dark:text-blue-400" />
        </div>
        <div>
          <div className="text-xs font-semibold text-gray-900 dark:text-white">Meeting Brief &middot; TechCorp</div>
          <div className="text-[10px] text-gray-400 dark:text-[#8891b0]">Delivered 2 hours ago</div>
        </div>
      </div>

      <div className="space-y-3 text-[11px]">
        {/* Stakeholders */}
        <div>
          <div className="font-semibold text-gray-700 dark:text-gray-200 mb-1">STAKEHOLDERS</div>
          <div className="text-gray-500 dark:text-[#8891b0]">Sarah Chen (VP Sales), James Liu (CTO)</div>
        </div>

        {/* Signal */}
        <div className="flex items-center gap-1.5 bg-amber-50 dark:bg-amber-500/5 border border-amber-200 dark:border-amber-500/20 rounded-lg px-3 py-2">
          <AlertTriangle className="w-3.5 h-3.5 text-amber-500 shrink-0" />
          <span className="text-xs text-amber-800 dark:text-amber-300">Prospect opened your pricing PDF 4 times this week</span>
        </div>

        {/* Talking points */}
        <div>
          <div className="font-semibold text-gray-700 dark:text-gray-200 mb-1">TALKING POINTS</div>
          <ul className="space-y-1.5">
            {[
              'Lead with ROI — she mentioned "board presentation"',
              'Address competitive evaluation proactively',
              'Offer 15-seat pilot to de-risk the decision',
            ].map((point) => (
              <li key={point} className="flex items-start gap-2 text-gray-500 dark:text-[#8891b0]">
                <div className="w-1.5 h-1.5 rounded-full bg-blue-500 dark:bg-blue-400 mt-1.5 shrink-0" />
                {point}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}

function CallIntelMockup() {
  return (
    <div className="bg-white dark:bg-[#131a2e] border border-gray-200 dark:border-white/10 rounded-xl p-5 shadow-sm text-left">
      {/* Header with waveform */}
      <div className="flex items-center gap-2 mb-4">
        <div className="w-8 h-8 bg-emerald-50 dark:bg-emerald-500/10 rounded-lg flex items-center justify-center">
          <div className="flex items-center gap-[2px]">
            {[3, 5, 4, 6, 3].map((h, i) => (
              <div
                key={i}
                className="w-[2px] rounded-full bg-emerald-500 dark:bg-emerald-400"
                style={{ height: `${h * 2}px` }}
              />
            ))}
          </div>
        </div>
        <div>
          <div className="text-xs font-semibold text-gray-900 dark:text-white">Call Intelligence &middot; Live</div>
          <div className="text-[10px] text-gray-400 dark:text-[#8891b0]">TechCorp Discovery &middot; 34 min</div>
        </div>
      </div>

      <div className="space-y-3 text-[11px]">
        {/* Action items */}
        <div>
          <div className="font-semibold text-gray-700 dark:text-gray-200 mb-1">ACTION ITEMS EXTRACTED</div>
          {[
            'Send HubSpot integration doc to Sarah',
            'Schedule RevOps demo for Thursday',
            'Prepare 15-seat pricing breakdown',
          ].map((item) => (
            <div key={item} className="flex items-center gap-2 text-gray-500 dark:text-[#8891b0] py-0.5">
              <div className="w-3.5 h-3.5 rounded border border-gray-300 dark:border-white/20 shrink-0" />
              {item}
            </div>
          ))}
        </div>

        {/* Objection */}
        <div className="bg-violet-50 dark:bg-violet-500/5 border border-violet-200 dark:border-violet-500/20 rounded-lg px-3 py-2">
          <div className="text-[10px] font-semibold text-violet-600 dark:text-violet-400 uppercase tracking-wider mb-0.5">
            Objection Tracked
          </div>
          <div className="text-gray-600 dark:text-[#8891b0]">Budget concerns — suggested response ready</div>
        </div>

        {/* Deal stage */}
        <div className="flex items-center gap-2 text-gray-500 dark:text-[#8891b0]">
          <Check className="w-3.5 h-3.5 text-emerald-500" />
          <span>Deal stage auto-updated: <span className="text-gray-900 dark:text-white font-medium">Discovery &rarr; Proposal</span></span>
        </div>
      </div>
    </div>
  );
}

function FollowUpMockup() {
  return (
    <div className="bg-white dark:bg-[#131a2e] border border-gray-200 dark:border-white/10 rounded-xl p-5 shadow-sm text-left">
      {/* Header */}
      <div className="flex items-center gap-2 mb-4">
        <div className="w-8 h-8 bg-amber-50 dark:bg-amber-500/10 rounded-lg flex items-center justify-center">
          <Mail className="w-4 h-4 text-amber-600 dark:text-amber-400" />
        </div>
        <div>
          <div className="text-xs font-semibold text-gray-900 dark:text-white">Follow-up Draft</div>
          <div className="text-[10px] text-gray-400 dark:text-[#8891b0]">Ready for review &middot; 1-tap send</div>
        </div>
      </div>

      <div className="text-[11px] space-y-2 mb-4">
        <div className="flex items-center gap-2 text-gray-500 dark:text-[#8891b0]">
          <span className="text-gray-400 dark:text-[#8891b0] w-6 shrink-0">To</span>
          <span className="text-gray-900 dark:text-white font-medium">sarah.chen@techcorp.com</span>
        </div>
        <div className="flex items-center gap-2 text-gray-500 dark:text-[#8891b0]">
          <span className="text-gray-400 dark:text-[#8891b0] w-6 shrink-0">Re</span>
          <span className="text-gray-900 dark:text-white font-medium">Following up on Thursday's call</span>
        </div>

        <div className="border-t border-gray-100 dark:border-white/[0.06] pt-3 text-gray-500 dark:text-[#8891b0] leading-relaxed">
          Hi Sarah, thanks for walking me through CloudBase's onboarding flow. The bottleneck between signup and first value is exactly what we solve. Three things I took away...
        </div>
      </div>

      {/* Buttons */}
      <div className="flex gap-2 mb-4">
        <button className="inline-flex items-center gap-1.5 px-3.5 py-1.5 bg-gradient-to-r from-violet-600 to-blue-500 text-white text-[11px] font-medium rounded-lg">
          <Send className="w-3 h-3" />
          Send
        </button>
        <button className="inline-flex items-center gap-1.5 px-3.5 py-1.5 border border-gray-200 dark:border-white/10 text-gray-600 dark:text-gray-300 text-[11px] font-medium rounded-lg">
          <Edit3 className="w-3 h-3" />
          Edit
        </button>
        <button className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-gray-400 dark:text-[#8891b0] text-[11px]">
          <X className="w-3 h-3" />
          Dismiss
        </button>
      </div>

      {/* Auto-completed tasks */}
      <div className="border-t border-gray-100 dark:border-white/[0.06] pt-3 space-y-1.5">
        {[
          'CRM updated with call notes',
          'Meeting summary shared in #sales',
          'Follow-up task created for Thursday',
        ].map((task) => (
          <div key={task} className="flex items-center gap-2 text-[11px] text-gray-500 dark:text-[#8891b0]">
            <Check className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
            {task}
          </div>
        ))}
      </div>
    </div>
  );
}

function PipelineAlertMockup() {
  return (
    <div className="bg-white dark:bg-[#131a2e] border border-gray-200 dark:border-white/10 rounded-xl p-5 shadow-sm text-left">
      {/* Header */}
      <div className="flex items-center gap-2 mb-4">
        <div className="w-8 h-8 bg-red-50 dark:bg-red-500/10 rounded-lg flex items-center justify-center">
          <AlertTriangle className="w-4 h-4 text-red-500 dark:text-red-400" />
        </div>
        <div>
          <div className="text-xs font-semibold text-gray-900 dark:text-white">Deal Risk Alert</div>
          <div className="text-[10px] text-gray-400 dark:text-[#8891b0]">CloudBase &middot; $200K &middot; Negotiation</div>
        </div>
      </div>

      <div className="space-y-3 text-[11px]">
        {/* Risk signals */}
        <div>
          <div className="font-semibold text-gray-700 dark:text-gray-200 mb-2">RISK SIGNALS</div>
          <ul className="space-y-2">
            {[
              { text: 'Champion went quiet (14 days)', color: 'text-amber-600 dark:text-amber-400' },
              { text: 'Competitor mentioned in last call', color: 'text-red-600 dark:text-red-400' },
              { text: 'No next meeting scheduled', color: 'text-orange-600 dark:text-orange-400' },
            ].map((signal) => (
              <li key={signal.text} className={`flex items-start gap-2 ${signal.color}`}>
                <AlertTriangle className="w-3 h-3 mt-0.5 shrink-0" />
                {signal.text}
              </li>
            ))}
          </ul>
        </div>

        {/* Suggested action */}
        <div className="bg-violet-50 dark:bg-violet-500/5 border border-violet-200 dark:border-violet-500/20 rounded-lg px-3 py-2.5">
          <div className="text-[10px] font-semibold text-violet-600 dark:text-violet-400 uppercase tracking-wider mb-1">
            Suggested Action
          </div>
          <p className="text-gray-700 dark:text-violet-200">
            Re-engage Sarah with Q2 expansion angle
          </p>
        </div>

        {/* Health score */}
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-[10px] font-semibold text-gray-400 dark:text-[#8891b0] uppercase tracking-wider">
              Deal Health
            </span>
            <span className="text-xs font-mono font-bold text-red-500 dark:text-red-400 tabular-nums">42%</span>
          </div>
          <div className="w-full h-2 bg-gray-200 dark:bg-white/10 rounded-full overflow-hidden">
            <div
              className="h-full rounded-full bg-gradient-to-r from-red-500 to-orange-400"
              style={{ width: '42%' }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Card definitions                                                   */
/* ------------------------------------------------------------------ */

interface FeatureCard {
  pillLabel: string;
  pillClasses: string;
  headline: string;
  body: string;
  mockup: React.ReactNode;
  reversed: boolean;
}

const CARDS: FeatureCard[] = [
  {
    pillLabel: 'Meeting Prep',
    pillClasses: 'text-blue-400 bg-blue-400/20',
    headline: 'Walk in knowing everything',
    body: 'Two hours before every meeting, 60 delivers a complete brief to Slack — stakeholder history, deal context, talking points, competitor intel. Your rep is prepared in 30 seconds, not 30 minutes.',
    mockup: <MeetingPrepMockup />,
    reversed: false,
  },
  {
    pillLabel: 'Call Intelligence',
    pillClasses: 'text-emerald-400 bg-emerald-400/20',
    headline: 'Every word captured. Every insight structured.',
    body: '60 listens via your meeting recorder, extracts action items, tracks objections, updates deal stages, and makes every conversation searchable. Not just a summary — structured intelligence you can act on.',
    mockup: <CallIntelMockup />,
    reversed: true,
  },
  {
    pillLabel: 'Follow-ups',
    pillClasses: 'text-amber-400 bg-amber-400/20',
    headline: 'Every meeting gets a next step. Automatically.',
    body: "Within minutes, a personalized follow-up appears in Slack — written in your voice, with full deal context. One tap to send. Plus: CRM updated, notes shared, tasks created. All without touching a thing.",
    mockup: <FollowUpMockup />,
    reversed: false,
  },
  {
    pillLabel: 'Pipeline Intelligence',
    pillClasses: 'text-violet-400 bg-violet-400/20',
    headline: "Deals don't slip when someone's always watching",
    body: "60 monitors every deal for risk signals — stale conversations, champion disengagement, missing next steps. It flags issues before you notice and suggests exactly what to do about them.",
    mockup: <PipelineAlertMockup />,
    reversed: true,
  },
];

/* ------------------------------------------------------------------ */
/*  FeatureCardsV12                                                    */
/* ------------------------------------------------------------------ */

export function FeatureCardsV12() {
  return (
    <section className="bg-white dark:bg-[#070b1a] py-24 md:py-32" id="features">
      <div className="max-w-6xl mx-auto px-6">
        {/* Section header */}
        <motion.div
          variants={fadeUp}
          initial="hidden"
          whileInView="show"
          viewport={{ once: true, margin: '-60px' }}
          className="text-center mb-20"
        >
          <p className="text-violet-600 dark:text-violet-400 text-sm font-medium mb-4 tracking-wide uppercase">
            How it works
          </p>
          <h2 className="font-display font-bold text-3xl md:text-5xl text-gray-900 dark:text-[#e1f0ff] tracking-tight">
            Your AI handles every step around the call
          </h2>
        </motion.div>

        {/* Feature cards */}
        <div className="space-y-16 md:space-y-24">
          {CARDS.map((card, i) => (
            <motion.div
              key={card.headline}
              initial={{ opacity: 0, y: 32 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: '-80px' }}
              transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
              className={`bg-white dark:bg-gradient-to-b dark:from-violet-500/[0.07] dark:to-transparent border border-gray-200 dark:border-white/[0.08] rounded-2xl overflow-hidden hover:border-gray-300 dark:hover:border-white/[0.15] transition-all duration-300`}
            >
              <div
                className={`grid grid-cols-1 md:grid-cols-2 gap-0 ${
                  card.reversed ? 'md:[&>*:first-child]:order-2 md:[&>*:last-child]:order-1' : ''
                }`}
              >
                {/* Text side */}
                <div className="flex flex-col justify-center p-8 md:p-12">
                  {/* Highlight pill */}
                  <span className={`${card.pillClasses} px-2 py-0.5 rounded-md text-sm font-medium inline-block w-fit mb-4`}>
                    {card.pillLabel}
                  </span>

                  <h3 className="font-display font-bold text-2xl md:text-3xl text-gray-900 dark:text-[#e1f0ff] tracking-tight mb-4">
                    {card.headline}
                  </h3>

                  <p className="text-gray-500 dark:text-[#8891b0] text-base md:text-lg leading-relaxed font-body">
                    {card.body}
                  </p>
                </div>

                {/* Mockup side */}
                <div className="flex items-center justify-center p-6 md:p-10">
                  {card.mockup}
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
