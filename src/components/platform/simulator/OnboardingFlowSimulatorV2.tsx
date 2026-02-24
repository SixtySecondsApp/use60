/**
 * OnboardingFlowSimulatorV2 - Skills-Based Onboarding Simulator
 *
 * Allows platform admins to experience the V2 skills-based onboarding flow.
 * Simulates all 3 onboarding paths:
 * 1. Corporate email: Direct enrichment from domain
 * 2. Personal email + website: User provides website for enrichment
 * 3. Personal email + no website: Q&A flow for manual enrichment
 *
 * Can run in mock mode (instant) or real API mode (calls actual enrichment).
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Play,
  RotateCcw,
  Check,
  ChevronRight,
  ChevronLeft,
  Clock,
  Target,
  Database,
  MessageSquare,
  GitBranch,
  UserCheck,
  Sparkles,
  Globe,
  Zap,
  Plus,
  Trash2,
  Lightbulb,
  HelpCircle,
  Edit3,
  Mail,
  Building2,
  Users,
  Package,
  FlaskConical,
  X,
  Loader,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { useOnboardingV2Store, type SkillConfigs, PERSONAL_EMAIL_DOMAINS } from '@/lib/stores/onboardingV2Store';
import { useActiveOrgId } from '@/lib/stores/orgStore';

type SimulationStep = 'idle' | 'website_input' | 'qa_flow' | 'loading' | 'result' | 'skills' | 'complete';
type EmailType = 'corporate' | 'personal';
type SkillId = 'lead_qualification' | 'lead_enrichment' | 'brand_voice' | 'objection_handling' | 'icp';
type SkillStatus = 'pending' | 'configured' | 'skipped';

// Skill definitions
const SKILLS = [
  {
    id: 'lead_qualification' as SkillId,
    name: 'Qualification',
    icon: Target,
    question: 'How do you decide if a lead is worth pursuing?',
  },
  {
    id: 'lead_enrichment' as SkillId,
    name: 'Discovery',
    icon: Database,
    question: 'What do you need to know about prospects?',
  },
  {
    id: 'brand_voice' as SkillId,
    name: 'Writing Style',
    icon: MessageSquare,
    question: 'How should your AI communicate?',
  },
  {
    id: 'objection_handling' as SkillId,
    name: 'Objection Playbook',
    icon: GitBranch,
    question: 'What pushback do you hear most often?',
  },
  {
    id: 'icp' as SkillId,
    name: 'Perfect Customer',
    icon: UserCheck,
    question: 'What does your dream customer look like?',
  },
];

// Mock enrichment data generator based on domain
const generateMockEnrichment = (domain: string) => {
  const companyName = domain.replace(/\.(com|io|co|net|org)$/, '').split('.').pop()?.replace(/-/g, ' ').split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ') || 'Company';

  return {
    company_name: companyName,
    domain,
    industry: 'B2B SaaS / Enterprise Software',
    company_size: '50-200 employees',
    products: [`${companyName} Platform`, 'Sales Automation', 'Analytics Dashboard'],
    competitors: ['Salesforce', 'HubSpot', 'Pipedrive'],
    target_market: 'Enterprise sales teams',
    // Include generated skills so mock mode provides realistic config
    generated_skills: generateMockSkillData(companyName, domain),
  };
};

// Generate skill data based on company context
const generateMockSkillData = (companyName: string, domain: string): Record<SkillId, Record<string, unknown>> => ({
  lead_qualification: {
    criteria: [
      `Budget authority confirmed or path to budget identified`,
      `Timeline for ${companyName} implementation under 90 days`,
      'Technical requirements align with our platform capabilities',
      'Minimum team size of 5+ users',
    ],
    disqualifiers: [
      'No executive sponsor identified',
      'Currently in contract with competitor (6+ months remaining)',
      'Company size under 20 employees',
    ],
  },
  lead_enrichment: {
    questions: [
      "What's their current tech stack and integration requirements?",
      `Who owns the budget for ${companyName.toLowerCase()} solutions?`,
      "What's driving their evaluation timing—any specific pain points?",
      "What does their decision-making process look like?",
    ],
  },
  brand_voice: {
    tone: `Professional but conversational. Tech-savvy without being jargony. Confident but not pushy. Represents ${companyName}'s values.`,
    avoid: ['Synergy', 'Leverage', 'Circle back', 'Low-hanging fruit', 'Move the needle', 'Touch base'],
  },
  objection_handling: {
    objections: [
      { trigger: 'Too expensive', response: 'Focus on ROI and time saved. Reference case studies showing 3x return within 6 months.' },
      { trigger: 'We already have a solution', response: 'Acknowledge their investment. Highlight specific differentiators and integration capabilities.' },
      { trigger: 'Not the right time', response: 'Understand their timeline. Offer low-commitment pilot or educational content to stay top of mind.' },
      { trigger: 'Need to talk to my team', response: 'Offer to schedule a follow-up call that includes key stakeholders. Provide materials they can share.' },
    ],
  },
  icp: {
    companyProfile: `B2B companies with 50-500 employees, growth-stage, with dedicated teams looking for ${companyName} solutions.`,
    buyerPersona: 'VP or Director level leader, 5+ years experience, measured on team productivity and results.',
    buyingSignals: ['Hiring for growth', 'Evaluating solutions on G2', 'Active in industry communities'],
  },
});

const DEFAULT_DOMAIN = 'acme.com';
// Dedicated test org ID for simulator - ensures consistent testing
// This org is created in the database via SQL script and is always available
const SIMULATOR_TEST_ORG_ID = '00000000-0000-0000-0000-000000000001';

// Test output generators for each skill type
const generateTestOutput = (
  skillId: SkillId,
  skillData: Record<string, unknown>,
  enrichmentData: { company_name: string; industry: string }
): { scenario: string; output: string } => {
  switch (skillId) {
    case 'lead_qualification': {
      const criteria = skillData.criteria as string[];
      const disqualifiers = skillData.disqualifiers as string[];
      const sampleLead = `Tech Corp, a 75-person software company, recently raised Series A funding. They're evaluating solutions in your space.`;
      const matchedCriteria = criteria.slice(0, 2);
      return {
        scenario: `Sample Lead: ${sampleLead}`,
        output: `✅ **Qualified Lead**\n\n**Matching Signals:**\n${matchedCriteria.map(c => `• ${c}`).join('\n')}\n\n**No Disqualifiers Found**\n\n*Recommendation: Proceed to discovery call.*`,
      };
    }
    case 'lead_enrichment': {
      const questions = skillData.questions as string[];
      return {
        scenario: `Discovery call scheduled with prospect from tech industry.`,
        output: `**Priority Discovery Questions:**\n\n${questions.slice(0, 3).map((q, i) => `${i + 1}. ${q}`).join('\n\n')}\n\n*Ask follow-up questions based on responses.*`,
      };
    }
    case 'brand_voice': {
      const tone = skillData.tone as string;
      const avoid = skillData.avoid as string[];
      return {
        scenario: `Draft a follow-up email after initial call.`,
        output: `**Generated Email:**\n\n"Hi [Name],\n\nThanks for taking the time to chat today. I really enjoyed learning about your team's goals for Q2.\n\nAs promised, I'm sending over some resources that might help with the challenges you mentioned around ${enrichmentData.industry.toLowerCase()} workflows.\n\nWould next Tuesday at 2pm work for a deeper dive?\n\nBest,\n[Your name]"\n\n**Voice applied:** ${tone}\n\n**Avoided:** ${avoid.join(', ')}`,
      };
    }
    case 'objection_handling': {
      const objections = skillData.objections as Array<{ trigger: string; response: string }>;
      const firstObjection = objections[0];
      if (!firstObjection) return { scenario: '', output: 'No objections configured.' };
      return {
        scenario: `Prospect says: "${firstObjection.trigger}"`,
        output: `**Suggested Response:**\n\n"${firstObjection.response}"\n\n**Tone:** Acknowledge concern → Reframe value → Ask question`,
      };
    }
    case 'icp': {
      const companyProfile = skillData.companyProfile as string;
      const buyerPersona = skillData.buyerPersona as string;
      const signals = skillData.buyingSignals as string[];
      return {
        scenario: `Evaluating: Acme Solutions (SaaS, 120 employees, VP of Sales lead)`,
        output: `**ICP Match Score: 87%**\n\n**Company Fit:**\n${companyProfile?.slice(0, 100)}...\n\n**Buyer Fit:**\n${buyerPersona?.slice(0, 100)}...\n\n**Detected Signals:**\n${signals?.slice(0, 2).map(s => `• ${s}`).join('\n')}`,
      };
    }
    default:
      return { scenario: '', output: 'Test output not available.' };
  }
};

// Q&A questions for manual enrichment flow
interface QAQuestion {
  id: string;
  question: string;
  placeholder: string;
  icon: React.ComponentType<{ className?: string }>;
  multiline?: boolean;
}

const QA_QUESTIONS: QAQuestion[] = [
  { id: 'company_name', question: "What's your company or product called?", placeholder: 'e.g., Acme Software', icon: Building2 },
  { id: 'company_description', question: 'In a sentence or two, what does your company do?', placeholder: 'e.g., We help sales teams automate their outreach', icon: Sparkles, multiline: true },
  { id: 'industry', question: 'What industry are you in?', placeholder: 'e.g., B2B SaaS, Healthcare, E-commerce', icon: Building2 },
  { id: 'target_customers', question: 'Who are your ideal customers?', placeholder: 'e.g., Mid-market companies with 50-500 employees', icon: Target, multiline: true },
  { id: 'main_products', question: 'What are your main products or services?', placeholder: 'e.g., CRM software, Sales automation', icon: Package, multiline: true },
  { id: 'competitors', question: 'Who do you compete with?', placeholder: 'e.g., Salesforce, HubSpot, Pipedrive', icon: Users },
];

interface QAAnswers {
  company_name: string;
  company_description: string;
  industry: string;
  target_customers: string;
  main_products: string;
  competitors: string;
}

const loadingTasks = [
  { label: 'Scanning website', threshold: 20 },
  { label: 'Identifying industry', threshold: 40 },
  { label: 'Analyzing products', threshold: 60 },
  { label: 'Finding competitors', threshold: 80 },
  { label: 'Building profile', threshold: 100 },
];

interface OnboardingFlowSimulatorV2Props {
  /** Force Real API Mode on (used for V3 Agent Teams simulator) */
  forceRealApiMode?: boolean;
  /** Version label for display (V2 or V3) */
  versionLabel?: 'V2' | 'V3';
}

