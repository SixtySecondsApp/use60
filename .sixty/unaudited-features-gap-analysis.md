# Unaudited Features Gap Analysis

Generated: 2026-03-01
Analysis: Exploration of features/functions NOT covered by AUDIT-001 through AUDIT-065

## Executive Summary

The codebase contains **487 edge functions** across the application. The feature audit (AUDIT-001 through AUDIT-065) covered **65 major user-facing features** but left **~380+ functions unaudited**. This represents approximately **89% of the edge function codebase** that has not been reviewed for security, infrastructure, or auth patterns.

This is intentional—the audit correctly prioritized user-visible features. However, the gap creates **blind spots in critical infrastructure** (billing, integrations, CRM sync, agents) that should be flagged for follow-up audits.

---

## Complete List of Unaudited Functions by Category

### 1. Agent Fleet & Autonomous Operations (~35 functions)

**Not covered by AUDIT-043 (6-Agent Specialist Fleet)**

- `agent-config-admin` — admin interface for agent configuration
- `agent-crm-approval` — CRM approval flows for agents
- `agent-crm-heartbeat` — CRM health monitoring
- `agent-crm-update` — CRM write-back operations
- `agent-deal-temperature` — deal temperature scoring (separate from deal health)
- `agent-email-signals` — email signal detection & classification
- `agent-engagement-patterns` — engagement pattern analysis
- `agent-eod-synthesis` — end-of-day summary synthesis
- `agent-initial-scan` — initial org scan on setup
- `agent-morning-briefing` — daily morning briefing generation
- `agent-org-learning` — org-level learning from historical data
- `agent-pipeline-patterns` — pipeline pattern discovery
- `agent-pipeline-snapshot` — pipeline state snapshots
- `agent-reengagement` — stale deal reengagement triggers
- `agent-relationship-graph` — relationship mapping between contacts/companies
- `agent-trigger` — agent triggering & routing logic
- `agent-dead-letter-retry` — failure recovery
- `autopilot-admin` — autopilot configuration
- `autopilot-backfill` — historical backfill for autopilot
- `autopilot-evaluate` — autopilot performance evaluation
- `autopilot-record-signal` — signal recording for autopilot learning

**Risk Profile**: Medium. Agent functions run autonomously with service-role access and could cause issues if auth/cost controls are weak.

---

### 2. Public REST API Endpoints (~20 functions)

**Not covered by AUDIT-065 (Public REST API)**

- `api-v1-activities` — GET/POST activities REST endpoint
- `api-v1-companies` — companies REST endpoint
- `api-v1-contacts` — contacts REST endpoint
- `api-v1-deals` — deals REST endpoint
- `api-v1-meetings` — meetings REST endpoint
- `api-v1-tasks` — tasks REST endpoint
- `api-auth` — OAuth orchestration for APIs
- `api-monitor-notify` — API health notifications
- `api-proxy` — request proxying
- `api-skill-builder` — skill definition builder
- `api-usage-alerts` — usage-based alerts
- `api-usage-cron` — usage tracking jobs

**Risk Profile**: High. Public endpoints are directly exposed; auth/rate-limiting gaps could enable data exfiltration or DoS.

---

### 3. Apify Web Scraping Ecosystem (~10 functions)

**Not covered by AUDIT-038 (Web Scraping Marketplace)**

- `apify-actor-introspect` — actor metadata discovery
- `apify-auto-map` — automatic field mapping from scraper output
- `apify-connect` — Apify connection/auth
- `apify-linkedin-enrich` — LinkedIn scraping for enrichment
- `apify-multi-query` — parallel scraping queries
- `apify-run-start` — actor job submission
- `apify-run-webhook` — webhook callback processing

**Risk Profile**: Medium. Scraping infrastructure could have rate-limit or cost-tracking gaps.

---

### 4. Slack Notifications & Interactions (~20+ functions)

**Not covered by AUDIT-042 (Slack Sales Assistant)**

AUDIT-042 covered the conversational copilot; these handle async notifications:

