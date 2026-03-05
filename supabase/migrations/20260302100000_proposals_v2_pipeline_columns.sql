-- Migration: OFR-002 — Proposals V2 pipeline columns
-- Purpose: Extends the proposals table with V2 pipeline columns for deal linkage,
--          trigger tracking, autonomy tier, PDF output, credit accounting,
--          style config, org scoping, and pipeline version tagging.
-- Date: 2026-03-02

-- ============================================================================
-- 1. ADD NEW COLUMNS (all idempotent via IF NOT EXISTS pattern)
-- ============================================================================

-- deal_id: nullable FK to deals — links a proposal to its originating deal
DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'proposals' AND column_name = 'deal_id'
    ) THEN
        ALTER TABLE proposals ADD COLUMN deal_id uuid REFERENCES deals(id) ON DELETE SET NULL;
    END IF;
END $$;

-- trigger_type: how the proposal generation was initiated
DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'proposals' AND column_name = 'trigger_type'
    ) THEN
        ALTER TABLE proposals ADD COLUMN trigger_type text;
    END IF;
END $$;

-- autonomy_tier: agent autonomy level at the time of generation
DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'proposals' AND column_name = 'autonomy_tier'
    ) THEN
        ALTER TABLE proposals ADD COLUMN autonomy_tier text;
    END IF;
END $$;

-- context_payload: assembled context snapshot passed to the generation pipeline
DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'proposals' AND column_name = 'context_payload'
    ) THEN
        ALTER TABLE proposals ADD COLUMN context_payload jsonb;
    END IF;
END $$;

-- pdf_url: presigned or permanent download URL for the generated PDF
DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'proposals' AND column_name = 'pdf_url'
    ) THEN
        ALTER TABLE proposals ADD COLUMN pdf_url text;
    END IF;
END $$;

-- pdf_s3_key: S3 object key for the stored PDF (used to generate fresh presigned URLs)
DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'proposals' AND column_name = 'pdf_s3_key'
    ) THEN
        ALTER TABLE proposals ADD COLUMN pdf_s3_key text;
    END IF;
END $$;

-- credits_used: total AI credits consumed during generation (4 decimal precision)
DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'proposals' AND column_name = 'credits_used'
    ) THEN
        ALTER TABLE proposals ADD COLUMN credits_used numeric(8,4);
    END IF;
END $$;

-- style_config: style fingerprint (fonts, colors, layout) applied during generation
DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'proposals' AND column_name = 'style_config'
    ) THEN
        ALTER TABLE proposals ADD COLUMN style_config jsonb;
    END IF;
END $$;

-- org_id: nullable FK to organizations — enables org-scoped queries without joining deals
DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'proposals' AND column_name = 'org_id'
    ) THEN
        ALTER TABLE proposals ADD COLUMN org_id uuid REFERENCES organizations(id) ON DELETE SET NULL;
    END IF;
END $$;

-- pipeline_version: distinguishes V1 (legacy) from V2 (structured) proposals
DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'proposals' AND column_name = 'pipeline_version'
    ) THEN
        ALTER TABLE proposals ADD COLUMN pipeline_version integer DEFAULT 1;
    END IF;
END $$;

-- ============================================================================
-- 2. CHECK CONSTRAINTS (idempotent via pg_constraint lookup)
-- ============================================================================

-- trigger_type must be one of the known pipeline entry points
DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'proposals_trigger_type_check'
    ) THEN
        ALTER TABLE proposals
            ADD CONSTRAINT proposals_trigger_type_check
            CHECK (trigger_type IN ('auto_post_meeting', 'manual_button', 'copilot', 'slack'));
    END IF;
END $$;

-- autonomy_tier must match the four-level autonomy model
DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'proposals_autonomy_tier_check'
    ) THEN
        ALTER TABLE proposals
            ADD CONSTRAINT proposals_autonomy_tier_check
            CHECK (autonomy_tier IN ('disabled', 'suggest', 'approve', 'auto'));
    END IF;
END $$;

-- ============================================================================
-- 3. INDEXES
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_proposals_deal_id
    ON proposals (deal_id);

CREATE INDEX IF NOT EXISTS idx_proposals_org_id
    ON proposals (org_id);

CREATE INDEX IF NOT EXISTS idx_proposals_trigger_type
    ON proposals (trigger_type);

CREATE INDEX IF NOT EXISTS idx_proposals_pipeline_version
    ON proposals (pipeline_version);

-- ============================================================================
-- 4. COLUMN DOCUMENTATION
-- ============================================================================

COMMENT ON COLUMN proposals.deal_id IS 'Nullable FK to deals; links the proposal to its originating deal. NULL for standalone proposals.';
COMMENT ON COLUMN proposals.trigger_type IS 'How generation was initiated: auto_post_meeting (webhook), manual_button (UI), copilot (agent), slack (slash command).';
COMMENT ON COLUMN proposals.autonomy_tier IS 'Agent autonomy level recorded at generation time: disabled, suggest, approve, or auto.';
COMMENT ON COLUMN proposals.context_payload IS 'JSONB snapshot of all context assembled for generation: deal, contacts, meetings, notes, offering profile.';
COMMENT ON COLUMN proposals.pdf_url IS 'Presigned or permanent URL to the generated PDF. May expire; use pdf_s3_key to regenerate.';
COMMENT ON COLUMN proposals.pdf_s3_key IS 'S3 object key for the stored PDF file. Used by backend to issue fresh presigned download URLs.';
COMMENT ON COLUMN proposals.credits_used IS 'Total AI credits consumed during generation, tracked to 4 decimal places for accurate billing.';
COMMENT ON COLUMN proposals.style_config IS 'JSONB style fingerprint used during generation: {font_family, primary_color, secondary_color, layout, logo_url}.';
COMMENT ON COLUMN proposals.org_id IS 'Nullable FK to organizations; enables direct org-scoped queries without joining through deals.';
COMMENT ON COLUMN proposals.pipeline_version IS 'Pipeline version tag: 1 = V1 legacy (markdown), 2 = V2 structured (template-driven). Defaults to 1.';

-- ============================================================================
-- Done
-- ============================================================================

NOTIFY pgrst, 'reload schema';
