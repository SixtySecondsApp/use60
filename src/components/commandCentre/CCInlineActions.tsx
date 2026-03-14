/**
 * CCInlineActions — TRINITY-017
 *
 * Inline action buttons for Command Centre detail panel:
 *  1. Reply Email — inline compose form (copies to clipboard or sends via edge fn)
 *  2. Create Task — inline form that inserts into `tasks` table
 *  3. Update CRM — dropdown to change deal stage (only for deal-linked items)
 *
 * Each action marks the CC item as resolved_via = 'manual' on completion.
 */

import { useCallback, useEffect, useState } from 'react';
import {
  ArrowUpRight,
  Check,
  Copy,
  ListTodo,
  Loader2,
  Mail,
  Send,
  X,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabase/clientV2';
import { useQueryClient } from '@tanstack/react-query';
import { CC_ITEMS_KEY, CC_STATS_KEY } from '@/lib/hooks/useCommandCentreItemsQuery';
import type { CCItem } from '@/lib/services/commandCentreItemsService';
import logger from '@/lib/utils/logger';

// ============================================================================
// Types
// ============================================================================

interface DealStage {
  id: string;
  name: string;
  color: string;
  order_position: number;
}

export interface CCInlineActionsProps {
  item: CCItem;
}

// ============================================================================
// Helpers
// ============================================================================

/** Resolve the CC item as manually completed */
async function resolveItem(id: string) {
  const { error } = await supabase
    .from('command_centre_items')
    .update({
      status: 'completed',
      resolved_at: new Date().toISOString(),
      resolved_via: 'manual',
      resolution_channel: 'inline_action',
    })
    .eq('id', id);

  if (error) {
    logger.error('[CCInlineActions.resolveItem] Error:', error);
    throw error;
  }
}

/** Extract contact email from enrichment_context or drafted_action */
function extractContactEmail(item: CCItem): string {
  const ec = (item.enrichment_context ?? {}) as Record<string, unknown>;
  const da = (item.drafted_action ?? {}) as Record<string, unknown>;

  // Check common nested paths
  if (typeof da.to === 'string') return da.to;
  if (typeof ec.email === 'string') return ec.email;
  if (typeof ec.contact_email === 'string') return ec.contact_email;

  // Check nested contact object
  const contact = ec.contact as Record<string, unknown> | undefined;
  if (contact && typeof contact.email === 'string') return contact.email;

  return '';
}

/** Extract drafted body text from drafted_action */
function extractDraftedBody(item: CCItem): string {
  const da = (item.drafted_action ?? {}) as Record<string, unknown>;
  if (typeof da.body === 'string') return da.body;
  if (typeof da.body_html === 'string') return da.body_html;
  if (typeof da.message === 'string') return da.message;
  if (typeof da.display_text === 'string') return da.display_text;
  return '';
}

/** Check if item is deal-related */
function isDealRelated(item: CCItem): boolean {
  if (item.deal_id) return true;
  const t = item.item_type?.toLowerCase() ?? '';
  return t.includes('deal') || t.includes('risk');
}

/** Check if item is already resolved / dismissed */
function isResolved(item: CCItem): boolean {
  return ['completed', 'dismissed', 'auto_resolved'].includes(item.status);
}

// ============================================================================
// Reply Email Action
// ============================================================================

function ReplyEmailAction({ item, onDone }: { item: CCItem; onDone: () => void }) {
  const [expanded, setExpanded] = useState(false);
  const [to, setTo] = useState(() => extractContactEmail(item));
  const [subject, setSubject] = useState(() => `Re: ${item.title}`);
  const [body, setBody] = useState(() => extractDraftedBody(item));
  const [isSending, setIsSending] = useState(false);

  const handleCopyToClipboard = useCallback(async () => {
    const text = `To: ${to}\nSubject: ${subject}\n\n${body}`;
    try {
      await navigator.clipboard.writeText(text);
      toast.success('Email copied to clipboard');
      await resolveItem(item.id);
      onDone();
    } catch {
      toast.error('Failed to copy to clipboard');
    }
  }, [to, subject, body, item.id, onDone]);

  const handleSend = useCallback(async () => {
    if (!to.trim()) {
      toast.error('Recipient email is required');
      return;
    }
    setIsSending(true);
    try {
      const { error } = await supabase.functions.invoke('email-send-as-rep', {
        body: { to, subject, body: body },
      });
      if (error) throw error;
      await resolveItem(item.id);
      toast.success('Email sent');
      onDone();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to send email';
      toast.error(message);
    } finally {
      setIsSending(false);
    }
  }, [to, subject, body, item.id, onDone]);

  if (!expanded) {
    return (
      <Button
        size="sm"
        variant="outline"
        className="h-8 px-3 text-xs gap-1.5"
        onClick={() => setExpanded(true)}
      >
        <Mail className="h-3 w-3" />
        Reply Email
      </Button>
    );
  }

  return (
    <div className="rounded-lg border border-slate-200 dark:border-gray-700/60 bg-white dark:bg-gray-900/40 p-3 space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-slate-700 dark:text-gray-200 flex items-center gap-1.5">
          <Mail className="h-3.5 w-3.5 text-slate-400 dark:text-gray-500" />
          Reply Email
        </span>
        <Button
          size="sm"
          variant="ghost"
          className="h-6 w-6 p-0 text-slate-400 hover:text-slate-600 dark:hover:text-gray-200"
          onClick={() => setExpanded(false)}
        >
          <X className="h-3.5 w-3.5" />
        </Button>
      </div>

      <div>
        <label className="block text-xs text-slate-500 dark:text-gray-400 mb-1">To</label>
        <Input
          value={to}
          onChange={(e) => setTo(e.target.value)}
          placeholder="recipient@example.com"
          className="h-8 text-sm"
        />
      </div>

      <div>
        <label className="block text-xs text-slate-500 dark:text-gray-400 mb-1">Subject</label>
        <Input
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          className="h-8 text-sm"
        />
      </div>

      <div>
        <label className="block text-xs text-slate-500 dark:text-gray-400 mb-1">Body</label>
        <Textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={4}
          className="resize-none text-sm"
        />
      </div>

      <div className="flex items-center gap-2 pt-1">
        <Button
          size="sm"
          className="h-7 px-3 text-xs gap-1.5"
          onClick={handleSend}
          disabled={isSending || !to.trim()}
        >
          {isSending ? (
            <Loader2 className="h-3 w-3 animate-spin" />
          ) : (
            <Send className="h-3 w-3" />
          )}
          Send
        </Button>
        <Button
          size="sm"
          variant="outline"
          className="h-7 px-3 text-xs gap-1.5"
          onClick={handleCopyToClipboard}
        >
          <Copy className="h-3 w-3" />
          Copy
        </Button>
      </div>
    </div>
  );
}

// ============================================================================
// Create Task Action
// ============================================================================

function CreateTaskAction({ item, onDone }: { item: CCItem; onDone: () => void }) {
  const [expanded, setExpanded] = useState(false);
  const [title, setTitle] = useState(() => item.title);
  const [description, setDescription] = useState(() => {
    const parts: string[] = [];
    if (item.summary) parts.push(item.summary);
    const da = (item.drafted_action ?? {}) as Record<string, unknown>;
    if (typeof da.display_text === 'string') parts.push(da.display_text);
    return parts.join('\n\n');
  });
  const [isCreating, setIsCreating] = useState(false);

  const handleCreate = useCallback(async () => {
    if (!title.trim()) {
      toast.error('Task title is required');
      return;
    }
    setIsCreating(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      const { error } = await supabase.from('tasks').insert({
        title: title.trim(),
        description: description.trim() || null,
        task_type: 'action_item',
        status: 'pending',
        ai_status: 'none',
        priority: item.urgency === 'critical' ? 'high' : item.urgency === 'high' ? 'high' : 'medium',
        assigned_to: user.id,
        created_by: user.id,
        source: 'command_centre',
        deal_id: item.deal_id || null,
        contact_id: item.contact_id || null,
      });

      if (error) throw error;
      await resolveItem(item.id);
      toast.success('Task created');
      onDone();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to create task';
      toast.error(message);
    } finally {
      setIsCreating(false);
    }
  }, [title, description, item, onDone]);

  if (!expanded) {
    return (
      <Button
        size="sm"
        variant="outline"
        className="h-8 px-3 text-xs gap-1.5"
        onClick={() => setExpanded(true)}
      >
        <ListTodo className="h-3 w-3" />
        Create Task
      </Button>
    );
  }

  return (
    <div className="rounded-lg border border-slate-200 dark:border-gray-700/60 bg-white dark:bg-gray-900/40 p-3 space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-slate-700 dark:text-gray-200 flex items-center gap-1.5">
          <ListTodo className="h-3.5 w-3.5 text-slate-400 dark:text-gray-500" />
          Create Task
        </span>
        <Button
          size="sm"
          variant="ghost"
          className="h-6 w-6 p-0 text-slate-400 hover:text-slate-600 dark:hover:text-gray-200"
          onClick={() => setExpanded(false)}
        >
          <X className="h-3.5 w-3.5" />
        </Button>
      </div>

      <div>
        <label className="block text-xs text-slate-500 dark:text-gray-400 mb-1">Title</label>
        <Input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Task title"
          className="h-8 text-sm"
        />
      </div>

      <div>
        <label className="block text-xs text-slate-500 dark:text-gray-400 mb-1">Description</label>
        <Textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={3}
          className="resize-none text-sm"
        />
      </div>

      <div className="flex items-center gap-2 pt-1">
        <Button
          size="sm"
          className="h-7 px-3 text-xs gap-1.5"
          onClick={handleCreate}
          disabled={isCreating || !title.trim()}
        >
          {isCreating ? (
            <Loader2 className="h-3 w-3 animate-spin" />
          ) : (
            <Check className="h-3 w-3" />
          )}
          Create
        </Button>
      </div>
    </div>
  );
}

// ============================================================================
// Update CRM Action (deal stage change)
// ============================================================================

function UpdateCrmAction({ item, onDone }: { item: CCItem; onDone: () => void }) {
  const [expanded, setExpanded] = useState(false);
  const [stages, setStages] = useState<DealStage[]>([]);
  const [isLoadingStages, setIsLoadingStages] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);

  useEffect(() => {
    if (!expanded) return;

    let cancelled = false;
    const fetchStages = async () => {
      setIsLoadingStages(true);
      try {
        const { data, error } = await supabase
          .from('deal_stages')
          .select('id, name, color, order_position')
          .order('order_position', { ascending: true });

        if (error) throw error;
        if (!cancelled) setStages((data as DealStage[]) ?? []);
      } catch (err) {
        logger.error('[CCInlineActions.fetchStages] Error:', err);
        toast.error('Failed to load deal stages');
      } finally {
        if (!cancelled) setIsLoadingStages(false);
      }
    };

    fetchStages();
    return () => { cancelled = true; };
  }, [expanded]);

  const handleStageSelect = useCallback(async (stageId: string, stageName: string) => {
    if (!item.deal_id) return;
    setIsUpdating(true);
    try {
      const { error } = await supabase
        .from('deals')
        .update({
          stage_id: stageId,
          stage_updated_at: new Date().toISOString(),
        })
        .eq('id', item.deal_id);

      if (error) throw error;
      await resolveItem(item.id);
      toast.success(`Deal moved to "${stageName}"`);
      onDone();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to update deal stage';
      toast.error(message);
    } finally {
      setIsUpdating(false);
    }
  }, [item.id, item.deal_id, onDone]);

  if (!expanded) {
    return (
      <Button
        size="sm"
        variant="outline"
        className="h-8 px-3 text-xs gap-1.5"
        onClick={() => setExpanded(true)}
      >
        <ArrowUpRight className="h-3 w-3" />
        Update CRM
      </Button>
    );
  }

  return (
    <div className="rounded-lg border border-slate-200 dark:border-gray-700/60 bg-white dark:bg-gray-900/40 p-3 space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-slate-700 dark:text-gray-200 flex items-center gap-1.5">
          <ArrowUpRight className="h-3.5 w-3.5 text-slate-400 dark:text-gray-500" />
          Update Deal Stage
        </span>
        <Button
          size="sm"
          variant="ghost"
          className="h-6 w-6 p-0 text-slate-400 hover:text-slate-600 dark:hover:text-gray-200"
          onClick={() => setExpanded(false)}
        >
          <X className="h-3.5 w-3.5" />
        </Button>
      </div>

      {isLoadingStages ? (
        <div className="flex items-center justify-center py-3">
          <Loader2 className="h-4 w-4 animate-spin text-slate-400" />
        </div>
      ) : stages.length === 0 ? (
        <p className="text-xs text-slate-400 dark:text-gray-500 italic py-2">No deal stages configured.</p>
      ) : (
        <div className="space-y-1">
          {stages.map((stage) => (
            <button
              key={stage.id}
              className={cn(
                'w-full flex items-center gap-2 px-3 py-2 rounded-md text-left text-sm transition-colors',
                'hover:bg-slate-100 dark:hover:bg-gray-800',
                isUpdating && 'opacity-50 pointer-events-none',
              )}
              onClick={() => handleStageSelect(stage.id, stage.name)}
              disabled={isUpdating}
            >
              <span
                className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                style={{ backgroundColor: stage.color || '#6B7280' }}
              />
              <span className="text-slate-700 dark:text-gray-200">{stage.name}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ============================================================================
// Main CCInlineActions
// ============================================================================

export function CCInlineActions({ item }: CCInlineActionsProps) {
  const queryClient = useQueryClient();

  // Don't render actions for already-resolved items
  if (isResolved(item)) return null;

  const handleDone = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: [CC_ITEMS_KEY] });
    queryClient.invalidateQueries({ queryKey: [CC_STATS_KEY] });
  }, [queryClient]);

  const showCrmAction = isDealRelated(item);

  return (
    <div className="space-y-2">
      <p className="text-xs font-medium text-slate-500 dark:text-gray-400 uppercase tracking-wider">
        Quick Actions
      </p>
      <div className="flex flex-wrap gap-2">
        <ReplyEmailAction item={item} onDone={handleDone} />
        <CreateTaskAction item={item} onDone={handleDone} />
        {showCrmAction && <UpdateCrmAction item={item} onDone={handleDone} />}
      </div>
    </div>
  );
}
