demo/demo-types.ts
ts
/**
 * Demo Experience — Shared Types
 *
 * Types for the interactive demo flow: research data, agent states,
 * flow steps, and demo actions.
 */

// ============================================================================
// Flow
// ============================================================================

export type DemoStep =
  | 'hero'
  | 'bridge'
  | 'research'
  | 'bento'
  | 'results'
  | 'onboarding'
  | 'copilot'
  | 'signup';

// ============================================================================
// Research Data (output of multi-agent research)
// ============================================================================

export interface ResearchData {
  company: {
    name: string;
    domain: string;
    vertical: string;
    product_summary: string;
    value_props: string[];
    icp: {
      title: string;
      company_size: string;
      industry: string;
    };
  };
  demo_actions: {
    cold_outreach: {
      target_name: string;
      target_title: string;
      target_company: string;
      personalised_hook: string;
      email_preview: string;
    };
    proposal_draft: {
      prospect_name: string;
      prospect_company: string;
      proposal_title: string;
      key_sections: string[];
    };
    meeting_prep: {
      attendee_name: string;
      attendee_company: string;
      context: string;
      talking_points: string[];
    };
    pipeline_action: {
      deal_name: string;
      deal_value: string;
      days_stale: number;
      health_score: number;
      risk_signal: string;
      suggested_action: string;
      signals: { label: string; type: 'positive' | 'warning' | 'neutral' }[];
    };
  };
  stats: {
    signals_found: number;
    actions_queued: number;
    contacts_identified: number;
    opportunities_mapped: number;
  };
}

// ============================================================================
// Agent Research State
// ============================================================================

export interface AgentStatus {
  id: string;
  name: string;
  icon: string;
  status: 'idle' | 'working' | 'found' | 'complete';
  finding: string;
  detail: string;
}

// ============================================================================
// Copilot Demo
// ============================================================================

export interface DemoPrompt {
  id: string;
  label: string;
  description: string;
  icon: string;
  iconColor: string;
  prompt: string;
  response: string;
}

demo/demo-data.ts
ts
/**
 * Demo Experience — Mock Data
 *
 * Pre-built research data for example.com (Velocity CRM) and a
 * generator that creates plausible data from any URL domain.
 */

import type { ResearchData } from './demo-types';

// ============================================================================
// Example.com Fallback — "Velocity CRM"
// ============================================================================

export const EXAMPLE_RESEARCH: ResearchData = {
  company: {
    name: 'Velocity CRM',
    domain: 'velocitycrm.io',
    vertical: 'B2B SaaS',
    product_summary:
      'Sales acceleration platform for mid-market SaaS teams. Combines pipeline management, conversation intelligence, and automated outreach in one workspace.',
    value_props: [
      'AI-powered deal scoring',
      'Automated follow-up sequences',
      'Real-time pipeline analytics',
    ],
    icp: {
      title: 'VP Sales / Head of Revenue',
      company_size: '50–200 employees',
      industry: 'SaaS / Technology',
    },
  },
  demo_actions: {
    cold_outreach: {
      target_name: 'Sarah Chen',
      target_title: 'VP Operations',
      target_company: 'BuildRight Solutions',
      personalised_hook:
        'Noticed BuildRight expanded to 3 new regions this quarter — that kind of growth usually breaks sales processes before anyone notices.',
      email_preview:
        "Hi Sarah,\n\nI saw BuildRight's expansion into the Southeast — congrats. When teams scale that fast, the pipeline usually outgrows the process.\n\nVelocity CRM helps mid-market teams keep close rates steady during rapid growth. We automated deal scoring and follow-ups for Pinnacle Group and they maintained 62% close rate through a 3x pipeline increase.\n\nWorth a 15-minute look?\n\nBest,\nAlex",
    },
    proposal_draft: {
      prospect_name: 'James Wright',
      prospect_company: 'TechFlow Engineering',
      proposal_title:
        'How Velocity CRM accelerates pipeline velocity for TechFlow Engineering',
      key_sections: [
        'Current pipeline challenges at TechFlow',
        'Proposed solution & integration plan',
        'Projected ROI — 40% faster deal cycles',
        '90-day implementation timeline',
      ],
    },
    meeting_prep: {
      attendee_name: 'David Park',
      attendee_company: 'Zenith Digital',
      context:
        'Follow-up from initial demo. David was interested in the deal scoring module but asked about CRM migration from HubSpot.',
      talking_points: [
        'HubSpot migration takes 48 hours, not weeks — zero data loss',
        'Deal scoring reduced Zenith-sized teams\' lost deals by 28%',
        'Integration with their existing Slack + Notion workflow',
        'Pricing: Growth plan at $89/seat fits their 35-person sales team',
      ],
    },
    pipeline_action: {
      deal_name: 'Meridian Group — Enterprise',
      deal_value: '$42,000',
      days_stale: 18,
      health_score: 34,
      risk_signal: "Champion hasn't opened last 3 emails. Last meeting was 22 days ago.",
      suggested_action:
        'Re-engage via LinkedIn. Reference their Q2 expansion plans and offer a custom ROI analysis for their new APAC team.',
      signals: [
        { label: 'Champion disengaged', type: 'warning' },
        { label: 'Competitor evaluated', type: 'warning' },
        { label: 'Budget approved', type: 'positive' },
        { label: 'Technical review passed', type: 'positive' },
        { label: 'No activity 18 days', type: 'warning' },
      ],
    },
  },
  stats: {
    signals_found: 47,
    actions_queued: 12,
    contacts_identified: 8,
    opportunities_mapped: 4,
  },
};

// ============================================================================
// Dynamic Data Generator
// ============================================================================

