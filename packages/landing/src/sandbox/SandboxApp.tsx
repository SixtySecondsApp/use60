/**
 * SandboxApp
 *
 * Full-screen interactive sandbox — focused on 5 core screens.
 * Sidebar (collapsible), topbar, routable views. No locked pages.
 */

import { lazy, Suspense, useState, useCallback, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  LayoutDashboard,
  Kanban,
  Video,
  Mail,
  Bot,
} from 'lucide-react';
import { SandboxDataProvider, useSandboxData } from './data/SandboxDataProvider';
import { SandboxSidebar } from './SandboxSidebar';
import { SandboxTopbar } from './SandboxTopbar';
import { SandboxTour } from './SandboxTour';
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
  onSignup?: () => void;
  className?: string;
}

const VIEW_MAP: Record<SandboxView, React.LazyExoticComponent<React.ComponentType>> = {
  dashboard: SandboxDashboard,
  pipeline: SandboxPipeline,
  contacts: SandboxDashboard, // contacts folded into dashboard for v3
  meetings: SandboxMeetings,
  email: SandboxEmailDraft,
  copilot: SandboxCopilot,
};

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
  onSignup,
  className = '',
}: SandboxAppProps) {
  return (
    <SandboxDataProvider
      data={data}
      initialView={initialView}
      visitorName={visitorName}
      visitorEmail={visitorEmail}
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

/** Mobile bottom tab bar */
const MOBILE_TABS: { id: SandboxView; label: string; icon: React.ElementType }[] = [
  { id: 'dashboard', label: 'Home', icon: LayoutDashboard },
  { id: 'pipeline', label: 'Deals', icon: Kanban },
  { id: 'meetings', label: 'Meetings', icon: Video },
  { id: 'email', label: 'Email', icon: Mail },
  { id: 'copilot', label: 'Copilot', icon: Bot },
];

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
  const [showTour, setShowTour] = useState(
    () => !localStorage.getItem('sbx_tour_dismissed')
  );
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

  const handleTourDismiss = useCallback(() => {
    localStorage.setItem('sbx_tour_dismissed', '1');
    setShowTour(false);
  }, []);

  const handleTourNavigate = useCallback(
    (view: string) => {
      navigateToView(view as SandboxView);
    },
    [navigateToView]
  );

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

        {(onSignup || visitorEmail) && (
          <div className="fixed bottom-20 md:bottom-6 right-4 md:right-6 z-50">
            <button
              onClick={handleSignup}
              className="flex items-center gap-2 px-4 md:px-5 py-2.5 md:py-3 rounded-xl bg-[#37bd7e] hover:bg-[#2da76c] text-white text-sm font-semibold shadow-lg shadow-[#37bd7e]/25 hover:shadow-[#37bd7e]/40 hover:scale-[1.02] transition-all duration-200"
            >
              {activeView === 'dashboard' ? `Get these numbers for ${data.visitorCompany?.name ?? 'your company'}`
                : activeView === 'pipeline' ? `Track your ${data.visitorCompany?.name ?? ''} deal for real`
                : activeView === 'meetings' ? 'Get AI meeting prep for real'
                : activeView === 'email' ? `Send this email to ${data.emailDraft?.to_name ?? 'your prospect'} for real`
                : activeView === 'copilot' ? 'Ask 60 anything about your pipeline'
                : 'This is real. Try it free'}
              <span className="text-white/60">&rarr;</span>
            </button>
          </div>
        )}
      </main>

      {/* Mobile bottom tab bar */}
      <div className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-gray-950/95 backdrop-blur-md border-t border-gray-800/50">
        <nav className="flex items-center justify-around h-14 px-2">
          {MOBILE_TABS.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeView === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => navigateToView(tab.id)}
                className={`flex flex-col items-center gap-0.5 px-3 py-1.5 rounded-lg transition-colors ${
                  isActive ? 'text-[#37bd7e]' : 'text-gray-500'
                }`}
              >
                <Icon className="w-5 h-5" />
                <span className="text-[10px] font-medium">{tab.label}</span>
              </button>
            );
          })}
        </nav>
      </div>

      {/* Guided tour overlay */}
      <AnimatePresence>
        {showTour && (
          <SandboxTour
            onDismiss={handleTourDismiss}
            onNavigate={handleTourNavigate}
            activeView={activeView}
          />
        )}
      </AnimatePresence>

      {/* Social proof sticky bar — appears after 90s, hidden if tour is active */}
      <AnimatePresence>
        {proofTimerElapsed && !proofDismissed && !showTour && (
          <SocialProofBar isVisible onClose={handleProofDismiss} />
        )}
      </AnimatePresence>
    </div>
  );
}
