# Enrichment Skill Integration Testing Guide

Local testing guide for the enhanced organization enrichment system using the company-research skill.

## Prerequisites

1. **Environment Setup**:
   ```bash
   # .env.development already configured with:
   FEATURE_ENHANCED_RESEARCH=true
   ```

2. **Edge Function Deployed**:
   ```bash
   npx supabase functions deploy deep-enrich-organization \
     --project-ref wbgmnyekgqklggilgqag
   ```

3. **Development Server Running**:
   ```bash
   npm run dev  # Port 5175
   ```

## Test Cases

### Test Case 1: Small Startup (High Data Availability)

**Company**: conturae.com
**Expected Completeness**: 89% (17/19 fields)

**Expected Data**:
- ✅ Company Overview: Name, industry, description
- ✅ Leadership: Dan Debnam (CEO), Jen Timothy (COO)
- ✅ Funding: Pre-seed round
- ✅ Reviews: 5.0 star rating, 200+ reviews
- ✅ Founded: 2022
- ✅ Competitive positioning captured

**Test Steps**:
1. Navigate to onboarding flow: `/onboarding`
2. Enter domain: `conturae.com`
3. Wait for enrichment to complete (~30-60 seconds)
4. Verify enrichment results

**Validation Queries**:
```sql
-- Check enrichment record
SELECT
  enrichment_source,
  company_name,
  founded_year,
  funding_status,
  key_people,
  review_ratings,
  buying_signals_detected,
  (SELECT COUNT(DISTINCT key) FROM organization_context WHERE organization_id = e.organization_id) as context_var_count
FROM organization_enrichment e
WHERE domain = 'conturae.com'
ORDER BY created_at DESC
LIMIT 1;

-- Check context variables
SELECT key, source, confidence, updated_at
FROM organization_context
WHERE organization_id = (SELECT organization_id FROM organization_enrichment WHERE domain = 'conturae.com' ORDER BY created_at DESC LIMIT 1)
ORDER BY key;

-- Expected: 35-40 context variables (20 legacy + 15-20 new)
```

---

### Test Case 2: Mid-Size Company

**Company**: stripe.com
**Expected Completeness**: 85%+ (16/19 fields)

**Expected Data**:
- ✅ Founded year
- ✅ Multiple funding rounds
- ✅ Leadership team
- ✅ Product portfolio
- ✅ Competitive landscape

**Test Steps**:
1. Create test organization
2. Trigger enrichment via edge function:
   ```typescript
   const { data } = await supabase.functions.invoke('deep-enrich-organization', {
     body: {
       action: 'start',
       organization_id: 'test-org-id',
       domain: 'stripe.com'
     }
   });
   ```
3. Poll status endpoint until complete
4. Verify results

---

### Test Case 3: Enterprise

**Company**: salesforce.com
**Expected Completeness**: 85%+ (16/19 fields)

**Expected Data**:
- ✅ Founded year
- ✅ Headquarters location
- ✅ Leadership team
- ✅ Market position and scale
- ✅ Acquisitions in timeline

**Validation**:
```sql
SELECT
  company_name,
  founded_year,
  headquarters,
  employee_count,
  funding_status,
  company_milestones,
  differentiators
FROM organization_enrichment
WHERE domain = 'salesforce.com'
ORDER BY created_at DESC
LIMIT 1;
```

---

### Test Case 4: Unknown Company (Graceful Degradation)

**Company**: fake-company-xyz.com
**Expected Behavior**: Fallback to legacy scraping or minimal data with clear gaps

**Expected Data**:
- ⚠️ enrichment_source = 'website_fallback' (if skill fails)
- ⚠️ Low completeness (< 30%)
- ⚠️ Gaps noted in missing fields

**Test Steps**:
1. Trigger enrichment for non-existent domain
2. Verify graceful error handling (no crashes)
3. Check fallback to legacy scraping occurred

**Validation**:
```sql
SELECT
  enrichment_source,
  status,
  raw_scraped_data,
  error_message
FROM organization_enrichment
WHERE domain = 'fake-company-xyz.com'
ORDER BY created_at DESC
LIMIT 1;

-- Expected: status = 'error' OR enrichment_source = 'website_fallback'
```

---

### Test Case 5: Domain Redirect (Error Handling)

**Company**: conturi.com (redirects to domain marketplace)
**Expected Behavior**: Error handling, no false positives

**Expected Data**:
- ⚠️ status = 'error' OR enrichment_source = 'website_fallback'
- ⚠️ No false positive company data

**Test Steps**:
1. Trigger enrichment for redirect domain
2. Verify error handling
3. Ensure no incorrect data captured

---

## Validation Checklist

After running all test cases:

### ✅ Data Completeness

