/**
 * Command Centre "Morning Coffee Experience" — Fully Simulated Demo
 *
 * Showcases all 5 wow features with rich mock data and simulated interactions:
 *   1. Morning Coffee Queue (time-aware greeting, urgency scoring)
 *   2. One-Click Execute (email compose, Slack preview, CRM update)
 *   3. Conversational Canvas (AI chat thread, streaming edits, version undo)
 *   4. Live Context Intelligence (type-aware context tabs)
 *   5. Task Chains (visual grouping, auto-surface next task)
 *
 * Route: /command-centre-wow
 * No backend, no auth — works for anyone.
 */

import { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  CheckCircle2, Circle, Clock, Send, Mail, FileText,
  Search, ChevronDown, ChevronRight, Building2, CalendarClock,
  Bot, Eye, X,
  Brain, MessageSquare, Target, Loader2, Check,
  Inbox, PanelLeft,
  Link,
  ExternalLink, Copy,
  UserCircle,
  Video, TrendingUp,
  FileEdit, Briefcase,
  RotateCcw, Sparkles, Shield, Database, Hash,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

// ============================================================
// TYPES
// ============================================================

type TaskStatus = 'pending_review' | 'ai_working' | 'draft_ready' | 'completed' | 'dismissed';
type TaskType = 'email' | 'follow_up' | 'research' | 'meeting_prep' | 'crm_update' | 'proposal' | 'slack_update' | 'content';
type Priority = 'urgent' | 'high' | 'medium' | 'low';

interface ConversationMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
}

interface MockTask {
  id: string;
  title: string;
  description?: string;
  status: TaskStatus;
  task_type: TaskType;
  priority: Priority;
  confidence_score: number;
  reasoning?: string;
  due_date?: string;
  company?: string;
  contact_name?: string;
  contact_email?: string;
  deal_name?: string;
  deal_value?: string;
  deal_stage?: string;
  deliverable_type?: string;
  deliverable_content?: string;
  ai_status: string;
  created_at: string;
  parent_task_id?: string;
  meeting_context?: {
    title: string;
    date: string;
    duration: string;
    summary: string;
    highlights: string[];
    attendees: { name: string; role: string; company: string }[];
  };
  contact_context?: {
    name: string;
    title: string;
    company: string;
    email: string;
    last_contacted: string;
    relationship_score: number;
    buying_signals?: string[];
  };
  deal_context?: {
    deal_name: string;
    deal_value: string;
    deal_stage: string;
    next_steps?: string;
    competitors?: string[];
  };
  crm_fields?: Record<string, { current: string; proposed: string; confidence: number }>;
  related_items?: { type: string; title: string; status: string; id?: string }[];
}

// ============================================================
// MOCK DATA — Rich, realistic sales scenarios
// ============================================================

const CHAIN_PARENT_ID = 'chain-acme';

