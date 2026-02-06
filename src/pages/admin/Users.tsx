import { useState, useMemo, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/lib/supabase/clientV2';
import { toast } from 'sonner';
import { useViewMode } from '@/contexts/ViewModeContext';
import {
  Users as UsersIcon,
  Shield,
  UserCog,
  ChevronDown,
  ChevronUp,
  Search,
  Filter,
  Download,
  Edit2,
  UserPlus,
  Star,
  Target as TargetIcon,
  UserCheck,
  Trash2,
  PlusCircle,
  Key,
  ChevronLeft,
  ChevronRight
} from 'lucide-react';
import { useUsers } from '@/lib/hooks/useUsers';
import { cn } from '@/lib/utils';
import { getAuthRedirectUrl } from '@/lib/utils/siteUrl';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger
} from '@/components/ui/alert-dialog';

import { USER_STAGES } from '@/lib/hooks/useUser';
import { format, parseISO } from 'date-fns';
import { User, Target } from '@/lib/hooks/useUsers';
import logger from '@/lib/utils/logger';
import { AuthCodeGenerator } from '@/components/admin/AuthCodeGenerator';

// Define a union type for the editing user state
type EditingUserState =
  | (User & { isNew?: false; editingTargets?: boolean })
  | { isNew: true; editingTargets?: never;[key: string]: any };