/** Extract a plausible company name from a domain string. */
function domainToName(domain: string): string {
  const cleaned = domain
    .replace(/^(https?:\/\/)?(www\.)?/, '')
    .replace(/\.(com|io|co|ai|dev|org|net|app)(\/.*)?$/, '')
    .replace(/[^a-zA-Z0-9]/g, ' ')
    .trim();
  return cleaned
    .split(' ')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

/**
 * Generate plausible research data from a URL.
 * In production this calls the real backend; here it templates from the domain.
 */
export function generateResearchFromUrl(rawUrl: string): ResearchData {
  const domain = rawUrl
    .replace(/^(https?:\/\/)?(www\.)?/, '')
    .replace(/\/.*$/, '')
    .toLowerCase();

  if (domain === 'example.com' || domain === 'velocitycrm.io') {
    return EXAMPLE_RESEARCH;
  }

  const name = domainToName(domain);

  return {
    company: {
      name,
      domain,
      vertical: 'B2B SaaS',
      product_summary: `${name} provides enterprise solutions that help teams work smarter and close deals faster.`,
      value_props: [
        'Streamlined workflows for growing teams',
        'Real-time analytics and reporting',
        'Seamless integrations with existing tools',
      ],
      icp: {
        title: 'VP Sales / Revenue Operations',
        company_size: '50–500 employees',
        industry: 'Technology / SaaS',
      },
    },
    demo_actions: {
      cold_outreach: {
        target_name: 'Sarah Chen',
        target_title: 'VP Operations',
        target_company: 'NovaTech Solutions',
        personalised_hook: `Noticed NovaTech just closed their Series B — teams at that stage are exactly who ${name} was built for.`,
        email_preview: `Hi Sarah,\n\nCongrats on the Series B — exciting times at NovaTech.\n\nWhen teams scale post-funding, the sales process usually breaks first. ${name} helps mid-market teams maintain pipeline velocity through rapid growth.\n\nWe helped a similar-stage company cut their deal cycle by 35% last quarter.\n\nWorth a quick look?\n\nBest,\nAlex`,
      },
      proposal_draft: {
        prospect_name: 'James Wright',
        prospect_company: 'Apex Digital',
        proposal_title: `How ${name} transforms pipeline efficiency for Apex Digital`,
        key_sections: [
          'Current challenges in Apex Digital\'s sales workflow',
          `Proposed ${name} implementation plan`,
          'ROI projection — 40% efficiency gains in 90 days',
          'Integration timeline & dedicated onboarding support',
        ],
      },
      meeting_prep: {
        attendee_name: 'David Park',
        attendee_company: 'Zenith Corp',
        context: `Follow-up from initial demo. David was impressed by the automation features but wants to understand migration from their current tooling.`,
        talking_points: [
          'Migration from existing CRM takes < 48 hours',
          'Automation reduced manual work by 60% for similar teams',
          'Native integrations with Slack, Notion, and Google Workspace',
          'Flexible pricing at $79/seat for their 40-person team',
        ],
      },
      pipeline_action: {
        deal_name: 'Meridian Group — Enterprise',
        deal_value: '$38,000',
        days_stale: 16,
        health_score: 38,
        risk_signal: 'Champion went silent after proposal. Last email opened 12 days ago.',
        suggested_action:
          'Try a LinkedIn touchpoint referencing their upcoming board meeting. Offer a condensed exec summary instead of the full proposal.',
        signals: [
          { label: 'Champion engaged', type: 'positive' },
          { label: 'NPS declining', type: 'warning' },
          { label: 'Usage up 18%', type: 'positive' },
          { label: 'Competitor mentioned', type: 'warning' },
          { label: 'Budget approved', type: 'positive' },
        ],
      },
    },
    stats: {
      signals_found: 47,
      actions_queued: 12,
      contacts_identified: 8,
      opportunities_mapped: 4,
    },
  };
}

demo/useDemoResearch.ts
ts
/**
 * useDemoResearch
 *
 * Simulates multi-agent research with streaming status updates.
 * Each of 6 agents transitions through idle → working → found → complete
 * over ~5 seconds total, then returns the final ResearchData.
 */

import { useState, useCallback, useRef } from 'react';
import type { AgentStatus, ResearchData } from './demo-types';
import { generateResearchFromUrl } from './demo-data';

const INITIAL_AGENTS: AgentStatus[] = [
  {
    id: 'research',
    name: 'Research Agent',
    icon: '🔍',
    status: 'idle',
    finding: '',
    detail: '',
  },
  {
    id: 'icp',
    name: 'ICP Agent',
    icon: '👥',
    status: 'idle',
    finding: '',
    detail: '',
  },
  {
    id: 'signal',
    name: 'Signal Agent',
    icon: '📊',
    status: 'idle',
    finding: '',
    detail: '',
  },
  {
    id: 'content',
    name: 'Content Agent',
    icon: '📝',
    status: 'idle',
    finding: '',
    detail: '',
  },
  {
    id: 'strategy',
    name: 'Strategy Agent',
    icon: '🎯',
    status: 'idle',
    finding: '',
    detail: '',
  },
  {
    id: 'ops',
    name: 'Operations Agent',
    icon: '⚡',
    status: 'idle',
    finding: '',
    detail: '',
  },
];

interface UseDemoResearchReturn {
  agents: AgentStatus[];
  isRunning: boolean;
  isComplete: boolean;
  research: ResearchData | null;
  start: (url: string) => void;
  reset: () => void;
}

export function useDemoResearch(): UseDemoResearchReturn {
  const [agents, setAgents] = useState<AgentStatus[]>(INITIAL_AGENTS);
  const [isRunning, setIsRunning] = useState(false);
  const [isComplete, setIsComplete] = useState(false);
  const [research, setResearch] = useState<ResearchData | null>(null);
  const abortRef = useRef(false);

  const updateAgent = (
    id: string,
    updates: Partial<AgentStatus>,
    prev: AgentStatus[]
  ): AgentStatus[] =>
    prev.map((a) => (a.id === id ? { ...a, ...updates } : a));

  const start = useCallback((url: string) => {
    abortRef.current = false;
    setIsRunning(true);
    setIsComplete(false);
    setResearch(null);
    setAgents(INITIAL_AGENTS);

    const data = generateResearchFromUrl(url);

    // Timeline: each agent starts, finds, completes
    const timeline: { delay: number; agentId: string; updates: Partial<AgentStatus> }[] = [
      { delay: 200, agentId: 'research', updates: { status: 'working', finding: `Scanning ${data.company.domain}...` } },
      { delay: 900, agentId: 'research', updates: { status: 'found', finding: `Found: ${data.company.vertical}, ${data.company.product_summary.slice(0, 50)}...`, detail: data.company.product_summary } },
      { delay: 400, agentId: 'icp', updates: { status: 'working', finding: 'Building ideal customer profile...' } },
      { delay: 1000, agentId: 'icp', updates: { status: 'found', finding: `Identified: ${data.company.icp.title}, ${data.company.icp.company_size}`, detail: data.company.icp.industry } },
      { delay: 300, agentId: 'signal', updates: { status: 'working', finding: 'Analysing market signals...' } },
      { delay: 900, agentId: 'signal', updates: { status: 'found', finding: `Found ${data.stats.signals_found} signals, ${data.stats.contacts_identified} contacts`, detail: `${data.stats.opportunities_mapped} opportunities mapped` } },
      { delay: 200, agentId: 'content', updates: { status: 'working', finding: 'Learning your voice...' } },
      { delay: 800, agentId: 'content', updates: { status: 'found', finding: 'Analysed product positioning and value props', detail: data.company.value_props.join(', ') } },
      { delay: 300, agentId: 'strategy', updates: { status: 'working', finding: 'Mapping opportunities...' } },
      { delay: 700, agentId: 'strategy', updates: { status: 'found', finding: `Identified ${data.stats.actions_queued} actionable outreach angles`, detail: 'Cross-referencing with pipeline data' } },
      { delay: 200, agentId: 'ops', updates: { status: 'working', finding: 'Preparing agent configurations...' } },
      { delay: 600, agentId: 'ops', updates: { status: 'found', finding: `All agents ready — ${data.stats.signals_found} signals, ${data.stats.actions_queued} actions queued` } },
    ];

    // Complete all after findings
    const completeDelay = 300;
    const agentIds = ['research', 'icp', 'signal', 'content', 'strategy', 'ops'];

    let cumulativeDelay = 0;

    timeline.forEach((event) => {
      cumulativeDelay += event.delay;
      const d = cumulativeDelay;
      setTimeout(() => {
        if (abortRef.current) return;
        setAgents((prev) => updateAgent(event.agentId, event.updates, prev));
      }, d);
    });

    // Mark all complete
    cumulativeDelay += completeDelay;
    agentIds.forEach((id, i) => {
      const d = cumulativeDelay + i * 80;
      setTimeout(() => {
        if (abortRef.current) return;
        setAgents((prev) => updateAgent(id, { status: 'complete' }, prev));
      }, d);
    });

    // Final
    setTimeout(() => {
      if (abortRef.current) return;
      setResearch(data);
      setIsRunning(false);
      setIsComplete(true);
    }, cumulativeDelay + agentIds.length * 80 + 200);
  }, []);

  const reset = useCallback(() => {
    abortRef.current = true;
    setAgents(INITIAL_AGENTS);
    setIsRunning(false);
    setIsComplete(false);
    setResearch(null);
  }, []);

  return { agents, isRunning, isComplete, research, start, reset };
}

demo/useTypewriter.ts
ts
/**
 * useTypewriter
 *
 * Reveals text character-by-character at a given speed.
 * Returns the visible portion of the string.
 */

import { useState, useEffect, useRef } from 'react';

export function useTypewriter(
  text: string,
  charMs: number = 18,
  enabled: boolean = true
): { displayed: string; isDone: boolean } {
  const [index, setIndex] = useState(0);
  const frameRef = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    if (!enabled) {
      setIndex(0);
      return;
    }

    if (index >= text.length) return;

    frameRef.current = setTimeout(() => {
      setIndex((prev) => prev + 1);
    }, charMs);

    return () => clearTimeout(frameRef.current);
  }, [index, text, charMs, enabled]);

  // Reset when text changes
  useEffect(() => {
    setIndex(0);
  }, [text]);

  return {
    displayed: text.slice(0, index),
    isDone: index >= text.length,
  };
}

demo/DemoExperience.tsx
tsx
/**
 * DemoExperience
 *
 * Main orchestrator for the interactive demo flow.
 * Manages step transitions and passes research data through all phases.
 */

import { useState, useCallback } from 'react';
import { AnimatePresence } from 'framer-motion';
import type { DemoStep, ResearchData } from './demo-types';
import { useDemoResearch } from './useDemoResearch';
import { DemoHero } from './DemoHero';
import { ValueBridge } from './ValueBridge';
import { AgentResearch } from './AgentResearch';
import { BentoShowcase } from './BentoShowcase';
import { ResultsSummary } from './ResultsSummary';
import { DemoSkillsOnboarding } from './DemoSkillsOnboarding';
import { DemoCopilot } from './DemoCopilot';
import { DemoSignup } from './DemoSignup';

