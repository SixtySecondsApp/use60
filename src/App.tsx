import { Routes, Route, Navigate, useParams } from 'react-router-dom';
import { QueryClientProvider } from '@tanstack/react-query';
import { queryClient } from '@/lib/queryClient';
import { useEffect, Suspense, lazy } from 'react';
import { Toaster } from '@/components/ui/sonner';
import { createApiMonitor } from '@/lib/utils/apiUtils';
import { API_BASE_URL } from '@/lib/config';
import PerformanceMonitor from '@/lib/utils/performanceMonitor';
import { AppLayout } from '@/components/AppLayout';
import { ScrollToTop } from '@/components/ScrollToTop';
import { AuthProvider } from '@/lib/contexts/AuthContext';
import { OrgProvider } from '@/lib/contexts/OrgContext';
import { UserPermissionsProvider } from '@/contexts/UserPermissionsContext';
import { ViewModeProvider } from '@/contexts/ViewModeContext';
import { CopilotProvider } from '@/lib/contexts/CopilotContext';
import { useInitializeAuditSession } from '@/lib/hooks/useAuditSession';
import { useActivityTracker } from '@/lib/hooks/useActivityTracker';
import { ProtectedRoute } from '@/components/ProtectedRoute';
import { InternalRouteGuard, OrgAdminRouteGuard, PlatformAdminRouteGuard } from '@/components/RouteGuard';
import { RouteDebug } from '@/components/RouteDebug';
import { DefaultRoute } from '@/components/DefaultRoute';
import { RecoveryTokenDetector } from '@/components/RecoveryTokenDetector';
import { RouteLoader, ExternalRedirect } from '@/components/routing';

import { usePerformanceOptimization } from '@/lib/hooks/usePerformanceOptimization';
import { IntelligentPreloader } from '@/components/LazyComponents';
import { webVitalsOptimizer } from '@/lib/utils/webVitals';
// Removed legacy migration import - stages are now handled via database migrations
import ErrorBoundary from '@/components/ErrorBoundary';
import logger from '@/lib/utils/logger';
import { StateProvider } from '@/lib/communication/StateManagement';
import { serviceWorkerManager } from '@/lib/utils/serviceWorkerUtils';
import { VersionManager } from '@/components/VersionManager';
import { SentryDebugPanel } from '@/components/dev/SentryDebugPanel';

// ============================================================
// DIRECT IMPORTS (Critical path - must load immediately)
// ============================================================
import Dashboard from '@/pages/Dashboard';
import Login from '@/pages/auth/login';
import AuthCallback from '@/pages/auth/AuthCallback';
import AcceptInvitation from '@/pages/auth/AcceptInvitation';
import InviteSignup from '@/pages/auth/InviteSignup';
import PendingApprovalPage from '@/pages/auth/PendingApprovalPage';
import RequestRejectedPage from '@/pages/auth/RequestRejectedPage';
import InactiveOrganizationScreen from '@/pages/InactiveOrganizationScreen';
import RemovedUserStep from '@/pages/onboarding/v2/RemovedUserStep';
import TestGoogleTasks from '@/pages/TestGoogleTasks';
import MeetingThumbnail from '@/pages/MeetingThumbnail';
import BrowserlessTest from '@/pages/BrowserlessTest';
import PublicProposal from '@/pages/PublicProposal';
import PublicVoiceRecording from '@/pages/PublicVoiceRecording';
import PublicMeetingShare from '@/pages/PublicMeetingShare';
import DrueLanding from '@/pages/DrueLanding';
import FathomCallback from '@/pages/auth/FathomCallback';

// Landing pages wrapper (dev-only for local preview)
import { LandingWrapper, WaitlistPageWrapper, LeaderboardPageWrapper, WaitlistStatusPage, IntroductionPageWrapper, IntroPageWrapper, IntroducingPageWrapper, LearnMorePageWrapper } from '@/components/LandingWrapper';
import { supabase } from '@/lib/supabase/clientV2';

// Wrapper for FathomCallback route
const FathomCallbackWrapper = () => <FathomCallback />;

// ============================================================
// LAZY IMPORTS (Code-split for performance)
// ============================================================
import {
  // Platform Admin
  MeetingsWaitlist, WaitlistSlackSettings, OnboardingSimulator, TrialTimelineSimulator, PricingControl, CostAnalysis, AIUsageAdmin, ApiUsageDashboard, LaunchChecklist,
  ActivationDashboard, EngagementDashboard, PlatformDashboard, IntegrationRoadmap, VSLAnalytics, MetaAdsAnalytics, ErrorMonitoring, SentryBridge, SkillsAdmin, SkillsQAPage, PlatformSkillViewPage, PlatformSkillEditPage, SkillDetailPage, AgentSequencesPage, AgentSequenceBuilderPage, CopilotTestPage, CopilotLabPage, AgentPerformanceDashboard, CopilotConsolePage, OrchestratorDashboard, Users, PipelineSettings,
  AuditLogs, SmartTasksAdmin, PipelineAutomationAdmin, EmailTemplates, FunctionTesting,
  AIProviderSettings, GoogleIntegrationTestsLegacy, GoogleIntegrationTests, SettingsSavvyCal,
  SettingsBookingSources, HealthRules, EmailCategorizationSettings, AdminModelSettings,
  AdminPromptSettings, InternalDomainsSettings, SlackDemo,
  TasksDemo, ProcessMaps, VSLAnalyticsTests,
  CronJobsAdmin, ApiMonitor, BillingAnalytics, SaasAdminDashboard, IntegrationsDashboard, FathomIntegrationTests,
  HubSpotIntegrationTests, SlackIntegrationTests, SavvyCalIntegrationTests,
  QuickAddSimulator, DealTruthSimulator, EngagementSimulator,
  NotetakerBranding, NotetakerVideoQuality, NotetakerRecordingLimit, EmailActionCenter, CommandCentre, CommandCentreDemo, CommandCentreV2Demo, CommandCentreWowDemo, CommitmentDetectionDemo, DocsAdminPage, AgentTeamSettings, MultiAgentDemoPage, AgentTeamsLiveDemoPage, AgentAbilitiesPage, CreditSystemDemo, AIModelAdmin, EnrichmentComparisonDemo, ResearchComparisonDemo, ExaAbilitiesDemo, EmailSequenceTest, AgentResearchDemo, CampaignWorkflowDemo, OpsWebhookDemo,
  // Auth
  Signup, VerifyEmail, ForgotPassword, ResetPassword, SetPassword, Onboarding, UpdatePassword,
  // CRM & Data
  PipelinePage, FormDisplay, CompaniesTable, CompanyProfile,
  ContactsTable, ContactRecord, DealRecord, LeadsInbox, Clients,
  HealthMonitoring,
  // Features
  MeetingsPage, Calls, CallDetail, VoiceRecorder, VoiceRecordingDetail,
  Events, ActivityLog,
  ActivityProcessingPage, Workflows, FreepikFlow, Copilot, CopilotPage,
  OpsPage, OpsDetailPage, ApifyOpsPage, ProspectingPage, FactProfilesPage, FactProfileViewPage, FactProfileEditPage, ProfilesPage, DocsPage, SupportCentrePage, SupportTicketsPage,
  ProductProfileViewPage, ProductProfileEditPage,
  // Settings
  SettingsPage, Preferences, Profile, AISettings, TaskSyncSettings, CoachingPreferences,
  AccountSettings, AppearanceSettings, AIPersonalizationPage, AIIntelligencePage, SalesCoachingPage,
  APIKeysPage, EmailSyncPage, TaskSyncPage, TeamMembersPage, OrganizationManagementPage,
  CallTypeSettings, PipelineAutomationSettings, FollowUpSettings, OrganizationSettingsPage,
  LogoSettings, SlackSettings, ProactiveAgentSettings, JustCallSettings, HubSpotSettings, AttioSettings, BullhornSettings, InstantlySettings, SmartListeningSettings,
  CreditPurchaseSuccess, CreditsSettingsPage, BillingSettingsPage,
  GoogleWorkspaceIntegrationPage, FathomIntegrationPage, FirefliesIntegrationPage,
  OrgBilling,
  // Insights
  Insights, Heatmap, SalesFunnel, TeamAnalytics, ContentTopics, MeetingAnalyticsPage,
  // Misc
  Integrations, PublicFactProfile, GoogleCallback, Roadmap, Releases, ApiTesting, TestFallback,
  // Debug
  DebugAuth, AuthDebug, DebugPermissions, DebugMeetings, TestNotifications,
} from '@/routes/lazyPages';

