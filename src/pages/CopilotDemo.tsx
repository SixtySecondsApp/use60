/**
 * Copilot Demo Page
 * Showcases all copilot response components with realistic mock data
 * for reviewing the frontend experience in a single scrollable view.
 *
 * Route: /copilot-demo (dev only)
 */

import React, { useState } from 'react';
import { ChevronDown, ChevronUp, Sparkles, Eye } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';
import { CopilotResponse } from '@/components/copilot/CopilotResponse';
import { CopilotEmpty } from '@/components/copilot/CopilotEmpty';
import { ChatMessage } from '@/components/copilot/ChatMessage';
import type { CopilotResponse as CopilotResponseType, CopilotMessage } from '@/components/copilot/types';
import { toast } from 'sonner';

// =============================================================================
// Mock Data Generators
// =============================================================================

function makeDailyBrief(): CopilotResponseType {
  return {
    type: 'daily_brief',
    summary: "You have 4 meetings today, 2 deals need attention, and 3 high-priority tasks are due.",
    data: {
      sequenceKey: 'seq-catch-me-up',
      isSimulation: false,
      greeting: "Good morning! Here's your day ahead.",
      timeOfDay: 'morning',
      schedule: [
        { id: 'm1', title: 'Discovery Call - Acme Corp', startTime: new Date(Date.now() + 3600000).toISOString(), endTime: new Date(Date.now() + 5400000).toISOString(), attendees: ['Sarah Chen', 'Mike Johnson'], linkedDealName: 'Acme Enterprise License', meetingUrl: 'https://meet.google.com/abc' },
        { id: 'm2', title: 'Pipeline Review', startTime: new Date(Date.now() + 7200000).toISOString(), endTime: new Date(Date.now() + 9000000).toISOString(), attendees: ['Team'] },
        { id: 'm3', title: 'Demo - TechStart Inc', startTime: new Date(Date.now() + 14400000).toISOString(), endTime: new Date(Date.now() + 16200000).toISOString(), attendees: ['Lisa Park', 'David Kim'], linkedDealName: 'TechStart POC' },
        { id: 'm4', title: '1:1 with VP Sales', startTime: new Date(Date.now() + 21600000).toISOString(), attendees: ['Rachel Green'] },
      ],
      priorityDeals: [
        { id: 'd1', name: 'Acme Enterprise License', value: 125000, stage: 'Negotiation', healthStatus: 'at_risk', daysStale: 12, company: 'Acme Corp', contactName: 'Sarah Chen', contactEmail: 'sarah@acme.com' },
        { id: 'd2', name: 'Global Logistics Platform', value: 85000, stage: 'Proposal', healthStatus: 'stale', daysStale: 21, company: 'Global Logistics', contactName: 'James Wright' },
      ],
      contactsNeedingAttention: [
        { id: 'c1', name: 'Sarah Chen', company: 'Acme Corp', daysSinceContact: 12, healthStatus: 'at_risk', riskLevel: 'high', reason: 'Deal in negotiation with no recent touchpoint' },
        { id: 'c2', name: 'Marcus Lee', company: 'DataFlow Inc', daysSinceContact: 30, healthStatus: 'ghost', riskLevel: 'high', reason: 'Has gone dark after receiving proposal' },
        { id: 'c3', name: 'Emily Torres', company: 'CloudBase', daysSinceContact: 8, healthStatus: 'at_risk', riskLevel: 'medium', reason: 'Needs follow-up on pricing questions' },
      ],
      tasks: [
        { id: 't1', title: 'Send revised proposal to Acme Corp', dueDate: new Date().toISOString(), priority: 'high' },
        { id: 't2', title: 'Prepare demo environment for TechStart', dueDate: new Date().toISOString(), priority: 'high' },
        { id: 't3', title: 'Follow up with Marcus Lee re: DataFlow proposal', dueDate: new Date(Date.now() + 86400000).toISOString(), priority: 'high' },
        { id: 't4', title: 'Update CRM notes from last week meetings', dueDate: new Date(Date.now() + 172800000).toISOString(), priority: 'medium' },
      ],
      summary: "You have 4 meetings today, 2 deals need attention, and 3 high-priority tasks are due.",
    },
    actions: [],
  };
}

