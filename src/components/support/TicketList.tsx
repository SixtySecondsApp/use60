import { useState } from 'react';
import { Ticket, Clock, AlertCircle, CheckCircle2, XCircle, Loader2, Plus, Filter } from 'lucide-react';
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
  useSupportTickets,
  type SupportTicket,
  type TicketStatus,
  type TicketStatusFilter,
  type TicketCategory,
} from '@/lib/hooks/useSupportTickets';
import { TicketDetail } from './TicketDetail';
import { formatDistanceToNow } from 'date-fns';

interface TicketListProps {
  onCreateTicket: () => void;
}

const STATUS_CONFIG: Record<TicketStatus, { label: string; color: string; icon: React.ElementType }> = {
  open: { label: 'Open', color: 'bg-blue-50 text-blue-700 dark:bg-blue-500/10 dark:text-blue-400 border-blue-200 dark:border-blue-500/30', icon: Clock },
  in_progress: { label: 'In Progress', color: 'bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-400 border-amber-200 dark:border-amber-500/30', icon: Loader2 },
  waiting_on_customer: { label: 'Waiting on You', color: 'bg-purple-50 text-purple-700 dark:bg-purple-500/10 dark:text-purple-400 border-purple-200 dark:border-purple-500/30', icon: AlertCircle },
  resolved: { label: 'Resolved', color: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400 border-emerald-200 dark:border-emerald-500/30', icon: CheckCircle2 },
  closed: { label: 'Closed', color: 'bg-gray-50 text-gray-600 dark:bg-gray-800 dark:text-gray-400 border-gray-200 dark:border-gray-700', icon: XCircle },
};

const PRIORITY_CONFIG = {
  low: { label: 'Low', color: 'text-gray-500' },
  medium: { label: 'Medium', color: 'text-blue-500' },
  high: { label: 'High', color: 'text-orange-500' },
  urgent: { label: 'Urgent', color: 'text-red-500' },
};

const CATEGORY_LABELS: Record<TicketCategory, string> = {
  bug: 'Bug',
  feature_request: 'Feature Request',
  billing: 'Billing',
  how_to: 'How To',
  other: 'Other',
};

function TicketRow({ ticket, onClick }: { ticket: SupportTicket; onClick: () => void }) {
  const statusConfig = STATUS_CONFIG[ticket.status];
  const StatusIcon = statusConfig.icon;
  const priorityConfig = PRIORITY_CONFIG[ticket.priority];

  return (
    <button
      onClick={onClick}
      className="w-full text-left px-4 py-3 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors border-b border-gray-100 dark:border-gray-800 last:border-0"
    >
      <div className="flex items-start gap-3">
        <div className="pt-0.5">
          <Ticket className="w-4 h-4 text-gray-400" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <p className="text-sm font-medium text-gray-900 dark:text-white truncate">{ticket.subject}</p>
            <Badge
              variant="outline"
              className={`text-[11px] shrink-0 flex items-center gap-1 ${statusConfig.color}`}
            >
              <StatusIcon className="w-3 h-3" />
              {statusConfig.label}
            </Badge>
          </div>
          <div className="flex items-center gap-2 mt-1">
            <span className="text-xs text-gray-500 dark:text-gray-400">{CATEGORY_LABELS[ticket.category]}</span>
            <span className="text-gray-300 dark:text-gray-600">·</span>
            <span className={`text-xs font-medium ${priorityConfig.color}`}>{priorityConfig.label}</span>
            <span className="text-gray-300 dark:text-gray-600">·</span>
            <span className="text-xs text-gray-400 dark:text-gray-500">
              {formatDistanceToNow(new Date(ticket.created_at), { addSuffix: true })}
            </span>
          </div>
        </div>
      </div>
    </button>
  );
}

export function TicketList({ onCreateTicket }: TicketListProps) {
  const [statusFilter, setStatusFilter] = useState<TicketStatusFilter>('all');
  const [categoryFilter, setCategoryFilter] = useState<TicketCategory | undefined>(undefined);
  const [selectedTicket, setSelectedTicket] = useState<SupportTicket | null>(null);

  const { data: tickets, isLoading, error } = useSupportTickets(statusFilter, categoryFilter);

  return (
    <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-2xl overflow-hidden shadow-sm">
      {/* Filters bar */}
      <div className="flex items-center gap-2 px-4 py-3 border-b border-gray-100 dark:border-gray-800">
        <Filter className="w-4 h-4 text-gray-400 shrink-0" />
        <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as TicketStatusFilter)}>
          <SelectTrigger className="w-36 h-8 text-xs">
            <SelectValue placeholder="Status" />
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
            <SelectValue placeholder="Category" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All categories</SelectItem>
            {Object.entries(CATEGORY_LABELS).map(([value, label]) => (
              <SelectItem key={value} value={value}>
                {label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <div className="flex-1" />

        <span className="text-xs text-gray-400">
          {tickets?.length ?? 0} ticket{tickets?.length !== 1 ? 's' : ''}
        </span>
      </div>

      {/* Ticket rows */}
      <div>
        {isLoading && (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="w-5 h-5 animate-spin text-gray-400" />
          </div>
        )}

        {error && (
          <div className="flex flex-col items-center justify-center py-16 gap-2 text-center px-6">
            <AlertCircle className="w-8 h-8 text-red-400" />
            <p className="text-sm text-gray-600 dark:text-gray-400">Failed to load tickets</p>
          </div>
        )}

        {!isLoading && !error && tickets?.length === 0 && (
          <div className="flex flex-col items-center justify-center py-16 gap-4 text-center px-6">
            <div className="p-4 rounded-2xl bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700">
              <Ticket className="w-8 h-8 text-gray-400" />
            </div>
            <div>
              <p className="text-sm font-medium text-gray-900 dark:text-white">No tickets yet</p>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                {statusFilter !== 'all' || categoryFilter
                  ? 'No tickets match the current filters'
                  : "You haven't opened any support tickets yet"}
              </p>
            </div>
            <Button
              onClick={onCreateTicket}
              size="sm"
              className="bg-blue-600 hover:bg-blue-700 text-white"
            >
              <Plus className="w-4 h-4 mr-1.5" />
              Open a Ticket
            </Button>
          </div>
        )}

        {!isLoading && tickets && tickets.length > 0 &&
          tickets.map((ticket) => (
            <TicketRow
              key={ticket.id}
              ticket={ticket}
              onClick={() => setSelectedTicket(ticket)}
            />
          ))
        }
      </div>

      {/* Ticket Detail Sheet */}
      {selectedTicket && (
        <TicketDetail
          ticket={selectedTicket}
          open={!!selectedTicket}
          onClose={() => setSelectedTicket(null)}
        />
      )}
    </div>
  );
}
