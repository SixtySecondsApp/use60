import React, { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  CheckCircle2, Circle, Clock, Sparkles, Send, Mail, FileText, Phone,
  Search, ChevronDown, ChevronRight, Building2, CalendarClock, AlertTriangle,
  Bot, Eye, Pencil, X, MoreHorizontal, Filter, ArrowUpDown, Zap, Brain,
  MessageSquare, Target, TrendingUp, BarChart3, Users, Loader2, Check,
  RefreshCw, BellRing, Inbox, ListFilter, LayoutGrid, Calendar,
  ArrowRight, ExternalLink, Flame, Timer, Shield, Lightbulb, FileSearch,
  ThumbsUp, ThumbsDown, RotateCcw, PauseCircle, Play
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Progress } from '@/components/ui/progress';
import { cn } from '@/lib/utils';

// ============================================================
// TYPES
// ============================================================

type TaskStatus = 'pending_review' | 'ai_working' | 'draft_ready' | 'in_progress' | 'pending' | 'completed' | 'dismissed';
type TaskType = 'email' | 'follow_up' | 'research' | 'meeting_prep' | 'crm_update' | 'proposal' | 'call' | 'content' | 'alert' | 'insight';
type Priority = 'urgent' | 'high' | 'medium' | 'low';
type RiskLevel = 'low' | 'medium' | 'high' | 'info';
type Source = 'ai_proactive' | 'meeting_transcript' | 'meeting_ai' | 'email_detected' | 'deal_signal' | 'calendar_trigger' | 'copilot' | 'manual';

interface MockTask {
  id: string;
  title: string;
  description?: string;
  status: TaskStatus;
  task_type: TaskType;
  priority: Priority;
  risk_level: RiskLevel;
  source: Source;
  confidence_score: number;
  reasoning?: string;
  due_date?: string;
  company?: string;
  contact_name?: string;
  deal_name?: string;
  auto_group: string;
  deliverable_type?: string;
  deliverable_preview?: string;
  ai_status: string;
  created_at: string;
  completed_at?: string;
  subtask_count?: number;
  subtask_completed?: number;
}

// ============================================================
// MOCK DATA
// ============================================================

