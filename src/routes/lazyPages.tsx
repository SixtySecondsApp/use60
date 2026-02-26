/**
 * Lazy-loaded page components for route code-splitting
 * Organized by category for maintainability
 */
import { lazyWithRetry } from '@/lib/utils/dynamicImport';

// ============================================================
// PLATFORM ADMIN PAGES
// ============================================================
export const MeetingsWaitlist = lazyWithRetry(() => import('@/pages/platform/MeetingsWaitlist'));
export const WaitlistSlackSettings = lazyWithRetry(() => import('@/pages/platform/WaitlistSlackSettings'));
export const OnboardingSimulator = lazyWithRetry(() => import('@/pages/platform/OnboardingSimulator'));
export const TrialTimelineSimulator = lazyWithRetry(() => import('@/pages/platform/TrialTimelineSimulator'));
export const DealTruthSimulator = lazyWithRetry(() => import('@/pages/platform/DealTruthSimulator'));
export const PricingControl = lazyWithRetry(() => import('@/pages/platform/PricingControl'));
export const CostAnalysis = lazyWithRetry(() => import('@/pages/platform/CostAnalysis'));
export const AIUsageAdmin = lazyWithRetry(() => import('@/pages/platform/AIUsageAdmin'));
export const ApiUsageDashboard = lazyWithRetry(() => import('@/pages/platform/ApiUsageDashboard'));
export const LaunchChecklist = lazyWithRetry(() => import('@/pages/platform/LaunchChecklist'));
export const ActivationDashboard = lazyWithRetry(() => import('@/pages/platform/ActivationDashboard'));
export const EngagementDashboard = lazyWithRetry(() => import('@/pages/platform/EngagementDashboard'));
export const EngagementSimulator = lazyWithRetry(() => import('@/pages/platform/EngagementSimulator'));
export const PlatformDashboard = lazyWithRetry(() => import('@/pages/platform/PlatformDashboard'));
export const IntegrationRoadmap = lazyWithRetry(() => import('@/pages/platform/IntegrationRoadmap'));
export const VSLAnalytics = lazyWithRetry(() => import('@/pages/platform/VSLAnalytics'));
export const MetaAdsAnalytics = lazyWithRetry(() => import('@/pages/platform/MetaAdsAnalytics'));
export const ErrorMonitoring = lazyWithRetry(() => import('@/pages/platform/ErrorMonitoring'));
export const SentryBridge = lazyWithRetry(() => import('@/pages/platform/SentryBridge'));
export const SkillsAdmin = lazyWithRetry(() => import('@/pages/platform/SkillsAdmin'));
export const SkillsQAPage = lazyWithRetry(() => import('@/pages/platform/SkillsQAPage'));
export const PlatformSkillViewPage = lazyWithRetry(() => import('@/pages/platform/PlatformSkillViewPage'));
export const PlatformSkillEditPage = lazyWithRetry(() => import('@/pages/platform/PlatformSkillEditPage'));
export const SkillDetailPage = lazyWithRetry(() => import('@/pages/skills/SkillDetailPage'));
export const AgentSequencesPage = lazyWithRetry(() => import('@/pages/platform/AgentSequencesPage'));
export const AgentSequenceBuilderPage = lazyWithRetry(() => import('@/pages/platform/AgentSequenceBuilderPage'));
export const CopilotTestPage = lazyWithRetry(() => import('@/pages/platform/CopilotTestPage'));
export const CopilotLabPage = lazyWithRetry(() => import('@/pages/platform/CopilotLabPage'));
export const AgentPerformanceDashboard = lazyWithRetry(() => import('@/pages/platform/AgentPerformanceDashboard'));
export const CopilotConsolePage = lazyWithRetry(() => import('@/pages/platform/CopilotConsolePage'));
export const NotetakerBranding = lazyWithRetry(() => import('@/pages/platform/NotetakerBranding'));
export const NotetakerVideoQuality = lazyWithRetry(() => import('@/pages/platform/NotetakerVideoQuality'));
export const NotetakerRecordingLimit = lazyWithRetry(() => import('@/pages/platform/NotetakerRecordingLimit'));
export const ActionCentre = lazyWithRetry(() => import('@/pages/platform/ActionCentre'));
export const CommandCentre = lazyWithRetry(() => import('@/pages/platform/CommandCentre'));
export const CommandCentreDemo = lazyWithRetry(() => import('@/pages/platform/CommandCentreDemo'));
export const CommandCentreV2Demo = lazyWithRetry(() => import('@/pages/platform/CommandCentreV2Demo'));
export const CommandCentreWowDemo = lazyWithRetry(() => import('@/pages/platform/CommandCentreWowDemo'));
export const CommitmentDetectionDemo = lazyWithRetry(() => import('@/pages/platform/CommitmentDetectionDemo'));
export const AgentTeamSettings = lazyWithRetry(() => import('@/pages/platform/AgentTeamSettings'));
export const MultiAgentDemoPage = lazyWithRetry(() => import('@/pages/platform/MultiAgentDemoPage'));
export const DemoPrepBriefing = lazyWithRetry(() => import('@/pages/platform/DemoPrepBriefing'));
export const DemoConversationalCopilot = lazyWithRetry(() => import('@/pages/platform/DemoConversationalCopilot'));
export const AutonomyDemoPage = lazyWithRetry(() => import('@/pages/platform/AutonomyDemoPage'));
export const AutopilotTestPage = lazyWithRetry(() => import('@/pages/platform/AutopilotTestPage'));
export const AgentTeamsLiveDemoPage = lazyWithRetry(() => import('@/pages/platform/AgentTeamsLiveDemoPage'));
export const AgentAbilitiesPage = lazyWithRetry(() => import('@/pages/platform/AgentAbilitiesPage'));
export const OrchestratorDashboard = lazyWithRetry(() => import('@/pages/platform/OrchestratorDashboard'));
export const CreditSystemDemo = lazyWithRetry(() => import('@/pages/platform/CreditSystemDemo'));
export const AIModelAdmin = lazyWithRetry(() => import('@/pages/platform/AIModelAdmin'));
export const CreditMenuAdmin = lazyWithRetry(() => import('@/pages/platform/CreditMenuAdmin'));
export const EnrichmentComparisonDemo = lazyWithRetry(() => import('@/pages/demo/EnrichmentComparison'));
export const ResearchComparisonDemo = lazyWithRetry(() => import('@/pages/demo/ResearchComparison'));
export const ExaAbilitiesDemo = lazyWithRetry(() => import('@/pages/demo/ExaAbilitiesDemo'));
export const EmailSequenceTest = lazyWithRetry(() => import('@/pages/demo/EmailSequenceTest'));
export const AgentResearchDemo = lazyWithRetry(() => import('@/pages/demo/AgentResearchDemo'));
export const CampaignWorkflowDemo = lazyWithRetry(() => import('@/pages/demo/CampaignWorkflowDemo'));
export const OpsWebhookDemo = lazyWithRetry(() => import('@/pages/demo/OpsWebhookDemo'));
// Admin Configuration
export const ControlRoom = lazyWithRetry(() => import('@/pages/admin/ControlRoom'));
export const Users = lazyWithRetry(() => import('@/pages/admin/Users'));
export const PipelineSettings = lazyWithRetry(() => import('@/pages/admin/PipelineSettings'));
export const AuditLogs = lazyWithRetry(() => import('@/pages/admin/AuditLogs'));
export const SmartTasksAdmin = lazyWithRetry(() => import('@/pages/SmartTasksAdmin'));
export const PipelineAutomationAdmin = lazyWithRetry(() => import('@/pages/PipelineAutomationAdmin'));
export const EmailTemplates = lazyWithRetry(() =>
  import('@/pages/admin/EmailTemplates').catch((err) => {
    console.error('Failed to load EmailTemplates:', err);
    return { default: () => <div>Error loading Email Templates. Check console.</div> };
  })
);
export const FunctionTesting = lazyWithRetry(() => import('@/pages/admin/FunctionTesting'));
export const AIProviderSettings = lazyWithRetry(() => import('@/components/settings/AIProviderSettings'));
export const GoogleIntegrationTestsLegacy = lazyWithRetry(() => import('@/components/admin/GoogleIntegrationTests').then(m => ({ default: m.GoogleIntegrationTests })));
export const GoogleIntegrationTests = lazyWithRetry(() => import('@/pages/admin/GoogleIntegrationTestsNew'));
export const SettingsSavvyCal = lazyWithRetry(() => import('@/pages/admin/SettingsSavvyCal'));
export const SettingsBookingSources = lazyWithRetry(() => import('@/pages/admin/SettingsBookingSources'));
export const HealthRules = lazyWithRetry(() => import('@/pages/admin/HealthRules'));
export const EmailCategorizationSettings = lazyWithRetry(() => import('@/pages/admin/EmailCategorizationSettings'));
export const AdminModelSettings = lazyWithRetry(() => import('@/pages/admin/AdminModelSettings'));
export const AdminPromptSettings = lazyWithRetry(() => import('@/pages/admin/PromptSettings'));
export const InternalDomainsSettings = lazyWithRetry(() => import('@/pages/admin/InternalDomainsSettings'));
export const SlackDemo = lazyWithRetry(() => import('@/pages/admin/SlackDemo'));
// MeetingIntelligenceDemo and MeetingIntelligenceDemoSimple removed — V1 Intelligence deleted
export const TasksDemo = lazyWithRetry(() => import('@/pages/admin/TasksDemo'));
export const ProcessMaps = lazyWithRetry(() => import('@/pages/admin/ProcessMaps'));
// IntelligenceTestRunner removed — V1 Intelligence deleted
export const VSLAnalyticsTests = lazyWithRetry(() => import('@/pages/admin/VSLAnalyticsTests'));
export const CronJobsAdmin = lazyWithRetry(() => import('@/pages/admin/CronJobsAdmin'));
export const ApiMonitor = lazyWithRetry(() => import('@/pages/admin/ApiMonitor'));
export const BillingAnalytics = lazyWithRetry(() => import('@/pages/admin/BillingAnalytics'));
export const SaasAdminDashboard = lazyWithRetry(() => import('@/pages/SaasAdminDashboard'));
export const QuickAddSimulator = lazyWithRetry(() => import('@/pages/platform/QuickAddSimulator'));
export const EmailActionCenter = lazyWithRetry(() => import('@/pages/EmailActionCenter'));
export const DocsAdminPage = lazyWithRetry(() => import('@/pages/platform/DocsAdminPage'));

