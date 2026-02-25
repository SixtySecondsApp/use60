-- Add 'campaign_workflow' to the tasks deliverable_type check constraint
-- so the orchestrator can create AI-working tasks for campaign pipelines.

ALTER TABLE tasks DROP CONSTRAINT IF EXISTS tasks_deliverable_type_check;
DO $$ BEGIN
  ALTER TABLE tasks ADD CONSTRAINT tasks_deliverable_type_check
  CHECK (deliverable_type IN (
    'email_draft','research_brief','meeting_prep','crm_update',
    'content_draft','action_plan','insight','campaign_workflow'
  ) OR deliverable_type IS NULL);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
