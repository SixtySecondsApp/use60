/**
 * OrganizationSelectionStep
 *
 * Shows similar organizations when user enters a company name
 * Allows them to request to join an existing org or create a new one
 */

import { motion } from 'framer-motion';
import { Building2, Users, Plus, Loader2 } from 'lucide-react';
import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase/clientV2';
import { useOnboardingV2Store } from '@/lib/stores/onboardingV2Store';
import { toast } from 'sonner';

interface SimilarOrg {
  id: string;
  name: string;
  company_domain: string;
  member_count: number;
  similarity_score: number;
}

export function OrganizationSelectionStep() {
  const [similarOrgs, setSimilarOrgs] = useState<SimilarOrg[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const {
    manualData,
    similarOrganizations: preFetchedOrgs,
    matchSearchTerm,
    submitJoinRequest,
    createNewOrganization
  } = useOnboardingV2Store();

  // Use pre-fetched orgs if available, fall back to manual data search
  const companyName = manualData?.company_name || matchSearchTerm || '';

  useEffect(() => {
    // If we have pre-fetched orgs, use them sorted by confidence
    if (preFetchedOrgs && preFetchedOrgs.length > 0) {
      const sorted = [...preFetchedOrgs].sort((a, b) => b.similarity_score - a.similarity_score);
      setSimilarOrgs(sorted);
      setLoading(false);
      return;
    }

    // Otherwise, search for similar orgs
    searchSimilarOrgs();
  }, [companyName, preFetchedOrgs]);

  const searchSimilarOrgs = async () => {
    if (!companyName) return;

    setLoading(true);
    try {
      const { data, error } = await supabase.rpc('find_similar_organizations', {
        p_search_name: companyName,
        p_limit: 5,
      });

      if (error) {
        console.error('Error searching similar orgs:', error);
        toast.error('Failed to search for organizations');
        return;
      }

      const sorted = (data || []).sort((a: SimilarOrg, b: SimilarOrg) => b.similarity_score - a.similarity_score);
      setSimilarOrgs(sorted);
    } catch (err) {
      console.error('Exception searching orgs:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleSelectOrg = async (org: SimilarOrg) => {
    setSubmitting(true);
    try {
      // Create join request for selected org
      await submitJoinRequest(org.id, org.name);
      toast.success('Join request submitted!');
    } catch (err) {
      toast.error('Failed to submit join request');
      console.error(err);
    } finally {
      setSubmitting(false);
    }
  };

  const handleCreateNew = async () => {
    setSubmitting(true);
    try {
      // Create new organization with the entered name
      await createNewOrganization(companyName);
      toast.success('Organization created!');
    } catch (err) {
      toast.error('Failed to create organization');
      console.error(err);
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-8 h-8 text-violet-500 animate-spin" />
      </div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="w-full max-w-2xl mx-auto px-4"
    >
      <div className="mb-8">
        <h2 className="text-2xl font-bold text-white mb-2">
          Found Similar Organizations
        </h2>
        <p className="text-gray-400">
          We found {similarOrgs.length} organization{similarOrgs.length !== 1 ? 's' : ''} similar to "{companyName}".
          Would you like to join one, or create a new organization?
        </p>
      </div>

      {/* Similar Organizations List */}
      {similarOrgs.length > 0 && (
        <div className="space-y-3 mb-6">
          {similarOrgs.map((org) => (
            <button
              key={org.id}
              onClick={() => handleSelectOrg(org)}
              disabled={submitting}
              className="w-full bg-gray-800/50 hover:bg-gray-800 border border-gray-700 hover:border-violet-600 rounded-xl p-4 transition-all duration-200 text-left disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <div className="flex items-start justify-between">
                <div className="flex gap-3">
                  <div className="w-10 h-10 bg-violet-600/20 rounded-lg flex items-center justify-center flex-shrink-0">
                    <Building2 className="w-5 h-5 text-violet-400" />
                  </div>
                  <div>
                    <p className="font-semibold text-white mb-1">{org.name}</p>
                    {org.company_domain && (
                      <p className="text-sm text-gray-400 mb-2">{org.company_domain}</p>
                    )}
                    <div className="flex items-center gap-2 text-sm text-gray-500">
                      <Users className="w-4 h-4" />
                      <span>{org.member_count} member{org.member_count !== 1 ? 's' : ''}</span>
                    </div>
                  </div>
                </div>
                <div className={`text-xs px-2 py-1 rounded-full font-medium ${
                  org.similarity_score > 0.9
                    ? 'bg-emerald-900/40 text-emerald-400'
                    : org.similarity_score > 0.8
                    ? 'bg-blue-900/40 text-blue-400'
                    : 'bg-amber-900/40 text-amber-400'
                }`}>
                  {Math.round(org.similarity_score * 100)}% match
                </div>
              </div>
            </button>
          ))}
        </div>
      )}

      {/* Create New Organization Button */}
      <button
        onClick={handleCreateNew}
        disabled={submitting}
        className="w-full bg-violet-600 hover:bg-violet-700 disabled:bg-gray-700 disabled:cursor-not-allowed text-white font-medium py-3 px-4 rounded-lg transition-colors duration-200 flex items-center justify-center gap-2"
      >
        {submitting ? (
          <>
            <Loader2 className="w-5 h-5 animate-spin" />
            Creating...
          </>
        ) : (
          <>
            <Plus className="w-5 h-5" />
            Create New Organization: "{companyName}"
          </>
        )}
      </button>

      <p className="text-xs text-gray-500 text-center mt-4">
        Don't see your organization? Create a new one above.
      </p>
    </motion.div>
  );
}