// Integration Testing
export const IntegrationsDashboard = lazyWithRetry(() => import('@/pages/admin/IntegrationsDashboard'));
export const FathomIntegrationTests = lazyWithRetry(() => import('@/pages/admin/FathomIntegrationTests'));
export const HubSpotIntegrationTests = lazyWithRetry(() => import('@/pages/admin/HubSpotIntegrationTests'));
export const SlackIntegrationTests = lazyWithRetry(() => import('@/pages/admin/SlackIntegrationTests'));
export const SavvyCalIntegrationTests = lazyWithRetry(() => import('@/pages/admin/SavvyCalIntegrationTests'));

// ============================================================
// AUTH PAGES
// ============================================================
export const Signup = lazyWithRetry(() => import('@/pages/auth/signup'));
export const VerifyEmail = lazyWithRetry(() => import('@/pages/auth/VerifyEmail'));
export const ForgotPassword = lazyWithRetry(() => import('@/pages/auth/forgot-password'));
export const ResetPassword = lazyWithRetry(() => import('@/pages/auth/reset-password'));
export const SetPassword = lazyWithRetry(() => import('@/pages/auth/SetPassword'));
export const UpdatePassword = lazyWithRetry(() => import('@/pages/auth/UpdatePassword'));
export const Onboarding = lazyWithRetry(() => import('@/pages/onboarding'));

