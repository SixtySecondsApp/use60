# Consult Report: Client Fact Profiles
Generated: 2026-02-11

## User Request
"The Prospecting feature helps build audiences but doesn't verify accuracy against the ICP. Use company research tools to scrape up-to-date information on an org, build a profile that can be checked/edited in a visually appealing page, shared externally for client confirmation, and then used as the signed-off source of truth for building accurate ICP profiles and prospect lists."

## Clarifications
- Q: Who is the "client" in this workflow?
- A: Primarily the client org we're building lists for, but users also use it for ICP target building/verification.

## Agent Findings

### Codebase Scout
- `deep-enrich-organization` edge function: Two-prompt Gemini pipeline, collects 30+ data fields
- `company-research` skill: Web search → structured JSON report (company_overview, leadership, products, financials, etc.)
- `company-analysis` skill: Deep business intelligence analysis
- `sales-enrich` skill: 4 parallel agents for lead + company enrichment
- `organization_enrichment` table: Stores raw enrichment data per org
- `companyEnrichmentService.ts`: Frontend Perplexity/Apollo enrichment
- Demo comparison page exists at `src/pages/demo/EnrichmentComparison.tsx`

### Patterns Analyst
- Share pattern: `/share/:token` routes with `PublicProposal`, `PublicMeetingShare`, `PublicVoiceRecording`
- Share columns: `share_token UUID`, `is_public BOOLEAN`, `password_hash TEXT`, `share_views INTEGER`, `last_viewed_at`
- Detail page layout: Header → Tabs → Main + Sidebar (CompanyProfile.tsx, ContactRecord.tsx)
- Edge function auth bypass: service role client for public share endpoints
- No PDF/export infrastructure exists

### Risk Scanner
- No PDF library installed — need to add one
- `assigned_to_contact_id` referenced in code but may not exist in migration
- `contacts.organization_id` vs `contacts.clerk_org_id` discrepancy
- External sharing needs security: rate limiting, share expiry, optional password

### Scope Sizer
- 13 stories across 7 phases
- Parallel opportunities in phases 1, 3, 4, 5, 6
- Critical path: schema → service → editor → research → share → approval

## Synthesis

### Agreements
- Need new `client_fact_profiles` table (not extension of organization_enrichment)
- Reuse proven share token pattern from proposals
- Reuse `company-research` skill for data collection
- Follow existing detail page layout patterns
- External page needs approval buttons (approve/request changes)

### Architecture Decision
The Fact Profile is a **standalone entity** (not tied to organization_enrichment) because:
1. Multiple fact profiles per org (one per client, one per target company)
2. Different lifecycle (draft → researching → review → approved vs enrichment's scraping → completed)
3. Needs share infrastructure that organization_enrichment doesn't have
4. Needs version history for audit trail
5. Links to ICP profiles as source of truth

### Data Model
```sql
client_fact_profiles:
  id, organization_id, created_by
  company_name, company_domain, company_logo_url
  profile_type: 'client_org' | 'target_company'
  research_data: JSONB (structured sections)
  research_sources: JSONB (source URLs + confidence)
  research_status: 'pending' | 'researching' | 'complete' | 'failed'
  approval_status: 'draft' | 'pending_review' | 'approved' | 'changes_requested' | 'archived'
  approval_feedback: TEXT
  approved_by: TEXT (name, since external)
  approved_at: TIMESTAMPTZ
  share_token: UUID
  is_public: BOOLEAN
  share_password_hash: TEXT
  share_views: INTEGER
  last_viewed_at: TIMESTAMPTZ
  share_expires_at: TIMESTAMPTZ
  linked_icp_profile_ids: UUID[] (profiles built from this fact profile)
  version: INTEGER
  created_at, updated_at
```

### research_data JSONB Structure
```json
{
  "company_overview": {
    "name": "",
    "tagline": "",
    "description": "",
    "founded_year": null,
    "headquarters": "",
    "company_type": "",
    "website": ""
  },
  "market_position": {
    "industry": "",
    "sub_industries": [],
    "target_market": "",
    "market_size": "",
    "differentiators": [],
    "competitors": []
  },
  "products_services": {
    "products": [],
    "use_cases": [],
    "pricing_model": "",
    "key_features": []
  },
  "team_leadership": {
    "employee_count": null,
    "employee_range": "",
    "key_people": [],
    "departments": [],
    "hiring_signals": []
  },
  "financials": {
    "revenue_range": "",
    "funding_status": "",
    "funding_rounds": [],
    "total_raised": "",
    "investors": [],
    "valuation": ""
  },
  "technology": {
    "tech_stack": [],
    "platforms": [],
    "integrations": []
  },
  "ideal_customer_indicators": {
    "target_industries": [],
    "target_company_sizes": [],
    "target_roles": [],
    "buying_signals": [],
    "pain_points": [],
    "value_propositions": []
  },
  "recent_activity": {
    "news": [],
    "awards": [],
    "milestones": [],
    "reviews_summary": {}
  }
}
```
