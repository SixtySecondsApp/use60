/**
 * ProductShowcase V2
 *
 * 5 product panels with:
 *   - Smart email formatting with paragraph breaks
 *   - Forward/back/skip navigation with swipe support
 *   - Contextual micro-transitions per panel type
 *   - 44px minimum touch targets throughout
 *   - Segmented progress bar with counter
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence, type Variants } from 'framer-motion';
import {
  Calendar,
  TrendingUp,
  Mail,
  LayoutDashboard,
  Check,
  AlertTriangle,
  ArrowLeft,
  MessageSquare,
  Clock,
  Zap,
  Target,
  Users,
  BarChart3,
  Send,
  Edit3,
  Hash,
  Bot,
  ThumbsUp,
  X,
  ChevronRight,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type { ResearchData } from './demo-types';

// ============================================================================
// Contextual transition variants per panel type
// ============================================================================

// Smoother, more subtle transitions — less movement, longer duration
const PANEL_TRANSITIONS: Record<string, { enter: Variants; exit: Variants }> = {
  meeting: {
    enter: { hidden: { opacity: 0, y: 12 }, visible: { opacity: 1, y: 0 } },
    exit: { hidden: { opacity: 1 }, visible: { opacity: 0, y: -8 } },
  },
  deal: {
    enter: { hidden: { opacity: 0, y: 12 }, visible: { opacity: 1, y: 0 } },
    exit: { hidden: { opacity: 1 }, visible: { opacity: 0, y: -8 } },
  },
  email: {
    enter: { hidden: { opacity: 0, y: 12 }, visible: { opacity: 1, y: 0 } },
    exit: { hidden: { opacity: 1 }, visible: { opacity: 0, y: -8 } },
  },
  slack: {
    enter: { hidden: { opacity: 0, y: 12 }, visible: { opacity: 1, y: 0 } },
    exit: { hidden: { opacity: 1 }, visible: { opacity: 0, y: -8 } },
  },
  pipeline: {
    enter: { hidden: { opacity: 0, y: 12 }, visible: { opacity: 1, y: 0 } },
    exit: { hidden: { opacity: 1 }, visible: { opacity: 0, y: -8 } },
  },
};

// ============================================================================
// Panel Shell — app window chrome
// ============================================================================

interface PanelShellProps {
  icon: React.ReactNode;
  title: string;
  badge?: string;
  badgeColor?: string;
  children: React.ReactNode;
}

function PanelShell({ icon, title, badge, badgeColor = 'text-emerald-400 bg-emerald-500/10', children }: PanelShellProps) {
  return (
    <div className="bg-zinc-900/90 backdrop-blur-md border border-white/[0.06] rounded-xl sm:rounded-2xl overflow-hidden shadow-2xl shadow-black/20">
      {/* Window chrome */}
      <div className="flex items-center justify-between px-4 sm:px-5 py-3 border-b border-white/[0.05]">
        <div className="flex items-center gap-2.5">
          <div className="flex items-center gap-1.5 mr-2">
            <div className="w-2.5 h-2.5 rounded-full bg-zinc-700" />
            <div className="w-2.5 h-2.5 rounded-full bg-zinc-700" />
            <div className="w-2.5 h-2.5 rounded-full bg-zinc-700" />
          </div>
          {icon}
          <span className="text-xs sm:text-sm font-semibold text-zinc-200">{title}</span>
        </div>
        {badge && (
          <span className={cn('text-[9px] sm:text-[10px] font-mono px-2 py-0.5 rounded-full', badgeColor)}>
            {badge}
          </span>
        )}
      </div>
      <div className="p-4 sm:p-5">{children}</div>
    </div>
  );
}

// ============================================================================
// Email paragraph formatter
// ============================================================================

