/**
 * Onboarding V2 Store
 *
 * Manages state for the skills-based onboarding flow including:
 * - Enrichment data from AI analysis (or manual Q&A input)
 * - Skill configurations (AI-generated and user-modified)
 * - Step navigation and progress
 * - Personal email handling (website input / Q&A fallback)
 */

import { create } from 'zustand';
import { supabase } from '@/lib/supabase/clientV2';
import { Target, Database, MessageSquare, GitBranch, UserCheck, LucideIcon } from 'lucide-react';
import { toast } from 'sonner';

// ============================================================================
// LocalStorage Persistence
// ============================================================================

const STORAGE_KEY_PREFIX = 'sixty_onboarding_';

/**
 * Save onboarding state to localStorage for session recovery
 */
export function persistOnboardingState(userId: string, state: Partial<OnboardingV2State>) {
  try {
    const key = `${STORAGE_KEY_PREFIX}${userId}`;
    // Only persist safe, non-sensitive data
    const persistData = {
      currentStep: state.currentStep,
      domain: state.domain,
      websiteUrl: state.websiteUrl,
      manualData: state.manualData,
      enrichment: state.enrichment,
      skillConfigs: state.skillConfigs,
      organizationId: state.organizationId,
      isEnrichmentLoading: state.isEnrichmentLoading,
      enrichmentError: state.enrichmentError,
      pollingStartTime: state.pollingStartTime,
      pollingAttempts: state.pollingAttempts,
      resumed: (state as any).resumed ?? false,
      savedAt: new Date().toISOString(),
    };
    localStorage.setItem(key, JSON.stringify(persistData));
  } catch (error) {
    console.warn('Failed to persist onboarding state:', error);
  }
}

/**
 * Restore onboarding state from localStorage
 */
export function restoreOnboardingState(userId: string): Partial<OnboardingV2State> | null {
  try {
    const key = `${STORAGE_KEY_PREFIX}${userId}`;
    const stored = localStorage.getItem(key);
    if (!stored) return null;

    const parsed = JSON.parse(stored);
    // Check if state is recent (within 24 hours)
    const savedAt = new Date(parsed.savedAt);
    const ageHours = (Date.now() - savedAt.getTime()) / (1000 * 60 * 60);
    if (ageHours > 24) {
      localStorage.removeItem(key);
      return null;
    }

    return parsed;
  } catch (error) {
    console.warn('Failed to restore onboarding state:', error);
    return null;
  }
}

/**
 * Clear persisted onboarding state
 */
export function clearOnboardingState(userId: string) {
  try {
    const key = `${STORAGE_KEY_PREFIX}${userId}`;
    localStorage.removeItem(key);
  } catch (error) {
    console.warn('Failed to clear onboarding state:', error);
  }
}

// ============================================================================
// Constants
// ============================================================================

// List of personal email domains that cannot be enriched via website scraping
export const PERSONAL_EMAIL_DOMAINS = [
  'gmail.com',
  'yahoo.com',
  'hotmail.com',
  'outlook.com',
  'icloud.com',
  'aol.com',
  'protonmail.com',
  'proton.me',
  'mail.com',
  'ymail.com',
  'live.com',
  'msn.com',
  'me.com',
  'mac.com',
];

// ============================================================================
// Types
// ============================================================================

export interface EnrichmentData {
  id: string;
  organization_id: string;
  domain: string;
  status: 'pending' | 'scraping' | 'researching' | 'analyzing' | 'completed' | 'failed';
  error_message?: string;
  company_name?: string;
  logo_url?: string;
  tagline?: string;
  description?: string;
  industry?: string;
  employee_count?: string;
  products?: Array<{ name: string; description?: string; pricing_tier?: string }>;
  value_propositions?: string[];
  competitors?: Array<{ name: string; domain?: string }>;
  target_market?: string;
  tech_stack?: string[];
  key_people?: Array<{ name: string; title: string }>;
  pain_points?: string[];
  confidence_score?: number;
  generated_skills?: SkillConfigs;
  // Track enrichment source
  enrichment_source?: 'website' | 'manual';
}

/**
 * Manual enrichment data collected via Q&A flow
 * Used when user doesn't have a website to scrape
 */
export interface ManualEnrichmentData {
  company_name: string;
  company_description: string;
  industry: string;
  target_customers: string;
  main_products: string;
  competitors: string;
  team_size?: string;
  unique_value?: string;
}

export interface SkillConfigs {
  lead_qualification: {
    criteria: string[];
    disqualifiers: string[];
  };
  lead_enrichment: {
    questions: string[];
  };
  brand_voice: {
    tone: string;
    avoid: string[];
  };
  objection_handling: {
    objections: Array<{ trigger: string; response: string }>;
  };
  icp: {
    companyProfile: string;
    buyerPersona: string;
    buyingSignals: string[];
  };
}

/**
 * Compiled skill from platform templates
 * Phase 7: Platform-controlled skills with org context
 */
export interface CompiledSkill {
  id: string;
  skill_key: string;
  category: 'sales-ai' | 'writing' | 'enrichment' | 'workflows' | 'data-access' | 'output-format';
  frontmatter: {
    name: string;
    description: string;
    triggers?: string[];
    requires_context?: string[];
    outputs?: string[];
    priority?: 'critical' | 'high' | 'medium' | 'low';
    [key: string]: unknown;
  };
  compiled_content: string;
  is_enabled: boolean;
  platform_skill_version: number;
}

export type SkillId = 'lead_qualification' | 'lead_enrichment' | 'brand_voice' | 'objection_handling' | 'icp';

export interface SkillMeta {
  id: SkillId;
  name: string;
  description: string;
  icon: LucideIcon;
}

export const SKILLS: SkillMeta[] = [
  { id: 'lead_qualification', name: 'Qualification', icon: Target, description: 'Define how leads are scored and qualified' },
  { id: 'lead_enrichment', name: 'Enrichment', icon: Database, description: 'Customize discovery questions' },
  { id: 'brand_voice', name: 'Brand Voice', icon: MessageSquare, description: 'Set your communication style' },
  { id: 'objection_handling', name: 'Objections', icon: GitBranch, description: 'Define response playbooks' },
  { id: 'icp', name: 'ICP', icon: UserCheck, description: 'Describe your perfect customers' },
];

/**
 * All possible steps in the V2 onboarding flow
 *
 * Flow paths:
 * 1. Corporate email: enrichment_loading → enrichment_result → skills_config → complete
 * 2. Personal email with website: website_input → enrichment_loading → enrichment_result → skills_config → complete
 * 3. Personal email, no website: website_input → manual_enrichment → enrichment_loading → enrichment_result → skills_config → complete
 * 4. Existing org (join request): website_input → pending_approval (awaiting admin approval)
 */
export type OnboardingV2Step =
  | 'website_input'           // Ask for website URL (personal email users)
  | 'manual_enrichment'       // Q&A fallback (no website available)
  | 'organization_selection'  // Fuzzy match found - choose to join or create new
  | 'pending_approval'        // Awaiting admin approval of join request
  | 'enrichment_loading'      // AI analyzing company
  | 'enrichment_result'       // Show what we learned
  | 'agent_config_confirm'    // Confirm AI-inferred agent configuration
  | 'skills_config'           // Configure 5 skills
  | 'complete';               // All done!

// Legacy type alias for backward compatibility
export type OnboardingStep = OnboardingV2Step;

interface OnboardingV2State {
  // Organization context
  organizationId: string | null;
  domain: string | null;
  userEmail: string | null;
  isPersonalEmail: boolean;

  // Step management
  currentStep: OnboardingV2Step;
  currentSkillIndex: number;

  // Resetting flag to prevent auth cascade during "Start over"
  isResettingOnboarding: boolean;

  // Website input (for personal email users)
  websiteUrl: string | null;
  hasNoWebsite: boolean;

  // Manual enrichment data (Q&A fallback)
  manualData: ManualEnrichmentData | null;

  // Similar organizations from fuzzy matching
  similarOrganizations: Array<{ id: string; name: string; company_domain: string; member_count: number; similarity_score: number }> | null;
  matchSearchTerm: string | null;