function makePipeline(): CopilotResponseType {
  return {
    type: 'pipeline',
    summary: "Your pipeline has $1.2M in active deals. 3 deals are critical and need immediate attention.",
    data: {
      criticalDeals: [
        { id: 'd1', name: 'Acme Enterprise License', value: 125000, stage: 'Negotiation', probability: 60, healthScore: 32, urgency: 'critical' as const, reason: 'No contact in 12 days. Champion went silent after pricing discussion. Close date is in 5 days.', closeDate: new Date(Date.now() + 432000000).toISOString(), daysUntilClose: 5 },
        { id: 'd2', name: 'Global Logistics Platform', value: 85000, stage: 'Proposal', probability: 40, healthScore: 28, urgency: 'critical' as const, reason: 'Proposal sent 21 days ago with no response. Competitor detected in recent web activity.' },
      ],
      highPriorityDeals: [
        { id: 'd3', name: 'TechStart POC', value: 45000, stage: 'Demo', probability: 70, healthScore: 65, urgency: 'high' as const, reason: 'Demo scheduled today. Budget approved but timeline unclear.', closeDate: new Date(Date.now() + 1296000000).toISOString(), daysUntilClose: 15 },
        { id: 'd4', name: 'FinServ Compliance Suite', value: 200000, stage: 'Discovery', probability: 30, healthScore: 55, urgency: 'high' as const, reason: 'Large opportunity but only one stakeholder engaged. Need multi-threading.' },
        { id: 'd5', name: 'RetailMax Integration', value: 67000, stage: 'Negotiation', probability: 75, healthScore: 72, urgency: 'medium' as const, reason: 'Terms nearly agreed. Legal review in progress.' },
      ],
      metrics: { totalValue: 1200000, totalDeals: 18, avgHealthScore: 58, dealsAtRisk: 3, closingThisWeek: 2 },
    },
    actions: [
      { id: 'a1', label: 'Email at-risk contacts', type: 'primary', callback: 'draft_emails' },
      { id: 'a2', label: 'View full pipeline', type: 'secondary', callback: 'open_pipeline' },
    ],
  };
}

function makeDealHealth(): CopilotResponseType {
  return {
    type: 'deal_health',
    summary: "Deal health analysis shows 2 at-risk deals worth $210K and 3 deals likely to close this month.",
    data: {
      atRiskDeals: [
        { id: 'd1', name: 'Acme Enterprise License', value: 125000, stage: 'Negotiation', healthScore: 32, riskFactors: ['No contact 12 days', 'Champion silent', 'Competitor detected'], lastActivity: new Date(Date.now() - 1036800000).toISOString(), daysSinceActivity: 12, owner: 'You', recommendation: 'Send a value-add email with case study. Consider reaching out to executive sponsor directly.' },
        { id: 'd2', name: 'Global Logistics Platform', value: 85000, stage: 'Proposal', healthScore: 28, riskFactors: ['21 days no response', 'Single-threaded'], lastActivity: new Date(Date.now() - 1814400000).toISOString(), daysSinceActivity: 21, owner: 'You', recommendation: 'Try a different channel. Call the champion or reach out via LinkedIn.' },
      ],
      staleDeals: [
        { id: 'd3', name: 'MedTech Analytics', value: 55000, stage: 'Discovery', daysInStage: 45, owner: 'You', recommendation: 'This deal has been in Discovery for 45 days. Schedule a qualification call or move to lost.' },
      ],
      highValueDeals: [
        { id: 'd4', name: 'FinServ Compliance Suite', value: 200000, stage: 'Discovery', healthScore: 55, owner: 'You' },
        { id: 'd5', name: 'Acme Enterprise License', value: 125000, stage: 'Negotiation', healthScore: 32, owner: 'You' },
      ],
      likelyToClose: [
        { id: 'd6', name: 'RetailMax Integration', value: 67000, stage: 'Negotiation', probability: 85, closeDate: new Date(Date.now() + 604800000).toISOString(), owner: 'You', confidence: 'high' as const },
        { id: 'd7', name: 'CloudBase Expansion', value: 42000, stage: 'Proposal', probability: 75, closeDate: new Date(Date.now() + 1209600000).toISOString(), owner: 'You', confidence: 'medium' as const },
        { id: 'd8', name: 'DataFlow Renewal', value: 35000, stage: 'Negotiation', probability: 90, closeDate: new Date(Date.now() + 259200000).toISOString(), owner: 'You', confidence: 'high' as const },
      ],
      metrics: { totalAtRisk: 2, totalStale: 1, totalHighValue: 2, totalLikelyToClose: 3, averageHealthScore: 58, dealsNeedingAttention: 5 },
    },
    actions: [],
  };
}