- `notification-triage` — notification routing & dedup
- `slack-deal-momentum` — deal momentum alerts
- `slack-deal-room-archive` — deal room lifecycle
- `slack-deal-room-update` — deal room state updates
- `slack-email-reply-alert` — new reply notifications
- `slack-expire-actions` — action expiration
- `slack-interactive` — interactive component handlers
- `slack-join-channel` — channel joining
- `slack-list-channels` — channel enumeration
- `slack-morning-brief` — scheduled briefing
- `slack-self-map` — self-mapping broadcast
- `slack-slash-commands` — slash command handling
- `slack-snooze-check` — snooze state checks
- `slack-task-reminders` — task reminder scheduling
- `slack-test-message` — testing endpoint
- `slack-refresh-user-channels` — channel sync
- `send-slack-notification`, `send-slack-task-notification`, `send-slack-message` — message sending
- `route-message` — smart message routing
- `send-org-notification-slack` — org-wide notifications

**Risk Profile**: Medium. Notification system is large surface; spam/rate-limit gaps possible.

---

### 5. Transcription & Recording Pipeline (~25 functions)

**Not covered by AUDIT-011 (Call Recording & Transcription)**

AUDIT-011 covered high-level recording. These handle multi-provider abstraction:

- `backfill-notetaker-transcripts` — bulk transcript loading
- `backfill-transcripts` — transcript backfill jobs
- `fetch-deepgram-usage` — Deepgram usage tracking
- `fetch-gladia-usage` — Gladia usage tracking
- `fetch-meetingbaas-usage` — MeetingBaaS usage tracking
- `generate-video-thumbnail`, `generate-video-thumbnail-v2`, `generate-s3-video-thumbnail` — thumbnail generation (3 versions in codebase)
- `meeting-limit-warning-email` — quota warning emails
- `poll-gladia-jobs` — async job polling
- `poll-transcription-queue` — general transcription queue polling
- `process-transcription-callback` — callback processing
- `process-gladia-webhook` — Gladia webhook handler
- `upload-recording-to-s3` — storage operations
- `voice-transcribe` — voice note transcription
- `voice-transcribe-poll` — polling for voice transcription
- `voice-upload` — voice note upload
- `voice-audio-url` — audio URL generation
- `voice-presigned-url` — presigned URL generation
- `voice-share` — voice sharing setup
- `voice-share-playback` — voice sharing playback
- `backfill-thumbnails` — bulk thumbnail generation
- `proxy-fathom-video` — Fathom video proxying
- `fetch-transcript` — transcript fetching
- `process-recording` — recording processing

**Risk Profile**: High. Multi-provider abstraction with cost tracking; gaps could lead to cost overruns or provider API issues.

---

### 6. Enrichment Data Pipeline (~15 functions)

**Not covered by AUDIT-037 (Waterfall Enrichment) at provider level**

- `ai-ark-credits` — AI Ark credit tracking
- `ai-ark-enrich` — AI Ark enrichment calls
- `ai-ark-semantic`, `ai-ark-similarity` — AI Ark semantic search
- `apollo-collect-more` — Apollo pagination
- `apollo-credits` — Apollo credit tracking
- `apollo-enrich`, `apollo-org-enrich` — Apollo enrichment
- `apollo-reveal` — Apollo reveal (email finder)
- `deep-enrich-organization` — org enrichment orchestration
- `enrich-cascade`, `enrich-company`, `enrich-crm-record`, `enrich-organization` — general enrichment
- `explorium-enrich`, `explorium-match`, `explorium-search` — Explorium provider
- `auto-verify-email` — email verification service

**Risk Profile**: High. Each provider has separate credit tracking; inconsistencies could lead to billing issues.

---

### 7. Email Infrastructure (~15 functions)

**Not covered by AUDIT-014 (HITL Follow-Up Email)**

AUDIT-014 covered the manual follow-up flow. These handle transactional & sync:

- `encharge-email`, `encharge-send-email` — Encharge integration
- `email-send-as-rep` — core email sending (mentioned in AUDIT-014 but not fully reviewed)
- `categorize-email` — email categorization service
- `gmail-apply-labels`, `gmail-push-webhook` — Gmail webhooks
- `ms-graph-email` — Microsoft Graph integration
- `first-meeting-synced-email` — transactional email on first meeting
- `subscription-confirmed-email` — Stripe subscription email
- `org-approval-email` — org creation approval email
- `permission-to-close-email` — permission notification
- `scheduled-email-sync` — email sync jobs
- `scheduled-encharge-emails` — Encharge sync
- `scheduled-google-context-sync` — Gmail context sync

**Risk Profile**: Medium. Transactional emails could expose user data if not handled carefully.

---

### 8. CRM Integration Provider Infrastructure (~30+ functions)