const MOCK_TASKS: MockTask[] = [
  // === CHAIN: Post-demo follow-up sequence (Acme Corp) ===
  {
    id: '1',
    title: 'Draft follow-up email to Sarah Chen',
    description: 'Post-demo follow-up with pricing details and ROI calculator',
    status: 'draft_ready',
    task_type: 'email',
    priority: 'urgent',
    confidence_score: 0.94,
    reasoning: 'Sarah expressed strong interest in pricing during the demo. She asked about enterprise tiers twice and requested the SOC 2 report. Deal is in Negotiation — timely follow-up critical.',
    due_date: new Date().toISOString(),
    company: 'Acme Corp',
    contact_name: 'Sarah Chen',
    contact_email: 'sarah.chen@acmecorp.com',
    deal_name: 'Acme Corp — Enterprise',
    deal_value: '$72,000 ARR',
    deal_stage: 'Negotiation',
    deliverable_type: 'email_draft',
    deliverable_content: `Hi Sarah,

Thank you for taking the time to see the platform in action today. Based on our conversation about scaling your team's outreach, I wanted to share a few things:

**Enterprise Pricing**
I've attached our enterprise tier breakdown — the plan that includes the AI copilot and unlimited sequences would be the best fit for your 12-person team.

| Plan | Price | Seats | Features |
|------|-------|-------|----------|
| Growth | $49/seat/mo | Up to 10 | Core CRM + Sequences |
| **Enterprise** | **$99/seat/mo** | **Unlimited** | **AI Copilot + Custom Integrations** |

**ROI Projection**
Based on the numbers you shared (450 leads/month, 2.3% current conversion):
- **3.4x improvement** in qualified pipeline within 90 days
- **$180K additional revenue** in the first year
- **12 hours/week saved** per rep on manual data entry

Would Thursday at 2pm work for a follow-up call with your VP of Sales?

Best,
Alex`,
    ai_status: 'draft_ready',
    created_at: new Date(Date.now() - 30 * 60000).toISOString(),
    parent_task_id: CHAIN_PARENT_ID,
    meeting_context: {
      title: 'Acme Corp — Product Demo',
      date: new Date(Date.now() - 2 * 3600000).toISOString(),
      duration: '45 min',
      summary: 'Product demo with Sarah Chen (VP Sales). Strong interest in enterprise features, particularly AI copilot. Asked about pricing twice. Key concern: HIPAA compliance.',
      highlights: [
        'Sarah asked about enterprise pricing tiers (14:32)',
        'Requested SOC 2 Type II report for IT review (22:15)',
        'Mentioned 12-person SDR team as initial rollout (8:45)',
        'Wants to include VP of Sales in next call (41:20)',
      ],
      attendees: [
        { name: 'Sarah Chen', role: 'VP of Sales', company: 'Acme Corp' },
        { name: 'Tom Bradley', role: 'Sales Manager', company: 'Acme Corp' },
        { name: 'Alex (You)', role: 'Account Executive', company: '60' },
      ],
    },
    contact_context: {
      name: 'Sarah Chen',
      title: 'VP of Sales',
      company: 'Acme Corp',
      email: 'sarah.chen@acmecorp.com',
      last_contacted: 'Today',
      relationship_score: 78,
      buying_signals: [
        'Asked about pricing twice during demo',
        'Requested security documentation',
        'Mentioned Q1 budget approval',
        'Wants VP of Sales involved in next call',
      ],
    },
    related_items: [
      { type: 'deal', title: 'Acme Corp — Enterprise ($72K ARR)', status: 'Negotiation', id: 'deal-1' },
      { type: 'meeting', title: 'Acme Corp — Product Demo', status: 'Completed', id: 'meeting-1' },
    ],
  },
  {
    id: '2',
    title: 'Update Acme Corp deal stage → Negotiation',
    description: 'Update CRM to reflect deal progression after demo',
    status: 'draft_ready',
    task_type: 'crm_update',
    priority: 'high',
    confidence_score: 0.91,
    reasoning: 'Demo completed successfully with pricing discussion. Deal should move from Proposal to Negotiation.',
    company: 'Acme Corp',
    contact_name: 'Sarah Chen',
    deal_name: 'Acme Corp — Enterprise',
    deal_value: '$72,000 ARR',
    deal_stage: 'Negotiation',
    deliverable_type: 'crm_update',
    ai_status: 'draft_ready',
    created_at: new Date(Date.now() - 28 * 60000).toISOString(),
    parent_task_id: CHAIN_PARENT_ID,
    crm_fields: {
      deal_stage: { current: 'Proposal', proposed: 'Negotiation', confidence: 95 },
      next_step: { current: 'Schedule demo', proposed: 'Send pricing + SOC 2 docs', confidence: 88 },
      close_date: { current: '2026-03-15', proposed: '2026-03-01', confidence: 72 },
    },
  },
  {
    id: '3',
    title: 'Post demo debrief in #deals',
    description: 'Share demo outcome with the team',
    status: 'draft_ready',
    task_type: 'slack_update',
    priority: 'medium',
    confidence_score: 0.87,
    reasoning: 'Team should be updated on Acme Corp demo outcome. High-value deal moving forward.',
    company: 'Acme Corp',
    deliverable_type: 'slack_update',
    deliverable_content: `**Acme Corp Demo Debrief** :fire:

Just wrapped the product demo with Sarah Chen (VP Sales) and Tom Bradley.

**Key takeaways:**
- Strong interest in Enterprise tier ($99/seat/mo)
- 12-person SDR team for initial rollout
- Requested SOC 2 docs (sent)
- HIPAA compliance question — need to check with legal
- **Next step:** Follow-up call Thursday with VP of Sales

Deal value: **$72K ARR** | Stage: **Negotiation**

Confidence: High — Sarah asked about pricing twice and wants to loop in the decision-maker.`,
    ai_status: 'draft_ready',
    created_at: new Date(Date.now() - 25 * 60000).toISOString(),
    parent_task_id: CHAIN_PARENT_ID,
  },

  // === STANDALONE: Meeting prep ===
  {
    id: '4',
    title: 'Prep brief for GlobalTech strategy call',
    description: 'Compile attendee intel and deal history before tomorrow\'s call',
    status: 'ai_working',
    task_type: 'meeting_prep',
    priority: 'high',
    confidence_score: 0.98,
    reasoning: 'Meeting with GlobalTech leadership in 22 hours. 3 attendees identified. Researching competitor mentions from last call.',
    due_date: new Date(Date.now() + 22 * 3600000).toISOString(),
    company: 'GlobalTech',
    contact_name: 'Mike Rodriguez',
    deal_name: 'GlobalTech — Platform Migration',
    deal_value: '$66,000 ARR',
    deal_stage: 'Proposal',
    deliverable_type: 'meeting_prep',
    deliverable_content: `# Meeting Prep: GlobalTech Strategy Call

**Date:** Tomorrow at 10:00 AM
**Duration:** 30 min
**Attendees:** Mike Rodriguez (CTO), Lisa Park (VP Eng), David Kim (IT Director)

## Key Intel

### Mike Rodriguez — CTO
- 15 years at GlobalTech, promoted to CTO in 2024
- Previously used Salesforce, migrated to HubSpot
- Active on LinkedIn — recently posted about "AI-first sales tools"

### Deal Context
- **$66K ARR** | Proposal stage
- Competing against Outreach and SalesLoft
- Main differentiator: our AI copilot + native CRM

### Risk Factors
- David Kim (IT) has concerns about data migration timeline
- Lisa mentioned competitor pricing in last email

## Suggested Talking Points
1. Address data migration timeline — our onboarding team does it in 2 weeks
2. Demo the AI copilot live during the call
3. Reference their LinkedIn post about AI-first tools`,
    ai_status: 'working',
    created_at: new Date(Date.now() - 2 * 3600000).toISOString(),
    meeting_context: {
      title: 'GlobalTech — Previous Discovery Call',
      date: new Date(Date.now() - 7 * 86400000).toISOString(),
      duration: '30 min',
      summary: 'Initial discovery with Mike Rodriguez. Interested in platform migration from HubSpot. Concerns about data migration timeline.',
      highlights: [
        'Mike mentioned evaluating Outreach and SalesLoft',
        'Data migration timeline is a key concern for IT',
        'Budget approved for Q1 — needs CTO sign-off',
      ],
      attendees: [
        { name: 'Mike Rodriguez', role: 'CTO', company: 'GlobalTech' },
        { name: 'Alex (You)', role: 'Account Executive', company: '60' },
      ],
    },
    deal_context: {
      deal_name: 'GlobalTech — Platform Migration',
      deal_value: '$66,000 ARR',
      deal_stage: 'Proposal',
      next_steps: 'Strategy call tomorrow, then POC request expected',
      competitors: ['Outreach', 'SalesLoft'],
    },
  },

  // === STANDALONE: Re-engagement ===
  {
    id: '5',
    title: 'Re-engage Westfield — no contact in 3 weeks',
    description: 'Draft a check-in email to revive stalled deal',
    status: 'draft_ready',
    task_type: 'follow_up',
    priority: 'medium',
    confidence_score: 0.82,
    reasoning: 'Deal went silent after POC. Last contact 21 days ago. Trigger: deal age in current stage exceeds threshold.',
    company: 'Westfield Industries',
    contact_name: 'James Miller',
    contact_email: 'j.miller@westfield.com',
    deal_name: 'Westfield — Growth Plan',
    deal_value: '$28,000 ARR',
    deal_stage: 'POC',
    deliverable_type: 'email_draft',
    deliverable_content: `Hi James,

I hope all is well! I wanted to check in on how the proof of concept has been going.

Last time we spoke, your team was testing the sequence builder with a batch of 200 leads. I'd love to hear how that went and whether you had any questions.

A few things that might help:
- Our **success team** can do a live walkthrough of any features your reps found tricky
- We just released **AI-powered A/B testing** for subject lines — could be a quick win for your team
- I can extend the POC by a week if you need more time

Would you be free for a 15-minute check-in this week?

Best,
Alex`,
    ai_status: 'draft_ready',
    created_at: new Date(Date.now() - 4 * 3600000).toISOString(),
    contact_context: {
      name: 'James Miller',
      title: 'Head of Growth',
      company: 'Westfield Industries',
      email: 'j.miller@westfield.com',
      last_contacted: '21 days ago',
      relationship_score: 45,
      buying_signals: [
        'Completed 60% of POC tasks',
        'Downloaded pricing PDF twice',
        'Has not logged in for 14 days',
      ],
    },
  },

  // === STANDALONE: Proposal ===
  {
    id: '6',
    title: 'Build proposal for Vertex Partners',
    description: 'Custom proposal based on discovery call requirements',
    status: 'draft_ready',
    task_type: 'proposal',
    priority: 'high',
    confidence_score: 0.89,
    reasoning: 'Discovery call revealed specific needs: 25 reps, CRM migration, custom reporting. Decision by end of month.',
    company: 'Vertex Partners',
    contact_name: 'Diana Torres',
    contact_email: 'd.torres@vertex.com',
    deal_name: 'Vertex Partners — Custom Enterprise',
    deal_value: '$120,000 ARR',
    deal_stage: 'Proposal',
    deliverable_type: 'proposal',
    deliverable_content: `# Proposal: Vertex Partners — Custom Enterprise Plan

## Executive Summary
Based on our discovery call on Feb 18th, this proposal addresses Vertex Partners' need for a unified sales platform supporting 25 reps across 3 offices.

## Recommended Solution

### Platform: Enterprise Custom
- **25 seats** with dedicated account manager
- **CRM migration** from Salesforce (2-week timeline)
- **Custom reporting** dashboard for leadership
- **AI Copilot** with org-specific training

### Pricing
| Component | Annual Cost |
|-----------|------------|
| 25 Enterprise seats | $29,700 |
| CRM Migration | $5,000 (one-time) |
| Custom Reporting | Included |
| AI Copilot Training | $3,000 (one-time) |
| **Total Year 1** | **$37,700** |
| **Renewal (Year 2+)** | **$29,700/yr** |

### ROI Projection
- Pipeline increase: **4.2x** (based on similar deployments)
- Rep time saved: **15 hrs/week** on admin tasks
- Expected payback period: **47 days**`,
    ai_status: 'draft_ready',
    created_at: new Date(Date.now() - 6 * 3600000).toISOString(),
    deal_context: {
      deal_name: 'Vertex Partners — Custom Enterprise',
      deal_value: '$120,000 ARR',
      deal_stage: 'Proposal',
      next_steps: 'Send proposal, schedule review with CFO',
      competitors: ['Salesforce', 'Gong'],
    },
  },

  // === COMPLETED task ===
  {
    id: '7',
    title: 'Log NovaTech demo in CRM',
    description: 'Auto-logged demo meeting with notes',
    status: 'completed',
    task_type: 'crm_update',
    priority: 'low',
    confidence_score: 0.99,
    company: 'NovaTech',
    contact_name: 'Ryan Park',
    deliverable_type: 'crm_update',
    ai_status: 'completed',
    created_at: new Date(Date.now() - 12 * 3600000).toISOString(),
  },
];

// ============================================================
// CONFIG
// ============================================================

const priorityConfig: Record<Priority, { color: string; label: string }> = {
  urgent: { color: 'bg-red-500', label: 'Urgent' },
  high: { color: 'bg-orange-500', label: 'High' },
  medium: { color: 'bg-blue-500', label: 'Medium' },
  low: { color: 'bg-slate-400', label: 'Low' },
};