export default function DemoExperience() {
  const [step, setStep] = useState<DemoStep>('hero');
  const [url, setUrl] = useState('');
  const research = useDemoResearch();

  const handleUrlSubmit = useCallback(
    (submittedUrl: string) => {
      setUrl(submittedUrl);
      setStep('bridge');
      // Research starts after the bridge animation finishes
    },
    []
  );

  const handleBridgeComplete = useCallback(() => {
    setStep('research');
    research.start(url);
  }, [url, research]);

  const handleResearchComplete = useCallback(() => {
    setStep('bento');
  }, []);

  const handleBentoComplete = useCallback(() => {
    setStep('results');
  }, []);

  const handleResultsContinue = useCallback(() => {
    setStep('onboarding');
  }, []);

  const handleOnboardingComplete = useCallback(() => {
    setStep('copilot');
  }, []);

  const handleCopilotContinue = useCallback(() => {
    setStep('signup');
  }, []);

  return (
    <div className="dark">
      <div className="min-h-screen bg-gray-950 text-gray-100 overflow-x-hidden">
        <AnimatePresence mode="wait">
          {step === 'hero' && (
            <DemoHero key="hero" onSubmit={handleUrlSubmit} />
          )}

          {step === 'bridge' && (
            <ValueBridge
              key="bridge"
              companyDomain={url}
              onComplete={handleBridgeComplete}
            />
          )}

          {step === 'research' && (
            <AgentResearch
              key="research"
              agents={research.agents}
              isComplete={research.isComplete}
              stats={research.research?.stats ?? null}
              onComplete={handleResearchComplete}
            />
          )}

          {step === 'bento' && research.research && (
            <BentoShowcase
              key="bento"
              data={research.research}
              onComplete={handleBentoComplete}
            />
          )}

          {step === 'results' && research.research && (
            <ResultsSummary
              key="results"
              stats={research.research.stats}
              companyName={research.research.company.name}
              onContinue={handleResultsContinue}
            />
          )}

          {step === 'onboarding' && research.research && (
            <DemoSkillsOnboarding
              key="onboarding"
              research={research.research}
              onComplete={handleOnboardingComplete}
            />
          )}

          {step === 'copilot' && research.research && (
            <DemoCopilot
              key="copilot"
              research={research.research}
              onContinue={handleCopilotContinue}
            />
          )}

          {step === 'signup' && (
            <DemoSignup
              key="signup"
              companyName={research.research?.company.name ?? ''}
            />
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

demo/DemoHero.tsx
tsx
/**
 * DemoHero — Step 1
 *
 * Minimal hero with a single URL input and an example.com fallback link.
 * Full viewport height, centered content, radial glow background.
 */

import { useState, type FormEvent } from 'react';
import { motion } from 'framer-motion';
import { ArrowRight } from 'lucide-react';
import { cn } from '@/lib/utils';

interface DemoHeroProps {
  onSubmit: (url: string) => void;
}

export function DemoHero({ onSubmit }: DemoHeroProps) {
  const [url, setUrl] = useState('');
  const [error, setError] = useState('');

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    const trimmed = url.trim();
    if (!trimmed) {
      setError('Enter a website URL to get started');
      return;
    }
    setError('');
    onSubmit(trimmed);
  };

  const handleExample = () => {
    setUrl('example.com');
    onSubmit('example.com');
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, y: -40 }}
      transition={{ duration: 0.5 }}
      className="relative min-h-screen flex flex-col items-center justify-center px-4 overflow-hidden"
    >
      {/* Radial glow */}
      <div
        className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-1/3
          w-[900px] h-[700px] rounded-full pointer-events-none
          bg-[radial-gradient(ellipse,rgba(139,92,246,0.12),transparent_70%)]
          blur-3xl"
      />

      {/* Grid lines */}
      <div
        className="absolute inset-0 pointer-events-none
          bg-[linear-gradient(rgba(255,255,255,0.02)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.02)_1px,transparent_1px)]
          bg-[size:72px_72px]
          [mask-image:radial-gradient(ellipse_60%_50%_at_50%_40%,black_30%,transparent_100%)]"
      />

      <div className="relative z-10 w-full max-w-2xl mx-auto text-center">
        {/* Badge */}
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2, duration: 0.5 }}
          className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full
            border border-white/10 bg-white/[0.04] text-sm text-gray-400 mb-8"
        >
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
          6 AI agents standing by
        </motion.div>

        {/* Headline */}
        <motion.h1
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3, duration: 0.6 }}
          className="text-5xl sm:text-6xl md:text-7xl font-bold tracking-tight text-balance leading-[1.05]
            bg-clip-text text-transparent
            bg-gradient-to-b from-white via-white to-gray-500"
        >
          Meet your AI
          <br />
          sales team
        </motion.h1>

        {/* Subtitle */}
        <motion.p
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4, duration: 0.5 }}
          className="mt-6 text-lg sm:text-xl text-gray-400 max-w-md mx-auto text-pretty"
        >
          Enter your website. Watch them go to work.
        </motion.p>

        {/* URL Input */}
        <motion.form
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.55, duration: 0.5 }}
          onSubmit={handleSubmit}
          className="mt-10 flex flex-col sm:flex-row gap-3 max-w-lg mx-auto"
        >
          <div className="flex-1 relative">
            <input
              type="text"
              value={url}
              onChange={(e) => {
                setUrl(e.target.value);
                setError('');
              }}
              placeholder="yourcompany.com"
              className={cn(
                'w-full px-5 py-3.5 rounded-xl text-base',
                'bg-white/[0.06] border placeholder-gray-500 text-white',
                'focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-transparent',
                'transition-all',
                error
                  ? 'border-red-500/50'
                  : 'border-white/10 hover:border-white/20'
              )}
              autoFocus
            />
            {error && (
              <p className="absolute -bottom-6 left-1 text-xs text-red-400">
                {error}
              </p>
            )}
          </div>

          <motion.button
            type="submit"
            whileHover={{ scale: 1.03 }}
            whileTap={{ scale: 0.97 }}
            transition={{ type: 'spring', stiffness: 400, damping: 17 }}
            className={cn(
              'px-7 py-3.5 rounded-xl font-semibold text-base',
              'bg-white text-gray-950',
              'hover:bg-gray-100 transition-colors',
              'flex items-center justify-center gap-2 shrink-0'
            )}
          >
            Activate Agents
            <ArrowRight className="w-4 h-4" />
          </motion.button>
        </motion.form>

        {/* Example fallback */}
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.8, duration: 0.5 }}
          className="mt-10 text-sm text-gray-500"
        >
          Just exploring?{' '}
          <button
            type="button"
            onClick={handleExample}
            className="text-gray-400 underline underline-offset-4 decoration-gray-600
              hover:text-white hover:decoration-gray-400 transition-colors"
          >
            Try with example.com →
          </button>
        </motion.p>
      </div>
    </motion.div>
  );
}

demo/ValueBridge.tsx
tsx
/**
 * ValueBridge — Step 2
 *
 * Animated text sequence that bridges between URL submission and agent research.
 * Three lines fade in sequentially, then the component calls onComplete.
 */

import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';

interface ValueBridgeProps {
  companyDomain: string;
  onComplete: () => void;
}

const LINES = [
  'Right now, 6 AI agents are about to research your business…',
  "They'll find your ICP, understand your product, and identify opportunities…",
  "Then we'll show you exactly what they'd do for you — every day.",
];

export function ValueBridge({ companyDomain, onComplete }: ValueBridgeProps) {
  const [visibleCount, setVisibleCount] = useState(0);

  useEffect(() => {
    if (visibleCount >= LINES.length) {
      const timer = setTimeout(onComplete, 1200);
      return () => clearTimeout(timer);
    }

    const timer = setTimeout(
      () => setVisibleCount((c) => c + 1),
      visibleCount === 0 ? 400 : 700
    );
    return () => clearTimeout(timer);
  }, [visibleCount, onComplete]);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, y: -30 }}
      transition={{ duration: 0.4 }}
      className="min-h-screen flex flex-col items-center justify-center px-4"
    >
      <div className="max-w-xl mx-auto space-y-4">
        {LINES.map((line, i) => (
          <motion.p
            key={i}
            initial={{ opacity: 0, y: 12 }}
            animate={
              i < visibleCount
                ? { opacity: 1, y: 0 }
                : { opacity: 0, y: 12 }
            }
            transition={{ duration: 0.5, ease: 'easeOut' }}
            className="text-lg sm:text-xl text-gray-300 text-center leading-relaxed"
          >
            {line}
          </motion.p>
        ))}

        {/* Subtle domain echo */}
        <motion.p
          initial={{ opacity: 0 }}
          animate={
            visibleCount >= LINES.length ? { opacity: 1 } : { opacity: 0 }
          }
          transition={{ delay: 0.3, duration: 0.4 }}
          className="text-sm text-gray-500 text-center font-mono mt-6"
        >
          Target: {companyDomain}
        </motion.p>
      </div>
    </motion.div>
  );
}

