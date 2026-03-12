/**
 * Email Sync Hook
 * 
 * Provides React hook for email synchronization with progress tracking
 */

import { useState, useCallback } from 'react';
import { toast } from 'sonner';
import { useUser } from '@/lib/hooks/useUser';
import { performEmailSync, SyncPeriod, SyncResult } from '@/lib/services/emailSyncService';
import { calculateAllDealsHealth } from '@/lib/services/dealHealthService';
import { calculateAllContactsHealth } from '@/lib/services/relationshipHealthService';

export interface SyncProgress {
  analyzed: number;
  total: number;
}

export function useEmailSync() {
  const { userData } = useUser();
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState<SyncProgress>({ analyzed: 0, total: 0 });
  const [syncStatus, setSyncStatus] = useState<SyncResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const performSync = useCallback(async (period: SyncPeriod) => {
    if (!userData?.id) {
      setError('User not authenticated');
      return;
    }

    setLoading(true);
    setError(null);
    setProgress({ analyzed: 0, total: 0 });

    try {
      // Perform email sync
      const result = await performEmailSync(userData.id, period);
      setSyncStatus(result);

      // Update progress
      setProgress({
        analyzed: result.emailsAnalyzed,
        total: result.crmEmailsMatched,
      });

      // Refresh health scores after email sync
      if (result.emailsStored > 0) {
        // Refresh deal health scores
        await calculateAllDealsHealth(userData.id);

        // Refresh relationship health scores
        await calculateAllContactsHealth(userData.id);
      }

      if (result.errors.length > 0) {
        const errorMsg = result.errors.join('; ');
        setError(errorMsg);
        toast.error('Email sync completed with errors', { description: errorMsg });
      } else if (result.emailsStored > 0) {
        toast.success(`Synced ${result.emailsStored} emails from ${result.crmEmailsMatched} CRM matches`);
      } else if (result.crmContactCount === 0) {
        toast.warning('No CRM contacts found. Add contacts first to sync emails.');
      } else if (result.emailsStored === 0 && result.crmContactCount > 0) {
        toast.info('No matching emails found for your CRM contacts.');
      }
    } catch (err: any) {
      const errorMsg = err.message || 'Email sync failed';
      setError(errorMsg);
      toast.error('Email sync failed', { description: errorMsg });
      setSyncStatus(null);
    } finally {
      setLoading(false);
    }
  }, [userData?.id]);

  return {
    performSync,
    syncStatus,
    loading,
    progress,
    error,
  };
}







































