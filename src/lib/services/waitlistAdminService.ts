/**
 * Waitlist Admin Service
 * Handles administrative operations for waitlist management
 */

import { supabase } from '@/lib/supabase/clientV2';
import type { WaitlistEntry, WaitlistFilters } from '@/lib/types/waitlist';

export interface BulkGrantAccessParams {
  entryIds: string[];
  adminUserId: string;
  emailTemplateId?: string;
  adminNotes?: string;
}

export interface BulkGrantAccessResult {
  success: boolean;
  granted: number;
  failed: number;
  total: number;
  errors: Array<{ entryId: string; email: string; error: string }>;
  magicLinks?: Array<{ entryId: string; email: string; magicLink: string }>;
}

export interface AdminAction {
  id: string;
  waitlist_entry_id: string;
  admin_user_id: string;
  action_type: 'grant_access' | 'adjust_position' | 'send_email' | 'export_data' | 'status_change' | 'notes_update';
  action_details?: Record<string, any>;
  previous_value?: Record<string, any>;
  new_value?: Record<string, any>;
  notes?: string;
  created_at: string;
}

export interface ReferralTreeNode {
  id: string;
  email: string;
  full_name: string;
  effective_position: number;
  referral_count: number;
  created_at: string;
  children: ReferralTreeNode[];
}

export interface WaitlistStats {
  total_signups: number;
  pending_count: number;
  released_count: number;
  total_referrals: number;
  avg_referrals: number;
  signups_last_7_days: number;
  signups_last_30_days: number;
  top_tier_count: number;
}

/**
 * Send waitlist invitation (works for both initial send and resend)
 * Generates magic link and sends email - no RPC dependency
 */
export async function grantAccess(
  entryId: string,
  adminUserId: string,
  notes?: string
): Promise<{ success: boolean; error?: string }> {
  try {
    // 1. Get entry details
    const { data: entry, error: fetchError } = await (supabase
      .from('meetings_waitlist' as any)
      .select('id, email, full_name, status')
      .eq('id', entryId)
      .single() as any) as {
      data: { id: string; email: string; full_name: string | null; status: string } | null;
      error: any
    };

    if (fetchError || !entry) {
      return { success: false, error: 'Entry not found' };
    }

    // 2. Generate custom waitlist token (not a Supabase magic link)
    // This token will be used in a custom signup flow where the account is only created
    // after the user sets their password, not upon link click
    let invitationUrl: string;

    try {
      const edgeFunctionSecret = import.meta.env.VITE_EDGE_FUNCTION_SECRET || '';
      const { data: tokenData, error: tokenError } = await supabase.functions.invoke('generate-waitlist-token', {
        body: {
          email: entry.email,
          waitlist_entry_id: entryId,
        },
        headers: edgeFunctionSecret
          ? { 'Authorization': `Bearer ${edgeFunctionSecret}` }
          : {},
      });

      if (tokenError) {
        console.error('Failed to generate waitlist token:', tokenError);
        return { success: false, error: tokenError.message || 'Failed to generate invitation token' };
      }

      if (!tokenData?.success) {
        console.error('Token generation failed:', tokenData?.error);
        return { success: false, error: tokenData?.error || 'Failed to generate invitation token' };
      }

      if (!tokenData?.token) {
        return { success: false, error: 'Failed to generate invitation token' };
      }

      // Build the custom invitation URL with token and waitlist_entry params
      // Use current environment (localhost, staging, or production)
      const origin = typeof window !== 'undefined' ? window.location.origin : 'https://app.use60.com';
      invitationUrl = `${origin}/auth/set-password?token=${tokenData.token}&waitlist_entry=${entryId}`;
    } catch (tokenGenError: any) {
      console.error('Error generating waitlist token:', tokenGenError);
      return { success: false, error: tokenGenError.message || 'Failed to generate invitation token' };
    }

    // 3. Send email via encharge-send-email
    const firstName = entry.full_name?.split(' ')[0] || entry.email.split('@')[0];
    try {
      const edgeFunctionSecret = import.meta.env.VITE_EDGE_FUNCTION_SECRET || '';
      const emailResponse = await supabase.functions.invoke('encharge-send-email', {
        body: {
          template_type: 'waitlist_invite',
          to_email: entry.email,
          to_name: firstName,
          variables: {
            recipient_name: firstName,
            action_url: invitationUrl,
          },
        },
        headers: edgeFunctionSecret
          ? { 'Authorization': `Bearer ${edgeFunctionSecret}` }
          : {},
      });

      if (emailResponse.error) {
        console.error('Failed to send email:', emailResponse.error);
        return { success: false, error: emailResponse.error.message || 'Failed to send email' };
      }

      if (!emailResponse.data?.success) {
        return { success: false, error: emailResponse.data?.error || 'Email sending failed' };
      }

      // 4. Update status to 'released' if currently pending
      if (entry.status === 'pending') {
        try {
          await supabase
            .from('meetings_waitlist')
            .update({ status: 'released', granted_access_at: new Date().toISOString(), granted_by: adminUserId })
            .eq('id', entryId);
        } catch (updateError) {
          console.warn('Failed to update status, but email was sent:', updateError);
          // Don't fail - email was already sent successfully
        }
      }

      return { success: true };
    } catch (emailError) {
      console.error('Failed to send email:', emailError);
      return { success: false, error: 'Failed to send invitation email' };
    }
  } catch (err) {
    console.error('Grant access error:', err);
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Unknown error'
    };
  }
}

