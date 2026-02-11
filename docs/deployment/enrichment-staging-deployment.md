# Enrichment Skill Integration - Staging Deployment Guide

Deployment guide for rolling out enhanced organization enrichment to staging environment.

## Pre-Deployment Checklist

### ✅ Development Validation Complete

Verify all test cases passed in development:

```bash
# Run validation script
npm run validate-enrichment

# Expected output:
# ✅ Small Startup (conturae.com): 89% completeness
# ✅ Mid-Size Company (stripe.com): 85% completeness
# ✅ Enterprise (salesforce.com): 85% completeness
# ⚠️  Unknown Company (graceful degradation)
# ⚠️  Domain Redirect (error handling)
#
# Summary: 3/5 passed, 2/5 allowed failures
```

### ✅ Code Review Complete

- [ ] EnrichmentData interface reviewed
- [ ] executeCompanyResearchSkill() reviewed
- [ ] runEnrichmentPipeline() feature flag routing reviewed
- [ ] saveOrganizationContext() new variables reviewed
- [ ] Error handling verified
- [ ] Logging adequate for debugging

### ✅ Documentation Complete

- [ ] README.md created with feature flag documentation
- [ ] Testing guide created
- [ ] Validation script tested
- [ ] Rollback procedure documented

---

## Deployment Steps

### Step 1: Deploy Edge Function to Staging

**Project**: `caerqjzvuerejfrdtygb` (Staging)

```bash
# Deploy deep-enrich-organization edge function
npx supabase functions deploy deep-enrich-organization \
  --project-ref caerqjzvuerejfrdtygb \
  --no-verify-jwt

# Expected output:
# Deploying deep-enrich-organization (project ref: caerqjzvuerejfrdtygb)
# ✓ Function deployed successfully
```

**Note**: `--no-verify-jwt` is required because staging uses ES256 JWTs.

### Step 2: Set Environment Variables

