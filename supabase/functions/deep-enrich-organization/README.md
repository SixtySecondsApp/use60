# Deep Enrich Organization Edge Function

Organization enrichment pipeline that extracts company intelligence for skill personalization.

## Overview

Two-prompt pipeline using Gemini 2.0 Flash for speed:
1. **Data Collection** - Scrape and extract raw company information
2. **Skill Generation** - Contextualize data into structured skill configurations

## Features

### Enhanced Research Mode (Feature Flag)

**Environment Variable**: `FEATURE_ENHANCED_RESEARCH`

When enabled, replaces legacy website scraping with the `company-research` skill for multi-source intelligence gathering.

| Mode | Data Source | Completeness | Time | Sources |
|------|-------------|--------------|------|---------|
| **Enhanced** (flag=true) | company-research skill | 89% (17/19 fields) | 30-60s | Crunchbase, G2, LinkedIn, news, SEC filings |
| **Legacy** (flag=false) | Website scraping | 42% (8/19 fields) | 120-180s | Company website only (12 URLs) |

**Comparison** (conturae.com):
- **Legacy**: 8 fields, missing leadership, funding, timeline, competitors
- **Enhanced**: 17 fields, captures CEO (Dan Debnam), COO (Jen Timothy), pre-seed funding, 5.0 star rating

### New Fields (Enhanced Mode Only)

When `FEATURE_ENHANCED_RESEARCH=true`, enrichment captures 15+ additional context variables:

**Company Details**:
- `founded_year` - Year company was established
- `headquarters` - Location of main office
- `company_type` - Business classification (startup, enterprise, etc.)

**Financials**:
- `funding_status` - Current funding stage
- `funding_rounds` - Array of funding events
- `investors` - List of investors
- `valuation` - Company valuation signals

**Market Intelligence**:
- `review_ratings` - G2, Capterra, TrustPilot ratings
- `awards` - Industry recognition
- `recent_news` - Recent announcements/events
- `buying_signals_detected` - Sales intent signals

**Timeline**:
- `company_milestones` - Key events by year

**Competitive Intelligence**:
- `differentiators` - Unique value props
- `market_trends` - Industry context

**Leadership**:
- `leadership_backgrounds` - Executive experience

## Configuration

### Development

```bash
# .env.development
FEATURE_ENHANCED_RESEARCH=true
```

### Staging

```bash
# Supabase Dashboard → Edge Functions → deep-enrich-organization → Secrets
FEATURE_ENHANCED_RESEARCH=true
```

Deploy command:
```bash
npx supabase functions deploy deep-enrich-organization \
  --project-ref caerqjzvuerejfrdtygb \
  --no-verify-jwt
```

### Production

Gradual rollout recommended:

**Phase 1**: 10% canary (1 week)
```bash
# Set in Supabase dashboard
FEATURE_ENHANCED_RESEARCH=true
ENHANCED_RESEARCH_ROLLOUT_PERCENT=10
```

**Phase 2**: 50% (1 week)
```bash
ENHANCED_RESEARCH_ROLLOUT_PERCENT=50
```

**Phase 3**: 100% (full rollout)
```bash
FEATURE_ENHANCED_RESEARCH=true
# Remove ENHANCED_RESEARCH_ROLLOUT_PERCENT
```

Deploy command:
```bash
npx supabase functions deploy deep-enrich-organization \
  --project-ref ygdpgliavpxeugaajgrb \
  --no-verify-jwt
```

## Rollback Procedure

If issues detected with enhanced research:

### Immediate Rollback (< 5 minutes)

1. **Disable feature flag** in Supabase Dashboard:
   - Navigate to: Edge Functions → deep-enrich-organization → Secrets
   - Set: `FEATURE_ENHANCED_RESEARCH=false`
   - Click "Save"

2. **Verify rollback**:
   ```sql
   -- Check recent enrichments are using legacy path
   SELECT enrichment_source, COUNT(*)
   FROM organization_enrichment
   WHERE created_at > NOW() - INTERVAL '10 minutes'
   GROUP BY enrichment_source;
   -- Should show 'website' not 'skill_research'
   ```

3. **Monitor**: System automatically reverts to legacy website scraping
   - No data loss
   - Backward compatible
   - No code deployment needed

### Post-Rollback Actions

1. **Review error logs**:
   ```sql
   SELECT *
   FROM organization_enrichment
   WHERE status = 'error'
     AND enrichment_source = 'skill_research'
     AND created_at > NOW() - INTERVAL '1 hour'
   ORDER BY created_at DESC;
   ```

2. **Document failure reason** in `.sixty/progress-enrichment-skill-integration.md`

