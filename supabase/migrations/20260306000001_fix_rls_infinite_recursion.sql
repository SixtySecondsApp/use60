-- Fix: Replace inline `SELECT FROM profiles WHERE is_admin` in RLS policies
-- with the existing `is_admin_optimized()` SECURITY DEFINER function.
-- The inline version causes infinite recursion when evaluated on the profiles
-- table itself, and cascading 500 errors on any table whose policies
-- touch profiles (notifications, api_monitor_rollups_daily, etc.).

BEGIN;

-- =============================================================================
-- 1. Drop the recursive policy on profiles table (root cause)
-- =============================================================================
DROP POLICY IF EXISTS "profiles_platform_admin_select" ON profiles;

-- =============================================================================
-- 2. Fix all other tables that use inline admin check
--    Pattern: EXISTS(SELECT 1 FROM profiles WHERE id=auth.uid() AND is_admin)
--    Replace with: is_admin_optimized()  (SECURITY DEFINER, bypasses RLS)
-- =============================================================================

-- agent_dead_letters
DROP POLICY IF EXISTS "Platform admins can read agent_dead_letters" ON agent_dead_letters;
CREATE POLICY "Platform admins can read agent_dead_letters" ON agent_dead_letters
  FOR SELECT USING (is_admin_optimized());

-- ai_feature_config
DROP POLICY IF EXISTS "Platform admins can manage ai_feature_config" ON ai_feature_config;
CREATE POLICY "Platform admins can manage ai_feature_config" ON ai_feature_config
  FOR ALL USING (is_admin_optimized()) WITH CHECK (is_admin_optimized());

-- ai_models
DROP POLICY IF EXISTS "Platform admins can manage ai_models" ON ai_models;
CREATE POLICY "Platform admins can manage ai_models" ON ai_models
  FOR ALL USING (is_admin_optimized()) WITH CHECK (is_admin_optimized());

-- api_monitor_improvements
DROP POLICY IF EXISTS "platform_admins_can_read_improvements" ON api_monitor_improvements;
CREATE POLICY "platform_admins_can_read_improvements" ON api_monitor_improvements
  FOR SELECT USING (is_admin_optimized());

-- api_monitor_rollups_daily
DROP POLICY IF EXISTS "platform_admins_can_read_rollups" ON api_monitor_rollups_daily;
CREATE POLICY "platform_admins_can_read_rollups" ON api_monitor_rollups_daily
  FOR SELECT USING (is_admin_optimized());

-- api_monitor_snapshots
DROP POLICY IF EXISTS "platform_admins_can_read_snapshots" ON api_monitor_snapshots;
CREATE POLICY "platform_admins_can_read_snapshots" ON api_monitor_snapshots
  FOR SELECT USING (is_admin_optimized());

-- api_usage_alerts
DROP POLICY IF EXISTS "api_usage_alerts_admin_read" ON api_usage_alerts;
CREATE POLICY "api_usage_alerts_admin_read" ON api_usage_alerts
  FOR SELECT USING (is_admin_optimized());

-- api_usage_snapshots
DROP POLICY IF EXISTS "api_usage_snapshots_admin_read" ON api_usage_snapshots;
CREATE POLICY "api_usage_snapshots_admin_read" ON api_usage_snapshots
  FOR SELECT USING (is_admin_optimized());

-- auto_top_up_log
DROP POLICY IF EXISTS "Platform admins can manage all auto_top_up_log" ON auto_top_up_log;
CREATE POLICY "Platform admins can manage all auto_top_up_log" ON auto_top_up_log
  FOR ALL USING (is_admin_optimized()) WITH CHECK (is_admin_optimized());

-- auto_top_up_settings
DROP POLICY IF EXISTS "Platform admins can manage all auto_top_up_settings" ON auto_top_up_settings;
CREATE POLICY "Platform admins can manage all auto_top_up_settings" ON auto_top_up_settings
  FOR ALL USING (is_admin_optimized()) WITH CHECK (is_admin_optimized());

-- credit_budget_caps
DROP POLICY IF EXISTS "Platform admins can manage all credit_budget_caps" ON credit_budget_caps;
CREATE POLICY "Platform admins can manage all credit_budget_caps" ON credit_budget_caps
  FOR ALL USING (is_admin_optimized()) WITH CHECK (is_admin_optimized());

-- credit_packs
DROP POLICY IF EXISTS "Platform admins can manage all credit_packs" ON credit_packs;
CREATE POLICY "Platform admins can manage all credit_packs" ON credit_packs
  FOR ALL USING (is_admin_optimized()) WITH CHECK (is_admin_optimized());

-- credit_transactions
DROP POLICY IF EXISTS "Platform admins can manage all credit_transactions" ON credit_transactions;
CREATE POLICY "Platform admins can manage all credit_transactions" ON credit_transactions
  FOR ALL USING (is_admin_optimized()) WITH CHECK (is_admin_optimized());