/**
 * Bulk grant access to multiple waitlist entries (max 50 at once)
 * Generates magic links and queues invitation emails
 */
export async function bulkGrantAccess(
  params: BulkGrantAccessParams
): Promise<BulkGrantAccessResult> {
  const { entryIds, adminUserId, emailTemplateId, adminNotes } = params;

  // Validate input
  if (!entryIds || entryIds.length === 0) {
    return {
      success: false,
      granted: 0,
      failed: 0,
      total: 0,
      errors: [{ entryId: '', email: '', error: 'No entries provided' }],
    };
  }

  if (entryIds.length > 50) {
    return {
      success: false,
      granted: 0,
      failed: 0,
      total: entryIds.length,
      errors: [{ entryId: '', email: '', error: 'Cannot grant access to more than 50 users at once' }],
    };
  }

  try {
    // Call the PostgreSQL function for bulk access granting
    const { data: result, error: bulkError } = await (supabase.rpc('bulk_grant_waitlist_access' as any, {
      p_entry_ids: entryIds,
      p_admin_user_id: adminUserId,
      p_admin_notes: adminNotes || null,
    }) as any) as { data: { granted: number; failed: number; errors: string } | null; error: any };

    if (bulkError) {
      console.error('Bulk grant access error:', bulkError);
      return {
        success: false,
        granted: 0,
        failed: entryIds.length,
        total: entryIds.length,
        errors: [{ entryId: '', email: '', error: bulkError.message }],
      };
    }

    // Parse the result
    const granted = result?.granted || 0;
    const failed = result?.failed || 0;
    const errors = result?.errors ? JSON.parse(result.errors) : [];

    // Fetch updated entries for magic link generation
    const { data: entries, error: fetchError } = await (supabase
      .from('meetings_waitlist' as any)
      .select('id, email, full_name, referral_code, company_name')
      .in('id', entryIds.filter((id: string) => !errors.find((e: any) => e.entry_id === id))) as any) as { 
      data: Array<{ id: string; email: string; full_name: string | null; referral_code: string; company_name: string }> | null; 
      error: any 
    };

    if (fetchError) {
      console.error('Failed to fetch entries after grant:', fetchError);
    }

    // Generate magic links for successfully granted entries
    const magicLinks: Array<{ entryId: string; email: string; magicLink: string }> = [];

    if (entries && entries.length > 0) {
      for (const entry of entries) {
        try {
          // Generate custom waitlist token (not a Supabase magic link)
          const { data: tokenData, error: tokenError } = await supabase.functions.invoke('generate-waitlist-token', {
            body: {
              email: entry.email,
              waitlist_entry_id: entry.id,
            },
          });

          if (tokenError) {
            // If function doesn't exist, log and skip this entry
            if (tokenError.message?.includes('Failed to send a request') || tokenError.message?.includes('fetch')) {
              console.error('Edge Function not deployed. Please deploy generate-waitlist-token function.');
              continue;
            }
            console.error(`Failed to generate token for ${entry.email}:`, tokenError);
            continue;
          }

          if (!tokenData?.success) {
            console.error(`Token generation failed for ${entry.email}:`, tokenData?.error);
            continue;
          }

          if (!tokenData?.token) {
            continue;
          }

          // Build the custom invitation URL
          // Use current environment (localhost, staging, or production)
          const origin = typeof window !== 'undefined' ? window.location.origin : 'https://app.use60.com';
          const invitationUrl = `${origin}/auth/set-password?token=${tokenData.token}&waitlist_entry=${entry.id}`;

          if (invitationUrl) {
            magicLinks.push({
              entryId: entry.id,
              email: entry.email,
              magicLink: invitationUrl,
            });
          }
        } catch (tokenError) {
          console.error(`Error generating token for ${entry.email}:`, tokenError);
        }
      }

      // Send invitation emails via Edge Function
      if (magicLinks.length > 0) {
        try {
          // Get admin details for email (optional - profiles table may not exist)
          let adminName = 'Admin';
          try {
            const { data: adminProfile } = await supabase
              .from('profiles')
              .select('first_name, last_name')
              .eq('id', adminUserId)
              .single();
            if (adminProfile) {
              adminName = [adminProfile.first_name, adminProfile.last_name].filter(Boolean).join(' ') || 'Admin';
            }
          } catch {
            // Profiles table may not exist, use default
          }

          // Send emails via encharge-send-email using our custom template
          const edgeFunctionSecret = import.meta.env.VITE_EDGE_FUNCTION_SECRET || '';
          const emailPromises = magicLinks.map(async (link) => {
            const entry = entries.find((e: any) => e.id === link.entryId);
            if (!entry) return;

            const firstName = entry.full_name?.split(' ')[0] || entry.email.split('@')[0];

            return supabase.functions.invoke('encharge-send-email', {
              body: {
                template_type: 'waitlist_welcome',
                to_email: entry.email,
                to_name: firstName,
                variables: {
                  recipient_name: firstName,
                  action_url: link.magicLink,
                  user_email: entry.email,
                },
              },
              headers: edgeFunctionSecret
                ? { 'Authorization': `Bearer ${edgeFunctionSecret}` }
                : {},
            });
          });

          await Promise.all(emailPromises);
        } catch (emailError) {
          console.error('Error sending invitation emails:', emailError);
        }
      }
    }

    return {
      success: granted > 0,
      granted,
      failed,
      total: entryIds.length,
      errors,
      magicLinks,
    };
  } catch (error: any) {
    console.error('Bulk grant access error:', error);
    return {
      success: false,
      granted: 0,
      failed: entryIds.length,
      total: entryIds.length,
      errors: [{ entryId: '', email: '', error: error.message || 'Unknown error' }],
    };
  }
}

