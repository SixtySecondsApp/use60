import { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import {
  ArrowRight, ChevronDown, ChevronRight, FileText, Layers, Search, Database, Shield,
  Zap, TrendingUp, BookOpen, Target, Brain, MessageSquare, Mail, Swords, AlertTriangle,
  Clock, ListChecks, Package, Play, Copy, Code, Check, Loader2,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Separator } from '@/components/ui/separator';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from '@/components/ui/collapsible';
import { BackToPlatform } from '@/components/platform/BackToPlatform';
import { supabase } from '@/lib/supabase/clientV2';
import { useActiveOrgId } from '@/lib/stores/orgStore';
import { toast } from 'sonner';

// ============================================================
// SKILL UPGRADE DATA (snapshot from commit d80fbc66)
// ============================================================

interface ReferenceFile {
  name: string;
  lines: number;
  words: number;
  isNew: boolean;
}

interface SkillUpgrade {
  key: string;
  name: string;
  icon: React.ElementType;
  versionBefore: string;
  versionAfter: string;
  linesBefore: number;
  linesAfter: number;
  outputsBefore: number;
  outputsAfter: number;
  descriptionBefore: string;
  descriptionAfter: string;
  newOutputs: string[];
  newCapabilities: string[];
  keyAdditions: string[];
  references: ReferenceFile[];
  unchanged?: boolean;
}

const UPGRADED_SKILLS: SkillUpgrade[] = [
  {
    key: 'copilot-proposal',
    name: 'Proposal Generator',
    icon: FileText,
    versionBefore: 'v2',
    versionAfter: 'v3',
    linesBefore: 209,
    linesAfter: 307,
    outputsBefore: 7,
    outputsAfter: 13,
    descriptionBefore: 'Pulls deal data, contact history, company intel, and org templates to produce a complete proposal with pricing table and next steps.',
    descriptionAfter: 'Pulls deal data, contact history, company intel, meeting transcript intelligence, competitive context, and org templates to produce a complete proposal with pricing table, ROI metrics, competitive positioning, and next steps.',
    newOutputs: ['pricing_rationale', 'competitive_positioning', 'roi_metrics', 'personalization_signals', 'confidence_level', 'proposal_stage'],
    newCapabilities: ['web_search'],
    keyAdditions: [
      'Stage-specific templates (discovery/evaluation/negotiation/renewal)',
      'ROI business case section',
      'Pricing rationale with anchoring framework',
      'Conflicting data handling',
      'Confidence levels on all outputs',
    ],
    references: [
      { name: 'pricing-strategy.md', lines: 328, words: 2665, isNew: true },
      { name: 'proposal-templates.md', lines: 474, words: 2851, isNew: true },
    ],
  },
  {
    key: 'copilot-followup',
    name: 'Follow-Up Email',
    icon: Mail,
    versionBefore: 'v2',
    versionAfter: 'v3',
    linesBefore: 197,
    linesAfter: 296,
    outputsBefore: 7,
    outputsAfter: 11,
    descriptionBefore: 'Pulls the latest meeting digest, activity history, and deal context to generate a personalized email with subject line, body, and suggested send time.',
    descriptionAfter: 'Pulls CRM data, meeting transcripts (via RAG), enrichment signals, and deal context to generate a deeply personalized email with subject line options, body, send timing, confidence level, and multi-threading suggestions when contacts go silent.',
    newOutputs: ['rag_context_used', 'personalization_signals', 'multi_thread_suggestion', 'confidence_level'],
    newCapabilities: ['rag'],
    keyAdditions: [
      'Multi-threading when contact unresponsive',
      'Engagement trajectory analysis (14-day window)',
      'Graceful degradation table',
      'Ghost risk detection at 14+ days',
    ],
    references: [
      { name: 'followup-templates.md', lines: 515, words: 3566, isNew: true },
      { name: 'personalization-guide.md', lines: 315, words: 2544, isNew: true },
    ],
  },
  {
    key: 'copilot-battlecard',
    name: 'Battlecard',
    icon: Swords,
    versionBefore: 'v2',
    versionAfter: 'v3',
    linesBefore: 216,
    linesAfter: 325,
    outputsBefore: 8,
    outputsAfter: 12,
    descriptionBefore: 'Combines deal context with competitor research to produce actionable sales ammunition: competitor overview, strength/weakness comparison, objection responses, and win themes.',
    descriptionAfter: 'Combines deal context, competitor web research, and historical meeting intelligence (RAG) to produce actionable sales ammunition: competitor overview, strength/weakness comparison, objection responses, win themes, evidence confidence levels, and timing guidance.',
    newOutputs: ['evidence_confidence', 'timing_guidance', 'deal_specific_angles', 'competitor_acknowledgments'],
    newCapabilities: ['rag'],
    keyAdditions: [
      'Evidence confidence rating (high/medium/low) for every claim',
      'Competitor acknowledgments — honest areas where they win',
      'Timing guidance by deal stage and stakeholder type',
      '6 RAG queries for transcript-based competitive intel',
    ],
    references: [
      { name: 'battlecard-frameworks.md', lines: 337, words: 3007, isNew: true },
      { name: 'competitive-intel-guide.md', lines: 319, words: 2742, isNew: true },
    ],
  },
  {
    key: 'copilot-objection',
    name: 'Objection Handler',
    icon: Shield,
    versionBefore: 'v2',
    versionAfter: 'v3',
    linesBefore: 250,
    linesAfter: 338,
    outputsBefore: 7,
    outputsAfter: 11,
    descriptionBefore: 'Searches meeting transcripts, CRM notes, and organizational playbooks for how similar objections were handled in the past, then drafts a tailored response with proof points.',
    descriptionAfter: 'Searches meeting transcripts via RAG for past objection patterns, researches competitor claims and proof points via web search, and synthesizes a tailored response grounded in real data.',
    newOutputs: ['objection_pattern', 'confidence_level', 'alternative_responses', 'follow_up_strategy'],
    newCapabilities: ['web_search'],
    keyAdditions: [
      'ACE framework deep dive',
      'Objection pattern analysis with win/loss correlation',
      'Category-specific web search (benchmarks for price, competitor intel for competition)',
      'Alternative responses for different buyer personas',
      'Follow-up strategy if initial response fails',
    ],
    references: [
      { name: 'objection-playbooks.md', lines: 426, words: 4509, isNew: true },
      { name: 'proof-point-library.md', lines: 447, words: 3866, isNew: true },
    ],
  },
  {
    key: 'copilot-chase',
    name: 'Chase / Re-engage',
    icon: Clock,
    versionBefore: 'v2',
    versionAfter: 'v3',
    linesBefore: 220,
    linesAfter: 317,
    outputsBefore: 6,
    outputsAfter: 12,
    descriptionBefore: 'Gentle re-engagement email for a deal or contact that has gone quiet. Produces a warm, non-pushy email with strategic timing advice.',
    descriptionAfter: 'Multi-channel re-engagement for deals and contacts that have gone quiet. Uses RAG transcript search for conversation history, web search for trigger events and company news, silence-duration templates, and multi-channel strategy.',
    newOutputs: ['silence_analysis', 'channel_recommendation', 'multi_thread_option', 'rag_context_used', 'confidence_level', 'escalation_path'],
    newCapabilities: ['web_search'],
    keyAdditions: [
      'Silence duration tiers (5-7d / 8-14d / 15-21d / 22-30d / 30+d)',
      'Multi-channel strategy (email / LinkedIn / call / text)',
      'Channel selection logic',
      'Escalation paths',
      '10-row graceful degradation table',
    ],
    references: [
      { name: 'chase-templates.md', lines: 373, words: 2695, isNew: true },
      { name: 'reengagement-playbook.md', lines: 378, words: 3569, isNew: true },
    ],
  },
  {
    key: 'sales-sequence',
    name: 'Sales Sequence',
    icon: MessageSquare,
    versionBefore: 'v1',
    versionAfter: 'v2',
    linesBefore: 359,
    linesAfter: 447,
    outputsBefore: 11,
    outputsAfter: 14,
    descriptionBefore: 'Generate high-converting cold outreach email sequences that sound human and get replies.',
    descriptionAfter: 'Generate high-converting cold outreach email sequences that sound human and get replies. Integrates RAG win/loss context from past deals and CRM history for data-grounded personalization.',
    newOutputs: ['personalization_signals', 'confidence_level', 'historical_context'],
    newCapabilities: [],
    keyAdditions: [
      'Layer 3 RAG for win/loss patterns and past outreach history',
      'Layer 4 intelligence signals (win rate, send timing, subject performance)',
      'Confidence level table',
      '7-row graceful degradation table',
    ],
    references: [
      { name: 'win-loss-patterns.md', lines: 230, words: 2172, isNew: true },
      { name: 'anti-patterns.md', lines: 189, words: 0, isNew: false },
      { name: 'cold-email-playbook.md', lines: 1450, words: 0, isNew: false },
      { name: 'email-rules.md', lines: 232, words: 0, isNew: false },
      { name: 'frameworks.md', lines: 333, words: 0, isNew: false },
    ],
  },
  {
    key: 'deal-next-best-actions',
    name: 'Deal Next Best Actions',
    icon: Target,
    versionBefore: 'v2',
    versionAfter: 'v3',
    linesBefore: 352,
    linesAfter: 385,
    outputsBefore: 7,
    outputsAfter: 10,
    descriptionBefore: 'Generate a ranked action plan for advancing a specific deal based on its stage, recent activity, and your capacity.',
    descriptionAfter: 'Generate a ranked action plan for advancing a specific deal based on its stage, recent activity, historical conversation context (via RAG transcript search), and external trigger events (via web research).',
    newOutputs: ['rag_context_used', 'confidence_level', 'trigger_events'],
    newCapabilities: ['web_search'],
    keyAdditions: [
      '5-layer intelligence model',
      'Web search for trigger events',
      'RAG for commitment tracking and conversation context',
      'Confidence levels on recommendations',
    ],
    references: [
      { name: 'action-library.md', lines: 649, words: 3724, isNew: false },
      { name: 'stage-playbooks.md', lines: 585, words: 4940, isNew: false },
    ],
  },
  {
    key: 'lead-qualification',
    name: 'Lead Qualification',
    icon: TrendingUp,
    versionBefore: 'v2',
    versionAfter: 'v3',
    linesBefore: 425,
    linesAfter: 357,
    outputsBefore: 7,
    outputsAfter: 11,
    descriptionBefore: 'Score and qualify an inbound lead against Ideal Customer Profile (ICP) criteria. Returns qualification tier, scoring breakdown, and recommended next action.',
    descriptionAfter: 'Score and qualify an inbound lead against ICP criteria using multi-layer intelligence: CRM data, web research enrichment, historical transcript context, behavioral signals, and enrichment chaining.',
    newOutputs: ['enrichment_data', 'rag_context_used', 'behavioral_signals', 'confidence_level'],
    newCapabilities: ['web_search'],
    keyAdditions: [
      'Web search enrichment (funding, news, tech stack, hiring signals)',
      'RAG transcript context for existing leads',
      'Behavioral intent signals',
      'Enrichment chaining (AI Ark -> Apollo fallback)',
    ],
    references: [
      { name: 'icp-templates.md', lines: 458, words: 3522, isNew: false },
      { name: 'scoring-frameworks.md', lines: 442, words: 4311, isNew: false },
    ],
  },
  {
    key: 'daily-focus-planner',
    name: 'Daily Focus Planner',
    icon: ListChecks,
    versionBefore: 'v2',
    versionAfter: 'v2',
    linesBefore: 430,
    linesAfter: 430,
    outputsBefore: 6,
    outputsAfter: 6,
    descriptionBefore: 'Plan your day with AI-prioritized tasks based on deal urgency, meeting schedule, and capacity.',
    descriptionAfter: 'Plan your day with AI-prioritized tasks based on deal urgency, meeting schedule, and capacity.',
    newOutputs: [],
    newCapabilities: [],
    keyAdditions: [],
    references: [
      { name: 'capacity-guide.md', lines: 377, words: 2573, isNew: false },
      { name: 'focus-frameworks.md', lines: 327, words: 2629, isNew: false },
    ],
    unchanged: true,
  },
  {
    key: 'post-meeting-followup-pack-builder',
    name: 'Post-Meeting Pack Builder',
    icon: Package,
    versionBefore: 'v2',
    versionAfter: 'v3',
    linesBefore: 570,
    linesAfter: 523,
    outputsBefore: 7,
    outputsAfter: 10,
    descriptionBefore: 'Build a complete follow-up pack after a meeting: buyer-facing email, internal Slack update, and 3 actionable tasks.',
    descriptionAfter: 'Build a complete follow-up pack after a meeting: buyer-facing email, internal Slack update, and 3 actionable tasks with meeting outcome confidence scoring and cross-artifact consistency checking.',
    newOutputs: ['outcome_confidence', 'rag_context_used', 'consistency_check'],
    newCapabilities: ['web_search'],
    keyAdditions: [
      'Meeting outcome confidence assessment (hedging language detection)',
      'Cross-artifact consistency checker (6-point verification matrix)',
      'RAG for previous commitments and running themes',
      'Web search for post-meeting company enrichment',
    ],
    references: [
      { name: 'artifact-examples.md', lines: 552, words: 3338, isNew: false },
      { name: 'pack-templates.md', lines: 756, words: 4058, isNew: false },
    ],
  },
];

// ============================================================
// SUMMARY STATS
// ============================================================

const SUMMARY = {
  skillsUpgraded: 9,
  skillsReviewed: 10,
  newRefsCreated: 11,
  totalRefWords: 34186,
  outputsBefore: 73,
  outputsAfter: 110,
  newCapabilities: ['web_search', 'rag', 'confidence_level', 'graceful_degradation', 'multi_threading'],
};

// ============================================================
// SKILL EXECUTION CONFIG
// ============================================================

interface SkillExtraInput {
  field: string;
  label: string;
  placeholder: string;
  required?: boolean;
}

const SKILL_EXTRA_INPUTS: Record<string, SkillExtraInput[]> = {
  'copilot-battlecard': [
    { field: 'competitor_name', label: 'Competitor', placeholder: 'e.g. HubSpot, Salesforce...', required: true },
  ],
  'copilot-objection': [
    { field: 'objection', label: 'Objection', placeholder: 'e.g. Your price is too high' },
  ],
  'post-meeting-followup-pack-builder': [
    { field: 'meeting_id', label: 'Meeting ID', placeholder: 'Auto-picks latest if empty' },
  ],
};

interface DealOption {
  id: string;
  name: string;
  company: string;
  stage_id: string;
  primary_contact_id: string | null;
  contact_name: string | null;
}

interface SkillExecutionResult {
  status: 'success' | 'partial' | 'failed';
  summary?: string;
  data: Record<string, unknown>;
  error?: string;
  references?: unknown[];
  hints?: { suggested_next_skills?: string[]; confidence?: number; flags?: string[] };
  meta?: {
    skill_id: string;
    skill_version: string;
    execution_time_ms: number;
    tokens_used?: number;
    model?: string;
  };
}

// ============================================================
// SKILL OUTPUT COMPONENT
// ============================================================

const EMAIL_SKILL_KEYS = ['copilot-followup', 'copilot-chase', 'sales-sequence', 'post-meeting-followup-pack-builder'];

function ConfidenceBadge({ level }: { level: string }) {
  const color = level === 'high'
    ? 'border-emerald-700 bg-emerald-900/30 text-emerald-400'
    : level === 'medium'
      ? 'border-amber-700 bg-amber-900/30 text-amber-400'
      : 'border-red-700 bg-red-900/30 text-red-400';
  return (
    <Badge variant="outline" className={cn('text-xs', color)}>
      {level}
    </Badge>
  );
}

function SkillOutput({ result, skillKey, durationMs }: { result: SkillExecutionResult; skillKey: string; durationMs: number }) {
  const [showRaw, setShowRaw] = useState(false);
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(JSON.stringify(result.data, null, 2));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [result.data]);

  if (result.status === 'failed') {
    return (
      <div className="rounded-lg border border-red-900/50 bg-red-950/20 p-4 mt-3">
        <p className="text-sm text-red-400 font-medium">Execution failed</p>
        <p className="text-xs text-red-400/70 mt-1">{result.error || 'Unknown error'}</p>
        {result.summary && <p className="text-xs text-red-400/50 mt-1">{result.summary}</p>}
      </div>
    );
  }

  const data = result.data || {};
  const confidence = (data.confidence_level || result.hints?.confidence) as string | undefined;
  const execTime = result.meta?.execution_time_ms || durationMs;
  const isEmailSkill = EMAIL_SKILL_KEYS.includes(skillKey);

  return (
    <div className="rounded-lg border border-gray-700 bg-gray-950/60 mt-3 overflow-hidden">
      {/* Top bar */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-gray-800 bg-gray-900/40">
        <div className="flex items-center gap-3">
          {confidence && <ConfidenceBadge level={String(confidence)} />}
          <span className="text-[10px] text-gray-500">{(execTime / 1000).toFixed(1)}s</span>
          {result.meta?.model && <span className="text-[10px] text-gray-600">{result.meta.model}</span>}
          {result.meta?.tokens_used && <span className="text-[10px] text-gray-600">{result.meta.tokens_used} tokens</span>}
        </div>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="sm"
            className="h-7 px-2 text-gray-400 hover:text-white"
            onClick={() => setShowRaw(!showRaw)}
          >
            <Code className="h-3.5 w-3.5 mr-1" />
            <span className="text-xs">{showRaw ? 'Formatted' : 'Raw JSON'}</span>
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 px-2 text-gray-400 hover:text-white"
            onClick={handleCopy}
          >
            {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
          </Button>
        </div>
      </div>

      {/* Content */}
      <div className="p-4">
        {result.summary && (
          <p className="text-xs text-gray-400 mb-3 italic">{result.summary}</p>
        )}
        {showRaw ? (
          <pre className="text-xs text-gray-300 whitespace-pre-wrap font-mono max-h-96 overflow-y-auto">
            {JSON.stringify(data, null, 2)}
          </pre>
        ) : isEmailSkill ? (
          <EmailPreview data={data} />
        ) : (
          <StructuredOutput data={data} />
        )}
      </div>
    </div>
  );
}

function EmailPreview({ data }: { data: Record<string, unknown> }) {
  const subject = (data.subject_line || data.subject || data.email_subject) as string | undefined;
  const body = (data.email_body || data.body || data.email) as string | undefined;
  const sendTime = data.suggested_send_time as string | undefined;

  return (
    <div className="space-y-3">
      {subject && (
        <div>
          <p className="text-[10px] font-semibold text-gray-500 uppercase mb-1">Subject</p>
          <p className="text-sm text-white font-medium">{subject}</p>
        </div>
      )}
      {body && (
        <div>
          <p className="text-[10px] font-semibold text-gray-500 uppercase mb-1">Body</p>
          <div className="rounded-md bg-gray-900 border border-gray-800 p-3">
            <p className="text-xs text-gray-300 whitespace-pre-wrap leading-relaxed">{body}</p>
          </div>
        </div>
      )}
      {sendTime && (
        <p className="text-xs text-gray-500">Suggested send: {sendTime}</p>
      )}
      <RemainingFields data={data} exclude={['subject_line', 'subject', 'email_subject', 'email_body', 'body', 'email', 'suggested_send_time', 'confidence_level']} />
    </div>
  );
}

function StructuredOutput({ data }: { data: Record<string, unknown> }) {
  const entries = Object.entries(data).filter(([key]) => key !== 'confidence_level');

  return (
    <div className="space-y-3">
      {entries.map(([key, value]) => (
        <div key={key}>
          <p className="text-[10px] font-semibold text-gray-500 uppercase mb-1">
            {key.replace(/_/g, ' ')}
          </p>
          <OutputValue value={value} />
        </div>
      ))}
    </div>
  );
}

function RemainingFields({ data, exclude }: { data: Record<string, unknown>; exclude: string[] }) {
  const remaining = Object.entries(data).filter(([key]) => !exclude.includes(key));
  if (remaining.length === 0) return null;

  return (
    <div className="mt-3 pt-3 border-t border-gray-800 space-y-3">
      {remaining.map(([key, value]) => (
        <div key={key}>
          <p className="text-[10px] font-semibold text-gray-500 uppercase mb-1">
            {key.replace(/_/g, ' ')}
          </p>
          <OutputValue value={value} />
        </div>
      ))}
    </div>
  );
}

function OutputValue({ value }: { value: unknown }) {
  if (value === null || value === undefined) {
    return <span className="text-xs text-gray-600 italic">null</span>;
  }
  if (typeof value === 'string') {
    return <p className="text-xs text-gray-300 whitespace-pre-wrap">{value}</p>;
  }
  if (typeof value === 'number' || typeof value === 'boolean') {
    return <span className="text-xs text-indigo-400 font-mono">{String(value)}</span>;
  }
  if (Array.isArray(value)) {
    return (
      <ul className="space-y-1">
        {value.map((item, i) => (
          <li key={i} className="text-xs text-gray-300 flex items-start gap-1.5">
            <span className="text-gray-600 shrink-0">-</span>
            {typeof item === 'object' ? (
              <pre className="font-mono text-gray-400 whitespace-pre-wrap">{JSON.stringify(item, null, 2)}</pre>
            ) : (
              String(item)
            )}
          </li>
        ))}
      </ul>
    );
  }
  return (
    <pre className="text-xs text-gray-400 font-mono whitespace-pre-wrap bg-gray-900 rounded p-2 border border-gray-800">
      {JSON.stringify(value, null, 2)}
    </pre>
  );
}

// ============================================================
// COMPONENTS
// ============================================================

function StatCard({ label, value, subtitle, icon: Icon }: { label: string; value: string | number; subtitle?: string; icon: React.ElementType }) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-gray-800 bg-gray-900/60 p-4">
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-indigo-500/10 text-indigo-400">
        <Icon className="h-5 w-5" />
      </div>
      <div>
        <p className="text-2xl font-bold text-white">{value}</p>
        <p className="text-xs text-gray-400">{label}</p>
        {subtitle && <p className="text-xs text-gray-500 mt-0.5">{subtitle}</p>}
      </div>
    </div>
  );
}

