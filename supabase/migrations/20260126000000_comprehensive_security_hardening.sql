-- =====================================================================
-- COMPREHENSIVE SECURITY HARDENING MIGRATION
-- Addresses Clawdbot-style vulnerabilities for MCP and AI Copilot
-- =====================================================================
--
-- Based on lessons from Clawdbot security analysis:
-- 1. Defense in Depth - Multiple security layers
-- 2. Conversation Privacy - Treat AI conversations as intelligence
-- 3. Dynamic RLS - Org-configurable data sharing
-- 4. Least Privilege - Minimize service role usage
-- 5. Audit Trail - Track all privileged operations
--
-- Date: 2026-01-26
-- Author: Security Hardening based on Clawdbot analysis
-- =====================================================================

-- =====================================================================
-- PART 1: ORG-LEVEL DATA SHARING SETTINGS
-- =====================================================================

-- Create org_settings table for data sharing preferences
CREATE TABLE IF NOT EXISTS public.org_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL UNIQUE REFERENCES public.organizations(id) ON DELETE CASCADE,

  -- Data sharing preferences (admin-configurable)
  enable_crm_sharing boolean NOT NULL DEFAULT true, -- Share contacts/deals/companies within org
  enable_meeting_sharing boolean NOT NULL DEFAULT true, -- Share meetings within org
  enable_task_sharing boolean NOT NULL DEFAULT false, -- Share tasks within org (default: private)
  enable_activity_sharing boolean NOT NULL DEFAULT true, -- Share activities within org
  enable_email_sharing boolean NOT NULL DEFAULT false, -- Share emails within org (default: private)

  -- Copilot conversations are ALWAYS private (not configurable)
  -- This setting exists only for clarity/documentation
  enable_copilot_sharing boolean NOT NULL DEFAULT false, -- ALWAYS false, non-modifiable

  -- Security audit settings
  enable_access_logging boolean NOT NULL DEFAULT true, -- Log data access attempts
  enable_export_restrictions boolean NOT NULL DEFAULT true, -- Restrict bulk exports

  -- Timestamps
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT enforce_copilot_privacy CHECK (enable_copilot_sharing = false)
);

-- Enable RLS on org_settings
ALTER TABLE public.org_settings ENABLE ROW LEVEL SECURITY;

-- Org members can view their org's settings
CREATE POLICY "org_settings_select" ON public.org_settings
  FOR SELECT
  USING (
    org_id IN (
      SELECT org_id FROM public.organization_memberships
      WHERE user_id = auth.uid()
    )
  );

-- Only org admins can update settings
CREATE POLICY "org_settings_update" ON public.org_settings
  FOR UPDATE
  USING (
    org_id IN (
      SELECT om.org_id FROM public.organization_memberships om
      WHERE om.user_id = auth.uid() AND om.role = 'admin'
    )
  )
  WITH CHECK (
    -- Enforce copilot_sharing ALWAYS remains false
    enable_copilot_sharing = false
  );

-- Create default settings for existing orgs
INSERT INTO public.org_settings (org_id, enable_crm_sharing, enable_meeting_sharing, enable_task_sharing, enable_activity_sharing, enable_email_sharing)
SELECT
  id,
  true, -- CRM sharing enabled by default
  true, -- Meeting sharing enabled by default
  false, -- Task sharing disabled by default (personal)
  true, -- Activity sharing enabled by default
  false -- Email sharing disabled by default (private)
FROM public.organizations
WHERE NOT EXISTS (
  SELECT 1 FROM public.org_settings WHERE org_settings.org_id = organizations.id
);

-- =====================================================================
-- PART 2: HELPER FUNCTIONS FOR DYNAMIC RLS
-- =====================================================================

-- Get user's org ID (cached function)
CREATE OR REPLACE FUNCTION public.get_user_org_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT org_id
  FROM public.organization_memberships
  WHERE user_id = auth.uid()
  LIMIT 1;
$$;