const taskTypeConfig: Record<string, { icon: React.ElementType; label: string; color: string }> = {
  email: { icon: Mail, label: 'Email', color: 'text-blue-500' },
  follow_up: { icon: Send, label: 'Follow-up', color: 'text-emerald-500' },
  research: { icon: FileText, label: 'Research', color: 'text-amber-500' },
  meeting_prep: { icon: CalendarClock, label: 'Meeting Prep', color: 'text-indigo-500' },
  crm_update: { icon: Database, label: 'CRM Update', color: 'text-teal-500' },
  proposal: { icon: Briefcase, label: 'Proposal', color: 'text-purple-500' },
  slack_update: { icon: MessageSquare, label: 'Slack Update', color: 'text-pink-500' },
  content: { icon: FileEdit, label: 'Content', color: 'text-cyan-500' },
};

// ============================================================
// HELPER: Simulate AI streaming
// ============================================================

function useSimulatedStreaming() {
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamedContent, setStreamedContent] = useState('');
  const cancelRef = useRef(false);

  const stream = useCallback(async (finalContent: string): Promise<string> => {
    setIsStreaming(true);
    cancelRef.current = false;
    const words = finalContent.split(' ');
    let accumulated = '';

    for (let i = 0; i < words.length; i++) {
      if (cancelRef.current) break;
      accumulated += (i > 0 ? ' ' : '') + words[i];
      setStreamedContent(accumulated);
      await new Promise(r => setTimeout(r, Math.max(8, 25 - Math.floor(i / 10))));
    }

    setStreamedContent(finalContent);
    setIsStreaming(false);
    return finalContent;
  }, []);

  const cancel = useCallback(() => { cancelRef.current = true; }, []);

  return { isStreaming, streamedContent, stream, cancel };
}

// ============================================================
// SUB-COMPONENTS
// ============================================================

function SidebarTaskItem({
  task,
  isSelected,
  isNextInChain,
  onClick,
}: {
  task: MockTask;
  isSelected: boolean;
  isNextInChain: boolean;
  onClick: () => void;
}) {
  const StatusIcon = task.status === 'completed' || task.status === 'dismissed'
    ? CheckCircle2
    : task.status === 'ai_working'
    ? Loader2
    : Circle;

  return (
    <button
      onClick={onClick}
      className={cn(
        'w-full text-left px-3 py-2.5 rounded-lg transition-all duration-150 group',
        isSelected
          ? 'bg-blue-50 dark:bg-blue-500/10 ring-1 ring-blue-200 dark:ring-blue-500/30'
          : 'hover:bg-slate-50 dark:hover:bg-gray-800/50',
        isNextInChain && !isSelected && 'ring-1 ring-violet-300/40',
        (task.status === 'completed' || task.status === 'dismissed') && 'opacity-50',
      )}
    >
      <div className="flex items-start gap-2.5">
        <div className="mt-0.5 shrink-0">
          <StatusIcon
            className={cn(
              'h-3.5 w-3.5',
              task.status === 'completed' ? 'text-emerald-500' :
              task.status === 'ai_working' ? 'text-violet-500 animate-spin [animation-duration:3s]' :
              task.status === 'draft_ready' ? 'text-blue-400' :
              'text-slate-300'
            )}
          />
        </div>
        <div className="flex-1 min-w-0">
          <p className={cn(
            'text-xs font-medium text-slate-700 dark:text-gray-300 truncate',
            task.status === 'completed' && 'line-through',
          )}>
            {task.title}
          </p>
          <div className="flex items-center gap-1.5 mt-1">
            <div className={cn('w-1.5 h-1.5 rounded-full', priorityConfig[task.priority].color)} />
            <span className="text-[10px] text-slate-400 dark:text-gray-500 truncate">
              {task.company}
            </span>
            {task.status === 'ai_working' && (
              <span className="text-[9px] text-violet-400 dark:text-violet-500">
                AI working
              </span>
            )}
          </div>
        </div>
      </div>
    </button>
  );
}

