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
  status: 'pending' | 'scraping' | 'analyzing' | 'completed' | 'failed';
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
  | 'website_input'        // Ask for website URL (personal email users)
  | 'manual_enrichment'    // Q&A fallback (no website available)
  | 'organization_selection'  // Fuzzy match found - choose to join or create new
  | 'pending_approval'     // Awaiting admin approval of join request
  | 'enrichment_loading'   // AI analyzing company
  | 'enrichment_result'    // Show what we learned
  | 'skills_config'        // Configure 5 skills
  | 'complete';            // All done!

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

  // Context setters
  setOrganizationId: (id: string) => void;
  setDomain: (domain: string) => void;
  setUserEmail: (email: string) => void;

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
  startEnrichment: (organizationId: string, domain: string, force?: boolean) => Promise<void>;
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

  // Reset
  reset: () => void;
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
  setUserEmail: (email) => {
    const isPersonal = isPersonalEmailDomain(email);
    set({
      userEmail: email,
      isPersonalEmail: isPersonal,
      // If personal email, start at website_input step
      currentStep: isPersonal ? 'website_input' : 'enrichment_loading',
    });
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

      // ALWAYS check for existing organizations by domain first
      // Even if we have an auto-created org ID, we should check if a real org exists
      console.log('[onboardingV2] Checking for existing organization with domain:', domain);

      let existingOrg = null;

      // Strategy 1: Exact match by company_domain
      const { data: exactMatch } = await supabase
        .from('organizations')
        .select('id, name, company_domain')
        .eq('company_domain', domain)
        .eq('is_active', true)
        .maybeSingle();

      existingOrg = exactMatch;

      // Strategy 2: If no exact match, try fuzzy domain matching RPC
      if (!existingOrg) {
        const { data: fuzzyMatches } = await supabase.rpc('find_similar_organizations_by_domain', {
          p_search_domain: domain,
          p_limit: 5,
        });

        // Use the best match (highest similarity score > 0.7)
        if (fuzzyMatches && fuzzyMatches.length > 0 && fuzzyMatches[0].similarity_score > 0.7) {
          console.log('[onboardingV2] Found fuzzy match with score:', fuzzyMatches[0].similarity_score);
          existingOrg = fuzzyMatches[0];
        }
      }

      if (existingOrg) {
        console.log('[onboardingV2] Found existing organization:', existingOrg.name);

        // Organization exists - create join request instead
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

      // No existing org found - check if we need to create one or use the provided one
      if (!finalOrgId || finalOrgId === '') {
        // No org ID provided - create new one
        const organizationName = domain || 'My Organization';
        const { data: newOrg, error: createError } = await supabase
          .from('organizations')
          .insert({
            name: organizationName,
            company_domain: domain,
            created_by: session.user.id,
            is_active: true,
          })
          .select('id')
          .single();

        if (createError || !newOrg?.id) {
          throw createError || new Error('Failed to create organization');
        }

        console.log('[onboardingV2] Created new organization:', newOrg.id);

        // Add user as owner of the new organization
        const { error: memberError } = await supabase
          .from('organization_memberships')
          .insert({
            org_id: newOrg.id,
            user_id: session.user.id,
            role: 'owner',
          });

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

      // Start enrichment with the provided website
      get().startEnrichment(finalOrgId, domain);

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

      // Check if we found a high-confidence match (similarity > 0.7)
      const highConfidenceMatch = similarOrgs && similarOrgs.length > 0 && similarOrgs[0].similarity_score > 0.7;

      // If we found similar orgs, show selection step
      if (similarOrgs && similarOrgs.length > 0 && !highConfidenceMatch) {
        set({
          organizationCreationInProgress: false,
          currentStep: 'organization_selection',
          similarOrganizations: similarOrgs,
          matchSearchTerm: organizationName,
        });
        return organizationName; // Return something truthy to prevent error
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
        .insert({
          org_id: newOrg.id,
          user_id: userId,
          role: 'owner',
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
                to_email: 'app@use60.com', // TODO: Replace with actual admin email or admin list
                variables: {
                  newOrgName: organizationName,
                  similarOrgName: similarOrg.name,
                  userName,
                  userEmail: userProfile.email || session.user.email,
                  dashboardUrl: window.location.origin,
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

    set({
      isEnrichmentLoading: true,
      enrichmentError: null,
      enrichmentSource: 'manual',
      currentStep: 'enrichment_loading',
    });

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('No session');

      // If organizationId is empty/null (personal email user), create org first
      if (!finalOrgId || finalOrgId === '') {
        finalOrgId = await get().createOrganizationFromManualData(session.user.id, manualData);
        set({ organizationId: finalOrgId });
      }

      // Call edge function with manual data
      const response = await supabase.functions.invoke('deep-enrich-organization', {
        body: {
          action: 'manual',
          organization_id: finalOrgId,
          manual_data: manualData,
        },
      });

      if (response.error) throw response.error;
      if (!response.data?.success) throw new Error(response.data?.error || 'Failed to process data');

      // Start polling for status (manual enrichment still runs AI skill generation)
      get().pollEnrichmentStatus(finalOrgId);

    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to process your information';
      set({ isEnrichmentLoading: false, enrichmentError: message });
    }
  },

  // Start enrichment (website-based)
  startEnrichment: async (organizationId, domain, force = false) => {
    // If retrying (force=true), reset polling state to allow fresh attempt
    const resetState = force ? { pollingStartTime: null, pollingAttempts: 0 } : {};
    set({ isEnrichmentLoading: true, enrichmentError: null, enrichmentSource: 'website', ...resetState });

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('No session');

      const response = await supabase.functions.invoke('deep-enrich-organization', {
        body: {
          action: 'start',
          organization_id: organizationId,
          domain: domain,
          force: force,
        },
      });

      if (response.error) throw response.error;
      if (!response.data?.success) throw new Error(response.data?.error || 'Failed to start enrichment');

      // Start polling for status
      get().pollEnrichmentStatus(organizationId);

    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to start enrichment';
      set({ isEnrichmentLoading: false, enrichmentError: message });
    }
  },

  // Poll enrichment status with timeout protection
  pollEnrichmentStatus: async (organizationId) => {
    const MAX_POLLING_DURATION = 5 * 60 * 1000; // 5 minutes
    const MAX_ATTEMPTS = 150; // 150 * 2s = 5 minutes
    const POLL_INTERVAL = 2000; // 2 seconds

    const state = get();

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
        const response = await supabase.functions.invoke('deep-enrich-organization', {
          body: {
            action: 'status',
            organization_id: organizationId,
          },
        });

        if (response.error) throw response.error;

        const { status, enrichment, skills } = response.data;

        if (status === 'completed' && enrichment) {
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

        // Continue polling (recursive call after delay)
        setTimeout(() => get().pollEnrichmentStatus(organizationId), POLL_INTERVAL);

      } catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to get enrichment status';
        console.error('[pollEnrichmentStatus] Error:', message);
        set({
          isEnrichmentLoading: false,
          enrichmentError: message,
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
      // Create new organization
      const { data: org, error } = await supabase
        .from('organizations')
        .insert({
          name: orgName,
          created_by: session.user.id,
          is_active: true,
        })
        .select()
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

      // Proceed to enrichment
      const state = get();
      if (state.domain) {
        await get().startEnrichment(org.id, state.domain, false);
      }
    } catch (error) {
      console.error('[onboardingV2Store] Error creating organization:', error);
      throw error;
    }
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
    });
  },
}));
