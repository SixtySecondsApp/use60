/**
 * Email Invite Service
 * Handles bulk email invitations for waitlist referrals
 */

import { supabase } from '@/lib/supabase/clientV2';

export interface EmailInvite {
  id: string;
  waitlist_entry_id: string;
  email: string;
  invite_status: 'pending' | 'sent' | 'failed' | 'converted';
  sent_at?: string;
  converted_at?: string;
  error_message?: string;
  created_at: string;
  updated_at: string;
}

export interface SendInvitesParams {
  waitlist_entry_id: string;
  emails: string[];
  referral_code: string;
  sender_name: string;
}

export interface SendInvitesResult {
  success: boolean;
  sent: number;
  failed: number;
  total: number;
  errors: string[];
  updatedEntry?: {
    total_points: number;
    effective_position: number;
    referral_count: number;
  };
}

/**
 * Validate email format
 */
function isValidEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email.trim());
}

/**
 * Create email invite via RPC function (bypasses RLS)
 */
async function createInviteViaRPC(entryId: string, email: string): Promise<{
  success: boolean;
  error?: string;
  invite_id?: string;
  entry?: {
    total_points: number;
    effective_position: number;
    referral_count: number;
  };
}> {
  try {
    const { data, error } = await supabase.rpc('create_waitlist_email_invite', {
      p_entry_id: entryId,
      p_email: email
    });

    if (error) {
      console.error('[EmailInvite] RPC error:', error);
      // If RPC doesn't exist, return special error
      if (error.message.includes('function') || error.message.includes('does not exist')) {
        return { success: false, error: 'RPC_NOT_FOUND' };
      }
      return { success: false, error: error.message };
    }

    if (data && typeof data === 'object') {
      return {
        success: data.success === true,
        error: data.error,
        invite_id: data.invite_id,
        entry: data.entry
      };
    }

    return { success: false, error: 'Invalid RPC response' };
  } catch (err) {
    console.error('[EmailInvite] Exception calling RPC:', err);
    return { success: false, error: String(err) };
  }
}

/**
 * Send bulk email invitations
 */
export async function sendBulkInvites(params: SendInvitesParams): Promise<SendInvitesResult> {
  const { waitlist_entry_id, emails, referral_code, sender_name } = params;

  // Validate inputs
  if (!waitlist_entry_id || !emails || emails.length === 0) {
    return {
      success: false,
      sent: 0,
      failed: 0,
      total: 0,
      errors: ['Invalid parameters: waitlist_entry_id and emails are required']
    };
  }

  // Filter and validate emails
  const validEmails = emails.filter(email => isValidEmail(email));
  const invalidEmails = emails.filter(email => !isValidEmail(email));

  if (validEmails.length === 0) {
    return {
      success: false,
      sent: 0,
      failed: emails.length,
      total: emails.length,
      errors: ['No valid email addresses provided']
    };
  }

  const errors: string[] = [];
  let sentCount = 0;
  let failedCount = invalidEmails.length;
  let lastUpdatedEntry: SendInvitesResult['updatedEntry'] = undefined;

  // Add invalid emails to errors
  if (invalidEmails.length > 0) {
    errors.push(`Invalid email format: ${invalidEmails.join(', ')}`);
  }

  // Try RPC first for each email (handles duplicates internally)
  for (const email of validEmails) {
    const rpcResult = await createInviteViaRPC(waitlist_entry_id, email.trim().toLowerCase());

    if (rpcResult.success) {
      sentCount++;
      if (rpcResult.entry) {
        lastUpdatedEntry = rpcResult.entry;
      }
      console.log(`[EmailInvite] Successfully invited: ${email}`);
    } else if (rpcResult.error === 'RPC_NOT_FOUND') {
      // RPC not available, fall back to direct insert
      console.warn('[EmailInvite] RPC not found, falling back to direct insert');
      return await sendBulkInvitesFallback(params);
    } else {
      failedCount++;
      if (rpcResult.error) {
        errors.push(`${email}: ${rpcResult.error}`);
      }
    }
  }

  // If we got here via RPC, return the results
  if (sentCount > 0) {
    return {
      success: true,
      sent: sentCount,
      failed: failedCount,
      total: emails.length,
      errors,
      updatedEntry: lastUpdatedEntry
    };
  }

  return {
    success: false,
    sent: 0,
    failed: failedCount,
    total: emails.length,
    errors
  };
}