-- cron_job_logs
DROP POLICY IF EXISTS "cron_job_logs_admin_read" ON cron_job_logs;
CREATE POLICY "cron_job_logs_admin_read" ON cron_job_logs
  FOR SELECT USING (is_admin_optimized());

-- cron_job_settings
DROP POLICY IF EXISTS "Admins can manage cron job settings" ON cron_job_settings;
CREATE POLICY "Admins can manage cron job settings" ON cron_job_settings
  FOR ALL USING (is_admin_optimized()) WITH CHECK (is_admin_optimized());

-- cron_notification_subscribers
DROP POLICY IF EXISTS "Admins can manage cron notification subscribers" ON cron_notification_subscribers;
CREATE POLICY "Admins can manage cron notification subscribers" ON cron_notification_subscribers
  FOR ALL USING (is_admin_optimized()) WITH CHECK (is_admin_optimized());

-- cron_notifications_log
DROP POLICY IF EXISTS "Admins can view cron notification logs" ON cron_notifications_log;
CREATE POLICY "Admins can view cron notification logs" ON cron_notifications_log
  FOR SELECT USING (is_admin_optimized());

-- email_journeys
DROP POLICY IF EXISTS "email_journeys_admin_all" ON email_journeys;
CREATE POLICY "email_journeys_admin_all" ON email_journeys
  FOR ALL USING (is_admin_optimized()) WITH CHECK (is_admin_optimized());

-- email_logs
DROP POLICY IF EXISTS "email_logs_select" ON email_logs;
CREATE POLICY "email_logs_select" ON email_logs
  FOR SELECT USING (is_service_role() OR user_id = auth.uid() OR is_admin_optimized());

-- email_sends
DROP POLICY IF EXISTS "email_sends_select" ON email_sends;
CREATE POLICY "email_sends_select" ON email_sends
  FOR SELECT USING (user_id = auth.uid() OR is_admin_optimized());

-- encharge_email_templates
DROP POLICY IF EXISTS "encharge_templates_admin_all" ON encharge_email_templates;
CREATE POLICY "encharge_templates_admin_all" ON encharge_email_templates
  FOR ALL USING (is_admin_optimized()) WITH CHECK (is_admin_optimized());

-- fleet_health_snapshots
DROP POLICY IF EXISTS "admins_select_fleet_health_snapshots" ON fleet_health_snapshots;
CREATE POLICY "admins_select_fleet_health_snapshots" ON fleet_health_snapshots
  FOR SELECT USING (is_admin_optimized());

-- http_request_recordings
DROP POLICY IF EXISTS "http_request_recordings_admin_read" ON http_request_recordings;
CREATE POLICY "http_request_recordings_admin_read" ON http_request_recordings
  FOR SELECT USING (is_admin_optimized());

-- impersonation_logs
DROP POLICY IF EXISTS "Admins can view impersonation logs" ON impersonation_logs;
CREATE POLICY "Admins can view impersonation logs" ON impersonation_logs
  FOR SELECT USING (is_admin_optimized());

-- integration_alerts (two policies)
DROP POLICY IF EXISTS "Platform admins can manage integration alerts" ON integration_alerts;
CREATE POLICY "Platform admins can manage integration alerts" ON integration_alerts
  FOR ALL USING (is_admin_optimized()) WITH CHECK (is_admin_optimized());

DROP POLICY IF EXISTS "Users can read their own integration alerts" ON integration_alerts;
CREATE POLICY "Users can read their own integration alerts" ON integration_alerts
  FOR SELECT USING (user_id = auth.uid() OR is_admin_optimized());

-- integration_sync_logs
DROP POLICY IF EXISTS "integration_sync_logs_select" ON integration_sync_logs;
CREATE POLICY "integration_sync_logs_select" ON integration_sync_logs
  FOR SELECT USING (
    user_id = auth.uid()
    OR org_id IN (SELECT om.org_id FROM organization_memberships om WHERE om.user_id = auth.uid())
    OR is_admin_optimized()
  );

-- integration_test_results
DROP POLICY IF EXISTS "Platform admins can view all integration test results" ON integration_test_results;
CREATE POLICY "Platform admins can view all integration test results" ON integration_test_results
  FOR SELECT USING (is_admin_optimized());

-- launch_checklist_items
DROP POLICY IF EXISTS "Platform admins can update launch checklist" ON launch_checklist_items;
CREATE POLICY "Platform admins can update launch checklist" ON launch_checklist_items
  FOR UPDATE USING (is_admin_optimized());

DROP POLICY IF EXISTS "Platform admins can view launch checklist" ON launch_checklist_items;
CREATE POLICY "Platform admins can view launch checklist" ON launch_checklist_items
  FOR SELECT USING (is_admin_optimized());

