# PRD: Website Visitor Intelligence

## Introduction

Website Visitor Intelligence turns anonymous website traffic into actionable sales pipeline. When a visitor lands on a 60 customer's website, a lightweight JS snippet captures session data, resolves the visitor's IP to a company (via People Data Labs), finds the best-fit contact at that company (via Apollo/enrichment cascade), and optionally identifies the exact person (via RB2B). The identified visitor triggers lead creation, Slack notifications, Ops table enrichment, AI-suggested outreach, and optional campaign enrollment.

This is a customer-facing feature: 60 users install the snippet on their own websites, and it auto-injects into landing pages built with 60's landing page builder. No manual install needed for 60-built pages.

## Goals

- Identify anonymous website visitors at the company level with 30-65% match rate on B2B traffic
- Surface the best-fit contact at the identified company using existing enrichment infrastructure
- Deliver person-level identification (20-30% of US traffic) via RB2B integration
- Create leads automatically and notify reps within seconds of a high-intent page visit
- Enable AI copilot to draft personalized outreach referencing the specific pages visited
- Design provider-agnostic IP resolution (start with People Data Labs, swap later)

## User Stories

### US-001: Create `website_visitors` table + `visitor_snippet_configs` table
**Description:** As a developer, I want dedicated tables for storing resolved website visitors and per-org snippet configurations so that visitor data has its own lifecycle separate from campaign tracking.