/** Parse a flat email string into structured paragraphs with proper breaks */
function formatEmailBody(raw: string): string[] {
  // First, normalise escaped newlines that Gemini sometimes returns as literal \n
  const normalised = raw.replace(/\\n/g, '\n');

  // If the email has real line breaks, split on them
  if (normalised.includes('\n')) {
    return normalised
      .split(/\n{1,}/)
      .map((p) => p.trim())
      .filter(Boolean);
  }

  // Otherwise, smart-split: detect greeting, body, sign-off
  const paragraphs: string[] = [];
  let remaining = normalised.trim();

  // Extract greeting (Hi X, / Hey X, / Dear X,)
  const greetingMatch = remaining.match(/^(Hi|Hey|Hello|Dear)\s+[^,.]+[,.]\s*/i);
  if (greetingMatch) {
    paragraphs.push(greetingMatch[0].trim());
    remaining = remaining.slice(greetingMatch[0].length).trim();
  }

  // Extract sign-off (Best, / Cheers, / Thanks, ... Name)
  const signOffMatch = remaining.match(/\s*(Best|Cheers|Thanks|Regards|Warm regards|Kind regards|Talk soon),?\s*[\n]?\s*([A-Z][a-z]+)?\s*$/i);
  let signOff = '';
  if (signOffMatch) {
    signOff = signOffMatch[0].trim();
    remaining = remaining.slice(0, remaining.length - signOffMatch[0].length).trim();
  }

  // Split body: every sentence gets its own paragraph for readability
  if (remaining) {
    const sentences = remaining.match(/[^.!?]+[.!?]+/g) || [remaining];
    for (const sentence of sentences) {
      const trimmed = sentence.trim();
      if (trimmed) paragraphs.push(trimmed);
    }
  }

  if (signOff) {
    // Split "Best, Alex" into "Best," and "Alex"
    const parts = signOff.split(/,\s*/);
    if (parts.length >= 2 && parts[1]) {
      paragraphs.push(`${parts[0]},`);
      paragraphs.push(parts[1]);
    } else {
      paragraphs.push(signOff);
    }
  }

  return paragraphs.length > 0 ? paragraphs : [raw];
}

// ============================================================================
// Panel 1: Meeting Brief
// ============================================================================

