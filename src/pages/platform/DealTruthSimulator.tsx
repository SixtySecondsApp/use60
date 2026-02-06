/**
 * DealTruthSimulator
 *
 * Platform admin tool to visualize and simulate the Deal Truth + Close Plan system.
 * Supports both mock data and real data from the database.
 *
 * Features:
 * - Visualize 6 Deal Truth fields with confidence scores
 * - Show Close Plan milestones with progress tracking
 * - Display Clarity and Momentum scores with animated gauges
 * - Simulate meeting/email extraction
 * - Toggle between mock and real data
 */

import { useState, useMemo, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';
import {
  Target,
  Users,
  DollarSign,
  ArrowRight,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Loader2,
  Sparkles,
  RefreshCw,
  Zap,
  MessageSquare,
  Mail,
  Activity,
  TrendingUp,
  Shield,
  Eye,
  ChevronDown,
  ChevronUp,
  Play,
  Pause,
  RotateCcw,
} from 'lucide-react';
import { BackToPlatform } from '@/components/platform/BackToPlatform';
import { cn } from '@/lib/utils';
import { supabase } from '@/lib/supabase/clientV2';
import { useAuth } from '@/lib/contexts/AuthContext';
import { useOrg } from '@/lib/contexts/OrgContext';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Progress } from '@/components/ui/progress';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

// =============================================================================
// Types
// =============================================================================

type DealTruthFieldKey = 'pain' | 'success_metric' | 'champion' | 'economic_buyer' | 'next_step' | 'top_risks';
type ChampionStrength = 'strong' | 'moderate' | 'weak' | 'unknown';
type MilestoneStatus = 'pending' | 'in_progress' | 'completed' | 'blocked' | 'skipped';
type SourceType = 'meeting_transcript' | 'email' | 'crm_sync' | 'manual' | 'ai_inferred';

interface DealTruthField {
  field_key: DealTruthFieldKey;
  value: string | null;
  confidence: number;
  source: SourceType | null;
  contact_name?: string;
  champion_strength?: ChampionStrength;
  next_step_date?: string;
}

interface ClosePlanItem {
  id: string;
  milestone_key: string;
  title: string;
  status: MilestoneStatus;
  due_date?: string;
  owner_name?: string;
  blocker_note?: string;
}

interface ClarityScores {
  clarity_score: number;
  next_step_score: number;
  economic_buyer_score: number;
  champion_score: number;
  success_metric_score: number;
  risks_score: number;
  close_plan_completed: number;
  close_plan_total: number;
  close_plan_overdue: number;
  momentum_score: number;
}

interface DealOption {
  id: string;
  name: string;
  company_name: string | null;
  value: number | null;
}

// =============================================================================
// Mock Data
// =============================================================================

const MOCK_TRUTH_FIELDS: DealTruthField[] = [
  {
    field_key: 'pain',
    value: 'Manual deal tracking takes 2+ hours daily, pipeline visibility is poor, forecasting is inaccurate',
    confidence: 0.85,
    source: 'meeting_transcript',
  },
  {
    field_key: 'success_metric',
    value: '50% reduction in admin time, 95% forecast accuracy, real-time pipeline visibility',
    confidence: 0.78,
    source: 'meeting_transcript',
  },
  {
    field_key: 'champion',
    value: 'Sarah Mitchell (VP Sales)',
    confidence: 0.92,
    source: 'manual',
    contact_name: 'Sarah Mitchell',
    champion_strength: 'strong',
  },
  {
    field_key: 'economic_buyer',
    value: 'James Chen (CRO)',
    confidence: 0.70,
    source: 'email',
    contact_name: 'James Chen',
  },
  {
    field_key: 'next_step',
    value: 'Demo to leadership team - Jan 15',
    confidence: 0.95,
    source: 'manual',
    next_step_date: '2026-01-15',
  },
  {
    field_key: 'top_risks',
    value: 'Budget approval pending Q1, competing priorities with ERP migration',
    confidence: 0.65,
    source: 'ai_inferred',
  },
];

const MOCK_CLOSE_PLAN: ClosePlanItem[] = [
  { id: '1', milestone_key: 'success_criteria', title: 'Success criteria confirmed', status: 'completed', owner_name: 'You' },
  { id: '2', milestone_key: 'stakeholders_mapped', title: 'Stakeholders mapped', status: 'completed', owner_name: 'You' },
  { id: '3', milestone_key: 'solution_fit', title: 'Solution fit confirmed', status: 'in_progress', due_date: '2026-01-10', owner_name: 'SE Team' },
  { id: '4', milestone_key: 'commercials_aligned', title: 'Commercials aligned', status: 'pending', due_date: '2026-01-20', owner_name: 'You' },
  { id: '5', milestone_key: 'legal_procurement', title: 'Legal/procurement progressing', status: 'pending', due_date: '2026-01-25', owner_name: 'Legal' },
  { id: '6', milestone_key: 'signature_kickoff', title: 'Signature + kickoff scheduled', status: 'pending', due_date: '2026-01-31', owner_name: 'You' },
];

const MOCK_CLARITY_SCORES: ClarityScores = {
  clarity_score: 72,
  next_step_score: 30,
  economic_buyer_score: 12,
  champion_score: 20,
  success_metric_score: 10,
  risks_score: 0,
  close_plan_completed: 2,
  close_plan_total: 6,
  close_plan_overdue: 0,
  momentum_score: 68,
};

