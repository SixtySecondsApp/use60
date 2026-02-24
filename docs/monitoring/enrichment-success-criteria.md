# Enrichment Skill Integration - Success Criteria

Success criteria and validation guidelines for the enhanced organization enrichment system.

## Overview

The company-research skill integration aims to improve organization enrichment from **42% to 89% data completeness** while reducing enrichment time from **120-180s to 30-60s**.

## Success Criteria Matrix

| # | Metric | Target | Baseline | Measurement | Priority |
|---|--------|--------|----------|-------------|----------|
| 1 | **Field Completion Rate** | **≥89%** | 42% | % of 19 key fields populated | **Critical** |
| 2 | **Error Rate** | **<5%** | Unknown (~2%) | % of enrichments with status='error' | **Critical** |
| 3 | **Average Completion Time** | **<60s** | 120-180s | Avg seconds from created_at to updated_at | **High** |
| 4 | **New Context Variables** | **≥15** | 0 | Count of new variables populated | **High** |
| 5 | **Skill Execution Success** | **≥90%** | N/A | % using skill_research (not fallback) | **Medium** |

---

## Metric 1: Field Completion Rate

**Target**: ≥89% (17/19 fields populated)
**Baseline**: 42% (8/19 fields populated)
**Priority**: **Critical**

### 19 Key Fields

**Core Fields (10)**:
1. company_name
2. tagline
3. description
4. industry
5. employee_count
6. products
7. value_propositions
8. competitors
9. target_market
10. key_people

**Enhanced Fields (9)**:
11. founded_year
12. headquarters
13. funding_status
14. funding_rounds
15. review_ratings
16. recent_news
17. buying_signals_detected
18. company_milestones
19. differentiators

### Validation Query

```sql
-- Run from enrichment-metrics.sql query #2
SELECT enrichment_source, avg_completeness_pct
FROM field_counts
WHERE enrichment_source = 'skill_research';

-- Expected: avg_completeness_pct >= 89%
```

### Acceptance Criteria

- ✅ **Pass**: avg_completeness_pct ≥ 89% for skill_research
- ⚠️  **Warning**: 80-89% (acceptable, monitor)
- ❌ **Fail**: < 80% (investigate root cause)

### Common Failure Modes

| Scenario | Symptom | Root Cause | Fix |
|----------|---------|------------|-----|
| Low availability companies | 40-60% completeness | Limited public data | Expected, acceptable for unknown companies |
| Skill output mapping bug | Specific field always null | Field mapping incorrect | Fix `executeCompanyResearchSkill()` |
| Skill not executing | All enhanced fields null | Skill execution failing | Check copilot-autonomous deployment |

---

## Metric 2: Error Rate

**Target**: <5%
**Baseline**: ~2% (legacy scraping)
**Priority**: **Critical**

### Definition

Percentage of enrichments with `status='error'` in the last 24 hours.

### Validation Query

```sql
-- Run from enrichment-metrics.sql query #5
SELECT enrichment_source, error_rate_pct
FROM enrichment_stats
WHERE hour >= NOW() - INTERVAL '24 hours';

-- Expected: error_rate_pct < 5% for skill_research
```

### Acceptance Criteria

- ✅ **Pass**: error_rate_pct < 5%
- ⚠️  **Warning**: 5-10% (monitor, may be temporary spike)
- ❌ **Fail**: > 10% (immediate investigation required)

### Error Categories

| Error Type | Severity | Action |
|------------|----------|--------|
| Skill execution timeout | Medium | Increase timeout or optimize skill |
| Skill output format error | High | Fix output schema validation |
| Network errors (transient) | Low | Implement retry logic |
| Domain redirect/invalid | Low | Expected, handle gracefully |
| Rate limiting (Crunchbase, G2) | High | Implement backoff, caching |

### Debugging Failed Enrichments

```sql
-- Run from enrichment-metrics.sql query #8
SELECT domain, error_message, created_at
FROM organization_enrichment
WHERE status = 'error'
  AND enrichment_source = 'skill_research'
  AND created_at > NOW() - INTERVAL '24 hours'
ORDER BY created_at DESC;
```

**Common Patterns**:
- Multiple failures for same domain → Permanent issue with company
- All failures in same time window → Temporary service outage
- Specific error message repeated → Code bug

