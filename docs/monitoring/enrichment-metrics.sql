-- ============================================================================
-- Enrichment Skill Integration - Monitoring Queries
-- ============================================================================
--
-- SQL queries for monitoring the enhanced organization enrichment system.
-- Use these to track success criteria, identify issues, and validate rollout.
--
-- Success Criteria:
-- - 89% field completion rate (vs 42% baseline)
-- - <5% error rate
-- - <60 second average completion time (vs 120s baseline)
-- - 15+ new context variables populated
--

-- ============================================================================
-- 1. Completion Rate by Enrichment Source
-- ============================================================================

SELECT
  COALESCE(enrichment_source, 'website') as source,
  status,
  COUNT(*) as count,
  ROUND(AVG(EXTRACT(EPOCH FROM (updated_at - created_at)))) as avg_duration_seconds,
  ROUND(MIN(EXTRACT(EPOCH FROM (updated_at - created_at)))) as min_duration_seconds,
  ROUND(MAX(EXTRACT(EPOCH FROM (updated_at - created_at)))) as max_duration_seconds
FROM organization_enrichment
WHERE created_at > NOW() - INTERVAL '7 days'
GROUP BY COALESCE(enrichment_source, 'website'), status
ORDER BY source, status;

-- Expected Results:
-- skill_research | completed | ~N | ~45s | ~30s | ~60s
-- website        | completed | ~M | ~150s | ~120s | ~180s

-- ============================================================================
-- 2. Field Population Rate
-- ============================================================================

WITH field_counts AS (
  SELECT
    enrichment_source,
    -- Core fields (legacy)
    COUNT(company_name) as has_company_name,
    COUNT(tagline) as has_tagline,
    COUNT(description) as has_description,
    COUNT(industry) as has_industry,
    COUNT(employee_count) as has_employee_count,
    COUNT(products) as has_products,
    COUNT(value_propositions) as has_value_propositions,
    COUNT(competitors) as has_competitors,
    COUNT(target_market) as has_target_market,
    COUNT(key_people) as has_key_people,
    -- Enhanced fields (new)
    COUNT(founded_year) as has_founded_year,
    COUNT(headquarters) as has_headquarters,
    COUNT(funding_status) as has_funding_status,
    COUNT(funding_rounds) as has_funding_rounds,
    COUNT(investors) as has_investors,
    COUNT(review_ratings) as has_review_ratings,
    COUNT(recent_news) as has_recent_news,
    COUNT(buying_signals_detected) as has_buying_signals,
    COUNT(company_milestones) as has_company_milestones,
    COUNT(*) as total_enrichments
  FROM organization_enrichment
  WHERE created_at > NOW() - INTERVAL '7 days'
    AND status = 'completed'
  GROUP BY enrichment_source
)
SELECT
  enrichment_source,
  total_enrichments,
  -- Core field percentages
  ROUND(has_company_name * 100.0 / total_enrichments, 1) as pct_company_name,
  ROUND(has_description * 100.0 / total_enrichments, 1) as pct_description,
  ROUND(has_industry * 100.0 / total_enrichments, 1) as pct_industry,
  ROUND(has_products * 100.0 / total_enrichments, 1) as pct_products,
  ROUND(has_competitors * 100.0 / total_enrichments, 1) as pct_competitors,
  ROUND(has_key_people * 100.0 / total_enrichments, 1) as pct_key_people,
  -- Enhanced field percentages
  ROUND(has_founded_year * 100.0 / total_enrichments, 1) as pct_founded_year,
  ROUND(has_headquarters * 100.0 / total_enrichments, 1) as pct_headquarters,
  ROUND(has_funding_status * 100.0 / total_enrichments, 1) as pct_funding_status,
  ROUND(has_review_ratings * 100.0 / total_enrichments, 1) as pct_review_ratings,
  ROUND(has_buying_signals * 100.0 / total_enrichments, 1) as pct_buying_signals,
  -- Overall completeness estimate (19 key fields)
  ROUND((
    has_company_name + has_description + has_industry + has_employee_count +
    has_products + has_value_propositions + has_competitors + has_target_market +
    has_key_people + has_founded_year + has_headquarters + has_funding_status +
    has_funding_rounds + has_investors + has_review_ratings + has_recent_news +
    has_buying_signals + has_company_milestones
  ) * 100.0 / (total_enrichments * 18), 1) as avg_completeness_pct
