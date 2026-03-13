import { motion } from 'framer-motion';
import { FileText, Mic, Mail, ArrowRight } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

interface NarrativeStep {
  label: string;
  icon: LucideIcon;
  headline: string;
  description: string;
  details: string[];
  mockup: React.ReactNode;
}

const fadeUp = {
  hidden: { opacity: 0, y: 24 },
  show: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.6, ease: [0.22, 1, 0.36, 1] },
  },
};

function MeetingPrepMockup() {
  return (
    <div className="bg-white dark:bg-[#111] border border-gray-200 dark:border-white/10 rounded-xl p-5 shadow-sm text-left">
      <div className="flex items-center gap-2 mb-4">
        <div className="w-8 h-8 bg-blue-50 dark:bg-emerald-500/10 rounded-lg flex items-center justify-center">
          <FileText className="w-4 h-4 text-blue-600 dark:text-emerald-500" />
        </div>
        <div>
          <div className="text-xs font-semibold text-gray-900 dark:text-white">TechCorp Discovery Call</div>
          <div className="text-[10px] text-gray-400 dark:text-gray-500">Today 10:00 AM &middot; Auto-delivered</div>
        </div>
      </div>

      <div className="space-y-3 text-[11px]">
        <div>
          <div className="font-semibold text-gray-700 dark:text-gray-200 mb-1">STAKEHOLDERS</div>
          <div className="text-gray-500 dark:text-gray-400">Sarah Chen — VP Sales (met 2x, decision maker)</div>
          <div className="text-gray-500 dark:text-gray-400">Marcus Liu — Head of RevOps (first meeting)</div>
        </div>
        <div>
          <div className="font-semibold text-gray-700 dark:text-gray-200 mb-1">RECENT SIGNALS</div>
          <div className="flex items-center gap-1.5 text-gray-500 dark:text-gray-400">
            <div className="w-1.5 h-1.5 rounded-full bg-blue-500 dark:bg-emerald-500" />
            Proposal email opened 3x (last: yesterday 9pm)
          </div>
          <div className="flex items-center gap-1.5 text-gray-500 dark:text-gray-400">
            <div className="w-1.5 h-1.5 rounded-full bg-amber-400" />
            Competitor mention: evaluating Gong
          </div>
        </div>
        <div>
          <div className="font-semibold text-gray-700 dark:text-gray-200 mb-1">TALKING POINTS</div>
          <div className="text-gray-500 dark:text-gray-400">1. Position 60 as everything around the call</div>
          <div className="text-gray-500 dark:text-gray-400">2. Ask about follow-up workflow — likely manual</div>
        </div>
      </div>
    </div>
  );
}

function CallIntelMockup() {
  return (
    <div className="bg-white dark:bg-[#111] border border-gray-200 dark:border-white/10 rounded-xl p-5 shadow-sm text-left">
      <div className="flex items-center gap-2 mb-4">
        <div className="w-8 h-8 bg-blue-50 dark:bg-emerald-500/10 rounded-lg flex items-center justify-center">
          <Mic className="w-4 h-4 text-blue-600 dark:text-emerald-500" />
        </div>
        <div>
          <div className="text-xs font-semibold text-gray-900 dark:text-white">Call Intelligence</div>
          <div className="text-[10px] text-gray-400 dark:text-gray-500">TechCorp call &middot; 45 min &middot; Processed</div>
        </div>
      </div>

      <div className="space-y-3 text-[11px]">
        <div>
          <div className="font-semibold text-gray-700 dark:text-gray-200 mb-1">ACTION ITEMS EXTRACTED</div>
          <div className="flex items-center gap-2 text-gray-500 dark:text-gray-400">
            <input type="checkbox" className="rounded border-gray-300 dark:border-white/20" readOnly />
            Send HubSpot integration doc to Sarah
          </div>
          <div className="flex items-center gap-2 text-gray-500 dark:text-gray-400">
            <input type="checkbox" className="rounded border-gray-300 dark:border-white/20" readOnly />
            Schedule RevOps demo for Thursday
          </div>
          <div className="flex items-center gap-2 text-gray-500 dark:text-gray-400">
            <input type="checkbox" className="rounded border-gray-300 dark:border-white/20" readOnly />
            Prepare 15-seat pricing
          </div>
        </div>
        <div>
          <div className="font-semibold text-gray-700 dark:text-gray-200 mb-1">OBJECTIONS RAISED</div>
          <div className="text-gray-500 dark:text-gray-400">"We're already evaluating Gong for call recording"</div>
          <div className="text-[10px] text-blue-600 dark:text-emerald-500 mt-1">Suggested response ready &rarr;</div>
        </div>
      </div>
    </div>
  );
}

