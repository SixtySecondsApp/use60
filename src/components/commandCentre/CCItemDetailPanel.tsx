/**
 * CCItemDetailPanel — CC12-005
 *
 * Sheet side panel that renders full detail for a Command Centre item.
 * Opens when the user clicks an item card in CommandCentre.tsx.
 *
 * Sections:
 *  - Header: title, urgency badge, source agent tag, close button
 *  - Enrichment context: collapsible section per key
 *  - Drafted action: editable payload fields
 *  - Confidence breakdown: score progress bar + factor list
 *  - Timeline: created → enriched → ready → resolved
 *  - Deal/Contact links
 */

import { useState } from 'react';
import {
  AlertTriangle,
  ArrowUp,
  Bell,
  Check,
  ChevronDown,
  ChevronRight,
  Clock,
  ExternalLink,
  Loader2,
  RotateCcw,
  User,
  X,
  Zap,
  Briefcase,
  Calendar,
  Mail,
  Info,
  Edit3,
  Save,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { toast } from 'sonner';
import { useCommandCentreItemMutations } from '@/lib/hooks/useCommandCentreItemsQuery';
import type { CCItem } from '@/lib/services/commandCentreItemsService';

// ============================================================================
// Props
// ============================================================================

export interface CCItemDetailPanelProps {
  item: CCItem;
  open: boolean;
  onClose: () => void;
}

// ============================================================================
// Urgency badge
// ============================================================================

const URGENCY_CONFIG = {
  critical: {
    label: 'Critical',
    badgeClass: 'bg-red-100 text-red-700 dark:bg-red-500/20 dark:text-red-400',
    icon: AlertTriangle,
  },
  high: {
    label: 'High',
    badgeClass: 'bg-orange-100 text-orange-700 dark:bg-orange-500/20 dark:text-orange-400',
    icon: ArrowUp,
  },
  normal: {
    label: 'Normal',
    badgeClass: 'bg-blue-100 text-blue-700 dark:bg-blue-500/20 dark:text-blue-400',
    icon: Bell,
  },
  low: {
    label: 'Low',
    badgeClass: 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400',
    icon: ChevronDown,
  },
} as const;

function UrgencyBadge({ urgency }: { urgency: CCItem['urgency'] }) {
  const config = URGENCY_CONFIG[urgency] ?? URGENCY_CONFIG.normal;
  const Icon = config.icon;
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium',
        config.badgeClass,
      )}
    >
      <Icon className="h-3.5 w-3.5" />
      {config.label}
    </span>
  );
}

// ============================================================================
// Agent tag
// ============================================================================

function AgentTag({ agent }: { agent: string }) {
  const label = agent.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
  return (
    <span className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-violet-50 text-violet-700 dark:bg-violet-500/10 dark:text-violet-400 text-xs font-medium">
      <Zap className="h-3 w-3" />
      {label}
    </span>
  );
}

// ============================================================================
// Section header (collapsible)
// ============================================================================

function CollapsibleSection({
  title,
  icon: Icon,
  defaultOpen = true,
  children,
}: {
  title: string;
  icon?: React.ElementType;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border border-slate-200 dark:border-gray-700/60 rounded-lg overflow-hidden">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between px-4 py-3 bg-slate-50 dark:bg-gray-800/60 hover:bg-slate-100 dark:hover:bg-gray-800 transition-colors text-left"
      >
        <span className="flex items-center gap-2 text-sm font-semibold text-slate-700 dark:text-gray-200">
          {Icon && <Icon className="h-3.5 w-3.5 text-slate-400 dark:text-gray-500" />}
          {title}
        </span>
        {open ? (
          <ChevronDown className="h-4 w-4 text-slate-400 dark:text-gray-500" />
        ) : (
          <ChevronRight className="h-4 w-4 text-slate-400 dark:text-gray-500" />
        )}
      </button>
      {open && (
        <div className="px-4 py-3 bg-white dark:bg-gray-900/40">
          {children}
        </div>
      )}
    </div>
  );
}

// ============================================================================
// Enrichment context renderer
// ============================================================================

