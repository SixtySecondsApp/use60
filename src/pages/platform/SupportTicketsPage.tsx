import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  LifeBuoy,
  Loader2,
  AlertCircle,
  Filter,
  CheckSquare,
  UserCheck,
} from 'lucide-react';
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
  type TicketPriority,
  useUpdateTicketStatus,
} from '@/lib/hooks/useSupportTickets';
import { TicketDetail } from '@/components/support/TicketDetail';
import { formatDistanceToNow } from 'date-fns';
import { cn } from '@/lib/utils';

// ============================================================
// Types
// ============================================================

interface OrgMap {
  [orgId: string]: string;
}

interface AgentMap {
  [userId: string]: string;
}

type TicketPriorityFilter = 'all' | TicketPriority;

// ============================================================
// Config
// ============================================================

const STATUS_CONFIG: Record<TicketStatus, { label: string; color: string }> = {
  open: { label: 'Open', color: 'bg-blue-50 text-blue-700 dark:bg-blue-500/10 dark:text-blue-400 border-blue-200 dark:border-blue-500/30' },
  in_progress: { label: 'In Progress', color: 'bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-400' },
  waiting_on_customer: { label: 'Waiting', color: 'bg-purple-50 text-purple-700 dark:bg-purple-500/10 dark:text-purple-400' },
  resolved: { label: 'Resolved', color: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400' },
  closed: { label: 'Closed', color: 'bg-gray-50 text-gray-600 dark:bg-gray-800 dark:text-gray-400' },
};

const PRIORITY_COLOR: Record<TicketPriority, string> = {
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

// ============================================================
// Data hooks
// ============================================================

function useAdminAllTickets(
  statusFilter: TicketStatusFilter,
  categoryFilter?: TicketCategory,
  priorityFilter?: TicketPriority
) {
  return useQuery({
    queryKey: ['platform-admin-tickets', statusFilter, categoryFilter, priorityFilter],
    queryFn: async () => {
      let query = supabase
        .from('support_tickets')
        .select('id, org_id, user_id, subject, description, category, priority, status, assigned_to, needs_attention, created_at, updated_at, resolved_at')
        .order('created_at', { ascending: false });

      if (statusFilter === 'open') {
        query = query.in('status', ['open', 'in_progress', 'waiting_on_customer']);
      } else if (statusFilter === 'resolved') {
        query = query.in('status', ['resolved', 'closed']);
      }

      if (categoryFilter) {
        query = query.eq('category', categoryFilter);
      }

      if (priorityFilter) {
        query = query.eq('priority', priorityFilter);
      }

      const { data, error } = await query;
      if (error) throw error;
      return (data ?? []) as SupportTicket[];
    },
  });
}

function useOrgNames(orgIds: string[]): OrgMap {
  const { data } = useQuery({
    queryKey: ['org-names', orgIds.sort().join(',')],
    queryFn: async () => {
      if (orgIds.length === 0) return {};
      const { data, error } = await supabase
        .from('organizations')
        .select('id, name')
        .in('id', orgIds);
      if (error) throw error;
      const map: OrgMap = {};
      for (const org of data ?? []) {
        map[org.id] = org.name;
      }
      return map;
    },
    enabled: orgIds.length > 0,
  });
  return data ?? {};
}

function useAgentNames(userIds: string[]): AgentMap {
  const { data } = useQuery({
    queryKey: ['agent-names', userIds.sort().join(',')],
    queryFn: async () => {
      if (userIds.length === 0) return {};
      const { data, error } = await supabase
        .from('profiles')
        .select('id, display_name, full_name, email')
        .in('id', userIds);
      if (error) throw error;
      const map: AgentMap = {};
      for (const profile of data ?? []) {
        map[profile.id] = profile.display_name || profile.full_name || profile.email || 'Agent';
      }
      return map;
    },
    enabled: userIds.length > 0,
  });
  return data ?? {};
}

// ============================================================
// Row component
// ============================================================

function TicketRow({
  ticket,
  selected,
  onSelect,
  onOpen,
  orgNames,
  agentNames,
}: {
  ticket: SupportTicket;
  selected: boolean;
  onSelect: (checked: boolean) => void;
  onOpen: () => void;
  orgNames: OrgMap;
  agentNames: AgentMap;
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
        <span className="text-xs text-gray-600 dark:text-gray-300 truncate max-w-[160px] block">
          {orgNames[ticket.org_id] ?? ticket.org_id.slice(0, 8)}
        </span>
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
            <UserCheck className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
            <span className="text-xs text-gray-500 truncate max-w-[100px]">
              {agentNames[ticket.assigned_to] ?? 'Agent'}
            </span>
          </div>
        ) : (
          <span className="text-xs text-gray-400">Unassigned</span>
        )}
      </td>
    </tr>
  );
}