// ============================================================
// CRM & DATA PAGES
// ============================================================
// CRM and ElegantCRM removed — replaced by Ops
export const PipelinePage = lazyWithRetry(() => import('@/pages/PipelinePage').then(module => ({ default: module.PipelinePage })));
export const FormDisplay = lazyWithRetry(() => import('@/pages/FormDisplay'));
export const CompaniesTable = lazyWithRetry(() => import('@/pages/companies/CompaniesTable'));
export const CompanyProfile = lazyWithRetry(() => import('@/pages/companies/CompanyProfile'));
export const ContactsTable = lazyWithRetry(() => import('@/pages/contacts/ContactsTable'));
export const ContactRecord = lazyWithRetry(() => import('@/pages/contacts/ContactRecord'));
export const DealRecord = lazyWithRetry(() => import('@/pages/deals/DealRecord'));
export const LeadsInbox = lazyWithRetry(() => import('@/pages/leads/LeadsInbox'));
export const Clients = lazyWithRetry(() => import('@/pages/Clients'));

// Health Monitoring
export const HealthMonitoring = lazyWithRetry(() => import('@/pages/HealthMonitoring'));

// ============================================================
// FEATURE PAGES (Meetings, Calls, Tasks, etc.)
// ============================================================
export const MeetingsPage = lazyWithRetry(() => import('@/pages/MeetingsPage'));
// MeetingIntelligence and MeetingSentimentAnalytics removed — V1 Intelligence deleted
export const Calls = lazyWithRetry(() => import('@/pages/Calls'));
export const CallDetail = lazyWithRetry(() => import('@/pages/CallDetail'));
export const VoiceRecorder = lazyWithRetry(() => import('@/pages/VoiceRecorder'));
export const VoiceRecordingDetail = lazyWithRetry(() => import('@/pages/VoiceRecordingDetailPage'));
// TasksPage, ProjectsHub, GoogleTasksSettings removed — replaced by Command Centre
export const Events = lazyWithRetry(() => import('@/pages/Events'));
export const ActivityLog = lazyWithRetry(() => import('@/pages/ActivityLog'));
export const ActivityProcessingPage = lazyWithRetry(() => import('@/pages/ActivityProcessingPage'));
export const Workflows = lazyWithRetry(() => import('@/pages/Workflows'));
export const FreepikFlow = lazyWithRetry(() => import('@/components/workflows/FreepikFlow'));
export const Copilot = lazyWithRetry(() => import('@/components/Copilot').then(m => ({ default: m.Copilot })));
export const CopilotPage = lazyWithRetry(() => import('@/pages/CopilotPage'));
export const OpsPage = lazyWithRetry(() => import('@/pages/OpsPage'));
export const OpsDetailPage = lazyWithRetry(() => import('@/pages/OpsDetailPage'));
export const ApifyOpsPage = lazyWithRetry(() => import('@/pages/ApifyOpsPage'));
export const ProspectingPage = lazyWithRetry(() => import('@/pages/ProspectingPage'));
export const FactProfilesPage = lazyWithRetry(() => import('@/pages/FactProfilesPage'));
export const ProfilesPage = lazyWithRetry(() => import('@/pages/ProfilesPage'));
export const FactProfileViewPage = lazyWithRetry(() => import('@/pages/FactProfileViewPage'));
export const FactProfileEditPage = lazyWithRetry(() => import('@/pages/FactProfileEditPage'));
export const ProductProfileViewPage = lazyWithRetry(() => import('@/pages/ProductProfileViewPage'));
export const ProductProfileEditPage = lazyWithRetry(() => import('@/pages/ProductProfileEditPage'));
export const DocsPage = lazyWithRetry(() => import('@/pages/DocsPage'));
export const SupportCentrePage = lazyWithRetry(() => import('@/pages/SupportCentrePage'));
export const SupportTicketsPage = lazyWithRetry(() => import('@/pages/platform/SupportTicketsPage'));