function VersionBadge({ from, to, unchanged }: { from: string; to: string; unchanged?: boolean }) {
  if (unchanged) {
    return (
      <Badge variant="outline" className="text-xs border-gray-600 text-gray-400">
        {from} (unchanged)
      </Badge>
    );
  }
  return (
    <div className="flex items-center gap-1.5">
      <Badge variant="outline" className="text-xs border-gray-600 text-gray-400">{from}</Badge>
      <ArrowRight className="h-3 w-3 text-gray-500" />
      <Badge variant="outline" className="text-xs border-emerald-700 bg-emerald-900/30 text-emerald-400">{to}</Badge>
    </div>
  );
}

function DeltaIndicator({ before, after, label }: { before: number; after: number; label: string }) {
  const delta = after - before;
  const pct = before > 0 ? Math.round(((after - before) / before) * 100) : 0;
  const isPositive = delta > 0;
  const isNegative = delta < 0;

  return (
    <div className="text-center">
      <div className="flex items-center justify-center gap-1 text-sm">
        <span className="text-gray-400">{before}</span>
        <ArrowRight className="h-3 w-3 text-gray-600" />
        <span className={cn(
          'font-medium',
          isPositive && 'text-emerald-400',
          isNegative && 'text-amber-400',
          !isPositive && !isNegative && 'text-gray-400',
        )}>{after}</span>
      </div>
      <p className="text-[10px] text-gray-500 mt-0.5">{label}</p>
      {delta !== 0 && (
        <p className={cn(
          'text-[10px] mt-0.5',
          isPositive ? 'text-emerald-500' : 'text-amber-500',
        )}>
          {isPositive ? '+' : ''}{pct}%
        </p>
      )}
    </div>
  );
}

