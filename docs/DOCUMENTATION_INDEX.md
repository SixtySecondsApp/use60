# Documentation Index

> **117 files** across **10 directories** — organized for AI context and developer reference.
>
> Last updated: 2026-02-05

---

## API (`api/` — 4 files)

REST API reference and testing documentation.

| File | Description |
|------|-------------|
| [API_DOCUMENTATION.md](./api/API_DOCUMENTATION.md) | Comprehensive REST API reference (endpoints, auth, examples) |
| [API_QUICKSTART.md](./api/API_QUICKSTART.md) | Quick start guide for API consumers |
| [API_REFERENCE.md](./api/API_REFERENCE.md) | API endpoint reference with request/response schemas |
| [API_TESTING_DESIGN_SPECS.md](./api/API_TESTING_DESIGN_SPECS.md) | API testing design specifications |

---

## Architecture (`architecture/` — 8 files)

System design, process maps, data models, and feature flows.

| File | Description |
|------|-------------|
| [overview.md](./architecture/overview.md) | System architecture overview with component diagrams |
| [COPILOT_PROCESS_MAP.md](./architecture/COPILOT_PROCESS_MAP.md) | **Key**: 5-phase copilot request flow with safety measures (Mermaid) |
| [MEETING_CONTENT_ER_DIAGRAM.md](./architecture/MEETING_CONTENT_ER_DIAGRAM.md) | Meeting content entity-relationship diagram |
| [MEETING_CONTENT_SCHEMA.md](./architecture/MEETING_CONTENT_SCHEMA.md) | Meeting content database schema |
| [CANCEL_AND_RESTART_FLOW.md](./architecture/CANCEL_AND_RESTART_FLOW.md) | Cancel & restart feature flow |
| [quickadd-pipeline-flowcharts.md](./architecture/quickadd-pipeline-flowcharts.md) | QuickAdd and pipeline management Mermaid flowcharts |
| [workflow-enhancements.md](./architecture/workflow-enhancements.md) | Sales pipeline workflow enhancements (4-stage flow) |
| [smart-engagement-algorythm.md](./architecture/smart-engagement-algorythm.md) | Smart engagement scoring algorithm |

---

## Copilot (`copilot/` — 11 files)

AI copilot system — skills, sequences, personas, human-in-the-loop.

| File | Description |
|------|-------------|
| [COPILOT_USER_GUIDE.md](./copilot/COPILOT_USER_GUIDE.md) | End-user guide for the AI copilot |
| [use60 Copilot System Prompt.md](./copilot/use60%20Copilot%20System%20Prompt.md) | System prompt definition for the copilot |
| [use60 Copilot - Platform Skills Integration.md](./copilot/use60%20Copilot%20-%20Platform%20Skills%20Integration.md) | Platform skills integration architecture |
| [SKILL_FRONTMATTER_GUIDE.md](./copilot/SKILL_FRONTMATTER_GUIDE.md) | **Key**: V2 skill frontmatter specification (triggers, schemas, sequences) |
| [SKILLS_STANDARD_ADOPTION.md](./copilot/SKILLS_STANDARD_ADOPTION.md) | Skills standardization adoption guide |
| [platform-controlled-skills-for-orgs.md](./copilot/platform-controlled-skills-for-orgs.md) | Org-level skill management |
| [agent.md](./copilot/agent.md) | Agent system documentation |
| [agent-sequences.md](./copilot/agent-sequences.md) | Multi-skill sequence orchestration |
| [HITL-slack-brief.md](./copilot/HITL-slack-brief.md) | Human-in-the-loop Slack approval workflow |
| [copilot-improvement-plan-03-01.md](./copilot/copilot-improvement-plan-03-01.md) | Copilot enhancement plan (active) |
| [Copilot-skills-testing-plan.md](./copilot/Copilot-skills-testing-plan.md) | Skills testing framework |

---

## Product (`product/` — 15 files)

PRDs, feature briefs, competitive research, and planning documents.