function MeetingBriefPanel({
  data,
  active,
  onDone,
}: {
  data: ResearchData['demo_actions']['meeting_prep'];
  active: boolean;
  onDone: () => void;
}) {
  const talkingPoints = data?.talking_points ?? [];
  const maxPoints = Math.min(talkingPoints.length, 3);
  const [visiblePoints, setVisiblePoints] = useState(0);

  useEffect(() => {
    if (!active) return;
    if (visiblePoints >= maxPoints) return;
    const t = setTimeout(() => setVisiblePoints((v) => v + 1), 600 + visiblePoints * 400);
    return () => clearTimeout(t);
  }, [active, visiblePoints, maxPoints]);

  useEffect(() => {
    if (visiblePoints >= maxPoints && maxPoints > 0 && active) {
      const t = setTimeout(onDone, 2800);
      return () => clearTimeout(t);
    }
  }, [visiblePoints, maxPoints, active, onDone]);

  useEffect(() => {
    if (active && maxPoints === 0) {
      const t = setTimeout(onDone, 2000);
      return () => clearTimeout(t);
    }
  }, [active, maxPoints, onDone]);

  return (
    <div className="space-y-3.5">
      {/* Attendee card */}
      <div className="flex items-center gap-3 p-3 rounded-lg bg-white/[0.03] border border-white/[0.05]">
        <div className="w-10 h-10 rounded-full bg-violet-500/15 flex items-center justify-center shrink-0">
          <Users className="w-4.5 h-4.5 text-violet-400" />
        </div>
        <div className="min-w-0">
          <p className="text-sm font-medium text-white truncate">{data?.attendee_name ?? 'Contact'}</p>
          <p className="text-[11px] text-zinc-500 truncate">{data?.attendee_company ?? 'Company'}</p>
        </div>
        <div className="ml-auto flex items-center gap-1.5 text-[10px] text-zinc-500 shrink-0">
          <Clock className="w-3 h-3" />
          Tomorrow, 2:00 PM
        </div>
      </div>

      {/* Context */}
      <div className="flex items-start gap-2.5 p-2.5 rounded-lg bg-amber-500/[0.04] border border-amber-500/10">
        <AlertTriangle className="w-3.5 h-3.5 text-amber-400 mt-0.5 shrink-0" />
        <p className="text-xs text-amber-400/80 leading-relaxed line-clamp-2">
          {data?.context ?? 'Preparing meeting intelligence...'}
        </p>
      </div>

      {/* Talking points */}
      <div className="space-y-1.5">
        <p className="text-[9px] font-mono text-zinc-500 uppercase tracking-wider">Talking Points</p>
        <div className="space-y-1.5">
          {talkingPoints.slice(0, visiblePoints).map((point, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, x: -8 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.3 }}
              className="flex items-start gap-2.5 p-2.5 rounded-lg bg-white/[0.02] border border-white/[0.04]"
            >
              <div className="w-5 h-5 rounded-md bg-violet-500/10 flex items-center justify-center shrink-0 mt-0.5">
                <MessageSquare className="w-2.5 h-2.5 text-violet-400" />
              </div>
              <p className="text-[11px] sm:text-xs text-zinc-300 leading-relaxed line-clamp-2">{point}</p>
            </motion.div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// Panel 2: Deal Intelligence
// ============================================================================

function DealIntelPanel({
  data,
  active,
  onDone,
}: {
  data: ResearchData['demo_actions']['pipeline_action'];
  active: boolean;
  onDone: () => void;
}) {
  const healthScore = data?.health_score ?? 45;
  const signals = data?.signals ?? [];
  const maxSignals = Math.min(signals.length, 4);
  const [scoreWidth, setScoreWidth] = useState(0);
  const [visibleSignals, setVisibleSignals] = useState(0);

  useEffect(() => {
    if (!active) return;
    const t = setTimeout(() => setScoreWidth(healthScore), 400);
    return () => clearTimeout(t);
  }, [active, healthScore]);

  useEffect(() => {
    if (!active || visibleSignals >= maxSignals) return;
    const t = setTimeout(() => setVisibleSignals((v) => v + 1), 800 + visibleSignals * 250);
    return () => clearTimeout(t);
  }, [active, visibleSignals, maxSignals]);

  useEffect(() => {
    if (visibleSignals >= maxSignals && maxSignals > 0 && active) {
      const t = setTimeout(onDone, 2800);
      return () => clearTimeout(t);
    }
  }, [visibleSignals, maxSignals, active, onDone]);

  useEffect(() => {
    if (active && maxSignals === 0) {
      const t = setTimeout(onDone, 2500);
      return () => clearTimeout(t);
    }
  }, [active, maxSignals, onDone]);

  const scoreColor = healthScore > 60 ? 'text-emerald-400' : healthScore > 35 ? 'text-amber-400' : 'text-red-400';
  const barColor = healthScore > 60 ? 'bg-emerald-500' : healthScore > 35 ? 'bg-amber-500' : 'bg-red-500';
  const barBg = healthScore > 60 ? 'bg-emerald-500/10' : healthScore > 35 ? 'bg-amber-500/10' : 'bg-red-500/10';

  return (
    <div className="space-y-4">
      {/* Deal header */}
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm sm:text-base font-semibold text-white truncate">{data?.deal_name ?? 'Deal'}</p>
          <p className="text-[11px] text-zinc-500 mt-0.5">{data?.days_stale ?? 0} days since last activity</p>
        </div>
        <span className="text-base sm:text-lg font-bold text-white tabular-nums shrink-0">
          {data?.deal_value ?? '$0'}
        </span>
      </div>

      {/* Health score bar */}
      <div className={cn('p-3 rounded-lg', barBg)}>
        <div className="flex items-center justify-between mb-2">
          <span className="text-[10px] font-mono text-zinc-400 uppercase tracking-wider">Deal Health</span>
          <span className={cn('text-lg font-bold tabular-nums', scoreColor)}>{scoreWidth}%</span>
        </div>
        <div className="h-2 bg-zinc-800 rounded-full overflow-hidden">
          <motion.div
            initial={{ width: 0 }}
            animate={{ width: `${scoreWidth}%` }}
            transition={{ duration: 1.2, ease: 'easeOut' }}
            className={cn('h-full rounded-full', barColor)}
          />
        </div>
      </div>

      {/* Signal chips */}
      <div className="flex flex-wrap gap-1.5">
        {signals.slice(0, visibleSignals).map((sig, i) => (
          <motion.span
            key={i}
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.2, type: 'spring', stiffness: 300 }}
            className={cn(
              'inline-flex items-center gap-1 px-2.5 py-1.5 rounded-full text-[10px] sm:text-[11px] font-medium border',
              sig.type === 'positive'
                ? 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20'
                : sig.type === 'warning'
                  ? 'text-amber-400 bg-amber-500/10 border-amber-500/20'
                  : 'text-zinc-400 bg-zinc-800 border-zinc-700'
            )}
          >
            <span className={cn(
              'w-1 h-1 rounded-full',
              sig.type === 'positive' ? 'bg-emerald-400' : sig.type === 'warning' ? 'bg-amber-400' : 'bg-zinc-500'
            )} />
            {sig.label}
          </motion.span>
        ))}
      </div>

      {/* Suggested action */}
      {visibleSignals >= maxSignals && data?.suggested_action && (
        <motion.div
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          className="p-3 rounded-lg bg-violet-500/[0.06] border border-violet-500/15"
        >
          <p className="text-[9px] font-mono text-violet-400 uppercase tracking-wider mb-1">Suggested Action</p>
          <p className="text-xs text-zinc-300 leading-relaxed line-clamp-2">{data.suggested_action}</p>
        </motion.div>
      )}
    </div>
  );
}

// ============================================================================
// Panel 3: Email Composer (with smart formatting)
// ============================================================================

function EmailComposerPanel({
  data,
  active,
  onDone,
}: {
  data: ResearchData['demo_actions']['cold_outreach'];
  active: boolean;
  onDone: () => void;
}) {
  const [charIndex, setCharIndex] = useState(0);
  const emailText = data?.email_preview ?? 'Composing personalised outreach...';
  const paragraphs = formatEmailBody(emailText);
  const isDone = charIndex >= emailText.length;

  useEffect(() => {
    if (!active || isDone) return;
    const t = setTimeout(() => setCharIndex((c) => c + 1), 12);
    return () => clearTimeout(t);
  }, [active, charIndex, isDone, emailText.length]);

  useEffect(() => { setCharIndex(0); }, [emailText]);

  useEffect(() => {
    if (isDone && active) {
      const t = setTimeout(onDone, 2800);
      return () => clearTimeout(t);
    }
  }, [isDone, active, onDone]);

  const targetName = data?.target_name ?? 'Contact';
  const targetCompany = data?.target_company ?? 'Company';

  // Render the formatted email after typing is done, raw during typing
  const renderEmailBody = () => {
    if (!isDone) {
      // During typewriter, show raw text with cursor
      return (
        <p className="text-xs sm:text-sm text-zinc-300 leading-relaxed">
          {emailText.slice(0, charIndex)}
          <span className="text-violet-400 animate-pulse motion-reduce:animate-none">&block;</span>
        </p>
      );
    }

    // After typing done, render with proper paragraph breaks
    return (
      <div className="space-y-3">
        {paragraphs.map((para, i) => {
          // Sign-off name gets bold treatment
          const isSignOffName = i === paragraphs.length - 1 && /^[A-Z][a-z]+$/.test(para);
          const isSignOffLine = /^(Best|Cheers|Thanks|Regards|Warm regards|Kind regards|Talk soon),?$/i.test(para);

          return (
            <motion.p
              key={i}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: i * 0.05 }}
              className={cn(
                'text-xs sm:text-sm leading-relaxed',
                isSignOffName ? 'text-white font-medium' :
                isSignOffLine ? 'text-zinc-400' :
                'text-zinc-300'
              )}
            >
              {para}
            </motion.p>
          );
        })}
      </div>
    );
  };

  return (
    <div className="space-y-3">
      {/* Email header */}
      <div className="space-y-2 pb-3 border-b border-white/[0.05]">
        <div className="flex items-center gap-2 text-[11px] sm:text-xs">
          <span className="text-zinc-500 w-8">To:</span>
          <span className="text-zinc-300">
            {targetName.toLowerCase().replace(' ', '.')}@{targetCompany.toLowerCase().replace(/\s+/g, '')}.com
          </span>
        </div>
        <div className="flex items-center gap-2 text-[11px] sm:text-xs">
          <span className="text-zinc-500 w-8">Re:</span>
          <span className="text-zinc-300 truncate">
            {data?.personalised_hook?.split(' ').slice(0, 6).join(' ') ?? 'Quick question'}...
          </span>
        </div>
      </div>

      {/* Email body — formatted */}
      <div className="min-h-[100px] max-h-[200px] overflow-y-auto scrollbar-thin py-1">
        {renderEmailBody()}
      </div>

      {/* Actions */}
      {isDone && (
        <motion.div
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
          className="flex items-center gap-2.5 pt-2 border-t border-white/[0.05]"
        >
          <button className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-violet-600 text-white text-xs font-semibold hover:bg-violet-500 transition-colors min-h-[36px]">
            <Send className="w-3.5 h-3.5" />
            Send
          </button>
          <button className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-white/[0.05] border border-white/[0.08] text-zinc-300 text-xs font-medium hover:bg-white/[0.08] transition-colors min-h-[36px]">
            <Edit3 className="w-3.5 h-3.5" />
            Edit
          </button>
        </motion.div>
      )}
    </div>
  );
}

