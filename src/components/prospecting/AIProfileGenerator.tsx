/**
 * AIProfileGenerator — Generate ICP profiles from org context using AI.
 *
 * Calls generate-icp-profiles edge function, displays suggestion cards,
 * and allows saving or editing generated profiles.
 */

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Sparkles, Wand2, Check, X, Edit, Loader2, RefreshCw, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/lib/supabase/clientV2';
import { useCreateICPProfile } from '@/lib/hooks/useICPProfilesCRUD';
import { useAuth } from '@/lib/contexts/AuthContext';
import type { ICPProfile, ICPCriteria } from '@/lib/types/prospecting';

// ---------------------------------------------------------------------------
// Types for the edge function response
// ---------------------------------------------------------------------------

interface GeneratedProfile {
  id: string;
  name: string;
  description: string;
  emoji: string;
  filters: ApolloFilters;
  filter_count: number;
  rationale: string;
}

interface ApolloFilters {
  person_titles?: string[];
  person_seniorities?: string[];
  person_departments?: string[];
  person_locations?: string[];
  q_keywords?: string;
  organization_num_employees_ranges?: string[];
  organization_latest_funding_stage_cd?: string[];
  q_organization_keyword_tags?: string[];
  contact_email_status?: string[];
}

// ---------------------------------------------------------------------------
// Convert Apollo filters -> ICPCriteria
// ---------------------------------------------------------------------------

function apolloToICPCriteria(filters: ApolloFilters): ICPCriteria {
  const criteria: ICPCriteria = {};

  if (filters.person_titles?.length) {
    criteria.title_keywords = filters.person_titles;
    criteria.title_search_mode = 'smart';
  }

  if (filters.person_seniorities?.length) {
    criteria.seniority_levels = filters.person_seniorities;
  }

  if (filters.person_departments?.length) {
    criteria.departments = filters.person_departments;
  }

  if (filters.person_locations?.length) {
    // Split into countries and cities heuristically
    criteria.location_countries = filters.person_locations;
  }

  if (filters.organization_num_employees_ranges?.length) {
    criteria.employee_ranges = filters.organization_num_employees_ranges.map((range) => {
      const [minStr, maxStr] = range.split(',');
      return {
        min: parseInt(minStr, 10) || 0,
        max: maxStr ? parseInt(maxStr, 10) || 1000000 : 1000000,
      };
    });
  }

  if (filters.organization_latest_funding_stage_cd?.length) {
    criteria.funding_stages = filters.organization_latest_funding_stage_cd;
  }

  if (filters.q_keywords) {
    criteria.custom_keywords = [filters.q_keywords];
  }

  if (filters.q_organization_keyword_tags?.length) {
    criteria.technology_keywords = filters.q_organization_keyword_tags;
  }

  return criteria;
}

// ---------------------------------------------------------------------------
// Summarize filters for preview
// ---------------------------------------------------------------------------

