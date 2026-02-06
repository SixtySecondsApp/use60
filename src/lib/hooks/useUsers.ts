import { useState, useEffect } from 'react';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabase/clientV2';
import { setImpersonationData } from '@/lib/utils/impersonationUtils';
import { getSiteUrl } from '@/lib/utils/siteUrl';
import { useAuth } from '@/lib/contexts/AuthContext';
import logger from '@/lib/utils/logger';

// Uses React Query cached auth to avoid duplicate getUser() calls

export interface Target {
  id?: string;
  user_id?: string;
  revenue_target: number | null;
  outbound_target: number | null;
  meetings_target: number | null;
  proposal_target: number | null;
  start_date: string | null;
  end_date: string | null;
  created_at?: string;
  updated_at?: string;
}

export interface User {
  id: string;
  email: string;
  first_name: string | null;
  last_name: string | null;
  stage: string;
  avatar_url: string | null;
  is_admin: boolean;
  is_internal: boolean;
  created_at: string;
  last_sign_in_at: string | null;
  targets: Target[];
  full_name?: string | null;
}

export function useUsers() {
  const [users, setUsers] = useState<User[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  // Use cached auth context
  const { userId, userEmail } = useAuth();

  useEffect(() => {
    if (userId) {
      fetchUsers();
    }
  }, [userId]);

  const fetchUsers = async () => {
    try {
      setIsLoading(true);

      if (!userId) {
        logger.log('No authenticated user');
        setUsers([]);
        return;
      }

      // Skip RPC function as it doesn't exist in this database
      logger.log('Using direct profiles query method');

      // Fallback: Query profiles and get auth info via edge function
      // Explicitly select columns to avoid RLS issues with select('*')
      // Note: profiles table has first_name and last_name, NOT full_name
      const { data: profiles, error } = await supabase
        .from('profiles')
        .select('id, email, first_name, last_name, stage, avatar_url, is_admin, created_at, updated_at')
        .order('created_at', { ascending: false });

      if (error) {
        throw error;
      }

      // Fetch internal users status
      const { data: internalUsers, error: internalUsersError } = await supabase
        .from('internal_users')
        .select('email, is_active')
        .eq('is_active', true);

      if (internalUsersError) {
        logger.warn('Failed to fetch internal users:', internalUsersError);
      }

      // Create a Set of internal user emails for quick lookup
      const internalEmails = new Set(
        (internalUsers || [])
          .filter(iu => iu.is_active)
          .map(iu => iu.email.toLowerCase())
      );

      // Fetch targets for all users
      const { data: allTargets, error: targetsError } = await supabase
        .from('targets')
        .select('*')
        .in('user_id', (profiles || []).map(p => p.id));

      if (targetsError) {
        logger.warn('Failed to fetch targets:', targetsError);
      }

      // Create a map of user_id -> targets array
      const targetsMap = new Map<string, Target[]>();
      (allTargets || []).forEach((target: any) => {
        if (target.user_id) {
          if (!targetsMap.has(target.user_id)) {
            targetsMap.set(target.user_id, []);
          }
          targetsMap.get(target.user_id)!.push({
            id: target.id,
            user_id: target.user_id,
            revenue_target: target.revenue_target,
            outbound_target: target.outbound_target,
            meetings_target: target.meetings_target,
            proposal_target: target.proposal_target,
            start_date: target.start_date,
            end_date: target.end_date,
            created_at: target.created_at,
            updated_at: target.updated_at
          });
        }
      });

      // Transform data to match expected User interface
      // Filter out deleted users (those with email like deleted_*@deleted.local)
      const usersData = (profiles || [])
        .filter(profile => !profile.email?.startsWith('deleted_'))
        .map((profile) => {
          const email = profile.email || `user_${profile.id.slice(0, 8)}@private.local`;
          return {
            id: profile.id,
            email,
            first_name: profile.first_name || null,
            last_name: profile.last_name || null,
            stage: profile.stage || 'Trainee', // Use actual stage from profile
            avatar_url: profile.avatar_url,
            is_admin: profile.is_admin || false,
            is_internal: internalEmails.has(email.toLowerCase()),
            created_at: profile.created_at || profile.updated_at || new Date().toISOString(),
            last_sign_in_at: null,
            targets: targetsMap.get(profile.id) || [],
            full_name: profile.first_name && profile.last_name
              ? `${profile.first_name} ${profile.last_name}`
              : null
          };
        });

      setUsers(usersData);
    } catch (error: any) {
      logger.error('Error fetching users:', error);
      if (error.message?.includes('auth.users')) {
        // If auth.users is not accessible, show a more specific message
        toast.error('User management requires additional permissions. Please contact your administrator.');
      } else {
        toast.error('Failed to load users: ' + error.message);
      }
      setUsers([]);
    } finally {
      setIsLoading(false);
    }
  };

  const updateUser = async ({ userId: targetUserId, updates }: { userId: string; updates: Partial<User> }) => {
    if (!targetUserId) {
      toast.error("Cannot update user: User ID missing.");
      return;
    }

    try {
      // Use cached userId to check if they're trying to remove their own admin status

      // Extract targets, is_internal, and profile updates
      const { targets, is_internal, ...profileUpdates } = updates;

      // Get user email for internal_users table operations
      const user = users.find(u => u.id === targetUserId);
      if (!user) {
        throw new Error('User not found');
      }

      // Handle targets update if provided
      if (targets !== undefined && Array.isArray(targets)) {
        // Delete existing targets for this user
        const { error: deleteError } = await supabase
          .from('targets')
          .delete()
          .eq('user_id', targetUserId);

        if (deleteError) {
          logger.warn('Error deleting old targets:', deleteError);
          // Continue anyway - might be first time setting targets
        }

        // Insert new targets (filter out temporary IDs like 'new_xxx')
        const targetsToInsert = targets
          .filter(t => t && (t.id === undefined || !t.id.toString().startsWith('new_')))
          .map(t => ({
            user_id: targetUserId,
            revenue_target: t.revenue_target,
            outbound_target: t.outbound_target,
            meetings_target: t.meetings_target,
            proposal_target: t.proposal_target,
            start_date: t.start_date,
            end_date: t.end_date,
            ...(t.id && !t.id.toString().startsWith('new_') ? { id: t.id } : {})
          }));

        if (targetsToInsert.length > 0) {
          const { error: insertError } = await supabase
            .from('targets')
            .insert(targetsToInsert);

          if (insertError) {
            throw insertError;
          }
        }
      }

      // Safety check: Prevent users from removing their own admin status
      if (userId && userId === targetUserId && 'is_admin' in profileUpdates) {
        if (profileUpdates.is_admin === false && user.is_admin === true) {
          toast.error('You cannot remove your own admin status. Ask another admin to do this.');
          return;
        }
      }

      // Handle internal user status change
      if (typeof is_internal === 'boolean' && user.email) {
        if (is_internal) {
          // Add to internal_users table
          const { error: insertError } = await supabase
            .from('internal_users')
            .upsert({
              email: user.email.toLowerCase(),
              name: user.first_name && user.last_name
                ? `${user.first_name} ${user.last_name}`.trim()
                : user.email,
              is_active: true,
              updated_at: new Date().toISOString()
            }, {
              onConflict: 'email',
              ignoreDuplicates: false
            });

          if (insertError) {
            throw insertError;
          }
        } else {
          // Remove from internal_users table (set is_active = false)
          const { error: updateError } = await supabase
            .from('internal_users')
            .update({ is_active: false, updated_at: new Date().toISOString() })
            .eq('email', user.email.toLowerCase());

          if (updateError) {
            throw updateError;
          }
        }
      }

      // Update profile
      if (Object.keys(profileUpdates).length > 0) {
        // Only update allowed profile fields
        const allowedUpdates: Record<string, any> = {};
        if ('first_name' in profileUpdates) {
          allowedUpdates.first_name = profileUpdates.first_name;
        }
        if ('last_name' in profileUpdates) {
          allowedUpdates.last_name = profileUpdates.last_name;
        }
        if ('avatar_url' in profileUpdates) {
          allowedUpdates.avatar_url = profileUpdates.avatar_url;
        }
        if ('is_admin' in profileUpdates) {
          allowedUpdates.is_admin = profileUpdates.is_admin;
        }
        if ('stage' in profileUpdates) {
          allowedUpdates.stage = profileUpdates.stage;
        }

        if (Object.keys(allowedUpdates).length > 0) {
          const { error: profileError } = await supabase
            .from('profiles')
            .update(allowedUpdates)
            .eq('id', targetUserId);

          if (profileError) {
            throw profileError;
          }
        }
      }

      toast.success('User updated successfully');
      await fetchUsers();
    } catch (error: any) {
      logger.error('Update error:', error);
      toast.error('Failed to update user: ' + (error.message || 'Unknown error'));
    }
  };

  const deleteUser = async (targetUserId: string) => {
    try {
      // Use cached userId from auth context
      if (!userId) {
        throw new Error('No authenticated user found');
      }

      // Prevent self-deletion
      if (userId === targetUserId) {
        toast.error('You cannot delete your own account');
        return;
      }

      // Try edge function first for proper deletion (handles auth.users and RLS)
      try {
        const { data, error } = await supabase.functions.invoke('delete-user', {
          body: { userId: targetUserId }
        });

        if (error) {
          throw error;
        }

        if (data?.error) {
          // Check if it's an auth deletion failure vs profile deletion failure
          if (data.code === 'AUTH_DELETION_FAILED') {
            throw new Error(`Failed to revoke user access: ${data.error}. User cannot be deleted.`);
          }
          throw new Error(data.error);
        }

        toast.success('User deleted successfully and access revoked');
        await fetchUsers();
        return;
      } catch (edgeFunctionError: any) {
        // If edge function fails (not deployed, network error, etc.), analyze the error
        logger.warn('Edge function deletion failed:', edgeFunctionError);

        // Check if it's a permission/authorization error - don't fallback in that case
        if (edgeFunctionError?.status === 401 || edgeFunctionError?.status === 403) {
          throw new Error('Unauthorized: Admin access required to delete users');
        }

        // Check if it's an auth deletion failure - this is critical and should not fallback
        if (edgeFunctionError?.message?.includes('Failed to revoke user access') ||
            edgeFunctionError?.message?.includes('AUTH_DELETION_FAILED')) {
          throw new Error(`${edgeFunctionError.message} Please contact support if this persists.`);
        }

        // Only fallback to direct deletion if the edge function itself didn't deploy/respond
        // (network error, function not found, etc.)
        const isDeploymentError = edgeFunctionError?.message?.includes('not found') ||
                                  edgeFunctionError?.status === 502 ||
                                  edgeFunctionError?.status === 503;

        if (!isDeploymentError) {
          // Not a deployment error - re-throw the original error
          throw edgeFunctionError;
        }

        logger.warn('Edge function not available, but this is a critical operation - not falling back');
        throw new Error('User deletion requires the delete-user edge function to be deployed. Please contact support.');
      }
    } catch (error: any) {
      logger.error('Delete error:', error);
      const errorMessage = error.message || error.error || 'Unknown error';
      toast.error('Failed to delete user: ' + errorMessage);
    }
  };

  const impersonateUser = async (targetUserId: string) => {
    try {
      // Use cached auth context
      if (!userId) {
        throw new Error('No authenticated user found');
      }

      // Validate current user has email
      if (!userEmail) {
        throw new Error('Current user does not have an email address');
      }

      // Call the impersonate-user edge function to get a magic link
      const { data, error } = await supabase.functions.invoke('impersonate-user', {
        body: {
          userId: targetUserId,
          adminId: userId,
          adminEmail: userEmail,
          redirectTo: getSiteUrl()
        }
      });

      if (error) {
        throw error;
      }

      logger.log('Impersonate response:', data);

      // Check if we got the old response format (email/password)
      if (data?.email && data?.password) {
        logger.warn('Edge Function is returning old format. Using fallback password-based impersonation.');

        // Store original user info for restoration
        setImpersonationData(userId, userEmail);

        // Sign in with the temporary password (old method)
        const { error: signInError } = await supabase.auth.signInWithPassword({
          email: data.email,
          password: data.password
        });

        if (signInError) {
          throw signInError;
        }

        toast.success('Impersonation started (legacy mode)');
        window.location.reload();
        return;
      }

      if (data?.session) {
        // New session-based impersonation
        // Store original user info for restoration
        setImpersonationData(userId, userEmail);

        // Set the new session directly
        const { error: setSessionError } = await supabase.auth.setSession(data.session);

        if (setSessionError) {
          throw setSessionError;
        }

        toast.success('Impersonation started successfully!');

        // Reload to refresh the app with the new session
        window.location.reload();
      } else if (data?.magicLink) {
        // Fallback to magic link impersonation
        setImpersonationData(userId, userEmail);

        toast.success('Starting impersonation...');

        // Redirect to the magic link
        window.location.href = data.magicLink;
      } else {
        logger.error('Unexpected response format:', data);
        throw new Error('Failed to start impersonation. Response: ' + JSON.stringify(data));
      }
    } catch (error: any) {
      logger.error('Impersonation error:', error);
      toast.error('Failed to impersonate user: ' + (error.message || 'Unknown error'));
    }
  };

  const resendInvitation = async (invitationId: string) => {
    try {
      logger.log('Resending invitation email for invitation:', invitationId);

      // Get current session for auth token
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) {
        throw new Error('Not authenticated');
      }

      // Call resend API endpoint
      const response = await fetch('/api/admin/resend-invitation', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          invitationId,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `Failed to resend invitation (${response.status})`);
      }

      const data = await response.json();
      if (data.error) {
        throw new Error(data.error);
      }

      // Check if email was sent successfully
      if (data.emailSent) {
        toast.success(`Invitation resent successfully to ${data.email}. ${data.remainingAttempts} attempts remaining.`);
      } else {
        // Email failed again
        logger.error('Email delivery failed on resend:', data.emailError);
        if (data.remainingAttempts > 0) {
          toast.error(`Failed to resend email: ${data.emailError}. ${data.remainingAttempts} attempts remaining.`, {
            duration: 10000,
            action: {
              label: 'Retry',
              onClick: () => resendInvitation(invitationId)
            }
          });
        } else {
          toast.error('Failed to resend email. Maximum attempts reached. Please create a new invitation.');
        }
      }

      // Refresh user list to show updated status
      await fetchUsers();
    } catch (error: any) {
      logger.error('Resend email error:', error);
      toast.error('Failed to resend invitation: ' + (error.message || 'Unknown error'));
    }
  };

  const inviteUser = async (email: string, firstName?: string, lastName?: string) => {
    try {
      // Trim and normalize names
      const trimmedFirstName = firstName?.trim() || undefined;
      const trimmedLastName = lastName?.trim() || undefined;

      // Get current session for auth token
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) {
        throw new Error('Not authenticated');
      }

      // Call app API (same origin) to avoid browser->Supabase Edge CORS issues
      const response = await fetch('/api/admin/invite-user', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          email: email.toLowerCase().trim(),
          first_name: trimmedFirstName,
          last_name: trimmedLastName,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `Failed to invite user (${response.status})`);
      }

      const data = await response.json();
      if (data.error) {
        throw new Error(data.error);
      }

      // Check email delivery status from API
      if (data.emailSent) {
        toast.success(`Invitation sent successfully to ${email}`);
      } else {
        // Email failed - show warning with resend option
        logger.error('Email delivery failed:', data.emailError);

        // Only show resend button if invitation ID exists and we haven't hit the limit
        if (data.invitationId) {
          toast.warning(
            `User created, but email failed to send to ${email}.`,
            {
              duration: 10000,
              action: {
                label: 'Resend Email',
                onClick: () => resendInvitation(data.invitationId)
              }
            }
          );
        } else {
          toast.warning(`User created, but email failed to send to ${email}. Error: ${data.emailError || 'Unknown error'}`);
        }
      }

      // Refresh user list
      await fetchUsers();
    } catch (error: any) {
      logger.error('Invite error:', error);
      toast.error('Failed to invite user: ' + error.message);
      throw error;
    }
  };

  return {
    users,
    isLoading,
    updateUser,
    deleteUser,
    impersonateUser,
    inviteUser,
    resendInvitation,
  };
}