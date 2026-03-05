/**
 * CRMMutationAuditTrail — CRM-CFG-003 + CRM-CFG-004
 *
 * Paginated audit trail of all CRM mutations with before/after values.
 * Undo button for recent auto-applied changes (within 24h).
 */

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  History,
  Undo2,
  CheckCircle2,
  XCircle,
  AlertCircle,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  ChevronRight as ChevronRightIcon,
  Loader2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { useActiveOrgId } from '@/lib/stores/orgStore';
import { useCRMMutationAudit, useUndoCRMMutation, type CRMMutation } from '@/lib/hooks/useCRMFieldMapping';
import { formatRelativeDate } from '@/lib/utils/formatters';

const PAGE_SIZE = 20;

// ============================================================
// Status config
// ============================================================

const STATUS_CONFIG: Record<string, { label: string; icon: React.ElementType; color: string }> = {
  completed: { label: 'Completed', icon: CheckCircle2, color: 'text-emerald-500' },
  failed: { label: 'Failed', icon: XCircle, color: 'text-red-500' },
  dead_letter: { label: 'Dead Letter', icon: AlertCircle, color: 'text-amber-500' },
};

const OPERATION_LABELS: Record<string, string> = {
  create: 'Created',
  update: 'Updated',
  associate: 'Associated',
  delete: 'Deleted',
};

// ============================================================
// Diff viewer: show field changes
// ============================================================

function PayloadDiff({
  payload,
  previousPayload,
}: {
  payload: Record<string, unknown>;
  previousPayload: Record<string, unknown> | null;
}) {
  const [expanded, setExpanded] = useState(false);
  const fields = Object.keys(payload);
  const preview = fields.slice(0, 2);
  const remaining = fields.length - 2;

  if (fields.length === 0) return <span className="text-xs text-gray-400">No fields</span>;

  return (
    <div className="space-y-1">
      {(expanded ? fields : preview).map((key) => {
        const newVal = String(payload[key] ?? '—');
        const oldVal = previousPayload ? String(previousPayload[key] ?? '—') : null;
        const changed = oldVal !== null && oldVal !== newVal;

        return (
          <div key={key} className="flex items-start gap-2 text-xs">
            <span className="font-mono text-gray-400 dark:text-gray-500 shrink-0">{key}:</span>
            {changed && oldVal !== null ? (
              <span className="flex items-center gap-1 flex-wrap">
                <span className="line-through text-red-400 dark:text-red-500 max-w-[120px] truncate" title={oldVal}>
                  {oldVal}
                </span>
                <span className="text-gray-400">→</span>
                <span className="text-emerald-600 dark:text-emerald-400 max-w-[120px] truncate" title={newVal}>
                  {newVal}
                </span>
              </span>
            ) : (
              <span className="text-gray-700 dark:text-gray-300 max-w-[160px] truncate" title={newVal}>
                {newVal}
              </span>
            )}
          </div>
        );
      })}
      {fields.length > 2 && (
        <button
          onClick={() => setExpanded((e) => !e)}
          className="flex items-center gap-1 text-[10px] text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
        >
          {expanded
            ? <><ChevronDown className="h-3 w-3" />Show less</>
            : <><ChevronRightIcon className="h-3 w-3" />+{remaining} more fields</>
          }
        </button>
      )}
    </div>
  );
}

// ============================================================
// Mutation row
// ============================================================

function isUndoable(mutation: CRMMutation): boolean {
  if (mutation.is_undone) return false;
  if (mutation.status !== 'completed') return false;
  if (!mutation.previous_payload) return false;
  if (!mutation.completed_at) return false;
  const age = Date.now() - new Date(mutation.completed_at).getTime();
  return age < 24 * 60 * 60 * 1000; // Within 24h
}

