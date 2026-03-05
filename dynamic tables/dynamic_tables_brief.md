# Dynamic Tables — AI-Powered Lead Enrichment & Data Processing

**Product Requirements Document**

| | |
|---|---|
| **Product** | use60 |
| **Feature** | Dynamic Tables |
| **Author** | Andrew @ Sixty Seconds |
| **Date** | 4 February 2026 |
| **Version** | 1.0 — Draft |
| **Status** | In Development |

---

## 1. Executive Summary

Dynamic Tables introduces a Clay-style enrichment and data processing layer into use60, powered by an agent-first, human-review workflow. Revenue leaders ask the use60 copilot to find leads in natural language, and the agent builds a live, editable table of results sourced from Apollo, enriched via AI agents, and executable through Instantly for outbound campaigns.

This feature transforms use60 from a post-call productivity tool into a full-cycle revenue copilot — covering prospecting, enrichment, and outreach execution in a single conversational interface.

> **Core Principle:** Agent-first, human-review. The AI does the heavy lifting — searching, enriching, structuring — and the revenue leader reviews, edits, and approves before anything goes live.

---

## 2. Problem Statement

Revenue leaders currently juggle multiple disconnected tools for prospecting and enrichment. A typical workflow involves searching Apollo for leads, exporting to a spreadsheet, manually enriching data via LinkedIn or other sources, cleaning and formatting the list, importing into an outbound tool like Instantly, and then crafting sequences. Each handoff introduces friction, data loss, and wasted time.

Clay solves parts of this problem but is expensive at scale, complex to configure, and requires users to think like data engineers. Revenue leaders want results, not workflows.

### Key Pain Points

- **Tool fragmentation:** 4–6 tools required to go from "I need leads" to "leads are being contacted"
- **Manual enrichment:** Copy-pasting between LinkedIn, Google, and spreadsheets is time-consuming and error-prone
- **Clay complexity:** Powerful but steep learning curve; most revenue leaders underutilise it
- **No conversational interface:** Existing tools require clicking through UIs rather than describing what you need

---

## 3. Solution Overview

Dynamic Tables is a conversational data workspace embedded within the use60 copilot. Users describe what they need in natural language, and the agent constructs, enriches, and manages structured tables of lead data — ready for review, editing, and outbound execution.

### 3.1 Core User Flow

| Step | Actor | Action | Example |
|------|-------|--------|---------|
| 1 | User | Natural language request to the copilot | "Find me 50 VP Sales at Series B SaaS companies in the US" |
| 2 | Agent | Interprets intent, constructs Apollo search query, executes | Calls Apollo Search API with filters: title, funding, industry, geo |
| 3 | Agent | Builds a dynamic table with results | Table appears with columns: Name, Title, Company, Email, LinkedIn, etc. |
| 4 | User | Reviews table, edits query or filters | "Remove anyone without a verified email" or "Add companies with 50–200 employees" |
| 5 | Agent | Runs enrichment columns on the table | AI agent researches each lead via Google/LinkedIn, adds insights column |
| 6 | User | Reviews enriched data, approves | Checks enrichment quality, edits as needed |
| 7 | Agent | Pushes approved leads to Instantly for outbound | Creates campaign with personalised first lines from enrichment data |

### 3.2 Agent-First Architecture

The copilot uses a Claude-based agent backbone that can plan multi-step enrichment workflows, execute tool calls (Apollo, Apify, web search), and present results in structured table format. The human is always in the loop for review and approval before any outbound action is taken.

**Agent Capabilities:**

- **Query construction:** Translates natural language into structured API calls across all integrated tools
- **Autonomous enrichment:** For each row, the agent can independently research the lead using Google, LinkedIn profile scraping (via Apify), company websites, and news sources
- **Column generation:** Creates new computed columns based on user instructions (e.g., "add a column with a personalised opening line based on their recent LinkedIn activity")
- **Data validation:** Flags incomplete, duplicate, or suspicious data for human review
- **Workflow memory:** Remembers the user's preferences, past queries, and enrichment patterns to improve over time

---

## 4. Feature Specification

### 4.1 Dynamic Table Engine

The table engine is the core UI component. It renders structured data in a spreadsheet-like view within the use60 interface, with the key difference that columns can be AI-generated and rows are populated by agent actions.

**Table Properties:**

- **Editable cells:** Users can manually edit any cell value
- **Column types:** Text, Email, URL, Number, Boolean, AI-Generated, Status
- **Row actions:** Select, delete, enrich, push to integration, view details
- **Bulk actions:** Select all, filter, sort, bulk enrich, bulk push
- **Query bar:** Natural language input that sits above the table for refining, filtering, or extending the dataset
- **Version history:** Table states are saved so users can revert to a previous version

