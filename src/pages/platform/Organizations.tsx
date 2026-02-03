import React, { useState, useEffect, useMemo } from 'react';
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
  ArrowUpDown,
  CheckSquare,
} from 'lucide-react';
import { BackToPlatform } from '@/components/platform/BackToPlatform';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  getAllOrganizations,
  renameOrganization,
  toggleOrganizationStatus,
  removeOrganizationMember,
  changeOrganizationMemberRole,
  addOrganizationMember,
  getOrganizationMembers,
  deleteOrganization,
  type OrganizationWithMemberCount,
} from '@/lib/services/organizationAdminService';

interface EditingState {
  orgId: string;
  field: 'name' | 'members';
  value?: string;
}

type SortField = 'name' | 'company_domain' | 'member_count' | 'created_at';
type SortDirection = 'asc' | 'desc';

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

  // Multi-select state
  const [selectedOrgs, setSelectedOrgs] = useState<Set<string>>(new Set());
  const [isSelectAllChecked, setIsSelectAllChecked] = useState(false);

  // Bulk action dialogs
  const [bulkDeleteDialogOpen, setBulkDeleteDialogOpen] = useState(false);
  const [bulkToggleDialogOpen, setBulkToggleDialogOpen] = useState(false);
  const [bulkToggleTargetStatus, setBulkToggleTargetStatus] = useState<boolean | null>(null);

  // Sorting
  const [sortField, setSortField] = useState<SortField>('created_at');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');

  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;

  // Member pagination per org
  const [memberPages, setMemberPages] = useState<Record<string, number>>({});
  const membersPerPage = 5;

  // Select mode state
  const isSelectModeActive = selectedOrgs.size > 0;

  // Helper to sort members by role hierarchy
  const sortMembersByRole = (members: any[]): any[] => {
    const roleOrder = { owner: 0, admin: 1, member: 2, readonly: 3 };
    return [...members].sort(
      (a, b) => roleOrder[a.role as keyof typeof roleOrder] - roleOrder[b.role as keyof typeof roleOrder]
    );
  };

  // Helper to get paginated members for an org
  const getPaginatedMembers = (orgId: string) => {
    const members = orgMembers[orgId] || [];
    const sortedMembers = sortMembersByRole(members);
    const currentPage = memberPages[orgId] || 1;
    const startIndex = (currentPage - 1) * membersPerPage;
    const endIndex = startIndex + membersPerPage;
    return {
      members: sortedMembers.slice(startIndex, endIndex),
      currentPage,
      totalPages: Math.ceil(sortedMembers.length / membersPerPage),
      totalMembers: sortedMembers.length,
    };
  };

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
    let filtered = organizations.filter((org) =>
      org.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      org.company_domain?.toLowerCase().includes(searchQuery.toLowerCase())
    );

    // Sort
    filtered.sort((a, b) => {
      let aValue: any = a[sortField];
      let bValue: any = b[sortField];

      // Handle null/undefined values
      if (aValue == null) aValue = '';
      if (bValue == null) bValue = '';

      // Convert to string for comparison if needed
      if (typeof aValue === 'string') aValue = aValue.toLowerCase();
      if (typeof bValue === 'string') bValue = bValue.toLowerCase();

      if (aValue < bValue) return sortDirection === 'asc' ? -1 : 1;
      if (aValue > bValue) return sortDirection === 'asc' ? 1 : -1;
      return 0;
    });

    return filtered;
  }, [organizations, searchQuery, sortField, sortDirection]);

  // Paginated organizations
  const totalPages = Math.ceil(filteredOrgs.length / itemsPerPage);
  const paginatedOrgs = useMemo(() => {
    const startIndex = (currentPage - 1) * itemsPerPage;
    const endIndex = startIndex + itemsPerPage;
    return filteredOrgs.slice(startIndex, endIndex);
  }, [filteredOrgs, currentPage]);

  // Reset to page 1 when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, sortField, sortDirection]);

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

  // Multi-select handlers
  const handleSelectOrg = (orgId: string, isSelected: boolean) => {
    const newSelected = new Set(selectedOrgs);
    if (isSelected) {
      newSelected.add(orgId);
    } else {
      newSelected.delete(orgId);
    }
    setSelectedOrgs(newSelected);
  };

  const handleSelectAll = (isSelected: boolean) => {
    if (isSelected) {
      const allIds = new Set(paginatedOrgs.map((org) => org.id));
      setSelectedOrgs(allIds);
    } else {
      setSelectedOrgs(new Set());
    }
    setIsSelectAllChecked(isSelected);
  };

  // Bulk operations
  const handleBulkDelete = async () => {
    try {
      const selectedIds = Array.from(selectedOrgs);

      // Hard delete each organization
      const deletePromises = selectedIds.map((id) => deleteOrganization(id));
      const results = await Promise.all(deletePromises);

      // Check if all deletions succeeded
      const failures = results.filter((r) => !r.success);
      if (failures.length > 0) {
        throw new Error(`Failed to delete ${failures.length} organization(s)`);
      }

      // Update state - remove deleted organizations
      setOrganizations((prev) => prev.filter((org) => !selectedIds.includes(org.id)));

      setSelectedOrgs(new Set());
      setIsSelectAllChecked(false);
      setBulkDeleteDialogOpen(false);

      toast.success(`Successfully deleted ${selectedIds.length} organization${selectedIds.length === 1 ? '' : 's'} and all associated data`);
    } catch (error: any) {
      toast.error(error.message || 'Failed to delete selected organizations');
    }
  };

  const handleBulkToggle = async (newStatus: boolean) => {
    try {
      const selectedIds = Array.from(selectedOrgs);

      const togglePromises = selectedIds.map((id) => toggleOrganizationStatus(id, newStatus));
      await Promise.all(togglePromises);

      setOrganizations((prev) =>
        prev.map((org) =>
          selectedIds.includes(org.id) ? { ...org, is_active: newStatus } : org
        )
      );

      setSelectedOrgs(new Set());
      setIsSelectAllChecked(false);
      setBulkToggleDialogOpen(false);

      toast.success(
        `Successfully ${newStatus ? 'activated' : 'deactivated'} ${selectedIds.length} organizations`
      );
    } catch (error) {
      toast.error('Failed to update organization status');
    }
  };

  // Sorting
  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('asc');
    }
  };

  const getSortIcon = (field: SortField) => {
    if (sortField !== field) return <ArrowUpDown className="w-4 h-4 text-gray-400" />;
    return (
      <ArrowUpDown
        className={`w-4 h-4 ${sortDirection === 'asc' ? 'text-emerald-400' : 'text-emerald-400 rotate-180'}`}
      />
    );
  };

  // Update select all checkbox state
  useEffect(() => {
    setIsSelectAllChecked(
      selectedOrgs.size > 0 && selectedOrgs.size === paginatedOrgs.length && paginatedOrgs.length > 0
    );
  }, [selectedOrgs.size, paginatedOrgs.length]);

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
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Back Button */}
        <BackToPlatform />

        {/* Header */}
        <div>
          <div className="flex items-center gap-3 mb-2">
            <Building2 className="w-8 h-8 text-[#37bd7e]" />
            <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Organizations</h1>
          </div>
          <p className="text-gray-600 dark:text-gray-400">
            Manage all organizations and their members • {filteredOrgs.length} organization{filteredOrgs.length !== 1 ? 's' : ''}
            {filteredOrgs.length > itemsPerPage && ` • Page ${currentPage} of ${totalPages}`}
          </p>
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

        {/* Bulk Actions Bar */}
        <AnimatePresence>
          {selectedOrgs.size > 0 && (
            <motion.div
              initial={{ opacity: 0, y: -10, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -10, scale: 0.95 }}
              transition={{
                duration: 0.2,
                ease: [0.23, 1, 0.32, 1],
              }}
              className="bg-gradient-to-r from-violet-600/10 via-purple-600/10 to-violet-600/10 backdrop-blur-xl border border-violet-500/20 rounded-xl p-4 shadow-2xl shadow-violet-500/10"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="flex items-center justify-center w-8 h-8 rounded-full bg-violet-500/20 border border-violet-500/30">
                    <CheckSquare className="w-4 h-4 text-violet-400" />
                  </div>
                  <span className="text-sm font-medium text-gray-900 dark:text-white">
                    {selectedOrgs.size} selected
                  </span>
                </div>

                <div className="flex items-center gap-2">
                  <Button
                    onClick={() => setBulkToggleDialogOpen(true)}
                    variant="tertiary"
                    size="sm"
                  >
                    <ToggleRight className="w-4 h-4 mr-2" />
                    Toggle Status
                  </Button>
                  <Button onClick={() => setBulkDeleteDialogOpen(true)} variant="destructive" size="sm">
                    <Trash2 className="w-4 h-4 mr-2" />
                    Delete
                  </Button>
                  <Button
                    onClick={() => {
                      setSelectedOrgs(new Set());
                      setIsSelectAllChecked(false);
                    }}
                    variant="ghost"
                    size="sm"
                  >
                    <X className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Table */}
        <div className="bg-white dark:bg-gray-900/50 rounded-xl border border-gray-200 dark:border-gray-800 overflow-hidden shadow-[0_4px_6px_-1px_rgba(0,0,0,0.05)] dark:shadow-none">
          {filteredOrgs.length === 0 ? (
            <div className="text-center py-12">
              <Building2 className="w-12 h-12 text-gray-400 mx-auto mb-4" />
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
                No organizations found
              </h3>
              <p className="text-gray-600 dark:text-gray-400">
                {searchQuery ? 'Try adjusting your search' : 'No organizations to display'}
              </p>
            </div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <Table className="w-full">
                <TableHeader>
                  <TableRow className="border-gray-200 dark:border-gray-800">
                    {/* Checkbox Column */}
                    <TableHead className="w-12 px-2">
                      <input
                        type="checkbox"
                        checked={isSelectAllChecked}
                        onChange={(e) => handleSelectAll(e.target.checked)}
                        className="w-4 h-4 text-violet-500 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded transition-all duration-200 hover:border-violet-400 dark:hover:border-violet-400 checked:bg-violet-500 checked:border-violet-500 cursor-pointer"
                      />
                    </TableHead>

                    {/* Sortable Columns */}
                    <TableHead
                      className="cursor-pointer hover:text-gray-900 dark:hover:text-white text-gray-600 dark:text-gray-300 min-w-[150px]"
                      onClick={() => handleSort('name')}
                    >
                      <div className="flex items-center gap-2">
                        Organization Name {getSortIcon('name')}
                      </div>
                    </TableHead>

                    <TableHead
                      className="cursor-pointer hover:text-gray-900 dark:hover:text-white text-gray-600 dark:text-gray-300 hidden sm:table-cell min-w-[120px]"
                      onClick={() => handleSort('company_domain')}
                    >
                      <div className="flex items-center gap-2">
                        Domain {getSortIcon('company_domain')}
                      </div>
                    </TableHead>

                    <TableHead
                      className="cursor-pointer hover:text-gray-900 dark:hover:text-white text-gray-600 dark:text-gray-300 min-w-[100px]"
                      onClick={() => handleSort('member_count')}
                    >
                      <div className="flex items-center gap-2">
                        Members {getSortIcon('member_count')}
                      </div>
                    </TableHead>

                    <TableHead className="text-gray-600 dark:text-gray-300 hidden md:table-cell min-w-[120px]">Owner</TableHead>

                    <TableHead className="text-gray-600 dark:text-gray-300 min-w-[80px]">Status</TableHead>

                    <TableHead className="text-right text-gray-600 dark:text-gray-300 min-w-[110px]">Actions</TableHead>
                  </TableRow>
                </TableHeader>

                <TableBody>
                  {paginatedOrgs.map((org) => (
                    <React.Fragment key={org.id}>
                      <TableRow
                        onClick={() => {
                          setExpandedOrg(expandedOrg === org.id ? null : org.id);
                          if (expandedOrg !== org.id) {
                            loadOrgMembers(org.id);
                          }
                        }}
                        className={cn(
                          'border-gray-200 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-800/30 transition-colors cursor-pointer h-16',
                          selectedOrgs.has(org.id) && isSelectModeActive
                            ? 'border-violet-500/40 bg-gradient-to-r from-violet-500/10 via-purple-500/5 to-violet-500/10 shadow-lg shadow-violet-500/10 ring-1 ring-violet-500/20'
                            : ''
                        )}
                      >
                        {/* Checkbox */}
                        <TableCell
                          onClick={(e) => {
                            e.stopPropagation();
                          }}
                        >
                          <motion.div
                            initial={false}
                            animate={{
                              scale: selectedOrgs.has(org.id) ? [1, 1.1, 1] : 1,
                              opacity: selectedOrgs.has(org.id) ? 1 : 0.7,
                            }}
                            transition={{ duration: 0.2 }}
                            onClick={(e) => {
                              e.stopPropagation();
                            }}
                          >
                            <input
                              type="checkbox"
                              checked={selectedOrgs.has(org.id)}
                              onChange={(e) => {
                                e.stopPropagation();
                                handleSelectOrg(org.id, e.target.checked);
                              }}
                              className="w-4 h-4 text-violet-500 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded transition-all duration-200 hover:border-violet-400 dark:hover:border-violet-400 checked:bg-violet-500 checked:border-violet-500 cursor-pointer"
                            />
                          </motion.div>
                        </TableCell>

                        {/* Name with Logo */}
                        <TableCell>
                          <div className="flex items-center gap-3">
                            {/* Organization Logo */}
                            <div className="w-12 h-12 rounded-lg flex-shrink-0 overflow-hidden border border-gray-200 dark:border-gray-700/50 flex items-center justify-center">
                              {org.logo_url && !org.remove_logo ? (
                                <img
                                  src={org.logo_url}
                                  alt={org.name}
                                  className="w-full h-full object-cover aspect-square"
                                />
                              ) : (
                                <div className="w-full h-full bg-gradient-to-br from-[#37bd7e] to-[#2da76c] flex items-center justify-center">
                                  <span className="text-xs font-bold text-white">
                                    {org.name
                                      .split(' ')
                                      .map((w) => w[0])
                                      .join('')
                                      .toUpperCase()
                                      .slice(0, 2)}
                                  </span>
                                </div>
                              )}
                            </div>
                            <div>
                              {editingState?.orgId === org.id && editingState.field === 'name' ? (
                                <input
                                  type="text"
                                  defaultValue={org.name}
                                  autoFocus
                                  className="font-medium text-gray-900 dark:text-white bg-gray-100 dark:bg-gray-800 px-2 py-1 rounded"
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
                                <span className="font-medium text-gray-900 dark:text-white">{org.name}</span>
                              )}
                            </div>
                          </div>
                        </TableCell>

                        {/* Domain */}
                        <TableCell className="hidden sm:table-cell">
                          <span className="text-gray-600 dark:text-gray-400">
                            {org.company_domain || '—'}
                          </span>
                        </TableCell>

                        {/* Member Count */}
                        <TableCell>
                          <div className="flex items-center gap-2 text-gray-600 dark:text-gray-400">
                            <Users className="w-4 h-4" />
                            {org.member_count}
                          </div>
                        </TableCell>

                        {/* Owner */}
                        <TableCell className="hidden md:table-cell">
                          <span className="text-gray-600 dark:text-gray-400">
                            {org.owner
                              ? `${org.owner.first_name} ${org.owner.last_name || org.owner.email}`
                              : '—'}
                          </span>
                        </TableCell>

                        {/* Status Badge */}
                        <TableCell>
                          <Badge
                            variant={org.is_active ? 'success' : 'destructive'}
                            className="text-xs"
                          >
                            {org.is_active ? 'Active' : 'Inactive'}
                          </Badge>
                        </TableCell>

                        {/* Actions */}
                        <TableCell
                          onClick={(e) => {
                            e.stopPropagation();
                          }}
                          className="text-right"
                        >
                          <div className="flex items-center justify-end gap-1">
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setEditingState({ orgId: org.id, field: 'name' });
                              }}
                              className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors"
                              title="Edit name"
                            >
                              <Edit2 className="w-4 h-4 text-gray-600 dark:text-gray-400" />
                            </button>

                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleToggleStatus(org.id, !org.is_active);
                              }}
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

                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setExpandedOrg(expandedOrg === org.id ? null : org.id);
                                if (expandedOrg !== org.id) {
                                  loadOrgMembers(org.id);
                                }
                              }}
                              className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors"
                              title="Manage members"
                            >
                              <ChevronRight
                                className={cn(
                                  'w-4 h-4 text-gray-600 dark:text-gray-400 transition-transform',
                                  expandedOrg === org.id && 'rotate-90'
                                )}
                              />
                            </button>
                          </div>
                        </TableCell>
                      </TableRow>

                      {/* Expanded Member Management Row */}
                      <AnimatePresence>
                        {expandedOrg === org.id && (
                          <motion.tr
                            initial={{ maxHeight: 0 }}
                            animate={{ maxHeight: 1000 }}
                            exit={{ maxHeight: 0 }}
                            transition={{
                              type: 'spring',
                              damping: 15,
                              stiffness: 400,
                              mass: 0.5
                            }}
                            className="border-gray-200 dark:border-gray-800 overflow-hidden"
                          >
                            <TableCell
                              colSpan={7}
                              className="border-t border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-800/20 p-4 sm:p-6"
                            >
                              <div className="space-y-4 max-h-[calc(100vh-300px)] flex flex-col">
                                {/* Add Member Form */}
                                <div className="space-y-3 flex-shrink-0">
                                  <h4 className="font-semibold text-gray-900 dark:text-white flex items-center gap-2">
                                    <UserPlus className="w-4 h-4" />
                                    Add Member
                                  </h4>
                                  <div className="flex flex-col sm:flex-row gap-2">
                                    <input
                                      type="email"
                                      placeholder="user@example.com"
                                      value={newMemberEmail}
                                      onChange={(e) => setNewMemberEmail(e.target.value)}
                                      className="flex-1 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-900 dark:text-white"
                                    />
                                    <select
                                      value={newMemberRole}
                                      onChange={(e) =>
                                        setNewMemberRole(e.target.value as 'admin' | 'member' | 'readonly')
                                      }
                                      className="bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-900 dark:text-white"
                                    >
                                      <option value="member">Member</option>
                                      <option value="admin">Admin</option>
                                      <option value="readonly">Read-only</option>
                                    </select>
                                    <Button
                                      onClick={() => handleAddMember(org.id)}
                                      className="bg-[#37bd7e] hover:bg-[#2da76c] w-full sm:w-auto"
                                      size="sm"
                                    >
                                      Add
                                    </Button>
                                  </div>
                                </div>

                                {/* Members List */}
                                <div className="flex-1 min-h-0 overflow-hidden flex flex-col">
                                  {loadingMembers[org.id] ? (
                                    <div className="flex items-center justify-center py-8">
                                      <Loader2 className="w-5 h-5 text-[#37bd7e] animate-spin" />
                                    </div>
                                  ) : (orgMembers[org.id] || []).length === 0 ? (
                                    <p className="text-sm text-gray-600 dark:text-gray-400">
                                      No members in this organization
                                    </p>
                                  ) : (() => {
                                    const { members: paginatedMembers, currentPage: memberPage, totalPages, totalMembers } = getPaginatedMembers(org.id);
                                    return (
                                    <div className="flex flex-col flex-1 min-h-0">
                                      <div className="space-y-2 overflow-y-auto pr-2">
                                        {paginatedMembers.map((member) => (
                                        <div
                                          key={member.user_id}
                                          className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 p-3 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700"
                                        >
                                          <div className="flex items-center gap-3 flex-1 min-w-0">
                                            <Avatar className="h-8 w-8 flex-shrink-0">
                                              {member.profiles?.avatar_url && (
                                                <AvatarImage src={member.profiles.avatar_url} />
                                              )}
                                              <AvatarFallback>
                                                {member.profiles?.first_name?.[0]}
                                                {member.profiles?.last_name?.[0]}
                                              </AvatarFallback>
                                            </Avatar>
                                            <div className="min-w-0">
                                              <p className="font-medium text-gray-900 dark:text-white text-sm truncate">
                                                {member.profiles?.first_name} {member.profiles?.last_name}
                                              </p>
                                              <p className="text-xs text-gray-600 dark:text-gray-400 truncate">
                                                {member.profiles?.email}
                                              </p>
                                            </div>
                                          </div>
                                          <div className="flex items-center gap-2 flex-shrink-0">
                                            <select
                                              value={member.role}
                                              onChange={(e) =>
                                                handleChangeRole(
                                                  org.id,
                                                  member.user_id,
                                                  e.target.value as
                                                    | 'owner'
                                                    | 'admin'
                                                    | 'member'
                                                    | 'readonly'
                                                )
                                              }
                                              className="bg-gray-100 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded px-2 py-1 text-xs text-gray-900 dark:text-white"
                                            >
                                              <option value="readonly">Read-only</option>
                                              <option value="member">Member</option>
                                              <option value="admin">Admin</option>
                                              <option value="owner">Owner</option>
                                            </select>
                                            {member.role !== 'owner' && (
                                              <button
                                                onClick={() => handleRemoveMember(org.id, member.user_id)}
                                                className="p-1 hover:bg-red-100 dark:hover:bg-red-900/30 rounded transition-colors flex-shrink-0"
                                                title="Remove member"
                                              >
                                                <X className="w-4 h-4 text-red-600 dark:text-red-400" />
                                              </button>
                                            )}
                                            {member.role === 'owner' && (
                                              <Shield
                                                className="w-4 h-4 text-yellow-600 dark:text-yellow-400 flex-shrink-0"
                                                title="Organization owner"
                                              />
                                            )}
                                          </div>
                                        </div>
                                      ))}
                                      </div>

                                      {/* Member Pagination */}
                                      {totalPages > 1 && (
                                        <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-700 flex items-center justify-between">
                                          <span className="text-xs text-gray-600 dark:text-gray-400">
                                            Showing {((memberPage - 1) * membersPerPage) + 1} to {Math.min(memberPage * membersPerPage, totalMembers)} of {totalMembers} members
                                          </span>
                                          <div className="flex items-center gap-2">
                                            <button
                                              onClick={() => setMemberPages(prev => ({ ...prev, [org.id]: Math.max(memberPage - 1, 1) }))}
                                              disabled={memberPage === 1}
                                              className="px-2 py-1 text-xs rounded border border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                                            >
                                              Previous
                                            </button>
                                            <span className="text-xs text-gray-600 dark:text-gray-400">
                                              Page {memberPage} of {totalPages}
                                            </span>
                                            <button
                                              onClick={() => setMemberPages(prev => ({ ...prev, [org.id]: Math.min(memberPage + 1, totalPages) }))}
                                              disabled={memberPage === totalPages}
                                              className="px-2 py-1 text-xs rounded border border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                                            >
                                              Next
                                            </button>
                                          </div>
                                        </div>
                                      )}
                                    </div>
                                    );
                                  })()}
                                </div>
                              </div>
                            </TableCell>
                          </motion.tr>
                        )}
                      </AnimatePresence>
                    </React.Fragment>
                  ))}
                </TableBody>
              </Table>
            </div>

            {/* Pagination Controls */}
            {filteredOrgs.length > itemsPerPage && (
              <div className="flex items-center justify-between px-6 py-4 border-t border-gray-200 dark:border-gray-800">
                <span className="text-sm text-gray-600 dark:text-gray-400">
                  Showing {((currentPage - 1) * itemsPerPage) + 1} to {Math.min(currentPage * itemsPerPage, filteredOrgs.length)} of {filteredOrgs.length} organizations
                </span>

                <div className="flex items-center gap-2">
                  <Button
                    onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
                    disabled={currentPage === 1}
                    variant="tertiary"
                    size="sm"
                  >
                    Previous
                  </Button>

                  <div className="flex gap-1">
                    {Array.from({ length: totalPages }, (_, i) => i + 1).map((page) => (
                      <button
                        key={page}
                        onClick={() => setCurrentPage(page)}
                        className={cn(
                          'px-3 py-2 rounded text-sm font-medium transition-colors',
                          currentPage === page
                            ? 'bg-[#37bd7e] text-white'
                            : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800'
                        )}
                      >
                        {page}
                      </button>
                    ))}
                  </div>

                  <Button
                    onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
                    disabled={currentPage === totalPages}
                    variant="tertiary"
                    size="sm"
                  >
                    Next
                  </Button>
                </div>
              </div>
            )}
            </>
          )}
        </div>

        {/* Bulk Delete Dialog */}
        <Dialog open={bulkDeleteDialogOpen} onOpenChange={setBulkDeleteDialogOpen}>
          <DialogContent className="bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-800">
            <DialogHeader>
              <DialogTitle className="text-red-600 dark:text-red-400">Delete Organizations</DialogTitle>
              <DialogDescription className="space-y-3">
                <p>
                  Are you sure you want to permanently delete{' '}
                  <strong>{selectedOrgs.size}</strong> selected organization{selectedOrgs.size === 1 ? '' : 's'}? This action <strong>cannot be undone</strong>.
                </p>
                <div className="bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 rounded-lg p-3 space-y-2">
                  <p className="text-sm font-semibold text-red-900 dark:text-red-200">This will permanently delete:</p>
                  <ul className="text-sm text-red-800 dark:text-red-300 space-y-1 ml-4 list-disc">
                    <li>The organization and all its data</li>
                    <li>All meetings, calls, and recordings</li>
                    <li>All integration configurations</li>
                    <li>All settings and preferences</li>
                    <li>Members will be removed (they can re-onboard with their existing accounts)</li>
                  </ul>
                </div>
              </DialogDescription>
            </DialogHeader>
            <DialogFooter className="gap-2 sm:gap-0">
              <Button variant="secondary" onClick={() => setBulkDeleteDialogOpen(false)}>
                Cancel
              </Button>
              <Button
                variant="destructive"
                onClick={handleBulkDelete}
              >
                Delete {selectedOrgs.size} Organization{selectedOrgs.size === 1 ? '' : 's'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Bulk Toggle Status Dialog */}
        <Dialog open={bulkToggleDialogOpen} onOpenChange={setBulkToggleDialogOpen}>
          <DialogContent className="bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-800">
            <DialogHeader>
              <DialogTitle>Change Organization Status</DialogTitle>
              <DialogDescription>
                What would you like to do with the {selectedOrgs.size} selected organization(s)?
              </DialogDescription>
            </DialogHeader>
            <div className="py-4 space-y-3">
              <Button
                onClick={() => {
                  handleBulkToggle(true);
                }}
                variant="success"
                className="w-full"
              >
                Activate All
              </Button>
              <Button
                onClick={() => {
                  handleBulkToggle(false);
                }}
                variant="destructive"
                className="w-full"
              >
                Deactivate All
              </Button>
            </div>
            <DialogFooter>
              <Button variant="secondary" onClick={() => setBulkToggleDialogOpen(false)}>
                Cancel
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}