function makeMeetingBriefing(): CopilotResponseType {
  return {
    type: 'meeting_briefing',
    summary: "Here's your briefing for the upcoming Discovery Call with Acme Corp.",
    data: {
      meeting: {
        id: 'm1',
        source: 'google_calendar' as const,
        title: 'Discovery Call - Acme Corp',
        startTime: new Date(Date.now() + 3600000).toISOString(),
        endTime: new Date(Date.now() + 5400000).toISOString(),
        durationMinutes: 30,
        attendees: [
          { email: 'you@company.com', name: 'You', isExternal: false, isOrganizer: true, responseStatus: 'accepted' as const },
          { email: 'sarah@acme.com', name: 'Sarah Chen', isExternal: true, isOrganizer: false, responseStatus: 'accepted' as const, crmContactId: 'c1' },
          { email: 'mike@acme.com', name: 'Mike Johnson', isExternal: true, isOrganizer: false, responseStatus: 'tentative' as const },
        ],
        meetingUrl: 'https://meet.google.com/abc-defg-hij',
        meetingType: 'sales' as const,
        status: 'confirmed' as const,
      },
      context: {
        company: { id: 'comp1', name: 'Acme Corp', industry: 'Enterprise Software', size: '500-1000 employees', relationshipDuration: '6 months' },
        deal: { id: 'd1', name: 'Acme Enterprise License', stage: 'Negotiation', value: 125000, probability: 60, closeDate: new Date(Date.now() + 432000000).toISOString(), healthScore: 32, daysInStage: 18 },
        lastActivity: { type: 'email' as const, date: new Date(Date.now() - 1036800000).toISOString(), summary: 'Sent pricing breakdown and ROI analysis' },
        openTasks: [
          { id: 't1', title: 'Send revised proposal with volume discount', dueDate: new Date().toISOString(), priority: 'high' as const },
          { id: 't2', title: 'Connect with IT stakeholder for technical review', priority: 'medium' as const },
        ],
        previousMeetings: [
          { id: 'pm1', title: 'Technical Deep Dive', date: new Date(Date.now() - 604800000).toISOString(), summary: 'Reviewed integration architecture. Sarah had concerns about SSO implementation timeline.', keyTopics: ['SSO Integration', 'Timeline', 'Security'] },
          { id: 'pm2', title: 'Initial Discovery', date: new Date(Date.now() - 2592000000).toISOString(), summary: 'Identified pain points: manual reporting, lack of pipeline visibility.', keyTopics: ['Pain Points', 'Budget', 'Decision Process'] },
        ],
      },
      actionItems: {
        completed: [
          { id: 'ai1', description: 'Send technical documentation', owner: 'You', isCompleted: true, meetingId: 'pm1', meetingTitle: 'Technical Deep Dive' },
        ],
        outstanding: [
          { id: 'ai2', description: 'Prepare SSO implementation timeline estimate', owner: 'You', dueDate: new Date().toISOString(), isCompleted: false, meetingId: 'pm1', meetingTitle: 'Technical Deep Dive' },
          { id: 'ai3', description: 'Share customer reference from similar-sized company', owner: 'You', isCompleted: false, meetingId: 'pm2', meetingTitle: 'Initial Discovery' },
        ],
      },
      suggestions: [
        'Address SSO timeline concerns upfront - Sarah flagged this as a potential blocker',
        'Bring up the volume discount to re-engage on pricing negotiation',
        'Ask about their Q2 budget cycle - close date alignment is critical',
        'Mention the recent product update on automated reporting (addresses their #1 pain point)',
      ],
    },
    actions: [],
  };
}

