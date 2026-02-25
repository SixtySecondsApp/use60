/**
 * DemoCopilot — Step 7
 *
 * Full-screen Copilot interface with 4 contextualised demo prompt cards.
 * Clicking a prompt "streams" a pre-generated response into a chat view.
 * Chat input is disabled — sign-up CTA appears after first interaction.
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Target, FileText, Calendar, AlertTriangle, Send, ArrowRight, Bot } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useTypewriter } from './useTypewriter';
import type { ResearchData, DemoPrompt } from './demo-types';

// ============================================================================
// Build prompts from research data
// ============================================================================

function buildPrompts(data: ResearchData): DemoPrompt[] {
  const da = data.demo_actions ?? {} as ResearchData['demo_actions'];
  const companyName = data.company?.name || 'your company';

  // Defensive defaults — API may return {} for failed queries
  const o = {
    target_name: 'Contact', target_title: 'Decision Maker', target_company: 'Company',
    personalised_hook: '', email_preview: '',
    ...da.cold_outreach,
  };
  const p = {
    prospect_name: 'Prospect', prospect_company: 'Company',
    proposal_title: 'Partnership Proposal', key_sections: [] as string[],
    ...da.proposal_draft,
  };
  // Ensure key_sections is always an array
  if (!Array.isArray(p.key_sections)) p.key_sections = [];

  const m = {
    attendee_name: 'Contact', attendee_company: 'Company', context: '',
    talking_points: [] as string[],
    ...da.meeting_prep,
  };
  if (!Array.isArray(m.talking_points)) m.talking_points = [];

  const d = {
    deal_name: 'Deal', deal_value: '$0', days_stale: 0, health_score: 0,
    risk_signal: '', suggested_action: '', signals: [] as { label: string; type: string }[],
    ...da.pipeline_action,
  };
  if (!Array.isArray(d.signals)) d.signals = [];

  const cr = data.copilot_responses;

  const fallbackOutreach = `Here's a cold email for ${o.target_name} at ${o.target_company} — written using our sales sequence methodology:\n\n---\n\n${o.email_preview}\n\n---\n\n**Why this works (our 10 rules):**\n- Under 75 words — short enough to read on a phone\n- Opens with an observation, not an intro ("${(o.personalised_hook || '').slice(0, 50)}\u2026")\n- Interest-based CTA — easy to reply in under 10 seconds\n- 3rd-grade reading level — no jargon, no fluff\n- Sounds human — contractions, varied sentence length, no AI tells\n\nWant me to build a 3-touch follow-up sequence with different angles for each email?`;

  const fallbackProposal = `Here's a proposal outline for ${p.prospect_company}:\n\n# ${p.proposal_title}\n\n${p.key_sections.map((s: string, i: number) => `## ${i + 1}. ${s}`).join('\n\n')}\n\n---\n\n**Executive Summary:** ${companyName} helps teams like ${p.prospect_company} streamline their sales workflow, reduce manual work by 40%, and close deals faster.\n\n**Projected ROI:**\n- 35% reduction in deal cycle time\n- 60% less time on manual CRM updates\n- 28% improvement in close rate\n\n**Next steps:** I can expand any section or schedule a walkthrough with ${p.prospect_name}. Want me to draft the full proposal?`;

  const fallbackMeeting = `# Meeting Brief: ${m.attendee_name} \u2014 ${m.attendee_company}\n\n**Context:** ${m.context}\n\n**Key Talking Points:**\n${m.talking_points.map((tp: string, i: number) => `${i + 1}. ${tp}`).join('\n')}\n\n**Potential Objections:**\n- "We're happy with our current setup" \u2192 Highlight migration simplicity and quick wins\n- "Not in budget right now" \u2192 Offer a pilot program with 3-month commitment\n\n**Ask:** Push for a technical review meeting with their team lead. If ${m.attendee_name}'s interested, get calendar access to book directly.\n\nWant me to draft a pre-meeting email to ${m.attendee_name}?`;

  const fallbackPipeline = `# Deal Risk Analysis: ${d.deal_name}\n\n**Value:** ${d.deal_value}\n**Health Score:** ${d.health_score}%\n**Days Since Activity:** ${d.days_stale}\n\n**Risk Signal:** ${d.risk_signal}\n\n**Signals:**\n${d.signals.map((s: { label: string; type: string }) => `- ${s.type === 'warning' ? '\u26a0\ufe0f' : '\u2705'} ${s.label}`).join('\n')}\n\n**Recommended Action:**\n${d.suggested_action}\n\n**Draft LinkedIn Message:**\n"Hi [Champion] \u2014 saw ${(d.deal_name || '').split('\u2014')[0].trim()} is expanding this quarter. Wanted to loop back on how ${companyName} could support the transition. Worth a quick sync?"\n\nWant me to send this message and create a follow-up task?`;

  return [
    {
      id: 'outreach',
      label: `Write cold outreach to ${o.target_name}`,
      description: `Personalised email to ${o.target_title} at ${o.target_company}`,
      icon: 'Target',
      iconColor: 'text-violet-400',
      prompt: `Write a cold outreach email to ${o.target_name}, ${o.target_title} at ${o.target_company}`,
      response: cr?.outreach || fallbackOutreach,
    },
    {
      id: 'proposal',
      label: `Draft proposal for ${p.prospect_company}`,
      description: 'Structured proposal with ROI projections',
      icon: 'FileText',
      iconColor: 'text-emerald-400',
      prompt: `Draft a proposal for ${p.prospect_name} at ${p.prospect_company}`,
      response: cr?.proposal || fallbackProposal,
    },
    {
      id: 'meeting',
      label: `Prep for meeting with ${m.attendee_name}`,
      description: `Pre-meeting brief for ${m.attendee_company}`,
      icon: 'Calendar',
      iconColor: 'text-amber-400',
      prompt: `Prepare me for my meeting with ${m.attendee_name} at ${m.attendee_company}`,
      response: cr?.meeting || fallbackMeeting,
    },
    {
      id: 'pipeline',
      label: `What about the ${d.deal_name.split('\u2014')[0].trim()} deal?`,
      description: `${d.days_stale} days stale \u2014 risk analysis`,
      icon: 'AlertTriangle',
      iconColor: 'text-red-400',
      prompt: `What should I do about the ${d.deal_name} deal?`,
      response: cr?.pipeline || fallbackPipeline,
    },
  ];
}

const ICON_MAP: Record<string, React.ElementType> = {
  Target,
  FileText,
  Calendar,
  AlertTriangle,
};

// ============================================================================
// Chat message with typewriter
// ============================================================================

function StreamingMessage({ content }: { content: string }) {
  const { displayed, isDone } = useTypewriter(content, 10, true);

  return (
    <div className="text-xs sm:text-sm text-gray-200 leading-relaxed whitespace-pre-wrap">
      {displayed}
      {!isDone && <span className="text-violet-400 animate-pulse motion-reduce:animate-none">&block;</span>}
    </div>
  );
}

// ============================================================================
// Component
// ============================================================================

interface DemoCopilotProps {
  research: ResearchData;
  onContinue: () => void;
}

export function DemoCopilot({ research, onContinue }: DemoCopilotProps) {
  const prompts = buildPrompts(research);
  const [activePrompt, setActivePrompt] = useState<DemoPrompt | null>(null);
  const [triedCount, setTriedCount] = useState(0);
  const [triedIds, setTriedIds] = useState<Set<string>>(new Set());
  const scrollRef = useRef<HTMLDivElement>(null);

  const handlePromptClick = useCallback(
    (prompt: DemoPrompt) => {
      setActivePrompt(prompt);
      if (!triedIds.has(prompt.id)) {
        setTriedIds((prev) => new Set(prev).add(prompt.id));
        setTriedCount((c) => c + 1);
      }
    },
    [triedIds]
  );

  // Auto-scroll to bottom when new prompt selected
  useEffect(() => {
    if (scrollRef.current) {
      requestAnimationFrame(() => {
        scrollRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
      });
    }
  }, [activePrompt]);

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.98 }}
      transition={{ duration: 0.4, ease: [0.25, 0.1, 0.25, 1] }}
      className="min-h-[100dvh] flex flex-col px-4 sm:px-6 py-6 sm:py-8"
    >
      <div className="w-full max-w-3xl mx-auto flex flex-col flex-1">
        {/* Header */}
        <div className="text-center mb-4 sm:mb-6">
          <h2 className="text-xl sm:text-2xl md:text-3xl font-bold text-white tracking-tight text-balance">
            Ask it anything about your pipeline
          </h2>
          <p className="text-xs sm:text-sm text-gray-400 mt-1.5 sm:mt-2">
            Your copilot already knows your business. Pick a task and watch it work.
          </p>
        </div>

        {/* Prompt cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 sm:gap-3 mb-4 sm:mb-6">
          {prompts.map((prompt) => {
            const Icon = ICON_MAP[prompt.icon] || Target;
            const tried = triedIds.has(prompt.id);
            const isActive = activePrompt?.id === prompt.id;

            return (
              <button
                key={prompt.id}
                onClick={() => handlePromptClick(prompt)}
                className={cn(
                  'group relative p-3 sm:p-4 rounded-xl text-left transition-all duration-200',
                  'bg-white/[0.03] backdrop-blur-sm border',
                  isActive
                    ? 'border-violet-500/50 bg-violet-500/[0.06] scale-[0.98]'
                    : tried
                      ? 'border-white/[0.04] opacity-60 hover:opacity-80'
                      : 'border-white/[0.06] hover:border-white/[0.15] hover:bg-white/[0.05] active:scale-[0.98]',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500'
                )}
              >
                <div className="flex items-start gap-2.5 sm:gap-3">
                  <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-lg bg-white/[0.06] border border-white/[0.08] flex items-center justify-center shrink-0">
                    <Icon className={cn('w-3.5 h-3.5 sm:w-4 sm:h-4', prompt.iconColor)} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs sm:text-sm font-semibold text-white line-clamp-1">
                      {prompt.label}
                    </p>
                    <p className="text-[11px] sm:text-xs text-gray-500 mt-0.5 line-clamp-1">
                      {prompt.description}
                    </p>
                  </div>
                </div>
              </button>
            );
          })}
        </div>

        {/* Chat area */}
        <div
          ref={scrollRef}
          className="flex-1 bg-gray-900/60 backdrop-blur-sm border border-white/[0.06]
            rounded-2xl overflow-y-auto min-h-[240px] sm:min-h-[280px] max-h-[45vh] sm:max-h-[50vh]"
        >
          {!activePrompt ? (
            <div className="h-full flex items-center justify-center p-6 sm:p-8">
              <div className="text-center">
                <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-full bg-gray-800 flex items-center justify-center mx-auto mb-3">
                  <Bot className="w-5 h-5 sm:w-6 sm:h-6 text-gray-500" />
                </div>
                <p className="text-xs sm:text-sm text-gray-500">
                  Select a prompt above to see your copilot in action
                </p>
              </div>
            </div>
          ) : (
            <div className="p-4 sm:p-5 space-y-4">
              {/* User message */}
              <div className="flex justify-end">
                <div className="bg-violet-500/15 border border-violet-500/20 rounded-xl px-3 sm:px-4 py-2 sm:py-2.5 max-w-[85%] sm:max-w-[80%]">
                  <p className="text-xs sm:text-sm text-violet-200">{activePrompt.prompt}</p>
                </div>
              </div>

              {/* AI response */}
              <div className="flex gap-2.5 sm:gap-3">
                <div className="w-6 h-6 sm:w-7 sm:h-7 rounded-full bg-emerald-500/15 flex items-center justify-center shrink-0 mt-0.5">
                  <Bot className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-emerald-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <StreamingMessage
                    key={activePrompt.id}
                    content={activePrompt.response}
                  />
                  <p className="text-[9px] sm:text-[10px] text-gray-600 mt-4 font-mono">
                    Demo mode &mdash; sign up to use with your real data
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Disabled input */}
        <div className="mt-2.5 sm:mt-3 relative">
          <div
            className="w-full px-4 py-2.5 sm:py-3 rounded-xl bg-gray-800/30 border border-white/[0.04] border-dashed
              text-xs sm:text-sm text-gray-600 cursor-not-allowed select-none"
          >
            Sign up to type your own prompts&hellip;
          </div>
          <Send className="absolute right-4 top-1/2 -translate-y-1/2 w-3.5 h-3.5 sm:w-4 sm:h-4 text-gray-700/50" />
        </div>

        {/* Continue CTA */}
        <AnimatePresence>
          {triedCount >= 1 && (
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.4 }}
              className="mt-5 sm:mt-6 text-center"
            >
              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                transition={{ type: 'spring', stiffness: 400, damping: 17 }}
                onClick={onContinue}
                className={cn(
                  'px-8 py-3 rounded-xl font-semibold text-sm',
                  'bg-white text-gray-950',
                  'hover:bg-gray-100 transition-colors',
                  'inline-flex items-center gap-2',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:ring-offset-2 focus-visible:ring-offset-gray-950',
                  'motion-reduce:transform-none'
                )}
              >
                Get Started &mdash; It&apos;s Free
                <ArrowRight className="w-4 h-4" />
              </motion.button>
              <p className="text-[11px] sm:text-xs text-gray-500 mt-2">
                {triedCount < 3
                  ? `${3 - triedCount} more to try, or get started now`
                  : "That's a preview. The real thing runs every day, automatically."}
              </p>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  );
}
