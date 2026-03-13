import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Zap,
  Calendar,
  Mail,
  AlertTriangle,
  Send,
  Pencil,
  X,
} from 'lucide-react';

const stagger = {
  hidden: {},
  show: {
    transition: {
      staggerChildren: 0.08,
    },
  },
};

const fadeUp = {
  hidden: { opacity: 0, y: 24 },
  show: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.6, ease: [0.25, 0.4, 0, 1] },
  },
};

const panelVariants = {
  initial: { opacity: 0, y: 12 },
  animate: { opacity: 1, y: 0, transition: { duration: 0.35, ease: [0.25, 0.4, 0, 1] } },
  exit: { opacity: 0, y: -8, transition: { duration: 0.2, ease: [0.25, 0.4, 0, 1] } },
};

type TabKey = 'morning' | 'followup' | 'prep' | 'alert';

interface Tab {
  key: TabKey;
  label: string;
}

const TABS: Tab[] = [
  { key: 'morning', label: 'Morning Brief' },
  { key: 'followup', label: 'Follow-Up' },
  { key: 'prep', label: 'Meeting Prep' },
  { key: 'alert', label: 'Pipeline Alert' },
];

function SlackAvatar() {
  return (
    <div className="w-9 h-9 rounded-full bg-purple-400/20 flex items-center justify-center shrink-0">
      <Zap className="w-4 h-4 text-purple-400" />
    </div>
  );
}

function SlackHeader({
  timestamp,
  badge,
  badgeColor = 'purple',
}: {
  timestamp: string;
  badge?: string;
  badgeColor?: 'purple' | 'amber';
}) {
  const badgeBg = badgeColor === 'amber' ? 'bg-amber-400/10' : 'bg-purple-400/10';
  const badgeText = badgeColor === 'amber' ? 'text-amber-400' : 'text-purple-400';

  return (
    <div className="flex items-center gap-3 mb-5">
      <SlackAvatar />
      <div className="flex items-center gap-2 flex-wrap">
        <span className="font-bold text-stone-100 text-sm">60</span>
        <span className="text-stone-500 text-xs">{timestamp}</span>
        {badge && (
          <span
            className={`text-xs px-2 py-0.5 rounded-full ${badgeBg} ${badgeText}`}
          >
            {badge}
          </span>
        )}
      </div>
    </div>
  );
}

function MorningBriefPanel() {
  return (
    <div>
      <SlackHeader timestamp="8:30 AM · Monday" />
      <div className="font-mono text-sm text-stone-300 space-y-5">
        <p className="text-stone-300">Good morning. Here's your day:</p>

        <div className="space-y-2">
          <div className="flex items-center gap-2 text-stone-100">
            <Calendar className="w-4 h-4 text-purple-400 shrink-0" />
            <span className="font-semibold">3 meetings today</span>
          </div>
          <ul className="ml-6 space-y-1 text-stone-400">
            <li className="flex items-start gap-2">
              <span className="text-stone-500">10:00</span>
              <span>
                TechCorp discovery call{' '}
                <span className="text-stone-500">(brief ready)</span>
              </span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-stone-500">1:00</span>
              <span>
                Acme proposal review{' '}
                <span className="text-stone-500">(deck attached)</span>
              </span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-stone-500">3:30</span>
              <span>
                CloudBase check-in{' '}
                <span className="text-stone-500">(renewal in 14 days)</span>
              </span>
            </li>
          </ul>
        </div>

        <div className="space-y-2">
          <div className="flex items-center gap-2 text-stone-100">
            <Mail className="w-4 h-4 text-purple-400 shrink-0" />
            <span className="font-semibold">2 follow-ups ready to send</span>
          </div>
          <ul className="ml-6 space-y-1 text-stone-400">
            <li className="flex items-start gap-2">
              <span>
                Acme — post-demo recap{' '}
                <span className="text-stone-500">(1-tap send)</span>
              </span>
            </li>
            <li className="flex items-start gap-2">
              <span>
                Meridian — re-engagement after 9 days silent
              </span>
            </li>
          </ul>
        </div>

        <div className="space-y-2">
          <div className="flex items-center gap-2 text-stone-100">
            <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
            <span className="font-semibold">1 deal needs attention</span>
          </div>
          <ul className="ml-6 space-y-1 text-stone-400">
            <li>Payflow stuck in Proposal for 18 days</li>
          </ul>
        </div>
      </div>
    </div>
  );
}