// ============================================================
// Page
// ============================================================

export default function SupportTicketsPage() {
  const [searchParams, setSearchParams] = useSearchParams();

  const [statusFilter, setStatusFilter] = useState<TicketStatusFilter>('open');
  const [categoryFilter, setCategoryFilter] = useState<TicketCategory | undefined>(undefined);
  const [priorityFilter, setPriorityFilter] = useState<TicketPriority | undefined>(undefined);
  const [orgFilter, setOrgFilter] = useState<string | undefined>(undefined);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [openTicket, setOpenTicket] = useState<SupportTicket | null>(null);

  const { data: tickets, isLoading, error } = useAdminAllTickets(statusFilter, categoryFilter, priorityFilter);
  const { mutateAsync: updateStatus } = useUpdateTicketStatus();

  // Derive unique org IDs and assigned_to IDs from all tickets
  const allOrgIds = [...new Set((tickets ?? []).map((t) => t.org_id))];
  const allAssignedIds = [...new Set((tickets ?? []).map((t) => t.assigned_to).filter((id): id is string => !!id))];

  const orgNames = useOrgNames(allOrgIds);
  const agentNames = useAgentNames(allAssignedIds);

  // Handle ?ticket= URL param to auto-open a ticket
  useEffect(() => {
    const ticketId = searchParams.get('ticket');
    if (ticketId && tickets) {
      const found = tickets.find((t) => t.id === ticketId);
      if (found) setOpenTicket(found);
    }
  }, [searchParams, tickets]);

  // Apply org filter client-side (to avoid extra DB round-trip)
  const filteredTickets = (tickets ?? []).filter((t) => {
    if (orgFilter && t.org_id !== orgFilter) return false;
    return true;
  });

  // Summary stats (from all unfiltered tickets)
  const allTickets = tickets ?? [];
  const needsAttentionCount = allTickets.filter((t) => (t as SupportTicket & { needs_attention?: boolean }).needs_attention).length;
  const urgentCount = allTickets.filter((t) => t.priority === 'urgent').length;
  const openCount = allTickets.filter((t) => ['open', 'in_progress', 'waiting_on_customer'].includes(t.status)).length;

  // Unique orgs for the org filter dropdown
  const uniqueOrgs = allOrgIds.map((id) => ({ id, name: orgNames[id] ?? id.slice(0, 8) }));

  const toggleSelect = (id: string, checked: boolean) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      checked ? next.add(id) : next.delete(id);
      return next;
    });
  };

  const selectAll = () => {
    if (selectedIds.size === filteredTickets.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredTickets.map((t) => t.id)));
    }
  };

  const handleBulkStatusChange = async (status: TicketStatus) => {
    const ids = Array.from(selectedIds);
    await Promise.all(ids.map((id) => updateStatus({ ticketId: id, status })));
    setSelectedIds(new Set());
    toast.success(`${ids.length} ticket${ids.length === 1 ? '' : 's'} updated`);
  };

  const handleOpenTicket = (ticket: SupportTicket) => {
    setOpenTicket(ticket);
    setSearchParams({ ticket: ticket.id });
  };

  const handleCloseTicket = () => {
    setOpenTicket(null);
    setSearchParams({});
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
      {/* Page header */}
      <div>
        <div className="flex items-center gap-3 mb-1">
          <div className="p-2 rounded-xl bg-blue-50 dark:bg-blue-500/10 border border-blue-100 dark:border-blue-500/20">
            <LifeBuoy className="w-5 h-5 text-blue-600 dark:text-blue-400" />
          </div>
          <h1 className="text-xl font-semibold text-gray-900 dark:text-white">Support Tickets</h1>
        </div>
        <p className="text-sm text-gray-500 dark:text-gray-400 ml-12">
          Manage customer support tickets across all organizations
        </p>
      </div>

      {/* Summary stats */}
      <div className="grid grid-cols-4 gap-3">
        <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-4">
          <p className="text-xs text-gray-500 dark:text-gray-400">Total Tickets</p>
          <p className="text-2xl font-semibold text-gray-900 dark:text-white mt-1">
            {isLoading ? <span className="inline-block w-10 h-7 bg-gray-200 dark:bg-gray-700 animate-pulse rounded" /> : allTickets.length}
          </p>
        </div>
        <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-4">
          <p className="text-xs text-gray-500 dark:text-gray-400">Needs Attention</p>
          <p className={cn('text-2xl font-semibold mt-1', needsAttentionCount > 0 ? 'text-red-500' : 'text-gray-900 dark:text-white')}>
            {isLoading ? <span className="inline-block w-10 h-7 bg-gray-200 dark:bg-gray-700 animate-pulse rounded" /> : needsAttentionCount}
          </p>
        </div>
        <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-4">
          <p className="text-xs text-gray-500 dark:text-gray-400">Urgent</p>
          <p className={cn('text-2xl font-semibold mt-1', urgentCount > 0 ? 'text-red-500' : 'text-gray-900 dark:text-white')}>
            {isLoading ? <span className="inline-block w-10 h-7 bg-gray-200 dark:bg-gray-700 animate-pulse rounded" /> : urgentCount}
          </p>
        </div>
        <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-4">
          <p className="text-xs text-gray-500 dark:text-gray-400">Open</p>
          <p className="text-2xl font-semibold text-blue-600 mt-1">
            {isLoading ? <span className="inline-block w-10 h-7 bg-gray-200 dark:bg-gray-700 animate-pulse rounded" /> : openCount}
          </p>
        </div>
      </div>

      {/* Table card */}
      <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-2xl overflow-hidden shadow-sm">
        {/* Toolbar */}
        <div className="flex items-center gap-2 px-4 py-3 border-b border-gray-100 dark:border-gray-800 flex-wrap">
          <LifeBuoy className="w-4 h-4 text-blue-500 shrink-0" />
          <span className="text-sm font-medium text-gray-900 dark:text-white">All Tickets</span>
          <div className="flex-1" />

          {selectedIds.size > 0 && (
            <div className="flex items-center gap-2">
              <span className="text-xs text-gray-500">{selectedIds.size} selected</span>
              <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => handleBulkStatusChange('in_progress')}>
                Mark In Progress
              </Button>
              <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => handleBulkStatusChange('resolved')}>
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

          {/* Status filter */}
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

          {/* Category filter */}
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

          {/* Priority filter */}
          <Select
            value={priorityFilter ?? 'all'}
            onValueChange={(v) => setPriorityFilter(v === 'all' ? undefined : (v as TicketPriority))}
          >
            <SelectTrigger className="w-32 h-8 text-xs">
              <SelectValue placeholder="All priority" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All priority</SelectItem>
              <SelectItem value="low">Low</SelectItem>
              <SelectItem value="medium">Medium</SelectItem>
              <SelectItem value="high">High</SelectItem>
              <SelectItem value="urgent">Urgent</SelectItem>
            </SelectContent>
          </Select>

          {/* Org filter */}
          <Select
            value={orgFilter ?? 'all'}
            onValueChange={(v) => setOrgFilter(v === 'all' ? undefined : v)}
          >
            <SelectTrigger className="w-40 h-8 text-xs">
              <SelectValue placeholder="All orgs" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All orgs</SelectItem>
              {uniqueOrgs.map((org) => (
                <SelectItem key={org.id} value={org.id}>{org.name}</SelectItem>
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
                    checked={selectedIds.size === filteredTickets.length && filteredTickets.length > 0}
                    onChange={selectAll}
                    className="rounded border-gray-300 text-blue-600"
                  />
                </th>
                <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">Subject</th>
                <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">Organization</th>
                <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">Status</th>
                <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">Priority</th>
                <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">Created</th>
                <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">Assigned To</th>
              </tr>
            </thead>
            <tbody>
              {isLoading && (
                <tr>
                  <td colSpan={7} className="py-12 text-center">
                    <Loader2 className="w-5 h-5 animate-spin text-gray-400 mx-auto" />
                  </td>
                </tr>
              )}
              {error && (
                <tr>
                  <td colSpan={7} className="py-12 text-center">
                    <AlertCircle className="w-6 h-6 text-red-400 mx-auto mb-2" />
                    <p className="text-sm text-gray-500">Failed to load tickets</p>
                  </td>
                </tr>
              )}
              {!isLoading && filteredTickets.length === 0 && (
                <tr>
                  <td colSpan={7} className="py-12 text-center">
                    <CheckSquare className="w-6 h-6 text-emerald-400 mx-auto mb-2" />
                    <p className="text-sm text-gray-500">No tickets found</p>
                  </td>
                </tr>
              )}
              {filteredTickets.map((ticket) => (
                <TicketRow
                  key={ticket.id}
                  ticket={ticket}
                  selected={selectedIds.has(ticket.id)}
                  onSelect={(checked) => toggleSelect(ticket.id, checked)}
                  onOpen={() => handleOpenTicket(ticket)}
                  orgNames={orgNames}
                  agentNames={agentNames}
                />
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {openTicket && (
        <TicketDetail ticket={openTicket} open={!!openTicket} onClose={handleCloseTicket} />
      )}
    </div>
  );
}