-- Check if user is org admin
CREATE OR REPLACE FUNCTION public.is_org_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.organization_memberships
    WHERE user_id = auth.uid()
      AND role = 'admin'
  );
$$;

-- Check if CRM sharing is enabled for user's org
CREATE OR REPLACE FUNCTION public.is_crm_sharing_enabled()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT COALESCE(
    (
      SELECT s.enable_crm_sharing
      FROM public.org_settings s
      JOIN public.organization_memberships om ON om.org_id = s.org_id
      WHERE om.user_id = auth.uid()
      LIMIT 1
    ),
    true -- Default to true if no setting exists
  );
$$;

-- Check if meeting sharing is enabled for user's org
CREATE OR REPLACE FUNCTION public.is_meeting_sharing_enabled()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT COALESCE(
    (
      SELECT s.enable_meeting_sharing
      FROM public.org_settings s
      JOIN public.organization_memberships om ON om.org_id = s.org_id
      WHERE om.user_id = auth.uid()
      LIMIT 1
    ),
    true -- Default to true if no setting exists
  );
$$;

-- Check if task sharing is enabled for user's org
CREATE OR REPLACE FUNCTION public.is_task_sharing_enabled()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT COALESCE(
    (
      SELECT s.enable_task_sharing
      FROM public.org_settings s
      JOIN public.organization_memberships om ON om.org_id = s.org_id
      WHERE om.user_id = auth.uid()
      LIMIT 1
    ),
    false -- Default to false (private) if no setting exists
  );
$$;

-- Check if email sharing is enabled for user's org
CREATE OR REPLACE FUNCTION public.is_email_sharing_enabled()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT COALESCE(
    (
      SELECT s.enable_email_sharing
      FROM public.org_settings s
      JOIN public.organization_memberships om ON om.org_id = s.org_id
      WHERE om.user_id = auth.uid()
      LIMIT 1
    ),
    false -- Default to false (private) if no setting exists
  );
$$;

-- =====================================================================
-- PART 3: DROP DUPLICATE/OLD POLICIES
-- =====================================================================

-- Drop old copilot_conversations policies (we have duplicates)
DROP POLICY IF EXISTS "Users can create own conversations" ON public.copilot_conversations;
DROP POLICY IF EXISTS "Users can delete own conversations" ON public.copilot_conversations;
DROP POLICY IF EXISTS "Users can update own conversations" ON public.copilot_conversations;
DROP POLICY IF EXISTS "Users can view own conversations" ON public.copilot_conversations;

-- Drop old contacts policies (will be replaced with dynamic ones)
DROP POLICY IF EXISTS "contacts_insert" ON public.contacts;
DROP POLICY IF EXISTS "contacts_select" ON public.contacts;
DROP POLICY IF EXISTS "contacts_update" ON public.contacts;
DROP POLICY IF EXISTS "contacts_delete" ON public.contacts;

-- Drop old deals policies (will be replaced with dynamic ones)
DROP POLICY IF EXISTS "deals_insert" ON public.deals;
DROP POLICY IF EXISTS "deals_select" ON public.deals;
DROP POLICY IF EXISTS "deals_update" ON public.deals;
DROP POLICY IF EXISTS "deals_delete" ON public.deals;

-- Drop old meetings policies (will be replaced with dynamic ones)
DROP POLICY IF EXISTS "meetings_insert" ON public.meetings;
DROP POLICY IF EXISTS "meetings_select" ON public.meetings;
DROP POLICY IF EXISTS "meetings_update" ON public.meetings;
DROP POLICY IF EXISTS "meetings_delete" ON public.meetings;

-- =====================================================================
-- PART 4: COPILOT CONVERSATIONS - STRICT ISOLATION (NO ORG SHARING)
-- =====================================================================

-- Copilot conversations are ALWAYS user-private, regardless of org settings
-- This prevents "perception attacks" where attackers manipulate AI context

CREATE POLICY "copilot_conversations_select_v2" ON public.copilot_conversations
  FOR SELECT
  USING (
    user_id = auth.uid() -- User can only see their own conversations
    -- Service role explicitly NOT included here - use user-scoped client!
  );

