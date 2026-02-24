/**
 * Copilot Right Panel Component
 *
 * Three collapsible sections:
 * 1. Action Items - AI-generated actions pending user approval
 * 2. Context - Data sources being used (HubSpot, Fathom, Calendar)
 * 3. Connected - Integration status (HubSpot, Fathom, Slack, Calendar)
 */

import React, { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ChevronDown,
  ChevronRight,
  Zap,
  Database,
  Link2,
  Building2,
  DollarSign,
  User,
  UserCheck,
  Activity,
  Mic,
  Calendar,
  Clock,
  Sparkles,
  ExternalLink,
  Check,
  Loader2,
  History,
  Mail,
  Video,
  AlertCircle,
  ListChecks,
} from 'lucide-react';
import {
  getStepIcon,
  getStepDurationEstimate,
  formatDurationEstimate,
  formatActualDuration,
} from '@/lib/utils/toolUtils';
import { useIntegrationLogo } from '@/lib/hooks/useIntegrationLogo';
import { ConversationHistory } from './ConversationHistory';
import { cn } from '@/lib/utils';
import { useActionItemStore, type ActionItem } from '@/lib/stores/actionItemStore';
import { ExecutionTelemetry, type TelemetryEvent } from './ExecutionTelemetry';
import { approveActionItem, dismissActionItem } from '@/lib/services/actionItemApprovalService';
import { useAuthUser } from '@/lib/hooks/useAuthUser';
import { ActionItemCard } from './ActionItemCard';
import { ActionItemPreviewModal } from './ActionItemPreviewModal';

interface CollapsibleSectionProps {
  title: string;
  icon: React.ReactNode;
  iconColor: string;
  count?: number;
  defaultOpen?: boolean;
  children: React.ReactNode;
}

function CollapsibleSection({
  title,
  icon,
  iconColor,
  count,
  defaultOpen = true,
  children
}: CollapsibleSectionProps) {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  return (
    <div className="border-b border-white/5 last:border-b-0">
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="w-full p-4 sm:p-5 flex items-center justify-between hover:bg-white/[0.02] transition-colors"
      >
        <div className="flex items-center gap-2">
          <span className={iconColor}>{icon}</span>
          <h3 className="font-semibold text-white text-sm">
            {title}
            {typeof count === 'number' && count > 0 && (
              <span className="ml-2 text-xs text-slate-400">({count})</span>
            )}
          </h3>
        </div>
        {isOpen ? (
          <ChevronDown className="w-4 h-4 text-slate-400" />
        ) : (
          <ChevronRight className="w-4 h-4 text-slate-400" />
        )}
      </button>

      {isOpen && (
        <div className="px-4 pb-4 sm:px-5 sm:pb-5">
          {children}
        </div>
      )}
    </div>
  );
}

// ============================================================================
// Progress Section
// ============================================================================

export interface ProgressStep {
  id: number;
  label: string;
  status: 'pending' | 'active' | 'complete';
  /** Icon name from toolUtils STEP_ICONS */
  icon?: string;
  /** Duration in ms (for completed steps) */
  duration?: number;
}

interface ProgressSectionProps {
  steps: ProgressStep[];
  isProcessing: boolean;
  totalSteps?: number;
  /** Total estimated time in ms */
  estimatedTotalTime?: number;
}

// Animation variants for staggered step reveals
const stepVariants = {
  hidden: { opacity: 0, x: -10 },
  visible: (i: number) => ({
    opacity: 1,
    x: 0,
    transition: {
      delay: i * 0.1,
      duration: 0.3,
      ease: 'easeOut'
    }
  })
};


