-- =============================================================================
-- Fix Security Definer Views (Supabase lint 0010)
-- Ported from 20260225000001_fix_security_definer_views.sql (timestamp conflict)
-- =============================================================================
-- 8 views flagged as SECURITY DEFINER. Recreate with security_invoker = on.
-- CREATE OR REPLACE VIEW is idempotent — safe to re-run.
-- =============================================================================

-- ─── Group 1: Apply security_invoker = on ────────────────────────────────────

-- 1. subscription_facts_view
CREATE OR REPLACE VIEW "public"."subscription_facts_view"
WITH (security_invoker = on)
AS
 SELECT "os"."id",
    "os"."org_id",
    "os"."plan_id",
    "sp"."slug" AS "plan_slug",
    "sp"."name" AS "plan_name",
    "os"."status",
    "os"."billing_cycle",
    "os"."started_at",
    "os"."current_period_start",
    "os"."current_period_end",
    "os"."trial_start_at",
    "os"."trial_ends_at",
    "os"."canceled_at",
    "os"."cancel_at_period_end",
    "os"."current_recurring_amount_cents",
    "os"."recurring_interval",
    "os"."interval_count",
    "os"."currency",
    "public"."calculate_normalized_monthly_amount"("os"."current_recurring_amount_cents", "os"."recurring_interval", "os"."interval_count") AS "normalized_mrr_cents",
    "os"."discount_info",
    "os"."customer_country",
    "os"."first_payment_at",
    "os"."last_payment_at",
    "os"."stripe_subscription_id",
    "os"."stripe_customer_id",
    "os"."stripe_price_id",
    "date_trunc"('month'::"text", "os"."started_at") AS "cohort_month",
    "date_trunc"('week'::"text", "os"."started_at") AS "cohort_week",
    ("os"."status" = ANY (ARRAY['active'::"text", 'trialing'::"text"])) AS "is_active",
    ("os"."status" = 'trialing'::"text") AS "is_trialing",
    "os"."created_at",
    "os"."updated_at"
   FROM ("public"."organization_subscriptions" "os"
     JOIN "public"."subscription_plans" "sp" ON (("sp"."id" = "os"."plan_id")));

-- 2. mrr_current_view
CREATE OR REPLACE VIEW "public"."mrr_current_view"
WITH (security_invoker = on)
AS
 SELECT COALESCE("sum"("normalized_mrr_cents"), (0)::bigint) AS "total_mrr_cents",
    "count"(*) FILTER (WHERE "is_active") AS "active_subscriptions",
    "count"(*) FILTER (WHERE "is_trialing") AS "trialing_subscriptions",
    "currency"
   FROM "public"."subscription_facts_view"
  WHERE ("is_active" = true)
  GROUP BY "currency";

-- 3. mrr_movement_view
CREATE OR REPLACE VIEW "public"."mrr_movement_view"
WITH (security_invoker = on)
AS
 SELECT ("occurred_at")::"date" AS "change_date",
    COALESCE(("metadata" ->> 'currency'::"text"), 'GBP'::"text") AS "currency",
    "count"(*) FILTER (WHERE ("event_type" = 'subscription_created'::"text")) AS "new_subscriptions",
    COALESCE("sum"((("metadata" ->> 'amount'::"text"))::bigint) FILTER (WHERE ("event_type" = 'subscription_created'::"text")), (0)::numeric) AS "new_mrr_cents",
    "count"(*) FILTER (WHERE ("event_type" = 'subscription_updated'::"text")) AS "plan_changes",
    "count"(*) FILTER (WHERE ("event_type" = 'subscription_canceled'::"text")) AS "canceled_subscriptions",
    COALESCE("sum"((("metadata" ->> 'amount'::"text"))::bigint) FILTER (WHERE ("event_type" = 'subscription_canceled'::"text")), (0)::numeric) AS "churned_mrr_cents"
   FROM "public"."billing_event_log" "bel"
  WHERE (("provider" = 'stripe'::"text") AND ("event_type" = ANY (ARRAY['subscription_created'::"text", 'subscription_updated'::"text", 'subscription_canceled'::"text"])) AND ("processed_at" IS NOT NULL))
  GROUP BY (("occurred_at")::"date"), COALESCE(("metadata" ->> 'currency'::"text"), 'GBP'::"text")
  ORDER BY (("occurred_at")::"date") DESC, COALESCE(("metadata" ->> 'currency'::"text"), 'GBP'::"text");

-- 4. meeting_action_items_view
CREATE OR REPLACE VIEW public.meeting_action_items_view
WITH (security_invoker = on)
AS
SELECT
  id,
  meeting_id,
  title,
  (metadata->>'assignee_name')::text as assignee_name,
  (metadata->>'assignee_email')::text as assignee_email,
  priority,
  task_type as category,
  due_date as deadline_at,
  completed,
  (metadata->>'ai_generated')::boolean as ai_generated,
  (metadata->>'timestamp_seconds')::integer as timestamp_seconds,
  (metadata->>'playback_url')::text as playback_url,
  created_at,
  updated_at,
  (metadata->>'linked_task_id')::uuid as linked_task_id,
  (metadata->>'is_sales_rep_task')::boolean as is_sales_rep_task,
  task_type as ai_task_type,
  due_date::date as ai_deadline,
  confidence_score as ai_confidence_score,
  reasoning as ai_reasoning,
  (metadata->>'ai_analyzed_at')::timestamptz as ai_analyzed_at,
  (metadata->>'task_id')::uuid as task_id,
  (metadata->>'synced_to_task')::boolean as synced_to_task,
  (metadata->>'sync_status')::text as sync_status,
  (metadata->>'sync_error')::text as sync_error,
  (metadata->>'synced_at')::timestamptz as synced_at,
  confidence_score as ai_confidence,
  (metadata->>'needs_review')::boolean as needs_review,
  (metadata->>'assigned_to_name')::text as assigned_to_name,
  (metadata->>'assigned_to_email')::text as assigned_to_email,
  due_date::date as deadline_date,
  (metadata->>'importance')::text as importance