**Not covered by AUDIT-053 (14 Native Integrations)**

AUDIT-053 covered the API surface; these handle OAuth, webhooks, and sync:

**Per-provider OAuth flows** (×8+ providers):
- `bullhorn-oauth-callback`, `bullhorn-oauth-initiate`, `bullhorn-disconnect`, `bullhorn-admin`, `bullhorn-process-queue`, `bullhorn-token-refresh`, `bullhorn-webhook`
- `justcall-oauth-callback`, `justcall-oauth-initiate`, `justcall-config`, `justcall-search`, `justcall-sync`, `justcall-webhook`
- `attio-oauth-callback`, `attio-oauth-initiate`, `attio-admin`, `attio-disconnect`, `attio-list-ops`, `attio-process-queue`, `attio-token-refresh`, `attio-webhook`
- `fireflies-sync`, `fathom-*` (10+ functions)
- Similar patterns for Google, Slack, etc.

**CRM write-back & sync**:
- `crm-writeback-worker` — batch CRM updates
- `push-cell-to-attio`, `push-cell-to-hubspot`, `push-to-attio`, `push-to-hubspot`, `push-to-instantly` — cell pushing
- `populate-attio-column`, `populate-hubspot-column` — column population
- `sync-attio-ops-table`, `sync-hubspot-ops-table`, `sync-instantly-engagement` — sync jobs
- `revert-hubspot-sync` — rollback capability
- `hubspot-initial-sync`, `import-from-hubspot`, `import-from-attio` — bulk import

**Risk Profile**: Critical. OAuth token storage and refresh logic are high-security; webhook verification gaps could enable spoofing.

---

### 9. Billing & Credit System (~10 functions)

**Not covered by AUDIT-055 (Credit System & Billing)**

AUDIT-055 covered reconciliation. These handle topup, alerts, and metering:

- `admin-credit-menu` — admin credit management UI
- `ai-ark-credits`, `apollo-credits` — provider credit tracking (separate functions)
- `check-credit-alerts` — credit alert system
- `create-checkout-session`, `create-credit-checkout` — Stripe checkout
- `credit-auto-topup` — automatic topup logic
- `get-credit-menu`, `get-credit-usage-summary` — credit dashboards
- `grant-welcome-credits` — onboarding credit grants
- `meter-storage` — storage metering
- `purge-credit-logs` — cleanup of credit logs

**Risk Profile**: High. Cost controls missing; auto-topup logic could be exploited.

---

### 10. Onboarding & Account Management (~15 functions)

**Not covered by AUDIT-064 (Team & Org Management + Onboarding)**

- `cleanup-expired-invitations`, `cleanup-incomplete-onboarding` — cleanup jobs
- `clerk-user-sync` — **deprecated Clerk sync** (still deployed)
- `create-users-from-profiles`, `create-profile` — profile creation
- `delete-organization`, `delete-user` — account deletion
- `handle-join-request-action`, `handle-organization-joining` — joining flows
- `invite-user` — invite system
- `initialize-onboarding` — onboarding init
- `send-organization-invitation`, `send-rejoin-invitation`, `send-removal-email` — transactional emails
- `create-api-key` — API key generation
- `validate-waitlist-token`, `generate-waitlist-token` — waitlist system

**Risk Profile**: High. Account creation/deletion without full audit; deprecated Clerk code still running.

---

### 11. Data Sync & Materialization (~10 functions)

**Not covered by any audit**

- `app-data-batch` — batch data sync
- `bulk-import-activities` — bulk activity import
- `materialize-crm-deals` — deal materialization
- `sync-profile-names` — name sync
- `sync-recording-to-crm` — recording sync to CRM
- `sync-skills-from-github` — skills sync
- `update-deal-dossier` — dossier updates
- `update-lead-sources` — lead source tracking
- `update-s3-metrics` — S3 metrics
- `sync-fact-profile-context` — fact profile updates

**Risk Profile**: Medium. Data consistency issues possible; no audit coverage.

---

### 12. Analytics & Monitoring (~20 functions)

**Not covered by any audit**

- `account-monitor` — account health monitoring
- `account-signal-digest` — signal aggregation
- `analytics-web-vitals` — web performance metrics
- `cloudinary-analytics` — image CDN analytics
- `integration-health-batch` — integration status checks
- `meeting-analytics`, `meeting-analytics-cron` — meeting analysis
- `meeting-aggregate-insights-query`, `meeting-intelligence-*` (3 functions) — intelligence system
- `meter-storage` — storage metering
- `process-ai-analysis` — AI cost analysis
- `update-s3-metrics` — S3 usage
- `fetch-openrouter-models` — model availability