// =============================================================================
// Field Metadata
// =============================================================================

const FIELD_META: Record<DealTruthFieldKey, { label: string; icon: typeof Target; maxScore: number; color: string }> = {
  next_step: { label: 'Next Step', icon: ArrowRight, maxScore: 30, color: 'text-emerald-500' },
  economic_buyer: { label: 'Economic Buyer', icon: DollarSign, maxScore: 25, color: 'text-blue-500' },
  champion: { label: 'Champion', icon: Users, maxScore: 20, color: 'text-purple-500' },
  success_metric: { label: 'Success Metric', icon: Target, maxScore: 15, color: 'text-amber-500' },
  pain: { label: 'Pain Point', icon: AlertTriangle, maxScore: 0, color: 'text-red-500' },
  top_risks: { label: 'Top Risks', icon: Shield, maxScore: 10, color: 'text-orange-500' },
};

const SOURCE_META: Record<SourceType, { label: string; color: string; confidence: number }> = {
  manual: { label: 'Manual', color: 'bg-emerald-100 text-emerald-700', confidence: 0.95 },
  meeting_transcript: { label: 'Meeting', color: 'bg-purple-100 text-purple-700', confidence: 0.85 },
  email: { label: 'Email', color: 'bg-blue-100 text-blue-700', confidence: 0.70 },
  crm_sync: { label: 'CRM', color: 'bg-amber-100 text-amber-700', confidence: 0.60 },
  ai_inferred: { label: 'AI', color: 'bg-pink-100 text-pink-700', confidence: 0.50 },
};

const MILESTONE_STATUS_META: Record<MilestoneStatus, { label: string; color: string; icon: typeof CheckCircle2 }> = {
  completed: { label: 'Completed', color: 'text-emerald-500', icon: CheckCircle2 },
  in_progress: { label: 'In Progress', color: 'text-blue-500', icon: Activity },
  pending: { label: 'Pending', color: 'text-gray-400', icon: Clock },
  blocked: { label: 'Blocked', color: 'text-red-500', icon: AlertTriangle },
  skipped: { label: 'Skipped', color: 'text-gray-300', icon: ArrowRight },
};

// =============================================================================
// Animated Gauge Component
// =============================================================================

function AnimatedGauge({
  value,
  maxValue = 100,
  label,
  color,
  size = 'large',
}: {
  value: number;
  maxValue?: number;
  label: string;
  color: string;
  size?: 'small' | 'large';
}) {
  const [animatedValue, setAnimatedValue] = useState(0);
  const percentage = Math.round((value / maxValue) * 100);
  const circumference = 2 * Math.PI * 45;
  const strokeDashoffset = circumference - (animatedValue / 100) * circumference;

  useEffect(() => {
    const timer = setTimeout(() => setAnimatedValue(percentage), 100);
    return () => clearTimeout(timer);
  }, [percentage]);

  const isLarge = size === 'large';
  const sizeClass = isLarge ? 'w-32 h-32' : 'w-20 h-20';
  const textSize = isLarge ? 'text-3xl' : 'text-xl';

  return (
    <div className="flex flex-col items-center">
      <div className={cn('relative', sizeClass)}>
        <svg className="w-full h-full transform -rotate-90">
          {/* Background circle */}
          <circle
            cx="50%"
            cy="50%"
            r="45%"
            fill="none"
            stroke="currentColor"
            strokeWidth="8"
            className="text-gray-200 dark:text-gray-700"
          />
          {/* Progress circle */}
          <motion.circle
            cx="50%"
            cy="50%"
            r="45%"
            fill="none"
            stroke="currentColor"
            strokeWidth="8"
            strokeLinecap="round"
            className={color}
            style={{
              strokeDasharray: circumference,
            }}
            initial={{ strokeDashoffset: circumference }}
            animate={{ strokeDashoffset }}
            transition={{ duration: 1.5, ease: 'easeOut' }}
          />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          <motion.span
            className={cn('font-bold', textSize)}
            initial={{ opacity: 0, scale: 0.5 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.5, duration: 0.5 }}
          >
            {Math.round(animatedValue)}
          </motion.span>
        </div>
      </div>
      <span className={cn('mt-2 font-medium text-gray-600 dark:text-gray-400', isLarge ? 'text-sm' : 'text-xs')}>
        {label}
      </span>
    </div>
  );
}

// =============================================================================
// Confidence Bar Component
// =============================================================================

function ConfidenceBar({ confidence, source }: { confidence: number; source: SourceType | null }) {
  const sourceMeta = source ? SOURCE_META[source] : null;
  const percentage = Math.round(confidence * 100);

  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
        <motion.div
          className={cn(
            'h-full rounded-full',
            confidence >= 0.8 ? 'bg-emerald-500' :
            confidence >= 0.6 ? 'bg-amber-500' :
            confidence >= 0.4 ? 'bg-orange-500' : 'bg-red-500'
          )}
          initial={{ width: 0 }}
          animate={{ width: `${percentage}%` }}
          transition={{ duration: 0.8, ease: 'easeOut' }}
        />
      </div>
      <span className="text-xs font-medium text-gray-500 w-8">{percentage}%</span>
      {sourceMeta && (
        <Badge variant="secondary" className={cn('text-xs', sourceMeta.color)}>
          {sourceMeta.label}
        </Badge>
      )}
    </div>
  );
}

