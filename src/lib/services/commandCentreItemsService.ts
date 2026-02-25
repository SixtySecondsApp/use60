/**
 * Command Centre Items Service
 *
 * CRUD layer for the command_centre_items table — the unified AI proactive inbox.
 * Items flow through: open → enriching → ready → approved → executing → completed | dismissed | auto_resolved
 *
 * @see supabase/migrations/20260222600001_command_centre_items.sql
 */

import { supabase } from '../supabase/clientV2';
import { toast } from 'sonner';
import logger from '@/lib/utils/logger';

// ============================================================================
// Types
// ============================================================================

export interface CCItem {
  id: string;
  org_id: string;
  user_id: string;
  source_agent: string;
  source_event_id: string | null;
  item_type: string;
  title: string;
  summary: string | null;
  context: Record<string, unknown>;
  priority_score: number | null;
  urgency: 'critical' | 'high' | 'normal' | 'low';
  due_date: string | null;
  enrichment_status: 'pending' | 'enriched' | 'failed' | 'skipped';
  drafted_action: Record<string, unknown> | null;
  confidence_score: number | null;
  requires_human_input: string[] | null;
  status: 'open' | 'enriching' | 'ready' | 'approved' | 'executing' | 'completed' | 'dismissed' | 'auto_resolved';
  resolution_channel: string | null;
  created_at: string;
  updated_at: string;
  resolved_at: string | null;
  deal_id: string | null;
  contact_id: string | null;
  enrichment_context: Record<string, unknown>;
  confidence_factors: Record<string, unknown>;
  priority_factors: Record<string, unknown>;
  enriched_at: string | null;
  parent_item_id: string | null;
}

export interface CCItemFilters {
  status?: string | string[];
  urgency?: string;
  source_agent?: string;
  deal_id?: string;
  contact_id?: string;
  search?: string;
}

export interface CCStats {
  total_active: number;
  needs_review: number;
  needs_input: number;
  auto_completed_today: number;
  resolved_today: number;
  pending_approval: number;
}

// Explicit column selection — never select('*')
const CC_ITEM_COLUMNS = [
  'id',
  'org_id',
  'user_id',
  'source_agent',
  'source_event_id',
  'item_type',
  'title',
  'summary',
  'context',
  'priority_score',
  'urgency',
  'due_date',
  'enrichment_status',
  'drafted_action',
  'confidence_score',
  'requires_human_input',
  'status',
  'resolution_channel',
  'created_at',
  'updated_at',
  'resolved_at',
  'deal_id',
  'contact_id',
  'enrichment_context',
  'confidence_factors',
  'priority_factors',
  'enriched_at',
  'parent_item_id',
].join(', ');

// ============================================================================
// Service
// ============================================================================

class CommandCentreItemsService {
  async getItems(filters: CCItemFilters = {}): Promise<CCItem[]> {
    try {
      let query = supabase
        .from('command_centre_items')
        .select(CC_ITEM_COLUMNS)
        .order('priority_score', { ascending: false, nullsFirst: false });

      // status: single value or array
      if (filters.status) {
        if (Array.isArray(filters.status)) {
          query = query.in('status', filters.status);
        } else {
          query = query.eq('status', filters.status);
        }
      }

      if (filters.urgency) {
        query = query.eq('urgency', filters.urgency);
      }

      if (filters.source_agent) {
        query = query.eq('source_agent', filters.source_agent);
      }

      if (filters.deal_id) {
        query = query.eq('deal_id', filters.deal_id);
      }

      if (filters.contact_id) {
        query = query.eq('contact_id', filters.contact_id);
      }

      if (filters.search) {
        query = query.ilike('title', `%${filters.search}%`);
      }

      const { data, error } = await query;

      if (error) {
        logger.error('[commandCentreItemsService.getItems] Error:', error);
        toast.error('Failed to load command centre items');
        throw error;
      }

      return (data as CCItem[]) || [];
    } catch (err) {
      logger.error('[commandCentreItemsService.getItems] Exception:', err);
      throw err;
    }
  }