// ============================================================
// SETTINGS PAGES
// ============================================================
export const SettingsPage = lazyWithRetry(() => import('@/pages/Settings'));
export const Preferences = lazyWithRetry(() => import('@/pages/Preferences'));
export const Profile = lazyWithRetry(() => import('@/pages/Profile'));
export const AISettings = lazyWithRetry(() => import('@/pages/settings/AISettings'));
export const TaskSyncSettings = lazyWithRetry(() => import('@/pages/settings/TaskSyncSettings'));
export const CoachingPreferences = lazyWithRetry(() => import('@/pages/settings/CoachingPreferences'));
export const AccountSettings = lazyWithRetry(() => import('@/pages/settings/AccountSettings'));
export const AppearanceSettings = lazyWithRetry(() => import('@/pages/settings/AppearanceSettings'));
export const AIPersonalizationPage = lazyWithRetry(() => import('@/pages/settings/AIPersonalizationPage'));
export const AIIntelligencePage = lazyWithRetry(() => import('@/pages/settings/AIIntelligencePage'));
export const SalesCoachingPage = lazyWithRetry(() => import('@/pages/settings/SalesCoachingPage'));
export const APIKeysPage = lazyWithRetry(() => import('@/pages/settings/APIKeysPage'));
export const EmailSyncPage = lazyWithRetry(() => import('@/pages/settings/EmailSyncPage'));
export const TaskSyncPage = lazyWithRetry(() => import('@/pages/settings/TaskSyncPage'));
export const TeamMembersPage = lazyWithRetry(() => import('@/pages/settings/TeamMembersPage'));
export const OrganizationManagementPage = lazyWithRetry(() => import('@/pages/settings/OrganizationManagementPage'));
export const CallTypeSettings = lazyWithRetry(() => import('@/pages/settings/CallTypeSettings'));
export const PipelineAutomationSettings = lazyWithRetry(() => import('@/pages/settings/PipelineAutomationSettings'));
export const FollowUpSettings = lazyWithRetry(() => import('@/pages/settings/FollowUpSettings'));
export const OrganizationSettingsPage = lazyWithRetry(() => import('@/pages/settings/OrganizationSettingsPage'));
export const LogoSettings = lazyWithRetry(() => import('@/pages/settings/LogoSettings'));
export const SlackSettings = lazyWithRetry(() => import('@/pages/settings/SlackSettings'));
export const ProactiveAgentSettings = lazyWithRetry(() => import('@/pages/settings/ProactiveAgentSettings'));
export const AutonomySettingsPage = lazyWithRetry(() => import('@/pages/settings/AutonomySettingsPage'));
export const SalesMethodologySettings = lazyWithRetry(() => import('@/pages/settings/SalesMethodologySettings'));
export const CRMFieldMappingSettings = lazyWithRetry(() => import('@/pages/settings/CRMFieldMappingSettings'));
export const CustomSOPBuilderPage = lazyWithRetry(() => import('@/pages/settings/CustomSOPBuilderPage'));
export const SignalIntelligenceSettings = lazyWithRetry(() => import('@/pages/settings/SignalIntelligenceSettings'));
export const KnowledgeMemorySettings = lazyWithRetry(() => import('@/pages/settings/KnowledgeMemorySettings'));
export const JustCallSettings = lazyWithRetry(() => import('@/pages/settings/JustCallSettings'));
export const HubSpotSettings = lazyWithRetry(() => import('@/pages/settings/HubSpotSettings'));
export const AttioSettings = lazyWithRetry(() => import('@/pages/settings/AttioSettings'));
export const BullhornSettings = lazyWithRetry(() => import('@/pages/settings/BullhornSettings'));
export const InstantlySettings = lazyWithRetry(() => import('@/pages/settings/InstantlySettings'));
export const SmartListeningSettings = lazyWithRetry(() => import('@/pages/settings/SmartListeningSettings'));
export const CreditPurchaseSuccess = lazyWithRetry(() => import('@/pages/settings/CreditPurchaseSuccess'));
export const CreditsSettingsPage = lazyWithRetry(() => import('@/pages/settings/CreditsSettingsPage'));
export const BillingSettingsPage = lazyWithRetry(() => import('@/pages/settings/BillingSettingsPage'));
export const SalesGoalsPage = lazyWithRetry(() => import('@/pages/settings/SalesGoalsPage'));
// Integration settings pages (dedicated settings for each integration)
export const GoogleWorkspaceIntegrationPage = lazyWithRetry(() => import('@/pages/settings/integrations/GoogleWorkspaceIntegrationPage'));
export const FathomIntegrationPage = lazyWithRetry(() => import('@/pages/settings/integrations/FathomIntegrationPage'));
export const FirefliesIntegrationPage = lazyWithRetry(() => import('@/pages/settings/integrations/FirefliesIntegrationPage'));
export const MeetingSettingsPage = lazyWithRetry(() => import('@/pages/settings/MeetingSettingsPage'));

