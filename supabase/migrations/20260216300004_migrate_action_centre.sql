-- ============================================================================
-- SCH-003: Migrate action_centre_items to unified tasks table
-- Migrate existing action centre items to the tasks table
-- NOTE: Does NOT drop action_centre_items table (90-day retention)
-- ============================================================================

-- Migration function for idempotency
DO $$
DECLARE
  v_migrated_count INTEGER;
BEGIN
  -- Insert action_centre_items into tasks
  INSERT INTO tasks (
    id,
    title,
    description,
    status,
    priority,
    task_type,
    assigned_to,
    created_by,
    owner_id,
    deal_id,
    company_id,
    contact_id,
    created_at,
    updated_at,
    -- AI/source columns
    source,
    ai_status,
    risk_level,
    deliverable_type,
    deliverable_data,
    reasoning,
    expires_at,
    actioned_at,
    auto_group,
    -- Metadata
    metadata
  )
  SELECT
    aci.id,
    aci.title,
    aci.description,
    -- Map action_centre status to task status
    CASE aci.status
      WHEN 'pending' THEN 'pending_review'
      WHEN 'approved' THEN 'approved'
      WHEN 'dismissed' THEN 'dismissed'
      WHEN 'done' THEN 'completed'
      WHEN 'expired' THEN 'expired'
      ELSE 'pending_review'
    END,
    -- Map risk_level to priority (high risk = high priority)
    CASE aci.risk_level
      WHEN 'high' THEN 'urgent'
      WHEN 'medium' THEN 'high'
      WHEN 'low' THEN 'medium'
      WHEN 'info' THEN 'low'
      ELSE 'medium'
    END,
    -- Map action_type to task_type
    CASE aci.action_type
      WHEN 'email' THEN 'email'
      WHEN 'task' THEN 'general'
      WHEN 'slack_message' THEN 'slack_message'
      WHEN 'field_update' THEN 'crm_update'
      WHEN 'alert' THEN 'alert'
      WHEN 'insight' THEN 'insight'
      WHEN 'meeting_prep' THEN 'meeting_prep'
      ELSE 'general'
    END,
    aci.user_id, -- assigned_to
    aci.user_id, -- created_by
    aci.user_id, -- owner_id
    aci.deal_id,
    -- Try to get company_id from deal if not present
    COALESCE(
      (SELECT d.company_id FROM deals d WHERE d.id = aci.deal_id),
      (SELECT c.company_id FROM contacts c WHERE c.id = aci.contact_id)
    ),
    aci.contact_id,
    aci.created_at,
    aci.updated_at,
    -- Map source_type to source
    CASE aci.source_type
      WHEN 'proactive_pipeline' THEN 'ai_proactive'
      WHEN 'proactive_meeting' THEN 'ai_proactive'
      WHEN 'copilot_conversation' THEN 'copilot'
      WHEN 'sequence' THEN 'copilot'
      ELSE 'ai_proactive'
    END,
    -- Set ai_status based on current status
    CASE aci.status
      WHEN 'pending' THEN 'draft_ready'
      WHEN 'approved' THEN 'approved'
      WHEN 'dismissed' THEN 'none'
      WHEN 'done' THEN 'executed'
      WHEN 'expired' THEN 'expired'
      ELSE 'draft_ready'
    END,
    aci.risk_level,
    -- Map action_type to deliverable_type
    CASE aci.action_type
      WHEN 'email' THEN 'email_draft'
      WHEN 'meeting_prep' THEN 'meeting_prep'
      WHEN 'field_update' THEN 'crm_update'
      WHEN 'insight' THEN 'insight'
      ELSE NULL
    END,
    aci.preview_data, -- deliverable_data
    NULL, -- reasoning (not present in action_centre_items)
    aci.expires_at,
    aci.actioned_at,
    -- Try to set auto_group from company name
    (SELECT c.name FROM companies c
     WHERE c.id = COALESCE(
       (SELECT d.company_id FROM deals d WHERE d.id = aci.deal_id),
       (SELECT ct.company_id FROM contacts ct WHERE ct.id = aci.contact_id)
     ) LIMIT 1),
    -- Store original action_centre metadata
    jsonb_build_object(
      'migrated_from', 'action_centre_items',
      'original_source_type', aci.source_type,
      'original_source_id', aci.source_id,
      'slack_message_ts', aci.slack_message_ts,
      'slack_channel_id', aci.slack_channel_id
    )
  FROM action_centre_items aci
  WHERE NOT EXISTS (
    -- Prevent duplicate migrations
    SELECT 1 FROM tasks t
    WHERE t.id = aci.id
  );

  GET DIAGNOSTICS v_migrated_count = ROW_COUNT;
  RAISE NOTICE 'Migrated % action_centre_items to tasks table', v_migrated_count;
END $$;

-- Add comment to action_centre_items table about retention
COMMENT ON TABLE action_centre_items IS
  'DEPRECATED: Migrated to unified tasks table. Retained for 90-day audit trail. Do not use for new features.';

-- Create view for backwards compatibility (optional, for gradual migration)
CREATE OR REPLACE VIEW action_centre_items_view AS
SELECT
  id,
  CASE
    WHEN assigned_to IS NOT NULL THEN assigned_to
    ELSE created_by
  END as user_id,
  clerk_org_id as organization_id,
  task_type as action_type,
  risk_level,
  title,
  description,
  deliverable_data as preview_data,
  contact_id,
  deal_id,
  NULL::uuid as meeting_id, -- Not in original schema
  CASE status
    WHEN 'pending_review' THEN 'pending'
    WHEN 'approved' THEN 'approved'
    WHEN 'dismissed' THEN 'dismissed'
    WHEN 'completed' THEN 'done'
    WHEN 'expired' THEN 'expired'
    ELSE 'pending'
  END as status,
  source as source_type,
  (metadata->>'original_source_id')::text as source_id,
  (metadata->>'slack_message_ts')::text as slack_message_ts,
  (metadata->>'slack_channel_id')::text as slack_channel_id,
  created_at,
  updated_at,
  actioned_at,
  expires_at
FROM tasks
WHERE source IN ('ai_proactive', 'copilot')
  AND (metadata->>'migrated_from')::text = 'action_centre_items';

COMMENT ON VIEW action_centre_items_view IS
  'Backwards-compatible view of migrated action_centre_items. For read-only access during transition period.';