/**
 * Fallback method using direct insert (may fail due to RLS)
 */
async function sendBulkInvitesFallback(params: SendInvitesParams): Promise<SendInvitesResult> {
  const { waitlist_entry_id, emails, referral_code, sender_name } = params;

  const validEmails = emails.filter(email => isValidEmail(email));
  const invalidEmails = emails.filter(email => !isValidEmail(email));
  const errors: string[] = [];
  let sentCount = 0;
  let failedCount = invalidEmails.length;

  if (invalidEmails.length > 0) {
    errors.push(`Invalid email format: ${invalidEmails.join(', ')}`);
  }

  // Check for existing invites
  const { data: existingInvites } = await supabase
    .from('waitlist_email_invites')
    .select('email')
    .eq('waitlist_entry_id', waitlist_entry_id)
    .in('email', validEmails.map(e => e.toLowerCase()));

  const existingEmails = new Set(existingInvites?.map(invite => invite.email) || []);
  const newEmails = validEmails.filter(email => !existingEmails.has(email.toLowerCase()));
  const duplicateEmails = validEmails.filter(email => existingEmails.has(email.toLowerCase()));

  if (duplicateEmails.length > 0) {
    errors.push(`Already invited: ${duplicateEmails.join(', ')}`);
    failedCount += duplicateEmails.length;
  }

  if (newEmails.length === 0) {
    return {
      success: false,
      sent: 0,
      failed: failedCount,
      total: emails.length,
      errors
    };
  }

  // Create invite records
  const inviteRecords = newEmails.map(email => ({
    waitlist_entry_id,
    email: email.trim().toLowerCase(),
    invite_status: 'pending' as const
  }));

  const { data: insertedInvites, error: insertError } = await supabase
    .from('waitlist_email_invites')
    .insert(inviteRecords)
    .select();

  if (insertError) {
    console.error('Failed to create invite records:', insertError);
    return {
      success: false,
      sent: 0,
      failed: emails.length,
      total: emails.length,
      errors: [...errors, `Database error: ${insertError.message}`]
    };
  }

  sentCount = newEmails.length;

  // Generate referral URL
  const referralUrl = `${window.location.origin}/product/meetings/waitlist?ref=${referral_code}`;

  // Send emails via Edge Function (or mark as pending if not configured)
  try {
    // Check if RESEND_API_KEY is configured by attempting to invoke the function
    const edgeFunctionSecret = import.meta.env.VITE_EDGE_FUNCTION_SECRET || '';
    const { data: edgeFunctionData, error: edgeFunctionError } = await supabase.functions.invoke('send-waitlist-invite', {
      body: {
        invites: insertedInvites?.map(invite => ({
          id: invite.id,
          email: invite.email
        })),
        referral_url: referralUrl,
        sender_name: sender_name
      },
      headers: edgeFunctionSecret
        ? { 'Authorization': `Bearer ${edgeFunctionSecret}` }
        : {},
    });

    // If Edge Function fails due to missing API key, still mark as "sent" for tracking purposes
    if (edgeFunctionError && edgeFunctionError.message.includes('API key is invalid')) {
      console.warn('Email sending not configured (missing RESEND_API_KEY). Recording invites for tracking only.');

      // Mark all as "sent" (tracked but not actually emailed)
      await supabase
        .from('waitlist_email_invites')
        .update({
          invite_status: 'sent',
          sent_at: new Date().toISOString(),
          error_message: 'Email sending not configured - invite tracked only'
        })
        .in('id', insertedInvites?.map(i => i.id) || []);

      sentCount = newEmails.length;

      // Add info message
      errors.push('Note: Email sending is not configured. Invites have been recorded and points awarded.');
    } else if (edgeFunctionError) {
      console.error('Edge function error:', edgeFunctionError);

      // Mark all as failed
      await supabase
        .from('waitlist_email_invites')
        .update({
          invite_status: 'failed',
          error_message: edgeFunctionError.message
        })
        .in('id', insertedInvites?.map(i => i.id) || []);

      return {
        success: false,
        sent: 0,
        failed: emails.length,
        total: emails.length,
        errors: [...errors, `Failed to send emails: ${edgeFunctionError.message}`]
      };
    } else {
      // Process results from Edge Function
      const results = edgeFunctionData?.results || [];
      const successfulIds = results.filter((r: any) => r.success).map((r: any) => r.invite_id);
      const failedResults = results.filter((r: any) => !r.success);

      // Update successful invites
      if (successfulIds.length > 0) {
        await supabase
          .from('waitlist_email_invites')
          .update({
            invite_status: 'sent',
            sent_at: new Date().toISOString()
          })
          .in('id', successfulIds);

        sentCount = successfulIds.length;
      }

      // Update failed invites
      for (const failedResult of failedResults) {
        // Check if this is an API key error - treat as graceful degradation
        const isApiKeyError = failedResult.error && failedResult.error.includes('API key is invalid');

        if (isApiKeyError) {
          // Mark as sent for tracking even without actual email
          await supabase
            .from('waitlist_email_invites')
            .update({
              invite_status: 'sent',
              sent_at: new Date().toISOString(),
              error_message: 'Email sending not configured - invite tracked only'
            })
            .eq('id', failedResult.invite_id);

          sentCount++;
        } else {
          // Real failure - mark as failed
          await supabase
            .from('waitlist_email_invites')
            .update({
              invite_status: 'failed',
              error_message: failedResult.error
            })
            .eq('id', failedResult.invite_id);

          failedCount++;
          errors.push(`${failedResult.email}: ${failedResult.error}`);
        }
      }

      // Add info message if any were handled as API key errors
      if (sentCount > 0 && failedResults.some((r: any) => r.error && r.error.includes('API key is invalid'))) {
        errors.push('Note: Email sending is not configured. Invites have been recorded and points awarded.');
      }
    }

    // Track analytics
    if (typeof window !== 'undefined' && (window as any).analytics) {
      (window as any).analytics.track('Waitlist Email Invites Sent', {
        entry_id: waitlist_entry_id,
        total_emails: emails.length,
        sent_count: sentCount,
        failed_count: failedCount
      });
    }

    return {
      success: sentCount > 0,
      sent: sentCount,
      failed: failedCount,
      total: emails.length,
      errors
    };

  } catch (err) {
    console.error('Send invites error:', err);

    // Mark all as failed
    if (insertedInvites) {
      await supabase
        .from('waitlist_email_invites')
        .update({
          invite_status: 'failed',
          error_message: err instanceof Error ? err.message : 'Unknown error'
        })
        .in('id', insertedInvites.map(i => i.id));
    }

    return {
      success: false,
      sent: 0,
      failed: emails.length,
      total: emails.length,
      errors: [...errors, err instanceof Error ? err.message : 'Unknown error occurred']
    };
  }
}

