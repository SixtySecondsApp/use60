/**
 * DemoCopilot V2
 *
 * Enhanced copilot with:
 *   - Structured response cards (not just streaming text)
 *   - Response renders in a product-like chat UI
 *   - Quick prompt chips with icons
 *   - Sign-up CTA after first interaction
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Target,
  FileText,
  Calendar,
  AlertTriangle,
  Send,
  ArrowRight,
  Bot,
  Sparkles,
  Copy,
  Check,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useTypewriter } from '../demo/useTypewriter';
import type { ResearchData, DemoPrompt } from './demo-types';

// ============================================================================
// Build prompts from research data
// ============================================================================

function buildPrompts(data: ResearchData): DemoPrompt[] {
  const da = data.demo_actions ?? {} as ResearchData['demo_actions'];
  const companyName = data.company?.name || 'your company';

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

  const fallbackOutreach = `Here's a cold email for ${o.target_name} at ${o.target_company}:\n\n---\n\n${o.email_preview}\n\n---\n\n**Why this works:**\n- Under 75 words — reads in 30 seconds\n- Opens with an observation, not a pitch\n- Interest-based CTA — easy to reply\n- References real ${companyName} products\n\nWant me to build a 3-touch follow-up sequence?`;

  const fallbackProposal = `# ${p.proposal_title}\n\n${p.key_sections.map((s: string, i: number) => `## ${i + 1}. ${s}`).join('\n\n')}\n\n**Executive Summary:** ${companyName} helps teams like ${p.prospect_company} close deals faster with AI-powered pipeline intelligence.\n\n**Projected ROI:**\n- 35% faster deal cycles\n- 60% less manual CRM work\n- 28% improvement in close rate\n\nShall I expand any section or schedule a walkthrough with ${p.prospect_name}?`;

  const fallbackMeeting = `# Meeting Brief: ${m.attendee_name} — ${m.attendee_company}\n\n**Context:** ${m.context}\n\n**Talking Points:**\n${m.talking_points.map((tp: string, i: number) => `${i + 1}. ${tp}`).join('\n')}\n\n**Potential Objections:**\n- "We're happy with our current setup" → Highlight migration simplicity\n- "Not in budget" → Offer a 3-month pilot program\n\n**Ask:** Push for a technical review with their team lead.\n\nWant me to draft a pre-meeting email to ${m.attendee_name}?`;

  const fallbackPipeline = `# Deal Risk: ${d.deal_name}\n\n**Value:** ${d.deal_value} | **Health:** ${d.health_score}% | **Stale:** ${d.days_stale} days\n\n**Risk:** ${d.risk_signal}\n\n**Signals:**\n${d.signals.map((s: { label: string; type: string }) => `- ${s.type === 'warning' ? '\u26a0\ufe0f' : '\u2705'} ${s.label}`).join('\n')}\n\n**Recommended:** ${d.suggested_action}\n\nWant me to send a re-engagement message and create a follow-up task?`;

  return [
    {
      id: 'outreach',
      label: `Write outreach to ${o.target_name}`,
      description: `Email for ${o.target_title} at ${o.target_company}`,
      icon: 'Target',
      iconColor: 'text-violet-400',
      prompt: `Write a cold outreach email to ${o.target_name}, ${o.target_title} at ${o.target_company}`,
      response: cr?.outreach || fallbackOutreach,
    },
    {
      id: 'proposal',
      label: `Draft proposal for ${p.prospect_company}`,
      description: 'Structured proposal with ROI',
      icon: 'FileText',
      iconColor: 'text-emerald-400',
      prompt: `Draft a proposal for ${p.prospect_name} at ${p.prospect_company}`,
      response: cr?.proposal || fallbackProposal,
    },
    {
      id: 'meeting',
      label: `Prep for ${m.attendee_name} meeting`,
      description: `Brief for ${m.attendee_company}`,
      icon: 'Calendar',
      iconColor: 'text-amber-400',
      prompt: `Prepare me for my meeting with ${m.attendee_name} at ${m.attendee_company}`,
      response: cr?.meeting || fallbackMeeting,
    },
    {
      id: 'pipeline',
      label: `Analyse ${d.deal_name.split('\u2014')[0].trim()} risk`,
      description: `${d.days_stale}d stale — health ${d.health_score}%`,
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
// Simple markdown renderer (no external deps)
// ============================================================================

function renderMarkdown(text: string): React.ReactNode[] {
  const lines = text.split('\n');
  const elements: React.ReactNode[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    // Horizontal rule
    if (/^---+$/.test(line.trim())) {
      elements.push(<hr key={i} className="border-white/[0.06] my-2" />);
      i++;
      continue;
    }

    // Headings
    const headingMatch = line.match(/^(#{1,3})\s+(.+)$/);
    if (headingMatch) {
      const level = headingMatch[1].length;
      const content = inlineMarkdown(headingMatch[2]);
      if (level === 1) {
        elements.push(<p key={i} className="text-sm font-bold text-white mt-2 mb-1">{content}</p>);
      } else if (level === 2) {
        elements.push(<p key={i} className="text-xs font-semibold text-zinc-200 mt-2 mb-0.5">{content}</p>);
      } else {
        elements.push(<p key={i} className="text-xs font-medium text-zinc-300 mt-1.5 mb-0.5">{content}</p>);
      }
      i++;
      continue;
    }

    // Unordered list item
    if (/^[-*]\s+/.test(line)) {
      const items: React.ReactNode[] = [];
      while (i < lines.length && /^[-*]\s+/.test(lines[i])) {
        items.push(
          <li key={i} className="flex items-start gap-1.5">
            <span className="text-zinc-500 mt-0.5 shrink-0">&bull;</span>
            <span>{inlineMarkdown(lines[i].replace(/^[-*]\s+/, ''))}</span>
          </li>
        );
        i++;
      }
      elements.push(<ul key={`ul-${i}`} className="space-y-0.5 my-1">{items}</ul>);
      continue;
    }

    // Ordered list item
    if (/^\d+\.\s+/.test(line)) {
      const items: React.ReactNode[] = [];
      let num = 1;
      while (i < lines.length && /^\d+\.\s+/.test(lines[i])) {
        items.push(
          <li key={i} className="flex items-start gap-1.5">
            <span className="text-zinc-500 shrink-0 tabular-nums">{num}.</span>
            <span>{inlineMarkdown(lines[i].replace(/^\d+\.\s+/, ''))}</span>
          </li>
        );
        i++;
        num++;
      }
      elements.push(<ol key={`ol-${i}`} className="space-y-0.5 my-1">{items}</ol>);
      continue;
    }

    // Empty line
    if (line.trim() === '') {
      elements.push(<div key={i} className="h-1.5" />);
      i++;
      continue;
    }

    // Regular paragraph
    elements.push(<p key={i} className="my-0.5">{inlineMarkdown(line)}</p>);
    i++;
  }

  return elements;
}

/** Handle inline formatting: **bold**, *italic*, `code`, and emoji shortcodes */
function inlineMarkdown(text: string): React.ReactNode {
  // Split on **bold**, *italic*, and `code` patterns
  const parts: React.ReactNode[] = [];
  let remaining = text;
  let key = 0;

  while (remaining.length > 0) {
    // Bold **text**
    const boldMatch = remaining.match(/^(.*?)\*\*(.+?)\*\*(.*)/s);
    if (boldMatch) {
      if (boldMatch[1]) parts.push(<span key={key++}>{boldMatch[1]}</span>);
      parts.push(<strong key={key++} className="font-semibold text-white">{boldMatch[2]}</strong>);
      remaining = boldMatch[3];
      continue;
    }

    // Inline code `text`
    const codeMatch = remaining.match(/^(.*?)`(.+?)`(.*)/s);
    if (codeMatch) {
      if (codeMatch[1]) parts.push(<span key={key++}>{codeMatch[1]}</span>);
      parts.push(
        <code key={key++} className="px-1 py-0.5 rounded bg-white/[0.06] text-violet-300 text-[10px] font-mono">
          {codeMatch[2]}
        </code>
      );
      remaining = codeMatch[3];
      continue;
    }

    // Italic *text* (single asterisk, not double)
    const italicMatch = remaining.match(/^(.*?)\*(.+?)\*(.*)/s);
    if (italicMatch) {
      if (italicMatch[1]) parts.push(<span key={key++}>{italicMatch[1]}</span>);
      parts.push(<em key={key++} className="italic text-zinc-300">{italicMatch[2]}</em>);
      remaining = italicMatch[3];
      continue;
    }

    // No more patterns — push remaining text
    parts.push(<span key={key++}>{remaining}</span>);
    break;
  }

  return parts.length === 1 ? parts[0] : <>{parts}</>;
}