| File | Description |
|------|-------------|
| [PRD_PROACTIVE_AI_TEAMMATE.md](./product/PRD_PROACTIVE_AI_TEAMMATE.md) | **Core PRD**: Proactive AI sales teammate vision |
| [PRD_ACTION_CENTRE.md](./product/PRD_ACTION_CENTRE.md) | Action Centre product requirements |
| [ACTION_CENTRE_FUNCTIONAL_BRIEF.md](./product/ACTION_CENTRE_FUNCTIONAL_BRIEF.md) | Action Centre functional design brief |
| [commandcenter-design.md](./product/commandcenter-design.md) | Command Centre feature design |
| [deal-truth-close-plan.md](./product/deal-truth-close-plan.md) | Deal Truth data layer plan (Phase 1: not started) |
| [plan.md](./product/plan.md) | Proactive notifications implementation plan (Slack + in-app) |
| [proactive-60-agent-brief.md](./product/proactive-60-agent-brief.md) | Proactive agent workflows brief |
| [devbot-brief.md](./product/devbot-brief.md) | DevBot v2 clarifying questions system (high priority) |
| [SIXTY_RALPH_WORKFLOW_COMMANDS.md](./product/SIXTY_RALPH_WORKFLOW_COMMANDS.md) | Ralph bot workflow commands |
| [sales-training-brief.md](./product/sales-training-brief.md) | Sales training materials brief |
| [client-subscription-mvp-wireframes.md](./product/client-subscription-mvp-wireframes.md) | Subscription MVP wireframes |
| [research_assistant_clawd:moltbot.md](./product/research_assistant_clawd:moltbot.md) | Competitive research: OpenClaw/Moltbot |
| [research_assistant_nanoclaw.md](./product/research_assistant_nanoclaw.md) | Competitive research: NanoClaw |
| [commandcenterquick.html](./product/commandcenterquick.html) | Command Centre quick reference (HTML) |
| [release-feature-components.html](./product/release-feature-components.html) | Release feature components (HTML) |

---

## Integrations (`integrations/` — 19 files)

External service integrations and configuration.

### MeetingBaaS (60 Notetaker)
| File | Description |
|------|-------------|
| [MEETINGBAAS_NEXT_STAGE.md](./integrations/MEETINGBAAS_NEXT_STAGE.md) | Current MeetingBaaS testing/deployment checklist |
| [MEETINGBAAS_WEBHOOK_SETUP.md](./integrations/MEETINGBAAS_WEBHOOK_SETUP.md) | Webhook configuration guide |
| [MEETINGBAAS_WEBHOOK_TESTING.md](./integrations/MEETINGBAAS_WEBHOOK_TESTING.md) | Webhook testing procedures |

### AssemblyAI (Transcription)
| File | Description |
|------|-------------|
| [ASSEMBLYAI_INTEGRATION_PLAN.md](./integrations/ASSEMBLYAI_INTEGRATION_PLAN.md) | Integration architecture |
| [ASSEMBLYAI_DEPLOYMENT_GUIDE.md](./integrations/ASSEMBLYAI_DEPLOYMENT_GUIDE.md) | Deployment guide |
| [ASSEMBLYAI_DEPLOYMENT_STATUS.md](./integrations/ASSEMBLYAI_DEPLOYMENT_STATUS.md) | Deployment checklist |
| [ASSEMBLYAI_DEPLOYMENT_COMPLETE.md](./integrations/ASSEMBLYAI_DEPLOYMENT_COMPLETE.md) | Deployment completion reference |
| [ASSEMBLYAI_IMPLEMENTATION_SUMMARY.md](./integrations/ASSEMBLYAI_IMPLEMENTATION_SUMMARY.md) | Implementation summary |

### AWS S3 (Storage)
| File | Description |
|------|-------------|
| [AWS_S3_SETUP.md](./integrations/AWS_S3_SETUP.md) | S3 bucket setup guide |
| [S3_STORAGE_IMPLEMENTATION.md](./integrations/S3_STORAGE_IMPLEMENTATION.md) | S3 storage implementation details |
| [storage-configuration-check.md](./integrations/storage-configuration-check.md) | Storage configuration verification |
| [thumbnail_lambda.md](./integrations/thumbnail_lambda.md) | Lambda thumbnail generation |

### Other Integrations
| File | Description |
|------|-------------|
| [CALENDAR_AND_TEMPLATES_GUIDE.md](./integrations/CALENDAR_AND_TEMPLATES_GUIDE.md) | Google Calendar integration |
| [OAUTH_RELAY_SETUP.md](./integrations/OAUTH_RELAY_SETUP.md) | OAuth relay for localhost development |
| [slack-commands-brief.md](./integrations/slack-commands-brief.md) | Slack commands reference |
| [CLERK_AUTH_MIGRATION.md](./integrations/CLERK_AUTH_MIGRATION.md) | Clerk auth (legacy, dual-auth reference) |
| [bullhorn_integration.md](./integrations/bullhorn_integration.md) | Bullhorn ATS integration plan |
| [MCP_plan.md](./integrations/MCP_plan.md) | Model Context Protocol integration |
| [revenuecat-metrics-reference.md](./integrations/revenuecat-metrics-reference.md) | RevenueCat metrics reference |

---

## Guides (`guides/` — 31 files)

Developer guides, user guides, and operational references.

