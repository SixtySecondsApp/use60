import React, { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  FileText,
  Clock,
  Sparkles,
  MessageSquare,
  MoreHorizontal,
  Download,
  Pencil,
  RefreshCw,
  Send,
  Trash2,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  Plus,
} from 'lucide-react';
import { supabase } from '@/lib/supabase/clientV2';
import { useAuth } from '@/lib/contexts/AuthContext';
import { useActiveOrgId } from '@/lib/stores/orgStore';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableHeader,
  TableBody,
  TableHead,
  TableRow,
  TableCell,
} from '@/components/ui/table';
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from '@/components/ui/select';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogAction,
  AlertDialogCancel,
} from '@/components/ui/alert-dialog';
import { formatDistanceToNow } from 'date-fns';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ProposalRow {
  id: string;
  title: string | null;
  generation_status: string | null;
  status: string | null;
  trigger_type: string | null;
  credits_used: number | null;
  pdf_url: string | null;
  created_at: string | null;
  contacts: { name: string | null; email: string | null } | null;
  deals: { name: string | null; company: string | null } | null;
}

type SortField =
  | 'title'
  | 'client'
  | 'deal'
  | 'created_at'
  | 'status'
  | 'trigger_type'
  | 'credits_used';

type SortDirection = 'asc' | 'desc';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const STATUS_OPTIONS = [
  { value: 'all', label: 'All Statuses' },
  { value: 'draft', label: 'Draft' },
  { value: 'ready', label: 'Ready' },
  { value: 'sent', label: 'Sent' },
  { value: 'failed', label: 'Failed' },
] as const;

const TRIGGER_OPTIONS = [
  { value: 'all', label: 'All Triggers' },
  { value: 'auto_post_meeting', label: 'Post-Meeting' },
  { value: 'manual_button', label: 'Manual' },
  { value: 'copilot', label: 'Copilot' },
  { value: 'slack', label: 'Slack' },
] as const;

const DATE_RANGE_OPTIONS = [
  { value: 'all', label: 'All Time' },
  { value: '7', label: 'Last 7 Days' },
  { value: '30', label: 'Last 30 Days' },
  { value: '90', label: 'Last 90 Days' },
] as const;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Derive a unified display status from both `generation_status` and legacy `status`. */
function getDisplayStatus(row: ProposalRow): {
  label: string;
  variant: 'warning' | 'success' | 'default' | 'destructive' | 'secondary';
} {
  // Legacy "sent" takes precedence
  if (row.status === 'sent') {
    return { label: 'Sent', variant: 'default' };
  }

  switch (row.generation_status) {
    case 'pending':
    case 'processing':
      return { label: 'Generating', variant: 'warning' };
    case 'complete':
      return { label: 'Ready', variant: 'success' };
    case 'failed':
      return { label: 'Failed', variant: 'destructive' };
    default:
      // Fallback: legacy status column
      if (row.status === 'draft') return { label: 'Draft', variant: 'secondary' };
      if (row.status === 'generated') return { label: 'Ready', variant: 'success' };
      if (row.status === 'approved') return { label: 'Ready', variant: 'success' };
      return { label: 'Draft', variant: 'secondary' };
  }
}

function getTriggerDisplay(trigger: string | null): { icon: React.ReactNode; label: string } {
  switch (trigger) {
    case 'auto_post_meeting':
      return { icon: <Clock className="h-3.5 w-3.5" />, label: 'Post-Meeting' };
    case 'manual_button':
      return { icon: <FileText className="h-3.5 w-3.5" />, label: 'Manual' };
    case 'copilot':
      return { icon: <Sparkles className="h-3.5 w-3.5" />, label: 'Copilot' };
    case 'slack':
      return { icon: <MessageSquare className="h-3.5 w-3.5" />, label: 'Slack' };
    default:
      return { icon: <FileText className="h-3.5 w-3.5" />, label: 'Unknown' };
  }
}

function matchesStatusFilter(row: ProposalRow, filter: string): boolean {
  if (filter === 'all') return true;
  const display = getDisplayStatus(row);
  switch (filter) {
    case 'draft':
      return display.label === 'Draft';
    case 'ready':
      return display.label === 'Ready' || display.label === 'Generating';
    case 'sent':
      return display.label === 'Sent';
    case 'failed':
      return display.label === 'Failed';
    default:
      return true;
  }
}