// =============================================================================
// Deal Truth Field Card Component
// =============================================================================

function TruthFieldCard({ field, isAnimating }: { field: DealTruthField; isAnimating?: boolean }) {
  const meta = FIELD_META[field.field_key];
  const Icon = meta.icon;

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      className={cn(
        'p-4 rounded-lg border bg-white dark:bg-gray-900',
        isAnimating && 'ring-2 ring-indigo-500 ring-offset-2'
      )}
    >
      <div className="flex items-start gap-3">
        <div className={cn('p-2 rounded-lg bg-gray-100 dark:bg-gray-800', meta.color)}>
          <Icon className="w-4 h-4" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between mb-1">
            <span className="font-medium text-sm text-gray-900 dark:text-white">{meta.label}</span>
            {field.field_key === 'champion' && field.champion_strength && (
              <Badge
                variant="secondary"
                className={cn(
                  'text-xs',
                  field.champion_strength === 'strong' && 'bg-emerald-100 text-emerald-700',
                  field.champion_strength === 'moderate' && 'bg-amber-100 text-amber-700',
                  field.champion_strength === 'weak' && 'bg-red-100 text-red-700'
                )}
              >
                {field.champion_strength}
              </Badge>
            )}
          </div>
          {field.value ? (
            <p className="text-sm text-gray-600 dark:text-gray-400 line-clamp-2">{field.value}</p>
          ) : (
            <p className="text-sm text-gray-400 italic">Not yet captured</p>
          )}
          {field.next_step_date && (
            <div className="flex items-center gap-1 mt-1 text-xs text-gray-500">
              <Clock className="w-3 h-3" />
              <span>{new Date(field.next_step_date).toLocaleDateString()}</span>
            </div>
          )}
          <div className="mt-2">
            <ConfidenceBar confidence={field.confidence} source={field.source} />
          </div>
        </div>
      </div>
    </motion.div>
  );
}

// =============================================================================
// Close Plan Item Component
// =============================================================================

function ClosePlanItemRow({ item, index, total }: { item: ClosePlanItem; index: number; total: number }) {
  const statusMeta = MILESTONE_STATUS_META[item.status];
  const StatusIcon = statusMeta.icon;
  const isOverdue = item.due_date && item.status !== 'completed' && new Date(item.due_date) < new Date();

  return (
    <motion.div
      initial={{ opacity: 0, x: -20 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: index * 0.1 }}
      className="flex items-center gap-3"
    >
      {/* Status indicator */}
      <div
        className={cn(
          'w-8 h-8 rounded-full flex items-center justify-center',
          item.status === 'completed' && 'bg-emerald-100 dark:bg-emerald-900/30',
          item.status === 'in_progress' && 'bg-blue-100 dark:bg-blue-900/30',
          item.status === 'blocked' && 'bg-red-100 dark:bg-red-900/30',
          item.status === 'pending' && 'bg-gray-100 dark:bg-gray-800',
          item.status === 'skipped' && 'bg-gray-100 dark:bg-gray-800'
        )}
      >
        <StatusIcon className={cn('w-4 h-4', statusMeta.color)} />
      </div>

      {/* Milestone info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className={cn(
            'font-medium text-sm',
            item.status === 'completed' ? 'text-gray-500 line-through' : 'text-gray-900 dark:text-white'
          )}>
            {item.title}
          </span>
          {isOverdue && (
            <Badge variant="destructive" className="text-xs">Overdue</Badge>
          )}
        </div>
        <div className="flex items-center gap-3 text-xs text-gray-500">
          {item.owner_name && <span>Owner: {item.owner_name}</span>}
          {item.due_date && <span>Due: {new Date(item.due_date).toLocaleDateString()}</span>}
        </div>
        {item.blocker_note && (
          <p className="text-xs text-red-500 mt-1">{item.blocker_note}</p>
        )}
      </div>

      {/* Connector line */}
      {index < total - 1 && (
        <div className="absolute left-4 top-10 w-0.5 h-6 bg-gray-200 dark:bg-gray-700" />
      )}
    </motion.div>
  );
}

// =============================================================================
// Extraction Simulation Component
// =============================================================================