function FollowUpMockup() {
  return (
    <div className="bg-white dark:bg-[#111] border border-gray-200 dark:border-white/10 rounded-xl p-5 shadow-sm text-left">
      <div className="flex items-center gap-2 mb-4">
        <div className="w-8 h-8 bg-purple-50 dark:bg-purple-500/10 rounded-lg flex items-center justify-center">
          <Mail className="w-4 h-4 text-purple-600" />
        </div>
        <div>
          <div className="text-xs font-semibold text-gray-900 dark:text-white">Follow-Up Draft</div>
          <div className="text-[10px] text-gray-400 dark:text-gray-500">Ready for review &middot; 1-tap send</div>
        </div>
      </div>

      <div className="text-[11px] space-y-2">
        <div className="text-gray-700 dark:text-gray-200 font-medium">Subject: Great connecting today, Sarah</div>
        <div className="text-gray-500 dark:text-gray-400 leading-relaxed">
          Hi Sarah,
          <br /><br />
          Thanks for walking me through CloudBase's onboarding flow — the bottleneck between signup and first value is exactly the kind of thing 60 was built to solve.
          <br /><br />
          Three things I took away:
        </div>
        <div className="text-gray-500 dark:text-gray-400 pl-3 border-l-2 border-gray-100 dark:border-white/10">
          1. Your team spends ~3h/week on manual follow-ups
          <br />
          2. HubSpot → calendar disconnect means scattered prep
          <br />
          3. Renewals slipping — our alerts flag these 14 days out
        </div>
      </div>

      <div className="flex gap-2 mt-4">
        <button className="px-3 py-1.5 bg-gray-900 dark:bg-white text-white dark:text-gray-900 text-[11px] font-medium rounded-md">
          Send
        </button>
        <button className="px-3 py-1.5 border border-gray-200 dark:border-white/10 text-gray-600 dark:text-gray-300 text-[11px] font-medium rounded-md">
          Edit
        </button>
        <button className="px-3 py-1.5 text-gray-400 dark:text-gray-500 text-[11px]">
          Dismiss
        </button>
      </div>
    </div>
  );
}

const STEPS: NarrativeStep[] = [
  {
    label: 'Before the call',
    icon: FileText,
    headline: '30 seconds instead of 30 minutes',
    description:
      'Two hours before every meeting, a prep brief lands in your Slack. Stakeholder history, deal context, talking points, competitor intel — everything you need to walk in sharp.',
    details: [
      'Auto-delivered to Slack before every meeting',
      'Stakeholder history and recent email activity',
      'AI-generated talking points from deal signals',
      'Competitor mentions surfaced from past calls',
    ],
    mockup: <MeetingPrepMockup />,
  },
  {
    label: 'During the call',
    icon: Mic,
    headline: 'Every word captured, structured, and actionable',
    description:
      '60 listens via Fathom, extracts action items, decisions, and objections. Not a summary — structured intelligence your pipeline can act on.',
    details: [
      'Action items extracted automatically',
      'Objections tracked with suggested responses',
      'Deal stage updated based on conversation',
      'Searchable across all past calls',
    ],
    mockup: <CallIntelMockup />,
  },
  {
    label: 'After the call',
    icon: Mail,
    headline: 'Every meeting gets a next step. Automatically.',
    description:
      'Within two hours, a personalized follow-up appears in your Slack — written in your voice, with full awareness of the deal and what was discussed. One tap to send.',
    details: [
      'Follow-up drafted from transcript + deal context',
      'Written in your voice — learns from your edits',
      'One-tap send from Slack',
      '8 types: post-meeting, no-show, renewal, trial, re-engagement',
    ],
    mockup: <FollowUpMockup />,
  },
];

export function FeatureNarrativeV8() {
  return (
    <section className="bg-white dark:bg-[#0a0a0a] py-24 md:py-32" id="features">
      <div className="max-w-6xl mx-auto px-6">
        <motion.div
          variants={fadeUp}
          initial="hidden"
          whileInView="show"
          viewport={{ once: true, margin: '-60px' }}
          className="text-center mb-20"
        >
          <p className="text-sm font-medium text-blue-600 dark:text-emerald-500 mb-4 tracking-wide uppercase">
            How 60 works
          </p>
          <h2 className="font-display font-bold text-3xl md:text-5xl text-gray-900 dark:text-white tracking-tight">
            Before. During. After.
          </h2>
          <p className="mt-4 text-gray-500 dark:text-gray-400 text-lg font-body max-w-2xl mx-auto">
            60 automates everything either side of the sales call. You focus on the conversation that closes revenue.
          </p>
        </motion.div>

        <div className="space-y-24 md:space-y-32">
          {STEPS.map((step, i) => {
            const Icon = step.icon;
            const isReversed = i % 2 === 1;

            return (
              <motion.div
                key={step.label}
                initial={{ opacity: 0, y: 32 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: '-80px' }}
                transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
                className={`flex flex-col ${isReversed ? 'md:flex-row-reverse' : 'md:flex-row'} gap-12 md:gap-16 items-center`}
              >
                {/* Text side */}
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-4">
                    <div className="w-10 h-10 bg-gray-100 dark:bg-white/5 rounded-xl flex items-center justify-center">
                      <Icon className="w-5 h-5 text-gray-600 dark:text-gray-300" />
                    </div>
                    <span className="text-sm font-medium text-gray-400 dark:text-gray-500 uppercase tracking-wide">
                      {step.label}
                    </span>
                  </div>

                  <h3 className="font-display font-bold text-2xl md:text-3xl text-gray-900 dark:text-white tracking-tight mb-4">
                    {step.headline}
                  </h3>

                  <p className="text-gray-500 dark:text-gray-400 text-lg leading-relaxed font-body mb-6">
                    {step.description}
                  </p>

                  <ul className="space-y-3">
                    {step.details.map((detail) => (
                      <li key={detail} className="flex items-start gap-3 text-gray-600 dark:text-gray-300 text-sm font-body">
                        <div className="w-1.5 h-1.5 rounded-full bg-blue-600 dark:bg-emerald-500 mt-2 shrink-0" />
                        {detail}
                      </li>
                    ))}
                  </ul>
                </div>

                {/* Mockup side */}
                <div className="flex-1 w-full max-w-md">
                  {step.mockup}
                </div>
              </motion.div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