CREATE POLICY "copilot_conversations_insert_v2" ON public.copilot_conversations
  FOR INSERT
  WITH CHECK (
    user_id = auth.uid() -- User can only create their own conversations
  );

CREATE POLICY "copilot_conversations_update_v2" ON public.copilot_conversations
  FOR UPDATE
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "copilot_conversations_delete_v2" ON public.copilot_conversations
  FOR DELETE
  USING (
    user_id = auth.uid() -- User can only delete their own conversations
  );

COMMENT ON POLICY "copilot_conversations_select_v2" ON public.copilot_conversations IS
  'SECURITY: Copilot conversations contain strategic intelligence and MUST remain strictly user-private. No org sharing, no admin access. Service role NOT allowed - use user-scoped client.';

-- =====================================================================
-- PART 5: CONTACTS - DYNAMIC RLS BASED ON ORG SETTINGS
-- =====================================================================

CREATE POLICY "contacts_select_v2" ON public.contacts
  FOR SELECT
  USING (
    -- Own records
    owner_id = auth.uid()
    OR
    -- Org admin can see all
    is_org_admin()
    OR
    -- Org members can see if sharing enabled
    (
      is_crm_sharing_enabled()
      AND EXISTS (
        SELECT 1 FROM public.organization_memberships om1
        WHERE om1.user_id = auth.uid()
          AND EXISTS (
            SELECT 1 FROM public.organization_memberships om2
            WHERE om2.user_id = contacts.owner_id
              AND om2.org_id = om1.org_id
          )
      )
    )
  );

CREATE POLICY "contacts_insert_v2" ON public.contacts
  FOR INSERT
  WITH CHECK (
    -- Must be authenticated
    auth.uid() IS NOT NULL
    -- Owner must be self (prevent impersonation)
    AND (owner_id = auth.uid() OR owner_id IS NULL)
  );

CREATE POLICY "contacts_update_v2" ON public.contacts
  FOR UPDATE
  USING (
    owner_id = auth.uid()
    OR is_org_admin()
  );

CREATE POLICY "contacts_delete_v2" ON public.contacts
  FOR DELETE
  USING (
    owner_id = auth.uid()
    OR is_org_admin()
  );

-- =====================================================================
-- PART 6: DEALS - DYNAMIC RLS BASED ON ORG SETTINGS
-- =====================================================================

CREATE POLICY "deals_select_v2" ON public.deals
  FOR SELECT
  USING (
    -- Own records
    owner_id = auth.uid()
    OR
    -- Org admin can see all
    is_org_admin()
    OR
    -- Org members can see if sharing enabled
    (
      is_crm_sharing_enabled()
      AND EXISTS (
        SELECT 1 FROM public.organization_memberships om1
        WHERE om1.user_id = auth.uid()
          AND EXISTS (
            SELECT 1 FROM public.organization_memberships om2
            WHERE om2.user_id = deals.owner_id
              AND om2.org_id = om1.org_id
          )
      )
    )
  );

CREATE POLICY "deals_insert_v2" ON public.deals
  FOR INSERT
  WITH CHECK (
    -- Must be authenticated
    auth.uid() IS NOT NULL
    -- Owner must be self
    AND owner_id = auth.uid()
  );

CREATE POLICY "deals_update_v2" ON public.deals
  FOR UPDATE
  USING (
    owner_id = auth.uid()
    OR is_org_admin()
  );

CREATE POLICY "deals_delete_v2" ON public.deals
  FOR DELETE
  USING (
    owner_id = auth.uid()
    OR is_org_admin()
  );

-- =====================================================================
-- PART 7: MEETINGS - DYNAMIC RLS BASED ON ORG SETTINGS
-- =====================================================================