**Risk Profile**: Low. Monitoring functions are non-critical; privacy concern if analytics leak user data.

---

### 13. Specialized Agents (~25 functions)

**Beyond AUDIT-043 (6-Agent Specialist Fleet)**

- `agent-competitive-intel` — mentioned in AUDIT-050 but not deeply reviewed
- `agent-config-admin` — agent config management
- `agent-crm-*` (3 functions) — CRM-specific agents
- `coaching-analysis` — sales coaching analysis
- `deal-analyze-risk-signals` — deal risk signals (separate from AUDIT-025)
- `relationship-milestone-scanner` — milestone detection
- `memory-commitment-tracker`, `memory-snapshot-generator` — memory system
- `process-*` agents (10+ functions):
  - `process-ai-analysis`, `process-calendar-events`, `process-lead-prep`, `process-notification-queue`, `process-recording`, `process-reengagement`, `process-single-activity`, `process-transcription-callback`, `process-compress-callback`

**Risk Profile**: Medium. Agents run autonomously; cost & auth gaps could cause issues.

---

### 14. Workflow & Rules Engine (~15 functions)

**Mentioned but not fully audited**

- `calculate-deal-health`, `health-recalculate` — health scoring (separate from AUDIT-024)
- `detect-intents` — intent detection
- `evaluate-config-questions`, `evaluate-formula`, `evaluate-ops-rule`, `evaluate-recording-rules` — rule evaluation
- `meeting-workflow-notifications` — workflow notifications (separate from AUDIT-022)
- `task-auto-expire` — task expiration
- `task-signal-processor` — signal processing
- `workflow-webhook` — workflow webhooks
- `ops-workflow-orchestrator` — orchestration layer
- `save-organization-skills`, `refresh-organization-skills`, `get-agent-skills`, `compile-organization-skills` — skills management

**Risk Profile**: Medium. Rules could be bypassed; no audit coverage.

---

### 15. Demo & Testing Functions (~15 functions)

**Internal/demo only**

- `demo-convert-account`, `demo-enrichment-comparison`, `demo-recent-meetings` — demo functions
- `exa-abilities-demo` — Exa demo
- `test-auth`, `test-browserless-access`, `test-email-sequence`, `test-fathom-api`, `test-fathom-token`, `test-hitl`, `test-no-auth` — test endpoints
- `run-reoon-verification`, `run-apify-actor`, `run-migration`, `run-process-map-test` — test utilities

**Risk Profile**: Low-Medium. Should be disabled in production; could expose debug info.

---

### 16. Calendar Integration Ecosystem (~20 functions)

**Not covered by AUDIT-007 (AI Calendar Scheduling)**

AUDIT-007 covered scheduling. These handle multi-provider calendar sync:

**Google Calendar** (10+ functions):
- `google-calendar`, `google-calendar-sync`, `google-calendar-webhook`
- `google-oauth-callback`, `google-oauth-initiate`, `google-oauth-exchange`, `google-oauth-callback-public`
- `google-docs`, `google-docs-create`, `google-drive`, `google-gmail`, `google-tasks`, `google-test-connection`, `google-token-refresh`, `google-workspace-batch`

**Other providers**:
- `auto-join-scheduler` — auto-join logic
- `calendar-search`, `calendar-sync` — general calendar
- `process-calendar-events` — event processing
- `find-available-slots` — availability logic
- `savvycal-config`, `savvycal-leads-webhook`, `sync-savvycal-events` — Savvy Cal
- `meetingbaas-connect-calendar`, `meetingbaas-disconnect-calendar`, `meetingbaas-enable-bot-scheduling`, `meetingbaas-webhook`, `meetingbaas-webhook-simulate` — MeetingBaaS

**Risk Profile**: High. Calendar OAuth tokens are sensitive; sync gaps could cause meeting misses.

---

### 17. Proposal System (~10 functions)

**Not covered by AUDIT-018 (AI Proposal Generator)**

AUDIT-018 mentioned generator. These handle formats & sharing:

- `proposal-generate-docx`, `proposal-generate-pdf` — format generation
- `proposal-parse-document` — document parsing
- `verify-proposal-password` — access control
- Settings pages: `ProposalSettings.tsx`, `ProposalWorkflowSettings.tsx`, `ProposalsPage.tsx`
- Public page: `PublicProposal.tsx`

**Risk Profile**: Medium. Sharing logic could leak proposals; no audit coverage.

---

### 18. Process Maps & Workflow Builder (~10 functions)

**Not covered by any audit**

- `generate-process-map` — process map generation
- `run-process-map-test` — testing
- UI pages: `ProcessMaps.tsx` (admin), `Workflows.tsx`
- Related: `ops-table-workflow-engine` (audited in AUDIT-051 but other workflow functions not)

**Risk Profile**: Low-Medium. Workflow builder could have injection issues.

---

### 19. Knowledge & Memory System (~10 functions)

**Mentioned in AUDIT-049 but infrastructure not audited**

- `memory-backfill` — bulk memory loading
- `memory-commitment-tracker` — commitment tracking
- `memory-snapshot-generator` — memory snapshots
- `api-copilot-memory` (audited in AUDIT-049 but related functions not)
- UI: `KnowledgeMemorySettings.tsx`

**Risk Profile**: Medium. Memory system could expose sensitive context.

---

### 20. Deal & Pipeline Management (~20 functions)

**Not covered by any audit**

- `deal-activities` — deal activity queries
- `deal-splits` — deal splitting
- `deals` — deals CRUD (not explicitly audited)
- `pipeline-tables` — pipeline ops tables
- `materialize-crm-deals` — deal materialization
- `search-crm-with-icp` — CRM search with ICP
- `reprocess-lead-prep`, `reprocess-meetings-ai`, `reprocess-pending-meetings` — reprocessing
- `update-deal-dossier` — dossier updates
- `relationship-milestone-scanner` — milestones

**Risk Profile**: Medium. Deal data is sensitive; no audit coverage.

---

### 21. Activity & Engagement Tracking (~10 functions)

**Not covered by any audit**

- `add-activity` — activity creation
- `add-sale` — sale recording
- `deal-activities` — deal activity tracking
- `bulk-import-activities` — bulk imports
- `process-single-activity` — activity processing
- `relationship-milestone-scanner` — milestones
- `compute-engagement` — engagement scoring
- `analyze-action-item`, `reanalyze-action-item-importance` — action item analysis

**Risk Profile**: Medium. Activity data is sensitive.

---

### 22. Additional System Functions (~20 unaudited)

**Miscellaneous critical functions**

- `auth-logger` — auth logging
- `auth-rate-limit` — rate limiting
- `cleanup-expired-invitations` — cleanup jobs
- `docs-agent`, `docs-api` — documentation system
- `entity-search` — general entity search
- `freepik-proxy` — image proxy
- `generate-embedding` — embedding generation
- `get-batch-signed-urls` — S3 URL generation
- `get-recording-url` — recording access
- `handle-organization-joining` — org joining logic
- `heal-deal-links` — data repair
- `health` — service health check
- `integration-health-batch` — integration status
- `logs-cleanup` — log cleanup
- `meteorite` — storage metering
- `migration` functions (execute-migration, run-migration) — database migrations
- `notification-triage` — notification routing
- `sentry-bridge-worker`, `sentry-webhook` — error tracking
- `support-ticket-notification` — support system
- `suggest-next-actions` — action suggestion

**Risk Profile**: Varies. Some are critical infrastructure.

---

## Unaudited UI Pages (~60+ pages)

### Admin Interfaces (~35 pages)

Not audited:
- `admin/AdminModelSettings.tsx`
- `admin/ApiMonitor.tsx`
- `admin/AuditLogs.tsx`
- `admin/BillingAnalytics.tsx`
- `admin/BrandingSettings.tsx`
- `admin/ControlRoom.tsx`
- `admin/CronJobsAdmin.tsx`
- `admin/DealMigrationReview.tsx`
- `admin/EmailCategorizationSettings.tsx`
- `admin/EmailTemplates.tsx`
- `admin/FathomIntegrationTests.tsx`
- `admin/FunctionTesting.tsx`
- `admin/GoogleIntegrationTestsNew.tsx`
- `admin/HealthRules.tsx`
- `admin/HubSpotIntegrationTests.tsx`
- `admin/IntegrationsDashboard.tsx`
- `admin/InternalDomainsSettings.tsx`
- `admin/PipelineSettings.tsx`
- `admin/ProcessMaps.tsx`
- `admin/PromptSettings.tsx`
- `admin/S3StorageAdmin.tsx`
- `admin/SavvyCalIntegrationTests.tsx`
- `admin/SettingsBookingSources.tsx`
- `admin/SettingsSavvyCal.tsx`
- `admin/SlackDemo.tsx`
- `admin/SlackIntegrationTests.tsx`
- `admin/TasksDemo.tsx`
- `admin/Users.tsx`
- `admin/VSLAnalyticsTests.tsx`
- `admin/WaitlistManagement.tsx`