function TaskChainGroup({
  parentTitle,
  tasks,
  selectedTaskId,
  nextInChainId,
  onSelectTask,
}: {
  parentTitle: string;
  tasks: MockTask[];
  selectedTaskId: string | null;
  nextInChainId: string | null;
  onSelectTask: (id: string) => void;
}) {
  const [expanded, setExpanded] = useState(true);
  const completed = tasks.filter(t => t.status === 'completed').length;
  const progress = Math.round((completed / tasks.length) * 100);

  return (
    <div className="border-l-2 border-violet-300 dark:border-violet-500/40 ml-1 pl-2 mb-2">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-2 px-2 py-1.5 text-left group"
      >
        {expanded ? (
          <ChevronDown className="h-3 w-3 text-violet-400 shrink-0" />
        ) : (
          <ChevronRight className="h-3 w-3 text-violet-400 shrink-0" />
        )}
        <span className="text-[11px] font-semibold text-violet-700 dark:text-violet-300 truncate flex-1">
          {parentTitle}
        </span>
        <span className="text-[10px] text-violet-400 shrink-0">{completed}/{tasks.length}</span>
      </button>
      {/* Mini progress bar */}
      <div className="mx-2 mb-1 h-1 rounded-full bg-violet-100 dark:bg-violet-500/10 overflow-hidden">
        <div
          className="h-full bg-violet-500 dark:bg-violet-400 rounded-full transition-all duration-500"
          style={{ width: `${progress}%` }}
        />
      </div>
      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden"
          >
            {tasks.map(task => (
              <SidebarTaskItem
                key={task.id}
                task={task}
                isSelected={task.id === selectedTaskId}
                isNextInChain={task.id === nextInChainId}
                onClick={() => onSelectTask(task.id)}
              />
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// Context Panel sub-components (inline, type-aware)
function MeetingHighlights({ data }: { data: MockTask['meeting_context'] }) {
  if (!data) return <EmptyTab message="No meeting data available" />;
  return (
    <div className="space-y-4">
      <div>
        <h4 className="text-xs font-semibold text-slate-700 dark:text-gray-300 mb-1">{data.title}</h4>
        <p className="text-[11px] text-slate-500 dark:text-gray-400">
          {new Date(data.date).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })} · {data.duration}
        </p>
        <a href="#" className="inline-flex items-center gap-1 mt-1 text-[11px] text-blue-600 dark:text-blue-400 hover:underline">
          <Video className="h-3 w-3" /> View Recording <ExternalLink className="h-2.5 w-2.5" />
        </a>
      </div>
      {data.summary && (
        <div>
          <h5 className="text-[11px] font-semibold text-slate-600 dark:text-gray-400 uppercase tracking-wider mb-1.5">AI Summary</h5>
          <p className="text-xs text-slate-600 dark:text-gray-400 leading-relaxed">{data.summary}</p>
        </div>
      )}
      {data.highlights.length > 0 && (
        <div>
          <h5 className="text-[11px] font-semibold text-slate-600 dark:text-gray-400 uppercase tracking-wider mb-1.5">Key Moments</h5>
          <ul className="space-y-1.5">
            {data.highlights.map((h, i) => (
              <li key={i} className="flex items-start gap-2 rounded-md px-2 py-1.5 hover:bg-slate-50 dark:hover:bg-gray-800/50 transition-colors">
                <Clock className="h-3 w-3 text-blue-500 mt-0.5 shrink-0" />
                <span className="text-[11px] text-slate-600 dark:text-gray-400">{h}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
      {data.attendees.length > 0 && (
        <div>
          <h5 className="text-[11px] font-semibold text-slate-600 dark:text-gray-400 uppercase tracking-wider mb-1.5">Attendees</h5>
          <div className="space-y-2">
            {data.attendees.map((a, i) => (
              <div key={i} className="flex items-center gap-2">
                <div className="w-6 h-6 rounded-full bg-slate-200 dark:bg-gray-700 flex items-center justify-center">
                  <span className="text-[10px] font-semibold text-slate-600 dark:text-gray-300">{a.name[0]}</span>
                </div>
                <div>
                  <p className="text-[11px] font-medium text-slate-700 dark:text-gray-300">{a.name}</p>
                  <p className="text-[10px] text-slate-400 dark:text-gray-500">{a.role} · {a.company}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function BuyerSignals({ data }: { data: MockTask['contact_context'] }) {
  if (!data) return <EmptyTab message="No buyer signal data" />;
  return (
    <div className="space-y-4">
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-500 to-violet-500 flex items-center justify-center">
          <span className="text-sm font-bold text-white">{data.name.split(' ').map(n => n[0]).join('')}</span>
        </div>
        <div>
          <h4 className="text-sm font-semibold text-slate-800 dark:text-gray-200">{data.name}</h4>
          <p className="text-[11px] text-slate-500 dark:text-gray-400">{data.title}</p>
          <p className="text-[11px] text-slate-400 dark:text-gray-500">{data.company}</p>
        </div>
      </div>
      <div>
        <h5 className="text-[11px] font-semibold text-slate-600 dark:text-gray-400 uppercase tracking-wider mb-2">Relationship Health</h5>
        <div className="flex items-center gap-3">
          <div className="flex-1 h-2 rounded-full bg-slate-100 dark:bg-gray-800 overflow-hidden">
            <div
              className={cn('h-full rounded-full', data.relationship_score >= 70 ? 'bg-emerald-500' : data.relationship_score >= 40 ? 'bg-amber-500' : 'bg-red-500')}
              style={{ width: `${data.relationship_score}%` }}
            />
          </div>
          <span className="text-xs font-semibold text-slate-700 dark:text-gray-300">{data.relationship_score}</span>
        </div>
        <p className="text-[10px] text-slate-400 mt-1">Last contacted {data.last_contacted}</p>
      </div>
      {data.buying_signals && data.buying_signals.length > 0 && (
        <div>
          <h5 className="text-[11px] font-semibold text-slate-600 dark:text-gray-400 uppercase tracking-wider mb-1.5">Buying Signals</h5>
          <ul className="space-y-1.5">
            {data.buying_signals.map((s, i) => (
              <li key={i} className="flex items-start gap-2">
                <TrendingUp className="h-3 w-3 text-emerald-500 mt-0.5 shrink-0" />
                <span className="text-[11px] text-slate-600 dark:text-gray-400">{s}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function DealOverview({ data }: { data: MockTask['deal_context'] }) {
  if (!data) return <EmptyTab message="No deal data available" />;
  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-slate-200 dark:border-gray-700/50 p-3">
        <div className="flex items-center gap-2 mb-2">
          <Target className="h-3.5 w-3.5 text-emerald-500" />
          <span className="text-xs font-semibold text-slate-700 dark:text-gray-300">Active Deal</span>
        </div>
        <p className="text-xs text-slate-600 dark:text-gray-400">{data.deal_name}</p>
        <div className="flex items-center gap-3 mt-1.5">
          <span className="text-xs font-semibold text-emerald-600 dark:text-emerald-400">{data.deal_value}</span>
          <Badge variant="secondary" className="text-[10px]">{data.deal_stage}</Badge>
        </div>
      </div>
      {data.next_steps && (
        <div>
          <h5 className="text-[11px] font-semibold text-slate-600 dark:text-gray-400 uppercase tracking-wider mb-1.5">Next Steps</h5>
          <p className="text-xs text-slate-600 dark:text-gray-400 leading-relaxed">{data.next_steps}</p>
        </div>
      )}
      {data.competitors && data.competitors.length > 0 && (
        <div>
          <h5 className="text-[11px] font-semibold text-slate-600 dark:text-gray-400 uppercase tracking-wider mb-1.5">Competitors</h5>
          <div className="flex gap-2">
            {data.competitors.map((c, i) => (
              <Badge key={i} variant="outline" className="text-[10px]">
                <Shield className="h-2.5 w-2.5 mr-1 text-amber-500" /> {c}
              </Badge>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function RelatedItems({ items }: { items?: MockTask['related_items'] }) {
  if (!items?.length) return <EmptyTab message="No related items" />;
  return (
    <div className="space-y-2">
      {items.map((item, i) => (
        <a key={i} href="#" className="w-full flex items-center gap-3 rounded-lg border border-slate-200 dark:border-gray-700/50 p-3 hover:bg-slate-50 dark:hover:bg-gray-800/50 transition-colors">
          <div className={cn('w-7 h-7 rounded-lg flex items-center justify-center',
            item.type === 'deal' ? 'bg-emerald-50 dark:bg-emerald-500/10' :
            item.type === 'meeting' ? 'bg-indigo-50 dark:bg-indigo-500/10' :
            'bg-blue-50 dark:bg-blue-500/10'
          )}>
            {item.type === 'deal' ? <Target className="h-3.5 w-3.5 text-emerald-500" /> :
             item.type === 'meeting' ? <CalendarClock className="h-3.5 w-3.5 text-indigo-500" /> :
             <CheckCircle2 className="h-3.5 w-3.5 text-blue-500" />}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-medium text-slate-700 dark:text-gray-300 truncate">{item.title}</p>
            <p className="text-[10px] text-slate-400 dark:text-gray-500">{item.status}</p>
          </div>
          <ExternalLink className="h-3 w-3 text-slate-300" />
        </a>
      ))}
    </div>
  );
}

function CrmDiffPreview({ fields }: { fields?: MockTask['crm_fields'] }) {
  if (!fields) return <EmptyTab message="No CRM changes" />;
  return (
    <div className="space-y-3">
      {Object.entries(fields).map(([key, val]) => (
        <div key={key} className="rounded-lg border border-slate-200 dark:border-gray-700/50 p-3">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] font-semibold text-slate-600 dark:text-gray-400 capitalize">{key.replace(/_/g, ' ')}</span>
            <span className={cn('text-[10px] font-semibold', val.confidence >= 80 ? 'text-emerald-600' : val.confidence >= 50 ? 'text-amber-600' : 'text-red-600')}>
              {val.confidence}% confident
            </span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-400 line-through">{val.current}</span>
            <span className="text-slate-300">→</span>
            <span className="text-xs font-medium text-emerald-600 dark:text-emerald-400">{val.proposed}</span>
          </div>
        </div>
      ))}
    </div>
  );
}

function EmptyTab({ message }: { message: string }) {
  return <div className="flex items-center justify-center h-32 text-[11px] text-slate-400 dark:text-gray-500">{message}</div>;
}

// ============================================================
// CONTEXT PANEL
// ============================================================

const CONTEXT_TAB_MAP: Record<string, { id: string; label: string; icon: React.ElementType }[]> = {
  email_draft: [
    { id: 'meeting', label: 'Meeting Highlights', icon: Video },
    { id: 'signals', label: 'Buyer Signals', icon: TrendingUp },
    { id: 'related', label: 'Related', icon: Link },
  ],
  meeting_prep: [
    { id: 'deal', label: 'Deal Overview', icon: Briefcase },
    { id: 'meeting', label: 'Previous Call', icon: Video },
    { id: 'related', label: 'Related', icon: Link },
  ],
  proposal: [
    { id: 'deal', label: 'Deal Overview', icon: Briefcase },
    { id: 'signals', label: 'Buyer Signals', icon: TrendingUp },
    { id: 'related', label: 'Related', icon: Link },
  ],
  crm_update: [
    { id: 'crm_diff', label: 'Changes', icon: Database },
    { id: 'signals', label: 'Buyer Signals', icon: TrendingUp },
  ],
  slack_update: [
    { id: 'meeting', label: 'Meeting Highlights', icon: Video },
    { id: 'related', label: 'Related', icon: Link },
  ],
};

const DEFAULT_CONTEXT_TABS = [
  { id: 'context', label: 'Context', icon: FileText },
  { id: 'related', label: 'Related', icon: Link },
];

function ContextPanel({ task }: { task: MockTask }) {
  const tabs = CONTEXT_TAB_MAP[task.deliverable_type || ''] || DEFAULT_CONTEXT_TABS;
  const [activeTab, setActiveTab] = useState(tabs[0]?.id || 'context');

  useEffect(() => {
    setActiveTab(tabs[0]?.id || 'context');
  }, [task.id]);

  const renderContent = () => {
    switch (activeTab) {
      case 'meeting': return <MeetingHighlights data={task.meeting_context} />;
      case 'signals': return <BuyerSignals data={task.contact_context} />;
      case 'deal': return <DealOverview data={task.deal_context} />;
      case 'related': return <RelatedItems items={task.related_items} />;
      case 'crm_diff': return <CrmDiffPreview fields={task.crm_fields} />;
      default: return <EmptyTab message="Select a tab" />;
    }
  };

  return (
    <motion.div
      initial={{ width: 0, opacity: 0 }}
      animate={{ width: 320, opacity: 1 }}
      exit={{ width: 0, opacity: 0 }}
      transition={{ duration: 0.2 }}
      className="shrink-0 border-l border-slate-200 dark:border-gray-700/50 bg-white dark:bg-gray-900/80 overflow-hidden flex flex-col"
    >
      <div className="shrink-0 flex items-center gap-0 px-3 border-b border-slate-200 dark:border-gray-700/50 overflow-x-auto">
        {tabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={cn(
              'flex items-center gap-1.5 px-2.5 py-2.5 text-[11px] font-medium border-b-2 transition-colors whitespace-nowrap shrink-0',
              activeTab === tab.id
                ? 'border-blue-500 text-blue-600 dark:text-blue-400'
                : 'border-transparent text-slate-500 dark:text-gray-400 hover:text-slate-700'
            )}
          >
            <tab.icon className="h-3 w-3" />
            {tab.label}
          </button>
        ))}
      </div>
      <div className="flex-1 overflow-y-auto">
        <AnimatePresence mode="wait">
          <motion.div key={activeTab} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="p-4">
            {renderContent()}
          </motion.div>
        </AnimatePresence>
      </div>
    </motion.div>
  );
}

// ============================================================
// COMPOSE PREVIEW (simulated email send)
// ============================================================

function ComposePreviewDialog({
  open,
  task,
  onClose,
  onSent,
}: {
  open: boolean;
  task: MockTask | null;
  onClose: () => void;
  onSent: () => void;
}) {
  const [sending, setSending] = useState(false);

  if (!open || !task) return null;

  const handleSend = async () => {
    setSending(true);
    await new Promise(r => setTimeout(r, 1200));
    setSending(false);
    toast.success(`Email sent to ${task.contact_email}`);
    onSent();
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm" onClick={onClose}>
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="bg-white dark:bg-gray-900 rounded-xl shadow-2xl w-[600px] max-h-[80vh] overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-3 border-b border-slate-200 dark:border-gray-700/50">
          <div className="flex items-center gap-2">
            <Mail className="h-4 w-4 text-blue-500" />
            <span className="text-sm font-semibold text-slate-800 dark:text-gray-200">Compose Email</span>
          </div>
          <button onClick={onClose} className="p-1 rounded hover:bg-slate-100 dark:hover:bg-gray-800">
            <X className="h-4 w-4 text-slate-400" />
          </button>
        </div>
        <div className="px-5 py-3 space-y-2 border-b border-slate-100 dark:border-gray-800/50 text-xs">
          <div className="flex items-center gap-2">
            <span className="text-slate-400 w-8">To:</span>
            <span className="text-slate-700 dark:text-gray-300">{task.contact_email}</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-slate-400 w-8">Subj:</span>
            <span className="text-slate-700 dark:text-gray-300">Re: {task.company} — Follow Up</span>
          </div>
        </div>
        <div className="px-5 py-4 max-h-[50vh] overflow-y-auto">
          <pre className="text-xs text-slate-600 dark:text-gray-400 whitespace-pre-wrap font-sans leading-relaxed">
            {task.deliverable_content}
          </pre>
        </div>
        <div className="flex items-center justify-end gap-3 px-5 py-3 border-t border-slate-200 dark:border-gray-700/50 bg-slate-50/50 dark:bg-gray-800/30">
          <Button variant="outline" size="sm" onClick={onClose}>Cancel</Button>
          <Button size="sm" className="gap-1.5" onClick={handleSend} disabled={sending}>
            {sending ? <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Sending...</> : <><Send className="h-3.5 w-3.5" /> Send Email</>}
          </Button>
        </div>
      </motion.div>
    </div>
  );
}

// ============================================================
// SLACK PREVIEW (simulated Slack post)
// ============================================================

function SlackPreviewDialog({
  open,
  task,
  onClose,
  onSent,
}: {
  open: boolean;
  task: MockTask | null;
  onClose: () => void;
  onSent: () => void;
}) {
  const [sending, setSending] = useState(false);
  const [channel, setChannel] = useState('#deals');

  if (!open || !task) return null;

  const handleSend = async () => {
    setSending(true);
    await new Promise(r => setTimeout(r, 800));
    setSending(false);
    toast.success(`Posted to ${channel}`);
    onSent();
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm" onClick={onClose}>
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="bg-white dark:bg-gray-900 rounded-xl shadow-2xl w-[500px] max-h-[70vh] overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-3 border-b border-slate-200 dark:border-gray-700/50">
          <div className="flex items-center gap-2">
            <MessageSquare className="h-4 w-4 text-pink-500" />
            <span className="text-sm font-semibold text-slate-800 dark:text-gray-200">Post to Slack</span>
          </div>
          <button onClick={onClose} className="p-1 rounded hover:bg-slate-100 dark:hover:bg-gray-800">
            <X className="h-4 w-4 text-slate-400" />
          </button>
        </div>
        <div className="px-5 py-3 border-b border-slate-100 dark:border-gray-800/50">
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-400">Channel:</span>
            <div className="flex gap-1.5">
              {['#deals', '#sales-alerts', '#team-updates'].map(ch => (
                <button
                  key={ch}
                  onClick={() => setChannel(ch)}
                  className={cn(
                    'text-[11px] px-2.5 py-1 rounded-full transition-colors',
                    channel === ch
                      ? 'bg-blue-100 dark:bg-blue-500/20 text-blue-700 dark:text-blue-400'
                      : 'bg-slate-100 dark:bg-gray-800 text-slate-500 hover:bg-slate-200'
                  )}
                >
                  <Hash className="h-2.5 w-2.5 inline mr-0.5" />{ch.slice(1)}
                </button>
              ))}
            </div>
          </div>
        </div>
        <div className="px-5 py-4 max-h-[40vh] overflow-y-auto">
          <pre className="text-xs text-slate-600 dark:text-gray-400 whitespace-pre-wrap font-sans leading-relaxed">
            {task.deliverable_content}
          </pre>
        </div>
        <div className="flex items-center justify-end gap-3 px-5 py-3 border-t border-slate-200 dark:border-gray-700/50 bg-slate-50/50 dark:bg-gray-800/30">
          <Button variant="outline" size="sm" onClick={onClose}>Cancel</Button>
          <Button size="sm" className="gap-1.5" onClick={handleSend} disabled={sending}>
            {sending ? <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Posting...</> : <><Send className="h-3.5 w-3.5" /> Post to {channel}</>}
          </Button>
        </div>
      </motion.div>
    </div>
  );
}

// ============================================================
// CRM UPDATE PREVIEW (simulated confirm)
// ============================================================

function CrmUpdateDialog({
  open,
  task,
  onClose,
  onConfirmed,
}: {
  open: boolean;
  task: MockTask | null;
  onClose: () => void;
  onConfirmed: () => void;
}) {
  const [confirming, setConfirming] = useState(false);

  if (!open || !task || !task.crm_fields) return null;

  const handleConfirm = async () => {
    setConfirming(true);
    await new Promise(r => setTimeout(r, 800));
    setConfirming(false);
    toast.success('CRM updated successfully');
    onConfirmed();
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm" onClick={onClose}>
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="bg-white dark:bg-gray-900 rounded-xl shadow-2xl w-[480px] overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-3 border-b border-slate-200 dark:border-gray-700/50">
          <div className="flex items-center gap-2">
            <Database className="h-4 w-4 text-teal-500" />
            <span className="text-sm font-semibold text-slate-800 dark:text-gray-200">Review CRM Updates</span>
          </div>
          <button onClick={onClose} className="p-1 rounded hover:bg-slate-100 dark:hover:bg-gray-800">
            <X className="h-4 w-4 text-slate-400" />
          </button>
        </div>
        <div className="px-5 py-3 text-xs text-slate-500 border-b border-slate-100 dark:border-gray-800/50">
          <span className="font-medium text-slate-700 dark:text-gray-300">{task.deal_name || task.company}</span>
        </div>
        <div className="px-5 py-4 space-y-3 max-h-[50vh] overflow-y-auto">
          {Object.entries(task.crm_fields).map(([key, val]) => (
            <div key={key} className="rounded-lg border border-slate-200 dark:border-gray-700/50 p-3">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[11px] font-semibold text-slate-600 dark:text-gray-400 capitalize">{key.replace(/_/g, ' ')}</span>
                <div className="flex items-center gap-1">
                  <Brain className="h-3 w-3 text-violet-400" />
                  <span className={cn('text-[10px] font-semibold', val.confidence >= 80 ? 'text-emerald-600' : 'text-amber-600')}>
                    {val.confidence}%
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-slate-400 line-through">{val.current}</span>
                <span className="text-slate-300">→</span>
                <span className="text-xs font-medium text-emerald-600 dark:text-emerald-400">{val.proposed}</span>
              </div>
            </div>
          ))}
        </div>
        <div className="flex items-center justify-end gap-3 px-5 py-3 border-t border-slate-200 dark:border-gray-700/50 bg-slate-50/50 dark:bg-gray-800/30">
          <Button variant="outline" size="sm" onClick={onClose}>Cancel</Button>
          <Button size="sm" className="gap-1.5 bg-teal-600 hover:bg-teal-700" onClick={handleConfirm} disabled={confirming}>
            {confirming ? <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Updating...</> : <><Check className="h-3.5 w-3.5" /> Confirm Updates</>}
          </Button>
        </div>
      </motion.div>
    </div>
  );
}

// ============================================================
// MAIN DEMO PAGE
// ============================================================

export default function CommandCentreWowDemo() {
  const [tasks, setTasks] = useState<MockTask[]>(MOCK_TASKS);
  const [selectedId, setSelectedId] = useState<string>('1');
  const [activeFilter, setActiveFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [contextOpen, setContextOpen] = useState(true);
  const [greetingVisible, setGreetingVisible] = useState(true);
  const hasInteracted = useRef(false);

  // One-click execute dialogs
  const [composeOpen, setComposeOpen] = useState(false);
  const [slackOpen, setSlackOpen] = useState(false);
  const [crmOpen, setCrmOpen] = useState(false);

  // Conversational canvas
  const [conversation, setConversation] = useState<ConversationMessage[]>([]);
  const [canvasContent, setCanvasContent] = useState('');
  const [canvasVersions, setCanvasVersions] = useState<string[]>([]);
  const [showUndoBanner, setShowUndoBanner] = useState(false);
  const { isStreaming, stream } = useSimulatedStreaming();

  const selectedTask = useMemo(() => tasks.find(t => t.id === selectedId) || null, [tasks, selectedId]);

  // Sync canvas content when task changes
  useEffect(() => {
    if (selectedTask) {
      setCanvasContent(selectedTask.deliverable_content || selectedTask.description || '');
      setConversation([]);
      setCanvasVersions([]);
      setShowUndoBanner(false);
    }
  }, [selectedId]);

  // Filtered tasks
  const filteredTasks = useMemo(() => {
    let list = tasks;
    if (activeFilter === 'drafts') list = list.filter(t => t.status === 'draft_ready');
    else if (activeFilter === 'working') list = list.filter(t => t.status === 'ai_working');
    else if (activeFilter === 'done') list = list.filter(t => t.status === 'completed' || t.status === 'dismissed');
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      list = list.filter(t => t.title.toLowerCase().includes(q) || t.company?.toLowerCase().includes(q));
    }
    return list;
  }, [tasks, activeFilter, searchQuery]);

  // Chain detection
  const chainTasks = useMemo(() => filteredTasks.filter(t => t.parent_task_id === CHAIN_PARENT_ID), [filteredTasks]);
  const standaloneTasks = useMemo(() => filteredTasks.filter(t => !t.parent_task_id), [filteredTasks]);

  // Next in chain
  const nextInChainId = useMemo(() => {
    if (!selectedTask?.parent_task_id) return null;
    const siblings = tasks.filter(t => t.parent_task_id === selectedTask.parent_task_id && t.id !== selectedTask.id && t.status !== 'completed');
    return siblings[0]?.id || null;
  }, [selectedTask, tasks]);

  // Counts
  const counts = useMemo(() => ({
    drafts: tasks.filter(t => t.status === 'draft_ready').length,
    working: tasks.filter(t => t.status === 'ai_working').length,
    done: tasks.filter(t => t.status === 'completed').length,
    all: tasks.length,
  }), [tasks]);

  const getGreeting = () => {
    const h = new Date().getHours();
    if (h < 12) return 'Good morning';
    if (h < 17) return 'Good afternoon';
    return 'Good evening';
  };

  const handleSelectTask = useCallback((id: string) => {
    if (!hasInteracted.current) {
      hasInteracted.current = true;
      setGreetingVisible(false);
    }
    setSelectedId(id);
  }, []);

  // Mark task completed and auto-advance chain
  const markCompleted = useCallback((taskId: string) => {
    setTasks(prev => prev.map(t => t.id === taskId ? { ...t, status: 'completed' as TaskStatus } : t));

    const task = tasks.find(t => t.id === taskId);
    if (task?.parent_task_id) {
      const siblings = tasks.filter(t => t.parent_task_id === task.parent_task_id && t.id !== taskId && t.status !== 'completed');
      if (siblings.length > 0) {
        setTimeout(() => {
          setSelectedId(siblings[0].id);
          toast.info(`Next in chain: ${siblings[0].title}`, { duration: 3000 });
        }, 500);
      }
    }
  }, [tasks]);

  const handleApprove = useCallback(() => {
    if (!selectedTask) return;
    if (selectedTask.deliverable_type === 'email_draft') {
      setComposeOpen(true);
    } else if (selectedTask.deliverable_type === 'slack_update') {
      setSlackOpen(true);
    } else if (selectedTask.deliverable_type === 'crm_update') {
      setCrmOpen(true);
    } else {
      toast.success('Task approved');
      markCompleted(selectedTask.id);
    }
  }, [selectedTask, markCompleted]);

  const handleDismiss = useCallback(() => {
    if (!selectedTask) return;
    setTasks(prev => prev.map(t => t.id === selectedTask.id ? { ...t, status: 'dismissed' as TaskStatus } : t));
    toast('Task dismissed');
  }, [selectedTask]);

  // Canvas AI conversation
  const handleCanvasSend = useCallback(async (message: string) => {
    if (!selectedTask) return;

    const userMsg: ConversationMessage = { id: crypto.randomUUID(), role: 'user', content: message, timestamp: new Date().toISOString() };
    setConversation(prev => [...prev, userMsg]);

    // Snapshot for undo
    setCanvasVersions(prev => [...prev, canvasContent].slice(-10));

    // Simulated AI refinement based on the message
    let refined = canvasContent;
    if (message.toLowerCase().includes('shorter') || message.toLowerCase().includes('concise')) {
      const lines = canvasContent.split('\n').filter(l => l.trim());
      refined = lines.slice(0, Math.ceil(lines.length * 0.6)).join('\n');
    } else if (message.toLowerCase().includes('formal') || message.toLowerCase().includes('professional')) {
      refined = canvasContent.replace(/Hi /g, 'Dear ').replace(/Best,/g, 'Kind regards,').replace(/I'd love/g, 'I would be pleased');
    } else if (message.toLowerCase().includes('casual') || message.toLowerCase().includes('friendly')) {
      refined = canvasContent.replace(/Dear /g, 'Hey ').replace(/Kind regards,/g, 'Cheers,').replace(/I would be pleased/g, "I'd love");
    } else if (message.toLowerCase().includes('add') && message.toLowerCase().includes('urgency')) {
      refined = canvasContent + '\n\n**Please note:** Our current pricing is locked until end of month. After that, the Enterprise tier increases by 15%. I wanted to make sure you had time to review before then.';
    } else {
      // Generic tweak
      refined = canvasContent + `\n\n_[AI note: Refined based on your feedback: "${message}"]_`;
    }

    await stream(refined);
    setCanvasContent(refined);
    setShowUndoBanner(true);

    const aiMsg: ConversationMessage = { id: crypto.randomUUID(), role: 'assistant', content: 'Canvas updated.', timestamp: new Date().toISOString() };
    setConversation(prev => [...prev, aiMsg]);
  }, [selectedTask, canvasContent, stream]);

  const handleUndo = useCallback(() => {
    if (canvasVersions.length === 0) return;
    const prev = canvasVersions[canvasVersions.length - 1];
    setCanvasContent(prev);
    setCanvasVersions(p => p.slice(0, -1));
    setConversation(p => {
      const lastAi = p.findLastIndex(m => m.role === 'assistant');
      return lastAi >= 0 ? p.slice(0, lastAi) : p;
    });
    toast.info('Reverted to previous version');
    if (canvasVersions.length <= 1) setShowUndoBanner(false);
  }, [canvasVersions]);

  // Cmd+Z undo
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'z' && showUndoBanner) {
        e.preventDefault();
        handleUndo();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [showUndoBanner, handleUndo]);

  // Copy link handler
  const handleCopyLink = () => {
    navigator.clipboard.writeText(`${window.location.origin}/command-centre-wow?task=${selectedId}`);
    toast.success('Link copied');
  };

  const isCompleted = selectedTask?.status === 'completed' || selectedTask?.status === 'dismissed';

  return (
    <div className="flex flex-col h-[calc(100vh-4rem)] bg-white dark:bg-gray-950">
      {/* Demo badge */}
      <div className="shrink-0 bg-slate-50 dark:bg-gray-900 border-b border-slate-200 dark:border-gray-700/50 text-center py-1 text-[11px] text-slate-400 dark:text-gray-500">
        Demo Mode — fully simulated, no backend
      </div>

      {/* GREETING HEADER */}
      <AnimatePresence>
        {greetingVisible && (
          <motion.div key="greeting" initial={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} transition={{ duration: 0.3 }} className="overflow-hidden shrink-0">
            <div className="px-6 py-4 border-b border-slate-100 dark:border-gray-800/60">
              <p className="text-2xl font-semibold text-slate-800 dark:text-gray-100">{getGreeting()}, Alex</p>
              <p className="text-sm text-muted-foreground mt-0.5">
                <span className="font-medium text-emerald-600">{counts.drafts}</span> ready for review
                <span className="mx-2 text-slate-300">·</span>
                <span className="font-medium text-violet-600">{counts.working}</span> in progress
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* MAIN 3-COLUMN LAYOUT */}
      <div className="flex flex-1 min-h-0">
        {/* LEFT SIDEBAR */}
        <AnimatePresence mode="wait">
          {!sidebarCollapsed && (
            <motion.div
              initial={{ width: 0, opacity: 0 }}
              animate={{ width: 320, opacity: 1 }}
              exit={{ width: 0, opacity: 0 }}
              className="shrink-0 border-r border-slate-200 dark:border-gray-700/50 flex flex-col bg-slate-50/30 dark:bg-gray-900/30 overflow-hidden"
            >
              {/* Search */}
              <div className="shrink-0 px-3 py-2.5 border-b border-slate-200 dark:border-gray-700/50">
                <div className="relative">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
                  <input
                    type="text"
                    placeholder="Search tasks..."
                    value={searchQuery}
                    onChange={e => setSearchQuery(e.target.value)}
                    className="w-full pl-8 pr-3 py-1.5 text-xs rounded-lg border border-slate-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-slate-700 dark:text-gray-300 focus:outline-none focus:ring-1 focus:ring-blue-400"
                  />
                </div>
              </div>

              {/* Filter tabs */}
              <div className="shrink-0 flex items-center gap-1 px-3 py-2 border-b border-slate-200 dark:border-gray-700/50">
                {[
                  { id: 'all', label: 'All', count: counts.all },
                  { id: 'drafts', label: 'Drafts', count: counts.drafts },
                  { id: 'working', label: 'Working', count: counts.working },
                  { id: 'done', label: 'Done', count: counts.done },
                ].map(f => (
                  <button
                    key={f.id}
                    onClick={() => setActiveFilter(f.id)}
                    className={cn(
                      'text-[11px] px-2.5 py-1 rounded-full transition-colors',
                      activeFilter === f.id
                        ? 'bg-blue-100 dark:bg-blue-500/20 text-blue-700 dark:text-blue-400 font-medium'
                        : 'text-slate-500 hover:bg-slate-100 dark:hover:bg-gray-800'
                    )}
                  >
                    {f.label} {f.count > 0 && <span className="ml-0.5 text-[10px]">({f.count})</span>}
                  </button>
                ))}
              </div>

              {/* Task list */}
              <div className="flex-1 overflow-y-auto px-2 py-2 space-y-1">
                {/* Chain group */}
                {chainTasks.length > 0 && (
                  <TaskChainGroup
                    parentTitle="Acme Corp — Post-Demo Sequence"
                    tasks={chainTasks}
                    selectedTaskId={selectedId}
                    nextInChainId={nextInChainId}
                    onSelectTask={handleSelectTask}
                  />
                )}
                {/* Standalone tasks */}
                {standaloneTasks.map(task => (
                  <SidebarTaskItem
                    key={task.id}
                    task={task}
                    isSelected={task.id === selectedId}
                    isNextInChain={false}
                    onClick={() => handleSelectTask(task.id)}
                  />
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Collapsed rail */}
        {sidebarCollapsed && (
          <div className="shrink-0 w-12 border-r border-slate-200 dark:border-gray-700/50 flex flex-col items-center pt-3 bg-slate-50/30 dark:bg-gray-900/30">
            <button onClick={() => setSidebarCollapsed(false)} className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-gray-800 text-slate-400">
              <PanelLeft className="h-4 w-4" />
            </button>
            <div className="mt-3 flex flex-col items-center gap-2">
              {counts.drafts > 0 && (
                <div className="w-6 h-6 rounded-full bg-emerald-100 flex items-center justify-center">
                  <span className="text-[10px] font-bold text-emerald-600">{counts.drafts}</span>
                </div>
              )}
            </div>
          </div>
        )}

        {/* CENTER: HEADER + CANVAS */}
        <div className="flex-1 flex flex-col min-w-0 bg-white dark:bg-gray-900/60">
          {selectedTask ? (
            <>
              {/* Task Detail Header */}
              <div className="shrink-0 flex items-center justify-between px-5 py-3 border-b border-slate-200 dark:border-gray-700/50 bg-white dark:bg-gray-900/80">
                <div className="flex items-center gap-3 min-w-0 flex-1">
                  <div className={cn('w-1.5 h-8 rounded-full', priorityConfig[selectedTask.priority].color)} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      {(() => {
                        const tc = taskTypeConfig[selectedTask.task_type];
                        return tc ? <tc.icon className={cn('h-4 w-4 shrink-0', tc.color)} /> : null;
                      })()}
                      <h2 className="text-sm font-semibold text-slate-800 dark:text-gray-200 truncate">{selectedTask.title}</h2>
                      {selectedTask.status === 'ai_working' && (
                        <Badge variant="secondary" className="text-[10px] bg-violet-50 dark:bg-violet-500/10 text-violet-500 shrink-0">
                          AI Working
                        </Badge>
                      )}
                    </div>
                    <div className="flex items-center gap-2 mt-0.5">
                      {selectedTask.company && (
                        <span className="text-[11px] text-slate-400 flex items-center gap-1">
                          <Building2 className="h-3 w-3" /> {selectedTask.company}
                        </span>
                      )}
                      {selectedTask.contact_name && (
                        <span className="text-[11px] text-slate-400 flex items-center gap-1">
                          <UserCircle className="h-3 w-3" /> {selectedTask.contact_name}
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <Button variant="ghost" size="sm" className="h-7 text-xs gap-1" onClick={handleCopyLink}>
                    <Copy className="h-3 w-3" /> Copy Link
                  </Button>
                  {!isCompleted && (
                    <>
                      <Button variant="outline" size="sm" className="h-7 text-xs" onClick={handleDismiss}>Dismiss</Button>
                      <Button size="sm" className="h-7 text-xs gap-1.5" onClick={handleApprove}>
                        <Check className="h-3 w-3" />
                        {selectedTask.deliverable_type === 'email_draft' ? 'Send Email' :
                         selectedTask.deliverable_type === 'slack_update' ? 'Post to Slack' :
                         selectedTask.deliverable_type === 'crm_update' ? 'Review Changes' :
                         'Approve'}
                      </Button>
                    </>
                  )}
                  <button
                    onClick={() => setContextOpen(!contextOpen)}
                    className={cn('p-1.5 rounded-lg transition-colors', contextOpen ? 'bg-blue-50 text-blue-600' : 'hover:bg-slate-100 text-slate-400')}
                  >
                    <Eye className="h-4 w-4" />
                  </button>
                </div>
              </div>

              {/* Canvas toolbar - minimal */}
              {!isCompleted && (
                <div className="shrink-0 flex items-center justify-end px-4 py-1.5 border-b border-slate-100 dark:border-gray-700/30">
                  <span className="text-[10px] text-slate-300 dark:text-gray-600">
                    Editable draft
                  </span>
                </div>
              )}

              {/* Undo banner */}
              {showUndoBanner && canvasVersions.length > 0 && (
                <div className="flex items-center justify-between px-4 py-1.5 bg-amber-50 dark:bg-amber-950/30 border-b border-amber-200 dark:border-amber-800">
                  <span className="text-xs text-amber-700 dark:text-amber-300">AI edited this draft</span>
                  <Button variant="ghost" size="sm" className="h-6 text-xs gap-1 text-amber-700 hover:text-amber-900" onClick={handleUndo}>
                    <RotateCcw className="h-3 w-3" /> Undo <span className="text-[9px] text-amber-500 ml-1">(Cmd+Z)</span>
                  </Button>
                </div>
              )}

              {/* Canvas content */}
              <div className="flex-1 overflow-y-auto">
                {selectedTask.status === 'ai_working' && (
                  <div className="mx-4 mt-3">
                    <div className="flex items-center gap-2.5 rounded-md border border-slate-200 dark:border-gray-700/50 bg-slate-50 dark:bg-gray-800/30 px-3 py-2">
                      <div className="w-1.5 h-1.5 rounded-full bg-violet-400 animate-pulse" />
                      <p className="text-xs text-slate-500 dark:text-gray-400">AI is drafting content...</p>
                    </div>
                  </div>
                )}
                <div className="px-8 py-6 max-w-3xl mx-auto w-full">
                  {!isCompleted ? (
                    <div className="relative">
                      {isStreaming && (
                        <div className="absolute top-0 right-0 flex items-center gap-1.5 text-[10px] text-slate-400 bg-slate-50 dark:bg-gray-800 border border-slate-200 dark:border-gray-700 rounded px-2 py-0.5 z-10">
                          <div className="w-1.5 h-1.5 rounded-full bg-violet-400 animate-pulse" /> Editing...
                        </div>
                      )}
                      <textarea
                        value={canvasContent}
                        onChange={e => setCanvasContent(e.target.value)}
                        placeholder="Start writing or let AI generate a draft..."
                        className={cn(
                          'w-full min-h-[200px] resize-none bg-transparent text-sm text-slate-700 dark:text-gray-300 leading-relaxed placeholder:text-slate-400 focus:outline-none transition-all',
                          isStreaming && 'ring-1 ring-violet-300 rounded'
                        )}
                        style={{ height: Math.max(200, canvasContent.split('\n').length * 20 + 40) }}
                      />
                    </div>
                  ) : (
                    <div className="text-center py-16">
                      <CheckCircle2 className="h-12 w-12 text-emerald-400 mx-auto mb-3" />
                      <p className="text-sm font-medium text-slate-500">Task completed</p>
                    </div>
                  )}
                </div>
              </div>

              {/* Bottom conversation area */}
              {!isCompleted && (
                <div className="shrink-0 border-t border-slate-200 dark:border-gray-700/50 bg-white dark:bg-gray-900/80">
                  {/* Messages */}
                  {conversation.length > 0 && (
                    <div className="max-h-32 overflow-y-auto px-4 py-2 space-y-2 border-b border-slate-100 dark:border-gray-800/50">
                      {conversation.map(msg => (
                        <div key={msg.id} className={cn('flex items-start gap-2', msg.role === 'user' && 'flex-row-reverse')}>
                          <div className={cn(
                            'w-5 h-5 rounded-full flex items-center justify-center shrink-0',
                            msg.role === 'assistant' ? 'bg-violet-100' : 'bg-blue-100'
                          )}>
                            {msg.role === 'assistant' ? <Sparkles className="h-2.5 w-2.5 text-violet-500" /> : <UserCircle className="h-2.5 w-2.5 text-blue-500" />}
                          </div>
                          <div className={cn(
                            'rounded-lg px-3 py-1.5 max-w-[75%] text-xs',
                            msg.role === 'assistant' ? 'bg-violet-50 text-violet-700' : 'bg-blue-50 text-blue-700'
                          )}>
                            {msg.content}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                  {/* Input */}
                  <div className="flex items-center gap-2 px-4 py-2.5">
                    <Bot className="h-4 w-4 text-violet-400 shrink-0" />
                    <input
                      type="text"
                      placeholder='Ask AI to refine... e.g. "Make it more concise" or "Add urgency"'
                      className="flex-1 text-xs bg-transparent text-slate-700 dark:text-gray-300 placeholder:text-slate-400 focus:outline-none"
                      onKeyDown={e => {
                        if (e.key === 'Enter' && (e.target as HTMLInputElement).value.trim()) {
                          handleCanvasSend((e.target as HTMLInputElement).value.trim());
                          (e.target as HTMLInputElement).value = '';
                        }
                      }}
                      disabled={isStreaming}
                    />
                    <span className="text-[10px] text-slate-300 shrink-0">Enter to send</span>
                  </div>
                </div>
              )}

              {/* AI Reasoning Footer */}
              {selectedTask.reasoning && (
                <div className="shrink-0 border-t border-violet-200 dark:border-violet-500/20 bg-violet-50/95 dark:bg-violet-500/5 px-4 py-2.5">
                  <div className="max-w-4xl mx-auto flex items-center gap-3">
                    <div className="shrink-0 w-7 h-7 rounded-full bg-violet-100 flex items-center justify-center">
                      <Brain className="w-3.5 h-3.5 text-violet-600" />
                    </div>
                    <div className="flex-1 min-w-0 flex items-center gap-3">
                      <span className="text-xs font-semibold text-violet-700 shrink-0">AI Reasoning</span>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <div className="w-12 h-1.5 bg-violet-200 rounded-full overflow-hidden">
                          <div className="h-full bg-violet-500 rounded-full" style={{ width: `${(selectedTask.confidence_score || 0) * 100}%` }} />
                        </div>
                        <span className="text-[10px] text-violet-600 font-medium">{Math.round((selectedTask.confidence_score || 0) * 100)}%</span>
                      </div>
                      <p className="text-xs text-violet-900 truncate">{selectedTask.reasoning}</p>
                    </div>
                  </div>
                </div>
              )}
            </>
          ) : (
            <div className="flex-1 flex items-center justify-center">
              <div className="text-center">
                <Inbox className="h-12 w-12 text-slate-200 mx-auto mb-4" />
                <p className="text-sm text-slate-400">Select a task to view details</p>
              </div>
            </div>
          )}
        </div>

        {/* RIGHT: CONTEXT PANEL */}
        <AnimatePresence mode="wait">
          {contextOpen && selectedTask && (
            <ContextPanel task={selectedTask} />
          )}
        </AnimatePresence>
      </div>

      {/* DIALOGS */}
      <ComposePreviewDialog open={composeOpen} task={selectedTask} onClose={() => setComposeOpen(false)} onSent={() => markCompleted(selectedId)} />
      <SlackPreviewDialog open={slackOpen} task={selectedTask} onClose={() => setSlackOpen(false)} onSent={() => markCompleted(selectedId)} />
      <CrmUpdateDialog open={crmOpen} task={selectedTask} onClose={() => setCrmOpen(false)} onConfirmed={() => markCompleted(selectedId)} />
    </div>
  );
}
