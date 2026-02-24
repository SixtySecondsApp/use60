/**
 * RecentActivityList Component
 *
 * CM-004: Shows 7-day conversation history grouped by day.
 *
 * Features:
 * - Memory entries grouped by day
 * - Search bar with instant results
 * - Entity links (contacts, deals)
 * - "Resume Conversation" button
 *
 * @see docs/project-requirements/PRD_ACTION_CENTRE.md
 */

import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useDebounce } from '@/lib/hooks/useDebounce';
import { format, isToday, isYesterday, startOfDay, parseISO } from 'date-fns';
import {
  Search,
  MessageSquare,
  Mail,
  CheckSquare,
  Eye,
  FileText,
  Zap,
  User,
  Building2,
  DollarSign,
  ArrowRight,
  RefreshCw,
  Loader2,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { supabase } from '@/lib/supabase/clientV2';
import { useAuth } from '@/lib/contexts/AuthContext';
import { useCopilot } from '@/lib/contexts/CopilotContext';
import { useNavigate } from 'react-router-dom';

// ============================================================================
// Types
// ============================================================================

interface CopilotMemory {
  id: string;
  user_id: string;
  organization_id: string;
  conversation_id: string | null;
  memory_type: 'conversation' | 'action_sent' | 'action_created' | 'insight_viewed' | 'meeting_prep' | 'sequence_run';
  summary: string;
  context_snippet: string | null;
  entities: {
    contacts?: Array<{ id: string; name: string }>;
    deals?: Array<{ id: string; name: string }>;
    companies?: Array<{ id: string; name: string }>;
  };
  metadata: Record<string, unknown>;
  occurred_at: string;
  created_at: string;
  expires_at: string;
}

interface DayGroup {
  date: Date;
  label: string;
  items: CopilotMemory[];
}

// ============================================================================
// Helpers
// ============================================================================

const getMemoryIcon = (type: CopilotMemory['memory_type']) => {
  switch (type) {
    case 'conversation':
      return MessageSquare;
    case 'action_sent':
      return Mail;
    case 'action_created':
      return CheckSquare;
    case 'insight_viewed':
      return Eye;
    case 'meeting_prep':
      return FileText;
    case 'sequence_run':
      return Zap;
    default:
      return MessageSquare;
  }
};

const formatMemoryType = (type: CopilotMemory['memory_type']) => {
  const labels: Record<CopilotMemory['memory_type'], string> = {
    conversation: 'Conversation',
    action_sent: 'Action Sent',
    action_created: 'Action Created',
    insight_viewed: 'Insight Viewed',
    meeting_prep: 'Meeting Prep',
    sequence_run: 'Sequence Run',
  };
  return labels[type] || type;
};

const getDayLabel = (date: Date) => {
  if (isToday(date)) return 'Today';
  if (isYesterday(date)) return 'Yesterday';
  return format(date, 'EEEE, MMMM d');
};

const groupByDay = (items: CopilotMemory[]): DayGroup[] => {
  const groups: Map<string, CopilotMemory[]> = new Map();

  for (const item of items) {
    const date = startOfDay(parseISO(item.occurred_at));
    const key = date.toISOString();
    if (!groups.has(key)) {
      groups.set(key, []);
    }
    groups.get(key)!.push(item);
  }

  return Array.from(groups.entries())
    .map(([key, items]) => ({
      date: new Date(key),
      label: getDayLabel(new Date(key)),
      items: items.sort(
        (a, b) => new Date(b.occurred_at).getTime() - new Date(a.occurred_at).getTime()
      ),
    }))
    .sort((a, b) => b.date.getTime() - a.date.getTime());
};

// ============================================================================
// Component
// ============================================================================

export function RecentActivityList() {
  const { user } = useAuth();
  const { openCopilot, loadConversation } = useCopilot();
  const navigate = useNavigate();
  const userId = user?.id;

  const [searchQuery, setSearchQuery] = useState('');
  const debouncedSearch = useDebounce(searchQuery, 300);
  const [resumingId, setResumingId] = useState<string | null>(null);

  // Fetch recent memory
  const { data: memories, isLoading, refetch } = useQuery({
    queryKey: ['copilot-memory-recent', userId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('copilot_memory')
        .select('*')
        .eq('user_id', userId)
        .gt('expires_at', new Date().toISOString())
        .order('occurred_at', { ascending: false })
        .limit(100);

      if (error) throw error;
      return data as CopilotMemory[];
    },
    enabled: !!userId,
  });

  // Search memories (debounced to avoid per-keystroke RPC calls)
  const { data: searchResults, isLoading: searchLoading } = useQuery({
    queryKey: ['copilot-memory-search', userId, debouncedSearch],
    queryFn: async () => {
      if (!debouncedSearch.trim()) return null;

      const { data, error } = await supabase.rpc('search_copilot_memory', {
        p_user_id: userId,
        p_query: debouncedSearch,
        p_limit: 20,
      });

      if (error) throw error;
      return data as (CopilotMemory & { rank: number })[];
    },
    enabled: !!userId && debouncedSearch.trim().length > 0,
    staleTime: 30_000,
  });

  // Group by day
  const dayGroups = useMemo(() => {
    const items = debouncedSearch ? searchResults || [] : memories || [];
    return groupByDay(items);
  }, [memories, searchResults, debouncedSearch]);

  /**
   * SS-005: Resume conversation from Recent Activity
   *
   * If the memory has a conversation_id, load that conversation.
   * Otherwise, start a new chat with context from the memory.
   */
  const handleResumeConversation = async (memory: CopilotMemory) => {
    setResumingId(memory.id);
    try {
      if (memory.conversation_id) {
        // Load the existing conversation
        await loadConversation(memory.conversation_id);
        openCopilot();
      } else {
        // Start a new chat with context from this memory
        const contextMessage = memory.context_snippet || memory.summary;
        openCopilot(`Continue from: ${contextMessage}`, true);
      }
    } finally {
      setResumingId(null);
    }
  };

  const handleEntityClick = (type: 'contact' | 'deal' | 'company', id: string) => {
    switch (type) {
      case 'contact':
        navigate(`/crm/contacts/${id}`);
        break;
      case 'deal':
        navigate(`/crm/deals/${id}`);
        break;
      case 'company':
        navigate(`/crm/companies/${id}`);
        break;
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-4">
        {[1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-24 w-full" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Search Bar */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <Input
            placeholder="Search conversations..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10"
          />
        </div>
        <Button variant="outline" size="icon" onClick={() => refetch()}>
          <RefreshCw className="w-4 h-4" />
        </Button>
      </div>

      {/* Search loading state */}
      {(searchLoading || (searchQuery && searchQuery !== debouncedSearch)) && searchQuery && (
        <div className="space-y-3">
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-20 w-full" />
        </div>
      )}

      {/* Results */}
      {dayGroups.length > 0 ? (
        <div className="space-y-6">
          {dayGroups.map((group) => (
            <div key={group.date.toISOString()}>
              {/* Day Header */}
              <h3 className="text-sm font-semibold text-gray-500 dark:text-gray-400 mb-3">
                {group.label}
              </h3>

              {/* Memory Items */}
              <div className="space-y-3">
                {group.items.map((memory) => (
                  <MemoryItem
                    key={memory.id}
                    memory={memory}
                    onResume={handleResumeConversation}
                    onEntityClick={handleEntityClick}
                    isResuming={resumingId === memory.id}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-12 text-center">
            <MessageSquare className="w-12 h-12 text-gray-400 mb-4" />
            <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
              {searchQuery ? 'No results found' : 'No recent activity'}
            </h3>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1 max-w-sm">
              {searchQuery
                ? 'Try a different search term'
                : 'Your AI conversation history will appear here'}
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// ============================================================================
// Memory Item Component
// ============================================================================

function MemoryItem({
  memory,
  onResume,
  onEntityClick,
  isResuming,
}: {
  memory: CopilotMemory;
  onResume: (memory: CopilotMemory) => void;
  onEntityClick: (type: 'contact' | 'deal' | 'company', id: string) => void;
  isResuming?: boolean;
}) {
  const Icon = getMemoryIcon(memory.memory_type);
  const time = format(parseISO(memory.occurred_at), 'h:mm a');

  const hasEntities =
    (memory.entities.contacts?.length ?? 0) > 0 ||
    (memory.entities.deals?.length ?? 0) > 0 ||
    (memory.entities.companies?.length ?? 0) > 0;

  return (
    <Card className="hover:shadow-sm transition-shadow">
      <CardContent className="p-4">
        <div className="flex items-start gap-3">
          {/* Icon */}
          <div className="w-8 h-8 rounded-lg bg-gray-100 dark:bg-gray-800 flex items-center justify-center flex-shrink-0">
            <Icon className="w-4 h-4 text-gray-600 dark:text-gray-400" />
          </div>

          {/* Content */}
          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-center gap-2">
                <Badge variant="outline" className="text-xs">
                  {formatMemoryType(memory.memory_type)}
                </Badge>
                <span className="text-xs text-gray-500">{time}</span>
              </div>

              {/* SS-005: Resume button */}
              {memory.memory_type === 'conversation' && (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => onResume(memory)}
                  disabled={isResuming}
                  className="gap-1 text-xs h-7"
                >
                  {isResuming ? (
                    <>
                      <Loader2 className="w-3 h-3 animate-spin" />
                      Loading...
                    </>
                  ) : (
                    <>
                      Resume
                      <ArrowRight className="w-3 h-3" />
                    </>
                  )}
                </Button>
              )}
            </div>

            {/* Summary */}
            <p className="text-sm text-gray-900 dark:text-gray-100 mt-1 line-clamp-2">
              {memory.summary}
            </p>

            {/* Context snippet */}
            {memory.context_snippet && (
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 italic line-clamp-1">
                "{memory.context_snippet}"
              </p>
            )}

            {/* Entity Links */}
            {hasEntities && (
              <div className="flex flex-wrap gap-2 mt-2">
                {memory.entities.contacts?.map((contact) => (
                  <button
                    key={contact.id}
                    onClick={() => onEntityClick('contact', contact.id)}
                    className="flex items-center gap-1 text-xs text-blue-600 dark:text-blue-400 hover:underline"
                  >
                    <User className="w-3 h-3" />
                    {contact.name}
                  </button>
                ))}
                {memory.entities.deals?.map((deal) => (
                  <button
                    key={deal.id}
                    onClick={() => onEntityClick('deal', deal.id)}
                    className="flex items-center gap-1 text-xs text-emerald-600 dark:text-emerald-400 hover:underline"
                  >
                    <DollarSign className="w-3 h-3" />
                    {deal.name}
                  </button>
                ))}
                {memory.entities.companies?.map((company) => (
                  <button
                    key={company.id}
                    onClick={() => onEntityClick('company', company.id)}
                    className="flex items-center gap-1 text-xs text-purple-600 dark:text-purple-400 hover:underline"
                  >
                    <Building2 className="w-3 h-3" />
                    {company.name}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
