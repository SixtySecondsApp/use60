/**
 * BrainContactMemory — Contact Memory tab content (TRINITY-012)
 *
 * Split-pane layout: contact list on the left with relationship strength bars,
 * detail panel on the right showing full memory, communication style, and
 * related copilot_memories.
 */

import { useState, useMemo } from 'react';
import {
  Brain,
  Users,
  Mail,
  MailOpen,
  Calendar,
  Clock,
  AlertTriangle,
  MessageSquare,
  Lightbulb,
  User,
} from 'lucide-react';
import { formatDistanceToNow, differenceInDays } from 'date-fns';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  useContactMemoryList,
  useContactNames,
  useContactRelatedMemories,
  type ContactMemoryRow,
  type ContactNameInfo,
  type RelatedCopilotMemory,
} from '@/lib/hooks/useContactMemory';
import { cn } from '@/lib/utils';

// ============================================================================
// Helpers
// ============================================================================

function strengthColor(strength: number): string {
  if (strength >= 0.7) return 'bg-emerald-500';
  if (strength >= 0.4) return 'bg-yellow-500';
  return 'bg-red-500';
}

function strengthTextColor(strength: number): string {
  if (strength >= 0.7) return 'text-emerald-600 dark:text-emerald-400';
  if (strength >= 0.4) return 'text-yellow-600 dark:text-yellow-400';
  return 'text-red-600 dark:text-red-400';
}

function getContactDisplayName(
  contactId: string,
  nameMap: Record<string, ContactNameInfo>
): string {
  const info = nameMap[contactId];
  if (!info) return contactId;
  const parts = [info.first_name, info.last_name].filter(Boolean);
  return parts.length > 0 ? parts.join(' ') : info.email;
}

function getContactSubtitle(
  contactId: string,
  nameMap: Record<string, ContactNameInfo>
): string | null {
  const info = nameMap[contactId];
  if (!info) return null;
  return info.title ?? info.email;
}

function isStale(lastInteraction: string | null): boolean {
  if (!lastInteraction) return true;
  return differenceInDays(new Date(), new Date(lastInteraction)) > 30;
}

// ============================================================================
// Sub-components
// ============================================================================

function ContactListItem({
  memory,
  nameMap,
  selected,
  onClick,
}: {
  memory: ContactMemoryRow;
  nameMap: Record<string, ContactNameInfo>;
  selected: boolean;
  onClick: () => void;
}) {
  const displayName = getContactDisplayName(memory.contact_id, nameMap);
  const subtitle = getContactSubtitle(memory.contact_id, nameMap);
  const pct = Math.round(memory.relationship_strength * 100);
  const stale = isStale(memory.last_interaction_at);

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'w-full text-left px-4 py-3 border-b border-slate-100 dark:border-gray-800/50 transition-colors',
        selected
          ? 'bg-slate-100 dark:bg-gray-800/60'
          : 'hover:bg-slate-50 dark:hover:bg-gray-800/30'
      )}
    >
      <div className="flex items-center gap-3">
        <div className="w-8 h-8 rounded-full bg-slate-200 dark:bg-gray-700 flex items-center justify-center flex-shrink-0">
          <User className="h-4 w-4 text-slate-500 dark:text-gray-400" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-slate-800 dark:text-gray-100 truncate">
              {displayName}
            </span>
            {stale && (
              <AlertTriangle className="h-3 w-3 text-amber-500 flex-shrink-0" />
            )}
          </div>
          {subtitle && (
            <p className="text-xs text-slate-400 dark:text-gray-500 truncate">
              {subtitle}
            </p>
          )}
          {/* Strength bar */}
          <div className="flex items-center gap-2 mt-1.5">
            <div className="flex-1 h-1.5 rounded-full bg-slate-100 dark:bg-gray-800 overflow-hidden">
              <div
                className={cn('h-full rounded-full transition-all', strengthColor(memory.relationship_strength))}
                style={{ width: `${pct}%` }}
              />
            </div>
            <span className={cn('text-[11px] tabular-nums font-medium', strengthTextColor(memory.relationship_strength))}>
              {pct}%
            </span>
          </div>
          {/* Last interaction */}
          {memory.last_interaction_at && (
            <p className="text-[11px] text-slate-400 dark:text-gray-500 mt-1 flex items-center gap-1">
              <Clock className="h-3 w-3" />
              {formatDistanceToNow(new Date(memory.last_interaction_at), { addSuffix: true })}
            </p>
          )}
        </div>
      </div>
    </button>
  );
}