### Settings Pages (~25+ pages)

Not comprehensively audited:
- `settings/AIIntelligencePage.tsx`
- `settings/AIPersonalizationPage.tsx`
- `settings/APIKeysPage.tsx`
- `settings/AttioSettings.tsx`
- `settings/AutonomySettingsPage.tsx`
- `settings/BillingSettingsPage.tsx`
- `settings/BullhornSettings.tsx`
- `settings/CRMFieldMappingSettings.tsx`
- `settings/CallTypeSettings.tsx`
- `settings/CoachingPreferences.tsx`
- `settings/CreditsSettingsPage.tsx`
- `settings/CustomSOPBuilderPage.tsx`
- `settings/EmailSyncPage.tsx`
- `settings/ExtractionRules.tsx`
- `settings/FollowUpSettings.tsx`
- `settings/HubSpotSettings.tsx`
- `settings/InstantlySettings.tsx`
- `settings/JoinRequestsPage.tsx`
- `settings/JustCallSettings.tsx`
- `settings/KnowledgeMemorySettings.tsx`
- `settings/MeetingSettingsPage.tsx`
- `settings/PipelineAutomationSettings.tsx`
- `settings/ProactiveAgentSettings.tsx`
- `settings/ProposalSettings.tsx`
- `settings/SalesCoachingPage.tsx`
- `settings/SignalIntelligenceSettings.tsx`
- `settings/SmartListeningSettings.tsx`
- `settings/TaskSyncPage.tsx`

### Platform & Demo Pages (~15 pages)

Not audited:
- `platform/AgentAbilitiesPage.tsx`
- `platform/AgentDemoPage.tsx`
- `platform/AgentPerformanceDashboard.tsx`
- `platform/AgentSequenceBuilderPage.tsx`
- `platform/AgentSequencesPage.tsx`
- `platform/AgentTeamsLiveDemoPage.tsx`
- `platform/ApiUsageDashboard.tsx`
- `platform/AutonomyDemoPage.tsx`
- `platform/AutopilotTestPage.tsx`
- `platform/CommandCentreDemo.tsx`
- `platform/CommandCentreV2Demo.tsx`
- `platform/CommandCentreWowDemo.tsx`
- `platform/CostAnalysis.tsx`
- `platform/CreditMenuAdmin.tsx`
- `platform/CreditSystemDemo.tsx`
- `platform/DealTruthSimulator.tsx`
- `platform/DemoConversationalCopilot.tsx`
- `platform/DemoPrepBriefing.tsx`
- `platform/EngagementDashboard.tsx`
- `platform/EngagementSimulator.tsx`
- `platform/ErrorMonitoring.tsx`
- `platform/FollowUpDemoPage.tsx`
- `platform/IntegrationRoadmap.tsx`
- `platform/LaunchChecklist.tsx`
- `platform/MetaAdsAnalytics.tsx`
- `platform/MultiAgentDemoPage.tsx`
- `platform/MultiAgentResearchDemoPage.tsx`
- `platform/OnboardingSimulator.tsx`
- `platform/OrchestratorDashboard.tsx`
- `platform/PlatformSkillEditPage.tsx`
- `platform/PlatformSkillViewPage.tsx`
- `platform/ProactiveAgentV2Demo.tsx`
- `platform/ProactiveSimulator.tsx`
- `platform/QuickAddSimulator.tsx`
- `platform/SentryBridge.tsx`
- `platform/SkillsAdmin.tsx`
- `platform/SkillsQAPage.tsx`
- `platform/TrialTimelineSimulator.tsx`
- `platform/VSLAnalytics.tsx`

### Debug & Internal Pages (~10 pages)

