import { motion } from 'framer-motion';
import {
  Calendar,
  Mail,
  Hash,
  Users,
  Clock,
  AlertTriangle,
  Send,
  Edit3,
  Bot,
  ThumbsUp,
  Check,
  MessageSquare,
  X,
} from 'lucide-react';

const fadeUp = {
  hidden: { opacity: 0, y: 24 },
  show: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.6, ease: [0.22, 1, 0.36, 1] },
  },
};

/* ------------------------------------------------------------------ */
/*  PanelShell — reusable card chrome (3 dots, icon, title, badge)    */
/* ------------------------------------------------------------------ */

function PanelShell({
  icon: Icon,
  title,
  badge,
  badgeColor = 'blue',
  children,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  badge: string;
  badgeColor?: 'blue' | 'amber' | 'emerald';
  children: React.ReactNode;
}) {
  const badgeColors = {
    blue: 'bg-blue-50 text-blue-600 dark:bg-emerald-500/10 dark:text-emerald-400',
    amber: 'bg-amber-50 text-amber-600 dark:bg-amber-500/10 dark:text-amber-400',
    emerald: 'bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-400',
  };

  return (
    <div className="bg-white dark:bg-zinc-900/90 border border-gray-200 dark:border-white/[0.06] rounded-xl shadow-sm overflow-hidden">
      {/* Title bar */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 dark:border-white/[0.06]">
        <div className="flex items-center gap-3">
          {/* Traffic-light dots */}
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-red-400/80" />
            <span className="w-2.5 h-2.5 rounded-full bg-amber-400/80" />
            <span className="w-2.5 h-2.5 rounded-full bg-green-400/80" />
          </div>

          <div className="flex items-center gap-2">
            <Icon className="w-4 h-4 text-blue-600 dark:text-emerald-400" />
            <span className="text-sm font-semibold text-gray-900 dark:text-white">{title}</span>
          </div>
        </div>

        <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${badgeColors[badgeColor]}`}>
          {badge}
        </span>
      </div>

      {/* Body */}
      <div className="p-5">{children}</div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Panel 1 — Meeting Brief                                           */
/* ------------------------------------------------------------------ */

function MeetingBriefPanel() {
  return (
    <PanelShell icon={Calendar} title="Meeting Brief" badge="AI Generated" badgeColor="blue">
      {/* Attendee card */}
      <div className="flex items-center gap-3 mb-4">
        <div className="w-10 h-10 rounded-full bg-blue-100 dark:bg-emerald-500/10 flex items-center justify-center">
          <Users className="w-5 h-5 text-blue-600 dark:text-emerald-400" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-semibold text-gray-900 dark:text-white">Sarah Chen</div>
          <div className="text-xs text-gray-500 dark:text-zinc-400">VP Sales, Bloom &amp; Wild</div>
        </div>
        <div className="flex items-center gap-1.5 text-xs text-gray-500 dark:text-zinc-400">
          <Clock className="w-3.5 h-3.5" />
          Tomorrow 2pm
        </div>
      </div>

      {/* Context alert */}
      <div className="flex items-start gap-2.5 bg-amber-50 dark:bg-amber-500/5 border border-amber-200 dark:border-amber-500/20 rounded-lg px-3 py-2.5 mb-4">
        <AlertTriangle className="w-4 h-4 text-amber-500 mt-0.5 shrink-0" />
        <p className="text-xs text-amber-800 dark:text-amber-300 leading-relaxed">
          Sarah opened your pricing PDF 4 times this week. Likely evaluating budget internally.
        </p>
      </div>

      {/* Talking points */}
      <div>
        <div className="text-[10px] font-semibold text-gray-400 dark:text-zinc-500 uppercase tracking-wider mb-2">
          Talking Points
        </div>
        <ul className="space-y-2">
          {[
            'Lead with ROI — she mentioned "board presentation" last call',
            'Address Gong comparison proactively — our scope is wider',
            'Offer 15-seat pilot to de-risk the decision',
          ].map((point, i) => (
            <li key={i} className="flex items-start gap-2.5 text-xs text-gray-600 dark:text-zinc-300">
              <div className="w-1.5 h-1.5 rounded-full bg-blue-600 dark:bg-emerald-500 mt-1.5 shrink-0" />
              {point}
            </li>
          ))}
        </ul>
      </div>
    </PanelShell>
  );
}

/* ------------------------------------------------------------------ */
/*  Panel 2 — Email Composer                                          */
/* ------------------------------------------------------------------ */

function EmailComposerPanel() {
  return (
    <PanelShell icon={Mail} title="Email Composer" badge="Draft" badgeColor="amber">
      {/* To / Re header */}
      <div className="space-y-1.5 mb-4 text-xs">
        <div className="flex items-center gap-2">
          <span className="text-gray-400 dark:text-zinc-500 w-6">To</span>
          <span className="text-gray-900 dark:text-white font-medium">sarah.chen@bloomandwild.com</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-gray-400 dark:text-zinc-500 w-6">Re</span>
          <span className="text-gray-900 dark:text-white font-medium">Following up on Thursday's call</span>
        </div>
      </div>

      <div className="border-t border-gray-100 dark:border-white/[0.06] pt-4 space-y-3 text-xs text-gray-600 dark:text-zinc-300 leading-relaxed">
        <p>Hi Sarah,</p>
        <p>
          Great conversation on Thursday. You mentioned the team burns ~3 hours a week just on post-call
          admin — CRM updates, follow-up emails, Slack summaries. That's exactly what 60 automates.
        </p>
        <p>
          I've put together a quick comparison showing how 60 covers what Gong does{' '}
          <span className="italic">and</span> everything around the call — prep, follow-ups, pipeline
          alerts. Attached.
        </p>
        <p>
          Would a 15-seat pilot make sense as a next step? Happy to scope that with Marcus.
        </p>
        <p className="text-gray-500 dark:text-zinc-400">— Alex</p>
      </div>

      {/* Action buttons */}
      <div className="flex items-center gap-2 mt-5">
        <button className="inline-flex items-center gap-1.5 px-3.5 py-1.5 bg-blue-600 dark:bg-emerald-500 text-white text-xs font-medium rounded-lg">
          <Send className="w-3.5 h-3.5" />
          Send
        </button>
        <button className="inline-flex items-center gap-1.5 px-3.5 py-1.5 border border-gray-200 dark:border-white/10 text-gray-600 dark:text-zinc-300 text-xs font-medium rounded-lg">
          <Edit3 className="w-3.5 h-3.5" />
          Edit
        </button>
      </div>
    </PanelShell>
  );
}

/* ------------------------------------------------------------------ */
/*  Panel 3 — Slack Alert                                             */
/* ------------------------------------------------------------------ */

function SlackAlertPanel() {
  return (
    <PanelShell icon={Hash} title="Slack — #sales-alerts" badge="Proactive" badgeColor="emerald">
      {/* Bot message */}
      <div className="flex items-start gap-3">
        <div className="w-8 h-8 rounded-lg bg-blue-100 dark:bg-emerald-500/10 flex items-center justify-center shrink-0 mt-0.5">
          <Bot className="w-4 h-4 text-blue-600 dark:text-emerald-400" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-sm font-semibold text-gray-900 dark:text-white">60 Bot</span>
            <span className="text-[10px] text-gray-400 dark:text-zinc-500">2 min ago</span>
          </div>
          <div className="bg-gray-50 dark:bg-white/[0.03] border border-gray-100 dark:border-white/[0.06] rounded-lg p-3 space-y-2 text-xs text-gray-700 dark:text-zinc-300">
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-3.5 h-3.5 text-amber-500 shrink-0" />
              <span className="font-semibold text-gray-900 dark:text-white">Deal going cold: Bloom &amp; Wild ($48k)</span>
            </div>
            <p className="leading-relaxed">
              Sarah Chen hasn't replied in 12 days. Last activity: opened pricing PDF on Mar 1.
              Champion engagement score dropped from 82 to 41.
            </p>
            <p className="leading-relaxed">
              I've drafted a re-engagement email referencing the board timeline she mentioned.
              Want me to send it?
            </p>
          </div>

          {/* Action row */}
          <div className="flex items-center gap-2 mt-3">
            <button className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 dark:bg-emerald-500 text-white text-xs font-medium rounded-lg">
              <ThumbsUp className="w-3.5 h-3.5" />
              Send It
            </button>
            <button className="inline-flex items-center gap-1.5 px-3 py-1.5 border border-gray-200 dark:border-white/10 text-gray-600 dark:text-zinc-300 text-xs font-medium rounded-lg">
              <X className="w-3.5 h-3.5" />
              Dismiss
            </button>
          </div>

          {/* Confirmation text */}
          <div className="flex items-center gap-1.5 mt-3 text-[11px] text-gray-400 dark:text-zinc-500">
            <Check className="w-3.5 h-3.5 text-green-500" />
            <span>
              <MessageSquare className="w-3 h-3 inline -mt-0.5 mr-0.5" />
              3 deals saved this month with proactive re-engagement
            </span>
          </div>
        </div>
      </div>
    </PanelShell>
  );
}

/* ------------------------------------------------------------------ */
/*  Showcase section data                                             */
/* ------------------------------------------------------------------ */

interface ShowcaseItem {
  headline: string;
  subtitle: string;
  panel: React.ReactNode;
}

const SHOWCASE_ITEMS: ShowcaseItem[] = [
  {
    headline: 'Know more than they expect.',
    subtitle: 'Company intel, stakeholder context, and talking points. Ready before you are.',
    panel: <MeetingBriefPanel />,
  },
  {
    headline: 'Outreach that sounds like you.',
    subtitle: 'Grounded in real research. Short enough to read. Personal enough to reply to.',
    panel: <EmailComposerPanel />,
  },
  {
    headline: 'It flags the deal. Then fixes it.',
    subtitle: 'When a champion goes quiet, 60 tells you in Slack and drafts the re-engagement.',
    panel: <SlackAlertPanel />,
  },
];

/* ------------------------------------------------------------------ */
/*  ShowcasePreviewV8                                                 */
/* ------------------------------------------------------------------ */

export function ShowcasePreviewV8() {
  return (
    <section className="bg-white dark:bg-[#0a0a0a] py-24 md:py-32">
      <div className="max-w-6xl mx-auto px-6">
        <motion.div
          variants={fadeUp}
          initial="hidden"
          whileInView="show"
          viewport={{ once: true, margin: '-60px' }}
          className="text-center mb-20"
        >
          <p className="text-sm font-medium text-blue-600 dark:text-emerald-500 mb-4 tracking-wide uppercase">
            See it in action
          </p>
          <h2 className="font-display font-bold text-3xl md:text-5xl text-gray-900 dark:text-white tracking-tight">
            AI that actually does the work
          </h2>
          <p className="mt-4 text-gray-500 dark:text-zinc-400 text-lg font-body max-w-2xl mx-auto">
            Not dashboards. Not summaries. Real deliverables — meeting briefs, emails, alerts — ready before you ask.
          </p>
        </motion.div>

        <div className="space-y-24 md:space-y-32">
          {SHOWCASE_ITEMS.map((item, i) => {
            const isReversed = i % 2 === 1;

            return (
              <motion.div
                key={item.headline}
                initial={{ opacity: 0, y: 32 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: '-80px' }}
                transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
                className={`flex flex-col ${isReversed ? 'md:flex-row-reverse' : 'md:flex-row'} gap-12 md:gap-16 items-center`}
              >
                {/* Text side */}
                <div className="flex-1">
                  <h3 className="font-display font-bold text-2xl md:text-3xl text-gray-900 dark:text-white tracking-tight mb-4">
                    {item.headline}
                  </h3>
                  <p className="text-gray-500 dark:text-zinc-400 text-lg leading-relaxed font-body">
                    {item.subtitle}
                  </p>
                </div>

                {/* Panel side */}
                <div className="flex-1 w-full max-w-md">
                  {item.panel}
                </div>
              </motion.div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
