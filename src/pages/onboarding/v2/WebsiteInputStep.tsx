/**
 * WebsiteInputStep
 *
 * Shown when user signs up with a personal email (gmail, etc.)
 * Now provides options to:
 * 1. Search for existing organizations and request to join (skips enrichment)
 * 2. Provide company website for enrichment (if creating new org)
 * 3. Answer Q&A questions (if no website available)
 */

import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Globe, ArrowRight, HelpCircle, Building2, Search, Loader2, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useOnboardingV2Store, extractDomain } from '@/lib/stores/onboardingV2Store';
import { supabase } from '@/lib/supabase/clientV2';
import { toast } from 'sonner';

interface WebsiteInputStepProps {
  organizationId: string;
}

interface SimilarOrg {
  id: string;
  name: string;
  company_domain: string;
  member_count: number;
  similarity_score: number;
}

export function WebsiteInputStep({ organizationId: propOrgId }: WebsiteInputStepProps) {
  const [websiteInput, setWebsiteInput] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [similarOrgs, setSimilarOrgs] = useState<SimilarOrg[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [selectedOrgId, setSelectedOrgId] = useState<string | null>(null);
  const [isJoining, setIsJoining] = useState(false);

  const {
    organizationId: storeOrgId,
    setWebsiteUrl,
    setHasNoWebsite,
    submitWebsite,
    submitJoinRequest,
    setStep,
  } = useOnboardingV2Store();

  // Use organizationId from store (which gets updated when new org is created)
  // Fall back to prop if store is empty
  const organizationId = storeOrgId || propOrgId;

  // Search for similar organizations as user types
  useEffect(() => {
    const searchOrgs = async () => {
      if (!searchQuery.trim() || searchQuery.length < 2) {
        setSimilarOrgs([]);
        return;
      }

      setSearchLoading(true);
      try {
        const { data, error } = await supabase.rpc('find_similar_organizations', {
          p_search_name: searchQuery,
          p_limit: 3,
        });

        if (error) {
          console.error('Error searching organizations:', error);
          setSimilarOrgs([]);
        } else {
          const sorted = (data || []).sort((a: SimilarOrg, b: SimilarOrg) => b.similarity_score - a.similarity_score);
          setSimilarOrgs(sorted);
        }
      } catch (err) {
        console.error('Exception searching orgs:', err);
        setSimilarOrgs([]);
      } finally {
        setSearchLoading(false);
      }
    };

    const debounceTimer = setTimeout(searchOrgs, 300);
    return () => clearTimeout(debounceTimer);
  }, [searchQuery]);

  const handleSelectOrg = async (org: SimilarOrg) => {
    setSelectedOrgId(org.id);
    setIsJoining(true);
    try {
      // Request to join the existing organization (skips enrichment)
      await submitJoinRequest(org.id, org.name);
      toast.success(`Join request submitted for ${org.name}!`);
    } catch (err) {
      toast.error('Failed to submit join request');
      console.error(err);
      setSelectedOrgId(null);
    } finally {
      setIsJoining(false);
    }
  };

  const handleSubmitWebsite = async () => {
    const trimmed = websiteInput.trim();
    if (!trimmed) {
      setError('Please enter your company website');
      return;
    }

    // Basic validation
    const domain = extractDomain(trimmed);
    if (!domain || domain.length < 3 || !domain.includes('.')) {
      setError('Please enter a valid website (e.g., acme.com)');
      return;
    }

    setError(null);
    setWebsiteUrl(trimmed);
    await submitWebsite(organizationId);
  };

  const handleNoWebsite = () => {
    setHasNoWebsite(true);
    setStep('manual_enrichment');
  };

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.95 }}
      className="w-full max-w-lg mx-auto px-4"
    >
      <div className="rounded-2xl shadow-xl border border-gray-800 bg-gray-900 p-8 sm:p-10">
        {/* Icon */}
        <div className="flex justify-center mb-6">
          <div className="w-20 h-20 rounded-full bg-gradient-to-br from-violet-500/20 to-violet-600/20 flex items-center justify-center">
            <Globe className="w-10 h-10 text-violet-400" />
          </div>
        </div>

        {/* Title */}
        <div className="text-center mb-8">
          <h2 className="text-2xl font-bold text-white mb-3">
            What's your company?
          </h2>
          <p className="text-gray-400">
            Search for an existing organization to join, or provide your website to set up a new one.
          </p>
        </div>

        {/* Search for Existing Organizations */}
        <div className="space-y-4 mb-8">
          <div>
            <label className="block text-sm font-medium text-gray-400 mb-2">
              Search for organization
            </label>
            <div className="relative">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-500" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Type organization name..."
                className="w-full pl-12 pr-4 py-4 rounded-xl border border-gray-700 bg-gray-800 text-white placeholder:text-gray-500 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all"
              />
            </div>
          </div>

          {/* Search Results */}
          {searchQuery.length >= 2 && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              className="space-y-2"
            >
              {searchLoading && (
                <div className="flex items-center justify-center py-4 text-gray-400">
                  <Loader2 className="w-4 h-4 animate-spin mr-2" />
                  <span>Searching...</span>
                </div>
              )}

              {!searchLoading && similarOrgs.length > 0 && (
                <div className="space-y-2 max-h-48 overflow-y-auto">
                  {similarOrgs.map((org) => (
                    <motion.button
                      key={org.id}
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      onClick={() => handleSelectOrg(org)}
                      disabled={isJoining && selectedOrgId === org.id}
                      className="w-full flex items-center justify-between p-4 rounded-lg border border-gray-700 bg-gray-800/50 hover:bg-gray-800 hover:border-blue-600 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <div className="text-left">
                        <p className="font-medium text-white">{org.name}</p>
                        <p className="text-xs text-gray-400">{org.member_count} members</p>
                      </div>
                      {isJoining && selectedOrgId === org.id ? (
                        <Loader2 className="w-4 h-4 text-blue-500 animate-spin" />
                      ) : (
                        <motion.div
                          whileHover={{ scale: 1.1 }}
                          className="w-6 h-6 rounded-full border-2 border-gray-600 flex items-center justify-center"
                        >
                          {org.similarity_score >= 0.8 && (
                            <Check className="w-4 h-4 text-green-400" />
                          )}
                        </motion.div>
                      )}
                    </motion.button>
                  ))}
                </div>
              )}

              {!searchLoading && searchQuery.length >= 2 && similarOrgs.length === 0 && (
                <p className="text-sm text-gray-400 text-center py-4">
                  No organizations found. Continue below to create a new one.
                </p>
              )}
            </motion.div>
          )}
        </div>

        {/* Divider */}
        <div className="relative mb-6">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-gray-800" />
          </div>
          <div className="relative flex justify-center text-sm">
            <span className="px-4 bg-gray-900 text-gray-500">or create new</span>
          </div>
        </div>

        {/* Website Input */}
        <div className="space-y-4 mb-8">
          <div>
            <label className="block text-sm font-medium text-gray-400 mb-2">
              Company website
            </label>
            <div className="relative">
              <Building2 className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-500" />
              <input
                type="text"
                value={websiteInput}
                onChange={(e) => {
                  setWebsiteInput(e.target.value);
                  setError(null);
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    handleSubmitWebsite();
                  }
                }}
                placeholder="acme.com"
                className="w-full pl-12 pr-4 py-4 rounded-xl border border-gray-700 bg-gray-800 text-white placeholder:text-gray-500 focus:ring-2 focus:ring-violet-500 focus:border-violet-500 transition-all"
              />
            </div>
            {error && (
              <motion.p
                initial={{ opacity: 0, y: -5 }}
                animate={{ opacity: 1, y: 0 }}
                className="text-red-400 text-sm mt-2"
              >
                {error}
              </motion.p>
            )}
          </div>

          <Button
            onClick={handleSubmitWebsite}
            disabled={!websiteInput.trim()}
            className="w-full bg-violet-600 hover:bg-violet-700 text-white py-4 text-base"
          >
            Continue
            <ArrowRight className="w-5 h-5 ml-2" />
          </Button>
        </div>

        {/* No Website Option */}
        <button
          onClick={handleNoWebsite}
          className="w-full flex items-center justify-center gap-2 py-4 px-6 rounded-xl border border-gray-700 text-gray-400 hover:text-white hover:border-gray-600 hover:bg-gray-800/50 transition-all"
        >
          <HelpCircle className="w-5 h-5" />
          <span>I don't have a website yet</span>
        </button>

        {/* Helper text */}
        <p className="text-center text-xs text-gray-500 mt-4">
          No worries! We'll ask a few quick questions to understand your business instead.
        </p>
      </div>
    </motion.div>
  );
}