  async getStats(): Promise<CCStats> {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      const { data, error } = await supabase.rpc('get_cc_stats', {
        p_user_id: user.id,
      });

      if (error) {
        logger.error('[commandCentreItemsService.getStats] Error:', error);
        throw error;
      }

      return (data as CCStats) ?? {
        total_active: 0,
        needs_review: 0,
        needs_input: 0,
        auto_completed_today: 0,
        resolved_today: 0,
        pending_approval: 0,
      };
    } catch (err) {
      logger.error('[commandCentreItemsService.getStats] Exception:', err);
      throw err;
    }
  }

  async getItemById(id: string): Promise<CCItem | null> {
    try {
      const { data, error } = await supabase
        .from('command_centre_items')
        .select(CC_ITEM_COLUMNS)
        .eq('id', id)
        .maybeSingle(); // returns null gracefully if not found — never throws PGRST116

      if (error) {
        logger.error('[commandCentreItemsService.getItemById] Error:', error);
        toast.error('Failed to load item');
        throw error;
      }

      return data as CCItem | null;
    } catch (err) {
      logger.error('[commandCentreItemsService.getItemById] Exception:', err);
      throw err;
    }
  }

  async approveItem(id: string): Promise<void> {
    try {
      const { error } = await supabase
        .from('command_centre_items')
        .update({ status: 'approved' })
        .eq('id', id);

      if (error) {
        logger.error('[commandCentreItemsService.approveItem] Error:', error);
        toast.error('Failed to approve item');
        throw error;
      }

      // Fire-and-forget Slack sync — non-blocking, does not affect user action
      supabase.functions.invoke('cc-action-sync', {
        body: { item_id: id, action: 'approved' },
      }).catch(err => logger.warn('[commandCentreItemsService] Slack sync failed (non-blocking):', err));
    } catch (err) {
      logger.error('[commandCentreItemsService.approveItem] Exception:', err);
      throw err;
    }
  }

  async dismissItem(id: string): Promise<void> {
    try {
      const { error } = await supabase
        .from('command_centre_items')
        .update({ status: 'dismissed', resolved_at: new Date().toISOString() })
        .eq('id', id);

      if (error) {
        logger.error('[commandCentreItemsService.dismissItem] Error:', error);
        toast.error('Failed to dismiss item');
        throw error;
      }

      // Fire-and-forget Slack sync — non-blocking, does not affect user action
      supabase.functions.invoke('cc-action-sync', {
        body: { item_id: id, action: 'dismissed' },
      }).catch(err => logger.warn('[commandCentreItemsService] Slack sync failed (non-blocking):', err));
    } catch (err) {
      logger.error('[commandCentreItemsService.dismissItem] Exception:', err);
      throw err;
    }
  }

  async snoozeItem(id: string, until: string): Promise<void> {
    try {
      const { error } = await supabase
        .from('command_centre_items')
        .update({ due_date: until })
        .eq('id', id);

      if (error) {
        logger.error('[commandCentreItemsService.snoozeItem] Error:', error);
        toast.error('Failed to snooze item');
        throw error;
      }
    } catch (err) {
      logger.error('[commandCentreItemsService.snoozeItem] Exception:', err);
      throw err;
    }
  }

  async undoItem(id: string): Promise<void> {
    try {
      const { error } = await supabase.functions.invoke('cc-undo', {
        body: { item_id: id },
      });

      if (error) {
        logger.error('[commandCentreItemsService.undoItem] Error:', error);
        toast.error('Failed to undo item');
        throw error;
      }
    } catch (err) {
      logger.error('[commandCentreItemsService.undoItem] Exception:', err);
      throw err;
    }
  }

  async updateDraftedAction(id: string, action: Record<string, unknown>): Promise<void> {
    try {
      const { error } = await supabase
        .from('command_centre_items')
        .update({ drafted_action: action })
        .eq('id', id);

      if (error) {
        logger.error('[commandCentreItemsService.updateDraftedAction] Error:', error);
        toast.error('Failed to update drafted action');
        throw error;
      }
    } catch (err) {
      logger.error('[commandCentreItemsService.updateDraftedAction] Exception:', err);
      throw err;
    }
  }

  async approveAndSendEmail(
    id: string,
    emailPayload: { to: string; subject: string; body_html: string },
  ): Promise<void> {
    try {
      // Step 1: Call email-send-as-rep edge function
      const { error: sendError } = await supabase.functions.invoke('email-send-as-rep', {
        body: {
          to: emailPayload.to,
          subject: emailPayload.subject,
          body: emailPayload.body_html,
        },
      });

      if (sendError) {
        logger.error('[commandCentreItemsService.approveAndSendEmail] Send error:', sendError);
        throw sendError;
      }

      // Step 2: Mark item as completed
      const { error: updateError } = await supabase
        .from('command_centre_items')
        .update({
          status: 'completed',
          resolution_channel: 'manual_approved_and_sent',
          resolved_at: new Date().toISOString(),
        })
        .eq('id', id);

      if (updateError) {
        logger.error('[commandCentreItemsService.approveAndSendEmail] Update error:', updateError);
        throw updateError;
      }
    } catch (err) {
      logger.error('[commandCentreItemsService.approveAndSendEmail] Exception:', err);
      throw err;
    }
  }
}

export const commandCentreItemsService = new CommandCentreItemsService();
