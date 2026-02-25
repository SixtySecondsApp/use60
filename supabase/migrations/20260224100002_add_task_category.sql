-- SLKPRO-005: Add task_category column to tasks table
-- Categorizes tasks as rep actions, prospect actions, admin, or internal
-- so the notification system can filter intelligently.

-- ============================================================================
-- Add column
-- ============================================================================

ALTER TABLE tasks
  ADD COLUMN IF NOT EXISTS task_category TEXT DEFAULT 'rep_action';

-- Add constraint for valid values
DO $$ BEGIN
  ALTER TABLE tasks
  ADD CONSTRAINT tasks_task_category_check
  CHECK (task_category IN ('rep_action', 'prospect_action', 'admin', 'internal'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Index for filtered queries (proactive-task-analysis queries by assigned_to + status + task_category)
CREATE INDEX IF NOT EXISTS idx_tasks_category_filter
  ON tasks (assigned_to, status, task_category)
  WHERE status = 'pending';

-- ============================================================================
-- Heuristic backfill: classify existing tasks by title keywords
-- ============================================================================

-- Prospect actions: tasks where the prospect/contact is supposed to do something
UPDATE tasks SET task_category = 'prospect_action'
WHERE task_category = 'rep_action'  -- Only update defaults, not manually set ones
  AND (
    title ~* '\b(review proposal|sign contract|approve|internal approval)\b'
    OR title ~* '\b(get back to|confirm availability|send budget|provide feedback)\b'
    OR title ~* '\b(schedule internal|discuss internally|check with team)\b'
    OR title ~* '\b(said (he|she|they) (would|will|was going to))\b'
  );

-- Admin tasks: non-sales operational tasks
UPDATE tasks SET task_category = 'admin'
WHERE task_category = 'rep_action'
  AND (
    title ~* '\b(pay|payroll|invoice|court fee|taxes|expenses)\b'
    OR title ~* '\b(terminate contract|cancel subscription|renew license)\b'
    OR title ~* '\b(submit report|file|compliance|audit)\b'
    OR title ~* '\b(book travel|order supplies|update records)\b'
    OR title ~* '\bnotice.*(termination|contract)\b'
    OR title ~* '\bterminate.*contract\b'
    OR title ~* '\b(send month.s notice|send notice)\b'
  );

-- Internal tasks: team coordination, not client-facing
UPDATE tasks SET task_category = 'internal'
WHERE task_category = 'rep_action'
  AND (
    title ~* '\b(standup|retro|sprint|team sync|1:1|one-on-one)\b'
    OR title ~* '\b(update crm|clean pipeline|update forecast)\b'
  );

-- Everything else stays as rep_action (the default)
