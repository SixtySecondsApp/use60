import SettingsPageWrapper from '@/components/SettingsPageWrapper';
import { useState, useEffect } from 'react';
import { Users, Trash2, Loader2, AlertCircle, UserPlus, Mail, RefreshCw, X, Check, Clock, Crown, ChevronDown, ChevronUp, UserCog, LogOut } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { useOrg } from '@/lib/contexts/OrgContext';
import { useAuth } from '@/lib/contexts/AuthContext';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase/clientV2';
import {
  createInvitation,
  getOrgInvitations,
  revokeInvitation,
  resendInvitation,
  type Invitation,
} from '@/lib/services/invitationService';
import {
  getPendingJoinRequests,
  approveJoinRequest,
  rejectJoinRequest,
  type JoinRequest,
} from '@/lib/services/joinRequestService';
import { leaveOrganization, isLastOwner } from '@/lib/services/leaveOrganizationService';
import { toast } from 'sonner';

interface TeamMember {
  user_id: string;
  role: 'owner' | 'admin' | 'member' | 'readonly';
  created_at: string;
  member_status?: 'active' | 'removed';
  removed_at?: string | null;
  removed_by?: string | null;
  user: {
    id: string;
    email: string;
    full_name: string | null;
    avatar_url?: string | null;
  } | null;
}

const roleLabels: Record<string, string> = {
  owner: 'Owner',
  admin: 'Admin',
  member: 'Member',
  readonly: 'View Only',
};

const roleColors: Record<string, string> = {
  owner: 'bg-purple-100 dark:bg-purple-500/20 text-purple-700 dark:text-purple-400 border-purple-300 dark:border-purple-500/30',
  admin: 'bg-blue-100 dark:bg-blue-500/20 text-blue-700 dark:text-blue-400 border-blue-300 dark:border-blue-500/30',
  member: 'bg-green-100 dark:bg-green-500/20 text-green-700 dark:text-green-400 border-green-300 dark:border-green-500/30',
  readonly: 'bg-gray-100 dark:bg-gray-500/20 text-gray-700 dark:text-gray-400 border-gray-300 dark:border-gray-500/30',
};