function SkillCard({ skill, index, dealId, contactId, orgId }: {
  skill: SkillUpgrade;
  index: number;
  dealId: string | null;
  contactId: string | null;
  orgId: string | null;
}) {
  const [open, setOpen] = useState(false);
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<SkillExecutionResult | null>(null);
  const [durationMs, setDurationMs] = useState(0);
  const [extraInputs, setExtraInputs] = useState<Record<string, string>>({});

  const Icon = skill.icon;
  const newRefs = skill.references.filter(r => r.isNew);
  const extraFields = SKILL_EXTRA_INPUTS[skill.key] || [];
  const needsDeal = skill.key !== 'daily-focus-planner';

  const handleRun = useCallback(async () => {
    if (needsDeal && !dealId) {
      toast.error('Select a deal first');
      return;
    }
    if (!orgId) {
      toast.error('No organization selected');
      return;
    }

    // Check required extra inputs
    for (const field of extraFields) {
      if (field.required && !extraInputs[field.field]) {
        toast.error(`${field.label} is required`);
        return;
      }
    }

    setRunning(true);
    setResult(null);
    const start = Date.now();

    try {
      // Pre-fetch all CRM data so the AI has full context (skills expect get_deal/get_contact
      // tools which aren't available in the executor — we inline the data instead)
      const skillContext: Record<string, unknown> = {
        ...extraInputs,
      };

      let companyId: string | null = null;
      let companyDomain: string | null = null;

      if (dealId) {
        skillContext.deal_id = dealId;

        // Fetch full deal record
        const { data: dealData } = await supabase
          .from('deals')
          .select('id, name, company, company_id, stage_id, value, annual_value, monthly_mrr, one_off_revenue, deal_size, status, priority, probability, risk_level, health_score, momentum_score, description, notes, next_steps, close_date, expected_close_date, first_meeting_date, lead_source_type, lead_source_channel, contact_name, contact_email, contact_phone, primary_contact_id, created_at, updated_at, stage_changed_at')
          .eq('id', dealId)
          .maybeSingle();

        if (dealData) {
          companyId = dealData.company_id;

          // Resolve stage name
          let stageName = dealData.stage_id;
          const { data: stageRow } = await supabase
            .from('deal_stages')
            .select('name')
            .eq('id', dealData.stage_id)
            .maybeSingle();
          if (stageRow) stageName = stageRow.name;

          skillContext.deal = {
            ...dealData,
            stage_name: stageName,
          };
          skillContext.company_name = dealData.company;
        }
      }

      // --- Contact: merge contacts table + deal-level fields as fallbacks ---
      if (contactId) {
        skillContext.contact_id = contactId;

        const { data: contactData } = await supabase
          .from('contacts')
          .select('id, full_name, first_name, last_name, email, phone, title, company, company_id, linkedin_url, engagement_level, health_score, source, last_interaction_at, total_meetings_count')
          .eq('id', contactId)
          .maybeSingle();

        // Build merged contact — deal record often has name/email when contacts table doesn't
        const deal = skillContext.deal as Record<string, unknown> | undefined;
        const merged: Record<string, unknown> = { ...(contactData || { id: contactId }) };

        // Fill gaps from deal-level contact fields
        if (!merged.full_name && deal?.contact_name) merged.full_name = deal.contact_name;
        if (!merged.email && deal?.contact_email) merged.email = deal.contact_email;
        if (!merged.phone && deal?.contact_phone) merged.phone = deal.contact_phone;
        if (!merged.company && deal?.company) merged.company = deal.company;
        if (!merged.company_id && deal?.company_id) merged.company_id = deal.company_id;

        // If we still don't have company_id but the contact does, use it
        if (!companyId && merged.company_id) companyId = merged.company_id as string;

        skillContext.contact = merged;
      }

      // --- Company: full profile from companies table ---
      if (companyId) {
        const { data: companyData } = await supabase
          .from('companies')
          .select('id, name, domain, industry, size, website, description, linkedin_url, phone, address, source')
          .eq('id', companyId)
          .maybeSingle();

        if (companyData) {
          skillContext.company = companyData;
          companyDomain = companyData.domain;
        }
      }

      // --- Organization Enrichment: deep intelligence if available ---
      if (companyDomain && orgId) {
        const { data: enrichment } = await supabase
          .from('organization_enrichment')
          .select('company_name, industry, employee_count, funding_stage, founded_year, headquarters, description, tagline, products, value_propositions, use_cases, competitors, target_market, key_people, tech_stack, pain_points, buying_signals, recent_news, confidence_score')
          .eq('organization_id', orgId)
          .eq('domain', companyDomain)
          .eq('status', 'completed')
          .order('updated_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        if (enrichment) {
          skillContext.company_enrichment = enrichment;
        }
      }

      // --- Meetings: recent meetings for this deal with summaries ---
      if (dealId) {
        const { data: meetings } = await supabase
          .from('meetings')
          .select('id, meeting_start, duration_minutes, summary, sentiment_score, coach_rating, talk_time_rep_pct, talk_time_customer_pct, next_actions_count')
          .eq('deal_id', dealId)
          .order('meeting_start', { ascending: false })
          .limit(5);

        if (meetings?.length) {
          skillContext.recent_meetings = meetings;
        }
      }

      // --- Also fetch meetings by contact if no deal meetings found ---
      if (!skillContext.recent_meetings && contactId) {
        const { data: contactMeetingLinks } = await supabase
          .from('meeting_contacts')
          .select('meeting_id')
          .eq('contact_id', contactId)
          .limit(5);

        if (contactMeetingLinks?.length) {
          const meetingIds = contactMeetingLinks.map(m => m.meeting_id);
          const { data: meetings } = await supabase
            .from('meetings')
            .select('id, meeting_start, duration_minutes, summary, sentiment_score, coach_rating, talk_time_rep_pct, talk_time_customer_pct, next_actions_count')
            .in('id', meetingIds)
            .order('meeting_start', { ascending: false });

          if (meetings?.length) {
            skillContext.recent_meetings = meetings;
          }
        }
      }

      // --- Activities: recent deal activities ---
      if (dealId) {
        const { data: activities } = await supabase
          .from('activities')
          .select('id, type, title, description, status, date, created_at')
          .eq('deal_id', dealId)
          .order('created_at', { ascending: false })
          .limit(10);

        if (activities?.length) {
          skillContext.recent_activities = activities;
        }
      }

      const { data, error } = await supabase.functions.invoke('api-services-router', {
        body: {
          action: 'skill_execute',
          skill_key: skill.key,
          organization_id: orgId,
          context: skillContext,
        },
      });

      setDurationMs(Date.now() - start);

      if (error) {
        // supabase.functions.invoke puts non-2xx responses in error
        const errMsg = typeof error === 'object' && error !== null
          ? (error as Record<string, unknown>).message || (error as Record<string, unknown>).error || JSON.stringify(error)
          : String(error);
        setResult({ status: 'failed', error: String(errMsg), data: {} });
      } else if (data && typeof data === 'object' && 'status' in data) {
        setResult(data as SkillExecutionResult);
      } else {
        // Unexpected shape — wrap it
        setResult({ status: 'success', data: data as Record<string, unknown> || {}, summary: 'Skill completed.' });
      }
    } catch (err: unknown) {
      setDurationMs(Date.now() - start);
      setResult({ status: 'failed', error: err instanceof Error ? err.message : 'Unexpected error' });
    } finally {
      setRunning(false);
    }
  }, [dealId, contactId, orgId, skill.key, extraInputs, extraFields, needsDeal]);

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2, delay: index * 0.04 }}
    >
      <Collapsible open={open} onOpenChange={setOpen}>
        <Card className={cn(
          'border-gray-800 bg-gray-900/50 overflow-hidden transition-colors',
          open && 'border-gray-700 bg-gray-900/80',
          skill.unchanged && 'opacity-60',
        )}>
          {/* Collapsed Header */}
          <CollapsibleTrigger asChild>
            <button className="w-full text-left p-4 hover:bg-gray-800/30 transition-colors">
              <div className="flex items-center gap-4">
                {/* Icon */}
                <div className={cn(
                  'flex h-10 w-10 shrink-0 items-center justify-center rounded-lg',
                  skill.unchanged
                    ? 'bg-gray-800 text-gray-500'
                    : 'bg-gradient-to-br from-indigo-500/20 to-purple-500/20 text-indigo-400',
                )}>
                  <Icon className="h-5 w-5" />
                </div>

                {/* Name + Version */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-3 flex-wrap">
                    <h3 className="text-sm font-semibold text-white">{skill.name}</h3>
                    <VersionBadge from={skill.versionBefore} to={skill.versionAfter} unchanged={skill.unchanged} />
                  </div>
                  <p className="text-xs text-gray-500 mt-0.5 font-mono">{skill.key}</p>
                </div>

                {/* Stats row */}
                {!skill.unchanged && (
                  <div className="hidden sm:flex items-center gap-6">
                    <DeltaIndicator before={skill.linesBefore} after={skill.linesAfter} label="Lines" />
                    <DeltaIndicator before={skill.outputsBefore} after={skill.outputsAfter} label="Outputs" />
                    {newRefs.length > 0 && (
                      <div className="text-center">
                        <p className="text-sm font-medium text-emerald-400">+{newRefs.length}</p>
                        <p className="text-[10px] text-gray-500 mt-0.5">New Refs</p>
                      </div>
                    )}
                  </div>
                )}

                {/* Chevron */}
                <div className="text-gray-500">
                  {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                </div>
              </div>
            </button>
          </CollapsibleTrigger>

          {/* Expanded Detail */}
          <CollapsibleContent>
            <Separator className="bg-gray-800" />
            <div className="p-4 space-y-5">
              {skill.unchanged ? (
                <p className="text-sm text-gray-400 italic">
                  This skill was already at gold standard. No modifications were needed.
                </p>
              ) : (
                <>
                  {/* Mobile stats */}
                  <div className="flex sm:hidden items-center justify-around">
                    <DeltaIndicator before={skill.linesBefore} after={skill.linesAfter} label="Lines" />
                    <DeltaIndicator before={skill.outputsBefore} after={skill.outputsAfter} label="Outputs" />
                    {newRefs.length > 0 && (
                      <div className="text-center">
                        <p className="text-sm font-medium text-emerald-400">+{newRefs.length}</p>
                        <p className="text-[10px] text-gray-500 mt-0.5">New Refs</p>
                      </div>
                    )}
                  </div>

                  {/* Description Before/After */}
                  <div>
                    <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Description</h4>
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                      <div className="rounded-lg border border-gray-800 bg-gray-950/50 p-3">
                        <p className="text-[10px] font-semibold text-gray-500 uppercase mb-1.5">Before</p>
                        <p className="text-xs text-gray-400 leading-relaxed">{skill.descriptionBefore}</p>
                      </div>
                      <div className="rounded-lg border border-emerald-900/50 bg-emerald-950/20 p-3">
                        <p className="text-[10px] font-semibold text-emerald-600 uppercase mb-1.5">After</p>
                        <p className="text-xs text-gray-300 leading-relaxed">{skill.descriptionAfter}</p>
                      </div>
                    </div>
                  </div>

                  {/* New Outputs */}
                  {skill.newOutputs.length > 0 && (
                    <div>
                      <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">New Output Fields</h4>
                      <div className="flex flex-wrap gap-1.5">
                        {skill.newOutputs.map(o => (
                          <Badge key={o} variant="outline" className="text-xs border-emerald-800 bg-emerald-900/20 text-emerald-400 font-mono">
                            {o}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* New Capabilities */}
                  {skill.newCapabilities.length > 0 && (
                    <div>
                      <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">New Capabilities</h4>
                      <div className="flex flex-wrap gap-1.5">
                        {skill.newCapabilities.map(c => (
                          <Badge key={c} variant="outline" className="text-xs border-blue-800 bg-blue-900/20 text-blue-400">
                            {c === 'web_search' && <Search className="h-3 w-3 mr-1" />}
                            {c === 'rag' && <Database className="h-3 w-3 mr-1" />}
                            {c}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Key Additions */}
                  {skill.keyAdditions.length > 0 && (
                    <div>
                      <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Key Additions</h4>
                      <ul className="space-y-1.5">
                        {skill.keyAdditions.map((a, i) => (
                          <li key={i} className="flex items-start gap-2 text-xs text-gray-300">
                            <Zap className="h-3 w-3 mt-0.5 shrink-0 text-amber-400" />
                            {a}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {/* Reference Files */}
                  {skill.references.length > 0 && (
                    <div>
                      <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Reference Files</h4>
                      <div className="space-y-1">
                        {skill.references.map(r => (
                          <div key={r.name} className={cn(
                            'flex items-center justify-between rounded-md px-3 py-1.5 text-xs',
                            r.isNew
                              ? 'border border-emerald-900/50 bg-emerald-950/20 text-emerald-400'
                              : 'border border-gray-800 bg-gray-950/30 text-gray-400',
                          )}>
                            <div className="flex items-center gap-2">
                              <BookOpen className="h-3 w-3 shrink-0" />
                              <span className="font-mono">{r.name}</span>
                              {r.isNew && <Badge variant="outline" className="text-[10px] px-1 py-0 border-emerald-700 text-emerald-400">NEW</Badge>}
                            </div>
                            <div className="flex items-center gap-3 text-gray-500">
                              <span>{r.lines} lines</span>
                              {r.words > 0 && <span>{r.words.toLocaleString()} words</span>}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Live Execution */}
                  <Separator className="bg-gray-800" />
                  <div>
                    <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Live Execution</h4>

                    {/* Skill-specific input fields */}
                    {extraFields.length > 0 && (
                      <div className="flex flex-wrap gap-2 mb-3">
                        {extraFields.map(field => (
                          <div key={field.field} className="flex-1 min-w-[180px]">
                            <label className="text-[10px] text-gray-500 uppercase mb-1 block">{field.label}</label>
                            <Input
                              className="h-8 text-xs bg-gray-900 border-gray-700"
                              placeholder={field.placeholder}
                              value={extraInputs[field.field] || ''}
                              onChange={(e) => setExtraInputs(prev => ({ ...prev, [field.field]: e.target.value }))}
                            />
                          </div>
                        ))}
                      </div>
                    )}

                    <Button
                      size="sm"
                      className="gap-1.5"
                      onClick={handleRun}
                      disabled={running || (needsDeal && !dealId)}
                    >
                      {running ? (
                        <>
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          Running...
                        </>
                      ) : (
                        <>
                          <Play className="h-3.5 w-3.5" />
                          Run Skill
                        </>
                      )}
                    </Button>
                    {needsDeal && !dealId && (
                      <p className="text-[10px] text-gray-500 mt-1.5">Select a deal above to run this skill</p>
                    )}

                    {/* Output */}
                    {result && (
                      <SkillOutput result={result} skillKey={skill.key} durationMs={durationMs} />
                    )}
                  </div>
                </>
              )}
            </div>
          </CollapsibleContent>
        </Card>
      </Collapsible>
    </motion.div>
  );
}

// ============================================================
// PAGE
// ============================================================

export default function SkillUpgradeReport() {
  const orgId = useActiveOrgId();
  const [deals, setDeals] = useState<DealOption[]>([]);
  const [selectedDealId, setSelectedDealId] = useState<string | null>(null);
  const [loadingDeals, setLoadingDeals] = useState(false);

  const selectedDeal = deals.find(d => d.id === selectedDealId) || null;
  const primaryContactId = selectedDeal?.primary_contact_id || null;

  // Fetch deals on mount
  useEffect(() => {
    let cancelled = false;
    async function fetchDeals() {
      setLoadingDeals(true);
      const { data, error } = await supabase
        .from('deals')
        .select('id, name, company, stage_id, primary_contact_id, contact_name, contact_email')
        .order('updated_at', { ascending: false })
        .limit(50);

      if (cancelled) return;
      setLoadingDeals(false);

      if (error) {
        toast.error('Failed to load deals');
        return;
      }

      const dealRows = (data || []) as { id: string; name: string; company: string; stage_id: string; primary_contact_id: string | null; contact_name: string | null; contact_email: string | null }[];

      // Resolve contact names from primary_contact_id where contact_name is null
      const needsLookup = dealRows.filter(d => !d.contact_name && d.primary_contact_id);
      let contactMap: Record<string, string> = {};
      if (needsLookup.length > 0) {
        const ids = needsLookup.map(d => d.primary_contact_id!);
        const { data: contacts } = await supabase
          .from('contacts')
          .select('id, name')
          .in('id', ids);
        if (!cancelled && contacts) {
          contactMap = Object.fromEntries(contacts.map((c: { id: string; name: string }) => [c.id, c.name]));
        }
      }

      if (cancelled) return;

      setDeals(dealRows.map(d => ({
        id: d.id,
        name: d.name,
        company: d.company,
        stage_id: d.stage_id,
        primary_contact_id: d.primary_contact_id,
        contact_name: d.contact_name || (d.primary_contact_id ? contactMap[d.primary_contact_id] : null) || d.contact_email || null,
      })));
    }

    fetchDeals();
    return () => { cancelled = true; };
  }, []);

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-950 via-gray-900 to-gray-950">
      {/* Back nav */}
      <div className="border-b border-gray-800 px-6 py-3">
        <BackToPlatform />
      </div>

      {/* Header */}
      <div className="border-b border-gray-800 px-6 py-8">
        <div className="max-w-5xl mx-auto">
          <div className="flex items-center gap-4 mb-6">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-amber-500 to-orange-600 text-white shadow-lg">
              <Layers className="h-6 w-6" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-white">Gold Standard Skill Upgrades</h1>
              <p className="text-sm text-gray-400 mt-0.5">
                5-layer intelligence model applied to top 10 sales skills
              </p>
            </div>
          </div>

          {/* Summary Stats */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <StatCard icon={Brain} value={SUMMARY.skillsUpgraded} label="Skills upgraded" subtitle={`${SUMMARY.skillsReviewed} reviewed`} />
            <StatCard icon={BookOpen} value={SUMMARY.newRefsCreated} label="New ref files" subtitle={`${SUMMARY.totalRefWords.toLocaleString()} words`} />
            <StatCard icon={Database} value={`${SUMMARY.outputsBefore} → ${SUMMARY.outputsAfter}`} label="Output fields" subtitle="+51% coverage" />
            <StatCard icon={AlertTriangle} value={SUMMARY.newCapabilities.length} label="New capabilities" subtitle="web, RAG, confidence..." />
          </div>

          {/* 5-Layer Model Legend */}
          <div className="mt-6 rounded-xl border border-gray-800 bg-gray-900/40 p-4">
            <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">5-Layer Intelligence Model</h3>
            <div className="flex flex-wrap gap-4">
              {[
                { icon: Database, label: '1. Entity', desc: 'CRM deal, contact, company' },
                { icon: Search, label: '2. Enrichment', desc: 'Web search, Apollo, AI Ark' },
                { icon: Brain, label: '3. RAG', desc: 'Transcript semantic search' },
                { icon: TrendingUp, label: '4. Signals', desc: 'Deal health, risk, competitive' },
                { icon: Target, label: '5. Strategy', desc: 'AI-synthesized recommendations' },
              ].map(layer => (
                <div key={layer.label} className="flex items-center gap-2 text-xs">
                  <layer.icon className="h-3.5 w-3.5 text-indigo-400" />
                  <span className="font-medium text-gray-300">{layer.label}</span>
                  <span className="text-gray-500">{layer.desc}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Deal Picker */}
          <div className="mt-6 rounded-xl border border-gray-800 bg-gray-900/40 p-4">
            <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Live Execution Context</h3>
            <div className="flex items-center gap-4 flex-wrap">
              <div className="flex-1 min-w-[240px]">
                <Select
                  value={selectedDealId || ''}
                  onValueChange={(val) => setSelectedDealId(val || null)}
                >
                  <SelectTrigger className="bg-gray-900 border-gray-700 text-sm">
                    <SelectValue placeholder={loadingDeals ? 'Loading deals...' : 'Select a deal to test skills against'} />
                  </SelectTrigger>
                  <SelectContent>
                    {deals.map(deal => (
                      <SelectItem key={deal.id} value={deal.id}>
                        <span className="font-medium">{deal.name}</span>
                        {deal.company && (
                          <span className="text-gray-500 ml-1.5">({deal.company})</span>
                        )}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {selectedDeal && (
                <div className="flex items-center gap-2 text-xs text-gray-400">
                  <span>Contact: {selectedDeal.contact_name || 'None'}</span>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Skill Cards */}
      <div className="max-w-5xl mx-auto px-6 py-6 space-y-3">
        {UPGRADED_SKILLS.map((skill, i) => (
          <SkillCard
            key={skill.key}
            skill={skill}
            index={i}
            dealId={selectedDealId}
            contactId={primaryContactId}
            orgId={orgId}
          />
        ))}
      </div>
    </div>
  );
}