// ============================================================================
// Panel 4: Slack Proactive Alert
// ============================================================================

function SlackAlertPanel({
  data,
  active,
  onDone,
}: {
  data: ResearchData;
  active: boolean;
  onDone: () => void;
}) {
  const dealName = data.demo_actions?.pipeline_action?.deal_name?.split('\u2014')[0]?.trim() ?? 'Meridian Group';
  const targetName = data.demo_actions?.cold_outreach?.target_name ?? 'Sarah Chen';
  const companyName = data.company?.name ?? 'Company';

  const [phase, setPhase] = useState(0);

  useEffect(() => {
    if (!active) return;
    const timers = [
      setTimeout(() => setPhase(1), 800),
      setTimeout(() => setPhase(2), 2000),
    ];
    return () => timers.forEach(clearTimeout);
  }, [active]);

  useEffect(() => {
    if (phase === 2 && active) {
      const t = setTimeout(() => setPhase(3), 1500);
      return () => clearTimeout(t);
    }
  }, [phase, active]);

  useEffect(() => {
    if (phase === 3 && active) {
      const t = setTimeout(onDone, 2800);
      return () => clearTimeout(t);
    }
  }, [phase, active, onDone]);

  return (
    <div className="space-y-3">
      {/* Slack channel header */}
      <div className="flex items-center gap-2 pb-2 border-b border-white/[0.05]">
        <Hash className="w-3.5 h-3.5 text-zinc-500" />
        <span className="text-xs font-medium text-zinc-300">sales-alerts</span>
        <span className="ml-auto text-[10px] text-zinc-600">just now</span>
      </div>

      {/* Bot message */}
      {phase >= 1 ? (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, ease: [0.25, 0.1, 0.25, 1] }}
          className="flex gap-2.5"
        >
          <div className="w-9 h-9 rounded-lg bg-violet-500/15 border border-violet-500/20 flex items-center justify-center shrink-0">
            <Bot className="w-4 h-4 text-violet-400" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1.5">
              <span className="text-xs font-bold text-white">60 AI</span>
              <span className="text-[9px] px-1.5 py-0.5 rounded bg-violet-500/15 text-violet-400 font-mono">APP</span>
            </div>
            <div className="text-xs sm:text-sm text-zinc-300 leading-relaxed space-y-2">
              <p>
                Heads up — the <strong className="text-white">{dealName}</strong> deal champion hasn't opened your last 3 emails.
                Last meeting was 22 days ago.
              </p>
              <p>
                I've drafted a LinkedIn re-engagement message for <strong className="text-white">{targetName}</strong> referencing {companyName}'s Q2 expansion plans.
              </p>
            </div>

            {/* Action buttons — proper touch targets */}
            {phase >= 2 && (
              <motion.div
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.25 }}
                className="flex items-center gap-2 mt-3"
              >
                <div
                  className={cn(
                    'inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-semibold transition-all duration-300 min-h-[36px]',
                    phase >= 3
                      ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                      : 'bg-violet-600 text-white hover:bg-violet-500 cursor-pointer'
                  )}
                >
                  {phase >= 3 ? (
                    <>
                      <Check className="w-3.5 h-3.5" />
                      Sent
                    </>
                  ) : (
                    <>
                      <ThumbsUp className="w-3.5 h-3.5" />
                      Send It
                    </>
                  )}
                </div>
                {phase < 3 && (
                  <div className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-white/[0.05] border border-white/[0.08] text-zinc-400 text-xs cursor-pointer hover:bg-white/[0.08] min-h-[36px]">
                    <X className="w-3.5 h-3.5" />
                    Dismiss
                  </div>
                )}
              </motion.div>
            )}

            {/* Confirmation */}
            {phase >= 3 && (
              <motion.p
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="text-[10px] text-emerald-400/60 mt-2 font-mono"
              >
                Message sent to {targetName} on LinkedIn &middot; Follow-up task created for Thursday
              </motion.p>
            )}
          </div>
        </motion.div>
      ) : (
        <div className="flex items-center gap-2 py-4">
          <div className="flex gap-1">
            <div className="w-1.5 h-1.5 rounded-full bg-zinc-500 animate-bounce motion-reduce:animate-none" style={{ animationDelay: '0ms' }} />
            <div className="w-1.5 h-1.5 rounded-full bg-zinc-500 animate-bounce motion-reduce:animate-none" style={{ animationDelay: '150ms' }} />
            <div className="w-1.5 h-1.5 rounded-full bg-zinc-500 animate-bounce motion-reduce:animate-none" style={{ animationDelay: '300ms' }} />
          </div>
          <span className="text-[11px] text-zinc-500">60 AI is typing...</span>
        </div>
      )}
    </div>
  );
}