- `DebugAuth.tsx`
- `DebugMeetings.tsx`
- `DebugPermissions.tsx`
- `ActivityProcessingPage.tsx`
- `ApiTesting.tsx`
- `BrowserlessTest.tsx`
- `FathomComparison.tsx`
- `FormDisplay.tsx`
- `TestFallback.tsx`
- `TestGoogleTasks.tsx`
- `TestNotifications.tsx`

---

## Coverage Summary Table

| Category | Est. Functions | Audited | Gap | Risk |
|----------|---|---|---|---|
| Agent Fleet | 35+ | 2 | 95% | Medium |
| API Endpoints | 20+ | 0 | 100% | **High** |
| Apify Scraping | 10+ | 1 | 90% | Medium |
| Slack Notifications | 20+ | Partial | 80%+ | Medium |
| Transcription | 25+ | High-level | 90%+ | **High** |
| Enrichment | 15+ | Waterfall only | 80%+ | **High** |
| Email | 15+ | HITL only | 85%+ | Medium |
| CRM Integration | 30+ | 14 providers mentioned | 90%+ | **Critical** |
| Billing & Credits | 10+ | Reconciliation only | 70%+ | **High** |
| Onboarding | 15+ | Mention | 85%+ | **High** |
| Data Sync | 10+ | 0 | 100% | Medium |
| Analytics | 20+ | 0 | 100% | Low |
| Workflows | 15+ | Ops tables only | 85%+ | Medium |
| Calendar | 20+ | Scheduling only | 85%+ | Medium |
| Proposals | 10+ | Generator only | 90%+ | Medium |
| Deals & Pipeline | 20+ | Mention | 80%+ | Medium |
| Activities | 10+ | 0 | 100% | Medium |
| Specialized Agents | 25+ | 0 | 100% | Medium |
| **TOTAL** | **487** | **~55** | **~89%** | — |

---

## Key Findings

### ✅ Audit Strengths
- Comprehensive coverage of 65 major user-facing features
- Clear prioritization of customer-visible functionality
- Good depth on critical flows (HITL email, orchestration, autonomous CRM updates)

### ⚠️ Critical Gaps (Should be audited next)
1. **CRM Integration Infrastructure** — OAuth, tokens, webhooks, sync jobs (30+ functions, risk: **Critical**)
2. **Billing & Credit System** — topup logic, auto-topup, metering (10+ functions, risk: **High**)
3. **Public REST API** — 6 endpoints + auth orchestration (20+ functions, risk: **High**)
4. **Transcription Pipeline** — multi-provider abstraction, cost tracking (25+ functions, risk: **High**)
5. **Enrichment Pipeline** — per-provider credit tracking, consistent cost accounting (15+ functions, risk: **High**)
6. **Onboarding & Account Mgmt** — deprecated Clerk still running, account deletion (15+ functions, risk: **High**)

### 📋 Medium-Risk Gaps
- Agent implementations (35+ functions beyond the 6-agent framework)
- Slack notification system (20+ functions)
- Calendar integration ecosystem (20+ functions)
- Data sync & materialization (10+ functions)
- Email infrastructure (15+ functions)

### 🔍 Low-Priority Gaps
- Analytics & monitoring (20+ functions)
- Demo & testing functions (15+ functions)
- Internal tools & admin pages

---

## Recommendations

### Phase 1 (Critical)
- [ ] Audit CRM integration provider infrastructure (OAuth, webhooks, token refresh)
- [ ] Audit billing system (auto-topup, metering, credit tracking inconsistencies)
- [ ] Audit Public REST API endpoints for auth/rate-limiting

### Phase 2 (High-Risk)
- [ ] Audit transcription multi-provider abstraction & cost tracking
- [ ] Audit enrichment pipeline (per-provider credit tracking)
- [ ] Remove deprecated `clerk-user-sync` function
- [ ] Audit onboarding/account management for data deletion safety

### Phase 3 (Medium-Risk)
- [ ] Audit individual agent implementations (beyond AUDIT-043)
- [ ] Audit Slack notification system for spam/rate-limits
- [ ] Audit calendar ecosystem (OAuth tokens, sync safety)

### Phase 4 (Maintenance)
- [ ] Disable/remove demo & test functions from production
- [ ] Audit analytics for privacy leaks
- [ ] Review admin pages for privilege escalation

---

**Document Last Updated**: 2026-03-01
**Audit Baseline**: AUDIT-001 through AUDIT-065