demo/AgentResearch.tsx
tsx
/**
 * AgentResearch — Step 3
 *
 * Live visual showing 6 agents researching the user's website.
 * Each agent row shows icon, name, status, and streaming findings.
 * Calls onComplete 1.5s after all agents finish.
 */

import { useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import { Check, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { AgentStatus } from './demo-types';

interface AgentResearchProps {
  agents: AgentStatus[];
  isComplete: boolean;
  stats: { signals_found: number; actions_queued: number } | null;
  onComplete: () => void;
}

function StatusIcon({ status }: { status: AgentStatus['status'] }) {
  if (status === 'idle') return <div className="w-4 h-4 rounded-full bg-gray-700" />;
  if (status === 'working')
    return <Loader2 className="w-4 h-4 text-violet-400 animate-spin" />;
  if (status === 'found')
    return <div className="w-4 h-4 rounded-full bg-emerald-500/80 animate-pulse" />;
  return <Check className="w-4 h-4 text-emerald-400" />;
}

export function AgentResearch({
  agents,
  isComplete,
  stats,
  onComplete,
}: AgentResearchProps) {
  const calledRef = useRef(false);

  useEffect(() => {
    if (isComplete && !calledRef.current) {
      calledRef.current = true;
      const timer = setTimeout(onComplete, 1800);
      return () => clearTimeout(timer);
    }
  }, [isComplete, onComplete]);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, y: -30 }}
      transition={{ duration: 0.4 }}
      className="min-h-screen flex flex-col items-center justify-center px-4"
    >
      <div className="w-full max-w-lg mx-auto">
        {/* Card */}
        <div
          className="bg-gray-900/80 backdrop-blur-sm border border-gray-700/50
            rounded-2xl overflow-hidden shadow-none"
        >
          {/* Header */}
          <div className="px-6 py-4 border-b border-gray-700/50 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-gray-200 tracking-wide uppercase">
              Agent Research
            </h2>
            {isComplete && stats && (
              <motion.span
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                className="text-xs font-mono text-emerald-400 bg-emerald-500/10 px-2.5 py-1 rounded-full"
              >
                {stats.signals_found} signals · {stats.actions_queued} actions
              </motion.span>
            )}
          </div>

          {/* Agent rows */}
          <div className="divide-y divide-gray-800/60">
            {agents.map((agent, i) => (
              <motion.div
                key={agent.id}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.08, duration: 0.3 }}
                className="px-6 py-3.5 flex items-start gap-3"
              >
                {/* Icon */}
                <span className="text-base mt-0.5 shrink-0 w-6 text-center">
                  {agent.icon}
                </span>

                {/* Name + finding */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-gray-200">
                      {agent.name}
                    </span>
                    <StatusIcon status={agent.status} />
                  </div>
                  {agent.finding && (
                    <motion.p
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      className={cn(
                        'text-xs mt-1 leading-relaxed font-mono',
                        agent.status === 'complete'
                          ? 'text-emerald-400/80'
                          : 'text-gray-400'
                      )}
                    >
                      {agent.finding}
                    </motion.p>
                  )}
                  {agent.detail && agent.status !== 'working' && (
                    <motion.p
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 0.6 }}
                      className="text-[11px] mt-0.5 text-gray-500 font-mono truncate"
                    >
                      {agent.detail}
                    </motion.p>
                  )}
                </div>
              </motion.div>
            ))}
          </div>

          {/* Footer */}
          {isComplete && (
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
              className="px-6 py-4 border-t border-gray-700/50 bg-emerald-500/[0.04]"
            >
              <p className="text-sm text-emerald-400 font-medium text-center">
                ✓ All agents ready — preparing your personalised demo
              </p>
            </motion.div>
          )}
        </div>
      </div>
    </motion.div>
  );
}

demo/BentoShowcase.tsx
tsx
/**
 * BentoShowcase — Step 4
 *
 * The centrepiece animation. Four glassmorphic panels in a 2×2 grid (desktop)
 * or stacked full-width cards (mobile). Each panel simulates a real product UI
 * populated with personalised research data.
 *
 * Panel 1: Meeting Prep Brief  (matches "Meeting Brief" screenshot style)
 * Panel 2: Deal Intelligence   (matches "Deal Intelligence" screenshot style)
 * Panel 3: Cold Outreach Email (matches "Follow-Up Draft" screenshot style)
 * Panel 4: Task Queue          (matches "Task Queue" screenshot style)
 */

import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  FileText,
  TrendingUp,
  Mail,
  ListChecks,
  Check,
  AlertTriangle,
  ArrowRight,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useTypewriter } from './useTypewriter';
import type { ResearchData } from './demo-types';

// ============================================================================
// Panel Wrapper
// ============================================================================

interface PanelShellProps {
  icon: React.ReactNode;
  title: string;
  status: string;
  delay: number;
  children: React.ReactNode;
}

function PanelShell({ icon, title, status, delay, children }: PanelShellProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 30, scale: 0.97 }}
      whileInView={{ opacity: 1, y: 0, scale: 1 }}
      viewport={{ once: true, margin: '-40px' }}
      transition={{ delay, duration: 0.5, ease: 'easeOut' }}
      className={cn(
        'bg-[#0c1017]/90 backdrop-blur-md',
        'border border-white/[0.06]',
        'rounded-2xl overflow-hidden',
        'flex flex-col'
      )}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-3.5 border-b border-white/[0.05]">
        <div className="flex items-center gap-2.5">
          {icon}
          <span className="text-sm font-semibold text-gray-200">{title}</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
          <span className="text-[10px] font-mono tracking-widest text-gray-500 uppercase">
            {status}
          </span>
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 p-5">{children}</div>
    </motion.div>
  );
}

// ============================================================================
// Panel 1: Meeting Prep Brief
// ============================================================================

function MeetingPrepPanel({
  data,
  active,
}: {
  data: ResearchData['demo_actions']['meeting_prep'];
  active: boolean;
}) {
  const { displayed: contextText, isDone: contextDone } = useTypewriter(
    data.context,
    16,
    active
  );

  const [visiblePoints, setVisiblePoints] = useState(0);

  useEffect(() => {
    if (!contextDone || !active) return;
    if (visiblePoints >= data.talking_points.length) return;
    const t = setTimeout(() => setVisiblePoints((v) => v + 1), 400);
    return () => clearTimeout(t);
  }, [contextDone, visiblePoints, data.talking_points.length, active]);

  return (
    <div className="space-y-4">
      {/* Title line */}
      <p className="text-base font-semibold text-white">
        {data.attendee_company} · Prep Brief
      </p>

      {/* Meta */}
      <div className="space-y-1 font-mono text-xs text-gray-400">
        <p>
          Attendee: <span className="text-gray-200">{data.attendee_name}</span>
        </p>
      </div>

      {/* Risk / context */}
      <div className="flex items-start gap-2 text-xs">
        <AlertTriangle className="w-3.5 h-3.5 text-amber-400 mt-0.5 shrink-0" />
        <p className="font-mono text-amber-400/90 leading-relaxed">
          {contextText}
          {!contextDone && <span className="animate-pulse">▊</span>}
        </p>
      </div>

      {/* Talking points */}
      {visiblePoints > 0 && (
        <div className="space-y-1.5">
          <p className="text-[10px] font-mono text-gray-500 uppercase tracking-wider">
            Talking points:
          </p>
          <ol className="space-y-1.5">
            {data.talking_points.slice(0, visiblePoints).map((point, i) => (
              <motion.li
                key={i}
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.3 }}
                className="text-xs text-gray-300 font-mono flex gap-2"
              >
                <span className="text-gray-500 shrink-0">{i + 1}.</span>
                {point}
              </motion.li>
            ))}
          </ol>
        </div>
      )}
    </div>
  );
}

// ============================================================================
// Panel 2: Deal Intelligence
// ============================================================================

