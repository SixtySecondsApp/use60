import SettingsPageWrapper from '@/components/SettingsPageWrapper';
import { useState, useEffect, useMemo } from 'react';
import {
  Building2,
  Check,
  X,
  Loader2,
  AlertCircle,
  Users,
  Trash2,
  UserPlus,
  Mail,
  RefreshCw,
  Clock,
  Crown,
  ChevronDown,
  ChevronUp,
  UserCog,
  LogOut,
  Globe,
  DollarSign,
  Edit2,
} from 'lucide-react';
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
import { CURRENCIES, type CurrencyCode } from '@/lib/services/currencyService';

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

export default function OrganizationManagementPage() {
  const { activeOrgId, activeOrg, permissions, refreshOrgs } = useOrg();
  const { user } = useAuth();
  const queryClient = useQueryClient();

  // Active tab state
  const [activeTab, setActiveTab] = useState<'members' | 'invitations' | 'settings'>('members');

  // Organization name editing
  const [isEditingName, setIsEditingName] = useState(false);
  const [editedOrgName, setEditedOrgName] = useState(activeOrg?.name || '');
  const [isSavingName, setIsSavingName] = useState(false);

  // Organization profile settings
  const [currencyCode, setCurrencyCode] = useState<CurrencyCode>(
    ((activeOrg?.currency_code as CurrencyCode | undefined) || 'GBP')
  );
  const [companyDomain, setCompanyDomain] = useState(activeOrg?.company_domain || '');
  const [companyWebsite, setCompanyWebsite] = useState(activeOrg?.company_website || '');
  const [isSavingProfile, setIsSavingProfile] = useState(false);

  // Team members state
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [isLoadingMembers, setIsLoadingMembers] = useState(true);
  const [showRemovedMembers, setShowRemovedMembers] = useState(true);

  // Invitations state
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [isLoadingInvites, setIsLoadingInvites] = useState(true);
  const [newInviteEmail, setNewInviteEmail] = useState('');
  const [newInviteRole, setNewInviteRole] = useState<'admin' | 'member'>('member');
  const [isSendingInvite, setIsSendingInvite] = useState(false);

  // Join requests section collapse state
  const [isJoinRequestsExpanded, setIsJoinRequestsExpanded] = useState(true);

  // Leave team state
  const [isLeavingTeam, setIsLeavingTeam] = useState(false);
  const [isOwner, setIsOwner] = useState(false);
  const [showLeaveConfirmation, setShowLeaveConfirmation] = useState(false);

  // Update org name when activeOrg changes
  useEffect(() => {
    setEditedOrgName(activeOrg?.name || '');
    setCurrencyCode(((activeOrg?.currency_code as CurrencyCode | undefined) || 'GBP'));
    setCompanyDomain(activeOrg?.company_domain || '');
    setCompanyWebsite(activeOrg?.company_website || '');
  }, [activeOrg]);

  // Helper function to sort members by role hierarchy
  const sortMembersByRole = (membersList: TeamMember[]): TeamMember[] => {
    const roleOrder = { owner: 1, admin: 2, member: 3, readonly: 4 };
    return [...membersList].sort((a, b) => {
      const roleComparison = roleOrder[a.role] - roleOrder[b.role];
      if (roleComparison === 0) {
        return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
      }
      return roleComparison;
    });
  };

  // Filter members based on showRemovedMembers toggle
  const filteredMembers = showRemovedMembers
    ? members
    : members.filter((m) => m.member_status !== 'removed');

  // Helper to check if a removed member has a pending rejoin request
  const hasPendingRejoin = (userId: string): boolean => {
    return rejoinRequests.some((req: any) => req.user_id === userId && req.status === 'pending');
  };

  // Fetch join requests
  const { data: joinRequests = [], isLoading: isLoadingJoinRequests } = useQuery({
    queryKey: ['join-requests', activeOrgId],
    queryFn: async () => {
      if (!activeOrgId) return [];
      return await getPendingJoinRequests(activeOrgId);
    },
    enabled: !!activeOrgId && !!user?.id,
    retry: 2,
  });

  // Fetch rejoin requests
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

      if (error?.code === 'PGRST116' || error?.code === '42P01') {
        return [];
      }

      if (error) throw error;

      return data || [];
    },
    enabled: !!activeOrgId && !!user?.id && permissions.canManageTeam,
    retry: 2,
  });

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

  // Approve rejoin mutation
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
      window.location.reload();
    },
    onError: (error: any) => {
      toast.error(error?.message || 'Failed to approve rejoin request');
    },
  });

  // Reject rejoin mutation
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
        let memberships: any[] = [];

        const { data: dataWithOrgrem, error: errorWithOrgrem } = await supabase
          .from('organization_memberships')
          .select('user_id, role, created_at, member_status, removed_at, removed_by')
          .eq('org_id', activeOrgId)
          .order('created_at', { ascending: true });

        if (!errorWithOrgrem && dataWithOrgrem) {
          memberships = dataWithOrgrem;
        } else if (errorWithOrgrem?.code === '42703') {
          const { data: basicData, error: basicError } = await supabase
            .from('organization_memberships')
            .select('user_id, role, created_at')
            .eq('org_id', activeOrgId)
            .order('created_at', { ascending: true });

          if (basicError) throw basicError;
          memberships = basicData || [];
        } else {
          throw errorWithOrgrem;
        }

        if (!memberships?.length) {
          setMembers([]);
          return;
        }

        const userIds = memberships.map((m) => m.user_id);

        const { data: profiles, error: profileError } = await supabase
          .from('profiles')
          .select('id, email, first_name, last_name, avatar_url')
          .in('id', userIds);

        if (profileError) throw profileError;

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

        const membersWithProfiles = memberships.map((m) => ({
          user_id: m.user_id,
          role: m.role as 'owner' | 'admin' | 'member' | 'readonly',
          created_at: m.created_at,
          member_status: (m.member_status || 'active') as 'active' | 'removed' | undefined,
          removed_at: m.removed_at || null,
          removed_by: m.removed_by || null,
          user: profileMap.get(m.user_id) || null,
        }));

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

  // Handle saving org name
  const handleSaveOrgName = async () => {
    if (!activeOrgId || !editedOrgName.trim()) return;

    setIsSavingName(true);
    try {
      const response = await (supabase.rpc as any)('rename_user_organization', {
        p_new_name: editedOrgName.trim(),
      }) as { error: any };

      if (response.error) throw response.error;

      toast.success('Organization name updated');
      await refreshOrgs();
      setIsEditingName(false);
    } catch (err: any) {
      toast.error(err.message || 'Failed to update organization name');
    } finally {
      setIsSavingName(false);
    }
  };

  // Handle saving org profile
  const handleSaveOrgProfile = async () => {
    if (!activeOrgId) return;
    if (!permissions.canManageSettings) return;

    setIsSavingProfile(true);
    try {
      const locale = CURRENCIES[currencyCode]?.locale || 'en-GB';
      const payload = {
        currency_code: currencyCode,
        currency_locale: locale,
        company_domain: companyDomain.trim() ? companyDomain.trim() : null,
        company_website: companyWebsite.trim() ? companyWebsite.trim() : null,
        updated_at: new Date().toISOString(),
      };

      const { error } = await (supabase as any)
        .from('organizations')
        .update(payload)
        .eq('id', activeOrgId);

      if (error) throw error;
      toast.success('Organization settings saved');
      await refreshOrgs();
    } catch (err: any) {
      toast.error(err?.message || 'Failed to save organization settings');
    } finally {
      setIsSavingProfile(false);
    }
  };

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

  // Handle removing member
  const handleRemoveMember = async (userId: string) => {
    if (!activeOrgId) return;

    if (userId === user?.id) {
      toast.error("You can't remove yourself");
      return;
    }

    const member = members.find((m) => m.user_id === userId);
    if (!member) return;

    const memberName = member.user?.full_name || member.user?.email || 'this user';
    const confirmMessage = `Remove ${memberName} from the organization?\n\nImportant:\n• Their account will remain active\n• All data they created will be preserved\n• They can view their data but not edit it\n• They can request to rejoin later\n• They will be notified via email`;

    if (!window.confirm(confirmMessage)) return;

    try {
      const { data, error } = await supabase.rpc('remove_user_from_org', {
        p_org_id: activeOrgId,
        p_user_id: userId,
      });

      if (error) throw error;

      if (!data?.success) {
        throw new Error(data?.error || 'Failed to remove user');
      }

      toast.success('User removed successfully. They will be notified via email.');

      const { data: orgData } = await supabase
        .from('organizations')
        .select('name')
        .eq('id', activeOrgId)
        .single();

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
      });

      setMembers(
        members.map((m) =>
          m.user_id === userId ? { ...m, member_status: 'removed' as const } : m
        )
      );

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

      const updatedMembers = members.map((m) => (m.user_id === userId ? { ...m, role: newRole } : m));
      setMembers(sortMembersByRole(updatedMembers));
    } catch (err: any) {
      toast.error(err.message || 'Failed to update role');
    }
  };

  // Handle leaving the team
  const handleLeaveTeam = () => {
    if (!activeOrgId || !user?.id) return;

    if (isOwner) {
      toast.error(
        'You are the last owner of this organization. Please transfer ownership to another member before leaving.'
      );
      return;
    }

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
      setTimeout(() => {
        window.location.reload();
      }, 1000);
    } else {
      toast.error(result.error || 'Failed to leave organization');
      setIsLeavingTeam(false);
      setShowLeaveConfirmation(false);
    }
  };

  // Handle ownership transfer
  const handleTransferOwnership = async (newOwnerId: string) => {
    if (!activeOrgId || !user?.id) return;

    const newOwner = members.find((m) => m.user_id === newOwnerId);
    if (!newOwner) return;

    const confirmMessage = `Are you sure you want to transfer ownership to ${newOwner.user?.full_name || newOwner.user?.email}? You will become an admin.`;
    if (!window.confirm(confirmMessage)) return;

    try {
      const { error: promoteError } = await supabase
        .from('organization_memberships')
        .update({ role: 'owner' })
        .eq('org_id', activeOrgId)
        .eq('user_id', newOwnerId);

      if (promoteError) throw promoteError;

      const { error: demoteError } = await supabase
        .from('organization_memberships')
        .update({ role: 'admin' })
        .eq('org_id', activeOrgId)
        .eq('user_id', user.id);

      if (demoteError) {
        await supabase
          .from('organization_memberships')
          .update({ role: newOwner.role })
          .eq('org_id', activeOrgId)
          .eq('user_id', newOwnerId);
        throw demoteError;
      }

      toast.success(`Ownership transferred to ${newOwner.user?.full_name || newOwner.user?.email}`);

      const updatedMembers = members.map((m) => {
        if (m.user_id === newOwnerId) return { ...m, role: 'owner' as const };
        if (m.user_id === user.id) return { ...m, role: 'admin' as const };
        return m;
      });
      setMembers(sortMembersByRole(updatedMembers));

      setTimeout(() => {
        window.location.reload();
      }, 1500);
    } catch (err: any) {
      toast.error(err.message || 'Failed to transfer ownership');
    }
  };

  // Calculate member counts for stats
  const activeMemberCount = members.filter(m => m.member_status !== 'removed').length;
  const pendingCount = invitations.length;

  if (!activeOrgId) {
    return (
      <SettingsPageWrapper
        title="Organization Management"
        description="Manage your organization, team members, and settings"
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
      title="Organization Management"
      description="Manage your organization, team members, and settings"
    >
      <div className="space-y-6">
        {/* Organization Header */}
        <div className="relative overflow-hidden bg-gradient-to-br from-gray-900/50 to-gray-800/30 dark:from-gray-800/50 dark:to-gray-900/30 border border-gray-200 dark:border-gray-800 rounded-2xl p-8 backdrop-blur-xl">
          {/* Accent gradient bar at top */}
          <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-[#37bd7e] via-purple-500 to-[#37bd7e]" />

          <div className="flex items-start justify-between gap-6 flex-wrap">
            {/* Organization Identity */}
            <div className="flex items-center gap-5">
              {/* Organization Logo */}
              <div className="w-16 h-16 sm:w-20 sm:h-20 bg-gradient-to-br from-[#37bd7e] to-[#2da76c] rounded-2xl flex items-center justify-center flex-shrink-0 shadow-lg shadow-[#37bd7e]/20">
                <span className="text-2xl sm:text-3xl font-bold text-white">
                  {activeOrg?.name?.split(' ').map(w => w[0]).join('').substring(0, 2).toUpperCase() || 'ORG'}
                </span>
              </div>

              {/* Organization Info */}
              <div>
                {isEditingName ? (
                  <div className="flex items-center gap-3">
                    <input
                      type="text"
                      value={editedOrgName}
                      onChange={(e) => setEditedOrgName(e.target.value)}
                      className="bg-white dark:bg-gray-800/50 border border-gray-300 dark:border-gray-700/50 rounded-xl px-4 py-2 text-gray-900 dark:text-white focus:ring-2 focus:ring-[#37bd7e] focus:border-transparent"
                      maxLength={100}
                      placeholder="Organization name"
                    />
                    <Button
                      onClick={handleSaveOrgName}
                      disabled={isSavingName || !editedOrgName.trim()}
                      size="sm"
                      className="bg-[#37bd7e] hover:bg-[#2da76c]"
                    >
                      {isSavingName ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                    </Button>
                    <Button
                      onClick={() => {
                        setIsEditingName(false);
                        setEditedOrgName(activeOrg?.name || '');
                      }}
                      variant="ghost"
                      size="sm"
                    >
                      <X className="w-4 h-4" />
                    </Button>
                  </div>
                ) : (
                  <>
                    <div className="flex items-center gap-3">
                      <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-white">
                        {activeOrg?.name}
                      </h1>
                      {permissions.canManageSettings && (
                        <button
                          onClick={() => {
                            setEditedOrgName(activeOrg?.name || '');
                            setIsEditingName(true);
                          }}
                          className="p-2 text-gray-500 dark:text-gray-400 hover:text-[#37bd7e] dark:hover:text-[#37bd7e] transition-colors rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800/50"
                          title="Edit organization name"
                        >
                          <Edit2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                    <div className="flex items-center gap-4 mt-2 text-sm text-gray-600 dark:text-gray-400">
                      {activeOrg?.company_domain && (
                        <span className="flex items-center gap-1.5">
                          <Globe className="w-4 h-4 text-[#37bd7e]" />
                          {activeOrg.company_domain}
                        </span>
                      )}
                      {activeOrg?.company_website && (
                        <span className="flex items-center gap-1.5">
                          <Globe className="w-4 h-4 text-[#37bd7e]" />
                          <a
                            href={activeOrg.company_website}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="hover:text-[#37bd7e] transition-colors"
                          >
                            {activeOrg.company_website.replace(/^https?:\/\//, '')}
                          </a>
                        </span>
                      )}
                    </div>
                  </>
                )}
              </div>
            </div>

            {/* Organization Stats */}
            <div className="flex gap-3">
              <div className="bg-white/10 dark:bg-gray-800/50 backdrop-blur-sm border border-gray-300 dark:border-gray-700/50 rounded-xl px-6 py-3 text-center min-w-[100px]">
                <div className="text-2xl sm:text-3xl font-bold text-[#37bd7e]">
                  {activeMemberCount}
                </div>
                <div className="text-xs text-gray-600 dark:text-gray-400 uppercase tracking-wide mt-1">
                  Members
                </div>
              </div>
              <div className="bg-white/10 dark:bg-gray-800/50 backdrop-blur-sm border border-gray-300 dark:border-gray-700/50 rounded-xl px-6 py-3 text-center min-w-[100px]">
                <div className="text-2xl sm:text-3xl font-bold text-[#37bd7e]">
                  {pendingCount}
                </div>
                <div className="text-xs text-gray-600 dark:text-gray-400 uppercase tracking-wide mt-1">
                  Pending
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="bg-white dark:bg-gray-900/50 border border-gray-200 dark:border-gray-800 rounded-2xl p-1.5 backdrop-blur-xl">
          <div className="flex gap-1">
            <button
              onClick={() => setActiveTab('members')}
              className={`flex-1 min-w-[140px] px-5 py-3 rounded-xl font-medium text-sm transition-all ${
                activeTab === 'members'
                  ? 'bg-gradient-to-r from-[#37bd7e] to-[#2da76c] text-white shadow-lg shadow-[#37bd7e]/30'
                  : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-gray-800/50'
              }`}
            >
              <div className="flex items-center justify-center gap-2">
                <Users className="w-4 h-4" />
                Team Members
              </div>
            </button>
            <button
              onClick={() => setActiveTab('invitations')}
              className={`flex-1 min-w-[140px] px-5 py-3 rounded-xl font-medium text-sm transition-all ${
                activeTab === 'invitations'
                  ? 'bg-gradient-to-r from-[#37bd7e] to-[#2da76c] text-white shadow-lg shadow-[#37bd7e]/30'
                  : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-gray-800/50'
              }`}
            >
              <div className="flex items-center justify-center gap-2">
                <Mail className="w-4 h-4" />
                Invitations
                {pendingCount > 0 && (
                  <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${
                    activeTab === 'invitations'
                      ? 'bg-white/20'
                      : 'bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300'
                  }`}>
                    {pendingCount}
                  </span>
                )}
              </div>
            </button>
            <button
              onClick={() => setActiveTab('settings')}
              className={`flex-1 min-w-[140px] px-5 py-3 rounded-xl font-medium text-sm transition-all ${
                activeTab === 'settings'
                  ? 'bg-gradient-to-r from-[#37bd7e] to-[#2da76c] text-white shadow-lg shadow-[#37bd7e]/30'
                  : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-gray-800/50'
              }`}
            >
              <div className="flex items-center justify-center gap-2">
                <Building2 className="w-4 h-4" />
                Settings
              </div>
            </button>
          </div>
        </div>

        {/* Tab Content - Team Members */}
        {activeTab === 'members' && (
          <div className="space-y-6">
            {/* Invite New Members */}
            {permissions.canManageTeam && (
              <div className="bg-white dark:bg-gray-900/50 border border-gray-200 dark:border-gray-800 rounded-2xl p-6 backdrop-blur-xl">
                <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
                  <UserPlus className="w-5 h-5 text-[#37bd7e]" />
                  Invite Team Members
                </h2>
                <form onSubmit={handleSendInvite} className="flex gap-3 flex-wrap">
                  <div className="flex-1 min-w-[250px] relative">
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
                    className="bg-white dark:bg-gray-800/50 border border-gray-300 dark:border-gray-700/50 rounded-xl px-4 py-2.5 text-gray-900 dark:text-white focus:ring-2 focus:ring-[#37bd7e] focus:border-transparent disabled:opacity-50 min-w-[140px]"
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
                      <>
                        <UserPlus className="w-4 h-4 mr-2" />
                        Send Invite
                      </>
                    )}
                  </Button>
                </form>
              </div>
            )}

            {/* Team Members List */}
            <div className="bg-white dark:bg-gray-900/50 border border-gray-200 dark:border-gray-800 rounded-2xl overflow-hidden backdrop-blur-xl">
              <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-800">
                <h2 className="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2">
                  <Users className="w-5 h-5 text-[#37bd7e]" />
                  Team Members
                </h2>
                <div className="flex items-center gap-4">
                  {!isOwner && (
                    <button
                      onClick={handleLeaveTeam}
                      disabled={isLeavingTeam}
                      className="px-3 py-1.5 rounded-lg bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300 hover:bg-red-200 dark:hover:bg-red-900/50 transition-all border border-red-300 dark:border-red-700/50 font-medium text-sm flex items-center gap-2 disabled:opacity-50"
                    >
                      <LogOut className="w-3.5 h-3.5" />
                      Leave Team
                    </button>
                  )}
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
                <div className="divide-y divide-gray-200 dark:divide-gray-800">
                  {filteredMembers.map((member) => (
                    <div
                      key={member.user_id}
                      className={`flex items-center justify-between px-6 py-4 hover:bg-gray-50 dark:hover:bg-gray-800/30 transition-colors ${
                        member.member_status === 'removed' ? 'opacity-60 bg-gray-50/50 dark:bg-gray-800/20' : ''
                      }`}
                    >
                      <div className="flex items-center gap-4">
                        <Avatar className={`h-12 w-12 ${member.member_status === 'removed' ? 'opacity-60' : ''}`}>
                          {member.user?.avatar_url && (
                            <AvatarImage src={member.user.avatar_url} />
                          )}
                          <AvatarFallback className="bg-gradient-to-br from-[#37bd7e] to-[#2da76c] text-white font-semibold">
                            {member.user?.full_name?.[0]}
                            {member.user?.full_name?.split(' ')[1]?.[0]}
                          </AvatarFallback>
                        </Avatar>
                        <div>
                          <div className="flex items-center gap-2 flex-wrap">
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
                        {member.member_status === 'removed' ? (
                          <span
                            className={`px-3 py-1 rounded-full text-xs font-medium border ${roleColors[member.role]}`}
                          >
                            {roleLabels[member.role]}
                          </span>
                        ) : (
                          <>
                            {permissions.isOwner && member.user_id !== user?.id ? (
                              <>
                                {member.role === 'owner' ? (
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
                              <span
                                className={`px-3 py-1 rounded-full text-xs font-medium border ${roleColors[member.role]}`}
                              >
                                {roleLabels[member.role]}
                              </span>
                            )}
                            {permissions.canManageTeam && member.role !== 'owner' && member.user_id !== user?.id && (
                              <button
                                onClick={() => handleRemoveMember(member.user_id)}
                                className="p-2 text-gray-500 dark:text-gray-400 hover:text-red-500 dark:hover:text-red-400 transition-colors rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20"
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
              )}
            </div>

            {/* Pending Join & Rejoin Requests */}
            {permissions.canManageTeam && (
              <div className="bg-white dark:bg-gray-900/50 border border-gray-200 dark:border-gray-800 rounded-2xl overflow-hidden backdrop-blur-xl">
                <button
                  onClick={() => setIsJoinRequestsExpanded(!isJoinRequestsExpanded)}
                  className="w-full flex items-center justify-between px-6 py-4 hover:bg-gray-50 dark:hover:bg-gray-800/30 transition-colors"
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
                    <ChevronUp className="w-5 h-5 text-gray-500" />
                  ) : (
                    <ChevronDown className="w-5 h-5 text-gray-500" />
                  )}
                </button>

                {isJoinRequestsExpanded && (
                  <div className="border-t border-gray-200 dark:border-gray-800">
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
                                className="p-2 text-gray-500 dark:text-gray-400 hover:text-green-600 dark:hover:text-green-400 transition-colors disabled:opacity-50 rounded-lg hover:bg-green-50 dark:hover:bg-green-900/20"
                                title="Approve request and grant immediate access"
                              >
                                <Check className="w-4 h-4" />
                              </button>
                              <button
                                onClick={() => rejectMutation.mutate({ requestId: request.id })}
                                disabled={rejectMutation.isPending}
                                className="p-2 text-gray-500 dark:text-gray-400 hover:text-red-500 dark:hover:text-red-400 transition-colors disabled:opacity-50 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20"
                                title="Reject request"
                              >
                                <X className="w-4 h-4" />
                              </button>
                            </div>
                          </div>
                        ))}

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
                                className="p-2 text-gray-500 dark:text-gray-400 hover:text-green-600 dark:hover:text-green-400 transition-colors disabled:opacity-50 rounded-lg hover:bg-green-50 dark:hover:bg-green-900/20"
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
                                className="p-2 text-gray-500 dark:text-gray-400 hover:text-red-500 dark:hover:text-red-400 transition-colors disabled:opacity-50 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20"
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
          </div>
        )}

        {/* Tab Content - Invitations */}
        {activeTab === 'invitations' && (
          <div className="space-y-6">
            {/* Pending Invitations */}
            <div className="bg-white dark:bg-gray-900/50 border border-gray-200 dark:border-gray-800 rounded-2xl overflow-hidden backdrop-blur-xl">
              <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-800">
                <h2 className="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2">
                  <Clock className="w-5 h-5 text-[#37bd7e]" />
                  Pending Invitations
                </h2>
              </div>
              {isLoadingInvites ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="w-8 h-8 text-[#37bd7e] animate-spin" />
                </div>
              ) : invitations.length === 0 ? (
                <div className="text-center py-12 px-6">
                  <div className="w-16 h-16 rounded-full bg-gray-100 dark:bg-gray-800 flex items-center justify-center mx-auto mb-4">
                    <Mail className="w-8 h-8 text-gray-400" />
                  </div>
                  <h3 className="text-base font-medium text-gray-900 dark:text-white mb-2">
                    No Pending Invitations
                  </h3>
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    All invitations have been accepted or expired.
                  </p>
                </div>
              ) : (
                <div className="divide-y divide-gray-200 dark:divide-gray-800">
                  {invitations.map((invite) => (
                    <div
                      key={invite.id}
                      className="flex items-center justify-between px-6 py-4 hover:bg-gray-50 dark:hover:bg-gray-800/30 transition-colors"
                    >
                      <div className="flex items-center gap-4">
                        <div className="w-10 h-10 rounded-full bg-blue-100 dark:bg-blue-500/20 flex items-center justify-center">
                          <Mail className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                        </div>
                        <div>
                          <p className="text-gray-900 dark:text-white font-mono">{invite.email}</p>
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
                          className="p-2 text-gray-500 dark:text-gray-400 hover:text-[#37bd7e] transition-colors rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800/50"
                          title="Resend invitation"
                        >
                          <RefreshCw className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleRevokeInvite(invite.id)}
                          className="p-2 text-gray-500 dark:text-gray-400 hover:text-red-500 dark:hover:text-red-400 transition-colors rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20"
                          title="Revoke invitation"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Tab Content - Settings */}
        {activeTab === 'settings' && (
          <div className="space-y-6">
            {/* Currency & Company Profile */}
            <div className="bg-white dark:bg-gray-900/50 border border-gray-200 dark:border-gray-800 rounded-2xl p-6 space-y-6 backdrop-blur-xl">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2">
                <Building2 className="w-5 h-5 text-[#37bd7e]" />
                Currency & Company Profile
              </h2>

              {/* Currency */}
              <div className="space-y-2">
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                  Organization Currency
                </label>
                <div className="flex items-center gap-3 flex-wrap">
                  <select
                    value={currencyCode}
                    onChange={(e) => setCurrencyCode(e.target.value as CurrencyCode)}
                    disabled={!permissions.canManageSettings || isSavingProfile}
                    className="bg-white dark:bg-gray-800/50 border border-gray-300 dark:border-gray-700/50 rounded-xl px-4 py-2.5 text-gray-900 dark:text-white focus:ring-2 focus:ring-[#37bd7e] focus:border-transparent disabled:opacity-50 max-w-xs"
                  >
                    {Object.values(CURRENCIES).map((c) => (
                      <option key={c.code} value={c.code}>
                        {c.symbol} {c.code} — {c.name}
                      </option>
                    ))}
                  </select>
                  <div className="inline-flex items-center gap-2 px-4 py-2 bg-gray-100 dark:bg-gray-800/50 rounded-xl text-sm text-gray-600 dark:text-gray-400">
                    <DollarSign className="w-4 h-4" />
                    Locale: <span className="font-mono font-medium">{CURRENCIES[currencyCode]?.locale || 'en-GB'}</span>
                  </div>
                </div>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  This changes how money is displayed across your organization (no automatic conversion).
                </p>
              </div>

              {/* Company domain / website */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                    Company Domain
                  </label>
                  <input
                    type="text"
                    value={companyDomain}
                    onChange={(e) => setCompanyDomain(e.target.value)}
                    placeholder="example.com"
                    disabled={!permissions.canManageSettings || isSavingProfile}
                    className="w-full bg-white dark:bg-gray-800/50 border border-gray-300 dark:border-gray-700/50 rounded-xl px-4 py-2.5 text-gray-900 dark:text-white focus:ring-2 focus:ring-[#37bd7e] focus:border-transparent disabled:opacity-50"
                  />
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    Used for company enrichment on signup and for org context.
                  </p>
                </div>
                <div className="space-y-2">
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                    Company Website
                  </label>
                  <input
                    type="text"
                    value={companyWebsite}
                    onChange={(e) => setCompanyWebsite(e.target.value)}
                    placeholder="https://example.com"
                    disabled={!permissions.canManageSettings || isSavingProfile}
                    className="w-full bg-white dark:bg-gray-800/50 border border-gray-300 dark:border-gray-700/50 rounded-xl px-4 py-2.5 text-gray-900 dark:text-white focus:ring-2 focus:ring-[#37bd7e] focus:border-transparent disabled:opacity-50"
                  />
                </div>
              </div>

              {/* Actions */}
              <div className="flex flex-wrap items-center gap-3">
                <Button
                  onClick={handleSaveOrgProfile}
                  disabled={!permissions.canManageSettings || isSavingProfile}
                  className="bg-[#37bd7e] hover:bg-[#2da76c]"
                >
                  {isSavingProfile ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Saving…
                    </>
                  ) : (
                    <>
                      <Check className="w-4 h-4 mr-2" />
                      Save Settings
                    </>
                  )}
                </Button>
              </div>
            </div>

            {/* Info Section */}
            <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-xl p-5 backdrop-blur-xl">
              <div className="flex gap-3">
                <AlertCircle className="w-5 h-5 text-blue-600 dark:text-blue-400 flex-shrink-0 mt-0.5" />
                <div>
                  <h3 className="font-medium text-blue-900 dark:text-blue-100 mb-1">Organization Information</h3>
                  <p className="text-sm text-blue-700 dark:text-blue-300">
                    Your organization name is visible to all members and appears in various parts of the application.
                    Only organization admins can modify these settings. For AI context and personalization, visit the AI Intelligence settings page.
                  </p>
                </div>
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