### 4.2 AI Agent Enrichment

The enrichment agent operates similarly to Clay's Claygent but is powered by Claude and integrated with use60's existing copilot infrastructure. Users can add enrichment columns that describe what data they want, and the agent fills them row by row.

**Enrichment Column Workflow:**

1. User adds a new column and describes the enrichment in natural language
2. Agent plans the enrichment approach (which tools/sources to use)
3. Agent processes each row, calling external tools as needed
4. Results populate in the column with confidence indicators
5. User reviews and approves or re-runs failed rows

**Example Enrichment Prompts:**

- "Find their most recent LinkedIn post and summarise it in one sentence"
- "Check if their company has raised funding in the last 12 months"
- "Write a personalised opening line referencing something specific about their role"
- "Find the company's tech stack from their careers page"
- "Score this lead 1–10 based on ICP fit for a B2B SaaS selling to revenue teams"

### 4.3 Integrations

| Integration | Role | Phase | Primary Use |
|-------------|------|-------|-------------|
| Apollo | Lead sourcing & contact data | MVP | Search for leads by title, company, industry, funding stage, geography. Returns contact details including verified emails. |
| Instantly | Outbound execution | MVP | Push enriched lead lists directly into Instantly campaigns. Auto-generate personalised sequences from enrichment data. |
| Apify | Web scraping & data extraction | MVP | Scrape LinkedIn profiles, company pages, and any public web data. Leverages Apify's MCP for tool-call integration with the agent. |
| AI Ark | Data enrichment provider | Phase 2 | Additional data enrichment source for firmographic and technographic data. |
| Reoon | Email verification | Phase 2 | Verify email addresses in bulk before pushing to outbound tools. Reduces bounce rates and protects sender reputation. |
| Expandi | LinkedIn outbound | Phase 2 | Push enriched leads into LinkedIn outreach sequences for multi-channel campaigns. |
| Perplexity | AI-powered research | Phase 2 | Deep research queries for lead and company intelligence beyond what standard scraping provides. |

### 4.4 Apify MCP Integration

Apify provides a Model Context Protocol (MCP) server, which means the Claude agent can call Apify actors directly as tool calls within its reasoning loop. This is a significant architectural advantage — the agent doesn't need custom API wrappers for every scraping task. Instead, it can discover and invoke Apify actors dynamically.

**Key Apify Actors for use60:**

- **LinkedIn Profile Scraper:** Extract profile data, experience, posts, and activity from public LinkedIn profiles
- **Google Search Scraper:** Run Google searches and extract structured results for company research
- **Website Content Crawler:** Extract text content from any public webpage (careers pages, about pages, blog posts)
- **Company LinkedIn Scraper:** Extract company information, employee counts, recent updates from LinkedIn company pages

---

## 5. User Stories

### US-1: Lead Discovery

*As a **revenue leader**, I want to **tell the copilot what kind of leads I need in plain English**, so that **I get a structured table of matching prospects without manually configuring search filters.***

**Acceptance Criteria:**
- Copilot parses natural language into Apollo search parameters
- Results appear in a dynamic table within 10 seconds for up to 100 leads
- User can refine the query conversationally without starting over

### US-2: AI Enrichment

*As a **revenue leader**, I want to **add AI-powered enrichment columns to my lead table**, so that **each lead is automatically researched and scored without me doing manual work.***

**Acceptance Criteria:**
- User describes enrichment in natural language, agent determines the approach
- Agent processes rows with progress indicator and confidence scores
- Failed enrichments are flagged for manual review or retry

### US-3: Outbound Push

*As a **revenue leader**, I want to **push approved leads directly to Instantly with personalised sequences**, so that **I go from research to outreach without exporting and importing CSVs.***

**Acceptance Criteria:**
- One-click push of selected rows to an Instantly campaign
- Enrichment data (personalised lines, company insights) auto-maps to Instantly variables
- Confirmation screen shows what will be sent before execution

### US-4: Query Editing

*As a **revenue leader**, I want to **edit my search query conversationally after seeing initial results**, so that **I can iteratively refine my lead list without starting from scratch.***

**Acceptance Criteria:**
- User can say "narrow this to companies with 50–200 employees" and the table updates
- Previous enrichment data is preserved for rows that remain
- Query history is accessible so the user can revert changes

### US-5: LinkedIn Research Agent