function DealIntelPanel({
  data,
  active,
}: {
  data: ResearchData['demo_actions']['pipeline_action'];
  active: boolean;
}) {
  const [scoreWidth, setScoreWidth] = useState(0);
  const [visibleSignals, setVisibleSignals] = useState(0);

  useEffect(() => {
    if (!active) return;
    const t = setTimeout(() => setScoreWidth(data.health_score), 400);
    return () => clearTimeout(t);
  }, [active, data.health_score]);

  useEffect(() => {
    if (!active) return;
    if (visibleSignals >= data.signals.length) return;
    const t = setTimeout(
      () => setVisibleSignals((v) => v + 1),
      800 + visibleSignals * 350
    );
    return () => clearTimeout(t);
  }, [active, visibleSignals, data.signals.length]);

  const scoreColor =
    data.health_score > 60
      ? 'text-emerald-400'
      : data.health_score > 35
        ? 'text-amber-400'
        : 'text-red-400';

  const barColor =
    data.health_score > 60
      ? 'bg-emerald-500'
      : data.health_score > 35
        ? 'bg-amber-500'
        : 'bg-red-500';

  return (
    <div className="space-y-4">
      {/* Deal header */}
      <div className="flex items-center justify-between">
        <p className="text-base font-semibold text-white truncate pr-3">
          {data.deal_name}
        </p>
        <span className="text-sm font-semibold text-gray-300 shrink-0 tabular-nums">
          {data.deal_value}
        </span>
      </div>

      {/* Health score */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-[10px] font-mono text-gray-500 uppercase tracking-wider">
            Health Score
          </span>
          <span className={cn('text-lg font-bold tabular-nums', scoreColor)}>
            {scoreWidth}%
          </span>
        </div>
        <div className="h-2 bg-gray-800 rounded-full overflow-hidden">
          <motion.div
            initial={{ width: 0 }}
            animate={{ width: `${scoreWidth}%` }}
            transition={{ duration: 1.2, ease: 'easeOut' }}
            className={cn('h-full rounded-full', barColor)}
          />
        </div>
        <p className="text-[11px] text-gray-500 font-mono">
          ⚠ Stale {data.days_stale} days · {data.risk_signal.slice(0, 50)}…
        </p>
      </div>

      {/* Signals */}
      <div className="space-y-1.5">
        <p className="text-[10px] font-mono text-gray-500 uppercase tracking-wider">
          Signals
        </p>
        <ul className="space-y-1.5">
          {data.signals.slice(0, visibleSignals).map((sig, i) => (
            <motion.li
              key={i}
              initial={{ opacity: 0, x: -6 }}
              animate={{ opacity: 1, x: 0 }}
              className="flex items-center gap-2 text-xs"
            >
              <span
                className={cn(
                  'w-1.5 h-1.5 rounded-full shrink-0',
                  sig.type === 'positive' && 'bg-emerald-500',
                  sig.type === 'warning' && 'bg-amber-500',
                  sig.type === 'neutral' && 'bg-gray-500'
                )}
              />
              <span
                className={cn(
                  sig.type === 'warning' ? 'text-amber-400' : 'text-gray-300'
                )}
              >
                {sig.label}
              </span>
            </motion.li>
          ))}
        </ul>
      </div>
    </div>
  );
}

// ============================================================================
// Panel 3: Cold Outreach Email
// ============================================================================

function OutreachPanel({
  data,
  active,
}: {
  data: ResearchData['demo_actions']['cold_outreach'];
  active: boolean;
}) {
  const { displayed: emailText, isDone } = useTypewriter(
    data.email_preview,
    14,
    active
  );

  return (
    <div className="space-y-4">
      {/* Email header */}
      <div className="space-y-2 font-mono text-xs text-gray-500">
        <p>
          TO:{' '}
          <span className="text-gray-300">
            {data.target_name.toLowerCase().replace(' ', '.')}@
            {data.target_company.toLowerCase().replace(/\s+/g, '')}.com
          </span>
        </p>
      </div>

      {/* Email body */}
      <div className="text-sm text-gray-300 leading-relaxed whitespace-pre-wrap min-h-[120px]">
        {emailText}
        {!isDone && (
          <span className="text-violet-400 animate-pulse">▊</span>
        )}
      </div>

      {/* Action buttons */}
      {isDone && (
        <motion.div
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
          className="flex items-center gap-3 pt-2"
        >
          <div className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-emerald-500/20 text-emerald-400 text-xs font-semibold">
            <Check className="w-3.5 h-3.5" />
            Approve & Send
          </div>
          <span className="text-xs text-gray-500">Edit</span>
        </motion.div>
      )}
    </div>
  );
}

// ============================================================================
// Panel 4: Task Queue
// ============================================================================

function TaskQueuePanel({
  data,
  active,
}: {
  data: ResearchData;
  active: boolean;
}) {
  const tasks = [
    { label: `Send ROI calculator to ${data.demo_actions.cold_outreach.target_name}`, done: false },
    { label: `Book technical review meeting`, done: false },
    { label: `Update deal forecast in CRM`, done: false },
    { label: `Prep QBR deck for Thursday`, done: false },
    { label: `Share call summary on Slack`, done: false },
  ];

  const [checkedCount, setCheckedCount] = useState(0);

  useEffect(() => {
    if (!active) return;
    if (checkedCount >= 3) return; // auto-complete first 3
    const t = setTimeout(() => setCheckedCount((c) => c + 1), 600 + checkedCount * 500);
    return () => clearTimeout(t);
  }, [active, checkedCount]);

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <p className="text-xs font-mono text-gray-500">
          {checkedCount}/{tasks.length} completed
        </p>
        <motion.span
          initial={{ opacity: 0 }}
          animate={{ opacity: checkedCount > 0 ? 1 : 0 }}
          className="text-xs font-semibold text-violet-400"
        >
          +5 auto-created
        </motion.span>
      </div>

      {/* Tasks */}
      <ul className="space-y-2.5">
        {tasks.map((task, i) => {
          const isChecked = i < checkedCount;
          return (
            <motion.li
              key={i}
              initial={{ opacity: 0, x: -6 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.1 + i * 0.08, duration: 0.3 }}
              className="flex items-center gap-3"
            >
              <div
                className={cn(
                  'w-5 h-5 rounded-md border flex items-center justify-center shrink-0 transition-all duration-300',
                  isChecked
                    ? 'bg-violet-500 border-violet-500'
                    : 'border-gray-600 bg-transparent'
                )}
              >
                {isChecked && <Check className="w-3 h-3 text-white" />}
              </div>
              <span
                className={cn(
                  'text-sm transition-all duration-300',
                  isChecked
                    ? 'text-gray-500 line-through'
                    : 'text-gray-300'
                )}
              >
                {task.label}
              </span>
            </motion.li>
          );
        })}
      </ul>
    </div>
  );
}

// ============================================================================
// Main Bento Grid
// ============================================================================

interface BentoShowcaseProps {
  data: ResearchData;
  onComplete: () => void;
}

export function BentoShowcase({ data, onComplete }: BentoShowcaseProps) {
  const [activePanel, setActivePanel] = useState(-1);

  // Stagger panel activation
  useEffect(() => {
    const timers = [
      setTimeout(() => setActivePanel(0), 300),
      setTimeout(() => setActivePanel(1), 1200),
      setTimeout(() => setActivePanel(2), 2400),
      setTimeout(() => setActivePanel(3), 3600),
    ];
    return () => timers.forEach(clearTimeout);
  }, []);

  // Call onComplete after all panels have had time to animate
  useEffect(() => {
    const t = setTimeout(onComplete, 10000);
    return () => clearTimeout(t);
  }, [onComplete]);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, y: -30 }}
      transition={{ duration: 0.5 }}
      className="min-h-screen flex flex-col items-center justify-center px-4 py-12"
    >
      {/* Section label */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="text-center mb-8"
      >
        <p className="text-[11px] font-mono text-gray-500 uppercase tracking-widest mb-2">
          Personalised for {data.company.name}
        </p>
        <h2 className="text-2xl sm:text-3xl font-bold text-white text-balance tracking-tight">
          Here's what your agents would do today
        </h2>
      </motion.div>

      {/* Bento grid */}
      <div className="w-full max-w-5xl grid grid-cols-1 md:grid-cols-2 gap-4">
        <PanelShell
          icon={<FileText className="w-4 h-4 text-emerald-400" />}
          title="Meeting Brief"
          status="Generating"
          delay={0}
        >
          <MeetingPrepPanel
            data={data.demo_actions.meeting_prep}
            active={activePanel >= 0}
          />
        </PanelShell>

        <PanelShell
          icon={<TrendingUp className="w-4 h-4 text-amber-400" />}
          title="Deal Intelligence"
          status="Analysing"
          delay={0.15}
        >
          <DealIntelPanel
            data={data.demo_actions.pipeline_action}
            active={activePanel >= 1}
          />
        </PanelShell>

        <PanelShell
          icon={<Mail className="w-4 h-4 text-violet-400" />}
          title="Follow-Up Draft"
          status="Composing"
          delay={0.3}
        >
          <OutreachPanel
            data={data.demo_actions.cold_outreach}
            active={activePanel >= 2}
          />
        </PanelShell>

        <PanelShell
          icon={<ListChecks className="w-4 h-4 text-violet-400" />}
          title="Task Queue"
          status="Auto-creating"
          delay={0.45}
        >
          <TaskQueuePanel data={data} active={activePanel >= 3} />
        </PanelShell>
      </div>
    </motion.div>
  );
}

