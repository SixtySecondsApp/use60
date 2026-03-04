import { useState } from 'react';
import { Check, Trash2, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';
import type { WaitlistEntry } from '@/lib/types/waitlist';
import { useWaitlistAdmin } from '@/lib/hooks/useWaitlistAdmin';
import { grantAccess } from '@/lib/services/waitlistAdminService';
import { useAuth } from '@/lib/contexts/AuthContext';

interface WaitlistTableProps {
  entries: WaitlistEntry[];
  isLoading: boolean;
  onRefresh: () => void;
  adminUserId: string;
}

export function WaitlistTable({ entries, isLoading, onRefresh, adminUserId }: WaitlistTableProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [releasingId, setReleasingId] = useState<string | null>(null);
  const { user } = useAuth();

  // Admin hook is still used for deletion and other operations
  const adminHook = useWaitlistAdmin();

  // Filter entries based on search
  const filteredEntries = entries.filter(entry =>
    entry.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
    entry.full_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (entry.company_name && entry.company_name.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  const handleRelease = async (entry: WaitlistEntry) => {
    console.log('[WaitlistTable] Checkmark clicked for:', entry.email);

    if (!user) {
      console.error('[WaitlistTable] No user found');
      toast.error('Unable to determine current user');
      return;
    }

    console.log('[WaitlistTable] Current user:', user.id);
    setReleasingId(entry.id);

    try {
      console.log('[WaitlistTable] Calling grantAccess for entryId:', entry.id);
      const result = await grantAccess(entry.id, user.id);
      console.log('[WaitlistTable] grantAccess result:', result);

      if (result.success) {
        toast.success(`Invitation sent to ${entry.email}`);
        onRefresh();
      } else {
        toast.error(result.error || 'Failed to send invitation');
      }
    } catch (error) {
      toast.error('Failed to send invitation');
      console.error('[WaitlistTable] Grant access error:', error);
    } finally {
      setReleasingId(null);
    }
  };

  const handleDelete = async (id: string) => {
    if (confirm('Are you sure you want to delete this entry?')) {
      try {
        await adminHook.deleteEntry(id);
        onRefresh();
      } catch {
        // toast handled in hook
      }
    }
  };

  if (isLoading) {
    return (
      <div className="bg-white dark:bg-gray-900/80 backdrop-blur-sm border border-gray-200 dark:border-gray-700/50 rounded-xl p-6 shadow-sm dark:shadow-none">
        <div className="animate-pulse space-y-4">
          {[1, 2, 3].map(i => (
            <div key={i} className="h-16 bg-gray-200 dark:bg-gray-800 rounded-lg" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white dark:bg-gray-900/80 backdrop-blur-sm border border-gray-200 dark:border-gray-700/50 rounded-xl overflow-hidden shadow-sm dark:shadow-none w-full">
      {/* Header with Search */}
      <div className="p-4 border-b border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-800/50">
        <div className="relative max-w-md w-full">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
          <Input
            placeholder="Search by name, email, or company..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10 w-full"
          />
        </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto w-full">
        <table className="w-full min-w-[800px]">
          <thead>
            <tr className="border-b border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-800/50">
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider whitespace-nowrap">#</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider">Name</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider">Email</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider">Company</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider">Tools</th>
              <th className="px-4 py-3 text-center text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider whitespace-nowrap">Referrals</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider whitespace-nowrap">Registration URL</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider whitespace-nowrap">Status</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider whitespace-nowrap">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200 dark:divide-gray-800">
            {filteredEntries.length === 0 ? (
              <tr>
                <td colSpan={9} className="px-4 py-8 text-center text-gray-500 dark:text-gray-400">
                  No entries found
                </td>
              </tr>
            ) : (
              filteredEntries.map((entry) => (
                <tr key={entry.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/30 transition-colors">
                  <td className="px-4 py-3 text-sm font-medium text-gray-900 dark:text-white whitespace-nowrap">
                    #{entry.effective_position || entry.signup_position}
                  </td>
                  <td className="px-4 py-3 text-sm font-medium text-gray-900 dark:text-white max-w-[150px] truncate" title={entry.full_name || ''}>
                    {entry.full_name}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-700 dark:text-gray-300 max-w-[200px] truncate" title={entry.email}>
                    {entry.email}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-700 dark:text-gray-300 max-w-[150px] truncate" title={entry.company_name || ''}>
                    {entry.company_name || '-'}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-700 dark:text-gray-300 max-w-[120px]">
                    <div className="text-xs space-y-1">
                      {entry.dialer_tool && <div className="truncate" title={entry.dialer_tool}>📞 {entry.dialer_tool}</div>}
                      {entry.meeting_recorder_tool && <div className="truncate" title={entry.meeting_recorder_tool}>🎙️ {entry.meeting_recorder_tool}</div>}
                      {entry.crm_tool && <div className="truncate" title={entry.crm_tool}>📊 {entry.crm_tool}</div>}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-sm font-medium text-gray-900 dark:text-white whitespace-nowrap text-center">
                    {entry.referral_count || 0}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-700 dark:text-gray-300 max-w-[200px] truncate" title={entry.registration_url || ''}>
                    {entry.registration_url ? (
                      <span className="font-mono text-xs">
                        {entry.registration_url}
                      </span>
                    ) : (
                      <span className="text-gray-400 dark:text-gray-500">-</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-sm whitespace-nowrap">
                    <span
                      className={`px-2.5 py-1 rounded-full text-xs font-semibold inline-block ${
                        entry.status === 'pending'
                          ? 'bg-yellow-50 dark:bg-yellow-500/10 text-yellow-700 dark:text-yellow-400 border border-yellow-200 dark:border-yellow-500/20'
                          : entry.status === 'released'
                          ? 'bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-500/20'
                          : 'bg-gray-50 dark:bg-gray-500/10 text-gray-700 dark:text-gray-400 border border-gray-200 dark:border-gray-500/20'
                      }`}
                    >
                      {entry.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-sm whitespace-nowrap">
                    <div className="flex items-center gap-2">
                      {entry.status === 'pending' && (
                        <Button
                          onClick={() => handleRelease(entry)}
                          size="sm"
                          variant="ghost"
                          disabled={releasingId === entry.id}
                          className="text-emerald-600 dark:text-emerald-400 hover:text-emerald-700 dark:hover:text-emerald-300 hover:bg-emerald-50 dark:hover:bg-emerald-500/10 flex-shrink-0 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          <Check className="w-4 h-4" />
                        </Button>
                      )}
                      <Button
                        onClick={() => handleDelete(entry.id)}
                        size="sm"
                        variant="ghost"
                        className="text-red-600 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300 hover:bg-red-50 dark:hover:bg-red-500/10 flex-shrink-0"
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