-- meetings_waitlist
DROP POLICY IF EXISTS "meetings_waitlist_admin_manage" ON meetings_waitlist;
CREATE POLICY "meetings_waitlist_admin_manage" ON meetings_waitlist
  FOR ALL USING (is_admin_optimized()) WITH CHECK (is_admin_optimized());

-- notifications
DROP POLICY IF EXISTS "notifications_platform_admin_select" ON notifications;
CREATE POLICY "notifications_platform_admin_select" ON notifications
  FOR SELECT USING (category::text = 'support' AND is_admin_optimized());

DROP POLICY IF EXISTS "notifications_platform_admin_update" ON notifications;
CREATE POLICY "notifications_platform_admin_update" ON notifications
  FOR UPDATE USING (category::text = 'support' AND is_admin_optimized());

-- org_ai_config
DROP POLICY IF EXISTS "Platform admins can manage all org_ai_config" ON org_ai_config;
CREATE POLICY "Platform admins can manage all org_ai_config" ON org_ai_config
  FOR ALL USING (is_admin_optimized()) WITH CHECK (is_admin_optimized());

-- org_credit_balance
DROP POLICY IF EXISTS "Platform admins can manage all org_credit_balance" ON org_credit_balance;
CREATE POLICY "Platform admins can manage all org_credit_balance" ON org_credit_balance
  FOR ALL USING (is_admin_optimized()) WITH CHECK (is_admin_optimized());

-- page_views
DROP POLICY IF EXISTS "Admins can read page views" ON page_views;
CREATE POLICY "Admins can read page views" ON page_views
  FOR SELECT USING (is_admin_optimized());

-- partial_signups
DROP POLICY IF EXISTS "Admins can read partial signups" ON partial_signups;
CREATE POLICY "Admins can read partial signups" ON partial_signups
  FOR SELECT USING (is_admin_optimized());

-- personal_email_domains
DROP POLICY IF EXISTS "admin_manage_personal_email_domains" ON personal_email_domains;
CREATE POLICY "admin_manage_personal_email_domains" ON personal_email_domains
  FOR ALL USING (auth.jwt() ->> 'role' = 'authenticated' AND is_admin_optimized())
  WITH CHECK (auth.jwt() ->> 'role' = 'authenticated' AND is_admin_optimized());

-- platform_skills
DROP POLICY IF EXISTS "Only platform admins can delete platform skills" ON platform_skills;
CREATE POLICY "Only platform admins can delete platform skills" ON platform_skills
  FOR DELETE USING (is_admin_optimized());

DROP POLICY IF EXISTS "Only platform admins can update platform skills" ON platform_skills;
CREATE POLICY "Only platform admins can update platform skills" ON platform_skills
  FOR UPDATE USING (is_admin_optimized());

DROP POLICY IF EXISTS "Platform admins can read all platform skills" ON platform_skills;
CREATE POLICY "Platform admins can read all platform skills" ON platform_skills
  FOR SELECT USING (is_admin_optimized());

-- sentry tables
DROP POLICY IF EXISTS "Platform admins can manage sentry_bridge_config" ON sentry_bridge_config;
CREATE POLICY "Platform admins can manage sentry_bridge_config" ON sentry_bridge_config
  FOR ALL USING (is_admin_optimized()) WITH CHECK (is_admin_optimized());

DROP POLICY IF EXISTS "Platform admins can view sentry_bridge_metrics" ON sentry_bridge_metrics;
CREATE POLICY "Platform admins can view sentry_bridge_metrics" ON sentry_bridge_metrics
  FOR SELECT USING (is_admin_optimized());

DROP POLICY IF EXISTS "Platform admins can manage sentry_bridge_queue" ON sentry_bridge_queue;
CREATE POLICY "Platform admins can manage sentry_bridge_queue" ON sentry_bridge_queue
  FOR ALL USING (is_admin_optimized()) WITH CHECK (is_admin_optimized());

DROP POLICY IF EXISTS "Platform admins can manage sentry_dead_letter_queue" ON sentry_dead_letter_queue;
CREATE POLICY "Platform admins can manage sentry_dead_letter_queue" ON sentry_dead_letter_queue
  FOR ALL USING (is_admin_optimized()) WITH CHECK (is_admin_optimized());

DROP POLICY IF EXISTS "Platform admins can view sentry_issue_mappings" ON sentry_issue_mappings;
CREATE POLICY "Platform admins can view sentry_issue_mappings" ON sentry_issue_mappings
  FOR SELECT USING (is_admin_optimized());

DROP POLICY IF EXISTS "Platform admins can manage sentry_routing_rules" ON sentry_routing_rules;
CREATE POLICY "Platform admins can manage sentry_routing_rules" ON sentry_routing_rules
  FOR ALL USING (is_admin_optimized()) WITH CHECK (is_admin_optimized());