CREATE POLICY "meetings_select_v2" ON public.meetings
  FOR SELECT
  USING (
    -- Own records
    owner_user_id = auth.uid()
    OR
    -- Org admin can see all
    is_org_admin()
    OR
    -- Org members can see if sharing enabled AND same org
    (
      is_meeting_sharing_enabled()
      AND org_id IN (
        SELECT org_id FROM public.organization_memberships
        WHERE user_id = auth.uid()
      )
    )
  );

CREATE POLICY "meetings_insert_v2" ON public.meetings
  FOR INSERT
  WITH CHECK (
    -- Must be authenticated
    auth.uid() IS NOT NULL
    -- Owner must be self (if specified)
    AND (owner_user_id = auth.uid() OR owner_user_id IS NULL)
    -- Org must be user's org (if specified)
    AND (
      org_id IS NULL
      OR org_id IN (
        SELECT org_id FROM public.organization_memberships
        WHERE user_id = auth.uid()
      )
    )
  );

CREATE POLICY "meetings_update_v2" ON public.meetings
  FOR UPDATE
  USING (
    owner_user_id = auth.uid()
    OR is_org_admin()
  );

CREATE POLICY "meetings_delete_v2" ON public.meetings
  FOR DELETE
  USING (
    owner_user_id = auth.uid()
    OR is_org_admin()
  );

-- =====================================================================
-- PART 8: TASKS - DYNAMIC RLS (DEFAULT: PRIVATE)
-- =====================================================================

-- Note: Tasks default to private unless org explicitly enables sharing

CREATE POLICY "tasks_select_v2" ON public.tasks
  FOR SELECT
  USING (
    -- Own records (check owner_id, created_by, or assigned_to)
    (owner_id = auth.uid() OR created_by = auth.uid() OR assigned_to = auth.uid())
    OR
    -- Org admin can see all
    is_org_admin()
    OR
    -- Org members can see ONLY if sharing explicitly enabled
    (
      is_task_sharing_enabled()
      AND EXISTS (
        SELECT 1 FROM public.organization_memberships om1
        WHERE om1.user_id = auth.uid()
          AND EXISTS (
            SELECT 1 FROM public.organization_memberships om2
            WHERE om2.user_id = COALESCE(tasks.owner_id, tasks.created_by, tasks.assigned_to)
              AND om2.org_id = om1.org_id
          )
      )
    )
  );

CREATE POLICY "tasks_insert_v2" ON public.tasks
  FOR INSERT
  WITH CHECK (
    auth.uid() IS NOT NULL
    AND (created_by = auth.uid() OR assigned_to = auth.uid())
  );

CREATE POLICY "tasks_update_v2" ON public.tasks
  FOR UPDATE
  USING (
    (owner_id = auth.uid() OR created_by = auth.uid() OR assigned_to = auth.uid())
    OR is_org_admin()
  );

CREATE POLICY "tasks_delete_v2" ON public.tasks
  FOR DELETE
  USING (
    (owner_id = auth.uid() OR created_by = auth.uid() OR assigned_to = auth.uid())
    OR is_org_admin()
  );

-- =====================================================================
-- PART 9: EMAILS - DYNAMIC RLS (DEFAULT: PRIVATE)
-- =====================================================================

-- Note: Emails default to private unless org explicitly enables sharing

CREATE POLICY "emails_select_v2" ON public.emails
  FOR SELECT
  USING (
    -- Own records
    user_id = auth.uid()
    OR
    -- Org admin can see all
    is_org_admin()
    OR
    -- Org members can see ONLY if sharing explicitly enabled
    (
      is_email_sharing_enabled()
      AND EXISTS (
        SELECT 1 FROM public.organization_memberships om1
        WHERE om1.user_id = auth.uid()
          AND EXISTS (
            SELECT 1 FROM public.organization_memberships om2
            WHERE om2.user_id = emails.user_id
              AND om2.org_id = om1.org_id
          )
      )
    )
  );

CREATE POLICY "emails_insert_v2" ON public.emails
  FOR INSERT
  WITH CHECK (
    auth.uid() IS NOT NULL
    AND user_id = auth.uid()
  );