  // Enrichment data
  enrichment: EnrichmentData | null;
  isEnrichmentLoading: boolean;
  enrichmentError: string | null;
  enrichmentSource: 'website' | 'manual' | null;
  // Polling timeout protection
  pollingStartTime: number | null;
  pollingAttempts: number;
  pollingTimeoutId: ReturnType<typeof setTimeout> | null;
  // Retry tracking for enrichment failures
  enrichmentRetryCount: number;

  // Skill configurations (legacy)
  skillConfigs: SkillConfigs;
  configuredSkills: SkillId[];
  skippedSkills: SkillId[];

  // Platform compiled skills (Phase 7)
  compiledSkills: CompiledSkill[];
  isCompiledSkillsLoading: boolean;
  compiledSkillsError: string | null;

  // Saving state
  isSaving: boolean;
  saveError: string | null;

  // Organization creation state (for personal email users)
  organizationCreationInProgress: boolean;
  organizationCreationError: string | null;

  // Pending join request state
  pendingJoinRequest: {
    requestId: string;
    orgId: string;
    orgName: string;
    status: 'pending' | 'approved' | 'rejected';
  } | null;

  // Domain mismatch detection
  hasDomainMismatch: boolean;
  emailDomain: string | null;
  signupCompanyDomain: string | null;
  resolvedResearchDomain: string | null;

  // Context setters
  setOrganizationId: (id: string) => void;
  setDomain: (domain: string) => void;
  setUserEmail: (email: string) => Promise<void>;

  // Actions
  setStep: (step: OnboardingV2Step) => void;
  setCurrentSkillIndex: (index: number) => void;

  // Website input actions
  setWebsiteUrl: (url: string) => void;
  setHasNoWebsite: (value: boolean) => void;
  submitWebsite: (organizationId: string) => Promise<void>;

  // Manual enrichment actions
  setManualData: (data: ManualEnrichmentData) => void;
  submitManualEnrichment: (organizationId: string) => Promise<void>;

  // Organization creation actions (for personal email users without org)
  createOrganizationFromManualData: (userId: string, manualData: ManualEnrichmentData) => Promise<string>;

  // Enrichment actions
  startEnrichment: (organizationId: string, domain: string, force?: boolean) => Promise<{ success: boolean; error?: string }>;
  pollEnrichmentStatus: (organizationId: string) => Promise<void>;
  setEnrichment: (data: EnrichmentData) => void;

  // Skill actions
  updateSkillConfig: <K extends SkillId>(skillId: K, config: SkillConfigs[K]) => void;
  markSkillConfigured: (skillId: SkillId) => void;
  markSkillSkipped: (skillId: SkillId) => void;
  resetSkillConfig: (skillId: SkillId) => void;

  // Save actions
  saveAllSkills: (organizationId: string) => Promise<boolean>;

  // Platform skills actions (Phase 7)
  fetchCompiledSkills: (organizationId: string) => Promise<void>;
  toggleCompiledSkillEnabled: (skillKey: string, enabled: boolean) => void;
  saveCompiledSkillPreferences: (organizationId: string) => Promise<boolean>;

  // Organization selection actions
  submitJoinRequest: (orgId: string, orgName: string) => Promise<void>;
  createNewOrganization: (orgName: string) => Promise<void>;

  // Domain mismatch resolution
  resolveDomainMismatch: (chosenDomain: string) => void;

  // Reset
  reset: () => void;
  resetAndCleanup: (queryClient?: any) => Promise<void>;
}

// ============================================================================
// Default Skill Configs
// ============================================================================

const defaultSkillConfigs: SkillConfigs = {
  lead_qualification: {
    criteria: [],
    disqualifiers: [],
  },
  lead_enrichment: {
    questions: [],
  },
  brand_voice: {
    tone: '',
    avoid: [],
  },
  objection_handling: {
    objections: [],
  },
  icp: {
    companyProfile: '',
    buyerPersona: '',
    buyingSignals: [],
  },
};

// ============================================================================
// Store
// ============================================================================

/**
 * Check if an email domain is a personal email provider
 */
export function isPersonalEmailDomain(email: string): boolean {
  const domain = email.split('@')[1]?.toLowerCase();
  return PERSONAL_EMAIL_DOMAINS.includes(domain);
}

/**
 * Extract domain from URL or email
 */
export function extractDomain(input: string): string {
  // If it's an email, extract domain
  if (input.includes('@')) {
    return input.split('@')[1]?.toLowerCase() || '';
  }
  // If it's a URL, extract domain
  try {
    const url = input.startsWith('http') ? input : `https://${input}`;
    const urlObj = new URL(url);
    return urlObj.hostname.replace(/^www\./, '').toLowerCase();
  } catch {
    // Just clean up the input as a domain
    return input.replace(/^(https?:\/\/)?(www\.)?/, '').split('/')[0].toLowerCase();
  }
}