```sql
-- Field population rate by enrichment source
SELECT
  enrichment_source,
  COUNT(*) as enrichments,
  -- Core fields
  COUNT(company_name) as has_name,
  COUNT(industry) as has_industry,
  COUNT(description) as has_description,
  -- Enhanced fields
  COUNT(founded_year) as has_founded,
  COUNT(funding_status) as has_funding,
  COUNT(leadership_backgrounds) as has_leadership,
  COUNT(review_ratings) as has_reviews,
  COUNT(buying_signals_detected) as has_signals,
  -- Completeness
  ROUND(AVG(
    (CASE WHEN company_name IS NOT NULL THEN 1 ELSE 0 END +
     CASE WHEN industry IS NOT NULL THEN 1 ELSE 0 END +
     CASE WHEN description IS NOT NULL THEN 1 ELSE 0 END +
     CASE WHEN founded_year IS NOT NULL THEN 1 ELSE 0 END +
     CASE WHEN funding_status IS NOT NULL THEN 1 ELSE 0 END +
     CASE WHEN leadership_backgrounds IS NOT NULL THEN 1 ELSE 0 END +
     CASE WHEN review_ratings IS NOT NULL THEN 1 ELSE 0 END +
     CASE WHEN buying_signals_detected IS NOT NULL THEN 1 ELSE 0 END +
     CASE WHEN headquarters IS NOT NULL THEN 1 ELSE 0 END +
     CASE WHEN company_milestones IS NOT NULL THEN 1 ELSE 0 END) * 100.0 / 10
  )) as avg_completeness_pct
FROM organization_enrichment
WHERE created_at > NOW() - INTERVAL '1 hour'
GROUP BY enrichment_source;

-- Expected: skill_research ≥ 80%, website ≤ 50%
```

### ✅ Context Variables

```sql
-- New context variables from enhanced research
SELECT
  key,
  COUNT(*) as population_count,
  AVG(confidence) as avg_confidence
FROM organization_context
WHERE key IN (
  'founded_year', 'headquarters', 'company_type',
  'funding_status', 'investors', 'valuation',
  'review_ratings', 'average_review_rating',
  'recent_news', 'buying_signals_detected',
  'company_milestones', 'differentiators', 'market_trends',
  'leadership_backgrounds'
)
  AND created_at > NOW() - INTERVAL '1 hour'
GROUP BY key
ORDER BY key;

-- Expected: 10-15 variables populated for skill_research enrichments
```

### ✅ Enrichment Source

```sql
-- Verify enrichment_source field is set correctly
SELECT
  enrichment_source,
  COUNT(*) as count,
  AVG(EXTRACT(EPOCH FROM (updated_at - created_at))) as avg_duration_seconds
FROM organization_enrichment
WHERE created_at > NOW() - INTERVAL '1 hour'
GROUP BY enrichment_source;

-- Expected:
-- - enrichment_source IN ('skill_research', 'website', 'website_fallback')
-- - skill_research: 30-60s
-- - website: 120-180s
```

### ✅ Skill Execution

Check edge function logs for successful skill executions:

```bash
npx supabase functions logs deep-enrich-organization \
  --project-ref wbgmnyekgqklggilgqag \
  --tail

# Look for:
# ✅ "[Pipeline] Using enhanced research (company-research skill)"
# ✅ "[executeCompanyResearchSkill] Skill execution successful"
# ✅ "[executeCompanyResearchSkill] Data completeness: XX%"
```

### ✅ Error Handling

```sql
-- Check for any failed enrichments
SELECT
  domain,
  status,
  enrichment_source,
  raw_scraped_data,
  error_message,
  created_at
FROM organization_enrichment
WHERE status = 'error'
  AND created_at > NOW() - INTERVAL '1 hour'
ORDER BY created_at DESC;

-- Expected: Minimal errors, graceful fallback to website_fallback when skill fails
```

---

## Performance Benchmarks

### Success Criteria

| Metric | Target | Baseline (Legacy) |
|--------|--------|-------------------|
| Field Completion | **89%** | 42% |
| Error Rate | **<5%** | Unknown |
| Completion Time | **<60s** | 120-180s |
| New Variables | **15+** | 0 |

### Timing Breakdown

Enhanced Research (skill_research):
- Skill execution: 20-40s
- Data mapping: 2-5s
- Context save: 5-10s
- **Total: 30-60s**

Legacy Scraping (website):
- Website scraping: 60-120s
- Data extraction: 30-60s
- Context save: 5-10s
- **Total: 120-180s**

---

## Troubleshooting

### Issue: Skill Execution Fails

**Symptoms**: enrichment_source = 'website_fallback', logs show skill error

**Check**:
1. Copilot-autonomous edge function deployed?
   ```bash
   npx supabase functions list --project-ref wbgmnyekgqklggilgqag | grep copilot-autonomous
   ```

2. Company-research skill exists in organization_skills?
   ```sql
   SELECT * FROM organization_skills WHERE skill_name = 'company-research' LIMIT 1;
   ```

3. Web search capability enabled for Claude?

**Fix**: Deploy copilot-autonomous or sync skills to organization

---

### Issue: Context Variables Not Saving

**Symptoms**: enrichment completes but context variables missing

**Check**:
1. RPC function exists?
   ```sql
   SELECT proname FROM pg_proc WHERE proname = 'upsert_organization_context';
   ```

2. Edge function logs show context save errors?

**Fix**: Run migration to create upsert_organization_context RPC

---

### Issue: Low Data Completeness

**Symptoms**: completeness < 80% for known companies

**Check**:
1. Skill output mapping correct?
2. Skill returning expected output structure?

**Debug**:
```sql
-- Check raw skill output
SELECT raw_scraped_data
FROM organization_enrichment
WHERE domain = 'conturae.com'
  AND enrichment_source = 'skill_research'
ORDER BY created_at DESC
LIMIT 1;
```

**Fix**: Update field mapping in `executeCompanyResearchSkill()`

---

## Next Steps

After local validation passes:

1. **Deploy to Staging**: `ENRICH-009`
2. **A/B Test**: Enable for 25% of staging signups
3. **Monitor Metrics**: Track completion rate, errors, timing
4. **Production Rollout**: Gradual 10% → 50% → 100% canary