function ExtractionSimulation({
  isRunning,
  onComplete,
}: {
  isRunning: boolean;
  onComplete: () => void;
}) {
  const [step, setStep] = useState(0);
  const [extractedFields, setExtractedFields] = useState<string[]>([]);

  const steps = [
    { label: 'Analyzing meeting transcript...', icon: MessageSquare },
    { label: 'Extracting pain points...', icon: AlertTriangle },
    { label: 'Identifying champion signals...', icon: Users },
    { label: 'Detecting next steps...', icon: ArrowRight },
    { label: 'Calculating confidence scores...', icon: Sparkles },
    { label: 'Updating Deal Truth fields...', icon: CheckCircle2 },
  ];

  useEffect(() => {
    if (!isRunning) {
      setStep(0);
      setExtractedFields([]);
      return;
    }

    const interval = setInterval(() => {
      setStep((prev) => {
        if (prev >= steps.length - 1) {
          clearInterval(interval);
          setTimeout(onComplete, 500);
          return prev;
        }
        return prev + 1;
      });
    }, 800);

    return () => clearInterval(interval);
  }, [isRunning, onComplete]);

  useEffect(() => {
    if (step === 1) setExtractedFields(['pain']);
    if (step === 2) setExtractedFields(['pain', 'champion']);
    if (step === 3) setExtractedFields(['pain', 'champion', 'next_step']);
    if (step === 4) setExtractedFields(['pain', 'champion', 'next_step', 'success_metric']);
  }, [step]);

  if (!isRunning) return null;

  return (
    <motion.div
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: 'auto' }}
      exit={{ opacity: 0, height: 0 }}
      className="mb-6 p-4 rounded-lg bg-gradient-to-r from-indigo-50 to-purple-50 dark:from-indigo-900/20 dark:to-purple-900/20 border border-indigo-200 dark:border-indigo-800"
    >
      <div className="flex items-center gap-3 mb-4">
        <div className="p-2 rounded-lg bg-indigo-100 dark:bg-indigo-900/30">
          <Sparkles className="w-5 h-5 text-indigo-600 animate-pulse" />
        </div>
        <div>
          <h4 className="font-medium text-gray-900 dark:text-white">AI Extraction in Progress</h4>
          <p className="text-sm text-gray-600 dark:text-gray-400">Processing meeting transcript...</p>
        </div>
      </div>

      <div className="space-y-2">
        {steps.map((s, i) => {
          const StepIcon = s.icon;
          const isActive = i === step;
          const isComplete = i < step;

          return (
            <motion.div
              key={i}
              initial={{ opacity: 0.5 }}
              animate={{ opacity: isActive || isComplete ? 1 : 0.5 }}
              className="flex items-center gap-3"
            >
              <div className={cn(
                'w-6 h-6 rounded-full flex items-center justify-center',
                isComplete && 'bg-emerald-100 dark:bg-emerald-900/30',
                isActive && 'bg-indigo-100 dark:bg-indigo-900/30',
                !isComplete && !isActive && 'bg-gray-100 dark:bg-gray-800'
              )}>
                {isComplete ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                ) : isActive ? (
                  <Loader2 className="w-4 h-4 text-indigo-500 animate-spin" />
                ) : (
                  <StepIcon className="w-3 h-3 text-gray-400" />
                )}
              </div>
              <span className={cn(
                'text-sm',
                isComplete && 'text-emerald-600 dark:text-emerald-400',
                isActive && 'text-indigo-600 dark:text-indigo-400 font-medium',
                !isComplete && !isActive && 'text-gray-400'
              )}>
                {s.label}
              </span>
            </motion.div>
          );
        })}
      </div>

      {extractedFields.length > 0 && (
        <div className="mt-4 flex flex-wrap gap-2">
          <span className="text-xs text-gray-500">Extracted:</span>
          {extractedFields.map((f) => (
            <Badge key={f} variant="secondary" className="text-xs bg-emerald-100 text-emerald-700">
              {FIELD_META[f as DealTruthFieldKey]?.label}
            </Badge>
          ))}
        </div>
      )}
    </motion.div>
  );
}

// =============================================================================
// Email Extraction Simulation Component
// =============================================================================

const MOCK_EMAIL_THREAD = {
  subject: 'RE: Q1 Budget Approval - Decision Timeline',
  from: 'sarah.johnson@acmecorp.com',
  to: 'rep@use60.com',
  date: '2 hours ago',
  preview: 'Hi, I spoke with our CFO and she confirmed the budget allocation for Q1...',
  signals: [
    { type: 'next_step', text: 'Meeting scheduled for Thursday to finalize paperwork' },
    { type: 'economic_buyer', text: 'CFO Jennifer Walsh confirmed budget approval' },
    { type: 'champion', text: 'Sarah advocating internally, forwarded to procurement' },
  ],
};