export function OnboardingFlowSimulatorV2({
  forceRealApiMode = false,
  versionLabel = 'V2'
}: OnboardingFlowSimulatorV2Props = {}) {
  // Get user's actual org ID for Real API mode
  const activeOrgId = useActiveOrgId();

  // Local state
  const [currentStep, setCurrentStep] = useState<SimulationStep>('idle');
  const [domain, setDomain] = useState(DEFAULT_DOMAIN);
  const [loadingProgress, setLoadingProgress] = useState(0);
  const [currentSkillIndex, setCurrentSkillIndex] = useState(0);
  const [skillStatuses, setSkillStatuses] = useState<Record<SkillId, SkillStatus>>(() =>
    Object.fromEntries(SKILLS.map((s) => [s.id, 'pending'])) as Record<SkillId, SkillStatus>
  );
  const [skillData, setSkillData] = useState<Record<SkillId, Record<string, unknown>>>(() =>
    generateMockSkillData('Acme', DEFAULT_DOMAIN)
  );
  const [enrichmentData, setEnrichmentData] = useState(() => generateMockEnrichment(DEFAULT_DOMAIN));
  const [useRealApi, setUseRealApi] = useState(forceRealApiMode);
  const [editingField, setEditingField] = useState<string | null>(null);
  const [usedFallback, setUsedFallback] = useState(false);

  // Email type simulation state
  const [emailType, setEmailType] = useState<EmailType>('corporate');
  const [simulatedEmail, setSimulatedEmail] = useState('user@acme.com');
  const [websiteInput, setWebsiteInput] = useState('');

  // Q&A flow state
  const [qaIndex, setQaIndex] = useState(0);
  const [qaAnswers, setQaAnswers] = useState<QAAnswers>({
    company_name: '',
    company_description: '',
    industry: '',
    target_customers: '',
    main_products: '',
    competitors: '',
  });
  const [enrichmentSource, setEnrichmentSource] = useState<'website' | 'manual' | null>(null);

  // Test output state
  const [showTestOutput, setShowTestOutput] = useState(false);
  const [testOutput, setTestOutput] = useState<{ scenario: string; output: string } | null>(null);

  // Ref for scrollable skill content area
  const skillContentRef = useRef<HTMLDivElement>(null);

  // Store for real API calls
  const {
    startEnrichment,
    enrichment: storeEnrichment,
    isEnrichmentLoading,
    enrichmentError,
    reset: resetStore,
    setOrganizationId,
  } = useOnboardingV2Store();

  const activeSkill = SKILLS[currentSkillIndex];
  const activeConfig = skillData[activeSkill?.id];

  // Start simulation based on email type
  const startSimulation = async () => {
    if (emailType === 'personal') {
      // Personal email: go to website input step
      setCurrentStep('website_input');
    } else {
      // Corporate email: extract domain and go to loading
      const emailDomain = simulatedEmail.split('@')[1] || domain;
      setDomain(emailDomain);
      setEnrichmentSource('website');
      if (useRealApi) {
        const orgId = activeOrgId || SIMULATOR_TEST_ORG_ID;
        // Reset store to clear any previous enrichment data
        resetStore();
        // CRITICAL: Set organizationId in store before startEnrichment
        // Otherwise pollEnrichmentStatus will stop immediately (checks state.organizationId)
        setOrganizationId(orgId);
        setCurrentStep('loading');
        // Always force re-enrichment in simulator (it's a testing tool)
        await startEnrichment(orgId, emailDomain, true);
      } else {
        const mockData = generateMockEnrichment(emailDomain);
        setEnrichmentData(mockData);
        setSkillData(mockData.generated_skills as Record<SkillId, Record<string, unknown>>);
        setCurrentStep('loading');
      }
    }
  };

  // Handle website submission (personal email path)
  const handleWebsiteSubmit = async () => {
    if (!websiteInput.trim()) return;
    const cleanDomain = websiteInput.toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0];
    setDomain(cleanDomain);
    setEnrichmentSource('website');
    if (useRealApi) {
      const orgId = activeOrgId || SIMULATOR_TEST_ORG_ID;
      // Reset store to clear any previous enrichment data
      resetStore();
      // CRITICAL: Set organizationId in store before startEnrichment
      // Otherwise pollEnrichmentStatus will stop immediately (checks state.organizationId)
      setOrganizationId(orgId);
      setCurrentStep('loading');
      // Always force re-enrichment in simulator (it's a testing tool)
      await startEnrichment(orgId, cleanDomain, true);
    } else {
      const mockData = generateMockEnrichment(cleanDomain);
      setEnrichmentData(mockData);
      setSkillData(mockData.generated_skills as Record<SkillId, Record<string, unknown>>);
      setCurrentStep('loading');
    }
  };

  // Handle "I don't have a website" option
  const handleNoWebsite = () => {
    setCurrentStep('qa_flow');
    setQaIndex(0);
  };

  // Handle Q&A navigation
  const handleQANext = () => {
    if (qaIndex < QA_QUESTIONS.length - 1) {
      setQaIndex(qaIndex + 1);
    } else {
      // Complete Q&A, generate enrichment from answers
      setEnrichmentSource('manual');
      const mockData = generateMockEnrichmentFromQA(qaAnswers);
      setEnrichmentData(mockData);
      setSkillData(mockData.generated_skills as Record<SkillId, Record<string, unknown>>);
      setCurrentStep('loading');
    }
  };

  const handleQABack = () => {
    if (qaIndex > 0) {
      setQaIndex(qaIndex - 1);
    } else {
      setCurrentStep('website_input');
    }
  };

  // Generate mock enrichment from Q&A answers
  const generateMockEnrichmentFromQA = (answers: QAAnswers) => {
    const companyName = answers.company_name || 'Your Company';
    return {
      company_name: companyName,
      domain: companyName.toLowerCase().replace(/\s+/g, '-'),
      industry: answers.industry || 'Business Services',
      company_size: 'Unknown',
      products: answers.main_products ? answers.main_products.split(',').map(p => p.trim()) : [],
      competitors: answers.competitors ? answers.competitors.split(',').map(c => c.trim()) : [],
      target_market: answers.target_customers || 'General market',
      generated_skills: generateMockSkillData(companyName, companyName.toLowerCase().replace(/\s+/g, '-')),
    };
  };

  // Sync store enrichment to local state when using real API
  useEffect(() => {
    if (useRealApi && storeEnrichment?.status === 'completed') {
      setEnrichmentData({
        company_name: storeEnrichment.company_name || domain,
        domain: storeEnrichment.domain || domain,
        industry: storeEnrichment.industry || 'Unknown',
        company_size: storeEnrichment.employee_count || 'Unknown',
        products: storeEnrichment.products?.map(p => p.name) || [],
        competitors: storeEnrichment.competitors?.map(c => c.name) || [],
        target_market: storeEnrichment.target_market || 'Unknown',
        generated_skills: storeEnrichment.generated_skills,
      });
      if (storeEnrichment.generated_skills) {
        setSkillData(storeEnrichment.generated_skills as unknown as Record<SkillId, Record<string, unknown>>);
      }
      setLoadingProgress(100);
      setTimeout(() => setCurrentStep('result'), 500);
    }
  }, [useRealApi, storeEnrichment, domain]);

  // Handle enrichment error - fall back to mock data
  useEffect(() => {
    if (useRealApi && enrichmentError) {
      // Fall back to mock data when real API fails
      console.warn('Real API failed, falling back to mock data:', enrichmentError);
      const mockData = generateMockEnrichment(domain);
      setEnrichmentData(mockData);
      setSkillData(mockData.generated_skills as Record<SkillId, Record<string, unknown>>);
      setLoadingProgress(100);
      setUsedFallback(true);
      setTimeout(() => setCurrentStep('result'), 500);
    }
  }, [useRealApi, enrichmentError, domain]);

  // Sync forceRealApiMode prop to useRealApi state (for when user switches tabs)
  useEffect(() => {
    if (forceRealApiMode && !useRealApi) {
      setUseRealApi(true);
    }
  }, [forceRealApiMode, useRealApi]);

  const resetFormState = () => {
    setDomain(DEFAULT_DOMAIN);
    setLoadingProgress(0);
    setCurrentSkillIndex(0);
    setSkillStatuses(Object.fromEntries(SKILLS.map((s) => [s.id, 'pending'])) as Record<SkillId, SkillStatus>);
    setSkillData(generateMockSkillData('Acme', DEFAULT_DOMAIN));
    setEnrichmentData(generateMockEnrichment(DEFAULT_DOMAIN));
    setEditingField(null);
    setUsedFallback(false);
    // Reset new state
    setEmailType('corporate');
    setSimulatedEmail('user@acme.com');
    setWebsiteInput('');
    setQaIndex(0);
    setQaAnswers({
      company_name: '',
      company_description: '',
      industry: '',
      target_customers: '',
      main_products: '',
      competitors: '',
    });
    setEnrichmentSource(null);
    // Reset test output state
    setShowTestOutput(false);
    setTestOutput(null);
    resetStore();
  };

  const resetSimulation = () => {
    setCurrentStep('idle');
    resetFormState();
  };

  // Loading progress simulation
  useEffect(() => {
    if (currentStep !== 'loading') return;

    // For real API mode, progress is driven by store status
    if (useRealApi) {
      // Map enrichment status to progress
      const statusProgress: Record<string, number> = {
        pending: 10,
        scraping: 40,
        researching: 60,
        analyzing: 70,
        completed: 100,
        failed: 0,
      };
      const progress = storeEnrichment?.status ? statusProgress[storeEnrichment.status] || 0 : 10;
      setLoadingProgress(progress);
      return;
    }

    // Mock mode: simulate progress
    const interval = setInterval(() => {
      setLoadingProgress((prev) => {
        if (prev >= 100) {
          clearInterval(interval);
          setTimeout(() => setCurrentStep('result'), 500);
          return 100;
        }
        return prev + 3;
      });
    }, 50);

    return () => clearInterval(interval);
  }, [currentStep, useRealApi, storeEnrichment?.status]);

  // Navigate to skills config when continuing from result
  const handleResultContinue = () => {
    setCurrentStep('skills');
  };

  const updateSkillData = (skillId: SkillId, updates: Record<string, unknown>) => {
    setSkillData((prev) => ({
      ...prev,
      [skillId]: { ...prev[skillId], ...updates },
    }));
  };

  // Handle test output generation
  const handleTestOutput = () => {
    const output = generateTestOutput(activeSkill.id, activeConfig, {
      company_name: enrichmentData.company_name,
      industry: enrichmentData.industry,
    });
    setTestOutput(output);
    setShowTestOutput(true);
  };

  // Reset test output and scroll to top when changing skills
  useEffect(() => {
    setShowTestOutput(false);
    setTestOutput(null);
    // Scroll content area to top
    if (skillContentRef.current) {
      skillContentRef.current.scrollTop = 0;
    }
  }, [currentSkillIndex]);

  const handleSaveSkill = useCallback(() => {
    setSkillStatuses((prev) => ({ ...prev, [activeSkill.id]: 'configured' }));
    if (currentSkillIndex < SKILLS.length - 1) {
      setCurrentSkillIndex(currentSkillIndex + 1);
    } else {
      setCurrentStep('complete');
    }
  }, [activeSkill?.id, currentSkillIndex]);

  const handleSkipSkill = useCallback(() => {
    setSkillStatuses((prev) => ({ ...prev, [activeSkill.id]: 'skipped' }));
    if (currentSkillIndex < SKILLS.length - 1) {
      setCurrentSkillIndex(currentSkillIndex + 1);
    } else {
      setCurrentStep('complete');
    }
  }, [activeSkill?.id, currentSkillIndex]);

  const getSkillStatus = (skillId: SkillId): SkillStatus => skillStatuses[skillId] || 'pending';

  const configuredSkillIds = SKILLS.filter((s) => skillStatuses[s.id] === 'configured').map((s) => s.id);

  // Idle state
  if (currentStep === 'idle') {
    return (
      <Card className="border-dashed">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Play className="w-5 h-5 text-violet-500" />
            {versionLabel === 'V3' ? 'Agent Teams Onboarding V3' : 'Skills-Based Onboarding V2'}
          </CardTitle>
          <CardDescription>
            {versionLabel === 'V3'
              ? 'Experience enhanced enrichment with parallel AI agents for 89% data completeness'
              : 'Experience the AI-powered skills configuration onboarding flow with all 3 paths'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8">
            <div className="w-20 h-20 rounded-full bg-gradient-to-br from-violet-500/20 to-violet-600/20 flex items-center justify-center mx-auto mb-6">
              <Sparkles className="w-10 h-10 text-violet-500" />
            </div>
            <h3 className="text-lg font-semibold mb-2">
              {versionLabel === 'V3' ? 'Start V3 Simulation' : 'Start V2 Simulation'}
            </h3>
            <p className="text-sm text-muted-foreground mb-4 max-w-md mx-auto">
              {versionLabel === 'V3'
                ? 'Test the enhanced enrichment with parallel AI agents. Corporate emails go directly to deep enrichment with multi-source research.'
                : 'Test how the onboarding flow adapts based on email type. Corporate emails go directly to enrichment. Personal emails require additional steps.'}
            </p>

            {/* Email Type Selector */}
            <div className="max-w-sm mx-auto mb-6 p-4 rounded-lg border bg-muted/30">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground mb-3">
                Simulate Sign-up Email Type
              </p>
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => {
                    setEmailType('corporate');
                    setSimulatedEmail('user@acme.com');
                    setDomain('acme.com');
                  }}
                  className={`flex flex-col items-center gap-1 p-3 rounded-lg border-2 transition-all ${
                    emailType === 'corporate'
                      ? 'border-violet-500 bg-violet-500/10'
                      : 'border-transparent hover:border-gray-300'
                  }`}
                >
                  <Building2 className={`w-5 h-5 ${emailType === 'corporate' ? 'text-violet-500' : 'text-muted-foreground'}`} />
                  <span className="text-sm font-medium">Corporate</span>
                  <span className="text-xs text-muted-foreground">user@company.com</span>
                </button>
                <button
                  onClick={() => {
                    setEmailType('personal');
                    setSimulatedEmail('user@gmail.com');
                  }}
                  className={`flex flex-col items-center gap-1 p-3 rounded-lg border-2 transition-all ${
                    emailType === 'personal'
                      ? 'border-violet-500 bg-violet-500/10'
                      : 'border-transparent hover:border-gray-300'
                  }`}
                >
                  <Mail className={`w-5 h-5 ${emailType === 'personal' ? 'text-violet-500' : 'text-muted-foreground'}`} />
                  <span className="text-sm font-medium">Personal</span>
                  <span className="text-xs text-muted-foreground">user@gmail.com</span>
                </button>
              </div>
            </div>

            {/* Domain Input (only for corporate) */}
            {emailType === 'corporate' && (
              <div className="max-w-sm mx-auto mb-6">
                <div className="relative">
                  <Globe className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                  <input
                    type="text"
                    value={domain}
                    onChange={(e) => {
                      const cleanDomain = e.target.value.toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0];
                      setDomain(cleanDomain);
                      // Also update simulated email to match the domain
                      setSimulatedEmail(`user@${cleanDomain}`);
                    }}
                    placeholder="company.com"
                    className="w-full pl-10 pr-4 py-3 rounded-lg border bg-background text-foreground placeholder:text-muted-foreground focus:ring-2 focus:ring-violet-500 focus:border-violet-500"
                  />
                </div>
                <p className="text-xs text-muted-foreground mt-2">
                  Domain extracted from corporate email for automatic enrichment
                </p>
              </div>
            )}

            {/* Personal email info */}
            {emailType === 'personal' && (
              <div className="max-w-sm mx-auto mb-6 p-3 rounded-lg bg-amber-500/10 border border-amber-500/20">
                <p className="text-xs text-amber-500 flex items-start gap-1.5">
                  <span className="mt-0.5">ℹ️</span>
                  <span>
                    Personal emails (gmail.com, etc.) can't be enriched automatically.
                    You'll be asked for a website or to answer some questions.
                  </span>
                </p>
              </div>
            )}

            {/* API Mode Toggle */}
            <div className="max-w-sm mx-auto mb-6 p-4 rounded-lg border bg-muted/30">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Zap className={`w-4 h-4 ${useRealApi ? 'text-amber-500' : 'text-muted-foreground'}`} />
                  <span className="text-sm font-medium">
                    {useRealApi ? 'Real API Mode' : 'Mock Mode'}
                  </span>
                  {forceRealApiMode && (
                    <Badge className="text-xs bg-blue-500/10 text-blue-500 border-blue-500/20">
                      Required for V3
                    </Badge>
                  )}
                </div>
                <Switch
                  checked={useRealApi}
                  onCheckedChange={setUseRealApi}
                  disabled={forceRealApiMode}
                />
              </div>
              <p className="text-xs text-muted-foreground mt-2 text-left">
                {forceRealApiMode
                  ? 'V3 Agent Teams requires real API calls to test enhanced enrichment with 89% data completeness.'
                  : useRealApi
                  ? 'Calls the actual AI enrichment API. Takes ~30 seconds but shows real data.'
                  : 'Uses mock data for instant preview. Great for testing the UI flow.'}
              </p>
            </div>

            {/* Error display */}
            {enrichmentError && (
              <div className="max-w-sm mx-auto mb-4 p-3 rounded-lg bg-red-500/10 border border-red-500/20">
                <p className="text-sm text-red-500">{enrichmentError}</p>
              </div>
            )}

            <Button
              onClick={startSimulation}
              className="bg-violet-600 hover:bg-violet-700"
              disabled={(emailType === 'corporate' && (!domain || domain.length < 3)) || isEnrichmentLoading}
            >
              {isEnrichmentLoading ? (
                <>
                  <div className="w-4 h-4 mr-2 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Analyzing...
                </>
              ) : (
                <>
                  <Play className="w-4 h-4 mr-2" />
                  Start Walkthrough
                </>
              )}
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  // Active simulation
  return (
    <Card>
      <CardHeader className="pb-4">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-lg">V2 Skills Onboarding Simulation</CardTitle>
            <CardDescription>
              {currentStep === 'loading' && 'Step 1 - AI analyzing your company'}
              {currentStep === 'result' && 'Step 2 - Review discovered information'}
              {currentStep === 'skills' && `Step 3 - ${activeSkill?.question || 'Configure skills'}`}
              {currentStep === 'complete' && 'Complete!'}
            </CardDescription>
          </div>
          <Button variant="outline" size="sm" onClick={resetSimulation} className="flex items-center gap-2">
            <RotateCcw className="w-4 h-4" />
            Reset
          </Button>
        </div>
      </CardHeader>

      <CardContent>
        <div className="bg-gray-950 rounded-xl p-6 min-h-[500px] relative overflow-hidden">
          <AnimatePresence mode="wait">
            {/* Website Input Step (Personal Email Path) */}
            {currentStep === 'website_input' && (
              <motion.div
                key="website_input"
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="w-full max-w-lg mx-auto px-4"
              >
                <div className="rounded-2xl border border-gray-800 bg-gray-900 p-8 sm:p-10">
                  <div className="flex justify-center mb-6">
                    <div className="w-20 h-20 rounded-full bg-gradient-to-br from-violet-500/20 to-violet-600/20 flex items-center justify-center">
                      <Globe className="w-10 h-10 text-violet-400" />
                    </div>
                  </div>

                  <div className="text-center mb-8">
                    <h2 className="text-2xl font-bold text-white mb-3">
                      What's your company website?
                    </h2>
                    <p className="text-gray-400">
                      We'll use this to learn about your business and customize your AI assistant.
                    </p>
                  </div>

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
                          onChange={(e) => setWebsiteInput(e.target.value)}
                          onKeyDown={(e) => e.key === 'Enter' && handleWebsiteSubmit()}
                          placeholder="acme.com"
                          className="w-full pl-12 pr-4 py-4 rounded-xl border border-gray-700 bg-gray-800 text-white placeholder:text-gray-500 focus:ring-2 focus:ring-violet-500 focus:border-violet-500 transition-all"
                          autoFocus
                        />
                      </div>
                    </div>

                    <Button
                      onClick={handleWebsiteSubmit}
                      disabled={!websiteInput.trim()}
                      className="w-full bg-violet-600 hover:bg-violet-700 text-white py-4 text-base"
                    >
                      Continue
                      <ChevronRight className="w-5 h-5 ml-2" />
                    </Button>
                  </div>

                  <div className="relative mb-6">
                    <div className="absolute inset-0 flex items-center">
                      <div className="w-full border-t border-gray-800" />
                    </div>
                    <div className="relative flex justify-center text-sm">
                      <span className="px-4 bg-gray-900 text-gray-500">or</span>
                    </div>
                  </div>

                  <button
                    onClick={handleNoWebsite}
                    className="w-full flex items-center justify-center gap-2 py-4 px-6 rounded-xl border border-gray-700 text-gray-400 hover:text-white hover:border-gray-600 hover:bg-gray-800/50 transition-all"
                  >
                    <HelpCircle className="w-5 h-5" />
                    <span>I don't have a website yet</span>
                  </button>

                  <p className="text-center text-xs text-gray-500 mt-4">
                    No worries! We'll ask a few quick questions to understand your business instead.
                  </p>
                </div>
              </motion.div>
            )}

            {/* Q&A Flow Step (No Website Path) */}
            {currentStep === 'qa_flow' && (
              <motion.div
                key="qa_flow"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="w-full max-w-lg mx-auto px-4"
              >
                <div className="rounded-2xl shadow-xl border border-gray-800 bg-gray-900 overflow-hidden">
                  {/* Progress Bar */}
                  <div className="h-1 bg-gray-800">
                    <motion.div
                      className="h-full bg-gradient-to-r from-violet-500 to-violet-600"
                      initial={{ width: 0 }}
                      animate={{ width: `${((qaIndex + 1) / QA_QUESTIONS.length) * 100}%` }}
                      transition={{ duration: 0.3 }}
                    />
                  </div>

                  <div className="p-8 sm:p-10">
                    {/* Question Counter */}
                    <div className="flex items-center justify-between mb-6">
                      <span className="text-sm text-gray-500">
                        Question {qaIndex + 1} of {QA_QUESTIONS.length}
                      </span>
                      <div className="flex gap-1">
                        {QA_QUESTIONS.map((_, i) => (
                          <div
                            key={i}
                            className={`w-2 h-2 rounded-full transition-colors ${
                              i <= qaIndex ? 'bg-violet-500' : 'bg-gray-700'
                            }`}
                          />
                        ))}
                      </div>
                    </div>

                    {/* Question Content */}
                    <AnimatePresence mode="wait">
                      <motion.div
                        key={qaIndex}
                        initial={{ opacity: 0, x: 20 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: -20 }}
                        transition={{ duration: 0.2 }}
                      >
                        {/* Icon */}
                        <div className="flex justify-center mb-6">
                          <div className="w-16 h-16 rounded-full bg-violet-500/20 flex items-center justify-center">
                            {(() => {
                              const Icon = QA_QUESTIONS[qaIndex].icon;
                              return <Icon className="w-8 h-8 text-violet-400" />;
                            })()}
                          </div>
                        </div>

                        {/* Question */}
                        <h2 className="text-xl font-bold text-white text-center mb-6">
                          {QA_QUESTIONS[qaIndex].question}
                        </h2>

                        {/* Input */}
                        <div className="mt-6">
                          {QA_QUESTIONS[qaIndex].multiline ? (
                            <textarea
                              value={qaAnswers[QA_QUESTIONS[qaIndex].id as keyof QAAnswers] || ''}
                              onChange={(e) => setQaAnswers({ ...qaAnswers, [QA_QUESTIONS[qaIndex].id]: e.target.value })}
                              placeholder={QA_QUESTIONS[qaIndex].placeholder}
                              rows={3}
                              className="w-full px-4 py-4 rounded-xl border border-gray-700 bg-gray-800 text-white placeholder:text-gray-500 focus:ring-2 focus:ring-violet-500 focus:border-violet-500 transition-all resize-none"
                              autoFocus
                            />
                          ) : (
                            <input
                              type="text"
                              value={qaAnswers[QA_QUESTIONS[qaIndex].id as keyof QAAnswers] || ''}
                              onChange={(e) => setQaAnswers({ ...qaAnswers, [QA_QUESTIONS[qaIndex].id]: e.target.value })}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter' && !QA_QUESTIONS[qaIndex].multiline) {
                                  handleQANext();
                                }
                              }}
                              placeholder={QA_QUESTIONS[qaIndex].placeholder}
                              className="w-full px-4 py-4 rounded-xl border border-gray-700 bg-gray-800 text-white placeholder:text-gray-500 focus:ring-2 focus:ring-violet-500 focus:border-violet-500 transition-all"
                              autoFocus
                            />
                          )}
                        </div>
                      </motion.div>
                    </AnimatePresence>

                    {/* Navigation */}
                    <div className="flex items-center justify-between mt-8">
                      <Button
                        onClick={handleQABack}
                        variant="ghost"
                        className="text-gray-400 hover:text-white"
                      >
                        <ChevronLeft className="w-4 h-4 mr-1" />
                        Back
                      </Button>

                      <Button
                        onClick={handleQANext}
                        className="bg-violet-600 hover:bg-violet-700 text-white"
                      >
                        {qaIndex === QA_QUESTIONS.length - 1 ? (
                          <>
                            <Check className="w-4 h-4 mr-2" />
                            Complete
                          </>
                        ) : (
                          <>
                            Next
                            <ChevronRight className="w-4 h-4 ml-1" />
                          </>
                        )}
                      </Button>
                    </div>
                  </div>

                  {/* Summary of Previous Answers */}
                  {qaIndex > 0 && (
                    <div className="px-8 pb-6">
                      <div className="border-t border-gray-800 pt-4">
                        <p className="text-xs font-medium text-gray-500 mb-2">YOUR ANSWERS</p>
                        <div className="flex flex-wrap gap-2">
                          {QA_QUESTIONS.slice(0, qaIndex).map((q) => {
                            const answer = qaAnswers[q.id as keyof QAAnswers];
                            if (!answer) return null;
                            return (
                              <span
                                key={q.id}
                                className="px-2 py-1 text-xs rounded-lg bg-gray-800 text-gray-400 truncate max-w-[150px]"
                                title={answer}
                              >
                                {answer.slice(0, 20)}{answer.length > 20 ? '...' : ''}
                              </span>
                            );
                          })}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </motion.div>
            )}

            {/* Loading Step */}
            {currentStep === 'loading' && (
              <motion.div
                key="loading"
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="w-full max-w-md mx-auto px-4"
              >
                <div className="rounded-2xl border border-gray-800 bg-gray-900 p-8 sm:p-12 text-center">
                  <div className="relative w-24 h-24 mx-auto mb-8">
                    <svg className="w-24 h-24 transform -rotate-90">
                      <circle cx="48" cy="48" r="44" stroke="#374151" strokeWidth="6" fill="none" />
                      <circle
                        cx="48"
                        cy="48"
                        r="44"
                        stroke="url(#gradient-v2)"
                        strokeWidth="6"
                        fill="none"
                        strokeLinecap="round"
                        strokeDasharray={`${(loadingProgress / 100) * 276.46} 276.46`}
                      />
                      <defs>
                        <linearGradient id="gradient-v2" x1="0%" y1="0%" x2="100%" y2="0%">
                          <stop offset="0%" stopColor="#3b82f6" />
                          <stop offset="100%" stopColor="#8b5cf6" />
                        </linearGradient>
                      </defs>
                    </svg>
                    <div className="absolute inset-0 flex items-center justify-center">
                      <span className="text-2xl font-bold text-white">{loadingProgress}%</span>
                    </div>
                  </div>

                  <h2 className="text-xl font-bold mb-2 text-white">Analyzing {domain}</h2>
                  <p className="text-gray-400 mb-8">
                    Learning about your business to customize your assistant...
                  </p>

                  <div className="space-y-2.5 text-left">
                    {loadingTasks.map((task, i) => {
                      const isDone = loadingProgress > task.threshold - 20;
                      // Current task is the first incomplete one
                      const isCurrentTask = !isDone && (i === 0 || loadingTasks[i - 1] && loadingProgress > loadingTasks[i - 1].threshold - 20);
                      return (
                        <motion.div
                          key={i}
                          className={`flex items-center gap-3 py-2 px-3 rounded-lg transition-all ${
                            isDone
                              ? 'bg-emerald-900/30 text-emerald-400'
                              : isCurrentTask
                              ? 'bg-violet-900/20 text-violet-300'
                              : 'text-gray-500'
                          }`}
                          animate={isCurrentTask ? { backgroundColor: ['rgb(88, 28, 135, 0.2)', 'rgb(109, 40, 217, 0.3)'] } : {}}
                          transition={{ duration: 1.5, repeat: Infinity }}
                        >
                          {isDone ? (
                            <Check className="w-4 h-4" />
                          ) : isCurrentTask ? (
                            <motion.div
                              animate={{ rotate: 360 }}
                              transition={{ duration: 1.5, repeat: Infinity, ease: 'linear' }}
                            >
                              <Loader className="w-4 h-4" />
                            </motion.div>
                          ) : (
                            <div className="w-4 h-4 rounded-full border-2 border-current" />
                          )}
                          <span className="text-sm font-medium">{task.label}</span>
                        </motion.div>
                      );
                    })}
                  </div>

                  {/* Processing indicator when stuck at 90% */}
                  {loadingProgress >= 90 && loadingProgress < 100 && (
                    <motion.div
                      initial={{ opacity: 0, y: -10 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="mt-6 pt-4 border-t border-gray-800/50"
                    >
                      <div className="flex items-center justify-center gap-2">
                        <motion.div
                          animate={{ scale: [1, 1.2, 1] }}
                          transition={{ duration: 1.5, repeat: Infinity }}
                          className="w-2 h-2 bg-violet-400 rounded-full"
                        />
                        <p className="text-xs text-gray-400">
                          Finalizing analysis<motion.span
                            animate={{ opacity: [0.5, 1, 0.5] }}
                            transition={{ duration: 1.5, repeat: Infinity }}
                          >
                            ...
                          </motion.span>
                        </p>
                        <motion.div
                          animate={{ scale: [1, 1.2, 1] }}
                          transition={{ duration: 1.5, repeat: Infinity, delay: 0.3 }}
                          className="w-2 h-2 bg-violet-400 rounded-full"
                        />
                      </div>
                    </motion.div>
                  )}
                </div>
              </motion.div>
            )}

            {/* Result Step */}
            {currentStep === 'result' && (
              <motion.div
                key="result"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                className="w-full max-w-2xl mx-auto px-4"
              >
                <div className="rounded-2xl border border-gray-800 bg-gray-900 overflow-hidden">
                  <div className="bg-violet-600 px-6 py-4">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 bg-white/20 rounded-lg flex items-center justify-center">
                        <Check className="w-4 h-4 text-white" />
                      </div>
                      <div>
                        <h2 className="font-bold text-white">We found {enrichmentData.company_name}</h2>
                        <p className="text-violet-100 text-sm">
                          {usedFallback ? 'Using simulated data (API unavailable)' : "Here's what we learned"}
                        </p>
                      </div>
                    </div>
                  </div>
                  {usedFallback && (
                    <div className="px-6 py-2 bg-amber-500/10 border-b border-amber-500/20">
                      <div className="space-y-1.5">
                        <p className="text-xs text-amber-500 flex items-center gap-1.5">
                          <span>⚠️</span>
                          <span>Enrichment API unavailable. Showing mock data to preview the experience.</span>
                        </p>
                        {enrichmentError && (
                          <p className="text-[11px] text-amber-400/90 font-mono break-words">
                            Error: {enrichmentError}
                          </p>
                        )}
                      </div>
                    </div>
                  )}

                  <div className="p-6">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
                      <div className="space-y-3">
                        <div>
                          <p className="text-xs font-medium uppercase tracking-wide mb-0.5 text-gray-500">Company</p>
                          <p className="font-medium text-white">{enrichmentData.company_name}</p>
                        </div>
                        <div>
                          <p className="text-xs font-medium uppercase tracking-wide mb-0.5 text-gray-500">Industry</p>
                          <p className="font-medium text-sm text-white">{enrichmentData.industry}</p>
                        </div>
                      </div>
                      <div className="space-y-3">
                        <div>
                          <p className="text-xs font-medium uppercase tracking-wide mb-0.5 text-gray-500">Products</p>
                          <div className="flex flex-wrap gap-1">
                            {enrichmentData.products.map((p, i) => (
                              <span key={i} className="px-2 py-0.5 text-xs rounded-md bg-violet-900/50 text-violet-300">{p}</span>
                            ))}
                          </div>
                        </div>
                        <div>
                          <p className="text-xs font-medium uppercase tracking-wide mb-0.5 text-gray-500">Competitors</p>
                          <div className="flex flex-wrap gap-1">
                            {enrichmentData.competitors.map((c, i) => (
                              <span key={i} className="px-2 py-0.5 text-xs rounded-md bg-gray-800 text-gray-300">{c}</span>
                            ))}
                          </div>
                        </div>
                      </div>
                    </div>

                    <Button onClick={handleResultContinue} className="w-full bg-violet-600 hover:bg-violet-700">
                      Configure Skills
                      <ChevronRight className="w-4 h-4 ml-2" />
                    </Button>
                  </div>
                </div>
              </motion.div>
            )}

            {/* Skills Config Step - Show loading screen while waiting for skills */}
            {currentStep === 'skills' && !enrichmentData && (
              <motion.div
                key="skills-loading"
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="w-full max-w-md mx-auto px-4"
              >
                <div className="rounded-2xl shadow-xl border border-gray-800 bg-gray-900 p-8 sm:p-12 text-center">
                  <div className="flex justify-center mb-6">
                    <div className="relative w-16 h-16">
                      <motion.div
                        animate={{ rotate: 360 }}
                        transition={{ duration: 2, repeat: Infinity, ease: 'linear' }}
                        className="absolute inset-0"
                      >
                        <Sparkles className="w-full h-full text-violet-400" />
                      </motion.div>
                      <div className="absolute inset-0 flex items-center justify-center">
                        <motion.div
                          animate={{ scale: [1, 1.2, 1] }}
                          transition={{ duration: 1.5, repeat: Infinity }}
                          className="w-2 h-2 bg-violet-400 rounded-full"
                        />
                      </div>
                    </div>
                  </div>

                  <h2 className="text-xl font-bold text-white mb-2">Building with AI Results</h2>
                  <p className="text-gray-400 mb-6">
                    Generating personalized skill suggestions based on your company...
                  </p>

                  {/* Loading steps */}
                  <div className="space-y-2.5 text-left mb-6">
                    {[
                      'Analyzing enrichment data',
                      'Generating skill suggestions',
                      'Building configuration',
                    ].map((step, i) => (
                      <motion.div
                        key={i}
                        animate={{
                          backgroundColor: ['rgba(88, 28, 135, 0)', 'rgba(88, 28, 135, 0.2)'],
                        }}
                        transition={{ duration: 1.5, repeat: Infinity, delay: i * 0.3 }}
                        className="flex items-center gap-3 py-2 px-3 rounded-lg"
                      >
                        <motion.div
                          animate={{ rotate: 360 }}
                          transition={{ duration: 1.5, repeat: Infinity, ease: 'linear' }}
                          className="flex-shrink-0"
                        >
                          <Loader className="w-4 h-4 text-violet-400" />
                        </motion.div>
                        <span className="text-sm text-gray-300">{step}</span>
                      </motion.div>
                    ))}
                  </div>
                </div>
              </motion.div>
            )}

            {/* Skills Config Step */}
            {currentStep === 'skills' && enrichmentData && (
              <motion.div
                key="skills"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                className="w-full max-w-2xl mx-auto px-4"
              >
                <div className="rounded-2xl border border-gray-800 bg-gray-900 overflow-hidden">
                  {/* Tab Navigation - All 5 tabs visible without scrolling */}
                  <div className="px-2 sm:px-4 pt-4 border-b border-gray-800">
                    <div className="grid grid-cols-5 gap-0.5 sm:gap-1">
                      {SKILLS.map((skill, index) => {
                        const Icon = skill.icon;
                        const status = getSkillStatus(skill.id);
                        const isActive = index === currentSkillIndex;
                        return (
                          <button
                            key={skill.id}
                            onClick={() => setCurrentSkillIndex(index)}
                            className={`flex flex-col sm:flex-row items-center justify-center gap-0.5 sm:gap-1.5 px-1 sm:px-2 py-2 text-xs sm:text-sm font-medium rounded-t-lg transition-all border-b-2 -mb-px ${
                              isActive
                                ? 'bg-gray-800 text-white border-violet-500'
                                : status === 'configured'
                                  ? 'text-green-400 border-transparent hover:bg-gray-800'
                                  : status === 'skipped'
                                    ? 'text-gray-500 border-transparent hover:bg-gray-800'
                                    : 'text-gray-400 border-transparent hover:bg-gray-800'
                            }`}
                          >
                            {status === 'configured' && !isActive ? (
                              <Check className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                            ) : status === 'skipped' && !isActive ? (
                              <Clock className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                            ) : (
                              <Icon className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                            )}
                            <span className="text-[10px] sm:text-xs leading-tight text-center">{skill.name}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Content */}
                  <div className="p-4 sm:p-6">
                    {/* Question-style header */}
                    <div className="mb-6">
                      <div className="flex items-start gap-3 mb-2">
                        <div className="w-8 h-8 rounded-lg bg-violet-500/20 flex items-center justify-center flex-shrink-0">
                          <HelpCircle className="w-4 h-4 text-violet-400" />
                        </div>
                        <div className="flex-1">
                          <h3 className="text-lg font-semibold text-white">{activeSkill.question}</h3>
                          <p className="text-sm text-gray-400 mt-1">
                            <Lightbulb className="w-3.5 h-3.5 inline mr-1 text-amber-400" />
                            AI suggestions based on {enrichmentData.company_name}. Edit or add your own.
                          </p>
                        </div>
                      </div>
                    </div>

                    <div ref={skillContentRef} className="max-h-72 overflow-y-auto pr-1 space-y-4">
                      {/* Lead Qualification - Editable list */}
                      {activeSkill.id === 'lead_qualification' && (
                        <div className="space-y-4">
                          <div>
                            <label className="text-xs font-medium uppercase tracking-wide text-gray-500 mb-3 block">
                              ✓ Signals that qualify a lead
                            </label>
                            <div className="space-y-2">
                              {(activeConfig.criteria as string[])?.map((item, i) => (
                                <div key={i} className="group flex items-start gap-2 p-3 rounded-lg bg-gray-800 hover:bg-gray-750 transition-colors">
                                  <Check className="w-4 h-4 text-emerald-400 mt-0.5 flex-shrink-0" />
                                  <textarea
                                    value={item}
                                    onChange={(e) => updateSkillData('lead_qualification', {
                                      ...activeConfig,
                                      criteria: (activeConfig.criteria as string[]).map((c, idx) => idx === i ? e.target.value : c)
                                    })}
                                    rows={2}
                                    className="flex-1 bg-transparent text-sm text-gray-200 focus:outline-none resize-none"
                                    placeholder="Enter a qualifying signal..."
                                  />
                                  <button
                                    onClick={() => updateSkillData('lead_qualification', {
                                      ...activeConfig,
                                      criteria: (activeConfig.criteria as string[]).filter((_, idx) => idx !== i)
                                    })}
                                    className="opacity-0 group-hover:opacity-100 text-gray-500 hover:text-red-400 transition-all"
                                  >
                                    <Trash2 className="w-4 h-4" />
                                  </button>
                                </div>
                              ))}
                              <button
                                onClick={() => updateSkillData('lead_qualification', {
                                  ...activeConfig,
                                  criteria: [...(activeConfig.criteria as string[]), '']
                                })}
                                className="w-full flex items-center justify-center gap-2 p-3 rounded-lg border border-dashed border-gray-700 text-gray-500 hover:border-violet-500 hover:text-violet-400 transition-colors"
                              >
                                <Plus className="w-4 h-4" />
                                <span className="text-sm">Add criteria</span>
                              </button>
                            </div>
                          </div>
                          <div>
                            <label className="text-xs font-medium uppercase tracking-wide text-gray-500 mb-3 block">
                              ✗ Red flags that disqualify
                            </label>
                            <div className="space-y-2">
                              {(activeConfig.disqualifiers as string[])?.map((item, i) => (
                                <div key={i} className="group flex items-start gap-2 p-3 rounded-lg bg-gray-800 hover:bg-gray-750 transition-colors">
                                  <span className="text-red-400 mt-0.5">✗</span>
                                  <textarea
                                    value={item}
                                    onChange={(e) => updateSkillData('lead_qualification', {
                                      ...activeConfig,
                                      disqualifiers: (activeConfig.disqualifiers as string[]).map((d, idx) => idx === i ? e.target.value : d)
                                    })}
                                    rows={2}
                                    className="flex-1 bg-transparent text-sm text-gray-200 focus:outline-none resize-none"
                                    placeholder="Enter a disqualifying signal..."
                                  />
                                  <button
                                    onClick={() => updateSkillData('lead_qualification', {
                                      ...activeConfig,
                                      disqualifiers: (activeConfig.disqualifiers as string[]).filter((_, idx) => idx !== i)
                                    })}
                                    className="opacity-0 group-hover:opacity-100 text-gray-500 hover:text-red-400 transition-all"
                                  >
                                    <Trash2 className="w-4 h-4" />
                                  </button>
                                </div>
                              ))}
                              <button
                                onClick={() => updateSkillData('lead_qualification', {
                                  ...activeConfig,
                                  disqualifiers: [...(activeConfig.disqualifiers as string[]), '']
                                })}
                                className="w-full flex items-center justify-center gap-2 p-3 rounded-lg border border-dashed border-gray-700 text-gray-500 hover:border-violet-500 hover:text-violet-400 transition-colors"
                              >
                                <Plus className="w-4 h-4" />
                                <span className="text-sm">Add disqualifier</span>
                              </button>
                            </div>
                          </div>
                        </div>
                      )}

                      {/* Lead Enrichment - Discovery questions */}
                      {activeSkill.id === 'lead_enrichment' && (
                        <div className="space-y-2">
                          {(activeConfig.questions as string[])?.map((q, i) => (
                            <div key={i} className="group flex items-start gap-2 p-3 rounded-lg bg-gray-800 hover:bg-gray-750 transition-colors">
                              <Database className="w-4 h-4 text-violet-400 mt-0.5 flex-shrink-0" />
                              <textarea
                                value={q}
                                onChange={(e) => updateSkillData('lead_enrichment', {
                                  ...activeConfig,
                                  questions: (activeConfig.questions as string[]).map((item, idx) => idx === i ? e.target.value : item)
                                })}
                                rows={2}
                                className="flex-1 bg-transparent text-sm text-gray-200 focus:outline-none resize-none"
                                placeholder="Enter a discovery question..."
                              />
                              <button
                                onClick={() => updateSkillData('lead_enrichment', {
                                  ...activeConfig,
                                  questions: (activeConfig.questions as string[]).filter((_, idx) => idx !== i)
                                })}
                                className="opacity-0 group-hover:opacity-100 text-gray-500 hover:text-red-400 transition-all"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>
                          ))}
                          <button
                            onClick={() => updateSkillData('lead_enrichment', {
                              ...activeConfig,
                              questions: [...(activeConfig.questions as string[]), '']
                            })}
                            className="w-full flex items-center justify-center gap-2 p-3 rounded-lg border border-dashed border-gray-700 text-gray-500 hover:border-violet-500 hover:text-violet-400 transition-colors"
                          >
                            <Plus className="w-4 h-4" />
                            <span className="text-sm">Add question</span>
                          </button>
                        </div>
                      )}

                      {/* Brand Voice */}
                      {activeSkill.id === 'brand_voice' && (
                        <div className="space-y-4">
                          <div>
                            <label className="text-xs font-medium uppercase tracking-wide text-gray-500 mb-2 block">
                              Your communication style
                            </label>
                            <textarea
                              value={activeConfig.tone as string}
                              onChange={(e) => updateSkillData('brand_voice', { ...activeConfig, tone: e.target.value })}
                              rows={5}
                              className="w-full p-3 rounded-lg bg-gray-800 text-sm text-gray-200 focus:outline-none focus:ring-2 focus:ring-violet-500 resize-none"
                              placeholder="Describe how you want your AI to communicate..."
                            />
                          </div>
                          <div>
                            <label className="text-xs font-medium uppercase tracking-wide text-gray-500 mb-2 block">
                              Words and phrases to avoid
                            </label>
                            <div className="flex flex-wrap gap-2 mb-2">
                              {(activeConfig.avoid as string[])?.map((word, i) => (
                                <span
                                  key={i}
                                  className="group inline-flex items-center gap-1 px-3 py-1.5 text-sm rounded-full bg-gray-800 text-gray-300 hover:bg-gray-750"
                                >
                                  {word}
                                  <button
                                    onClick={() => updateSkillData('brand_voice', {
                                      ...activeConfig,
                                      avoid: (activeConfig.avoid as string[]).filter((_, idx) => idx !== i)
                                    })}
                                    className="text-gray-500 hover:text-red-400"
                                  >
                                    <Trash2 className="w-3 h-3" />
                                  </button>
                                </span>
                              ))}
                            </div>
                            <div className="flex gap-2">
                              <input
                                type="text"
                                placeholder="Add a word to avoid..."
                                className="flex-1 p-2 rounded-lg bg-gray-800 text-sm text-gray-200 focus:outline-none focus:ring-2 focus:ring-violet-500"
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter' && e.currentTarget.value) {
                                    updateSkillData('brand_voice', {
                                      ...activeConfig,
                                      avoid: [...(activeConfig.avoid as string[]), e.currentTarget.value]
                                    });
                                    e.currentTarget.value = '';
                                  }
                                }}
                              />
                            </div>
                          </div>
                        </div>
                      )}

                      {/* Objection Handling */}
                      {activeSkill.id === 'objection_handling' && (
                        <div className="space-y-3">
                          {(activeConfig.objections as Array<{ trigger: string; response: string }>)?.map((obj, i) => (
                            <div key={i} className="group p-4 rounded-lg bg-gray-800 space-y-3">
                              <div className="flex items-center gap-2">
                                <span className="text-xs font-medium uppercase tracking-wide text-amber-400">When they say:</span>
                                <input
                                  type="text"
                                  value={obj.trigger}
                                  onChange={(e) => {
                                    const newObjections = [...(activeConfig.objections as Array<{ trigger: string; response: string }>)];
                                    newObjections[i] = { ...obj, trigger: e.target.value };
                                    updateSkillData('objection_handling', { ...activeConfig, objections: newObjections });
                                  }}
                                  className="flex-1 bg-transparent text-sm text-white font-medium focus:outline-none"
                                  placeholder="e.g., Too expensive"
                                />
                                <button
                                  onClick={() => updateSkillData('objection_handling', {
                                    ...activeConfig,
                                    objections: (activeConfig.objections as Array<{ trigger: string; response: string }>).filter((_, idx) => idx !== i)
                                  })}
                                  className="opacity-0 group-hover:opacity-100 text-gray-500 hover:text-red-400 transition-all"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              </div>
                              <div>
                                <span className="text-xs font-medium uppercase tracking-wide text-emerald-400 block mb-1">Respond with:</span>
                                <textarea
                                  value={obj.response}
                                  onChange={(e) => {
                                    const newObjections = [...(activeConfig.objections as Array<{ trigger: string; response: string }>)];
                                    newObjections[i] = { ...obj, response: e.target.value };
                                    updateSkillData('objection_handling', { ...activeConfig, objections: newObjections });
                                  }}
                                  rows={4}
                                  className="w-full bg-gray-900/50 rounded-lg p-2 text-sm text-gray-200 focus:outline-none resize-none"
                                  placeholder="Your response strategy..."
                                />
                              </div>
                            </div>
                          ))}
                          <button
                            onClick={() => updateSkillData('objection_handling', {
                              ...activeConfig,
                              objections: [...(activeConfig.objections as Array<{ trigger: string; response: string }>), { trigger: '', response: '' }]
                            })}
                            className="w-full flex items-center justify-center gap-2 p-3 rounded-lg border border-dashed border-gray-700 text-gray-500 hover:border-violet-500 hover:text-violet-400 transition-colors"
                          >
                            <Plus className="w-4 h-4" />
                            <span className="text-sm">Add objection</span>
                          </button>
                        </div>
                      )}

                      {/* ICP */}
                      {activeSkill.id === 'icp' && (
                        <div className="space-y-4">
                          <div>
                            <label className="text-xs font-medium uppercase tracking-wide text-gray-500 mb-2 block">
                              Ideal company profile
                            </label>
                            <textarea
                              value={activeConfig.companyProfile as string}
                              onChange={(e) => updateSkillData('icp', { ...activeConfig, companyProfile: e.target.value })}
                              rows={4}
                              className="w-full p-3 rounded-lg bg-gray-800 text-sm text-gray-200 focus:outline-none focus:ring-2 focus:ring-violet-500 resize-none"
                              placeholder="Describe your ideal customer company..."
                            />
                          </div>
                          <div>
                            <label className="text-xs font-medium uppercase tracking-wide text-gray-500 mb-2 block">
                              Buyer persona
                            </label>
                            <textarea
                              value={activeConfig.buyerPersona as string}
                              onChange={(e) => updateSkillData('icp', { ...activeConfig, buyerPersona: e.target.value })}
                              rows={4}
                              className="w-full p-3 rounded-lg bg-gray-800 text-sm text-gray-200 focus:outline-none focus:ring-2 focus:ring-violet-500 resize-none"
                              placeholder="Describe the person who typically buys..."
                            />
                          </div>
                          <div>
                            <label className="text-xs font-medium uppercase tracking-wide text-gray-500 mb-2 block">
                              Buying signals to look for
                            </label>
                            <div className="space-y-2">
                              {(activeConfig.buyingSignals as string[])?.map((signal, i) => (
                                <div key={i} className="group flex items-start gap-2 p-3 rounded-lg bg-gray-800 hover:bg-gray-750 transition-colors">
                                  <Target className="w-4 h-4 text-emerald-400 mt-0.5 flex-shrink-0" />
                                  <input
                                    type="text"
                                    value={signal}
                                    onChange={(e) => updateSkillData('icp', {
                                      ...activeConfig,
                                      buyingSignals: (activeConfig.buyingSignals as string[]).map((s, idx) => idx === i ? e.target.value : s)
                                    })}
                                    className="flex-1 bg-transparent text-sm text-gray-200 focus:outline-none"
                                  />
                                  <button
                                    onClick={() => updateSkillData('icp', {
                                      ...activeConfig,
                                      buyingSignals: (activeConfig.buyingSignals as string[]).filter((_, idx) => idx !== i)
                                    })}
                                    className="opacity-0 group-hover:opacity-100 text-gray-500 hover:text-red-400 transition-all"
                                  >
                                    <Trash2 className="w-4 h-4" />
                                  </button>
                                </div>
                              ))}
                              <button
                                onClick={() => updateSkillData('icp', {
                                  ...activeConfig,
                                  buyingSignals: [...(activeConfig.buyingSignals as string[]), '']
                                })}
                                className="w-full flex items-center justify-center gap-2 p-3 rounded-lg border border-dashed border-gray-700 text-gray-500 hover:border-violet-500 hover:text-violet-400 transition-colors"
                              >
                                <Plus className="w-4 h-4" />
                                <span className="text-sm">Add buying signal</span>
                              </button>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Test Output Panel */}
                    <AnimatePresence>
                      {showTestOutput && testOutput && (
                        <motion.div
                          initial={{ opacity: 0, height: 0 }}
                          animate={{ opacity: 1, height: 'auto' }}
                          exit={{ opacity: 0, height: 0 }}
                          className="mt-4 rounded-lg border border-violet-500/30 bg-violet-950/30 overflow-hidden"
                        >
                          <div className="px-4 py-3 border-b border-violet-500/20 flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <FlaskConical className="w-4 h-4 text-violet-400" />
                              <span className="text-sm font-medium text-violet-300">Test Output Preview</span>
                            </div>
                            <button
                              onClick={() => setShowTestOutput(false)}
                              className="text-gray-500 hover:text-gray-300"
                            >
                              <X className="w-4 h-4" />
                            </button>
                          </div>
                          <div className="p-4 space-y-3">
                            <div>
                              <p className="text-xs font-medium uppercase tracking-wide text-gray-500 mb-1">Scenario</p>
                              <p className="text-sm text-gray-300">{testOutput.scenario}</p>
                            </div>
                            <div>
                              <p className="text-xs font-medium uppercase tracking-wide text-gray-500 mb-1">AI Output</p>
                              <div className="text-sm text-gray-200 whitespace-pre-wrap bg-gray-900/50 rounded-lg p-3">
                                {testOutput.output.split('\n').map((line, i) => {
                                  // Simple markdown-like rendering
                                  if (line.startsWith('**') && line.endsWith('**')) {
                                    return <p key={i} className="font-semibold text-white">{line.replace(/\*\*/g, '')}</p>;
                                  }
                                  if (line.startsWith('• ')) {
                                    return <p key={i} className="pl-2">{line}</p>;
                                  }
                                  if (line.startsWith('*') && line.endsWith('*')) {
                                    return <p key={i} className="italic text-gray-400">{line.replace(/\*/g, '')}</p>;
                                  }
                                  return <p key={i}>{line}</p>;
                                })}
                              </div>
                            </div>
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>

                  {/* Footer */}
                  <div className="px-4 sm:px-6 py-4 border-t border-gray-800 bg-gray-900/50 flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => setCurrentSkillIndex(Math.max(0, currentSkillIndex - 1))}
                        disabled={currentSkillIndex === 0}
                        className="p-2 rounded-lg hover:bg-gray-800 text-gray-400 disabled:opacity-30"
                      >
                        <ChevronLeft className="w-5 h-5" />
                      </button>
                      <button onClick={handleSkipSkill} className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium rounded-lg text-gray-400 hover:bg-gray-800">
                        <Clock className="w-4 h-4" />
                        <span className="hidden sm:inline">Skip for now</span>
                      </button>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="outline"
                        onClick={handleTestOutput}
                        className="border-violet-500/50 text-violet-400 hover:bg-violet-500/10"
                      >
                        <FlaskConical className="w-4 h-4 mr-2" />
                        <span className="hidden sm:inline">Test</span>
                      </Button>
                      <Button onClick={handleSaveSkill} className="bg-violet-600 hover:bg-violet-700">
                        {currentSkillIndex === SKILLS.length - 1 ? 'Complete' : 'Save & Next'}
                        <ChevronRight className="w-4 h-4 ml-2" />
                      </Button>
                    </div>
                  </div>
                </div>
              </motion.div>
            )}

            {/* Complete Step */}
            {currentStep === 'complete' && (
              <motion.div
                key="complete"
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                className="w-full max-w-lg mx-auto px-4"
              >
                <div className="rounded-2xl border border-gray-800 bg-gray-900 p-8 sm:p-10 text-center">
                  <motion.div
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    transition={{ type: 'spring', delay: 0.2 }}
                    className="w-20 h-20 rounded-full bg-gradient-to-br from-emerald-400 to-emerald-500 flex items-center justify-center mx-auto mb-6 shadow-lg shadow-emerald-500/25"
                  >
                    <Check className="w-10 h-10 text-white" strokeWidth={3} />
                  </motion.div>

                  <h2 className="text-2xl font-bold mb-3 text-white">Your Sales Assistant is Ready</h2>
                  <p className="mb-8 text-gray-400">
                    We've trained your AI on <span className="font-semibold text-white">{enrichmentData.company_name}</span>'s way of selling.
                  </p>

                  <div className="rounded-xl p-5 mb-8 bg-gray-800">
                    <p className="text-sm font-semibold mb-4 text-gray-300">Skills Configured</p>
                    <div className="flex flex-wrap gap-2 justify-center">
                      {SKILLS.map((skill) => {
                        const Icon = skill.icon;
                        const isConfigured = configuredSkillIds.includes(skill.id);
                        return (
                          <div
                            key={skill.id}
                            className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold ${
                              isConfigured ? 'bg-emerald-900/50 text-emerald-400' : 'bg-gray-700 text-gray-500'
                            }`}
                          >
                            <Icon className="w-3.5 h-3.5" />
                            {skill.name}
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  <Button onClick={resetSimulation} className="bg-violet-600 hover:bg-violet-700">
                    <RotateCcw className="w-4 h-4 mr-2" />
                    Restart Simulation
                  </Button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </CardContent>
    </Card>
  );
}
