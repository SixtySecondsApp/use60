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
  | 'v1-simulate'    // Legacy V1 simulator (proactive-meeting-prep etc.)
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

  // ── V1 Proactive Notifications (Slack + In-App, real data) ──────────────
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
    backendType: 'v1-simulate',
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
    backendType: 'v1-simulate',
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
    backendType: 'v1-simulate',
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
    backendType: 'v1-simulate',
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
    backendType: 'v1-simulate',
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
    backendType: 'v1-simulate',
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
    backendType: 'v1-simulate',
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
    backendType: 'v1-simulate',
    stepCount: 1,
    hasApproval: false,
    status: 'active',
    defaultChannels: ['slack', 'email', 'in-app'],
    requiredIntegrations: [
      { integrationId: 'slack', name: 'Slack', reason: 'Required for notifications', connectUrl: '/settings/integrations/slack' },
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
 * Only abilities with orchestrator backend have a mapping.
 * Abilities without a mapping use localStorage-only state.
 */
export const EVENT_TYPE_TO_SEQUENCE_TYPE: Record<string, string> = {
  // Orchestrator-backed abilities (9 sequence types)
  'meeting_ended': 'meeting_ended',
  'pre_meeting_90min': 'pre_meeting_90min',
  'deal_risk_scan': 'deal_risk_scan',
  'stale_deal_revival': 'stale_deal_revival',
  'coaching_weekly': 'coaching_weekly',
  'campaign_daily_check': 'campaign_daily_check',
  'email_received': 'email_received',
  'proposal_generation': 'proposal_generation',
  'calendar_find_times': 'calendar_find_times',
  // V1 abilities and manual triggers have no mapping (localStorage-only)
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