function EmailExtractionSimulation({
  isRunning,
  onComplete,
}: {
  isRunning: boolean;
  onComplete: () => void;
}) {
  const [step, setStep] = useState(0);
  const [extractedSignals, setExtractedSignals] = useState<typeof MOCK_EMAIL_THREAD.signals>([]);
  const [showEmailPreview, setShowEmailPreview] = useState(true);

  const steps = [
    { label: 'Scanning email thread...', icon: Mail },
    { label: 'Analyzing sender & recipients...', icon: Users },
    { label: 'Detecting engagement signals...', icon: Activity },
    { label: 'Extracting next step indicators...', icon: ArrowRight },
    { label: 'Identifying decision makers...', icon: DollarSign },
    { label: 'Boosting champion confidence...', icon: TrendingUp },
    { label: 'Updating Deal Truth fields...', icon: CheckCircle2 },
  ];

  useEffect(() => {
    if (!isRunning) {
      setStep(0);
      setExtractedSignals([]);
      setShowEmailPreview(true);
      return;
    }

    const interval = setInterval(() => {
      setStep((prev) => {
        if (prev >= steps.length - 1) {
          clearInterval(interval);
          setTimeout(onComplete, 500);
          return prev;
        }
        return prev + 1;
      });
    }, 700);

    return () => clearInterval(interval);
  }, [isRunning, onComplete]);

  useEffect(() => {
    if (step === 2) setExtractedSignals([MOCK_EMAIL_THREAD.signals[0]]);
    if (step === 3) setExtractedSignals([MOCK_EMAIL_THREAD.signals[0], MOCK_EMAIL_THREAD.signals[1]]);
    if (step === 4) setExtractedSignals(MOCK_EMAIL_THREAD.signals);
    if (step >= 5) setShowEmailPreview(false);
  }, [step]);

  if (!isRunning) return null;

  return (
    <motion.div
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: 'auto' }}
      exit={{ opacity: 0, height: 0 }}
      className="mb-6 p-4 rounded-lg bg-gradient-to-r from-blue-50 to-cyan-50 dark:from-blue-900/20 dark:to-cyan-900/20 border border-blue-200 dark:border-blue-800"
    >
      <div className="flex items-center gap-3 mb-4">
        <div className="p-2 rounded-lg bg-blue-100 dark:bg-blue-900/30">
          <Mail className="w-5 h-5 text-blue-600 animate-pulse" />
        </div>
        <div>
          <h4 className="font-medium text-gray-900 dark:text-white">Email Analysis in Progress</h4>
          <p className="text-sm text-gray-600 dark:text-gray-400">Processing email thread for deal signals...</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Email Preview Card */}
        <AnimatePresence>
          {showEmailPreview && (
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95, x: -20 }}
              className="p-3 rounded-lg bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 shadow-sm"
            >
              <div className="flex items-start gap-3">
                <div className="p-2 rounded-full bg-blue-100 dark:bg-blue-900/30">
                  <Mail className="w-4 h-4 text-blue-600" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium text-sm text-gray-900 dark:text-white truncate">
                      {MOCK_EMAIL_THREAD.subject}
                    </span>
                    <span className="text-xs text-gray-500 whitespace-nowrap">{MOCK_EMAIL_THREAD.date}</span>
                  </div>
                  <p className="text-xs text-gray-600 dark:text-gray-400 mt-0.5">
                    From: {MOCK_EMAIL_THREAD.from}
                  </p>
                  <p className="text-xs text-gray-500 mt-2 line-clamp-2">
                    {MOCK_EMAIL_THREAD.preview}
                  </p>
                </div>
              </div>

              {/* Scanning animation overlay */}
              <motion.div
                className="absolute inset-0 bg-gradient-to-b from-blue-500/10 to-transparent rounded-lg pointer-events-none"
                animate={{ y: ['0%', '100%', '0%'] }}
                transition={{ duration: 2, repeat: Infinity, ease: 'linear' }}
              />
            </motion.div>
          )}
        </AnimatePresence>

        {/* Steps */}
        <div className="space-y-1.5">
          {steps.map((s, i) => {
            const StepIcon = s.icon;
            const isActive = i === step;
            const isComplete = i < step;

            return (
              <motion.div
                key={i}
                initial={{ opacity: 0.5 }}
                animate={{ opacity: isActive || isComplete ? 1 : 0.5 }}
                className="flex items-center gap-2"
              >
                <div className={cn(
                  'w-5 h-5 rounded-full flex items-center justify-center',
                  isComplete && 'bg-emerald-100 dark:bg-emerald-900/30',
                  isActive && 'bg-blue-100 dark:bg-blue-900/30',
                  !isComplete && !isActive && 'bg-gray-100 dark:bg-gray-800'
                )}>
                  {isComplete ? (
                    <CheckCircle2 className="w-3 h-3 text-emerald-500" />
                  ) : isActive ? (
                    <Loader2 className="w-3 h-3 text-blue-500 animate-spin" />
                  ) : (
                    <StepIcon className="w-2.5 h-2.5 text-gray-400" />
                  )}
                </div>
                <span className={cn(
                  'text-xs',
                  isComplete && 'text-emerald-600 dark:text-emerald-400',
                  isActive && 'text-blue-600 dark:text-blue-400 font-medium',
                  !isComplete && !isActive && 'text-gray-400'
                )}>
                  {s.label}
                </span>
              </motion.div>
            );
          })}
        </div>
      </div>

      {/* Extracted Signals */}
      {extractedSignals.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="mt-4 p-3 rounded-lg bg-white/50 dark:bg-gray-800/50 border border-blue-100 dark:border-blue-900"
        >
          <div className="flex items-center gap-2 mb-2">
            <Zap className="w-4 h-4 text-amber-500" />
            <span className="text-xs font-medium text-gray-700 dark:text-gray-300">Detected Signals</span>
          </div>
          <div className="space-y-2">
            {extractedSignals.map((signal, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.1 }}
                className="flex items-start gap-2"
              >
                <Badge
                  variant="secondary"
                  className={cn(
                    'text-[10px] px-1.5 py-0',
                    signal.type === 'next_step' && 'bg-blue-100 text-blue-700',
                    signal.type === 'economic_buyer' && 'bg-amber-100 text-amber-700',
                    signal.type === 'champion' && 'bg-purple-100 text-purple-700'
                  )}
                >
                  {FIELD_META[signal.type as DealTruthFieldKey]?.label}
                </Badge>
                <span className="text-xs text-gray-600 dark:text-gray-400">{signal.text}</span>
              </motion.div>
            ))}
          </div>
        </motion.div>
      )}
    </motion.div>
  );
}