/**
 * Resend magic link for a waitlist entry
 * Now uses the same unified approach as grantAccess
 */
export async function resendMagicLink(
  entryId: string,
  adminUserId: string
): Promise<{ success: boolean; error?: string; magicLink?: string }> {
  // Just use grantAccess - works for both initial send and resend
  const result = await grantAccess(entryId, adminUserId);
  return {
    success: result.success,
    error: result.error,
    magicLink: undefined // Not needed, email is already sent
  };
}

/**
 * Adjust the position of a waitlist entry
 */
export async function adjustPosition(
  entryId: string,
  newPosition: number,
  adminUserId: string,
  reason?: string
): Promise<{ success: boolean; error?: string; oldPosition?: number }> {
  try {
    // Get current position
    const { data: entry, error: fetchError } = await (supabase
      .from('meetings_waitlist' as any)
      .select('effective_position')
      .eq('id', entryId)
      .single() as any) as { 
      data: { effective_position: number | null } | null; 
      error: any 
    };

    if (fetchError || !entry) {
      console.error('Failed to fetch entry:', fetchError);
      return { success: false, error: 'Entry not found' };
    }

    const oldPosition = entry.effective_position || 0;

    // Update position
    const { error: updateError } = await (supabase
      .from('meetings_waitlist' as any)
      .update({
        effective_position: newPosition
      })
      .eq('id', entryId) as any);

    if (updateError) {
      console.error('Failed to adjust position:', updateError);
      return { success: false, error: updateError.message };
    }

    // Log the admin action (optional - table may not exist)
    try {
      await (supabase
        .from('waitlist_admin_actions' as any)
        .insert({
          waitlist_entry_id: entryId,
          admin_user_id: adminUserId,
          action_type: 'adjust_position',
          notes: reason,
          previous_value: { position: oldPosition },
          new_value: { position: newPosition }
        }) as any);
    } catch {
      // Admin actions table may not exist, continue without logging
    }

    return { success: true, oldPosition };
  } catch (err) {
    console.error('Adjust position error:', err);
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Unknown error'
    };
  }
}

/**
 * Get referral tree for a waitlist entry
 */
