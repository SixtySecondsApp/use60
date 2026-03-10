/**
 * OrgSetupStep - Organization Setup Onboarding Step
 *
 * Allows users to:
 * 1. Join an existing organization (if one exists with matching email domain)
 * 2. Create a new organization
 * 3. Update their existing organization name
 */

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Building2, Check, Loader2, AlertCircle, Users, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useOrg } from '@/lib/contexts/OrgContext';
import { useAuth } from '@/lib/contexts/AuthContext';
import { supabase } from '@/lib/supabase/clientV2';
import { toast } from 'sonner';

interface MatchingOrg {
  id: string;
  name: string;
  member_count: number;
}

interface OrgSetupStepProps {
  onNext: () => void;
  onBack: () => void;
}

// Comprehensive list of generic/personal email domains
const GENERIC_EMAIL_DOMAINS = [
  'gmail.com',
  'yahoo.com',
  'hotmail.com',
  'outlook.com',
  'icloud.com',
  'aol.com',
  'protonmail.com',
  'mail.com',
  'inbox.com',
  'zoho.com',
  'yandex.com',
  'mail.ru',
  'qq.com',
  '163.com',
  'sina.com',
];

export function OrgSetupStep({ onNext, onBack }: OrgSetupStepProps) {
  const { user } = useAuth();
  const { activeOrg, refreshOrgs, createOrg, isLoading: orgLoading } = useOrg();
  const [orgName, setOrgName] = useState('');
  const [isUpdating, setIsUpdating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasCheckedOrg, setHasCheckedOrg] = useState(false);
  const [hasTriggeredEnrichment, setHasTriggeredEnrichment] = useState(false);

  // Domain matching state
  const [matchingOrgs, setMatchingOrgs] = useState<MatchingOrg[]>([]);
  const [isLoadingMatches, setIsLoadingMatches] = useState(false);
  const [selectedOption, setSelectedOption] = useState<'join' | 'create' | null>(null);
  const [selectedOrgId, setSelectedOrgId] = useState<string | null>(null);
  const [askingForOrgName, setAskingForOrgName] = useState(false);

  // Extract domain from user email
  const userDomain = user?.email?.split('@')[1]?.toLowerCase() || '';
  const isPersonalEmail = GENERIC_EMAIL_DOMAINS.includes(userDomain);

  // Check for matching organizations by domain
  useEffect(() => {
    const findMatchingOrgs = async () => {
      // Skip if user already has an org
      if (activeOrg) {
        setSelectedOption(null); // User already has org
        return;
      }

      // For personal emails, ask user to enter organization name
      if (isPersonalEmail || !userDomain || !user?.id) {
        setAskingForOrgName(true);
        return;
      }

      setIsLoadingMatches(true);
      try {
        // Find organizations where other users with the same email domain are members
        const { data, error: searchError } = await supabase
          .rpc('find_orgs_by_email_domain', { p_domain: userDomain, p_user_id: user.id });

        if (searchError) {
          console.warn('Error finding matching orgs:', searchError);
          // If RPC doesn't exist or fails, fall back to create mode
          setSelectedOption('create');
          return;
        }

        if (data && data.length > 0) {
          setMatchingOrgs(data);
          // If there are matches, show the choice UI
          setSelectedOption(null);
        } else {
          // No matches, default to create
          setSelectedOption('create');
        }
      } catch (err) {
        console.warn('Error searching for matching orgs:', err);
        setSelectedOption('create');
      } finally {
        setIsLoadingMatches(false);
      }
    };

    if (hasCheckedOrg) {
      findMatchingOrgs();
    }
  }, [hasCheckedOrg, activeOrg, userDomain, isPersonalEmail, user?.id]);

  // Check if user has an organization and get name from waitlist or org
  useEffect(() => {
    const initializeOrgName = async () => {
      if (orgLoading) return;

      setHasCheckedOrg(true);

      if (activeOrg?.name) {
        // Organization already exists (created by trigger)
        setOrgName(activeOrg.name);
        setSelectedOption(null); // User already has org, no choice needed
      } else if (user?.id) {
        // Try to get company_name from waitlist entry
        try {
          const { data: waitlistEntry } = await supabase
            .from('meetings_waitlist')
            .select('company_name')
            .eq('user_id', user.id)
            .not('company_name', 'is', null)
            .order('created_at', { ascending: true })
            .limit(1)
            .single();

          if (waitlistEntry?.company_name) {
            // Use company name from waitlist (will be used by trigger to create org)
            setOrgName(waitlistEntry.company_name.trim());
          } else if (isPersonalEmail) {
            // For personal emails, leave orgName empty and let user enter it
            setOrgName('');
          } else {
            // For company emails, fallback to domain-based name
            const firstName = user.user_metadata?.first_name || '';
            const lastName = user.user_metadata?.last_name || '';
            const fullName = user.user_metadata?.full_name || `${firstName} ${lastName}`.trim();

            if (fullName) {
              setOrgName(`${fullName}'s Organization`);
            } else if (user.email) {
              const domain = user.email.split('@')[1];
              if (domain) {
                const companyName = domain.split('.')[0];
                setOrgName(companyName.charAt(0).toUpperCase() + companyName.slice(1));
              }
            }
          }
        } catch (err) {
          console.warn('Error fetching waitlist entry:', err);
          // Fallback logic
          if (isPersonalEmail) {
            // For personal emails, leave orgName empty and let user enter it
            setOrgName('');
          } else {
            // For company emails, fallback to domain-based name
            const firstName = user.user_metadata?.first_name || '';
            const lastName = user.user_metadata?.last_name || '';
            const fullName = user.user_metadata?.full_name || `${firstName} ${lastName}`.trim();

            if (fullName) {
              setOrgName(`${fullName}'s Organization`);
            } else if (user.email) {
              const domain = user.email.split('@')[1];
              if (domain) {
                const companyName = domain.split('.')[0];
                setOrgName(companyName.charAt(0).toUpperCase() + companyName.slice(1));
              }
            }
          }
        }
      }
    };

    initializeOrgName();
  }, [activeOrg?.name, orgLoading, user, isPersonalEmail]);

  // Background org enrichment (non-blocking)
  useEffect(() => {
    if (hasTriggeredEnrichment) return;
    if (!activeOrg?.id) return;
    if (!userDomain || isPersonalEmail) return;

    const status = (activeOrg as any)?.company_enrichment_status as string | null | undefined;
    if (status && status !== 'not_started') {
      setHasTriggeredEnrichment(true);
      return;
    }

    setHasTriggeredEnrichment(true);

    // Fire-and-forget: enrich org profile from domain (don’t block onboarding UX)
    supabase.functions
      .invoke('enrich-router', {
        body: {
          action: 'organization',
          orgId: activeOrg.id,
          domain: userDomain,
          orgName: activeOrg.name,
          force: false,
        },
      })
      .then(() => refreshOrgs())
      .catch(() => {
        // ignore errors; user can retry from org settings
      });
  }, [activeOrg?.id, activeOrg?.name, hasTriggeredEnrichment, isPersonalEmail, refreshOrgs, userDomain]);

  const handleJoinOrg = async () => {
    if (!selectedOrgId) {
      setError('Please select a team to join');
      return;
    }

    setIsUpdating(true);
    setError(null);

    try {
      // Request to join the team
      const { error: joinError } = await supabase
        .from('organization_memberships')
        .insert({
          org_id: selectedOrgId,
          user_id: user?.id,
          role: 'member',
        });

      if (joinError) {
        if (joinError.code === '23505') {
          // Already a member
          toast.info('You are already a member of this team');
        } else {
          throw joinError;
        }
      } else {
        toast.success('Joined team successfully!');
      }

      // Refresh organizations to get the new membership
      await refreshOrgs();
      onNext();
    } catch (err: any) {
      console.error('Error joining team:', err);
      setError(err.message || 'Failed to join team');
      toast.error('Failed to join team');
    } finally {
      setIsUpdating(false);
    }
  };

  const handleCreateOrg = async () => {
    if (!orgName.trim()) {
      setError('Team name is required');
      return;
    }

    if (orgName.trim().length > 100) {
      setError('Team name must be 100 characters or less');
      return;
    }

    setIsUpdating(true);
    setError(null);

    try {
      const newOrg = await createOrg(orgName.trim());

      if (!newOrg) {
        throw new Error('Failed to create team');
      }

      toast.success('Team created!');
      onNext();
    } catch (err: any) {
      console.error('Error creating team:', err);
      // Handle duplicate name error (PostgreSQL unique constraint violation)
      if (err.code === '23505' || err.message?.includes('duplicate') || err.message?.includes('unique')) {
        setError('This team name is already taken. Please choose a different name.');
        toast.error('Team name already exists');
      } else {
        setError(err.message || 'Failed to create team');
        toast.error('Failed to create team');
      }
    } finally {
      setIsUpdating(false);
    }
  };

  const handleUpdateOrgName = async () => {
    if (!orgName.trim()) {
      setError('Team name is required');
      return;
    }

    if (orgName.trim().length > 100) {
      setError('Team name must be 100 characters or less');
      return;
    }

    setIsUpdating(true);
    setError(null);

    try {
      const response = await (supabase.rpc as any)('rename_user_organization', {
        p_new_name: orgName.trim(),
      }) as { data: Array<{ success: boolean; error_message?: string }> | null; error: any };

      if (response.error) {
        if (response.error.code === '42883' || response.error.message?.includes('does not exist')) {
          if (activeOrg?.id) {
            const { error: updateError } = await supabase
              .from('organizations')
              .update({ name: orgName.trim(), updated_at: new Date().toISOString() })
              .eq('id', activeOrg.id);

            if (updateError) throw updateError;
          }
        } else {
          throw response.error;
        }
      } else if (response.data && response.data.length > 0 && !response.data[0].success) {
        throw new Error(response.data[0].error_message || 'Failed to update team');
      }

      await refreshOrgs();
      toast.success('Team updated!');
      onNext();
    } catch (err: any) {
      console.error('Error updating team:', err);
      // Handle duplicate name error (PostgreSQL unique constraint violation)
      if (err.code === '23505' || err.message?.includes('duplicate') || err.message?.includes('unique')) {
        setError('This team name is already taken. Please choose a different name.');
        toast.error('Team name already exists');
      } else {
        setError(err.message || 'Failed to update team name');
        toast.error('Failed to update team name');
      }
    } finally {
      setIsUpdating(false);
    }
  };

  const handleContinue = async () => {
    if (selectedOption === 'join' && selectedOrgId) {
      await handleJoinOrg();
    } else if (!activeOrg) {
      // Team should already be created by trigger, but if not, create it
      await handleCreateOrg();
    } else if (activeOrg.name !== orgName.trim()) {
      // User changed the team name, update it
      await handleUpdateOrgName();
    } else {
      // Team already exists with same name, just continue
      onNext();
    }
  };

  // Show loading while checking for existing org
  if (orgLoading || !hasCheckedOrg || isLoadingMatches) {
    return (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="w-full max-w-xl mx-auto flex items-center justify-center py-20"
      >
        <Loader2 className="w-8 h-8 text-[#37bd7e] animate-spin" />
      </motion.div>
    );
  }

  const hasMatchingOrgs = matchingOrgs.length > 0 && !activeOrg;
  const showChoiceUI = hasMatchingOrgs && selectedOption === null;
  const showJoinUI = hasMatchingOrgs && selectedOption === 'join';
  const showCreateUI = (selectedOption === 'create' || activeOrg) && !askingForOrgName;
  const isCreatingNew = !activeOrg && selectedOption === 'create';

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      className="w-full max-w-xl mx-auto"
    >
      <div className="text-center mb-8">
        <motion.div
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ delay: 0.2, type: 'spring' }}
          className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-gradient-to-br from-[#37bd7e] to-[#2da76c] mb-6"
        >
          <Building2 className="w-10 h-10 text-white" />
        </motion.div>
        <h1 className="text-3xl font-bold mb-4 text-white">
          {askingForOrgName
            ? 'What\'s your organization name?'
            : showChoiceUI
            ? 'Join Your Team'
            : showJoinUI
            ? 'Select Team'
            : isCreatingNew
            ? 'Pick your team name'
            : 'Pick your team name'}
        </h1>
        <p className="text-lg text-gray-400">
          {askingForOrgName
            ? 'Enter your company or organization name'
            : showChoiceUI
            ? `We found existing teams from ${userDomain}`
            : showJoinUI
            ? 'Choose the team you want to join'
            : isCreatingNew
            ? 'This is where your team will collaborate'
            : 'This will be visible to everyone you invite'}
        </p>
      </div>

      <AnimatePresence mode="wait">
        {/* Personal Email - Ask for Organization Name */}
        {askingForOrgName && (
          <motion.div
            key="ask-org-name"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="space-y-4 mb-8"
          >
            <div className="bg-gray-900/50 backdrop-blur-xl rounded-xl border border-gray-800/50 p-6">
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-400 mb-2">
                    Organization Name
                  </label>
                  <input
                    type="text"
                    value={orgName}
                    onChange={(e) => {
                      setOrgName(e.target.value);
                      setError(null);
                    }}
                    placeholder="e.g., Acme Corporation"
                    className="w-full bg-gray-700/50 border border-gray-600 rounded-lg px-4 py-3 text-white placeholder-gray-500 focus:ring-2 focus:ring-[#37bd7e] focus:border-transparent transition-colors hover:bg-gray-700/70"
                    disabled={isUpdating}
                    maxLength={100}
                    autoFocus
                  />
                  <p className="text-xs text-gray-500 mt-2">
                    This can be your company name, team name, or any organization name you'd like to use
                  </p>
                </div>

                {error && (
                  <motion.div
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="flex items-center gap-2 text-red-400 text-sm"
                  >
                    <AlertCircle className="w-4 h-4" />
                    {error}
                  </motion.div>
                )}
              </div>
            </div>

            <div className="flex gap-4 justify-center">
              <Button
                onClick={onBack}
                variant="ghost"
                className="text-gray-400 hover:text-white"
                disabled={isUpdating}
              >
                Back
              </Button>
              <Button
                onClick={async () => {
                  if (!orgName.trim()) {
                    setError('Organization name is required');
                    return;
                  }
                  if (orgName.trim().length > 100) {
                    setError('Organization name must be 100 characters or less');
                    return;
                  }

                  setIsUpdating(true);
                  setError(null);
                  try {
                    const newOrg = await createOrg(orgName.trim());
                    if (!newOrg) {
                      throw new Error('Failed to create organization');
                    }
                    toast.success('Organization created!');
                    setAskingForOrgName(false);
                    setSelectedOption('create');
                    onNext();
                  } catch (err: any) {
                    console.error('Error creating organization:', err);
                    if (err.code === '23505' || err.message?.includes('duplicate') || err.message?.includes('unique')) {
                      setError('This organization name is already taken. Please choose a different name.');
                      toast.error('Organization name already exists');
                    } else {
                      setError(err.message || 'Failed to create organization');
                      toast.error('Failed to create organization');
                    }
                  } finally {
                    setIsUpdating(false);
                  }
                }}
                disabled={isUpdating || !orgName.trim()}
                className="bg-[#37bd7e] hover:bg-[#2da76c] text-white px-8"
              >
                {isUpdating ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Creating...
                  </>
                ) : (
                  'Create Organization'
                )}
              </Button>
            </div>
          </motion.div>
        )}

        {/* Choice UI - Join or Create */}
        {showChoiceUI && (
          <motion.div
            key="choice"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="space-y-4 mb-8"
          >
            <button
              onClick={() => setSelectedOption('join')}
              className="w-full bg-gray-900/50 backdrop-blur-xl rounded-xl border border-gray-800/50 p-6 text-left hover:border-[#37bd7e]/50 transition-all group"
            >
              <div className="flex items-start gap-4">
                <div className="w-12 h-12 rounded-full bg-blue-500/20 flex items-center justify-center flex-shrink-0">
                  <Users className="w-6 h-6 text-blue-400" />
                </div>
                <div className="flex-1">
                  <h3 className="text-lg font-semibold text-white group-hover:text-[#37bd7e] transition-colors">
                    Join Existing Team
                  </h3>
                  <p className="text-sm text-gray-400 mt-1">
                    {matchingOrgs.length} team{matchingOrgs.length > 1 ? 's' : ''} found with @{userDomain} members
                  </p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {matchingOrgs.slice(0, 3).map((org) => (
                      <span
                        key={org.id}
                        className="px-2 py-1 bg-gray-800 rounded text-xs text-gray-300"
                      >
                        {org.name}
                      </span>
                    ))}
                    {matchingOrgs.length > 3 && (
                      <span className="px-2 py-1 bg-gray-800 rounded text-xs text-gray-400">
                        +{matchingOrgs.length - 3} more
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </button>

            <button
              onClick={() => setSelectedOption('create')}
              className="w-full bg-gray-900/50 backdrop-blur-xl rounded-xl border border-gray-800/50 p-6 text-left hover:border-[#37bd7e]/50 transition-all group"
            >
              <div className="flex items-start gap-4">
                <div className="w-12 h-12 rounded-full bg-[#37bd7e]/20 flex items-center justify-center flex-shrink-0">
                  <Plus className="w-6 h-6 text-[#37bd7e]" />
                </div>
                <div className="flex-1">
                  <h3 className="text-lg font-semibold text-white group-hover:text-[#37bd7e] transition-colors">
                    Create New Team
                  </h3>
                  <p className="text-sm text-gray-400 mt-1">
                    Start fresh with your own workspace and invite your team later
                  </p>
                </div>
              </div>
            </button>
          </motion.div>
        )}

        {/* Join UI - Select from matching orgs */}
        {showJoinUI && (
          <motion.div
            key="join"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="space-y-4 mb-8"
          >
            <div className="bg-gray-900/50 backdrop-blur-xl rounded-xl border border-gray-800/50 p-4">
              <div className="space-y-2">
                {matchingOrgs.map((org) => (
                  <button
                    key={org.id}
                    onClick={() => setSelectedOrgId(org.id)}
                    className={`w-full p-4 rounded-lg border transition-all text-left ${
                      selectedOrgId === org.id
                        ? 'border-[#37bd7e] bg-[#37bd7e]/10'
                        : 'border-gray-700 bg-gray-800/50 hover:border-gray-600'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <h4 className="font-medium text-white">{org.name}</h4>
                        <p className="text-sm text-gray-400">
                          {org.member_count} member{org.member_count !== 1 ? 's' : ''}
                        </p>
                      </div>
                      {selectedOrgId === org.id && (
                        <div className="w-6 h-6 rounded-full bg-[#37bd7e] flex items-center justify-center">
                          <Check className="w-4 h-4 text-white" />
                        </div>
                      )}
                    </div>
                  </button>
                ))}
              </div>
            </div>

            <button
              onClick={() => setSelectedOption('create')}
              className="text-sm text-gray-400 hover:text-white transition-colors"
            >
              Or create a new team instead
            </button>
          </motion.div>
        )}

        {/* Create/Edit UI */}
        {showCreateUI && (
          <motion.div
            key="create"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
          >
            <div className="bg-gray-900/50 backdrop-blur-xl rounded-xl border border-gray-800/50 p-6 mb-6">
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-400 mb-2">
                    Team name
                  </label>
                  <input
                    type="text"
                    value={orgName}
                    onChange={(e) => {
                      setOrgName(e.target.value);
                      setError(null);
                    }}
                    placeholder="e.g., Acme Sales Team"
                    className="w-full bg-gray-700/50 border border-gray-600 rounded-lg px-4 py-3 text-white placeholder-gray-500 focus:ring-2 focus:ring-[#37bd7e] focus:border-transparent transition-colors hover:bg-gray-700/70"
                    disabled={isUpdating}
                    maxLength={100}
                  />
                </div>

                {error && (
                  <motion.div
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="flex items-center gap-2 text-red-400 text-sm"
                  >
                    <AlertCircle className="w-4 h-4" />
                    {error}
                  </motion.div>
                )}
              </div>
            </div>

            {hasMatchingOrgs && (
              <button
                onClick={() => {
                  setSelectedOption('join');
                  setError(null);
                }}
                className="text-sm text-gray-400 hover:text-white transition-colors mb-6 block mx-auto"
              >
                Or join an existing team instead
              </button>
            )}

            <div className="bg-gray-900/30 backdrop-blur-sm rounded-xl border border-gray-800/30 p-6 mb-8">
              <h3 className="text-sm font-medium text-gray-300 mb-4">
                What you'll get with your team:
              </h3>
              <ul className="space-y-3">
                {[
                  'Shared pipeline and deals with your team',
                  'Team-wide meeting analytics and insights',
                  'Collaborative task management',
                  'Unified contact and company database',
                ].map((feature, index) => (
                  <motion.li
                    key={index}
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.3 + index * 0.1 }}
                    className="flex items-center gap-3 text-gray-400"
                  >
                    <div className="w-5 h-5 rounded-full bg-[#37bd7e]/20 flex items-center justify-center flex-shrink-0">
                      <Check className="w-3 h-3 text-[#37bd7e]" />
                    </div>
                    {feature}
                  </motion.li>
                ))}
              </ul>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Error display for join flow */}
      {showJoinUI && error && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex items-center gap-2 text-red-400 text-sm mb-6 justify-center"
        >
          <AlertCircle className="w-4 h-4" />
          {error}
        </motion.div>
      )}

      {/* Action buttons */}
      {!showChoiceUI && !askingForOrgName && (
        <div className="flex gap-4 justify-center">
          <Button
            onClick={() => {
              if (hasMatchingOrgs && (showJoinUI || showCreateUI)) {
                setSelectedOption(null);
                setError(null);
              } else {
                onBack();
              }
            }}
            variant="ghost"
            className="text-gray-400 hover:text-white"
            disabled={isUpdating}
          >
            Back
          </Button>
          <Button
            onClick={handleContinue}
            disabled={
              isUpdating ||
              (showJoinUI && !selectedOrgId) ||
              (showCreateUI && !orgName.trim() && !activeOrg)
            }
            className="bg-[#37bd7e] hover:bg-[#2da76c] text-white px-8"
          >
            {isUpdating ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                {showJoinUI ? 'Joining...' : isCreatingNew ? 'Creating...' : 'Saving...'}
              </>
            ) : showJoinUI ? (
              'Join Team'
            ) : isCreatingNew ? (
              'Create Team'
            ) : (
              'Continue'
            )}
          </Button>
        </div>
      )}
    </motion.div>
  );
}