// ============================================================================
// Panel 5: Pipeline Dashboard
// ============================================================================

function PipelineDashboardPanel({
  data,
  active,
  onDone,
}: {
  data: ResearchData;
  active: boolean;
  onDone: () => void;
}) {
  const stats = data.stats;
  const targetName = data.demo_actions?.cold_outreach?.target_name ?? 'prospect';
  const tasks = [
    { label: `Send ROI calculator to ${targetName}` },
    { label: 'Book technical review meeting' },
    { label: 'Update deal forecast in CRM' },
    { label: 'Prep QBR deck for Thursday' },
    { label: 'Share call summary on Slack' },
  ];

  const [checkedCount, setCheckedCount] = useState(0);
  const [visibleStats, setVisibleStats] = useState(false);

  const STATS_LIST = [
    { icon: Zap, value: stats.signals_found, label: 'Signals', color: 'text-violet-400' },
    { icon: Target, value: stats.actions_queued, label: 'Actions', color: 'text-emerald-400' },
    { icon: Users, value: stats.contacts_identified, label: 'Contacts', color: 'text-amber-400' },
    { icon: BarChart3, value: stats.opportunities_mapped, label: 'Deals', color: 'text-cyan-400' },
  ];

  useEffect(() => {
    if (!active) return;
    const t = setTimeout(() => setVisibleStats(true), 400);
    return () => clearTimeout(t);
  }, [active]);

  useEffect(() => {
    if (!active || !visibleStats) return;
    if (checkedCount >= 3) return;
    const t = setTimeout(() => setCheckedCount((c) => c + 1), 600 + checkedCount * 500);
    return () => clearTimeout(t);
  }, [active, visibleStats, checkedCount]);

  useEffect(() => {
    if (checkedCount >= 3 && active) {
      const t = setTimeout(onDone, 2800);
      return () => clearTimeout(t);
    }
  }, [checkedCount, active, onDone]);

  return (
    <div className="space-y-4">
      {/* Stats row */}
      {visibleStats && (
        <motion.div
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          className="grid grid-cols-4 gap-2"
        >
          {STATS_LIST.map(({ icon: Icon, value, label, color }, i) => (
            <motion.div
              key={label}
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: i * 0.1, duration: 0.25 }}
              className="text-center p-2 sm:p-2.5 rounded-lg bg-white/[0.02] border border-white/[0.04]"
            >
              <Icon className={cn('w-3.5 h-3.5 mx-auto mb-1', color)} />
              <p className="text-sm sm:text-base font-bold text-white tabular-nums">{value}</p>
              <p className="text-[9px] text-zinc-500">{label}</p>
            </motion.div>
          ))}
        </motion.div>
      )}

      {/* Task list */}
      {visibleStats && (
        <motion.div
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4, duration: 0.3 }}
          className="space-y-1.5"
        >
          <div className="flex items-center justify-between">
            <p className="text-[9px] font-mono text-zinc-500 uppercase tracking-wider">Auto-generated Tasks</p>
            <motion.span
              initial={{ opacity: 0 }}
              animate={{ opacity: checkedCount > 0 ? 1 : 0 }}
              className="text-[10px] font-semibold text-violet-400 tabular-nums"
            >
              {checkedCount}/{tasks.length} completed
            </motion.span>
          </div>
          <ul className="space-y-1.5">
            {tasks.map((task, i) => {
              const isChecked = i < checkedCount;
              return (
                <motion.li
                  key={i}
                  initial={{ opacity: 0, x: -6 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.5 + i * 0.08, duration: 0.25 }}
                  className="flex items-center gap-2.5 min-h-[32px]"
                >
                  <div
                    className={cn(
                      'w-5 h-5 rounded-md border flex items-center justify-center shrink-0 transition-all duration-300',
                      isChecked
                        ? 'bg-violet-500 border-violet-500'
                        : 'border-zinc-600 bg-transparent'
                    )}
                  >
                    {isChecked && (
                      <motion.div
                        initial={{ scale: 0 }}
                        animate={{ scale: 1 }}
                        transition={{ type: 'spring', stiffness: 500, damping: 15 }}
                      >
                        <Check className="w-3 h-3 text-white" />
                      </motion.div>
                    )}
                  </div>
                  <span
                    className={cn(
                      'text-xs sm:text-sm transition-all duration-300 truncate',
                      isChecked ? 'text-zinc-500 line-through' : 'text-zinc-300'
                    )}
                  >
                    {task.label}
                  </span>
                </motion.li>
              );
            })}
          </ul>
        </motion.div>
      )}
    </div>
  );
}