export async function getReferralTree(entryId: string): Promise<ReferralTreeNode | null> {
  try {
    // Get the root entry
    const { data: rootEntry, error: rootError } = await (supabase
      .from('meetings_waitlist' as any)
      .select('id, email, full_name, effective_position, referral_count, referral_code, created_at')
      .eq('id', entryId)
      .single() as any) as { 
      data: { 
        id: string; 
        email: string; 
        full_name: string; 
        effective_position: number | null; 
        referral_count: number | null; 
        referral_code: string; 
        created_at: string 
      } | null; 
      error: any 
    };

    if (rootError || !rootEntry) {
      console.error('Failed to fetch root entry:', rootError);
      return null;
    }

    // Recursive function to build tree
    async function buildTree(referralCode: string): Promise<ReferralTreeNode[]> {
      const { data: children, error } = await (supabase
        .from('meetings_waitlist' as any)
        .select('id, email, full_name, effective_position, referral_count, referral_code, created_at')
        .eq('referred_by_code', referralCode)
        .order('created_at', { ascending: true }) as any) as { 
        data: Array<{ 
          id: string; 
          email: string; 
          full_name: string; 
          effective_position: number | null; 
          referral_count: number | null; 
          referral_code: string; 
          created_at: string 
        }> | null; 
        error: any 
      };

      if (error || !children) {
        return [];
      }

      const nodes: ReferralTreeNode[] = [];
      for (const child of children) {
        const grandchildren = await buildTree(child.referral_code);
        nodes.push({
          id: child.id,
          email: child.email,
          full_name: child.full_name,
          effective_position: child.effective_position || 0,
          referral_count: child.referral_count,
          created_at: child.created_at,
          children: grandchildren
        });
      }

      return nodes;
    }

    const children = await buildTree(rootEntry.referral_code);

    return {
      id: rootEntry.id,
      email: rootEntry.email,
      full_name: rootEntry.full_name,
      effective_position: rootEntry.effective_position || 0,
      referral_count: rootEntry.referral_count,
      created_at: rootEntry.created_at,
      children
    };
  } catch (err) {
    console.error('Get referral tree error:', err);
    return null;
  }
}

/**
 * Send custom email to waitlist entry
 */
export async function sendCustomEmail(
  entryId: string,
  adminUserId: string,
  subject: string,
  message: string
): Promise<{ success: boolean; error?: string }> {
  try {
    // Get entry email
    const { data: entry, error: fetchError } = await (supabase
      .from('meetings_waitlist' as any)
      .select('email, full_name')
      .eq('id', entryId)
      .single() as any) as { 
      data: { email: string; full_name: string | null } | null; 
      error: any 
    };

    if (fetchError || !entry) {
      return { success: false, error: 'Entry not found' };
    }

    // Call Edge Function to send email (you'll need to create this)
    const { error: sendError } = await supabase.functions.invoke('send-custom-waitlist-email', {
      body: {
        to: entry.email,
        to_name: entry.full_name,
        subject: subject,
        message: message
      }
    });

    if (sendError) {
      console.error('Failed to send email:', sendError);
      return { success: false, error: sendError.message };
    }

    // Log the admin action (optional - table may not exist)
    try {
      await (supabase
        .from('waitlist_admin_actions' as any)
        .insert({
          waitlist_entry_id: entryId,
          admin_user_id: adminUserId,
          action_type: 'send_email',
          action_details: {
            subject: subject,
            sent_to: entry.email
          }
        }) as any);
    } catch {
      // Admin actions table may not exist, continue without logging
    }

    return { success: true };
  } catch (err) {
    console.error('Send custom email error:', err);
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Unknown error'
    };
  }
}

/**
 * Export waitlist data to CSV
 */