CREATE POLICY "emails_update_v2" ON public.emails
  FOR UPDATE
  USING (
    user_id = auth.uid()
    OR is_org_admin()
  );

CREATE POLICY "emails_delete_v2" ON public.emails
  FOR DELETE
  USING (
    user_id = auth.uid()
    OR is_org_admin()
  );

-- =====================================================================
-- PART 10: ACTIVITIES - DYNAMIC RLS
-- =====================================================================

CREATE POLICY "activities_select_v2" ON public.activities
  FOR SELECT
  USING (
    -- Own records
    user_id = auth.uid()
    OR
    -- Org admin can see all
    is_org_admin()
    OR
    -- Org members in same org (activities are team-visible by default)
    EXISTS (
      SELECT 1 FROM public.organization_memberships om1
      WHERE om1.user_id = auth.uid()
        AND EXISTS (
          SELECT 1 FROM public.organization_memberships om2
          WHERE om2.user_id = activities.user_id
            AND om2.org_id = om1.org_id
        )
    )
  );

CREATE POLICY "activities_insert_v2" ON public.activities
  FOR INSERT
  WITH CHECK (
    auth.uid() IS NOT NULL
    AND user_id = auth.uid()
  );

CREATE POLICY "activities_update_v2" ON public.activities
  FOR UPDATE
  USING (
    user_id = auth.uid()
    OR is_org_admin()
  );

CREATE POLICY "activities_delete_v2" ON public.activities
  FOR DELETE
  USING (
    user_id = auth.uid()
    OR is_org_admin()
  );

-- =====================================================================
-- PART 11: CALENDAR EVENTS - DYNAMIC RLS
-- =====================================================================

CREATE POLICY "calendar_events_select_v2" ON public.calendar_events
  FOR SELECT
  USING (
    -- Own records
    user_id = auth.uid()
    OR
    -- Org admin can see all
    is_org_admin()
    OR
    -- Org members in same org (calendar events are team-visible)
    (
      org_id IN (
        SELECT org_id FROM public.organization_memberships
        WHERE user_id = auth.uid()
      )
    )
  );

CREATE POLICY "calendar_events_insert_v2" ON public.calendar_events
  FOR INSERT
  WITH CHECK (
    auth.uid() IS NOT NULL
    AND (user_id = auth.uid() OR user_id IS NULL)
    AND (
      org_id IS NULL
      OR org_id IN (
        SELECT org_id FROM public.organization_memberships
        WHERE user_id = auth.uid()
      )
    )
  );

CREATE POLICY "calendar_events_update_v2" ON public.calendar_events
  FOR UPDATE
  USING (
    user_id = auth.uid()
    OR is_org_admin()
  );

CREATE POLICY "calendar_events_delete_v2" ON public.calendar_events
  FOR DELETE
  USING (
    user_id = auth.uid()
    OR is_org_admin()
  );

-- =====================================================================
-- PART 12: LEADS - ORG-LEVEL (SHARED BY DEFAULT)
-- =====================================================================

-- Leads are org-level by design (SavvyCal bookings, team collaboration)

CREATE POLICY "leads_select_v2" ON public.leads
  FOR SELECT
  USING (
    -- Own leads
    owner_id = auth.uid()
    OR
    -- Org admin can see all
    is_org_admin()
    OR
    -- Org members in same org (leads are team-visible by default)
    EXISTS (
      SELECT 1 FROM public.organization_memberships om1
      WHERE om1.user_id = auth.uid()
        AND EXISTS (
          SELECT 1 FROM public.organization_memberships om2
          WHERE om2.user_id = leads.owner_id
            AND om2.org_id = om1.org_id
        )
    )
  );

CREATE POLICY "leads_insert_v2" ON public.leads
  FOR INSERT
  WITH CHECK (
    auth.uid() IS NOT NULL
    AND (owner_id = auth.uid() OR created_by = auth.uid())
  );

