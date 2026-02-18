-- Drop the original 4-param overloads of team analytics RPCs.
-- The 6-param versions (with p_start_date / p_end_date DEFAULT NULL) were added
-- by 20260218000000_team_analytics_date_range.sql. Because CREATE OR REPLACE with a
-- different signature creates a new overload rather than replacing the original,
-- both exist simultaneously, causing PGRST203 ambiguity errors.
-- This migration removes the old overloads; the 6-param versions handle all cases.

DROP FUNCTION IF EXISTS "public"."get_team_aggregates_with_comparison"("p_org_id" "uuid", "p_period_days" integer);

DROP FUNCTION IF EXISTS "public"."get_team_time_series_metrics"("p_org_id" "uuid", "p_period_days" integer, "p_granularity" "text", "p_user_id" "uuid");

DROP FUNCTION IF EXISTS "public"."get_team_quality_signals"("p_org_id" "uuid", "p_period_days" integer, "p_user_id" "uuid");

DROP FUNCTION IF EXISTS "public"."get_meetings_for_drill_down"("p_org_id" "uuid", "p_metric_type" "text", "p_period_days" integer, "p_user_id" "uuid", "p_limit" integer);

DROP FUNCTION IF EXISTS "public"."get_team_comparison_matrix"("p_org_id" "uuid", "p_period_days" integer);
