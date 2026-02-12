import React, { useState } from 'react';
import { Building2, Target, Plus, Loader2, Sparkles, Shield, Info, Globe } from 'lucide-react';
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
import { useActiveOrgId } from '@/lib/stores/orgStore';
import { useAuth } from '@/lib/contexts/AuthContext';
import { supabase } from '@/lib/supabase/clientV2';
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
  const { userId } = useAuth();
  const createMutation = useCreateFactProfile();

  const [companyName, setCompanyName] = useState('');
  const [companyDomain, setCompanyDomain] = useState('');
  const [profileType, setProfileType] = useState<FactProfileType>('client_org');
  const [markAsOrgProfile, setMarkAsOrgProfile] = useState(false);
  const [linkedCompanyDomain, setLinkedCompanyDomain] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [isCreatingWithResearch, setIsCreatingWithResearch] = useState(false);

  // Reset form when dialog opens/closes
  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen) {
      setCompanyName('');
      setCompanyDomain('');
      setProfileType('client_org');
      setMarkAsOrgProfile(false);
      setLinkedCompanyDomain('');
      setIsCreating(false);
      setIsCreatingWithResearch(false);
    }
    onOpenChange(nextOpen);
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
      const profile = await createMutation.mutateAsync({
        organization_id: orgId,
        created_by: userId,
        company_name: companyName.trim(),
        company_domain: companyDomain.trim() || null,
        profile_type: profileType,
        is_org_profile: markAsOrgProfile,
        ...((!markAsOrgProfile && linkedCompanyDomain.trim()) && {
          linked_company_domain: linkedCompanyDomain.trim(),
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
    } catch {
      // Error toast is already handled by the mutation's onError
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
            New Fact Profile
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
              disabled={isSubmitting}
            />
            <p className="text-xs text-[#94A3B8] dark:text-gray-500">
              Optional. Helps improve research accuracy.
            </p>
          </div>

          {/* Profile Type Toggle */}
          <div className="space-y-2">
            <Label>Profile Type</Label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setProfileType('client_org')}
                disabled={isSubmitting}
                className={`flex items-center justify-center gap-2 rounded-xl border px-3 py-2.5 text-sm font-medium transition-colors ${
                  profileType === 'client_org'
                    ? 'border-brand-blue bg-brand-blue/5 text-brand-blue dark:border-blue-500 dark:bg-blue-500/10 dark:text-blue-400'
                    : 'border-[#E2E8F0] dark:border-gray-700/50 text-[#64748B] dark:text-gray-400 hover:border-[#CBD5E1] dark:hover:border-gray-600'
                }`}
              >
                <Building2 className="h-4 w-4" />
                Client Organization
              </button>
              <button
                type="button"
                onClick={() => setProfileType('target_company')}
                disabled={isSubmitting}
                className={`flex items-center justify-center gap-2 rounded-xl border px-3 py-2.5 text-sm font-medium transition-colors ${
                  profileType === 'target_company'
                    ? 'border-violet-500 bg-violet-500/5 text-violet-600 dark:border-violet-500 dark:bg-violet-500/10 dark:text-violet-400'
                    : 'border-[#E2E8F0] dark:border-gray-700/50 text-[#64748B] dark:text-gray-400 hover:border-[#CBD5E1] dark:hover:border-gray-600'
                }`}
              >
                <Target className="h-4 w-4" />
                Target Company
              </button>
            </div>
          </div>

          {/* Org Profile Option */}
          <div className="space-y-2">
            {hasOrgProfile ? (
              <div className="flex items-center gap-2 rounded-xl border border-[#E2E8F0] dark:border-gray-700/50 bg-gray-50 dark:bg-gray-800/30 px-3 py-2.5">
                <Info className="h-4 w-4 shrink-0 text-[#94A3B8] dark:text-gray-500" />
                <span className="text-xs text-[#64748B] dark:text-gray-400">
                  Your business profile already exists
                </span>
              </div>
            ) : (
              <label className="flex items-start gap-3 rounded-xl border border-[#E2E8F0] dark:border-gray-700/50 px-3 py-2.5 cursor-pointer hover:border-[#CBD5E1] dark:hover:border-gray-600 transition-colors">
                <input
                  type="checkbox"
                  checked={markAsOrgProfile}
                  onChange={(e) => setMarkAsOrgProfile(e.target.checked)}
                  disabled={isSubmitting}
                  className="mt-0.5 rounded border-gray-300 text-brand-blue focus:ring-brand-blue"
                />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 text-sm font-medium text-[#1E293B] dark:text-gray-100">
                    <Shield className="h-3.5 w-3.5 text-brand-blue dark:text-blue-400" />
                    Create as org profile
                  </div>
                  <p className="text-xs text-[#94A3B8] dark:text-gray-500 mt-0.5">
                    Designates this as your own business profile. Research data feeds org context for AI features.
                  </p>
                </div>
              </label>
            )}
          </div>

          {/* CRM Entity Linking — only for non-org profiles */}
          {!markAsOrgProfile && (
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