// Org Settings (moved from /org routes)
export const OrgBranding = lazyWithRetry(() => import('@/pages/org/OrgBranding'));
export const OrgBilling = lazyWithRetry(() => import('@/pages/OrgBilling'));

// ============================================================
// INSIGHTS & ANALYTICS PAGES
// ============================================================
export const Insights = lazyWithRetry(() => import('@/pages/Insights'));
export const Heatmap = lazyWithRetry(() => import('@/pages/Heatmap'));
export const SalesFunnel = lazyWithRetry(() => import('@/pages/SalesFunnel'));
export const TeamAnalytics = lazyWithRetry(() => import('@/pages/insights/TeamAnalytics'));
export const ContentTopics = lazyWithRetry(() => import('@/pages/insights/ContentTopics'));
export const MeetingAnalyticsPage = lazyWithRetry(() => import('@/pages/MeetingAnalyticsPage'));

// ============================================================
// MISC & UTILITY PAGES
// ============================================================
export const Integrations = lazyWithRetry(() => import('@/pages/Integrations'));
export const PublicFactProfile = lazyWithRetry(() => import('@/pages/public/PublicFactProfile'));
export const GoogleCallback = lazyWithRetry(() => import('@/pages/GoogleCallback'));
export const Roadmap = lazyWithRetry(() => import('@/pages/Roadmap'));
export const Releases = lazyWithRetry(() => import('@/pages/Releases'));
export const ApiTesting = lazyWithRetry(() => import('@/pages/ApiTesting'));
export const TestFallback = lazyWithRetry(() => import('@/pages/TestFallback'));

// ============================================================
// DEBUG PAGES (Development)
// ============================================================
export const DebugAuth = lazyWithRetry(() => import('@/pages/DebugAuth'));
export const AuthDebug = lazyWithRetry(() => import('@/pages/debug/AuthDebug'));
export const DebugPermissions = lazyWithRetry(() => import('@/pages/DebugPermissions'));
export const DebugMeetings = lazyWithRetry(() => import('@/pages/DebugMeetings'));
export const TestNotifications = lazyWithRetry(() => import('@/pages/TestNotifications'));
