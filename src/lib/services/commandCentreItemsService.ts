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
  total_open: number;
  total_ready: number;
  needs_input: number;
  auto_completed_today: number;
  resolved_today: number;
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
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const todayISO = today.toISOString();

      const { data, error } = await supabase
        .from('command_centre_items')
        .select('id, status, requires_human_input, resolved_at')
        .order('created_at', { ascending: false });

      if (error) {
        logger.error('[commandCentreItemsService.getStats] Error:', error);
        throw error;
      }

      const items = data || [];

      const stats: CCStats = {
        total_open: items.filter(i => i.status === 'open' || i.status === 'enriching').length,
        total_ready: items.filter(i => i.status === 'ready').length,
        needs_input: items.filter(
          i => i.requires_human_input && (i.requires_human_input as string[]).length > 0
        ).length,
        auto_completed_today: items.filter(
          i => i.status === 'auto_resolved' && i.resolved_at && i.resolved_at >= todayISO
        ).length,
        resolved_today: items.filter(
          i =>
            (i.status === 'completed' || i.status === 'dismissed' || i.status === 'auto_resolved') &&
            i.resolved_at &&
            i.resolved_at >= todayISO
        ).length,
      };

      return stats;
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
}

export const commandCentreItemsService = new CommandCentreItemsService();
