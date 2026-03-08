import { supabase } from '@/lib/supabase/clientV2';

export interface EmailSyncStatus {
  isActive: boolean;
  isSyncing: boolean;
  lastSync: string | null;
  nextSync: string | null;
  totalEmails: number;
  error: string | null;
}

/**
 * Gmail Service - Database-first Gmail operations
 * Similar to calendarService but for Gmail emails
 */
class GmailService {
  /**
   * Get emails from the database
   * This provides instant loading from the local database
   */
  async getEmailsFromDB(
    options: {
      folder?: string;
      query?: string;
      limit?: number;
      offset?: number;
      isRead?: boolean;
      isStarred?: boolean;
    } = {}
  ) {
    try {
      const { data: { user }, error: userError } = await supabase.auth.getUser();
      if (userError || !user) {
        throw new Error('Not authenticated');
      }

      let query = supabase
        .from('emails')
        .select(`
          *,
          thread:email_threads(*)
        `)
        .eq('user_id', user.id)
        .order('received_at', { ascending: false });

      // Apply filters
      if (options.isRead !== undefined) {
        query = query.eq('is_read', options.isRead);
      }

      if (options.isStarred !== undefined) {
        query = query.eq('is_starred', options.isStarred);
      }

      // Apply folder filter (using labels JSONB array)
      if (options.folder) {
        query = query.contains('labels', [options.folder]);
      }

      // Apply search query
      if (options.query) {
        query = query.or(`subject.ilike.%${options.query}%,body_text.ilike.%${options.query}%,from_email.ilike.%${options.query}%`);
      }

      // Apply pagination
      if (options.limit) {
        query = query.limit(options.limit);
      }

      if (options.offset) {
        query = query.range(options.offset, options.offset + (options.limit || 50) - 1);
      }

      const { data, error } = await query;

      if (error) {
        console.error('[GMAIL-SERVICE] Error fetching emails from DB:', error);
        throw error;
      }

      console.log('[GMAIL-SERVICE] Fetched emails from DB:', {
        count: data?.length || 0,
        folder: options.folder,
        query: options.query,
      });

      return data || [];
    } catch (error) {
      console.error('[GMAIL-SERVICE] Failed to get emails from DB:', error);
      throw error;
    }
  }

  /**
   * Get email threads from the database
   */
  async getEmailThreadsFromDB(
    options: {
      limit?: number;
      offset?: number;
      isRead?: boolean;
      isArchived?: boolean;
    } = {}
  ) {
    try {
      const { data: { user }, error: userError } = await supabase.auth.getUser();
      if (userError || !user) {
        throw new Error('Not authenticated');
      }

      let query = supabase
        .from('email_threads')
        .select('*')
        .eq('user_id', user.id)
        .order('last_message_at', { ascending: false });

      // Apply filters
      if (options.isRead !== undefined) {
        query = query.eq('is_read', options.isRead);
      }

      if (options.isArchived !== undefined) {
        query = query.eq('is_archived', options.isArchived);
      }

      // Apply pagination
      if (options.limit) {
        query = query.limit(options.limit);
      }

      if (options.offset) {
        query = query.range(options.offset, options.offset + (options.limit || 50) - 1);
      }

      const { data, error } = await query;

      if (error) {
        console.error('[GMAIL-SERVICE] Error fetching threads from DB:', error);
        throw error;
      }

      return data || [];
    } catch (error) {
      console.error('[GMAIL-SERVICE] Failed to get threads from DB:', error);
      throw error;
    }
  }

