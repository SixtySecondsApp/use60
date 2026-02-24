/**
 * OrgProfileSettings - Company Profile section for Organization Settings
 *
 * Shows the org's fact profile (research data) with key stats,
 * and provides actions: Edit, Re-research, Sync to Skills.
 * If no org profile exists, shows a CTA to create one.
 */

import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Building2,
  Globe,
  Users,
  Banknote,
  Cpu,
  ExternalLink,
  RefreshCw,
  ArrowRightLeft,
  Loader2,
  Plus,
  Clock,
  CheckCircle2,
  AlertTriangle,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { useOrgProfile } from '@/lib/hooks/useFactProfiles';
import { useRecompileOrgSkills } from '@/lib/hooks/useOrganizationContext';
import { supabase } from '@/lib/supabase/clientV2';
import { useQueryClient } from '@tanstack/react-query';
import { factProfileKeys } from '@/lib/hooks/useFactProfiles';
import type { FactProfile } from '@/lib/types/factProfile';

interface OrgProfileSettingsProps {
  orgId: string;
  canManage: boolean;
}

export function OrgProfileSettings({ orgId, canManage }: OrgProfileSettingsProps) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { data: orgProfile, isLoading, error } = useOrgProfile(orgId);
  const recompileMutation = useRecompileOrgSkills();
  const [isResearching, setIsResearching] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);

  const handleReResearch = async (profile: FactProfile) => {
    setIsResearching(true);
    try {
      const { error } = await supabase.functions.invoke('research-fact-profile', {
        body: { action: 'research', profileId: profile.id },
      });
      if (error) throw error;
      toast.success('Research started', {
        description: 'Your company profile is being updated. This may take a minute.',
      });
      // Poll for completion by invalidating the query
      setTimeout(() => {
        queryClient.invalidateQueries({ queryKey: factProfileKeys.orgProfile(orgId) });
      }, 5000);
    } catch (err: any) {
      toast.error(err.message || 'Failed to start research');
    } finally {
      setIsResearching(false);
    }
  };

  const handleSyncToSkills = async (profile: FactProfile) => {
    setIsSyncing(true);
    try {
      // Use the edge function for comprehensive sync (enrichment + context)
      const { data, error: syncError } = await supabase.functions.invoke('sync-fact-profile-context', {
        body: { profileId: profile.id },
      });
      if (syncError) throw syncError;
      if (data?.success) {
        toast.success(`Org context synced: ${data.context_keys_synced} fields updated`);
      }
      await recompileMutation.mutateAsync(orgId);
    } catch {
      // Error toasts are handled by the mutation hooks
    } finally {
      setIsSyncing(false);
    }
  };

  // Auto-sync when research transitions to 'complete' (e.g. after re-research)
  const prevResearchStatusRef = useRef(orgProfile?.research_status);
  useEffect(() => {
    const prev = prevResearchStatusRef.current;
    const curr = orgProfile?.research_status;
    prevResearchStatusRef.current = curr;

    if (prev && prev !== 'complete' && curr === 'complete' && orgProfile) {
      supabase.functions
        .invoke('sync-fact-profile-context', { body: { profileId: orgProfile.id } })
        .then(({ data, error }) => {
          if (error) {
            console.error('[auto-sync] Failed to sync after re-research:', error);
            return;
          }
          if (data?.success) {
            toast.success(
              `Org context synced: ${data.context_keys_synced} fields updated`,
              { description: 'Email generation and skills will now use this data.' }
            );
          }
        })
        .catch((err) => console.error('[auto-sync] Error:', err));
    }
  }, [orgProfile?.research_status, orgProfile?.id]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-32">
        <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center gap-3 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl">
        <AlertTriangle className="w-5 h-5 text-red-500 flex-shrink-0" />
        <p className="text-sm text-red-700 dark:text-red-300">
          Failed to load company profile: {error.message}
        </p>
      </div>
    );
  }

  // No org profile exists yet - show CTA
  if (!orgProfile) {
    return (
      <div className="border-2 border-dashed border-gray-300 dark:border-gray-700 rounded-xl p-8 text-center">
        <Building2 className="w-12 h-12 text-gray-300 dark:text-gray-600 mx-auto mb-4" />
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
          No Company Profile
        </h3>
        <p className="text-sm text-gray-500 dark:text-gray-400 mb-6 max-w-md mx-auto">
          Create a company profile to help AI understand your business. This powers
          skill personalization, email generation, and prospecting context.
        </p>
        {canManage && (
          <Button
            onClick={() => navigate('/profiles?tab=business', { state: { createOrgProfile: true } })}
            className="bg-[#37bd7e] hover:bg-[#2da76c]"
          >
            <Plus className="w-4 h-4 mr-2" />
            Create Company Profile
          </Button>
        )}
      </div>
    );
  }

  // Org profile exists - show summary
  const rd = orgProfile.research_data;
  const overview = rd?.company_overview;
  const team = rd?.team_leadership;
  const financials = rd?.financials;
  const tech = rd?.technology;
  const isResearchComplete = orgProfile.research_status === 'complete';
  const isResearchInProgress = orgProfile.research_status === 'researching' || isResearching;

  return (
    <div className="space-y-4">
      {/* Company Header */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-4 min-w-0">
          {orgProfile.company_logo_url ? (
            <img
              src={orgProfile.company_logo_url}
              alt={orgProfile.company_name}
              className="w-12 h-12 rounded-xl object-contain bg-gray-100 dark:bg-gray-800 p-1 flex-shrink-0"
            />
          ) : (
            <div className="w-12 h-12 rounded-xl bg-[#37bd7e]/10 flex items-center justify-center flex-shrink-0">
              <Building2 className="w-6 h-6 text-[#37bd7e]" />
            </div>
          )}
          <div className="min-w-0">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white truncate">
              {orgProfile.company_name}
            </h3>
            {overview?.industry && (
              <p className="text-sm text-gray-500 dark:text-gray-400">
                {overview.industry}
              </p>
            )}
            {overview?.description && (
              <p className="text-sm text-gray-600 dark:text-gray-300 mt-1 line-clamp-2">
                {overview.description}
              </p>
            )}
          </div>
        </div>

        {/* Status badge */}
        <div className="flex-shrink-0">
          {isResearchInProgress ? (
            <Badge variant="outline" className="bg-amber-500/10 text-amber-600 border-amber-500/20">
              <Loader2 className="w-3 h-3 mr-1 animate-spin" />
              Researching
            </Badge>
          ) : isResearchComplete ? (
            <Badge variant="outline" className="bg-green-500/10 text-green-600 border-green-500/20">
              <CheckCircle2 className="w-3 h-3 mr-1" />
              Complete
            </Badge>
          ) : (
            <Badge variant="outline" className="bg-gray-500/10 text-gray-600 border-gray-500/20">
              {orgProfile.research_status}
            </Badge>
          )}
        </div>
      </div>

      {/* Key Stats */}
      {isResearchComplete && rd && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {team?.employee_count ? (
            <StatCard
              icon={Users}
              label="Employees"
              value={team.employee_count.toLocaleString()}
            />
          ) : team?.employee_range ? (
            <StatCard icon={Users} label="Employees" value={team.employee_range} />
          ) : null}

          {financials?.funding_status && (
            <StatCard
              icon={Banknote}
              label="Funding"
              value={financials.funding_status}
            />
          )}

          {tech?.tech_stack?.length ? (
            <StatCard
              icon={Cpu}
              label="Tech Stack"
              value={`${tech.tech_stack.length} tools`}
            />
          ) : null}

          {overview?.website && (
            <StatCard icon={Globe} label="Website" value={overview.website} isUrl />
          )}
        </div>
      )}

      {/* Timestamps */}
      <div className="flex items-center gap-4 text-xs text-gray-500 dark:text-gray-400">
        <span className="flex items-center gap-1">
          <Clock className="w-3 h-3" />
          Last researched: {new Date(orgProfile.updated_at).toLocaleDateString()}
        </span>
      </div>

      {/* Actions */}
      {canManage && (
        <div className="flex flex-wrap items-center gap-2 pt-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => navigate(`/profiles/${orgProfile.id}`)}
          >
            <ExternalLink className="w-4 h-4 mr-2" />
            Edit Profile
          </Button>

          <Button
            variant="outline"
            size="sm"
            onClick={() => handleReResearch(orgProfile)}
            disabled={isResearchInProgress}
          >
            {isResearchInProgress ? (
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              <RefreshCw className="w-4 h-4 mr-2" />
            )}
            Re-research
          </Button>

          <Button
            variant="outline"
            size="sm"
            onClick={() => handleSyncToSkills(orgProfile)}
            disabled={
              isSyncing ||
              recompileMutation.isPending ||
              !isResearchComplete
            }
          >
            {isSyncing || recompileMutation.isPending ? (
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              <ArrowRightLeft className="w-4 h-4 mr-2" />
            )}
            Sync to Skills
          </Button>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// StatCard sub-component
// ---------------------------------------------------------------------------

function StatCard({
  icon: Icon,
  label,
  value,
  isUrl,
}: {
  icon: React.ElementType;
  label: string;
  value: string;
  isUrl?: boolean;
}) {
  return (
    <div className="bg-gray-50 dark:bg-gray-800/50 rounded-lg p-3">
      <div className="flex items-center gap-2 mb-1">
        <Icon className="w-3.5 h-3.5 text-gray-400" />
        <span className="text-xs text-gray-500 dark:text-gray-400">{label}</span>
      </div>
      {isUrl ? (
        <p className="text-sm font-medium text-[#37bd7e] truncate">{value}</p>
      ) : (
        <p className="text-sm font-medium text-gray-900 dark:text-white truncate">
          {value}
        </p>
      )}
    </div>
  );
}

export default OrgProfileSettings;