const MOCK_TASKS: MockTask[] = [
  {
    id: '1',
    title: 'Draft follow-up email to Sarah Chen',
    description: 'Post-demo follow-up with pricing details and ROI calculator',
    status: 'draft_ready',
    task_type: 'email',
    priority: 'high',
    risk_level: 'high',
    source: 'meeting_ai',
    confidence_score: 0.94,
    reasoning: 'Sarah expressed strong interest in pricing during the demo. She asked about enterprise tiers twice.',
    due_date: '2026-02-16',
    company: 'Acme Corp',
    contact_name: 'Sarah Chen',
    deal_name: 'Acme Corp — Enterprise',
    auto_group: 'Acme Corp',
    deliverable_type: 'email_draft',
    deliverable_preview: `Hi Sarah,

Thank you for taking the time to see the platform in action today. Based on our conversation about scaling your team's outreach, I wanted to share a few things:

1. **Enterprise Pricing**: I've attached our enterprise tier breakdown — the plan that includes the AI copilot and unlimited sequences would be the best fit for your 12-person team.

2. **ROI Calculator**: Based on the numbers you shared (450 leads/month, 2.3% current conversion), our model projects a 3.4x improvement in qualified pipeline within 90 days.

3. **Security Review**: I know your IT team needs to review our SOC 2 Type II report — I've attached it along with our data processing agreement.

Would Thursday at 2pm work for a follow-up call with your VP of Sales? I'd love to walk through the implementation timeline together.

Best,
Alex`,
    ai_status: 'draft_ready',
    created_at: '2026-02-16T10:30:00Z',
  },
  {
    id: '2',
    title: 'Prep brief for GlobalTech strategy call',
    description: 'Compile attendee intel, deal history, and risk assessment',
    status: 'ai_working',
    task_type: 'meeting_prep',
    priority: 'high',
    risk_level: 'low',
    source: 'calendar_trigger',
    confidence_score: 0.98,
    reasoning: 'Meeting with GlobalTech leadership in 22 hours. 3 attendees identified.',
    due_date: '2026-02-17',
    company: 'GlobalTech',
    contact_name: 'Mike Rodriguez',
    deal_name: 'GlobalTech — Platform Migration',
    auto_group: 'GlobalTech',
    ai_status: 'working',
    created_at: '2026-02-16T08:00:00Z',
    subtask_count: 4,
    subtask_completed: 2,
  },
  {
    id: '3',
    title: 'Update deal stage: Acme Corp → Negotiation',
    description: 'Deal signals indicate progression — demo completed, pricing requested, security review initiated',
    status: 'pending_review',
    task_type: 'crm_update',
    priority: 'medium',
    risk_level: 'low',
    source: 'deal_signal',
    confidence_score: 0.91,
    reasoning: '3 buying signals detected: pricing request, security doc request, VP meeting invite.',
    company: 'Acme Corp',
    deal_name: 'Acme Corp — Enterprise',
    auto_group: 'Acme Corp',
    deliverable_type: 'crm_update',
    deliverable_preview: 'Stage: Proposal → Negotiation',
    ai_status: 'draft_ready',
    created_at: '2026-02-16T10:45:00Z',
  },
  {
    id: '4',
    title: 'Send pricing document to Mike at GlobalTech',
    description: 'Mike requested updated pricing with volume discounts during last call',
    status: 'draft_ready',
    task_type: 'email',
    priority: 'high',
    risk_level: 'high',
    source: 'meeting_transcript',
    confidence_score: 0.88,
    reasoning: 'Commitment detected in meeting transcript: "Can you send over the updated pricing with volume discounts?"',
    due_date: '2026-02-16',
    company: 'GlobalTech',
    contact_name: 'Mike Rodriguez',
    deal_name: 'GlobalTech — Platform Migration',
    auto_group: 'GlobalTech',
    deliverable_type: 'email_draft',
    deliverable_preview: `Hi Mike,

As promised, here's the updated pricing with the volume discounts we discussed. For 50+ seats, we're looking at:

- **Growth Plan**: $79/seat/mo (15% volume discount)
- **Enterprise Plan**: $129/seat/mo (20% volume discount)
- **Custom Enterprise**: Let's discuss — I can likely get approval for additional concessions given your commitment timeline.

The enterprise plan includes the dedicated CSM and custom integrations your team needs for the Salesforce migration.

Let me know if you have any questions before Thursday's call.

Best,
Alex`,
    ai_status: 'draft_ready',
    created_at: '2026-02-16T09:15:00Z',
  },
  {
    id: '5',
    title: 'Research BrightWave Inc before Friday call',
    description: 'New inbound lead — VP of Revenue Ops requested a demo',
    status: 'ai_working',
    task_type: 'research',
    priority: 'medium',
    risk_level: 'low',
    source: 'calendar_trigger',
    confidence_score: 0.96,
    reasoning: 'Demo call scheduled for Friday 2/20. No prior relationship data found.',
    due_date: '2026-02-20',
    company: 'BrightWave Inc',
    contact_name: 'Lisa Park',
    auto_group: 'BrightWave Inc',
    ai_status: 'working',
    created_at: '2026-02-16T08:00:00Z',
    subtask_count: 5,
    subtask_completed: 1,
  },
  {
    id: '6',
    title: 'Re-engage Jen Walker at TechFlow',
    description: 'No activity in 18 days — deal at risk of going cold',
    status: 'pending_review',
    task_type: 'follow_up',
    priority: 'urgent',
    risk_level: 'medium',
    source: 'ai_proactive',
    confidence_score: 0.82,
    reasoning: 'Deal "TechFlow — Growth Plan" has had no activity for 18 days. Last interaction was a positive demo. Deal value: $48K ARR.',
    due_date: '2026-02-14',
    company: 'TechFlow',
    contact_name: 'Jen Walker',
    deal_name: 'TechFlow — Growth Plan',
    auto_group: 'Overdue',
    ai_status: 'none',
    created_at: '2026-02-16T07:00:00Z',
  },
  {
    id: '7',
    title: 'Draft proposal for NovaStar partnership',
    description: 'Custom integration proposal based on requirements from Tuesday meeting',
    status: 'in_progress',
    task_type: 'proposal',
    priority: 'high',
    risk_level: 'medium',
    source: 'manual',
    confidence_score: 1.0,
    due_date: '2026-02-19',
    company: 'NovaStar',
    contact_name: 'David Kim',
    deal_name: 'NovaStar — Custom Integration',
    auto_group: 'NovaStar',
    ai_status: 'none',
    created_at: '2026-02-15T14:00:00Z',
    subtask_count: 3,
    subtask_completed: 1,
  },
  {
    id: '8',
    title: 'Call script for TechFlow re-engagement',
    description: 'AI-generated call prep with objection handling for stale deal recovery',
    status: 'draft_ready',
    task_type: 'call',
    priority: 'urgent',
    risk_level: 'medium',
    source: 'ai_proactive',
    confidence_score: 0.79,
    reasoning: 'Linked to TechFlow re-engagement. Call is more effective than email for stale deals (72% higher response rate in your history).',
    due_date: '2026-02-16',
    company: 'TechFlow',
    contact_name: 'Jen Walker',
    deal_name: 'TechFlow — Growth Plan',
    auto_group: 'Overdue',
    deliverable_type: 'call_script',
    deliverable_preview: `**Opening**: "Hey Jen, it's Alex from Sixty. I realized I dropped the ball on following up after our demo — wanted to check in and see if you had any questions."

**If she's still interested**: "Great! Last time we spoke, you were evaluating our Growth plan for the SDR team. Has anything changed on your end? I have some new case studies from companies similar to TechFlow I'd love to share."

**If she's gone cold**: "Totally understand. Would it be helpful if I sent over a quick 2-minute video walkthrough of the specific features you were most interested in? No pressure at all."

**Objection — Budget**: "I hear you. A few of our clients started with just 3 seats to prove ROI before scaling. Would a smaller pilot make sense?"`,
    ai_status: 'draft_ready',
    created_at: '2026-02-16T07:05:00Z',
  },
  {
    id: '9',
    title: 'Log Acme Corp demo in CRM',
    status: 'completed',
    task_type: 'crm_update',
    priority: 'low',
    risk_level: 'low',
    source: 'meeting_ai',
    confidence_score: 0.99,
    company: 'Acme Corp',
    deal_name: 'Acme Corp — Enterprise',
    auto_group: 'Completed Today',
    ai_status: 'executed',
    created_at: '2026-02-16T10:32:00Z',
    completed_at: '2026-02-16T10:32:05Z',
  },
  {
    id: '10',
    title: 'Share meeting recording with Sarah Chen',
    status: 'completed',
    task_type: 'email',
    priority: 'low',
    risk_level: 'low',
    source: 'meeting_ai',
    confidence_score: 0.95,
    company: 'Acme Corp',
    contact_name: 'Sarah Chen',
    auto_group: 'Completed Today',
    ai_status: 'executed',
    created_at: '2026-02-16T10:35:00Z',
    completed_at: '2026-02-16T10:36:00Z',
  },
  {
    id: '11',
    title: 'Pipeline health insight: 3 deals closing this month',
    description: 'Combined pipeline value: $186K ARR. Two deals need attention.',
    status: 'pending_review',
    task_type: 'insight',
    priority: 'medium',
    risk_level: 'info',
    source: 'ai_proactive',
    confidence_score: 0.90,
    reasoning: 'Monthly pipeline review: Acme ($72K) on track, GlobalTech ($66K) needs pricing approval, TechFlow ($48K) at risk.',
    auto_group: 'Insights',
    ai_status: 'none',
    created_at: '2026-02-16T07:00:00Z',
  },
];

