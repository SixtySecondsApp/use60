/**
 * MeetingsWaitlist Page
 * Enhanced waitlist management with bulk actions and onboarding tracking
 */

import React, { useState } from 'react';
import { BackToPlatform } from '@/components/platform/BackToPlatform';
import { useAuth } from '@/lib/contexts/AuthContext';
import { useWaitlistAdmin } from '@/lib/hooks/useWaitlistAdmin';
import { useWaitlistBulkActions } from '@/lib/hooks/useWaitlistBulkActions';
import { BulkActionToolbar } from '@/components/platform/waitlist/BulkActionToolbar';
import { BulkGrantAccessModal } from '@/components/platform/waitlist/BulkGrantAccessModal';
import { EnhancedWaitlistTable } from '@/components/platform/waitlist/EnhancedWaitlistTable';
import { WaitlistStatsComponent } from '@/components/admin/waitlist/WaitlistStats';
import { SeededUserManager } from '@/components/platform/waitlist/SeededUserManager';
import { resendMagicLink } from '@/lib/services/waitlistAdminService';
import { MagicLinkSentModal } from '@/components/platform/waitlist/MagicLinkSentModal';
import { ChevronDown, ChevronUp, Bell } from 'lucide-react';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';

export default function MeetingsWaitlist() {
  const { user } = useAuth();
  const [showGrantAccessModal, setShowGrantAccessModal] = useState(false);
  const [showSeededManager, setShowSeededManager] = useState(false);
  const [hideSeeded, setHideSeeded] = useState(false); // Default to showing all users (including seeded)
  const [showMagicLinkSentModal, setShowMagicLinkSentModal] = useState(false);
  const [magicLinkRecipientEmail, setMagicLinkRecipientEmail] = useState<string | undefined>();

  // Existing waitlist data
  const { entries, stats, isLoading, releaseUser, unreleaseUser, deleteEntry, exportData } = useWaitlistAdmin();

  // Filter entries based on seeded status
  const filteredEntries = hideSeeded ? entries.filter(entry => !entry.is_seeded) : entries;

  // Recalculate stats based on filtered entries
  const filteredStats = {
    total_signups: filteredEntries.length,
    pending_count: filteredEntries.filter(e => e.status === 'pending').length,
    released_count: filteredEntries.filter(e => e.status === 'released').length,
    declined_count: filteredEntries.filter(e => e.status === 'declined').length,
    converted_count: filteredEntries.filter(e => e.status === 'converted').length,
    avg_referrals: filteredEntries.length > 0
      ? Math.round((filteredEntries.reduce((sum, e) => sum + (e.referral_count || 0), 0) / filteredEntries.length) * 10) / 10
      : 0,
    signups_last_7_days: filteredEntries.filter(e => {
      const created = new Date(e.created_at);
      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
      return created >= sevenDaysAgo;
    }).length,
    signups_last_30_days: filteredEntries.filter(e => {
      const created = new Date(e.created_at);
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      return created >= thirtyDaysAgo;
    }).length,
  };

  // Bulk actions
  const bulkActions = useWaitlistBulkActions(user?.id || '', entries);

  const handleGrantAccess = async () => {
    setShowGrantAccessModal(true);
  };

  const handleBulkGrantAccess = async (params: {
    emailTemplateId?: string;
    adminNotes?: string;
  }) => {
    return await bulkActions.grantAccess(params);
  };

  const handleResendMagicLink = async (entryId: string) => {
    if (!user?.id) return;

    // Find the entry to get email for modal
    const entry = entries.find(e => e.id === entryId);
    const recipientEmail = entry?.email;

    const result = await resendMagicLink(entryId, user.id);
    if (result.success) {
      setMagicLinkRecipientEmail(recipientEmail);
      setShowMagicLinkSentModal(true);
    } else {
      toast.error(result.error || 'Failed to resend invitation');
    }
  };

  const handleExportSelected = async () => {
    const selectedEntries = bulkActions.selectedEntries;
    if (selectedEntries.length === 0) {
      alert('No entries selected');
      return;
    }

    const headers = ['Email', 'Name', 'Company', 'Position', 'Referrals', 'Status'];
    const rows = selectedEntries.map((entry) => [
      entry.email,
      entry.full_name,
      entry.company_name || '',
      entry.effective_position?.toString() || '',
      entry.referral_count?.toString() || '0',
      entry.status,
    ]);

    const csv = [
      headers.join(','),
      ...rows.map((row) => row.map((cell) => `"${cell}"`).join(',')),
    ].join('\n');

    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `waitlist-selected-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="p-4 sm:p-6 space-y-6 overflow-x-hidden w-full bg-white dark:bg-gray-950 min-h-screen">
      <BackToPlatform />
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">Meetings Waitlist</h1>
        <p className="text-gray-600 dark:text-gray-400">
          Manage waitlist signups, grant bulk access, and track onboarding progress
        </p>
      </div>

      {/* Seeded User Manager - Collapsible */}
      <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden transition-colors duration-200">
        <button
          onClick={() => setShowSeededManager(!showSeededManager)}
          className="
            w-full
            flex items-center justify-between
            px-6 py-4
            hover:bg-gray-50 dark:hover:bg-gray-800
            transition-colors duration-200
          "
        >
          <div className="flex items-center gap-3">
            <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-purple-100 dark:bg-purple-900/20">
              <span className="text-lg">🎭</span>
            </div>
            <div className="text-left">
              <h3 className="text-sm font-semibold text-gray-900 dark:text-white">
                Seeded User Management
              </h3>
              <p className="text-xs text-gray-600 dark:text-gray-400">
                Manage fake/demo users for social proof
              </p>
            </div>
          </div>
          {showSeededManager ? (
            <ChevronUp className="w-5 h-5 text-gray-500 dark:text-gray-400" />
          ) : (
            <ChevronDown className="w-5 h-5 text-gray-500 dark:text-gray-400" />
          )}
        </button>
        {showSeededManager && (
          <div className="px-6 pb-6 border-t border-gray-200 dark:border-gray-700">
            <div className="mt-4">
              <SeededUserManager />
            </div>
          </div>
        )}
      </div>

      {/* Slack Notification Settings Button */}
      <div className="flex items-center gap-3">
        <Link
          to="/platform/waitlist-slack-settings"
          className="inline-flex items-center gap-2 px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white text-sm font-medium rounded-lg transition-colors"
        >
          <Bell className="w-4 h-4" />
          Configure Slack Notifications
        </Link>
      </div>

      {/* Stats */}
      <WaitlistStatsComponent stats={filteredStats} isLoading={isLoading} />

      {/* Bulk Action Toolbar */}
      <BulkActionToolbar
        selectedCount={bulkActions.selectedCount}
        onGrantAccess={handleGrantAccess}
        onExport={handleExportSelected}
        onClearSelection={bulkActions.clearSelection}
        isProcessing={bulkActions.isProcessing}
      />

      {/* Enhanced Table */}
      <EnhancedWaitlistTable
        entries={entries}
        isLoading={isLoading}
        selectedIds={bulkActions.selectedIds}
        onToggleSelect={bulkActions.toggleEntry}
        onSelectAll={() => bulkActions.selectAll(entries)}
        canSelect={bulkActions.canSelect}
        isSelected={bulkActions.isSelected}
        onRelease={releaseUser}
        onUnrelease={unreleaseUser}
        onResendMagicLink={handleResendMagicLink}
        onDelete={deleteEntry}
        onExport={exportData}
        hideSeeded={hideSeeded}
        onHideSeededChange={setHideSeeded}
      />

      {/* Bulk Grant Access Modal */}
      {showGrantAccessModal && (
        <BulkGrantAccessModal
          isOpen={showGrantAccessModal}
          onClose={() => setShowGrantAccessModal(false)}
          selectedEntries={bulkActions.selectedEntries}
          onGrantAccess={handleBulkGrantAccess}
          adminName={user?.email || 'Admin'}
        />
      )}

      {/* Magic Link Sent Modal */}
      <MagicLinkSentModal
        isOpen={showMagicLinkSentModal}
        onClose={() => {
          setShowMagicLinkSentModal(false);
          setMagicLinkRecipientEmail(undefined);
        }}
        recipientEmail={magicLinkRecipientEmail}
      />
    </div>
  );
}