function ProgressSection({ steps, totalSteps = 4, estimatedTotalTime }: Omit<ProgressSectionProps, 'isProcessing'>) {
  // Calculate progress percentage
  const completedCount = steps.filter(s => s.status === 'complete').length;
  const activeStep = steps.find(s => s.status === 'active');
  const progressPercent = steps.length > 0 ? (completedCount / steps.length) * 100 : 0;

  // Calculate time remaining estimate
  const remainingSteps = steps.filter(s => s.status !== 'complete');
  const estimatedRemaining = remainingSteps.reduce((sum, step) => {
    const iconDuration = step.icon ? getStepDurationEstimate(step.icon) : 1000;
    return sum + iconDuration;
  }, 0);

  return (
    <div className="p-4 sm:p-5 border-b border-white/5">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-semibold text-white flex items-center gap-2">
          <Zap className="w-4 h-4 text-amber-400" />
          Progress
        </h3>
        {/* Time estimate */}
        {activeStep && estimatedRemaining > 0 && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="flex items-center gap-1 text-xs text-violet-400"
          >
            <Clock className="w-3 h-3" />
            <span>{formatDurationEstimate(estimatedRemaining)}</span>
          </motion.div>
        )}
      </div>

      {/* Mini Progress Bar */}
      {steps.length > 0 && (
        <div className="mb-4">
          <div className="h-1 bg-white/5 rounded-full overflow-hidden">
            <motion.div
              className="h-full bg-gradient-to-r from-violet-500 to-purple-500"
              initial={{ width: '0%' }}
              animate={{ width: `${progressPercent}%` }}
              transition={{ duration: 0.5, ease: 'easeOut' }}
            />
          </div>
        </div>
      )}

      {/* Step Indicator Circles - responsive sizing */}
      <div className="flex items-center gap-1.5 sm:gap-2 mb-4 overflow-x-auto">
        {Array.from({ length: Math.max(totalSteps, steps.length) }, (_, i) => i + 1).map((stepNum) => {
          const progressItem = steps.find(p => p.id === stepNum);
          const status = progressItem?.status || 'pending';

          return (
            <React.Fragment key={stepNum}>
              <motion.div
                initial={{ scale: 0.8, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ delay: (stepNum - 1) * 0.1, duration: 0.3 }}
                className={cn(
                  'w-6 h-6 sm:w-7 sm:h-7 rounded-full flex items-center justify-center text-[10px] sm:text-xs font-medium transition-all flex-shrink-0',
                  status === 'complete' &&
                    'bg-gradient-to-br from-emerald-400 to-emerald-600 text-white shadow-lg shadow-emerald-500/25',
                  status === 'active' &&
                    'bg-gradient-to-br from-violet-400 to-purple-600 text-white shadow-lg shadow-violet-500/25',
                  status === 'pending' &&
                    'bg-white/5 text-slate-600 border border-white/10'
                )}
              >
                {status === 'complete' ? (
                  <motion.div
                    initial={{ scale: 0, rotate: -180 }}
                    animate={{ scale: 1, rotate: 0 }}
                    transition={{ type: 'spring', stiffness: 200 }}
                  >
                    <Check className="w-3.5 h-3.5" />
                  </motion.div>
                ) : (
                  stepNum
                )}
              </motion.div>
              {stepNum < Math.max(totalSteps, steps.length) && (
                <motion.div
                  className={cn(
                    'flex-1 h-0.5 rounded-full',
                    status === 'complete'
                      ? 'bg-gradient-to-r from-emerald-400 to-emerald-600'
                      : 'bg-white/10'
                  )}
                  initial={{ scaleX: 0 }}
                  animate={{ scaleX: 1 }}
                  transition={{ delay: (stepNum - 1) * 0.1 + 0.1, duration: 0.3 }}
                  style={{ transformOrigin: 'left' }}
                />
              )}
            </React.Fragment>
          );
        })}
      </div>

      {/* Step Labels with icons */}
      <div className="space-y-2">
        <AnimatePresence mode="popLayout">
          {steps.length > 0 ? (
            steps.map((step, index) => {
              const StepIcon = step.icon ? getStepIcon(step.icon) : Activity;
              const estimatedDuration = step.icon ? getStepDurationEstimate(step.icon) : 1000;
              
              return (
                <motion.div
                  key={step.id}
                  custom={index}
                  variants={stepVariants}
                  initial="hidden"
                  animate="visible"
                  exit={{ opacity: 0, x: -10 }}
                  className="flex items-center gap-2"
                >
                  {/* Step Icon */}
                  <div
                    className={cn(
                      'w-5 h-5 rounded-full flex items-center justify-center',
                      step.status === 'complete' && 'bg-emerald-500/20',
                      step.status === 'active' && 'bg-violet-500/20',
                      step.status === 'pending' && 'bg-white/5'
                    )}
                  >
                    {step.status === 'active' ? (
                      <StepIcon className="w-3 h-3 text-violet-400" />
                    ) : step.status === 'complete' ? (
                      <Check className="w-3 h-3 text-emerald-400" />
                    ) : (
                      <StepIcon className="w-3 h-3 text-slate-500" />
                    )}
                  </div>
                  
                  {/* Label */}
                  <span
                    className={cn(
                      'text-xs flex-1',
                      step.status === 'active' ? 'text-violet-300 font-medium' : 
                      step.status === 'complete' ? 'text-slate-400' : 'text-slate-500'
                    )}
                  >
                    {step.label}
                  </span>
                  
                  {/* Duration/Estimate */}
                  {step.status === 'active' && (
                    <span className="text-xs text-violet-400/70">
                      {formatDurationEstimate(estimatedDuration)}
                    </span>
                  )}
                  {step.status === 'complete' && step.duration && (
                    <span className="text-xs text-slate-600">
                      {formatActualDuration(step.duration)}
                    </span>
                  )}
                </motion.div>
              );
            })
          ) : (
            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="text-sm text-slate-500"
            >
              Steps will show as the task unfolds.
            </motion.p>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

// ============================================================================
// Action Items Section
// ============================================================================

interface ActionItemsSectionProps {
  items?: ActionItem[];
}

function ActionItemsSection({ items: propItems }: ActionItemsSectionProps) {
  // Use store items if no props provided
  // IMPORTANT: Select raw items array, not getPendingItems() - calling a method creates
  // a new array reference on every render causing infinite re-render loops
  const allStoreItems = useActionItemStore((state) => state.items);
  const storeItems = useMemo(
    () => allStoreItems.filter((item) => item.status === 'pending'),
    [allStoreItems]
  );
  const items = propItems ?? storeItems;
  const hasItems = items.length > 0;

  // Get current user for approval service
  const { data: user } = useAuthUser();

  // Modal state
  const [previewItem, setPreviewItem] = useState<ActionItem | null>(null);
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [isApproving, setIsApproving] = useState(false);

  const handlePreview = (item: ActionItem) => {
    setPreviewItem(item);
    setIsPreviewOpen(true);
  };

  const handleClosePreview = () => {
    setIsPreviewOpen(false);
    // Delay clearing item to allow close animation
    setTimeout(() => setPreviewItem(null), 200);
  };

  const handleApprove = async (item: ActionItem) => {
    if (!user?.id || isApproving) return;

    setIsApproving(true);
    try {
      // US-011: Execute approval via service (send email, update CRM, etc.)
      await approveActionItem(item, user.id);
    } finally {
      setIsApproving(false);
    }
  };

  const handleDismiss = (item: ActionItem, reason: string) => {
    // US-011: Dismiss with feedback via service
    dismissActionItem(item, reason);
  };

  const handleEdit = (item: ActionItem) => {
    // TODO: Wire edit functionality in future story
    setPreviewItem(item);
    setIsPreviewOpen(true);
  };

  return (
    <>
      <CollapsibleSection
        title="Action Items"
        icon={<ListChecks className="w-4 h-4" />}
        iconColor="text-violet-400"
        count={items.length}
        defaultOpen={true}
      >
        {hasItems ? (
          <div className="space-y-2">
            {items.map((item) => (
              <ActionItemCard
                key={item.id}
                item={item}
                onPreview={handlePreview}
                onEdit={handleEdit}
                onApprove={handleApprove}
              />
            ))}
          </div>
        ) : (
          <div className="p-4 rounded-xl bg-white/5 border border-white/5">
            <p className="text-sm text-slate-500">
              No pending actions. Ask me to draft a follow-up or prep for a meeting.
            </p>
          </div>
        )}
      </CollapsibleSection>

      {/* Preview Modal */}
      <ActionItemPreviewModal
        isOpen={isPreviewOpen}
        onClose={handleClosePreview}
        item={previewItem}
        onEdit={handleEdit}
        onApprove={handleApprove}
        onDismiss={handleDismiss}
      />
    </>
  );
}

// Context data types for each integration
export interface HubSpotContext {
  type: 'hubspot';
  companyName: string;
  dealValue?: number;
  dealName?: string;
  contactName?: string;
  contactRole?: string;
  activityCount?: number;
  hubspotUrl?: string;
}

export interface FathomContext {
  type: 'fathom';
  callCount: number;
  lastCallDate?: string;
  lastCallDuration?: string;
  keyInsight?: string;
  fathomUrl?: string;
}

export interface CalendarContext {
  type: 'calendar';
  nextMeetingTitle: string;
  nextMeetingDate: string;
  nextMeetingTime: string;
  calendarUrl?: string;
}

export interface ResolvedEntityContext {
  type: 'resolved_entity';
  name: string;
  email?: string;
  company?: string;
  role?: string;
  recencyScore: number;
  source: 'crm' | 'meeting' | 'calendar' | 'email';
  lastInteraction?: string;
  confidence: 'high' | 'medium' | 'needs_clarification';
  alternativeCandidates?: number;
}

export interface MeetingsContext {
  type: 'meetings';
  period: string;
  count: number;
  meetings: Array<{
    id: string;
    title: string;
    startTime: string;
    attendees?: string[];
    attendeeCount?: number;
  }>;
}

export interface PipelineContext {
  type: 'pipeline';
  filter?: string;
  count: number;
  deals: Array<{
    id: string;
    name: string;
    value?: number;
    stage?: string;
    healthLevel?: 'healthy' | 'at_risk' | 'critical';
  }>;
}

export interface ContactsAttentionContext {
  type: 'contacts_attention';
  count: number;
  contacts: Array<{
    id: string;
    name: string;
    company?: string;
    daysSinceContact?: number;
    riskReason?: string;
  }>;
}

export interface TasksContext {
  type: 'tasks';
  count: number;
  tasks: Array<{
    id: string;
    title: string;
    priority?: 'high' | 'medium' | 'low';
    dueDate?: string;
    isOverdue?: boolean;
  }>;
}

export type ContextItem = HubSpotContext | FathomContext | CalendarContext | ResolvedEntityContext | MeetingsContext | PipelineContext | ContactsAttentionContext | TasksContext;

/**
 * Context summary counts for real-time display
 */
export interface ContextSummary {
  dealCount: number;
  meetingCount: number;
  contactCount: number;
  calendarCount: number;
  taskCount: number;
}

interface ContextSectionProps {
  items?: ContextItem[];
  summary?: ContextSummary;
  isLoading?: boolean;
}

// HubSpot context card
function HubSpotContextCard({ data }: { data: HubSpotContext }) {
  const formattedValue = data.dealValue
    ? new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD',
        minimumFractionDigits: 0,
        maximumFractionDigits: 0,
      }).format(data.dealValue)
    : null;

  return (
    <div
      className={cn(
        'p-3 rounded-xl bg-white/5 border border-white/10',
        'hover:bg-white/[0.07] hover:border-orange-500/30',
        'transition-all cursor-pointer group'
      )}
      onClick={() => data.hubspotUrl && window.open(data.hubspotUrl, '_blank')}
    >
      {/* Header */}
      <div className="flex items-center gap-2 mb-2">
        <div className="w-6 h-6 rounded-lg bg-gradient-to-br from-orange-500 to-amber-500 flex items-center justify-center">
          <Building2 className="w-3 h-3 text-white" />
        </div>
        <span className="text-xs font-medium text-orange-400">HubSpot</span>
        {data.hubspotUrl && (
          <ExternalLink className="w-3 h-3 text-slate-500 ml-auto opacity-0 group-hover:opacity-100 transition-opacity" />
        )}
      </div>

      {/* Company & Deal */}
      <div className="space-y-1.5">
        <p className="text-sm font-medium text-white truncate">{data.companyName}</p>
        {data.dealName && (
          <div className="flex items-center gap-1.5 text-xs text-slate-400">
            <DollarSign className="w-3 h-3" />
            <span className="truncate">{data.dealName}</span>
            {formattedValue && (
              <span className="text-emerald-400 font-medium ml-auto">{formattedValue}</span>
            )}
          </div>
        )}
        {data.contactName && (
          <div className="flex items-center gap-1.5 text-xs text-slate-400">
            <User className="w-3 h-3" />
            <span className="truncate">
              {data.contactName}
              {data.contactRole && <span className="text-slate-500"> · {data.contactRole}</span>}
            </span>
          </div>
        )}
        {typeof data.activityCount === 'number' && (
          <div className="flex items-center gap-1.5 text-xs text-slate-400">
            <Activity className="w-3 h-3" />
            <span>{data.activityCount} activities</span>
          </div>
        )}
      </div>
    </div>
  );
}

// Fathom context card
function FathomContextCard({ data }: { data: FathomContext }) {
  return (
    <div
      className={cn(
        'p-3 rounded-xl bg-white/5 border border-white/10',
        'hover:bg-white/[0.07] hover:border-violet-500/30',
        'transition-all cursor-pointer group'
      )}
      onClick={() => data.fathomUrl && window.open(data.fathomUrl, '_blank')}
    >
      {/* Header */}
      <div className="flex items-center gap-2 mb-2">
        <div className="w-6 h-6 rounded-lg bg-gradient-to-br from-violet-500 to-purple-500 flex items-center justify-center">
          <Mic className="w-3 h-3 text-white" />
        </div>
        <span className="text-xs font-medium text-violet-400">Fathom</span>
        {data.fathomUrl && (
          <ExternalLink className="w-3 h-3 text-slate-500 ml-auto opacity-0 group-hover:opacity-100 transition-opacity" />
        )}
      </div>

      {/* Call info */}
      <div className="space-y-1.5">
        <div className="flex items-center gap-1.5 text-xs text-slate-400">
          <span className="text-white font-medium">{data.callCount} calls</span>
          {data.lastCallDate && (
            <>
              <span className="text-slate-500">·</span>
              <span>Last: {data.lastCallDate}</span>
            </>
          )}
        </div>
        {data.lastCallDuration && (
          <div className="flex items-center gap-1.5 text-xs text-slate-400">
            <Clock className="w-3 h-3" />
            <span>Duration: {data.lastCallDuration}</span>
          </div>
        )}
        {data.keyInsight && (
          <div className="mt-2 p-2 rounded-lg bg-violet-500/10 border border-violet-500/20">
            <div className="flex items-start gap-1.5">
              <Sparkles className="w-3 h-3 text-violet-400 mt-0.5 flex-shrink-0" />
              <p className="text-xs text-violet-300/80 line-clamp-2">{data.keyInsight}</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// Calendar context card
function CalendarContextCard({ data }: { data: CalendarContext }) {
  return (
    <div
      className={cn(
        'p-3 rounded-xl bg-white/5 border border-white/10',
        'hover:bg-white/[0.07] hover:border-emerald-500/30',
        'transition-all cursor-pointer group'
      )}
      onClick={() => data.calendarUrl && window.open(data.calendarUrl, '_blank')}
    >
      {/* Header */}
      <div className="flex items-center gap-2 mb-2">
        <div className="w-6 h-6 rounded-lg bg-gradient-to-br from-emerald-500 to-teal-500 flex items-center justify-center">
          <Calendar className="w-3 h-3 text-white" />
        </div>
        <span className="text-xs font-medium text-emerald-400">Calendar</span>
        {data.calendarUrl && (
          <ExternalLink className="w-3 h-3 text-slate-500 ml-auto opacity-0 group-hover:opacity-100 transition-opacity" />
        )}
      </div>

      {/* Meeting info */}
      <div className="space-y-1.5">
        <p className="text-sm font-medium text-white truncate">{data.nextMeetingTitle}</p>
        <div className="flex items-center gap-1.5 text-xs text-slate-400">
          <Clock className="w-3 h-3" />
          <span className="text-emerald-400 font-medium">{data.nextMeetingDate}</span>
          <span className="text-slate-500">at</span>
          <span>{data.nextMeetingTime}</span>
        </div>
      </div>
    </div>
  );
}

// Resolved Entity context card - shows matched contact from entity resolution
function ResolvedEntityContextCard({ data }: { data: ResolvedEntityContext }) {
  // Source icon and label mapping - includes both legacy and new source types
  const sourceConfig: Record<string, { icon: typeof Building2; label: string; color: string }> = {
    // Legacy source types
    crm: { icon: Building2, label: 'CRM', color: 'text-orange-400' },
    meeting: { icon: Video, label: 'Meeting', color: 'text-violet-400' },
    calendar: { icon: Calendar, label: 'Calendar', color: 'text-emerald-400' },
    email: { icon: Mail, label: 'Email', color: 'text-blue-400' },
    // New entity resolution source types
    contact: { icon: Building2, label: 'CRM Contact', color: 'text-orange-400' },
    meeting_attendee: { icon: Video, label: 'Meeting', color: 'text-violet-400' },
    calendar_attendee: { icon: Calendar, label: 'Calendar', color: 'text-emerald-400' },
    email_participant: { icon: Mail, label: 'Email', color: 'text-blue-400' },
  };

  // Default fallback for unknown source types
  const defaultSourceConfig = { icon: User, label: 'Contact', color: 'text-slate-400' };
  const { icon: SourceIcon, label: sourceLabel, color: sourceColor } = sourceConfig[data.source] || defaultSourceConfig;

  // Confidence indicator
  const confidenceConfig = {
    high: { color: 'bg-emerald-500/20 border-emerald-500/30 text-emerald-400', label: 'High confidence' },
    medium: { color: 'bg-amber-500/20 border-amber-500/30 text-amber-400', label: 'Medium confidence' },
    needs_clarification: { color: 'bg-red-500/20 border-red-500/30 text-red-400', label: 'Needs clarification' },
  };

  const confidence = confidenceConfig[data.confidence];

  return (
    <div
      className={cn(
        'p-3 rounded-xl bg-white/5 border border-white/10',
        'hover:bg-white/[0.07] hover:border-cyan-500/30',
        'transition-all group'
      )}
    >
      {/* Header */}
      <div className="flex items-center gap-2 mb-2">
        <div className="w-6 h-6 rounded-lg bg-gradient-to-br from-cyan-500 to-teal-500 flex items-center justify-center">
          <UserCheck className="w-3 h-3 text-white" />
        </div>
        <span className="text-xs font-medium text-cyan-400">Resolved Contact</span>
        <div className={cn('ml-auto px-1.5 py-0.5 rounded text-[10px] font-medium border', confidence.color)}>
          {data.recencyScore}% recent
        </div>
      </div>

      {/* Contact info */}
      <div className="space-y-1.5">
        <p className="text-sm font-medium text-white">{data.name}</p>

        {data.email && (
          <div className="flex items-center gap-1.5 text-xs text-slate-400">
            <Mail className="w-3 h-3" />
            <span className="truncate">{data.email}</span>
          </div>
        )}

        {(data.company || data.role) && (
          <div className="flex items-center gap-1.5 text-xs text-slate-400">
            <Building2 className="w-3 h-3" />
            <span className="truncate">
              {data.role && <span>{data.role}</span>}
              {data.role && data.company && <span className="text-slate-500"> at </span>}
              {data.company && <span className="text-white/80">{data.company}</span>}
            </span>
          </div>
        )}

        {/* Source and last interaction */}
        <div className="flex items-center gap-2 mt-2 pt-2 border-t border-white/5">
          <div className={cn('flex items-center gap-1 text-xs', sourceColor)}>
            <SourceIcon className="w-3 h-3" />
            <span>Found in {sourceLabel}</span>
          </div>
          {data.lastInteraction && (
            <span className="text-xs text-slate-500">· {data.lastInteraction}</span>
          )}
        </div>

        {/* Alternative candidates warning */}
        {data.confidence === 'needs_clarification' && data.alternativeCandidates && data.alternativeCandidates > 0 && (
          <div className="mt-2 p-2 rounded-lg bg-amber-500/10 border border-amber-500/20">
            <div className="flex items-start gap-1.5">
              <AlertCircle className="w-3 h-3 text-amber-400 mt-0.5 flex-shrink-0" />
              <p className="text-xs text-amber-300/80">
                {data.alternativeCandidates} other match{data.alternativeCandidates > 1 ? 'es' : ''} found
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// Meetings context card — shows upcoming meetings from tool results
function MeetingsContextCard({ data }: { data: MeetingsContext }) {
  const displayMeetings = data.meetings.slice(0, 3);
  const remaining = data.count - displayMeetings.length;

  return (
    <div className="p-3 rounded-xl bg-white/5 border border-white/10">
      <div className="flex items-center gap-2 mb-2">
        <div className="w-6 h-6 rounded-lg bg-gradient-to-br from-blue-500 to-indigo-500 flex items-center justify-center">
          <Calendar className="w-3 h-3 text-white" />
        </div>
        <span className="text-xs font-medium text-blue-400">Meetings</span>
        <span className="ml-auto text-xs text-slate-400">{data.count} found</span>
      </div>
      {data.period && (
        <p className="text-[11px] text-slate-500 mb-2">{data.period}</p>
      )}
      <div className="space-y-1.5">
        {displayMeetings.map((meeting) => {
          const time = meeting.startTime
            ? new Date(meeting.startTime).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })
            : '';
          const date = meeting.startTime
            ? new Date(meeting.startTime).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
            : '';
          return (
            <div key={meeting.id} className="flex items-start gap-2 text-xs">
              <Clock className="w-3 h-3 text-blue-400 mt-0.5 flex-shrink-0" />
              <div className="min-w-0 flex-1">
                <p className="text-white truncate">{meeting.title || 'Untitled'}</p>
                <p className="text-slate-500">
                  {date} {time && `at ${time}`}
                  {meeting.attendeeCount ? ` · ${meeting.attendeeCount} attendees` : ''}
                </p>
              </div>
            </div>
          );
        })}
        {remaining > 0 && (
          <p className="text-[11px] text-slate-500 pl-5">+{remaining} more</p>
        )}
      </div>
    </div>
  );
}

// Pipeline context card — shows deals from tool results
function PipelineContextCard({ data }: { data: PipelineContext }) {
  const displayDeals = data.deals.slice(0, 3);
  const remaining = data.count - displayDeals.length;

  const healthColors: Record<string, string> = {
    healthy: 'text-emerald-400 bg-emerald-500/20',
    at_risk: 'text-amber-400 bg-amber-500/20',
    critical: 'text-red-400 bg-red-500/20',
  };

  return (
    <div className="p-3 rounded-xl bg-white/5 border border-white/10">
      <div className="flex items-center gap-2 mb-2">
        <div className="w-6 h-6 rounded-lg bg-gradient-to-br from-emerald-500 to-green-600 flex items-center justify-center">
          <DollarSign className="w-3 h-3 text-white" />
        </div>
        <span className="text-xs font-medium text-emerald-400">Pipeline</span>
        <span className="ml-auto text-xs text-slate-400">{data.count} deal{data.count !== 1 ? 's' : ''}</span>
      </div>
      <div className="space-y-1.5">
        {displayDeals.map((deal) => {
          const formattedValue = deal.value
            ? new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(deal.value)
            : null;
          return (
            <div key={deal.id} className="flex items-start gap-2 text-xs">
              <DollarSign className="w-3 h-3 text-emerald-400 mt-0.5 flex-shrink-0" />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <p className="text-white truncate">{deal.name}</p>
                  {deal.healthLevel && (
                    <span className={cn('px-1 py-0.5 rounded text-[10px] font-medium', healthColors[deal.healthLevel] || 'text-slate-400')}>
                      {deal.healthLevel.replace('_', ' ')}
                    </span>
                  )}
                </div>
                <p className="text-slate-500">
                  {deal.stage && <span>{deal.stage}</span>}
                  {deal.stage && formattedValue && <span> · </span>}
                  {formattedValue && <span className="text-emerald-400">{formattedValue}</span>}
                </p>
              </div>
            </div>
          );
        })}
        {remaining > 0 && (
          <p className="text-[11px] text-slate-500 pl-5">+{remaining} more</p>
        )}
      </div>
    </div>
  );
}

// Contacts needing attention card
function ContactsAttentionContextCard({ data }: { data: ContactsAttentionContext }) {
  const displayContacts = data.contacts.slice(0, 3);
  const remaining = data.count - displayContacts.length;

  return (
    <div className="p-3 rounded-xl bg-white/5 border border-white/10">
      <div className="flex items-center gap-2 mb-2">
        <div className="w-6 h-6 rounded-lg bg-gradient-to-br from-amber-500 to-orange-500 flex items-center justify-center">
          <AlertCircle className="w-3 h-3 text-white" />
        </div>
        <span className="text-xs font-medium text-amber-400">Needs Attention</span>
        <span className="ml-auto text-xs text-slate-400">{data.count} contact{data.count !== 1 ? 's' : ''}</span>
      </div>
      <div className="space-y-1.5">
        {displayContacts.map((contact) => (
          <div key={contact.id} className="flex items-start gap-2 text-xs">
            <User className="w-3 h-3 text-amber-400 mt-0.5 flex-shrink-0" />
            <div className="min-w-0 flex-1">
              <p className="text-white truncate">{contact.name}</p>
              <p className="text-slate-500">
                {contact.company && <span>{contact.company}</span>}
                {contact.daysSinceContact != null && (
                  <span>{contact.company ? ' · ' : ''}{contact.daysSinceContact}d since last contact</span>
                )}
              </p>
              {contact.riskReason && (
                <p className="text-amber-400/70 text-[11px]">{contact.riskReason}</p>
              )}
            </div>
          </div>
        ))}
        {remaining > 0 && (
          <p className="text-[11px] text-slate-500 pl-5">+{remaining} more</p>
        )}
      </div>
    </div>
  );
}

// Tasks context card
function TasksContextCard({ data }: { data: TasksContext }) {
  const displayTasks = data.tasks.slice(0, 3);
  const remaining = data.count - displayTasks.length;

  const priorityColors: Record<string, string> = {
    high: 'text-red-400 bg-red-500/20',
    medium: 'text-amber-400 bg-amber-500/20',
    low: 'text-slate-400 bg-slate-500/20',
  };

  return (
    <div className="p-3 rounded-xl bg-white/5 border border-white/10">
      <div className="flex items-center gap-2 mb-2">
        <div className="w-6 h-6 rounded-lg bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center">
          <ListChecks className="w-3 h-3 text-white" />
        </div>
        <span className="text-xs font-medium text-violet-400">Tasks</span>
        <span className="ml-auto text-xs text-slate-400">{data.count} task{data.count !== 1 ? 's' : ''}</span>
      </div>
      <div className="space-y-1.5">
        {displayTasks.map((task) => (
          <div key={task.id} className="flex items-start gap-2 text-xs">
            <ListChecks className="w-3 h-3 text-violet-400 mt-0.5 flex-shrink-0" />
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5">
                <p className={cn('truncate', task.isOverdue ? 'text-red-400' : 'text-white')}>{task.title}</p>
                {task.priority && (
                  <span className={cn('px-1 py-0.5 rounded text-[10px] font-medium flex-shrink-0', priorityColors[task.priority] || 'text-slate-400')}>
                    {task.priority}
                  </span>
                )}
              </div>
              {task.dueDate && (
                <p className={cn('text-slate-500', task.isOverdue && 'text-red-400/70')}>
                  {task.isOverdue ? 'Overdue: ' : 'Due: '}
                  {new Date(task.dueDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                </p>
              )}
            </div>
          </div>
        ))}
        {remaining > 0 && (
          <p className="text-[11px] text-slate-500 pl-5">+{remaining} more</p>
        )}
      </div>
    </div>
  );
}

// Render context item based on type
function ContextItemCard({ item }: { item: ContextItem }) {
  switch (item.type) {
    case 'hubspot':
      return <HubSpotContextCard data={item} />;
    case 'fathom':
      return <FathomContextCard data={item} />;
    case 'calendar':
      return <CalendarContextCard data={item} />;
    case 'resolved_entity':
      return <ResolvedEntityContextCard data={item} />;
    case 'meetings':
      return <MeetingsContextCard data={item} />;
    case 'pipeline':
      return <PipelineContextCard data={item} />;
    case 'contacts_attention':
      return <ContactsAttentionContextCard data={item} />;
    case 'tasks':
      return <TasksContextCard data={item} />;
    default:
      return null;
  }
}

function ContextSection({ items = [], summary, isLoading = false }: ContextSectionProps) {
  const hasItems = items.length > 0;

  // Build summary text from counts (only show non-zero values)
  const summaryParts: string[] = [];
  if (summary) {
    if (summary.dealCount > 0) summaryParts.push(`${summary.dealCount} deal${summary.dealCount !== 1 ? 's' : ''}`);
    if (summary.meetingCount > 0) summaryParts.push(`${summary.meetingCount} call${summary.meetingCount !== 1 ? 's' : ''}`);
    if (summary.contactCount > 0) summaryParts.push(`${summary.contactCount} contact${summary.contactCount !== 1 ? 's' : ''}`);
    if (summary.calendarCount > 0) summaryParts.push(`${summary.calendarCount} event${summary.calendarCount !== 1 ? 's' : ''}`);
    if (summary.taskCount > 0) summaryParts.push(`${summary.taskCount} task${summary.taskCount !== 1 ? 's' : ''}`);
  }
  const summaryText = summaryParts.length > 0 ? summaryParts.join(' · ') : null;

  // Custom header with summary counts
  const contextHeader = (
    <div className="flex items-center gap-2">
      <Database className="w-4 h-4 text-emerald-400" />
      <span className="font-semibold text-white text-sm">Context</span>
      {isLoading && (
        <Loader2 className="w-3 h-3 text-emerald-400 animate-spin ml-1" />
      )}
      {summaryText && !isLoading && (
        <span className="text-xs text-slate-400 ml-1">
          ({summaryText})
        </span>
      )}
    </div>
  );

  return (
    <div className="border-b border-white/5 last:border-b-0">
      <button
        type="button"
        onClick={() => {}}
        className="w-full p-4 sm:p-5 flex items-center justify-between hover:bg-white/[0.02] transition-colors"
        style={{ pointerEvents: 'none' }}
      >
        {contextHeader}
      </button>
      <div className="px-4 pb-4 sm:px-5 sm:pb-5">
        {hasItems ? (
          <div className="space-y-2">
            {items.map((item, index) => (
              <ContextItemCard key={`${item.type}-${index}`} item={item} />
            ))}
          </div>
        ) : (
          <div className="p-4 rounded-xl bg-white/5 border border-white/5">
            <div className="flex gap-2 mb-3">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-orange-500/20 to-orange-500/5 flex items-center justify-center">
                <Building2 className="w-5 h-5 text-orange-500/50" />
              </div>
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-violet-500/20 to-violet-500/5 flex items-center justify-center">
                <Mic className="w-5 h-5 text-violet-500/50" />
              </div>
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-500/20 to-emerald-500/5 flex items-center justify-center">
                <Calendar className="w-5 h-5 text-emerald-500/50" />
              </div>
            </div>
            <p className="text-sm text-slate-500">
              Ask about a contact or deal to see relevant data here.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

export interface Integration {
  id: string;
  name: string;
  connected: boolean;
  settingsUrl?: string;
}

interface ConnectedSectionProps {
  integrations?: Integration[];
  onAddConnector?: () => void;
}

// Integration logo component using the useIntegrationLogo hook
interface IntegrationLogoProps {
  integrationId: string;
  connected: boolean;
}

function IntegrationLogo({ integrationId, connected }: IntegrationLogoProps) {
  // Map integration IDs to the hook's expected format
  const logoIdMap: Record<string, string> = {
    hubspot: 'hubspot',
    fathom: 'fathom',
    slack: 'slack',
    calendar: 'google-calendar',
    gmail: 'gmail',
    'google-calendar': 'google-calendar',
  };

  const logoId = logoIdMap[integrationId] || integrationId;
  const { logoUrl, isLoading } = useIntegrationLogo(logoId, { enableFetch: true });

  // Fallback icon if logo isn't available
  const FallbackIcon = Link2;

  if (isLoading || !logoUrl) {
    return (
      <div className={cn(
        'w-6 h-6 rounded flex items-center justify-center',
        connected ? 'bg-white/10' : 'bg-white/5'
      )}>
        <FallbackIcon className={cn('w-4 h-4', connected ? 'text-slate-300' : 'text-slate-500')} />
      </div>
    );
  }

  return (
    <img
      src={logoUrl}
      alt={`${integrationId} logo`}
      className={cn(
        'w-6 h-6 object-contain rounded',
        !connected && 'opacity-40 grayscale'
      )}
      onError={(e) => {
        // Hide broken images
        (e.target as HTMLImageElement).style.display = 'none';
      }}
    />
  );
}

// Brand colors for each integration (used for glow effects)
const brandColors: Record<string, string> = {
  hubspot: '#FF7A59',
  fathom: '#8B5CF6',
  slack: '#E01E5A',
  calendar: '#4285F4',
  gmail: '#EA4335',
  'google-calendar': '#4285F4',
};

function ConnectedSection({ integrations, onAddConnector }: ConnectedSectionProps) {
  // Default to the 4 integrations in scope
  const defaultIntegrations: Integration[] = [
    { id: 'hubspot', name: 'HubSpot', connected: false, settingsUrl: '/settings/integrations/hubspot' },
    { id: 'fathom', name: 'Fathom', connected: false, settingsUrl: '/settings/integrations/fathom' },
    { id: 'slack', name: 'Slack', connected: false, settingsUrl: '/settings/integrations/slack' },
    { id: 'calendar', name: 'Calendar', connected: false, settingsUrl: '/settings/integrations/calendar' },
  ];

  const items = integrations || defaultIntegrations;
  const connectedCount = items.filter(i => i.connected).length;

  const handleAddConnector = () => {
    if (onAddConnector) {
      onAddConnector();
    } else {
      window.location.href = '/settings/integrations';
    }
  };

  const handleIntegrationClick = (integration: Integration) => {
    if (integration.settingsUrl) {
      window.location.href = integration.settingsUrl;
    }
  };

  return (
    <div className="p-4 sm:p-5 border-b border-white/5">
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-semibold text-white text-sm flex items-center gap-2">
          <Link2 className="w-4 h-4 text-purple-400" />
          Connected
          {connectedCount > 0 && (
            <span className="text-xs text-slate-400">({connectedCount})</span>
          )}
        </h3>
        <button
          type="button"
          onClick={handleAddConnector}
          className="text-xs text-slate-400 hover:text-violet-400 transition-colors"
        >
          + Add
        </button>
      </div>

      {/* Compact horizontal logo row - responsive gap */}
      <div className="flex items-center gap-2 sm:gap-3 flex-wrap">
        {items.map((integration) => {
          const color = brandColors[integration.id] || '#64748b';

          return (
            <button
              key={integration.id}
              type="button"
              onClick={() => handleIntegrationClick(integration)}
              title={`${integration.name}${integration.connected ? ' (Connected)' : ' (Click to connect)'}`}
              className={cn(
                'relative w-10 h-10 sm:w-11 sm:h-11 rounded-xl flex items-center justify-center transition-all',
                'hover:scale-110',
                integration.connected
                  ? 'bg-white/10 hover:bg-white/15'
                  : 'bg-white/[0.03] hover:bg-white/10'
              )}
              style={{
                boxShadow: integration.connected ? `0 4px 14px ${color}30` : undefined
              }}
            >
              <IntegrationLogo integrationId={integration.id} connected={integration.connected} />
              {/* Connected indicator dot */}
              {integration.connected && (
                <div className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-emerald-500 border-2 border-slate-900 shadow-lg shadow-emerald-500/50" />
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ============================================================================
// History Section
// ============================================================================

interface HistorySectionProps {
  currentConversationId?: string | null;
  onSelectConversation: (id: string) => void;
  onNewConversation: () => void;
}

function HistorySection({ currentConversationId, onSelectConversation, onNewConversation }: HistorySectionProps) {
  return (
    <CollapsibleSection
      title="History"
      icon={<History className="w-4 h-4" />}
      iconColor="text-slate-400"
      defaultOpen={false}
    >
      <div className="max-h-64 overflow-y-auto -mx-2">
        <ConversationHistory
          currentConversationId={currentConversationId}
          onSelectConversation={onSelectConversation}
          onNewConversation={onNewConversation}
          compact
        />
      </div>
    </CollapsibleSection>
  );
}

export interface CopilotRightPanelProps {
  /** Action items pending user approval (uses store if not provided) */
  actionItems?: ActionItem[];
  /** Context data sources being used */
  contextItems?: ContextItem[];
  /** Summary counts for context data being gathered */
  contextSummary?: ContextSummary;
  /** Whether context is currently loading */
  isContextLoading?: boolean;
  /** Integration connection status */
  integrations?: Integration[];
  /** Progress steps for current task */
  progressSteps?: ProgressStep[];
  /** Whether AI is currently processing */
  isProcessing?: boolean;
  /** Current conversation ID for history section */
  currentConversationId?: string | null;
  /** Callback when a conversation is selected from history */
  onSelectConversation?: (id: string) => void;
  /** Callback to start a new conversation */
  onNewConversation?: () => void;
  /** Tool execution telemetry events for INT-003 */
  telemetryEvents?: TelemetryEvent[];
}

export function CopilotRightPanel({
  actionItems = [],
  contextItems = [],
  contextSummary,
  isContextLoading = false,
  integrations,
  progressSteps = [],
  isProcessing = false,
  currentConversationId,
  onSelectConversation,
  onNewConversation,
  telemetryEvents = [],
}: CopilotRightPanelProps) {
  // INT-003: Track compact/expanded telemetry view
  const [telemetryCompact, setTelemetryCompact] = useState(true);
  const hasTelemetry = telemetryEvents.length > 0;
  const isAllComplete = hasTelemetry && telemetryEvents.every(e => e.status === 'success' || e.status === 'failed');

  return (
    <div className="h-full flex flex-col">
      <ProgressSection steps={progressSteps} />

      {/* INT-003: Execution Telemetry - show during processing or after completion */}
      {hasTelemetry && (
        <div className="p-4 sm:p-5 border-b border-white/5">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-semibold text-white text-sm flex items-center gap-2">
              <Activity className="w-4 h-4 text-blue-400" />
              Tool Execution
            </h3>
            {isAllComplete && (
              <button
                type="button"
                onClick={() => setTelemetryCompact(!telemetryCompact)}
                className="text-xs text-slate-400 hover:text-violet-400 transition-colors"
              >
                {telemetryCompact ? 'Expand' : 'Collapse'}
              </button>
            )}
          </div>
          <ExecutionTelemetry
            events={telemetryEvents}
            compact={isAllComplete && telemetryCompact}
          />
        </div>
      )}

      <ActionItemsSection items={actionItems} />
      <ContextSection items={contextItems} summary={contextSummary} isLoading={isContextLoading} />
      <ConnectedSection integrations={integrations} />
      {onSelectConversation && onNewConversation && (
        <HistorySection
          currentConversationId={currentConversationId}
          onSelectConversation={onSelectConversation}
          onNewConversation={onNewConversation}
        />
      )}
    </div>
  );
}

export default CopilotRightPanel;