// ============================================================
// HELPER COMPONENTS
// ============================================================

const priorityConfig: Record<Priority, { color: string; bg: string; border: string; label: string }> = {
  urgent: { color: 'text-red-700 dark:text-red-400', bg: 'bg-red-50 dark:bg-red-500/10', border: 'border-red-200 dark:border-red-500/20', label: 'Urgent' },
  high: { color: 'text-orange-700 dark:text-orange-400', bg: 'bg-orange-50 dark:bg-orange-500/10', border: 'border-orange-200 dark:border-orange-500/20', label: 'High' },
  medium: { color: 'text-blue-700 dark:text-blue-400', bg: 'bg-blue-50 dark:bg-blue-500/10', border: 'border-blue-200 dark:border-blue-500/20', label: 'Medium' },
  low: { color: 'text-slate-600 dark:text-slate-400', bg: 'bg-slate-50 dark:bg-slate-500/10', border: 'border-slate-200 dark:border-slate-500/20', label: 'Low' },
};

const typeConfig: Record<TaskType, { icon: typeof Mail; label: string; color: string }> = {
  email: { icon: Mail, label: 'Email', color: 'text-blue-500' },
  follow_up: { icon: RefreshCw, label: 'Follow-up', color: 'text-purple-500' },
  research: { icon: FileSearch, label: 'Research', color: 'text-cyan-500' },
  meeting_prep: { icon: CalendarClock, label: 'Meeting Prep', color: 'text-indigo-500' },
  crm_update: { icon: Target, label: 'CRM Update', color: 'text-emerald-500' },
  proposal: { icon: FileText, label: 'Proposal', color: 'text-amber-500' },
  call: { icon: Phone, label: 'Call', color: 'text-green-500' },
  content: { icon: Pencil, label: 'Content', color: 'text-pink-500' },
  alert: { icon: BellRing, label: 'Alert', color: 'text-red-500' },
  insight: { icon: Lightbulb, label: 'Insight', color: 'text-yellow-500' },
};

const sourceLabels: Record<Source, string> = {
  ai_proactive: 'AI Proactive',
  meeting_transcript: 'Meeting Commitment',
  meeting_ai: 'Post-Meeting AI',
  email_detected: 'Email Intent',
  deal_signal: 'Deal Signal',
  calendar_trigger: 'Calendar Trigger',
  copilot: 'Copilot',
  manual: 'Manual',
};

function PriorityBadge({ priority }: { priority: Priority }) {
  const config = priorityConfig[priority];
  return (
    <span className={cn('inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider border', config.bg, config.color, config.border)}>
      {config.label}
    </span>
  );
}

function AIStatusPill({ status, subtaskCount, subtaskCompleted }: { status: string; subtaskCount?: number; subtaskCompleted?: number }) {
  if (status === 'working') {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-violet-50 dark:bg-violet-500/10 border border-violet-200 dark:border-violet-500/20 px-2.5 py-0.5 text-[11px] font-medium text-violet-700 dark:text-violet-400">
        <Loader2 className="h-3 w-3 animate-spin" />
        AI working{subtaskCount ? ` (${subtaskCompleted}/${subtaskCount})` : '...'}
      </span>
    );
  }
  if (status === 'draft_ready') {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-200 dark:border-emerald-500/20 px-2.5 py-0.5 text-[11px] font-medium text-emerald-700 dark:text-emerald-400">
        <Sparkles className="h-3 w-3" />
        AI draft ready
      </span>
    );
  }
  if (status === 'executed') {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-50 dark:bg-slate-500/10 border border-slate-200 dark:border-slate-500/20 px-2.5 py-0.5 text-[11px] font-medium text-slate-500 dark:text-slate-400">
        <Bot className="h-3 w-3" />
        Auto-completed
      </span>
    );
  }
  return null;
}

function ConfidenceBar({ score }: { score: number }) {
  const pct = Math.round(score * 100);
  const color = pct >= 90 ? 'bg-emerald-500' : pct >= 70 ? 'bg-blue-500' : 'bg-amber-500';
  return (
    <div className="flex items-center gap-2">
      <div className="w-16 h-1.5 rounded-full bg-slate-100 dark:bg-gray-800 overflow-hidden">
        <div className={cn('h-full rounded-full transition-all', color)} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-[10px] text-slate-400 dark:text-gray-500 font-mono">{pct}%</span>
    </div>
  );
}

