# Research Comparison Implementation Summary

## Overview

Implemented a head-to-head comparison demo for Gemini 3 Flash (with Google Search grounding) vs Exa (semantic search) for company research enrichment.

**Implementation Date**: 2026-02-11

---

## ✅ Completed Stories

### Story 1: Database Schema Setup ✅
**File**: `supabase/migrations/20260211500000_research_comparison_runs.sql`

- Created `research_comparison_runs` table with all comparison fields
- Added RLS policies for user-scoped access
- Created feature flag `research_provider` in `app_settings`
- Added index for performance

### Story 2: Exa API Integration ✅
**File**: `supabase/functions/_shared/exaSearch.ts`

- Implemented `executeExaSearch(domain: string)` function
- Calls Exa API with semantic search
- Parses response into 19-field enrichment format
- Returns `{ result, cost, duration, error }`
- Cost: $0.005 per search (fixed)

### Story 3: Gemini 3 Flash Integration ✅
**File**: `supabase/functions/_shared/geminiSearch.ts`

- Implemented `executeGeminiSearch(domain: string)` function
- Uses Gemini 3.0 Flash model with Google Search grounding
- Structured JSON output for 19 enrichment fields
- Token usage tracking and cost calculation
- Returns `{ result, cost, duration, error, tokensUsed, sources }`
- Cost: $0.10 per 1M input tokens, $0.30 per 1M output tokens

### Story 4: Research Comparison Edge Function ✅
**File**: `supabase/functions/research-comparison/index.ts`

- Accepts `{ domain: string }`
- Runs Gemini and Exa in parallel
- Calculates quality scores (field completeness)
- Determines winner based on composite score:
  - Quality weighted 2x (most important)
  - Speed normalized (lower is better)
  - Cost weighted 10x
- Saves to `research_comparison_runs` table
- Returns full comparison results

### Story 5: ResearchComparison React Component ✅
**File**: `src/pages/demo/ResearchComparison.tsx`

- Domain input field
- Side-by-side progress panels for Gemini vs Exa
- Real-time logs streaming during execution
- Progress bars showing completion %
- Stats panels (quality, cost, duration, fields)
- Results table comparing all 19 fields
- Winner panel with "Enable" button
- ~680 lines (similar to EnrichmentComparison pattern)

### Story 6: Enable Feature Flag Hook ✅
**File**: `src/lib/hooks/useResearchProvider.ts`

- Reads `research_provider` from `app_settings`
- Returns current provider: `'gemini' | 'exa' | 'disabled'`
- Provides `updateProvider()` function
- Auto-fetches on mount

### Story 7: Integration into Onboarding ✅
**File**: `supabase/functions/deep-enrich-organization/index.ts`

- Added imports for `executeGeminiSearch` and `executeExaSearch`
- Created `mapResearchDataToEnrichment()` helper function
- Integrated research provider check in legacy path
- If `gemini`: calls Gemini 3 Flash, falls back to website scraping on error
- If `exa`: calls Exa search, falls back to website scraping on error
- If `disabled`: uses legacy website scraping
- Logs which provider was used and performance metrics

### Story 8: Add Demo Route ✅
**Files**:
- `src/routes/lazyPages.tsx` - Added lazy import
- `src/App.tsx` - Added route definition

- Route: `/demo/research-comparison`
- Protected with `PlatformAdminRouteGuard`
- Lazy-loaded for code splitting

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                    ResearchComparison.tsx                        │
│  ┌────────────────────┐          ┌────────────────────┐         │
│  │  Gemini 3 Flash    │          │    Exa Search      │         │
│  │  ┌──────────────┐  │          │  ┌──────────────┐  │         │
│  │  │ Progress Bar │  │          │  │ Progress Bar │  │         │
│  │  │ Logs Stream  │  │          │  │ Logs Stream  │  │         │
│  │  │ Stats Panel  │  │          │  │ Stats Panel  │  │         │
│  │  └──────────────┘  │          │  └──────────────┘  │         │
│  └────────────────────┘          └────────────────────┘         │
│                                                                  │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │              Comparison Results Table                       │ │
│  │  Field Name  | Gemini Result | Exa Result | Match?         │ │
│  └────────────────────────────────────────────────────────────┘ │
│                                                                  │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │              Winner Panel                                   │ │
│  │  "Enable Gemini 3 Flash as default?" [Enable Button]       │ │
│  └────────────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────────┘
                              │
                              ▼
                   research-comparison (Edge Function)
                              │
                    ┌─────────┴─────────┐
                    ▼                   ▼
         ┌──────────────────┐  ┌──────────────────┐
         │ Gemini 3 Flash   │  │   Exa Search     │
         │ + Search Ground  │  │   Semantic API   │
         └──────────────────┘  └──────────────────┘
```

---

## Database Schema

### `research_comparison_runs` Table

```sql
- id (UUID, PK)
- organization_id (UUID, FK)
- user_id (UUID, FK)
- domain (TEXT)
- company_name (TEXT)

-- Gemini results
- gemini_result (JSONB)
- gemini_cost (NUMERIC)
- gemini_duration_ms (INTEGER)
- gemini_fields_populated (INTEGER)
- gemini_completeness (NUMERIC)
- gemini_error (TEXT)

-- Exa results
- exa_result (JSONB)
- exa_cost (NUMERIC)
- exa_duration_ms (INTEGER)
- exa_fields_populated (INTEGER)
- exa_completeness (NUMERIC)
- exa_error (TEXT)

-- Comparison
- winner (TEXT: 'gemini' | 'exa' | 'tie' | 'both_failed')
- quality_score_gemini (NUMERIC)
- quality_score_exa (NUMERIC)