*As a **revenue leader**, I want the **agent to research leads via LinkedIn and Google automatically**, so that **I have contextual intelligence for each prospect without manual searching.***

**Acceptance Criteria:**
- Agent scrapes LinkedIn profiles via Apify to extract recent posts, role changes, and interests
- Agent uses Google to find relevant news, press releases, or blog posts about the company
- Research is summarised into actionable insights per row

---

## 6. Technical Architecture

### 6.1 System Components

| Component | Technology | Responsibility |
|-----------|-----------|----------------|
| Copilot Agent | Claude API (Sonnet/Opus) | Intent parsing, query planning, enrichment orchestration, natural language interaction |
| Table Engine | React (use60 frontend) | Rendering dynamic tables, cell editing, column management, bulk actions |
| Integration Layer | Node.js / API Gateway | Manages connections to Apollo, Instantly, Apify, and future integrations |
| Apify MCP | Model Context Protocol | Enables Claude agent to call Apify actors as native tool calls for web scraping |
| Enrichment Queue | Background job processor | Handles row-by-row enrichment processing with retry logic and rate limiting |
| Data Store | use60 database | Persists table states, enrichment results, query history, and user preferences |

### 6.2 Agent Tool Architecture

The Claude agent operates with a tool-use pattern. For each user request, the agent has access to a defined set of tools that it can call in any order, chaining results together to build the final table output.

**MVP Tool Set:**

- **apollo_search:** Search Apollo's database with structured filters (title, company size, industry, location, funding stage, keywords)
- **apollo_contact_details:** Retrieve verified email and phone for a specific Apollo contact
- **apify_linkedin_profile:** Scrape a LinkedIn profile via Apify to extract experience, posts, and activity
- **apify_google_search:** Run a Google search via Apify and return structured results
- **apify_web_scrape:** Extract content from any public URL via Apify's web crawler
- **instantly_create_campaign:** Create a new campaign in Instantly with leads and sequence
- **instantly_add_leads:** Add leads to an existing Instantly campaign
- **table_create:** Initialise a new dynamic table with specified columns
- **table_add_row:** Add a row of data to the current table
- **table_add_column:** Add a new column (standard or AI-enriched) to the table
- **table_update_cell:** Update a specific cell value

### 6.3 Data Flow

1. User sends a natural language message to the copilot.
2. The agent parses intent and selects appropriate tools.
3. For lead discovery, the agent calls apollo_search and constructs the table.
4. For enrichment, the agent iterates through rows, calling Apify tools and Claude's own reasoning to generate insights.
5. For outbound push, the agent maps enriched data to Instantly's campaign variables and executes the push with user confirmation.

All intermediate states are persisted so the user can pause, resume, or revert at any point.

---

## 7. Competitive Positioning

| Dimension | Clay | use60 Dynamic Tables |
|-----------|------|---------------------|
| Interface | Spreadsheet-first, manual column config | Conversational-first, agent builds the table for you |
| Learning curve | High — requires understanding of enrichment APIs and formulas | Low — describe what you need in plain English |
| Agent capability | Claygent: prompt-per-cell enrichment | Full-cycle agent: search, enrich, and push to outbound in one flow |
| Pricing | Credits-based, expensive at scale ($149–$720+/mo) | Bundled with use60 subscription |
| Post-call integration | None — prospecting only | Integrated with use60's post-call workflows (meeting notes, CRM updates, follow-ups) |
| Target user | RevOps / data-savvy operators | Revenue leaders who want results, not workflows |

> **Positioning Statement:** use60 Dynamic Tables is Clay for revenue leaders who don't want to be data engineers. Describe what you need, review what the AI finds, and push to outbound — all in one conversation.

---

## 8. Phased Delivery Plan

### Phase 1 — MVP

**Core table engine with Apollo search and Instantly push**

| Deliverable | Description | Priority |
|-------------|-------------|----------|
| Conversational lead search | User asks for leads in natural language, agent builds Apollo query and returns table | P0 |
| Dynamic table rendering | Spreadsheet-like view with editable cells, sorting, filtering | P0 |
| Query refinement | User can edit the search conversationally; table updates in place | P0 |
| Basic AI enrichment | Agent can research each lead via Google/LinkedIn (Apify) and populate enrichment columns | P0 |
| Instantly push | Push selected leads to Instantly campaign with mapped variables | P0 |
| Apify MCP integration | Claude agent can call Apify actors for LinkedIn and Google scraping | P0 |
| Table persistence | Tables are saved and can be revisited in future sessions | P1 |
| Enrichment confidence scores | Each AI-generated cell shows a confidence indicator | P1 |