### Getting Started
| File | Description |
|------|-------------|
| [quick-start.md](./guides/quick-start.md) | Developer quick start guide |
| [README-development-setup.md](./guides/README-development-setup.md) | Development environment setup |
| [AuthenticationV2.md](./guides/AuthenticationV2.md) | Authentication v2 implementation |
| [AUTH_RUNBOOK.md](./guides/AUTH_RUNBOOK.md) | Auth troubleshooting runbook |

### CRM & Pipeline
| File | Description |
|------|-------------|
| [PIPELINE_GUIDE.md](./guides/PIPELINE_GUIDE.md) | Sales pipeline guide |
| [PIPELINE_AUTOMATION_GUIDE.md](./guides/PIPELINE_AUTOMATION_GUIDE.md) | Pipeline automation configuration |
| [README-pipeline.md](./guides/README-pipeline.md) | Pipeline documentation |
| [DEAL_WIZARD_USER_GUIDE.md](./guides/DEAL_WIZARD_USER_GUIDE.md) | Deal wizard user guide |
| [LINK_DEALS_TO_CRM_GUIDE.md](./guides/LINK_DEALS_TO_CRM_GUIDE.md) | Linking deals to CRM records |
| [CRM_changes.md](./guides/CRM_changes.md) | CRM schema changes reference |
| [crm-plan.md](./guides/crm-plan.md) | CRM development plan |

### Activities & Tasks
| File | Description |
|------|-------------|
| [ACTIVITY_DEAL_LINKING_GUIDE.md](./guides/ACTIVITY_DEAL_LINKING_GUIDE.md) | Activity-to-deal linking |
| [AUTOMATIC_ACTIVITY_PROCESSING_GUIDE.md](./guides/AUTOMATIC_ACTIVITY_PROCESSING_GUIDE.md) | Automatic activity processing (Mermaid flows) |
| [SMART_TASKS_GUIDE.md](./guides/SMART_TASKS_GUIDE.md) | Smart task automation |
| [TASK_MANAGEMENT_CRM_INTEGRATION.md](./guides/TASK_MANAGEMENT_CRM_INTEGRATION.md) | Task management CRM integration |
| [tasks.md](./guides/tasks.md) | Task system documentation |

### Meetings & Content
| File | Description |
|------|-------------|
| [MEETING_CONTENT_QUICK_START.md](./guides/MEETING_CONTENT_QUICK_START.md) | Meeting content quick start |
| [CONTENT_TAB_DEVELOPER_GUIDE.md](./guides/CONTENT_TAB_DEVELOPER_GUIDE.md) | Content tab developer reference |
| [CONTENT_TAB_USER_GUIDE.md](./guides/CONTENT_TAB_USER_GUIDE.md) | Content tab user guide |
| [meetings-webhook-curl-examples.md](./guides/meetings-webhook-curl-examples.md) | Meeting webhook cURL examples |

### Admin & Platform
| File | Description |
|------|-------------|
| [ADMIN_GUIDE.md](./guides/ADMIN_GUIDE.md) | Platform admin guide |
| [CLIENT_SUBSCRIPTION_MANAGEMENT.md](./guides/CLIENT_SUBSCRIPTION_MANAGEMENT.md) | Client subscription management |
| [SUPABASE_DATA_IMPORT_GUIDE.md](./guides/SUPABASE_DATA_IMPORT_GUIDE.md) | Supabase data import procedures |
| [INFRASTRUCTURE_SUMMARY.md](./guides/INFRASTRUCTURE_SUMMARY.md) | Infrastructure overview |

### Development
| File | Description |
|------|-------------|
| [AGENT_COORDINATION_FRAMEWORK.md](./guides/AGENT_COORDINATION_FRAMEWORK.md) | Agent coordination framework |
| [BACKEND_OPTIMIZATION_GUIDE.md](./guides/BACKEND_OPTIMIZATION_GUIDE.md) | Backend optimization guide |
| [PERFORMANCE_OPTIMIZATION_GUIDE.md](./guides/PERFORMANCE_OPTIMIZATION_GUIDE.md) | Performance optimization guide |
| [DEPLOYMENT_GUIDE.md](./guides/DEPLOYMENT_GUIDE.md) | Deployment procedures |
| [TESTING_GUIDE.md](./guides/TESTING_GUIDE.md) | Testing guide |
| [test-integrations.md](./guides/test-integrations.md) | Integration testing reference |
| [plan-v002.md](./guides/plan-v002.md) | Development plan v002 |

---

## Deployment (`deployment/` — 8 files)

Production deployment, staging setup, and operations.