export default function TeamMembersPage() {
  const { activeOrgId, permissions } = useOrg();
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const [members, setMembers] = useState<TeamMember[]>([]);
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [isLoadingMembers, setIsLoadingMembers] = useState(true);
  const [isLoadingInvites, setIsLoadingInvites] = useState(true);

  // Invite form state
  const [newInviteEmail, setNewInviteEmail] = useState('');
  const [newInviteRole, setNewInviteRole] = useState<'admin' | 'member'>('member');
  const [isSendingInvite, setIsSendingInvite] = useState(false);

  // Join requests section collapse state
  const [isJoinRequestsExpanded, setIsJoinRequestsExpanded] = useState(true);

  // Filter state for showing removed members (ORGREM-016)
  const [showRemovedMembers, setShowRemovedMembers] = useState(true);

  // Leave team state
  const [isLeavingTeam, setIsLeavingTeam] = useState(false);
  const [isOwner, setIsOwner] = useState(false);
  const [showLeaveConfirmation, setShowLeaveConfirmation] = useState(false);

  // Debug: Log component mount and context values
  useEffect(() => {
    console.log('[TeamMembersPage] ===== COMPONENT MOUNTED =====');
    console.log('[TeamMembersPage] Active Org ID:', activeOrgId);
    console.log('[TeamMembersPage] User:', {
      id: user?.id,
      email: user?.email,
    });
    console.log('[TeamMembersPage] Permissions:', permissions);
  }, []);

  // Helper function to sort members by role hierarchy
  const sortMembersByRole = (membersList: TeamMember[]): TeamMember[] => {
    const roleOrder = { owner: 1, admin: 2, member: 3, readonly: 4 };
    return [...membersList].sort((a, b) => {
      const roleComparison = roleOrder[a.role] - roleOrder[b.role];
      // If same role, sort by created_at (oldest first)
      if (roleComparison === 0) {
        return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
      }
      return roleComparison;
    });
  };

  // Filter members based on showRemovedMembers toggle (ORGREM-016)
  const filteredMembers = showRemovedMembers
    ? members
    : members.filter((m) => m.member_status !== 'removed');

  // Helper to check if a removed member has a pending rejoin request (ORGREM-016)
  const hasPendingRejoin = (userId: string): boolean => {
    return rejoinRequests.some((req: any) => req.user_id === userId && req.status === 'pending');
  };

  // Fetch join requests
  const { data: joinRequests = [], isLoading: isLoadingJoinRequests, error: joinRequestsError } = useQuery({
    queryKey: ['join-requests', activeOrgId],
    queryFn: async () => {
      console.log('[TeamMembersPage] ===== JOIN REQUESTS QUERY =====');
      console.log('[TeamMembersPage] Active Org ID:', activeOrgId);
      console.log('[TeamMembersPage] User ID:', user?.id);
      console.log('[TeamMembersPage] User Email:', user?.email);
      console.log('[TeamMembersPage] Permissions:', permissions);

      if (!activeOrgId) {
        console.warn('[TeamMembersPage] ⚠️ No activeOrgId available, cannot fetch join requests');
        return [];
      }

      const requests = await getPendingJoinRequests(activeOrgId);

      console.log('[TeamMembersPage] ===== QUERY COMPLETE =====');
      console.log('[TeamMembersPage] Results count:', requests.length);

      if (requests.length > 0) {
        console.log('[TeamMembersPage] ✅ Found pending requests:');
        requests.forEach((req, idx) => {
          console.log(`  ${idx + 1}. ${req.email} (${req.user_profile?.first_name || 'No name'} ${req.user_profile?.last_name || ''})`);
        });
      } else {
        console.warn('[TeamMembersPage] ⚠️ No pending requests returned');
      }

      return requests;
    },
    enabled: !!activeOrgId && !!user?.id,
    // Only fetch once on component mount - user can manually refresh page for new requests
    retry: 2,
  });

  // Fetch rejoin requests (ORGREM-015)
  const { data: rejoinRequests = [], isLoading: isLoadingRejoinRequests } = useQuery({
    queryKey: ['rejoin-requests', activeOrgId],
    queryFn: async () => {
      if (!activeOrgId) return [];

      const { data, error } = await supabase
        .from('rejoin_requests')
        .select(`
          id,
          user_id,
          org_id,
          status,
          created_at,
          profiles:user_id (
            id,
            email,
            first_name,
            last_name
          )
        `)
        .eq('org_id', activeOrgId)
        .eq('status', 'pending')
        .order('created_at', { ascending: true });

      // rejoin_requests table may not exist yet if ORGREM migration hasn't been deployed
      if (error?.code === 'PGRST116' || error?.code === '42P01') {
        // Table doesn't exist yet - return empty array (feature not deployed)
        return [];
      }

      if (error) throw error;

      return data || [];
    },
    enabled: !!activeOrgId && !!user?.id && permissions.canManageTeam,
    // Only fetch once on component mount - no auto-refresh
    retry: 2,
  });

  // Log query errors
  useEffect(() => {
    if (joinRequestsError) {
      console.error('[TeamMembersPage] ❌ Join requests query error:', joinRequestsError);
    }
  }, [joinRequestsError]);

  // Approve mutation
  const approveMutation = useMutation({
    mutationFn: (requestId: string) => {
      if (!user?.id) throw new Error('User ID not available');
      return approveJoinRequest(requestId, user.id);
    },
    onSuccess: (result) => {
      if (result.success) {
        toast.success('Join request approved and email sent');
        queryClient.invalidateQueries({ queryKey: ['join-requests'] });
        queryClient.invalidateQueries({ queryKey: ['organization-members'] });
      } else {
        toast.error(result.error || 'Failed to approve request');
      }
    },
    onError: (error: any) => {
      toast.error(error?.message || 'Failed to approve request');
    },
  });

  // Reject mutation
  const rejectMutation = useMutation({
    mutationFn: ({ requestId, reason }: { requestId: string; reason?: string }) => {
      if (!user?.id) throw new Error('User ID not available');
      return rejectJoinRequest(requestId, user.id, reason);
    },
    onSuccess: (result) => {
      if (result.success) {
        toast.success('Join request rejected and email sent');
        queryClient.invalidateQueries({ queryKey: ['join-requests'] });
      } else {
        toast.error(result.error || 'Failed to reject request');
      }
    },
    onError: (error: any) => {
      toast.error(error?.message || 'Failed to reject request');
    },
  });

  // Approve rejoin mutation (ORGREM-015)
  const approveRejoinMutation = useMutation({
    mutationFn: async (requestId: string) => {
      if (!user?.id) throw new Error('User ID not available');

      const { data, error } = await supabase.rpc('approve_rejoin_request', {
        p_request_id: requestId,
        p_approved: true,
      });

      if (error) throw error;
      if (!data?.success) {
        throw new Error(data?.error || 'Failed to approve rejoin request');
      }

      return data;
    },
    onSuccess: () => {
      toast.success('Rejoin request approved! User has been re-added to the organization.');
      queryClient.invalidateQueries({ queryKey: ['rejoin-requests'] });
      queryClient.invalidateQueries({ queryKey: ['organization-members'] });
      // Refresh members list
      window.location.reload();
    },
    onError: (error: any) => {
      toast.error(error?.message || 'Failed to approve rejoin request');
    },
  });

  // Reject rejoin mutation (ORGREM-015)
  const rejectRejoinMutation = useMutation({
    mutationFn: async ({ requestId, reason, requestData }: { requestId: string; reason?: string; requestData: any }) => {
      if (!user?.id) throw new Error('User ID not available');

      const { data, error } = await supabase.rpc('approve_rejoin_request', {
        p_request_id: requestId,
        p_approved: false,
        p_rejection_reason: reason || null,
      });

      if (error) throw error;
      if (!data?.success) {
        throw new Error(data?.error || 'Failed to reject rejoin request');
      }

      // Send rejection email (non-blocking)
      if (requestData?.profiles?.email && activeOrgId) {
        const { data: orgData } = await supabase
          .from('organizations')
          .select('name')
          .eq('id', activeOrgId)
          .single();

        fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/encharge-send-email`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${(await supabase.auth.getSession()).data.session?.access_token}`,
          },
          body: JSON.stringify({
            template_type: 'rejoin_rejected',
            to_email: requestData.profiles.email,
            to_name: requestData.profiles.first_name || requestData.profiles.email.split('@')[0],
            user_id: requestData.user_id,
            variables: {
              user_first_name: requestData.profiles.first_name || requestData.profiles.email.split('@')[0],
              org_name: orgData?.name || 'the organization',
              rejection_reason: reason || 'No reason provided',
              admin_name: user?.email || 'the organization admin',
              onboarding_url: `${window.location.origin}/onboarding`,
              support_email: 'support@use60.com',
            },
          }),
        }).catch((err) => {
          console.error('Failed to send rejection email:', err);
          // Don't show error to user - email is non-blocking
        });
      }

      return data;
    },
    onSuccess: () => {
      toast.success('Rejoin request rejected and user notified via email');
      queryClient.invalidateQueries({ queryKey: ['rejoin-requests'] });
    },
    onError: (error: any) => {
      toast.error(error?.message || 'Failed to reject rejoin request');
    },
  });

  // Load team members
  useEffect(() => {
    if (!activeOrgId) return;

    const loadMembers = async () => {
      setIsLoadingMembers(true);
      try {
        // Fetch memberships - try with optional columns first (ORGREM-016)
        // If migration hasn't been applied, fall back to basic columns
        let memberships: any[] = [];
        let membershipError = null;

        // Try with ORGREM columns first
        const { data: dataWithOrgrem, error: errorWithOrgrem } = await supabase
          .from('organization_memberships')
          .select('user_id, role, created_at, member_status, removed_at, removed_by')
          .eq('org_id', activeOrgId)
          .order('created_at', { ascending: true });

        if (!errorWithOrgrem && dataWithOrgrem) {
          memberships = dataWithOrgrem;
          console.log('[TeamMembersPage] Loaded with ORGREM columns');
        } else if (errorWithOrgrem?.code === '42703') {
          // Column doesn't exist - fall back to basic columns
          console.log('[TeamMembersPage] ORGREM columns not available, using basic query');
          const { data: basicData, error: basicError } = await supabase
            .from('organization_memberships')
            .select('user_id, role, created_at')
            .eq('org_id', activeOrgId)
            .order('created_at', { ascending: true });

          if (basicError) {
            console.error('[TeamMembersPage] Membership query error:', basicError);
            throw basicError;
          }
          memberships = basicData || [];
        } else {
          throw errorWithOrgrem;
        }

        if (!memberships?.length) {
          console.log('[TeamMembersPage] No memberships found for org:', activeOrgId);
          setMembers([]);
          return;
        }

        console.log('[TeamMembersPage] Loaded', memberships.length, 'memberships');

        // Fetch profiles for all member user_ids
        // Note: profiles table has first_name and last_name, NOT full_name
        const userIds = memberships.map((m) => m.user_id);
        console.log('[TeamMembersPage] Fetching profiles for user IDs:', userIds);

        const { data: profiles, error: profileError } = await supabase
          .from('profiles')
          .select('id, email, first_name, last_name, avatar_url')
          .in('id', userIds);

        if (profileError) {
          console.error('[TeamMembersPage] Profile query error:', profileError);
          throw profileError;
        }
        console.log('[TeamMembersPage] Loaded', profiles?.length || 0, 'profiles');

        // Create a lookup map for profiles with constructed full_name
        const profileMap = new Map(
          profiles?.map((p) => [
            p.id,
            {
              id: p.id,
              email: p.email,
              full_name: [p.first_name, p.last_name].filter(Boolean).join(' ') || null,
              avatar_url: p.avatar_url || null,
            },
          ]) || []
        );

        // Transform to expected format with user object - ORGREM-016
        // Handle both old (no member_status) and new (with member_status) schema
        const membersWithProfiles = memberships.map((m) => ({
          user_id: m.user_id,
          role: m.role as 'owner' | 'admin' | 'member' | 'readonly',
          created_at: m.created_at,
          member_status: (m.member_status || 'active') as 'active' | 'removed' | undefined,
          removed_at: m.removed_at || null,
          removed_by: m.removed_by || null,
          user: profileMap.get(m.user_id) || null,
        }));

        // Sort by role hierarchy: owner → admin → member → readonly
        setMembers(sortMembersByRole(membersWithProfiles));
      } catch (err: any) {
        console.error('Error loading members:', err);
      } finally {
        setIsLoadingMembers(false);
      }
    };

    loadMembers();
  }, [activeOrgId]);

  // Load invitations
  useEffect(() => {
    if (!activeOrgId) return;

    const loadInvitations = async () => {
      setIsLoadingInvites(true);
      const { data, error } = await getOrgInvitations(activeOrgId);
      if (error) {
        console.error('Error loading invitations:', error);
      } else {
        setInvitations(data || []);
      }
      setIsLoadingInvites(false);
    };

    loadInvitations();
  }, [activeOrgId]);

  // Check if user is owner
  useEffect(() => {
    const checkOwnerStatus = async () => {
      if (activeOrgId && user?.id) {
        const ownerStatus = await isLastOwner(activeOrgId, user.id);
        setIsOwner(ownerStatus);
      }
    };
    checkOwnerStatus();
  }, [activeOrgId, user?.id]);

  // Handle sending invitation
  const handleSendInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeOrgId || !newInviteEmail.trim()) return;

    setIsSendingInvite(true);
    const { data, error } = await createInvitation({
      orgId: activeOrgId,
      email: newInviteEmail.trim(),
      role: newInviteRole,
    });

    if (error) {
      toast.error(error);
    } else if (data) {
      toast.success(`Invitation sent to ${newInviteEmail}`);
      setInvitations([data, ...invitations]);
      setNewInviteEmail('');
      setNewInviteRole('member');
    }
    setIsSendingInvite(false);
  };

  // Handle revoking invitation
  const handleRevokeInvite = async (inviteId: string) => {
    const { success, error } = await revokeInvitation(inviteId);
    if (success) {
      toast.success('Invitation revoked');
      setInvitations(invitations.filter((inv) => inv.id !== inviteId));
    } else {
      toast.error(error || 'Failed to revoke invitation');
    }
  };

  // Handle resending invitation
  const handleResendInvite = async (inviteId: string) => {
    const { data, error } = await resendInvitation(inviteId);
    if (data) {
      toast.success('Invitation resent');
      setInvitations(invitations.map((inv) => (inv.id === inviteId ? data : inv)));
    } else {
      toast.error(error || 'Failed to resend invitation');
    }
  };

  // Handle removing member - ORGREM-013
  const handleRemoveMember = async (userId: string) => {
    if (!activeOrgId) return;

    // Prevent removing self
    if (userId === user?.id) {
      toast.error("You can't remove yourself");
      return;
    }

    const member = members.find((m) => m.user_id === userId);
    if (!member) return;

    // Show confirmation dialog with data retention explanation
    const memberName = member.user?.full_name || member.user?.email || 'this user';
    const confirmMessage = `Remove ${memberName} from the organization?\n\nImportant:\n• Their account will remain active\n• All data they created will be preserved\n• They can view their data but not edit it\n• They can request to rejoin later\n• They will be notified via email`;

    if (!window.confirm(confirmMessage)) return;

    try {
      // Call remove_user_from_org RPC
      const { data, error } = await supabase.rpc('remove_user_from_org', {
        p_org_id: activeOrgId,
        p_user_id: userId,
      });

      if (error) throw error;

      if (!data?.success) {
        throw new Error(data?.error || 'Failed to remove user');
      }

      toast.success('User removed successfully. They will be notified via email.');

      // Send removal email (non-blocking)
      const { data: orgData } = await supabase
        .from('organizations')
        .select('name')
        .eq('id', activeOrgId)
        .single();

      // Call send-removal-email edge function
      fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/send-removal-email`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${(await supabase.auth.getSession()).data.session?.access_token}`,
        },
        body: JSON.stringify({
          user_id: userId,
          org_id: activeOrgId,
          org_name: orgData?.name || 'the organization',
          admin_email: user?.email,
          rejoin_url: `${window.location.origin}/onboarding/removed-user`,
        }),
      }).catch((err) => {
        console.error('Failed to send removal email:', err);
        // Don't show error to user - email is non-blocking
      });

      // Update UI - mark member as removed instead of filtering out
      setMembers(
        members.map((m) =>
          m.user_id === userId ? { ...m, member_status: 'removed' as const } : m
        )
      );

      // Invalidate queries to refresh data
      queryClient.invalidateQueries({ queryKey: ['org-members'] });
    } catch (err: any) {
      toast.error(err.message || 'Failed to remove member');
    }
  };

  // Handle changing member role
  const handleChangeRole = async (userId: string, newRole: 'admin' | 'member' | 'readonly') => {
    if (!activeOrgId) return;

    try {
      const response = await (supabase
        .from('organization_memberships') as any)
        .update({ role: newRole })
        .eq('org_id', activeOrgId)
        .eq('user_id', userId) as { error: any };

      if (response.error) throw response.error;

      toast.success('Role updated');

      // Update and re-sort members list
      const updatedMembers = members.map((m) => (m.user_id === userId ? { ...m, role: newRole } : m));
      setMembers(sortMembersByRole(updatedMembers));
    } catch (err: any) {
      toast.error(err.message || 'Failed to update role');
    }
  };

  // Handle leaving the team (show confirmation dialog)
  const handleLeaveTeam = () => {
    if (!activeOrgId || !user?.id) return;

    // Check if owner
    if (isOwner) {
      toast.error(
        'You are the last owner of this organization. Please transfer ownership to another member before leaving.'
      );
      return;
    }

    // Show confirmation dialog
    setShowLeaveConfirmation(true);
  };

  // Confirm leaving the team
  const handleConfirmLeaveTeam = async () => {
    if (!activeOrgId || !user?.id) return;

    setIsLeavingTeam(true);
    const result = await leaveOrganization(activeOrgId, user.id);

    if (result.success) {
      setShowLeaveConfirmation(false);
      toast.success('You have left the organization');
      // Refresh page to reset organization context
      setTimeout(() => {
        window.location.reload();
      }, 1000);
    } else {
      toast.error(result.error || 'Failed to leave organization');
      setIsLeavingTeam(false);
      setShowLeaveConfirmation(false);
    }
  };

  // Handle ownership transfer (owner only)
  const handleTransferOwnership = async (newOwnerId: string) => {
    if (!activeOrgId || !user?.id) return;

    const newOwner = members.find((m) => m.user_id === newOwnerId);
    if (!newOwner) return;

    const confirmMessage = `Are you sure you want to transfer ownership to ${newOwner.user?.full_name || newOwner.user?.email}? You will become an admin.`;
    if (!window.confirm(confirmMessage)) return;

    try {
      // Start a transaction-like update: demote current owner to admin, promote new member to owner
      // 1. Promote new owner
      const { error: promoteError } = await supabase
        .from('organization_memberships')
        .update({ role: 'owner' })
        .eq('org_id', activeOrgId)
        .eq('user_id', newOwnerId);

      if (promoteError) throw promoteError;

      // 2. Demote current owner to admin
      const { error: demoteError } = await supabase
        .from('organization_memberships')
        .update({ role: 'admin' })
        .eq('org_id', activeOrgId)
        .eq('user_id', user.id);

      if (demoteError) {
        // Try to rollback the promotion
        await supabase
          .from('organization_memberships')
          .update({ role: newOwner.role })
          .eq('org_id', activeOrgId)
          .eq('user_id', newOwnerId);
        throw demoteError;
      }

      toast.success(`Ownership transferred to ${newOwner.user?.full_name || newOwner.user?.email}`);

      // Update and re-sort members list
      const updatedMembers = members.map((m) => {
        if (m.user_id === newOwnerId) return { ...m, role: 'owner' as const };
        if (m.user_id === user.id) return { ...m, role: 'admin' as const };
        return m;
      });
      setMembers(sortMembersByRole(updatedMembers));

      // Refresh organization context to update permissions
      setTimeout(() => {
        window.location.reload();
      }, 1500);
    } catch (err: any) {
      toast.error(err.message || 'Failed to transfer ownership');
    }
  };

  if (!activeOrgId) {
    return (
      <SettingsPageWrapper
        title="Team Members"
        description="Manage team members and invitations"
      >
        <div className="flex items-center justify-center min-h-[400px]">
          <div className="text-center">
            <AlertCircle className="w-12 h-12 text-gray-400 mx-auto mb-4" />
            <p className="text-gray-400">No organization selected</p>
          </div>
        </div>
      </SettingsPageWrapper>
    );
  }

  return (
    <SettingsPageWrapper
      title="Team Members"
      description="Manage team members and invitations"
    >
      <div className="space-y-8">
        {/* Invite New Members - MOVED TO TOP */}
        {permissions.canManageTeam && (
          <div>
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
              <UserPlus className="w-5 h-5 text-[#37bd7e]" />
              Invite Team Members
            </h2>
            <form onSubmit={handleSendInvite} className="flex gap-3">
              <div className="flex-1 relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-500 dark:text-gray-400" />
                <input
                  type="email"
                  value={newInviteEmail}
                  onChange={(e) => setNewInviteEmail(e.target.value)}
                  placeholder="colleague@company.com"
                  required
                  disabled={isSendingInvite}
                  className="w-full bg-white dark:bg-gray-800/50 border border-gray-300 dark:border-gray-700/50 rounded-xl pl-10 pr-4 py-2.5 text-gray-900 dark:text-white placeholder-gray-500 focus:ring-2 focus:ring-[#37bd7e] focus:border-transparent disabled:opacity-50"
                />
              </div>
              <select
                value={newInviteRole}
                onChange={(e) => setNewInviteRole(e.target.value as 'admin' | 'member')}
                disabled={isSendingInvite}
                className="bg-white dark:bg-gray-800/50 border border-gray-300 dark:border-gray-700/50 rounded-xl px-3 py-2.5 text-gray-900 dark:text-white focus:ring-2 focus:ring-[#37bd7e] focus:border-transparent disabled:opacity-50"
              >
                <option value="admin">Admin</option>
                <option value="member">Member</option>
              </select>
              <Button
                type="submit"
                disabled={isSendingInvite || !newInviteEmail.trim()}
                className="bg-[#37bd7e] hover:bg-[#2da76c] px-6 py-2.5 h-auto"
              >
                {isSendingInvite ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  'Send Invite'
                )}
              </Button>
            </form>
          </div>
        )}

        {/* Team Members List */}
        <div>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2">
              <Users className="w-5 h-5 text-[#37bd7e]" />
              Team Members
            </h2>
            <div className="flex items-center gap-4">
              {/* Leave Team Button (for non-owners) */}
              {!isOwner && (
                <button
                  onClick={handleLeaveTeam}
                  disabled={isLeavingTeam}
                  className="px-3 py-1.5 rounded-lg bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300 hover:bg-red-200 dark:hover:bg-red-900/50 transition-all duration-300 border border-red-300 dark:border-red-700/50 font-medium text-sm flex items-center gap-2 disabled:opacity-50"
                  title="Leave this organization"
                >
                  <LogOut className="w-3.5 h-3.5" />
                  Leave Team
                </button>
              )}
              {/* Filter toggle for removed members (ORGREM-016) */}
              {members.some((m) => m.member_status === 'removed') && (
                <label className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={showRemovedMembers}
                    onChange={(e) => setShowRemovedMembers(e.target.checked)}
                    className="rounded border-gray-300 dark:border-gray-600 text-[#37bd7e] focus:ring-[#37bd7e] focus:ring-offset-0"
                  />
                  Show removed members
                </label>
              )}
            </div>
          </div>
          {isLoadingMembers ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-8 h-8 text-[#37bd7e] animate-spin" />
            </div>
          ) : (
            <div className="border border-gray-200 dark:border-gray-800 rounded-xl overflow-hidden">
              <div className="divide-y divide-gray-200 dark:divide-gray-800">
                {filteredMembers.map((member) => (
                  <div
                    key={member.user_id}
                    className={`flex items-center justify-between px-6 py-4 hover:bg-gray-50 dark:hover:bg-gray-800/30 transition-colors ${
                      member.member_status === 'removed' ? 'opacity-60 bg-gray-50/50 dark:bg-gray-800/20' : ''
                    }`}
                  >
                    <div className="flex items-center gap-4">
                      <Avatar className={`h-10 w-10 ${member.member_status === 'removed' ? 'opacity-60' : ''}`}>
                        {member.user?.avatar_url && (
                          <AvatarImage src={member.user.avatar_url} />
                        )}
                        <AvatarFallback>
                          {member.user?.full_name?.[0]}
                          {member.user?.full_name?.split(' ')[1]?.[0]}
                        </AvatarFallback>
                      </Avatar>
                      <div>
                        <div className="flex items-center gap-2">
                          <p className="text-gray-900 dark:text-white font-medium">
                            {member.user?.full_name || member.user?.email?.split('@')[0] || 'Unknown User'}
                            {member.user_id === user?.id && (
                              <span className="text-gray-500 dark:text-gray-400 text-sm ml-2">(you)</span>
                            )}
                          </p>
                          {member.member_status === 'removed' && (
                            <span
                              className="inline-flex items-center px-2 py-0.5 rounded-md bg-red-100 dark:bg-red-500/20 text-red-700 dark:text-red-400 text-xs font-medium border border-red-300 dark:border-red-500/30"
                              title={member.removed_at ? `Removed on ${new Date(member.removed_at).toLocaleDateString()}` : 'Removed'}
                            >
                              Removed
                            </span>
                          )}
                          {member.member_status === 'removed' && hasPendingRejoin(member.user_id) && (
                            <span className="inline-flex items-center px-2 py-0.5 rounded-md bg-blue-100 dark:bg-blue-500/20 text-blue-700 dark:text-blue-400 text-xs font-medium border border-blue-300 dark:border-blue-500/30">
                              Pending Rejoin
                            </span>
                          )}
                        </div>
                        <p className="text-sm text-gray-600 dark:text-gray-400">{member.user?.email}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      {/* Don't show actions for removed members */}
                      {member.member_status === 'removed' ? (
                        <span
                          className={`px-3 py-1 rounded-full text-xs font-medium border ${roleColors[member.role]}`}
                        >
                          {roleLabels[member.role]}
                        </span>
                      ) : (
                        <>
                          {/* Owner can transfer ownership or change roles */}
                          {permissions.isOwner && member.user_id !== user?.id ? (
                            <>
                              {member.role === 'owner' ? (
                                // Can't change other owners (shouldn't happen, but be safe)
                                <span
                                  className={`px-3 py-1 rounded-full text-xs font-medium border ${roleColors[member.role]}`}
                                >
                                  {roleLabels[member.role]}
                                </span>
                              ) : (
                                <>
                                  <select
                                    value={member.role}
                                    onChange={(e) =>
                                      handleChangeRole(member.user_id, e.target.value as 'admin' | 'member' | 'readonly')
                                    }
                                    className="bg-gray-100 dark:bg-gray-700/50 border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-1.5 text-sm text-gray-900 dark:text-white focus:ring-2 focus:ring-[#37bd7e] focus:border-transparent"
                                  >
                                    <option value="admin">Admin</option>
                                    <option value="member">Member</option>
                                    <option value="readonly">View Only</option>
                                  </select>
                                  <button
                                    onClick={() => handleTransferOwnership(member.user_id)}
                                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-purple-700 dark:text-purple-400 bg-purple-100 dark:bg-purple-500/20 border border-purple-300 dark:border-purple-500/30 rounded-lg hover:bg-purple-200 dark:hover:bg-purple-500/30 transition-colors"
                                    title="Transfer ownership to this user"
                                  >
                                    <Crown className="w-3.5 h-3.5" />
                                    Transfer Ownership
                                  </button>
                                </>
                              )}
                            </>
                          ) : permissions.canManageTeam && member.role !== 'owner' && member.user_id !== user?.id ? (
                            // Admins can change roles but not transfer ownership
                            <select
                              value={member.role}
                              onChange={(e) =>
                                handleChangeRole(member.user_id, e.target.value as 'admin' | 'member' | 'readonly')
                              }
                              className="bg-gray-100 dark:bg-gray-700/50 border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-1.5 text-sm text-gray-900 dark:text-white focus:ring-2 focus:ring-[#37bd7e] focus:border-transparent"
                            >
                              <option value="admin">Admin</option>
                              <option value="member">Member</option>
                              <option value="readonly">View Only</option>
                            </select>
                          ) : (
                            // Show role badge only
                            <span
                              className={`px-3 py-1 rounded-full text-xs font-medium border ${roleColors[member.role]}`}
                            >
                              {roleLabels[member.role]}
                            </span>
                          )}
                          {permissions.canManageTeam && member.role !== 'owner' && member.user_id !== user?.id && (
                            <button
                              onClick={() => handleRemoveMember(member.user_id)}
                              className="p-2 text-gray-500 dark:text-gray-400 hover:text-red-500 dark:hover:text-red-400 transition-colors"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          )}
                        </>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Pending Join & Rejoin Requests - Merged Section (Admins Only) */}
        {permissions.canManageTeam && (
        <div>
          <button
            onClick={() => setIsJoinRequestsExpanded(!isJoinRequestsExpanded)}
            className="w-full flex items-center justify-between mb-4 group"
          >
            <div className="flex items-center gap-2">
              <UserCog className="w-5 h-5 text-yellow-500" />
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                Pending Requests
                {(joinRequests.length + rejoinRequests.length) > 0 && (
                  <span className="ml-2 text-sm font-normal text-yellow-600 dark:text-yellow-400">
                    ({joinRequests.length + rejoinRequests.length})
                  </span>
                )}
              </h2>
            </div>
            {isJoinRequestsExpanded ? (
              <ChevronUp className="w-5 h-5 text-gray-500 group-hover:text-gray-700 dark:group-hover:text-gray-300 transition-colors" />
            ) : (
              <ChevronDown className="w-5 h-5 text-gray-500 group-hover:text-gray-700 dark:group-hover:text-gray-300 transition-colors" />
            )}
          </button>

          {isJoinRequestsExpanded && (
            <div className="border border-gray-200 dark:border-gray-800 rounded-xl overflow-hidden">
              {isLoadingJoinRequests || isLoadingRejoinRequests ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="w-8 h-8 text-[#37bd7e] animate-spin" />
                </div>
              ) : joinRequests.length === 0 && rejoinRequests.length === 0 ? (
                <div className="text-center py-12 px-6">
                  <div className="w-16 h-16 rounded-full bg-gray-100 dark:bg-gray-800 flex items-center justify-center mx-auto mb-4">
                    <UserCog className="w-8 h-8 text-gray-400" />
                  </div>
                  <h3 className="text-base font-medium text-gray-900 dark:text-white mb-2">
                    No Pending Requests
                  </h3>
                  <p className="text-sm text-gray-600 dark:text-gray-400 max-w-sm mx-auto">
                    When users request to join or rejoin your organization, they'll appear here for approval.
                  </p>
                </div>
              ) : (
                <div className="divide-y divide-gray-200 dark:divide-gray-800">
                  {/* Join Requests */}
                  {joinRequests.map((request: JoinRequest) => (
                    <div
                      key={`join-${request.id}`}
                      className="flex items-center justify-between px-6 py-4 hover:bg-gray-50 dark:hover:bg-gray-800/30 transition-colors"
                    >
                      <div className="flex items-center gap-4">
                        <div className="w-10 h-10 rounded-full bg-yellow-200 dark:bg-yellow-500/20 flex items-center justify-center">
                          <span className="text-yellow-900 dark:text-yellow-400 font-medium">
                            {request.user_profile?.first_name?.[0]?.toUpperCase() ||
                              request.email[0].toUpperCase()}
                          </span>
                        </div>
                        <div>
                          <p className="text-gray-900 dark:text-white font-medium">
                            {request.user_profile?.first_name && request.user_profile?.last_name
                              ? `${request.user_profile.first_name} ${request.user_profile.last_name}`
                              : request.user_profile?.first_name || request.user_profile?.last_name || request.email.split('@')[0]}
                          </p>
                          <p className="text-sm text-gray-600 dark:text-gray-400">{request.email}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-yellow-100 dark:bg-yellow-500/20 text-yellow-700 dark:text-yellow-400 text-xs">
                          <Clock className="w-3 h-3" />
                          Awaiting Approval
                        </span>
                        <button
                          onClick={() => approveMutation.mutate(request.id)}
                          disabled={approveMutation.isPending}
                          className="p-2 text-gray-500 dark:text-gray-400 hover:text-green-600 dark:hover:text-green-400 transition-colors disabled:opacity-50"
                          title="Approve request and grant immediate access"
                        >
                          <Check className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => rejectMutation.mutate({ requestId: request.id })}
                          disabled={rejectMutation.isPending}
                          className="p-2 text-gray-500 dark:text-gray-400 hover:text-red-500 dark:hover:text-red-400 transition-colors disabled:opacity-50"
                          title="Reject request"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  ))}

                  {/* Rejoin Requests */}
                  {rejoinRequests.map((request: any) => (
                    <div
                      key={`rejoin-${request.id}`}
                      className="flex items-center justify-between px-6 py-4 hover:bg-gray-50 dark:hover:bg-gray-800/30 transition-colors"
                    >
                      <div className="flex items-center gap-4">
                        <div className="w-10 h-10 rounded-full bg-blue-200 dark:bg-blue-500/20 flex items-center justify-center">
                          <span className="text-blue-900 dark:text-blue-400 font-medium">
                            {request.profiles?.first_name?.[0]?.toUpperCase() ||
                              request.profiles?.email?.[0].toUpperCase() || '?'}
                          </span>
                        </div>
                        <div>
                          <p className="text-gray-900 dark:text-white font-medium">
                            {request.profiles?.first_name && request.profiles?.last_name
                              ? `${request.profiles.first_name} ${request.profiles.last_name}`
                              : request.profiles?.first_name || request.profiles?.last_name || request.profiles?.email?.split('@')[0]}
                          </p>
                          <p className="text-sm text-gray-600 dark:text-gray-400">{request.profiles?.email}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-blue-100 dark:bg-blue-500/20 text-blue-700 dark:text-blue-400 text-xs font-medium">
                          Rejoin
                        </span>
                        <span className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-blue-100 dark:bg-blue-500/20 text-blue-700 dark:text-blue-400 text-xs">
                          <Clock className="w-3 h-3" />
                          Awaiting Approval
                        </span>
                        <button
                          onClick={() => approveRejoinMutation.mutate(request.id)}
                          disabled={approveRejoinMutation.isPending}
                          className="p-2 text-gray-500 dark:text-gray-400 hover:text-green-600 dark:hover:text-green-400 transition-colors disabled:opacity-50"
                          title="Approve and re-add to organization"
                        >
                          <Check className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => {
                            const reason = window.prompt(
                              'Optional: Provide a reason for rejection (will be included in email to user)'
                            );
                            if (reason !== null) {
                              rejectRejoinMutation.mutate({ requestId: request.id, reason: reason || undefined, requestData: request });
                            }
                          }}
                          disabled={rejectRejoinMutation.isPending}
                          className="p-2 text-gray-500 dark:text-gray-400 hover:text-red-500 dark:hover:text-red-400 transition-colors disabled:opacity-50"
                          title="Reject request"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
        )}



        {/* Pending Invitations */}
        {permissions.canManageTeam && invitations.length > 0 && (
          <div>
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
              <Mail className="w-5 h-5 text-[#37bd7e]" />
              Pending Invitations
            </h2>
            <div className="border border-gray-200 dark:border-gray-800 rounded-xl overflow-hidden">
              <div className="divide-y divide-gray-200 dark:divide-gray-800">
                {invitations.map((invite) => (
                  <div
                    key={invite.id}
                    className="flex items-center justify-between px-6 py-4 hover:bg-gray-50 dark:hover:bg-gray-800/30 transition-colors"
                  >
                    <div className="flex items-center gap-4">
                      <div className="w-10 h-10 rounded-full bg-gray-200 dark:bg-gray-700/50 flex items-center justify-center">
                        <Mail className="w-5 h-5 text-gray-500 dark:text-gray-400" />
                      </div>
                      <div>
                        <p className="text-gray-900 dark:text-white">{invite.email}</p>
                        <p className="text-sm text-gray-600 dark:text-gray-400">
                          Expires {new Date(invite.expires_at).toLocaleDateString()}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <span
                        className={`px-3 py-1 rounded-full text-xs font-medium border ${roleColors[invite.role]}`}
                      >
                        {roleLabels[invite.role]}
                      </span>
                      <button
                        onClick={() => handleResendInvite(invite.id)}
                        className="p-2 text-gray-500 dark:text-gray-400 hover:text-[#37bd7e] transition-colors"
                        title="Resend invitation"
                      >
                        <RefreshCw className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleRevokeInvite(invite.id)}
                        className="p-2 text-gray-500 dark:text-gray-400 hover:text-red-500 dark:hover:text-red-400 transition-colors"
                        title="Revoke invitation"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Leave Organization Confirmation Dialog */}
      <ConfirmDialog
        open={showLeaveConfirmation}
        onClose={() => {
          setShowLeaveConfirmation(false);
          setIsLeavingTeam(false);
        }}
        onConfirm={handleConfirmLeaveTeam}
        title="Leave Organization?"
        description="You will no longer have access to this organization's data and all its resources. You can request to join again later if needed."
        confirmText="Leave Organization"
        cancelText="Cancel"
        confirmVariant="destructive"
        loading={isLeavingTeam}
      />
    </SettingsPageWrapper>
  );
}