/**
 * Get invite history for a waitlist entry
 */
export async function getInviteHistory(entryId: string): Promise<EmailInvite[]> {
  try {
    const { data, error } = await supabase
      .from('waitlist_email_invites')
      .select('*')
      .eq('waitlist_entry_id', entryId)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Failed to get invite history:', error);
      return [];
    }

    return data || [];
  } catch (err) {
    console.error('Get invite history error:', err);
    return [];
  }
}

/**
 * Get invite statistics for a waitlist entry
 */
export async function getInviteStats(entryId: string) {
  try {
    const { data, error } = await supabase
      .from('waitlist_email_invites')
      .select('invite_status')
      .eq('waitlist_entry_id', entryId);

    if (error) {
      console.error('Failed to get invite stats:', error);
      return { total: 0, sent: 0, pending: 0, failed: 0, converted: 0 };
    }

    const stats = {
      total: data.length,
      sent: data.filter(i => i.invite_status === 'sent').length,
      pending: data.filter(i => i.invite_status === 'pending').length,
      failed: data.filter(i => i.invite_status === 'failed').length,
      converted: data.filter(i => i.invite_status === 'converted').length
    };

    return stats;
  } catch (err) {
    console.error('Get invite stats error:', err);
    return { total: 0, sent: 0, pending: 0, failed: 0, converted: 0 };
  }
}