// ============================================================================
// Streaming message with copy button + markdown rendering
// ============================================================================

function StreamingMessage({ content, id }: { content: string; id: string }) {
  const { displayed, isDone } = useTypewriter(content, 8, true);
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(content).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div>
      <div className="text-xs sm:text-sm text-zinc-200 leading-relaxed">
        {isDone ? renderMarkdown(displayed) : (
          <>
            <span className="whitespace-pre-wrap">{displayed}</span>
            <span className="text-violet-400 animate-pulse motion-reduce:animate-none">&block;</span>
          </>
        )}
      </div>
      {isDone && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.3 }}
          className="mt-3 flex items-center gap-3"
        >
          <button
            onClick={handleCopy}
            className="inline-flex items-center gap-1.5 text-[10px] sm:text-[11px] text-zinc-500 hover:text-zinc-300 transition-colors"
          >
            {copied ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
            {copied ? 'Copied' : 'Copy'}
          </button>
          <span className="text-[10px] text-zinc-700">|</span>
          <span className="text-[10px] text-zinc-600 font-mono">
            Demo mode — sign up for real data
          </span>
        </motion.div>
      )}
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
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.1 }}
            className="inline-flex items-center gap-2 px-3 py-1 rounded-full
              border border-violet-500/20 bg-violet-500/[0.06] text-xs text-violet-300 mb-3"
          >
            <Sparkles className="w-3 h-3" />
            Personalised for {research.company?.name ?? 'your company'}
          </motion.div>
          <h2 className="text-xl sm:text-2xl md:text-3xl font-bold text-white tracking-tight text-balance">
            Your AI Sales Copilot
          </h2>
          <p className="text-xs sm:text-sm text-zinc-400 mt-1.5">
            Click a prompt to see it work with your company's data
          </p>
        </div>

        {/* Prompt chips */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 sm:gap-2.5 mb-4 sm:mb-5">
          {prompts.map((prompt) => {
            const Icon = ICON_MAP[prompt.icon] || Target;
            const tried = triedIds.has(prompt.id);
            const isActive = activePrompt?.id === prompt.id;

            return (
              <motion.button
                key={prompt.id}
                whileHover={{ scale: isActive ? 1 : 1.01 }}
                whileTap={{ scale: 0.98 }}
                onClick={() => handlePromptClick(prompt)}
                className={cn(
                  'group relative p-3 sm:p-3.5 rounded-xl text-left transition-all duration-200',
                  'border backdrop-blur-sm',
                  isActive
                    ? 'border-violet-500/40 bg-violet-500/[0.08]'
                    : tried
                      ? 'border-white/[0.04] bg-white/[0.01] opacity-50 hover:opacity-70'
                      : 'border-white/[0.06] bg-white/[0.02] hover:border-white/[0.12] hover:bg-white/[0.04]',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500'
                )}
              >
                <div className="flex items-center gap-2.5">
                  <div className={cn(
                    'w-7 h-7 sm:w-8 sm:h-8 rounded-lg flex items-center justify-center shrink-0',
                    isActive ? 'bg-violet-500/15' : 'bg-white/[0.04]'
                  )}>
                    <Icon className={cn('w-3.5 h-3.5', prompt.iconColor)} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs sm:text-sm font-medium text-white line-clamp-1">
                      {prompt.label}
                    </p>
                    <p className="text-[10px] sm:text-[11px] text-zinc-500 line-clamp-1">
                      {prompt.description}
                    </p>
                  </div>
                </div>
              </motion.button>
            );
          })}
        </div>

        {/* Chat area */}
        <div
          ref={scrollRef}
          className="flex-1 bg-zinc-900/60 backdrop-blur-sm border border-white/[0.06]
            rounded-2xl overflow-y-auto min-h-[220px] sm:min-h-[260px] max-h-[45vh]"
        >
          {!activePrompt ? (
            <div className="h-full flex items-center justify-center p-6">
              <div className="text-center">
                <div className="w-12 h-12 rounded-xl bg-zinc-800 flex items-center justify-center mx-auto mb-3">
                  <Bot className="w-6 h-6 text-zinc-600" />
                </div>
                <p className="text-sm text-zinc-500 max-w-xs mx-auto">
                  Select a prompt to see your copilot in action
                </p>
              </div>
            </div>
          ) : (
            <div className="p-4 sm:p-5 space-y-4">
              {/* User message */}
              <div className="flex justify-end">
                <div className="bg-violet-500/10 border border-violet-500/15 rounded-xl rounded-tr-sm px-3.5 py-2.5 max-w-[85%]">
                  <p className="text-xs sm:text-sm text-violet-200">{activePrompt.prompt}</p>
                </div>
              </div>

              {/* AI response */}
              <div className="flex gap-3">
                <div className="w-7 h-7 rounded-lg bg-zinc-800 border border-white/[0.06] flex items-center justify-center shrink-0 mt-0.5">
                  <Sparkles className="w-3.5 h-3.5 text-violet-400" />
                </div>
                <div className="flex-1 min-w-0 bg-white/[0.02] border border-white/[0.04] rounded-xl rounded-tl-sm p-3.5">
                  <StreamingMessage
                    key={activePrompt.id}
                    content={activePrompt.response}
                    id={activePrompt.id}
                  />
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Disabled input */}
        <div className="mt-2.5 relative">
          <div className="w-full px-4 py-3 rounded-xl bg-zinc-800/30 border border-white/[0.04] border-dashed
            text-xs sm:text-sm text-zinc-600 cursor-not-allowed select-none">
            Sign up to type your own prompts...
          </div>
          <Send className="absolute right-4 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-700/50" />
        </div>

        {/* Continue CTA */}
        <AnimatePresence>
          {triedCount >= 1 && (
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.4 }}
              className="mt-5 text-center"
            >
              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                transition={{ type: 'spring', stiffness: 400, damping: 17 }}
                onClick={onContinue}
                className={cn(
                  'px-8 py-3 rounded-xl font-semibold text-sm',
                  'bg-violet-600 text-white',
                  'hover:bg-violet-500 transition-colors',
                  'inline-flex items-center gap-2',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-950',
                  'motion-reduce:transform-none'
                )}
              >
                Get Started Free
                <ArrowRight className="w-4 h-4" />
              </motion.button>
              <p className="text-[11px] text-zinc-500 mt-2">
                {triedCount < 3
                  ? `Try ${3 - triedCount} more prompts, or continue`
                  : "You've seen it all — let's make it real"}
              </p>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  );
}