// Agent Marketplace (org admin accessible)
const AgentMarketplacePage = lazy(() => import('./pages/agent/AgentMarketplacePage'));

// ============================================================
// SUPABASE GLOBAL INITIALIZATION
// ============================================================
// Make main app's Supabase client available to landing package
if (typeof window !== 'undefined') {
  (window as any).__MAIN_APP_SUPABASE__ = supabase;
  if ((window as any).__MAIN_APP_SUPABASE__) {
    console.log('[App] Main app Supabase client set on window for landing package', {
      hasFrom: typeof (window as any).__MAIN_APP_SUPABASE__.from === 'function',
      hasAuth: typeof (window as any).__MAIN_APP_SUPABASE__.auth === 'object'
    });
  } else {
    console.error('[App] Failed to set Supabase client on window!');
  }
}

function RedirectFactProfile() {
  const { id } = useParams();
  return <Navigate to={`/profiles/${id}`} replace />;
}
function RedirectFactProfileEdit() {
  const { id } = useParams();
  return <Navigate to={`/profiles/${id}/edit`} replace />;
}

function App() {
  // Initialize performance optimizations
  const { performanceMetrics, measurePerformance, addCleanup } = usePerformanceOptimization({
    enableResourcePreloading: true,
    enableSmartPreloading: true,
    enableBundleMonitoring: true,
    enableMemoryCleanup: true,
    debugMode: process.env.NODE_ENV === 'development'
  });

  // Initialize API connection monitoring
  useEffect(() => {
    const monitor = createApiMonitor(API_BASE_URL, 30000); // Check every 30 seconds
    monitor.start();

    const cleanup = () => monitor.stop();
    addCleanup(cleanup);

    return cleanup;
  }, [addCleanup]);

  // Database migrations are now handled via Supabase migrations
  // Legacy runtime migrations have been removed to prevent API errors

  // Initialize performance monitoring
  useEffect(() => {
    const performanceMonitor = PerformanceMonitor.getInstance();

    // Enable performance monitoring in production for real user monitoring
    performanceMonitor.setEnabled(true);

    // Initialize Web Vitals optimization
    webVitalsOptimizer.initializeMonitoring(process.env.NODE_ENV === 'production');

    // Enhanced performance logging with optimization metrics
    if (process.env.NODE_ENV === 'development') {
      const interval = setInterval(() => {
        measurePerformance('performance-summary', () => {
          const summary = performanceMonitor.getPerformanceSummary();
          logger.log('📊 Performance Summary:', summary);
          logger.log('🚀 Optimization Metrics:', performanceMetrics);
        });
      }, 30000); // Every 30 seconds

      const cleanup = () => {
        clearInterval(interval);
        performanceMonitor.cleanup();
      };

      addCleanup(cleanup);
      return cleanup;
    }

    const cleanup = () => performanceMonitor.cleanup();
    addCleanup(cleanup);
    return cleanup;
  }, [measurePerformance, performanceMetrics, addCleanup]);

  return (
    <ErrorBoundary
      onError={(error, errorInfo) => {
        logger.error('Application Error Boundary caught error:', error, errorInfo);
        // You could send this to your error reporting service here
      }}
    >
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <OrgProvider>
            <UserPermissionsProvider>
              <ViewModeProvider>
                <CopilotProvider>
                  <StateProvider>
                    <AppContent performanceMetrics={performanceMetrics} measurePerformance={measurePerformance} />
                  </StateProvider>
                </CopilotProvider>
              </ViewModeProvider>
            </UserPermissionsProvider>
          </OrgProvider>
        </AuthProvider>
      </QueryClientProvider>
    </ErrorBoundary>
  );
}