function EnrichmentContextSection({ context }: { context: Record<string, unknown> }) {
  const entries = Object.entries(context);
  if (entries.length === 0) {
    return (
      <p className="text-xs text-slate-400 dark:text-gray-500 italic">
        No enrichment context available yet.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      {entries.map(([key, value]) => {
        const sectionTitle = key
          .replace(/_/g, ' ')
          .replace(/\b\w/g, (c) => c.toUpperCase());

        // Pick icon based on key name
        const iconMap: Record<string, React.ElementType> = {
          crm: Briefcase,
          email: Mail,
          calendar: Calendar,
          meeting: Calendar,
          pipeline: Briefcase,
          contact: User,
        };
        const SectionIcon = iconMap[key.toLowerCase()] ?? Info;

        return (
          <CollapsibleSection key={key} title={sectionTitle} icon={SectionIcon} defaultOpen={false}>
            <EnrichmentValueRenderer value={value} />
          </CollapsibleSection>
        );
      })}
    </div>
  );
}

function EnrichmentValueRenderer({ value }: { value: unknown }) {
  if (value === null || value === undefined) {
    return <p className="text-xs text-slate-400 dark:text-gray-500 italic">Empty</p>;
  }

  if (typeof value === 'string') {
    return <p className="text-sm text-slate-600 dark:text-gray-300 leading-relaxed">{value}</p>;
  }

  if (typeof value === 'number' || typeof value === 'boolean') {
    return <p className="text-sm text-slate-600 dark:text-gray-300">{String(value)}</p>;
  }

  if (Array.isArray(value)) {
    if (value.length === 0) {
      return <p className="text-xs text-slate-400 dark:text-gray-500 italic">Empty list</p>;
    }
    return (
      <ul className="space-y-1">
        {value.map((item, i) => (
          <li key={i} className="flex items-start gap-2 text-sm text-slate-600 dark:text-gray-300">
            <span className="w-1.5 h-1.5 rounded-full bg-slate-300 dark:bg-gray-600 mt-2 flex-shrink-0" />
            {typeof item === 'object' ? (
              <pre className="text-xs whitespace-pre-wrap break-words text-slate-500 dark:text-gray-400">
                {JSON.stringify(item, null, 2)}
              </pre>
            ) : (
              String(item)
            )}
          </li>
        ))}
      </ul>
    );
  }

  if (typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>);
    return (
      <div className="space-y-1.5">
        {entries.map(([k, v]) => (
          <div key={k} className="flex items-start justify-between gap-3 py-1 border-b border-slate-100 dark:border-gray-800/50 last:border-0">
            <span className="text-xs text-slate-500 dark:text-gray-400 capitalize flex-shrink-0">
              {k.replace(/_/g, ' ')}
            </span>
            <span className="text-xs text-slate-700 dark:text-gray-300 text-right break-words max-w-[60%]">
              {typeof v === 'object' ? JSON.stringify(v) : String(v ?? '—')}
            </span>
          </div>
        ))}
      </div>
    );
  }

  return <p className="text-xs text-slate-500 dark:text-gray-400">{String(value)}</p>;
}

// ============================================================================
// Drafted action editor
// ============================================================================

function DraftedActionSection({
  item,
  onSave,
  isSaving,
}: {
  item: CCItem;
  onSave: (action: Record<string, unknown>) => void;
  isSaving: boolean;
}) {
  const action = item.drafted_action;
  const editableFields = (action?.editable_fields as string[] | undefined) ?? [];
  const displayText = action?.display_text as string | undefined;

  // Local state for editing
  const [editedValues, setEditedValues] = useState<Record<string, string>>(() => {
    const init: Record<string, string> = {};
    for (const field of editableFields) {
      const v = action?.[field];
      init[field] = v !== undefined && v !== null ? String(v) : '';
    }
    return init;
  });
  const [isDirty, setIsDirty] = useState(false);

  if (!action) {
    return (
      <p className="text-xs text-slate-400 dark:text-gray-500 italic">
        No drafted action available.
      </p>
    );
  }

  const handleFieldChange = (field: string, value: string) => {
    setEditedValues((prev) => ({ ...prev, [field]: value }));
    setIsDirty(true);
  };

  const handleSave = () => {
    const updatedAction = { ...action, ...editedValues };
    onSave(updatedAction);
    setIsDirty(false);
  };

  // Render all action fields (non-editable as read-only, editable as inputs)
  const allEntries = Object.entries(action).filter(
    ([k]) => k !== 'editable_fields' && k !== 'display_text',
  );

  return (
    <div className="space-y-3">
      {displayText && (
        <div className="p-3 rounded-lg bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-100 dark:border-emerald-500/20 text-sm text-slate-700 dark:text-gray-200">
          {displayText}
        </div>
      )}

      {allEntries.length > 0 && (
        <div className="space-y-2">
          {allEntries.map(([field, value]) => {
            const isEditable = editableFields.includes(field);
            const label = field.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
            const displayValue =
              typeof value === 'object' ? JSON.stringify(value) : String(value ?? '');

            return (
              <div key={field}>
                <label className="block text-xs font-medium text-slate-500 dark:text-gray-400 mb-1 capitalize">
                  {label}
                  {isEditable && (
                    <span className="ml-1.5 inline-flex items-center gap-0.5 text-violet-500 dark:text-violet-400">
                      <Edit3 className="h-2.5 w-2.5" />
                      <span className="text-[10px]">editable</span>
                    </span>
                  )}
                </label>
                {isEditable ? (
                  <textarea
                    value={editedValues[field] ?? ''}
                    onChange={(e) => handleFieldChange(field, e.target.value)}
                    rows={field.toLowerCase().includes('body') || field.toLowerCase().includes('message') ? 4 : 2}
                    className="w-full text-sm text-slate-800 dark:text-gray-100 bg-white dark:bg-gray-800 border border-slate-200 dark:border-gray-600 rounded-md px-3 py-2 resize-none focus:outline-none focus:ring-2 focus:ring-violet-500/50 focus:border-violet-400"
                  />
                ) : (
                  <p className="text-sm text-slate-600 dark:text-gray-300 bg-slate-50 dark:bg-gray-800/40 rounded-md px-3 py-2 break-words">
                    {displayValue || <span className="text-slate-400 dark:text-gray-500 italic">—</span>}
                  </p>
                )}
              </div>
            );
          })}
        </div>
      )}

      {isDirty && (
        <Button
          size="sm"
          variant="outline"
          className="h-7 px-3 text-xs gap-1.5"
          onClick={handleSave}
          disabled={isSaving}
        >
          {isSaving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />}
          Save changes
        </Button>
      )}
    </div>
  );
}