CREATE POLICY "leads_update_v2" ON public.leads
  FOR UPDATE
  USING (
    owner_id = auth.uid()
    OR is_org_admin()
  );

CREATE POLICY "leads_delete_v2" ON public.leads
  FOR DELETE
  USING (
    owner_id = auth.uid()
    OR is_org_admin()
  );

-- =====================================================================
-- PART 13: SECURITY AUDIT TABLE
-- =====================================================================

-- Track sensitive operations for security monitoring
CREATE TABLE IF NOT EXISTS public.security_audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Who
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  org_id uuid REFERENCES public.organizations(id) ON DELETE SET NULL,

  -- What
  operation text NOT NULL, -- 'copilot_access', 'service_role_usage', 'bulk_export', 'admin_override'
  table_name text,
  record_id uuid,

  -- When
  occurred_at timestamptz NOT NULL DEFAULT now(),

  -- Context
  ip_address inet,
  user_agent text,
  request_path text,

  -- Details
  metadata jsonb,

  -- Classification
  severity text NOT NULL DEFAULT 'info', -- 'info', 'warning', 'critical'

  CONSTRAINT security_audit_severity_check CHECK (severity IN ('info', 'warning', 'critical'))
);

-- Enable RLS on audit log
ALTER TABLE public.security_audit_log ENABLE ROW LEVEL SECURITY;

-- Only org admins can view audit logs
CREATE POLICY "security_audit_log_select" ON public.security_audit_log
  FOR SELECT
  USING (
    org_id IN (
      SELECT om.org_id FROM public.organization_memberships om
      WHERE om.user_id = auth.uid() AND om.role = 'admin'
    )
  );

-- Create index for fast audit queries
CREATE INDEX IF NOT EXISTS idx_security_audit_log_org_severity
  ON public.security_audit_log(org_id, severity, occurred_at DESC);

CREATE INDEX IF NOT EXISTS idx_security_audit_log_user_operation
  ON public.security_audit_log(user_id, operation, occurred_at DESC);

-- =====================================================================
-- PART 14: AUDIT LOGGING FUNCTION
-- =====================================================================