function DetailPanel({
  memory,
  nameMap,
  relatedMemories,
  relatedLoading,
}: {
  memory: ContactMemoryRow;
  nameMap: Record<string, ContactNameInfo>;
  relatedMemories: RelatedCopilotMemory[];
  relatedLoading: boolean;
}) {
  const displayName = getContactDisplayName(memory.contact_id, nameMap);
  const pct = Math.round(memory.relationship_strength * 100);
  const stale = isStale(memory.last_interaction_at);
  const commStyle = memory.communication_style as Record<string, unknown>;

  return (
    <ScrollArea className="h-full">
      <div className="p-6 space-y-6">
        {/* Header */}
        <div>
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 rounded-full bg-slate-200 dark:bg-gray-700 flex items-center justify-center">
              <User className="h-5 w-5 text-slate-500 dark:text-gray-400" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-slate-800 dark:text-gray-100">
                {displayName}
              </h2>
              {nameMap[memory.contact_id]?.title && (
                <p className="text-sm text-slate-400 dark:text-gray-500">
                  {nameMap[memory.contact_id].title}
                </p>
              )}
            </div>
          </div>
          {stale && (
            <Badge className="bg-amber-50 dark:bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-200 dark:border-amber-500/20 gap-1 mt-2">
              <AlertTriangle className="h-3 w-3" />
              Stale
            </Badge>
          )}
        </div>

        {/* Relationship strength — large bar */}
        <Card className="p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium text-slate-700 dark:text-gray-200">
              Relationship Strength
            </span>
            <span className={cn('text-lg font-bold tabular-nums', strengthTextColor(memory.relationship_strength))}>
              {pct}%
            </span>
          </div>
          <div className="h-3 rounded-full bg-slate-100 dark:bg-gray-800 overflow-hidden">
            <div
              className={cn('h-full rounded-full transition-all', strengthColor(memory.relationship_strength))}
              style={{ width: `${pct}%` }}
            />
          </div>
        </Card>

        {/* Interaction stats */}
        <div className="grid grid-cols-3 gap-3">
          <Card className="p-3 text-center">
            <Calendar className="h-4 w-4 text-slate-400 dark:text-gray-500 mx-auto mb-1" />
            <p className="text-lg font-bold text-slate-800 dark:text-gray-100 tabular-nums">
              {memory.total_meetings}
            </p>
            <p className="text-[11px] text-slate-400 dark:text-gray-500">Meetings</p>
          </Card>
          <Card className="p-3 text-center">
            <Mail className="h-4 w-4 text-slate-400 dark:text-gray-500 mx-auto mb-1" />
            <p className="text-lg font-bold text-slate-800 dark:text-gray-100 tabular-nums">
              {memory.total_emails_sent}
            </p>
            <p className="text-[11px] text-slate-400 dark:text-gray-500">Sent</p>
          </Card>
          <Card className="p-3 text-center">
            <MailOpen className="h-4 w-4 text-slate-400 dark:text-gray-500 mx-auto mb-1" />
            <p className="text-lg font-bold text-slate-800 dark:text-gray-100 tabular-nums">
              {memory.total_emails_received}
            </p>
            <p className="text-[11px] text-slate-400 dark:text-gray-500">Received</p>
          </Card>
        </div>

        {/* Communication style */}
        {Object.keys(commStyle).length > 0 && (
          <Card className="p-4">
            <div className="flex items-center gap-2 mb-3">
              <MessageSquare className="h-4 w-4 text-slate-500 dark:text-gray-400" />
              <h3 className="text-sm font-medium text-slate-700 dark:text-gray-200">
                Communication Style
              </h3>
            </div>
            <div className="space-y-2">
              {Object.entries(commStyle).map(([key, value]) => (
                <div key={key} className="flex items-start gap-2">
                  <span className="text-xs font-medium text-slate-500 dark:text-gray-400 min-w-[100px] capitalize">
                    {key.replace(/_/g, ' ')}
                  </span>
                  <span className="text-sm text-slate-700 dark:text-gray-200">
                    {typeof value === 'string' ? value : JSON.stringify(value)}
                  </span>
                </div>
              ))}
            </div>
          </Card>
        )}

        {/* Summary */}
        {memory.summary && (
          <Card className="p-4">
            <div className="flex items-center gap-2 mb-2">
              <Lightbulb className="h-4 w-4 text-slate-500 dark:text-gray-400" />
              <h3 className="text-sm font-medium text-slate-700 dark:text-gray-200">
                Summary
              </h3>
            </div>
            <p className="text-sm text-slate-600 dark:text-gray-400 leading-relaxed">
              {memory.summary}
            </p>
          </Card>
        )}

        {/* Average response time */}
        {memory.avg_response_time_hours != null && (
          <Card className="p-4">
            <div className="flex items-center gap-2">
              <Clock className="h-4 w-4 text-slate-500 dark:text-gray-400" />
              <span className="text-sm text-slate-700 dark:text-gray-200">
                Avg response time:{' '}
                <span className="font-medium">
                  {memory.avg_response_time_hours < 1
                    ? `${Math.round(memory.avg_response_time_hours * 60)} min`
                    : `${memory.avg_response_time_hours.toFixed(1)} hrs`}
                </span>
              </span>
            </div>
          </Card>
        )}

        {/* Related copilot_memories */}
        <div>
          <div className="flex items-center gap-2 mb-3">
            <Brain className="h-4 w-4 text-slate-500 dark:text-gray-400" />
            <h3 className="text-sm font-medium text-slate-700 dark:text-gray-200">
              Related Memories
            </h3>
            {relatedMemories.length > 0 && (
              <span className="text-xs text-slate-400 dark:text-gray-500">
                ({relatedMemories.length})
              </span>
            )}
          </div>

          {relatedLoading ? (
            <div className="space-y-2">
              {[1, 2].map((i) => (
                <Skeleton key={i} className="h-16 w-full rounded-lg" />
              ))}
            </div>
          ) : relatedMemories.length === 0 ? (
            <p className="text-xs text-slate-400 dark:text-gray-500 py-4 text-center">
              No related memories found
            </p>
          ) : (
            <div className="space-y-2">
              {relatedMemories.map((mem) => (
                <Card key={mem.id} className="p-3">
                  <div className="flex items-center gap-2 mb-1">
                    <Badge variant="secondary" className="text-[10px]">
                      {mem.category}
                    </Badge>
                    <span className="text-xs text-slate-400 dark:text-gray-500 ml-auto">
                      {formatDistanceToNow(new Date(mem.created_at), { addSuffix: true })}
                    </span>
                  </div>
                  <p className="text-xs font-medium text-slate-700 dark:text-gray-200 mb-0.5">
                    {mem.subject}
                  </p>
                  <p className="text-xs text-slate-500 dark:text-gray-400 line-clamp-2">
                    {mem.content}
                  </p>
                </Card>
              ))}
            </div>
          )}
        </div>
      </div>
    </ScrollArea>
  );
}