**Acceptance Criteria:**
- [ ] Migration creates `website_visitors` table with: `id` (UUID PK), `org_id` (UUID FK), `visitor_ip` (TEXT), `user_agent` (TEXT), `session_id` (TEXT), `referrer` (TEXT), `page_url` (TEXT), `page_title` (TEXT), `visited_at` (TIMESTAMPTZ), `resolved_company_name` (TEXT), `resolved_company_domain` (TEXT), `resolved_company_data` (JSONB), `resolution_provider` (TEXT — 'pdl', 'snitcher', etc.), `resolution_status` (TEXT — 'pending', 'resolved', 'unresolvable', 'residential'), `matched_contact_id` (UUID FK nullable → contacts), `rb2b_person_data` (JSONB nullable), `rb2b_identified` (BOOLEAN DEFAULT false), `lead_id` (UUID FK nullable → leads), `enrichment_status` (TEXT — 'pending', 'enriched', 'skipped'), `created_at`, `updated_at`
- [ ] Migration creates `visitor_snippet_configs` table with: `id` (UUID PK), `org_id` (UUID FK unique), `snippet_token` (TEXT unique, auto-generated), `is_active` (BOOLEAN DEFAULT true), `allowed_domains` (TEXT[] — domains where snippet is allowed to fire), `exclude_paths` (TEXT[] — URL paths to ignore), `auto_enrich` (BOOLEAN DEFAULT true), `auto_create_lead` (BOOLEAN DEFAULT true), `rb2b_api_key` (TEXT nullable — user's own RB2B API key), `rb2b_enabled` (BOOLEAN DEFAULT false), `created_at`, `updated_at`
- [ ] RLS policies: users can read/write own org's visitors and configs; service role has full access to both tables
- [ ] Indexes: `org_id`, `visitor_ip`, `session_id`, `resolution_status`, `visited_at`, `snippet_token` (unique)
- [ ] `DROP POLICY IF EXISTS` before `CREATE POLICY`
- [ ] Typecheck passes

### US-002: Build visitor tracking JS snippet + snippet serving edge function
**Description:** As a 60 customer, I want a lightweight JavaScript snippet I can paste into my website so that visitor sessions are tracked and sent to 60 for identification.

**Acceptance Criteria:**
- [ ] New edge function `visitor-snippet-serve/index.ts` serves minified JS based on `snippet_token` query param
- [ ] Snippet is < 5KB minified, loads async, does not block page rendering
- [ ] Snippet captures: `visitor_ip` (from server side — NOT client JS), `user_agent`, `page_url`, `page_title`, `referrer`, `session_id` (generated client-side, persisted in localStorage for 30 min)
- [ ] Snippet sends POST to `visitor-track/index.ts` edge function with captured data
- [ ] Snippet validates `snippet_token` against `visitor_snippet_configs` and checks `allowed_domains` before accepting data
- [ ] Snippet respects `exclude_paths` config (no tracking on specified URL patterns)
- [ ] Edge function extracts real client IP from request headers (`x-forwarded-for`, `x-real-ip`, or `cf-connecting-ip`)
- [ ] Uses `getCorsHeaders(req)` from `_shared/corsHelper.ts`
- [ ] Rate limiting: max 100 events per IP per hour to prevent abuse
- [ ] Typecheck passes

### US-003: Build IP-to-Company resolution edge function
**Description:** As a developer, I want a provider-agnostic IP resolution service so that visitor IPs are resolved to company names using People Data Labs (with ability to swap providers).

**Acceptance Criteria:**
- [ ] New shared utility `_shared/ipResolution.ts` with interface: `resolveIPToCompany(ip: string, provider: string): Promise<CompanyResolution>`
- [ ] People Data Labs adapter: calls PDL IP Enrichment API (`https://api.peopledatalabs.com/v5/ip/enrich`), returns company name, domain, industry, size, location
- [ ] Provider-agnostic: `resolveIPToCompany()` dispatches to the correct adapter based on `provider` param
- [ ] Handles residential IPs gracefully (PDL returns ISP data — mark as `resolution_status: 'residential'` and skip)
- [ ] Handles VPN/datacenter IPs (mark as `resolution_status: 'unresolvable'`)
- [ ] Caches company resolution by IP for 24 hours (avoid duplicate API calls for same IP visiting multiple pages)
- [ ] Deducts from org credit balance via existing `costTracking.ts` pattern
- [ ] Stores full API response in `resolved_company_data` JSONB for future column extraction
- [ ] Uses `maybeSingle()` for config lookups
- [ ] Typecheck passes

### US-004: Build contact matching pipeline (company → best-fit contact)
**Description:** As a sales rep, I want 60 to automatically find the most relevant person at the identified company so that I have someone to reach out to immediately.

**Acceptance Criteria:**
- [ ] New edge function `visitor-enrich-contact/index.ts` triggered after successful IP resolution
- [ ] Queries Apollo People Search API: filter by `resolved_company_domain` + org's ICP criteria (title keywords, seniority level from org settings)
- [ ] Falls back to generic seniority filter (VP, Director, C-level) if no ICP criteria configured
- [ ] Returns top match with: name, title, email, phone, LinkedIn URL
- [ ] Creates or matches contact in `contacts` table using existing `companyMatching.ts` pattern from `linkedin-lead-ingest`
- [ ] Updates `website_visitors.matched_contact_id` with the resolved contact
- [ ] If contact already exists in 60, links to existing record (no duplicate creation)
- [ ] Enrichment cascade: Apollo first, then BetterContact for phone if Apollo phone is missing (when available)
- [ ] Updates `website_visitors.enrichment_status` to 'enriched' or 'skipped'
- [ ] Typecheck passes

### US-005: Integrate RB2B webhook for person-level identification
**Description:** As a sales rep, I want person-level visitor identification (via RB2B) so that I know exactly who visited my site, not just the company.

**Acceptance Criteria:**
- [ ] New edge function `rb2b-webhook/index.ts` receives RB2B webhook POST payloads
- [ ] Parses RB2B payload fields: LinkedIn URL, first name, last name, title, company name, business email, website, industry, employee count, estimated revenue, city, state, captured URL, referrer, tags
- [ ] Matches incoming RB2B event to existing `website_visitors` record by IP + session window (±5 min) or creates new visitor record
- [ ] Stores full RB2B payload in `rb2b_person_data` JSONB, sets `rb2b_identified = true`
- [ ] Creates/matches contact in `contacts` table with RB2B data (higher confidence than Apollo ICP guess)
- [ ] If both Apollo match and RB2B identify exist, RB2B data takes precedence for the contact link
- [ ] Webhook URL per org: `https://{project-ref}.supabase.co/functions/v1/rb2b-webhook?token={snippet_token}`
- [ ] Validates `snippet_token` before processing
- [ ] Idempotent: same RB2B event processed twice does not create duplicate records
- [ ] Uses `getCorsHeaders(req)` and handles CORS preflight
- [ ] Typecheck passes

### US-006: Auto-create leads from identified visitors
**Description:** As a sales rep, I want identified website visitors to automatically become leads so that high-intent visitors enter my pipeline without manual effort.

**Acceptance Criteria:**
- [ ] After contact matching (US-004) or RB2B identification (US-005), create lead in `leads` table if `auto_create_lead` is enabled in snippet config
- [ ] Lead fields: `external_source: 'website_visitor'`, `enrichment_status: 'enriched'`, `enrichment_provider` based on resolution source, contact_id linked
- [ ] Deduplication: if a lead already exists for this contact + org, update `last_interaction_at` instead of creating duplicate
- [ ] Include page visit context in lead metadata: `{ pages_visited: [...], first_seen_at, last_seen_at, total_visits }`
- [ ] Trigger existing enrichment cascade if contact data is incomplete
- [ ] Updates `website_visitors.lead_id` with created/matched lead ID
- [ ] Typecheck passes

### US-007: Slack notification for identified visitors
**Description:** As a sales rep, I want a Slack DM when a high-intent visitor is identified so that I can act quickly while interest is warm.

**Acceptance Criteria:**
- [ ] After lead creation (US-006), send Slack DM to the deal/contact owner (or org default user)
- [ ] Slack message includes: visitor's company name, matched contact name + title, page(s) visited, visit timestamp, confidence level (RB2B confirmed vs Apollo ICP match)
- [ ] Block Kit format with action buttons: "View Contact", "Draft Outreach", "Add to Campaign", "Dismiss"
- [ ] "Draft Outreach" button triggers copilot `post-meeting-followup-drafter` skill variant with website visit context
- [ ] Throttling: max 10 Slack notifications per org per hour (batch remaining into digest)
- [ ] Respects org Slack settings (only fires if Slack integration is connected)
- [ ] Uses existing `slack-send-message` edge function pattern
- [ ] Typecheck passes

### US-008: Visitor Intelligence settings page + snippet install UI
**Description:** As a 60 customer, I want a settings page where I can enable visitor tracking, copy the snippet, configure domains, and connect RB2B.

**Acceptance Criteria:**
- [ ] New settings section under Settings > Integrations: "Website Visitor Intelligence"
- [ ] Shows snippet code block with copy button (pre-filled with org's `snippet_token`)
- [ ] Domain allowlist input (add/remove allowed domains)
- [ ] Exclude paths input (URL patterns to skip)
- [ ] Toggle: "Auto-create leads from visitors" (maps to `auto_create_lead`)
- [ ] Toggle: "Auto-enrich contacts" (maps to `auto_enrich`)
- [ ] RB2B section: API key input + enable toggle + webhook URL display (for user to paste into RB2B settings)
- [ ] Status indicator: "Active" (green) / "No visitors tracked yet" (gray) / "Snippet not installed" (yellow)
- [ ] Last 24h visitor count shown
- [ ] Follows existing `ConfigureModal` + `ConfigSection` + `ConfigToggle` pattern from other integrations
- [ ] `useVisitorIntelligenceIntegration` hook following `useInstantlyIntegration` pattern
- [ ] Verify in browser on localhost:5175
- [ ] Typecheck passes

### US-009: Auto-inject snippet into 60-built landing pages
**Description:** As a 60 customer building landing pages with 60's builder, I want visitor tracking to work automatically without manually adding the snippet.

**Acceptance Criteria:**
- [ ] Landing page publish flow (`landingPublishService.ts`) auto-injects visitor snippet before `</body>` in published HTML
- [ ] Only injects if org has visitor intelligence enabled (`visitor_snippet_configs.is_active = true`)
- [ ] Snippet token pulled from org's config — no hardcoded tokens
- [ ] Published page domain automatically added to `allowed_domains` if not already present
- [ ] Does not double-inject if user manually added the snippet
- [ ] Typecheck passes

### US-010: Website Visitors feed in Ops Tables
**Description:** As a sales rep, I want to see identified website visitors as rows in an Ops table so that I can sort, filter, and act on them alongside my other leads.

**Acceptance Criteria:**
- [ ] New "Website Visitors" template in Ops table creation (pre-configured columns: Company, Contact, Title, Pages Visited, Visit Date, Source, Lead Status)
- [ ] Auto-populate from `website_visitors` where `resolution_status = 'resolved'` and `enrichment_status = 'enriched'`
- [ ] Columns map to visitor/contact/lead data
- [ ] Supports existing Ops table actions: push to Instantly, push to HeyReach (when available), enrich, export
- [ ] Filter by: date range, company size, resolution source (PDL vs RB2B), page visited
- [ ] Refreshes automatically as new visitors are identified
- [ ] Verify in browser on localhost:5175
- [ ] Typecheck passes

### US-011: Copilot skill — visitor-outreach-drafter
**Description:** As a sales rep, I want the AI copilot to draft personalized outreach that references the prospect's website visit so that my outreach feels relevant and timely.

**Acceptance Criteria:**
- [ ] New copilot skill `visitor-outreach-drafter` in `skills/atomic/`
- [ ] Skill context includes: company name, contact name + title, pages visited (with page titles), visit recency, any existing deal/contact history in 60
- [ ] Generates personalized email referencing the specific content they viewed (e.g., "I noticed your team was looking at our pricing page — happy to walk you through...")
- [ ] Tone matches org's existing email style (pulls from `learning_preferences` if available)
- [ ] Callable from: Slack button (US-007), copilot chat, Ops table action
- [ ] Stores draft in `crm_approval_queue` for rep approval before sending
- [ ] Typecheck passes

### US-012: Workflow automation — auto-add to campaign on ICP match
**Description:** As a sales rep, I want visitors who match my ICP to be automatically added to an outreach campaign so that high-intent leads are engaged without manual intervention.

**Acceptance Criteria:**
- [ ] New automation rule type in `ops-automation-builder`: "When visitor matches ICP → add to campaign"
- [ ] ICP matching criteria configurable: company size range, industry list, title keywords, seniority level
- [ ] Campaign target: Instantly campaign (existing integration) or HeyReach campaign (when available)
- [ ] Requires HITL gate: first 10 auto-enrollments require rep approval (builds trust), then switches to autonomous based on acceptance rate
- [ ] Logs automation execution in `usage_events` for cost tracking
- [ ] Rate limit: max 50 auto-enrollments per org per day
- [ ] Typecheck passes

## Functional Requirements

- FR-1: The JS snippet must load asynchronously and not impact page performance (< 5KB, non-blocking)
- FR-2: IP resolution must happen server-side — client IP is never exposed in the JavaScript snippet
- FR-3: IP-to-company resolution must be provider-agnostic with a swappable adapter pattern
- FR-4: Residential and VPN IPs must be classified and skipped (no wasted enrichment credits)
- FR-5: Contact matching must deduplicate against existing contacts in the org
- FR-6: RB2B person-level data takes precedence over Apollo ICP-guess when both exist
- FR-7: Slack notifications must be throttled (max 10/org/hour) to prevent notification fatigue
- FR-8: The HITL gate on campaign auto-enrollment must track acceptance rate and escalate autonomy
- FR-9: All visitor data must be scoped to the org via RLS — no cross-org data leakage
- FR-10: Credit deduction for IP resolution must use existing `costTracking.ts` infrastructure

## Non-Goals (Out of Scope)

- Building our own identity graph for person-level identification (use RB2B for this)
- Real-time "live visitor on site" dashboard (batch processing is fine for v1)
- GDPR consent management for the snippet (customers are responsible for their own cookie consent)
- Multi-provider IP resolution waterfall (start with PDL only, add Snitcher later)
- Visitor session replay or heatmaps (not a Hotjar competitor)
- Phone call tracking or attribution
- Custom event tracking beyond page views

## Technical Considerations

- **Schema**: New `website_visitors` + `visitor_snippet_configs` tables. No changes to existing tables.
- **Edge functions**: 5 new functions (`visitor-snippet-serve`, `visitor-track`, `visitor-enrich-contact`, `rb2b-webhook`, plus resolution logic in `_shared/ipResolution.ts`)
- **Existing patterns to reuse**: `linkedin-lead-ingest` (webhook → match company → create contact → enrich), `companyMatching.ts`, `enrich-cascade`, `costTracking.ts`, `InstantlyClient` pattern for API client, `ConfigureModal` for settings UI
- **API keys**: People Data Labs API key stored as env var (platform-level). RB2B API key stored per-org in `visitor_snippet_configs.rb2b_api_key`.
- **Performance**: IP resolution is async — visitor tracking POST returns immediately, resolution happens in background. Batch resolution for high-traffic sites.
- **Security**: Snippet token validates against `allowed_domains` to prevent spoofing. RB2B webhook validates `snippet_token`. Rate limiting prevents abuse.
- **Credits**: IP resolution costs ~$0.20/lookup via PDL. Must deduct from org credit balance. Show estimated costs in settings UI.

## Success Metrics

- 30%+ of B2B website visitors resolved to a company within 24h of snippet installation
- 80%+ of resolved companies have a best-fit contact surfaced via Apollo
- 15%+ lift in outbound response rate when outreach references website visit
- < 500ms added page load time from snippet
- 60%+ of identified visitors converted to leads within 7 days

## Open Questions

- Should we offer a free tier of IP resolutions per month (e.g., 100 free lookups)?
- Should visitor data be retained indefinitely or have a configurable TTL?
- Should we support cookie consent integration (detect existing consent banner) or leave that to the customer?