3. **Retry failed enrichments** (if needed):
   ```sql
   -- Mark for retry
   UPDATE organization_enrichment
   SET status = 'pending', enrichment_source = 'website'
   WHERE status = 'error'
     AND enrichment_source = 'skill_research'
     AND created_at > NOW() - INTERVAL '1 hour';
   ```

## Actions

| Action | Description |
|--------|-------------|
| `start` | Begin enrichment for an organization (website-based or skill-based) |
| `manual` | Begin enrichment from Q&A answers (no website available) |
| `status` | Check enrichment status |
| `retry` | Retry failed enrichment |

## API

### Request

```typescript
{
  "action": "start",
  "organization_id": "uuid",
  "domain": "example.com"
}
```

### Response

```typescript
{
  "enrichment_id": "uuid",
  "status": "pending" | "researching" | "analyzing" | "complete" | "error",
  "enrichment_source": "skill_research" | "website",
  "completeness": number, // 0-100%
  "fields_populated": number,
  "total_fields": number
}
```

## Monitoring

Key metrics to track:

```sql
-- Completion rate by source
SELECT
  COALESCE(enrichment_source, 'website') as source,
  status,
  COUNT(*) as count,
  AVG(EXTRACT(EPOCH FROM (updated_at - created_at))) as avg_duration_seconds
FROM organization_enrichment
WHERE created_at > NOW() - INTERVAL '7 days'
GROUP BY enrichment_source, status;

-- Field population rate
SELECT
  e.enrichment_source,
  COUNT(DISTINCT c.key) as unique_variables,
  COUNT(*) as total_values
FROM organization_enrichment e
JOIN organization_context c ON e.organization_id = c.organization_id
WHERE e.created_at > NOW() - INTERVAL '7 days'
GROUP BY e.enrichment_source;
```

**Success Criteria**:
- ✅ 89% field completion rate (vs 42% baseline)
- ✅ <5% error rate
- ✅ <60 second average completion time (vs 120s baseline)
- ✅ 15+ new context variables populated

## Backward Compatibility

**Guaranteed**:
- ✅ All existing context variables still populate
- ✅ Existing skill templates continue to work
- ✅ Database schema unchanged
- ✅ Frontend onboarding flow unchanged

**Enhanced**:
- ➕ 15+ new context variables for skill interpolation
- ➕ Higher data quality (89% vs 42%)
- ➕ Faster enrichment (30-60s vs 120-180s)
- ➕ Multi-source validation

## Development

### Local Testing

1. Enable feature flag:
   ```bash
   echo "FEATURE_ENHANCED_RESEARCH=true" >> .env.development
   ```

2. Deploy to development:
   ```bash
   npx supabase functions deploy deep-enrich-organization \
     --project-ref wbgmnyekgqklggilgqag
   ```

3. Test enrichment:
   ```typescript
   const { data } = await supabase.functions.invoke('deep-enrich-organization', {
     body: {
       action: 'start',
       organization_id: 'test-org-id',
       domain: 'conturae.com'
     }
   });
   ```

4. Validate results:
   ```sql
   SELECT
     enrichment_source,
     company_name,
     founded_year,
     funding_status,
     review_ratings,
     buying_signals_detected
   FROM organization_enrichment
   WHERE organization_id = 'test-org-id';
   ```

### Test Cases

1. **Small startup**: conturae.com
   - Expected: 17/19 fields, leadership, funding, reviews

2. **Mid-size company**: stripe.com
   - Expected: Founded year, funding rounds, products

3. **Enterprise**: salesforce.com
   - Expected: Headquarters, leadership, market position

4. **Unknown company**: fake-company-xyz.com
   - Expected: Graceful fallback, minimal data with gaps noted

5. **Domain redirect**: conturi.com (redirects to marketplace)
   - Expected: Error handling, no false positives

## Troubleshooting

### Enrichment Stuck in "researching" Status

```sql
-- Check for stuck enrichments (> 5 minutes)
SELECT *
FROM organization_enrichment
WHERE status = 'researching'
  AND created_at < NOW() - INTERVAL '5 minutes';

-- Reset to retry
UPDATE organization_enrichment
SET status = 'pending'
WHERE id = '<enrichment-id>';
```

### Skill Execution Errors

Check edge function logs:
```bash
npx supabase functions logs deep-enrich-organization \
  --project-ref wbgmnyekgqklggilgqag \
  --tail
```

### Missing Context Variables

Verify skill output mapping in `executeCompanyResearchSkill()` function.

## Related Documentation

- Skill: `skills/atomic/company-research/SKILL.md`
- Integration Plan: `.sixty/plan-enrichment-skill-integration.json`
- Progress Tracking: `.sixty/progress-enrichment-skill-integration.md`
- Monitoring Queries: `docs/monitoring/enrichment-metrics.sql`