FROM field_counts
ORDER BY enrichment_source;

-- Expected Results:
-- skill_research | 89% avg_completeness | 80%+ on enhanced fields
-- website        | 42% avg_completeness | 0-5% on enhanced fields

-- ============================================================================
-- 3. Context Variable Population Rate
-- ============================================================================

SELECT
  e.enrichment_source,
  COUNT(DISTINCT c.key) as unique_variables,
  COUNT(*) as total_values,
  ROUND(AVG(c.confidence), 2) as avg_confidence
FROM organization_enrichment e
JOIN organization_context c ON e.organization_id = c.organization_id
WHERE e.created_at > NOW() - INTERVAL '7 days'
  AND e.status = 'completed'
GROUP BY e.enrichment_source
ORDER BY e.enrichment_source;

-- Expected Results:
-- skill_research | 35-40 unique_variables | ~80 total_values | 0.85 confidence
-- website        | 20-25 unique_variables | ~50 total_values | 0.85 confidence

-- ============================================================================
-- 4. New Context Variables (Enhanced Research Only)
-- ============================================================================

SELECT
  key,
  COUNT(*) as population_count,
  ROUND(AVG(confidence), 2) as avg_confidence,
  MIN(created_at) as first_populated,
  MAX(created_at) as last_populated
FROM organization_context
WHERE key IN (
  'founded_year', 'headquarters', 'company_type',
  'funding_status', 'funding_rounds', 'investors', 'valuation',
  'latest_funding',
  'review_ratings', 'average_review_rating',
  'awards', 'recent_news', 'latest_news',
  'buying_signals_detected', 'high_priority_buying_signals',
  'company_milestones',
  'differentiators', 'primary_differentiator',
  'market_trends',
  'leadership_backgrounds'
)
  AND created_at > NOW() - INTERVAL '7 days'
GROUP BY key
ORDER BY population_count DESC;

-- Expected Results:
-- 15+ variables populated
-- founded_year, headquarters, funding_status: 70%+ population
-- buying_signals_detected, review_ratings: 50%+ population
-- market_trends, leadership_backgrounds: 40%+ population

-- ============================================================================
-- 5. Error Rate Analysis
-- ============================================================================

WITH enrichment_stats AS (
  SELECT
    DATE_TRUNC('hour', created_at) as hour,
    enrichment_source,
    COUNT(*) as total,
    COUNT(*) FILTER (WHERE status = 'completed') as completed,
    COUNT(*) FILTER (WHERE status = 'error') as errors
  FROM organization_enrichment
  WHERE created_at > NOW() - INTERVAL '24 hours'
  GROUP BY DATE_TRUNC('hour', created_at), enrichment_source
)
SELECT
  hour,
  enrichment_source,
  total,
  completed,
  errors,
  ROUND(errors * 100.0 / NULLIF(total, 0), 2) as error_rate_pct
FROM enrichment_stats
WHERE total > 0
ORDER BY hour DESC, enrichment_source;

-- Expected Results:
-- error_rate_pct < 5% for both sources
-- skill_research should have similar or better error rate than website

-- ============================================================================
-- 6. Performance Distribution (Percentiles)
-- ============================================================================

WITH durations AS (
  SELECT
    enrichment_source,
    EXTRACT(EPOCH FROM (updated_at - created_at)) as duration_seconds
  FROM organization_enrichment
  WHERE created_at > NOW() - INTERVAL '7 days'
    AND status = 'completed'
)
SELECT
  enrichment_source,
  COUNT(*) as sample_size,
  ROUND(MIN(duration_seconds)) as min_seconds,
  ROUND(PERCENTILE_CONT(0.25) WITHIN GROUP (ORDER BY duration_seconds)) as p25_seconds,
  ROUND(PERCENTILE_CONT(0.50) WITHIN GROUP (ORDER BY duration_seconds)) as p50_median_seconds,
  ROUND(PERCENTILE_CONT(0.75) WITHIN GROUP (ORDER BY duration_seconds)) as p75_seconds,
  ROUND(PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY duration_seconds)) as p95_seconds,
  ROUND(MAX(duration_seconds)) as max_seconds
FROM durations
GROUP BY enrichment_source
ORDER BY enrichment_source;

-- Expected Results (seconds):
-- skill_research | p50: 45s | p95: 60s | max: <90s
-- website        | p50: 150s | p95: 180s | max: <240s

-- ============================================================================
-- 7. Daily Trend (7-day rolling)
-- ============================================================================

