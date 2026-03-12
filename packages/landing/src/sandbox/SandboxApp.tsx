/**
 * SandboxApp
 *
 * Full-screen interactive sandbox — focused on 6 core screens.
 * Desktop: sidebar + topbar + free navigation.
 * Mobile: guided "Next" flow with waitlist CTA on final step.
 */

import { lazy, Suspense, useState, useCallback, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowRight, Sparkles } from 'lucide-react';
import { SandboxDataProvider, useSandboxData } from './data/SandboxDataProvider';
import { SandboxSidebar } from './SandboxSidebar';
import { SandboxTopbar } from './SandboxTopbar';
import { useSandboxSignup } from './hooks/useSandboxSignup';
import { useSandboxTracking } from './hooks/useSandboxTracking';
import { SocialProofBar } from './components/SocialProofBar';
import type { SandboxData, SandboxView } from './data/sandboxTypes';

// Lazy-load views to keep initial bundle small
const SandboxDashboard = lazy(() => import('./views/SandboxDashboard'));
const SandboxPipeline = lazy(() => import('./views/SandboxPipeline'));
const SandboxMeetings = lazy(() => import('./views/SandboxMeetings'));
const SandboxEmailDraft = lazy(() => import('./views/SandboxEmailDraft'));
const SandboxCopilot = lazy(() => import('./views/SandboxCopilot'));
const SandboxProposals = lazy(() => import('./views/SandboxProposals'));

interface SandboxAppProps {
  data?: SandboxData;
  initialView?: SandboxView;
  visitorName?: string;
  visitorEmail?: string;
  /** Company domain for signup attribution (e.g. "acme.com") */
  visitorDomain?: string;
  /** Campaign code for attribution tracking (from /t/{code}) */
  campaignCode?: string;
  /** Campaign link UUID for visitor tracking attribution */
  campaignLinkId?: string;
  /** Deep research data that arrives async (phase 2) */
  deepResearchData?: Partial<SandboxData> | null;
  onSignup?: () => void;
  className?: string;
}

const VIEW_MAP: Record<SandboxView, React.LazyExoticComponent<React.ComponentType>> = {
  dashboard: SandboxDashboard,
  pipeline: SandboxPipeline,
  contacts: SandboxDashboard, // contacts folded into dashboard for v3
  meetings: SandboxMeetings,
  email: SandboxEmailDraft,
  proposals: SandboxProposals,
  copilot: SandboxCopilot,
};

/** Guided mobile flow: order + labels for each step */
const MOBILE_FLOW: { id: SandboxView; label: string; nextLabel: string }[] = [
  { id: 'dashboard', label: 'Your Command Centre', nextLabel: 'See your pipeline' },
  { id: 'pipeline', label: 'Deal Pipeline', nextLabel: 'AI meeting prep' },
  { id: 'meetings', label: 'Meeting Intelligence', nextLabel: 'Follow-up emails' },
  { id: 'email', label: 'AI Email Drafts', nextLabel: 'Proposals' },
  { id: 'proposals', label: 'Proposal Builder', nextLabel: 'Meet your AI copilot' },
  { id: 'copilot', label: 'AI Copilot', nextLabel: '' },
];

function ViewLoader() {
  return (
    <div className="flex items-center justify-center h-64">
      <div className="flex items-center gap-3">
        <div className="w-5 h-5 border-2 border-[#37bd7e]/30 border-t-[#37bd7e] rounded-full animate-spin" />
        <span className="text-sm text-gray-500">Loading...</span>
      </div>
    </div>
  );
}

export function SandboxApp({
  data,
  initialView = 'dashboard',
  visitorName,
  visitorEmail,
  visitorDomain,
  campaignCode,
  campaignLinkId,
  deepResearchData,
  onSignup,
  className = '',
}: SandboxAppProps) {
  return (
    <SandboxDataProvider
      data={data}
      initialView={initialView}
      visitorName={visitorName}
      visitorEmail={visitorEmail}
      deepResearchData={deepResearchData}
    >
      <div className={`h-screen w-full ${className}`}>
        <SandboxAppInner
          onSignup={onSignup}
          visitorDomain={visitorDomain}
          campaignCode={campaignCode}
          campaignLinkId={campaignLinkId}
        />
      </div>
    </SandboxDataProvider>
  );
}

