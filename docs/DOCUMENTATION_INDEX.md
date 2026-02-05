# Documentation Index

Quick reference guide to all project documentation for developers and AI assistants.

## 🚀 Getting Started

- **[CLAUDE.md](./CLAUDE.md)** - Complete project overview and technical documentation
- **[README.md](./README.md)** - Project introduction and quick start guide

## 🔧 Development Setup

### Supabase Configuration
- **[SUPABASE_DEVELOPMENT_SETUP_GUIDE.md](./SUPABASE_DEVELOPMENT_SETUP_GUIDE.md)** ⭐ **NEW**
  - Complete Supabase branching setup process
  - GitHub Actions workflow configuration
  - IPv6 connectivity limitations and solutions
  - Troubleshooting guide for common issues
  - Authentication and connection string configuration

### Database & Migrations
- **[SUPABASE_SETUP_CHECKLIST.md](./SUPABASE_SETUP_CHECKLIST.md)** - Original setup checklist
- **[SUPABASE_BRANCHING_SETUP.md](./SUPABASE_BRANCHING_SETUP.md)** - Branching architecture guide
- **[SUPABASE_SETUP_COMPLETED.md](./SUPABASE_SETUP_COMPLETED.md)** - Setup completion summary
- **[SETUP_STATUS.md](./SETUP_STATUS.md)** - Current setup status and next steps

## 📊 Feature Documentation

### Admin & Security
- **[FIX_DATABASE_PERMISSIONS.md](./FIX_DATABASE_PERMISSIONS.md)** - Database permission fixes

### Task Management
- **Smart Tasks** - Automated task generation system (see CLAUDE.md)

### Pipeline & Deals
- **4-Stage Pipeline** - SQL → Opportunity → Verbal → Signed (see CLAUDE.md)

### Meeting Intelligence
- **AI Search** - Meeting transcript indexing and semantic search (see CLAUDE.md)

## 🧪 Testing & Deployment

### Testing Guides
- **[PHASE_6_TESTING_GUIDE.md](./PHASE_6_TESTING_GUIDE.md)** - Phase 6 testing procedures
- **[TESTING_SUMMARY.md](./TESTING_SUMMARY.md)** - Test results summary
- **[test-supabase-connection.js](./test-supabase-connection.js)** - Connection test script

### Deployment
- **[DEPLOYMENT_GUIDE.md](./DEPLOYMENT_GUIDE.md)** - Deployment procedures
- **[DEPLOYMENT_TEST_SUMMARY.md](./DEPLOYMENT_TEST_SUMMARY.md)** - Deployment test results
- **[VERCEL_CRON_SETUP.md](./VERCEL_CRON_SETUP.md)** - Vercel cron job configuration
- **[VERCEL_ENV_FIX.md](./VERCEL_ENV_FIX.md)** - Vercel environment fixes

## 🛠️ Troubleshooting

### Common Issues
- **IPv6 Connectivity**: See [SUPABASE_DEVELOPMENT_SETUP_GUIDE.md](./SUPABASE_DEVELOPMENT_SETUP_GUIDE.md#known-issues--limitations)
- **Authentication Errors**: See [SUPABASE_DEVELOPMENT_SETUP_GUIDE.md](./SUPABASE_DEVELOPMENT_SETUP_GUIDE.md#troubleshooting)
- **Database Permissions**: See [FIX_DATABASE_PERMISSIONS.md](./FIX_DATABASE_PERMISSIONS.md)

### Security Fixes
- **[SECURITY_FIX.md](./SECURITY_FIX.md)** - Security vulnerability fixes

## 📱 Feature-Specific Guides

### Calendar Integration
- **[CALENDAR_COPILOT_DESIGN.md](./CALENDAR_COPILOT_DESIGN.md)** - Calendar copilot design

### Email & Communication
- **[COPILOT_EMAIL_SEARCH_TOOL.md](./COPILOT_EMAIL_SEARCH_TOOL.md)** - Email search tool
- **[RELATIONSHIP_HEALTH_QUICK_START.md](./RELATIONSHIP_HEALTH_QUICK_START.md)** - Relationship health tracking
- **[SETUP_RELATIONSHIP_HEALTH.md](./SETUP_RELATIONSHIP_HEALTH.md)** - Setup guide

### Webhooks & Integration
- **[FATHOM_WEBHOOK_SETUP.md](./FATHOM_WEBHOOK_SETUP.md)** - Fathom webhook configuration

### Sentiment & Analytics
- **[SENTIMENT_ANALYSIS_TEST_RESULTS.md](./SENTIMENT_ANALYSIS_TEST_RESULTS.md)** - Sentiment analysis testing

### Video & Media
- **[VEO3_TESTING.md](./VEO3_TESTING.md)** - Veo3 video generation testing

## 🏗️ Project Management

### Planning
- **[NEXT_STEPS.md](./NEXT_STEPS.md)** - Upcoming features and improvements
- **[PROJECT_STAGES_TICKET_READINESS.md](./PROJECT_STAGES_TICKET_READINESS.md)** - Stage-based ticket management

### UI/UX
- **[UI_CHANGES_GUIDE.md](./UI_CHANGES_GUIDE.md)** - UI modification guidelines

## 🤖 For AI Assistants

When helping with this project:

### Quick References
1. **Start here**: [CLAUDE.md](./CLAUDE.md) for project overview
2. **Supabase setup**: [SUPABASE_DEVELOPMENT_SETUP_GUIDE.md](./SUPABASE_DEVELOPMENT_SETUP_GUIDE.md)
3. **Common issues**: See Troubleshooting section above

### Key Information
- **Project ID**: `ewtuefzeogytgmsnkpmb`
- **Dev Branch ID**: `68fc8173-d1b9-47be-8920-9aa8218cc285`
- **Main Tech Stack**: React, TypeScript, Vite, Supabase, PostgreSQL
- **Known Limitation**: IPv6 connectivity required for development branches

### Development Workflow
1. Check [SUPABASE_DEVELOPMENT_SETUP_GUIDE.md](./SUPABASE_DEVELOPMENT_SETUP_GUIDE.md) for setup
2. Reference [CLAUDE.md](./CLAUDE.md) for architecture and components
3. Follow GitHub Actions workflows for deployment
4. Test with `test-supabase-connection.js`

---

**Last Updated**: December 2, 2025
**Maintained By**: Development Team
