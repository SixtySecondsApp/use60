/**
 * Commitment Detection Engine — Fully Simulated Demo
 *
 * Showcases the AI-powered commitment detection pipeline that runs
 * automatically after a meeting ends. No backend calls — everything
 * is mock data with timed animations.
 *
 * Route: /commitment-detection-demo
 * No backend, no auth — works for anyone.
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Brain, Sparkles, CheckCircle2, Circle, Clock, Send,
  FileText, CalendarClock, Users, DollarSign, UserPlus,
  Swords, ShieldAlert, MessageSquare, Video,
  Loader2, RotateCcw, Target, Mail, RefreshCw,
  Hash, AlertTriangle, TrendingUp, Zap, Bot,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

// ============================================================
// TYPES
// ============================================================

type Phase = 'idle' | 'banner' | 'analyzing' | 'detecting' | 'complete';

interface TranscriptSegment {
  id: string;
  speaker: 'rep' | 'prospect';
  speakerName: string;
  timestamp: string;
  text: string;
  commitmentId?: string;
}

interface CommitmentAction {
  id: string;
  label: string;
  icon: React.ElementType;
  delay: number; // ms after commitment card appears
}

interface Commitment {
  id: string;
  intent: string;
  confidence: number;
  segmentId: string;
  speaker: 'rep' | 'prospect';
  speakerName: string;
  timeInCall: string;
  quote: string;
  actions: CommitmentAction[];
  detectedAtOffset: number; // ms after 'detecting' phase starts
  taskTitle: string;
}

interface MockTask {
  id: string;
  title: string;
  priority: 'urgent' | 'high' | 'medium';
  commitmentId: string;
  type: string;
}

// ============================================================
// INTENT CONFIG
// ============================================================

const INTENT_CONFIG: Record<string, {
  label: string;
  color: string;
  bg: string;
  icon: React.ElementType;
}> = {
  send_proposal: {
    label: 'Send Proposal',
    color: 'text-amber-600 dark:text-amber-400',
    bg: 'bg-amber-50 dark:bg-amber-500/10 border-amber-200 dark:border-amber-500/20',
    icon: FileText,
  },
  schedule_meeting: {
    label: 'Schedule Meeting',
    color: 'text-indigo-600 dark:text-indigo-400',
    bg: 'bg-indigo-50 dark:bg-indigo-500/10 border-indigo-200 dark:border-indigo-500/20',
    icon: CalendarClock,
  },
  send_content: {
    label: 'Send Content',
    color: 'text-cyan-600 dark:text-cyan-400',
    bg: 'bg-cyan-50 dark:bg-cyan-500/10 border-cyan-200 dark:border-cyan-500/20',
    icon: Send,
  },
  check_with_team: {
    label: 'Check with Team',
    color: 'text-blue-600 dark:text-blue-400',
    bg: 'bg-blue-50 dark:bg-blue-500/10 border-blue-200 dark:border-blue-500/20',
    icon: Users,
  },
  pricing_request: {
    label: 'Pricing Request',
    color: 'text-violet-600 dark:text-violet-400',
    bg: 'bg-violet-50 dark:bg-violet-500/10 border-violet-200 dark:border-violet-500/20',
    icon: DollarSign,
  },
  stakeholder_introduction: {
    label: 'New Stakeholder',
    color: 'text-pink-600 dark:text-pink-400',
    bg: 'bg-pink-50 dark:bg-pink-500/10 border-pink-200 dark:border-pink-500/20',
    icon: UserPlus,
  },
  competitive_mention: {
    label: 'Competitive Signal',
    color: 'text-red-600 dark:text-red-400',
    bg: 'bg-red-50 dark:bg-red-500/10 border-red-200 dark:border-red-500/20',
    icon: Swords,
  },
  timeline_signal: {
    label: 'Timeline Signal',
    color: 'text-orange-600 dark:text-orange-400',
    bg: 'bg-orange-50 dark:bg-orange-500/10 border-orange-200 dark:border-orange-500/20',
    icon: Clock,
  },
  objection_blocker: {
    label: 'Objection / Blocker',
    color: 'text-rose-600 dark:text-rose-400',
    bg: 'bg-rose-50 dark:bg-rose-500/10 border-rose-200 dark:border-rose-500/20',
    icon: ShieldAlert,
  },
  general: {
    label: 'General',
    color: 'text-slate-600 dark:text-slate-400',
    bg: 'bg-slate-50 dark:bg-slate-500/10 border-slate-200 dark:border-slate-500/20',
    icon: Circle,
  },
};

// ============================================================
// MOCK TRANSCRIPT DATA
// ============================================================

const TRANSCRIPT_SEGMENTS: TranscriptSegment[] = [
  {
    id: 'seg-1',
    speaker: 'rep',
    speakerName: 'Alex Rivera',
    timestamp: '0:32',
    text: "Thanks for making time today, James. I know Q3 planning is in full swing for you.",
  },
  {
    id: 'seg-2',
    speaker: 'prospect',
    speakerName: 'James Chen',
    timestamp: '0:48',
    text: "Absolutely. We've been struggling with pipeline visibility — deals are slipping and we don't always know why until it's too late.",
  },
  {
    id: 'seg-3',
    speaker: 'rep',
    speakerName: 'Alex Rivera',
    timestamp: '1:15',
    text: "That's exactly the problem we solve. Let me walk you through how our AI tracks deal health in real-time. Before I do — can you share what your current stack looks like?",
  },
  {
    id: 'seg-4',
    speaker: 'prospect',
    speakerName: 'James Chen',
    timestamp: '1:45',
    text: "We're on Salesforce, using Outreach for sequences. The data hygiene is terrible though — reps don't update CRM after calls.",
  },
  {
    id: 'seg-5',
    speaker: 'rep',
    speakerName: 'Alex Rivera',
    timestamp: '3:20',
    text: "We integrate natively with Salesforce. The system auto-updates deal fields after every call — zero rep input required. I'll get the proposal over to you by end of day Friday with the Salesforce integration specs.",
    commitmentId: 'c-1',
  },
  {
    id: 'seg-6',
    speaker: 'prospect',
    speakerName: 'James Chen',
    timestamp: '4:10',
    text: "That's interesting. How does the AI handle our custom deal stages? We have a pretty non-standard process.",
  },
  {
    id: 'seg-7',
    speaker: 'rep',
    speakerName: 'Alex Rivera',
    timestamp: '4:35',
    text: "Great question. Let me check with our technical team on that integration question — I want to give you an accurate answer rather than guess. I'll have a detailed response by tomorrow.",
    commitmentId: 'c-2',
  },
  {
    id: 'seg-8',
    speaker: 'prospect',
    speakerName: 'James Chen',
    timestamp: '6:00',
    text: "Fair enough. I should mention — we're also evaluating Gong for this. They showed us their platform last week and it was impressive.",
    commitmentId: 'c-3',
  },
  {
    id: 'seg-9',
    speaker: 'rep',
    speakerName: 'Alex Rivera',
    timestamp: '6:25',
    text: "I appreciate you being upfront. We hear that often. The key differentiator for us is that we're built specifically for the post-meeting workflow — Gong is great at recording but the action automation is where we win.",
  },
  {
    id: 'seg-10',
    speaker: 'prospect',
    speakerName: 'James Chen',
    timestamp: '8:15',
    text: "That makes sense. One thing I need to be clear about — we need to have a solution in place before Q3. That's a hard deadline for us, the board is expecting a report on our ops efficiency improvements.",
    commitmentId: 'c-4',
  },
  {
    id: 'seg-11',
    speaker: 'rep',
    speakerName: 'Alex Rivera',
    timestamp: '9:00',
    text: "Q3 is absolutely achievable. We've done implementations in under 3 weeks for similar-sized teams. I'll send over the case study from that similar deployment we did for TechCorp — their Ops team had the exact same setup as yours.",
    commitmentId: 'c-5',
  },
  {
    id: 'seg-12',
    speaker: 'prospect',
    speakerName: 'James Chen',
    timestamp: '11:20',
    text: "Good. But security is a major concern for us — we'd need SOC 2 at minimum. We had a vendor last year who couldn't meet compliance and it was a nightmare.",
    commitmentId: 'c-6',
  },
  {
    id: 'seg-13',
    speaker: 'rep',
    speakerName: 'Alex Rivera',
    timestamp: '11:50',
    text: "We're SOC 2 Type II certified and GDPR compliant. I can send you the full security report — most deals like yours involve a security review and we have a dedicated package for it.",
  },
  {
    id: 'seg-14',
    speaker: 'prospect',
    speakerName: 'James Chen',
    timestamp: '14:30',
    text: "I need to loop in our CISO, Patricia Wells, before we can move forward. She has final sign-off on any new data tools. Can you send something she can review?",
    commitmentId: 'c-7',
  },
  {
    id: 'seg-15',
    speaker: 'rep',
    speakerName: 'Alex Rivera',
    timestamp: '15:00',
    text: "Absolutely. I'll draft an intro email to Patricia with our security documentation attached. That's exactly the right step.",
  },
  {
    id: 'seg-16',
    speaker: 'prospect',
    speakerName: 'James Chen',
    timestamp: '17:45',
    text: "What would pricing look like for our team? We're probably talking 200 seats across the whole revenue org — sales, CS, and ops.",
  },
  {
    id: 'seg-17',
    speaker: 'rep',
    speakerName: 'Alex Rivera',
    timestamp: '18:10',
    text: "Great — let me put together pricing for the 200-seat Enterprise tier you mentioned. At that scale you'd also get a dedicated CSM and implementation support included.",
    commitmentId: 'c-8',
  },
  {
    id: 'seg-18',
    speaker: 'prospect',
    speakerName: 'James Chen',
    timestamp: '19:30',
    text: "That sounds reasonable. Let's plan to reconnect once you have the proposal and after Patricia has had a chance to review the security docs.",
  },
];

// ============================================================
// MOCK COMMITMENTS DATA
// ============================================================

const COMMITMENTS: Commitment[] = [
  {
    id: 'c-1',
    intent: 'send_proposal',
    confidence: 0.95,
    segmentId: 'seg-5',
    speaker: 'rep',
    speakerName: 'Alex Rivera',
    timeInCall: '3:20',
    quote: "I'll get the proposal over to you by end of day Friday with the Salesforce integration specs.",
    detectedAtOffset: 0,
    taskTitle: 'Send proposal to James Chen by Friday EOD',
    actions: [
      { id: 'a1-1', label: 'Task created', icon: CheckCircle2, delay: 600 },
      { id: 'a1-2', label: 'CRM deal stage updated', icon: RefreshCw, delay: 1200 },
      { id: 'a1-3', label: 'Slack DM sent to Alex', icon: Hash, delay: 1800 },
    ],
  },
  {
    id: 'c-2',
    intent: 'check_with_team',
    confidence: 0.82,
    segmentId: 'seg-7',
    speaker: 'rep',
    speakerName: 'Alex Rivera',
    timeInCall: '4:35',
    quote: "Let me check with our technical team on that integration question — I want to give you an accurate answer rather than guess.",
    detectedAtOffset: 2200,
    taskTitle: 'Check with engineering on custom Salesforce stage mapping',
    actions: [
      { id: 'a2-1', label: 'Task created', icon: CheckCircle2, delay: 600 },
      { id: 'a2-2', label: '#engineering channel pinged', icon: Hash, delay: 1400 },
    ],
  },
  {
    id: 'c-3',
    intent: 'competitive_mention',
    confidence: 0.88,
    segmentId: 'seg-8',
    speaker: 'prospect',
    speakerName: 'James Chen',
    timeInCall: '6:00',
    quote: "We're also evaluating Gong for this — they showed us their platform last week and it was impressive.",
    detectedAtOffset: 4400,
    taskTitle: 'Competitive intelligence — Gong in evaluation at Acme Corp',
    actions: [
      { id: 'a3-1', label: 'Competitor intel task created', icon: Target, delay: 600 },
      { id: 'a3-2', label: 'MEDDICC competitor field updated', icon: RefreshCw, delay: 1200 },
      { id: 'a3-3', label: 'Manager alert sent', icon: AlertTriangle, delay: 2000 },
    ],
  },
  {
    id: 'c-4',
    intent: 'timeline_signal',
    confidence: 0.85,
    segmentId: 'seg-10',
    speaker: 'prospect',
    speakerName: 'James Chen',
    timeInCall: '8:15',
    quote: "We need to have a solution in place before Q3 — that's a hard deadline for us, the board is expecting a report.",
    detectedAtOffset: 6600,
    taskTitle: 'Deal timeline: Q3 hard deadline — update close date',
    actions: [
      { id: 'a4-1', label: 'Task created', icon: CheckCircle2, delay: 600 },
      { id: 'a4-2', label: 'Deal close date set to Jun 30', icon: CalendarClock, delay: 1300 },
    ],
  },
  {
    id: 'c-5',
    intent: 'send_content',
    confidence: 0.90,
    segmentId: 'seg-11',
    speaker: 'rep',
    speakerName: 'Alex Rivera',
    timeInCall: '9:00',
    quote: "I'll send over the case study from that similar deployment we did for TechCorp — their Ops team had the exact same setup.",
    detectedAtOffset: 8800,
    taskTitle: 'Send TechCorp case study to James Chen',
    actions: [
      { id: 'a5-1', label: 'Content delivery task created', icon: Send, delay: 600 },
      { id: 'a5-2', label: 'Case study queued for send', icon: FileText, delay: 1500 },
    ],
  },
  {
    id: 'c-6',
    intent: 'objection_blocker',
    confidence: 0.78,
    segmentId: 'seg-12',
    speaker: 'prospect',
    speakerName: 'James Chen',
    timeInCall: '11:20',
    quote: "Security is a major concern — we'd need SOC 2 at minimum. We had a vendor last year who couldn't meet compliance.",
    detectedAtOffset: 11000,
    taskTitle: 'Security objection — send SOC 2 report and compliance package',
    actions: [
      { id: 'a6-1', label: 'Objection playbook task created', icon: ShieldAlert, delay: 600 },
      { id: 'a6-2', label: 'Risk flag added to deal', icon: AlertTriangle, delay: 1200 },
      { id: 'a6-3', label: 'CRM objection field updated', icon: RefreshCw, delay: 2200 },
    ],
  },
  {
    id: 'c-7',
    intent: 'stakeholder_introduction',
    confidence: 0.80,
    segmentId: 'seg-14',
    speaker: 'prospect',
    speakerName: 'James Chen',
    timeInCall: '14:30',
    quote: "I need to loop in our CISO, Patricia Wells, before we can move forward. She has final sign-off on any new data tools.",
    detectedAtOffset: 13200,
    taskTitle: 'New stakeholder: Patricia Wells (CISO) — draft intro email',
    actions: [
      { id: 'a7-1', label: 'Stakeholder task created', icon: UserPlus, delay: 600 },
      { id: 'a7-2', label: 'Intro email drafted', icon: Mail, delay: 1600 },
    ],
  },
  {
    id: 'c-8',
    intent: 'pricing_request',
    confidence: 0.92,
    segmentId: 'seg-17',
    speaker: 'rep',
    speakerName: 'Alex Rivera',
    timeInCall: '18:10',
    quote: "Let me put together pricing for the 200-seat Enterprise tier you mentioned.",
    detectedAtOffset: 15400,
    taskTitle: 'Prepare 200-seat Enterprise pricing for Acme Corp',
    actions: [
      { id: 'a8-1', label: 'Pricing proposal task created', icon: DollarSign, delay: 600 },
      { id: 'a8-2', label: 'Deal tagged Enterprise tier', icon: TrendingUp, delay: 1200 },
      { id: 'a8-3', label: 'Slack DM sent to Alex', icon: Hash, delay: 1900 },
    ],
  },
];

// Build a lookup for which commitments link to which segments
const SEGMENT_TO_COMMITMENT = new Map<string, string>();
COMMITMENTS.forEach(c => SEGMENT_TO_COMMITMENT.set(c.segmentId, c.id));

// ============================================================
// SUB-COMPONENTS
// ============================================================

// --- Meeting Banner ---
function MeetingBanner({ visible }: { visible: boolean }) {
  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ y: -60, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: -60, opacity: 0 }}
          transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
          className="flex items-center gap-3 px-4 py-2.5 bg-violet-600 dark:bg-violet-700 text-white text-[13px] font-medium"
        >
          <Video className="w-4 h-4 shrink-0" />
          <span className="font-semibold">Meeting ended 2 min ago</span>
          <span className="text-violet-200 dark:text-violet-300">·</span>
          <span className="text-violet-100">Discovery Call with Acme Corp</span>
          <span className="text-violet-200 dark:text-violet-300">·</span>
          <span className="text-violet-200">James Chen, VP Operations</span>
          <div className="ml-auto flex items-center gap-1.5 text-violet-200">
            <Loader2 className="w-3.5 h-3.5 animate-spin [animation-duration:3s]" />
            <span className="text-[11px]">AI analyzing transcript…</span>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

// --- Transcript Segment ---
function SegmentItem({
  segment,
  isHighlighted,
  segRef,
}: {
  segment: TranscriptSegment;
  isHighlighted: boolean;
  segRef: (el: HTMLDivElement | null) => void;
}) {
  const isRep = segment.speaker === 'rep';

  return (
    <div
      ref={segRef}
      className={cn(
        'px-3 py-2.5 rounded-lg transition-all duration-500',
        isHighlighted
          ? 'bg-violet-50 dark:bg-violet-500/10 border-l-2 border-l-violet-400'
          : 'border-l-2 border-l-transparent hover:bg-slate-50 dark:hover:bg-gray-800/50',
      )}
    >
      <div className="flex items-baseline gap-2 mb-1">
        <span
          className={cn(
            'text-[11px] font-semibold shrink-0',
            isRep ? 'text-blue-600 dark:text-blue-400' : 'text-emerald-600 dark:text-emerald-400',
          )}
        >
          {segment.speakerName}
        </span>
        <span className="text-[10px] text-slate-400 dark:text-gray-500">{segment.timestamp}</span>
      </div>
      <p
        className={cn(
          'text-[12px] leading-relaxed transition-colors duration-300',
          isHighlighted
            ? 'text-slate-800 dark:text-gray-100'
            : 'text-slate-600 dark:text-gray-400',
        )}
      >
        {segment.text}
      </p>
    </div>
  );
}

// --- Action Item in Commitment Card ---
function ActionItem({
  action,
  isDone,
  isLoading,
}: {
  action: CommitmentAction;
  isDone: boolean;
  isLoading: boolean;
}) {
  const Icon = action.icon;

  return (
    <div className="flex items-center gap-2">
      <div className="w-3.5 h-3.5 shrink-0 flex items-center justify-center">
        {isDone ? (
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: [0, 1.3, 1] }}
            transition={{ duration: 0.3 }}
          >
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 dark:text-emerald-400" />
          </motion.div>
        ) : isLoading ? (
          <Loader2 className="w-3.5 h-3.5 text-violet-500 animate-spin [animation-duration:1.5s]" />
        ) : (
          <Circle className="w-3.5 h-3.5 text-slate-300 dark:text-gray-600" />
        )}
      </div>
      <Icon
        className={cn(
          'w-3 h-3 shrink-0',
          isDone
            ? 'text-emerald-500 dark:text-emerald-400'
            : isLoading
              ? 'text-violet-400'
              : 'text-slate-300 dark:text-gray-600',
        )}
      />
      <span
        className={cn(
          'text-[11px] transition-colors duration-200',
          isDone
            ? 'text-slate-600 dark:text-gray-300 line-through decoration-emerald-400'
            : isLoading
              ? 'text-violet-500 dark:text-violet-400'
              : 'text-slate-400 dark:text-gray-600',
        )}
      >
        {action.label}
      </span>
    </div>
  );
}

// --- Commitment Card ---
function CommitmentCard({
  commitment,
  completedActions,
}: {
  commitment: Commitment;
  completedActions: Set<string>;
}) {
  const config = INTENT_CONFIG[commitment.intent] ?? INTENT_CONFIG.general;
  const IntentIcon = config.icon;

  // Determine action states
  const getActionState = (action: CommitmentAction) => {
    const doneKey = `${commitment.id}:${action.id}`;
    if (completedActions.has(doneKey)) return 'done';
    // Check if any later action is done to know this one is loading
    const actionIdx = commitment.actions.indexOf(action);
    const nextAction = commitment.actions[actionIdx + 1];
    if (nextAction && completedActions.has(`${commitment.id}:${nextAction.id}`)) return 'done';
    // Is this the next one to complete?
    const lastDone = commitment.actions
      .filter(a => completedActions.has(`${commitment.id}:${a.id}`))
      .at(-1);
    const lastDoneIdx = lastDone ? commitment.actions.indexOf(lastDone) : -1;
    if (actionIdx === lastDoneIdx + 1) return 'loading';
    return 'pending';
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
      className="rounded-xl border border-slate-200 dark:border-gray-700/50 bg-white dark:bg-gray-900/80 shadow-sm overflow-hidden"
    >
      {/* Header */}
      <div className="px-4 pt-3 pb-2 border-b border-slate-100 dark:border-gray-700/50 flex items-center gap-2">
        {/* Speaker pill */}
        <span
          className={cn(
            'text-[10px] font-semibold px-1.5 py-0.5 rounded-full',
            commitment.speaker === 'rep'
              ? 'bg-blue-50 dark:bg-blue-500/10 text-blue-600 dark:text-blue-400'
              : 'bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
          )}
        >
          {commitment.speakerName}
        </span>
        <span className="text-[10px] text-slate-400 dark:text-gray-500">{commitment.timeInCall}</span>
        <div className="ml-auto flex items-center gap-1">
          {/* Intent badge */}
          <span
            className={cn(
              'inline-flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-full border',
              config.bg,
              config.color,
            )}
          >
            <IntentIcon className="w-2.5 h-2.5" />
            {config.label}
          </span>
        </div>
      </div>

      {/* Quote */}
      <div className="px-4 py-2.5">
        <blockquote className="text-[12px] leading-relaxed text-slate-700 dark:text-gray-300 italic border-l-2 border-violet-300 dark:border-violet-500/50 pl-2.5">
          "{commitment.quote}"
        </blockquote>
      </div>

      {/* Confidence bar */}
      <div className="px-4 pb-2">
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-slate-400 dark:text-gray-500">Confidence</span>
          <div className="flex-1 h-1.5 rounded-full bg-slate-100 dark:bg-gray-700 overflow-hidden">
            <motion.div
              className="h-1.5 rounded-full bg-violet-500"
              initial={{ width: 0 }}
              animate={{ width: `${commitment.confidence * 100}%` }}
              transition={{ duration: 0.8, delay: 0.2 }}
            />
          </div>
          <span className="text-[10px] font-medium text-violet-600 dark:text-violet-400">
            {Math.round(commitment.confidence * 100)}%
          </span>
        </div>
      </div>

      {/* Actions checklist */}
      <div className="px-4 pb-3 space-y-1.5 border-t border-slate-100 dark:border-gray-700/50 pt-2.5">
        {commitment.actions.map(action => {
          const state = getActionState(action);
          return (
            <ActionItem
              key={action.id}
              action={action}
              isDone={state === 'done'}
              isLoading={state === 'loading'}
            />
          );
        })}
      </div>
    </motion.div>
  );
}

