const projectRef = 'caerqjzvuerejfrdtygb';
const accessToken = 'sbp_8e5eef8735fc3f15ed2544a5ad9508a902f2565f';

async function executeSql(sql) {
  const response = await fetch(
    `https://api.supabase.com/v1/projects/${projectRef}/database/query`,
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ query: sql }),
    }
  );

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`API error: ${response.status} - ${error}`);
  }

  return await response.json();
}

async function applyLastMigration() {
  console.log('🚀 Applying final notification queue migration...\n');

  // Check if table exists
  const checkSql = `
    SELECT EXISTS (
      SELECT FROM information_schema.tables
      WHERE table_schema = 'public'
      AND table_name = 'notification_queue'
    );
  `;

  try {
    const result = await executeSql(checkSql);
    if (result[0]?.exists) {
      console.log('✅ notification_queue table already exists, applying only missing components...\n');

      // Apply only the functions
      const functionsOnly = `
-- FUNCTION: Enqueue Notification
CREATE OR REPLACE FUNCTION enqueue_notification(
  p_user_id UUID,
  p_org_id UUID,
  p_title TEXT,
  p_message TEXT,
  p_type TEXT,
  p_category TEXT,
  p_action_url TEXT,
  p_is_org_wide BOOLEAN,
  p_metadata JSONB,
  p_priority INT DEFAULT 0
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $func$
DECLARE
  v_queue_id UUID;
  v_scheduled_for TIMESTAMPTZ;
BEGIN
  v_scheduled_for := NOW();
  INSERT INTO notification_queue (
    user_id, org_id, title, message, type, category, action_url,
    is_org_wide, metadata, priority, scheduled_for
  )
  VALUES (
    p_user_id, p_org_id, p_title, p_message, p_type, p_category, p_action_url,
    p_is_org_wide, p_metadata, p_priority, v_scheduled_for
  )
  RETURNING id INTO v_queue_id;
  RETURN v_queue_id;
END;
$func$;

-- FUNCTION: Process Notification Queue
CREATE OR REPLACE FUNCTION process_notification_queue(p_batch_size INT DEFAULT 100)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $func$
DECLARE
  v_notification RECORD;
  v_processed_count INT := 0;
  v_notification_id UUID;
BEGIN
  FOR v_notification IN
    SELECT * FROM notification_queue
    WHERE delivered_at IS NULL AND failed_at IS NULL AND scheduled_for <= NOW()
    ORDER BY priority DESC, scheduled_for ASC
    LIMIT p_batch_size
  LOOP
    BEGIN
      INSERT INTO notifications (
        user_id, org_id, title, message, type, category, action_url,
        is_org_wide, metadata, created_at
      )
      VALUES (
        v_notification.user_id, v_notification.org_id, v_notification.title,
        v_notification.message, v_notification.type, v_notification.category,
        v_notification.action_url, v_notification.is_org_wide,
        v_notification.metadata, NOW()
      )
      RETURNING id INTO v_notification_id;

      UPDATE notification_queue
      SET delivered_at = NOW(),
          metadata = metadata || jsonb_build_object('notification_id', v_notification_id)
      WHERE id = v_notification.id;

      v_processed_count := v_processed_count + 1;
    EXCEPTION WHEN OTHERS THEN
      UPDATE notification_queue
      SET failed_at = CASE WHEN retry_count >= 2 THEN NOW() ELSE NULL END,
        retry_count = retry_count + 1,
        scheduled_for = CASE WHEN retry_count < 2 THEN NOW() + (POWER(2, retry_count) || ' minutes')::INTERVAL ELSE scheduled_for END,
        failure_reason = SQLERRM
      WHERE id = v_notification.id;
    END;
  END LOOP;
  RETURN v_processed_count;
END;
$func$;

-- FUNCTION: Clean Old Queue Items
CREATE OR REPLACE FUNCTION cleanup_notification_queue(p_days_old INT DEFAULT 7)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $func$
DECLARE
  v_deleted_count INT;
BEGIN
  DELETE FROM notification_queue
  WHERE (delivered_at IS NOT NULL OR (failed_at IS NOT NULL AND retry_count >= 3))
    AND (COALESCE(delivered_at, failed_at) < NOW() - (p_days_old || ' days')::INTERVAL);
  GET DIAGNOSTICS v_deleted_count = ROW_COUNT;
  RETURN v_deleted_count;
END;
$func$;
      `;

      await executeSql(functionsOnly);
      console.log('✅ Notification queue functions applied successfully!\n');
    }

    console.log('🎉 All org-notifications migrations completed!\n');
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

applyLastMigration();