export default function Users() {
  const [activeTab, setActiveTab] = useState<'users' | 'authCodes'>('users');
  const [searchQuery, setSearchQuery] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [selectedStage, setSelectedStage] = useState('all');
  const [filterInternal, setFilterInternal] = useState<'all' | 'internal' | 'external'>('all');
  const [filterAdmin, setFilterAdmin] = useState<'all' | 'admin' | 'non-admin'>('all');
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 15;
  const [editingUser, setEditingUser] = useState<EditingUserState | null>(null);
  const [modalTargets, setModalTargets] = useState<Target[]>([]);
  const { users, updateUser, impersonateUser, deleteUser, inviteUser } = useUsers();
  const { startViewMode } = useViewMode();
  const navigate = useNavigate();

  const filteredUsers = useMemo(() => {
    let result = users.filter(user => {
      const matchesSearch =
        user.email.toLowerCase().includes(searchQuery.toLowerCase()) ||
        user.first_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        user.last_name?.toLowerCase().includes(searchQuery.toLowerCase());

      const matchesStage = selectedStage === 'all' || user.stage === selectedStage;

      const matchesInternal =
        filterInternal === 'all' ||
        (filterInternal === 'internal' && user.is_internal) ||
        (filterInternal === 'external' && !user.is_internal);

      const matchesAdmin =
        filterAdmin === 'all' ||
        (filterAdmin === 'admin' && user.is_admin) ||
        (filterAdmin === 'non-admin' && !user.is_admin);

      return matchesSearch && matchesStage && matchesInternal && matchesAdmin;
    });

    return result;
  }, [users, searchQuery, selectedStage, filterInternal, filterAdmin]);

  // Pagination
  const totalPages = Math.ceil(filteredUsers.length / itemsPerPage);
  const paginatedUsers = useMemo(() => {
    const startIndex = (currentPage - 1) * itemsPerPage;
    const endIndex = startIndex + itemsPerPage;
    return filteredUsers.slice(startIndex, endIndex);
  }, [filteredUsers, currentPage]);

  useEffect(() => {
    // Type guard to check if we have a user with targets
    if (editingUser && !editingUser.isNew && editingUser.editingTargets) {
      // It's an existing user, safe to access targets
      const user = editingUser as User;
      if (Array.isArray(user.targets)) {
        setModalTargets(JSON.parse(JSON.stringify(user.targets)));
      } else {
        setModalTargets([]);
      }
    } else {
      // Reset targets if not editing targets or if it's a new user
      // But only if we are transitioning out of a target editing state?
      // Actually simpler: just verify logical consistency.
      // The original code reset to [] if editingTargets was truthy but targets wasn't an array.
      // Here we can just default.
    }
  }, [editingUser]);

  // Reset to page 1 when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, selectedStage, filterInternal, filterAdmin]);

  const handleModalTargetChange = (index: number, field: string, value: string) => {
    setModalTargets(currentTargets => {
      const updatedTargets = [...currentTargets];
      if (!updatedTargets[index]) {
        updatedTargets[index] = {
          id: undefined,
          revenue_target: null,
          outbound_target: null,
          meetings_target: null,
          proposal_target: null,
          start_date: null,
          end_date: null
        };
      }
      const parsedValue = value === '' ? null : (field.includes('target') ? (field === 'revenue_target' ? parseFloat(value) : parseInt(value)) : value);

      updatedTargets[index] = {
        ...updatedTargets[index],
        [field]: parsedValue
      };
      return updatedTargets;
    });
  };

  const addTargetSet = () => {
    const today = format(new Date(), 'yyyy-MM-dd');
    setModalTargets(currentTargets => [
      ...currentTargets,
      {
        id: `new_${Date.now()}`,
        revenue_target: null,
        outbound_target: null,
        meetings_target: null,
        proposal_target: null,
        start_date: today,
        end_date: null
      }
    ]);
  };

  const removeTargetSet = (index: number) => {
    setModalTargets(currentTargets => currentTargets.filter((_, i) => i !== index));
  };

  const handleUpdateUser = async (userId: string, updates: Partial<User>) => {
    if (!userId) {
      logger.error("handleUpdateUser called without userId");
      toast.error("Cannot update user: User ID missing.");
      return;
    }
    try {
      await updateUser({ userId, updates });
      setEditingUser(null);
      setModalTargets([]);
    } catch (error) {
      logger.error('Update error in component:', error);
    }
  };

  const handleViewAs = (user: User) => {
    // Use the new View As mode instead of impersonation
    startViewMode({
      id: user.id,
      email: user.email,
      first_name: user.first_name,
      last_name: user.last_name,
      full_name: user.full_name
    });
    toast.success(`Now viewing as ${user.email}`);
    navigate('/');
  };

  const handleSendPasswordReset = async (email: string) => {
    try {
      // Use custom edge function with branded email template
      // Edge function is configured with CORS to allow localhost, staging, and production
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;

      if (!token) {
        toast.error('Not authenticated. Please log in again.');
        return;
      }

      // For password reset, use the base domain URL only
      // Supabase will add the recovery token to the URL, which the reset-password page will parse
      const baseUrl = import.meta.env.VITE_PUBLIC_URL || 'https://app.use60.com';
      const redirectUrl = baseUrl;
      logger.log('Password reset redirect URL:', redirectUrl, 'VITE_PUBLIC_URL:', import.meta.env.VITE_PUBLIC_URL);

      const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/send-password-reset-email`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
          'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY,
        },
        body: JSON.stringify({
          email: email.toLowerCase().trim(),
          redirectTo: redirectUrl,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: `HTTP ${response.status}` }));
        throw new Error(errorData.error || `HTTP ${response.status}: Failed to send password reset email`);
      }

      const data = await response.json();

      if (!data.success) {
        throw new Error(data.error || 'Failed to send password reset email');
      }

      toast.success(`Password reset email sent to ${email}`);
    } catch (error) {
      logger.error('Error sending password reset:', error);
      toast.error(error instanceof Error ? error.message : 'Failed to send password reset email');
    }
  };

  const handleExport = () => {
    type ExportRow = {
      'First Name': string | null;
      'Last Name': string | null;
      'Email': string;
      'Stage': string;
      'Internal': string;
      'Admin': string;
      'Created': string;
    };

    const data: ExportRow[] = filteredUsers.map(user => ({
      'First Name': user.first_name,
      'Last Name': user.last_name,
      'Email': user.email,
      'Stage': user.stage,
      'Internal': user.is_internal ? 'Yes' : 'No',
      'Admin': user.is_admin ? 'Yes' : 'No',
      'Created': new Date(user.created_at).toLocaleDateString()
    }));

    const headers: (keyof ExportRow)[] = Object.keys(data[0] || {}) as (keyof ExportRow)[];
    const csvContent = [
      headers.join(','),
      ...data.map(row =>
        headers.map(header =>
          JSON.stringify(row[header] || '')
        ).join(',')
      )
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', `users_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast.success('Export completed successfully');
  };

  return (
    <div className="p-4 sm:p-6 lg:p-8 mt-12 lg:mt-0 min-h-screen bg-white dark:bg-gray-950">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">User Management</h1>
            <p className="text-sm text-gray-700 dark:text-gray-300 mt-1">Manage users, roles, and permissions</p>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={() => setActiveTab('authCodes')}
              className={`w-full sm:w-auto flex items-center justify-center gap-2 px-4 py-2 rounded-xl transition-all duration-300 text-sm border ${activeTab === 'authCodes'
                ? 'bg-[#37bd7e]/20 text-[#37bd7e] border-[#37bd7e]/50'
                : 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 border-gray-300 dark:border-gray-700 hover:bg-gray-200 dark:hover:bg-gray-700'
                }`}
            >
              <Key className="w-4 h-4" />
              Auth Codes
            </button>
            {activeTab === 'users' && (
              <button
                onClick={() => setEditingUser({ isNew: true })}
                className="w-full sm:w-auto flex items-center justify-center gap-2 px-4 py-2 rounded-xl bg-[#37bd7e]/10 text-[#37bd7e] hover:bg-[#37bd7e]/20 transition-all duration-300 text-sm border border-[#37bd7e]/30 hover:border-[#37bd7e]/50"
              >
                <UserPlus className="w-4 h-4" />
                Add User
              </button>
            )}
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-2 border-b border-gray-200 dark:border-gray-700">
          <button
            onClick={() => setActiveTab('users')}
            className={`px-4 py-2 text-sm font-medium transition-colors border-b-2 ${activeTab === 'users'
              ? 'border-[#37bd7e] text-[#37bd7e]'
              : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
              }`}
          >
            Users
          </button>
          <button
            onClick={() => setActiveTab('authCodes')}
            className={`px-4 py-2 text-sm font-medium transition-colors border-b-2 ${activeTab === 'authCodes'
              ? 'border-[#37bd7e] text-[#37bd7e]'
              : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
              }`}
          >
            Authentication Codes
          </button>
        </div>

        {/* Tab Content */}
        {activeTab === 'authCodes' ? (
          <AuthCodeGenerator />
        ) : (
          <>

            {/* Stats Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="bg-white dark:bg-gray-900/80 backdrop-blur-sm rounded-xl p-4 border border-gray-200 dark:border-gray-700/50 shadow-sm dark:shadow-none">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-blue-50 dark:bg-blue-500/10 border border-blue-200 dark:border-blue-500/20">
                    <UsersIcon className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                  </div>
                  <div>
                    <p className="text-sm text-gray-700 dark:text-gray-300">Total Users</p>
                    <div className="text-xl font-bold text-gray-900 dark:text-gray-100">{users.length}</div>
                  </div>
                </div>
              </div>
              <div className="bg-white dark:bg-gray-900/80 backdrop-blur-sm rounded-xl p-4 border border-gray-200 dark:border-gray-700/50 shadow-sm dark:shadow-none">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-purple-50 dark:bg-purple-500/10 border border-purple-200 dark:border-purple-500/20">
                    <Shield className="w-5 h-5 text-purple-600 dark:text-purple-400" />
                  </div>
                  <div>
                    <p className="text-sm text-gray-700 dark:text-gray-300">Admins</p>
                    <div className="text-xl font-bold text-gray-900 dark:text-gray-100">
                      {users.filter(u => u.is_admin).length}
                    </div>
                  </div>
                </div>
              </div>
              <div className="bg-white dark:bg-gray-900/80 backdrop-blur-sm rounded-xl p-4 border border-gray-200 dark:border-gray-700/50 shadow-sm dark:shadow-none">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-blue-50 dark:bg-blue-500/10 border border-blue-200 dark:border-blue-500/20">
                    <UserCog className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                  </div>
                  <div>
                    <p className="text-sm text-gray-700 dark:text-gray-300">Internal Users</p>
                    <div className="text-xl font-bold text-gray-900 dark:text-gray-100">
                      {users.filter(u => u.is_internal).length}
                    </div>
                  </div>
                </div>
              </div>
              <div className="bg-white dark:bg-gray-900/80 backdrop-blur-sm rounded-xl p-4 border border-gray-200 dark:border-gray-700/50 shadow-sm dark:shadow-none">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-200 dark:border-emerald-500/20">
                    <Star className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
                  </div>
                  <div>
                    <p className="text-sm text-gray-700 dark:text-gray-300">Active</p>
                    <div className="text-xl font-bold text-gray-900 dark:text-gray-100">
                      {users.filter(u => u.last_sign_in_at).length}
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Users Table */}
            <div className="bg-white dark:bg-gray-900/80 backdrop-blur-sm rounded-lg border border-gray-200 dark:border-gray-700/50 shadow-sm dark:shadow-none overflow-hidden">
              {/* Table Controls */}
              <div className="p-4 sm:p-6 border-b border-gray-200 dark:border-gray-800 space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center gap-4">
                  <div className="w-full sm:flex-1">
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                      <input
                        type="text"
                        placeholder="Search users..."
                        value={searchQuery}
                        onChange={e => setSearchQuery(e.target.value)}
                        className="w-full bg-white dark:bg-gray-800/50 border border-gray-300 dark:border-gray-700/50 rounded-lg pl-10 pr-4 py-2 text-gray-900 dark:text-gray-100 placeholder-gray-500 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      />
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <motion.button
                      whileHover={{ scale: 1.02 }}
                      whileTap={{ scale: 0.98 }}
                      onClick={() => setShowFilters(!showFilters)}
                      className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-3 py-2 rounded-lg bg-gray-100 dark:bg-gray-800/50 text-gray-700 dark:text-gray-300 hover:bg-[#37bd7e]/20 hover:text-[#37bd7e] dark:hover:text-white transition-all duration-300 text-sm border border-gray-200 dark:border-transparent hover:border-[#37bd7e]/30"
                    >
                      <Filter className="w-4 h-4" />
                      Filters
                    </motion.button>

                    <motion.button
                      whileHover={{ scale: 1.02 }}
                      whileTap={{ scale: 0.98 }}
                      onClick={handleExport}
                      className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-3 py-2 rounded-lg bg-[#37bd7e]/10 text-[#37bd7e] hover:bg-[#37bd7e]/20 transition-all duration-300 text-sm border border-[#37bd7e]/30 hover:border-[#37bd7e]/50"
                    >
                      <Download className="w-4 h-4" />
                      Export
                    </motion.button>
                  </div>
                </div>

                <AnimatePresence>
                  {showFilters && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      className="overflow-hidden"
                    >
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mt-4">
                        <select
                          className="bg-white dark:bg-gray-800/50 border border-gray-300 dark:border-gray-700/50 rounded-xl px-4 py-2.5 text-gray-900 dark:text-gray-100 text-sm"
                          value={selectedStage}
                          onChange={(e) => setSelectedStage(e.target.value)}
                        >
                          <option value="all">All Stages</option>
                          {USER_STAGES.map(stage => (
                            <option key={stage} value={stage}>{stage}</option>
                          ))}
                        </select>

                        <select
                          className="bg-white dark:bg-gray-800/50 border border-gray-300 dark:border-gray-700/50 rounded-xl px-4 py-2.5 text-gray-900 dark:text-gray-100 text-sm"
                          value={filterInternal}
                          onChange={(e) => setFilterInternal(e.target.value as 'all' | 'internal' | 'external')}
                        >
                          <option value="all">All Users</option>
                          <option value="internal">Internal Only</option>
                          <option value="external">External Only</option>
                        </select>

                        <select
                          className="bg-white dark:bg-gray-800/50 border border-gray-300 dark:border-gray-700/50 rounded-xl px-4 py-2.5 text-gray-900 dark:text-gray-100 text-sm"
                          value={filterAdmin}
                          onChange={(e) => setFilterAdmin(e.target.value as 'all' | 'admin' | 'non-admin')}
                        >
                          <option value="all">All Roles</option>
                          <option value="admin">Admins Only</option>
                          <option value="non-admin">Non-Admins Only</option>
                        </select>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              {/* Table */}
              <div className="overflow-x-auto min-w-[800px] lg:min-w-0">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-800/50">
                      <th className="text-left text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider px-4 sm:px-6 py-3 whitespace-nowrap">User</th>
                      <th className="text-left text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider px-4 sm:px-6 py-3 whitespace-nowrap">Stage</th>
                      <th className="text-left text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider px-4 sm:px-6 py-3 whitespace-nowrap">Joined</th>
                      <th className="text-left text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider px-4 sm:px-6 py-3 whitespace-nowrap">Targets</th>
                      <th className="text-left text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider px-4 sm:px-6 py-3 whitespace-nowrap">Internal</th>
                      <th className="text-left text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider px-4 sm:px-6 py-3 whitespace-nowrap">Admin</th>
                      <th className="text-right text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider px-4 sm:px-6 py-3 whitespace-nowrap">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200 dark:divide-gray-800">
                    {paginatedUsers.map((user) => (
                      <tr key={user.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/30 transition-colors">
                        <td className="px-4 sm:px-6 py-4">
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-lg bg-[#37bd7e]/10 border border-[#37bd7e]/20 flex items-center justify-center">
                              {user.avatar_url ? (
                                <img
                                  src={user.avatar_url}
                                  alt={user.first_name}
                                  className="w-full h-full object-cover rounded-lg"
                                />
                              ) : (
                                <span className="text-sm font-medium text-[#37bd7e]">
                                  {user.first_name?.[0]}{user.last_name?.[0]}
                                </span>
                              )}
                            </div>
                            <div>
                              <div className="font-medium text-gray-900 dark:text-gray-100">
                                {user.first_name} {user.last_name}
                              </div>
                              <div className="text-sm text-gray-700 dark:text-gray-300">{user.email}</div>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 sm:px-6 py-4">
                          <select
                            value={user.stage}
                            onChange={(e) => handleUpdateUser(user.id, { stage: e.target.value })}
                            className="bg-white dark:bg-gray-800/50 border border-gray-300 dark:border-gray-700/50 rounded-lg px-3 py-1 text-sm text-gray-900 dark:text-gray-100"
                          >
                            {USER_STAGES.map(stage => (
                              <option key={stage} value={stage}>{stage}</option>
                            ))}
                          </select>
                        </td>
                        <td className="px-4 sm:px-6 py-4">
                          <span className="text-sm text-gray-700 dark:text-gray-300">
                            {format(parseISO(user.created_at), 'MMM d, yyyy')}
                          </span>
                        </td>
                        <td className="px-4 sm:px-6 py-4">
                          <button
                            onClick={() => setEditingUser({ ...(user as User), editingTargets: true })}
                            className="flex items-center gap-2 px-3 py-1 rounded-lg bg-violet-500/10 text-violet-500 hover:bg-violet-500/20 transition-all duration-300 text-sm border border-violet-500/30"
                          >
                            <TargetIcon className="w-4 h-4" />
                            Edit Targets
                          </button>
                        </td>
                        <td className="px-4 sm:px-6 py-4">
                          <button
                            onClick={() => handleUpdateUser(user.id, { is_internal: !user.is_internal })}
                            className={cn(
                              "flex items-center gap-2 px-3 py-1 rounded-lg transition-all duration-300 text-sm border",
                              user.is_internal
                                ? "bg-blue-500/10 text-blue-500 border-blue-500/30 hover:bg-blue-500/20"
                                : "bg-gray-500/10 text-gray-400 border-gray-500/30 hover:bg-gray-500/20"
                            )}
                            title={user.is_internal ? 'Internal user - has full feature access' : 'External user - limited access'}
                          >
                            <UserCog className="w-4 h-4" />
                            {user.is_internal ? 'Internal' : 'External'}
                          </button>
                        </td>
                        <td className="px-4 sm:px-6 py-4">
                          <button
                            onClick={() => handleUpdateUser(user.id, { is_admin: !user.is_admin })}
                            className={cn(
                              "flex items-center gap-2 px-3 py-1 rounded-lg transition-all duration-300 text-sm border",
                              user.is_admin
                                ? "bg-emerald-500/10 text-emerald-500 border-emerald-500/30 hover:bg-emerald-500/20"
                                : "bg-gray-500/10 text-gray-400 border-gray-500/30 hover:bg-gray-500/20"
                            )}
                            title={user.is_admin ? 'Platform admin - can manage system settings' : 'Regular user'}
                          >
                            <Shield className="w-4 h-4" />
                            {user.is_admin ? 'Admin' : 'User'}
                          </button>
                        </td>
                        <td className="px-4 sm:px-6 py-4">
                          <div className="flex items-center justify-end gap-2">
                            <button
                              onClick={() => handleViewAs(user)}
                              className="p-2 hover:bg-violet-500/20 rounded-lg transition-colors"
                              title="View as this user"
                            >
                              <UserCheck className="w-4 h-4 text-violet-500" />
                            </button>
                            <button
                              onClick={() => handleSendPasswordReset(user.email)}
                              className="p-2 hover:bg-yellow-500/20 rounded-lg transition-colors"
                              title="Send password reset email"
                            >
                              <Key className="w-4 h-4 text-yellow-500" />
                            </button>
                            <button
                              onClick={() => setEditingUser(user)}
                              className="p-2 hover:bg-[#37bd7e]/20 rounded-lg transition-colors"
                            >
                              <Edit2 className="w-4 h-4 text-[#37bd7e]" />
                            </button>
                            <AlertDialog>
                              <AlertDialogTrigger asChild>
                                <button
                                  className="p-2 hover:bg-red-500/20 rounded-lg transition-colors"
                                  title="Delete user account"
                                >
                                  <Trash2 className="w-4 h-4 text-red-500" />
                                </button>
                              </AlertDialogTrigger>
                              <AlertDialogContent className="bg-gray-900/95 backdrop-blur-xl border border-gray-800/50">
                                <AlertDialogHeader>
                                  <AlertDialogTitle className="text-red-400">Permanently Delete User</AlertDialogTitle>
                                  <AlertDialogDescription className="space-y-3 text-gray-300">
                                    <p>
                                      You are about to permanently delete <span className="font-semibold text-white">{user.first_name} {user.last_name}</span> ({user.email}).
                                    </p>
                                    <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-3 space-y-2">
                                      <p className="text-sm font-medium text-red-400">⚠️ This action will:</p>
                                      <ul className="text-sm space-y-1 ml-2 text-gray-300">
                                        <li>• Permanently remove the user's authentication access</li>
                                        <li>• Allow this email to be used for a new account signup</li>
                                        <li>• Delete all user data from the system</li>
                                        <li>• Remove associated activities, tasks, and targets</li>
                                      </ul>
                                      <p className="text-xs text-red-300 mt-2">This action <span className="font-semibold">cannot be undone</span>.</p>
                                    </div>
                                  </AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                  <AlertDialogCancel className="bg-gray-800/50 text-gray-300 hover:bg-gray-800">Cancel</AlertDialogCancel>
                                  <AlertDialogAction
                                    onClick={() => deleteUser(user.id)}
                                    className="bg-red-600 hover:bg-red-700"
                                  >
                                    Yes, Delete User
                                  </AlertDialogAction>
                                </AlertDialogFooter>
                              </AlertDialogContent>
                            </AlertDialog>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Pagination Controls */}
              <div className="px-4 sm:px-6 py-4 border-t border-gray-200 dark:border-gray-800 flex items-center justify-between">
                <div className="text-sm text-gray-600 dark:text-gray-400">
                  Showing {filteredUsers.length === 0 ? 0 : (currentPage - 1) * itemsPerPage + 1} to {Math.min(currentPage * itemsPerPage, filteredUsers.length)} of {filteredUsers.length} users
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                    disabled={currentPage === 1}
                    className="flex items-center gap-2 px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-700/50 bg-white dark:bg-gray-800/50 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    <ChevronLeft className="w-4 h-4" />
                    Previous
                  </button>
                  <div className="flex items-center gap-1 px-3 py-2">
                    {Array.from({ length: totalPages }, (_, i) => i + 1).map(page => (
                      <button
                        key={page}
                        onClick={() => setCurrentPage(page)}
                        className={cn(
                          "w-8 h-8 rounded-lg text-sm font-medium transition-colors",
                          currentPage === page
                            ? "bg-[#37bd7e] text-white"
                            : "bg-white dark:bg-gray-800/50 text-gray-700 dark:text-gray-300 border border-gray-300 dark:border-gray-700/50 hover:bg-gray-50 dark:hover:bg-gray-800"
                        )}
                      >
                        {page}
                      </button>
                    ))}
                  </div>
                  <button
                    onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                    disabled={currentPage === totalPages}
                    className="flex items-center gap-2 px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-700/50 bg-white dark:bg-gray-800/50 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    Next
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
          </>
        )}
      </div>

      {/* Edit User Modal */}
      {editingUser && (
        <div className="fixed inset-0 bg-gray-900/50 dark:bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-gray-900/95 backdrop-blur-sm rounded-xl border border-gray-200 dark:border-gray-700/50 p-6 w-full max-w-lg mx-4 max-h-[90vh] overflow-y-auto shadow-2xl">
            <h2 className="text-xl font-bold mb-4 text-gray-900 dark:text-gray-100">
              {editingUser.isNew ? 'Add User' : editingUser.editingTargets ? `Edit Targets for ${editingUser.first_name}` : 'Edit User'}
            </h2>

            {editingUser.editingTargets ? (
              <form onSubmit={(e) => {
                e.preventDefault();
                handleUpdateUser(editingUser.id, { targets: modalTargets });
              }} className="space-y-6">
                {modalTargets.map((target, index) => (
                  <div key={target.id || index} className="p-4 rounded-lg border border-gray-200 dark:border-gray-700/50 bg-gray-50 dark:bg-gray-800/20 space-y-4 relative">
                    <button
                      type="button"
                      onClick={() => removeTargetSet(index)}
                      className="absolute top-2 right-2 p-1 text-red-500 hover:bg-red-500/20 rounded"
                      aria-label="Remove target set"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div className="space-y-1">
                        <label className="text-xs font-medium text-gray-700 dark:text-gray-300">Revenue Target</label>
                        <input
                          type="number"
                          placeholder="e.g., 20000"
                          value={target.revenue_target ?? ''}
                          onChange={(e) => handleModalTargetChange(index, 'revenue_target', e.target.value)}
                          className="w-full bg-white dark:bg-gray-800/50 border border-gray-300 dark:border-gray-700/50 rounded-lg px-3 py-1.5 text-sm text-gray-900 dark:text-gray-100"
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-xs font-medium text-gray-700 dark:text-gray-300">Outbound Target</label>
                        <input
                          type="number"
                          placeholder="e.g., 100"
                          value={target.outbound_target ?? ''}
                          onChange={(e) => handleModalTargetChange(index, 'outbound_target', e.target.value)}
                          className="w-full bg-white dark:bg-gray-800/50 border border-gray-300 dark:border-gray-700/50 rounded-lg px-3 py-1.5 text-sm text-gray-900 dark:text-white"
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-xs font-medium text-gray-700 dark:text-gray-300">Meetings Target</label>
                        <input
                          type="number"
                          placeholder="e.g., 20"
                          value={target.meetings_target ?? ''}
                          onChange={(e) => handleModalTargetChange(index, 'meetings_target', e.target.value)}
                          className="w-full bg-white dark:bg-gray-800/50 border border-gray-300 dark:border-gray-700/50 rounded-lg px-3 py-1.5 text-sm text-gray-900 dark:text-white"
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-xs font-medium text-gray-700 dark:text-gray-300">Proposal Target</label>
                        <input
                          type="number"
                          placeholder="e.g., 15"
                          value={target.proposal_target ?? ''}
                          onChange={(e) => handleModalTargetChange(index, 'proposal_target', e.target.value)}
                          className="w-full bg-white dark:bg-gray-800/50 border border-gray-300 dark:border-gray-700/50 rounded-lg px-3 py-1.5 text-sm text-gray-900 dark:text-white"
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-xs font-medium text-gray-700 dark:text-gray-300">Start Date</label>
                        <input
                          type="date"
                          value={target.start_date ?? ''}
                          onChange={(e) => handleModalTargetChange(index, 'start_date', e.target.value)}
                          className="w-full bg-white dark:bg-gray-800/50 border border-gray-300 dark:border-gray-700/50 rounded-lg px-3 py-1.5 text-sm text-gray-900 dark:text-white"
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-xs font-medium text-gray-700 dark:text-gray-300">End Date</label>
                        <input
                          type="date"
                          value={target.end_date ?? ''}
                          onChange={(e) => handleModalTargetChange(index, 'end_date', e.target.value)}
                          className="w-full bg-white dark:bg-gray-800/50 border border-gray-300 dark:border-gray-700/50 rounded-lg px-3 py-1.5 text-sm text-gray-900 dark:text-white"
                        />
                      </div>
                    </div>
                  </div>
                ))}

                <button
                  type="button"
                  onClick={addTargetSet}
                  className="w-full flex items-center justify-center gap-2 px-4 py-2 rounded-lg border-2 border-dashed border-gray-300 dark:border-gray-700/50 text-gray-500 dark:text-gray-400 hover:border-[#37bd7e]/50 hover:text-[#37bd7e] transition-colors duration-200"
                >
                  <PlusCircle className="w-4 h-4" />
                  Add New Target Set
                </button>

                <div className="flex justify-end gap-3 pt-4">
                  <button
                    type="button"
                    onClick={() => { setEditingUser(null); setModalTargets([]); }}
                    className="px-4 py-2 rounded-xl bg-gray-200 dark:bg-gray-800/50 text-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-800 transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-2 rounded-xl bg-[#37bd7e] text-white hover:bg-[#2da76c] transition-colors"
                  >
                    Save Target Changes
                  </button>
                </div>
              </form>
            ) : (
              <form onSubmit={async (e) => {
                e.preventDefault();
                const formData = new FormData(e.target as HTMLFormElement);
                if (editingUser.isNew) {
                  const email = (formData.get('email') as string)?.trim();
                  const firstName = (formData.get('first_name') as string)?.trim();
                  const lastName = (formData.get('last_name') as string)?.trim();

                  if (!email) {
                    toast.error('Email is required');
                    return;
                  }

                  if (!firstName || !lastName) {
                    toast.error('First Name and Last Name are required');
                    return;
                  }

                  try {
                    await inviteUser(email, firstName, lastName);
                    setEditingUser(null);
                  } catch (error) {
                    // Error handled in hook
                  }
                } else {
                  // editingUser is User here because isNew is false
                  const userToUpdate = editingUser as User;
                  handleUpdateUser(userToUpdate.id, {
                    first_name: formData.get('first_name') as string,
                    last_name: formData.get('last_name') as string,
                    email: formData.get('email') as string,
                    stage: formData.get('stage') as string
                  });
                }
              }} className="space-y-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium text-gray-700 dark:text-gray-400">First Name</label>
                  <input
                    type="text"
                    name="first_name"
                    defaultValue={editingUser.first_name || ''}
                    required
                    className="w-full bg-gray-100 dark:bg-gray-800/30 border border-gray-300 dark:border-gray-700/30 rounded-xl px-4 py-2 text-gray-900 dark:text-white"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium text-gray-700 dark:text-gray-400">Last Name</label>
                  <input
                    type="text"
                    name="last_name"
                    defaultValue={editingUser.last_name || ''}
                    required
                    className="w-full bg-gray-100 dark:bg-gray-800/30 border border-gray-300 dark:border-gray-700/30 rounded-xl px-4 py-2 text-gray-900 dark:text-white"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium text-gray-700 dark:text-gray-400">Email</label>
                  <input
                    type="email"
                    name="email"
                    defaultValue={editingUser.email || ''}
                    required
                    className="w-full bg-gray-100 dark:bg-gray-800/30 border border-gray-300 dark:border-gray-700/30 rounded-xl px-4 py-2 text-gray-900 dark:text-white"
                    readOnly={!editingUser.isNew}
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium text-gray-700 dark:text-gray-400">Stage</label>
                  <select
                    name="stage"
                    defaultValue={editingUser.stage || USER_STAGES[0]}
                    className="w-full bg-gray-100 dark:bg-gray-800/30 border border-gray-300 dark:border-gray-700/30 rounded-xl px-4 py-2 text-gray-900 dark:text-white"
                  >
                    {USER_STAGES.map(stage => (
                      <option key={stage} value={stage}>{stage}</option>
                    ))}
                  </select>
                </div>
                <div className="flex justify-end gap-3 mt-6">
                  <button
                    type="button"
                    onClick={() => setEditingUser(null)}
                    className="px-4 py-2 rounded-xl bg-gray-200 dark:bg-gray-800/50 text-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-800 transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-2 rounded-xl bg-[#37bd7e] text-white hover:bg-[#2da76c] transition-colors"
                  >
                    {editingUser.isNew ? 'Create User' : 'Save Changes'}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )
      }
    </div >
  );
}