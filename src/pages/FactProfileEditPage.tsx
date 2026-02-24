/**
 * FactProfileEditPage -- Page wrapper for the Fact Profile editor.
 *
 * Fetches a single fact profile by ID from the URL params, handles loading
 * and not-found states, and delegates to FactProfileEditor for the actual UI.
 */

import { Helmet } from 'react-helmet-async';
import { useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useFactProfile, useUpdateFactProfile } from '@/lib/hooks/useFactProfiles';
import { FactProfileEditor } from '@/components/fact-profiles/FactProfileEditor';
import type { FactProfileResearchData, ApprovalStatus } from '@/lib/types/factProfile';
import { Loader2 } from 'lucide-react';

export default function FactProfileEditPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { data: profile, isLoading } = useFactProfile(id ?? '');
  const updateProfile = useUpdateFactProfile();

  const handleSave = useCallback((data: Partial<FactProfileResearchData>) => {
    if (!id || !profile) return;
    updateProfile.mutate({
      id,
      payload: { research_data: { ...profile.research_data, ...data } },
      // Auto-save runs frequently, so avoid success toast spam.
      silent: true,
    });
  }, [id, profile, updateProfile]);

  const handleStatusChange = useCallback((status: ApprovalStatus) => {
    if (!id) return;
    updateProfile.mutate({ id, payload: { approval_status: status }, silent: false });
  }, [id, updateProfile]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="h-8 w-8 animate-spin text-brand-blue" />
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="container mx-auto px-3 sm:px-4 lg:px-6 py-8">
        <p className="text-[#64748B]">Fact profile not found.</p>
      </div>
    );
  }

  return (
    <>
      <Helmet><title>Edit {profile.company_name} | 60</title></Helmet>
      <FactProfileEditor
        profile={profile}
        onSave={handleSave}
        onStatusChange={handleStatusChange}
        isSaving={updateProfile.isPending}
      />
    </>
  );
}