// --- Task Preview Item (right column) ---
function TaskPreviewItem({ task }: { task: MockTask }) {
  const priorityConfig = {
    urgent: 'bg-red-50 dark:bg-red-500/10 text-red-600 dark:text-red-400 border-red-200 dark:border-red-500/20',
    high: 'bg-amber-50 dark:bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-200 dark:border-amber-500/20',
    medium: 'bg-blue-50 dark:bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-200 dark:border-blue-500/20',
  };

  const config = INTENT_CONFIG[task.type] ?? INTENT_CONFIG.general;
  const TypeIcon = config.icon;

  return (
    <motion.div
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.3 }}
      className="group px-3 py-2.5 rounded-lg border border-slate-200 dark:border-gray-700/50 bg-white dark:bg-gray-800/60 hover:bg-slate-50 dark:hover:bg-gray-800 transition-colors duration-150"
    >
      <div className="flex items-start gap-2">
        <div className="mt-0.5 w-5 h-5 rounded-full bg-violet-50 dark:bg-violet-500/10 flex items-center justify-center shrink-0">
          <TypeIcon className={cn('w-2.5 h-2.5', config.color)} />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-[12px] text-slate-700 dark:text-gray-300 leading-snug line-clamp-2">
            {task.title}
          </p>
          <div className="mt-1 flex items-center gap-1.5">
            <span
              className={cn(
                'text-[9px] font-medium px-1.5 py-0.5 rounded-full border',
                priorityConfig[task.priority],
              )}
            >
              {task.priority}
            </span>
            <span className="text-[9px] text-slate-400 dark:text-gray-500">just now</span>
          </div>
        </div>
        <Circle className="w-3.5 h-3.5 text-slate-300 dark:text-gray-600 shrink-0 mt-0.5" />
      </div>
    </motion.div>
  );
}

