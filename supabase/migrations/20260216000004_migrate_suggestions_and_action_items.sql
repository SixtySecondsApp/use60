-- ============================================================================
-- SCH-004: Migrate next_action_suggestions and meeting_action_items to tasks
-- Migrate AI suggestions and meeting action items to unified tasks table
-- NOTE: Does NOT drop original tables (90-day retention)
-- ============================================================================

-- ============================================================================
-- PART 1: Migrate next_action_suggestions
-- ============================================================================

DO $$
DECLARE
  v_migrated_count INTEGER;
BEGIN
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
    due_date,
    -- AI/source columns
    source,
    ai_status,
    confidence_score,
    reasoning,
    -- Metadata
    metadata
  )
  SELECT
    nas.id,
    nas.title,
    NULL, -- description not in next_action_suggestions
    -- Map status
    CASE nas.status
      WHEN 'pending' THEN 'pending_review'
      WHEN 'accepted' THEN 'approved'
      WHEN 'dismissed' THEN 'dismissed'
      WHEN 'completed' THEN 'completed'
      ELSE 'pending_review'
    END,
    -- Map urgency to priority
    CASE nas.urgency
      WHEN 'high' THEN 'urgent'
      WHEN 'medium' THEN 'high'
      WHEN 'low' THEN 'medium'
      ELSE 'medium'
    END,
    -- Map action_type to task_type
    CASE
      WHEN nas.action_type LIKE '%email%' THEN 'email'
      WHEN nas.action_type LIKE '%call%' THEN 'call'
      WHEN nas.action_type LIKE '%demo%' THEN 'demo'
      WHEN nas.action_type LIKE '%proposal%' THEN 'proposal'
      WHEN nas.action_type LIKE '%meeting%' THEN 'meeting'
      WHEN nas.action_type LIKE '%follow%' THEN 'follow_up'
      ELSE 'general'
    END,
    nas.user_id, -- assigned_to
    nas.user_id, -- created_by
    nas.user_id, -- owner_id
    nas.deal_id,
    nas.company_id,
    nas.contact_id,
    nas.created_at,
    nas.created_at, -- updated_at (use created_at as fallback)
    nas.recommended_deadline,
    -- Source fields
    'meeting_ai', -- source
    CASE nas.status
      WHEN 'pending' THEN 'draft_ready'
      WHEN 'accepted' THEN 'approved'
      WHEN 'dismissed' THEN 'none'
      WHEN 'completed' THEN 'executed'
      ELSE 'draft_ready'
    END, -- ai_status
    nas.confidence_score,
    nas.reasoning,
    -- Metadata
    jsonb_build_object(
      'migrated_from', 'next_action_suggestions',
      'activity_id', nas.activity_id,
      'activity_type', nas.activity_type,
      'original_action_type', nas.action_type,
      'timestamp_seconds', nas.timestamp_seconds,
      'ai_model', nas.ai_model,
      'context_quality', nas.context_quality,
      'importance', nas.importance,
      'created_task_id', nas.created_task_id,
      'user_feedback', nas.user_feedback,
      'dismissed_at', nas.dismissed_at,
      'accepted_at', nas.accepted_at,
      'completed_at', nas.completed_at
    )
  FROM next_action_suggestions nas
  WHERE NOT EXISTS (
    -- Prevent duplicate migrations
    SELECT 1 FROM tasks t
    WHERE t.id = nas.id
  );

  GET DIAGNOSTICS v_migrated_count = ROW_COUNT;
  RAISE NOTICE 'Migrated % next_action_suggestions to tasks table', v_migrated_count;
END $$;

-- ============================================================================
-- PART 2: Migrate meeting_action_items
-- ============================================================================

DO $$
DECLARE
  v_migrated_count INTEGER;
  v_owner_id UUID;