function SourceChip({ source }: { source: Source }) {
  const isAI = source !== 'manual';
  return (
    <span className={cn(
      'inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-medium',
      isAI
        ? 'bg-violet-50 dark:bg-violet-500/5 text-violet-600 dark:text-violet-400'
        : 'bg-slate-50 dark:bg-slate-500/5 text-slate-500 dark:text-slate-400'
    )}>
      {isAI && <Bot className="h-2.5 w-2.5" />}
      {sourceLabels[source]}
    </span>
  );
}

function DueDate({ date, status }: { date?: string; status: TaskStatus }) {
  if (!date) return null;
  const d = new Date(date);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const dueDay = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const diffDays = Math.round((dueDay.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));

  let label = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  let className = 'text-slate-500 dark:text-gray-400';

  if (status === 'completed') {
    className = 'text-slate-400 dark:text-gray-500';
  } else if (diffDays < 0) {
    label = `${Math.abs(diffDays)}d overdue`;
    className = 'text-red-600 dark:text-red-400 font-medium';
  } else if (diffDays === 0) {
    label = 'Today';
    className = 'text-orange-600 dark:text-orange-400 font-medium';
  } else if (diffDays === 1) {
    label = 'Tomorrow';
    className = 'text-blue-600 dark:text-blue-400';
  }

  return <span className={cn('text-xs', className)}>{label}</span>;
}

// ============================================================
// DELIVERABLE PREVIEW
// ============================================================