// --- Analyzing Shimmer ---
function AnalyzingState() {
  return (
    <div className="flex-1 flex items-center justify-center">
      <div className="text-center space-y-4">
        <div className="relative inline-flex">
          <div className="w-16 h-16 rounded-full bg-violet-50 dark:bg-violet-500/10 flex items-center justify-center">
            <Brain className="w-8 h-8 text-violet-500 dark:text-violet-400" />
          </div>
          <div className="absolute inset-0 rounded-full border-2 border-violet-400 animate-ping opacity-30" />
        </div>
        <div className="space-y-1">
          <p className="text-[14px] font-semibold text-slate-700 dark:text-gray-200">
            Analyzing transcript…
          </p>
          <p className="text-[12px] text-slate-400 dark:text-gray-500">
            Extracting commitments, signals, and next steps
          </p>
        </div>
        <div className="flex items-center justify-center gap-1.5 text-[11px] text-slate-400 dark:text-gray-500">
          <Loader2 className="w-3.5 h-3.5 animate-spin [animation-duration:3s] text-violet-400" />
          <span>Processing 28 minutes of conversation</span>
        </div>
        {/* Shimmer placeholders */}
        <div className="w-80 space-y-2.5 mt-4">
          {[100, 85, 95].map((w, i) => (
            <div key={i} className="space-y-1.5">
              <div
                className="h-3 rounded-full bg-slate-100 dark:bg-gray-700 animate-pulse"
                style={{ width: `${w}%` }}
              />
              <div
                className="h-2.5 rounded-full bg-slate-100 dark:bg-gray-700 animate-pulse"
                style={{ width: `${w * 0.7}%` }}
              />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// --- Summary Panel ---
function SummaryPanel({ onReplay }: { onReplay: () => void }) {
  const stats = [
    { label: 'Commitments', value: '8', icon: Brain, color: 'text-violet-500' },
    { label: 'Tasks Created', value: '9', icon: CheckCircle2, color: 'text-emerald-500' },
    { label: 'CRM Updates', value: '5', icon: RefreshCw, color: 'text-blue-500' },
    { label: 'Slack Alerts', value: '3', icon: Hash, color: 'text-indigo-500' },
  ];

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
      className="rounded-xl border border-violet-200 dark:border-violet-500/30 bg-violet-50/50 dark:bg-violet-500/5 overflow-hidden"
    >
      <div className="px-4 py-3 border-b border-violet-100 dark:border-violet-500/20 flex items-center gap-2">
        <Sparkles className="w-4 h-4 text-violet-500" />
        <span className="text-[13px] font-semibold text-violet-700 dark:text-violet-300">
          Analysis Complete
        </span>
        <div className="ml-auto">
          <Button
            variant="ghost"
            size="sm"
            onClick={onReplay}
            className="h-7 px-2.5 text-[11px] text-slate-500 dark:text-gray-400 hover:text-violet-600 dark:hover:text-violet-400"
          >
            <RotateCcw className="w-3 h-3 mr-1" />
            Replay
          </Button>
        </div>
      </div>
      <div className="p-4 space-y-3">
        <div className="grid grid-cols-4 gap-2">
          {stats.map(stat => {
            const Icon = stat.icon;
            return (
              <div
                key={stat.label}
                className="text-center p-2 rounded-lg bg-white dark:bg-gray-900/50 border border-violet-100 dark:border-violet-500/20"
              >
                <Icon className={cn('w-4 h-4 mx-auto mb-1', stat.color)} />
                <div className="text-[18px] font-bold text-slate-800 dark:text-gray-100">
                  {stat.value}
                </div>
                <div className="text-[9px] text-slate-500 dark:text-gray-400">{stat.label}</div>
              </div>
            );
          })}
        </div>
        {/* Buying signal score */}
        <div className="flex items-center gap-3 p-3 rounded-lg bg-white dark:bg-gray-900/50 border border-violet-100 dark:border-violet-500/20">
          <TrendingUp className="w-5 h-5 text-emerald-500 shrink-0" />
          <div className="flex-1">
            <div className="text-[11px] font-medium text-slate-600 dark:text-gray-300">
              Buying Signal Score
            </div>
            <div className="mt-1 h-1.5 rounded-full bg-slate-100 dark:bg-gray-700 overflow-hidden">
              <motion.div
                className="h-1.5 rounded-full bg-emerald-500"
                initial={{ width: 0 }}
                animate={{ width: '85%' }}
                transition={{ duration: 1, delay: 0.3 }}
              />
            </div>
          </div>
          <div className="text-[20px] font-bold text-emerald-600 dark:text-emerald-400 shrink-0">
            85
            <span className="text-[11px] text-slate-400 dark:text-gray-500 font-normal">/100</span>
          </div>
        </div>
      </div>
    </motion.div>
  );
}

// ============================================================
// MAIN PAGE COMPONENT
// ============================================================

export default function CommitmentDetectionDemo() {
  const [phase, setPhase] = useState<Phase>('idle');
  const [detectedIds, setDetectedIds] = useState<string[]>([]);
  const [highlightedSegments, setHighlightedSegments] = useState<Set<string>>(new Set());
  const [completedActions, setCompletedActions] = useState<Set<string>>(new Set());
  const [createdTasks, setCreatedTasks] = useState<MockTask[]>([]);
  const [runKey, setRunKey] = useState(0);

  const timeoutsRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  const segmentRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const transcriptScrollRef = useRef<HTMLDivElement>(null);

  const scheduleTimeout = useCallback((fn: () => void, delay: number) => {
    const id = setTimeout(fn, delay);
    timeoutsRef.current.push(id);
    return id;
  }, []);

  function handleReplay() {
    timeoutsRef.current.forEach(clearTimeout);
    timeoutsRef.current = [];
    setPhase('idle');
    setDetectedIds([]);
    setHighlightedSegments(new Set());
    setCompletedActions(new Set());
    setCreatedTasks([]);
    setTimeout(() => setRunKey(k => k + 1), 150);
  }

  useEffect(() => {
    // Clear previous timeouts on re-run
    timeoutsRef.current.forEach(clearTimeout);
    timeoutsRef.current = [];

    // Phase: banner
    scheduleTimeout(() => setPhase('banner'), 0);

    // Phase: analyzing
    scheduleTimeout(() => setPhase('analyzing'), 1200);

    // Phase: detecting (commitment cards start)
    const DETECTING_START = 3000;
    scheduleTimeout(() => setPhase('detecting'), DETECTING_START);

    // Schedule each commitment
    COMMITMENTS.forEach(commitment => {
      const cardTime = DETECTING_START + commitment.detectedAtOffset;

      // Reveal commitment card + highlight transcript segment
      scheduleTimeout(() => {
        setDetectedIds(prev => [...prev, commitment.id]);
        setHighlightedSegments(prev => {
          const next = new Set(prev);
          next.add(commitment.segmentId);
          return next;
        });

        // Auto-scroll transcript to the highlighted segment
        const el = segmentRefs.current.get(commitment.segmentId);
        if (el) {
          el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }

        // Create task in right panel shortly after card appears
        scheduleTimeout(() => {
          const intentConfig = INTENT_CONFIG[commitment.intent] ?? INTENT_CONFIG.general;
          setCreatedTasks(prev => [
            ...prev,
            {
              id: `task-${commitment.id}`,
              title: commitment.taskTitle,
              priority: commitment.confidence > 0.9
                ? 'urgent'
                : commitment.confidence > 0.83
                  ? 'high'
                  : 'medium',
              commitmentId: commitment.id,
              type: commitment.intent,
            },
          ]);
        }, 400);

        // Tick actions one by one
        commitment.actions.forEach(action => {
          scheduleTimeout(() => {
            setCompletedActions(prev => {
              const next = new Set(prev);
              next.add(`${commitment.id}:${action.id}`);
              return next;
            });
          }, action.delay);
        });
      }, cardTime);
    });

    // Phase: complete
    const COMPLETE_TIME = DETECTING_START + 15400 + 4000; // last commitment + 4s buffer
    scheduleTimeout(() => setPhase('complete'), COMPLETE_TIME);

    return () => {
      timeoutsRef.current.forEach(clearTimeout);
    };
  }, [runKey, scheduleTimeout]);

  const showBanner = phase !== 'idle';
  const showAnalyzing = phase === 'analyzing';
  const showDetecting = phase === 'detecting' || phase === 'complete';
  const showComplete = phase === 'complete';

  return (
    <div className="flex flex-col h-[calc(100vh-4rem)] min-h-[600px] bg-white dark:bg-gray-950 overflow-hidden">
      {/* Meeting ended banner */}
      <MeetingBanner visible={showBanner} />

      {/* Main 3-column layout */}
      <div className="flex flex-1 overflow-hidden">
        {/* ── LEFT: Transcript ── */}
        <div className="w-[300px] shrink-0 flex flex-col border-r border-slate-200 dark:border-gray-800">
          {/* Header */}
          <div className="px-4 py-3 border-b border-slate-200 dark:border-gray-800 flex items-center gap-2 shrink-0">
            <MessageSquare className="w-4 h-4 text-slate-400 dark:text-gray-500" />
            <span className="text-[12px] font-semibold text-slate-700 dark:text-gray-300">
              Transcript
            </span>
            <span className="text-[11px] text-slate-400 dark:text-gray-500">· 28 min</span>
            <div className="ml-auto flex items-center gap-1 text-[10px] text-slate-400 dark:text-gray-500">
              <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              Live
            </div>
          </div>
          {/* Segments */}
          <div
            ref={transcriptScrollRef}
            className="flex-1 overflow-y-auto p-2 space-y-0.5 scroll-smooth"
          >
            {TRANSCRIPT_SEGMENTS.map(segment => (
              <SegmentItem
                key={segment.id}
                segment={segment}
                isHighlighted={highlightedSegments.has(segment.id)}
                segRef={el => {
                  if (el) {
                    segmentRefs.current.set(segment.id, el);
                  } else {
                    segmentRefs.current.delete(segment.id);
                  }
                }}
              />
            ))}
          </div>
        </div>

        {/* ── CENTER: Detection Feed ── */}
        <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
          {/* Header */}
          <div className="px-5 py-3 border-b border-slate-200 dark:border-gray-800 flex items-center gap-2 shrink-0">
            <Brain className="w-4 h-4 text-violet-500" />
            <span className="text-[12px] font-semibold text-slate-700 dark:text-gray-300">
              Commitment Detection
            </span>
            {showDetecting && (
              <div className="flex items-center gap-1.5 ml-1">
                <div className="w-1.5 h-1.5 rounded-full bg-violet-400 animate-pulse" />
                <span className="text-[10px] text-violet-500 dark:text-violet-400">Scanning</span>
              </div>
            )}
            {showDetecting && (
              <div className="ml-auto flex items-center gap-1.5 text-[11px] text-slate-400 dark:text-gray-500">
                <span>{detectedIds.length} / 8</span>
              </div>
            )}
          </div>

          {/* Feed content */}
          <div className="flex-1 overflow-y-auto p-4">
            {showAnalyzing && !showDetecting && <AnalyzingState />}

            {showDetecting && (
              <div className="space-y-3">
                <AnimatePresence>
                  {detectedIds.map(id => {
                    const commitment = COMMITMENTS.find(c => c.id === id);
                    if (!commitment) return null;
                    return (
                      <CommitmentCard
                        key={id}
                        commitment={commitment}
                        completedActions={completedActions}
                      />
                    );
                  })}
                </AnimatePresence>

                {/* Summary panel at end */}
                <AnimatePresence>
                  {showComplete && (
                    <SummaryPanel key="summary" onReplay={handleReplay} />
                  )}
                </AnimatePresence>
              </div>
            )}

            {phase === 'idle' && (
              <div className="flex-1 flex items-center justify-center h-full">
                <div className="text-center space-y-3">
                  <div className="w-14 h-14 rounded-full bg-slate-50 dark:bg-gray-800 flex items-center justify-center mx-auto">
                    <Bot className="w-7 h-7 text-slate-300 dark:text-gray-600" />
                  </div>
                  <p className="text-[13px] text-slate-400 dark:text-gray-500">
                    Waiting for meeting to end…
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* ── RIGHT: Command Centre Preview ── */}
        <div className="w-[300px] shrink-0 flex flex-col border-l border-slate-200 dark:border-gray-800">
          {/* Header */}
          <div className="px-4 py-3 border-b border-slate-200 dark:border-gray-800 flex items-center gap-2 shrink-0">
            <Sparkles className="w-4 h-4 text-violet-400" />
            <span className="text-[12px] font-semibold text-slate-700 dark:text-gray-300">
              Command Centre
            </span>
            <AnimatePresence>
              {createdTasks.length > 0 && (
                <motion.span
                  key="task-count"
                  initial={{ scale: 0, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  className="ml-auto inline-flex items-center justify-center w-5 h-5 rounded-full bg-violet-500 text-white text-[10px] font-bold"
                >
                  {createdTasks.length}
                </motion.span>
              )}
            </AnimatePresence>
          </div>

          {/* Task list */}
          <div className="flex-1 overflow-y-auto p-3 space-y-2">
            {createdTasks.length === 0 ? (
              <div className="h-full flex items-center justify-center">
                <div className="text-center space-y-2">
                  <Zap className="w-6 h-6 text-slate-200 dark:text-gray-700 mx-auto" />
                  <p className="text-[11px] text-slate-300 dark:text-gray-600">
                    Tasks will appear here
                  </p>
                </div>
              </div>
            ) : (
              <AnimatePresence>
                {createdTasks.map(task => (
                  <TaskPreviewItem key={task.id} task={task} />
                ))}
              </AnimatePresence>
            )}
          </div>

          {/* Bottom replay button (always visible when complete) */}
          <AnimatePresence>
            {showComplete && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="p-3 border-t border-slate-200 dark:border-gray-800"
              >
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleReplay}
                  className="w-full text-[12px] h-8 border-violet-200 dark:border-violet-500/30 text-violet-600 dark:text-violet-400 hover:bg-violet-50 dark:hover:bg-violet-500/10"
                >
                  <RotateCcw className="w-3 h-3 mr-1.5" />
                  Replay Demo
                </Button>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* Bottom status bar */}
      <AnimatePresence>
        {showComplete && (
          <motion.div
            initial={{ y: 40, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
            className="shrink-0 px-5 py-2.5 border-t border-violet-200 dark:border-violet-500/30 bg-violet-50/60 dark:bg-violet-500/5 flex items-center gap-3"
          >
            <Sparkles className="w-4 h-4 text-violet-500 shrink-0" />
            <span className="text-[12px] font-medium text-violet-700 dark:text-violet-300">
              Analysis Complete
            </span>
            <span className="text-[12px] text-violet-500 dark:text-violet-400">·</span>
            <span className="text-[12px] text-slate-600 dark:text-gray-400">
              8 commitments detected
            </span>
            <span className="text-[12px] text-slate-400 dark:text-gray-600">·</span>
            <span className="text-[12px] text-slate-600 dark:text-gray-400">
              9 tasks created
            </span>
            <span className="text-[12px] text-slate-400 dark:text-gray-600">·</span>
            <span className="text-[12px] text-slate-600 dark:text-gray-400">
              5 CRM updates queued
            </span>
            <span className="text-[12px] text-slate-400 dark:text-gray-600">·</span>
            <div className="flex items-center gap-1">
              <TrendingUp className="w-3.5 h-3.5 text-emerald-500" />
              <span className="text-[12px] font-semibold text-emerald-600 dark:text-emerald-400">
                Buying Signal: 85/100
              </span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