---

## Metric 3: Average Completion Time

**Target**: <60 seconds
**Baseline**: 120-180 seconds
**Priority**: **High**

### Definition

Average time from `created_at` to `updated_at` for successfully completed enrichments.

### Validation Query

```sql
-- Run from enrichment-metrics.sql query #6
SELECT enrichment_source, p50_median_seconds, p95_seconds
FROM durations
WHERE enrichment_source = 'skill_research';

-- Expected: p50 < 60s, p95 < 90s
```

### Acceptance Criteria

- ✅ **Pass**: p50 < 60s, p95 < 90s
- ⚠️  **Warning**: p50 60-90s, p95 90-120s (performance degradation)
- ❌ **Fail**: p50 > 90s (investigate bottleneck)

### Performance Distribution Targets

| Percentile | Target | Acceptable | Unacceptable |
|------------|--------|------------|--------------|
| p50 (median) | <45s | <60s | >60s |
| p75 | <55s | <75s | >75s |
| p95 | <75s | <90s | >90s |
| p99 | <90s | <120s | >120s |

### Debugging Slow Enrichments

1. **Check skill execution logs**:
   ```bash
   npx supabase functions logs deep-enrich-organization --tail
   ```

2. **Identify slow phase**:
   - Skill execution: 20-40s (expected)
   - Data mapping: 2-5s (expected)
   - Context save: 5-10s (expected)
   - Total: 30-60s

3. **Common bottlenecks**:
   - Web search latency (Crunchbase, G2 API delays)
   - Context save batch size (reduce chunk size)
   - Network timeouts (adjust timeout settings)

---

## Metric 4: New Context Variables

