-- Migration: SCH-001 - Add structured generation columns to proposals table
-- Adds columns for template-driven, multi-format proposal generation with section-level content tracking.

-- Add template_id column (FK to proposal_templates)
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'proposals' AND column_name = 'template_id'
  ) THEN
    ALTER TABLE proposals ADD COLUMN template_id uuid REFERENCES proposal_templates(id);
  END IF;
END $$;

-- Add output_format column (docx, pdf, html)
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'proposals' AND column_name = 'output_format'
  ) THEN
    ALTER TABLE proposals ADD COLUMN output_format text NOT NULL DEFAULT 'html';
  END IF;
END $$;

-- Add brand_config column (JSONB for colors, fonts, logo reference)
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'proposals' AND column_name = 'brand_config'
  ) THEN
    ALTER TABLE proposals ADD COLUMN brand_config jsonb;
  END IF;
END $$;

-- Add sections column (JSONB for structured generated content per section)
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'proposals' AND column_name = 'sections'
  ) THEN
    ALTER TABLE proposals ADD COLUMN sections jsonb;
  END IF;
END $$;

-- Add generation_status column (pending, processing, complete, failed)
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'proposals' AND column_name = 'generation_status'
  ) THEN
    ALTER TABLE proposals ADD COLUMN generation_status text NOT NULL DEFAULT 'complete';
  END IF;
END $$;

-- Set defaults for any existing rows that may have NULL from the ADD COLUMN
UPDATE proposals SET output_format = 'html' WHERE output_format IS NULL;
UPDATE proposals SET generation_status = 'complete' WHERE generation_status IS NULL;

-- Add CHECK constraint for output_format (idempotent)
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'proposals_output_format_check'
  ) THEN
    ALTER TABLE proposals
      ADD CONSTRAINT proposals_output_format_check
      CHECK (output_format IN ('docx', 'pdf', 'html'));
  END IF;
END $$;

-- Add CHECK constraint for generation_status (idempotent)
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'proposals_generation_status_check'
  ) THEN
    ALTER TABLE proposals
      ADD CONSTRAINT proposals_generation_status_check
      CHECK (generation_status IN ('pending', 'processing', 'complete', 'failed'));
  END IF;
END $$;

-- Add index on generation_status for filtering active/pending generations
CREATE INDEX IF NOT EXISTS idx_proposals_generation_status ON proposals (generation_status);

-- Add index on template_id for joins back to proposal_templates
CREATE INDEX IF NOT EXISTS idx_proposals_template_id ON proposals (template_id);

-- Document column purposes
COMMENT ON COLUMN proposals.template_id IS 'FK to proposal_templates; the template used to generate this proposal';
COMMENT ON COLUMN proposals.output_format IS 'Desired output format: docx, pdf, or html (default html)';
COMMENT ON COLUMN proposals.brand_config IS 'JSONB storing brand settings: colors, fonts, logo URL for proposal styling';
COMMENT ON COLUMN proposals.sections IS 'JSONB storing structured generated content per section (array of {id, title, content, order})';
COMMENT ON COLUMN proposals.generation_status IS 'Generation pipeline status: pending, processing, complete, or failed';