Navigate to: [Supabase Dashboard → Edge Functions → deep-enrich-organization → Secrets](https://supabase.com/dashboard/project/caerqjzvuerejfrdtygb/functions/deep-enrich-organization/secrets)

Set the following environment variable:

| Variable | Value | Description |
|----------|-------|-------------|
| `FEATURE_ENHANCED_RESEARCH` | `true` | Enable company-research skill integration |

**Note**: Do NOT set to `true` immediately. Start with A/B test configuration (Phase 1).

### Step 3: A/B Test Configuration (Phase 1)

**Goal**: Test enhanced research with 25% of new signups

**Option A**: Use edge function logic for sampling

Add to edge function secrets:

| Variable | Value | Description |
|----------|-------|-------------|
| `ENHANCED_RESEARCH_ROLLOUT_PERCENT` | `25` | Percentage of requests to use enhanced research |

Update `deep-enrich-organization/index.ts` (if not already implemented):

```typescript
const ENHANCED_RESEARCH_ROLLOUT_PERCENT = parseInt(Deno.env.get('ENHANCED_RESEARCH_ROLLOUT_PERCENT') || '0', 10);

// In runEnrichmentPipeline():
const useEnhancedResearch = FEATURE_ENHANCED_RESEARCH && (
  ENHANCED_RESEARCH_ROLLOUT_PERCENT === 100 ||
  Math.random() * 100 < ENHANCED_RESEARCH_ROLLOUT_PERCENT
);

if (useEnhancedResearch) {
  // Use company-research skill
} else {
  // Use legacy scraping
}
```

**Option B**: Use database flag per organization

```sql
-- Add column to organizations table (optional)
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS use_enhanced_enrichment BOOLEAN DEFAULT FALSE;

-- Enable for 25% of new orgs (run periodically)
UPDATE organizations
SET use_enhanced_enrichment = TRUE
WHERE id IN (
  SELECT id
  FROM organizations
  WHERE created_at > NOW() - INTERVAL '1 hour'
    AND use_enhanced_enrichment = FALSE
  ORDER BY RANDOM()
  LIMIT (SELECT COUNT(*) * 0.25 FROM organizations WHERE created_at > NOW() - INTERVAL '1 hour')::INTEGER
);
```

**Recommendation**: Use Option A (rollout percentage) for simpler implementation.

### Step 4: Verify Deployment

Test enrichment in staging:

```bash
# Use Supabase client to trigger enrichment
curl -X POST https://caerqjzvuerejfrdtygb.supabase.co/functions/v1/deep-enrich-organization \
  -H "Authorization: Bearer ${STAGING_ANON_KEY}" \
  -H "Content-Type: application/json" \
  -d '{
    "action": "start",
    "organization_id": "test-org-id",
    "domain": "conturae.com"
  }'

# Expected response:
# {
#   "enrichment_id": "uuid",
#   "status": "pending"
# }
```

Check logs:

```bash
npx supabase functions logs deep-enrich-organization \
  --project-ref caerqjzvuerejfrdtygb \
  --tail

# Look for:
# ✅ "[Pipeline] Using enhanced research (company-research skill)"
# ✅ "[executeCompanyResearchSkill] Skill execution successful"
# ✅ "[executeCompanyResearchSkill] Data completeness: XX%"
```

### Step 5: Monitor Initial Results

Query staging database to verify enrichments:

```sql
-- Check enrichment sources distribution
SELECT
  enrichment_source,
  COUNT(*) as count,
  ROUND(AVG(EXTRACT(EPOCH FROM (updated_at - created_at)))) as avg_duration_seconds,
  ROUND(AVG(
    CASE WHEN company_name IS NOT NULL THEN 1 ELSE 0 END +
    CASE WHEN founded_year IS NOT NULL THEN 1 ELSE 0 END +
    CASE WHEN funding_status IS NOT NULL THEN 1 ELSE 0 END +
    CASE WHEN review_ratings IS NOT NULL THEN 1 ELSE 0 END
  ) * 100.0 / 4) as avg_completeness_pct
FROM organization_enrichment
WHERE created_at > NOW() - INTERVAL '1 hour'
GROUP BY enrichment_source;

-- Expected:
-- skill_research: ~25% of enrichments, 30-60s, >80% completeness
-- website: ~75% of enrichments, 120-180s, ~40% completeness
```

---

## Rollout Phases

### Phase 1: Staging Pilot (Week 1)

**Configuration**:
- `ENHANCED_RESEARCH_ROLLOUT_PERCENT=25`
- Monitor for 7 days

**Success Criteria**:
- ✅ Error rate < 5%
- ✅ Avg completeness > 80% (skill_research)
- ✅ Avg duration < 60s (skill_research)
- ✅ No increase in frontend errors

**Monitor**:
```sql
-- Daily summary
SELECT
  DATE(created_at) as date,
  enrichment_source,
  COUNT(*) as enrichments,
  COUNT(CASE WHEN status = 'completed' THEN 1 END) as completed,
  COUNT(CASE WHEN status = 'error' THEN 1 END) as errors,
  ROUND(COUNT(CASE WHEN status = 'error' THEN 1 END) * 100.0 / COUNT(*), 2) as error_rate_pct
FROM organization_enrichment
WHERE created_at > NOW() - INTERVAL '7 days'
GROUP BY DATE(created_at), enrichment_source
ORDER BY date DESC, enrichment_source;
```

**Decision Point**:
- ✅ If success criteria met → Proceed to Phase 2
- ❌ If errors > 5% → Rollback and investigate

### Phase 2: Staging Full (Week 2)

**Configuration**:
- `ENHANCED_RESEARCH_ROLLOUT_PERCENT=100`
- OR remove variable and set `FEATURE_ENHANCED_RESEARCH=true`

**Monitor**:
- Same queries as Phase 1
- Run for 7 days
- Collect feedback from internal testing

**Decision Point**:
- ✅ If no regressions → Proceed to Production rollout
- ❌ If issues detected → Rollback or fix

---

## Production Rollout Plan

### Phase 3: Production Canary (Week 3)

**Project**: `ygdpgliavpxeugaajgrb` (Production)

**Step 1**: Deploy edge function (10% rollout)

```bash
npx supabase functions deploy deep-enrich-organization \
  --project-ref ygdpgliavpxeugaajgrb \
  --no-verify-jwt
```

Set secrets:
- `FEATURE_ENHANCED_RESEARCH=true`
- `ENHANCED_RESEARCH_ROLLOUT_PERCENT=10`

**Monitor for 48 hours**:
- Error rates
- Completion times
- Data completeness
- User feedback

**Step 2**: Increase to 50% (after 48h validation)

Set secrets:
- `ENHANCED_RESEARCH_ROLLOUT_PERCENT=50`

**Monitor for 48 hours**

**Step 3**: Full rollout (after 48h validation)

Set secrets:
- Remove `ENHANCED_RESEARCH_ROLLOUT_PERCENT`
- Keep `FEATURE_ENHANCED_RESEARCH=true`

**Monitor for 1 week**

---

## Monitoring & Alerts

### Key Metrics Dashboard

Create dashboard queries in Supabase:

```sql
-- Real-time enrichment health
CREATE OR REPLACE VIEW enrichment_health AS
SELECT
  enrichment_source,
  COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '1 hour') as last_hour_count,
  COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '24 hours') as last_day_count,
  ROUND(AVG(EXTRACT(EPOCH FROM (updated_at - created_at))) FILTER (WHERE created_at > NOW() - INTERVAL '1 hour')) as avg_duration_seconds,
  ROUND(COUNT(*) FILTER (WHERE status = 'error' AND created_at > NOW() - INTERVAL '1 hour') * 100.0 / NULLIF(COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '1 hour'), 0), 2) as error_rate_pct_1h,
  ROUND(COUNT(*) FILTER (WHERE status = 'error' AND created_at > NOW() - INTERVAL '24 hours') * 100.0 / NULLIF(COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '24 hours'), 0), 2) as error_rate_pct_24h
FROM organization_enrichment
GROUP BY enrichment_source;
```

### Alert Thresholds

Set up alerts for:

| Metric | Threshold | Action |
|--------|-----------|--------|
| Error rate (1h) | > 10% | Immediate investigation |
| Error rate (24h) | > 5% | Review and potential rollback |
| Avg duration (skill_research) | > 90s | Performance investigation |
| Enrichments (1h) | 0 | System health check |

### Alert Implementation

**Option A**: Supabase webhook to Slack

```sql
-- Create alert function
CREATE OR REPLACE FUNCTION check_enrichment_health()
RETURNS void AS $$
DECLARE
  error_rate NUMERIC;
BEGIN
  SELECT error_rate_pct_1h
  INTO error_rate
  FROM enrichment_health
  WHERE enrichment_source = 'skill_research';

  IF error_rate > 10 THEN
    PERFORM net.http_post(
      url := 'https://hooks.slack.com/services/YOUR/WEBHOOK/URL',
      body := json_build_object(
        'text', '🚨 Enrichment error rate: ' || error_rate || '%'
      )::text
    );
  END IF;
END;
$$ LANGUAGE plpgsql;

-- Run every 5 minutes
SELECT cron.schedule('enrichment-health-check', '*/5 * * * *', 'SELECT check_enrichment_health()');
```

**Option B**: External monitoring (DataDog, Sentry, etc.)

Log key events in edge function and send to monitoring service.

---

## Rollback Procedure

### Immediate Rollback (< 5 minutes)

If critical issues detected:

1. **Disable feature flag**:
   - Supabase Dashboard → Edge Functions → deep-enrich-organization → Secrets
   - Set `FEATURE_ENHANCED_RESEARCH=false`
   - Click "Save"

2. **Verify rollback**:
   ```sql
   SELECT enrichment_source, COUNT(*)
   FROM organization_enrichment
   WHERE created_at > NOW() - INTERVAL '10 minutes'
   GROUP BY enrichment_source;
   -- Should show 'website' not 'skill_research'
   ```

3. **Monitor for stabilization**:
   - Check error rates return to baseline
   - Verify enrichments completing successfully

### Post-Rollback Actions

1. **Review error logs**:
   ```bash
   npx supabase functions logs deep-enrich-organization \
     --project-ref caerqjzvuerejfrdtygb \
     --limit 100
   ```

2. **Query failed enrichments**:
   ```sql
   SELECT *
   FROM organization_enrichment
   WHERE status = 'error'
     AND enrichment_source = 'skill_research'
     AND created_at > NOW() - INTERVAL '1 hour'
   ORDER BY created_at DESC;
   ```

3. **Document failure reason** in `.sixty/progress-enrichment-skill-integration.md`

4. **Retry failed enrichments** (optional):
   ```sql
   UPDATE organization_enrichment
   SET status = 'pending', enrichment_source = NULL
   WHERE status = 'error'
     AND enrichment_source = 'skill_research'
     AND created_at > NOW() - INTERVAL '1 hour';
   ```

---

## Success Criteria Summary

| Phase | Duration | Rollout % | Success Criteria |
|-------|----------|-----------|------------------|
| Staging Pilot | 7 days | 25% | Error < 5%, Completeness > 80%, Duration < 60s |
| Staging Full | 7 days | 100% | No regression from pilot |
| Prod Canary | 2 days | 10% | Same as staging + no user complaints |
| Prod Expand | 2 days | 50% | Same as canary |
| Prod Full | Ongoing | 100% | Stable for 7 days |

## Next Steps

After successful staging deployment:

1. ✅ Monitor Phase 1 (25% rollout) for 7 days
2. ✅ Advance to Phase 2 (100% rollout) if success criteria met
3. ✅ Run full validation suite on staging
4. ✅ Prepare production rollout plan
5. ✅ Schedule production deployment with stakeholders