DROP POLICY IF EXISTS "Platform admins can manage sentry_triage_queue" ON sentry_triage_queue;
CREATE POLICY "Platform admins can manage sentry_triage_queue" ON sentry_triage_queue
  FOR ALL USING (is_admin_optimized()) WITH CHECK (is_admin_optimized());

DROP POLICY IF EXISTS "Platform admins can view sentry_webhook_events" ON sentry_webhook_events;
CREATE POLICY "Platform admins can view sentry_webhook_events" ON sentry_webhook_events
  FOR SELECT USING (is_admin_optimized());

-- skill_documents
DROP POLICY IF EXISTS "Only platform admins can delete skill documents" ON skill_documents;
CREATE POLICY "Only platform admins can delete skill documents" ON skill_documents
  FOR DELETE USING (is_admin_optimized());

DROP POLICY IF EXISTS "Only platform admins can update skill documents" ON skill_documents;
CREATE POLICY "Only platform admins can update skill documents" ON skill_documents
  FOR UPDATE USING (is_admin_optimized());

-- skill_folders
DROP POLICY IF EXISTS "Only platform admins can delete skill folders" ON skill_folders;
CREATE POLICY "Only platform admins can delete skill folders" ON skill_folders
  FOR DELETE USING (is_admin_optimized());

DROP POLICY IF EXISTS "Only platform admins can update skill folders" ON skill_folders;
CREATE POLICY "Only platform admins can update skill folders" ON skill_folders
  FOR UPDATE USING (is_admin_optimized());

-- skill_links
DROP POLICY IF EXISTS "Only platform admins can delete skill links" ON skill_links;
CREATE POLICY "Only platform admins can delete skill links" ON skill_links
  FOR DELETE USING (is_admin_optimized());

DROP POLICY IF EXISTS "Only platform admins can update skill links" ON skill_links;
CREATE POLICY "Only platform admins can update skill links" ON skill_links
  FOR UPDATE USING (is_admin_optimized());

-- support_messages
DROP POLICY IF EXISTS "support_messages_platform_admin_select" ON support_messages;
CREATE POLICY "support_messages_platform_admin_select" ON support_messages
  FOR SELECT USING (is_admin_optimized());

-- support_tickets
DROP POLICY IF EXISTS "support_tickets_platform_admin_select" ON support_tickets;
CREATE POLICY "support_tickets_platform_admin_select" ON support_tickets
  FOR SELECT USING (is_admin_optimized());

DROP POLICY IF EXISTS "support_tickets_platform_admin_update" ON support_tickets;
CREATE POLICY "support_tickets_platform_admin_update" ON support_tickets
  FOR UPDATE USING (is_admin_optimized());

-- system_logs
DROP POLICY IF EXISTS "platform_admins_select_all_system_logs" ON system_logs;
CREATE POLICY "platform_admins_select_all_system_logs" ON system_logs
  FOR SELECT USING (is_admin_optimized());

-- test_user_magic_links
DROP POLICY IF EXISTS "Platform admins can delete test links" ON test_user_magic_links;
CREATE POLICY "Platform admins can delete test links" ON test_user_magic_links
  FOR DELETE USING (is_admin_optimized());

DROP POLICY IF EXISTS "Platform admins can update test links" ON test_user_magic_links;
CREATE POLICY "Platform admins can update test links" ON test_user_magic_links
  FOR UPDATE USING (is_admin_optimized());

DROP POLICY IF EXISTS "Platform admins can view all test links" ON test_user_magic_links;
CREATE POLICY "Platform admins can view all test links" ON test_user_magic_links
  FOR SELECT USING (is_admin_optimized());

-- token_anomaly_rules
DROP POLICY IF EXISTS "Platform admins can manage anomaly rules" ON token_anomaly_rules;
CREATE POLICY "Platform admins can manage anomaly rules" ON token_anomaly_rules
  FOR ALL USING (is_admin_optimized()) WITH CHECK (is_admin_optimized());

DROP POLICY IF EXISTS "Platform admins can read anomaly rules" ON token_anomaly_rules;
CREATE POLICY "Platform admins can read anomaly rules" ON token_anomaly_rules
  FOR SELECT USING (is_admin_optimized());

-- user_activation_events
DROP POLICY IF EXISTS "activation_events_select" ON user_activation_events;
CREATE POLICY "activation_events_select" ON user_activation_events
  FOR SELECT USING (user_id = auth.uid() OR is_admin_optimized());

-- waitlist_invite_codes
DROP POLICY IF EXISTS "Admins can manage invite codes" ON waitlist_invite_codes;
CREATE POLICY "Admins can manage invite codes" ON waitlist_invite_codes
  FOR ALL USING (is_admin_optimized()) WITH CHECK (is_admin_optimized());

COMMIT;