| File | Description |
|------|-------------|
| [DEPLOYMENT.md](./deployment/DEPLOYMENT.md) | Main deployment documentation |
| [DEVOPS_DEPLOYMENT_SUMMARY.md](./deployment/DEVOPS_DEPLOYMENT_SUMMARY.md) | DevOps and CI/CD summary |
| [PRODUCTION_DEPLOYMENT_CHECKLIST.md](./deployment/PRODUCTION_DEPLOYMENT_CHECKLIST.md) | Production deployment checklist |
| [PRODUCTION_READY_SUMMARY.md](./deployment/PRODUCTION_READY_SUMMARY.md) | Production readiness guide |
| [MIGRATION_DEPLOYMENT_GUIDE.md](./deployment/MIGRATION_DEPLOYMENT_GUIDE.md) | Database migration deployment |
| [staging-setup.md](./deployment/staging-setup.md) | Staging environment setup |
| [SYNC_PROD_TO_STAGING.md](./deployment/SYNC_PROD_TO_STAGING.md) | Production to staging sync procedure |
| [PROJECT_DELETION_CHECKLIST.md](./deployment/PROJECT_DELETION_CHECKLIST.md) | Project deletion checklist |

---

## Security (`security/` — 3 files)

Security architecture, hardening, and audit tracking.

| File | Description |
|------|-------------|
| [SECURITY_HARDENING_GUIDE.md](./security/SECURITY_HARDENING_GUIDE.md) | **Key**: Defense-in-depth security architecture |
| [SECURITY_IMPLEMENTATION_SUMMARY.md](./security/SECURITY_IMPLEMENTATION_SUMMARY.md) | Security implementation details |
| [AUDIT_SESSION_TRACKING.md](./security/AUDIT_SESSION_TRACKING.md) | Session tracking and audit logging |

---

## Testing (`testing/` — 11 files)

QA checklists, Playwright setup, and test reports.

| File | Description |
|------|-------------|
| [TESTING_INDEX.md](./testing/TESTING_INDEX.md) | Testing documentation index |
| [TESTING_VISUAL_GUIDE.md](./testing/TESTING_VISUAL_GUIDE.md) | Visual testing guide |
| [TESTING-REPORT-COPILOT-SKILLS.md](./testing/TESTING-REPORT-COPILOT-SKILLS.md) | Copilot skills test report |
| [PLAYWRITER_SETUP.md](./testing/PLAYWRITER_SETUP.md) | Playwright setup guide |
| [PLAYWRITER_MIGRATION_GUIDE.md](./testing/PLAYWRITER_MIGRATION_GUIDE.md) | Playwright migration guide |
| [PLAYWRIGHT_TEST_USER.md](./testing/PLAYWRIGHT_TEST_USER.md) | Test user documentation |
| [QA_COPILOT_EXCELLENCE_CHECKLIST.md](./testing/QA_COPILOT_EXCELLENCE_CHECKLIST.md) | Copilot QA excellence checklist |
| [QA_COPILOT_LAB_TEST_REPORT.md](./testing/QA_COPILOT_LAB_TEST_REPORT.md) | Copilot Lab test report |
| [QUICK_ADD_TESTING_STRATEGY.md](./testing/QUICK_ADD_TESTING_STRATEGY.md) | QuickAdd testing strategy |
| [QUICK_TEST_CHECKLIST.md](./testing/QUICK_TEST_CHECKLIST.md) | Quick test checklist |
| [STAGING_TEST_CHECKLIST.md](./testing/STAGING_TEST_CHECKLIST.md) | Staging test checklist |

---

## Performance (`performance/` — 4 files)

Optimization guides and metrics framework.

| File | Description |
|------|-------------|
| [BACKEND_OPTIMIZATIONS.md](./performance/BACKEND_OPTIMIZATIONS.md) | Backend optimization guide |
| [CRM_PERFORMANCE_OPTIMIZATION_PLAN.md](./performance/CRM_PERFORMANCE_OPTIMIZATION_PLAN.md) | CRM performance optimization plan |
| [PERFORMANCE_METRICS_FRAMEWORK.md](./performance/PERFORMANCE_METRICS_FRAMEWORK.md) | Performance metrics definitions |
| [PERFORMANCE_TASKS_DETAILED.md](./performance/PERFORMANCE_TASKS_DETAILED.md) | Detailed performance improvement tasks |

---

## Root Files

| File | Description |
|------|-------------|
| [README.md](./README.md) | Documentation homepage with system overview and Mermaid diagrams |
| [DOCUMENTATION_INDEX.md](./DOCUMENTATION_INDEX.md) | This file — master navigation index |
| [CLAUDE.md](./CLAUDE.md) | AI context for claude-mem integration |