- created_at (TIMESTAMPTZ)
- updated_at (TIMESTAMPTZ)
```

### `app_settings` Feature Flag

```sql
key: 'research_provider'
value: '"disabled"' | '"gemini"' | '"exa"'
description: 'Active research provider: gemini | exa | disabled'
```

---

## 19-Field Enrichment Standard

Both Gemini and Exa return data in this standard format:

1. `company_name` - String
2. `description` - String
3. `industry` - String
4. `employee_count_range` - String (e.g., "11-50")
5. `founded_year` - Number
6. `headquarters_location` - String (city, country)
7. `website_url` - String
8. `linkedin_url` - String
9. `funding_stage` - String (e.g., "Series A")
10. `funding_total` - String (e.g., "$5M")
11. `key_investors` - Array of strings
12. `leadership_team` - Array of `{ name, title, background }`
13. `products_services` - Array of strings
14. `customer_segments` - Array of strings
15. `key_competitors` - Array of strings
16. `competitive_differentiators` - Array of strings
17. `tech_stack` - Array of strings
18. `recent_news` - Array of strings
19. `glassdoor_rating` - Number

---

## Environment Variables Required

### Edge Function Secrets

```bash
# Gemini API Key (for Google AI Studio)
GEMINI_API_KEY=<your-gemini-api-key>

# Exa API Key
EXA_API_KEY=<your-exa-api-key>
```

### Setting Secrets (Staging)

```bash
npx supabase secrets set GEMINI_API_KEY=<key> --project-ref caerqjzvuerejfrdtygb
npx supabase secrets set EXA_API_KEY=<key> --project-ref caerqjzvuerejfrdtygb
```

---

## Deployment Checklist

### 1. Run Database Migration

```bash
# Apply migration to staging
npx supabase db push --project-ref caerqjzvuerejfrdtygb
```

### 2. Deploy Edge Function

```bash
# Deploy research-comparison function to staging
npx supabase functions deploy research-comparison \
  --project-ref caerqjzvuerejfrdtygb \
  --no-verify-jwt
```

### 3. Deploy Frontend

```bash
# Build and deploy frontend
npm run build
# Deploy to Vercel/hosting
```

### 4. Test Demo

1. Navigate to `/demo/research-comparison`
2. Enter domain: `conturae.com`
3. Click "Run Comparison"
4. Verify both panels show progress
5. Verify results table populates
6. Verify winner panel shows
7. Test "Enable" button
8. Verify `app_settings` updated

---

## Cost Comparison

| Provider | Cost Model | Typical Cost per Enrichment |
|----------|-----------|----------------------------|
| **Gemini 3 Flash** | $0.10/1M input, $0.30/1M output | ~$0.001 - $0.005 |
| **Exa** | $5 per 1000 searches | $0.005 (fixed) |
| **Website Scraping** | Free (compute only) | $0.000 |

---

## Quality Metrics (Target)

| Metric | Target |
|--------|--------|
| **Gemini Completeness** | ≥85% (17/19 fields) |
| **Exa Completeness** | ≥80% (15/19 fields) |
| **Response Time** | <10 seconds |
| **Cost per Enrichment** | <$0.01 |

---

## Usage

### From UI

1. Navigate to `/demo/research-comparison`
2. Enter company domain
3. Click "Run Comparison"
4. Review results and enable winner

### Programmatically

```typescript
import { useResearchProvider } from '@/lib/hooks/useResearchProvider';

function MyComponent() {
  const { provider, loading, updateProvider } = useResearchProvider();

  const enableGemini = async () => {
    await updateProvider('gemini');
  };

  return (
    <div>
      <p>Current provider: {provider}</p>
      <button onClick={enableGemini}>Enable Gemini</button>
    </div>
  );
}
```

### Edge Function Call

```typescript
const { data, error } = await supabase.functions.invoke('research-comparison', {
  body: { domain: 'example.com' }
});

console.log('Winner:', data.winner);
console.log('Gemini completeness:', data.gemini_completeness);
console.log('Exa completeness:', data.exa_completeness);
```

---

## Next Steps

1. **Test with Multiple Companies**: Run comparison on 10+ different companies
2. **Monitor Performance**: Track which provider wins most often
3. **Collect User Feedback**: Survey users on preferred provider
4. **Optimize Prompts**: Tune Gemini and Exa queries for better field extraction
5. **Production Rollout**: After 2 weeks of staging validation, enable in production

---

## Known Limitations

1. **Exa Field Extraction**: Simple pattern matching, could be improved with LLM-based parsing
2. **Cost Estimation**: Gemini costs vary based on response length
3. **No Caching**: Each comparison runs fresh API calls
4. **Single Domain**: Only supports one domain at a time
5. **No Historical Comparison**: Can't view past comparison runs in UI

---

## File Inventory

### Database
- `supabase/migrations/20260211500000_research_comparison_runs.sql` (NEW)

### Edge Functions
- `supabase/functions/_shared/exaSearch.ts` (NEW)
- `supabase/functions/_shared/geminiSearch.ts` (NEW)
- `supabase/functions/research-comparison/index.ts` (NEW)
- `supabase/functions/deep-enrich-organization/index.ts` (MODIFIED)

### Frontend
- `src/pages/demo/ResearchComparison.tsx` (NEW)
- `src/lib/hooks/useResearchProvider.ts` (NEW)
- `src/routes/lazyPages.tsx` (MODIFIED)
- `src/App.tsx` (MODIFIED)

---

## Success Criteria Met

✅ Database schema created with RLS policies
✅ Exa API integration complete
✅ Gemini 3 Flash integration complete
✅ Research comparison edge function implemented
✅ React component with side-by-side comparison
✅ Feature flag hook implemented
✅ Integration into onboarding pipeline
✅ Demo route added and protected

**Total Implementation Time**: ~4 hours (as estimated)