/** Inner component that has access to SandboxDataProvider context */
function SandboxAppInner({
  onSignup,
  visitorDomain,
  campaignCode,
  campaignLinkId,
}: {
  onSignup?: () => void;
  visitorDomain?: string;
  campaignCode?: string;
  campaignLinkId?: string;
}) {
  const { activeView, setActiveView, visitorName, visitorEmail, data } = useSandboxData();

  // Initialize sandbox tracking with campaign link ID for visitor attribution
  const { trackEvent, trackViewChange } = useSandboxTracking({
    campaignLinkId,
    enabled: true,
  });
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const { submit: submitSignup } = useSandboxSignup();

  // Social proof bar — show after 90s, dismiss for session
  const [proofTimerElapsed, setProofTimerElapsed] = useState(false);
  const [proofDismissed, setProofDismissed] = useState(
    () => !!sessionStorage.getItem('sbx_proof_dismissed')
  );

  useEffect(() => {
    const timer = setTimeout(() => setProofTimerElapsed(true), 90_000);
    return () => clearTimeout(timer);
  }, []);

  const handleProofDismiss = useCallback(() => {
    sessionStorage.setItem('sbx_proof_dismissed', '1');
    setProofDismissed(true);
  }, []);

  // Wrap setActiveView to also track view changes for engagement scoring
  const navigateToView = useCallback(
    (view: SandboxView) => {
      setActiveView(view);
      trackViewChange(view);
    },
    [setActiveView, trackViewChange]
  );

  // Mobile guided flow — current step index
  const mobileStepIndex = MOBILE_FLOW.findIndex((s) => s.id === activeView);
  const currentStep = mobileStepIndex >= 0 ? mobileStepIndex : 0;
  const isLastStep = currentStep === MOBILE_FLOW.length - 1;

  const handleMobileNext = useCallback(() => {
    if (isLastStep) return; // handled by waitlist CTA
    const nextView = MOBILE_FLOW[currentStep + 1]?.id;
    if (nextView) navigateToView(nextView);
  }, [currentStep, isLastStep, navigateToView]);

  // Build a signup handler that captures all demo context
  const handleSignup = useCallback(() => {
    // Derive domain from sandbox data if not explicitly provided
    const domain = visitorDomain || data.visitorCompany?.domain;
    const company = data.visitorCompany?.name;

    submitSignup({
      email: visitorEmail || '',
      name: visitorName,
      company,
      domain,
      campaignCode,
      campaignLinkId,
    });

    // Track signup event
    trackEvent('signup_start');

    // Also call the parent onSignup if provided (for any additional handling)
    onSignup?.();
  }, [visitorDomain, visitorEmail, visitorName, data.visitorCompany, campaignCode, campaignLinkId, onSignup, submitSignup, trackEvent]);

  const ViewComponent = VIEW_MAP[activeView];

  return (
    <div className="min-h-full bg-gray-950 relative">
      {/* Desktop sidebar — hidden on mobile */}
      <div className="hidden md:block">
        <SandboxSidebar
          collapsed={sidebarCollapsed}
          onToggleCollapse={() => setSidebarCollapsed(!sidebarCollapsed)}
        />
      </div>

      {/* Topbar */}
      <div className="hidden md:block">
        <SandboxTopbar sidebarCollapsed={sidebarCollapsed} />
      </div>
      {/* Mobile topbar: full width */}
      <div className="md:hidden fixed top-0 left-0 right-0 z-20 h-16 flex items-center justify-between bg-gray-950/50 backdrop-blur-sm border-b border-gray-800/50 px-4">
        <div className="w-8 h-8 rounded-lg bg-[#37bd7e] flex items-center justify-center">
          <span className="text-white text-sm font-bold">60</span>
        </div>
        <span className="text-sm font-medium text-gray-400">sixty</span>
      </div>

      <main
        className="pt-16 min-h-full pb-16 md:pb-0 transition-[padding-left] duration-200 ease-out"
        style={{ paddingLeft: typeof window !== 'undefined' && window.innerWidth >= 768 ? (sidebarCollapsed ? '96px' : '256px') : 0 }}
      >
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <AnimatePresence mode="wait">
            <motion.div
              key={activeView}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
            >
              <Suspense fallback={<ViewLoader />}>
                <ViewComponent />
              </Suspense>
            </motion.div>
          </AnimatePresence>
        </div>

        {/* Desktop-only floating CTA */}
        {(onSignup || visitorEmail) && (
          <div className="hidden md:block fixed bottom-6 right-6 z-50">
            <button
              onClick={handleSignup}
              className="flex items-center gap-2 px-5 py-3 rounded-xl bg-[#37bd7e] hover:bg-[#2da76c] text-white text-sm font-semibold shadow-lg shadow-[#37bd7e]/25 hover:shadow-[#37bd7e]/40 hover:scale-[1.02] transition-all duration-200"
            >
              {activeView === 'dashboard' ? `Get this dashboard for ${data.visitorCompany?.name ?? 'your company'}`
                : activeView === 'pipeline' ? 'Track your real pipeline like this'
                : activeView === 'meetings' ? 'Get AI meeting prep for real'
                : activeView === 'email' ? `Send this email to ${data.emailDraft?.to_name ?? 'your prospect'} for real`
                : activeView === 'proposals' ? 'Generate proposals from your deal context'
                : activeView === 'copilot' ? 'Ask 60 anything about your pipeline'
                : 'This is real. Try it free'}
              <span className="text-white/60">&rarr;</span>
            </button>
          </div>
        )}
      </main>

      {/* Mobile guided flow bar */}
      <div className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-gray-950/95 backdrop-blur-md border-t border-gray-800/50">
        <div className="px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
          {/* Progress dots */}
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-1.5">
              {MOBILE_FLOW.map((step, i) => (
                <div
                  key={step.id}
                  className="h-1 rounded-full transition-all duration-300"
                  style={{
                    width: i === currentStep ? '24px' : '8px',
                    background: i <= currentStep ? '#37bd7e' : 'rgba(255,255,255,0.1)',
                  }}
                />
              ))}
            </div>
            <span className="text-[11px] text-gray-500 font-medium">
              {currentStep + 1} / {MOBILE_FLOW.length}
            </span>
          </div>

          {/* Next button or Waitlist CTA */}
          {isLastStep ? (
            <button
              onClick={handleSignup}
              className="w-full flex items-center justify-center gap-2.5 py-3.5 rounded-xl bg-[#37bd7e] hover:bg-[#2da76c] text-white text-sm font-semibold shadow-lg shadow-[#37bd7e]/25 active:scale-[0.98] transition-all duration-150"
            >
              <Sparkles className="w-4 h-4" />
              Join the Waitlist
              <ArrowRight className="w-4 h-4" />
            </button>
          ) : (
            <button
              onClick={handleMobileNext}
              className="w-full flex items-center justify-center gap-2 py-3.5 rounded-xl bg-white/[0.08] hover:bg-white/[0.12] border border-white/[0.06] text-white text-sm font-semibold active:scale-[0.98] transition-all duration-150"
            >
              {MOBILE_FLOW[currentStep]?.nextLabel ?? 'Next'}
              <ArrowRight className="w-4 h-4 text-[#37bd7e]" />
            </button>
          )}
        </div>
      </div>

      {/* Social proof sticky bar — appears after 90s */}
      <AnimatePresence>
        {proofTimerElapsed && !proofDismissed && (
          <SocialProofBar isVisible onClose={handleProofDismiss} />
        )}
      </AnimatePresence>
    </div>
  );
}
