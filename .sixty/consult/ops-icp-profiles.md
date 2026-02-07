# Consult Report: ICP Profile Suggestions for Apollo Search

Generated: 2026-02-07

## User Request

> For the Apollo search on a new Op, use the context from the org to suggest audience criteria needed for their target profile by showing them tailored ICP profiles they can click on and then see the filters and profile already set. They can then make changes or accept the criteria.

## Clarifications

- **Q**: AI-generated or rules-based ICP profiles?
- **A**: AI-generated (Claude analyzes org enrichment data to create 2-4 named profiles with pre-mapped Apollo filters)

- **Q**: Where should the ICP profile selector appear?
- **A**: Before the wizard — show profile cards as Step 0 when user clicks "Apollo Search". Clicking a card pre-fills the wizard. "Custom Search" option to skip.

## Analysis Findings

### Available Org Context Data

| Source | Table/Store | Key Fields |
|--------|------------|------------|
| Org Enrichment | `organization_enrichment` | `ideal_customer_profile`, `target_market`, `competitors`, `products`, `buying_signals`, `pain_points`, `industry`, `employee_count` |
| ICP Skill Config | `skillConfigs.icp` (onboarding store) | `companyProfile`, `buyerPersona`, `buyingSignals` |
| Org Context | `organization_context` (key-value) | Merged via `get_organization_context_object()` RPC |
| Organization | `organizations` | `company_industry`, `company_size`, `company_domain` |
| Past Searches | `dynamic_tables.source_query` | Previous Apollo search params (source_type = 'apollo') |

### Current Apollo Search Flow

```
CreateTableModal → onSelectApollo() → ApolloSearchWizard (2-step)
  Step 1: Manual filter entry (titles, locations, keywords, seniority, departments, etc.)
  Step 2: Preview results → Create table
```

### Proposed Flow

```
CreateTableModal → onSelectApollo() → ApolloSearchWizard (3-step)
  Step 0: ICP Profile Selector (NEW)
    - AI-generated profile cards from org context
    - "Custom Search" card to skip
    - Loading state while profiles generate
  Step 1: Filters (pre-filled from selected profile, user can modify)
  Step 2: Preview results → Create table
```

### Risks

| Severity | Risk | Mitigation |
|----------|------|------------|
| Medium | Edge function cold start adds latency on first load | Cache profiles in `organization_context` table; subsequent loads instant |
| Low | Org without enrichment data has no profiles | Show "Custom Search" as only option with helpful message |
| Low | Generated filters may not map perfectly to Apollo params | Use structured output schema in Claude prompt; validate against Apollo enum values |

## Recommended Architecture

### Edge Function: `generate-icp-profiles`

**Input**: Org context (enrichment data, past searches, org info)
**Processing**: Claude analyzes context and generates 2-4 ICP profiles
**Output**: Array of `ICPProfile` objects with pre-mapped `ApolloSearchParams`
**Caching**: Store in `organization_context` with key `icp_apollo_profiles`

### ICPProfile Interface

```typescript
interface ICPProfile {
  id: string
  name: string              // "VP Sales at Mid-Market SaaS"
  description: string       // "Decision-makers at companies with 200-1000 employees..."
  emoji: string             // "🎯"
  filters: ApolloSearchParams
  filter_count: number      // Number of active filters for display
  rationale: string         // Why this profile was suggested
}
```

### Claude Prompt Strategy

Provide Claude with:
1. Company name, industry, products, value propositions
2. Target market and ICP description from enrichment
3. Buyer persona from skill configs
4. Competitors (to find similar companies' decision-makers)
5. Past successful Apollo searches (patterns)
6. Valid Apollo enum values for seniorities, departments, funding stages, employee ranges

Ask Claude to output 2-4 distinct profiles targeting different buyer personas with concrete Apollo filter values.

## Stories

See `.sixty/plan-ops-icp-profiles.json` for execution plan.