BEGIN
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
    meeting_id,
    company_id,
    contact_id,
    created_at,
    updated_at,
    completed,
    due_date,
    -- AI/source columns
    source,
    ai_status,
    confidence_score,
    reasoning,
    -- Metadata
    metadata
  )
  SELECT
    mai.id,
    mai.title,
    NULL, -- description
    -- Map sync_status and completed to status
    CASE
      WHEN mai.completed THEN 'completed'
      WHEN mai.sync_status = 'synced' THEN 'in_progress'
      WHEN mai.sync_status = 'excluded' THEN 'dismissed'
      ELSE 'pending_review'
    END,
    -- Map importance/priority
    CASE
      WHEN mai.importance = 'high' OR mai.priority = 'high' THEN 'urgent'
      WHEN mai.importance = 'medium' OR mai.priority = 'medium' THEN 'high'
      ELSE 'medium'
    END,
    -- Map category or ai_task_type to task_type
    COALESCE(mai.ai_task_type, mai.category, 'general'),
    -- Get user_id from meeting owner
    (SELECT m.owner_user_id FROM meetings m WHERE m.id = mai.meeting_id), -- assigned_to
    (SELECT m.owner_user_id FROM meetings m WHERE m.id = mai.meeting_id), -- created_by
    (SELECT m.owner_user_id FROM meetings m WHERE m.id = mai.meeting_id), -- owner_id
    mai.meeting_id,
    -- Get company_id from meeting
    (SELECT m.company_id FROM meetings m WHERE m.id = mai.meeting_id),
    -- Get contact_id from meeting
    (SELECT m.primary_contact_id FROM meetings m WHERE m.id = mai.meeting_id),
    mai.created_at,
    mai.updated_at,
    mai.completed,
    COALESCE(mai.deadline_at, mai.ai_deadline::timestamptz), -- due_date
    -- Source fields
    'meeting_transcript', -- source
    CASE
      WHEN mai.completed THEN 'executed'
      WHEN mai.ai_generated THEN 'draft_ready'
      ELSE 'none'
    END, -- ai_status
    COALESCE(mai.ai_confidence_score, mai.ai_confidence),
    mai.ai_reasoning,
    -- Metadata
    jsonb_build_object(
      'migrated_from', 'meeting_action_items',
      'assignee_name', mai.assignee_name,
      'assignee_email', mai.assignee_email,
      'assigned_to_name', mai.assigned_to_name,
      'assigned_to_email', mai.assigned_to_email,
      'ai_generated', mai.ai_generated,
      'is_sales_rep_task', mai.is_sales_rep_task,
      'timestamp_seconds', mai.timestamp_seconds,
      'playback_url', mai.playback_url,
      'linked_task_id', mai.linked_task_id,
      'task_id', mai.task_id,
      'synced_to_task', mai.synced_to_task,
      'sync_status', mai.sync_status,
      'sync_error', mai.sync_error,
      'synced_at', mai.synced_at,
      'ai_analyzed_at', mai.ai_analyzed_at,
      'needs_review', mai.needs_review
    )
  FROM meeting_action_items mai
  WHERE NOT EXISTS (
    -- Prevent duplicate migrations
    SELECT 1 FROM tasks t
    WHERE t.id = mai.id
  )
  -- Only migrate action items that have a valid meeting owner
  AND EXISTS (
    SELECT 1 FROM meetings m
    WHERE m.id = mai.meeting_id
    AND m.owner_user_id IS NOT NULL
  );

  GET DIAGNOSTICS v_migrated_count = ROW_COUNT;
  RAISE NOTICE 'Migrated % meeting_action_items to tasks table', v_migrated_count;
END $$;

-- ============================================================================
-- Add retention comments and create compatibility views
-- ============================================================================

-- Add deprecation comments
COMMENT ON TABLE next_action_suggestions IS
  'DEPRECATED: Migrated to unified tasks table. Retained for 90-day audit trail. Do not use for new features.';

COMMENT ON TABLE meeting_action_items IS
  'DEPRECATED: Migrated to unified tasks table. Retained for 90-day audit trail. Do not use for new features.';

-- Create backwards-compatible view for next_action_suggestions
CREATE OR REPLACE VIEW next_action_suggestions_view AS
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

COMMENT ON VIEW next_action_suggestions_view IS
  'Backwards-compatible view of migrated next_action_suggestions. For read-only access during transition period.';

-- Create backwards-compatible view for meeting_action_items
CREATE OR REPLACE VIEW meeting_action_items_view AS
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

COMMENT ON VIEW meeting_action_items_view IS
  'Backwards-compatible view of migrated meeting_action_items. For read-only access during transition period.';