function makeTaskResponse(): CopilotResponseType {
  return {
    type: 'task',
    summary: "You have 7 tasks due this week. 2 are urgent and 3 overdue.",
    data: {
      urgentTasks: [
        { id: 't1', title: 'Send revised proposal to Acme Corp', description: 'Include volume discount pricing', status: 'todo' as const, priority: 'urgent' as const, dueDate: new Date().toISOString(), isOverdue: false, taskType: 'proposal' as const, contactName: 'Sarah Chen', dealName: 'Acme Enterprise License', createdAt: new Date(Date.now() - 172800000).toISOString(), updatedAt: new Date(Date.now() - 86400000).toISOString() },
        { id: 't2', title: 'Follow up on DataFlow contract terms', status: 'todo' as const, priority: 'urgent' as const, dueDate: new Date().toISOString(), isOverdue: false, taskType: 'follow_up' as const, contactName: 'Marcus Lee', dealName: 'DataFlow Platform', createdAt: new Date(Date.now() - 259200000).toISOString(), updatedAt: new Date(Date.now() - 86400000).toISOString() },
      ],
      highPriorityTasks: [
        { id: 't3', title: 'Prepare demo for TechStart', status: 'in_progress' as const, priority: 'high' as const, dueDate: new Date(Date.now() + 86400000).toISOString(), isOverdue: false, taskType: 'demo' as const, contactName: 'Lisa Park', createdAt: new Date(Date.now() - 345600000).toISOString(), updatedAt: new Date().toISOString() },
      ],
      dueToday: [],
      overdue: [
        { id: 't4', title: 'Update Global Logistics proposal', status: 'todo' as const, priority: 'high' as const, dueDate: new Date(Date.now() - 259200000).toISOString(), isOverdue: true, taskType: 'proposal' as const, contactName: 'James Wright', dealName: 'Global Logistics Platform', createdAt: new Date(Date.now() - 604800000).toISOString(), updatedAt: new Date(Date.now() - 604800000).toISOString() },
        { id: 't5', title: 'Send meeting notes to CloudBase team', status: 'todo' as const, priority: 'medium' as const, dueDate: new Date(Date.now() - 172800000).toISOString(), isOverdue: true, taskType: 'follow_up' as const, contactName: 'Emily Torres', createdAt: new Date(Date.now() - 432000000).toISOString(), updatedAt: new Date(Date.now() - 432000000).toISOString() },
        { id: 't6', title: 'Log call notes from RetailMax check-in', status: 'todo' as const, priority: 'low' as const, dueDate: new Date(Date.now() - 86400000).toISOString(), isOverdue: true, taskType: 'call' as const, createdAt: new Date(Date.now() - 172800000).toISOString(), updatedAt: new Date(Date.now() - 172800000).toISOString() },
      ],
      upcoming: [
        { id: 't7', title: 'Quarterly pipeline review preparation', status: 'todo' as const, priority: 'medium' as const, dueDate: new Date(Date.now() + 604800000).toISOString(), isOverdue: false, taskType: 'general' as const, createdAt: new Date(Date.now() - 86400000).toISOString(), updatedAt: new Date(Date.now() - 86400000).toISOString() },
      ],
      metrics: { totalTasks: 7, urgentCount: 2, highPriorityCount: 1, dueTodayCount: 2, overdueCount: 3, completedToday: 1, completionRate: 65 },
    },
    actions: [],
  };
}

