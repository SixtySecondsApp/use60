import { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Building2,
  Search,
  Edit2,
  Trash2,
  Users,
  ToggleRight,
  ChevronRight,
  Loader2,
  Shield,
  UserPlus,
  AlertCircle,
  X,
  Check,
  Lock,
} from 'lucide-react';
import { BackToPlatform } from '@/components/platform/BackToPlatform';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import {
  getAllOrganizations,
  renameOrganization,
  toggleOrganizationStatus,
  removeOrganizationMember,
  changeOrganizationMemberRole,
  addOrganizationMember,
  getOrganizationMembers,
  type OrganizationWithMemberCount,
} from '@/lib/services/organizationAdminService';

interface EditingState {
  orgId: string;
  field: 'name' | 'members';
  value?: string;
}

export default function Organizations() {
  const [organizations, setOrganizations] = useState<OrganizationWithMemberCount[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [editingState, setEditingState] = useState<EditingState | null>(null);
  const [expandedOrg, setExpandedOrg] = useState<string | null>(null);
  const [orgMembers, setOrgMembers] = useState<Record<string, any[]>>({});
  const [loadingMembers, setLoadingMembers] = useState<Record<string, boolean>>({});
  const [newMemberEmail, setNewMemberEmail] = useState('');
  const [newMemberRole, setNewMemberRole] = useState<'admin' | 'member' | 'readonly'>('member');

  // Load organizations
  useEffect(() => {
    loadOrganizations();
  }, []);

  async function loadOrganizations() {
    try {
      setIsLoading(true);
      const data = await getAllOrganizations();
      setOrganizations(data);
    } catch (error: any) {
      toast.error('Failed to load organizations');
      console.error(error);
    } finally {
      setIsLoading(false);
    }
  }

  async function loadOrgMembers(orgId: string) {
    if (orgMembers[orgId]) return; // Already loaded

    try {
      setLoadingMembers((prev) => ({ ...prev, [orgId]: true }));
      const members = await getOrganizationMembers(orgId);
      setOrgMembers((prev) => ({ ...prev, [orgId]: members }));
    } catch (error) {
      toast.error('Failed to load members');
      console.error(error);
    } finally {
      setLoadingMembers((prev) => ({ ...prev, [orgId]: false }));
    }
  }

  const filteredOrgs = useMemo(() => {
    return organizations.filter((org) =>
      org.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      org.company_domain?.toLowerCase().includes(searchQuery.toLowerCase())
    );
  }, [organizations, searchQuery]);

  async function handleRename(orgId: string, newName: string) {
    if (!newName.trim()) {
      toast.error('Organization name cannot be empty');
      return;
    }

    try {
      const result = await renameOrganization(orgId, newName.trim());
      if (result.success) {
        setOrganizations((prev) =>
          prev.map((org) => (org.id === orgId ? { ...org, name: newName.trim() } : org))
        );
        toast.success('Organization renamed');
        setEditingState(null);
      } else {
        toast.error(result.error || 'Failed to rename organization');
      }
    } catch (error: any) {
      toast.error(error.message);
    }
  }

  async function handleToggleStatus(orgId: string, newStatus: boolean) {
    try {
      const result = await toggleOrganizationStatus(orgId, newStatus);
      if (result.success) {
        setOrganizations((prev) =>
          prev.map((org) => (org.id === orgId ? { ...org, is_active: newStatus } : org))
        );
        toast.success(newStatus ? 'Organization activated' : 'Organization deactivated');
      } else {
        toast.error(result.error || 'Failed to update status');
      }
    } catch (error: any) {
      toast.error(error.message);
    }
  }

  async function handleRemoveMember(orgId: string, userId: string) {
    try {
      const result = await removeOrganizationMember(orgId, userId);
      if (result.success) {
        setOrgMembers((prev) => ({
          ...prev,
          [orgId]: (prev[orgId] || []).filter((m) => m.user_id !== userId),
        }));
        toast.success('Member removed');
      } else {
        toast.error(result.error || 'Failed to remove member');
      }
    } catch (error: any) {
      toast.error(error.message);
    }
  }

  async function handleChangeRole(
    orgId: string,
    userId: string,
    newRole: 'owner' | 'admin' | 'member' | 'readonly'
  ) {
    try {
      const result = await changeOrganizationMemberRole(orgId, userId, newRole);
      if (result.success) {
        setOrgMembers((prev) => ({
          ...prev,
          [orgId]: (prev[orgId] || []).map((m) =>
            m.user_id === userId ? { ...m, role: newRole } : m
          ),
        }));
        toast.success('Member role updated');
      } else {
        toast.error(result.error || 'Failed to update role');
      }
    } catch (error: any) {
      toast.error(error.message);
    }
  }

  async function handleAddMember(orgId: string) {
    if (!newMemberEmail.trim()) {
      toast.error('Email cannot be empty');
      return;
    }

    try {
      const result = await addOrganizationMember(orgId, newMemberEmail.trim(), newMemberRole);
      if (result.success) {
        // Reload members
        setOrgMembers((prev) => ({ ...prev, [orgId]: [] }));
        await loadOrgMembers(orgId);
        setNewMemberEmail('');
        setNewMemberRole('member');
        toast.success('Member added');
      } else {
        toast.error(result.error || 'Failed to add member');
      }
    } catch (error: any) {
      toast.error(error.message);
    }
  }

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-950">
        <div className="text-center">
          <Loader2 className="w-8 h-8 text-[#37bd7e] animate-spin mx-auto mb-4" />
          <p className="text-gray-600 dark:text-gray-400">Loading organizations...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950 p-4 sm:p-8">
      <div className="max-w-6xl mx-auto space-y-6">
        {/* Back Button */}
        <BackToPlatform />

        {/* Header */}
        <div>
          <div className="flex items-center gap-3 mb-2">
            <Building2 className="w-8 h-8 text-[#37bd7e]" />
            <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Organizations</h1>
          </div>
          <p className="text-gray-600 dark:text-gray-400">Manage all organizations and their members</p>
        </div>

        {/* Search */}
        <div className="flex items-center gap-2 bg-white dark:bg-gray-900/50 border border-gray-200 dark:border-gray-800 rounded-xl px-4 py-3">
          <Search className="w-5 h-5 text-gray-400" />
          <input
            type="text"
            placeholder="Search by name or domain..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="flex-1 bg-transparent outline-none text-gray-900 dark:text-white placeholder-gray-400"
          />
        </div>

        {/* Organizations List */}
        <div className="space-y-3">
          {filteredOrgs.length === 0 ? (
            <div className="text-center py-12 bg-white dark:bg-gray-900/50 rounded-xl border border-gray-200 dark:border-gray-800">
              <Building2 className="w-12 h-12 text-gray-400 mx-auto mb-4" />
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
                No organizations found
              </h3>
              <p className="text-gray-600 dark:text-gray-400">
                {searchQuery ? 'Try adjusting your search' : 'No organizations to display'}
              </p>
            </div>
          ) : (
            filteredOrgs.map((org) => (
              <motion.div
                key={org.id}
                layout
                className="bg-white dark:bg-gray-900/50 border border-gray-200 dark:border-gray-800 rounded-xl overflow-hidden hover:shadow-md transition-shadow"
              >
                {/* Org Header */}
                <div className="p-6">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-2">
                        {editingState?.orgId === org.id && editingState.field === 'name' ? (
                          <input
                            type="text"
                            defaultValue={org.name}
                            autoFocus
                            className="text-xl font-bold text-gray-900 dark:text-white bg-gray-100 dark:bg-gray-800 px-3 py-1 rounded"
                            onBlur={(e) => {
                              if (e.target.value !== org.name) {
                                handleRename(org.id, e.target.value);
                              } else {
                                setEditingState(null);
                              }
                            }}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                handleRename(org.id, e.currentTarget.value);
                              } else if (e.key === 'Escape') {
                                setEditingState(null);
                              }
                            }}
                          />
                        ) : (
                          <>
                            <h3 className="text-xl font-bold text-gray-900 dark:text-white">{org.name}</h3>
                            {!org.is_active && (
                              <span className="px-2 py-1 rounded-full text-xs font-medium bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400">
                                Inactive
                              </span>
                            )}
                          </>
                        )}
                      </div>

                      <div className="flex flex-wrap gap-4 text-sm text-gray-600 dark:text-gray-400">
                        {org.company_domain && (
                          <div>Domain: {org.company_domain}</div>
                        )}
                        <div className="flex items-center gap-1">
                          <Users className="w-4 h-4" />
                          {org.member_count} members
                        </div>
                        {org.owner && (
                          <div>
                            Owner: {org.owner.first_name} {org.owner.last_name || org.owner.email}
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => setEditingState({ orgId: org.id, field: 'name' })}
                        className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors"
                        title="Edit name"
                      >
                        <Edit2 className="w-4 h-4 text-gray-600 dark:text-gray-400" />
                      </button>

                      <button
                        onClick={() => handleToggleStatus(org.id, !org.is_active)}
                        className={cn(
                          'p-2 rounded-lg transition-colors',
                          org.is_active
                            ? 'hover:bg-yellow-100 dark:hover:bg-yellow-900/30'
                            : 'hover:bg-green-100 dark:hover:bg-green-900/30'
                        )}
                        title={org.is_active ? 'Deactivate' : 'Activate'}
                      >
                        <ToggleRight className="w-4 h-4 text-gray-600 dark:text-gray-400" />
                      </button>

                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <button className="p-2 hover:bg-red-100 dark:hover:bg-red-900/30 rounded-lg transition-colors">
                            <Trash2 className="w-4 h-4 text-red-600 dark:text-red-400" />
                          </button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Delete Organization</AlertDialogTitle>
                            <AlertDialogDescription>
                              Are you sure you want to delete "{org.name}"? This action cannot be undone.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                            <AlertDialogAction className="bg-red-600 hover:bg-red-700">
                              Delete
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>

                      <button
                        onClick={() => {
                          setExpandedOrg(expandedOrg === org.id ? null : org.id);
                          if (expandedOrg !== org.id) {
                            loadOrgMembers(org.id);
                          }
                        }}
                        className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors"
                      >
                        <ChevronRight
                          className={cn(
                            'w-4 h-4 text-gray-600 dark:text-gray-400 transition-transform',
                            expandedOrg === org.id && 'rotate-90'
                          )}
                        />
                      </button>
                    </div>
                  </div>
                </div>

                {/* Expanded Members Section */}
                <AnimatePresence>
                  {expandedOrg === org.id && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      className="border-t border-gray-200 dark:border-gray-800 p-6 space-y-4"
                    >
                      {/* Add Member Form */}
                      <div className="space-y-3">
                        <h4 className="font-semibold text-gray-900 dark:text-white flex items-center gap-2">
                          <UserPlus className="w-4 h-4" />
                          Add Member
                        </h4>
                        <div className="flex gap-2">
                          <input
                            type="email"
                            placeholder="user@example.com"
                            value={newMemberEmail}
                            onChange={(e) => setNewMemberEmail(e.target.value)}
                            className="flex-1 bg-gray-100 dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-lg px-3 py-2 text-sm"
                          />
                          <select
                            value={newMemberRole}
                            onChange={(e) =>
                              setNewMemberRole(e.target.value as 'admin' | 'member' | 'readonly')
                            }
                            className="bg-gray-100 dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-lg px-3 py-2 text-sm"
                          >
                            <option value="member">Member</option>
                            <option value="admin">Admin</option>
                            <option value="readonly">Read-only</option>
                          </select>
                          <Button
                            onClick={() => handleAddMember(org.id)}
                            className="bg-[#37bd7e] hover:bg-[#2da76c]"
                            size="sm"
                          >
                            Add
                          </Button>
                        </div>
                      </div>

                      {/* Members List */}
                      {loadingMembers[org.id] ? (
                        <div className="text-center py-8">
                          <Loader2 className="w-5 h-5 text-[#37bd7e] animate-spin mx-auto" />
                        </div>
                      ) : (orgMembers[org.id] || []).length === 0 ? (
                        <p className="text-sm text-gray-600 dark:text-gray-400">No members in this organization</p>
                      ) : (
                        <div className="space-y-2">
                          {(orgMembers[org.id] || []).map((member) => (
                            <div
                              key={member.user_id}
                              className="flex items-center justify-between p-3 bg-gray-100 dark:bg-gray-800 rounded-lg"
                            >
                              <div className="flex-1">
                                <p className="font-medium text-gray-900 dark:text-white text-sm">
                                  {member.profiles?.first_name} {member.profiles?.last_name}
                                </p>
                                <p className="text-xs text-gray-600 dark:text-gray-400">
                                  {member.profiles?.email}
                                </p>
                              </div>
                              <div className="flex items-center gap-2">
                                <select
                                  value={member.role}
                                  onChange={(e) =>
                                    handleChangeRole(
                                      org.id,
                                      member.user_id,
                                      e.target.value as 'owner' | 'admin' | 'member' | 'readonly'
                                    )
                                  }
                                  className="bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded px-2 py-1 text-xs"
                                >
                                  <option value="readonly">Read-only</option>
                                  <option value="member">Member</option>
                                  <option value="admin">Admin</option>
                                  <option value="owner">Owner</option>
                                </select>
                                {member.role !== 'owner' && (
                                  <button
                                    onClick={() => handleRemoveMember(org.id, member.user_id)}
                                    className="p-1 hover:bg-red-100 dark:hover:bg-red-900/30 rounded transition-colors"
                                    title="Remove member"
                                  >
                                    <X className="w-4 h-4 text-red-600 dark:text-red-400" />
                                  </button>
                                )}
                                {member.role === 'owner' && (
                                  <Shield className="w-4 h-4 text-yellow-600 dark:text-yellow-400" title="Organization owner" />
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