demo/ResultsSummary.tsx
tsx
/**
 * ResultsSummary — Step 5
 *
 * Consolidates research stats into a "Sales Intelligence Report" card
 * with animated counters and a CTA to proceed to onboarding.
 */

import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Zap, Users, Target, BarChart3, ArrowRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { ResearchData } from './demo-types';

// ============================================================================
// Animated counter
// ============================================================================

function AnimatedStat({
  icon: Icon,
  value,
  label,
  delay,
}: {
  icon: typeof Zap;
  value: number;
  label: string;
  delay: number;
}) {
  const [count, setCount] = useState(0);

  useEffect(() => {
    const start = performance.now();
    const duration = 1200;
    let frame: number;

    const tick = (now: number) => {
      const elapsed = now - start - delay * 1000;
      if (elapsed < 0) {
        frame = requestAnimationFrame(tick);
        return;
      }
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setCount(Math.round(eased * value));
      if (progress < 1) frame = requestAnimationFrame(tick);
    };

    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [value, delay]);

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: delay + 0.2, duration: 0.4 }}
      className="flex flex-col items-center gap-2 p-4"
    >
      <div className="w-10 h-10 rounded-xl bg-violet-500/10 flex items-center justify-center">
        <Icon className="w-5 h-5 text-violet-400" />
      </div>
      <p className="text-3xl font-bold text-white tabular-nums">{count}</p>
      <p className="text-xs text-gray-400 text-center">{label}</p>
    </motion.div>
  );
}

// ============================================================================
// Component
// ============================================================================

interface ResultsSummaryProps {
  stats: ResearchData['stats'];
  companyName: string;
  onContinue: () => void;
}

export function ResultsSummary({ stats, companyName, onContinue }: ResultsSummaryProps) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, y: -30 }}
      transition={{ duration: 0.5 }}
      className="min-h-screen flex flex-col items-center justify-center px-4"
    >
      <div className="w-full max-w-lg mx-auto">
        <div
          className="bg-gray-900/80 backdrop-blur-sm border border-gray-700/50
            rounded-2xl overflow-hidden"
        >
          {/* Header */}
          <div className="px-6 py-5 border-b border-gray-700/50 text-center">
            <p className="text-[10px] font-mono text-gray-500 uppercase tracking-widest mb-1">
              {companyName}
            </p>
            <h2 className="text-xl font-bold text-white">
              Your Sales Intelligence Report
            </h2>
          </div>

          {/* Stats grid */}
          <div className="grid grid-cols-2 gap-0 divide-x divide-y divide-gray-800/50">
            <AnimatedStat
              icon={Zap}
              value={stats.signals_found}
              label="Signals found"
              delay={0}
            />
            <AnimatedStat
              icon={Target}
              value={stats.actions_queued}
              label="Actions queued"
              delay={0.15}
            />
            <AnimatedStat
              icon={Users}
              value={stats.contacts_identified}
              label="Contacts identified"
              delay={0.3}
            />
            <AnimatedStat
              icon={BarChart3}
              value={stats.opportunities_mapped}
              label="Opportunities mapped"
              delay={0.45}
            />
          </div>

          {/* CTA */}
          <div className="px-6 py-5 border-t border-gray-700/50 space-y-4">
            <p className="text-sm text-gray-400 text-center text-pretty">
              Want to see what your agents can really do?
              <br />
              Let's set them up.
            </p>

            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              transition={{ type: 'spring', stiffness: 400, damping: 17 }}
              onClick={onContinue}
              className={cn(
                'w-full py-3 rounded-xl font-semibold text-sm',
                'bg-white text-gray-950',
                'hover:bg-gray-100 transition-colors',
                'flex items-center justify-center gap-2'
              )}
            >
              Set Up My Agents
              <ArrowRight className="w-4 h-4" />
            </motion.button>
          </div>
        </div>
      </div>
    </motion.div>
  );
}

demo/DemoSkillsOnboarding.tsx
tsx
/**
 * DemoSkillsOnboarding — Step 6
 *
 * Trimmed onboarding where research data pre-populates fields.
 * Framed as "confirm what we found" rather than "fill out your info."
 */

import { useState } from 'react';
import { motion } from 'framer-motion';
import { Check, ArrowRight, Pencil } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { ResearchData } from './demo-types';

// ============================================================================
// Editable field
// ============================================================================

function ConfirmField({
  label,
  value,
  delay,
}: {
  label: string;
  value: string;
  delay: number;
}) {
  const [confirmed, setConfirmed] = useState(false);
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(value);

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay, duration: 0.4 }}
      className="bg-gray-800/40 rounded-xl border border-gray-700/40 p-4"
    >
      <div className="flex items-center justify-between mb-2">
        <p className="text-[11px] font-mono text-gray-500 uppercase tracking-wider">
          {label}
        </p>
        {confirmed && (
          <span className="flex items-center gap-1 text-[10px] text-emerald-400 font-medium">
            <Check className="w-3 h-3" /> Confirmed
          </span>
        )}
      </div>

      {editing ? (
        <div className="space-y-2">
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={2}
            className="w-full bg-gray-900/60 border border-gray-600/50 text-sm text-gray-200
              rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-violet-500
              focus:border-transparent resize-none"
          />
          <button
            onClick={() => {
              setEditing(false);
              setConfirmed(true);
            }}
            className="text-xs text-violet-400 font-medium hover:text-violet-300 transition-colors"
          >
            Save
          </button>
        </div>
      ) : (
        <div className="flex items-start justify-between gap-3">
          <p className="text-sm text-gray-200 leading-relaxed">{text}</p>
          <div className="flex items-center gap-2 shrink-0">
            {!confirmed && (
              <>
                <button
                  onClick={() => setEditing(true)}
                  className="p-1.5 rounded-md hover:bg-gray-700/50 transition-colors text-gray-500 hover:text-gray-300"
                >
                  <Pencil className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={() => setConfirmed(true)}
                  className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-emerald-500/15
                    text-emerald-400 text-xs font-medium hover:bg-emerald-500/25 transition-colors"
                >
                  <Check className="w-3 h-3" />
                  Correct
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </motion.div>
  );
}

// ============================================================================
// Skills toggle group (simplified)
// ============================================================================

const DEMO_SKILLS = [
  { id: 'outreach', label: 'Cold Outreach', desc: 'Personalised email sequences', defaultOn: true },
  { id: 'meetings', label: 'Meeting Prep', desc: 'Pre-meeting briefs and intel', defaultOn: true },
  { id: 'pipeline', label: 'Pipeline Management', desc: 'Deal scoring and risk alerts', defaultOn: true },
  { id: 'proposals', label: 'Proposal Drafting', desc: 'Auto-generated proposals', defaultOn: true },
  { id: 'enrichment', label: 'Contact Enrichment', desc: 'Real-time contact & company data', defaultOn: true },
  { id: 'tasks', label: 'Task Automation', desc: 'Auto-create follow-up tasks', defaultOn: false },
];

function SkillToggle({
  skill,
  delay,
}: {
  skill: (typeof DEMO_SKILLS)[number];
  delay: number;
}) {
  const [enabled, setEnabled] = useState(skill.defaultOn);

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay, duration: 0.3 }}
      className="flex items-center justify-between py-2.5"
    >
      <div>
        <p className="text-sm font-medium text-gray-200">{skill.label}</p>
        <p className="text-xs text-gray-500">{skill.desc}</p>
      </div>
      <button
        onClick={() => setEnabled((e) => !e)}
        className={cn(
          'w-10 h-6 rounded-full transition-colors duration-200 relative shrink-0',
          enabled ? 'bg-violet-500' : 'bg-gray-700'
        )}
      >
        <span
          className={cn(
            'absolute top-1 w-4 h-4 rounded-full bg-white transition-transform duration-200',
            enabled ? 'translate-x-5' : 'translate-x-1'
          )}
        />
      </button>
    </motion.div>
  );
}

// ============================================================================
// Component
// ============================================================================

interface DemoSkillsOnboardingProps {
  research: ResearchData;
  onComplete: () => void;
}