// ============================================================================
// Confidence breakdown
// ============================================================================

function ConfidenceSection({ score, factors }: { score: number | null; factors: Record<string, unknown> }) {
  if (score == null && Object.keys(factors).length === 0) {
    return (
      <p className="text-xs text-slate-400 dark:text-gray-500 italic">No confidence data available.</p>
    );
  }

  const pct = score != null ? Math.round(score * 100) : null;
  const barColor =
    pct == null
      ? 'bg-slate-300 dark:bg-gray-600'
      : pct >= 80
      ? 'bg-emerald-500'
      : pct >= 50
      ? 'bg-amber-500'
      : 'bg-red-500';

  return (
    <div className="space-y-3">
      {pct != null && (
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-xs text-slate-500 dark:text-gray-400">Overall confidence</span>
            <span
              className={cn(
                'text-xs font-semibold tabular-nums',
                pct >= 80
                  ? 'text-emerald-600 dark:text-emerald-400'
                  : pct >= 50
                  ? 'text-amber-600 dark:text-amber-400'
                  : 'text-red-500',
              )}
            >
              {pct}%
            </span>
          </div>
          <div className="h-2 rounded-full bg-slate-100 dark:bg-gray-800 overflow-hidden">
            <div className={cn('h-full rounded-full transition-all', barColor)} style={{ width: `${pct}%` }} />
          </div>
        </div>
      )}

      {Object.keys(factors).length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-medium text-slate-500 dark:text-gray-400 uppercase tracking-wider">
            Factor breakdown
          </p>
          {Object.entries(factors).map(([factor, rawScore]) => {
            const factorPct =
              typeof rawScore === 'number'
                ? Math.round(rawScore * (rawScore <= 1 ? 100 : 1))
                : null;
            const factorLabel = factor.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
            return (
              <div key={factor}>
                <div className="flex items-center justify-between mb-0.5">
                  <span className="text-xs text-slate-500 dark:text-gray-400">{factorLabel}</span>
                  {factorPct != null && (
                    <span className="text-xs tabular-nums text-slate-600 dark:text-gray-300">{factorPct}%</span>
                  )}
                </div>
                {factorPct != null && (
                  <div className="h-1.5 rounded-full bg-slate-100 dark:bg-gray-800 overflow-hidden">
                    <div
                      className={cn(
                        'h-full rounded-full',
                        factorPct >= 75
                          ? 'bg-emerald-400'
                          : factorPct >= 50
                          ? 'bg-amber-400'
                          : 'bg-red-400',
                      )}
                      style={{ width: `${factorPct}%` }}
                    />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ============================================================================
// Timeline
// ============================================================================

interface TimelineEvent {
  label: string;
  timestamp: string | null;
  done: boolean;
}

function TimelineSection({ item }: { item: CCItem }) {
  const events: TimelineEvent[] = [
    { label: 'Created', timestamp: item.created_at, done: true },
    { label: 'Enriched', timestamp: item.enriched_at ?? null, done: item.enrichment_status === 'enriched' },
    {
      label: 'Ready',
      timestamp: null,
      done: ['ready', 'approved', 'executing', 'completed', 'dismissed', 'auto_resolved'].includes(item.status),
    },
    {
      label: item.status === 'dismissed' ? 'Dismissed' : item.status === 'auto_resolved' ? 'Auto-resolved' : 'Resolved',
      timestamp: item.resolved_at ?? null,
      done: item.resolved_at != null,
    },
  ];

  return (
    <div className="space-y-0">
      {events.map((event, i) => (
        <div key={event.label} className="flex items-start gap-3">
          <div className="flex flex-col items-center">
            <div
              className={cn(
                'w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0',
                event.done
                  ? 'bg-emerald-100 dark:bg-emerald-500/20'
                  : 'bg-slate-100 dark:bg-gray-800',
              )}
            >
              {event.done ? (
                <Check className="h-3 w-3 text-emerald-500" />
              ) : (
                <Clock className="h-3 w-3 text-slate-400 dark:text-gray-500" />
              )}
            </div>
            {i < events.length - 1 && (
              <div
                className={cn(
                  'w-px flex-1 min-h-[20px] mt-1 mb-1',
                  event.done ? 'bg-emerald-200 dark:bg-emerald-500/30' : 'bg-slate-200 dark:bg-gray-700',
                )}
              />
            )}
          </div>
          <div className="flex-1 pb-3">
            <p
              className={cn(
                'text-sm font-medium',
                event.done
                  ? 'text-slate-700 dark:text-gray-200'
                  : 'text-slate-400 dark:text-gray-500',
              )}
            >
              {event.label}
            </p>
            {event.timestamp && (
              <p className="text-xs text-slate-400 dark:text-gray-500">
                {new Date(event.timestamp).toLocaleString('en-US', {
                  weekday: 'short',
                  month: 'short',
                  day: 'numeric',
                  hour: 'numeric',
                  minute: '2-digit',
                })}
              </p>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

// ============================================================================
// Main panel
// ============================================================================

export function CCItemDetailPanel({ item, open, onClose }: CCItemDetailPanelProps) {
  const { approveItem, dismissItem, snoozeItem, undoItem, updateDraftedAction } =
    useCommandCentreItemMutations();

  const isPending =
    approveItem.isPending ||
    dismissItem.isPending ||
    snoozeItem.isPending ||
    undoItem.isPending;

  const handleApprove = () => {
    approveItem.mutate(item.id, { onSuccess: onClose });
  };

  const handleDismiss = () => {
    dismissItem.mutate(item.id, { onSuccess: onClose });
  };

  const handleSnooze = () => {
    const until = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    snoozeItem.mutate({ id: item.id, until }, {
      onSuccess: () => toast.success('Snoozed for 24 hours'),
    });
  };

  const handleUndo = () => {
    undoItem.mutate(item.id, { onSuccess: onClose });
  };

  const handleSaveDraftedAction = (action: Record<string, unknown>) => {
    updateDraftedAction.mutate({ id: item.id, action });
  };

  const enrichmentContext = (item.enrichment_context as Record<string, unknown>) ?? {};
  const confidenceFactors = (item.confidence_factors as Record<string, unknown>) ?? {};

  const canApprove = item.status === 'open' || item.status === 'ready';
  const canUndo = item.status === 'auto_resolved';
  const showDismiss = item.status !== 'dismissed' && item.status !== 'completed';

  return (
    <Sheet open={open} onOpenChange={(isOpen) => { if (!isOpen) onClose(); }}>
      <SheetContent
        side="right"
        hideClose
        className="!top-16 !h-[calc(100vh-4rem)] w-full sm:max-w-lg flex flex-col p-0 overflow-hidden"
      >
        {/* ====== HEADER ====== */}
        <SheetHeader className="flex-shrink-0 px-5 py-4 border-b border-slate-200 dark:border-gray-700/60 bg-white dark:bg-gray-900/80">
          <div className="flex items-start gap-3">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-2 flex-wrap">
                <UrgencyBadge urgency={item.urgency} />
                <AgentTag agent={item.source_agent} />
              </div>
              <SheetTitle className="text-base font-semibold text-slate-800 dark:text-gray-100 leading-snug text-left">
                {item.title}
              </SheetTitle>
            </div>
            <Button
              size="sm"
              variant="ghost"
              className="h-8 w-8 p-0 flex-shrink-0 text-slate-400 hover:text-slate-600 dark:hover:text-gray-200"
              onClick={onClose}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>

          {/* Summary */}
          {item.summary && (
            <p className="text-sm text-slate-500 dark:text-gray-400 mt-2 leading-relaxed">
              {item.summary}
            </p>
          )}

          {/* Action buttons */}
          <div className="flex items-center gap-2 mt-3 flex-wrap">
            {canApprove && (
              <Button
                size="sm"
                className="h-8 px-4 text-xs bg-emerald-600 hover:bg-emerald-700 text-white"
                onClick={handleApprove}
                disabled={isPending}
              >
                {approveItem.isPending ? (
                  <Loader2 className="h-3 w-3 animate-spin mr-1" />
                ) : (
                  <Check className="h-3 w-3 mr-1" />
                )}
                Approve
              </Button>
            )}
            {canUndo && (
              <Button
                size="sm"
                variant="outline"
                className="h-8 px-4 text-xs"
                onClick={handleUndo}
                disabled={isPending}
              >
                {undoItem.isPending ? (
                  <Loader2 className="h-3 w-3 animate-spin mr-1" />
                ) : (
                  <RotateCcw className="h-3 w-3 mr-1" />
                )}
                Undo
              </Button>
            )}
            <Button
              size="sm"
              variant="outline"
              className="h-8 px-3 text-xs"
              onClick={handleSnooze}
              disabled={isPending}
            >
              <Clock className="h-3 w-3 mr-1" />
              Snooze 24h
            </Button>
            {showDismiss && (
              <Button
                size="sm"
                variant="ghost"
                className="h-8 px-3 text-xs text-slate-500 hover:text-red-600 dark:text-gray-400"
                onClick={handleDismiss}
                disabled={isPending}
              >
                <X className="h-3 w-3 mr-1" />
                Dismiss
              </Button>
            )}
          </div>
        </SheetHeader>

        {/* ====== SCROLLABLE BODY ====== */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4 bg-slate-50 dark:bg-gray-950">

          {/* Deal / Contact links */}
          {(item.deal_id || item.contact_id) && (
            <div className="flex items-center gap-3 flex-wrap">
              {item.deal_id && (
                <a
                  href={`/crm/deals/${item.deal_id}`}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1.5 text-xs text-blue-600 dark:text-blue-400 hover:underline"
                >
                  <Briefcase className="h-3.5 w-3.5" />
                  Open deal
                  <ExternalLink className="h-3 w-3" />
                </a>
              )}
              {item.contact_id && (
                <a
                  href={`/contacts/${item.contact_id}`}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1.5 text-xs text-blue-600 dark:text-blue-400 hover:underline"
                >
                  <User className="h-3.5 w-3.5" />
                  Open contact
                  <ExternalLink className="h-3 w-3" />
                </a>
              )}
            </div>
          )}

          {/* Enrichment context */}
          <CollapsibleSection title="Enrichment Context" defaultOpen={true}>
            <EnrichmentContextSection context={enrichmentContext} />
          </CollapsibleSection>

          {/* Drafted action */}
          {item.drafted_action && (
            <CollapsibleSection title="Drafted Action" defaultOpen={true}>
              <DraftedActionSection
                item={item}
                onSave={handleSaveDraftedAction}
                isSaving={updateDraftedAction.isPending}
              />
            </CollapsibleSection>
          )}

          {/* Confidence breakdown */}
          <CollapsibleSection title="Confidence Breakdown" defaultOpen={false}>
            <ConfidenceSection score={item.confidence_score} factors={confidenceFactors} />
          </CollapsibleSection>

          {/* Timeline */}
          <CollapsibleSection title="Timeline" defaultOpen={false}>
            <TimelineSection item={item} />
          </CollapsibleSection>

          {/* Item metadata */}
          <CollapsibleSection title="Item Details" defaultOpen={false}>
            <div className="space-y-1.5">
              {[
                { label: 'Item type', value: item.item_type },
                { label: 'Status', value: item.status },
                { label: 'Enrichment status', value: item.enrichment_status },
                { label: 'Priority score', value: item.priority_score != null ? String(item.priority_score) : null },
                { label: 'Resolution channel', value: item.resolution_channel },
                { label: 'Item ID', value: item.id },
              ]
                .filter(({ value }) => value != null)
                .map(({ label, value }) => (
                  <div
                    key={label}
                    className="flex items-start justify-between gap-3 py-1 border-b border-slate-100 dark:border-gray-800/50 last:border-0"
                  >
                    <span className="text-xs text-slate-500 dark:text-gray-400 flex-shrink-0">{label}</span>
                    <span className="text-xs text-slate-700 dark:text-gray-300 text-right font-mono break-all">
                      {value}
                    </span>
                  </div>
                ))}
            </div>
          </CollapsibleSection>
        </div>
      </SheetContent>
    </Sheet>
  );
}