function DeliverablePreview({ task, onApprove, onDismiss }: { task: MockTask; onApprove: () => void; onDismiss: () => void }) {
  const [isExpanded, setIsExpanded] = useState(true);

  if (!task.deliverable_preview) return null;

  const isEmail = task.deliverable_type === 'email_draft';
  const isCrmUpdate = task.deliverable_type === 'crm_update';
  const isCallScript = task.deliverable_type === 'call_script';

  return (
    <motion.div
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: 'auto' }}
      exit={{ opacity: 0, height: 0 }}
      transition={{ duration: 0.2 }}
      className="mt-2 ml-7"
    >
      <div className="rounded-lg border border-slate-200 dark:border-gray-700/50 bg-slate-50/50 dark:bg-gray-800/30 overflow-hidden">
        {/* Preview header */}
        <div className="flex items-center justify-between px-3 py-2 border-b border-slate-200 dark:border-gray-700/50 bg-white/50 dark:bg-gray-800/50">
          <div className="flex items-center gap-2">
            <Sparkles className="h-3.5 w-3.5 text-violet-500" />
            <span className="text-xs font-medium text-slate-600 dark:text-gray-300">
              {isEmail ? 'Email Draft' : isCrmUpdate ? 'CRM Update' : isCallScript ? 'Call Script' : 'AI Output'}
            </span>
            {task.confidence_score && <ConfidenceBar score={task.confidence_score} />}
          </div>
          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className="p-1 rounded hover:bg-slate-100 dark:hover:bg-gray-700/50 text-slate-400"
          >
            {isExpanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
          </button>
        </div>

        {/* Preview content */}
        <AnimatePresence>
          {isExpanded && (
            <motion.div
              initial={{ height: 0 }}
              animate={{ height: 'auto' }}
              exit={{ height: 0 }}
              className="overflow-hidden"
            >
              {isCrmUpdate ? (
                <div className="px-3 py-3 flex items-center gap-3">
                  <div className="flex items-center gap-2">
                    <Badge variant="secondary">Proposal</Badge>
                    <ArrowRight className="h-3.5 w-3.5 text-slate-400" />
                    <Badge variant="default">Negotiation</Badge>
                  </div>
                  <span className="text-xs text-slate-500 dark:text-gray-400">3 buying signals detected</span>
                </div>
              ) : (
                <div className="px-3 py-3 max-h-48 overflow-y-auto">
                  <div className="text-xs text-slate-600 dark:text-gray-300 whitespace-pre-wrap leading-relaxed font-mono">
                    {task.deliverable_preview.slice(0, 400)}{task.deliverable_preview.length > 400 ? '...' : ''}
                  </div>
                </div>
              )}

              {/* Action buttons */}
              <div className="flex items-center gap-2 px-3 py-2.5 border-t border-slate-200 dark:border-gray-700/50 bg-white/50 dark:bg-gray-800/50">
                <Button size="sm" className="h-7 text-xs gap-1.5" onClick={onApprove}>
                  {isEmail ? <><Send className="h-3 w-3" /> Approve & Send</> :
                   isCrmUpdate ? <><Check className="h-3 w-3" /> Approve</> :
                   <><ThumbsUp className="h-3 w-3" /> Approve</>}
                </Button>
                <Button size="sm" variant="outline" className="h-7 text-xs gap-1.5">
                  <Pencil className="h-3 w-3" /> Edit
                </Button>
                <Button size="sm" variant="ghost" className="h-7 text-xs gap-1.5 text-slate-400" onClick={onDismiss}>
                  <X className="h-3 w-3" /> Dismiss
                </Button>
                {task.reasoning && (
                  <span className="ml-auto text-[10px] text-slate-400 dark:text-gray-500 max-w-xs truncate">
                    <Brain className="h-3 w-3 inline mr-1" />
                    {task.reasoning}
                  </span>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  );
}

// ============================================================
// TASK ROW
// ============================================================

function TaskRow({ task, onComplete, onExpand, isExpanded }: {
  task: MockTask;
  onComplete: (id: string) => void;
  onExpand: (id: string) => void;
  isExpanded: boolean;
}) {
  const TypeIcon = typeConfig[task.task_type].icon;
  const isCompleted = task.status === 'completed';
  const isDraftReady = task.status === 'draft_ready';
  const isAIWorking = task.status === 'ai_working' || task.ai_status === 'working';
  const isPendingReview = task.status === 'pending_review';
  const isOverdue = task.due_date && new Date(task.due_date) < new Date() && !isCompleted;

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      transition={{ duration: 0.15 }}
      className={cn(
        'group relative',
        isCompleted && 'opacity-50',
      )}
    >
      <div
        className={cn(
          'flex items-start gap-3 px-4 py-3 rounded-lg border transition-all cursor-pointer',
          isDraftReady && 'bg-emerald-50/30 dark:bg-emerald-500/5 border-emerald-200/50 dark:border-emerald-500/10 hover:border-emerald-300 dark:hover:border-emerald-500/20',
          isAIWorking && 'bg-violet-50/30 dark:bg-violet-500/5 border-violet-200/50 dark:border-violet-500/10',
          isPendingReview && 'bg-amber-50/20 dark:bg-amber-500/5 border-amber-200/30 dark:border-amber-500/10 hover:border-amber-300 dark:hover:border-amber-500/20',
          isOverdue && !isDraftReady && !isAIWorking && 'bg-red-50/20 dark:bg-red-500/5 border-red-200/30 dark:border-red-500/10',
          isCompleted && 'bg-slate-50/50 dark:bg-gray-800/20 border-slate-200/50 dark:border-gray-700/30',
          !isDraftReady && !isAIWorking && !isPendingReview && !isOverdue && !isCompleted && 'bg-white dark:bg-gray-900/40 border-slate-200 dark:border-gray-700/50 hover:border-slate-300 dark:hover:border-gray-600/50',
        )}
        onClick={() => onExpand(task.id)}
      >
        {/* Checkbox */}
        <div className="pt-0.5" onClick={(e) => { e.stopPropagation(); onComplete(task.id); }}>
          {isCompleted ? (
            <CheckCircle2 className="h-5 w-5 text-emerald-500" />
          ) : isAIWorking ? (
            <div className="relative">
              <Circle className="h-5 w-5 text-violet-300 dark:text-violet-600" />
              <Loader2 className="h-3 w-3 text-violet-500 absolute top-1 left-1 animate-spin" />
            </div>
          ) : (
            <Circle className="h-5 w-5 text-slate-300 dark:text-slate-600 group-hover:text-slate-400 dark:group-hover:text-slate-500 transition-colors" />
          )}
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <TypeIcon className={cn('h-3.5 w-3.5 shrink-0', typeConfig[task.task_type].color)} />
            <span className={cn(
              'text-sm font-medium text-slate-800 dark:text-gray-200',
              isCompleted && 'line-through text-slate-400 dark:text-gray-500'
            )}>
              {task.title}
            </span>
          </div>

          {/* Meta row */}
          <div className="flex items-center gap-2 mt-1 flex-wrap">
            <AIStatusPill status={task.ai_status} subtaskCount={task.subtask_count} subtaskCompleted={task.subtask_completed} />
            <SourceChip source={task.source} />
            {task.company && (
              <span className="inline-flex items-center gap-1 text-[11px] text-slate-500 dark:text-gray-400">
                <Building2 className="h-3 w-3" />
                {task.company}
              </span>
            )}
            {task.contact_name && (
              <span className="text-[11px] text-slate-400 dark:text-gray-500">
                {task.contact_name}
              </span>
            )}
            {task.deal_name && (
              <span className="hidden xl:inline-flex items-center gap-1 text-[11px] text-slate-400 dark:text-gray-500">
                <Target className="h-3 w-3" />
                {task.deal_name}
              </span>
            )}
          </div>

          {/* Subtask progress bar */}
          {task.subtask_count && task.subtask_count > 0 && (
            <div className="mt-2 flex items-center gap-2">
              <Progress value={(task.subtask_completed || 0) / task.subtask_count * 100} className="h-1 flex-1 max-w-32" />
              <span className="text-[10px] text-slate-400 dark:text-gray-500">{task.subtask_completed}/{task.subtask_count} steps</span>
            </div>
          )}
        </div>

        {/* Right side */}
        <div className="flex items-center gap-3 shrink-0">
          <PriorityBadge priority={task.priority} />
          <DueDate date={task.due_date} status={task.status} />
          <button className="p-1 rounded opacity-0 group-hover:opacity-100 hover:bg-slate-100 dark:hover:bg-gray-700/50 text-slate-400 transition-all">
            <MoreHorizontal className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Deliverable preview */}
      <AnimatePresence>
        {isExpanded && task.deliverable_preview && (
          <DeliverablePreview
            task={task}
            onApprove={() => onComplete(task.id)}
            onDismiss={() => {}}
          />
        )}
      </AnimatePresence>

      {/* AI reasoning tooltip on hover */}
      {isExpanded && task.reasoning && !task.deliverable_preview && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="mt-1 ml-8 text-xs text-slate-500 dark:text-gray-400 italic flex items-start gap-1.5"
        >
          <Brain className="h-3.5 w-3.5 shrink-0 mt-0.5 text-violet-400" />
          {task.reasoning}
        </motion.div>
      )}
    </motion.div>
  );
}