export function DemoSkillsOnboarding({ research, onComplete }: DemoSkillsOnboardingProps) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, y: -30 }}
      transition={{ duration: 0.5 }}
      className="min-h-screen flex flex-col items-center justify-center px-4 py-12"
    >
      <div className="w-full max-w-xl mx-auto">
        <div className="bg-gray-900/80 backdrop-blur-sm border border-gray-700/50 rounded-2xl overflow-hidden">
          {/* Header */}
          <div className="bg-gradient-to-r from-violet-600 to-violet-700 px-6 py-5">
            <h2 className="text-xl font-bold text-white">Configure Your Agents</h2>
            <p className="text-violet-100 text-sm mt-1">
              We found this about your business — confirm or edit.
            </p>
          </div>

          {/* Body */}
          <div className="p-5 sm:p-6 space-y-4 max-h-[65vh] overflow-y-auto">
            {/* Pre-populated fields */}
            <ConfirmField
              label="Company"
              value={research.company.name}
              delay={0.1}
            />
            <ConfirmField
              label="Industry / Vertical"
              value={research.company.vertical}
              delay={0.2}
            />
            <ConfirmField
              label="What you sell"
              value={research.company.product_summary}
              delay={0.3}
            />
            <ConfirmField
              label="Ideal Customer"
              value={`${research.company.icp.title} at ${research.company.icp.company_size} companies in ${research.company.icp.industry}`}
              delay={0.4}
            />

            {/* Divider */}
            <div className="border-t border-gray-700/40 pt-4 mt-4">
              <p className="text-sm font-semibold text-gray-200 mb-3">Agent Skills</p>
              <div className="divide-y divide-gray-800/40">
                {DEMO_SKILLS.map((skill, i) => (
                  <SkillToggle key={skill.id} skill={skill} delay={0.5 + i * 0.06} />
                ))}
              </div>
            </div>
          </div>

          {/* Footer */}
          <div className="border-t border-gray-700/50 px-6 py-4 bg-gray-900/50">
            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              transition={{ type: 'spring', stiffness: 400, damping: 17 }}
              onClick={onComplete}
              className={cn(
                'w-full py-3 rounded-xl font-semibold text-sm',
                'bg-violet-600 hover:bg-violet-700 text-white transition-colors',
                'flex items-center justify-center gap-2'
              )}
            >
              Launch Copilot Demo
              <ArrowRight className="w-4 h-4" />
            </motion.button>
          </div>
        </div>
      </div>
    </motion.div>
  );
}

demo/DemoCopilot.tsx
tsx
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
  const o = data.demo_actions.cold_outreach;
  const p = data.demo_actions.proposal_draft;
  const m = data.demo_actions.meeting_prep;
  const d = data.demo_actions.pipeline_action;

  return [
    {
      id: 'outreach',
      label: `Write cold outreach to ${o.target_name}`,
      description: `Personalised email to ${o.target_title} at ${o.target_company}`,
      icon: 'Target',
      iconColor: 'text-violet-400',
      prompt: `Write a cold outreach email to ${o.target_name}, ${o.target_title} at ${o.target_company}`,
      response: `Here's a personalised cold email for ${o.target_name} at ${o.target_company}:\n\n---\n\n**Subject:** ${o.target_company}'s growth + a quick idea\n\n${o.email_preview}\n\n---\n\n**Why this works:**\n- Opens with a specific observation about ${o.target_company} (${o.personalised_hook.slice(0, 60)}…)\n- Connects their situation to a relevant outcome\n- Soft CTA — asks for 15 minutes, not a commitment\n\nWant me to create a 3-touch follow-up sequence?`,
    },
    {
      id: 'proposal',
      label: `Draft proposal for ${p.prospect_company}`,
      description: `Structured proposal with ROI projections`,
      icon: 'FileText',
      iconColor: 'text-emerald-400',
      prompt: `Draft a proposal for ${p.prospect_name} at ${p.prospect_company}`,
      response: `Here's a proposal outline for ${p.prospect_company}:\n\n# ${p.proposal_title}\n\n${p.key_sections.map((s, i) => `## ${i + 1}. ${s}`).join('\n\n')}\n\n---\n\n**Executive Summary:** ${data.company.name} helps teams like ${p.prospect_company} streamline their sales workflow, reduce manual work by 40%, and close deals faster.\n\n**Projected ROI:**\n- 35% reduction in deal cycle time\n- 60% less time on manual CRM updates\n- 28% improvement in close rate\n\n**Next steps:** I can expand any section or schedule a walkthrough with ${p.prospect_name}. Want me to draft the full proposal?`,
    },
    {
      id: 'meeting',
      label: `Prep for meeting with ${m.attendee_name}`,
      description: `Pre-meeting brief for ${m.attendee_company}`,
      icon: 'Calendar',
      iconColor: 'text-amber-400',
      prompt: `Prepare me for my meeting with ${m.attendee_name} at ${m.attendee_company}`,
      response: `# Meeting Brief: ${m.attendee_name} — ${m.attendee_company}\n\n**Context:** ${m.context}\n\n**Key Talking Points:**\n${m.talking_points.map((p, i) => `${i + 1}. ${p}`).join('\n')}\n\n**Potential Objections:**\n- "We're happy with our current setup" → Highlight migration simplicity and quick wins\n- "Not in budget right now" → Offer a pilot program with 3-month commitment\n\n**Ask:** Push for a technical review meeting with their team lead. If David's interested, get calendar access to book directly.\n\nWant me to draft a pre-meeting email to ${m.attendee_name}?`,
    },
    {
      id: 'pipeline',
      label: `What about the ${d.deal_name.split('—')[0].trim()} deal?`,
      description: `${d.days_stale} days stale — risk analysis`,
      icon: 'AlertTriangle',
      iconColor: 'text-red-400',
      prompt: `What should I do about the ${d.deal_name} deal?`,
      response: `# Deal Risk Analysis: ${d.deal_name}\n\n**Value:** ${d.deal_value}\n**Health Score:** ${d.health_score}% ⚠️\n**Days Since Activity:** ${d.days_stale}\n\n**Risk Signal:** ${d.risk_signal}\n\n**Signals:**\n${d.signals.map((s) => `- ${s.type === 'warning' ? '⚠️' : '✅'} ${s.label}`).join('\n')}\n\n**Recommended Action:**\n${d.suggested_action}\n\n**Draft LinkedIn Message:**\n"Hi [Champion] — saw ${d.deal_name.split('—')[0].trim()} is expanding this quarter. Wanted to loop back on how ${data.company.name} could support the transition. Worth a quick sync?"\n\nWant me to send this message and create a follow-up task?`,
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
    <div className="text-sm text-gray-200 leading-relaxed whitespace-pre-wrap">
      {displayed}
      {!isDone && <span className="text-violet-400 animate-pulse">▊</span>}
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
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [activePrompt]);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, y: -30 }}
      transition={{ duration: 0.5 }}
      className="min-h-screen flex flex-col px-4 py-8"
    >
      <div className="w-full max-w-3xl mx-auto flex flex-col flex-1">
        {/* Header */}
        <div className="text-center mb-6">
          <h2 className="text-2xl sm:text-3xl font-bold text-white tracking-tight text-balance">
            Try your Copilot
          </h2>
          <p className="text-sm text-gray-400 mt-2">
            Click a prompt to see what your AI sales copilot can do
          </p>
        </div>

        {/* Prompt cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-6">
          {prompts.map((prompt) => {
            const Icon = ICON_MAP[prompt.icon] || Target;
            const tried = triedIds.has(prompt.id);
            const isActive = activePrompt?.id === prompt.id;

            return (
              <button
                key={prompt.id}
                onClick={() => handlePromptClick(prompt)}
                className={cn(
                  'group relative p-4 rounded-xl text-left transition-all',
                  'bg-white/[0.03] backdrop-blur-sm border',
                  isActive
                    ? 'border-violet-500/50 bg-violet-500/[0.06]'
                    : tried
                      ? 'border-gray-700/30 opacity-60'
                      : 'border-white/[0.06] hover:border-white/[0.15] hover:bg-white/[0.05]',
                  'focus:outline-none focus:ring-2 focus:ring-violet-500'
                )}
              >
                <div className="flex items-start gap-3">
                  <div className="w-9 h-9 rounded-lg bg-white/[0.06] border border-white/[0.08] flex items-center justify-center shrink-0">
                    <Icon className={cn('w-4 h-4', prompt.iconColor)} />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-white truncate">
                      {prompt.label}
                    </p>
                    <p className="text-xs text-gray-500 mt-0.5">
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
          className="flex-1 bg-gray-900/60 backdrop-blur-sm border border-gray-700/40
            rounded-2xl overflow-y-auto min-h-[280px] max-h-[50vh]"
        >
          {!activePrompt ? (
            <div className="h-full flex items-center justify-center p-8">
              <div className="text-center">
                <div className="w-12 h-12 rounded-full bg-gray-800 flex items-center justify-center mx-auto mb-3">
                  <Bot className="w-6 h-6 text-gray-500" />
                </div>
                <p className="text-sm text-gray-500">
                  Select a prompt above to see your copilot in action
                </p>
              </div>
            </div>
          ) : (
            <div className="p-5 space-y-4">
              {/* User message */}
              <div className="flex justify-end">
                <div className="bg-violet-500/15 border border-violet-500/20 rounded-xl px-4 py-2.5 max-w-[80%]">
                  <p className="text-sm text-violet-200">{activePrompt.prompt}</p>
                </div>
              </div>

              {/* AI response */}
              <div className="flex gap-3">
                <div className="w-7 h-7 rounded-full bg-emerald-500/15 flex items-center justify-center shrink-0 mt-0.5">
                  <Bot className="w-3.5 h-3.5 text-emerald-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <StreamingMessage
                    key={activePrompt.id}
                    content={activePrompt.response}
                  />
                  {/* Demo footer */}
                  <p className="text-[10px] text-gray-600 mt-4 font-mono">
                    Demo mode — sign up to use with your real data
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Disabled input */}
        <div className="mt-3 relative">
          <div
            className="w-full px-4 py-3 rounded-xl bg-gray-800/40 border border-gray-700/30
              text-sm text-gray-600 cursor-not-allowed"
          >
            Sign up to type your own prompts…
          </div>
          <Send className="absolute right-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-700" />
        </div>

        {/* Continue CTA */}
        <AnimatePresence>
          {triedCount >= 1 && (
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.4 }}
              className="mt-6 text-center"
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
                  'inline-flex items-center gap-2'
                )}
              >
                Get Started — It's Free
                <ArrowRight className="w-4 h-4" />
              </motion.button>
              <p className="text-xs text-gray-500 mt-2">
                {triedCount < 3
                  ? `Try ${3 - triedCount} more prompts, or continue to sign up`
                  : "You've seen it all — let's make it real"}
              </p>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  );
}

