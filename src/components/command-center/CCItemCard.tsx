import { useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Mail,
  AlertTriangle,
  TrendingUp,
  Lightbulb,
  Calendar,
  Plug,
  Check,
  X,
  Clock,
  ChevronDown,
  ChevronUp,
  Loader2,
  ExternalLink,
} from 'lucide-react';
import { formatDistanceToNow, addHours, addDays } from 'date-fns';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from '@/components/ui/dropdown-menu';
import { supabase } from '@/lib/supabase/clientV2';
import { toast } from 'sonner';
import { ApprovalProgressBadge } from './ApprovalProgressBadge';
import { EventReplayTrail } from './EventReplayTrail';

// ── Types ────────────────────────────────────────────────────────────

export type CCItemType =
  | 'follow_up'
  | 'risk_alert'
  | 'opportunity'
  | 'insight'
  | 'meeting_prep'
  | 'integration_alert';

export type CCItemUrgency = 'critical' | 'high' | 'normal' | 'low';

export type CCItemStatus =
  | 'open'
  | 'enriching'
  | 'ready'
  | 'approved'
  | 'executing'
  | 'completed'
  | 'dismissed'
  | 'auto_resolved';

export interface DraftedAction {
  label?: string;
  type?: string;
  payload?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface CommandCentreItem {
  id: string;
  org_id: string;
  user_id: string;
  source_agent: string | null;
  source_event_id: string | null;
  item_type: CCItemType;
  title: string;
  summary: string | null;
  context: Record<string, unknown> | null;
  priority_score: number;
  urgency: CCItemUrgency;
  due_date: string | null;
  enrichment_status: string | null;
  drafted_action: DraftedAction | null;
  confidence_score: number | null;
  status: CCItemStatus;
  resolution_channel: string | null;
  deal_id: string | null;
  contact_id: string | null;
  created_at: string;
  updated_at: string;
  resolved_at: string | null;
}

// ── Icon + Urgency Mappings ─────────────────────────────────────────

const ITEM_TYPE_ICON: Record<CCItemType, typeof Mail> = {
  follow_up: Mail,
  risk_alert: AlertTriangle,
  opportunity: TrendingUp,
  insight: Lightbulb,
  meeting_prep: Calendar,
  integration_alert: Plug,
};

const ITEM_TYPE_COLOR: Record<CCItemType, string> = {
  follow_up: 'text-blue-400',
  risk_alert: 'text-red-400',
  opportunity: 'text-emerald-400',
  insight: 'text-amber-400',
  meeting_prep: 'text-violet-400',
  integration_alert: 'text-orange-400',
};

const URGENCY_BADGE_VARIANT: Record<CCItemUrgency, 'destructive' | 'warning' | 'secondary' | 'outline'> = {
  critical: 'destructive',
  high: 'warning',
  normal: 'secondary',
  low: 'outline',
};

const URGENCY_LABEL: Record<CCItemUrgency, string> = {
  critical: 'Critical',
  high: 'High',
  normal: 'Normal',
  low: 'Low',
};

// ── Component ───────────────────────────────────────────────────────

interface CCItemCardProps {
  item: CommandCentreItem;
  onStatusChange?: (id: string, newStatus: CCItemStatus) => void;
}

export function CCItemCard({ item, onStatusChange }: CCItemCardProps) {
  const [expanded, setExpanded] = useState(false);
  const [approving, setApproving] = useState(false);
  const [dismissing, setDismissing] = useState(false);

  const Icon = ITEM_TYPE_ICON[item.item_type] ?? Lightbulb;
  const iconColor = ITEM_TYPE_COLOR[item.item_type] ?? 'text-gray-400';

  const handleApprove = useCallback(async () => {
    setApproving(true);
    try {
      // If there is a drafted action, fire the edge function
      if (item.drafted_action) {
        const { error: fnError } = await supabase.functions.invoke('cc-execute-action', {
          body: {
            item_id: item.id,
            action: item.drafted_action,
          },
        });
        if (fnError) {
          toast.error('Failed to execute action');
          setApproving(false);
          return;
        }
      }

      // Update status to approved
      const { error } = await supabase
        .from('command_centre_items')
        .update({ status: 'approved', resolved_at: new Date().toISOString() })
        .eq('id', item.id);

      if (error) {
        toast.error('Failed to approve item');
      } else {
        toast.success('Action approved');
        onStatusChange?.(item.id, 'approved');
      }
    } catch {
      toast.error('Something went wrong');
    } finally {
      setApproving(false);
    }
  }, [item, onStatusChange]);

  const handleDismiss = useCallback(async () => {
    setDismissing(true);
    try {
      const { error } = await supabase
        .from('command_centre_items')
        .update({ status: 'dismissed', resolved_at: new Date().toISOString() })
        .eq('id', item.id);

      if (error) {
        toast.error('Failed to dismiss item');
      } else {
        toast.success('Item dismissed');
        onStatusChange?.(item.id, 'dismissed');
      }
    } catch {
      toast.error('Something went wrong');
    } finally {
      setDismissing(false);
    }
  }, [item.id, onStatusChange]);

  const handleSnooze = useCallback(async (until: Date) => {
    try {
      const { error } = await supabase
        .from('command_centre_items')
        .update({ due_date: until.toISOString() })
        .eq('id', item.id);

      if (error) {
        toast.error('Failed to snooze item');
      } else {
        toast.success(`Snoozed until ${until.toLocaleString()}`);
      }
    } catch {
      toast.error('Something went wrong');
    }
  }, [item.id]);

  const snoozeOptions = [
    { label: '1 hour', getDate: () => addHours(new Date(), 1) },
    { label: '4 hours', getDate: () => addHours(new Date(), 4) },
    { label: 'Tomorrow', getDate: () => addDays(new Date(), 1) },
    { label: 'Next week', getDate: () => addDays(new Date(), 7) },
  ];

  return (
    <div
      className="group rounded-xl border border-gray-800/60 bg-gray-900/60 hover:bg-gray-800/40 hover:border-gray-700/60 transition-all duration-200"
    >
      {/* Main row */}
      <button
        type="button"
        className="w-full text-left px-4 py-3 flex items-start gap-3"
        onClick={() => setExpanded((v) => !v)}
      >
        {/* Icon */}
        <div className={`mt-0.5 shrink-0 ${iconColor}`}>
          <Icon className="w-4.5 h-4.5" />
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0 space-y-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-medium text-white leading-tight line-clamp-1">
              {item.title}
            </span>
            <Badge variant={URGENCY_BADGE_VARIANT[item.urgency]} className="text-[10px] px-1.5 py-0">
              {URGENCY_LABEL[item.urgency]}
            </Badge>
          </div>

          {item.summary && (
            <p className="text-xs text-gray-400 leading-relaxed line-clamp-2">
              {item.summary}
            </p>
          )}

          <div className="flex items-center gap-2 text-[10px] text-gray-500">
            {item.source_agent && (
              <span className="inline-flex items-center gap-1 bg-gray-800/60 px-1.5 py-0.5 rounded">
                {item.source_agent}
              </span>
            )}
            <span>
              {formatDistanceToNow(new Date(item.created_at), { addSuffix: true })}
            </span>
          </div>

          {/* US-017: Approval progress badge */}
          <ApprovalProgressBadge actionType={item.drafted_action?.type} />
        </div>

        {/* Expand chevron */}
        <div className="shrink-0 mt-1 text-gray-500">
          {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </div>
      </button>

      {/* Expanded details */}
      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: 'easeInOut' }}
            className="overflow-hidden"
          >
            <div className="px-4 pb-4 space-y-3 border-t border-gray-800/50 pt-3">
              {/* Full context */}
              {item.context && Object.keys(item.context).length > 0 && (
                <div className="space-y-1">
                  <span className="text-[10px] uppercase tracking-wider text-gray-500 font-medium">
                    Context
                  </span>
                  <div className="text-xs text-gray-300 bg-gray-800/40 rounded-lg p-3 space-y-1">
                    {Object.entries(item.context).map(([key, value]) => (
                      <div key={key} className="flex gap-2">
                        <span className="text-gray-500 shrink-0">{key}:</span>
                        <span className="text-gray-300 break-all">{String(value)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Drafted action preview */}
              {item.drafted_action && (
                <div className="space-y-1">
                  <span className="text-[10px] uppercase tracking-wider text-gray-500 font-medium">
                    Drafted Action
                  </span>
                  <div className="text-xs text-gray-300 bg-violet-500/10 border border-violet-500/20 rounded-lg p-3">
                    {item.drafted_action.label || item.drafted_action.type || 'Action ready'}
                  </div>
                </div>
              )}

              {/* Linked entities */}
              {(item.deal_id || item.contact_id) && (
                <div className="flex items-center gap-3 text-xs">
                  {item.deal_id && (
                    <span className="inline-flex items-center gap-1 text-blue-400 hover:text-blue-300 cursor-pointer">
                      <ExternalLink className="w-3 h-3" />
                      Linked deal
                    </span>
                  )}
                  {item.contact_id && (
                    <span className="inline-flex items-center gap-1 text-blue-400 hover:text-blue-300 cursor-pointer">
                      <ExternalLink className="w-3 h-3" />
                      Linked contact
                    </span>
                  )}
                </div>
              )}

              {/* Confidence */}
              {item.confidence_score != null && (
                <div className="text-[10px] text-gray-500">
                  Confidence: {Math.round(item.confidence_score * 100)}%
                </div>
              )}

              {/* US-024: Event replay trail */}
              <EventReplayTrail sourceEventId={item.source_event_id} />

              {/* Action buttons */}
              <div className="flex items-center gap-2 pt-1">
                <Button
                  size="sm"
                  variant="default"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleApprove();
                  }}
                  disabled={approving || dismissing}
                  className="h-7 text-xs gap-1.5"
                >
                  {approving ? (
                    <Loader2 className="w-3 h-3 animate-spin" />
                  ) : (
                    <Check className="w-3 h-3" />
                  )}
                  Approve
                </Button>

                <Button
                  size="sm"
                  variant="ghost"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleDismiss();
                  }}
                  disabled={approving || dismissing}
                  className="h-7 text-xs gap-1.5 text-gray-400 hover:text-gray-200"
                >
                  {dismissing ? (
                    <Loader2 className="w-3 h-3 animate-spin" />
                  ) : (
                    <X className="w-3 h-3" />
                  )}
                  Dismiss
                </Button>

                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 text-xs gap-1.5 text-gray-400 hover:text-gray-200"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <Clock className="w-3 h-3" />
                      Snooze
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start">
                    {snoozeOptions.map((option) => (
                      <DropdownMenuItem
                        key={option.label}
                        onClick={() => handleSnooze(option.getDate())}
                      >
                        {option.label}
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