### Phase 2 — Expanded Integrations

**Additional data sources, verification, and multi-channel outbound**

| Deliverable | Description | Priority |
|-------------|-------------|----------|
| AI Ark integration | Firmographic and technographic enrichment via AI Ark data | P1 |
| Reoon email verification | Bulk email verification before outbound push | P1 |
| Expandi integration | Push leads to LinkedIn outbound sequences | P1 |
| Perplexity research | Deep AI-powered research queries for complex enrichment tasks | P2 |
| Enrichment templates | Pre-built enrichment workflows users can apply with one click | P2 |
| Multi-table workflows | Chain tables together (e.g., companies table → contacts table) | P2 |

### Phase 3 — Platform

**Community features, marketplace, and advanced automation**

- Enrichment template marketplace where users share and discover workflows
- Webhook triggers to auto-create tables from CRM events (e.g., new deal stage triggers competitor research table)
- Scheduled enrichment refreshes for long-running campaigns
- Team collaboration on shared tables with role-based access

---

## 9. Success Metrics

| Metric | Target | Measurement |
|--------|--------|-------------|
| Time to first outbound | < 15 minutes from request to Instantly campaign live | Track timestamp from initial copilot query to Instantly push confirmation |
| Enrichment accuracy | > 85% of AI-enriched cells rated accurate by user | User feedback on enrichment quality (thumbs up/down per cell) |
| Adoption rate | > 40% of use60 users create at least one Dynamic Table per week | Weekly active table creators / total active users |
| Query refinement rate | < 3 refinements to get desired lead list | Average number of query edits before user approves the table |
| Outbound conversion | > 15% improvement in reply rates vs manually built lists | A/B test: Dynamic Tables enriched leads vs standard Apollo export leads |

---

## 10. Risks & Mitigations

| Risk | Severity | Mitigation |
|------|----------|------------|
| Apollo API rate limits | High | Implement request queuing, caching of recent searches, and graceful degradation. Explore Apollo partnership or higher-tier plan. |
| Apify scraping reliability | Medium | Build retry logic with exponential backoff. Cache scraped data. Fall back to Google search if LinkedIn scraping fails. |
| AI enrichment hallucination | High | Add confidence scoring, source attribution for every enriched cell, and human review step before any outbound action. |
| Data freshness | Medium | Timestamp all enrichment data. Warn users when data is > 30 days old. Offer re-enrichment option. |
| Cost per enrichment | Medium | Monitor Claude API costs per enrichment. Implement smart batching and caching. Set user-facing enrichment budgets. |
| LinkedIn ToS compliance | High | Use only Apify's compliant scrapers. Rate limit profile scraping. Cache results to minimise repeated access. Legal review before launch. |

---

## 11. Open Questions

1. How should we handle enrichment credits/limits? Per-user monthly cap, per-table budget, or unlimited within the subscription?
2. Do we need a dedicated table view in the UI or does it live within the existing copilot chat as an inline element?
3. Should the agent proactively suggest enrichment columns based on the lead data, or wait for user instruction?
4. What's the maximum table size we need to support? 100 rows? 1,000? 10,000? This affects architecture decisions significantly.
5. How do we handle data privacy across geographies? GDPR implications for enriching EU-based contacts.
6. Should Dynamic Tables integrate with the existing use60 CRM sync, so enriched leads auto-populate in the user's CRM?

---

## Appendix: Example Interaction

> **User:** Find me 50 VP of Sales or CROs at Series B SaaS companies in the US with 50–200 employees

> **use60 Copilot:** I'll search Apollo for that. Building your table now... Found 47 matching leads. I've created a table with columns: Name, Title, Company, Company Size, Funding Stage, Email, LinkedIn URL. Want me to enrich these further?

> **User:** Yes, add a column that summarises their most recent LinkedIn activity and another that scores them 1–10 for ICP fit selling AI automation to revenue teams

> **use60 Copilot:** On it. I'll research each lead's LinkedIn profile and score them against your ICP. This will take about 2 minutes for 47 leads. I'll show progress as I go...

> **User:** Great. When that's done, push anyone scoring 7 or above to my "Q1 Outbound" campaign in Instantly with a personalised first line

> **use60 Copilot:** Will do. I'll filter for leads scoring 7+, generate personalised opening lines from the enrichment data, and push them to your Q1 Outbound campaign. I'll show you a preview before sending. 31 leads qualify — ready to review?

---

*CONFIDENTIAL — Sixty Seconds Ltd.*