export async function exportToCSV(filters?: WaitlistFilters): Promise<{ success: boolean; data?: string; error?: string }> {
  try {
    let query = (supabase
      .from('meetings_waitlist' as any)
      .select('*')
      .order('signup_position', { ascending: true }) as any) as any;

    // Apply filters
    if (filters?.status && filters.status !== 'all') {
      query = query.eq('status', filters.status);
    }

    if (filters?.date_from) {
      query = query.gte('created_at', filters.date_from);
    }

    if (filters?.date_to) {
      query = query.lte('created_at', filters.date_to);
    }

    if (filters?.search) {
      query = query.or(`email.ilike.%${filters.search}%,full_name.ilike.%${filters.search}%,company_name.ilike.%${filters.search}%`);
    }

    const { data: entries, error } = await query as { 
      data: Array<{
        email: string;
        full_name: string;
        company_name: string;
        signup_position: number | null;
        effective_position: number | null;
        referral_count: number | null;
        referral_code: string;
        referred_by_code: string | null;
        status: string;
        created_at: string;
        linkedin_share_claimed: boolean | null;
        admin_notes: string | null;
      }> | null; 
      error: any 
    };

    if (error) {
      console.error('Failed to fetch entries:', error);
      return { success: false, error: error.message };
    }

    if (!entries || entries.length === 0) {
      return { success: false, error: 'No entries found' };
    }

    // Convert to CSV
    const headers = [
      'Email',
      'Full Name',
      'Company',
      'Signup Position',
      'Effective Position',
      'Referral Count',
      'Referral Code',
      'Referred By',
      'Status',
      'Created At',
      'LinkedIn Boost',
      'Admin Notes'
    ];

    const rows = entries.map(entry => [
      entry.email,
      entry.full_name,
      entry.company_name || '',
      entry.signup_position || '',
      entry.effective_position || '',
      entry.referral_count || 0,
      entry.referral_code || '',
      entry.referred_by_code || '',
      entry.status,
      new Date(entry.created_at).toISOString(),
      entry.linkedin_share_claimed ? 'Yes' : 'No',
      entry.admin_notes || ''
    ]);

    const csvContent = [
      headers.join(','),
      ...rows.map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(','))
    ].join('\n');

    return { success: true, data: csvContent };
  } catch (err) {
    console.error('Export to CSV error:', err);
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Unknown error'
    };
  }
}

/**
 * Get waitlist statistics
 */
export async function getWaitlistStats(): Promise<WaitlistStats | null> {
  try {
    // Get all entries count and status breakdown
    const { data: allEntries, error: allError } = await (supabase
      .from('meetings_waitlist' as any)
      .select('status, referral_count, created_at, effective_position') as any) as { 
      data: Array<{ 
        status: string; 
        referral_count: number | null; 
        created_at: string; 
        effective_position: number | null 
      }> | null; 
      error: any 
    };

    if (allError || !allEntries) {
      console.error('Failed to fetch stats:', allError);
      return null;
    }

    const now = new Date();
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    const stats: WaitlistStats = {
      total_signups: allEntries.length,
      pending_count: allEntries.filter(e => e.status === 'pending').length,
      released_count: allEntries.filter(e => e.status === 'released').length,
      total_referrals: allEntries.reduce((sum, e) => sum + (e.referral_count || 0), 0),
      avg_referrals: allEntries.length > 0
        ? allEntries.reduce((sum, e) => sum + (e.referral_count || 0), 0) / allEntries.length
        : 0,
      signups_last_7_days: allEntries.filter(e => new Date(e.created_at) >= sevenDaysAgo).length,
      signups_last_30_days: allEntries.filter(e => new Date(e.created_at) >= thirtyDaysAgo).length,
      top_tier_count: allEntries.filter(e => (e.effective_position || 999) <= 50).length
    };

    return stats;
  } catch (err) {
    console.error('Get waitlist stats error:', err);
    return null;
  }
}

/**
 * Get admin action history
 * Returns empty array if table doesn't exist
 */
export async function getAdminActions(
  entryId?: string,
  limit: number = 50
): Promise<AdminAction[]> {
  try {
    let query = (supabase
      .from('waitlist_admin_actions' as any)
      .select('*')
      .order('created_at', { ascending: false })
      .limit(limit) as any) as any;

    if (entryId) {
      query = query.eq('waitlist_entry_id', entryId);
    }

    const { data, error } = await query as { 
      data: AdminAction[] | null; 
      error: any 
    };

    if (error) {
      // Table may not exist, return empty array
      return [];
    }

    return data || [];
  } catch (err) {
    // Table may not exist, return empty array
    return [];
  }
}

/**
 * Update admin notes for an entry
 */
export async function updateAdminNotes(
  entryId: string,
  adminUserId: string,
  notes: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const { error: updateError } = await (supabase
      .from('meetings_waitlist' as any)
      .update({ admin_notes: notes })
      .eq('id', entryId) as any);

    if (updateError) {
      console.error('Failed to update notes:', updateError);
      return { success: false, error: updateError.message };
    }

    return { success: true };
  } catch (err) {
    console.error('Update admin notes error:', err);
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Unknown error'
    };
  }
}
