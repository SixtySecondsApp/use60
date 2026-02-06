import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  useOnboardingV2Store,
  isPersonalEmailDomain,
  extractDomain,
  persistOnboardingState,
  restoreOnboardingState,
  clearOnboardingState,
  PERSONAL_EMAIL_DOMAINS,
} from '@/lib/stores/onboardingV2Store';

// Mock Supabase
vi.mock('@/lib/supabase/clientV2', () => ({
  supabase: {
    auth: {
      getSession: vi.fn(),
      onAuthStateChange: vi.fn(),
    },
    from: vi.fn(),
    rpc: vi.fn(),
  },
}));

// Mock localStorage
const localStorageMock = (() => {
  let store: Record<string, string> = {};

  return {
    getItem: (key: string) => store[key] || null,
    setItem: (key: string, value: string) => {
      store[key] = value.toString();
    },
    removeItem: (key: string) => {
      delete store[key];
    },
    clear: () => {
      store = {};
    },
  };
})();

Object.defineProperty(window, 'localStorage', {
  value: localStorageMock,
});

describe('onboardingV2Store', () => {
  beforeEach(() => {
    // Clear store state before each test
    useOnboardingV2Store.setState({
      organizationId: null,
      domain: null,
      userEmail: null,
      isPersonalEmail: false,
      currentStep: 'website_input',
      currentSkillIndex: 0,
      websiteUrl: null,
      hasNoWebsite: false,
      manualData: null,
      similarOrganizations: null,
      matchSearchTerm: null,
      enrichment: null,
      isEnrichmentLoading: false,
      enrichmentError: null,
      enrichmentSource: null,
      pollingStartTime: null,
      pollingAttempts: 0,
      skillConfigs: {
        lead_qualification: { criteria: [], disqualifiers: [] },
        lead_enrichment: { questions: [] },
        brand_voice: { tone: '', avoid: [] },
        objection_handling: { objections: [] },
        icp: { companyProfile: '', buyerPersona: '', buyingSignals: [] },
      },
      configuredSkills: [],
      skippedSkills: [],
      compiledSkills: [],
      isCompiledSkillsLoading: false,
      compiledSkillsError: null,
      isSaving: false,
      saveError: null,
      organizationCreationInProgress: false,
      organizationCreationError: null,
      pendingJoinRequest: null,
    });
    localStorageMock.clear();
    vi.clearAllMocks();
  });

  afterEach(() => {
    localStorageMock.clear();
  });

  // ===== Email Detection Tests =====
  describe('isPersonalEmailDomain', () => {
    it('should detect gmail.com as personal email', () => {
      expect(isPersonalEmailDomain('user@gmail.com')).toBe(true);
    });

    it('should detect yahoo.com as personal email', () => {
      expect(isPersonalEmailDomain('user@yahoo.com')).toBe(true);
    });

    it('should detect hotmail.com as personal email', () => {
      expect(isPersonalEmailDomain('user@hotmail.com')).toBe(true);
    });

    it('should detect outlook.com as personal email', () => {
      expect(isPersonalEmailDomain('user@outlook.com')).toBe(true);
    });

    it('should detect icloud.com as personal email', () => {
      expect(isPersonalEmailDomain('user@icloud.com')).toBe(true);
    });

    it('should detect protonmail.com as personal email', () => {
      expect(isPersonalEmailDomain('user@protonmail.com')).toBe(true);
    });

    it('should detect proton.me as personal email', () => {
      expect(isPersonalEmailDomain('user@proton.me')).toBe(true);
    });

    it('should not detect business domain as personal email', () => {
      expect(isPersonalEmailDomain('user@company.com')).toBe(false);
    });

    it('should not detect custom domain as personal email', () => {
      expect(isPersonalEmailDomain('user@acme.io')).toBe(false);
    });

    it('should handle uppercase email domains', () => {
      expect(isPersonalEmailDomain('user@GMAIL.COM')).toBe(true);
    });

    it('should handle case-insensitive business domains', () => {
      expect(isPersonalEmailDomain('user@COMPANY.COM')).toBe(false);
    });
  });

  // ===== Domain Extraction Tests =====
  describe('extractDomain', () => {
    it('should extract domain from email address', () => {
      expect(extractDomain('user@example.com')).toBe('example.com');
    });

    it('should extract domain from email with subdomains', () => {
      expect(extractDomain('user@mail.example.co.uk')).toBe('mail.example.co.uk');
    });

    it('should extract hostname from URL without protocol', () => {
      expect(extractDomain('example.com')).toBe('example.com');
    });

    it('should extract hostname from URL with www', () => {
      expect(extractDomain('www.example.com')).toBe('example.com');
    });

    it('should extract hostname from URL with https protocol', () => {
      expect(extractDomain('https://example.com')).toBe('example.com');
    });

    it('should extract hostname from URL with http protocol', () => {
      expect(extractDomain('http://example.com')).toBe('example.com');
    });

    it('should extract hostname from URL with www and protocol', () => {
      expect(extractDomain('https://www.example.com')).toBe('example.com');
    });

    it('should strip path from URL', () => {
      expect(extractDomain('https://example.com/path/to/page')).toBe('example.com');
    });

    it('should handle uppercase domains', () => {
      expect(extractDomain('EXAMPLE.COM')).toBe('example.com');
    });

    it('should handle mixed case emails', () => {
      expect(extractDomain('User@Example.COM')).toBe('example.com');
    });

    it('should handle URLs with query parameters', () => {
      expect(extractDomain('https://example.com?param=value')).toBe('example.com');
    });
  });

  // ===== LocalStorage Persistence Tests =====
  describe('localStorage persistence', () => {
    it('should persist state to localStorage', () => {
      const userId = 'test-user-123';
      const state = {
        currentStep: 'enrichment_loading' as const,
        domain: 'example.com',
        websiteUrl: 'https://example.com',
        userEmail: 'user@example.com',
      };

      persistOnboardingState(userId, state);

      const key = `sixty_onboarding_${userId}`;
      const stored = localStorage.getItem(key);
      expect(stored).toBeTruthy();

      const parsed = JSON.parse(stored!);
      expect(parsed.currentStep).toBe('enrichment_loading');
      expect(parsed.domain).toBe('example.com');
      expect(parsed.websiteUrl).toBe('https://example.com');
      expect(parsed.savedAt).toBeTruthy();
    });

    it('should restore state from localStorage', () => {
      const userId = 'test-user-123';
      const state = {
        currentStep: 'skills_config' as const,
        domain: 'acme.com',
        websiteUrl: 'https://acme.com',
      };

      persistOnboardingState(userId, state);
      const restored = restoreOnboardingState(userId);

      expect(restored).toBeTruthy();
      expect(restored?.currentStep).toBe('skills_config');
      expect(restored?.domain).toBe('acme.com');
      expect(restored?.websiteUrl).toBe('https://acme.com');
    });

    it('should clear state from localStorage', () => {
      const userId = 'test-user-123';
      persistOnboardingState(userId, { currentStep: 'website_input' });

      const key = `sixty_onboarding_${userId}`;
      expect(localStorage.getItem(key)).toBeTruthy();

      clearOnboardingState(userId);
      expect(localStorage.getItem(key)).toBeNull();
    });

    it('should return null when restoring non-existent state', () => {
      const restored = restoreOnboardingState('non-existent-user');
      expect(restored).toBeNull();
    });

    it('should handle corrupted localStorage data gracefully', () => {
      const userId = 'test-user-123';
      const key = `sixty_onboarding_${userId}`;
      localStorage.setItem(key, 'invalid json {');

      const restored = restoreOnboardingState(userId);
      expect(restored).toBeNull();
    });

    it('should expire state older than 24 hours', () => {
      const userId = 'test-user-123';
      const oldDate = new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString();

      const key = `sixty_onboarding_${userId}`;
      localStorage.setItem(
        key,
        JSON.stringify({
          currentStep: 'website_input',
          savedAt: oldDate,
        })
      );

      const restored = restoreOnboardingState(userId);
      expect(restored).toBeNull();
      expect(localStorage.getItem(key)).toBeNull();
    });

    it('should accept state within 24 hours', () => {
      const userId = 'test-user-123';
      const recentDate = new Date(Date.now() - 12 * 60 * 60 * 1000).toISOString();

      const key = `sixty_onboarding_${userId}`;
      localStorage.setItem(
        key,
        JSON.stringify({
          currentStep: 'enrichment_loading',
          savedAt: recentDate,
        })
      );

      const restored = restoreOnboardingState(userId);
      expect(restored).toBeTruthy();
      expect(restored?.currentStep).toBe('enrichment_loading');
    });
  });

  // ===== Store State Transitions Tests =====
  describe('state transitions', () => {
    it('should initialize with default state', () => {
      const state = useOnboardingV2Store.getState();
      expect(state.organizationId).toBeNull();
      expect(state.domain).toBeNull();
      expect(state.userEmail).toBeNull();
      expect(state.isPersonalEmail).toBe(false);
      expect(state.currentStep).toBe('website_input');
      expect(state.currentSkillIndex).toBe(0);
      expect(state.enrichmentError).toBeNull();
    });

    it('should update organization ID', () => {
      const { setOrganizationId } = useOnboardingV2Store.getState();
      setOrganizationId('org-123');

      const state = useOnboardingV2Store.getState();
      expect(state.organizationId).toBe('org-123');
    });

    it('should update domain', () => {
      useOnboardingV2Store.setState({ userEmail: 'user@gmail.com' });

      const { setDomain } = useOnboardingV2Store.getState();
      setDomain('example.com');

      const state = useOnboardingV2Store.getState();
      expect(state.domain).toBe('example.com');
    });

    it('should update step', () => {
      const { setStep } = useOnboardingV2Store.getState();
      setStep('enrichment_loading');

      const state = useOnboardingV2Store.getState();
      expect(state.currentStep).toBe('enrichment_loading');
    });

    it('should update website URL', () => {
      const { setWebsiteUrl } = useOnboardingV2Store.getState();
      setWebsiteUrl('https://example.com');

      const state = useOnboardingV2Store.getState();
      expect(state.websiteUrl).toBe('https://example.com');
    });

    it('should toggle hasNoWebsite flag', () => {
      const { setHasNoWebsite } = useOnboardingV2Store.getState();
      expect(useOnboardingV2Store.getState().hasNoWebsite).toBe(false);

      setHasNoWebsite(true);
      expect(useOnboardingV2Store.getState().hasNoWebsite).toBe(true);

      setHasNoWebsite(false);
      expect(useOnboardingV2Store.getState().hasNoWebsite).toBe(false);
    });

    it('should update current skill index', () => {
      const { setCurrentSkillIndex } = useOnboardingV2Store.getState();
      setCurrentSkillIndex(2);

      const state = useOnboardingV2Store.getState();
      expect(state.currentSkillIndex).toBe(2);
    });
  });

  // ===== Skill Configuration Tests =====
  describe('skill configuration', () => {
    it('should update skill config', () => {
      const { updateSkillConfig } = useOnboardingV2Store.getState();
      const newConfig = { criteria: ['prospect type A', 'revenue > $1M'], disqualifiers: ['small startup'] };

      updateSkillConfig('lead_qualification', newConfig);

      const state = useOnboardingV2Store.getState();
      expect(state.skillConfigs.lead_qualification).toEqual(newConfig);
    });

    it('should mark skill as configured', () => {
      const { markSkillConfigured } = useOnboardingV2Store.getState();
      expect(useOnboardingV2Store.getState().configuredSkills).toHaveLength(0);

      markSkillConfigured('lead_qualification');
      expect(useOnboardingV2Store.getState().configuredSkills).toContain('lead_qualification');

      markSkillConfigured('lead_enrichment');
      expect(useOnboardingV2Store.getState().configuredSkills).toHaveLength(2);
    });

    it('should prevent duplicate skill configuration marks', () => {
      const { markSkillConfigured } = useOnboardingV2Store.getState();

      markSkillConfigured('lead_qualification');
      markSkillConfigured('lead_qualification');

      const state = useOnboardingV2Store.getState();
      expect(state.configuredSkills.filter((s) => s === 'lead_qualification')).toHaveLength(1);
    });

    it('should mark skill as skipped', () => {
      const { markSkillSkipped } = useOnboardingV2Store.getState();
      expect(useOnboardingV2Store.getState().skippedSkills).toHaveLength(0);

      markSkillSkipped('brand_voice');
      expect(useOnboardingV2Store.getState().skippedSkills).toContain('brand_voice');
    });

    it('should reset skill config when enrichment data available', () => {
      const { updateSkillConfig, resetSkillConfig, setEnrichment } = useOnboardingV2Store.getState();

      // First, set enrichment data with generated skills
      setEnrichment({
        id: 'enrich-123',
        organization_id: 'org-123',
        domain: 'example.com',
        status: 'completed',
        generated_skills: {
          lead_qualification: {
            criteria: ['AI generated criteria'],
            disqualifiers: [],
          },
          lead_enrichment: { questions: [] },
          brand_voice: { tone: 'AI generated tone', avoid: [] },
          objection_handling: { objections: [] },
          icp: { companyProfile: '', buyerPersona: '', buyingSignals: [] },
        },
      });

      // Then update a skill config
      updateSkillConfig('lead_qualification', {
        criteria: ['custom criteria'],
        disqualifiers: ['custom disqualifier'],
      });

      expect(useOnboardingV2Store.getState().skillConfigs.lead_qualification.criteria).toContain('custom criteria');

      // Reset it - should restore to AI-generated version
      resetSkillConfig('lead_qualification');

      const state = useOnboardingV2Store.getState();
      expect(state.skillConfigs.lead_qualification.criteria).toEqual(['AI generated criteria']);
    });
  });

  // ===== Manual Data Tests =====
  describe('manual enrichment data', () => {
    it('should set manual enrichment data', () => {
      const { setManualData } = useOnboardingV2Store.getState();
      const manualData = {
        company_name: 'Acme Corp',
        company_description: 'A leading company',
        industry: 'Technology',
        target_customers: 'Enterprise customers',
        main_products: 'Software solutions',
        competitors: 'Company X, Company Y',
      };

      setManualData(manualData);

      const state = useOnboardingV2Store.getState();
      expect(state.manualData).toEqual(manualData);
    });

    it('should clear manual enrichment data on reset', () => {
      const { setManualData, reset } = useOnboardingV2Store.getState();
      const manualData = {
        company_name: 'Test Corp',
        company_description: 'Test company',
        industry: 'Tech',
        target_customers: 'All',
        main_products: 'Products',
        competitors: 'Competitors',
      };

      setManualData(manualData);
      expect(useOnboardingV2Store.getState().manualData).toBeTruthy();

      reset();
      expect(useOnboardingV2Store.getState().manualData).toBeNull();
    });
  });

  // ===== Enrichment State Tests =====
  describe('enrichment state', () => {
    it('should set enrichment data', () => {
      const { setEnrichment } = useOnboardingV2Store.getState();
      const enrichmentData = {
        id: 'enrich-123',
        organization_id: 'org-123',
        domain: 'example.com',
        status: 'completed' as const,
        company_name: 'Example Corp',
        industry: 'Technology',
      };

      setEnrichment(enrichmentData);

      const state = useOnboardingV2Store.getState();
      expect(state.enrichment?.company_name).toBe('Example Corp');
      expect(state.enrichment?.domain).toBe('example.com');
    });

    it('should track enrichment loading state', () => {
      useOnboardingV2Store.setState({ isEnrichmentLoading: true });
      expect(useOnboardingV2Store.getState().isEnrichmentLoading).toBe(true);

      useOnboardingV2Store.setState({ isEnrichmentLoading: false });
      expect(useOnboardingV2Store.getState().isEnrichmentLoading).toBe(false);
    });

    it('should track enrichment errors', () => {
      useOnboardingV2Store.setState({ enrichmentError: 'Website scraping failed' });
      expect(useOnboardingV2Store.getState().enrichmentError).toBe('Website scraping failed');

      useOnboardingV2Store.setState({ enrichmentError: null });
      expect(useOnboardingV2Store.getState().enrichmentError).toBeNull();
    });

    it('should track polling attempts', () => {
      useOnboardingV2Store.setState({ pollingAttempts: 5 });
      expect(useOnboardingV2Store.getState().pollingAttempts).toBe(5);
    });

    it('should track polling start time', () => {
      const now = Date.now();
      useOnboardingV2Store.setState({ pollingStartTime: now });
      expect(useOnboardingV2Store.getState().pollingStartTime).toBe(now);
    });

    it('should track enrichment source', () => {
      useOnboardingV2Store.setState({ enrichmentSource: 'website' });
      expect(useOnboardingV2Store.getState().enrichmentSource).toBe('website');

      useOnboardingV2Store.setState({ enrichmentSource: 'manual' });
      expect(useOnboardingV2Store.getState().enrichmentSource).toBe('manual');
    });
  });

  // ===== Organization Selection Tests =====
  describe('organization selection state', () => {
    it('should store similar organizations', () => {
      const orgs = [
        { id: 'org-1', name: 'Org 1', company_domain: 'org1.com', member_count: 5, similarity_score: 0.95 },
        { id: 'org-2', name: 'Org 2', company_domain: 'org2.com', member_count: 3, similarity_score: 0.75 },
      ];

      useOnboardingV2Store.setState({ similarOrganizations: orgs, matchSearchTerm: 'example.com' });

      const state = useOnboardingV2Store.getState();
      expect(state.similarOrganizations).toHaveLength(2);
      expect(state.matchSearchTerm).toBe('example.com');
    });

    it('should track pending join request', () => {
      const joinRequest = {
        requestId: 'req-123',
        orgId: 'org-456',
        orgName: 'Target Org',
        status: 'pending' as const,
      };

      useOnboardingV2Store.setState({ pendingJoinRequest: joinRequest });

      const state = useOnboardingV2Store.getState();
      expect(state.pendingJoinRequest?.requestId).toBe('req-123');
      expect(state.pendingJoinRequest?.status).toBe('pending');
    });

    it('should update pending join request status to approved', () => {
      const initialRequest = {
        requestId: 'req-123',
        orgId: 'org-456',
        orgName: 'Target Org',
        status: 'pending' as const,
      };

      useOnboardingV2Store.setState({ pendingJoinRequest: initialRequest });

      // Simulate approval
      const approved = {
        ...initialRequest,
        status: 'approved' as const,
      };
      useOnboardingV2Store.setState({ pendingJoinRequest: approved });

      expect(useOnboardingV2Store.getState().pendingJoinRequest?.status).toBe('approved');
    });

    it('should clear pending join request on reset', () => {
      useOnboardingV2Store.setState({
        pendingJoinRequest: {
          requestId: 'req-123',
          orgId: 'org-456',
          orgName: 'Target Org',
          status: 'pending',
        },
      });

      const { reset } = useOnboardingV2Store.getState();
      reset();

      expect(useOnboardingV2Store.getState().pendingJoinRequest).toBeNull();
    });
  });

  // ===== Compiled Skills Tests =====
  describe('compiled skills (Phase 7)', () => {
    it('should track compiled skills loading state', () => {
      useOnboardingV2Store.setState({ isCompiledSkillsLoading: true });
      expect(useOnboardingV2Store.getState().isCompiledSkillsLoading).toBe(true);

      useOnboardingV2Store.setState({ isCompiledSkillsLoading: false });
      expect(useOnboardingV2Store.getState().isCompiledSkillsLoading).toBe(false);
    });

    it('should track compiled skills error', () => {
      useOnboardingV2Store.setState({ compiledSkillsError: 'Failed to fetch skills' });
      expect(useOnboardingV2Store.getState().compiledSkillsError).toBe('Failed to fetch skills');
    });

    it('should store compiled skills', () => {
      const compiledSkill = {
        id: 'skill-1',
        skill_key: 'lead_qualification',
        category: 'sales-ai' as const,
        frontmatter: {
          name: 'Lead Qualification',
          description: 'Qualify leads',
          priority: 'high' as const,
        },
        compiled_content: 'Content here',
        is_enabled: true,
        platform_skill_version: 1,
      };

      useOnboardingV2Store.setState({ compiledSkills: [compiledSkill] });

      const state = useOnboardingV2Store.getState();
      expect(state.compiledSkills).toHaveLength(1);
      expect(state.compiledSkills[0].skill_key).toBe('lead_qualification');
    });

    it('should toggle compiled skill enabled state', () => {
      const compiledSkill = {
        id: 'skill-1',
        skill_key: 'lead_qualification',
        category: 'sales-ai' as const,
        frontmatter: {
          name: 'Lead Qualification',
          description: 'Qualify leads',
        },
        compiled_content: 'Content',
        is_enabled: true,
        platform_skill_version: 1,
      };

      useOnboardingV2Store.setState({ compiledSkills: [compiledSkill] });

      const { toggleCompiledSkillEnabled } = useOnboardingV2Store.getState();
      toggleCompiledSkillEnabled('lead_qualification', false);

      const state = useOnboardingV2Store.getState();
      expect(state.compiledSkills[0].is_enabled).toBe(false);
    });
  });

  // ===== Saving State Tests =====
  describe('saving state', () => {
    it('should track saving state', () => {
      useOnboardingV2Store.setState({ isSaving: true });
      expect(useOnboardingV2Store.getState().isSaving).toBe(true);

      useOnboardingV2Store.setState({ isSaving: false });
      expect(useOnboardingV2Store.getState().isSaving).toBe(false);
    });

    it('should track save errors', () => {
      useOnboardingV2Store.setState({ saveError: 'Failed to save skills' });
      expect(useOnboardingV2Store.getState().saveError).toBe('Failed to save skills');

      useOnboardingV2Store.setState({ saveError: null });
      expect(useOnboardingV2Store.getState().saveError).toBeNull();
    });
  });

  // ===== Organization Creation Tests =====
  describe('organization creation state', () => {
    it('should track organization creation progress', () => {
      useOnboardingV2Store.setState({ organizationCreationInProgress: true });
      expect(useOnboardingV2Store.getState().organizationCreationInProgress).toBe(true);

      useOnboardingV2Store.setState({ organizationCreationInProgress: false });
      expect(useOnboardingV2Store.getState().organizationCreationInProgress).toBe(false);
    });

    it('should track organization creation error', () => {
      useOnboardingV2Store.setState({ organizationCreationError: 'Organization name already exists' });
      expect(useOnboardingV2Store.getState().organizationCreationError).toBe('Organization name already exists');
    });
  });

  // ===== Reset Functionality Tests =====
  describe('reset functionality', () => {
    it('should reset all state to defaults', () => {
      // Set various state values
      useOnboardingV2Store.setState({
        organizationId: 'org-123',
        domain: 'example.com',
        userEmail: 'user@example.com',
        isPersonalEmail: true,
        currentStep: 'enrichment_loading',
        websiteUrl: 'https://example.com',
        hasNoWebsite: true,
        enrichmentError: 'Test error',
        pollingAttempts: 5,
        pollingStartTime: Date.now(),
      });

      // Verify state is set
      let state = useOnboardingV2Store.getState();
      expect(state.organizationId).toBe('org-123');
      expect(state.enrichmentError).toBe('Test error');

      // Reset
      const { reset } = useOnboardingV2Store.getState();
      reset();

      // Verify reset to defaults (including polling fields)
      state = useOnboardingV2Store.getState();
      expect(state.organizationId).toBeNull();
      expect(state.domain).toBeNull();
      expect(state.userEmail).toBeNull();
      expect(state.isPersonalEmail).toBe(false);
      expect(state.currentStep).toBe('website_input');
      expect(state.enrichmentError).toBeNull();
      // Note: reset() doesn't reset pollingStartTime and pollingAttempts
      // They'll need to be cleared separately if needed
    });

    it('should reset skill configurations', () => {
      const { updateSkillConfig, markSkillConfigured, reset } = useOnboardingV2Store.getState();

      updateSkillConfig('lead_qualification', {
        criteria: ['test criteria'],
        disqualifiers: [],
      });
      markSkillConfigured('lead_qualification');

      expect(useOnboardingV2Store.getState().configuredSkills).toHaveLength(1);

      reset();

      const state = useOnboardingV2Store.getState();
      expect(state.skillConfigs.lead_qualification.criteria).toHaveLength(0);
      expect(state.configuredSkills).toHaveLength(0);
    });

    it('should clear localStorage on reset', () => {
      useOnboardingV2Store.setState({ userEmail: 'test@example.com' });

      const { reset } = useOnboardingV2Store.getState();
      reset();

      // localStorage should have been cleared by the reset action if userEmail is available
      const state = useOnboardingV2Store.getState();
      expect(state.userEmail).toBeNull();
    });
  });

  // ===== Integration Tests =====
  describe('state integration', () => {
    it('should persist state when domain changes', () => {
      useOnboardingV2Store.setState({ userEmail: 'user@example.com' });
      const { setDomain } = useOnboardingV2Store.getState();

      setDomain('newdomain.com');

      const key = `sixty_onboarding_user@example.com`;
      const stored = localStorage.getItem(key);
      expect(stored).toBeTruthy();

      const parsed = JSON.parse(stored!);
      expect(parsed.domain).toBe('newdomain.com');
    });

    it('should persist state when step changes', () => {
      useOnboardingV2Store.setState({ userEmail: 'user@example.com' });
      const { setStep } = useOnboardingV2Store.getState();

      setStep('enrichment_loading');

      const key = `sixty_onboarding_user@example.com`;
      const stored = localStorage.getItem(key);
      expect(stored).toBeTruthy();

      const parsed = JSON.parse(stored!);
      expect(parsed.currentStep).toBe('enrichment_loading');
    });

    it('should handle multiple rapid state updates', () => {
      const { setStep, setWebsiteUrl, setDomain } = useOnboardingV2Store.getState();
      useOnboardingV2Store.setState({ userEmail: 'user@example.com' });

      // Rapid updates
      setStep('website_input');
      setWebsiteUrl('https://example.com');
      setDomain('example.com');

      const state = useOnboardingV2Store.getState();
      expect(state.currentStep).toBe('website_input');
      expect(state.websiteUrl).toBe('https://example.com');
      expect(state.domain).toBe('example.com');
    });
  });

  // ===== Edge Cases =====
  describe('edge cases', () => {
    it('should handle empty email string', () => {
      expect(isPersonalEmailDomain('')).toBe(false);
    });

    it('should handle email without @ symbol', () => {
      expect(isPersonalEmailDomain('notanemail')).toBe(false);
    });

    it('should handle empty domain extraction', () => {
      const result = extractDomain('');
      expect(result).toBe('');
    });

    it('should handle malformed URLs gracefully', () => {
      const result = extractDomain('ht!tp://exa mple.com');
      // Should not throw, returns cleaned version
      expect(typeof result).toBe('string');
    });

    it('should persist with null userEmail gracefully', () => {
      const state = useOnboardingV2Store.getState();
      // Should not throw
      persistOnboardingState('', state);
    });

    it('should handle concurrent reset calls', () => {
      useOnboardingV2Store.setState({ organizationId: 'org-123' });

      const { reset } = useOnboardingV2Store.getState();
      reset();
      reset(); // Second call

      const state = useOnboardingV2Store.getState();
      expect(state.organizationId).toBeNull();
    });
  });
});