function MutationRow({ mutation, isAdmin }: { mutation: CRMMutation; isAdmin: boolean }) {
  const { mutate: undo, isPending: undoing } = useUndoCRMMutation();
  const statusConfig = STATUS_CONFIG[mutation.status] ?? STATUS_CONFIG.completed;
  const StatusIcon = statusConfig.icon;

  return (
    <div className={cn(
      'flex items-start gap-3 p-3 rounded-xl border transition-colors',
      mutation.is_undone
        ? 'bg-gray-50/50 dark:bg-white/[0.01] border-gray-100 dark:border-white/[0.04] opacity-60'
        : 'bg-white dark:bg-white/[0.025] border-gray-200/80 dark:border-white/[0.05] hover:border-gray-300 dark:hover:border-white/[0.08]'
    )}>
      {/* Status icon */}
      <StatusIcon className={cn('h-4 w-4 shrink-0 mt-0.5', statusConfig.color)} />

      {/* Content */}
      <div className="flex-1 min-w-0 space-y-1">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-medium text-gray-800 dark:text-gray-200 capitalize">
            {OPERATION_LABELS[mutation.operation] ?? mutation.operation} {mutation.entity_type}
          </span>
          <Badge className="text-[10px] border-0 bg-gray-100 dark:bg-white/[0.06] text-gray-600 dark:text-gray-400">
            {mutation.crm_source}
          </Badge>
          {mutation.triggered_by && (
            <Badge className="text-[10px] border-0 bg-blue-50 dark:bg-blue-500/10 text-blue-600 dark:text-blue-400">
              {mutation.triggered_by}
            </Badge>
          )}
          {mutation.is_undone && (
            <Badge className="text-[10px] border-0 bg-amber-50 dark:bg-amber-500/10 text-amber-600 dark:text-amber-400">
              Undone
            </Badge>
          )}
        </div>

        <PayloadDiff payload={mutation.payload} previousPayload={mutation.previous_payload} />

        {mutation.last_error && (
          <p className="text-xs text-red-500 dark:text-red-400 mt-1">{mutation.last_error}</p>
        )}

        <p className="text-[10px] text-gray-400 dark:text-gray-500">
          {mutation.completed_at
            ? formatRelativeDate(mutation.completed_at)
            : formatRelativeDate(mutation.created_at)}
          {mutation.crm_record_id && (
            <span className="ml-2 font-mono">#{mutation.crm_record_id.slice(0, 8)}</span>
          )}
        </p>
      </div>

      {/* Undo button */}
      {isAdmin && isUndoable(mutation) && (
        <Button
          variant="outline"
          size="sm"
          className="shrink-0 h-7 px-2 text-xs"
          onClick={() => undo(mutation.id)}
          disabled={undoing}
        >
          {undoing ? <Loader2 className="h-3 w-3 animate-spin" /> : <Undo2 className="h-3 w-3" />}
          <span className="ml-1">Undo</span>
        </Button>
      )}
    </div>
  );
}

// ============================================================
// Main component
// ============================================================

interface CRMMutationAuditTrailProps {
  isAdmin: boolean;
}

export function CRMMutationAuditTrail({ isAdmin }: CRMMutationAuditTrailProps) {
  const orgId = useActiveOrgId();
  const [expanded, setExpanded] = useState(true);
  const [page, setPage] = useState(0);
  const [entityFilter, setEntityFilter] = useState<string>('all');

  const { data: mutations, isLoading } = useCRMMutationAudit(
    orgId,
    entityFilter === 'all' ? undefined : entityFilter,
    PAGE_SIZE,
    page * PAGE_SIZE
  );

  const hasMore = (mutations?.length ?? 0) === PAGE_SIZE;

  return (
    <Card className="bg-white/80 dark:bg-gray-900/40 backdrop-blur-xl rounded-2xl border border-gray-200/60 dark:border-gray-700/40">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <button
            className="flex items-center gap-2 text-left flex-1"
            onClick={() => setExpanded((v) => !v)}
          >
            <History className="w-4 h-4 text-blue-500" />
            <div>
              <CardTitle className="text-base">CRM Mutation Audit Trail</CardTitle>
              <CardDescription className="text-xs mt-0.5">
                All CRM field writes — auto-applied and manual
              </CardDescription>
            </div>
            {expanded
              ? <ChevronDown className="w-4 h-4 text-gray-400 ml-2" />
              : <ChevronRightIcon className="w-4 h-4 text-gray-400 ml-2" />
            }
          </button>

          {expanded && (
            <Select value={entityFilter} onValueChange={(v) => { setEntityFilter(v); setPage(0); }}>
              <SelectTrigger className="h-8 w-[130px] text-xs ml-3">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All types</SelectItem>
                <SelectItem value="deal">Deals</SelectItem>
                <SelectItem value="contact">Contacts</SelectItem>
                <SelectItem value="company">Companies</SelectItem>
                <SelectItem value="activity">Activities</SelectItem>
              </SelectContent>
            </Select>
          )}
        </div>
      </CardHeader>

      {expanded && (
        <CardContent className="space-y-2">
          {isLoading ? (
            <div className="space-y-2">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-16 bg-gray-100 dark:bg-white/[0.025] rounded-xl animate-pulse" />
              ))}
            </div>
          ) : !mutations || mutations.length === 0 ? (
            <div className="text-center py-8">
              <History className="h-8 w-8 text-gray-300 dark:text-gray-600 mx-auto mb-2" />
              <p className="text-sm text-gray-500 dark:text-gray-400">No mutations recorded yet</p>
              <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
                CRM writes will appear here once the writeback worker processes them
              </p>
            </div>
          ) : (
            <>
              <div className="space-y-2">
                {mutations.map((m) => (
                  <MutationRow key={m.id} mutation={m} isAdmin={isAdmin} />
                ))}
              </div>

              {/* Pagination */}
              <div className="flex items-center justify-between pt-2">
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 px-2 text-xs"
                  onClick={() => setPage((p) => Math.max(0, p - 1))}
                  disabled={page === 0}
                >
                  <ChevronLeft className="h-3.5 w-3.5 mr-1" />
                  Previous
                </Button>
                <span className="text-xs text-gray-400">Page {page + 1}</span>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 px-2 text-xs"
                  onClick={() => setPage((p) => p + 1)}
                  disabled={!hasMore}
                >
                  Next
                  <ChevronRight className="h-3.5 w-3.5 ml-1" />
                </Button>
              </div>
            </>
          )}
        </CardContent>
      )}
    </Card>
  );
}