function ListSkeleton() {
  return (
    <div className="space-y-0">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="px-4 py-3 border-b border-slate-100 dark:border-gray-800/50">
          <div className="flex items-center gap-3">
            <Skeleton className="w-8 h-8 rounded-full" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-1.5 w-full rounded-full" />
              <Skeleton className="h-3 w-20" />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

function DetailSkeleton() {
  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center gap-3">
        <Skeleton className="w-10 h-10 rounded-full" />
        <div className="space-y-2">
          <Skeleton className="h-5 w-40" />
          <Skeleton className="h-3 w-28" />
        </div>
      </div>
      <Skeleton className="h-16 w-full rounded-lg" />
      <div className="grid grid-cols-3 gap-3">
        {[1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-20 rounded-lg" />
        ))}
      </div>
      <Skeleton className="h-32 w-full rounded-lg" />
    </div>
  );
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center py-24">
      <div className="w-14 h-14 rounded-2xl bg-slate-100 dark:bg-gray-800/50 flex items-center justify-center mb-4">
        <Users className="h-7 w-7 text-slate-400 dark:text-gray-500" />
      </div>
      <p className="text-sm font-medium text-slate-600 dark:text-gray-300 mb-1">
        No contact memories yet
      </p>
      <p className="text-xs text-slate-400 dark:text-gray-500 max-w-xs text-center">
        Contact memories are built automatically as you interact with contacts through
        meetings, emails, and the copilot. They track relationship strength and communication
        patterns over time.
      </p>
    </div>
  );
}

