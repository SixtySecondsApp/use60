# Platform Documentation Structure and Navigation Guide

A complete map of the platform's documentation categories, common user questions, search keyword routing, and FAQ patterns. Use this as the knowledge base for understanding where answers live.

## Table of Contents
1. [Documentation Category Map](#documentation-category-map)
2. [Category Details and Query Routing](#category-details-and-query-routing)
3. [FAQ Patterns — Most Common Questions](#faq-patterns--most-common-questions)
4. [Troubleshooting Decision Tree](#troubleshooting-decision-tree)
5. [Cross-Category Relationships](#cross-category-relationships)
6. [Search Keyword Routing Table](#search-keyword-routing-table)
7. [Documentation Gaps and Known Limitations](#documentation-gaps-and-known-limitations)

---

## Documentation Category Map

The platform documentation is organized into 10 primary categories. Each category contains guides, reference docs, and FAQ entries.

```
Documentation Root
|
|-- Getting Started
|   |-- Onboarding guide
|   |-- First-time setup
|   |-- Quick start tutorials
|
|-- Pipeline Management
|   |-- Deals and stages
|   |-- Health scoring
|   |-- Forecasting
|   |-- Pipeline views
|
|-- Meeting Intelligence
|   |-- Calendar sync
|   |-- Recording & transcription
|   |-- Meeting prep & follow-up
|   |-- Notetaker bot
|
|-- Contacts & Companies
|   |-- Contact management
|   |-- Company records
|   |-- Relationship tracking
|   |-- Import/export
|
|-- Tasks & Automation
|   |-- Task management
|   |-- Workflows
|   |-- Smart automations
|   |-- Sequences
|
|-- Integrations
|   |-- Google Calendar
|   |-- Fathom
|   |-- Slack
|   |-- HubSpot
|   |-- Other integrations
|
|-- AI Copilot
|   |-- Copilot overview
|   |-- Skills and commands
|   |-- Memory & context
|   |-- Autonomous mode
|
|-- Admin & Settings
|   |-- Organization settings
|   |-- User management
|   |-- Notifications
|   |-- Security & permissions
|
|-- Credits & Billing
|   |-- AI credit system
|   |-- Plans and pricing
|   |-- Usage tracking
|   |-- Invoices
|
|-- Security & Compliance
    |-- Data privacy
    |-- SSO / authentication
    |-- Audit logs
    |-- Compliance certifications
```

---

## Category Details and Query Routing

### Getting Started

**Content**: Onboarding guides, first-time setup, quickstart tutorials, platform overview.

| Common User Questions | Search Keywords |
|----------------------|----------------|
| "How do I get started?" | getting started, onboarding, first time, new user, setup |
| "What should I set up first?" | first steps, initial setup, configuration |
| "Give me a tour of the platform" | overview, tour, walkthrough, introduction |
| "How do I invite my team?" | invite, team, users, add members |

**Related categories**: Admin & Settings (for team management), Integrations (for first connections)

---

### Pipeline Management

**Content**: Deal creation, pipeline stages, health scoring, forecasting, pipeline views and filters.

| Common User Questions | Search Keywords |
|----------------------|----------------|
| "How does deal health scoring work?" | deal health, health score, deal score, risk score |
| "How do I create a new deal?" | create deal, add deal, new opportunity |
| "What do the pipeline stages mean?" | stages, pipeline stages, deal stages, funnel |
| "How do I forecast my pipeline?" | forecast, pipeline forecast, commit, weighted pipeline |
| "Why did my deal's health score drop?" | health score dropped, deal risk, health change |
| "How do I move a deal to a different stage?" | move deal, change stage, advance deal, update stage |
| "How do I filter my pipeline view?" | pipeline filter, view, sort, group by |

**Related categories**: Tasks & Automation (tasks linked to deals), Meeting Intelligence (meetings linked to deals)

---

### Meeting Intelligence

**Content**: Google Calendar sync, meeting recording via 60 Notetaker/MeetingBaaS, Fathom transcripts, meeting prep, follow-up automation.

| Common User Questions | Search Keywords |
|----------------------|----------------|
| "How do I connect my calendar?" | calendar, Google Calendar, sync, connect calendar |
| "How does the meeting recording work?" | recording, notetaker, bot, record meeting, 60 notetaker |
| "Where are my meeting transcripts?" | transcript, transcription, meeting notes |
| "How do I prepare for a meeting?" | meeting prep, preparation, brief |
| "Can I auto-record all my meetings?" | auto-record, auto-join, automatic recording |
| "How do I link a meeting to a deal?" | link meeting, connect meeting deal, meeting deal |
| "What happens after a meeting?" | post-meeting, follow-up, meeting summary |

**Related categories**: Integrations (Fathom, Google Calendar), AI Copilot (meeting prep skill)

---

### Contacts & Companies

**Content**: Contact management, company records, relationship tracking, import/export, contact enrichment.

| Common User Questions | Search Keywords |
|----------------------|----------------|
| "How do I add a new contact?" | add contact, create contact, new contact |
| "How do I import contacts from a CSV?" | import, CSV, upload contacts, bulk import |
| "How do I see all contacts at a company?" | company contacts, organization, company view |
| "How does relationship tracking work?" | relationship, engagement, contact activity |
| "How do I merge duplicate contacts?" | merge, duplicate, deduplicate |
| "How do I enrich contact data?" | enrich, research, Apollo, data enrichment |

**Related categories**: Pipeline Management (contacts on deals), Integrations (HubSpot import)

---

### Tasks & Automation

**Content**: Task creation and management, workflow automation, smart automations, sequence execution.

| Common User Questions | Search Keywords |
|----------------------|----------------|
| "How do I create a task?" | create task, new task, add task |
| "How do I automate tasks?" | automation, workflow, automatic, trigger |
| "What are smart tasks?" | smart task, AI task, automated task, suggested task |
| "How do I set up a workflow?" | workflow, automation, sequence |
| "How do I see all my tasks?" | task list, my tasks, task view, task board |
| "Can tasks be linked to deals?" | task deal, link task, associated task |
| "How do reminders work?" | reminder, notification, due date, overdue |

**Related categories**: Pipeline Management (deal-linked tasks), AI Copilot (task suggestions)

---

### Integrations

**Content**: Setup guides for all third-party connections: Google Calendar, Fathom, Slack, HubSpot, and others.

| Common User Questions | Search Keywords |
|----------------------|----------------|
| "How do I connect Google Calendar?" | Google Calendar, calendar sync, connect calendar |
| "How do I set up Slack notifications?" | Slack, notification, alert, pipeline alert |
| "How do I import from HubSpot?" | HubSpot, import, sync, CRM migration |
| "How does the Fathom integration work?" | Fathom, transcript, meeting intelligence |
| "What integrations are available?" | integrations, connect, third-party, available |
| "How do I disconnect an integration?" | disconnect, remove, unlink, revoke |
| "Why is my integration not syncing?" | sync error, not syncing, broken, connection issue |

**Related categories**: Meeting Intelligence (calendar/recording), Admin & Settings (API keys)

---

### AI Copilot

**Content**: Copilot overview, available skills, memory system, autonomous mode, conversation management.

| Common User Questions | Search Keywords |
|----------------------|----------------|
| "What can the AI copilot do?" | copilot, AI, assistant, capabilities, features |
| "What skills are available?" | skills, commands, copilot skills |
| "How does copilot memory work?" | memory, context, remember, copilot memory |
| "What is autonomous mode?" | autonomous, AI mode, copilot mode |
| "How do I talk to the copilot?" | copilot, chat, ask, command |
| "Can the copilot create tasks?" | copilot task, AI create, automatic task |
| "How do I clear copilot history?" | clear, history, conversation, reset |

**Related categories**: Tasks & Automation (copilot-created tasks), Pipeline Management (copilot deal analysis)

---

### Admin & Settings

**Content**: Organization configuration, user management, notification preferences, security settings.

| Common User Questions | Search Keywords |
|----------------------|----------------|
| "How do I invite new users?" | invite, add user, team, member |
| "How do I change notification settings?" | notification, alert, email notification, settings |
| "How do I change my password?" | password, security, change password |
| "What are the user roles?" | role, admin, permission, access |
| "How do I set up SSO?" | SSO, single sign-on, SAML, authentication |
| "How do I manage organization settings?" | organization, company settings, org admin |

**Related categories**: Security & Compliance (detailed security docs), Credits & Billing (plan management)

---

### Credits & Billing

**Content**: AI credit system, plan tiers, usage tracking, invoices, credit management.

| Common User Questions | Search Keywords |
|----------------------|----------------|
| "How do AI credits work?" | credits, AI credits, credit system, credit balance |
| "What plan am I on?" | plan, subscription, tier, pricing |
| "How do I upgrade my plan?" | upgrade, change plan, billing |
| "How do I see my credit usage?" | usage, credit usage, consumption, tracking |
| "How do I add more credits?" | add credits, buy credits, credit top-up |

**Related categories**: AI Copilot (credit consumption), Admin & Settings (billing admin)

---

### Security & Compliance

**Content**: Data privacy policies, authentication (SSO, MFA), audit logs, compliance certifications, RLS.

| Common User Questions | Search Keywords |
|----------------------|----------------|
| "Is my data secure?" | security, encryption, data protection |
| "Do you have SOC 2 certification?" | SOC 2, certification, compliance, audit |
| "How do audit logs work?" | audit, log, activity log, security log |
| "How is data isolated between organizations?" | isolation, multi-tenant, RLS, row level security |
| "What data do you collect?" | data collection, privacy, GDPR, data policy |

**Related categories**: Admin & Settings (security settings), Integrations (data flow)

---

## FAQ Patterns -- Most Common Questions

The top 20 questions users ask, ranked by frequency, with the category and quick answer.

| Rank | Question | Category | Quick Answer |
|------|----------|----------|-------------|
| 1 | "How do I connect my calendar?" | Integrations | Settings > Integrations > Google Calendar > Connect |
| 2 | "What does the health score mean?" | Pipeline | Composite score (0-100) based on activity recency, engagement, and velocity |
| 3 | "How do I create a deal?" | Pipeline | Pipeline view > "+ New Deal" or Copilot: "create a deal for Acme" |
| 4 | "Why is my calendar not syncing?" | Troubleshooting | Check connection status in Settings > Integrations; try disconnect/reconnect |
| 5 | "How do I set up Slack alerts?" | Integrations | Settings > Integrations > Slack > Configure pipeline alerts |
| 6 | "What can the AI copilot do?" | AI Copilot | Plan your day, prep for meetings, research leads, draft emails, manage tasks |
| 7 | "How do I import contacts?" | Contacts | Contacts > Import > Upload CSV or connect HubSpot |
| 8 | "How do I invite my team?" | Admin | Settings > Organization > Members > Invite |
| 9 | "Where are my meeting recordings?" | Meetings | Meetings > Select meeting > Recording tab |
| 10 | "How do credits work?" | Credits | Each AI action costs credits; track usage in Settings > Credits |
| 11 | "How do I link a meeting to a deal?" | Meetings | Open the deal > Meetings tab > Link meeting |
| 12 | "How do I change my notification settings?" | Admin | Settings > Notifications > Toggle by type |
| 13 | "How do I automate follow-ups?" | Tasks | Workflows > New workflow > Trigger: Meeting ended > Action: Create task |
| 14 | "What is the notetaker bot?" | Meetings | Auto-join bot that records and transcribes meetings |
| 15 | "How do I export my data?" | Contacts | Pipeline or Contacts > Export > CSV download |
| 16 | "How do I see all tasks for a deal?" | Tasks | Open the deal > Tasks tab |
| 17 | "How do I set up deal stages?" | Pipeline | Settings > Pipeline > Stages > Customize |
| 18 | "Why did my deal health drop?" | Pipeline | Check the health history: which signals changed (activity, engagement, velocity) |
| 19 | "How do I disconnect an integration?" | Integrations | Settings > Integrations > [Integration] > Disconnect |
| 20 | "What happens if I run out of credits?" | Credits | AI features are paused until credits refresh or are added |

---

## Troubleshooting Decision Tree

When a user reports a problem, follow this decision tree to route to the right documentation.

```
User reports a problem
|
|-- Is it about an integration not working?
|   |-- YES -> Check Settings > Integrations > [Integration] status
|   |   |-- Status shows "Connected" -> Re-sync or disconnect/reconnect
|   |   |-- Status shows "Error" -> See integration-specific troubleshooting
|   |   |-- Integration not listed -> It may not be set up yet -> Setup guide
|   |-- NO -> Continue
|
|-- Is it about data not appearing (missing deals, contacts, meetings)?
|   |-- YES -> Check sync status and filters
|   |   |-- Is a filter active? -> Remove filter
|   |   |-- Is the data source connected? -> Check integration
|   |   |-- Was the data recently added? -> Allow 5 min for sync
|   |-- NO -> Continue
|
|-- Is it about the AI copilot not responding or giving wrong answers?
|   |-- YES -> Check credit balance and copilot status
|   |   |-- Credits at zero? -> Add credits or wait for refresh
|   |   |-- Copilot seems confused? -> Clear conversation and start fresh
|   |   |-- Wrong information returned? -> The copilot uses CRM data; verify source data
|   |-- NO -> Continue
|
|-- Is it about permissions or access?
|   |-- YES -> Check user role
|   |   |-- Admin needed? -> Contact org admin
|   |   |-- Feature not available on plan? -> Check plan tier
|   |-- NO -> Continue
|
|-- Is it about performance (slow loading, timeouts)?
|   |-- YES -> Standard troubleshooting
|   |   |-- Clear browser cache
|   |   |-- Try incognito mode
|   |   |-- Check status page for outages
|   |-- NO -> Contact support
```

---

## Cross-Category Relationships

Documentation categories are interconnected. Understanding these relationships helps route complex queries.

| Category A | Category B | Relationship |
|-----------|-----------|-------------|
| Pipeline | Meetings | Meetings can be linked to deals; meeting outcomes affect deal health |
| Pipeline | Tasks | Tasks can be linked to deals; deal events trigger task creation |
| Pipeline | AI Copilot | Copilot analyzes pipeline data and recommends actions |
| Meetings | Integrations | Calendar sync and recording require integration setup |
| Meetings | AI Copilot | Copilot provides meeting prep and post-meeting follow-up |
| Contacts | Pipeline | Contacts are stakeholders on deals |
| Contacts | Integrations | HubSpot and Apollo provide contact enrichment |
| Tasks | AI Copilot | Copilot creates and suggests tasks |
| Admin | Security | Security settings are a subset of admin configuration |
| Admin | Credits | Credit management is an admin function |

### Query Routing for Cross-Category Questions

| Question Pattern | Primary Category | Secondary Category |
|-----------------|-----------------|-------------------|
| "How do meetings affect deal health?" | Pipeline (health scoring) | Meetings (meeting tracking) |
| "How do I automate post-meeting tasks?" | Tasks (automation) | Meetings (triggers) |
| "How do I import HubSpot contacts to my pipeline?" | Integrations (HubSpot) | Contacts (import) |
| "How does the copilot know about my deals?" | AI Copilot (context) | Pipeline (data access) |
| "How do I set up SSO for my team?" | Security (SSO) | Admin (user management) |

---

## Search Keyword Routing Table

A comprehensive mapping of search keywords to their target categories. Use this to route queries efficiently.

| Keywords | Route To | Confidence |
|----------|---------|------------|
| calendar, sync, Google Calendar, events | Integrations > Google Calendar | High |
| deal, pipeline, stage, forecast, health, opportunity | Pipeline Management | High |
| meeting, recording, transcript, notetaker, prep | Meeting Intelligence | High |
| contact, company, person, lead, relationship | Contacts & Companies | High |
| task, to-do, reminder, automation, workflow | Tasks & Automation | High |
| Slack, HubSpot, Fathom, integrate, connect, API | Integrations | High |
| copilot, AI, assistant, skill, autonomous | AI Copilot | High |
| settings, admin, organization, permission, role | Admin & Settings | High |
| credit, billing, plan, upgrade, invoice, usage | Credits & Billing | High |
| security, SSO, audit, privacy, encryption, SOC | Security & Compliance | High |
| getting started, onboarding, setup, new, first time | Getting Started | High |
| not working, error, broken, can't, problem, bug | Troubleshooting (cross-category) | Medium |
| export, import, CSV, download, upload | Contacts (import/export) | Medium |
| notification, alert, email alert | Admin > Notifications | Medium |
| password, login, sign in, authentication | Admin > Security or Security | Medium |

---

## Documentation Gaps and Known Limitations

Areas where documentation may be incomplete or where users frequently cannot find answers.

| Gap Area | User Impact | Workaround |
|----------|-----------|-----------|
| Advanced workflow configuration | Users ask complex automation questions with no detailed guide | Suggest contacting support for complex workflows |
| Custom report building | No detailed guide for building custom reports | Suggest using the copilot for ad-hoc analysis |
| API documentation for developers | Technical users want API reference docs | Direct to developer documentation if available, or support |
| Mobile app documentation | Mobile-specific features and limitations | Note that features may differ on mobile; suggest desktop for full functionality |
| Migration guides from other CRMs | Users switching from Salesforce, HubSpot, etc. | Direct to HubSpot integration docs for HubSpot; suggest support for others |
| Archived/deprecated features | Old feature names in user queries | Redirect to the current feature name and documentation |

When a query falls into a known gap, acknowledge it proactively:
```
"Documentation for [topic] is limited. For detailed guidance, I'd recommend
contacting support at [channel] -- they can walk you through it directly."
```
