import { useState } from 'react';
import { RefreshCcw, Loader2, Check } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { supabase } from '@/lib/supabase/clientV2';
import type { FactProfile } from '@/lib/types/factProfile';

interface SyncFactProfileToOrgProps {
  profile: FactProfile;
  variant?: 'default' | 'outline';
  size?: 'default' | 'sm';
}

/**
 * Syncs a client_org fact profile's research data into organization_enrichment
 * and organization_context so that email generation, skill compilation, and
 * the copilot all use the researched company data.
 *
 * Only renders for client_org profiles with research_status = 'complete'.
 */
export function SyncFactProfileToOrg({ profile, variant = 'outline', size = 'sm' }: SyncFactProfileToOrgProps) {
  const [isSyncing, setIsSyncing] = useState(false);
  const [synced, setSynced] = useState(false);

  // Only show for completed client_org profiles
  if (profile.profile_type !== 'client_org' || profile.research_status !== 'complete') {
    return null;
  }

  const handleSync = async () => {
    setIsSyncing(true);
    setSynced(false);

    try {
      const { data, error } = await supabase.functions.invoke('sync-fact-profile-context', {
        body: { profileId: profile.id },
      });

      if (error) throw error;

      if (data?.success) {
        setSynced(true);
        toast.success(
          `Synced to org context: ${data.context_keys_synced} fields updated`,
          { description: 'Email generation and skills will now use this data.' }
        );
        setTimeout(() => setSynced(false), 3000);
      } else {
        throw new Error(data?.error || 'Sync failed');
      }
    } catch (err: any) {
      toast.error(err.message || 'Failed to sync fact profile to org context');
    } finally {
      setIsSyncing(false);
    }
  };

  return (
    <Button variant={variant} size={size} onClick={handleSync} disabled={isSyncing}>
      {isSyncing ? (
        <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
      ) : synced ? (
        <Check className="h-3.5 w-3.5 mr-1.5 text-green-500" />
      ) : (
        <RefreshCcw className="h-3.5 w-3.5 mr-1.5" />
      )}
      {isSyncing ? 'Syncing...' : synced ? 'Synced' : 'Sync to Org'}
    </Button>
  );
}