function SelectContactState() {
  return (
    <div className="flex flex-col items-center justify-center h-full">
      <div className="w-14 h-14 rounded-2xl bg-slate-100 dark:bg-gray-800/50 flex items-center justify-center mb-4">
        <User className="h-7 w-7 text-slate-400 dark:text-gray-500" />
      </div>
      <p className="text-sm font-medium text-slate-600 dark:text-gray-300 mb-1">
        Select a contact
      </p>
      <p className="text-xs text-slate-400 dark:text-gray-500">
        Choose a contact to view their full memory
      </p>
    </div>
  );
}

// ============================================================================
// Main component
// ============================================================================

export default function BrainContactMemory() {
  const [selectedContactId, setSelectedContactId] = useState<string | null>(null);

  // Fetch all contact memories
  const { data: memories = [], isLoading: listLoading } = useContactMemoryList();

  // Gather contact IDs to resolve names
  const contactIds = useMemo(() => memories.map((m) => m.contact_id), [memories]);
  const { data: nameMap = {} } = useContactNames(contactIds);

  // Find the selected memory from the list
  const selectedMemory = useMemo(
    () => memories.find((m) => m.contact_id === selectedContactId) ?? null,
    [memories, selectedContactId]
  );

  // Fetch related copilot_memories for the selected contact
  const { data: relatedMemories = [], isLoading: relatedLoading } =
    useContactRelatedMemories(selectedContactId);

  // Empty state — no contacts at all
  if (!listLoading && memories.length === 0) {
    return <EmptyState />;
  }

  return (
    <div className="flex rounded-lg border border-slate-200 dark:border-gray-700/50 bg-white dark:bg-gray-900/60 overflow-hidden" style={{ height: 'calc(100vh - 14rem)' }}>
      {/* Left: contact list */}
      <div className="w-80 flex-shrink-0 border-r border-slate-200 dark:border-gray-700/50 flex flex-col">
        <div className="px-4 py-3 border-b border-slate-200 dark:border-gray-700/50">
          <div className="flex items-center gap-2">
            <Users className="h-4 w-4 text-slate-500 dark:text-gray-400" />
            <span className="text-sm font-medium text-slate-700 dark:text-gray-200">
              Contacts
            </span>
            {!listLoading && (
              <span className="text-xs text-slate-400 dark:text-gray-500">
                ({memories.length})
              </span>
            )}
          </div>
        </div>
        <ScrollArea className="flex-1">
          {listLoading ? (
            <ListSkeleton />
          ) : (
            memories.map((memory) => (
              <ContactListItem
                key={memory.id}
                memory={memory}
                nameMap={nameMap}
                selected={selectedContactId === memory.contact_id}
                onClick={() => setSelectedContactId(memory.contact_id)}
              />
            ))
          )}
        </ScrollArea>
      </div>

      {/* Right: detail panel */}
      <div className="flex-1 min-w-0">
        {!selectedMemory ? (
          <SelectContactState />
        ) : (
          <DetailPanel
            memory={selectedMemory}
            nameMap={nameMap}
            relatedMemories={relatedMemories}
            relatedLoading={relatedLoading}
          />
        )}
      </div>
    </div>
  );
}