**Target**: ≥15 unique new variables
**Baseline**: 0 (legacy scraping doesn't populate these)
**Priority**: **High**

### Definition

Number of unique new context variables populated in organization_context table.

### Expected New Variables (20 total)

**Minimum 15 Required**:
1. founded_year
2. headquarters
3. company_type
4. funding_status
5. funding_rounds
6. investors
7. valuation
8. review_ratings
9. awards
10. recent_news
11. buying_signals_detected
12. company_milestones
13. differentiators
14. market_trends
15. leadership_backgrounds

**Convenience Variables (Bonus 5)**:
16. latest_funding
17. average_review_rating
18. latest_news
19. high_priority_buying_signals
20. primary_differentiator

### Validation Query

```sql
-- Run from enrichment-metrics.sql query #4
SELECT key, population_count
FROM organization_context
WHERE key IN ('founded_year', 'headquarters', ...) -- full list
  AND created_at > NOW() - INTERVAL '7 days'
GROUP BY key
HAVING COUNT(*) > 0;

-- Expected: COUNT(DISTINCT key) >= 15
```

### Acceptance Criteria

- ✅ **Pass**: ≥15 unique variables populated
- ⚠️  **Warning**: 10-14 variables (partial success)
- ❌ **Fail**: <10 variables (investigate mapping)

### Expected Population Rates

| Variable | Target Population % | Notes |
|----------|---------------------|-------|
| founded_year | 80%+ | Most companies have founding year public |
| headquarters | 70%+ | Usually available |
| funding_status | 70%+ | Available for funded companies |
| review_ratings | 50%+ | Only for B2B SaaS companies |
| buying_signals_detected | 60%+ | Detected from news/hiring |
| company_milestones | 50%+ | Available for established companies |
| leadership_backgrounds | 40%+ | Requires LinkedIn/news research |

---

## Metric 5: Skill Execution Success Rate

**Target**: ≥90%
**Baseline**: N/A (new feature)
**Priority**: **Medium**

### Definition

Percentage of enrichments where skill execution succeeded (vs. fallback to legacy scraping).

### Validation Query

```sql
-- Run from enrichment-metrics.sql query #9
SELECT outcome, percentage
FROM (
  SELECT
    CASE
      WHEN enrichment_source = 'skill_research' THEN 'Skill Succeeded'
      WHEN enrichment_source = 'website_fallback' THEN 'Skill Failed (Fallback)'
      ELSE 'Other'
    END as outcome,
    COUNT(*) * 100.0 / SUM(COUNT(*)) OVER() as percentage
  FROM organization_enrichment
  WHERE created_at > NOW() - INTERVAL '7 days'
  GROUP BY enrichment_source
) sub;

-- Expected: Skill Succeeded >= 90%
```

### Acceptance Criteria

- ✅ **Pass**: ≥90% skill_research
- ⚠️  **Warning**: 80-90% skill_research (monitor fallback reasons)
- ❌ **Fail**: <80% skill_research (investigate root cause)

### Fallback Triggers

The system falls back to legacy scraping when:
1. Skill execution throws error
2. Skill returns no outputs
3. Skill times out (>90s)

**Expected fallback rate**: 5-10% (obscure companies, network issues)
**Unacceptable fallback rate**: >20% (indicates systemic issue)

---

## Combined Success Criteria Dashboard

### Quick Validation

Run this single query to check all criteria:

```sql
-- Run from enrichment-metrics.sql query #11
SELECT * FROM success_criteria_validation;

-- Expected output:
-- Field Completion   | 91%  | 89  | ✅ PASS
-- Error Rate         | 2.3% | 5   | ✅ PASS
-- Avg Completion Time| 47s  | 60  | ✅ PASS
-- New Context Vars   | 18   | 15  | ✅ PASS
```

### Rollout Decision Matrix

| All Criteria Pass? | Action |
|--------------------|--------|
| ✅ All PASS | **Proceed** to next rollout phase |
| ⚠️  1-2 WARNINGS | **Monitor** for 24h, then proceed if stable |
| ❌ 1+ FAIL | **Pause rollout**, investigate root cause |
| ❌ Multiple FAILS | **Rollback** immediately |

---

## Monitoring Cadence

### During Rollout Phases

| Phase | Check Frequency | Alert Threshold |
|-------|-----------------|-----------------|
| **Staging Pilot** (25% rollout) | Every 4 hours | Error rate > 10% (1h window) |
| **Staging Full** (100% rollout) | Every 8 hours | Error rate > 5% (24h window) |
| **Prod Canary** (10% rollout) | Every 2 hours | Error rate > 10% (1h window) |
| **Prod Expand** (50% rollout) | Every 4 hours | Error rate > 5% (24h window) |
| **Prod Full** (100% rollout) | Daily | Error rate > 5% (24h window) |

### Post-Rollout (Steady State)

- **Daily**: Check real-time health dashboard
- **Weekly**: Review all 5 success criteria
- **Monthly**: Analyze trends, optimize performance

---

## Alerting Rules

### Critical Alerts (Immediate Action)

Trigger Slack/PagerDuty when:
- Error rate > 10% (1-hour window)
- No enrichments completed in last hour (system outage)
- Avg completion time > 120s (performance degradation)

### Warning Alerts (Review Within 24h)

Trigger email notification when:
- Error rate 5-10% (24-hour window)
- Completion time 60-90s (24-hour window)
- Field completion < 85% (24-hour window)

### Implementation

```sql
-- See enrichment-staging-deployment.md "Monitoring & Alerts" section
-- for webhook/cron job setup
```

---

## Reporting

### Weekly Report Template

```
Enrichment Skill Integration - Weekly Report
Week of: [DATE]

Success Criteria Status:
✅ Field Completion: 91% (target: 89%)
✅ Error Rate: 2.1% (target: <5%)
✅ Avg Completion Time: 42s (target: <60s)
✅ New Context Vars: 18/20 populated (target: ≥15)
✅ Skill Success Rate: 94% (target: ≥90%)

Key Metrics:
- Total enrichments: 1,247
- skill_research: 1,175 (94%)
- website_fallback: 72 (6%)

Issues:
- None

Recommendations:
- All criteria met, proceed to next phase
```

### Monthly Trend Analysis

Track month-over-month improvements:
- Field completion rate trend
- Error rate trend
- Performance improvements
- New variable adoption

---

## Next Steps

After validating success criteria:

1. ✅ Verify all 5 criteria pass in staging
2. ✅ Run validation for 7 days continuous
3. ✅ Document any edge cases or warnings
4. ✅ Prepare production rollout plan
5. ✅ Set up monitoring dashboards
6. ✅ Configure alerting thresholds
