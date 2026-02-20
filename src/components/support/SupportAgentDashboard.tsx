import { useState } from 'react';
import { Shield, Loader2, AlertCircle, Users, Filter, CheckSquare, UserCheck } from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase/clientV2';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  type SupportTicket,
  type TicketStatus,
  type TicketCategory,
  type TicketStatusFilter,
  useUpdateTicketStatus,
} from '@/lib/hooks/useSupportTickets';
import { TicketDetail } from './TicketDetail';
import { formatDistanceToNow } from 'date-fns';
import { cn } from '@/lib/utils';

const STATUS_CONFIG: Record<TicketStatus, { label: string; color: string }> = {
  open: { label: 'Open', color: 'bg-blue-50 text-blue-700 dark:bg-blue-500/10 dark:text-blue-400 border-blue-200 dark:border-blue-500/30' },
  in_progress: { label: 'In Progress', color: 'bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-400' },
  waiting_on_customer: { label: 'Waiting', color: 'bg-purple-50 text-purple-700 dark:bg-purple-500/10 dark:text-purple-400' },
  resolved: { label: 'Resolved', color: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400' },
  closed: { label: 'Closed', color: 'bg-gray-50 text-gray-600 dark:bg-gray-800 dark:text-gray-400' },
};

const PRIORITY_COLOR = {
  low: 'text-gray-500',
  medium: 'text-blue-500',
  high: 'text-orange-500',
  urgent: 'text-red-500',
};

const CATEGORY_LABEL: Record<string, string> = {
  bug: 'Bug',
  feature_request: 'Feature Request',
  billing: 'Billing',
  how_to: 'How To',
  other: 'Other',
};

// Fetch ALL org tickets (admin view)
function useAllOrgTickets(statusFilter: TicketStatusFilter, categoryFilter?: TicketCategory) {
  return useQuery({
    queryKey: ['admin-support-tickets', statusFilter, categoryFilter],
    queryFn: async () => {
      let query = supabase
        .from('support_tickets')
        .select('id, org_id, user_id, subject, description, category, priority, status, assigned_to, created_at, updated_at, resolved_at')
        .order('created_at', { ascending: false });

      if (statusFilter === 'open') {
        query = query.in('status', ['open', 'in_progress', 'waiting_on_customer']);
      } else if (statusFilter === 'resolved') {
        query = query.in('status', ['resolved', 'closed']);
      }

      if (categoryFilter) {
        query = query.eq('category', categoryFilter);
      }

      const { data, error } = await query;
      if (error) throw error;
      return (data ?? []) as SupportTicket[];
    },
  });
}

function useAssignTicket() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ ticketId, userId }: { ticketId: string; userId: string }) => {
      const { error } = await supabase
        .from('support_tickets')
        .update({ assigned_to: userId, status: 'in_progress' })
        .eq('id', ticketId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-support-tickets'] });
      toast.success('Ticket assigned');
    },
    onError: (error: Error) => {
      toast.error('Failed to assign ticket', { description: error.message });
    },
  });
}

function AgentTicketRow({
  ticket,
  selected,
  onSelect,
  onOpen,
}: {
  ticket: SupportTicket;
  selected: boolean;
  onSelect: (checked: boolean) => void;
  onOpen: () => void;
}) {
  const statusConfig = STATUS_CONFIG[ticket.status];

  return (
    <tr
      className={cn(
        'hover:bg-gray-50 dark:hover:bg-gray-800/50 cursor-pointer transition-colors',
        selected && 'bg-blue-50/50 dark:bg-blue-500/5'
      )}
      onClick={onOpen}
    >
      <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
        <input
          type="checkbox"
          checked={selected}
          onChange={(e) => onSelect(e.target.checked)}
          className="rounded border-gray-300 text-blue-600"
        />
      </td>
      <td className="px-4 py-3">
        <div>
          <p className="text-sm font-medium text-gray-900 dark:text-white truncate max-w-[240px]">
            {ticket.subject}
          </p>
          <p className="text-xs text-gray-400 mt-0.5">{CATEGORY_LABEL[ticket.category]}</p>
        </div>
      </td>
      <td className="px-4 py-3">
        <Badge variant="outline" className={cn('text-[11px]', statusConfig.color)}>
          {statusConfig.label}
        </Badge>
      </td>
      <td className="px-4 py-3">
        <span className={cn('text-xs font-medium', PRIORITY_COLOR[ticket.priority])}>
          {ticket.priority.charAt(0).toUpperCase() + ticket.priority.slice(1)}
        </span>
      </td>
      <td className="px-4 py-3">
        <span className="text-xs text-gray-500 dark:text-gray-400">
          {formatDistanceToNow(new Date(ticket.created_at), { addSuffix: true })}
        </span>
      </td>
      <td className="px-4 py-3">
        {ticket.assigned_to ? (
          <div className="flex items-center gap-1.5">
            <UserCheck className="w-3.5 h-3.5 text-emerald-500" />
            <span className="text-xs text-gray-500">Assigned</span>
          </div>
        ) : (
          <span className="text-xs text-gray-400">Unassigned</span>
        )}
      </td>
    </tr>
  );
}

