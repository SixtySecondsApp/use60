-- Migration: proposals_document_type
-- Date: 20260314214656
--
-- What this migration does:
--   DOC-005: Add document_type column to proposals table.
--   Tracks what kind of document each proposal is (proposal, next_steps, team_brief, etc.)
--
-- Rollback strategy:
--   ALTER TABLE proposals DROP COLUMN IF EXISTS document_type;
--   DROP INDEX IF EXISTS idx_proposals_deal_doctype;

DO $$ BEGIN
  ALTER TABLE proposals ADD COLUMN document_type TEXT DEFAULT 'proposal';
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS idx_proposals_deal_doctype
  ON proposals (deal_id, document_type);