export const useOnboardingV2Store = create<OnboardingV2State>((set, get) => ({
  // Initial state - organization context
  organizationId: null,
  domain: null,
  userEmail: null,
  isPersonalEmail: false,

  // Step management
  // Default to website_input as a safe fallback - will be updated by setUserEmail()
  currentStep: 'website_input',
  currentSkillIndex: 0,

  // Resetting flag
  isResettingOnboarding: false,

  // Website input state
  websiteUrl: null,
  hasNoWebsite: false,

  // Manual enrichment state
  manualData: null,

  // Similar organizations state
  similarOrganizations: null,
  matchSearchTerm: null,

  // Enrichment state
  enrichment: null,
  isEnrichmentLoading: false,
  enrichmentError: null,
  enrichmentSource: null,
  // Polling timeout protection
  pollingStartTime: null as number | null,
  pollingAttempts: 0,
  pollingTimeoutId: null as ReturnType<typeof setTimeout> | null,
  // Retry tracking for enrichment failures
  enrichmentRetryCount: 0,

  // Skill state (legacy)
  skillConfigs: defaultSkillConfigs,
  configuredSkills: [],
  skippedSkills: [],

  // Platform compiled skills (Phase 7)
  compiledSkills: [],
  isCompiledSkillsLoading: false,
  compiledSkillsError: null,

  // Saving state
  isSaving: false,
  saveError: null,

  // Organization creation state
  organizationCreationInProgress: false,
  organizationCreationError: null,

  // Pending join request state
  pendingJoinRequest: null,

  // Domain mismatch detection
  hasDomainMismatch: false,
  emailDomain: null,
  signupCompanyDomain: null,
  resolvedResearchDomain: null,

  // Context setters
  setOrganizationId: (id) => set({ organizationId: id }),
  setDomain: (domain) => {
    set({ domain });
    // Persist state after domain change
    const { userEmail } = get();
    if (userEmail) {
      persistOnboardingState(userEmail, get());
    }
  },
  setUserEmail: async (email) => {
    const isPersonal = isPersonalEmailDomain(email);

    // For business emails, check if an organization exists for that domain before enrichment
    if (!isPersonal) {
      try {
        const domain = extractDomain(email);
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) throw new Error('No session');

        // Check if signup company_domain differs from email domain
        const signupCompanyDomain = session.user?.user_metadata?.company_domain
          ? extractDomain(session.user.user_metadata.company_domain)
          : null;

        if (
          signupCompanyDomain &&
          signupCompanyDomain !== domain &&
          !isPersonalEmailDomain(signupCompanyDomain)
        ) {
          set({
            hasDomainMismatch: true,
            emailDomain: domain,
            signupCompanyDomain,
          });
        }

        console.log('[onboardingV2] Business email detected, checking for existing org with domain:', domain);

        let hasExactMatch = false;
        let exactMatchOrg: any = null;
        let fuzzyMatches: any[] = [];

        // Strategy 1: Exact match by company_domain (OLH-005: use SECURITY DEFINER RPC to bypass RLS)
        // Fallback to direct query if RPC not yet deployed
        let exactMatch: any = null;
        const { data: exactMatchResults, error: rpcError } = await supabase.rpc('find_organization_by_domain', {
          p_domain: domain,
        });
        if (rpcError) {
          // RPC not deployed yet or other error — fallback to direct query
          console.warn('[onboardingV2] find_organization_by_domain RPC failed, using fallback:', rpcError.code);
          const { data: fallbackResults } = await supabase
            .from('organizations')
            .select('id, name, company_domain')
            .eq('company_domain', domain)
            .limit(1);
          exactMatch = fallbackResults?.[0] || null;
        } else {
          exactMatch = exactMatchResults?.[0] || null;
        }
        if (exactMatch) {
          hasExactMatch = true;
          exactMatchOrg = exactMatch;
          console.log('[onboardingV2] Found EXACT domain match for org:', exactMatch.name);
        } else {
          // Strategy 2: Fuzzy domain matching RPC
          // IMPORTANT: Fuzzy matches require join requests, not auto-join
          const { data: fuzzyResults } = await supabase.rpc('find_similar_organizations_by_domain', {
            p_search_domain: domain,
            p_limit: 5,
          });

          // Get all fuzzy matches with score > 0.8 (80% threshold per user requirement)
          if (fuzzyResults && fuzzyResults.length > 0) {
            fuzzyMatches = fuzzyResults.filter((m: any) => m.similarity_score > 0.8);
            console.log('[onboardingV2] Found fuzzy matches (require join request):', fuzzyMatches.length);
          }
        }

        // Handle matches
        if (hasExactMatch && exactMatchOrg) {
          // EXACT domain match: create join request (requires admin approval)
          console.log('[onboardingV2] EXACT match - creating join request for:', exactMatchOrg.name);
          try {
            // Get user profile data for join request
            const { data: profileData } = await supabase
              .from('profiles')
              .select('first_name, last_name')
              .eq('id', session.user.id)
              .maybeSingle();

            // Create join request instead of auto-joining
            const joinRequestResult = await supabase.rpc('create_join_request', {
              p_org_id: exactMatchOrg.id,
              p_user_id: session.user.id,
              p_user_profile: profileData
                ? {
                    first_name: profileData.first_name,
                    last_name: profileData.last_name,
                  }
                : null,
            });

            if (joinRequestResult.error) throw joinRequestResult.error;

            // Update user profile status to pending_approval
            await supabase
              .from('profiles')
              .update({ profile_status: 'pending_approval' })
              .eq('id', session.user.id);

            // Move to pending approval step
            set({
              userEmail: email,
              isPersonalEmail: isPersonal,
              organizationId: exactMatchOrg.id,
              currentStep: 'pending_approval',
              domain,
              pendingJoinRequest: {
                requestId: joinRequestResult.data[0].join_request_id,
                orgId: exactMatchOrg.id,
                orgName: exactMatchOrg.name,
                status: 'pending',
              },
            });

            console.log('[onboardingV2] Join request created for exact match:', exactMatchOrg.id);
          } catch (error) {
            console.error('[onboardingV2] Error creating join request for exact match:', error);
            // Fall back to enrichment if join request fails
            set({
              userEmail: email,
              isPersonalEmail: isPersonal,
              currentStep: 'enrichment_loading',
              domain,
            });
          }
        } else if (fuzzyMatches.length > 0) {
          // FUZZY matches: require join request (never auto-join)
          console.log('[onboardingV2] Fuzzy matches found - showing selection for user to request join:', fuzzyMatches.length);
          set({
            userEmail: email,
            isPersonalEmail: isPersonal,
            currentStep: 'organization_selection',
            similarOrganizations: fuzzyMatches,
            matchSearchTerm: domain,
            domain,
          });
        } else {
          // No match: create org for this domain then proceed to enrichment
          console.log('[onboardingV2] No existing org found for domain, creating org and proceeding to enrichment');
          const domainLabel = domain.replace(/\.(com|io|ai|co|net|org|app|dev|xyz)$/i, '');
          const orgName = domainLabel.charAt(0).toUpperCase() + domainLabel.slice(1);

          const { data: newOrg, error: orgError } = await supabase
            .from('organizations')
            .insert({
              name: orgName,
              company_domain: domain,
              created_by: session.user.id,
              is_active: true,
            })
            .select('id')
            .single();

          if (orgError) {
            // Might be duplicate — try to fetch existing
            const { data: existing } = await supabase
              .from('organizations')
              .select('id')
              .eq('company_domain', domain)
              .eq('created_by', session.user.id)
              .maybeSingle();

            if (existing) {
              console.log('[onboardingV2] Reusing existing org for domain:', domain);
              // Ensure membership exists
              await supabase.from('organization_memberships').upsert(
                { org_id: existing.id, user_id: session.user.id, role: 'owner', member_status: 'active' },
                { onConflict: 'org_id,user_id' }
              );
              set({
                userEmail: email,
                isPersonalEmail: isPersonal,
                organizationId: existing.id,
                currentStep: 'enrichment_loading',
                domain,
              });
            } else {
              throw orgError;
            }
          } else {
            // Create membership for new org
            await supabase.from('organization_memberships').upsert(
              { org_id: newOrg.id, user_id: session.user.id, role: 'owner', member_status: 'active' },
              { onConflict: 'org_id,user_id' }
            );
            set({
              userEmail: email,
              isPersonalEmail: isPersonal,
              organizationId: newOrg.id,
              currentStep: 'enrichment_loading',
              domain,
            });
          }
        }
      } catch (error) {
        console.error('[onboardingV2] Error checking for existing org:', error);
        // Fall back to website input on error (can't enrich without org)
        set({
          userEmail: email,
          isPersonalEmail: isPersonal,
          currentStep: 'website_input',
        });
      }
    } else {
      // Personal email: proceed to website input
      set({
        userEmail: email,
        isPersonalEmail: isPersonal,
        currentStep: 'website_input',
      });
    }

    // Persist state after email is set
    if (email) {
      persistOnboardingState(email, get());
    }
  },

  // Step management
  setStep: (step) => {
    set({ currentStep: step });
    // Persist state after step change
    const { userEmail } = get();
    if (userEmail) {
      persistOnboardingState(userEmail, get());
    }
  },
  setCurrentSkillIndex: (index) => set({ currentSkillIndex: index }),

  // Website input actions
  setWebsiteUrl: (url) => {
    set({ websiteUrl: url });
    // Persist state after website URL change
    const { userEmail } = get();
    if (userEmail) {
      persistOnboardingState(userEmail, get());
    }
  },
  setHasNoWebsite: (value) => set({ hasNoWebsite: value }),

  submitWebsite: async (organizationId) => {
    let finalOrgId = organizationId;
    const { websiteUrl, userEmail } = get();
    if (!websiteUrl) return;

    const domain = extractDomain(websiteUrl);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('No session');

      // CRITICAL: Block pending approval users from creating organizations
      // They must wait for approval before proceeding with onboarding
      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('profile_status')
        .eq('id', session.user.id)
        .maybeSingle();

      if (profileError) {
        console.error('[onboardingV2] Error checking profile status:', profileError);
        // Continue anyway - non-critical check
      } else if (profile?.profile_status === 'pending_approval') {
        console.log('[onboardingV2] User is pending approval, cannot create organization');
        toast.error('Account pending approval. Please wait for organization owner to approve your request.');
        throw new Error('Account pending approval. Please wait for organization owner to approve your request.');
      }

      // ALWAYS check for existing organizations by domain first
      // Even if we have an auto-created org ID, we should check if a real org exists
      console.log('[onboardingV2] Checking for existing organization with domain:', domain);

      let existingOrg = null;

      // Strategy 1: Exact match by company_domain (OLH-005: use SECURITY DEFINER RPC to bypass RLS)
      // Fallback to direct query if RPC not yet deployed
      const { data: exactMatchResults, error: rpcError } = await supabase.rpc('find_organization_by_domain', {
        p_domain: domain,
      });
      if (rpcError) {
        // RPC not deployed yet or other error — fallback to direct query
        console.warn('[onboardingV2] find_organization_by_domain RPC failed, using fallback:', rpcError.code);
        const { data: fallbackResults } = await supabase
          .from('organizations')
          .select('id, name, company_domain')
          .eq('company_domain', domain)
          .limit(1);
        existingOrg = fallbackResults?.[0] || null;
      } else {
        existingOrg = exactMatchResults?.[0] || null;
      }

      // Strategy 2: If no exact match, try fuzzy domain matching RPC
      let multipleMatches = false;
      if (!existingOrg) {
        const { data: fuzzyMatches } = await supabase.rpc('find_similar_organizations_by_domain', {
          p_search_domain: domain,
          p_limit: 5,
        });

        if (fuzzyMatches && fuzzyMatches.length > 0) {
          // Filter matches with score > 0.8 (80% threshold per user requirement)
          const highScoreMatches = fuzzyMatches.filter((m: any) => m.similarity_score > 0.8);

          if (highScoreMatches.length > 1) {
            // Multiple matches: show selection step
            console.log('[onboardingV2] Found multiple fuzzy matches with high scores, showing selection:', highScoreMatches.length);
            multipleMatches = true;
            set({
              currentStep: 'organization_selection',
              similarOrganizations: highScoreMatches,
              matchSearchTerm: domain,
            });
            return;
          } else if (highScoreMatches.length === 1) {
            // Single match: use it
            console.log('[onboardingV2] Found fuzzy match with score:', highScoreMatches[0].similarity_score);
            existingOrg = highScoreMatches[0];
          }
        }
      }

      if (existingOrg) {
        console.log('[onboardingV2] Found existing organization:', existingOrg.name);

        // Check if organization has active members before allowing join request
        const memberCount = existingOrg.member_count || 0;
        if (memberCount === 0) {
          console.log('[onboardingV2] Organization has no active members, treating as new org');
          // Continue to create new org instead of join request
          existingOrg = null;
        }
      }

      if (existingOrg) {
        // Organization exists with active members - create join request instead
        const { data: profileData } = await supabase
          .from('profiles')
          .select('first_name, last_name')
          .eq('id', session.user.id)
          .maybeSingle();

        const joinRequestResult = await supabase.rpc('create_join_request', {
          p_org_id: existingOrg.id,
          p_user_id: session.user.id,
          p_user_profile: profileData
            ? {
                first_name: profileData.first_name,
                last_name: profileData.last_name,
              }
            : null,
        });

        if (joinRequestResult.error) throw joinRequestResult.error;

        console.log('[onboardingV2] Join request created successfully');

        // Update user profile status to pending_approval
        await supabase
          .from('profiles')
          .update({ profile_status: 'pending_approval' })
          .eq('id', session.user.id);

        // Delete the auto-created organization if one was passed in
        if (organizationId && organizationId !== existingOrg.id) {
          console.log('[onboardingV2] Cleaning up auto-created org:', organizationId);
          try {
            // Remove membership first
            await supabase
              .from('organization_memberships')
              .delete()
              .eq('org_id', organizationId)
              .eq('user_id', session.user.id);

            // Delete the org (trigger will handle if it has other members)
            await supabase
              .from('organizations')
              .delete()
              .eq('id', organizationId)
              .eq('created_by', session.user.id);
          } catch (cleanupErr) {
            console.error('[onboardingV2] Failed to cleanup auto-org:', cleanupErr);
          }
        }

        // Store pending join request state
        set({
          organizationId: existingOrg.id,
          domain,
          enrichmentSource: 'website',
          currentStep: 'pending_approval',
          // Store join request status
          pendingJoinRequest: {
            requestId: joinRequestResult.data[0].join_request_id,
            orgId: existingOrg.id,
            orgName: existingOrg.name,
            status: 'pending',
          },
        });

        return;
      }

      console.log('[onboardingV2] No existing organization found, checking if we need to create one');

      // Validate that the provided org ID still exists (it may have been deleted)
      if (finalOrgId) {
        const { data: orgCheck } = await supabase
          .from('organizations')
          .select('id')
          .eq('id', finalOrgId)
          .maybeSingle();

        if (!orgCheck) {
          console.log('[onboardingV2] Provided org ID no longer exists (deleted?), will create new:', finalOrgId);
          finalOrgId = '';
          set({ organizationId: null });
        }
      }

      // No existing org found - check if we need to create one or use the provided one
      if (!finalOrgId || finalOrgId === '') {
        // Create org with domain as name (updated to real name after enrichment completes)
        const domainLabel = domain.replace(/\.(com|io|ai|co|net|org|app|dev|xyz)$/i, '');
        const organizationName = domainLabel.charAt(0).toUpperCase() + domainLabel.slice(1);

        let newOrg = null;
        let createError = null;

        try {
          const result = await supabase
            .from('organizations')
            .insert({
              name: organizationName,
              company_domain: domain,
              created_by: session.user.id,
              is_active: true,
            })
            .select('id')
            .single();

          newOrg = result.data;
          createError = result.error;
        } catch (err: any) {
          createError = err;
        }

        // Handle UNIQUE constraint violation (race condition from rapid clicking)
        if (createError) {
          // Check if it's a duplicate domain error (23505 is PostgreSQL unique violation code)
          const isDuplicateDomain = createError.code === '23505' &&
                                     createError.message?.includes('unique_company_domain');

          if (isDuplicateDomain) {
            console.log('[onboardingV2] Duplicate domain detected (race condition), fetching existing org');

            // Re-query for the org that was just created by the racing request
            const { data: existingByDomain, error: fetchError } = await supabase
              .from('organizations')
              .select('id, created_by')
              .eq('company_domain', domain)
              .eq('is_active', true)
              .maybeSingle();

            if (fetchError || !existingByDomain) {
              throw new Error('Organization exists but could not be retrieved');
            }

            // Check if current user owns this org
            if (existingByDomain.created_by === session.user.id) {
              // User owns it - reuse it
              console.log('[onboardingV2] Reusing user\'s existing org from race condition');
              newOrg = { id: existingByDomain.id };
              createError = null;
            } else {
              // Someone else owns it - should not happen in onboarding, but handle gracefully
              console.error('[onboardingV2] Duplicate domain owned by different user');
              throw new Error('Organization with this domain already exists');
            }
          } else {
            // Other error - throw it
            throw createError;
          }
        }

        if (!newOrg?.id) {
          throw new Error('Failed to create organization');
        }

        console.log('[onboardingV2] Organization ready with domain name:', organizationName, newOrg.id);

        // Add user as owner (upsert handles race condition if membership already exists)
        const { error: memberError } = await supabase
          .from('organization_memberships')
          .upsert({
            org_id: newOrg.id,
            user_id: session.user.id,
            role: 'owner',
            member_status: 'active',
          }, { onConflict: 'org_id,user_id' });

        if (memberError) throw memberError;

        finalOrgId = newOrg.id;
        set({ organizationId: finalOrgId });
      } else {
        // Use the provided org ID and update its domain
        console.log('[onboardingV2] Using provided org ID and updating domain:', finalOrgId);

        await supabase
          .from('organizations')
          .update({ company_domain: domain })
          .eq('id', finalOrgId);
      }

      set({
        domain,
        enrichmentSource: 'website',
        currentStep: 'enrichment_loading',
      });

      // Start enrichment with org ID
      // CRITICAL: Await enrichment to catch startup failures
      const enrichmentResult = await get().startEnrichment(finalOrgId, domain);

      if (!enrichmentResult.success) {
        // Enrichment failed to start - delete the org we just created
        console.error('[onboardingV2] Enrichment failed to start, cleaning up organization:', finalOrgId);
        toast.error('Failed to start organization enrichment. Please try again.');

        try {
          // Delete membership first (FK dependency)
          await supabase
            .from('organization_memberships')
            .delete()
            .eq('org_id', finalOrgId)
            .eq('user_id', session.user.id);

          // Delete the organization
          await supabase
            .from('organizations')
            .delete()
            .eq('id', finalOrgId);

          console.log('[onboardingV2] Successfully cleaned up failed organization');
        } catch (cleanupError) {
          console.error('[onboardingV2] Failed to cleanup org after enrichment failure:', cleanupError);
          toast.error('Error cleaning up. Please contact support if issue persists.');
        }

        // Reset state and show error
        set({
          organizationId: null,
          enrichmentError: enrichmentResult.error || 'Failed to start organization enrichment',
          currentStep: 'website_input',
        });
        return;
      }

    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to process website';
      set({ enrichmentError: message, currentStep: 'website_input' });
    }
  },

  // Manual enrichment actions
  setManualData: (data) => {
    set({ manualData: data });
    // Persist state after manual data change
    const { userEmail } = get();
    if (userEmail) {
      persistOnboardingState(userEmail, get());
    }
  },

  // Create organization from manual data (for personal email users without org)
  createOrganizationFromManualData: async (userId, manualData) => {
    set({
      organizationCreationInProgress: true,
      organizationCreationError: null,
    });

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('No session');

      const organizationName = manualData.company_name || 'My Organization';

      // First, search for similar organizations using fuzzy matching
      const { data: similarOrgs } = await supabase.rpc('find_similar_organizations', {
        p_search_name: organizationName,
        p_limit: 5,
      });

      // Check if we found a high-confidence match (similarity > 0.8, per user requirement)
      const highConfidenceMatch = similarOrgs && similarOrgs.length > 0 && similarOrgs[0].similarity_score > 0.8;

      // If we found similar orgs, show selection step (OLH-005: fixed logic inversion —
      // high-confidence matches should ALSO show selection so user can choose to join)
      if (similarOrgs && similarOrgs.length > 0) {
        set({
          organizationCreationInProgress: false,
          currentStep: 'organization_selection',
          similarOrganizations: similarOrgs,
          matchSearchTerm: organizationName,
        });
        return null; // Return null when routing to selection step - organizationId will be set from selection
      }

      // Check if organization with this name already exists (fallback to exact match)
      const { data: existingOrg } = await supabase
        .from('organizations')
        .select('id, name')
        .ilike('name', organizationName)
        .eq('is_active', true)
        .maybeSingle();

      if (existingOrg) {
        // Organization exists - return it instead of creating a new one
        // Store pending join request state to trigger confirmation dialog
        const { data: profileData } = await supabase
          .from('profiles')
          .select('first_name, last_name')
          .eq('id', session.user.id)
          .maybeSingle();

        const joinRequestResult = await supabase.rpc('create_join_request', {
          p_org_id: existingOrg.id,
          p_user_id: session.user.id,
          p_user_profile: profileData
            ? {
                first_name: profileData.first_name,
                last_name: profileData.last_name,
              }
            : null,
        });

        if (joinRequestResult.error) throw joinRequestResult.error;

        // Update user profile status to pending_approval
        await supabase
          .from('profiles')
          .update({ profile_status: 'pending_approval' })
          .eq('id', session.user.id);

        // Store pending join request state
        set({
          organizationCreationInProgress: false,
          organizationId: existingOrg.id,
          currentStep: 'pending_approval',
          pendingJoinRequest: {
            requestId: joinRequestResult.data[0].join_request_id,
            orgId: existingOrg.id,
            orgName: existingOrg.name,
            status: 'pending',
          },
        });

        return existingOrg.id;
      }

      // Determine if we need admin approval (high confidence match exists)
      const requiresApproval = highConfidenceMatch;
      const similarOrgId = requiresApproval ? similarOrgs![0].id : null;

      // Create organization with manual data company_name
      const { data: newOrg, error: createError } = await supabase
        .from('organizations')
        .insert({
          name: organizationName,
          created_by: userId,
          is_active: true,
          // Set approval fields if similar org found
          requires_admin_approval: requiresApproval,
          approval_status: requiresApproval ? 'pending' : null,
          similar_to_org_id: similarOrgId,
        })
        .select('id')
        .single();

      if (createError || !newOrg?.id) {
        throw createError || new Error('Failed to create organization');
      }

      // Add user as owner of the new organization
      const { error: memberError } = await supabase
        .from('organization_memberships')
        .upsert({
          org_id: newOrg.id,
          user_id: userId,
          role: 'owner',
          member_status: 'active',
        }, {
          onConflict: 'org_id,user_id'
        });

      if (memberError) throw memberError;

      // If org requires admin approval, send notification email
      if (requiresApproval && similarOrgId) {
        try {
          // Get user profile for email
          const { data: userProfile } = await supabase
            .from('profiles')
            .select('first_name, last_name, email')
            .eq('id', userId)
            .maybeSingle();

          // Get similar org name
          const { data: similarOrg } = await supabase
            .from('organizations')
            .select('name')
            .eq('id', similarOrgId)
            .maybeSingle();

          if (userProfile && similarOrg) {
            const userName = `${userProfile.first_name || ''} ${userProfile.last_name || ''}`.trim() || 'User';

            // Send notification email to admins via edge function
            await supabase.functions.invoke('encharge-send-email', {
              body: {
                template_type: 'org_approval',
                to_email: 'app@use60.com',
                to_name: 'Admin',
                variables: {
                  recipient_name: 'Admin',
                  organization_name: organizationName,
                  action_url: window.location.origin,
                  similar_org_name: similarOrg.name,
                  user_name: userName,
                  user_email: userProfile.email || session.user.email,
                },
              },
            });

            console.log('[onboardingV2] Sent org approval notification email');
          }
        } catch (emailError) {
          // Non-blocking - log but don't fail org creation
          console.error('[onboardingV2] Failed to send org approval email:', emailError);
        }
      }

      // After creating new org, cleanup old auto-created orgs
      try {
        // Get all user's memberships
        const { data: allMemberships } = await supabase
          .from('organization_memberships')
          .select('org_id, role, organizations(created_by)')
          .eq('user_id', userId);

        // Find auto-created orgs (where user is owner and org was auto-created by them)
        const oldAutoOrgs = allMemberships?.filter(m =>
          m.org_id !== newOrg.id &&  // Not the new org
          m.role === 'owner' &&  // User created it
          m.organizations.created_by === userId
        ) || [];

        // Remove user from old auto-created orgs
        for (const oldOrg of oldAutoOrgs) {
          await supabase
            .from('organization_memberships')
            .delete()
            .eq('org_id', oldOrg.org_id)
            .eq('user_id', userId);

          console.log('[onboardingV2] Removed from old auto-org:', oldOrg.org_id);
        }
        // Trigger will automatically delete empty orgs
      } catch (cleanupErr) {
        console.error('[onboardingV2] Failed to cleanup old org:', cleanupErr);
      }

      // If requires approval, set pending approval state
      if (requiresApproval) {
        // Update user profile status to pending_approval
        await supabase
          .from('profiles')
          .update({ profile_status: 'pending_approval' })
          .eq('id', userId);

        set({
          organizationCreationInProgress: false,
          organizationId: newOrg.id,
          currentStep: 'pending_approval',
          pendingJoinRequest: {
            requestId: newOrg.id, // Use org id as placeholder
            orgId: newOrg.id,
            orgName: organizationName,
            status: 'pending',
          },
        });
      } else {
        set({
          organizationCreationInProgress: false,
          organizationId: newOrg.id,
        });
      }

      return newOrg.id;

    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to create organization';
      set({
        organizationCreationInProgress: false,
        organizationCreationError: message,
      });
      throw error;
    }
  },

  submitManualEnrichment: async (organizationId) => {
    let finalOrgId = organizationId;
    const { manualData } = get();
    if (!manualData) return;

    // Set loading state but DON'T transition step yet
    set({
      isEnrichmentLoading: true,
      enrichmentError: null,
      enrichmentSource: 'manual',
    });

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('No session');

      // Validate that the provided org ID still exists (it may have been deleted)
      if (finalOrgId) {
        const { data: orgCheck } = await supabase
          .from('organizations')
          .select('id')
          .eq('id', finalOrgId)
          .maybeSingle();

        if (!orgCheck) {
          console.log('[submitManualEnrichment] Provided org ID no longer exists (deleted?), will create new:', finalOrgId);
          finalOrgId = '';
          set({ organizationId: null });
        }
      }

      // Ensure organizationId exists FIRST
      if (!finalOrgId || finalOrgId === '') {
        finalOrgId = await get().createOrganizationFromManualData(session.user.id, manualData);
        // Only proceed if we got a real ID back (not null from selection step)
        if (!finalOrgId) {
          // Organization selection step shown, ensure clean state
          set({
            isEnrichmentLoading: false,
            enrichmentError: null, // Clear any previous errors
            // currentStep already set by createOrganizationFromManualData
          });
          console.log('[submitManualEnrichment] Organization selection required, waiting for user choice');
          return;
        }
      } else if (manualData.company_name) {
        // Organization already exists (from failed enrichment retry) - update name with manual data
        try {
          await supabase
            .from('organizations')
            .update({ name: manualData.company_name })
            .eq('id', finalOrgId);
          console.log('[submitManualEnrichment] Updated org name to:', manualData.company_name);
        } catch (updateError) {
          console.error('[submitManualEnrichment] Failed to update org name:', updateError);
          // Continue anyway - not critical
        }
      }

      // NOW set organizationId and step atomically (after orgId is confirmed)
      set({
        organizationId: finalOrgId,
        currentStep: 'enrichment_loading',
      });

      // Call edge function with manual data
      const { data, error } = await supabase.functions.invoke('deep-enrich-organization', {
        body: {
          action: 'manual',
          organization_id: finalOrgId,
          manual_data: manualData,
        },
      });

      if (error) throw error;
      if (!data?.success) throw new Error(data?.error || 'Failed to process data');

      // Validate organizationId before polling
      if (!finalOrgId || finalOrgId === '') {
        throw new Error('Cannot start polling without valid organizationId');
      }

      // Start polling for status (manual enrichment still runs AI skill generation)
      get().pollEnrichmentStatus(finalOrgId);

    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to process your information';
      set({ isEnrichmentLoading: false, enrichmentError: message });
    }
  },

  // Start enrichment (website-based)
  startEnrichment: async (organizationId: string, domain: string, force = false) => {
    const currentRetryCount = get().enrichmentRetryCount;
    // If retrying (force=true), reset polling state and increment retry count
    const resetState = force
      ? { pollingStartTime: null, pollingAttempts: 0, enrichmentRetryCount: currentRetryCount + 1 }
      : { enrichmentRetryCount: 0 }; // Reset retry count for fresh start
    set({ isEnrichmentLoading: true, enrichmentError: null, enrichmentSource: 'website', ...resetState });

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('No session');
      if (!session.access_token) throw new Error('No access token in session');

      // Let Supabase SDK handle JWT automatically
      console.log('[startEnrichment] Invoking deep-enrich-organization edge function');

      const researchDomain = get().resolvedResearchDomain || domain;

      const { data, error } = await supabase.functions.invoke('deep-enrich-organization', {
        body: {
          action: 'start',
          organization_id: organizationId,
          domain: researchDomain,
          force: force,
        },
      });

      if (error) {
        console.error('[startEnrichment] Error:', error);
        throw error;
      }

      if (!data?.success) throw new Error(data?.error || 'Failed to start enrichment');

      // Start polling for status
      get().pollEnrichmentStatus(organizationId);

      // Return success for validation in submitWebsite
      return { success: true };

    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to start enrichment';
      set({ isEnrichmentLoading: false, enrichmentError: message });
      // Return failure for validation in submitWebsite
      return { success: false, error: message };
    }
  },

  // Poll enrichment status with timeout protection
  pollEnrichmentStatus: async (organizationId: string) => {
    const MAX_POLLING_DURATION = 5 * 60 * 1000; // 5 minutes
    const MAX_ATTEMPTS = 150; // 150 * 2s = 5 minutes
    const POLL_INTERVAL = 2000; // 2 seconds

    const state = get();

    // Guard: Stop polling if onboarding is being reset (prevents auth cascade)
    if (state.isResettingOnboarding) {
      console.log('[pollEnrichmentStatus] Stopping - onboarding is resetting');
      set({ isEnrichmentLoading: false, pollingStartTime: null, pollingAttempts: 0, pollingTimeoutId: null });
      return;
    }

    // Guard: Stop polling if step changed away from enrichment flow
    if (state.currentStep !== 'enrichment_loading') {
      console.log('[pollEnrichmentStatus] Stopping - step changed');
      set({
        isEnrichmentLoading: false,
        pollingStartTime: null,
        pollingAttempts: 0,
      });
      return;
    }

    // Initialize polling metadata on first call
    if (!state.pollingStartTime) {
      set({ pollingStartTime: Date.now(), pollingAttempts: 0 });
    }

    const currentState = get();
    const elapsedTime = Date.now() - (currentState.pollingStartTime || Date.now());
    const attempts = currentState.pollingAttempts || 0;

    // Check timeout conditions - stop if exceeded limits
    if (elapsedTime > MAX_POLLING_DURATION || attempts > MAX_ATTEMPTS) {
      const elapsedSeconds = Math.round(elapsedTime / 1000);
      console.error('[pollEnrichmentStatus] Timeout reached after', elapsedSeconds, 'seconds and', attempts, 'attempts');
      set({
        isEnrichmentLoading: false,
        enrichmentError: `Enrichment timed out after ${elapsedSeconds}s. Please try again or contact support.`,
        pollingStartTime: null,
        pollingAttempts: 0,
      });
      return;
    }

    // Increment attempt counter
    set({ pollingAttempts: attempts + 1 });

    const poll = async () => {
      try {
        // Refresh session only if token is near expiry (within 60s)
        // Avoids triggering spurious SIGNED_OUT events on every poll cycle
        const { data: { session: currentSession } } = await supabase.auth.getSession();
        const expiresAt = currentSession?.expires_at ?? 0;
        const secondsUntilExpiry = expiresAt - Math.floor(Date.now() / 1000);

        if (secondsUntilExpiry < 60) {
          console.log('[pollEnrichmentStatus] Token near expiry, refreshing...');
          const { error: sessionError } = await supabase.auth.refreshSession();
          if (sessionError) {
            // Non-fatal: log and continue — current token may still work for this request
            console.warn('[pollEnrichmentStatus] Session refresh failed (non-blocking):', sessionError);
          }
        }

        // Poll status via Supabase SDK
        const { data, error } = await supabase.functions.invoke('deep-enrich-organization', {
          body: {
            action: 'status',
            organization_id: organizationId,
          },
        });

        if (error) throw error;

        // CRITICAL FIX (BUG-002): Check application-level error before destructuring
        // Edge function may return { success: false, error: "..." } with HTTP 200
        if (!data || data.success === false) {
          const errorMsg = data?.error || 'Failed to get enrichment status';
          console.error('[pollEnrichmentStatus] Edge function error:', errorMsg);
          throw new Error(errorMsg);
        }

        const { status, enrichment, skills } = data;

        if (status === 'completed' && enrichment) {
          // Update org name with enriched company name
          if (enrichment.company_name && organizationId) {
            try {
              await supabase
                .from('organizations')
                .update({ name: enrichment.company_name })
                .eq('id', organizationId);
              console.log('[pollEnrichmentStatus] Updated org name to:', enrichment.company_name);
            } catch (updateError) {
              console.error('[pollEnrichmentStatus] Failed to update org name:', updateError);
              // Continue anyway - not critical
            }
          }

          // Load skills into state
          const generatedSkills = enrichment.generated_skills || defaultSkillConfigs;

          set({
            enrichment,
            skillConfigs: generatedSkills,
            isEnrichmentLoading: false,
            currentStep: 'enrichment_result',
            pollingStartTime: null, // Reset polling state
            pollingAttempts: 0,
          });
          return;
        }

        if (status === 'failed') {
          set({
            isEnrichmentLoading: false,
            enrichmentError: enrichment?.error_message || 'Enrichment failed',
            pollingStartTime: null,
            pollingAttempts: 0,
          });
          return;
        }

        // Update enrichment data for progressive display
        if (enrichment) {
          set({ enrichment });
        }

        // Continue polling (recursive call after delay) — store ID for cancellation
        const timeoutId = setTimeout(() => get().pollEnrichmentStatus(organizationId), POLL_INTERVAL);
        set({ pollingTimeoutId: timeoutId });

      } catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to get enrichment status';
        const errorDetails = error instanceof Error ? {
          message: error.message,
          name: error.name,
          stack: error.stack?.split('\n')[0]
        } : { message: String(error) };

        console.error('[pollEnrichmentStatus] Error:', errorDetails);

        // IMPROVEMENT (BUG-006): Provide user-friendly error messages based on error type
        let userMessage = message;
        if (message.includes('session') || message.includes('authentication') || message.includes('JWT') || message.includes('token')) {
          userMessage = 'Your session has expired. Please refresh the page and try again.';
        } else if (message.includes('network') || message.includes('fetch')) {
          userMessage = 'Network error. Please check your connection and try again.';
        } else if (message.includes('credit') || message.includes('balance') || message.includes('quota')) {
          userMessage = 'Enrichment credits exhausted. Please check your billing settings.';
        } else if (message.includes('rate limit') || message.includes('429') || message.includes('too many')) {
          userMessage = 'Too many requests. Please wait a moment and try again.';
        } else if (message.includes('invalid') && message.includes('domain')) {
          userMessage = 'The company domain appears to be invalid. Please check and try again.';
        }

        set({
          isEnrichmentLoading: false,
          enrichmentError: userMessage,
          pollingStartTime: null,
          pollingAttempts: 0,
        });
      }
    };

    poll();
  },

  // Set enrichment directly (for testing/simulator)
  setEnrichment: (data) => {
    set({
      enrichment: data,
      skillConfigs: data.generated_skills || defaultSkillConfigs,
    });
    // Persist state after enrichment is set
    const { userEmail } = get();
    if (userEmail) {
      persistOnboardingState(userEmail, get());
    }
  },

  // Update skill config
  updateSkillConfig: (skillId, config) => {
    set((state) => ({
      skillConfigs: {
        ...state.skillConfigs,
        [skillId]: {
          ...state.skillConfigs[skillId],
          ...config,
        },
      },
    }));
  },

  // Mark skill as configured
  markSkillConfigured: (skillId) => {
    set((state) => ({
      configuredSkills: state.configuredSkills.includes(skillId)
        ? state.configuredSkills
        : [...state.configuredSkills, skillId],
      skippedSkills: state.skippedSkills.filter((id) => id !== skillId),
    }));
  },

  // Mark skill as skipped
  markSkillSkipped: (skillId) => {
    set((state) => ({
      skippedSkills: state.skippedSkills.includes(skillId)
        ? state.skippedSkills
        : [...state.skippedSkills, skillId],
      configuredSkills: state.configuredSkills.filter((id) => id !== skillId),
    }));
  },

  // Reset skill to AI default
  resetSkillConfig: (skillId) => {
    const { enrichment } = get();
    if (enrichment?.generated_skills?.[skillId]) {
      set((state) => ({
        skillConfigs: {
          ...state.skillConfigs,
          [skillId]: enrichment.generated_skills![skillId],
        },
      }));
    }
  },

  // Save all skills
  saveAllSkills: async (organizationId) => {
    set({ isSaving: true, saveError: null });

    try {
      const { skillConfigs, configuredSkills } = get();

      // Prepare skills array
      const skills = SKILLS.map((skill) => ({
        skill_id: skill.id,
        skill_name: skill.name,
        config: skillConfigs[skill.id],
      }));

      const response = await supabase.functions.invoke('save-organization-skills', {
        body: {
          action: 'save-all',
          organization_id: organizationId,
          skills,
        },
      });

      if (response.error) throw response.error;
      if (!response.data?.success) throw new Error(response.data?.error || 'Failed to save skills');

      // Also mark V1 onboarding as complete so ProtectedRoute allows dashboard access
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.user) {
        await supabase
          .from('user_onboarding_progress')
          .upsert({
            user_id: session.user.id,
            onboarding_step: 'complete',
            onboarding_completed_at: new Date().toISOString(),
          }, {
            onConflict: 'user_id',
          });

        // Clear localStorage on onboarding completion
        const { userEmail } = get();
        if (userEmail) {
          clearOnboardingState(userEmail);
        }
      }

      set({ isSaving: false, currentStep: 'complete' });
      return true;

    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to save skills';
      set({ isSaving: false, saveError: message });
      return false;
    }
  },

  // ============================================================================
  // Platform Skills Actions (Phase 7)
  // ============================================================================

  // Fetch compiled skills from platform templates
  fetchCompiledSkills: async (organizationId) => {
    set({ isCompiledSkillsLoading: true, compiledSkillsError: null });

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('No session');

      // Call compile-organization-skills to get compiled skills
      const response = await supabase.functions.invoke('compile-organization-skills', {
        body: {
          action: 'compile_all',
          organization_id: organizationId,
        },
      });

      if (response.error) throw response.error;
      if (!response.data?.success) throw new Error(response.data?.error || 'Failed to compile skills');

      // Fetch the organization_skills to get the compiled skills with enabled status
      // Use left join (no !inner) since platform_skill_id may be null for AI-generated skills
      const { data: orgSkills, error: orgSkillsError } = await supabase
        .from('organization_skills')
        .select(`
          id,
          skill_id,
          skill_name,
          config,
          is_enabled,
          is_active,
          platform_skill_id,
          platform_skill_version,
          compiled_frontmatter,
          compiled_content,
          platform_skills (
            skill_key,
            category,
            frontmatter,
            content_template,
            is_active
          )
        `)
        .eq('organization_id', organizationId)
        .eq('is_active', true);

      if (orgSkillsError) throw orgSkillsError;

      // Transform to CompiledSkill format
      // Handle both platform-linked skills and AI-generated skills (where platform_skills is null)
      const compiledSkills: CompiledSkill[] = (orgSkills || []).map((skill) => {
        // Determine category based on skill_id for AI-generated skills
        const inferCategory = (skillId: string): CompiledSkill['category'] => {
          if (skillId.includes('writing') || skillId.includes('brand_voice')) return 'writing';
          if (skillId.includes('enrichment') || skillId.includes('lead_enrichment')) return 'enrichment';
          if (skillId.includes('workflow')) return 'workflows';
          if (skillId.includes('data')) return 'data-access';
          if (skillId.includes('format') || skillId.includes('output')) return 'output-format';
          return 'sales-ai';
        };

        // Generate description from config if available
        const generateDescription = (config: Record<string, unknown>): string => {
          if (!config) return '';
          if (typeof config === 'string') return config;
          if (Array.isArray(config)) return `${config.length} items configured`;
          const keys = Object.keys(config);
          if (keys.length === 0) return '';
          return `Configured with ${keys.join(', ')}`;
        };

        return {
          id: skill.id,
          skill_key: skill.skill_id,
          category: skill.platform_skills?.category || inferCategory(skill.skill_id),
          frontmatter: skill.compiled_frontmatter || skill.platform_skills?.frontmatter || {
            name: skill.skill_name || skill.skill_id,
            description: generateDescription(skill.config as Record<string, unknown>),
          },
          compiled_content: skill.compiled_content || skill.platform_skills?.content_template || JSON.stringify(skill.config, null, 2),
          is_enabled: skill.is_enabled ?? true,
          platform_skill_version: skill.platform_skill_version || 1,
        };
      });

      set({
        compiledSkills,
        isCompiledSkillsLoading: false,
      });

    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to fetch compiled skills';
      set({ isCompiledSkillsLoading: false, compiledSkillsError: message });
    }
  },

  // Toggle skill enabled status locally
  toggleCompiledSkillEnabled: (skillKey, enabled) => {
    set((state) => ({
      compiledSkills: state.compiledSkills.map((skill) =>
        skill.skill_key === skillKey ? { ...skill, is_enabled: enabled } : skill
      ),
    }));
  },

  // Save compiled skill preferences (is_enabled status)
  saveCompiledSkillPreferences: async (organizationId) => {
    set({ isSaving: true, saveError: null });

    try {
      const { compiledSkills } = get();

      // Update each skill's is_enabled status
      for (const skill of compiledSkills) {
        const { error } = await supabase
          .from('organization_skills')
          .update({ is_enabled: skill.is_enabled })
          .eq('organization_id', organizationId)
          .eq('skill_id', skill.skill_key);

        if (error) throw error;
      }

      // Also mark V1 onboarding as complete so ProtectedRoute allows dashboard access
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.user) {
        await supabase
          .from('user_onboarding_progress')
          .upsert({
            user_id: session.user.id,
            onboarding_step: 'complete',
            onboarding_completed_at: new Date().toISOString(),
          }, {
            onConflict: 'user_id',
          });

        // Clear localStorage on onboarding completion
        const { userEmail } = get();
        if (userEmail) {
          clearOnboardingState(userEmail);
        }
      }

      set({ isSaving: false, currentStep: 'complete' });
      return true;

    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to save skill preferences';
      set({ isSaving: false, saveError: message });
      return false;
    }
  },

  // Submit join request for existing organization
  submitJoinRequest: async (orgId: string, orgName: string) => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user) throw new Error('No user found');

    try {
      // Fetch profile data to include with join request
      const { data: profileData } = await supabase
        .from('profiles')
        .select('first_name, last_name')
        .eq('id', session.user.id)
        .maybeSingle();

      // If profile is empty, try to get from auth metadata and update profile
      if (profileData && (!profileData.first_name || !profileData.last_name)) {
        const firstName = session.user.user_metadata?.first_name;
        const lastName = session.user.user_metadata?.last_name;

        if (firstName || lastName) {
          console.log('[submitJoinRequest] Syncing names from auth metadata to profile');
          await supabase
            .from('profiles')
            .update({
              first_name: firstName || profileData.first_name,
              last_name: lastName || profileData.last_name,
            })
            .eq('id', session.user.id);

          // Update local profile data
          profileData.first_name = firstName || profileData.first_name;
          profileData.last_name = lastName || profileData.last_name;
        }
      }

      // Create join request via RPC with profile data
      const { data, error } = await supabase.rpc('create_join_request', {
        p_org_id: orgId,
        p_user_id: session.user.id,
        p_user_profile: profileData
          ? {
              first_name: profileData.first_name,
              last_name: profileData.last_name,
            }
          : null,
      });

      if (error) throw error;

      // Check RPC result - it returns success/message
      const result = data?.[0];
      if (!result?.success) {
        throw new Error(result?.message || 'Failed to create join request');
      }

      // Update profile status
      await supabase
        .from('profiles')
        .update({ profile_status: 'pending_approval' })
        .eq('id', session.user.id);

      // Store pending request info
      set({
        pendingJoinRequest: {
          orgId,
          orgName,
          requestId: data?.[0]?.join_request_id,
          status: 'pending',
        },
        currentStep: 'pending_approval',
      });
    } catch (error) {
      console.error('[onboardingV2Store] Error submitting join request:', error);
      throw error;
    }
  },

  // Create new organization
  createNewOrganization: async (orgName: string) => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user) throw new Error('No user found');

    try {
      // Create new organization (OLH-005: also set company_domain for UNIQUE constraint)
      const state = get();
      const { data: org, error } = await supabase
        .from('organizations')
        .insert({
          name: orgName,
          company_domain: state.resolvedResearchDomain || state.domain || null,
          created_by: session.user.id,
          is_active: true,
        })
        .select('id, name, company_domain')
        .single();

      if (error) throw error;

      // Create membership
      await supabase
        .from('organization_memberships')
        .insert({
          org_id: org.id,
          user_id: session.user.id,
          role: 'owner',
        });

      set({ organizationId: org.id });

      // Proceed to enrichment — use resolved domain if user picked one
      const freshState = get();
      const enrichDomain = freshState.resolvedResearchDomain || freshState.domain;
      if (enrichDomain) {
        await get().startEnrichment(org.id, enrichDomain, false);
      }
    } catch (error) {
      console.error('[onboardingV2Store] Error creating organization:', error);
      throw error;
    }
  },

  // Domain mismatch resolution
  resolveDomainMismatch: (chosenDomain: string) => {
    set({ resolvedResearchDomain: chosenDomain, hasDomainMismatch: false });
  },

  // Reset store
  reset: () => {
    set({
      // Context
      organizationId: null,
      domain: null,
      userEmail: null,
      isPersonalEmail: false,
      // Steps
      currentStep: 'website_input', // Reset to website_input to allow users to restart onboarding
      currentSkillIndex: 0,
      // Resetting flag
      isResettingOnboarding: false,
      // Website input
      websiteUrl: null,
      hasNoWebsite: false,
      // Manual enrichment
      manualData: null,
      // Similar organizations
      similarOrganizations: null,
      matchSearchTerm: null,
      // Enrichment
      enrichment: null,
      isEnrichmentLoading: false,
      enrichmentError: null,
      enrichmentSource: null,
      // Polling timeout protection
      pollingStartTime: null,
      pollingAttempts: 0,
      pollingTimeoutId: null,
      enrichmentRetryCount: 0,
      // Skills (legacy)
      skillConfigs: defaultSkillConfigs,
      configuredSkills: [],
      skippedSkills: [],
      // Platform compiled skills (Phase 7)
      compiledSkills: [],
      isCompiledSkillsLoading: false,
      compiledSkillsError: null,
      // Saving
      isSaving: false,
      saveError: null,
      // Organization creation
      organizationCreationInProgress: false,
      organizationCreationError: null,
      // Pending join request
      pendingJoinRequest: null,
      // Domain mismatch detection
      hasDomainMismatch: false,
      emailDomain: null,
      signupCompanyDomain: null,
      resolvedResearchDomain: null,
    });

    // Clear localStorage to prevent stale data from being restored
    const state = get();
    if (state.userEmail) {
      clearOnboardingState(state.userEmail);
    }
  },

  // Reset with full database cleanup (deletes org + related records)
  resetAndCleanup: async (queryClient?) => {
    const { organizationId, domain, userEmail } = get();

    // Step 1: Set resetting flag FIRST to prevent ProtectedRoute redirects
    set({ isResettingOnboarding: true });

    // Step 1b: Cancel any in-flight polling immediately to prevent auth cascade
    const { pollingTimeoutId } = get();
    if (pollingTimeoutId) {
      clearTimeout(pollingTimeoutId);
      set({ pollingTimeoutId: null, isEnrichmentLoading: false });
      console.log('[onboardingV2] Cancelled in-flight polling timer');
    }

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('No session');

      // Step 2: Reset onboarding progress FIRST (so needsOnboarding stays correct)
      await supabase
        .from('user_onboarding_progress')
        .update({ onboarding_step: 'website_input', onboarding_completed_at: null })
        .eq('user_id', session.user.id);

      if (organizationId) {
        // Step 3a: Org exists (post-enrichment) - full cleanup in FK dependency order
        // Delete child records first, then parent organization (ONBOARD-007)
        await supabase.from('organization_enrichment').delete().eq('organization_id', organizationId);
        await supabase.from('organization_join_requests').delete().eq('org_id', organizationId);
        await supabase.from('organization_skills').delete().eq('organization_id', organizationId);
        await supabase.from('organization_context').delete().eq('organization_id', organizationId);
        await supabase.from('organization_memberships').delete().eq('org_id', organizationId).eq('user_id', session.user.id);
        // Defensive deletion: reengagement_log has NO CASCADE - could block org deletion if records exist
        await supabase.from('reengagement_log').delete().eq('org_id', organizationId);
        await supabase.from('organizations').delete().eq('id', organizationId).eq('created_by', session.user.id);

        // Step 3a-verify: Verify cleanup completed successfully (ONBOARD-010)
        const { data: verificationResult, error: verifyError } = await supabase
          .rpc('verify_organization_cleanup', { p_org_id: organizationId });

        if (verifyError) {
          console.error('[onboardingV2] Cleanup verification failed:', verifyError);
        } else if (verificationResult && !verificationResult.cleanup_complete) {
          console.error('[onboardingV2] Cleanup incomplete! Remaining records:', verificationResult.remaining_records);
          throw new Error('Organization cleanup verification failed - some records still exist');
        } else {
          console.log('[onboardingV2] Cleanup verified successfully:', organizationId);
        }
      } else if (domain) {
        // Step 3b: No org yet (during enrichment_loading) - cleanup orphaned enrichment by domain
        await supabase.from('organization_enrichment').delete().eq('domain', domain).is('organization_id', null);

        console.log('[onboardingV2] Cleaned up domain-only enrichment during reset:', domain);
      }
    } catch (error) {
      console.error('[onboardingV2] Failed to cleanup during reset:', error);
      // Continue with local reset even if DB cleanup fails
    }

    // Step 4: Clear localStorage
    if (userEmail) {
      clearOnboardingState(userEmail);
    }

    // Step 4.5: Clear React Query cache (ONBOARD-008)
    if (queryClient) {
      console.log('[onboardingV2] Clearing React Query cache');
      queryClient.clear();
    }

    // Step 5: Reset Zustand store state (this sets isResettingOnboarding back to false)
    get().reset();

    // Step 6: Keep isResettingOnboarding true through the re-render cycle
    // queryClient.clear() triggers async re-fetches that may check membership state.
    // If the flag is already false, ProtectedRoute/AuthContext may redirect/logout.
    set({ isResettingOnboarding: true });
    setTimeout(() => {
      set({ isResettingOnboarding: false });
    }, 300);
  },
}));