export function SupportAgentDashboard() {
  const [statusFilter, setStatusFilter] = useState<TicketStatusFilter>('open');
  const [categoryFilter, setCategoryFilter] = useState<TicketCategory | undefined>(undefined);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [openTicket, setOpenTicket] = useState<SupportTicket | null>(null);

  const { data: tickets, isLoading, error } = useAllOrgTickets(statusFilter, categoryFilter);
  const { mutateAsync: updateStatus } = useUpdateTicketStatus();

  const toggleSelect = (id: string, checked: boolean) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      checked ? next.add(id) : next.delete(id);
      return next;
    });
  };

  const selectAll = () => {
    if (selectedIds.size === tickets?.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(tickets?.map((t) => t.id) ?? []));
    }
  };

  const handleBulkStatusChange = async (status: TicketStatus) => {
    const ids = Array.from(selectedIds);
    await Promise.all(ids.map((id) => updateStatus({ ticketId: id, status })));
    setSelectedIds(new Set());
  };

  const openCount = tickets?.filter((t) => ['open', 'in_progress', 'waiting_on_customer'].includes(t.status)).length ?? 0;
  const urgentCount = tickets?.filter((t) => t.priority === 'urgent').length ?? 0;

  return (
    <div className="space-y-4">
      {/* Summary stats */}
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-4">
          <p className="text-xs text-gray-500 dark:text-gray-400">Total Tickets</p>
          <p className="text-2xl font-semibold text-gray-900 dark:text-white mt-1">{tickets?.length ?? 0}</p>
        </div>
        <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-4">
          <p className="text-xs text-gray-500 dark:text-gray-400">Open</p>
          <p className="text-2xl font-semibold text-blue-600 mt-1">{openCount}</p>
        </div>
        <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-4">
          <p className="text-xs text-gray-500 dark:text-gray-400">Urgent</p>
          <p className={cn('text-2xl font-semibold mt-1', urgentCount > 0 ? 'text-red-500' : 'text-gray-900 dark:text-white')}>
            {urgentCount}
          </p>
        </div>
      </div>

      {/* Toolbar */}
      <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-2xl overflow-hidden shadow-sm">
        <div className="flex items-center gap-2 px-4 py-3 border-b border-gray-100 dark:border-gray-800">
          <Shield className="w-4 h-4 text-purple-500 shrink-0" />
          <span className="text-sm font-medium text-gray-900 dark:text-white">All Tickets</span>
          <div className="flex-1" />

          {selectedIds.size > 0 && (
            <div className="flex items-center gap-2">
              <span className="text-xs text-gray-500">{selectedIds.size} selected</span>
              <Button
                size="sm"
                variant="outline"
                className="h-7 text-xs"
                onClick={() => handleBulkStatusChange('in_progress')}
              >
                Mark In Progress
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="h-7 text-xs"
                onClick={() => handleBulkStatusChange('resolved')}
              >
                Mark Resolved
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="h-7 text-xs border-red-200 text-red-600 hover:bg-red-50"
                onClick={() => handleBulkStatusChange('closed')}
              >
                Close
              </Button>
            </div>
          )}

          <Filter className="w-4 h-4 text-gray-400 shrink-0" />
          <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as TicketStatusFilter)}>
            <SelectTrigger className="w-32 h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All status</SelectItem>
              <SelectItem value="open">Open</SelectItem>
              <SelectItem value="resolved">Resolved</SelectItem>
            </SelectContent>
          </Select>

          <Select
            value={categoryFilter ?? 'all'}
            onValueChange={(v) => setCategoryFilter(v === 'all' ? undefined : (v as TicketCategory))}
          >
            <SelectTrigger className="w-40 h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All categories</SelectItem>
              {Object.entries(CATEGORY_LABEL).map(([v, l]) => (
                <SelectItem key={v} value={v}>{l}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Table */}
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-100 dark:border-gray-800">
                <th className="px-4 py-2.5 text-left">
                  <input
                    type="checkbox"
                    checked={selectedIds.size === tickets?.length && tickets.length > 0}
                    onChange={selectAll}
                    className="rounded border-gray-300 text-blue-600"
                  />
                </th>
                <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">Subject</th>
                <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">Status</th>
                <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">Priority</th>
                <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">Created</th>
                <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">Assigned</th>
              </tr>
            </thead>
            <tbody>
              {isLoading && (
                <tr>
                  <td colSpan={6} className="py-12 text-center">
                    <Loader2 className="w-5 h-5 animate-spin text-gray-400 mx-auto" />
                  </td>
                </tr>
              )}
              {error && (
                <tr>
                  <td colSpan={6} className="py-12 text-center">
                    <AlertCircle className="w-6 h-6 text-red-400 mx-auto mb-2" />
                    <p className="text-sm text-gray-500">Failed to load tickets</p>
                  </td>
                </tr>
              )}
              {!isLoading && tickets?.length === 0 && (
                <tr>
                  <td colSpan={6} className="py-12 text-center">
                    <CheckSquare className="w-6 h-6 text-emerald-400 mx-auto mb-2" />
                    <p className="text-sm text-gray-500">No tickets found</p>
                  </td>
                </tr>
              )}
              {tickets?.map((ticket) => (
                <AgentTicketRow
                  key={ticket.id}
                  ticket={ticket}
                  selected={selectedIds.has(ticket.id)}
                  onSelect={(checked) => toggleSelect(ticket.id, checked)}
                  onOpen={() => setOpenTicket(ticket)}
                />
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {openTicket && (
        <TicketDetail ticket={openTicket} open={!!openTicket} onClose={() => setOpenTicket(null)} />
      )}
    </div>
  );
}