// ============================================================
// AUTO GROUP SECTION
// ============================================================

function AutoGroupSection({ title, tasks, icon: Icon, color, expandedTasks, onToggleExpand, onComplete }: {
  title: string;
  tasks: MockTask[];
  icon: typeof Building2;
  color: string;
  expandedTasks: Set<string>;
  onToggleExpand: (id: string) => void;
  onComplete: (id: string) => void;
}) {
  const [isCollapsed, setIsCollapsed] = useState(false);
  const completedCount = tasks.filter(t => t.status === 'completed').length;
  const draftCount = tasks.filter(t => t.ai_status === 'draft_ready').length;
  const workingCount = tasks.filter(t => t.ai_status === 'working').length;

  return (
    <div className="space-y-1">
      <button
        className="flex items-center gap-2 w-full px-2 py-1.5 rounded-md hover:bg-slate-50 dark:hover:bg-gray-800/30 transition-colors group"
        onClick={() => setIsCollapsed(!isCollapsed)}
      >
        {isCollapsed ? (
          <ChevronRight className="h-4 w-4 text-slate-400" />
        ) : (
          <ChevronDown className="h-4 w-4 text-slate-400" />
        )}
        <Icon className={cn('h-4 w-4', color)} />
        <span className="text-sm font-semibold text-slate-700 dark:text-gray-300">
          {title}
        </span>
        <span className="text-xs text-slate-400 dark:text-gray-500">
          {tasks.length} task{tasks.length !== 1 ? 's' : ''}
        </span>

        {/* Group status pills */}
        <div className="flex items-center gap-1.5 ml-auto">
          {draftCount > 0 && (
            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-200 dark:border-emerald-500/20 px-2 py-0.5 text-[10px] font-medium text-emerald-600 dark:text-emerald-400">
              <Sparkles className="h-2.5 w-2.5" /> {draftCount} draft{draftCount !== 1 ? 's' : ''}
            </span>
          )}
          {workingCount > 0 && (
            <span className="inline-flex items-center gap-1 rounded-full bg-violet-50 dark:bg-violet-500/10 border border-violet-200 dark:border-violet-500/20 px-2 py-0.5 text-[10px] font-medium text-violet-600 dark:text-violet-400">
              <Loader2 className="h-2.5 w-2.5 animate-spin" /> {workingCount}
            </span>
          )}
          {completedCount > 0 && completedCount < tasks.length && (
            <span className="text-[10px] text-slate-400 dark:text-gray-500">{completedCount}/{tasks.length} done</span>
          )}
        </div>
      </button>

      <AnimatePresence>
        {!isCollapsed && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="space-y-1.5 pl-2 overflow-hidden"
          >
            {tasks.map(task => (
              <TaskRow
                key={task.id}
                task={task}
                onComplete={onComplete}
                onExpand={onToggleExpand}
                isExpanded={expandedTasks.has(task.id)}
              />
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ============================================================
// STATS BAR
// ============================================================

function StatsBar({ tasks }: { tasks: MockTask[] }) {
  const active = tasks.filter(t => t.status !== 'completed' && t.status !== 'dismissed');
  const draftsReady = tasks.filter(t => t.ai_status === 'draft_ready').length;
  const aiWorking = tasks.filter(t => t.ai_status === 'working').length;
  const overdue = active.filter(t => t.due_date && new Date(t.due_date) < new Date()).length;
  const completedToday = tasks.filter(t => t.status === 'completed').length;
  const needsReview = tasks.filter(t => t.status === 'pending_review').length;

  const stats = [
    { label: 'Drafts Ready', value: draftsReady, icon: Sparkles, color: 'text-emerald-500', bg: 'bg-emerald-50 dark:bg-emerald-500/10' },
    { label: 'AI Working', value: aiWorking, icon: Bot, color: 'text-violet-500', bg: 'bg-violet-50 dark:bg-violet-500/10' },
    { label: 'Needs Review', value: needsReview, icon: Eye, color: 'text-amber-500', bg: 'bg-amber-50 dark:bg-amber-500/10' },
    { label: 'Overdue', value: overdue, icon: AlertTriangle, color: 'text-red-500', bg: 'bg-red-50 dark:bg-red-500/10' },
    { label: 'Done Today', value: completedToday, icon: CheckCircle2, color: 'text-slate-400', bg: 'bg-slate-50 dark:bg-slate-500/10' },
  ];

  return (
    <div className="grid grid-cols-5 gap-3">
      {stats.map(stat => (
        <motion.div
          key={stat.label}
          whileHover={{ scale: 1.02 }}
          className={cn(
            'flex items-center gap-3 rounded-xl border border-slate-200 dark:border-gray-700/50 px-4 py-3 cursor-pointer transition-all hover:shadow-sm',
            'bg-white dark:bg-gray-900/60'
          )}
        >
          <div className={cn('flex items-center justify-center w-9 h-9 rounded-lg', stat.bg)}>
            <stat.icon className={cn('h-4.5 w-4.5', stat.color)} />
          </div>
          <div>
            <div className="text-xl font-bold text-slate-800 dark:text-gray-100">{stat.value}</div>
            <div className="text-[11px] text-slate-500 dark:text-gray-400">{stat.label}</div>
          </div>
        </motion.div>
      ))}
    </div>
  );
}

// ============================================================
// FILTER BAR
// ============================================================

type FilterView = 'focus' | 'all' | 'drafts' | 'overdue' | 'today';

function FilterBar({ activeView, onViewChange, taskCount }: {
  activeView: FilterView;
  onViewChange: (v: FilterView) => void;
  taskCount: Record<FilterView, number>;
}) {
  const views: { id: FilterView; label: string; icon: typeof Inbox }[] = [
    { id: 'focus', label: 'My Focus', icon: Zap },
    { id: 'drafts', label: 'AI Drafts', icon: Sparkles },
    { id: 'overdue', label: 'Overdue', icon: AlertTriangle },
    { id: 'today', label: 'Today', icon: Calendar },
    { id: 'all', label: 'Everything', icon: Inbox },
  ];

  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-1 bg-slate-100/80 dark:bg-gray-800/50 rounded-lg p-1">
        {views.map(view => (
          <button
            key={view.id}
            onClick={() => onViewChange(view.id)}
            className={cn(
              'flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all',
              activeView === view.id
                ? 'bg-white dark:bg-gray-700 text-slate-800 dark:text-gray-200 shadow-sm'
                : 'text-slate-500 dark:text-gray-400 hover:text-slate-700 dark:hover:text-gray-300'
            )}
          >
            <view.icon className="h-3.5 w-3.5" />
            {view.label}
            {taskCount[view.id] > 0 && (
              <span className={cn(
                'rounded-full px-1.5 py-0.5 text-[10px] font-semibold',
                activeView === view.id
                  ? 'bg-blue-100 dark:bg-blue-500/20 text-blue-700 dark:text-blue-400'
                  : 'bg-slate-200 dark:bg-gray-700 text-slate-500 dark:text-gray-400'
              )}>
                {taskCount[view.id]}
              </span>
            )}
          </button>
        ))}
      </div>

      <div className="flex items-center gap-2">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
          <input
            type="text"
            placeholder="Search tasks..."
            className="h-8 w-56 rounded-lg border border-slate-200 dark:border-gray-700/50 bg-white dark:bg-gray-800/50 pl-8 pr-3 text-xs text-slate-700 dark:text-gray-300 placeholder:text-slate-400 dark:placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-300"
          />
        </div>
        <Button variant="outline" size="sm" className="h-8 text-xs gap-1.5">
          <ListFilter className="h-3.5 w-3.5" />
          Filter
        </Button>
        <Button variant="outline" size="sm" className="h-8 text-xs gap-1.5">
          <ArrowUpDown className="h-3.5 w-3.5" />
          Group
        </Button>
      </div>
    </div>
  );
}

// ============================================================
// MAIN PAGE
// ============================================================

export default function CommandCentreDemo() {
  const [tasks, setTasks] = useState<MockTask[]>(MOCK_TASKS);
  const [expandedTasks, setExpandedTasks] = useState<Set<string>>(new Set(['1']));
  const [activeView, setActiveView] = useState<FilterView>('focus');

  const handleComplete = (id: string) => {
    setTasks(prev => prev.map(t =>
      t.id === id
        ? { ...t, status: 'completed' as TaskStatus, completed_at: new Date().toISOString(), ai_status: 'executed' }
        : t
    ));
  };

  const handleToggleExpand = (id: string) => {
    setExpandedTasks(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // Filter tasks based on active view
  const filteredTasks = useMemo(() => {
    switch (activeView) {
      case 'focus':
        return tasks.filter(t => ['pending_review', 'draft_ready', 'ai_working', 'in_progress'].includes(t.status) || (t.due_date && new Date(t.due_date) <= new Date() && t.status !== 'completed'));
      case 'drafts':
        return tasks.filter(t => t.ai_status === 'draft_ready');
      case 'overdue':
        return tasks.filter(t => t.due_date && new Date(t.due_date) < new Date() && t.status !== 'completed');
      case 'today':
        return tasks.filter(t => {
          if (t.status === 'completed') return true;
          if (!t.due_date) return false;
          const d = new Date(t.due_date);
          const today = new Date();
          return d.toDateString() === today.toDateString() || d < today;
        });
      case 'all':
      default:
        return tasks;
    }
  }, [tasks, activeView]);

  // Count tasks for filter badges
  const taskCounts: Record<FilterView, number> = useMemo(() => ({
    focus: tasks.filter(t => ['pending_review', 'draft_ready', 'ai_working', 'in_progress'].includes(t.status) || (t.due_date && new Date(t.due_date) <= new Date() && t.status !== 'completed')).length,
    drafts: tasks.filter(t => t.ai_status === 'draft_ready').length,
    overdue: tasks.filter(t => t.due_date && new Date(t.due_date) < new Date() && t.status !== 'completed').length,
    today: tasks.filter(t => { if (!t.due_date) return false; const d = new Date(t.due_date); const today = new Date(); return d.toDateString() === today.toDateString() || (d < today && t.status !== 'completed'); }).length,
    all: tasks.length,
  }), [tasks]);

  // Group tasks by auto_group
  const groupedTasks = useMemo(() => {
    const groups: Record<string, MockTask[]> = {};
    filteredTasks.forEach(task => {
      const group = task.auto_group;
      if (!groups[group]) groups[group] = [];
      groups[group].push(task);
    });

    // Sort groups: Overdue first, then by highest priority task, Completed/Insights last
    const groupOrder = (name: string) => {
      if (name === 'Overdue') return 0;
      if (name === 'Completed Today') return 98;
      if (name === 'Insights') return 99;
      return 1;
    };

    return Object.entries(groups).sort(([a], [b]) => groupOrder(a) - groupOrder(b));
  }, [filteredTasks]);

  const groupIcons: Record<string, { icon: typeof Building2; color: string }> = {
    'Overdue': { icon: Flame, color: 'text-red-500' },
    'Acme Corp': { icon: Building2, color: 'text-blue-500' },
    'GlobalTech': { icon: Building2, color: 'text-indigo-500' },
    'TechFlow': { icon: Building2, color: 'text-purple-500' },
    'BrightWave Inc': { icon: Building2, color: 'text-cyan-500' },
    'NovaStar': { icon: Building2, color: 'text-amber-500' },
    'Completed Today': { icon: CheckCircle2, color: 'text-emerald-500' },
    'Insights': { icon: Lightbulb, color: 'text-yellow-500' },
  };

  return (
    <div className="min-h-screen bg-slate-50/50 dark:bg-gray-950">
      <div className="max-w-6xl mx-auto px-6 py-6">
        {/* Page Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <div className="flex items-center gap-3">
              <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-violet-600 shadow-lg shadow-blue-500/20">
                <Zap className="h-5 w-5 text-white" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-slate-900 dark:text-gray-100">Command Centre</h1>
                <p className="text-sm text-slate-500 dark:text-gray-400">
                  Sunday, February 16 — {tasks.filter(t => t.status !== 'completed' && t.status !== 'dismissed').length} active tasks
                </p>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" className="h-9 text-xs gap-1.5">
              <Bot className="h-3.5 w-3.5" />
              Ask AI
            </Button>
            <Button size="sm" className="h-9 text-xs gap-1.5">
              <Zap className="h-3.5 w-3.5" />
              Add Task
            </Button>
          </div>
        </div>

        {/* AI Daily Brief Banner */}
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-6"
        >
          <div className="relative overflow-hidden rounded-xl border border-violet-200/50 dark:border-violet-500/20 bg-gradient-to-r from-violet-50 via-blue-50 to-indigo-50 dark:from-violet-500/5 dark:via-blue-500/5 dark:to-indigo-500/5 p-4">
            <div className="absolute top-0 right-0 w-64 h-64 bg-gradient-to-bl from-violet-200/20 to-transparent rounded-full -translate-y-1/2 translate-x-1/2" />
            <div className="relative flex items-start gap-3">
              <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-violet-100 dark:bg-violet-500/20">
                <Brain className="h-4 w-4 text-violet-600 dark:text-violet-400" />
              </div>
              <div className="flex-1">
                <h3 className="text-sm font-semibold text-violet-900 dark:text-violet-300">Good morning, Alex</h3>
                <p className="text-xs text-violet-700/80 dark:text-violet-400/80 mt-0.5 leading-relaxed">
                  I drafted <strong>3 emails</strong> from yesterday's meetings, flagged <strong>1 at-risk deal</strong> (TechFlow — 18 days stale),
                  and prepped your <strong>GlobalTech call</strong> for tomorrow. Your pipeline has <strong>$186K closing this month</strong>.
                </p>
              </div>
              <Button variant="ghost" size="sm" className="h-7 text-xs text-violet-600 dark:text-violet-400 hover:bg-violet-100 dark:hover:bg-violet-500/20">
                View Full Brief
              </Button>
            </div>
          </div>
        </motion.div>

        {/* Stats Bar */}
        <div className="mb-6">
          <StatsBar tasks={tasks} />
        </div>

        {/* Filter Bar */}
        <div className="mb-4">
          <FilterBar activeView={activeView} onViewChange={setActiveView} taskCount={taskCounts} />
        </div>

        {/* Task Stream */}
        <div className="space-y-4">
          {groupedTasks.map(([groupName, groupTasks]) => {
            const config = groupIcons[groupName] || { icon: Building2, color: 'text-slate-500' };
            return (
              <AutoGroupSection
                key={groupName}
                title={groupName}
                tasks={groupTasks}
                icon={config.icon}
                color={config.color}
                expandedTasks={expandedTasks}
                onToggleExpand={handleToggleExpand}
                onComplete={handleComplete}
              />
            );
          })}
        </div>

        {/* Quick Add Bar */}
        <div className="mt-4 px-4">
          <button className="flex items-center gap-2 w-full py-2.5 text-sm text-slate-400 dark:text-gray-500 hover:text-slate-600 dark:hover:text-gray-300 transition-colors group">
            <div className="flex items-center justify-center w-5 h-5 rounded border border-dashed border-slate-300 dark:border-gray-600 group-hover:border-blue-400 group-hover:bg-blue-50 dark:group-hover:bg-blue-500/10 transition-all">
              <span className="text-xs">+</span>
            </div>
            Add task...
            <span className="text-xs text-slate-300 dark:text-gray-600 ml-auto">or press N</span>
          </button>
        </div>

        {/* Demo Label */}
        <div className="mt-8 mb-4 flex items-center justify-center">
          <div className="inline-flex items-center gap-2 rounded-full bg-slate-100 dark:bg-gray-800/50 border border-slate-200 dark:border-gray-700/50 px-4 py-2 text-xs text-slate-500 dark:text-gray-400">
            <Shield className="h-3.5 w-3.5" />
            Command Centre Demo — Mock Data
          </div>
        </div>
      </div>
    </div>
  );
}
