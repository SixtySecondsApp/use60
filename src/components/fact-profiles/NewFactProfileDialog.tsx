import React, { useState, useEffect } from 'react';
import { Building2, Target, Plus, Loader2, Sparkles, Shield, Globe } from 'lucide-react';
import { toast } from 'sonner';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useCreateFactProfile } from '@/lib/hooks/useFactProfiles';
import { useActiveOrgId, useActiveOrg } from '@/lib/stores/orgStore';
import { useAuth } from '@/lib/contexts/AuthContext';
import { supabase } from '@/lib/supabase/clientV2';
import { normalizeCompanyDomain } from '@/lib/utils/logoDev';
import type { FactProfile, FactProfileType } from '@/lib/types/factProfile';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface NewFactProfileDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: (profile: FactProfile, triggerResearch: boolean) => void;
  hasOrgProfile?: boolean;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function NewFactProfileDialog({
  open,
  onOpenChange,
  onCreated,
  hasOrgProfile = false,
}: NewFactProfileDialogProps) {
  const orgId = useActiveOrgId();
  const activeOrg = useActiveOrg();
  const { userId } = useAuth();
  const createMutation = useCreateFactProfile();

  type ProfileChoice = 'org_profile' | 'client_org' | 'target_company';
  const [profileChoice, setProfileChoice] = useState<ProfileChoice>('client_org');
  const [companyName, setCompanyName] = useState('');
  const [companyDomain, setCompanyDomain] = useState('');
  const [linkedCompanyDomain, setLinkedCompanyDomain] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [isCreatingWithResearch, setIsCreatingWithResearch] = useState(false);

  const isOrgProfile = profileChoice === 'org_profile';

  // Auto-fill domain from org when "org profile" is selected
  useEffect(() => {
    if (isOrgProfile && activeOrg?.company_domain) {
      setCompanyDomain(normalizeCompanyDomain(activeOrg.company_domain) ?? '');
    }
  }, [isOrgProfile, activeOrg?.company_domain]);

  // Auto-fill company name from org when selecting org profile
  useEffect(() => {
    if (isOrgProfile && activeOrg?.name && !companyName) {
      setCompanyName(activeOrg.name);
    }
  }, [isOrgProfile, activeOrg?.name, companyName]);

  // Reset form when dialog opens/closes
  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen) {
      setProfileChoice('client_org');
      setCompanyName('');
      setCompanyDomain('');
      setLinkedCompanyDomain('');
      setIsCreating(false);
      setIsCreatingWithResearch(false);
    }
    onOpenChange(nextOpen);
  };

  // Normalize domain on blur + auto-detect org profile match
  const handleDomainBlur = () => {
    if (companyDomain.trim()) {
      const normalized = normalizeCompanyDomain(companyDomain.trim());
      setCompanyDomain(normalized ?? '');

      // Auto-switch to org profile if domain matches org's domain
      const orgDomain = normalizeCompanyDomain(activeOrg?.company_domain ?? '');
      if (normalized && orgDomain && normalized === orgDomain && !hasOrgProfile) {
        setProfileChoice('org_profile');
      }
    }
  };

  const createProfile = async (triggerResearch: boolean) => {
    if (!companyName.trim()) {
      toast.error('Company name is required');
      return;
    }
    if (!orgId) {
      toast.error('No active organization');
      return;
    }
    if (!userId) {
      toast.error('Not authenticated');
      return;
    }

    const setter = triggerResearch ? setIsCreatingWithResearch : setIsCreating;
    setter(true);

    try {
      // Normalize domain before sending
      const normalizedDomain = normalizeCompanyDomain(companyDomain.trim());

      // Client-side org profile detection (fallback if DB trigger not deployed)
      const orgDomain = normalizeCompanyDomain(activeOrg?.company_domain ?? '');
      const domainMatchesOrg = !!(normalizedDomain && orgDomain && normalizedDomain === orgDomain);
      const shouldBeOrgProfile = isOrgProfile || domainMatchesOrg;

      const profile = await createMutation.mutateAsync({
        organization_id: orgId,
        created_by: userId,
        company_name: companyName.trim(),
        company_domain: normalizedDomain,
        profile_type: shouldBeOrgProfile ? 'client_org' : profileChoice as FactProfileType,
        is_org_profile: shouldBeOrgProfile,
        ...((!shouldBeOrgProfile && linkedCompanyDomain.trim()) && {
          linked_company_domain: normalizeCompanyDomain(linkedCompanyDomain.trim()),
        }),
      });

      // Close dialog and show progress UI immediately after profile creation.
      handleOpenChange(false);
      onCreated(profile, triggerResearch);

      if (triggerResearch) {
        // Trigger research in the background so progress animation starts right away.
        void supabase.functions
          .invoke('research-fact-profile', {
            body: { action: 'research', profileId: profile.id },
          })
          .then(({ error }) => {
            if (error) {
              toast.error('Profile created but research failed to start: ' + error.message);
            }
          })
          .catch(() => {
            toast.error('Profile created but research failed to start');
          });
      }
    } catch (err: unknown) {
      // Handle unique constraint violation (PostgREST code 23505)
      const message = err instanceof Error ? err.message : String(err);
      if (message.includes('23505') || message.includes('idx_unique_domain_per_org') || message.includes('duplicate key')) {
        toast.error('A fact profile for this domain already exists in your organization');
      }
      // Other errors are handled by the mutation's onError callback
    } finally {
      setter(false);
    }
  };

  const isSubmitting = isCreating || isCreatingWithResearch;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-[#1E293B] dark:text-gray-100">
            New Company Profile
          </DialogTitle>
          <DialogDescription>
            Create a research-backed business profile for a client or target company.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Company Name */}
          <div className="space-y-2">
            <Label htmlFor="company-name">
              Company Name <span className="text-red-500">*</span>
            </Label>
            <Input
              id="company-name"
              placeholder="Acme Corporation"
              value={companyName}
              onChange={(e) => setCompanyName(e.target.value)}
              disabled={isSubmitting}
              autoFocus
            />
          </div>

          {/* Company Domain */}
          <div className="space-y-2">
            <Label htmlFor="company-domain">Company Domain</Label>
            <Input
              id="company-domain"
              placeholder="acme.com"
              value={companyDomain}
              onChange={(e) => setCompanyDomain(e.target.value)}
              onBlur={handleDomainBlur}
              disabled={isSubmitting || isOrgProfile}
            />
            <p className="text-xs text-[#94A3B8] dark:text-gray-500">
              {isOrgProfile
                ? 'Auto-filled from your organization settings.'
                : 'Optional. Helps improve research accuracy.'}
            </p>
          </div>

          {/* Profile Type */}
          <div className="space-y-2">
            <Label>Profile Type</Label>
            <div className="grid grid-cols-1 gap-2">
              {/* Org Profile option */}
              <button
                type="button"
                onClick={() => !hasOrgProfile && setProfileChoice('org_profile')}
                disabled={isSubmitting || hasOrgProfile}
                className={`flex items-center gap-3 rounded-xl border px-3 py-2.5 text-left text-sm transition-colors ${
                  hasOrgProfile
                    ? 'border-[#E2E8F0] dark:border-gray-700/50 bg-gray-50 dark:bg-gray-800/30 opacity-50 cursor-not-allowed'
                    : profileChoice === 'org_profile'
                      ? 'border-brand-blue bg-brand-blue/5 dark:border-blue-500 dark:bg-blue-500/10'
                      : 'border-[#E2E8F0] dark:border-gray-700/50 hover:border-[#CBD5E1] dark:hover:border-gray-600 cursor-pointer'
                }`}
              >
                <Shield className={`h-4 w-4 shrink-0 ${
                  profileChoice === 'org_profile' && !hasOrgProfile
                    ? 'text-brand-blue dark:text-blue-400'
                    : 'text-[#94A3B8] dark:text-gray-500'
                }`} />
                <div className="flex-1 min-w-0">
                  <span className={`font-medium ${
                    profileChoice === 'org_profile' && !hasOrgProfile
                      ? 'text-brand-blue dark:text-blue-400'
                      : 'text-[#1E293B] dark:text-gray-100'
                  }`}>
                    {activeOrg?.name ? `${activeOrg.name}'s Profile` : 'Your Org Profile'}
                  </span>
                  <p className="text-xs text-[#94A3B8] dark:text-gray-500 mt-0.5">
                    {hasOrgProfile
                      ? 'Already exists — only one org profile allowed'
                      : 'Your own business profile. Feeds org context for AI features.'}
                  </p>
                </div>
              </button>

              {/* Client Profile */}
              <button
                type="button"
                onClick={() => setProfileChoice('client_org')}
                disabled={isSubmitting}
                className={`flex items-center gap-3 rounded-xl border px-3 py-2.5 text-left text-sm transition-colors ${
                  profileChoice === 'client_org'
                    ? 'border-brand-blue bg-brand-blue/5 dark:border-blue-500 dark:bg-blue-500/10'
                    : 'border-[#E2E8F0] dark:border-gray-700/50 hover:border-[#CBD5E1] dark:hover:border-gray-600 cursor-pointer'
                }`}
              >
                <Building2 className={`h-4 w-4 shrink-0 ${
                  profileChoice === 'client_org'
                    ? 'text-brand-blue dark:text-blue-400'
                    : 'text-[#94A3B8] dark:text-gray-500'
                }`} />
                <div className="flex-1 min-w-0">
                  <span className={`font-medium ${
                    profileChoice === 'client_org'
                      ? 'text-brand-blue dark:text-blue-400'
                      : 'text-[#1E293B] dark:text-gray-100'
                  }`}>
                    Client Profile
                  </span>
                  <p className="text-xs text-[#94A3B8] dark:text-gray-500 mt-0.5">
                    A company you currently work with or sell to.
                  </p>
                </div>
              </button>

              {/* Prospect Profile */}
              <button
                type="button"
                onClick={() => setProfileChoice('target_company')}
                disabled={isSubmitting}
                className={`flex items-center gap-3 rounded-xl border px-3 py-2.5 text-left text-sm transition-colors ${
                  profileChoice === 'target_company'
                    ? 'border-violet-500 bg-violet-500/5 dark:border-violet-500 dark:bg-violet-500/10'
                    : 'border-[#E2E8F0] dark:border-gray-700/50 hover:border-[#CBD5E1] dark:hover:border-gray-600 cursor-pointer'
                }`}
              >
                <Target className={`h-4 w-4 shrink-0 ${
                  profileChoice === 'target_company'
                    ? 'text-violet-600 dark:text-violet-400'
                    : 'text-[#94A3B8] dark:text-gray-500'
                }`} />
                <div className="flex-1 min-w-0">
                  <span className={`font-medium ${
                    profileChoice === 'target_company'
                      ? 'text-violet-600 dark:text-violet-400'
                      : 'text-[#1E293B] dark:text-gray-100'
                  }`}>
                    Prospect Profile
                  </span>
                  <p className="text-xs text-[#94A3B8] dark:text-gray-500 mt-0.5">
                    A company you're researching or want to sell to.
                  </p>
                </div>
              </button>
            </div>
          </div>

          {/* CRM Entity Linking — only for non-org profiles */}
          {!isOrgProfile && (
            <div className="space-y-2">
              <Label htmlFor="linked-company-domain" className="flex items-center gap-1.5">
                <Globe className="h-3.5 w-3.5 text-[#64748B] dark:text-gray-400" />
                Linked CRM Company Domain
              </Label>
              <Input
                id="linked-company-domain"
                placeholder="client-company.com"
                value={linkedCompanyDomain}
                onChange={(e) => setLinkedCompanyDomain(e.target.value)}
                disabled={isSubmitting}
              />
              <p className="text-xs text-[#94A3B8] dark:text-gray-500">
                Optional. Links this profile to a CRM company record by domain.
              </p>
            </div>
          )}
        </div>

        <DialogFooter className="gap-2 sm:gap-2">
          <Button
            variant="outline"
            onClick={() => createProfile(false)}
            disabled={isSubmitting || !companyName.trim()}
          >
            {isCreating ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Creating...
              </>
            ) : (
              <>
                <Plus className="mr-2 h-4 w-4" />
                Create Only
              </>
            )}
          </Button>
          <Button
            onClick={() => createProfile(true)}
            disabled={isSubmitting || !companyName.trim()}
            className="bg-brand-blue hover:bg-brand-blue/90 text-white"
          >
            {isCreatingWithResearch ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Creating...
              </>
            ) : (
              <>
                <Sparkles className="mr-2 h-4 w-4" />
                Create & Research
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