function summarizeFilters(filters: ApolloFilters): string[] {
  const parts: string[] = [];
  if (filters.person_titles?.length) parts.push(`Titles: ${filters.person_titles.slice(0, 3).join(', ')}${filters.person_titles.length > 3 ? '...' : ''}`);
  if (filters.person_seniorities?.length) parts.push(`Seniority: ${filters.person_seniorities.join(', ')}`);
  if (filters.person_departments?.length) parts.push(`Depts: ${filters.person_departments.join(', ')}`);
  if (filters.organization_num_employees_ranges?.length) parts.push(`Size: ${filters.organization_num_employees_ranges.join(', ')}`);
  if (filters.organization_latest_funding_stage_cd?.length) parts.push(`Funding: ${filters.organization_latest_funding_stage_cd.join(', ')}`);
  if (filters.q_keywords) parts.push(`Keywords: ${filters.q_keywords}`);
  return parts;
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface AIProfileGeneratorProps {
  onProfileCreated: (profile: ICPProfile) => void;
  onEditAndSave?: (criteria: ICPCriteria, name: string, description: string) => void;
  orgId: string;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function AIProfileGenerator({ onProfileCreated, onEditAndSave, orgId }: AIProfileGeneratorProps) {
  const { userId } = useAuth();
  const createMutation = useCreateICPProfile();

  const [isGenerating, setIsGenerating] = useState(false);
  const [profiles, setProfiles] = useState<GeneratedProfile[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [savedIds, setSavedIds] = useState<Set<string>>(new Set());
  const [dismissedIds, setDismissedIds] = useState<Set<string>>(new Set());
  const [hasGenerated, setHasGenerated] = useState(false);

  const generate = async (forceRegenerate = false) => {
    setIsGenerating(true);
    setError(null);

    try {
      const { data, error: fnError } = await supabase.functions.invoke('generate-icp-profiles', {
        body: { force_regenerate: forceRegenerate },
      });

      if (fnError) throw new Error(fnError.message || 'Failed to generate profiles');
      if (data?.error) throw new Error(data.error);

      const generated = (data?.profiles ?? []) as GeneratedProfile[];

      if (generated.length === 0) {
        setError(data?.reason === 'no_context'
          ? 'Not enough organization context to generate profiles. Add company details in Settings first.'
          : 'No profiles could be generated. Try adding more organization context.');
      }

      setProfiles(generated);
      setSavedIds(new Set());
      setDismissedIds(new Set());
      setHasGenerated(true);
    } catch (err) {
      setError((err as Error).message || 'AI generation failed');
    } finally {
      setIsGenerating(false);
    }
  };

  const handleSave = (profile: GeneratedProfile) => {
    if (!userId) return;

    const criteria = apolloToICPCriteria(profile.filters);

    createMutation.mutate(
      {
        organization_id: orgId,
        created_by: userId,
        name: profile.name,
        description: profile.description,
        criteria,
        target_provider: 'apollo',
        status: 'draft',
      },
      {
        onSuccess: (saved) => {
          setSavedIds((prev) => new Set(prev).add(profile.id));
          onProfileCreated(saved);
        },
      }
    );
  };

  const handleEditAndSave = (profile: GeneratedProfile) => {
    if (onEditAndSave) {
      const criteria = apolloToICPCriteria(profile.filters);
      onEditAndSave(criteria, profile.name, profile.description);
    }
  };

  const handleDismiss = (profileId: string) => {
    setDismissedIds((prev) => new Set(prev).add(profileId));
  };

  const visibleProfiles = profiles.filter((p) => !dismissedIds.has(p.id));

  // If not yet generated, show the generate button
  if (!hasGenerated && !isGenerating) {
    return (
      <div className="text-center py-8 space-y-4">
        <div className="mx-auto w-12 h-12 rounded-full bg-brand-violet/10 dark:bg-brand-violet/10 flex items-center justify-center">
          <Sparkles className="h-6 w-6 text-brand-violet dark:text-purple-400" />
        </div>
        <div>
          <h3 className="text-sm font-medium text-[#1E293B] dark:text-gray-100">AI Profile Generator</h3>
          <p className="text-xs text-[#64748B] dark:text-gray-400 mt-1 max-w-sm mx-auto">
            Automatically generate ICP profiles based on your organization context, past searches, and enrichment data.
          </p>
        </div>
        <Button onClick={() => generate(false)} className="gap-2">
          <Wand2 className="h-4 w-4" />
          Generate Profiles
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header with regenerate */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-brand-violet dark:text-purple-400" />
          <span className="text-sm font-medium text-[#1E293B] dark:text-gray-100">AI Suggestions</span>
          {profiles.length > 0 && (
            <Badge variant="secondary" className="text-xs">{visibleProfiles.length} profiles</Badge>
          )}
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => generate(true)}
          disabled={isGenerating}
          className="gap-1.5 text-xs"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${isGenerating ? 'animate-spin' : ''}`} />
          Regenerate
        </Button>
      </div>

      {/* Loading state */}
      {isGenerating && (
        <div className="rounded-xl border border-[#E2E8F0] dark:border-gray-700/50 p-6 text-center space-y-3 bg-white dark:bg-gray-900/80 backdrop-blur-sm">
          <Loader2 className="h-6 w-6 animate-spin mx-auto text-brand-violet dark:text-purple-400" />
          <div>
            <p className="text-sm text-[#1E293B] dark:text-gray-100">Analyzing your organization context...</p>
            <p className="text-xs text-[#64748B] dark:text-gray-400 mt-1">Generating targeted ICP profiles</p>
          </div>
        </div>
      )}

      {/* Error state */}
      {error && (
        <div className="rounded-xl border border-amber-200 dark:border-amber-500/20 bg-amber-50 dark:bg-amber-500/5 p-4 flex items-start gap-3">
          <AlertCircle className="h-4 w-4 text-amber-600 dark:text-amber-400 mt-0.5 shrink-0" />
          <div>
            <p className="text-sm text-amber-800 dark:text-amber-300">{error}</p>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => generate(true)}
              className="mt-2 text-xs text-amber-700 dark:text-amber-400"
            >
              Try again
            </Button>
          </div>
        </div>
      )}

      {/* Profile suggestion cards */}
      <AnimatePresence mode="popLayout">
        {visibleProfiles.map((profile, idx) => {
          const isSaved = savedIds.has(profile.id);
          const filterSummary = summarizeFilters(profile.filters);

          return (
            <motion.div
              key={profile.id}
              layout
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, x: -100 }}
              transition={{ delay: idx * 0.05 }}
              className="rounded-xl border border-[#E2E8F0] dark:border-gray-700/50 bg-white dark:bg-gray-900/80 p-4 space-y-3 backdrop-blur-sm"
            >
              {/* Name + description */}
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <h4 className="text-sm font-medium text-[#1E293B] dark:text-gray-100">{profile.name}</h4>
                  <p className="text-xs text-[#64748B] dark:text-gray-400 mt-0.5">{profile.description}</p>
                </div>
                {!isSaved && (
                  <button
                    onClick={() => handleDismiss(profile.id)}
                    className="text-[#94A3B8] hover:text-[#64748B] dark:text-gray-500 dark:hover:text-gray-400 shrink-0"
                  >
                    <X className="h-4 w-4" />
                  </button>
                )}
              </div>

              {/* Rationale */}
              {profile.rationale && (
                <p className="text-xs text-[#94A3B8] dark:text-gray-500 italic">{profile.rationale}</p>
              )}

              {/* Filter preview */}
              <div className="flex flex-wrap gap-1">
                {filterSummary.map((text) => (
                  <Badge key={text} variant="outline" className="text-xs font-normal">
                    {text}
                  </Badge>
                ))}
                <Badge variant="secondary" className="text-xs">
                  {profile.filter_count} filters
                </Badge>
              </div>

              {/* Actions */}
              <div className="flex items-center gap-2 pt-1">
                {isSaved ? (
                  <Badge variant="success" className="gap-1">
                    <Check className="h-3 w-3" />
                    Saved
                  </Badge>
                ) : (
                  <>
                    <Button
                      size="sm"
                      onClick={() => handleSave(profile)}
                      disabled={createMutation.isPending}
                      className="gap-1.5 text-xs"
                    >
                      <Check className="h-3.5 w-3.5" />
                      Save as Profile
                    </Button>
                    {onEditAndSave && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleEditAndSave(profile)}
                        className="gap-1.5 text-xs"
                      >
                        <Edit className="h-3.5 w-3.5" />
                        Edit & Save
                      </Button>
                    )}
                  </>
                )}
              </div>
            </motion.div>
          );
        })}
      </AnimatePresence>

      {/* All dismissed message */}
      {hasGenerated && !isGenerating && visibleProfiles.length === 0 && profiles.length > 0 && (
        <div className="text-center py-4">
          <p className="text-xs text-[#94A3B8] dark:text-gray-500">All suggestions dismissed.</p>
          <Button variant="ghost" size="sm" onClick={() => setDismissedIds(new Set())} className="mt-1 text-xs">
            Show again
          </Button>
        </div>
      )}
    </div>
  );
}