demo/DemoSignup.tsx
tsx
/**
 * DemoSignup — Step 8
 *
 * Email capture with magic-link activation (primary) and waitlist (secondary).
 * A/B test–ready: swap `variant` prop between 'activation' and 'waitlist'.
 */

import { useState, type FormEvent } from 'react';
import { motion } from 'framer-motion';
import { ArrowRight, Check, Loader2, Mail } from 'lucide-react';
import { cn } from '@/lib/utils';

type Variant = 'activation' | 'waitlist';

const COPY: Record<Variant, { headline: string; subtext: string; cta: string; successTitle: string; successDesc: string }> = {
  activation: {
    headline: 'Your agents are ready. Let's go.',
    subtext: "We'll send you a login link — no password needed.",
    cta: 'Send me a login link',
    successTitle: 'Check your inbox',
    successDesc: 'Click the magic link to activate your account. Your agents are waiting.',
  },
  waitlist: {
    headline: "You're early. We like that.",
    subtext: "Join the waitlist and we'll send your Sales Intelligence Report right away.",
    cta: 'Join the waitlist',
    successTitle: "You're on the list",
    successDesc: "Check your email — we've sent your Sales Intelligence Report.",
  },
};

interface DemoSignupProps {
  companyName: string;
  variant?: Variant;
}

export function DemoSignup({ companyName, variant = 'activation' }: DemoSignupProps) {
  const [email, setEmail] = useState('');
  const [state, setState] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [error, setError] = useState('');
  const copy = COPY[variant];

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const trimmed = email.trim();
    if (!trimmed || !trimmed.includes('@')) {
      setError('Enter a valid email address');
      return;
    }
    setError('');
    setState('loading');

    // Simulate API call — replace with real endpoint
    await new Promise((r) => setTimeout(r, 1500));

    // In production:
    // 1. POST /api/demo/signup { email, variant, researchData, onboardingData }
    // 2. Enrich via Apollo / AI Ark
    // 3. Send magic link or waitlist confirmation
    // 4. Email Sales Intelligence Report

    setState('success');
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.5 }}
      className="min-h-screen flex flex-col items-center justify-center px-4"
    >
      {/* Radial glow */}
      <div
        className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2
          w-[600px] h-[600px] rounded-full pointer-events-none
          bg-[radial-gradient(ellipse,rgba(139,92,246,0.08),transparent_70%)]
          blur-3xl"
      />

      <div className="relative z-10 w-full max-w-md mx-auto">
        {state === 'success' ? (
          /* ---- Success ---- */
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.4 }}
            className="bg-gray-900/80 backdrop-blur-sm border border-gray-700/50
              rounded-2xl p-8 text-center"
          >
            <div className="w-14 h-14 rounded-full bg-emerald-500/15 flex items-center justify-center mx-auto mb-5">
              <Check className="w-7 h-7 text-emerald-400" />
            </div>
            <h2 className="text-xl font-bold text-white mb-2">{copy.successTitle}</h2>
            <p className="text-sm text-gray-400 leading-relaxed">{copy.successDesc}</p>
            <div className="mt-6 p-3 rounded-lg bg-gray-800/50 border border-gray-700/30">
              <p className="text-xs text-gray-500 font-mono">{email}</p>
            </div>
          </motion.div>
        ) : (
          /* ---- Form ---- */
          <div
            className="bg-gray-900/80 backdrop-blur-sm border border-gray-700/50
              rounded-2xl p-8"
          >
            {/* Icon */}
            <div className="w-12 h-12 rounded-full bg-violet-500/15 flex items-center justify-center mx-auto mb-6">
              <Mail className="w-6 h-6 text-violet-400" />
            </div>

            <h2 className="text-xl font-bold text-white text-center mb-2">
              {copy.headline}
            </h2>
            <p className="text-sm text-gray-400 text-center mb-8">{copy.subtext}</p>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => {
                    setEmail(e.target.value);
                    setError('');
                  }}
                  placeholder="you@company.com"
                  className={cn(
                    'w-full px-4 py-3 rounded-xl text-sm text-white',
                    'bg-white/[0.05] border placeholder-gray-500',
                    'focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-transparent',
                    'transition-all',
                    error ? 'border-red-500/50' : 'border-white/10'
                  )}
                  autoFocus
                />
                {error && (
                  <p className="text-xs text-red-400 mt-1.5 ml-1">{error}</p>
                )}
              </div>

              <motion.button
                type="submit"
                disabled={state === 'loading'}
                whileHover={{ scale: state === 'loading' ? 1 : 1.02 }}
                whileTap={{ scale: state === 'loading' ? 1 : 0.98 }}
                transition={{ type: 'spring', stiffness: 400, damping: 17 }}
                className={cn(
                  'w-full py-3 rounded-xl font-semibold text-sm transition-colors',
                  'flex items-center justify-center gap-2',
                  'disabled:opacity-60 disabled:cursor-not-allowed',
                  variant === 'activation'
                    ? 'bg-white text-gray-950 hover:bg-gray-100'
                    : 'bg-violet-600 text-white hover:bg-violet-700'
                )}
              >
                {state === 'loading' ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    {variant === 'activation' ? 'Sending link…' : 'Joining…'}
                  </>
                ) : (
                  <>
                    {copy.cta}
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </motion.button>
            </form>

            {/* Company context */}
            {companyName && (
              <p className="text-[10px] text-gray-600 text-center mt-5 font-mono">
                Setting up agents for {companyName}
              </p>
            )}
          </div>
        )}
      </div>
    </motion.div>
  );
}

Usage
Add a route pointing to the orchestrator:

tsx
import DemoExperience from '@/demo/DemoExperience';

// In your router config:
{ path: '/demo', element: <DemoExperience /> }

The entire flow runs client-side with simulated research data. To connect the real backend, replace the body of useDemoResearch.start() with a fetch('/api/demo/research', { body: JSON.stringify({ url }) }) call and map the SSE events to the same agent status updates.

Key decisions this implements from the brief:

Brief Section	Implementation
Step 1 Hero	DemoHero — single input, no nav, example.com fallback
Step 2 Value Bridge	ValueBridge — 3 lines, sequential fade, auto-advances
Step 3 Research	AgentResearch — 6 agents with streaming findings
Step 4 Bento	BentoShowcase — 4 panels matching the screenshot aesthetic exactly (meeting brief, deal intel, email draft, task queue) with typewriter + animated health bars + staggered checkboxes
Step 5 Results	ResultsSummary — animated counters, "Sales Intelligence Report" card
Step 6 Onboarding	DemoSkillsOnboarding — pre-populated confirm/edit fields + skill toggles
Step 7 Copilot	DemoCopilot — 4 contextualised prompt cards, streaming chat, disabled input
Step 8 Signup	DemoSignup — A/B ready (variant prop), magic link + waitlist variants