function getSortValue(row: ProposalRow, field: SortField): string | number {
  switch (field) {
    case 'title':
      return (row.title ?? '').toLowerCase();
    case 'client':
      return (row.contacts?.name ?? '').toLowerCase();
    case 'deal':
      return (row.deals?.name ?? '').toLowerCase();
    case 'created_at':
      return row.created_at ?? '';
    case 'status':
      return getDisplayStatus(row).label.toLowerCase();
    case 'trigger_type':
      return (row.trigger_type ?? '').toLowerCase();
    case 'credits_used':
      return row.credits_used ?? 0;
    default:
      return '';
  }
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

const ProposalsList: React.FC = () => {
  const { user } = useAuth();
  const orgId = useActiveOrgId();
  const queryClient = useQueryClient();

  // Filters
  const [statusFilter, setStatusFilter] = useState('all');
  const [triggerFilter, setTriggerFilter] = useState('all');
  const [dateRange, setDateRange] = useState('all');

  // Sort
  const [sortField, setSortField] = useState<SortField>('created_at');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');

  // Delete dialog
  const [deleteTarget, setDeleteTarget] = useState<ProposalRow | null>(null);

  // -------------------------------------------------------------------------
  // Data fetching
  // -------------------------------------------------------------------------

  const { data: proposals = [], isLoading, error } = useQuery<ProposalRow[]>({
    queryKey: ['proposals', orgId, dateRange],
    queryFn: async () => {
      let query = supabase
        .from('proposals')
        .select(
          'id, title, generation_status, status, trigger_type, credits_used, pdf_url, created_at, contacts(name, email), deals(name, company)'
        )
        .order('created_at', { ascending: false });

      if (orgId) {
        query = query.eq('org_id', orgId);
      }

      // Date range filter at the query level for efficiency
      if (dateRange !== 'all') {
        const daysAgo = new Date();
        daysAgo.setDate(daysAgo.getDate() - parseInt(dateRange, 10));
        query = query.gte('created_at', daysAgo.toISOString());
      }

      const { data, error: fetchError } = await query;

      if (fetchError) throw fetchError;
      return (data ?? []) as unknown as ProposalRow[];
    },
    enabled: !!user,
  });

  // -------------------------------------------------------------------------
  // AUT-002: Record autopilot signal when a proposal is dismissed/deleted
  // -------------------------------------------------------------------------

  const recordDismissSignal = async (proposalId: string) => {
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;
      if (!token) return;

      await supabase.functions.invoke('autopilot-record-signal', {
        method: 'POST',
        body: {
          action_type: 'proposal.generate',
          agent_name: 'proposal_pipeline',
          signal: 'rejected',
          edit_distance: 0,
          autonomy_tier_at_time: 'suggest',
        },
        headers: { Authorization: `Bearer ${token}` },
      });
    } catch (err) {
      // Fire-and-forget — do not surface errors to user
      console.error('[ProposalsList] recordDismissSignal error:', err);
    }
  };

  // -------------------------------------------------------------------------
  // Delete mutation
  // -------------------------------------------------------------------------

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error: deleteError } = await supabase
        .from('proposals')
        .delete()
        .eq('id', id);
      if (deleteError) throw deleteError;
    },
    onSuccess: (_data, id) => {
      queryClient.invalidateQueries({ queryKey: ['proposals'] });
      toast.success('Proposal deleted');
      recordDismissSignal(id);
      setDeleteTarget(null);
    },
    onError: (err: Error) => {
      toast.error(`Failed to delete proposal: ${err.message}`);
    },
  });

  // -------------------------------------------------------------------------
  // Regenerate mutation (placeholder — calls pipeline again)
  // -------------------------------------------------------------------------

  const regenerateMutation = useMutation({
    mutationFn: async (id: string) => {
      // Mark as pending so UI shows "Generating"
      const { error: updateError } = await supabase
        .from('proposals')
        .update({ generation_status: 'pending' })
        .eq('id', id);
      if (updateError) throw updateError;
      // TODO: Trigger the actual generation pipeline edge function here
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['proposals'] });
      toast.success('Regeneration started');
    },
    onError: (err: Error) => {
      toast.error(`Failed to regenerate: ${err.message}`);
    },
  });

  // -------------------------------------------------------------------------
  // Filtering & sorting
  // -------------------------------------------------------------------------

  const filteredAndSorted = useMemo(() => {
    let result = proposals.filter((row) => {
      if (!matchesStatusFilter(row, statusFilter)) return false;
      if (triggerFilter !== 'all' && row.trigger_type !== triggerFilter) return false;
      return true;
    });

    result = [...result].sort((a, b) => {
      const aVal = getSortValue(a, sortField);
      const bVal = getSortValue(b, sortField);

      if (typeof aVal === 'number' && typeof bVal === 'number') {
        return sortDirection === 'asc' ? aVal - bVal : bVal - aVal;
      }

      const aStr = String(aVal);
      const bStr = String(bVal);
      return sortDirection === 'asc'
        ? aStr.localeCompare(bStr)
        : bStr.localeCompare(aStr);
    });

    return result;
  }, [proposals, statusFilter, triggerFilter, sortField, sortDirection]);

  // -------------------------------------------------------------------------
  // Sort toggle handler
  // -------------------------------------------------------------------------

  function handleSort(field: SortField) {
    if (sortField === field) {
      setSortDirection((prev) => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortField(field);
      setSortDirection('asc');
    }
  }

  function SortIcon({ field }: { field: SortField }) {
    if (sortField !== field) return <ArrowUpDown className="ml-1 h-3.5 w-3.5 opacity-40" />;
    return sortDirection === 'asc' ? (
      <ArrowUp className="ml-1 h-3.5 w-3.5" />
    ) : (
      <ArrowDown className="ml-1 h-3.5 w-3.5" />
    );
  }

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------

  return (
    <div className="theme-bg-primary theme-text-primary min-h-screen p-4 sm:p-6 lg:p-8">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <FileText className="h-7 w-7 text-blue-500" />
              <h1 className="theme-text-primary text-3xl font-bold">Proposals</h1>
            </div>
            <p className="theme-text-tertiary text-sm">
              AI-generated proposals from meetings and deals
            </p>
          </div>
          <Button
            size="sm"
            className="bg-blue-600 hover:bg-blue-700 text-white"
            onClick={() => toast.info('Manual proposal creation coming soon')}
          >
            <Plus className="h-4 w-4 mr-1.5" />
            New Proposal
          </Button>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap items-center gap-3">
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[160px] h-9 text-sm">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              {STATUS_OPTIONS.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={triggerFilter} onValueChange={setTriggerFilter}>
            <SelectTrigger className="w-[160px] h-9 text-sm">
              <SelectValue placeholder="Trigger" />
            </SelectTrigger>
            <SelectContent>
              {TRIGGER_OPTIONS.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={dateRange} onValueChange={setDateRange}>
            <SelectTrigger className="w-[160px] h-9 text-sm">
              <SelectValue placeholder="Date range" />
            </SelectTrigger>
            <SelectContent>
              {DATE_RANGE_OPTIONS.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {(statusFilter !== 'all' || triggerFilter !== 'all' || dateRange !== 'all') && (
            <Button
              variant="ghost"
              size="sm"
              className="text-xs theme-text-tertiary"
              onClick={() => {
                setStatusFilter('all');
                setTriggerFilter('all');
                setDateRange('all');
              }}
            >
              Clear filters
            </Button>
          )}
        </div>

        {/* Loading */}
        {isLoading && (
          <div className="flex items-center justify-center py-20">
            <RefreshCw className="h-5 w-5 animate-spin theme-text-tertiary" />
            <span className="ml-2 text-sm theme-text-tertiary">Loading proposals...</span>
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="rounded-md border border-red-200 dark:border-red-500/20 bg-red-50 dark:bg-red-500/10 p-4">
            <p className="text-sm text-red-700 dark:text-red-400">
              Failed to load proposals: {(error as Error).message}
            </p>
          </div>
        )}

        {/* Empty state */}
        {!isLoading && !error && filteredAndSorted.length === 0 && (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div className="rounded-full bg-slate-100 dark:bg-gray-800 p-4 mb-4">
              <FileText className="h-8 w-8 theme-text-tertiary" />
            </div>
            <h3 className="text-lg font-semibold theme-text-primary mb-1">No proposals yet</h3>
            <p className="text-sm theme-text-tertiary mb-4 max-w-md">
              Generate your first proposal from a meeting or deal. Proposals are created
              automatically after meetings or on demand via Copilot.
            </p>
            <Button
              className="bg-blue-600 hover:bg-blue-700 text-white"
              onClick={() => toast.info('Manual proposal creation coming soon')}
            >
              <Plus className="h-4 w-4 mr-1.5" />
              Create Proposal
            </Button>
          </div>
        )}

        {/* Table */}
        {!isLoading && !error && filteredAndSorted.length > 0 && (
          <div className="rounded-lg border border-[#E2E8F0] dark:border-gray-800 overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <SortableHead field="title" label="Title" onSort={handleSort}>
                    <SortIcon field="title" />
                  </SortableHead>
                  <SortableHead field="client" label="Client" onSort={handleSort}>
                    <SortIcon field="client" />
                  </SortableHead>
                  <SortableHead field="deal" label="Deal" onSort={handleSort}>
                    <SortIcon field="deal" />
                  </SortableHead>
                  <SortableHead field="created_at" label="Created" onSort={handleSort}>
                    <SortIcon field="created_at" />
                  </SortableHead>
                  <SortableHead field="status" label="Status" onSort={handleSort}>
                    <SortIcon field="status" />
                  </SortableHead>
                  <SortableHead field="trigger_type" label="Trigger" onSort={handleSort}>
                    <SortIcon field="trigger_type" />
                  </SortableHead>
                  <SortableHead field="credits_used" label="Credits" onSort={handleSort}>
                    <SortIcon field="credits_used" />
                  </SortableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredAndSorted.map((row) => {
                  const displayStatus = getDisplayStatus(row);
                  const trigger = getTriggerDisplay(row.trigger_type);
                  return (
                    <TableRow key={row.id}>
                      {/* Title */}
                      <TableCell className="font-medium max-w-[220px] truncate">
                        {row.title || 'Untitled Proposal'}
                      </TableCell>

                      {/* Client */}
                      <TableCell className="text-sm theme-text-tertiary max-w-[160px] truncate">
                        {row.contacts?.name || '--'}
                      </TableCell>

                      {/* Deal */}
                      <TableCell className="text-sm theme-text-tertiary max-w-[160px] truncate">
                        {row.deals?.name || '--'}
                      </TableCell>

                      {/* Created */}
                      <TableCell className="text-sm theme-text-tertiary whitespace-nowrap">
                        {row.created_at
                          ? formatDistanceToNow(new Date(row.created_at), { addSuffix: true })
                          : '--'}
                      </TableCell>

                      {/* Status */}
                      <TableCell>
                        <Badge variant={displayStatus.variant}>{displayStatus.label}</Badge>
                      </TableCell>

                      {/* Trigger */}
                      <TableCell>
                        <span className="inline-flex items-center gap-1.5 text-sm theme-text-tertiary">
                          {trigger.icon}
                          {trigger.label}
                        </span>
                      </TableCell>

                      {/* Credits */}
                      <TableCell className="text-sm tabular-nums">
                        {row.credits_used != null ? row.credits_used.toFixed(2) : '--'}
                      </TableCell>

                      {/* Actions */}
                      <TableCell className="text-right">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem
                              disabled={!row.pdf_url}
                              onClick={() => {
                                if (row.pdf_url) {
                                  window.open(row.pdf_url, '_blank');
                                }
                              }}
                            >
                              <Download className="h-4 w-4 mr-2" />
                              Download PDF
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onClick={() =>
                                toast.info('Proposal editor coming soon')
                              }
                            >
                              <Pencil className="h-4 w-4 mr-2" />
                              Edit
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onClick={() => regenerateMutation.mutate(row.id)}
                            >
                              <RefreshCw className="h-4 w-4 mr-2" />
                              Regenerate
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onClick={() =>
                                toast.info('Send to client coming soon')
                              }
                            >
                              <Send className="h-4 w-4 mr-2" />
                              Send to Client
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              className="text-red-600 dark:text-red-400"
                              onClick={() => setDeleteTarget(row)}
                            >
                              <Trash2 className="h-4 w-4 mr-2" />
                              Delete
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}

        {/* Result count */}
        {!isLoading && !error && proposals.length > 0 && (
          <p className="text-xs theme-text-tertiary">
            Showing {filteredAndSorted.length} of {proposals.length} proposal
            {proposals.length !== 1 ? 's' : ''}
          </p>
        )}
      </div>

      {/* Delete confirmation dialog */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Proposal</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete &ldquo;{deleteTarget?.title || 'Untitled Proposal'}
              &rdquo;? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 hover:bg-red-700 text-white"
              onClick={() => {
                if (deleteTarget) {
                  deleteMutation.mutate(deleteTarget.id);
                }
              }}
            >
              {deleteMutation.isPending ? 'Deleting...' : 'Delete'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function SortableHead({
  field,
  label,
  onSort,
  children,
}: {
  field: SortField;
  label: string;
  onSort: (field: SortField) => void;
  children: React.ReactNode;
}) {
  return (
    <TableHead>
      <button
        type="button"
        className="inline-flex items-center gap-0.5 hover:text-[#1E293B] dark:hover:text-white transition-colors"
        onClick={() => onSort(field)}
      >
        {label}
        {children}
      </button>
    </TableHead>
  );
}

export default ProposalsList;