function makeActionSummary(): CopilotResponseType {
  return {
    type: 'action_summary',
    summary: "Completed 5 actions across your CRM.",
    data: {
      actionsCompleted: 5,
      actionItems: [
        { entityType: 'task', operation: 'create', entityId: 't1', entityName: 'Follow up with Sarah Chen re: SSO timeline', success: true },
        { entityType: 'deal', operation: 'update', entityId: 'd1', entityName: 'Acme Enterprise License', details: 'Stage moved to Negotiation', success: true },
        { entityType: 'contact', operation: 'update', entityId: 'c1', entityName: 'Sarah Chen', details: 'Added note about pricing concerns', success: true },
        { entityType: 'activity', operation: 'create', entityName: 'Call logged with Acme Corp', success: true },
        { entityType: 'task', operation: 'create', entityName: 'Send revised proposal by Friday', success: true },
      ],
      metrics: { dealsUpdated: 1, clientsUpdated: 0, contactsUpdated: 1, tasksCreated: 2, activitiesCreated: 1 },
    },
    actions: [],
  };
}

// =============================================================================
// Demo Section Component
// =============================================================================

interface DemoSectionProps {
  title: string;
  description: string;
  triggerExample: string;
  response: CopilotResponseType;
  defaultOpen?: boolean;
}