  /**
   * Sync emails from Gmail to database
   * Similar to calendar sync but for emails
   */
  async syncEmails(
    action: 'sync-full' | 'sync-incremental' | 'sync-recent' = 'sync-incremental',
    options: {
      query?: string;
      maxResults?: number;
    } = {}
  ): Promise<{ success: boolean; syncedCount: number; error?: string }> {
    try {
      console.log('[GMAIL-SERVICE] Starting email sync:', { action, options });

      const { data: { user }, error: userError } = await supabase.auth.getUser();
      if (userError || !user) {
        throw new Error('Not authenticated');
      }

      // Get session for auth header - edge function requires explicit Authorization
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) {
        throw new Error('No active session');
      }

      // Call the Gmail edge function sync action
      const { data, error } = await supabase.functions.invoke('google-services-router', { body: { action: 'gmail', handlerAction: 'sync',
          query: options.query,
          maxResults: options.maxResults || 50,
        },
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
      });

      if (error) {
        console.error('[GMAIL-SERVICE] Sync error response:', error);
        return {
          success: false,
          syncedCount: 0,
          error: typeof error === 'object' && error !== null && 'message' in error 
            ? (error as any).message 
            : JSON.stringify(error) || 'Sync failed',
        };
      }

      console.log('[GMAIL-SERVICE] Sync completed:', data);

      return {
        success: data.success,
        syncedCount: data.syncedCount || 0,
      };
    } catch (error: any) {
      console.error('[GMAIL-SERVICE] Failed to sync emails:', error);
      return {
        success: false,
        syncedCount: 0,
        error: error?.message || 'Unknown error',
      };
    }
  }

  /**
   * Get email sync status
   */
  async getSyncStatus(): Promise<EmailSyncStatus> {
    try {
      const { data: { user }, error: userError } = await supabase.auth.getUser();
      if (userError || !user) {
        throw new Error('Not authenticated');
      }

      // Get integration
      const { data: integration, error: integrationError } = await supabase
        .from('google_integrations')
        .select('*')
        .eq('user_id', user.id)
        .eq('is_active', true)
        .single();

      if (integrationError || !integration) {
        return {
          isActive: false,
          isSyncing: false,
          lastSync: null,
          nextSync: null,
          totalEmails: 0,
          error: 'No active Google integration',
        };
      }

      // Get sync status from email_sync_status table
      const { data: syncStatus, error: syncError } = await supabase
        .from('email_sync_status')
        .select('*')
        .eq('integration_id', integration.id)
        .single();

      // Count total emails in database
      const { count } = await supabase
        .from('emails')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', user.id);

      return {
        isActive: syncStatus?.sync_enabled || false,
        isSyncing: syncStatus?.sync_status === 'syncing',
        lastSync: syncStatus?.last_sync_at || null,
        nextSync: null, // Calculate based on interval if needed
        totalEmails: count || 0,
        error: syncStatus?.last_error || null,
      };
    } catch (error: any) {
      console.error('[GMAIL-SERVICE] Failed to get sync status:', error);
      return {
        isActive: false,
        isSyncing: false,
        lastSync: null,
        nextSync: null,
        totalEmails: 0,
        error: error?.message || 'Unknown error',
      };
    }
  }

  /**
   * Check if historical sync has been completed
   */
  async isHistoricalSyncCompleted(): Promise<boolean> {
    try {
      const status = await this.getSyncStatus();

      // Consider historical sync complete if we have emails and last sync was successful
      return status.totalEmails > 0 && status.error === null;
    } catch (error) {
      console.error('[GMAIL-SERVICE] Failed to check historical sync:', error);
      return false;
    }
  }

  /**
   * Mark email as read/unread
   */
  async markAsRead(emailId: string, isRead: boolean): Promise<boolean> {
    try {
      const { data: { user }, error: userError } = await supabase.auth.getUser();
      if (userError || !user) {
        throw new Error('Not authenticated');
      }

      const { error } = await supabase
        .from('emails')
        .update({ is_read: isRead, updated_at: new Date().toISOString() })
        .eq('id', emailId)
        .eq('user_id', user.id);

      if (error) {
        console.error('[GMAIL-SERVICE] Failed to mark as read:', error);
        return false;
      }

      return true;
    } catch (error) {
      console.error('[GMAIL-SERVICE] Failed to mark as read:', error);
      return false;
    }
  }

  /**
   * Star/unstar email
   */
  async toggleStar(emailId: string, isStarred: boolean): Promise<boolean> {
    try {
      const { data: { user }, error: userError } = await supabase.auth.getUser();
      if (userError || !user) {
        throw new Error('Not authenticated');
      }

      const { error } = await supabase
        .from('emails')
        .update({ is_starred: isStarred, updated_at: new Date().toISOString() })
        .eq('id', emailId)
        .eq('user_id', user.id);

      if (error) {
        console.error('[GMAIL-SERVICE] Failed to toggle star:', error);
        return false;
      }

      return true;
    } catch (error) {
      console.error('[GMAIL-SERVICE] Failed to toggle star:', error);
      return false;
    }
  }

  /**
   * Archive email
   */
  async archiveEmail(emailId: string): Promise<boolean> {
    try {
      const { data: { user }, error: userError } = await supabase.auth.getUser();
      if (userError || !user) {
        throw new Error('Not authenticated');
      }

      const { error } = await supabase
        .from('emails')
        .update({ is_archived: true, updated_at: new Date().toISOString() })
        .eq('id', emailId)
        .eq('user_id', user.id);

      if (error) {
        console.error('[GMAIL-SERVICE] Failed to archive:', error);
        return false;
      }

      return true;
    } catch (error) {
      console.error('[GMAIL-SERVICE] Failed to archive:', error);
      return false;
    }
  }

  /**
   * Delete email (move to trash)
   */
  async trashEmail(emailId: string): Promise<boolean> {
    try {
      const { data: { user }, error: userError } = await supabase.auth.getUser();
      if (userError || !user) {
        throw new Error('Not authenticated');
      }

      const { error } = await supabase
        .from('emails')
        .update({ is_trash: true, updated_at: new Date().toISOString() })
        .eq('id', emailId)
        .eq('user_id', user.id);

      if (error) {
        console.error('[GMAIL-SERVICE] Failed to trash:', error);
        return false;
      }

      return true;
    } catch (error) {
      console.error('[GMAIL-SERVICE] Failed to trash:', error);
      return false;
    }
  }
}

export const gmailService = new GmailService();