// =============================================================================
// Main Component
// =============================================================================

export default function DealTruthSimulator() {
  const { user } = useAuth();
  const { activeOrgId } = useOrg();

  // Data mode
  const [useRealData, setUseRealData] = useState(false);
  const [selectedDealId, setSelectedDealId] = useState<string | null>(null);

  // Data state
  const [deals, setDeals] = useState<DealOption[]>([]);
  const [truthFields, setTruthFields] = useState<DealTruthField[]>(MOCK_TRUTH_FIELDS);
  const [closePlan, setClosePlan] = useState<ClosePlanItem[]>(MOCK_CLOSE_PLAN);
  const [clarityScores, setClarityScores] = useState<ClarityScores>(MOCK_CLARITY_SCORES);

  // UI state
  const [isLoading, setIsLoading] = useState(false);
  const [isExtracting, setIsExtracting] = useState(false);
  const [isExtractingEmail, setIsExtractingEmail] = useState(false);
  const [showScoreBreakdown, setShowScoreBreakdown] = useState(false);

  // Load deals for real data mode
  useEffect(() => {
    if (useRealData && activeOrgId) {
      loadDeals();
    }
  }, [useRealData, activeOrgId]);

  // Load deal data when selection changes
  useEffect(() => {
    if (useRealData && selectedDealId) {
      loadDealData(selectedDealId);
    } else if (!useRealData) {
      // Reset to mock data
      setTruthFields(MOCK_TRUTH_FIELDS);
      setClosePlan(MOCK_CLOSE_PLAN);
      setClarityScores(MOCK_CLARITY_SCORES);
    }
  }, [useRealData, selectedDealId]);

  const loadDeals = async () => {
    if (!activeOrgId) return;

    setIsLoading(true);
    try {
      // First try with company relationship
      const { data, error } = await supabase
        .from('deals')
        .select(`
          id,
          name,
          value,
          company,
          companies:company_id(name)
        `)
        .eq('clerk_org_id', activeOrgId)
        .eq('status', 'active')
        .order('created_at', { ascending: false })
        .limit(50);

      if (error) {
        console.error('Error loading deals with relationship:', error);
        // Fallback: load without company relationship
        const { data: fallbackData, error: fallbackError } = await supabase
          .from('deals')
          .select('id, name, value, company')
          .eq('clerk_org_id', activeOrgId)
          .eq('status', 'active')
          .order('created_at', { ascending: false })
          .limit(50);

        if (fallbackError) throw fallbackError;

        setDeals((fallbackData || []).map((d: any) => ({
          id: d.id,
          name: d.name,
          company_name: d.company || null, // Use legacy company text field
          value: d.value,
        })));
        return;
      }

      setDeals((data || []).map((d: any) => ({
        id: d.id,
        name: d.name,
        company_name: d.companies?.name || d.company || null,
        value: d.value,
      })));
    } catch (e: any) {
      console.error('Error loading deals:', e);
      toast.error(`Failed to load deals: ${e.message || 'Unknown error'}`);
    } finally {
      setIsLoading(false);
    }
  };

  const loadDealData = async (dealId: string) => {
    setIsLoading(true);
    try {
      // Load truth fields (gracefully handle if table doesn't exist)
      let truthData: any[] = [];
      try {
        const { data, error } = await supabase
          .from('deal_truth_fields')
          .select('field_key, value, confidence, source, contact_id, champion_strength, next_step_date')
          .eq('deal_id', dealId);
        if (!error) truthData = data || [];
      } catch (e) {
        console.warn('deal_truth_fields table may not exist:', e);
      }

      // Load close plan (gracefully handle if table doesn't exist)
      let planData: any[] = [];
      try {
        const { data, error } = await supabase
          .from('deal_close_plan_items')
          .select('id, milestone_key, title, status, due_date, blocker_note, owner_id')
          .eq('deal_id', dealId)
          .order('sort_order');
        if (!error) planData = data || [];
      } catch (e) {
        console.warn('deal_close_plan_items table may not exist:', e);
      }

      // Load clarity scores (gracefully handle if table doesn't exist)
      let scoresData: any = null;
      try {
        const { data, error } = await supabase
          .from('deal_clarity_scores')
          .select('*')
          .eq('deal_id', dealId)
          .maybeSingle();
        if (!error) scoresData = data;
      } catch (e) {
        console.warn('deal_clarity_scores table may not exist:', e);
      }

      // Transform truth data
      const allFieldKeys: DealTruthFieldKey[] = ['pain', 'success_metric', 'champion', 'economic_buyer', 'next_step', 'top_risks'];
      const mappedTruth: DealTruthField[] = allFieldKeys.map((key) => {
        const existing = (truthData || []).find((t: any) => t.field_key === key);
        return {
          field_key: key,
          value: existing?.value || null,
          confidence: existing?.confidence || 0,
          source: existing?.source || null,
          contact_name: existing?.contacts?.name,
          champion_strength: existing?.champion_strength,
          next_step_date: existing?.next_step_date,
        };
      });

      setTruthFields(mappedTruth);
      setClosePlan((planData || []).map((p: any) => ({
        id: p.id,
        milestone_key: p.milestone_key,
        title: p.title,
        status: p.status,
        due_date: p.due_date,
        owner_name: p.profiles?.name || null,
        blocker_note: p.blocker_note,
      })));

      if (scoresData) {
        setClarityScores(scoresData as ClarityScores);
      } else {
        // Calculate from loaded data
        setClarityScores({
          clarity_score: 0,
          next_step_score: 0,
          economic_buyer_score: 0,
          champion_score: 0,
          success_metric_score: 0,
          risks_score: 0,
          close_plan_completed: (planData || []).filter((p: any) => p.status === 'completed').length,
          close_plan_total: (planData || []).length,
          close_plan_overdue: 0,
          momentum_score: 0,
        });
      }
    } catch (e) {
      console.error('Error loading deal data:', e);
      toast.error('Failed to load deal data');
    } finally {
      setIsLoading(false);
    }
  };

  const handleExtractionComplete = useCallback(() => {
    setIsExtracting(false);
    toast.success('Deal Truth fields updated from meeting transcript!');
    // Simulate updated scores
    setClarityScores((prev) => ({
      ...prev,
      clarity_score: Math.min(100, prev.clarity_score + 15),
      momentum_score: Math.min(100, prev.momentum_score + 10),
    }));
  }, []);

  const handleEmailExtractionComplete = useCallback(() => {
    setIsExtractingEmail(false);
    toast.success('Deal signals extracted from email thread!', {
      description: 'Champion confidence boosted, next step updated',
    });
    // Simulate email-specific score updates (smaller boost than meetings)
    setClarityScores((prev) => ({
      ...prev,
      clarity_score: Math.min(100, prev.clarity_score + 8),
      momentum_score: Math.min(100, prev.momentum_score + 5),
    }));
    // Update champion strength based on engagement
    setTruthFields((prev) =>
      prev.map((f) =>
        f.field_key === 'champion'
          ? { ...f, champion_strength: 'strong' as const, confidence: Math.min(0.95, f.confidence + 0.05) }
          : f
      )
    );
  }, []);

  const resetToMock = () => {
    setUseRealData(false);
    setSelectedDealId(null);
    setTruthFields(MOCK_TRUTH_FIELDS);
    setClosePlan(MOCK_CLOSE_PLAN);
    setClarityScores(MOCK_CLARITY_SCORES);
  };

  const completedMilestones = closePlan.filter((m) => m.status === 'completed').length;
  const progressPercentage = Math.round((completedMilestones / closePlan.length) * 100);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-indigo-50 dark:from-gray-950 dark:via-gray-900 dark:to-indigo-950">
      <div className="max-w-7xl mx-auto px-6 py-8 space-y-6">
        {/* Back Button */}
        <BackToPlatform />

        {/* Header */}
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-3">
              <div className="p-3 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 text-white shadow-lg">
                <Eye className="w-6 h-6" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
                  Deal Truth Simulator
                </h1>
                <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                  Visualize clarity scoring, momentum, and close plan execution
                </p>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Badge variant="secondary" className="bg-indigo-100 text-indigo-700">
              Platform Admin
            </Badge>
            <Button variant="outline" size="sm" onClick={resetToMock} className="gap-2">
              <RotateCcw className="w-4 h-4" />
              Reset
            </Button>
          </div>
        </div>

        {/* Data Mode Toggle */}
        <Card>
          <CardContent className="p-4">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-2">
                  <Switch
                    id="use-real-data"
                    checked={useRealData}
                    onCheckedChange={setUseRealData}
                  />
                  <Label htmlFor="use-real-data">Use real data</Label>
                </div>

                {useRealData && (
                  <Select value={selectedDealId || ''} onValueChange={setSelectedDealId}>
                    <SelectTrigger className="w-[280px]">
                      <SelectValue placeholder="Select a deal..." />
                    </SelectTrigger>
                    <SelectContent>
                      {deals.map((deal) => (
                        <SelectItem key={deal.id} value={deal.id}>
                          <div className="flex items-center gap-2">
                            <span>{deal.name}</span>
                            {deal.company_name && (
                              <span className="text-xs text-gray-500">({deal.company_name})</span>
                            )}
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </div>

              <div className="flex items-center gap-3">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setIsExtracting(true)}
                  disabled={isExtracting || isExtractingEmail}
                  className="gap-2"
                >
                  {isExtracting ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Sparkles className="w-4 h-4" />
                  )}
                  Simulate Meeting Extraction
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setIsExtractingEmail(true)}
                  disabled={isExtractingEmail || isExtracting}
                  className="gap-2"
                >
                  {isExtractingEmail ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Mail className="w-4 h-4" />
                  )}
                  Simulate Email
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Extraction Animations */}
        <AnimatePresence>
          <ExtractionSimulation isRunning={isExtracting} onComplete={handleExtractionComplete} />
        </AnimatePresence>
        <AnimatePresence>
          <EmailExtractionSimulation isRunning={isExtractingEmail} onComplete={handleEmailExtractionComplete} />
        </AnimatePresence>

        {/* Main Content Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left Column: Scores */}
          <div className="space-y-6">
            {/* Score Gauges */}
            <Card className="overflow-hidden">
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-lg">Deal Scores</CardTitle>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setShowScoreBreakdown(!showScoreBreakdown)}
                    className="gap-1"
                  >
                    {showScoreBreakdown ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                    Details
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="pt-4">
                <div className="flex justify-around mb-6">
                  <AnimatedGauge
                    value={clarityScores.clarity_score}
                    label="Clarity"
                    color="text-indigo-500"
                    size="large"
                  />
                  <AnimatedGauge
                    value={clarityScores.momentum_score}
                    label="Momentum"
                    color="text-emerald-500"
                    size="large"
                  />
                </div>

                <AnimatePresence>
                  {showScoreBreakdown && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      exit={{ opacity: 0, height: 0 }}
                      className="space-y-3 pt-4 border-t"
                    >
                      <div className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-2">
                        Clarity Breakdown
                      </div>
                      {[
                        { label: 'Next Step', score: clarityScores.next_step_score, max: 30, color: 'bg-emerald-500' },
                        { label: 'Economic Buyer', score: clarityScores.economic_buyer_score, max: 25, color: 'bg-blue-500' },
                        { label: 'Champion', score: clarityScores.champion_score, max: 20, color: 'bg-purple-500' },
                        { label: 'Success Metric', score: clarityScores.success_metric_score, max: 15, color: 'bg-amber-500' },
                        { label: 'Risks', score: clarityScores.risks_score, max: 10, color: 'bg-orange-500' },
                      ].map((item) => (
                        <div key={item.label} className="space-y-1">
                          <div className="flex justify-between text-xs">
                            <span className="text-gray-600 dark:text-gray-400">{item.label}</span>
                            <span className="font-medium">{item.score}/{item.max}</span>
                          </div>
                          <div className="h-1.5 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                            <motion.div
                              className={cn('h-full rounded-full', item.color)}
                              initial={{ width: 0 }}
                              animate={{ width: `${(item.score / item.max) * 100}%` }}
                              transition={{ duration: 0.8, delay: 0.2 }}
                            />
                          </div>
                        </div>
                      ))}
                    </motion.div>
                  )}
                </AnimatePresence>
              </CardContent>
            </Card>

            {/* Close Plan Progress */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-lg flex items-center gap-2">
                  <TrendingUp className="w-5 h-5 text-emerald-500" />
                  Close Plan
                </CardTitle>
                <CardDescription>
                  {completedMilestones} of {closePlan.length} milestones complete
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="mb-4">
                  <div className="flex justify-between text-sm mb-2">
                    <span className="text-gray-500">Progress</span>
                    <span className="font-medium">{progressPercentage}%</span>
                  </div>
                  <Progress value={progressPercentage} className="h-2" />
                </div>

                <div className="space-y-3">
                  {closePlan.map((item, index) => (
                    <ClosePlanItemRow
                      key={item.id}
                      item={item}
                      index={index}
                      total={closePlan.length}
                    />
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Right Column: Truth Fields */}
          <div className="lg:col-span-2">
            <Card className="h-full">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="text-lg flex items-center gap-2">
                      <Zap className="w-5 h-5 text-amber-500" />
                      Deal Truth Fields
                    </CardTitle>
                    <CardDescription>
                      6 core fields that answer "do we actually know this deal?"
                    </CardDescription>
                  </div>
                  <div className="flex items-center gap-2 text-xs">
                    <div className="flex items-center gap-1">
                      <div className="w-2 h-2 rounded-full bg-emerald-500" />
                      <span className="text-gray-500">High</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <div className="w-2 h-2 rounded-full bg-amber-500" />
                      <span className="text-gray-500">Medium</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <div className="w-2 h-2 rounded-full bg-red-500" />
                      <span className="text-gray-500">Low</span>
                    </div>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                {isLoading ? (
                  <div className="flex items-center justify-center py-12">
                    <Loader2 className="w-8 h-8 animate-spin text-indigo-500" />
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <AnimatePresence mode="popLayout">
                      {truthFields.map((field) => (
                        <TruthFieldCard key={field.field_key} field={field} />
                      ))}
                    </AnimatePresence>
                  </div>
                )}

                {/* Source Legend */}
                <Separator className="my-6" />
                <div className="flex flex-wrap items-center gap-4">
                  <span className="text-xs text-gray-500 font-medium">Sources:</span>
                  {Object.entries(SOURCE_META).map(([key, meta]) => (
                    <div key={key} className="flex items-center gap-1.5">
                      <Badge variant="secondary" className={cn('text-xs', meta.color)}>
                        {meta.label}
                      </Badge>
                      <span className="text-xs text-gray-400">{Math.round(meta.confidence * 100)}%</span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>
        </div>

        {/* Info Alert */}
        <Alert>
          <Sparkles className="h-4 w-4" />
          <AlertDescription>
            <strong>How it works:</strong> Deal Truth fields are automatically populated from meeting transcripts
            and emails. Confidence scores indicate data reliability (manual entries: 95%, meetings: 85%, emails: 70%).
            Clarity score weights: Next Step (30), Economic Buyer (25), Champion (20), Success Metric (15), Risks (10).
          </AlertDescription>
        </Alert>
      </div>
    </div>
  );
}