// ============================================================================
// Panel definitions
// ============================================================================

interface PanelDef {
  id: string;
  headline: string;
  subtitle: string;
  icon: React.ReactNode;
  title: string;
  badge: string;
  transitionKey: keyof typeof PANEL_TRANSITIONS;
  render: (data: ResearchData, onDone: () => void) => React.ReactNode;
}

const PANELS: PanelDef[] = [
  {
    id: 'meeting',
    headline: 'Know more than they expect.',
    subtitle: 'Company intel, stakeholder context, and talking points. Ready before you are.',
    icon: <Calendar className="w-3.5 h-3.5 text-violet-400" />,
    title: 'Meeting Brief',
    badge: 'AI Generated',
    transitionKey: 'meeting',
    render: (data, onDone) => (
      <MeetingBriefPanel data={data.demo_actions.meeting_prep} active onDone={onDone} />
    ),
  },
  {
    id: 'deal',
    headline: 'Spot the deals about to slip.',
    subtitle: '14 health signals per deal. You see the risk before it costs you.',
    icon: <TrendingUp className="w-3.5 h-3.5 text-amber-400" />,
    title: 'Deal Intelligence',
    badge: 'Live',
    transitionKey: 'deal',
    render: (data, onDone) => (
      <DealIntelPanel data={data.demo_actions.pipeline_action} active onDone={onDone} />
    ),
  },
  {
    id: 'email',
    headline: 'Outreach that sounds like you.',
    subtitle: 'Grounded in real research. Short enough to read. Personal enough to reply to.',
    icon: <Mail className="w-3.5 h-3.5 text-emerald-400" />,
    title: 'Email Composer',
    badge: 'Draft',
    transitionKey: 'email',
    render: (data, onDone) => (
      <EmailComposerPanel data={data.demo_actions.cold_outreach} active onDone={onDone} />
    ),
  },
  {
    id: 'slack',
    headline: 'It flags the deal. Then fixes it.',
    subtitle: 'When a champion goes quiet or emails stop opening, 60 tells you in Slack and drafts the re-engagement.',
    icon: <Hash className="w-3.5 h-3.5 text-zinc-300" />,
    title: 'Slack — #sales-alerts',
    badge: 'Proactive',
    transitionKey: 'slack',
    render: (data, onDone) => (
      <SlackAlertPanel data={data} active onDone={onDone} />
    ),
  },
  {
    id: 'pipeline',
    headline: 'Your whole pipeline. Zero typing.',
    subtitle: 'Signals, contacts, and next steps — tracked from your calls and emails. Nothing to log.',
    icon: <LayoutDashboard className="w-3.5 h-3.5 text-cyan-400" />,
    title: 'Pipeline Dashboard',
    badge: 'Real-time',
    transitionKey: 'pipeline',
    render: (data, onDone) => (
      <PipelineDashboardPanel data={data} active onDone={onDone} />
    ),
  },
];