// Separate component that can use auth context
function AppContent({ performanceMetrics, measurePerformance }: any) {
  // Initialize audit session tracking - now inside AuthProvider
  useInitializeAuditSession();

  // Initialize activity tracking for Smart Engagement Algorithm
  useActivityTracker({
    enabled: true,
    trackPageViews: true,
    trackSessionDuration: true,
  });

  return (
    <>
      <IntelligentPreloader />
      <RecoveryTokenDetector />
      <Routes>
        {/* ========== PUBLIC ROUTES (No Auth Required) ========== */}
        {/* Public pages for screenshot automation - MUST be outside ProtectedRoute */}
        <Route path="/meetings/thumbnail/:meetingId" element={<MeetingThumbnail />} />
        <Route path="/browserless-test" element={<BrowserlessTest />} />

        {/* Public proposal sharing - allows prospects to view shared proposals */}
        <Route path="/share/:token" element={<PublicProposal />} />

        {/* Public voice recording sharing - allows anyone with link to view */}
        <Route path="/share/voice/:token" element={<PublicVoiceRecording />} />

        {/* Public meeting sharing - allows anyone with link to view meeting analysis */}
        <Route path="/share/meeting/:token" element={<PublicMeetingShare />} />

        {/* Public fact profile sharing - allows anyone with link to view/approve */}
        <Route path="/share/fact-profile/:token" element={<Suspense fallback={<RouteLoader />}><PublicFactProfile /></Suspense>} />

        {/* Drue Landing Page - public access */}
        <Route path="/landing-drue" element={<DrueLanding />} />

        {/* Learn More - Development only for local landing page testing */}
        {import.meta.env.DEV && (
          <Route path="/learnmore" element={<LearnMorePageWrapper />} />
        )}

        {/* Development-only: Local landing page preview */}
        {import.meta.env.DEV && (
          <Route path="/landing/*" element={<LandingWrapper />} />
        )}

        {/* Redirect landing pages to www.use60.com */}
        <Route path="/product/meetings" element={<ExternalRedirect url="https://www.use60.com" />} />
        <Route path="/product/meetings-v1" element={<ExternalRedirect url="https://www.use60.com" />} />
        <Route path="/product/meetings-v2" element={<ExternalRedirect url="https://www.use60.com" />} />
        <Route path="/product/meetings-v3" element={<ExternalRedirect url="https://www.use60.com" />} />
        <Route path="/product/meetings-v4" element={<ExternalRedirect url="https://www.use60.com" />} />
        <Route path="/product/meetings/waitlist" element={<ExternalRedirect url="https://www.use60.com/waitlist" />} />
        {/* In development, show local waitlist; in production, redirect to landing site */}
        {/* Waitlist routes - parent route needs /* for nested routes */}
        {import.meta.env.DEV && (
          <>
            <Route path="/waitlist/*" element={<WaitlistPageWrapper />} />
            <Route path="/leaderboard" element={<LeaderboardPageWrapper />} />
            <Route path="/introduction" element={<IntroductionPageWrapper />} />
            <Route path="/intro" element={<IntroPageWrapper />} />
            <Route path="/introducing" element={<IntroducingPageWrapper />} />
          </>
        )}
        {!import.meta.env.DEV && (
          <Route path="/waitlist" element={<ExternalRedirect url="https://www.use60.com/waitlist" />} />
        )}
        <Route path="/product/meetings/pricing" element={<ExternalRedirect url="https://www.use60.com#pricing" />} />
        <Route path="/features/meetings" element={<ExternalRedirect url="https://www.use60.com" />} />
        <Route path="/features/meetings-v1" element={<ExternalRedirect url="https://www.use60.com" />} />
        <Route path="/features/meetings-v2" element={<ExternalRedirect url="https://www.use60.com" />} />
        <Route path="/features/meetings-v3" element={<ExternalRedirect url="https://www.use60.com" />} />
        <Route path="/features/meetings-v4" element={<ExternalRedirect url="https://www.use60.com" />} />
        <Route path="/pricing" element={<ExternalRedirect url="https://www.use60.com#pricing" />} />

        {/* ========== AUTH ROUTES (Public) ========== */}
        <Route path="/auth/login" element={<Login />} />
        <Route path="/auth/callback" element={<AuthCallback />} />
        <Route path="/auth/signup" element={<Signup />} />
        <Route path="/auth/invite-signup/:token" element={<InviteSignup />} />
        <Route path="/auth/verify-email" element={<VerifyEmail />} />
        <Route path="/auth/forgot-password" element={<ForgotPassword />} />
        <Route path="/auth/reset-password/*" element={<ResetPassword />} />
        <Route path="/auth/set-password" element={<SetPassword />} />
        <Route path="/auth/pending-approval" element={<PendingApprovalPage />} />
        <Route path="/auth/request-rejected" element={<RequestRejectedPage />} />
        <Route path="/update-password" element={<UpdatePassword />} />

        {/* OAuth callback routes - must be public for external redirects */}
        <Route path="/auth/google/callback" element={<GoogleCallback />} />
        <Route path="/oauth/fathom/callback" element={<FathomCallbackWrapper />} />

        {/* Organization invitation acceptance (can be accessed logged in or out) */}
        <Route path="/invite/:token" element={<AcceptInvitation />} />

        {/* Commitment Detection Demo */}
        <Route path="/cde-demo" element={<CommitmentDetectionDemo />} />

        {/* ========== PROTECTED ROUTES (Auth Required) ========== */}
        <Route path="/*" element={
          <ProtectedRoute>
            <ScrollToTop />
            <RouteDebug />
            <Suspense fallback={<RouteLoader />}>
              <Routes>
                <Route path="/onboarding" element={<Onboarding />} />
                <Route path="/onboarding/removed-user" element={<RemovedUserStep />} />
                <Route path="/inactive-organization" element={<InactiveOrganizationScreen />} />
                <Route path="/debug-auth" element={<DebugAuth />} />
                <Route path="/debug/auth" element={<AuthDebug />} />
                <Route path="/debug-permissions" element={<DebugPermissions />} />
                {/* Home route - redirects unauthenticated to /learnmore, authenticated to dashboard */}
                <Route path="/" element={<DefaultRoute />} />
                {/* Dashboard alias for backwards compatibility */}
                <Route path="/dashboard" element={<AppLayout><Dashboard /></AppLayout>} />
                {/* Internal-only routes - CRM and tools */}
                {/* Copilot with URL-based conversation routing */}
                <Route path="/copilot" element={<InternalRouteGuard><AppLayout><CopilotPage /></AppLayout></InternalRouteGuard>} />
                <Route path="/copilot/:conversationId" element={<InternalRouteGuard><AppLayout><CopilotPage /></AppLayout></InternalRouteGuard>} />
                <Route path="/action-centre" element={<Navigate to="/command-centre" replace />} />
                <Route path="/command-centre" element={<InternalRouteGuard><AppLayout><CommandCentre /></AppLayout></InternalRouteGuard>} />
                <Route path="/command-centre-demo" element={<InternalRouteGuard><AppLayout><CommandCentreDemo /></AppLayout></InternalRouteGuard>} />
                <Route path="/command-centre-v2" element={<InternalRouteGuard><AppLayout><CommandCentreV2Demo /></AppLayout></InternalRouteGuard>} />
                <Route path="/command-centre-wow" element={<InternalRouteGuard><AppLayout><CommandCentreWowDemo /></AppLayout></InternalRouteGuard>} />
                <Route path="/activity" element={<InternalRouteGuard><AppLayout><ActivityLog /></AppLayout></InternalRouteGuard>} />
                <Route path="/insights" element={<AppLayout><Insights /></AppLayout>} />
                <Route path="/crm" element={<Navigate to="/ops" replace />} />
                <Route path="/crm/elegant" element={<Navigate to="/ops" replace />} />
                {/* Legacy /admin routes - redirect to /platform (replaced by 3-tier architecture) */}
                <Route path="/admin" element={<Navigate to="/platform" replace />} />
                <Route path="/admin/users" element={<Navigate to="/platform/users" replace />} />
                <Route path="/admin/pipeline" element={<Navigate to="/platform/crm/pipeline" replace />} />
                <Route path="/admin/audit" element={<Navigate to="/platform/audit" replace />} />
                <Route path="/admin/smart-tasks" element={<Navigate to="/platform/crm/smart-tasks" replace />} />
                <Route path="/admin/pipeline-automation" element={<Navigate to="/platform/crm/automation" replace />} />
                <Route path="/admin/ai-settings" element={<Navigate to="/platform/ai/settings" replace />} />
                <Route path="/admin/model-settings" element={<Navigate to="/platform/ai/settings" replace />} />
                <Route path="/admin/prompts" element={<Navigate to="/platform/ai/prompts" replace />} />
                <Route path="/admin/api-testing" element={<Navigate to="/platform/dev/api-testing" replace />} />
                <Route path="/admin/function-testing" element={<Navigate to="/platform/dev/function-testing" replace />} />
                <Route path="/admin/google-integration" element={<Navigate to="/platform/integrations/google" replace />} />
                <Route path="/admin/savvycal-settings" element={<Navigate to="/platform/integrations/savvycal" replace />} />
                <Route path="/admin/booking-sources" element={<Navigate to="/platform/integrations/booking-sources" replace />} />
                <Route path="/admin/health-rules" element={<Navigate to="/platform/crm/health-rules" replace />} />
                <Route path="/admin/branding" element={<Navigate to="/settings" replace />} />
                <Route path="/admin/internal-domains" element={<Navigate to="/platform/integrations/domains" replace />} />
                <Route path="/admin/*" element={<Navigate to="/platform" replace />} /> {/* Catch-all for any remaining /admin routes */}

                {/* ========================================= */}
                {/* NEW 3-TIER ARCHITECTURE ROUTES           */}
                {/* ========================================= */}

                {/* Team settings have been consolidated into /settings (role-gated).
                    Keep /team/* paths as legacy redirects for existing links. */}
                <Route path="/team" element={<Navigate to="/settings" replace />} />
                <Route path="/team/team" element={<Navigate to="/settings/team-members" replace />} />
                <Route path="/team/branding" element={<Navigate to="/settings" replace />} />
                <Route path="/team/billing" element={<Navigate to="/settings/billing" replace />} />
                <Route path="/team/billing/success" element={<Navigate to="/settings/billing" replace />} />
                <Route path="/team/billing/cancel" element={<Navigate to="/settings/billing" replace />} />

                {/* Legacy /org routes redirect to /team */}
                <Route path="/org" element={<Navigate to="/settings" replace />} />
                <Route path="/org/team" element={<Navigate to="/settings/team-members" replace />} />
                <Route path="/org/branding" element={<Navigate to="/settings" replace />} />
                <Route path="/org/billing" element={<Navigate to="/settings/billing" replace />} />
                <Route path="/org/billing/success" element={<Navigate to="/settings/billing" replace />} />
                <Route path="/org/billing/cancel" element={<Navigate to="/settings/billing" replace />} />

                {/* Tier 3: Platform Admin Routes (Internal + is_admin only) */}
                {/* Platform Admin - All specific routes MUST come before /platform route */}
                {/* DEBUG: Test route to verify routing works */}
                <Route path="/platform/test-route" element={<div style={{ padding: '50px', color: 'white', background: 'green' }}>TEST ROUTE WORKS! Path: /platform/test-route</div>} />
                {/* DEBUG: Unguarded email templates to test if guards are the issue */}
                <Route path="/platform/email-templates-test" element={<AppLayout><EmailTemplates /></AppLayout>} />
                {/* Platform Admin - Email Templates */}
                <Route path="/platform/email-templates" element={<PlatformAdminRouteGuard><AppLayout><EmailTemplates /></AppLayout></PlatformAdminRouteGuard>} />
                {/* Platform Admin - Customer Management */}
                <Route path="/platform/customers" element={<PlatformAdminRouteGuard><AppLayout><SaasAdminDashboard /></AppLayout></PlatformAdminRouteGuard>} />
                <Route path="/platform/plans" element={<Navigate to="/platform/pricing" replace />} />
                <Route path="/platform/pricing" element={<PlatformAdminRouteGuard><AppLayout><PricingControl /></AppLayout></PlatformAdminRouteGuard>} />
                <Route path="/platform/cost-analysis" element={<PlatformAdminRouteGuard><AppLayout><CostAnalysis /></AppLayout></PlatformAdminRouteGuard>} />
                <Route path="/platform/ai-usage" element={<PlatformAdminRouteGuard><AppLayout><AIUsageAdmin /></AppLayout></PlatformAdminRouteGuard>} />
                <Route path="/platform/60-notetaker-build" element={<PlatformAdminRouteGuard><AppLayout><ApiUsageDashboard /></AppLayout></PlatformAdminRouteGuard>} />
                <Route path="/platform/users" element={<PlatformAdminRouteGuard><AppLayout><Users /></AppLayout></PlatformAdminRouteGuard>} />
                {/* Platform Admin - CRM Configuration */}
                <Route path="/platform/crm/pipeline" element={<PlatformAdminRouteGuard><AppLayout><PipelineSettings /></AppLayout></PlatformAdminRouteGuard>} />
                <Route path="/platform/crm/smart-tasks" element={<PlatformAdminRouteGuard><AppLayout><SmartTasksAdmin /></AppLayout></PlatformAdminRouteGuard>} />
                <Route path="/platform/crm/automation" element={<PlatformAdminRouteGuard><AppLayout><PipelineAutomationAdmin /></AppLayout></PlatformAdminRouteGuard>} />
                {/* Platform Admin - Email Categorization Settings */}
                <Route path="/platform/integrations/email-categorization" element={<PlatformAdminRouteGuard><AppLayout><EmailCategorizationSettings /></AppLayout></PlatformAdminRouteGuard>} />
                <Route path="/admin/email-categorization" element={<Navigate to="/platform/integrations/email-categorization" replace />} />
                {/* Platform Admin - Meetings Waitlist */}
                <Route path="/platform/meetings-waitlist" element={<PlatformAdminRouteGuard><AppLayout><MeetingsWaitlist /></AppLayout></PlatformAdminRouteGuard>} />
                <Route path="/platform/waitlist-slack-settings" element={<PlatformAdminRouteGuard><AppLayout><WaitlistSlackSettings /></AppLayout></PlatformAdminRouteGuard>} />
                {/* Platform Admin - AI Configuration */}
                <Route path="/platform/ai/settings" element={<PlatformAdminRouteGuard><AppLayout><AIProviderSettings /></AppLayout></PlatformAdminRouteGuard>} />
                <Route path="/platform/ai/models" element={<PlatformAdminRouteGuard><AppLayout><AIModelAdmin /></AppLayout></PlatformAdminRouteGuard>} />
                <Route path="/platform/ai/prompts" element={<PlatformAdminRouteGuard><AppLayout><AdminPromptSettings /></AppLayout></PlatformAdminRouteGuard>} />
                {/* Platform Skills Admin - category-based routing */}
                <Route path="/platform/skills" element={<PlatformAdminRouteGuard><AppLayout><SkillsAdmin /></AppLayout></PlatformAdminRouteGuard>} />
                <Route path="/platform/skills/:category" element={<PlatformAdminRouteGuard><AppLayout><SkillsAdmin /></AppLayout></PlatformAdminRouteGuard>} />
                {/* Individual skill view/edit pages - full-page experience */}
                <Route path="/platform/skills/:category/new" element={<PlatformAdminRouteGuard><AppLayout><PlatformSkillEditPage /></AppLayout></PlatformAdminRouteGuard>} />
                <Route path="/platform/skills/:category/:skillKey" element={<PlatformAdminRouteGuard><AppLayout><PlatformSkillViewPage /></AppLayout></PlatformAdminRouteGuard>} />
                <Route path="/platform/skills/:category/:skillKey/edit" element={<PlatformAdminRouteGuard><AppLayout><PlatformSkillEditPage /></AppLayout></PlatformAdminRouteGuard>} />
                {/* Skills QA Testing - Validate skills/sequences against real org data */}
                <Route path="/platform/skills-qa" element={<PlatformAdminRouteGuard><AppLayout><SkillsQAPage /></AppLayout></PlatformAdminRouteGuard>} />
                {/* Agent Sequences - Multi-step skill chains */}
                <Route path="/platform/agent-sequences" element={<PlatformAdminRouteGuard><AppLayout><AgentSequencesPage /></AppLayout></PlatformAdminRouteGuard>} />
                <Route path="/platform/agent-sequences/new" element={<PlatformAdminRouteGuard><AgentSequenceBuilderPage /></PlatformAdminRouteGuard>} />
                <Route path="/platform/agent-sequences/:sequenceKey" element={<PlatformAdminRouteGuard><AgentSequenceBuilderPage /></PlatformAdminRouteGuard>} />
                {/* Unified Copilot Console - Test, monitor, and analyze */}
                <Route path="/platform/copilot-console" element={<PlatformAdminRouteGuard><AppLayout><CopilotConsolePage /></AppLayout></PlatformAdminRouteGuard>} />
                {/* Copilot Test Page - Quality testing for AI assistant */}
                <Route path="/platform/copilot-tests" element={<PlatformAdminRouteGuard><AppLayout><CopilotTestPage /></AppLayout></PlatformAdminRouteGuard>} />
                {/* Copilot Lab - Testing, discovery, and improvement hub */}
                <Route path="/platform/copilot-lab" element={<PlatformAdminRouteGuard><AppLayout><CopilotLabPage /></AppLayout></PlatformAdminRouteGuard>} />
                {/* Agent Performance Dashboard - Observability and analytics */}
                <Route path="/platform/agent-performance" element={<PlatformAdminRouteGuard><AppLayout><AgentPerformanceDashboard /></AppLayout></PlatformAdminRouteGuard>} />

                <Route path="/platform/orchestrator-dashboard" element={<PlatformAdminRouteGuard><AppLayout><OrchestratorDashboard /></AppLayout></PlatformAdminRouteGuard>} />

                <Route path="/platform/agent-teams" element={<PlatformAdminRouteGuard><AppLayout><AgentTeamSettings /></AppLayout></PlatformAdminRouteGuard>} />
                <Route path="/platform/multi-agent-demo" element={<PlatformAdminRouteGuard><AppLayout><MultiAgentDemoPage /></AppLayout></PlatformAdminRouteGuard>} />
                <Route path="/platform/agent-teams-live" element={<PlatformAdminRouteGuard><AppLayout><AgentTeamsLiveDemoPage /></AppLayout></PlatformAdminRouteGuard>} />
                <Route path="/platform/agent-abilities" element={<PlatformAdminRouteGuard><AppLayout><AgentAbilitiesPage /></AppLayout></PlatformAdminRouteGuard>} />
                <Route path="/platform/credit-system-demo" element={<PlatformAdminRouteGuard><AppLayout><CreditSystemDemo /></AppLayout></PlatformAdminRouteGuard>} />
                <Route path="/platform/enrichment-demo" element={<PlatformAdminRouteGuard><AppLayout><EnrichmentComparisonDemo /></AppLayout></PlatformAdminRouteGuard>} />
                <Route path="/demo/research-comparison" element={<PlatformAdminRouteGuard><AppLayout><ResearchComparisonDemo /></AppLayout></PlatformAdminRouteGuard>} />
                <Route path="/demo/exa-abilities" element={<PlatformAdminRouteGuard><AppLayout><ExaAbilitiesDemo /></AppLayout></PlatformAdminRouteGuard>} />
                <Route path="/demo/email-sequence-test" element={<PlatformAdminRouteGuard><AppLayout><EmailSequenceTest /></AppLayout></PlatformAdminRouteGuard>} />
                <Route path="/demo/agent-research" element={<PlatformAdminRouteGuard><AppLayout><AgentResearchDemo /></AppLayout></PlatformAdminRouteGuard>} />
                <Route path="/demo/campaign-workflow" element={<PlatformAdminRouteGuard><AppLayout><CampaignWorkflowDemo /></AppLayout></PlatformAdminRouteGuard>} />
                <Route path="/demo/ops-webhook" element={<PlatformAdminRouteGuard><AppLayout><OpsWebhookDemo /></AppLayout></PlatformAdminRouteGuard>} />
                {/* Documentation CMS Admin */}
                <Route path="/platform/docs-admin" element={<PlatformAdminRouteGuard><AppLayout><DocsAdminPage /></AppLayout></PlatformAdminRouteGuard>} />
                {/* Shareable skill detail page - accessible to org members */}
                <Route path="/skills/:skillKey" element={<AppLayout><SkillDetailPage /></AppLayout>} />
                <Route path="/platform/features" element={<PlatformAdminRouteGuard><AppLayout><SaasAdminDashboard /></AppLayout></PlatformAdminRouteGuard>} />
                {/* Platform Admin - Integrations */}
                <Route path="/platform/integrations/fathom" element={<PlatformAdminRouteGuard><AppLayout><FathomIntegrationTests /></AppLayout></PlatformAdminRouteGuard>} />
                <Route path="/platform/integrations/hubspot" element={<PlatformAdminRouteGuard><AppLayout><HubSpotIntegrationTests /></AppLayout></PlatformAdminRouteGuard>} />
                <Route path="/platform/integrations/slack" element={<PlatformAdminRouteGuard><AppLayout><SlackIntegrationTests /></AppLayout></PlatformAdminRouteGuard>} />
                <Route path="/platform/integrations/google" element={<PlatformAdminRouteGuard><AppLayout><GoogleIntegrationTests /></AppLayout></PlatformAdminRouteGuard>} />
                <Route path="/platform/integrations/google/debug" element={<PlatformAdminRouteGuard><AppLayout><GoogleIntegrationTestsLegacy /></AppLayout></PlatformAdminRouteGuard>} />
                <Route path="/platform/integrations/savvycal/tests" element={<PlatformAdminRouteGuard><AppLayout><SavvyCalIntegrationTests /></AppLayout></PlatformAdminRouteGuard>} />
                <Route path="/platform/integrations/savvycal" element={<PlatformAdminRouteGuard><AppLayout><SettingsSavvyCal /></AppLayout></PlatformAdminRouteGuard>} />
                <Route path="/platform/integrations/booking-sources" element={<PlatformAdminRouteGuard><AppLayout><SettingsBookingSources /></AppLayout></PlatformAdminRouteGuard>} />
                <Route path="/platform/integrations/roadmap/:integrationId" element={<PlatformAdminRouteGuard><AppLayout><IntegrationRoadmap /></AppLayout></PlatformAdminRouteGuard>} />
                <Route path="/platform/integrations/roadmap" element={<PlatformAdminRouteGuard><AppLayout><IntegrationRoadmap /></AppLayout></PlatformAdminRouteGuard>} />
                {/* MeetingBaaS Bot Branding */}
                <Route path="/platform/integrations/notetaker-branding" element={<PlatformAdminRouteGuard><AppLayout><NotetakerBranding /></AppLayout></PlatformAdminRouteGuard>} />
                {/* MeetingBaaS Video Quality */}
                <Route path="/platform/integrations/notetaker-video-quality" element={<PlatformAdminRouteGuard><AppLayout><NotetakerVideoQuality /></AppLayout></PlatformAdminRouteGuard>} />
                {/* MeetingBaaS Recording Limit */}
                <Route path="/platform/integrations/notetaker-recording-limit" element={<PlatformAdminRouteGuard><AppLayout><NotetakerRecordingLimit /></AppLayout></PlatformAdminRouteGuard>} />
                {/* Integration Testing Dashboard - Main page */}
                <Route path="/platform/integrations" element={<PlatformAdminRouteGuard><AppLayout><IntegrationsDashboard /></AppLayout></PlatformAdminRouteGuard>} />
                {/* Platform Admin - Security & Audit */}
                <Route path="/platform/audit" element={<PlatformAdminRouteGuard><AppLayout><AuditLogs /></AppLayout></PlatformAdminRouteGuard>} />
                <Route path="/platform/usage" element={<PlatformAdminRouteGuard><AppLayout><SaasAdminDashboard /></AppLayout></PlatformAdminRouteGuard>} />
                {/* Platform Admin - Development Tools */}
                <Route path="/platform/dev/api-testing" element={<PlatformAdminRouteGuard><AppLayout><ApiTesting /></AppLayout></PlatformAdminRouteGuard>} />
                <Route path="/platform/dev/api-monitor" element={<PlatformAdminRouteGuard><AppLayout><ApiMonitor /></AppLayout></PlatformAdminRouteGuard>} />
                <Route path="/platform/dev/billing-analytics" element={<PlatformAdminRouteGuard><AppLayout><BillingAnalytics /></AppLayout></PlatformAdminRouteGuard>} />
                <Route path="/platform/dev/functions" element={<PlatformAdminRouteGuard><AppLayout><FunctionTesting /></AppLayout></PlatformAdminRouteGuard>} />
                <Route path="/platform/dev/function-testing" element={<PlatformAdminRouteGuard><AppLayout><FunctionTesting /></AppLayout></PlatformAdminRouteGuard>} />
                <Route path="/platform/onboarding-simulator" element={<InternalRouteGuard><AppLayout><OnboardingSimulator /></AppLayout></InternalRouteGuard>} />
                <Route path="/platform/quickadd-simulator" element={<PlatformAdminRouteGuard><AppLayout><QuickAddSimulator /></AppLayout></PlatformAdminRouteGuard>} />
                <Route path="/platform/trial-timeline" element={<InternalRouteGuard><AppLayout><TrialTimelineSimulator /></AppLayout></InternalRouteGuard>} />
                <Route path="/platform/launch-checklist" element={<PlatformAdminRouteGuard><AppLayout><LaunchChecklist /></AppLayout></PlatformAdminRouteGuard>} />
                <Route path="/platform/activation" element={<PlatformAdminRouteGuard><AppLayout><ActivationDashboard /></AppLayout></PlatformAdminRouteGuard>} />
                <Route path="/platform/engagement" element={<PlatformAdminRouteGuard><AppLayout><EngagementDashboard /></AppLayout></PlatformAdminRouteGuard>} />
                <Route path="/platform/engagement-simulator" element={<PlatformAdminRouteGuard><AppLayout><EngagementSimulator /></AppLayout></PlatformAdminRouteGuard>} />
                <Route path="/platform/vsl-analytics" element={<PlatformAdminRouteGuard><AppLayout><VSLAnalytics /></AppLayout></PlatformAdminRouteGuard>} />
                <Route path="/platform/meta-ads" element={<PlatformAdminRouteGuard><AppLayout><MetaAdsAnalytics /></AppLayout></PlatformAdminRouteGuard>} />
                <Route path="/platform/error-monitoring" element={<PlatformAdminRouteGuard><AppLayout><ErrorMonitoring /></AppLayout></PlatformAdminRouteGuard>} />
                <Route path="/platform/sentry-bridge" element={<PlatformAdminRouteGuard><AppLayout><SentryBridge /></AppLayout></PlatformAdminRouteGuard>} />
                <Route path="/platform/agent-simulator" element={<Navigate to="/platform/agent-abilities" replace />} />
                <Route path="/platform/proactive-simulator" element={<Navigate to="/platform/agent-abilities" replace />} />
                <Route path="/platform/proactive-v2-demo" element={<Navigate to="/platform/agent-abilities" replace />} />
                <Route path="/platform/deal-truth-simulator" element={<PlatformAdminRouteGuard><AppLayout><DealTruthSimulator /></AppLayout></PlatformAdminRouteGuard>} />
                <Route path="/platform/slack-demo" element={<PlatformAdminRouteGuard><AppLayout><SlackDemo /></AppLayout></PlatformAdminRouteGuard>} />
                {/* Cron Jobs Admin - Monitor and manage scheduled jobs */}
                <Route path="/platform/cron-jobs" element={<PlatformAdminRouteGuard><AppLayout><CronJobsAdmin /></AppLayout></PlatformAdminRouteGuard>} />
                {/* Meeting Intelligence demos removed — V1 Intelligence deleted */}
                {/* Tasks demo (internal-only): validate AI extraction + task creation */}
                <Route path="/platform/tasks-demo" element={<InternalRouteGuard><AppLayout><TasksDemo /></AppLayout></InternalRouteGuard>} />
                {/* Process Maps - AI-generated process visualization */}
                <Route path="/platform/process-maps" element={<InternalRouteGuard><AppLayout><ProcessMaps /></AppLayout></InternalRouteGuard>} />
                {/* Intelligence Test Runner removed — V1 Intelligence deleted */}
                {/* VSL Analytics Tests (internal-only): test video analytics tracking */}
                <Route path="/platform/vsl-analytics-tests" element={<InternalRouteGuard><AppLayout><VSLAnalyticsTests /></AppLayout></InternalRouteGuard>} />
                {/* Support Tickets - Platform Admin queue across all orgs */}
                <Route path="/platform/support-tickets" element={<PlatformAdminRouteGuard><AppLayout><SupportTicketsPage /></AppLayout></PlatformAdminRouteGuard>} />
                {/* Platform Dashboard - MUST be last (catch-all for /platform) */}
                <Route path="/platform" element={<PlatformAdminRouteGuard><AppLayout><PlatformDashboard /></AppLayout></PlatformAdminRouteGuard>} />

                {/* Internal-only tools */}
                <Route path="/workflows" element={<InternalRouteGuard><AppLayout><Workflows /></AppLayout></InternalRouteGuard>} />
                <Route path="/integrations" element={<AppLayout><Integrations /></AppLayout>} />
                {/* Email and Calendar routes redirect to Google services */}
                <Route path="/email" element={<ExternalRedirect url="https://mail.google.com" />} />
                {/* Email Action Center - Unified email draft review and sending */}
                <Route path="/email-actions" element={<AppLayout><EmailActionCenter /></AppLayout>} />
                <Route path="/email-actions/:id" element={<AppLayout><EmailActionCenter /></AppLayout>} />
                {/* Internal-only: Pipeline, Tasks */}
                <Route path="/pipeline" element={<InternalRouteGuard><AppLayout><PipelinePage /></AppLayout></InternalRouteGuard>} />
                <Route path="/tasks" element={<Navigate to="/command-centre" replace />} />
                <Route path="/crm/tasks" element={<Navigate to="/command-centre" replace />} />
                <Route path="/projects" element={<Navigate to="/command-centre" replace />} />
                <Route path="/ops" element={<InternalRouteGuard><AppLayout><OpsPage /></AppLayout></InternalRouteGuard>} />
                <Route path="/ops/apify" element={<InternalRouteGuard><AppLayout><ApifyOpsPage /></AppLayout></InternalRouteGuard>} />
                <Route path="/ops/:tableId" element={<InternalRouteGuard><AppLayout><OpsDetailPage /></AppLayout></InternalRouteGuard>} />
                {/* Unified profiles routes */}
                <Route path="/profiles" element={<InternalRouteGuard><AppLayout><ProfilesPage /></AppLayout></InternalRouteGuard>} />
                <Route path="/profiles/:id" element={<InternalRouteGuard><AppLayout><FactProfileViewPage /></AppLayout></InternalRouteGuard>} />
                <Route path="/profiles/:id/edit" element={<InternalRouteGuard><AppLayout><FactProfileEditPage /></AppLayout></InternalRouteGuard>} />
                <Route path="/profiles/products/:id" element={<InternalRouteGuard><AppLayout><ProductProfileViewPage /></AppLayout></InternalRouteGuard>} />
                <Route path="/profiles/products/:id/edit" element={<InternalRouteGuard><AppLayout><ProductProfileEditPage /></AppLayout></InternalRouteGuard>} />
                <Route path="/profiles/:id/products/:productId" element={<InternalRouteGuard><AppLayout><ProductProfileViewPage /></AppLayout></InternalRouteGuard>} />
                <Route path="/profiles/:id/products/:productId/edit" element={<InternalRouteGuard><AppLayout><ProductProfileEditPage /></AppLayout></InternalRouteGuard>} />
                {/* Redirects from old URLs */}
                <Route path="/fact-profiles" element={<Navigate to="/profiles?tab=companies" replace />} />
                <Route path="/fact-profiles/:id" element={<RedirectFactProfile />} />
                <Route path="/fact-profiles/:id/edit" element={<RedirectFactProfileEdit />} />
                <Route path="/docs" element={<AppLayout><DocsPage /></AppLayout>} />
                <Route path="/support" element={<AppLayout><SupportCentrePage /></AppLayout>} />
                <Route path="/tasks/settings" element={<Navigate to="/settings/task-sync" replace />} />
                <Route path="/calendar" element={<ExternalRedirect url="https://calendar.google.com" />} />
                <Route path="/events" element={<InternalRouteGuard><AppLayout><Events /></AppLayout></InternalRouteGuard>} />
                <Route path="/leads" element={<InternalRouteGuard><AppLayout><LeadsInbox /></AppLayout></InternalRouteGuard>} />

                {/* Form Display Routes */}
                <Route path="/form/:formId" element={<Suspense fallback={<IntelligentPreloader />}><FormDisplay /></Suspense>} />
                <Route path="/form-test/:formId" element={<Suspense fallback={<IntelligentPreloader />}><FormDisplay /></Suspense>} />

                {/* Redirect to Ops (CRM replaced) */}
                <Route path="/contacts" element={<Navigate to="/ops" replace />} />
                <Route path="/companies" element={<Navigate to="/ops" replace />} />

                {/* Legacy routes for backward compatibility */}
                <Route path="/heatmap" element={<Navigate to="/insights" replace />} />
                <Route path="/funnel" element={<Navigate to="/insights" replace />} />
                <Route path="/activity-processing" element={<Navigate to="/activity" replace />} />
                {/* Legacy redirects */}
                <Route path="/api-testing" element={<Navigate to="/platform/dev/api-testing" replace />} />
                <Route path="/crm/companies" element={<Navigate to="/ops" replace />} />
                <Route path="/crm/contacts" element={<Navigate to="/ops" replace />} />

                {/* Legacy redirects for 3-tier migration (keep for 3-6 months) */}
                <Route path="/saas-admin" element={<Navigate to="/platform" replace />} />
                <Route path="/settings/team" element={<Navigate to="/settings" replace />} />

                {/* Individual record routes - Internal only */}
                <Route path="/companies/:companyId" element={<InternalRouteGuard><AppLayout><CompanyProfile /></AppLayout></InternalRouteGuard>} />
                <Route path="/crm/companies/:companyId" element={<InternalRouteGuard><AppLayout><CompanyProfile /></AppLayout></InternalRouteGuard>} />
                <Route path="/crm/contacts/:id" element={<InternalRouteGuard><AppLayout><ContactRecord /></AppLayout></InternalRouteGuard>} />
                <Route path="/crm/deals/:id" element={<InternalRouteGuard><AppLayout><DealRecord /></AppLayout></InternalRouteGuard>} />
                <Route path="/crm/health" element={<InternalRouteGuard><AppLayout><HealthMonitoring /></AppLayout></InternalRouteGuard>} />
                <Route path="/crm/relationship-health" element={<Navigate to="/crm/pipeline?risk=high,critical" replace />} />
                <Route path="/crm/deal-health" element={<Navigate to="/crm/pipeline?health=critical,warning" replace />} />

                {/* Other internal-only routes */}
                <Route path="/payments" element={<Navigate to="/clients" replace />} />
                <Route path="/clients" element={<InternalRouteGuard><AppLayout><Clients /></AppLayout></InternalRouteGuard>} />
                <Route path="/subscriptions" element={<Navigate to="/clients" replace />} />
                <Route path="/profile" element={<AppLayout><Profile /></AppLayout>} />
                <Route path="/preferences" element={<Navigate to="/settings" replace />} />
                <Route path="/settings" element={<AppLayout><SettingsPage /></AppLayout>} />
                <Route path="/settings/account" element={<AppLayout><AccountSettings /></AppLayout>} />
                <Route path="/settings/appearance" element={<AppLayout><AppearanceSettings /></AppLayout>} />
                <Route path="/settings/proposals" element={<Navigate to="/settings/follow-ups" replace />} />
                <Route path="/settings/ai-personalization" element={<AppLayout><AIPersonalizationPage /></AppLayout>} />
                <Route path="/settings/ai-intelligence" element={<AppLayout><AIIntelligencePage /></AppLayout>} />
                <Route path="/settings/sales-coaching" element={<AppLayout><SalesCoachingPage /></AppLayout>} />
                <Route path="/settings/api-keys" element={<AppLayout><APIKeysPage /></AppLayout>} />
                <Route path="/settings/email-sync" element={<AppLayout><EmailSyncPage /></AppLayout>} />
                <Route path="/settings/task-sync" element={<AppLayout><TaskSyncPage /></AppLayout>} />
                <Route path="/settings/organization-management" element={<ProtectedRoute><AppLayout><OrganizationManagementPage /></AppLayout></ProtectedRoute>} />
                {/* Legacy routes for backwards compatibility */}
                <Route path="/settings/team-members" element={<ProtectedRoute><AppLayout><OrganizationManagementPage /></AppLayout></ProtectedRoute>} />
                <Route path="/settings/organization" element={<ProtectedRoute><AppLayout><OrganizationManagementPage /></AppLayout></ProtectedRoute>} />
                <Route path="/settings/branding" element={<Navigate to="/settings" replace />} />
                {/* Agent Marketplace - org admins */}
                <Route path="/agent/marketplace" element={
                  <OrgAdminRouteGuard>
                    <AppLayout>
                      <AgentMarketplacePage />
                    </AppLayout>
                  </OrgAdminRouteGuard>
                } />
                <Route path="/settings/billing" element={<OrgAdminRouteGuard><AppLayout><BillingSettingsPage /></AppLayout></OrgAdminRouteGuard>} />
                <Route path="/settings/credits" element={<AppLayout><CreditsSettingsPage /></AppLayout>} />
                <Route path="/settings/credits/success" element={<AppLayout><CreditPurchaseSuccess /></AppLayout>} />
                {/* Slack Settings - visible only when Slack is connected (enforced inside page) */}
                <Route path="/settings/integrations/slack" element={<AppLayout><SlackSettings /></AppLayout>} />
                {/* JustCall Settings - visible only when JustCall is connected (enforced inside page) */}
                <Route path="/settings/integrations/justcall" element={<AppLayout><JustCallSettings /></AppLayout>} />
                {/* HubSpot Settings - visible only when HubSpot is connected (enforced inside page) */}
                <Route path="/settings/integrations/hubspot" element={<AppLayout><HubSpotSettings /></AppLayout>} />
                {/* Attio Settings - visible only when Attio is connected (enforced inside page) */}
                <Route path="/settings/integrations/attio" element={<AppLayout><AttioSettings /></AppLayout>} />
                {/* Bullhorn Settings - visible only when Bullhorn is connected (enforced inside page) */}
                <Route path="/settings/integrations/bullhorn" element={<AppLayout><BullhornSettings /></AppLayout>} />
                {/* Instantly Settings */}
                <Route path="/settings/integrations/instantly" element={<AppLayout><InstantlySettings /></AppLayout>} />
                {/* Smart Listening Settings */}
                <Route path="/settings/smart-listening" element={<AppLayout><SmartListeningSettings /></AppLayout>} />
                {/* Proactive Agent Settings - admin only */}
                <Route path="/settings/proactive-agent" element={<AppLayout><ProactiveAgentSettings /></AppLayout>} />
                <Route path="/settings/bullhorn" element={<Navigate to="/settings/integrations/bullhorn" replace />} />
                {/* Google Workspace Settings - visible only when Google is connected (enforced inside page) */}
                <Route path="/settings/integrations/google-workspace" element={<AppLayout><GoogleWorkspaceIntegrationPage /></AppLayout>} />
                {/* Fathom Settings - visible only when Fathom is connected (enforced inside page) */}
                <Route path="/settings/integrations/fathom" element={<AppLayout><FathomIntegrationPage /></AppLayout>} />
                {/* Fireflies Settings - visible only when Fireflies is connected (enforced inside page) */}
                <Route path="/settings/integrations/fireflies" element={<AppLayout><FirefliesIntegrationPage /></AppLayout>} />
                {/* 60 Notetaker Settings - redirect to existing recordings settings page */}
                <Route path="/settings/integrations/60-notetaker" element={<Navigate to="/meetings/recordings/settings" replace />} />
                <Route path="/settings/ai" element={<AppLayout><AISettings /></AppLayout>} />
                <Route path="/settings/extraction-rules" element={<Navigate to="/settings/task-sync" replace />} />
                <Route path="/settings/task-sync" element={<AppLayout><TaskSyncSettings /></AppLayout>} />
                <Route path="/settings/call-types" element={<AppLayout><CallTypeSettings /></AppLayout>} />
                <Route path="/settings/pipeline-automation" element={<AppLayout><PipelineAutomationSettings /></AppLayout>} />
                <Route path="/settings/follow-ups" element={<AppLayout><FollowUpSettings /></AppLayout>} />
                <Route path="/settings/proposal-workflows" element={<Navigate to="/settings/follow-ups" replace />} />
                <Route path="/settings/coaching" element={<AppLayout><CoachingPreferences /></AppLayout>} />
                <Route path="/meeting-analytics/:transcriptId" element={<AppLayout><MeetingAnalyticsPage /></AppLayout>} />
                <Route path="/meeting-analytics" element={<AppLayout><MeetingAnalyticsPage /></AppLayout>} />
                <Route path="/insights/team" element={<AppLayout><TeamAnalytics /></AppLayout>} />
                <Route path="/insights/content-topics" element={<AppLayout><ContentTopics /></AppLayout>} />
                <Route path="/roadmap" element={<AppLayout><Roadmap /></AppLayout>} />
                <Route path="/roadmap/ticket/:ticketId" element={<AppLayout><Roadmap /></AppLayout>} />
                <Route path="/releases" element={<AppLayout><Releases /></AppLayout>} />
                <Route path="/meetings/*" element={<AppLayout><MeetingsPage /></AppLayout>} />
                {/* Meeting detail and recordings are handled by nested routing in /meetings/* (src/pages/MeetingsPage.tsx) */}
                {/* Recordings are now at /meetings/recordings/* - integrated into meetings */}
                <Route path="/calls" element={<AppLayout><Calls /></AppLayout>} />
                <Route path="/calls/:id" element={<AppLayout><CallDetail /></AppLayout>} />
                <Route path="/voice" element={<AppLayout><VoiceRecorder /></AppLayout>} />
                <Route path="/voice/:recordingId" element={<AppLayout><VoiceRecordingDetail /></AppLayout>} />
                <Route path="/debug-meetings" element={<AppLayout><DebugMeetings /></AppLayout>} />
                <Route path="/test-notifications" element={<AppLayout><TestNotifications /></AppLayout>} />
                <Route path="/freepik-flow" element={<AppLayout><div className="h-[calc(100vh-4rem)]"><FreepikFlow /></div></AppLayout>} />
                <Route path="/test-fallback" element={<ProtectedRoute><TestFallback /></ProtectedRoute>} />
                <Route path="/test-google-tasks" element={<AppLayout><TestGoogleTasks /></AppLayout>} />
              </Routes>
            </Suspense>
          </ProtectedRoute>
        } />
      </Routes>
      <Toaster />
      <SentryDebugPanel />
      <VersionManager />
      <div className="fixed inset-0 bg-[radial-gradient(ellipse_at_top,rgba(74,74,117,0.15),transparent)] pointer-events-none" />
    </>
  );
}

export default App;