function DemoSection({ title, description, triggerExample, response, defaultOpen = false }: DemoSectionProps) {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  return (
    <div className="border border-gray-800/60 rounded-2xl overflow-hidden bg-gray-950/50 backdrop-blur-sm">
      {/* Section Header */}
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between p-5 hover:bg-gray-900/40 transition-colors text-left"
      >
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-3 mb-1">
            <span className="text-xs font-mono px-2 py-0.5 rounded bg-violet-500/20 text-violet-400 border border-violet-500/30">
              {response.type}
            </span>
            <h3 className="text-lg font-semibold text-white">{title}</h3>
          </div>
          <p className="text-sm text-gray-400">{description}</p>
          <p className="text-xs text-gray-500 mt-1 italic">Trigger: "{triggerExample}"</p>
        </div>
        <div className="ml-4 shrink-0">
          {isOpen ? (
            <ChevronUp className="w-5 h-5 text-gray-400" />
          ) : (
            <ChevronDown className="w-5 h-5 text-gray-400" />
          )}
        </div>
      </button>

      {/* Panel Preview */}
      <AnimatePresence initial={false}>
        {isOpen && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.3, ease: 'easeInOut' }}
            className="overflow-hidden"
          >
            <div className="border-t border-gray-800/60">
              {/* Mock Chat Container */}
              <div className="bg-gray-900/80 p-6">
                {/* User message */}
                <div className="flex gap-3 justify-end mb-4">
                  <div className="bg-blue-50 dark:bg-blue-500/10 backdrop-blur-sm border border-blue-200 dark:border-blue-500/20 rounded-xl px-4 py-3 inline-block">
                    <p className="text-sm text-gray-100">{triggerExample}</p>
                  </div>
                  <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center shrink-0">
                    <span className="text-xs font-bold text-white">U</span>
                  </div>
                </div>

                {/* Assistant response */}
                <div className="flex gap-3 justify-start">
                  <div className="w-8 h-8 rounded-full overflow-hidden shrink-0 bg-gray-800 border border-gray-700 flex items-center justify-center">
                    <Sparkles className="w-4 h-4 text-white" />
                  </div>
                  <div className="w-full max-w-3xl">
                    <div className="bg-white dark:bg-gray-900/60 backdrop-blur-xl border border-gray-200 dark:border-gray-800/40 rounded-xl px-5 py-4 shadow-lg dark:shadow-none w-full">
                      <CopilotResponse response={response} onActionClick={(action) => toast.info(`Action: ${JSON.stringify(action).slice(0, 100)}`)} />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// =============================================================================
// Main Demo Page
// =============================================================================

export default function CopilotDemo() {
  const [expandAll, setExpandAll] = useState(false);

  const sections: DemoSectionProps[] = [
    {
      title: 'Daily Brief / Catch Me Up',
      description: 'Time-aware daily briefing with schedule, deals, contacts, and tasks. Adapts to morning/afternoon/evening.',
      triggerExample: 'Catch me up on my day',
      response: makeDailyBrief(),
      defaultOpen: true,
    },
    {
      title: 'Meeting Briefing',
      description: 'Hero meeting prep with CRM context, deal info, action items, attendees, and suggestions.',
      triggerExample: "What's my next meeting?",
      response: makeMeetingBriefing(),
    },
    {
      title: 'Pipeline Analysis',
      description: 'Pipeline overview with critical/high-priority deals, health scores, metrics, and drill-down.',
      triggerExample: 'Show me my pipeline',
      response: makePipeline(),
    },
    {
      title: 'Deal Health',
      description: 'At-risk, stale, high-value, and likely-to-close deals with health scores and recommendations.',
      triggerExample: 'Which deals need attention?',
      response: makeDealHealth(),
    },
    {
      title: 'Task Overview',
      description: 'Urgent, overdue, and upcoming tasks with priority indicators and quick actions.',
      triggerExample: "What's on my task list?",
      response: makeTaskResponse(),
    },
    {
      title: 'Action Summary',
      description: 'Confirmation panel after copilot performs CRM actions (create tasks, update deals, log activities).',
      triggerExample: 'Log a call with Acme and create a follow-up task',
      response: makeActionSummary(),
    },
  ];

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      {/* Header */}
      <div className="sticky top-0 z-50 bg-gray-950/90 backdrop-blur-xl border-b border-gray-800/60">
        <div className="max-w-5xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center">
              <Sparkles className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-white">Copilot Response Demo</h1>
              <p className="text-xs text-gray-400">improve/security branch - {sections.length} response panels</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={() => setExpandAll(!expandAll)}
              className={cn(
                'flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all',
                'bg-gray-800 border border-gray-700 hover:bg-gray-700 hover:border-gray-600 text-gray-300'
              )}
            >
              <Eye className="w-4 h-4" />
              {expandAll ? 'Collapse All' : 'Expand All'}
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-6 py-8 space-y-8">
        {/* Overview Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="bg-gray-900/60 border border-gray-800/40 rounded-lg p-4">
            <div className="text-xs text-gray-400 mb-1">Response Types</div>
            <div className="text-2xl font-bold text-white">48+</div>
            <div className="text-xs text-gray-500">Structured panels</div>
          </div>
          <div className="bg-gray-900/60 border border-gray-800/40 rounded-lg p-4">
            <div className="text-xs text-gray-400 mb-1">Skills Added</div>
            <div className="text-2xl font-bold text-emerald-400">120</div>
            <div className="text-xs text-gray-500">New SKILL.md files</div>
          </div>
          <div className="bg-gray-900/60 border border-gray-800/40 rounded-lg p-4">
            <div className="text-xs text-gray-400 mb-1">Shared Components</div>
            <div className="text-2xl font-bold text-blue-400">3</div>
            <div className="text-xs text-gray-500">MetricCard, SectionHeader, colors</div>
          </div>
          <div className="bg-gray-900/60 border border-gray-800/40 rounded-lg p-4">
            <div className="text-xs text-gray-400 mb-1">Copilot Files Changed</div>
            <div className="text-2xl font-bold text-violet-400">63</div>
            <div className="text-xs text-gray-500">14,560 lines added</div>
          </div>
        </div>

        {/* What's New Summary */}
        <div className="bg-gradient-to-r from-violet-500/10 to-purple-500/10 border border-violet-500/20 rounded-xl p-6">
          <h2 className="text-lg font-semibold text-white mb-3">What Changed on This Branch</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
            <div>
              <h3 className="font-medium text-violet-300 mb-2">Skills & Sequences</h3>
              <ul className="space-y-1 text-gray-300">
                <li>120 new SKILL.md files (atomic + sequences)</li>
                <li>Improved trigger patterns and confidence scores</li>
                <li>Enhanced variable resolution with required_context</li>
                <li>New sequences: deal-rescue, daily-focus, followup-zero-inbox</li>
              </ul>
            </div>
            <div>
              <h3 className="font-medium text-violet-300 mb-2">Copilot UI</h3>
              <ul className="space-y-1 text-gray-300">
                <li>Shared MetricCard & SectionHeader components</li>
                <li>Shared color system (STATUS_COLORS)</li>
                <li>Shared formatters (currency, date, time, duration)</li>
                <li>New response panels: DailyBrief, DealSlippage, DealMap</li>
                <li>CopilotRightPanel for contextual side view</li>
                <li>Conversation URL routing (/copilot/:id)</li>
              </ul>
            </div>
            <div>
              <h3 className="font-medium text-violet-300 mb-2">Copilot Backend</h3>
              <ul className="space-y-1 text-gray-300">
                <li>Enhanced autonomous executor with tool-call streaming</li>
                <li>Improved routing service (3-step: triggers, sequences, embeddings)</li>
                <li>Memory service with relevance scoring</li>
                <li>Progress steps for real-time "working story" UI</li>
              </ul>
            </div>
            <div>
              <h3 className="font-medium text-violet-300 mb-2">Security</h3>
              <ul className="space-y-1 text-gray-300">
                <li>Origin-validated CORS via corsHelper.ts</li>
                <li>User-scoped Supabase client in edge functions</li>
                <li>Conversation privacy enforcement (CHECK + RLS)</li>
                <li>Security audit logging</li>
              </ul>
            </div>
          </div>
        </div>

        {/* Empty State Preview */}
        <div className="border border-gray-800/60 rounded-2xl overflow-hidden bg-gray-950/50">
          <div className="p-5 border-b border-gray-800/60">
            <div className="flex items-center gap-3 mb-1">
              <span className="text-xs font-mono px-2 py-0.5 rounded bg-gray-500/20 text-gray-400 border border-gray-500/30">
                empty_state
              </span>
              <h3 className="text-lg font-semibold text-white">Copilot Empty State</h3>
            </div>
            <p className="text-sm text-gray-400">Welcome view with 2x2 action cards and dynamic prompts</p>
          </div>
          <div className="bg-gray-900/80 p-6">
            <div className="max-w-3xl mx-auto">
              <CopilotEmpty onPromptClick={(prompt) => toast.info(`Prompt: ${prompt}`)} />
            </div>
          </div>
        </div>

        {/* Response Panel Demos */}
        <div className="space-y-4">
          <h2 className="text-lg font-semibold text-white flex items-center gap-2">
            Response Panels
            <span className="text-xs text-gray-400 font-normal">({sections.length} showcased below)</span>
          </h2>
          {sections.map((section, index) => (
            <DemoSection
              key={section.response.type}
              {...section}
              defaultOpen={expandAll || section.defaultOpen}
            />
          ))}
        </div>

        {/* Footer */}
        <div className="text-center py-8 text-sm text-gray-500">
          <p>Branch: improve/security | {new Date().toLocaleDateString()}</p>
          <p className="mt-1">This page is for internal review only and should not be deployed to production.</p>
        </div>
      </div>
    </div>
  );
}