// ============================================================================
// Main
// ============================================================================

interface ProductShowcaseProps {
  data: ResearchData;
  onComplete: () => void;
}

export function ProductShowcase({ data, onComplete }: ProductShowcaseProps) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [direction, setDirection] = useState(1); // 1 = forward, -1 = back
  const touchStartX = useRef(0);
  const touchStartY = useRef(0);
  const containerRef = useRef<HTMLDivElement>(null);

  const goTo = useCallback((index: number) => {
    if (index < 0 || index >= PANELS.length) return;
    setDirection(index > currentIndex ? 1 : -1);
    setCurrentIndex(index);
  }, [currentIndex]);

  const goForward = useCallback(() => {
    if (currentIndex < PANELS.length - 1) {
      setDirection(1);
      setCurrentIndex((i) => i + 1);
    } else {
      onComplete();
    }
  }, [currentIndex, onComplete]);

  const goBack = useCallback(() => {
    if (currentIndex > 0) {
      setDirection(-1);
      setCurrentIndex((i) => i - 1);
    }
  }, [currentIndex]);

  const handlePanelDone = useCallback(() => {
    goForward();
  }, [goForward]);

  // Swipe support
  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
    touchStartY.current = e.touches[0].clientY;
  }, []);

  const handleTouchEnd = useCallback((e: React.TouchEvent) => {
    const dx = e.changedTouches[0].clientX - touchStartX.current;
    const dy = e.changedTouches[0].clientY - touchStartY.current;
    // Only register horizontal swipes (not vertical scroll)
    if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5) {
      if (dx < 0) goForward();
      else goBack();
    }
  }, [goForward, goBack]);

  // Keyboard nav
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight' || e.key === ' ') { e.preventDefault(); goForward(); }
      if (e.key === 'ArrowLeft') { e.preventDefault(); goBack(); }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [goForward, goBack]);

  const panel = PANELS[currentIndex];
  const transition = PANEL_TRANSITIONS[panel.transitionKey];

  return (
    <motion.div
      ref={containerRef}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.35, ease: [0.25, 0.1, 0.25, 1] }}
      className="min-h-[100dvh] flex flex-col items-center justify-center px-5 sm:px-6"
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
    >
      <div className="w-full max-w-md sm:max-w-lg mx-auto">
        {/* Segmented progress bar */}
        <div className="mb-6 sm:mb-8">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[10px] text-zinc-500 font-mono tabular-nums">
              {currentIndex + 1} of {PANELS.length}
            </span>
            {currentIndex < PANELS.length - 1 && (
              <button
                onClick={onComplete}
                className="text-[10px] text-zinc-500 hover:text-zinc-300 transition-colors
                  py-1 px-2 -mr-2 min-h-[28px] flex items-center"
              >
                Skip all
              </button>
            )}
          </div>
          <div className="flex gap-1">
            {PANELS.map((_, i) => (
              <button
                key={i}
                onClick={() => goTo(i)}
                className="relative flex-1 h-1.5 rounded-full overflow-hidden cursor-pointer
                  min-h-[12px] flex items-center group"
                aria-label={`Go to panel ${i + 1}`}
              >
                <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 h-1.5 rounded-full bg-zinc-800 group-hover:bg-zinc-700 transition-colors" />
                <motion.div
                  className="absolute inset-x-0 top-1/2 -translate-y-1/2 h-1.5 rounded-full bg-violet-500 origin-left"
                  initial={false}
                  animate={{
                    scaleX: i < currentIndex ? 1 : i === currentIndex ? 0.5 : 0,
                  }}
                  transition={{ duration: 0.5, ease: [0.25, 0.1, 0.25, 1] }}
                />
              </button>
            ))}
          </div>
        </div>

        {/* Headline */}
        <AnimatePresence mode="wait">
          <motion.div
            key={currentIndex}
            initial={{ opacity: 0, y: direction > 0 ? 8 : -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: direction > 0 ? -6 : 6 }}
            transition={{ duration: 0.45, ease: [0.25, 0.1, 0.25, 1] }}
            className="text-center mb-5 sm:mb-6"
          >
            <p className="text-[10px] sm:text-[11px] font-mono text-zinc-500 uppercase tracking-widest mb-2">
              Personalised for {data.company?.name ?? 'your company'}
            </p>
            <h2 className="text-xl sm:text-2xl md:text-3xl font-bold text-white text-balance tracking-tight">
              {panel.headline}
            </h2>
            <p className="text-xs sm:text-sm text-zinc-400 mt-2 text-pretty max-w-sm mx-auto">
              {panel.subtitle}
            </p>
          </motion.div>
        </AnimatePresence>

        {/* Panel card with contextual transitions */}
        <AnimatePresence mode="wait" custom={direction}>
          <motion.div
            key={currentIndex}
            variants={transition.enter}
            initial="hidden"
            animate="visible"
            exit="visible"
            transition={{ duration: 0.5, ease: [0.25, 0.1, 0.25, 1] }}
          >
            <PanelShell
              icon={panel.icon}
              title={panel.title}
              badge={panel.badge}
            >
              {panel.render(data, handlePanelDone)}
            </PanelShell>
          </motion.div>
        </AnimatePresence>

        {/* Navigation controls */}
        <div className="mt-5 sm:mt-6 flex items-center justify-between">
          <button
            onClick={goBack}
            disabled={currentIndex === 0}
            className={cn(
              'flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-xs font-medium transition-all min-h-[44px]',
              currentIndex === 0
                ? 'text-zinc-700 cursor-not-allowed'
                : 'text-zinc-400 hover:text-white hover:bg-white/[0.05]'
            )}
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            Back
          </button>

          <button
            onClick={goForward}
            className={cn(
              'flex items-center gap-1.5 px-5 py-2.5 rounded-xl text-xs font-semibold transition-all min-h-[44px]',
              currentIndex === PANELS.length - 1
                ? 'bg-violet-600 text-white hover:bg-violet-500'
                : 'text-zinc-300 hover:text-white hover:bg-white/[0.05]'
            )}
          >
            {currentIndex === PANELS.length - 1 ? 'Continue' : 'Next'}
            <ChevronRight className="w-3.5 h-3.5" />
          </button>
        </div>

      </div>
    </motion.div>
  );
}