SELECT
  DATE(created_at) as date,
  enrichment_source,
  COUNT(*) as enrichments,
  COUNT(*) FILTER (WHERE status = 'completed') as completed,
  COUNT(*) FILTER (WHERE status = 'error') as errors,
  ROUND(COUNT(*) FILTER (WHERE status = 'error') * 100.0 / COUNT(*), 2) as error_rate_pct,
  ROUND(AVG(EXTRACT(EPOCH FROM (updated_at - created_at))) FILTER (WHERE status = 'completed')) as avg_duration_seconds
FROM organization_enrichment
WHERE created_at > NOW() - INTERVAL '7 days'
GROUP BY DATE(created_at), enrichment_source
ORDER BY date DESC, enrichment_source;

-- Use for time-series charts:
-- - Enrichment volume by source
-- - Error rates over time
-- - Performance trends

-- ============================================================================
-- 8. Failed Enrichments (Recent)
-- ============================================================================

SELECT
  id,
  domain,
  enrichment_source,
  status,
  created_at,
  updated_at,
  EXTRACT(EPOCH FROM (updated_at - created_at)) as duration_seconds,
  LEFT(raw_scraped_data, 200) as raw_data_preview,
  error_message
FROM organization_enrichment
WHERE status = 'error'
  AND created_at > NOW() - INTERVAL '24 hours'
ORDER BY created_at DESC
LIMIT 20;

-- Use for debugging:
-- - Identify patterns in failures
-- - Check if specific domains always fail
-- - Validate error messages are informative

-- ============================================================================
-- 9. Skill Execution Success Rate (Detailed)
-- ============================================================================

-- This query shows the breakdown of skill_research vs website_fallback
SELECT
  CASE
    WHEN enrichment_source = 'skill_research' THEN 'Skill Succeeded'
    WHEN enrichment_source = 'website_fallback' THEN 'Skill Failed (Fallback)'
    WHEN enrichment_source = 'website' THEN 'Legacy Path'
    ELSE 'Unknown'
  END as outcome,
  COUNT(*) as count,
  ROUND(COUNT(*) * 100.0 / SUM(COUNT(*)) OVER(), 2) as percentage
FROM organization_enrichment
WHERE created_at > NOW() - INTERVAL '7 days'
GROUP BY enrichment_source
ORDER BY count DESC;

-- Expected Results:
-- Skill Succeeded: 90-95% (when FEATURE_ENHANCED_RESEARCH=true)
-- Skill Failed (Fallback): 5-10%
-- Legacy Path: 0% (when flag=true) or 100% (when flag=false)

-- ============================================================================
-- 10. Real-Time Health Dashboard
-- ============================================================================

-- Create a view for real-time monitoring
CREATE OR REPLACE VIEW enrichment_health_dashboard AS
SELECT
  enrichment_source,
  -- Last hour stats
  COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '1 hour') as last_1h_count,
  COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '1 hour' AND status = 'completed') as last_1h_completed,
  COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '1 hour' AND status = 'error') as last_1h_errors,
  ROUND(
    COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '1 hour' AND status = 'error') * 100.0 /
    NULLIF(COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '1 hour'), 0),
    2
  ) as last_1h_error_rate_pct,
  ROUND(
    AVG(EXTRACT(EPOCH FROM (updated_at - created_at))) FILTER (WHERE created_at > NOW() - INTERVAL '1 hour' AND status = 'completed')
  ) as last_1h_avg_duration_seconds,
  -- Last 24 hours stats
  COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '24 hours') as last_24h_count,
  COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '24 hours' AND status = 'completed') as last_24h_completed,
  COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '24 hours' AND status = 'error') as last_24h_errors,
  ROUND(
    COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '24 hours' AND status = 'error') * 100.0 /
    NULLIF(COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '24 hours'), 0),
    2
  ) as last_24h_error_rate_pct,
  ROUND(
    AVG(EXTRACT(EPOCH FROM (updated_at - created_at))) FILTER (WHERE created_at > NOW() - INTERVAL '24 hours' AND status = 'completed')
  ) as last_24h_avg_duration_seconds
FROM organization_enrichment
GROUP BY enrichment_source;

-- Query the dashboard
SELECT * FROM enrichment_health_dashboard;