FROM tasks
WHERE source = 'meeting_transcript'
  AND (metadata->>'migrated_from')::text = 'meeting_action_items';

-- 5. next_action_suggestions_view
CREATE OR REPLACE VIEW public.next_action_suggestions_view
WITH (security_invoker = on)
AS
SELECT
  id,
  (metadata->>'activity_id')::uuid as activity_id,
  (metadata->>'activity_type')::text as activity_type,
  deal_id,
  company_id,
  contact_id,
  assigned_to as user_id,
  (metadata->>'original_action_type')::text as action_type,
  title,
  reasoning,
  CASE priority
    WHEN 'urgent' THEN 'high'
    WHEN 'high' THEN 'medium'
    ELSE 'low'
  END as urgency,
  due_date as recommended_deadline,
  confidence_score,
  CASE status
    WHEN 'pending_review' THEN 'pending'
    WHEN 'approved' THEN 'accepted'
    WHEN 'dismissed' THEN 'dismissed'
    WHEN 'completed' THEN 'completed'
    ELSE 'pending'
  END as status,
  (metadata->>'user_feedback')::text as user_feedback,
  (metadata->>'created_task_id')::uuid as created_task_id,
  created_at,
  (metadata->>'dismissed_at')::timestamptz as dismissed_at,
  (metadata->>'accepted_at')::timestamptz as accepted_at,
  (metadata->>'completed_at')::timestamptz as completed_at,
  (metadata->>'ai_model')::text as ai_model,
  (metadata->>'context_quality')::numeric as context_quality,
  (metadata->>'timestamp_seconds')::integer as timestamp_seconds,
  (metadata->>'importance')::text as importance
FROM tasks
WHERE source = 'meeting_ai'
  AND (metadata->>'migrated_from')::text = 'next_action_suggestions';

-- ─── Group 2: Admin-only PII views ───────────────────────────────────────────

-- 6. affected_personal_email_users
CREATE OR REPLACE VIEW "public"."affected_personal_email_users"
WITH (security_invoker = on)
AS
SELECT
  p.id as user_id,
  p.email,
  p.first_name,
  p.last_name,
  LOWER(SPLIT_PART(p.email, '@', 2)) as email_domain,
  o.id as shared_org_id,
  o.name as shared_org_name,
  (SELECT COUNT(*) FROM organization_memberships WHERE org_id = o.id) as members_in_org,
  p.created_at,
  om.created_at as membership_created_at
FROM profiles p
JOIN organization_memberships om ON om.user_id = p.id
JOIN organizations o ON o.id = om.org_id
WHERE
  LOWER(SPLIT_PART(p.email, '@', 2)) IN (
    SELECT domain FROM personal_email_domains
  )
  AND LOWER(o.name) = LOWER(SPLIT_PART(SPLIT_PART(p.email, '@', 2), '.', 1))
  AND (SELECT COUNT(*) FROM organization_memberships WHERE org_id = o.id) > 1
ORDER BY p.created_at DESC, o.name;

REVOKE SELECT ON "public"."affected_personal_email_users" FROM anon, authenticated;
GRANT  SELECT ON "public"."affected_personal_email_users" TO service_role;

-- 7. users_without_organizations
CREATE OR REPLACE VIEW "public"."users_without_organizations"
WITH (security_invoker = on)
AS
SELECT
  p.id as user_id,
  p.email,
  p.first_name,
  p.last_name,
  LOWER(SPLIT_PART(p.email, '@', 2)) as email_domain,
  CASE
    WHEN LOWER(SPLIT_PART(p.email, '@', 2)) IN (SELECT domain FROM personal_email_domains)
      THEN 'personal_email'
    ELSE 'corporate_email'
  END as email_type,
  p.created_at,
  NOW() - p.created_at as time_without_org
FROM profiles p
LEFT JOIN organization_memberships om ON om.user_id = p.id
WHERE om.org_id IS NULL
ORDER BY p.created_at DESC;

REVOKE SELECT ON "public"."users_without_organizations" FROM anon, authenticated;
GRANT  SELECT ON "public"."users_without_organizations" TO service_role;

-- 8. single_member_personal_email_orgs
CREATE OR REPLACE VIEW "public"."single_member_personal_email_orgs"
WITH (security_invoker = on)
AS
SELECT
  o.id as org_id,
  o.name as org_name,
  LOWER(SPLIT_PART(o.name, '.', 1)) as inferred_domain,
  p.id as only_member_user_id,
  p.email as only_member_email,
  o.created_at,
  om.created_at as membership_created_at
FROM organizations o
JOIN organization_memberships om ON om.org_id = o.id
JOIN profiles p ON p.id = om.user_id
WHERE
  LOWER(o.name) IN (
    SELECT LOWER(domain) FROM personal_email_domains
  )
  AND (SELECT COUNT(*) FROM organization_memberships WHERE org_id = o.id) = 1
ORDER BY o.created_at DESC;

REVOKE SELECT ON "public"."single_member_personal_email_orgs" FROM anon, authenticated;
GRANT  SELECT ON "public"."single_member_personal_email_orgs" TO service_role;