CREATE OR REPLACE FUNCTION public.log_security_event(
  p_operation text,
  p_table_name text DEFAULT NULL,
  p_record_id uuid DEFAULT NULL,
  p_metadata jsonb DEFAULT NULL,
  p_severity text DEFAULT 'info'
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  INSERT INTO public.security_audit_log (
    user_id,
    org_id,
    operation,
    table_name,
    record_id,
    metadata,
    severity
  )
  VALUES (
    auth.uid(),
    (SELECT org_id FROM public.organization_memberships WHERE user_id = auth.uid() LIMIT 1),
    p_operation,
    p_table_name,
    p_record_id,
    p_metadata,
    p_severity
  );
END;
$$;

-- =====================================================================
-- PART 15: SECURITY MONITORING FUNCTIONS
-- =====================================================================

-- Detect missing RLS policies
CREATE OR REPLACE FUNCTION public.check_missing_rls_policies()
RETURNS TABLE(
  table_name text,
  has_rls_enabled boolean,
  policy_count bigint,
  severity text,
  recommendation text
)
LANGUAGE sql
SECURITY DEFINER
AS $$
  SELECT
    schemaname || '.' || tablename as table_name,
    rowsecurity as has_rls_enabled,
    (
      SELECT COUNT(*)
      FROM pg_policies
      WHERE schemaname = t.schemaname
        AND tablename = t.tablename
    ) as policy_count,
    CASE
      WHEN NOT rowsecurity THEN 'critical'
      WHEN rowsecurity AND (SELECT COUNT(*) FROM pg_policies WHERE schemaname = t.schemaname AND tablename = t.tablename) = 0 THEN 'critical'
      ELSE 'ok'
    END as severity,
    CASE
      WHEN NOT rowsecurity THEN 'Enable RLS: ALTER TABLE ' || schemaname || '.' || tablename || ' ENABLE ROW LEVEL SECURITY;'
      WHEN rowsecurity AND (SELECT COUNT(*) FROM pg_policies WHERE schemaname = t.schemaname AND tablename = t.tablename) = 0 THEN 'Add policies for ' || schemaname || '.' || tablename
      ELSE 'RLS configured correctly'
    END as recommendation
  FROM pg_tables t
  WHERE schemaname = 'public'
    AND tablename IN (
      'contacts', 'deals', 'meetings', 'tasks', 'activities',
      'calendar_events', 'emails', 'copilot_conversations', 'leads',
      'org_settings', 'security_audit_log'
    )
  ORDER BY severity DESC, table_name;
$$;

-- Detect suspicious access patterns
CREATE OR REPLACE FUNCTION public.check_suspicious_access()
RETURNS TABLE(
  user_id uuid,
  user_email text,
  org_id uuid,
  suspicious_operations bigint,
  last_suspicious_at timestamptz,
  severity text
)
LANGUAGE sql
SECURITY DEFINER
AS $$
  SELECT
    sal.user_id,
    u.email as user_email,
    sal.org_id,
    COUNT(*) as suspicious_operations,
    MAX(sal.occurred_at) as last_suspicious_at,
    CASE
      WHEN COUNT(*) > 100 THEN 'critical'
      WHEN COUNT(*) > 50 THEN 'warning'
      ELSE 'info'
    END as severity
  FROM public.security_audit_log sal
  LEFT JOIN auth.users u ON u.id = sal.user_id
  WHERE sal.occurred_at >= now() - interval '24 hours'
    AND sal.operation IN ('service_role_usage', 'admin_override', 'bulk_export')
  GROUP BY sal.user_id, u.email, sal.org_id
  HAVING COUNT(*) > 10
  ORDER BY COUNT(*) DESC;
$$;

-- =====================================================================
-- PART 16: COMMENTS AND DOCUMENTATION
-- =====================================================================

COMMENT ON TABLE public.org_settings IS
  'Organization-level security and data sharing settings. Controls whether CRM data, meetings, tasks, and emails are shared within the organization or remain user-private. Copilot conversations are ALWAYS private.';

COMMENT ON COLUMN public.org_settings.enable_copilot_sharing IS
  'ALWAYS false. Copilot conversations contain strategic intelligence and must remain strictly user-private. This setting is enforced by a CHECK constraint and cannot be modified.';

COMMENT ON TABLE public.security_audit_log IS
  'Security audit log tracking sensitive operations like copilot access, service role usage, bulk exports, and admin overrides. Used for threat detection and compliance monitoring.';

COMMENT ON FUNCTION public.check_missing_rls_policies() IS
  'Security monitoring function that detects tables with missing or misconfigured RLS policies. Should be run regularly to ensure all sensitive tables have proper access controls.';

COMMENT ON FUNCTION public.check_suspicious_access() IS
  'Security monitoring function that detects suspicious access patterns such as excessive service role usage, admin overrides, or bulk data exports. Used for threat detection.';

-- =====================================================================
-- END OF MIGRATION
-- =====================================================================

-- Verify all core tables have RLS enabled
DO $$
DECLARE
  missing_rls text[];
BEGIN
  SELECT array_agg(tablename)
  INTO missing_rls
  FROM pg_tables t
  WHERE schemaname = 'public'
    AND tablename IN (
      'contacts', 'deals', 'meetings', 'tasks', 'activities',
      'calendar_events', 'emails', 'copilot_conversations', 'leads',
      'org_settings', 'security_audit_log'
    )
    AND NOT EXISTS (
      SELECT 1 FROM pg_catalog.pg_class c
      WHERE c.relname = t.tablename
        AND c.relnamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public')
        AND c.relrowsecurity = true
    );

  IF array_length(missing_rls, 1) > 0 THEN
    RAISE WARNING 'Tables missing RLS: %', missing_rls;
  ELSE
    RAISE NOTICE 'All core tables have RLS enabled ✅';
  END IF;
END;
$$;