-- Expected Results (when FEATURE_ENHANCED_RESEARCH=true):
-- skill_research | 1h_error_rate < 5% | 1h_avg_duration < 60s
-- website_fallback | small count (failed skill executions)

-- ============================================================================
-- 11. Success Criteria Validation
-- ============================================================================

-- All-in-one query to validate success criteria
WITH metrics AS (
  SELECT
    -- Metric 1: Field Completion Rate
    (
      SELECT ROUND(AVG(
        (CASE WHEN founded_year IS NOT NULL THEN 1 ELSE 0 END +
         CASE WHEN headquarters IS NOT NULL THEN 1 ELSE 0 END +
         CASE WHEN funding_status IS NOT NULL THEN 1 ELSE 0 END +
         CASE WHEN review_ratings IS NOT NULL THEN 1 ELSE 0 END +
         CASE WHEN buying_signals_detected IS NOT NULL THEN 1 ELSE 0 END +
         CASE WHEN company_milestones IS NOT NULL THEN 1 ELSE 0 END +
         CASE WHEN differentiators IS NOT NULL THEN 1 ELSE 0 END +
         CASE WHEN market_trends IS NOT NULL THEN 1 ELSE 0 END +
         CASE WHEN leadership_backgrounds IS NOT NULL THEN 1 ELSE 0 END +
         CASE WHEN company_name IS NOT NULL THEN 1 ELSE 0 END +
         CASE WHEN industry IS NOT NULL THEN 1 ELSE 0 END +
         CASE WHEN description IS NOT NULL THEN 1 ELSE 0 END +
         CASE WHEN products IS NOT NULL THEN 1 ELSE 0 END +
         CASE WHEN competitors IS NOT NULL THEN 1 ELSE 0 END +
         CASE WHEN key_people IS NOT NULL THEN 1 ELSE 0 END
        ) * 100.0 / 15
      ), 1)
      FROM organization_enrichment
      WHERE enrichment_source = 'skill_research'
        AND created_at > NOW() - INTERVAL '7 days'
        AND status = 'completed'
    ) as field_completion_pct,

    -- Metric 2: Error Rate
    (
      SELECT ROUND(
        COUNT(*) FILTER (WHERE status = 'error') * 100.0 / COUNT(*),
        2
      )
      FROM organization_enrichment
      WHERE enrichment_source = 'skill_research'
        AND created_at > NOW() - INTERVAL '7 days'
    ) as error_rate_pct,

    -- Metric 3: Average Completion Time
    (
      SELECT ROUND(AVG(EXTRACT(EPOCH FROM (updated_at - created_at))))
      FROM organization_enrichment
      WHERE enrichment_source = 'skill_research'
        AND created_at > NOW() - INTERVAL '7 days'
        AND status = 'completed'
    ) as avg_completion_time_seconds,

    -- Metric 4: New Variables Count
    (
      SELECT COUNT(DISTINCT key)
      FROM organization_context
      WHERE key IN (
        'founded_year', 'headquarters', 'company_type',
        'funding_status', 'investors', 'review_ratings',
        'buying_signals_detected', 'company_milestones',
        'differentiators', 'market_trends', 'leadership_backgrounds'
      )
        AND created_at > NOW() - INTERVAL '7 days'
    ) as new_variables_count
)
SELECT
  'Field Completion' as metric,
  field_completion_pct as current_value,
  89 as target_value,
  CASE WHEN field_completion_pct >= 89 THEN '✅ PASS' ELSE '❌ FAIL' END as status
FROM metrics
UNION ALL
SELECT
  'Error Rate',
  error_rate_pct,
  5,
  CASE WHEN error_rate_pct <= 5 THEN '✅ PASS' ELSE '❌ FAIL' END
FROM metrics
UNION ALL
SELECT
  'Avg Completion Time',
  avg_completion_time_seconds,
  60,
  CASE WHEN avg_completion_time_seconds <= 60 THEN '✅ PASS' ELSE '❌ FAIL' END
FROM metrics
UNION ALL
SELECT
  'New Context Variables',
  new_variables_count,
  15,
  CASE WHEN new_variables_count >= 15 THEN '✅ PASS' ELSE '❌ FAIL' END
FROM metrics;

-- Expected Results (all PASS):
-- Field Completion   | 89%  | 89  | ✅ PASS
-- Error Rate         | 3%   | 5   | ✅ PASS
-- Avg Completion Time| 45s  | 60  | ✅ PASS
-- New Context Vars   | 18   | 15  | ✅ PASS