function FollowUpPanel() {
  return (
    <div>
      <SlackHeader
        timestamp="Yesterday, 4:12 PM"
        badge="Draft for your review"
      />
      <div className="space-y-4">
        <p className="text-stone-100 font-medium text-sm">
          Great connecting today, Sarah
        </p>
        <div className="text-sm text-stone-300 leading-relaxed space-y-3">
          <p>Hi Sarah,</p>
          <p>
            Thanks for walking me through CloudBase's onboarding flow today —
            the bottleneck between signup and first value is exactly the kind of
            thing 60 was built to solve.
          </p>
          <p>Three things I took away:</p>
          <ol className="list-decimal ml-5 space-y-1.5 text-stone-400">
            <li>
              Your team spends ~3 hours/week on manual follow-ups after demos.
              We automate that entirely.
            </li>
            <li>
              The HubSpot → calendar disconnect means prep is scattered. 60
              pulls it into one brief.
            </li>
            <li>
              You mentioned renewals slipping — our proactive deal alerts flag
              these 14 days out.
            </li>
          </ol>
          <p>
            I've attached a one-pager on how 60 handles post-demo follow-ups.
          </p>
          <p>
            Talk soon,
            <br />
            Alex
          </p>
        </div>
        <div className="flex items-center gap-3 pt-2">
          <button className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-stone-100 text-[#0c0c0c] text-sm font-medium hover:bg-white transition-colors">
            <Send className="w-3.5 h-3.5" />
            Send
          </button>
          <button className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg border border-white/[0.08] text-stone-300 text-sm font-medium hover:border-white/[0.14] transition-colors">
            <Pencil className="w-3.5 h-3.5" />
            Edit
          </button>
          <button className="inline-flex items-center gap-1.5 px-4 py-2 text-stone-500 text-sm font-medium hover:text-stone-400 transition-colors">
            <X className="w-3.5 h-3.5" />
            Dismiss
          </button>
        </div>
      </div>
    </div>
  );
}

function MeetingPrepPanel() {
  return (
    <div>
      <SlackHeader timestamp="Today, 8:00 AM · Auto-delivered" />
      <h3 className="font-display font-bold text-stone-100 text-base mb-5">
        Brief: TechCorp Discovery Call
      </h3>
      <div className="space-y-4 text-sm">
        <div>
          <span className="text-stone-500 text-xs uppercase tracking-wide font-medium">
            Stakeholders
          </span>
          <p className="text-stone-300 mt-1">
            Sarah Chen — VP Sales{' '}
            <span className="text-stone-500">(met 2x)</span>
            <br />
            Marcus Liu — Head of RevOps{' '}
            <span className="text-stone-500">(first meeting)</span>
          </p>
        </div>
        <div>
          <span className="text-stone-500 text-xs uppercase tracking-wide font-medium">
            Deal Context
          </span>
          <p className="text-stone-300 mt-1">
            Discovery · 6 days ago · Inbound LinkedIn
          </p>
        </div>
        <div>
          <span className="text-stone-500 text-xs uppercase tracking-wide font-medium">
            Recent Activity
          </span>
          <ul className="text-stone-300 mt-1 space-y-0.5">
            <li>Proposal email opened 3x</li>
            <li>Pricing page viewed 2x</li>
            <li>
              Competitor: evaluating Gong
            </li>
          </ul>
        </div>
        <div>
          <span className="text-stone-500 text-xs uppercase tracking-wide font-medium">
            Talking Points
          </span>
          <ol className="list-decimal ml-5 text-stone-300 mt-1 space-y-1">
            <li>
              Lead with post-demo automation — directly addresses their 3h/week
              manual follow-up pain
            </li>
            <li>
              Demo the unified brief to show HubSpot + calendar consolidation
            </li>
            <li>
              Ask about renewal workflow — open the conversation for proactive
              deal alerts
            </li>
          </ol>
        </div>
        <div>
          <span className="text-stone-500 text-xs uppercase tracking-wide font-medium">
            Risk
          </span>
          <p className="text-stone-300 mt-1">
            Multi-threading gap — only one stakeholder engaged so far. Bring
            Marcus into the conversation early.
          </p>
        </div>
      </div>
    </div>
  );
}

function PipelineAlertPanel() {
  return (
    <div>
      <SlackHeader
        timestamp="Yesterday, 6:00 PM"
        badge="Deal alert"
        badgeColor="amber"
      />
      <div className="space-y-4">
        <div className="flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
          <p className="font-bold text-stone-100 text-sm">
            Payflow — stuck in Proposal for 18 days
          </p>
        </div>
        <p className="text-sm text-stone-300 leading-relaxed">
          Average time in Proposal for deals this size: 8 days. Last activity:
          Email opened 12 days ago, no reply.
        </p>
        <div className="flex items-center gap-3 pt-2">
          <button className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-stone-100 text-[#0c0c0c] text-sm font-medium hover:bg-white transition-colors">
            <Send className="w-3.5 h-3.5" />
            Send email
          </button>
          <button className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg border border-white/[0.08] text-stone-300 text-sm font-medium hover:border-white/[0.14] transition-colors">
            Draft LinkedIn
          </button>
          <button className="inline-flex items-center gap-1.5 px-4 py-2 text-stone-500 text-sm font-medium hover:text-stone-400 transition-colors">
            Flag
          </button>
        </div>
      </div>
    </div>
  );
}

const PANELS: Record<TabKey, React.ComponentType> = {
  morning: MorningBriefPanel,
  followup: FollowUpPanel,
  prep: MeetingPrepPanel,
  alert: PipelineAlertPanel,
};

export function ProductShowcaseV7() {
  const [activeTab, setActiveTab] = useState<TabKey>('morning');

  return (
    <section className="bg-[#0c0c0c] py-28 md:py-36">
      <div className="max-w-6xl mx-auto px-6">
        <motion.div
          variants={stagger}
          initial="hidden"
          whileInView="show"
          viewport={{ once: true, margin: '-40px' }}
          className="text-center mb-12"
        >
          <motion.p
            variants={fadeUp}
            className="text-xs uppercase tracking-widest text-stone-500 font-medium mb-4"
          >
            In your Slack, every day
          </motion.p>
          <motion.h2
            variants={fadeUp}
            className="font-display font-bold text-4xl md:text-5xl text-stone-100 tracking-tight"
          >
            This is what Monday morning looks like.
          </motion.h2>
          <motion.p
            variants={fadeUp}
            className="mt-5 text-stone-400 text-lg max-w-2xl mx-auto"
          >
            60 works overnight. By the time you open Slack, everything's ready.
          </motion.p>
        </motion.div>

        {/* Tabs */}
        <motion.div
          variants={fadeUp}
          initial="hidden"
          whileInView="show"
          viewport={{ once: true, margin: '-40px' }}
          className="flex items-center gap-1 border-b border-white/[0.08] mb-0 overflow-x-auto"
        >
          {TABS.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`relative px-4 py-3 text-sm font-medium whitespace-nowrap transition-colors ${
                activeTab === tab.key
                  ? 'text-stone-100'
                  : 'text-stone-500 hover:text-stone-300'
              }`}
            >
              {tab.label}
              {activeTab === tab.key && (
                <motion.div
                  layoutId="active-tab-indicator"
                  className="absolute bottom-0 left-0 right-0 h-0.5 bg-purple-400"
                  transition={{ type: 'spring', bounce: 0.15, duration: 0.5 }}
                />
              )}
            </button>
          ))}
        </motion.div>

        {/* Panel */}
        <div className="bg-[#161616] border border-white/[0.08] border-t-0 rounded-b-2xl rounded-t-none p-6 md:p-8 min-h-[420px]">
          <AnimatePresence mode="wait">
            <motion.div
              key={activeTab}
              variants={panelVariants}
              initial="initial"
              animate="animate"
              exit="exit"
            >
              {(() => {
                const Panel = PANELS[activeTab];
                return <Panel />;
              })()}
            </motion.div>
          </AnimatePresence>
        </div>
      </div>
    </section>
  );
}
