/**
 * Ability Registry — Types, constants, and helpers for the Agent Abilities page.
 *
 * Defines abilities across 5 sales lifecycle stages, plus display name
 * and sequence step maps shared between the V2 demo and abilities pages.
 */

import {
  Activity, Brain, Calendar, Mail, FileText, BarChart3,
  GraduationCap, Send, MessageSquare, Zap, Users, Clock,
  Bell, CheckSquare, ShieldAlert, Sparkles, TrendingUp,
  AlertTriangle, Ghost, HeartPulse, Lightbulb, GitMerge,
  Brush, BookOpen, Thermometer, RefreshCcw, Radio,
  Timer, Ratio, Link2, UserSearch,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

// =============================================================================
// Types
// =============================================================================

export type LifecycleStage =
  | 'pre-meeting'
  | 'post-meeting'
  | 'pipeline'
  | 'outreach'
  | 'coaching';

export type UseCase = 'meeting-prep' | 'post-meeting' | 'pipeline-health' | 'coaching-insights';

export interface UseCaseCategory {
  id: UseCase;
  name: string;
  description: string;
  icon: LucideIcon;
  gradient: string;
}

export const USE_CASE_CATEGORIES: UseCaseCategory[] = [
  {
    id: 'meeting-prep',
    name: 'Meeting Prep',
    description: 'Go into every call prepared and confident',
    icon: Calendar,
    gradient: 'from-blue-500 to-cyan-500',
  },
  {
    id: 'post-meeting',
    name: 'Post-Meeting Automation',
    description: 'Never drop the ball after a call',
    icon: CheckSquare,
    gradient: 'from-green-500 to-emerald-500',
  },
  {
    id: 'pipeline-health',
    name: 'Pipeline Health',
    description: 'Keep your deals moving and predictable',
    icon: TrendingUp,
    gradient: 'from-orange-500 to-amber-500',
  },
  {
    id: 'coaching-insights',
    name: 'Coaching & Insights',
    description: 'Improve your sales performance with data',
    icon: GraduationCap,
    gradient: 'from-purple-500 to-violet-500',
  },
];

export type TriggerType =
  | 'event'      // Triggered by a real-time event (meeting ended, email received)
  | 'cron'       // Triggered on a schedule
  | 'chain'      // Triggered by another orchestrator sequence
  | 'manual';    // Triggered by user action (button click)

export type BackendType =
  | 'orchestrator'   // Runs via agent-orchestrator edge function
  | 'cron-job';      // Edge function invoked by Supabase cron

export type DeliveryChannel = 'slack' | 'email' | 'in-app';

// Integration requirement for marketplace gating
export interface IntegrationRequirement {
  integrationId: string;   // e.g. 'google-workspace', 'slack', 'instantly', 'fathom'
  name: string;            // Display name e.g. 'Google Calendar'
  reason: string;          // Why it's needed e.g. 'Calendar access for meeting detection'
  connectUrl: string;      // Navigation path e.g. '/settings/integrations/google-workspace'
}

export interface AbilityDefinition {
  id: string;
  name: string;
  description: string;
  stage: LifecycleStage;
  useCase: UseCase;            // Use-case category for marketplace grouping
  icon: LucideIcon;
  gradient: string;
  eventType: string;           // Maps to EventType in orchestrator types
  triggerType: TriggerType;
  backendType: BackendType;
  stepCount: number;
  hasApproval: boolean;
  status: 'active' | 'beta' | 'planned';
  skillKey?: string;           // Links to a skill in skills/atomic/ for richer output
  defaultChannels: DeliveryChannel[];  // Default delivery channels
  requiredIntegrations?: IntegrationRequirement[];  // Integration requirements for marketplace gating
}

// =============================================================================
// Ability Registry (abilities across 5 lifecycle stages)
// =============================================================================

export const ABILITY_REGISTRY: AbilityDefinition[] = [
  // ── Pre-Meeting ──────────────────────────────────────────────────────────
  {
    id: 'pre-meeting-briefing',
    name: 'Pre-Meeting Briefing',
    description: 'Enriches attendees, pulls CRM history, researches company news, and delivers a Slack briefing 90 minutes before your meeting.',
    stage: 'pre-meeting',
    useCase: 'meeting-prep',
    icon: Brain,
    gradient: 'from-purple-500 to-pink-600',
    eventType: 'pre_meeting_90min',
    triggerType: 'cron',
    backendType: 'orchestrator',
    stepCount: 5,
    hasApproval: false,
    status: 'active',
    defaultChannels: ['slack', 'email', 'in-app'],
    requiredIntegrations: [
      { integrationId: 'slack', name: 'Slack', reason: 'Required for notifications', connectUrl: '/settings/integrations/slack' },
      { integrationId: 'google-workspace', name: 'Google Calendar', reason: 'Calendar access for meeting detection', connectUrl: '/settings/integrations/google-workspace' },
    ],
  },

  // ── Post-Meeting ─────────────────────────────────────────────────────────
  {
    id: 'post-meeting-followup',
    name: 'Post-Meeting Follow-up',
    description: 'Classifies call type, extracts action items, detects buying signals, drafts follow-up email, creates CRM tasks, and sends Slack summary.',
    stage: 'post-meeting',
    useCase: 'post-meeting',
    icon: Activity,
    gradient: 'from-blue-500 to-indigo-600',
    eventType: 'meeting_ended',
    triggerType: 'event',
    backendType: 'orchestrator',
    stepCount: 9,
    hasApproval: false,
    status: 'active',
    defaultChannels: ['slack', 'email', 'in-app'],
    requiredIntegrations: [
      { integrationId: 'slack', name: 'Slack', reason: 'Required for notifications', connectUrl: '/settings/integrations/slack' },
      { integrationId: 'fathom', name: 'Meeting Recording', reason: 'Recording access for transcription', connectUrl: '/settings/integrations' },
    ],
  },
  {
    id: 'call-type-classification',
    name: 'Call Type Classification',
    description: 'Classifies meeting recordings as sales calls (discovery, demo, close) vs internal meetings to gate downstream workflows.',
    stage: 'post-meeting',
    useCase: 'post-meeting',
    icon: MessageSquare,
    gradient: 'from-cyan-500 to-blue-500',
    eventType: 'meeting_ended',
    triggerType: 'event',
    backendType: 'orchestrator',
    stepCount: 1,
    hasApproval: false,
    status: 'active',
    defaultChannels: ['slack', 'email', 'in-app'],
    requiredIntegrations: [
      { integrationId: 'slack', name: 'Slack', reason: 'Required for notifications', connectUrl: '/settings/integrations/slack' },
      { integrationId: 'fathom', name: 'Meeting Recording', reason: 'Recording access for transcription', connectUrl: '/settings/integrations' },
    ],
  },
  {
    id: 'coaching-micro-feedback',
    name: 'Coaching Micro-Feedback',
    description: 'Analyzes talk ratio, question quality, and objection handling after each sales meeting. Generates 2-3 actionable coaching bullet points.',
    stage: 'post-meeting',
    useCase: 'coaching-insights',
    icon: GraduationCap,
    gradient: 'from-violet-500 to-purple-600',
    eventType: 'meeting_ended',
    triggerType: 'event',
    backendType: 'orchestrator',
    stepCount: 1,
    hasApproval: false,
    status: 'active',
    defaultChannels: ['slack', 'email', 'in-app'],
    requiredIntegrations: [
      { integrationId: 'slack', name: 'Slack', reason: 'Required for notifications', connectUrl: '/settings/integrations/slack' },
      { integrationId: 'fathom', name: 'Meeting Recording', reason: 'Recording access for transcription', connectUrl: '/settings/integrations' },
    ],
  },

  // ── Pipeline ─────────────────────────────────────────────────────────────
  {
    id: 'calendar-scheduling',
    name: 'Calendar Scheduling',
    description: 'Finds mutual availability, proposes time slots via Slack, and creates calendar events when confirmed.',
    stage: 'pipeline',
    useCase: 'meeting-prep',
    icon: Calendar,
    gradient: 'from-emerald-500 to-teal-600',
    eventType: 'calendar_find_times',
    triggerType: 'chain',
    backendType: 'orchestrator',
    stepCount: 3,
    hasApproval: true,
    status: 'active',
    defaultChannels: ['slack', 'email', 'in-app'],
    requiredIntegrations: [
      { integrationId: 'slack', name: 'Slack', reason: 'Required for notifications', connectUrl: '/settings/integrations/slack' },
      { integrationId: 'google-workspace', name: 'Google Calendar', reason: 'Calendar access for meeting detection', connectUrl: '/settings/integrations/google-workspace' },
    ],
  },
  {
    id: 'deal-risk-scorer',
    name: 'Deal Risk Scanner',
    description: 'Scans active deals for risk indicators, scores deal health, generates alerts for at-risk deals, and delivers daily risk briefing via Slack.',
    stage: 'pipeline',
    useCase: 'pipeline-health',
    icon: ShieldAlert,
    gradient: 'from-red-500 to-rose-600',
    eventType: 'deal_risk_scan',
    triggerType: 'cron',
    backendType: 'orchestrator',
    stepCount: 4,
    hasApproval: false,
    status: 'active',
    defaultChannels: ['slack', 'email', 'in-app'],
    requiredIntegrations: [
      { integrationId: 'slack', name: 'Slack', reason: 'Required for notifications', connectUrl: '/settings/integrations/slack' },
    ],
  },
  {
    id: 'stale-deal-revival',
    name: 'Stale Deal Revival',
    description: 'Identifies stalled deals, researches trigger events, analyzes stall reasons, and drafts re-engagement outreach.',
    stage: 'pipeline',
    useCase: 'pipeline-health',
    icon: Clock,
    gradient: 'from-amber-500 to-orange-600',
    eventType: 'stale_deal_revival',
    triggerType: 'cron',
    backendType: 'orchestrator',
    stepCount: 3,
    hasApproval: true,
    status: 'active',
    defaultChannels: ['slack', 'email', 'in-app'],
    requiredIntegrations: [
      { integrationId: 'slack', name: 'Slack', reason: 'Required for notifications', connectUrl: '/settings/integrations/slack' },
    ],
  },
  {
    id: 'detect-intents',
    name: 'Intent Detection',
    description: 'Analyzes transcripts to detect commitments, buying signals, and follow-up items that map to automated actions.',
    stage: 'pipeline',
    useCase: 'meeting-prep',
    icon: Zap,
    gradient: 'from-rose-500 to-pink-600',
    eventType: 'meeting_ended',
    triggerType: 'event',
    backendType: 'orchestrator',
    stepCount: 1,
    hasApproval: false,
    status: 'active',
    defaultChannels: ['slack', 'email', 'in-app'],
    requiredIntegrations: [
      { integrationId: 'slack', name: 'Slack', reason: 'Required for notifications', connectUrl: '/settings/integrations/slack' },
      { integrationId: 'fathom', name: 'Meeting Recording', reason: 'Recording access for transcription', connectUrl: '/settings/integrations' },
    ],
  },

  {
    id: 'overdue-deal-surfacing',
    name: 'Overdue Deal Surfacing',
    description: 'Scans pipeline for deals past their close date, ranks by value and days overdue, and delivers a daily digest with recommended actions — extend date, escalate, or close as lost.',
    stage: 'pipeline',
    useCase: 'pipeline-health',
    icon: AlertTriangle,
    gradient: 'from-orange-500 to-red-600',
    eventType: 'overdue_deal_scan',
    triggerType: 'cron',
    backendType: 'orchestrator',
    stepCount: 1,
    hasApproval: false,
    status: 'active',
    skillKey: 'deal-slippage-diagnosis',
    defaultChannels: ['slack', 'email', 'in-app'],
    requiredIntegrations: [
      { integrationId: 'slack', name: 'Slack', reason: 'Required for notifications', connectUrl: '/settings/integrations/slack' },
    ],
  },
  {
    id: 'ghost-deal-alerting',
    name: 'Ghost Deal Alert',
    description: 'Monitors deals with high ghost probability (70%+) — no replies, missed meetings, or fading engagement. Surfaces ghosted deals with re-engagement strategies before they go cold.',
    stage: 'pipeline',
    useCase: 'pipeline-health',
    icon: Ghost,
    gradient: 'from-violet-500 to-purple-600',
    eventType: 'ghost_deal_scan',
    triggerType: 'cron',
    backendType: 'orchestrator',
    stepCount: 1,
    hasApproval: false,
    status: 'active',
    skillKey: 'deal-reengagement-intervention',
    defaultChannels: ['slack', 'email', 'in-app'],
    requiredIntegrations: [
      { integrationId: 'slack', name: 'Slack', reason: 'Required for notifications', connectUrl: '/settings/integrations/slack' },
    ],
  },

  // ── Outreach ─────────────────────────────────────────────────────────────
  {
    id: 'email-send-as-rep',
    name: 'Email Send-as-Rep',
    description: 'Drafts and sends emails from the rep\'s real Gmail. Appears in Sent folder, thread-aware, with HITL approval in Slack.',
    stage: 'outreach',
    useCase: 'post-meeting',
    icon: Send,
    gradient: 'from-orange-500 to-red-500',
    eventType: 'email_received',
    triggerType: 'event',
    backendType: 'orchestrator',
    stepCount: 6,
    hasApproval: true,
    status: 'active',
    defaultChannels: ['slack', 'email', 'in-app'],
    requiredIntegrations: [
      { integrationId: 'slack', name: 'Slack', reason: 'Required for notifications', connectUrl: '/settings/integrations/slack' },
      { integrationId: 'google-workspace', name: 'Gmail', reason: 'Email access for sending messages', connectUrl: '/settings/integrations/google-workspace' },
    ],
  },
  {
    id: 'proposal-generation',
    name: 'Proposal Generation',
    description: 'Auto-generates proposals from deal context and meeting notes. Presents for review via Slack before sending.',
    stage: 'outreach',
    useCase: 'pipeline-health',
    icon: FileText,
    gradient: 'from-cyan-500 to-blue-600',
    eventType: 'proposal_generation',
    triggerType: 'chain',
    backendType: 'orchestrator',
    stepCount: 4,
    hasApproval: true,
    status: 'active',
    defaultChannels: ['slack', 'email', 'in-app'],
    requiredIntegrations: [
      { integrationId: 'slack', name: 'Slack', reason: 'Required for notifications', connectUrl: '/settings/integrations/slack' },
    ],
  },
  {
    id: 'campaign-monitoring',
    name: 'Campaign Monitoring',
    description: 'Pulls Instantly campaign metrics, classifies replies by intent, and generates optimization recommendations.',
    stage: 'outreach',
    useCase: 'coaching-insights',
    icon: BarChart3,
    gradient: 'from-teal-500 to-emerald-600',
    eventType: 'campaign_daily_check',
    triggerType: 'cron',
    backendType: 'orchestrator',
    stepCount: 4,
    hasApproval: false,
    status: 'active',
    defaultChannels: ['slack', 'email', 'in-app'],
    requiredIntegrations: [
      { integrationId: 'slack', name: 'Slack', reason: 'Required for notifications', connectUrl: '/settings/integrations/slack' },
      { integrationId: 'instantly', name: 'Instantly', reason: 'Campaign access for metrics', connectUrl: '/settings/integrations/instantly' },
    ],
  },
  {
    id: 'email-classification',
    name: 'Email Classification',
    description: 'Classifies inbound emails by intent (positive, negative, OOO, unsubscribe) and routes to appropriate workflows.',
    stage: 'outreach',
    useCase: 'pipeline-health',
    icon: Mail,
    gradient: 'from-indigo-500 to-violet-600',
    eventType: 'email_received',
    triggerType: 'event',
    backendType: 'orchestrator',
    stepCount: 2,
    hasApproval: false,
    status: 'active',
    defaultChannels: ['slack', 'email', 'in-app'],
    requiredIntegrations: [
      { integrationId: 'slack', name: 'Slack', reason: 'Required for notifications', connectUrl: '/settings/integrations/slack' },
      { integrationId: 'google-workspace', name: 'Gmail', reason: 'Email access for incoming messages', connectUrl: '/settings/integrations/google-workspace' },
    ],
  },

  // ── Coaching ─────────────────────────────────────────────────────────────
  {
    id: 'coaching-weekly-digest',
    name: 'Weekly Coaching Digest',
    description: 'Aggregates weekly metrics, correlates with win/loss outcomes, and delivers a coaching digest with improving areas and winning patterns.',
    stage: 'coaching',
    useCase: 'coaching-insights',
    icon: GraduationCap,
    gradient: 'from-violet-500 to-indigo-600',
    eventType: 'coaching_weekly',
    triggerType: 'cron',
    backendType: 'orchestrator',
    stepCount: 4,
    hasApproval: false,
    status: 'active',
    defaultChannels: ['slack', 'email', 'in-app'],
    requiredIntegrations: [
      { integrationId: 'slack', name: 'Slack', reason: 'Required for notifications', connectUrl: '/settings/integrations/slack' },
      { integrationId: 'fathom', name: 'Meeting Recording', reason: 'Recording access for transcription', connectUrl: '/settings/integrations' },
    ],
  },
  {
    id: 'coaching-analysis',
    name: 'Coaching Analysis',
    description: 'Deep analysis of talk ratios, question quality, objection handling, and discovery depth with specific evidence-based recommendations.',
    stage: 'coaching',
    useCase: 'coaching-insights',
    icon: Users,
    gradient: 'from-pink-500 to-rose-600',
    eventType: 'meeting_ended',
    triggerType: 'event',
    backendType: 'orchestrator',
    stepCount: 3,
    hasApproval: false,
    status: 'active',
    defaultChannels: ['slack', 'email', 'in-app'],
    requiredIntegrations: [
      { integrationId: 'slack', name: 'Slack', reason: 'Required for notifications', connectUrl: '/settings/integrations/slack' },
      { integrationId: 'fathom', name: 'Meeting Recording', reason: 'Recording access for transcription', connectUrl: '/settings/integrations' },
    ],
  },

  // ── Proactive Notifications (migrated from V1 to orchestrator, SBI-008) ─
  {
    id: 'morning-brief',
    name: 'Daily Brief',
    description: 'Time-aware daily briefing: schedule, priority deals, contacts needing attention, and tasks. Adapts to morning, afternoon, or evening with real CRM data.',
    stage: 'pre-meeting',
    useCase: 'meeting-prep',
    icon: Bell,
    gradient: 'from-amber-500 to-yellow-500',
    eventType: 'morning_brief',
    triggerType: 'cron',
    backendType: 'orchestrator',
    stepCount: 1,
    hasApproval: false,
    status: 'active',
    skillKey: 'daily-brief-planner',
    defaultChannels: ['slack', 'email', 'in-app'],
    requiredIntegrations: [
      { integrationId: 'slack', name: 'Slack', reason: 'Required for notifications', connectUrl: '/settings/integrations/slack' },
    ],
  },
  {
    id: 'sales-assistant-digest',
    name: 'Daily Focus Planner',
    description: 'Prioritized daily action plan with CVHS-scored deals, contacts needing attention, concrete next best actions, and a ready-to-create task pack.',
    stage: 'pipeline',
    useCase: 'pipeline-health',
    icon: Activity,
    gradient: 'from-sky-500 to-blue-600',
    eventType: 'sales_assistant_digest',
    triggerType: 'cron',
    backendType: 'orchestrator',
    stepCount: 1,
    hasApproval: false,
    status: 'active',
    skillKey: 'daily-focus-planner',
    defaultChannels: ['slack', 'email', 'in-app'],
    requiredIntegrations: [
      { integrationId: 'slack', name: 'Slack', reason: 'Required for notifications', connectUrl: '/settings/integrations/slack' },
    ],
  },
  {
    id: 'pre-meeting-nudge',
    name: 'Pre-Meeting Nudge',
    description: 'AI-enriched talking points, prospect intel, company context, risk factors, and suggested opener delivered before your next meeting.',
    stage: 'pre-meeting',
    useCase: 'meeting-prep',
    icon: MessageSquare,
    gradient: 'from-indigo-400 to-blue-500',
    eventType: 'pre_meeting_nudge',
    triggerType: 'cron',
    backendType: 'orchestrator',
    stepCount: 1,
    hasApproval: false,
    status: 'active',
    skillKey: 'meeting-prep-brief',
    defaultChannels: ['slack', 'email', 'in-app'],
    requiredIntegrations: [
      { integrationId: 'slack', name: 'Slack', reason: 'Required for notifications', connectUrl: '/settings/integrations/slack' },
    ],
  },
  {
    id: 'post-call-summary',
    name: 'Post-Call Summary',
    description: 'Meeting summary with detected action items, classification, follow-up email draft, and internal Slack update from your most recent call.',
    stage: 'post-meeting',
    useCase: 'post-meeting',
    icon: CheckSquare,
    gradient: 'from-emerald-500 to-green-600',
    eventType: 'post_call_summary',
    triggerType: 'event',
    backendType: 'orchestrator',
    stepCount: 1,
    hasApproval: false,
    status: 'active',
    skillKey: 'post-meeting-followup-pack-builder',
    defaultChannels: ['slack', 'email', 'in-app'],
    requiredIntegrations: [
      { integrationId: 'slack', name: 'Slack', reason: 'Required for notifications', connectUrl: '/settings/integrations/slack' },
    ],
  },
  {
    id: 'hitl-followup-email',
    name: 'HITL Follow-up Email',
    description: 'Drafts a contextual follow-up email and sends Slack buttons for approve/edit/reject. Full human-in-the-loop flow with real thread context.',
    stage: 'outreach',
    useCase: 'post-meeting',
    icon: Mail,
    gradient: 'from-rose-500 to-red-500',
    eventType: 'hitl_followup_email',
    triggerType: 'event',
    backendType: 'orchestrator',
    stepCount: 1,
    hasApproval: true,
    status: 'active',
    skillKey: 'followup-reply-drafter',
    defaultChannels: ['slack', 'email', 'in-app'],
    requiredIntegrations: [
      { integrationId: 'slack', name: 'Slack', reason: 'Required for notifications', connectUrl: '/settings/integrations/slack' },
    ],
  },
  {
    id: 'stale-deal-alert',
    name: 'Stale Deal Alert',
    description: 'Identifies deals with 14+ days of inactivity, analyzes stall reason, relationship health, and generates AI-powered re-engagement message with next steps.',
    stage: 'pipeline',
    useCase: 'pipeline-health',
    icon: ShieldAlert,
    gradient: 'from-red-500 to-orange-500',
    eventType: 'stale_deal_alert',
    triggerType: 'cron',
    backendType: 'orchestrator',
    stepCount: 1,
    hasApproval: false,
    status: 'active',
    skillKey: 'deal-slippage-diagnosis',
    defaultChannels: ['slack', 'email', 'in-app'],
    requiredIntegrations: [
      { integrationId: 'slack', name: 'Slack', reason: 'Required for notifications', connectUrl: '/settings/integrations/slack' },
    ],
  },
  {
    id: 'email-reply-alert',
    name: 'Email Reply Received',
    description: 'Detects high-priority inbound replies, matches to CRM contacts and deals, analyzes sentiment, and suggests the best next action.',
    stage: 'outreach',
    useCase: 'post-meeting',
    icon: Mail,
    gradient: 'from-fuchsia-500 to-purple-600',
    eventType: 'email_reply_alert',
    triggerType: 'event',
    backendType: 'orchestrator',
    stepCount: 1,
    hasApproval: false,
    status: 'active',
    skillKey: 'followup-triage',
    defaultChannels: ['slack', 'email', 'in-app'],
    requiredIntegrations: [
      { integrationId: 'slack', name: 'Slack', reason: 'Required for notifications', connectUrl: '/settings/integrations/slack' },
    ],
  },
  {
    id: 'ai-smart-suggestion',
    name: '60 Smart Suggestion',
    description: 'Context-aware AI insight based on 15 real data points: calendar density, pipeline health, task patterns, relationship scores, and recent activity.',
    stage: 'coaching',
    useCase: 'coaching-insights',
    icon: Sparkles,
    gradient: 'from-yellow-400 to-amber-500',
    eventType: 'ai_smart_suggestion',
    triggerType: 'cron',
    backendType: 'orchestrator',
    stepCount: 1,
    hasApproval: false,
    status: 'active',
    defaultChannels: ['slack', 'email', 'in-app'],
    requiredIntegrations: [
      { integrationId: 'slack', name: 'Slack', reason: 'Required for notifications', connectUrl: '/settings/integrations/slack' },
    ],
  },

  // ── Proactive Sales Teammate (PST) ──────────────────────────────────────
  {
    id: 'deal-heartbeat',
    name: 'Deal Heartbeat',
    description: 'Always-on deal scanner that runs nightly, on stage changes, and after meetings. Detects 8 observation categories: stale deals, missing next steps, follow-up gaps, single-threaded deals, stage regression, and more.',
    stage: 'pipeline',
    useCase: 'pipeline-health',
    icon: HeartPulse,
    gradient: 'from-red-500 to-rose-600',
    eventType: 'deal_heartbeat_scan',
    triggerType: 'cron',
    backendType: 'cron-job',
    stepCount: 3,
    hasApproval: false,
    status: 'active',
    defaultChannels: ['slack', 'in-app'],
    requiredIntegrations: [
      { integrationId: 'slack', name: 'Slack', reason: 'Delivers overnight findings in morning brief', connectUrl: '/settings/integrations/slack' },
    ],
  },
  {
    id: 'deal-improvement-suggestions',
    name: 'Deal Improvement Suggestions',
    description: 'Proactive coaching for every deal. Generates tagged suggestions — MULTI_THREAD, URGENCY, PROOF, COMPETITOR, EXECUTIVE_SPONSOR, NEXT_STEP — based on deal context, contacts, and meeting history.',
    stage: 'pipeline',
    useCase: 'pipeline-health',
    icon: Lightbulb,
    gradient: 'from-cyan-500 to-teal-600',
    eventType: 'deal_heartbeat_scan',
    triggerType: 'cron',
    backendType: 'cron-job',
    stepCount: 2,
    hasApproval: false,
    status: 'active',
    skillKey: 'deal-next-best-actions',
    defaultChannels: ['slack', 'in-app'],
    requiredIntegrations: [
      { integrationId: 'slack', name: 'Slack', reason: 'Delivers suggestions in morning brief', connectUrl: '/settings/integrations/slack' },
    ],
  },
  {
    id: 'cross-deal-conflict-detection',
    name: 'Cross-Deal Conflict Detection',
    description: 'Catches conflicts before they become problems. Detects contacts appearing in 2+ active deals and companies with deals from different reps. HIGH severity for same-week overlap.',
    stage: 'pipeline',
    useCase: 'pipeline-health',
    icon: GitMerge,
    gradient: 'from-pink-500 to-fuchsia-600',
    eventType: 'deal_heartbeat_scan',
    triggerType: 'cron',
    backendType: 'cron-job',
    stepCount: 2,
    hasApproval: false,
    status: 'active',
    defaultChannels: ['slack', 'in-app'],
    requiredIntegrations: [
      { integrationId: 'slack', name: 'Slack', reason: 'Surfaces conflicts in morning brief', connectUrl: '/settings/integrations/slack' },
    ],
  },
  {
    id: 'pipeline-hygiene-digest',
    name: 'Pipeline Hygiene Digest',
    description: 'Weekly Monday cleanup with 5 hygiene categories: overdue tasks, stuck-in-stage (30+ days), no activity (14+ days), past close date, and ghost risk. One-tap actions: Snooze, Re-engage, Draft Follow-up, Close as Lost.',
    stage: 'pipeline',
    useCase: 'pipeline-health',
    icon: Brush,
    gradient: 'from-teal-500 to-emerald-600',
    eventType: 'pipeline_hygiene_digest',
    triggerType: 'cron',
    backendType: 'cron-job',
    stepCount: 2,
    hasApproval: true,
    status: 'active',
    defaultChannels: ['slack', 'in-app'],
    requiredIntegrations: [
      { integrationId: 'slack', name: 'Slack', reason: 'Delivers weekly digest with action buttons', connectUrl: '/settings/integrations/slack' },
    ],
  },
  {
    id: 'sales-learning-loop',
    name: 'Sales Learning Loop',
    description: 'Learns your editing preferences from every draft you touch. After 5+ consistent edits, stores preferences like shorter_emails, casual_greeting, removes_ps_line. Feeds into future draft generation for increasingly accurate output.',
    stage: 'coaching',
    useCase: 'coaching-insights',
    icon: BookOpen,
    gradient: 'from-violet-500 to-purple-600',
    eventType: 'learning_preference_extract',
    triggerType: 'event',
    backendType: 'cron-job',
    stepCount: 2,
    hasApproval: false,
    status: 'active',
    defaultChannels: ['in-app'],
    requiredIntegrations: [],
  },

  // ── Missing Backend Capabilities (audit gap fill) ───────────────────────
  {
    id: 'deal-temperature-alert',
    name: 'Deal Temperature Alerts',
    description: 'Real-time alerts when deal temperature crosses thresholds — heating up (60+) or cooling down (30-). Includes 48h cooldown to prevent alert fatigue and contextual signal summaries.',
    stage: 'pipeline',
    useCase: 'pipeline-health',
    icon: Thermometer,
    gradient: 'from-orange-500 to-red-600',
    eventType: 'deal_temperature_alert',
    triggerType: 'event',
    backendType: 'orchestrator',
    stepCount: 2,
    hasApproval: false,
    status: 'active',
    defaultChannels: ['slack', 'in-app'],
    requiredIntegrations: [
      { integrationId: 'slack', name: 'Slack', reason: 'Delivers temperature alerts', connectUrl: '/settings/integrations/slack' },
    ],
  },
  {
    id: 'reengagement-trigger',
    name: 'Re-engagement Signal Pipeline',
    description: 'Scans for re-engagement signals (job changes, funding, news mentions), scores relevance, drafts outreach, and presents via Slack HITL approval before sending.',
    stage: 'outreach',
    useCase: 'pipeline-health',
    icon: RefreshCcw,
    gradient: 'from-emerald-500 to-green-600',
    eventType: 'reengagement_trigger',
    triggerType: 'cron',
    backendType: 'orchestrator',
    stepCount: 4,
    hasApproval: true,
    status: 'active',
    defaultChannels: ['slack', 'email', 'in-app'],
    requiredIntegrations: [
      { integrationId: 'slack', name: 'Slack', reason: 'HITL approval for re-engagement', connectUrl: '/settings/integrations/slack' },
    ],
  },
  {
    id: 'email-signal-alert',
    name: 'Email Signal Alerts',
    description: 'Detects 12 signal types from inbound emails — meeting requests, pricing questions, buying signals, objections, competitor mentions, introductions, silence, fast replies, OOO, and more. Rate-limited to 5/hour with digest mode.',
    stage: 'outreach',
    useCase: 'pipeline-health',
    icon: Radio,
    gradient: 'from-blue-500 to-indigo-600',
    eventType: 'email_signal_alert',
    triggerType: 'event',
    backendType: 'orchestrator',
    stepCount: 2,
    hasApproval: false,
    status: 'active',
    defaultChannels: ['slack', 'in-app'],
    requiredIntegrations: [
      { integrationId: 'slack', name: 'Slack', reason: 'Delivers signal alerts', connectUrl: '/settings/integrations/slack' },
      { integrationId: 'google-workspace', name: 'Gmail', reason: 'Email access for signal detection', connectUrl: '/settings/integrations/google-workspace' },
    ],
  },
  {
    id: 'reply-gap-detection',
    name: 'Reply Gap Detection',
    description: 'Detects missing or delayed reply patterns in email threads. Surfaces threads where prospects are waiting for your response, ranked by deal value and wait time.',
    stage: 'outreach',
    useCase: 'coaching-insights',
    icon: Timer,
    gradient: 'from-amber-500 to-orange-600',
    eventType: 'reply_gap_detection',
    triggerType: 'cron',
    backendType: 'cron-job',
    stepCount: 1,
    hasApproval: false,
    status: 'active',
    defaultChannels: ['slack', 'in-app'],
    requiredIntegrations: [
      { integrationId: 'google-workspace', name: 'Gmail', reason: 'Email access for reply analysis', connectUrl: '/settings/integrations/google-workspace' },
    ],
  },
  {
    id: 'email-ratio-tracking',
    name: 'Email Ratio Tracking',
    description: 'Calculates daily sent/received email ratios per rep. Spots trends in responsiveness and engagement levels. Feeds into coaching insights.',
    stage: 'coaching',
    useCase: 'coaching-insights',
    icon: Ratio,
    gradient: 'from-sky-500 to-cyan-600',
    eventType: 'sent_received_ratio',
    triggerType: 'cron',
    backendType: 'cron-job',
    stepCount: 1,
    hasApproval: false,
    status: 'active',
    defaultChannels: ['in-app'],
    requiredIntegrations: [
      { integrationId: 'google-workspace', name: 'Gmail', reason: 'Email access for ratio calculation', connectUrl: '/settings/integrations/google-workspace' },
    ],
  },
  {
    id: 'document-linking',
    name: 'Document Linking',
    description: 'Automatically links documents (Google Drive, Slack files) to deals, contacts, and meetings. Builds a knowledge graph of shared materials per deal.',
    stage: 'pipeline',
    useCase: 'pipeline-health',
    icon: Link2,
    gradient: 'from-slate-500 to-gray-600',
    eventType: 'document_linking',
    triggerType: 'cron',
    backendType: 'cron-job',
    stepCount: 1,
    hasApproval: false,
    status: 'active',
    defaultChannels: ['in-app'],
    requiredIntegrations: [
      { integrationId: 'google-workspace', name: 'Google Drive', reason: 'Document access for linking', connectUrl: '/settings/integrations/google-workspace' },
    ],
  },
  {
    id: 'attendee-enrichment',
    name: 'Attendee Enrichment',
    description: 'Enriches meeting attendee data — names, roles, company affiliations, LinkedIn profiles — from calendar events. Runs every 15 minutes for new meetings.',
    stage: 'pre-meeting',
    useCase: 'meeting-prep',
    icon: UserSearch,
    gradient: 'from-indigo-500 to-violet-600',
    eventType: 'attendee_enrichment',
    triggerType: 'cron',
    backendType: 'cron-job',
    stepCount: 1,
    hasApproval: false,
    status: 'active',
    defaultChannels: ['in-app'],
    requiredIntegrations: [
      { integrationId: 'google-workspace', name: 'Google Calendar', reason: 'Calendar access for attendee data', connectUrl: '/settings/integrations/google-workspace' },
    ],
  },
];

// =============================================================================
// Skill Display Names (shared with V2 demo and Live mode)
// =============================================================================

export const SKILL_DISPLAY_NAMES: Record<string, string> = {
  // meeting_ended
  'classify-call-type': 'Classify Call Type',
  'extract-action-items': 'Extract Action Items',
  'detect-intents': 'Detect Intents & Buying Signals',
  'suggest-next-actions': 'Generate Next Best Actions',
  'draft-followup-email': 'Draft Follow-up Email',
  'update-crm-from-meeting': 'Update CRM Records',
  'create-tasks-from-actions': 'Create CRM Tasks',
  'notify-slack-summary': 'Send Slack Summary',
  'coaching-micro-feedback': 'Coaching Micro-Feedback',
  // pre_meeting_90min
  'enrich-attendees': 'Enrich Attendees',
  'pull-crm-history': 'Pull CRM History',
  'check-previous-action-items': 'Check Previous Action Items',
  'research-company-news': 'Research Company News',
  'generate-briefing': 'Generate Briefing',
  'deliver-slack-briefing': 'Deliver Slack Briefing',
  // email_received
  'classify-email-intent': 'Classify Email Intent',
  'match-to-crm-contact': 'Match to CRM Contact',
  // proposal_generation
  'select-proposal-template': 'Select Proposal Template',
  'populate-proposal': 'Populate Proposal',
  'generate-custom-sections': 'Generate Custom Sections',
  'present-for-review': 'Present for Review',
  // calendar_find_times
  'parse-scheduling-request': 'Parse Scheduling Request',
  'find-available-slots': 'Find Available Slots',
  'present-time-options': 'Present Time Options',
  // stale_deal_revival
  'research-trigger-events': 'Research Trigger Events',
  'analyse-stall-reason': 'Analyse Stall Reason',
  'draft-reengagement': 'Draft Re-engagement',
  // campaign_daily_check
  'pull-campaign-metrics': 'Pull Campaign Metrics',
  'classify-replies': 'Classify Replies',
  'generate-campaign-report': 'Generate Campaign Report',
  'deliver-campaign-slack': 'Deliver Campaign Slack',
  // coaching_weekly
  'aggregate-weekly-metrics': 'Aggregate Weekly Metrics',
  'correlate-win-loss': 'Correlate Win/Loss',
  'generate-coaching-digest': 'Generate Coaching Digest',
  'deliver-coaching-slack': 'Deliver Coaching Slack',
  // deal_risk_scan
  'scan-active-deals': 'Scan Active Deals',
  'score-deal-risks': 'Score Deal Risks',
  'generate-risk-alerts': 'Generate Risk Alerts',
  'deliver-risk-slack': 'Deliver Risk Slack',
  // deal_heartbeat_scan (PST)
  'scan-deal-observations': 'Scan Deal Observations',
  'generate-improvement-suggestions': 'Generate Improvement Suggestions',
  'detect-cross-deal-conflicts': 'Detect Cross-Deal Conflicts',
  'deliver-morning-brief': 'Deliver to Morning Brief',
  // pipeline_hygiene_digest (PST)
  'scan-stale-pipeline': 'Scan Stale Pipeline',
  'deliver-hygiene-digest': 'Deliver Hygiene Digest',
  // learning_preference_extract (PST)
  'extract-edit-preferences': 'Extract Editing Preferences',
  'update-draft-prompts': 'Update Draft Generation Prompts',
};

/** Step order per event type — mirrors EVENT_SEQUENCES in eventSequences.ts */
export const SEQUENCE_STEPS: Record<string, string[]> = {
  meeting_ended: [
    'classify-call-type', 'extract-action-items', 'detect-intents',
    'suggest-next-actions', 'draft-followup-email', 'update-crm-from-meeting',
    'create-tasks-from-actions', 'notify-slack-summary', 'coaching-micro-feedback',
  ],
  pre_meeting_90min: [
    'enrich-attendees', 'pull-crm-history',
    'research-company-news', 'generate-briefing', 'deliver-slack-briefing',
  ],
  email_received: [
    'classify-email-intent', 'match-to-crm-contact',
  ],
  proposal_generation: [
    'select-proposal-template', 'populate-proposal',
    'generate-custom-sections', 'present-for-review',
  ],
  calendar_find_times: [
    'parse-scheduling-request', 'find-available-slots', 'present-time-options',
  ],
  stale_deal_revival: [
    'research-trigger-events', 'analyse-stall-reason', 'draft-reengagement',
  ],
  campaign_daily_check: [
    'pull-campaign-metrics', 'classify-replies',
    'generate-campaign-report', 'deliver-campaign-slack',
  ],
  coaching_weekly: [
    'aggregate-weekly-metrics', 'correlate-win-loss',
    'generate-coaching-digest', 'deliver-coaching-slack',
  ],
  deal_risk_scan: [
    'scan-active-deals', 'score-deal-risks',
    'generate-risk-alerts', 'deliver-risk-slack',
  ],
  deal_heartbeat_scan: [
    'scan-deal-observations', 'generate-improvement-suggestions',
    'detect-cross-deal-conflicts', 'deliver-morning-brief',
  ],
  pipeline_hygiene_digest: [
    'scan-stale-pipeline', 'deliver-hygiene-digest',
  ],
  learning_preference_extract: [
    'extract-edit-preferences', 'update-draft-prompts',
  ],
};

// =============================================================================
// Lifecycle Stage Metadata
// =============================================================================

export const LIFECYCLE_STAGES: Array<{
  id: LifecycleStage;
  label: string;
  description: string;
}> = [
  { id: 'pre-meeting', label: 'Pre-Meeting', description: 'Preparation before calls' },
  { id: 'post-meeting', label: 'Post-Meeting', description: 'Follow-up after calls' },
  { id: 'pipeline', label: 'Pipeline', description: 'Deal management & scheduling' },
  { id: 'outreach', label: 'Outreach', description: 'Email, proposals & campaigns' },
  { id: 'coaching', label: 'Coaching', description: 'Performance analysis & growth' },
];

// =============================================================================
// Event Type to Sequence Type Mapping
// =============================================================================

/**
 * Maps ability eventType to orchestrator sequence_type for backend preferences.
 * All orchestrator abilities must have a mapping here.
 */
export const EVENT_TYPE_TO_SEQUENCE_TYPE: Record<string, string> = {
  // Orchestrator-backed abilities (9 original sequence types)
  'meeting_ended': 'meeting_ended',
  'pre_meeting_90min': 'pre_meeting_90min',
  'deal_risk_scan': 'deal_risk_scan',
  'stale_deal_revival': 'stale_deal_revival',
  'coaching_weekly': 'coaching_weekly',
  'campaign_daily_check': 'campaign_daily_check',
  'email_received': 'email_received',
  'proposal_generation': 'proposal_generation',
  'calendar_find_times': 'calendar_find_times',
  // Proactive Sales Teammate (PST)
  'deal_heartbeat_scan': 'deal_heartbeat_scan',
  'pipeline_hygiene_digest': 'pipeline_hygiene_digest',
  'learning_preference_extract': 'learning_preference_extract',
  // Missing backend capabilities (audit gap fill)
  'deal_temperature_alert': 'deal_temperature_alert',
  'reengagement_trigger': 'reengagement_trigger',
  'email_signal_alert': 'email_signal_alert',
  'reply_gap_detection': 'reply_gap_detection',
  'sent_received_ratio': 'sent_received_ratio',
  'document_linking': 'document_linking',
  'attendee_enrichment': 'attendee_enrichment',
  // Migrated from V1-simulate (SBI-008)
  // NOTE: These need CHECK constraint extension in SBI-009
  'overdue_deal_scan': 'overdue_deal_scan',
  'ghost_deal_scan': 'ghost_deal_scan',
  'morning_brief': 'morning_brief',
  'sales_assistant_digest': 'sales_assistant_digest',
  'pre_meeting_nudge': 'pre_meeting_nudge',
  'post_call_summary': 'post_call_summary',
  'hitl_followup_email': 'hitl_followup_email',
  'stale_deal_alert': 'stale_deal_alert',
  'email_reply_alert': 'email_reply_alert',
  'ai_smart_suggestion': 'ai_smart_suggestion',
};

// =============================================================================
// Helper Functions
// =============================================================================

export function getAbilitiesByStage(stage: LifecycleStage): AbilityDefinition[] {
  return ABILITY_REGISTRY.filter(a => a.stage === stage);
}

export function getAbilitiesByUseCase(useCase: UseCase): AbilityDefinition[] {
  return ABILITY_REGISTRY.filter(a => a.useCase === useCase);
}

export function getAbilityById(id: string): AbilityDefinition | undefined {
  return ABILITY_REGISTRY.find(a => a.id === id);
}

export function getAbilityCountByStage(): Record<LifecycleStage, number> {
  const counts: Record<string, number> = {};
  for (const stage of LIFECYCLE_STAGES) {
    counts[stage.id] = ABILITY_REGISTRY.filter(a => a.stage === stage.id).length;
  }
  return counts as Record<LifecycleStage, number>;
}

/**
 * Get the orchestrator sequence_type for an ability's eventType.
 * Returns undefined if the ability is not orchestrator-backed.
 */
export function getSequenceTypeForEventType(eventType: string): string | undefined {
  return EVENT_TYPE_TO_SEQUENCE_TYPE[eventType];
}

/**
 * Determines what entity type an ability requires for testing.
 * Returns 'meeting' for meeting-triggered abilities, 'deal' for deal-triggered, null otherwise.
 */
export function getRequiredEntityType(eventType: string): 'meeting' | 'deal' | null {
  const meetingTypes = new Set(['pre_meeting_90min', 'meeting_ended']);
  const dealTypes = new Set(['deal_risk_scan', 'stale_deal_revival', 'proposal_generation', 'overdue_deal_scan', 'ghost_deal_scan']);
  if (meetingTypes.has(eventType)) return 'meeting';
  if (dealTypes.has(eventType)) return 'deal';
  return null;
}
